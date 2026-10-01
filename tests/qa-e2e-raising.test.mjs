// =========================================================
// QA（実ブラウザ）：育成の開始・Chapterボード・再読み込み・中断と再開・育成中は街へ戻れない
//  ・市場で購入 → ファーム → 出発準備 → 1回目の押下でフィナの確認会話（初回は2行、以後は1行）→ 選択肢「始める」で育成開始
//  ・Chapter 1 は Chapterフィールド（js/chapter/。30ターン・疲れ・分岐）。配置は実物のエンジンで固定のシードから作る（ch1Field）
//  ・育成中は街・市場・牧場・博物館・セーブ画面へ行けない（関数を直接呼んでも拒否し、セーブは変わらない）
//  ・サイコロ → 1地点ずつ移動（1歩ごとに保存）→ 最終停止地点だけ効果。通過した能力マスは効果なし
//  ・サイコロ演出中・移動の途中・分かれ道・マス効果の前に再読み込みしても、振り直し・二重の効果は起きない
//  ・☰メニューの「中断」→ 開始画面 → 同じ場所から再開。移動中はメニューも中断も受け付けない
//  ・Chapter 1 のゴール（挑戦上限D）→ 辞退 → Chapter間ファーム → 次のChapterへは1回押すだけ（フィナの会話なし）
//  ・修行は Chapter 1 を終えるまで・チケットが無い間は始められない（直接呼んでも状態は変わらない）
//  Chapter終了（ターン切れ）・Chapter間ファーム・育成放棄・修行・大会・育成完了は qa-e2e-raising-late.test.mjs で確認する。
//  サイコロの出目は Math.random を「MMP7.rollDice から呼ばれたときだけ」固定して決める（ほかの乱数は変えない）。
//  一部のテストは端末の「視差効果を減らす」設定（prefers-reduced-motion）で動かす（サイコロの演出が短くなる。結果は同じ）。
//  Playwright / Chromium が無い環境では省略（skip）する。
// =========================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import * as H from './e2e/harness.mjs';
import { loadEngine, lcg } from './chapter-sim.mjs';

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

function noErrors(p) {
  assert.deepEqual(p.errors, [], 'pageerror / console.error が出ていない');
  assert.deepEqual(p.bad, [], 'ローカルのファイルがすべて読み込めている');
}
const clone = (o) => JSON.parse(JSON.stringify(o));
const statsOf = (m) => Object.fromEntries(KS.map((k) => [k, m[k]]));
/**
 * Chapter 1（Chapterフィールド・Pattern A）の配置：実物のエンジン（js/chapter/engine.js）で固定のシードから作り、
 *  テストで使う地点だけ種類を上書きする（assign：{ 地点ID: { t:'stat', k:'po' } など。null は「何も起きない地点」）
 */
