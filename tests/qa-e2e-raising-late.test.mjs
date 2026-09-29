// =========================================================
// QA（実ブラウザ）：Chapterの終わり〜育成完了
//  ・20ターン目を使い切る → ターン終了の案内 → Chapter間ファーム（街へは行けない・中断して再開できる）
//  ・Chapter間ファームからの育成放棄（2段階の確認・3秒待ち）→ 街へ戻れる
//  ・修行：チケットで開始（1枚だけ減る）→ 15マスをサイコロで進む → 止まったマスだけ上昇 → ゴールで回数を記録 → 戻る
//  ・ゴール → 大会のランク選択 → 2度押しで参加 → 順位表・対戦表 → 試合の途中・VS画面で再読み込みしても大会はそのまま
//  ・大会の決着：初回優勝の賞金・チケットは1回だけ（結果画面で再読み込みしても増えない）→ Chapter間ファーム
//  ・育成完了（Chapter 4 で B 以下のまま辞退／A ランク優勝 → 最終ルート準備中の代替処理）→ フィナの会話 → 牧場 → 街
//  大会の試合は Phase 6 の fight() を使わず、MMP8 の試合開始・終了の記録（beginBattle・markBattleDone）と after() で終える。
//  育成の開始・ボードの移動・再読み込み・中断は qa-e2e-raising.test.mjs で確認する。
//  サイコロの出目は Math.random を「MMP7.rollDice から呼ばれたときだけ」固定して決める。大会の抽選シードも固定する。
//  サイコロを振るテストは端末の「視差効果を減らす」設定（prefers-reduced-motion）で動かす（演出が短くなる。結果は同じ）。
//  Playwright / Chromium が無い環境では省略（skip）する。
// =========================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import * as H from './e2e/harness.mjs';

const SKIP = H.skipReason();
let L = null;
/** 名前登録・フィナのあいさつを済ませ、ソラモを1体買った直後（未育成）の本物のセーブ */
let BASE = null;
test.before(async () => {
  if (SKIP) return;
  L = await H.launch();
  const p = await L.open({ size: H.SIZES.base });
  await H.newGame(p.page, 'テスト');
  await p.page.evaluate(() => adopt(0, 'ソラモ'));
  BASE = await H.storedSave(p.page);
  await p.ctx.close();
});
test.after(async () => { if (L) await L.close(); });
// テストごとに開いたページを閉じる
const OPEN = [];
const openPage = async (o) => { const p = await L.open(o); OPEN.push(p); return p; };
test.afterEach(async () => { for (const p of OPEN.splice(0)) await p.ctx.close().catch(() => {}); });
/** T(名前, 関数) または T(名前, { todo など }, 関数) */
const T = (name, a, b) => (typeof a === 'function' ? test(name, { skip: SKIP }, a) : test(name, { skip: SKIP, ...a }, b));

const ARM_GAP = 700;   // 2度押しの間隔（1回目から0.4秒以内の2回目は無視される作りでも通るように。3秒で取り消しになるので長すぎない）
const SETTLE = 550;    // 画面が変わった直後の押下を無視する作りでも通るよう、画面が変わってから押すまで待つ時間
const BLOCK_MSG = '育成中は、街・牧場・市場・研究所へは行けません。';
const KS = ['li', 'po', 'in', 'hi', 'ev', 'de'];
// 終えたChapterの記録（セーブに入れる m.raise.log の項目）
const LOG1 = { ch: 1, reachedGoal: true, turnsUsed: 14, turnLimit: 20, declined: false, tour: { rank: 0, place: 1, won: true, firstClear: true } };
const LOG2 = { ch: 2, reachedGoal: true, turnsUsed: 16, turnLimit: 20, declined: false, tour: { rank: 2, place: 1, won: true, firstClear: true } };
const LOG3 = { ch: 3, reachedGoal: false, turnsUsed: 20, turnLimit: 20, declined: false, tour: null };
const clr = (h) => [0, 1, 2, 3, 4, 5].map((i) => i <= h);   // クリア最高ランク h（0=E … 5=S、-1=なし）の rankClr

function noErrors(p) {
  assert.deepEqual(p.errors, [], 'pageerror / console.error が出ていない');
  assert.deepEqual(p.bad, [], 'ローカルのファイルがすべて読み込めている');
}
const clone = (o) => JSON.parse(JSON.stringify(o));
const statsOf = (m) => Object.fromEntries(KS.map((k) => [k, m[k]]));
/** BASE をもとに、Chapter進行中・Chapter間ファームなどの状態を作ったセーブ（raise は m.raise に上書きする項目） */
function seed(raise = {}, top = {}, rankHi = -1) {
  const s = clone(BASE);
  s.npcFlags = { ...s.npcFlags, raiseIntro: 1 };
  Object.assign(s.m.raise, { state: 'board', ch: 1, node: 'S', turnsUsed: 0, turnLimit: 20, pend: null, goal: false, tour: null, battle: null, trainRun: null, log: [], startStats: statsOf(s.m) }, raise);
  s.m.prog.rankClr = clr(rankHi);
  return Object.assign(s, top);
}
const farmSeed = (ch, log, top, rankHi) => seed({ state: 'farm', ch, node: null, turnLimit: null, log }, top, rankHi);
/**
 * サイコロの出目（MMP7.rollDice から呼ばれた乱数）と大会の抽選シード（startTournament の既定値）だけを固定する仕掛け。
 *  呼び出し元を調べるのは、出目を入れてある間・大会を始める直前だけ（ほかの乱数の呼び出しを遅くしない）
 */
