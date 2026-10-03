// =========================================================
// QA（実ブラウザ）：セーブの破壊防止 ― 育成中の各画面での再読み込み・売却・育成放棄
//  ・ボード（待機・ゴール）・大会（順位表・VS）・Chapter間ファーム・修行・育成完了の各画面で再読み込みしても、
//    S は再読み込み前と完全に同じ（無視する項目なし）。起動しただけでは mr4v6 を書き換えない。
//  ・サイコロ演出中・修行のサイコロ演出中・試合中・試合の決着直後に再読み込みしても、振り直し・二重進行・二重報酬は起きない。
//  ・牧場で売却した個体の uid はセーブのどこにも残らない。育成放棄のあとは育成中の状態がどこにも残らない。
//  ・Chapter進行（育成中の状態）は連れている個体（S.m）だけが持ち、牧場の個体には付かない。
//  起動時の移行・新しい版の保護・読めないデータ・セーブスロット・セーブコード・街の画面での再読み込みは
//  qa-e2e-save.test.mjs で確認する。Playwright / Chromium が無い環境では省略（skip）する。
// =========================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import * as H from './e2e/harness.mjs';

const SKIP = H.skipReason();
let L = null;
test.before(async () => { if (!SKIP) L = await H.launch(); });
test.after(async () => { if (L) await L.close(); });
// テストごとに開いたページを閉じる（開いたままだとアニメーションが重なり、後のテストが遅くなる）
const OPEN = [];
const openPage = async (o = {}) => { const p = await L.open({ legacyStep: true, ...o });   // 1地点ずつ止まる進み方で確かめる（通常マスの通過専用は qa-e2e-journey の JR-16）
 OPEN.push(p); return p; };
test.afterEach(async () => { for (const p of OPEN.splice(0)) await p.ctx.close().catch(() => {}); });
const T = (name, fn) => test(name, { skip: SKIP }, fn);

const KS = ['li', 'po', 'in', 'hi', 'ev', 'de'];
/** ページの読み込みで出たエラー・読み込めなかったファイルが無いこと */
function noErrors(p) {
  assert.deepEqual(p.errors, [], 'pageerror / console.error が出ていない');
  assert.deepEqual(p.bad, [], 'ローカルのファイルがすべて読み込めている');
}
const stored = (pg) => pg.evaluate(() => localStorage.getItem('mr4v6'));
/** 育成中の個体（Chapter進行中・Chapter間ファーム・最終Chapter）は S.m の1体だけで、牧場の個体には進行が付いていない */
function assertProgressOnlyOnM(S, label) {
  for (const x of S.box) {
    assert.ok(!['board', 'farm', 'final'].includes(x.raise.state), `${label}：牧場の個体（${x.uid}）が育成中になっていない`);
    for (const k of ['ch', 'node', 'pend', 'tour', 'battle', 'trainRun']) assert.equal(x.raise[k], null, `${label}：牧場の個体の raise.${k} は空`);
  }
  for (const k of ['chap', 'board', 'trainRun']) assert.ok(!(k in S), `${label}：セーブ全体に ${k} を持たない`);
}
/**
 * 名前登録・フィナのあいさつ・育成開始の説明を済ませた状態を直接作る（会話の流れは別のテストで確認する）。
 *  連れている個体＝ソラモ、牧場＝ガウル（box 体）。
 */
async function setupTown(pg, { g = 1234, box = 1, tix = 0 } = {}) {
  await pg.evaluate((o) => {
    MMP11P.confirmName(S, 'セーブ'); S.npcFlags = { finaIntro: 1, raiseIntro: 1 };
    S.m = mk(0); for (let i = 0; i < o.box; i++) S.box.push(mk(1));
    S.g = o.g; S.trainTix = o.tix; save(); lobby();
  }, { g, box, tix });
  await pg.waitForSelector('.map');
}
/** 育成を始めてボードを開く（出発ボタンの会話・2度押しは qa の別ファイルで確認する） */
async function departDirect(pg) {
  await pg.evaluate(() => { const r = MMP8.depart(S, S.m); if (!r.ok) throw new Error('depart ' + r.reason); save(); board(); });
  await pg.waitForSelector('#brollbtn');
}
/**
 * 再読み込み → 開始画面 → 「タップしてはじめる」→ 再開画面（sel）が出るまで。
 *  起動直後（開始ボタンを押す前）の S と mr4v6 の文字列も返す。
 */