const CHE = loadEngine();
function ch1Field(assign = {}) {
  const tmp = { raise: {} };
  CHE.CH.initRun(tmp, CHE.CH.getConfig(1, 'A'), lcg(11), 516106998);
  const f = tmp.raise.field;
  for (const [id, a] of Object.entries(assign)) { if (a) f.nodeAssignments[id] = a; else delete f.nodeAssignments[id]; }
  return f;
}
/** BASE をもとに、Chapter進行中などの状態を作ったセーブ（raise は m.raise に上書きする項目。assign は Chapter 1 の地点の種類の上書き） */
function seed(raise = {}, top = {}, assign = {}) {
  const s = clone(BASE);
  s.npcFlags = { ...s.npcFlags, raiseIntro: 1 };
  Object.assign(s.m.raise, { state: 'board', ch: 1, node: 'f1_0', turnsUsed: 0, turnLimit: 30, pend: null, goal: false, tour: null, battle: null, trainRun: null, log: [], startStats: statsOf(s.m), fatigue: 0, field: ch1Field(assign) }, raise);
  return Object.assign(s, top);
}
/** サイコロの出目だけを固定する仕掛け（window.__dice に入れた出目を MMP7.rollDie／rollDice の呼び出しで順に使う（面の数は今の個体の Chapter から：Chapter 1 は 6・旧ボードは 3）） */
const DICE_HOOK = () => {
  window.__dice = [];
  const R0 = Math.random;
  Math.random = function () {
    if (window.__dice.length && /rollDic?e/.test(new Error().stack || '')) { const n = window.__dice.shift(); const sides = (window.MMP8 && typeof S === 'object' && S && S.m) ? MMP8.diceSides(S.m) : 3; return (n - 0.5) / sides; }
    return R0();
  };
};
const setDice = (pg, vals) => pg.evaluate((v) => { window.__dice = v.slice(); }, vals);
/** Chapterフィールドの START のあと：サイコロは自動で止まる（1タップ。STOP の操作は無い）。演出が出て消えるまで待つだけ */
const stopDice = async (pg) => { await pg.waitForSelector('.chdz', { timeout: 15000 }); await pg.waitForFunction(() => !document.querySelector('.chdz'), null, { timeout: 15000 }); };
/**
 * セーブを入れて開き（再読み込み後も出目を固定できるようにして）、selector の画面まで進む。
 *  開始画面からの再開そのものは reloadAndStart で確かめるので、ここでは開始処理が呼ぶ p8Resume() で直接再開する。
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
/** メモリ上の S と保存済みのセーブ（mr4v6）が同じであること（同じ瞬間に読む） */
async function assertSynced(pg, label) {
  const r = await pg.evaluate(() => ({ mem: JSON.parse(JSON.stringify(S)), st: JSON.parse(localStorage.getItem('mr4v6')) }));
  assert.deepEqual(r.st, r.mem, label || '保存済みのセーブ＝メモリ上の状態');
}
const raiseOf = (pg) => pg.evaluate(() => JSON.parse(JSON.stringify(S.m.raise)));
const storedRaise = async (pg) => (await H.storedSave(pg)).m.raise;
const rawSave = (pg) => pg.evaluate(() => localStorage.getItem('mr4v6'));
const bmsg = (pg) => pg.evaluate(() => document.querySelector('#bmsg').textContent);
/** 1ターン（移動・マス効果）が終わり、ボードが操作できる状態になるまで待つ */
const waitTurnDone = (pg, turnsUsed) => pg.waitForFunction((tu) => S.m.raise.turnsUsed === tu && !S.m.raise.pend && !bBusy && !MMCHD.isLocked() && !document.querySelector('.chpop') && !!document.querySelector('#chf-ui #brollbtn, #chf-ui .chsheet'), turnsUsed, { timeout: 20000 });
/** mr4v6 の書き込みごとに (node, stage, left, turnsUsed) を記録する仕掛け */
const traceSaves = (pg) => pg.evaluate(() => {
  window.__trace = [];
  const o = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) {
    if (k === 'mr4v6') { const r = JSON.parse(v).m.raise, p = r.pend; window.__trace.push(JSON.stringify([r.node, p ? p.stage : null, p ? p.left : null, r.turnsUsed])); }
    return o.apply(this, arguments);
  };
});
const readTrace = (pg) => pg.evaluate(() => window.__trace.filter((x, i, a) => x !== a[i - 1]).map((x) => JSON.parse(x)));
/** 共通会話を最後まで送り、各行（全文）と話し手を返す（開いた直後の入力を無視する作りでも進むよう、少し待ってから一定間隔でタップ） */
/** 選択肢が出るまで会話を送る（選択肢は押さない） */
async function readUntilChoice(pg) {
  await pg.waitForSelector('.mmtalk');
  await pg.waitForTimeout(300);
  const lines = [], who = new Set();
  for (let i = 0; i < 60; i++) {
    const s = await pg.evaluate(() => (document.querySelector('.mmtalk') && window.MMNPC ? MMNPC.state() : null));
    if (!s) throw new Error('選択肢の前に会話が終わった');
    lines[s.idx] = s.full; if (s.name) who.add(s.name);
    if (s.choices) return { lines, who: [...who], choices: s.choices.map((c) => [c.id, c.label]) };
    await pg.click('.mmtalk', { force: true });
    await pg.waitForTimeout(150);
  }
  throw new Error('選択肢が出ない');
}
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
/** 街へ戻る導線（lobby を呼ぶボタン）の数 */
const lobbyButtons = (pg) => pg.evaluate(() => document.querySelectorAll('#app [onclick*="lobby("]').length);