const DICE_HOOK = () => {
  window.__dice = []; window.__seedTour = false;
  const R0 = Math.random;
  Math.random = function () {
    if (window.__dice.length || window.__seedTour) {
      const st = new Error().stack || '';
      if (window.__dice.length && st.includes('rollDice')) { const n = window.__dice.shift(); return (n - 1) / 3 + 0.01; }
      if (window.__seedTour && st.includes('startTournament')) { window.__seedTour = false; return 0.25; }
    }
    return R0();
  };
};
const setDice = (pg, vals) => pg.evaluate((v) => { window.__dice = v.slice(); }, vals);
/** ゴールの大会カード（ランク k）を2度押しして大会を始める（抽選シードは固定） */
async function startTour(pg, k) {
  await pg.evaluate(() => { window.__seedTour = true; });
  await press2(pg, `button.p9rank[onclick^="p8TourStart(${k},"]`, '.p9tour');
  assert.equal(await pg.evaluate(() => window.__seedTour), false, '固定した抽選シードで大会を作った');
}
/**
 * セーブを入れて開き、selector の画面まで進む（開始画面からの再開は reloadAndStart で確かめるので、ここでは p8Resume() で直接再開）。
 *  calm：端末の「視差効果を減らす」設定で動かす
 */
async function boot(save, selector, { calm = false } = {}) {
  const p = await openPage({ size: H.SIZES.base, save });
  if (calm) await p.page.emulateMedia({ reducedMotion: 'reduce' });
  await p.ctx.addInitScript(DICE_HOOK);
  await p.page.evaluate(DICE_HOOK);
  await p.page.waitForSelector('.p15start');
  await p.page.evaluate(() => p8Resume());
  await p.page.waitForSelector(selector, { timeout: 20000 });
  // 「はじめる」を押したときと同じく、最初の操作で音声の準備（unlock）を済ませておく（出目を入れる前に。準備の乱数で遅くならないように）
  await p.page.keyboard.press('Shift');
  return p;
}
async function startFromTitle(pg, selector) {
  await pg.waitForSelector('.p15start');
  await pg.click('.p15start');
  await pg.waitForSelector(selector, { timeout: 20000 });
}
/** 再読み込み → 開始画面（「つづきから」）→ はじめる → selector の画面 */
async function reloadAndStart(pg, selector) {
  await pg.reload();
  await pg.waitForFunction(() => typeof window.MMP8 === 'object' && typeof S === 'object');
  assert.equal(await pg.evaluate(() => document.querySelector('.tcap').textContent), 'つづきからはじめます');
  await startFromTitle(pg, selector);
}
async function assertSynced(pg, label) {
  const r = await pg.evaluate(() => ({ mem: JSON.parse(JSON.stringify(S)), st: JSON.parse(localStorage.getItem('mr4v6')) }));
  assert.deepEqual(r.st, r.mem, label || '保存済みのセーブ＝メモリ上の状態');
}
const raiseOf = (pg) => pg.evaluate(() => JSON.parse(JSON.stringify(S.m.raise)));
const storedRaise = async (pg) => (await H.storedSave(pg)).m.raise;
const rawSave = (pg) => pg.evaluate(() => localStorage.getItem('mr4v6'));
const textOf = (pg, sel) => pg.evaluate((s) => { const e = document.querySelector(s); return e ? e.innerText.replace(/\s+/g, ' ').trim() : null; }, sel);
const waitTurnDone = (pg, turnsUsed) => pg.waitForFunction((tu) => S.m.raise.turnsUsed === tu && !S.m.raise.pend && !bBusy && !!document.querySelector('.p9board'), turnsUsed, { timeout: 20000 });
const lobbyButtons = (pg) => pg.evaluate(() => document.querySelectorAll('#app [onclick*="lobby("]').length);
async function readTalk(pg) {
  await pg.waitForSelector('.mmtalk');
  await pg.waitForTimeout(300);
  const lines = [], who = new Set();
  for (let i = 0; i < 60; i++) {
    const s = await pg.evaluate(() => (document.querySelector('.mmtalk') && window.MMNPC ? MMNPC.state() : null));
    if (!s) return { lines, who: [...who] };
    lines[s.idx] = s.full; if (s.name) who.add(s.name);
    await pg.click('.mmtalk', { force: true });
    await pg.waitForTimeout(150);
  }
  throw new Error('会話が終わらない');
}
/** 2度押しの確認ボタンを押す（1回目 → 間をあけて2回目）。1回目のあとの表示を返す */
async function press2(pg, sel, waitSel) {
  await pg.waitForTimeout(SETTLE);
  await pg.click(sel);
  const armed = await pg.evaluate((s) => document.querySelector(s).innerText.replace(/\s+/g, ' ').trim(), sel);
  await pg.waitForTimeout(ARM_GAP);
  await pg.click(sel);
  if (waitSel) await pg.waitForSelector(waitSel, { timeout: 20000 });
  return armed;
}
/**
 * 大会の1試合を、実際の戦闘（Phase 6 の fight()）を使わずに終える：
 *  試合開始の記録（beginBattle）→ 旧 fight() と同じく、勝てば旧報酬（賞金・勝利数）を付けて保存 → 戦闘終了の印（markBattleDone）→ after()
 */
const simMatch = (pg, won) => pg.evaluate((won) => {
  const t = S.m.raise.tour;
  const b = MMP8.beginBattle(S, S.m, { kind: 'league', rank: t.rank });
  if (!b.ok) return { ok: false, reason: b.reason };
  save();
  if (won) { S.g += 350; S.wins = (S.wins || 0) + 1; }   // 旧 fight() が付ける報酬（試合の決着時に取り消される）
  S.m.fa = (S.m.fa || 0) + 5; S.m.st = (S.m.st || 0) + 5;   // 廃止した疲労・ストレス（これも取り消される）
  MMP8.markBattleDone(S); save(); after('試合終了');
  return { ok: true, round: t.league.round, status: t.status, msg: (document.querySelector('.p9tmsg') || {}).textContent || '' };
}, won);
/** 順位表の自分の行（勝・敗）と、対戦表の自分の行の ○×◎ */
const myTable = (pg) => pg.evaluate(() => {
  const r = document.querySelector('.p9st .p9r.me');
  return { w: r.querySelector('.w').textContent, l: r.querySelector('.l').textContent,
    mx: [...document.querySelectorAll('.p9mx tbody tr.me td')].map((td) => td.textContent).join('') };
});