async function reloadResume(pg, sel) {
  const before = await stored(pg);
  await pg.reload();
  await pg.waitForFunction(() => typeof window.MMP8 === 'object' && typeof S === 'object');
  await pg.waitForSelector('.p15start');
  const boot = await H.getS(pg), bootText = await stored(pg);
  assert.equal(bootText, before, '起動しただけでは mr4v6 を書き換えない');
  assert.match(await H.text(pg), /つづきからはじめます/, '開始画面は「つづきから」');
  await pg.click('.p15start');
  await pg.waitForSelector(sel, { timeout: 15000 });
  return { boot, bootText };
}
/** いまの S と mr4v6 が同じ（未保存の変更が無い）ことを確かめてから再読み込みし、再開後の S が完全に同じことを確かめる */
async function reloadKeepsS(pg, sel, label) {
  const mem = await H.getS(pg), st = JSON.parse(await stored(pg));
  assert.deepEqual(mem, st, `${label}：画面の S とセーブ（mr4v6）が同じ`);
  assert.deepEqual(await pg.evaluate(() => JSON.parse(JSON.stringify(MMP8.migrateSave(JSON.parse(localStorage.getItem('mr4v6')))))), st,
    `${label}：セーブを読み込み直しても（migrateSave）内容は変わらない`);
  const { boot } = await reloadResume(pg, sel);
  assert.deepEqual(boot, mem, `${label}：起動直後の S は再読み込み前と同じ`);
  assert.deepEqual(await H.getS(pg), mem, `${label}：再開後の S は再読み込み前と同じ`);
  assertProgressOnlyOnM(mem, label);
  return mem;
}

// ---------------------------------------------------------
// 育成中の各画面での再読み込み
// ---------------------------------------------------------
T('QA-SR1：ボード（待機）・ゴール（大会受付）・大会の順位表・VS画面で再読み込みしても S は完全に同じ', async () => {
  const p = await openPage(); const pg = p.page;
  await setupTown(pg);
  await departDirect(pg);
  const m0 = await reloadKeepsS(pg, '#brollbtn', 'ボード（待機）');
  assert.equal(m0.m.raise.state, 'board'); assert.equal(m0.m.raise.ch, 1);
  // ゴールに着いた状態（大会の選択）
  await pg.evaluate(() => { const t = MMP8.trackOf(1); Object.assign(S.m.raise, { node: t.goal, goal: true, pend: null }); save(); board(); });
  await pg.waitForSelector('#chrcv .rcv-row.ok[data-rank="0"]');
  const ranks0 = await pg.evaluate(() => [...document.querySelectorAll('.rcv-row.ok')].map((b) => b.dataset.rank));
  await reloadKeepsS(pg, '#chrcv .rcv-row.ok[data-rank="0"]', 'ゴール（大会受付）');
  assert.deepEqual(await pg.evaluate(() => [...document.querySelectorAll('.rcv-row.ok')].map((b) => b.dataset.rank)), ranks0, '選べる大会ランクも同じ');
  // ランクE を選んで「この大会に参加する」→ 開始演出 → 順位表
  await pg.waitForTimeout(600);
  await pg.click('.rcv-row.ok[data-rank="0"]'); await pg.waitForTimeout(450); await pg.click('#p9join');
  await pg.waitForSelector('.p9tour');
  const t1 = await reloadKeepsS(pg, '.p9tour', '大会の順位表');
  assert.equal(t1.m.raise.tour.status, 'league'); assert.equal(t1.m.raise.tour.league.round, 0);
  // 対戦開始の1回目（2度押しの確認。2026-10-03 から VS 画面は無い）：再開先は順位表（試合は始まっていない）
  await pg.waitForTimeout(450); await pg.click('.p9next .p9go');
  await reloadKeepsS(pg, '.p9tour', '対戦開始の確認中');
  noErrors(p);
});