// ---------------------------------------------------------
// 育成開始（フィナの確認会話 → 選択肢）
// ---------------------------------------------------------
T('QA-RB1：市場で購入 → ファーム → 出発準備：1回目の押下はフィナの確認会話（初回3行・街へ戻れない説明つき）→ 押さなければ取り消し → 2回目以降の会話は1行 → 始めるで Chapter 1 のフィールドへ（30ターン・疲れ0・配置を確定して保存）', async () => {
  const p = await openPage({ size: H.SIZES.base }); const pg = p.page;
  await H.newGame(pg, 'はじめて');
  await pg.waitForSelector('.map');
  assert.equal(await pg.evaluate(() => document.querySelector('.hz[onclick="hall()"]').disabled), true, 'モンスターがいない間はファームへ行けない');
  // 市場で購入（確認画面 → 連れて帰る）
  await pg.click('.hz[onclick="market()"]');
  await H.marketDetail(pg); await pg.waitForSelector('#p10info .p10buy:not([disabled])');
  await pg.waitForTimeout(SETTLE);
  await H.marketDetail(pg); await pg.click('#p10info .p10buy');
  await pg.waitForSelector('#p10ov .p10ok');
  await pg.waitForTimeout(SETTLE);
  await pg.click('#p10ov .p10ok');
  await pg.waitForFunction(() => !!S.m && !!document.querySelector('.map'));
  const s0 = await H.getS(pg);
  assert.deepEqual([s0.m.name, s0.m.sp, s0.m.raise.state, s0.g], ['ソラモ', 0, 'none', 0]);
  // 街 → ファーム（未育成の間は街へ戻るボタンがある）
  await pg.click('.hz[onclick="hall()"]');
  await pg.waitForSelector('button[onclick="prepScr()"]');
  assert.match(await H.text(pg), /育成準備中[\s\S]*育成を始める/, 'ファーム：育成準備中・進行ボタン「育成を始める」');
  assert.ok(await lobbyButtons(pg) >= 1, '未育成の間はファームから街へ戻れる');
  await pg.click('button[onclick="prepScr()"]');
  const dep = 'button[onclick="p7Depart(this)"]';
  await pg.waitForSelector(dep);
  const depText0 = await pg.evaluate((s) => document.querySelector(s).textContent, dep);
  assert.match(depText0, /CHAPTER 1「はじまりの草原」へ出発（育成開始）/);

  // 1回目：フィナがプレイヤーへ確認（初回は「途中で街へ戻れない」説明つき）→ 選択肢。会話中は育成を始めない
  await pg.waitForTimeout(SETTLE);
  await pg.click(dep);
  await pg.waitForSelector('.mmtalk');
  assert.equal(await pg.evaluate(() => S.m.raise.state), 'none', '会話中は育成を始めない');
  assert.deepEqual((await H.storedSave(pg)).npcFlags, { finaIntro: 1, karenIntro: 1, raiseIntro: 1 }, '初回の説明は表示した記録を先に保存する（市場に入ったのでカレンの初回あいさつも表示済み）');
  const t1 = await readUntilChoice(pg);
  assert.deepEqual(t1.who, ['フィナ']);
  assert.deepEqual(t1.lines, await pg.evaluate(() => FINA_TALK.raiseFirst.map((x) => x.text)));
  assert.deepEqual(t1.lines, ['育成を始めると、途中で街には戻れないから気をつけてね。', 'この子の育成を始める？']);
  assert.deepEqual(t1.choices, [['start', '始める'], ['cancel', 'まだやめておく']], '選択肢：始める／まだやめておく');
  // 「まだやめておく」：会話を終えるだけ。フィナ→ダンの掛け合いは出さず、何も始めない（2度押しの確認も出さない）
  assert.equal(await H.chooseTalk(pg, 'cancel'), true);
  await pg.waitForFunction(() => !document.querySelector('.mmtalk'));
  assert.equal(await pg.evaluate((s) => document.querySelector(s).textContent, dep), depText0, 'ボタンは元のまま（確認状態にしない）');
  assert.equal((await H.getS(pg)).m.raise.state, 'none');
  assert.equal((await storedRaise(pg)).state, 'none');

  // もう一度：2回目以降は確認の1行だけ →「始める」→ 同じ会話でフィナ→ダンの掛け合い → 出発（2度押しは求めない）
  await pg.waitForTimeout(SETTLE);
  await pg.click(dep);
  const t2 = await readUntilChoice(pg);
  assert.deepEqual(t2.lines, ['この子の育成を始める？']);
  assert.deepEqual(t2.lines, await pg.evaluate(() => FINA_TALK.raiseAgain.map((x) => x.text)));
  assert.equal(await H.chooseTalk(pg, 'start'), true);
  const t3 = await readTalk(pg);
  assert.deepEqual(t3.who, ['フィナ', 'ダン'], '「始める」のあと、フィナ→ダンの掛け合い');
  assert.deepEqual(t3.lines.slice(-2), await pg.evaluate(() => DAN_TALK.handoff.map((x) => x.text)));
  await pg.waitForSelector('#chf-ui #brollbtn');
  const r = await raiseOf(pg);
  const { startStats, field, ...rest } = r;
  assert.deepEqual(rest, { state: 'board', ch: 1, node: 'f1_0', turnsUsed: 0, turnLimit: 30, pend: null, goal: false, tour: null, battle: null, trainRun: null, log: [], fatigue: 0 });
  assert.deepEqual([field.chapterId, field.patternId, field.fieldId, field.branch, field.consumedEvents, field.openedTreasures, field.clearedStats], [1, 'A', 1, null, [], [], []], 'Chapter 1 Pattern A の配置を出発時に確定');
  assert.ok(Number.isInteger(field.layoutSeed) && Object.keys(field.nodeAssignments).length >= 20, '配置（シードと割り当て）はセーブに入る');
  assert.deepEqual(startStats, statsOf(s0.m), '育成開始時の能力値を記録する');
  await assertSynced(pg);
  assert.equal(await bmsg(pg), 'CHAPTER 1「はじまりの草原」に出発！サイコロを振って進もう！');
  assert.equal(await pg.evaluate(() => document.querySelector('#chturn').textContent), '1');
  assert.match(await pg.evaluate(() => document.querySelector('.chh-turn').textContent), /Turn\s*1\s*\/\s*30/);
  assert.equal(await pg.evaluate(() => document.querySelector('#chfat b').textContent), '0');
  assert.equal(await lobbyButtons(pg), 0, 'ボードに街へ戻る導線は無い');
  assert.equal(await pg.evaluate(() => MMP8.canVisitTown(S)), false);
  assert.equal(await pg.evaluate(() => MMP8.resumeTarget(S)), 'board');
  noErrors(p);
});