// ---------------------------------------------------------
// ターン切れ → Chapter間ファーム
// ---------------------------------------------------------
T('QA-RL1：Chapter 2 の20ターン目を使い切る → ターン終了の案内（育成失敗ではない）→ Chapter間ファームへ。ファームからは街へ行けず、中断して再開してもファームから', async () => {
  const p = await boot(seed({ ch: 2, node: 'a1', turnsUsed: 19, log: [LOG1] }, { g: 120 }, 0), '.p9board #brollbtn', { calm: true }); const pg = p.page;
  const before = await H.getS(pg);
  await setDice(pg, [1]);
  await pg.waitForTimeout(SETTLE);
  await pg.click('#brollbtn');
  await waitTurnDone(pg, 20);
  assert.equal(await pg.evaluate(() => MMP8.boardPhase(S.m)), 'timeup');
  assert.equal(await textOf(pg, '#bmsg'), '何も起きなかった。 ターンを使い切った…');
  const dock = await textOf(pg, '.p9dock');
  assert.match(dock, /ターン終了/);
  assert.match(dock, /育成失敗ではありません/);
  assert.equal(await pg.evaluate(() => !document.querySelector('#brollbtn') && !MMP8.canRoll(S.m)), true, 'サイコロはもう振れない');
  assert.equal(await pg.evaluate(() => S.m.raise.goal), false);
  await assertSynced(pg);
  await pg.waitForTimeout(SETTLE);
  await pg.click('button[onclick="p8EndChapter()"]');
  await pg.waitForSelector('.p9farm.p15f');
  const r = await raiseOf(pg);
  assert.deepEqual([r.state, r.ch, r.node, r.turnsUsed, r.turnLimit, r.pend, r.goal, r.tour], ['farm', 3, null, 0, null, null, false, null]);
  assert.deepEqual(r.log, [LOG1, { ch: 2, reachedGoal: false, turnsUsed: 20, turnLimit: 20, declined: false, tour: null }]);
  assert.equal((await H.getS(pg)).g, before.g, 'ゴールできなくても所持金は変わらない');
  const txt = await H.text(pg);
  for (const w of ['Chapter間ファーム', '次：Chapter 3', 'CHAPTER 2「潮風の海岸」が終わった。', 'ゴールできず（20ターン）', '参加なし']) assert.ok(txt.includes(w), `ファームの表示に「${w}」`);
  assert.deepEqual(await pg.evaluate(() => [...document.querySelectorAll('.p9pips i')].map((i) => i.className)), ['d', 'd', 'c', ''], 'Chapter 1・2 は済み、次は 3');
  assert.equal(await lobbyButtons(pg), 0, 'Chapter間ファームに街へ戻る導線は無い');
  await assertSynced(pg);
  // 街・市場へは行けない（関数を直接呼んでもファームに留まり、セーブは変わらない）
  const raw0 = await rawSave(pg);
  for (const call of ['lobby()', 'market()', 'farm()', 'museum()']) {
    await pg.evaluate((c) => { (0, eval)(c); }, call);
    assert.equal(await pg.evaluate(() => !!document.querySelector('.p9farm.p15f') && !document.querySelector('.map, #p10car')), true, `${call} のあともファーム`);
    assert.equal(await textOf(pg, '.p9say'), BLOCK_MSG);
    assert.equal(await rawSave(pg), raw0);
  }
  // ⏸ 中断 → 開始画面 → はじめる → Chapter間ファーム
  await pg.waitForTimeout(SETTLE);
  await pg.click('button.p15b[onclick="p8Suspend()"]');
  await pg.waitForSelector('.p15start');
  assert.equal(await pg.evaluate(() => document.querySelector('.tcap').textContent), 'つづきからはじめます');
  await startFromTitle(pg, '.p9farm.p15f');
  assert.equal(await rawSave(pg), raw0, '中断・再開で状態は変わらない');
  assert.match(await H.text(pg), /ゴールできず（20ターン）/);
  noErrors(p);
});

// ---------------------------------------------------------
// 育成放棄
// ---------------------------------------------------------
T('QA-RL2：Chapter間ファームの「育成放棄」は2段階の確認（最後のボタンは3秒待ち）。「やめない」なら何も変わらず、放棄すると個体が消えて街へ戻れる（所持金・チケットは残る）', async () => {
  const p = await boot(farmSeed(2, [LOG1], { g: 321, trainTix: 2 }, 0), '.p9farm.p15f'); const pg = p.page;
  const raw0 = await rawSave(pg);
  const uid = await pg.evaluate(() => S.m.uid);
  const ask = 'button.p15b[onclick="p8AbandonAsk()"]';
  // 1段目で「やめない」
  await pg.waitForTimeout(SETTLE);
  await pg.click(ask);
  await pg.waitForSelector('#p8m .p8danger');
  assert.match(await textOf(pg, '#p8m'), /ソラモの育成をやめますか？/);
  await pg.waitForTimeout(SETTLE);
  await pg.click('#p8m button.go');
  await pg.waitForFunction(() => !document.querySelector('#p8m'));
  assert.equal(await rawSave(pg), raw0);
  // 2段目：最後のボタンは3秒間押せない
  await pg.waitForTimeout(SETTLE);
  await pg.click(ask);
  await pg.waitForSelector('#p8m .p8danger');
  await pg.waitForTimeout(SETTLE);
  await pg.click('#p8m button.p8danger');
  await pg.waitForSelector('#p8abgo');
  assert.deepEqual(await pg.evaluate(() => { const b = document.querySelector('#p8abgo'); return [b.disabled, b.textContent]; }), [true, '放棄する（3）']);
  await pg.evaluate(() => p8AbandonGo(S.m.uid));   // 押せない間に直接呼んでも放棄しない
  assert.equal(await rawSave(pg), raw0);
  await pg.waitForFunction(() => { const b = document.querySelector('#p8abgo'); return b && !b.disabled; }, null, { timeout: 8000 });
  assert.equal(await pg.evaluate(() => document.querySelector('#p8abgo').textContent), '放棄する');
  await pg.waitForTimeout(300);
  await pg.click('#p8abgo');
  await pg.waitForSelector('.map');
  const s = await H.getS(pg);
  assert.deepEqual([s.m, s.box, s.g, s.trainTix], [null, [], 321, 2]);
  assert.ok(!JSON.stringify(s).includes(uid), '放棄した個体はセーブに残らない');
  assert.equal(await textOf(pg, '#msg'), 'ソラモの育成を放棄しました。');
  assert.equal(await pg.evaluate(() => MMP8.canVisitTown(S) && MMP8.resumeTarget(S)), 'town');
  await assertSynced(pg);
  await pg.evaluate(() => market());   // 放棄のあとは市場へ行ける
  await pg.waitForSelector('#p10car');
  noErrors(p);
});