T('QA-SR2：Chapter間ファーム・修行（待機）で再読み込みしても S は完全に同じ（修行チケットは二重に使われない）', async () => {
  const p = await openPage(); const pg = p.page;
  await setupTown(pg, { tix: 0 });
  await departDirect(pg);
  // ターンを使い切って Chapter 1 を終える（画面の「Chapterを終える」と同じ処理）
  await pg.evaluate(() => { S.m.raise.turnsUsed = S.m.raise.turnLimit; S.m.raise.pend = null; save(); p8EndChapter(); });
  await pg.waitForSelector('.p9farm');
  const f = await reloadKeepsS(pg, '.p9farm', 'Chapter間ファーム');
  assert.equal(f.m.raise.state, 'farm'); assert.equal(f.m.raise.ch, 2);
  assert.equal(f.m.raise.log.length, 1, 'Chapter 1 の記録は1件');
  // 修行を始める（チケット2枚 → 1枚）
  await pg.evaluate(() => { S.trainTix = 2; save(); hall('s'); });
  await pg.waitForSelector('[onclick="trStart(\'po\')"]');
  await pg.waitForTimeout(600);
  await pg.click('[onclick="trStart(\'po\')"]');
  await pg.waitForSelector('#p7roll');
  const t = await reloadKeepsS(pg, '#p7roll', '修行（待機）');
  assert.equal(t.trainTix, 1, 'チケットは1枚だけ使った');
  assert.deepEqual(t.m.raise.trainRun, { kind: 'po', pos: 0 });
  noErrors(p);
});

T('QA-SR3：サイコロ演出中に再読み込み → 出目・使用ターンは保存どおり。再開後に出目の数だけ1回だけ進む', async () => {
  const p = await openPage(); const pg = p.page;
  await setupTown(pg);
  await departDirect(pg);
  await pg.waitForTimeout(500);
  // 出目を3に固定（押した瞬間の1回だけ。1〜3（2026-10-01 夜）：0.9 → 3）。Chapter 1 はChapterフィールド：f1_0 → f1_1 → f1_2 → f1_3
  await pg.evaluate(() => { window.__rnd = Math.random; Math.random = () => 0.9; });
  await pg.click('#brollbtn');
  await pg.evaluate(() => { Math.random = window.__rnd; });
  const st = JSON.parse(await stored(pg));
  assert.deepEqual(st.m.raise.pend, { roll: 3, left: 3, stage: 'move', fatigueAdded: 7 }, '出目（と疲れ +7）は演出の前に保存済み');
  assert.equal(st.m.raise.turnsUsed, 1); assert.equal(st.m.raise.node, 'p1_0'); assert.equal(st.m.raise.fatigue, 7);
  const { boot } = await reloadResume(pg, '#chf');
  assert.deepEqual(boot, st, '起動直後の S は保存された途中状態と同じ（振り直しなし）');
  await pg.waitForFunction(() => S.m.raise.pend == null && !bBusy && !document.querySelector('.chpop'), null, { timeout: 15000 });
  await pg.waitForSelector('#brollbtn, #chf-ui .chsheet');
  const after = await H.getS(pg);
  assert.equal(after.m.raise.node, 'p1_3', '出目3の分だけ進んだ');
  assert.equal(after.m.raise.turnsUsed, 1, 'ターンは1回分だけ（二重に使っていない）'); assert.equal(after.m.raise.fatigue, 7, '疲れも1回分だけ');
  assert.deepEqual(after, JSON.parse(await stored(pg)), '進んだ結果も保存済み');
  noErrors(p);
});

T('QA-SR4：修行のサイコロ演出中に再読み込み → 保存済みの出目で1回だけ進み、チケットは再度使わない', async () => {
  const p = await openPage(); const pg = p.page;
  await setupTown(pg);
  await departDirect(pg);
  await pg.evaluate(() => { S.m.raise.turnsUsed = S.m.raise.turnLimit; S.m.raise.pend = null; save(); p8EndChapter(); });
  await pg.waitForSelector('.p9farm');
  await pg.waitForTimeout(500);   // 画面が変わった直後の押下を無視する作りでも修行を始められるように
  await pg.evaluate(() => { S.trainTix = 2; save(); trStart('po'); });
  await pg.waitForSelector('#p7roll');
  await pg.waitForTimeout(500);
  // 出目を2に固定（押した瞬間の1回だけ）
  await pg.evaluate(() => { window.__rnd = Math.random; Math.random = () => 0.5; });
  await pg.click('#p7roll');
  await pg.evaluate(() => { Math.random = window.__rnd; });
  const st = JSON.parse(await stored(pg));
  assert.deepEqual(st.m.raise.trainRun, { kind: 'po', pos: 0, roll: 2 }, '修行の出目は演出の前に保存済み');
  assert.equal(st.trainTix, 1);
  const { boot } = await reloadResume(pg, '.p12tr');
  assert.deepEqual(boot, st, '起動直後の S は保存された途中状態と同じ');
  await pg.waitForFunction(() => S.m.raise.trainRun && S.m.raise.trainRun.roll == null, null, { timeout: 15000 });
  const after = await H.getS(pg);
  assert.deepEqual(after.m.raise.trainRun, { kind: 'po', pos: 2 }, '保存済みの出目（2）で1回だけ進んだ');
  assert.equal(after.trainTix, 1, 'チケットは再度使わない');
  for (const k of KS) assert.ok(after.m[k] >= st.m[k], `${k} が減っていない`);
  assert.deepEqual(after, JSON.parse(await stored(pg)), '進んだ結果も保存済み');
  noErrors(p);
});