// ---------------------------------------------------------
// 育成中は街へ戻れない
// ---------------------------------------------------------
T('QA-RB2：育成中（Chapterフィールド）は街・市場・牧場・博物館・セーブ画面などの関数を直接呼んでも拒否され、フィールドに留まる（セーブは1文字も変わらない）', async () => {
  const p = await boot(seed({ node: 'f1_3', turnsUsed: 1 }, { g: 777 }), '#chf-ui #brollbtn'); const pg = p.page;
  const raw0 = await rawSave(pg);
  assert.equal(await pg.evaluate(() => p8Blocked()), true);
  for (const call of ['lobby()', 'market()', 'farm()', 'museum()', 'savescr()', 'mkd(0)', 'dep()', 'wd(0)', "adopt(0,'X')", 'mkgo(0)', 'selm(0)']) {
    await pg.evaluate(() => { document.querySelector('#bmsg').textContent = ''; });
    await pg.evaluate((c) => { (0, eval)(c); }, call);
    assert.equal(await pg.evaluate(() => !!document.querySelector('#chf-ui #brollbtn') && !document.querySelector('.map, #p10car')), true, `${call} のあともフィールドのまま`);
    assert.equal(await bmsg(pg), BLOCK_MSG, `${call} は拒否の案内を出す`);
    assert.equal(await rawSave(pg), raw0, `${call} でセーブは変わらない`);
  }
  // Chapter中は出発準備（バッグ）・アイテム屋も開けず、出発し直すこともできない
  for (const [call, msg] of [['prepScr()', 'Chapter中はバッグの準備ができません。'], ['shopScr()', 'Chapter中はアイテム屋に行けません。'], ['p7Depart()', 'Chapter中はバッグの準備ができません。']]) {
    if (call === 'p7Depart()') await pg.waitForTimeout(SETTLE);   // 画面が変わった直後の押下を無視する作りでも、拒否の処理まで進むように
    await pg.evaluate((c) => { (0, eval)(c); }, call);
    assert.equal(await pg.evaluate(() => !!document.querySelector('#chf-ui #brollbtn')), true, `${call} のあともフィールドのまま`);
    assert.equal(await bmsg(pg), msg);
    assert.equal(await rawSave(pg), raw0, `${call} でセーブは変わらない`);
  }
  const s = await H.getS(pg);
  assert.deepEqual([s.g, s.box.length, s.m.name, s.m.raise.node, s.m.raise.turnsUsed], [777, 0, 'ソラモ', 'f1_3', 1]);
  // Chapter中に使えるファーム機能はステータス・わざだけ。戻り先はボード（街へ戻るボタンは無い）
  await pg.evaluate(() => hall('st'));
  await pg.waitForSelector('.ds-st .dback');
  assert.equal(await pg.evaluate(() => document.querySelector('.dback').textContent), '◀ ボードへ');
  assert.equal(await lobbyButtons(pg), 0);
  await pg.click('.dback');
  await pg.waitForSelector('#chf-ui #brollbtn');
  await pg.evaluate(() => hall('s'));   // 特訓はChapter中は開けない → フィールドのまま
  await pg.waitForSelector('#chf-ui #brollbtn');
  assert.equal(await pg.evaluate(() => !!document.querySelector('.p12tc, .p12tr')), false);
  assert.equal(await rawSave(pg), raw0);
  noErrors(p);
});

// ---------------------------------------------------------
// サイコロと移動（1歩ごとの保存・通過地点は効果なし）
// ---------------------------------------------------------
T('QA-RB3：サイコロ（出目3）→ 1地点ずつ移動し1歩ごとに保存 → 最終停止地点だけ効果（通過したライフ・ちからの地点は効果なし）→ 再読み込みしても同じ地点・同じ配置', async () => {
  const p = await boot(seed({}, { g: 50 }, { f1_1: { t: 'stat', k: 'li' }, f1_2: { t: 'stat', k: 'po' }, f1_3: null }), '#chf-ui #brollbtn'); const pg = p.page;
  const before = await H.getS(pg);
  await traceSaves(pg);
  await setDice(pg, [3]);
  await pg.waitForTimeout(SETTLE);
  await pg.click('#brollbtn');
  await stopDice(pg);
    await waitTurnDone(pg, 1);
  // f1_0 → f1_1（ライフ）→ f1_2（ちから）→ f1_3（何も起きない）。出目とターン消費は最初の保存で確定
  assert.deepEqual(await readTrace(pg), [['f1_0', 'move', 3, 1], ['f1_1', 'move', 2, 1], ['f1_2', 'move', 1, 1], ['f1_3', 'resolve', 0, 1], ['f1_3', null, null, 1]]);
  const after = await H.getS(pg);
  assert.deepEqual(statsOf(after.m), statsOf(before.m), '通過した地点の効果は出ない');
  assert.deepEqual([after.g, after.trainTix], [before.g, before.trainTix]);
  assert.equal(after.m.raise.fatigue, 7, '出目3で疲れ +7');
  assert.equal(await bmsg(pg), 'START でサイコロを振る。休むこともできる。');
  assert.match(await pg.evaluate(() => document.querySelector('.chh-turn').textContent), /Turn\s*2\s*\/\s*30/);
  assert.equal(await pg.evaluate(() => document.querySelector('#bmonw').dataset.node), 'f1_3', 'モンスターの表示位置も f1_3');
  assert.equal(await pg.evaluate(() => !document.querySelector('#brollbtn').disabled), true, '次のターンを振れる');
  await assertSynced(pg);
  // 移動が終わったあとの再読み込み → 同じ地点・同じターン数・同じ配置から
  const r = await raiseOf(pg);
  await reloadAndStart(pg, '#chf-ui #brollbtn');
  assert.deepEqual(await raiseOf(pg), r);
  assert.deepEqual(statsOf((await H.getS(pg)).m), statsOf(before.m));
  noErrors(p);
});