// ---------------------------------------------------------
// 修行
// ---------------------------------------------------------
T('QA-RL3：修行（Chapter間ファームから）：チケット1枚で開始 → 15マスをサイコロで進み、止まった能力・ライフのマスだけ +2〜3 → 途中で再読み込みしても出目・チケットはそのまま → ゴールで回数を記録 → 修行メニュー → ファーム（視差効果を減らす設定）', async () => {
  const p = await boot(farmSeed(2, [LOG1], { trainTix: 1 }, 0), '.p9farm.p15f', { calm: true }); const pg = p.page;
  const s0 = await H.getS(pg);
  assert.match(await textOf(pg, 'button.p15b[onclick="hall(\'s\')"]'), /修行 チケット×1/);
  await pg.waitForTimeout(SETTLE);
  await pg.click('button.p15b[onclick="hall(\'s\')"]');
  await pg.waitForSelector('button.p12tc');
  const cards = () => pg.evaluate(() => [...document.querySelectorAll('button.p12tc')].map((b) => ({ k: b.getAttribute('onclick'), on: !b.disabled, t: b.innerText.replace(/\s+/g, ' ') })));
  let cs = await cards();
  assert.deepEqual(cs.map((c) => [c.k, c.on]), [["trStart('po')", true], ["trStart('in')", true], ["trStart('hi')", true], ["trStart('ev')", true], ["trStart('de')", false]]);
  assert.match(cs[4].t, /Cランク以上の大会をクリアすると解放/, '丈夫さの修行は C 以上のクリアで解放');
  assert.match(await textOf(pg, '.dnote'), /修行チケット：1枚/);
  // 開始：チケットが1枚減り（保存済み）、16地点（S＋15マス）の修行ボードへ
  await pg.waitForTimeout(SETTLE);
  await pg.click('button.p12tc[onclick="trStart(\'po\')"]');
  await pg.waitForSelector('#p7roll');
  let s = await H.getS(pg);
  assert.deepEqual([s.trainTix, s.m.raise.trainRun], [0, { kind: 'po', pos: 0 }]);
  assert.equal((await H.storedSave(pg)).trainTix, 0);
  assert.equal(await pg.evaluate(() => document.querySelectorAll('.p7tr .p7c').length), 16);
  assert.equal(await textOf(pg, '#p7msg'), 'ちからの修行スタート！（修行チケットを1枚使った）サイコロを振って進もう。');
  // 修行中も街へは行けない（修行ボードのまま）
  const rawT = await rawSave(pg);
  await pg.evaluate(() => lobby());
  await pg.waitForSelector('#p7roll');
  assert.equal(await textOf(pg, '#p7msg'), BLOCK_MSG);
  assert.equal(await rawSave(pg), rawT);
  // 出目 2,2,3,2,3,3 → 2(ちから) 4(ライフ) 7(ちから) 9(ライフ) 12(何もない) 15(ゴール)。3投目は保存後に再読み込み
  const plan = [[2, 2, 'po'], [2, 4, 'li'], [3, 7, 'po'], [2, 9, 'li'], [3, 12, null], [3, 15, null]];
  for (const [i, [d, to, key]] of plan.entries()) {
    const b = await pg.evaluate(() => ({ ...Object.fromEntries(['li', 'po', 'in', 'hi', 'ev', 'de'].map((k) => [k, S.m[k]])), pos: S.m.raise.trainRun.pos }));
    await setDice(pg, [d]);
    await pg.waitForTimeout(SETTLE);   // 画面が描き直された直後の押下を無視する作りでも通るように
    await pg.click('#p7roll');
    if (i === 2) {
      await pg.waitForFunction(() => { const r = JSON.parse(localStorage.getItem('mr4v6')).m.raise.trainRun; return r && r.roll === 3; }, null, { polling: 10 });
      const run = (await storedRaise(pg)).trainRun;
      assert.deepEqual(run, { kind: 'po', pos: 4, roll: 3 }, '出目は演出の前に保存');
      await reloadAndStart(pg, '.p12tr #p7msg');
      assert.equal(await textOf(pg, '#p7msg'), '前回振ったサイコロの出目（3）で進みます。');
      assert.equal((await H.getS(pg)).trainTix, 0, '再読み込みでチケットは減らない');
    }
    await pg.waitForFunction((pos) => !p7Busy && (!S.m.raise.trainRun || (S.m.raise.trainRun.pos !== pos && S.m.raise.trainRun.roll == null)) && !!document.querySelector('#p7msg'), b.pos, { timeout: 20000 });
    const a = await pg.evaluate(() => ({ ...Object.fromEntries(['li', 'po', 'in', 'hi', 'ev', 'de'].map((k) => [k, S.m[k]])), pos: S.m.raise.trainRun ? S.m.raise.trainRun.pos : 15 }));
    assert.equal(a.pos, to, `${i + 1}投目：出目${d}で ${to} マス目へ`);
    const diff = Object.fromEntries(KS.map((k) => [k, a[k] - b[k]]).filter(([, v]) => v));
    const msg = await textOf(pg, '#p7msg');
    if (key) {
      assert.deepEqual(Object.keys(diff), [key], `${to} マス目は ${key} だけ上がる`);
      assert.ok(diff[key] >= 2 && diff[key] <= 3, `上昇は +2〜3（実際 +${diff[key]}）`);
      assert.equal(msg, `${d}マス進んだ。 ${key === 'po' ? 'ちから' : 'ライフ'}が${diff[key]}上がった！`);
    } else {
      assert.deepEqual(diff, {}, `${to} マス目では能力は変わらない`);
      if (to < 15) assert.equal(msg, `${d}マス進んだ。 何も起きなかった。`);
    }
  }
  // ゴール：回数を記録して修行は終わり（技データは未登録のため技は覚えない）
  s = await H.getS(pg);
  assert.deepEqual([s.m.raise.trainRun, s.m.prog.train.po, s.trainTix], [null, 1, 0]);
  assert.match(await textOf(pg, '#p7msg'), /3マス進んだ。 ゴール！/);
  assert.deepEqual({ ...statsOf(s.m), po: s0.m.po, li: s0.m.li }, statsOf(s0.m), 'ちから・ライフ以外は変わらない');
  await assertSynced(pg);
  // 「◀ ファームへ戻る」→ 修行メニュー（ちからは「済」、ほかはチケット切れ）→ ◀ ファーム
  await pg.waitForTimeout(SETTLE);
  await pg.click('button.go[onclick="hall(\'s\')"]');
  await pg.waitForSelector('button.p12tc');
  cs = await cards();
  assert.deepEqual(cs.map((c) => c.on), [false, false, false, false, false]);
  assert.match(cs[0].t, /クリア 1\/1 .*済/);
  assert.match(cs[1].t, /修行チケットがありません/);
  await pg.waitForTimeout(SETTLE);
  await pg.click('.dback');
  await pg.waitForSelector('.p9farm.p15f');
  assert.match(await textOf(pg, 'button.p15b[onclick="hall(\'s\')"]'), /チケット×0/);
  noErrors(p);
});