T('QA-SR5：大会の試合中に再読み込み → その試合は無かったことになり（やり直し）、S は試合開始前と完全に同じ', async () => {
  const p = await openPage(); const pg = p.page;
  await setupTown(pg);
  await departDirect(pg);
  await pg.evaluate(() => { const t = MMP8.trackOf(1); Object.assign(S.m.raise, { node: t.goal, goal: true, pend: null }); save(); MMP8.startTournament(S, S.m, 0); save(); p9VsScr(); });
  await pg.waitForSelector('.p9go');
  await pg.waitForTimeout(600);
  const pre = await H.getS(pg);
  assert.equal(pre.m.raise.battle, null);
  await pg.click('.p9go'); await pg.waitForTimeout(700); await pg.click('.p9go');
  // 2026-10-03：大会は VS から直接 fight()（Battle 開始前の導入は練習試合だけ）
  // 戦闘が始まり、戦闘前の状態（checkpoint）が保存されるまで待つ
  await pg.waitForFunction(() => { const s = JSON.parse(localStorage.getItem('mr4v6')); return !!(s.m.raise.battle && document.getElementById('bt')); }, null, { timeout: 10000 });
  const mid = JSON.parse(await stored(pg));
  assert.equal(mid.m.raise.battle.kind, 'league'); assert.equal(mid.m.raise.battle.done, false);
  await reloadResume(pg, '.p9tour');
  assert.match(await H.text(pg), /途中で終わった/, '途中で終わった試合をやり直せる案内');
  assert.deepEqual(await H.getS(pg), pre, 'S は試合開始前と同じ（結果・賞金は付かない）');
  assert.deepEqual(JSON.parse(await stored(pg)), pre, 'セーブも試合開始前と同じ');
  noErrors(p);
});

T('QA-SR6：試合の決着直後（結果画面）に再読み込み → 旧 fight() が付けた所持金・勝利数は巻き戻り、試合結果は1回だけ記録', async () => {
  const p = await openPage(); const pg = p.page;
  await setupTown(pg);
  await departDirect(pg);
  await pg.evaluate(() => { const t = MMP8.trackOf(1); Object.assign(S.m.raise, { node: t.goal, goal: true, pend: null }); save(); MMP8.startTournament(S, S.m, 0); save(); board(); });
  await pg.waitForSelector('.p9tour');
  const pre = await H.getS(pg);
  // fight() が最後まで終わったときと同じ順序：戦闘前の状態を保存 → 旧来の報酬が付く → adv()（決着の印）→ 保存。結果画面の「もどる」は押さない
  await pg.evaluate(() => { const m = S.m; MMP8.beginBattle(S, m, { kind: 'league', rank: m.raise.tour.rank }); save(); S.g += 100; S.wins = (S.wins || 0) + 1; m.fa += 8; adv(); save(); });
  const mid = JSON.parse(await stored(pg));
  assert.equal(mid.g, pre.g + 100); assert.equal(mid.m.raise.battle.done, true);
  await reloadResume(pg, '.p9tour');
  const a = await H.getS(pg);
  assert.equal(a.g, pre.g, '所持金は試合前に戻る（旧表示の賞金は付かない）');
  assert.equal(a.wins || 0, pre.wins || 0, '勝利数も試合前に戻る');
  assert.equal(a.m.fa, pre.m.fa, '疲労も試合前に戻る');
  assert.equal(a.m.raise.battle, null);
  assert.equal(a.m.raise.tour.league.round, pre.m.raise.tour.league.round + 1, '試合結果は1回だけ記録（1試合進む）');
  assert.deepEqual(JSON.parse(await stored(pg)), a, '巻き戻し・記録の結果は保存済み');
  // もう一度再読み込みしても、二重に記録しない
  await reloadKeepsS(pg, '.p9tour', '決着処理のあと');
  noErrors(p);
});