T('QA-RB4：サイコロの演出中・移動の途中で再読み込み → 出目・ターン消費・疲れは保存済みのまま（振り直しなし）→ 保存済みの地点から残りだけ進み、止まった地点の効果は1回だけ（視差効果を減らす設定）', async () => {
  const p = await boot(seed({}, {}, { f1_1: { t: 'stat', k: 'li' }, f1_2: { t: 'stat', k: 'po' }, f1_3: { t: 'stat', k: 'hi' }, f1_4: { t: 'stat', k: 'in' }, f1_5: null }), '#chf-ui #brollbtn', { calm: true }); const pg = p.page;
  const before = await H.getS(pg);
  // (1) 出目2：演出中（まだ移動していない）に再読み込み
  await setDice(pg, [2]);
  await pg.waitForTimeout(SETTLE);
  await pg.click('#brollbtn');
  const st = await storedRaise(pg);
  assert.deepEqual([st.node, st.pend, st.turnsUsed, st.fatigue], ['f1_0', { roll: 2, left: 2, stage: 'move', fatigueAdded: 5 }, 1, 5], '出目・ターン消費・疲れは演出より前に保存');
  await pg.reload();
  await pg.waitForFunction(() => typeof window.MMP8 === 'object' && typeof S === 'object');
  assert.deepEqual(await storedRaise(pg), st, '開始画面を表示しただけでは何も進まない');
  await startFromTitle(pg, '#chf');
  await waitTurnDone(pg, 1);
  let r = await raiseOf(pg);
  assert.deepEqual([r.node, r.pend, r.turnsUsed, r.fatigue], ['f1_2', null, 1, 5], '保存済みの出目2で f1_0 → f1_1 → f1_2（疲れは重ねない）');
  const s1 = await H.getS(pg);
  const gain = s1.m.po - before.m.po;
  assert.ok(gain >= 10 && gain <= 23, `止まった「ちから」の地点で +10〜15（大成功は1.5倍）（実際 +${gain}）`);
  assert.deepEqual({ ...statsOf(s1.m), po: before.m.po }, statsOf(before.m), 'ほかの能力（通過したライフの地点を含む）は変わらない');
  assert.match(await bmsg(pg), new RegExp(`ちから \\+${gain}$`));
  await assertSynced(pg);
  // (2) 出目3：1歩進んだところ（f1_3）で再読み込み → 残り2歩（f1_4 → f1_5）だけ進む
  await setDice(pg, [3]);
  await pg.waitForTimeout(SETTLE);
  await pg.click('#brollbtn');
  await stopDice(pg);
  await pg.waitForFunction(() => JSON.parse(localStorage.getItem('mr4v6')).m.raise.node === 'f1_3', null, { timeout: 15000, polling: 10 });
  const st2 = await storedRaise(pg);
  assert.deepEqual([st2.node, st2.pend, st2.turnsUsed, st2.fatigue], ['f1_3', { roll: 3, left: 2, stage: 'move', fatigueAdded: 7 }, 2, 12]);
  await reloadAndStart(pg, '#chf');
  await waitTurnDone(pg, 2);
  r = await raiseOf(pg);
  assert.deepEqual([r.node, r.pend, r.turnsUsed, r.fatigue], ['f1_5', null, 2, 12], 'f1_3 から残り2歩 → f1_5。振り直していない');
  assert.deepEqual(statsOf((await H.getS(pg)).m), statsOf(s1.m), 'ちからの効果は重ならず、通過した f1_3・f1_4 も効果なし');
  assert.equal(await bmsg(pg), 'START でサイコロを振る。休むこともできる。');
  await assertSynced(pg);
  noErrors(p);
});