// ---------------------------------------------------------
// 大会
// ---------------------------------------------------------
T('QA-RL4：Chapter 2 のゴール → ランク選択（クリア最高ランクE＋2＝Cまで）→ 2度押しで参加 → 順位表・対戦表。試合の途中で再読み込みするとその試合をやり直し（結果・賞金なし）、VS画面で再読み込みすると順位表へ（視差効果を減らす設定）', async () => {
  const p = await boot(seed({ ch: 2, node: 'j4', turnsUsed: 10, log: [LOG1] }, { g: 1000 }, 0), '.p9board #brollbtn', { calm: true }); const pg = p.page;
  // j4 から出目3 → G で止まり、残りの移動は消える
  await setDice(pg, [3]);
  await pg.waitForTimeout(SETTLE);
  await pg.click('#brollbtn');
  await pg.waitForSelector('.p9rank', { timeout: 20000 });
  let r = await raiseOf(pg);
  assert.deepEqual([r.node, r.goal, r.pend, r.turnsUsed], ['G', true, null, 11]);
  assert.equal(await textOf(pg, '#bmsg'), 'ゴールに到着した！');
  const ranks = () => pg.evaluate(() => [...document.querySelectorAll('.p9rank')].map((b) => b.innerText.replace(/\s+/g, ' ').trim()));
  const rk = await ranks();
  assert.equal(rk.length, 3, 'E・D・C の3つ');
  assert.match(rk[0], /ランクE大会 6体の総当たり（5試合） クリア済み：優勝でステータスボーナスのみ/);
  assert.match(rk[1], /ランクD大会 6体の総当たり（5試合） 初回優勝：200G・修行チケット×1・ステータスボーナス/);
  assert.match(rk[2], /ランクC大会 8体の総当たり（7試合） 初回優勝：350G・修行チケット×2・ステータスボーナス/);
  assert.equal(await pg.evaluate(() => MMP8.canRoll(S.m)), false, 'ゴールのあとはサイコロを振れない');
  await assertSynced(pg, 'ゴール到達は保存済み（再開してもゴールの画面から）');
  // C：1回目は確認表示だけ、2回目で参加
  const cBtn = 'button.p9rank[onclick^="p8TourStart(2,"]';
  await pg.evaluate(() => { window.__seedTour = true; });   // 大会の抽選シードを固定
  await pg.waitForTimeout(SETTLE);
  await pg.click(cBtn);
  assert.equal(await textOf(pg, cBtn), 'もう一度押すとランクC大会に参加');
  assert.equal(await pg.evaluate(() => S.m.raise.tour), null);
  assert.equal((await storedRaise(pg)).tour, null);
  await pg.waitForTimeout(ARM_GAP);
  await pg.click(cBtn);
  await pg.waitForSelector('.p9tour');
  assert.equal(await pg.evaluate(() => window.__seedTour), false, '固定した抽選シードで大会を作った');
  r = await raiseOf(pg);
  assert.deepEqual([r.tour.rank, r.tour.status, r.tour.league.size, r.tour.league.rounds.length, r.tour.league.round], [2, 'league', 8, 7, 0]);
  assert.deepEqual(await pg.evaluate(() => [document.querySelectorAll('.p9th .pips i').length, document.querySelectorAll('.p9st .p9r:not(.hd)').length, document.querySelectorAll('.p9mx tbody tr').length]), [7, 8, 8]);
  assert.match(await textOf(pg, '.p9next'), /第1試合 \/ 全7試合/);
  await assertSynced(pg);
  // 第1試合：勝ち（旧 fight() の賞金・勝利数・疲労は取り消される）
  const s0 = await H.getS(pg);
  const m1 = await simMatch(pg, true);
  assert.deepEqual(m1, { ok: true, round: 1, status: 'league', msg: '第1試合：勝ち！' });
  let s = await H.getS(pg);
  assert.deepEqual([s.g, s.wins, s.m.fa, s.m.st, s.m.rk], [s0.g, s0.wins, s0.m.fa, s0.m.st, s0.m.rk]);
  assert.deepEqual(await myTable(pg), { w: '1', l: '0', mx: '・・・・・◎○' });
  assert.match(await textOf(pg, '.p9next'), /第2試合 \/ 全7試合/);
  // 第2試合の途中で再読み込み → その試合はやり直し（結果なし・所持金そのまま）
  const tourBefore = (await raiseOf(pg)).tour;
  await pg.evaluate(() => { MMP8.beginBattle(S, S.m, { kind: 'league', rank: S.m.raise.tour.rank }); save(); S.g += 350; });   // 戦闘中に再読み込みされた状態
  assert.notEqual((await storedRaise(pg)).battle, null);
  await reloadAndStart(pg, '.p9tour');
  assert.equal(await textOf(pg, '.p9tmsg'), '前回の戦闘は途中で終わったため、もう一度選べます。');
  r = await raiseOf(pg);
  assert.equal(r.battle, null);
  assert.deepEqual(r.tour, tourBefore, '大会の状態（参加者・結果・次の試合）はそのまま');
  assert.equal((await H.getS(pg)).g, s0.g);
  await assertSynced(pg);
  // VS画面（6能力の比較）→ 再読み込み → 順位表へ戻る（状態は変わらない）
  const opp = await pg.evaluate(() => MMP8L.entrantView(S.m.raise.tour.league, MMP8.tourNext(S.m).opp).name);
  await pg.waitForTimeout(SETTLE);
  await pg.click('button[onclick="p9VsScr()"]');
  await pg.waitForSelector('.p9vs .p9go');
  const vs = await textOf(pg, '.p9vs');
  assert.match(vs, /第2試合 \/ 全7試合/);
  assert.ok(vs.includes(opp), 'VS画面の相手＝次の対戦相手');
  assert.equal(await pg.evaluate(() => document.querySelectorAll('.p9vs-tb .vr').length), 6);
  const raw = await rawSave(pg);
  await reloadAndStart(pg, '.p9tour');
  assert.equal(await pg.evaluate(() => !!document.querySelector('.p9vs')), false);
  assert.equal(await rawSave(pg), raw);
  noErrors(p);
});