T('QA-SR7：育成完了画面（フィナの会話中）で再読み込み → 街から再開し、育成完了回数は増えない', async () => {
  const p = await openPage(); const pg = p.page;
  await setupTown(pg);
  await departDirect(pg);
  // Chapter 1〜3 はターン切れで終え、Chapter 4 は画面の処理（p8EndChapter）で終える（Aランク未達なので育成完了）
  await pg.evaluate(() => {
    const m = S.m; m.prog.rankClr = [true, true, true, true, false, false];   // Chapter 3・4 の条件（公式C・B大会クリア。2026-10-01 夜）を満たした個体（A 未満なので Chapter 4 の終わりで育成完了）
    for (let i = 0; i < 3; i++) { m.raise.turnsUsed = m.raise.turnLimit; m.raise.pend = null; MMP8.endChapter(S, m); MMP8.depart(S, m); }
    m.raise.turnsUsed = m.raise.turnLimit; m.raise.pend = null; save(); p8EndChapter();
  });
  await pg.waitForSelector('.p9farm.p9done');
  const done = await H.getS(pg);
  assert.equal(done.m.raise.state, 'done');
  assert.equal(done.raiseRec.done, 1, '育成完了1回');
  assert.equal(done.m.raise.log.length, 4);
  assert.ok(done.m.raise.endStats, '売却額用の終了時の能力を記録');
  assert.deepEqual(JSON.parse(await stored(pg)), done, '育成完了は画面を出す前に保存済み');
  await reloadResume(pg, '.map');
  assert.deepEqual(await H.getS(pg), done, '再読み込みで育成完了回数・記録は変わらない');
  assert.equal(await pg.evaluate(() => MMP8.canVisitTown(S)), true, '育成完了後は街へ行ける');
  noErrors(p);
});

// ---------------------------------------------------------
// 売却・育成放棄：消えた個体・育成中の状態がどこにも残らない
// ---------------------------------------------------------
T('QA-SR8：牧場で売却（2度押し）した個体の uid はセーブのどこにも残らない。連れている個体を売ると S.m は空', async () => {
  const p = await openPage(); const pg = p.page;
  await setupTown(pg, { box: 2 });
  await pg.evaluate(() => farm('', 'd'));
  await pg.waitForSelector('[onclick="pfSellPick(2)"]');
  const uid = await pg.evaluate(() => S.box[1].uid), g0 = await pg.evaluate(() => S.g);
  await pg.waitForTimeout(500);
  await pg.click('[onclick="pfSellPick(2)"]');
  await pg.waitForSelector('.pfsell ~ button.go');
  await pg.waitForTimeout(600);
  await pg.click('.pfsell ~ button.go');
  await pg.waitForTimeout(700);
  assert.ok((await stored(pg)).includes(uid), '1回目の押下ではまだ売却しない');
  await pg.click('.pfsell ~ button.go');
  await pg.waitForFunction((u) => !JSON.stringify(S).includes(u), uid);
  assert.equal(await pg.evaluate(() => S.g), g0 + 50, '未育成は50G');
  assert.ok(!(await stored(pg)).includes(uid), 'セーブ（mr4v6）に売却した uid が残らない');
  assert.equal(await pg.evaluate(() => pfSellUid), null, '売却の選択も残らない');
  assert.deepEqual(await pg.evaluate(() => sel), [], '合体の選択も残らない');
  // 連れている個体（ソラモ）を売る → S.m は空
  const uidM = await pg.evaluate(() => S.m.uid);
  await pg.waitForTimeout(500);
  await pg.click('[onclick="pfSellPick(0)"]');
  await pg.waitForSelector('.pfsell ~ button.go');
  await pg.waitForTimeout(600);
  await pg.click('.pfsell ~ button.go'); await pg.waitForTimeout(700); await pg.click('.pfsell ~ button.go');
  await pg.waitForFunction(() => S.m === null);
  const s = await H.getS(pg);
  assert.equal(s.box.length, 1, '残りは牧場の1体');
  assert.ok(!JSON.stringify(s).includes(uidM) && !(await stored(pg)).includes(uidM), '売却した連れている個体の uid も残らない');
  assert.equal(s.g, g0 + 100);
  // 最後の1体は売れない（ボタンは無効）
  assert.equal(await pg.evaluate(() => document.querySelector('[onclick="pfSellPick(0)"]').disabled), true, '最後の1体の「売る」は押せない');
  const after = await reloadKeepsS(pg, '.map', '売却後');
  assert.ok(!JSON.stringify(after).includes(uid) && !JSON.stringify(after).includes(uidM));
  noErrors(p);
});