T('QA-RB5：背景の切り替えをまたぐ移動の途中で再読み込み → 残りの移動だけ進み、次の背景の最初の地点で止まって効果は1回だけ（視差効果を減らす設定）', async () => {
  const p = await boot(seed({ node: 'f1_4', turnsUsed: 3 }, {}, { f1_5: null, f2_0: { t: 'stat', k: 'hi' } }), '#chf-ui #brollbtn', { calm: true }); const pg = p.page;
  const before = await H.getS(pg);
  await setDice(pg, [2]);
  await pg.waitForTimeout(SETTLE);
  await pg.click('#brollbtn');
  await stopDice(pg);
  await pg.waitForFunction(() => JSON.parse(localStorage.getItem('mr4v6')).m.raise.node === 'f1_5', null, { timeout: 15000, polling: 10 });
  const st1 = await storedRaise(pg);
  assert.deepEqual([st1.node, st1.pend, st1.turnsUsed], ['f1_5', { roll: 2, left: 1, stage: 'move', fatigueAdded: 5 }, 4], '1歩進んだところで保存済み');
  await reloadAndStart(pg, '#chf');
  await waitTurnDone(pg, 4);
  const r = await raiseOf(pg);
  assert.deepEqual([r.node, r.pend, r.turnsUsed, r.field.branch], ['f2_0', null, 4, null], '残り1歩で f2_0（命中）に止まる。振り直しなし');
  assert.equal(await pg.evaluate(() => document.querySelector('#chf .chf-bg').getAttribute('src')), './assets/fields/ch1a/field/ch1_field_02.webp');
  const s = await H.getS(pg);
  const gain = s.m.hi - before.m.hi;
  assert.ok(gain >= 10 && gain <= 23, `命中 +10〜15（大成功は1.5倍）（実際 +${gain}）`);
  assert.deepEqual({ ...statsOf(s.m), hi: before.m.hi }, statsOf(before.m));
  await assertSynced(pg);
  noErrors(p);
});


T('QA-RB6：停止地点の効果の処理前（resolve）の保存から再開 → 開始画面では何も起きず、再開後に1回だけ効果 → 再読み込みしても重ならない', async () => {
  const p = await openPage({ size: H.SIZES.base, save: seed({ node: 'f1_2', turnsUsed: 1, fatigue: 5, pend: { roll: 2, left: 0, stage: 'resolve', fatigueAdded: 5 } }, {}, { f1_2: { t: 'stat', k: 'po' } }) }); const pg = p.page;
  const raw0 = await rawSave(pg);
  const po0 = (await H.getS(pg)).m.po;
  await pg.waitForTimeout(500);
  assert.equal(await rawSave(pg), raw0, '開始画面の間は停止地点の効果を処理しない');
  await startFromTitle(pg, '#chf');
  await waitTurnDone(pg, 1);
  const s = await H.getS(pg);
  const gain = s.m.po - po0;
  assert.ok(gain >= 10 && gain <= 23, `ちから +10〜15（大成功は1.5倍）（実際 +${gain}）`);
  assert.deepEqual([s.m.raise.node, s.m.raise.pend, s.m.raise.turnsUsed, s.m.raise.fatigue], ['f1_2', null, 1, 5]);
  assert.deepEqual(s.m.raise.field.clearedStats, ['f1_2']);
  await assertSynced(pg);
  await reloadAndStart(pg, '#chf-ui #brollbtn');
  assert.equal((await H.getS(pg)).m.po, s.m.po);
  noErrors(p);
});

// ---------------------------------------------------------
// 中断と再開
// ---------------------------------------------------------
T('QA-RB7：☰メニュー →「中断」→ 開始画面（つづきから）→ はじめる → 同じ地点・同じターン・同じ疲れから再開。移動中はメニューも中断も受け付けない（視差効果を減らす設定）', async () => {
  const p = await boot(seed({ node: 'f1_3', turnsUsed: 1, fatigue: 7 }, {}, { f1_4: null }), '#chf-ui #brollbtn', { calm: true }); const pg = p.page;
  const r0 = await raiseOf(pg);
  const raw0 = await rawSave(pg);
  await pg.waitForTimeout(SETTLE);
  await pg.click('.chh-menu');
  await pg.waitForSelector('#p9ov');
  const items = await pg.evaluate(() => [...document.querySelectorAll('#p9ov .p8menu button')].map((b) => b.textContent.trim()));
  assert.deepEqual(items, ['📊 ステータス', '⚔️ わざ', '⏸ 中断', '🏳 育成放棄'], 'フィールドではマスの説明（旧ボードの凡例）は出さない');
  await pg.waitForTimeout(SETTLE);
  await pg.click('#p9ov button[onclick*="p8Suspend"]');
  await pg.waitForSelector('.p15start');
  assert.equal(await pg.evaluate(() => [...document.querySelectorAll('#app [onclick]')].map((e) => e.getAttribute('onclick')).join('|')), 'startGame(this)', '開始画面は「はじめる」だけ');
  assert.equal(await pg.evaluate(() => document.querySelector('.tcap').textContent), 'つづきからはじめます');
  assert.equal(await pg.evaluate(() => !!document.querySelector('#p9ov')), false, 'メニューは閉じている');
  assert.deepEqual(JSON.parse(await rawSave(pg)), JSON.parse(raw0), '中断ではターンを使わず、進行はそのまま保存');
  await pg.waitForTimeout(500);
  assert.equal(await pg.evaluate(() => !!document.querySelector('.p15start') && !document.querySelector('#chf')), true, '中断後に勝手にフィールドへ戻らない');
  await startFromTitle(pg, '#chf-ui #brollbtn');
  assert.deepEqual(await raiseOf(pg), r0, '同じ地点・同じターン・同じ疲れ・同じ配置から再開');
  // 移動中（サイコロの演出〜移動）はメニューを開けず、中断もできない
  await setDice(pg, [1]);
  await pg.waitForTimeout(SETTLE);
  await pg.click('#brollbtn');
  const during = await pg.evaluate(() => { p9Menu(); const menu = !!document.querySelector('#p9ov'); p8Suspend(); return { busy: bBusy, menu, title: !!document.querySelector('.p15start') }; });
  assert.deepEqual(during, { busy: true, menu: false, title: false });
  await stopDice(pg);
  await waitTurnDone(pg, 2);
  assert.equal((await raiseOf(pg)).node, 'f1_4');
  assert.equal(await pg.evaluate(() => !!document.querySelector('.p15start')), false, '移動のあとで開始画面へ飛ばない');
  await assertSynced(pg);
  noErrors(p);
});