let LAST_MATCH_MSG = null;   // QA-RL6 で記録した「最終戦に勝って2位」の結果の文言（QA-RL6b で確かめる）
T('QA-RL5：大会の決着：全勝で優勝 → 初回優勝の賞金350G・修行チケット2枚・ステータスボーナスを1回だけ（結果画面で再読み込みしても増えない）→ Chapterを終えてファーム（前回の結果に優勝）', async () => {
  const p = await boot(seed({ ch: 2, node: 'G', goal: true, turnsUsed: 12, log: [LOG1] }, { g: 1000, trainTix: 0 }, 0), '.p9rank'); const pg = p.page;
  await startTour(pg, 2);
  const s0 = await H.getS(pg);
  const msgs = [];
  for (let i = 0; i < 7; i++) { const m = await simMatch(pg, true); assert.equal(m.ok, true); msgs.push(m.msg); }
  assert.deepEqual(msgs, ['第1試合：勝ち！', '第2試合：勝ち！', '第3試合：勝ち！', '第4試合：勝ち！', '第5試合：勝ち！', '第6試合：勝ち！', '第7試合：勝ち！ 大会全体で1位になった！']);
  const s = await H.getS(pg);
  const t = s.m.raise.tour;
  assert.equal(t.status, 'settled');
  const { reward, ...res } = t.result;
  assert.deepEqual(res, { rank: 2, place: 1, won: true, firstClear: true });
  assert.deepEqual([reward.prize, reward.tickets, reward.firstClear], [350, 2, true]);
  assert.deepEqual([s.g, s.trainTix, s.wins], [s0.g + 350, s0.trainTix + 2, (s0.wins || 0) + 1], '賞金・チケット・優勝回数は大会全体で1回だけ');
  assert.deepEqual(s.m.prog.rankClr, clr(2));
  // ステータスボーナス：異なる3能力に +4〜7（ランクC）。ほかの能力は変わらない
  assert.equal(new Set(reward.bonus.map((b) => b.key)).size, 3);
  const up = Object.fromEntries(KS.map((k) => [k, s.m[k] - s0.m[k]]).filter(([, v]) => v));
  assert.deepEqual(up, Object.fromEntries(reward.bonus.map((b) => [b.key, b.amount])));
  for (const b of reward.bonus) assert.ok(b.amount >= 4 && b.amount <= 7, `${b.key} +${b.amount}`);
  const res0 = await textOf(pg, '.p9tour');
  for (const w of ['優勝！', '初回優勝の報酬', '賞金 350G', '修行チケット ×2', 'ステータスボーナス', 'Chapterを終えてファームへ']) assert.ok(res0.includes(w), `結果画面に「${w}」`);
  assert.deepEqual(await myTable(pg), { w: '7', l: '0', mx: '○○○○○○○' });
  await assertSynced(pg);
  // 結果画面で再読み込み → 同じ結果画面、報酬は増えない
  const raw = await rawSave(pg);
  await reloadAndStart(pg, '.p9tour.p9won');
  assert.equal(await rawSave(pg), raw);
  // Chapterを終えてファームへ
  await pg.waitForTimeout(SETTLE);
  await pg.click('button[onclick="p8EndChapter()"]');
  await pg.waitForSelector('.p9farm.p15f');
  const r = await raiseOf(pg);
  assert.deepEqual([r.state, r.ch], ['farm', 3]);
  assert.deepEqual(r.log.at(-1), { ch: 2, reachedGoal: true, turnsUsed: 12, turnLimit: 20, declined: false, tour: { rank: 2, place: 1, won: true, firstClear: true } });
  const txt = await H.text(pg);
  assert.ok(txt.includes('ランクC大会　1位（優勝）'));
  assert.ok(txt.includes('チケット×2'));
  assert.equal((await H.getS(pg)).g, s0.g + 350);
  noErrors(p);
});