T('QA-SR9：育成放棄（メニュー → 2段階確認 → 3秒待ち）のあと、育成中の状態も放棄した個体もどこにも残らない', async () => {
  const p = await openPage(); const pg = p.page;
  await setupTown(pg, { tix: 0 });
  await departDirect(pg);
  // 少し進めた状態（チケット・所持金は放棄後も残る）
  await pg.evaluate(() => { S.trainTix = 3; S.g = 999; S.m.raise.turnsUsed = 5; S.m.raise.node = 'p2'; save(); board(); });
  await pg.waitForSelector('#brollbtn');
  const uid = await pg.evaluate(() => S.m.uid), boxUid = await pg.evaluate(() => S.box[0].uid);
  await pg.waitForTimeout(500);
  await pg.click('[onclick="p9Menu()"]');
  await pg.waitForSelector('#p9ov [onclick*="p8AbandonAsk"]');
  await pg.waitForTimeout(500);
  await pg.click('#p9ov [onclick*="p8AbandonAsk"]');
  await pg.waitForSelector('#p8m .p8danger');
  await pg.waitForTimeout(500);
  await pg.click('#p8m .p8danger');
  await pg.waitForSelector('#p8abgo');
  assert.ok((await stored(pg)).includes(uid), '最終確認の途中ではまだ放棄しない');
  await pg.waitForFunction(() => { const b = document.getElementById('p8abgo'); return b && !b.disabled; }, null, { timeout: 8000 });
  await pg.click('#p8abgo');
  await pg.waitForSelector('.map');
  const s = await H.getS(pg);
  assert.equal(s.m, null, '連れている個体はいない');
  assert.ok(!JSON.stringify(s).includes(uid) && !(await stored(pg)).includes(uid), '放棄した個体の uid はどこにも残らない');
  assert.deepEqual(s.box.map((x) => x.uid), [boxUid], '牧場の個体はそのまま');
  assert.equal(s.trainTix, 3, '修行チケットは残る'); assert.equal(s.g, 999, '所持金は残る');
  assert.equal(await pg.evaluate(() => MMP8.canVisitTown(S) && MMP8.resumeTarget(S)), 'town');
  assert.deepEqual(await pg.evaluate(() => sel), []);
  await reloadKeepsS(pg, '.map', '育成放棄後');
  noErrors(p);
});

// ---------------------------------------------------------
// Chapter進行は連れている個体だけ
// ---------------------------------------------------------
T('QA-SR10：出発・Chapter終了・大会・修行の間、牧場の個体は常に未育成のまま（進行は S.m だけ）', async () => {
  const p = await openPage(); const pg = p.page;
  await setupTown(pg, { box: 3 });
  const boxBefore = await pg.evaluate(() => JSON.stringify(S.box));
  await departDirect(pg);
  const check = async (label) => {
    const s = await H.getS(pg), st = JSON.parse(await stored(pg));
    for (const x of [s, st]) {
      assertProgressOnlyOnM(x, label);
      assert.equal(JSON.stringify(x.box), boxBefore, `${label}：牧場の個体は出発前から何も変わらない`);
    }
  };
  await check('出発直後');
  await pg.evaluate(() => { const t = MMP8.trackOf(1); Object.assign(S.m.raise, { node: t.goal, goal: true, pend: null }); MMP8.startTournament(S, S.m, 0); save(); board(); });
  await pg.waitForSelector('.p9tour');
  await check('大会中');
  await pg.evaluate(() => { Object.assign(S.m.raise, { tour: null, goal: false, node: "p2", turnsUsed: S.m.raise.turnLimit }); save(); p8EndChapter(); });
  await pg.waitForSelector('.p9farm');
  await check('Chapter間ファーム');
  await pg.waitForTimeout(500);
  await pg.evaluate(() => { S.trainTix = 1; save(); trStart('in'); });
  await pg.waitForSelector('#p7roll');
  await check('修行中');
  noErrors(p);
});