// ---------------------------------------------------------
// Chapter 1 のゴール → 辞退 → Chapter間ファーム → 次のChapter
// ---------------------------------------------------------
T('QA-RB8：Chapter 1 のゴール（大会会場。残りの移動は消える）：挑戦できるのは E・D だけ → 辞退（2度押し）→ Chapter間ファーム → 次のChapterへは1回押すだけで出発（フィナの会話なし・疲れは −50 して持ち越す・視差効果を減らす設定）', async () => {
  const p = await boot(seed({ node: 'f10_4', turnsUsed: 20, fatigue: 64, field: { ...ch1Field({}), fieldId: 10 } }), '#chf-ui #brollbtn', { calm: true }); const pg = p.page;
  const ss0 = (await raiseOf(pg)).startStats;
  await setDice(pg, [3]);
  await pg.waitForTimeout(SETTLE);
  await pg.click('#brollbtn');
  await stopDice(pg);
  await pg.waitForSelector('.chgoal .p9rank', { timeout: 20000 });
  let r = await raiseOf(pg);
  assert.deepEqual([r.node, r.goal, r.pend, r.turnsUsed, r.fatigue], ['f10_5', true, null, 21, 71], 'f10_4 → f10_5（ゴール）で止まり、残り2歩は消える');
  assert.equal(await bmsg(pg), '大会会場に着いた！');
  const ranks = await pg.evaluate(() => [...document.querySelectorAll('.p9rank')].map((b) => b.getAttribute('onclick')));
  assert.deepEqual(ranks, ['p8TourStart(0,this)', 'p8TourStart(1,this)'], 'Chapter 1 の挑戦上限は D');
  assert.equal(await pg.evaluate(() => MMP8.canRoll(S.m)), false, 'ゴールのあとはサイコロを振れない');
  // 辞退：1回目は確認表示だけ
  const dec = 'button[onclick="p8TourDecline(this)"]';
  await pg.waitForTimeout(SETTLE);
  await pg.click(dec);
  assert.equal(await pg.evaluate((s) => document.querySelector(s).textContent, dec), 'もう一度押すと辞退（報酬なしでChapter終了）');
  assert.equal((await storedRaise(pg)).state, 'board');
  await pg.waitForTimeout(ARM_GAP);
  await pg.click(dec);
  await pg.waitForSelector('.p9farm.p15f');
  r = await raiseOf(pg);
  assert.deepEqual([r.state, r.ch, r.node, r.turnsUsed, r.goal, r.field], ['farm', 2, null, 0, false, null], 'Chapter を閉じたら Chapter 1 の配置は消す');
  assert.deepEqual(r.log.at(-1), { ch: 1, reachedGoal: true, turnsUsed: 21, turnLimit: 30, declined: true, tour: null });
  const farmText = await H.text(pg);
  assert.match(farmText, /Chapter 1 終了/, 'ファームの育成状態');
  assert.match(await pg.evaluate(() => document.querySelector('.ksys').textContent), /CHAPTER 1「はじまりの草原」が終わった。/, 'Chapterの結果は通知（名前・顔なし）');
  assert.match(farmText, /次のChapter\s*Chapter 2\s*潮風の海岸/);
  assert.equal(await lobbyButtons(pg), 0, 'Chapter間ファームに街へ戻る導線は無い');
  await assertSynced(pg);
  // ボード（出発準備）→ 次のChapterへ：1回押すだけ。フィナの会話は出ない
  await pg.waitForTimeout(SETTLE);
  await pg.click('button.fmgo[onclick="prepScr()"]');   // 進行ボタン「Chapter 2へ進む」→ 出発準備
  const dep = 'button[onclick="p7Depart(this)"]';
  await pg.waitForSelector(dep);
  const dt = await pg.evaluate((s) => document.querySelector(s).textContent, dep);
  assert.match(dt, /CHAPTER 2「潮風の海岸」へ出発/);
  assert.doesNotMatch(dt, /育成開始/);
  await pg.evaluate(() => { window.__talkSeen = false; new MutationObserver(() => { if (document.querySelector('.mmtalk')) window.__talkSeen = true; }).observe(document.body, { childList: true, subtree: true }); });
  await pg.waitForTimeout(SETTLE);
  await pg.click(dep);
  await pg.waitForSelector('#chf-ui #brollbtn', { timeout: 20000 });   // 2026-10-01：Chapter 2 もエンジン（潮風の海岸。30ターン・6面）
  r = await raiseOf(pg);
  assert.deepEqual([r.state, r.ch, r.node, r.turnsUsed, r.turnLimit, r.fatigue, r.field && r.field.chapterId, r.field && r.field.introSeen], ['board', 2, 'e1_0', 0, 30, 21, 2, undefined], 'Chapter 2 はエンジン（潮風の海岸・30ターン）。疲れは max(0, 71−50)。導入演出は自動テストでは出さない');
  assert.deepEqual(r.startStats, ss0, 'Chapter移行では育成開始時の能力値を取り直さない');
  assert.equal(await pg.evaluate(() => window.__talkSeen), false, 'Chapter間ファームからの出発ではフィナの会話は出ない');
  assert.match(await bmsg(pg), /CHAPTER 2「潮風の海岸」に出発！/);
  assert.equal(await pg.evaluate(() => !!document.querySelector('#chf .chf-bg') && document.querySelector('#chf .chf-bg').getAttribute('src').includes('/ch2a/road/ch2_01_early_a')), true, 'Chapter 2 はエンジンのフィールド（序盤a の背景）');
  await assertSynced(pg);
  noErrors(p);
});