T('QA-RL6：最終戦に勝っても2位で終わった大会（相手の1体が全勝）：報酬なし・ランクのクリアなし・所持金そのまま、順位表・対戦表は正しい', async () => {
  const p = await boot(seed({ ch: 2, node: 'G', goal: true, turnsUsed: 12, log: [LOG1] }, { g: 1000 }, 0), '.p9rank'); const pg = p.page;
  // NPC同士の勝敗を固定して大会を作る（第1試合の相手＝8番が全勝する）。作ったあとは元の決め方に戻す
  await pg.evaluate(() => {
    MMP8L.setNpcMatchResolver((a, b) => a.id === 7 || (b.id !== 7 && a.id < b.id));
    const r = MMP8.startTournament(S, S.m, 2, 11);
    MMP8L.setNpcMatchResolver(null);
    save(); board();
    return r;
  });
  await pg.waitForSelector('.p9tour');
  assert.equal(await pg.evaluate(() => MMP8.tourNext(S.m).opp), 7);
  const s0 = await H.getS(pg);
  const msgs = [];
  for (let i = 0; i < 7; i++) { const m = await simMatch(pg, i > 0); assert.equal(m.ok, true); msgs.push(m.msg); }
  assert.deepEqual(msgs.slice(0, 6), ['第1試合：負け…', '第2試合：勝ち！', '第3試合：勝ち！', '第4試合：勝ち！', '第5試合：勝ち！', '第6試合：勝ち！']);
  LAST_MATCH_MSG = msgs[6];
  assert.match(msgs[6], /^第7試合：.* 大会は2位で終わった。$/);
  const s = await H.getS(pg);
  const lg = s.m.raise.tour.league;
  const lastOpp = await pg.evaluate(() => { const mt = S.m.raise.tour.league.rounds[6].find((x) => x.a === 0 || x.b === 0); return mt.a === 0 ? mt.b : mt.a; });
  assert.equal(await pg.evaluate((o) => MMP8L.resultCell(S.m.raise.tour.league, 0, o), lastOpp), 'win', '最終戦（第7試合）は勝ち');
  assert.deepEqual([s.m.raise.tour.result.place, s.m.raise.tour.result.won, s.m.raise.tour.result.reward], [2, false, null]);
  assert.deepEqual([s.g, s.trainTix, s.wins, s.m.prog.rankClr], [s0.g, s0.trainTix, s0.wins, s0.m.prog.rankClr], '優勝していないので報酬・クリアなし');
  assert.deepEqual(statsOf(s.m), statsOf(s0.m));
  assert.deepEqual(await myTable(pg), { w: '6', l: '1', mx: '○○○○○○×' });
  assert.equal(lg.round, 7);
  const txt = await textOf(pg, '.p9tour');
  assert.ok(txt.includes('優勝（1位）できなかったため、報酬はありません。'));
  assert.equal(await pg.evaluate(() => !!document.querySelector('.p9tour.p9won')), false);
  await assertSynced(pg);
  noErrors(p);
});

T('QA-RL6b：最終戦の結果の文言は、その試合の勝敗（勝ち！）を表示する', () => {
  assert.equal(LAST_MATCH_MSG, '第7試合：勝ち！ 大会は2位で終わった。');
});