// ---------------------------------------------------------
// 修行を始められない場合
// ---------------------------------------------------------
T('QA-RB9：修行は Chapter 1 を終えるまで（未育成の間は）始められず、Chapter間ファームでもチケットが0枚なら始められない（trStart を直接呼んでもチケット・回数・状態は変わらない）', async () => {
  // 未育成（チケットはある）→ 5種類とも「Chapter 1クリア後に解放」
  let p = await boot({ ...clone(BASE), trainTix: 3 }, '.map'); let pg = p.page;
  await pg.evaluate(() => hall('s'));
  await pg.waitForSelector('button.p12tc');
  let cards = await pg.evaluate(() => [...document.querySelectorAll('button.p12tc')].map((b) => [b.disabled, b.innerText.replace(/\s+/g, ' ')]));
  assert.equal(cards.length, 5);
  for (const [dis, t] of cards) { assert.equal(dis, true); assert.match(t, /Chapter 1クリア後に解放/); }
  let raw0 = await rawSave(pg);
  await pg.waitForTimeout(SETTLE);   // 画面が変わった直後の押下を無視する作りでも、拒否の処理まで進むように
  await pg.evaluate(() => trStart('po'));
  await pg.waitForSelector('.dmsg');
  assert.equal(await pg.evaluate(() => document.querySelector('.dmsg').textContent), '特訓を始められません。🔒 Chapter 1クリア後に解放');
  assert.equal(await rawSave(pg), raw0, '直接呼んでもチケットは減らず、修行も始まらない');
  noErrors(p);
  // Chapter間ファーム（Chapter 1 は終えた）でチケット0枚 → すべて押せない（丈夫さは C 以上のクリアで解放）
  p = await boot(seed({ state: 'farm', ch: 2, node: null, turnLimit: null, log: [{ ch: 1, reachedGoal: true, turnsUsed: 14, turnLimit: 20, declined: true, tour: null }] }, { trainTix: 0 }), '.p9farm.p15f'); pg = p.page;
  assert.match(await pg.evaluate(() => document.querySelector('.fmmid').innerText.replace(/\s+/g, ' ')), /特訓チケット 0枚/);
  await pg.evaluate(() => hall('s'));
  await pg.waitForSelector('button.p12tc');
  cards = await pg.evaluate(() => [...document.querySelectorAll('button.p12tc')].map((b) => [b.disabled, b.innerText.replace(/\s+/g, ' ')]));
  assert.deepEqual(cards.map((c) => c[0]), [true, true, true, true, true]);
  for (const [, t] of cards.slice(0, 4)) assert.match(t, /特訓チケットがありません/);
  assert.match(cards[4][1], /Cランク以上の大会をクリアすると解放/);
  raw0 = await rawSave(pg);
  await pg.waitForTimeout(SETTLE);
  await pg.evaluate(() => trStart('in'));
  await pg.waitForSelector('.dmsg');
  assert.equal(await pg.evaluate(() => document.querySelector('.dmsg').textContent), '特訓を始められません。特訓チケットがありません');
  assert.equal(await rawSave(pg), raw0);
  assert.equal(await pg.evaluate(() => MMP7.trainRunOf(S.m)), null);
  noErrors(p);
});