// ---------------------------------------------------------
// 育成完了
// ---------------------------------------------------------
T('QA-RL7：Chapter 4 で B ランクまでのまま大会を辞退 → 育成完了：フィナの会話 → 育成完了画面 → 牧場でモンスターを確認 → 街へ戻れる（育成完了1回）→ 再読み込みしても会話は出ない', async () => {
  const p = await boot(seed({ ch: 4, node: 'G', goal: true, turnsUsed: 15, log: [LOG1, LOG2, LOG3] }, {}, 3), '.p9rank'); const pg = p.page;
  assert.equal(await pg.evaluate(() => document.querySelectorAll('.p9rank').length), 6, 'B クリア済み → E〜S まで挑戦できる');
  const s0 = await H.getS(pg);
  const armed = await press2(pg, 'button[onclick="p8TourDecline(this)"]', '.mmtalk');
  assert.equal(armed, 'もう一度押すと辞退（報酬なしでChapter終了）');
  // 会話が出た時点で育成完了は保存済み
  const st = await H.storedSave(pg);
  assert.equal(st.m.raise.state, 'done');
  assert.deepEqual(st.raiseRec, { done: 1, fromStart: true }, '育成完了回数 0 → 1');
  assert.deepEqual(st.m.raise.endStats, statsOf(s0.m));
  assert.deepEqual(st.m.raise.startStats, s0.m.raise.startStats);
  assert.deepEqual(st.m.raise.log.at(-1), { ch: 4, reachedGoal: true, turnsUsed: 15, turnLimit: 20, declined: true, tour: null });
  assert.deepEqual(await pg.evaluate(() => [MMP8.isRaising(S.m), MMP8.canVisitTown(S), MMP8.resumeTarget(S)]), [false, true, 'town']);
  const talk = await readTalk(pg);
  assert.deepEqual(talk.who, ['フィナ']);
  assert.deepEqual(talk.lines, await pg.evaluate(() => FINA_TALK.done.map((x) => x.text)));
  assert.equal(talk.lines[0], 'お疲れさまでした！　育成完了です！');
  // 育成完了画面
  const done = await textOf(pg, '.p9farm.p9done');
  for (const w of ['育成完了', 'ソラモの育成が完了した！', '最高クリアランク：B', '育成の記録', '14ターンでゴール／ランクE大会 1位', 'CHAPTER 4「灼熱の火山」', '15ターンでゴール／大会辞退']) assert.ok(done.includes(w), `育成完了画面に「${w}」`);
  assert.equal(await pg.evaluate(() => !!document.querySelector('.p9done .mon svg, .p9done .mon img')), true, 'モンスターが表示されている');
  await assertSynced(pg);
  // 牧場へ → モンスターがいる → 街へ
  await pg.waitForTimeout(SETTLE);
  await pg.click('button[onclick="farm(\'\',\'a\')"]');
  await pg.waitForSelector('button.back');
  const ranch = await H.text(pg);
  assert.ok(ranch.includes('ソラモ') && ranch.includes('ランクB'), '牧場にソラモ（ランクB）がいる');
  await pg.waitForTimeout(SETTLE);
  await pg.click('button.back');
  await pg.waitForSelector('.map');
  assert.match(await textOf(pg, '.bprof'), /育成完了 1回/);
  assert.deepEqual(await pg.evaluate(() => [...document.querySelectorAll('.hz')].map((b) => b.disabled)), [false, false, false]);
  await pg.evaluate(() => market());   // 育成完了のあとは市場へ行ける
  await pg.waitForSelector('#p10car');
  await pg.evaluate(() => lobby());
  await pg.waitForSelector('.map');
  // 再読み込み → 街から（育成完了の会話は二度出ない）
  await reloadAndStart(pg, '.map');
  await pg.waitForTimeout(600);
  assert.equal(await pg.evaluate(() => !!document.querySelector('.mmtalk')), false);
  assert.deepEqual((await H.getS(pg)).raiseRec, { done: 1, fromStart: true }, '再読み込みで育成完了回数は増えない');
  noErrors(p);
});

T('QA-RL8：Chapter 4 で A ランク大会に優勝 → 最終ルート（準備中）のファーム → 「育成を完了して街へ戻る」2度押し → 育成完了（最終ルートは未実施として記録）→ フィナの会話 → 牧場（ランクA）', async () => {
  const p = await boot(seed({ ch: 4, node: 'G', goal: true, turnsUsed: 14, log: [LOG1, LOG2, LOG3] }, { g: 100, trainTix: 0 }, 3), '.p9rank'); const pg = p.page;
  await startTour(pg, 4);
  assert.equal(await pg.evaluate(() => S.m.raise.tour.rank), 4);
  for (let i = 0; i < 7; i++) assert.equal((await simMatch(pg, true)).ok, true);
  let s = await H.getS(pg);
  assert.deepEqual([s.m.raise.tour.result.won, s.g, s.trainTix, s.m.prog.rankClr], [true, 900, 2, clr(4)], 'A 初回優勝：800G・チケット2枚');
  await pg.waitForTimeout(SETTLE);
  await pg.click('button[onclick="p8EndChapter()"]');
  await pg.waitForSelector('.p9farm.p15f');
  let r = await raiseOf(pg);
  assert.deepEqual([r.state, r.ch], ['farm', 'final']);
  assert.equal(await textOf(pg, '.p9say'), 'CHAPTER 4「灼熱の火山」が終わった。Aランク以上をクリアした！ 最終ルートは準備中のため、ここで育成を完了して街へ戻れます。');
  const fb = 'button[onclick="pfixFinishNoFinal(this)"]';
  const farmTxt = await H.text(pg);
  assert.ok(farmTxt.includes('次：最終ルート') && farmTxt.includes('最終ルートはまだ準備中のため、ここで育成を完了して街へ戻れます。'));
  assert.equal(await raiseOf(pg).then((x) => x.log.length), 4);
  // 再読み込みしても最終ルート準備中のファーム
  await reloadAndStart(pg, fb);
  assert.equal(await lobbyButtons(pg), 0);
  // 1回目は確認表示だけ（まだ育成中）→ 2回目で育成完了
  await pg.waitForTimeout(SETTLE);
  await pg.click(fb);
  assert.equal(await textOf(pg, fb), 'もう一度押すと育成完了');
  assert.equal((await storedRaise(pg)).state, 'farm');
  assert.equal(await pg.evaluate(() => MMP8.canVisitTown(S)), false);
  await pg.waitForTimeout(ARM_GAP);
  await pg.click(fb);
  await pg.waitForSelector('.mmtalk');
  s = await H.getS(pg);
  r = s.m.raise;
  assert.deepEqual([r.state, r.ch, s.raiseRec], ['done', null, { done: 1, fromStart: true }]);
  assert.deepEqual(r.log.at(-1), { ch: 'final', skipped: true, reason: 'final_unavailable' });
  assert.deepEqual(r.endStats, statsOf(s.m));
  assert.deepEqual([s.g, s.trainTix], [900, 2], '大会の結果・賞金はそのまま残る');
  await assertSynced(pg);
  const talk = await readTalk(pg);
  assert.equal(talk.lines[0], 'お疲れさまでした！　育成完了です！');
  const done = await textOf(pg, '.p9farm.p9done');
  for (const w of ['最高クリアランク：A', '最終ルートは準備中のため、Chapter 4までの結果で育成を完了しました。', '最終CHAPTER', '準備中のため未実施（ここで育成完了）', 'ランクA大会 1位']) assert.ok(done.includes(w), `育成完了画面に「${w}」`);
  await pg.waitForTimeout(SETTLE);
  await pg.click('button[onclick="farm(\'\',\'a\')"]');
  await pg.waitForSelector('button.back');
  assert.ok((await H.text(pg)).includes('ランクA'));
  noErrors(p);
});
