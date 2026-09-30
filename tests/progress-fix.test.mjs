// =========================================================
// 通し試遊の修正テスト（進行上の問題）
//  F1：Chapter 4でAランク以上をクリア → 最終ルートのマップ未登録のときだけ、安全に育成を完了して街へ戻れる
//      （大会結果・賞金・育成記録を失わない／再読込で報酬が二重に付かない／登録済みなら通常どおり最終ルートへ）
//  F2：育成完了回数（ノビトンの入荷条件＝育成完了5回）：育成完了1回につき1回だけ加算。購入・合体・再読込では増えない。
//      記録の無い旧セーブは推測で埋めない（0回から・fromStart:false）
//  純粋ロジック（MMP7／MMP8L／MMP8／MMP10M）は直接実行し、index.html の画面側は実物のコードを抽出して静的に確認する。
// =========================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const HTML = rd('index.html');
const SRC = { p7: rd('js/phase7/progression.js'), lg: rd('js/phase8/league.js'), p8: rd('js/phase8/raising.js'), mo: rd('js/phase10/monsters.js') };
function load() { const w = {}; for (const k of ['p7', 'lg', 'p8', 'mo']) new Function('window', SRC[k])(w); return { P7: w.MMP7, P8: w.MMP8, M: w.MMP10M }; }
const j = (o) => JSON.parse(JSON.stringify(o));
const reload = (P8, S) => P8.migrateSave(j(S));   // セーブ→再読込と同じ（JSON往復＋v6の正規化）
const lineOf = (prefix) => HTML.split('\n').find((l) => l.startsWith(prefix));
const between = (a, b) => { const i = HTML.indexOf(a), k = HTML.indexOf(b, i + a.length); if (i < 0 || k < 0) throw new Error('抽出失敗: ' + a); return HTML.slice(i, k); };
function mon(P7, over = {}) {
  const m = { sp: 0, name: 'テスト', age: 0, span: 30, h: 0, rk: 0, fa: 0, st: 0, last: null, li: 100, po: 100, in: 100, hi: 100, ev: 100, de: 100, sk: [0, 1, 2, 3], eq: [0, 1, 2, 3, -1, -1], ...over };
  P7.ensureProg(m); return m;
}
function line(n, type = 'normal') {
  const nodes = { s: { type: 'start', x: 0, y: 0 } }, conn = {}; let prev = 's';
  for (let i = 1; i < n; i++) { const id = 'n' + i; nodes[id] = { type, x: i, y: 0 }; conn[prev] = [id]; prev = id; }
  nodes.g = { type: 'tournament', x: n, y: 0 }; conn[prev] = ['g'];
  return { nodes, conn, start: 's', goal: 'g' };
}
function runTurn(P8, S, rnd = () => 0) {
  for (let g = 0; g < 60 && S.m.raise.pend; g++) {
    const st = S.m.raise.pend.stage;
    if (st === 'move') P8.step(S, S.m);
    else if (st === 'branch') P8.chooseBranch(S, S.m, S.m.raise.pend.opts[0]);
    else if (st === 'resolve') P8.resolveLanding(S, S.m, rnd);
    else if (st === 'battle') P8.skipBattleSquare(S, S.m);
  }
}
/** 大会の1試合：旧fight()が終了時に付ける賞金・勝利数などを再現してから、finishBattle で正規化する */
function playLeague(P8, S, won) {
  const t = S.m.raise.tour; assert.equal(P8.beginBattle(S, S.m, { kind: 'league', rank: t.rank }).ok, true);
  if (won) { S.g += 999; S.wins = (S.wins || 0) + 1; S.br = 5; S.m.rk = 5; }
  P8.markBattleDone(S); return P8.finishBattle(S, S.m, () => 0);
}
/** Chapter 4のゴール（大会前）にいる個体を S.m に置く（S0 を渡すと同じセーブで次の個体を育てる） */
function ch4Goal(P7, P8, rankClr, S0) {
  for (const no of [1, 2, 3, 4]) P7.registerChapterBoard(no, line(1));
  const S = S0 || P8.newSave(); if (S.m) S.box.push(S.m);
  S.m = P8.initIndividual(S, mon(P7, { name: 'A' })); S.m.prog.rankClr = [...rankClr];
  Object.assign(S.m.raise, { state: 'farm', ch: 4, log: [{ ch: 1 }, { ch: 2 }, { ch: 3 }] });
  P8.depart(S, S.m); P8.roll(S, S.m, () => 0); runTurn(P8, S);
  return S;
}
const B_CLEARED = [true, true, true, true, false, false], A_CLEARED = [true, true, true, true, true, false];

// ---------------------------------------------------------
// F1：最終ルート未登録時の安全な育成完了
// ---------------------------------------------------------
test('F1-1：Chapter 4でA大会に初優勝→行き先は従来どおり最終ルート。マップ未登録のときだけ代替処理で育成完了でき、大会結果・賞金・記録は残る', () => {
  const { P7, P8 } = load();
  const S = ch4Goal(P7, P8, B_CLEARED); S.g = 1350;
  assert.equal(P8.startTournament(S, S.m, 4, 11).ok, true);
  let f; for (let i = 0; i < 7; i++) f = playLeague(P8, S, true);
  assert.equal(f.won, true); assert.equal(S.g, 1350 + 800, 'A初回優勝の賞金800Gを1回だけ');
  const e = P8.endChapter(S, S.m);
  assert.equal(e.next, P8.FINAL); assert.deepEqual([S.m.raise.state, S.m.raise.ch], ['farm', P8.FINAL], 'Chapter 4終了時の行き先（最終ルート）は変えない');
  assert.deepEqual(P8.canDepart(S, S.m), { ok: false, reason: 'no_map', key: P8.FINAL }, '本番は最終ルートのマップ未登録');
  assert.equal(P8.canVisitTown(S), false, '代替処理の前はまだ育成中');
  assert.deepEqual(P8.canFinishWithoutFinal(S, S.m), { ok: true });
  assert.equal(P8.raiseDoneCount(S), 0);
  const g0 = S.g, log0 = j(S.m.raise.log);
  const r = P8.finishWithoutFinal(S, S.m);
  assert.equal(r.ok, true); assert.equal(r.next, 'done'); assert.equal(r.raiseDone, 1);
  assert.equal(S.m.raise.state, 'done'); assert.equal(S.g, g0, '所持金（大会賞金）はそのまま');
  assert.deepEqual(S.m.raise.log.slice(0, log0.length), log0, 'Chapter 1〜4の記録はそのまま');
  assert.deepEqual(S.m.raise.log.at(-2).tour, { rank: 4, place: 1, won: true, firstClear: true }, 'A大会の結果も残る');
  assert.deepEqual(S.m.raise.log.at(-1), { ch: P8.FINAL, skipped: true, reason: 'final_unavailable' }, '最終ルート未実施の記録を1件だけ足す');
  assert.deepEqual(S.m.prog.rankClr, A_CLEARED, 'Aランクのクリア実績も残る');
  assert.equal(P8.canVisitTown(S), true, '街・牧場へ戻れる'); assert.equal(P8.canDepart(S, S.m).reason, 'finished');
  assert.deepEqual(P8.finishWithoutFinal(S, S.m), { ok: false, reason: 'not_final_farm' }, '二度は実行できない');
  assert.equal(P8.raiseDoneCount(S), 1, '育成完了回数は1回だけ');
});

test('F1-2：再読込しても大会報酬・記録・育成完了回数は二重に適用されない（勝利直後の中断／大会決着後／Chapter終了後／育成完了後）', () => {
  const { P7, P8 } = load();
  let S = ch4Goal(P7, P8, B_CLEARED); S.g = 1000;
  P8.startTournament(S, S.m, 4, 11); for (let i = 0; i < 6; i++) playLeague(P8, S, true);
  // 最終試合：旧fight()が勝利時の賞金などを付けて保存した直後（「もどる」を押す前）に中断→再読込
  assert.equal(P8.beginBattle(S, S.m, { kind: 'league', rank: 4 }).ok, true);
  S.g += 800; S.wins = (S.wins || 0) + 1; P8.markBattleDone(S);
  S = reload(P8, S);
  const f = P8.finishBattle(S, S.m, () => 0);   // 再読込後の board() が行う正規化
  assert.equal(f.settled, true); assert.equal(f.won, true); assert.equal(S.g, 1800, '賞金は大会の決着で1回だけ（旧fight()の分は取り消し）');
  for (let k = 0; k < 3; k++) { S = reload(P8, S); assert.equal(P8.finishBattle(S, S.m), null, '決着済みの戦闘は再処理しない'); }
  assert.deepEqual([S.g, S.m.raise.tour.status], [1800, 'settled']);
  assert.equal(P8.endChapter(S, S.m).next, P8.FINAL);
  for (let k = 0; k < 3; k++) S = reload(P8, S);
  assert.deepEqual([S.g, S.m.raise.state, S.m.raise.ch, S.m.raise.log.length, P8.raiseDoneCount(S)], [1800, 'farm', P8.FINAL, 4, 0]);
  assert.equal(P8.resumeTarget(S), 'farm', '再開先はChapter間ファーム（案内を表示する画面）');
  assert.equal(P8.finishWithoutFinal(S, S.m).ok, true);
  for (let k = 0; k < 3; k++) S = reload(P8, S);
  assert.deepEqual([S.g, S.m.raise.state, S.m.raise.log.length, P8.raiseDoneCount(S), S.raiseRec.fromStart], [1800, 'done', 5, 1, true]);
  assert.equal(P8.resumeTarget(S), 'town');
});

test('F1-3：最終ルートのマップが登録済みなら代替処理は使えず、通常どおり最終ルートへ出発→ゴールで育成完了（回数は1回だけ）', () => {
  const { P7, P8 } = load();
  const S = ch4Goal(P7, P8, A_CLEARED); P8.declineTournament(S, S.m);
  P8.registerFinalBoard(line(6), { provisional: true, note: 'テスト用' });
  assert.deepEqual(P8.canFinishWithoutFinal(S, S.m), { ok: false, reason: 'final_available' });
  assert.equal(P8.finishWithoutFinal(S, S.m).ok, false);
  assert.equal(P8.depart(S, S.m).ok, true); assert.equal(S.m.raise.state, 'final');
  for (let t = 0; t < 20 && !S.m.raise.goal; t++) { P8.roll(S, S.m, () => 0); runTurn(P8, S); }
  assert.equal(P8.raiseDoneCount(S), 0, '最終ルートの途中ではまだ加算しない');
  const e = P8.endChapter(S, S.m);
  assert.equal(e.next, 'done'); assert.equal(S.m.raise.log.at(-1).ch, P8.FINAL); assert.ok(!S.m.raise.log.at(-1).skipped, '実際に最終ルートを終えた記録');
  assert.equal(P8.raiseDoneCount(S), 1);
});

test('F1-4：最終ルート進行中（state=final）のまま保存された旧セーブも、マップが無ければファームへ退避し、代替処理で完了できる', () => {
  const { P7, P8 } = load();
  const S = ch4Goal(P7, P8, A_CLEARED); P8.declineTournament(S, S.m);
  Object.assign(S.m.raise, { state: 'final', node: 'x', turnsUsed: 3, turnLimit: null });
  const R = reload(P8, S);
  assert.equal(P8.resumeTarget(R), 'board');
  assert.equal(P8.ensureBoardPosition(R, R.m).rescued, true);
  assert.deepEqual([R.m.raise.state, R.m.raise.ch], ['farm', P8.FINAL]);
  assert.equal(P8.finishWithoutFinal(R, R.m).ok, true); assert.equal(P8.canVisitTown(R), true);
});

test('F1-5：画面：未登録のときだけ案内と「育成を完了して街へ戻る」（2度押し）を出し、完了後は育成完了画面へ。登録済みなら通常の案内だけ', () => {
  const note = between('function pfixFinalNote(){', '\nfunction pfixFinishNoFinal(');
  assert.match(note, /^function pfixFinalNote\(\)\{if\(MMP8\.isPlayable\(MMP8\.FINAL\)\)return `<p class="p9s">Aランク以上をクリアしたため、最終ルートへ進みます。<\/p>`;/, '登録済みは通常の案内だけ（ボタンなし）');
  assert.match(note, /最終ルートはまだ準備中のため、ここで育成を完了して街へ戻れます。/); assert.match(note, /onclick="pfixFinishNoFinal\(this\)">育成を完了して街へ戻る</);
  const fin = lineOf('function pfixFinishNoFinal(b){');
  assert.match(fin, /MMP8\.canFinishWithoutFinal\(S,m\)\.ok\)return p8Resume\(\);if\(b&&!arm\(b,"もう一度押すと育成完了"\)\)return;const r=MMP8\.finishWithoutFinal\(S,m\);if\(!r\.ok\)return p8Resume\(\);save\(\);p8DoneScr\(/);
  // Chapter間ファーム（次＝最終ルート）：未登録なら進行ボタンが「育成を完了して街へ戻る」（2度押し）。出発準備にも同じボタン
  assert.match(between('function fmScr(msg){', '\n// ---- Phase 8：育成中の画面遷移'), /:fin&&!MMP8\.isPlayable\(MMP8\.FINAL\)\?\{t:"育成を完了して街へ戻る",s:"最終ルートは準備中",on:"pfixFinishNoFinal\(this\)",c:""\}/, 'Chapter間ファーム（次＝最終ルート・未登録）の進行ボタンは「育成を完了して街へ戻る」（2度押し）');
  assert.match(lineOf('function p8AfterChapterEnd(r){'), /MMP8\.isPlayable\(MMP8\.FINAL\)\?"Aランク以上をクリアしたので、次は最終Chapterへ進みます！":"Aランク以上をクリアした！ 最終ルートは準備中のため/);
  assert.match(between('function prepScr(msg){', '\nconst P7_ERR='), /\(nx==MMP8\.FINAL&&!MMP8\.isPlayable\(MMP8\.FINAL\)\)\?`[^`]*最終ルートはまだ準備中です。[^`]*<button class="go" onclick="pfixFinishNoFinal\(this\)">育成を完了して街へ戻る<\/button>`:/, '「ボード」（出発準備）からも同じ完了ボタン（未登録のときだけ）');
  const done = lineOf('function p8DoneScr(msg){');
  assert.match(done, /e\.skipped\?"準備中のため未実施（ここで育成完了）"/); assert.match(done, /\$\{msg\?`<div class="sub">\$\{msg\}<\/div>`:""\}/);
});

// ---------------------------------------------------------
// F2：育成完了回数とノビトンの入荷条件
// ---------------------------------------------------------
test('F2-1：新規セーブは0回・最初から記録（fromStart:true）。購入では増えない（S.cntは従来どおり購入で増えるが育成回数ではない）', () => {
  const { P8, M } = load();
  const S = P8.newSave(); S.g = 300;
  assert.deepEqual(S.raiseRec, { done: 0, fromStart: true }); assert.equal(S.v, 6);
  assert.equal(M.purchase(S, 'solamo', 0).ok, true); S.cnt = (S.cnt || 0) + 1;   // adopt() と同じ
  assert.equal(P8.raiseDoneCount(S), 0);
  assert.deepEqual(M.nobitonStock(S), { need: 5, done: 0, met: false, fromStart: true });
});

test('F2-2：育成完了1回につき1回だけ加算し、5回目でノビトンの入荷条件を満たす（4回では満たさない）。再読込では増えない', () => {
  const { P7, P8, M } = load();
  let S = P8.newSave();
  for (let n = 1; n <= 5; n++) {
    ch4Goal(P7, P8, B_CLEARED, S);
    assert.equal(P8.raiseDoneCount(S), n - 1, `${n}体目：Chapter 4の終了前は加算しない`);
    assert.equal(P8.declineTournament(S, S.m).next, 'done');
    assert.equal(P8.raiseDoneCount(S), n, `${n}体目の育成完了で ${n} 回`);
    for (let k = 0; k < 2; k++) S = reload(P8, S);
    assert.equal(P8.raiseDoneCount(S), n, '再読込では増えない');
    assert.equal(M.nobitonStock(S).met, n >= 5, `${n}回：入荷条件は5回以上`);
  }
  assert.deepEqual(M.nobitonStock(S), { need: 5, done: 5, met: true, fromStart: true });
  S.g = 0; const rr = M.purchase(S, 'solamo', 5);   // 5体とも育成完了・0G・合体不可 → 継続用救済（後の修正で追加）での購入
  assert.deepEqual([rr.ok, rr.continueRescued, S.g, P8.raiseDoneCount(S)], [true, true, 0, 5], '救済での購入でも育成完了回数は増えない'); S.g = 500;
  assert.equal(M.purchase(S, 'solamo', 5).ok, true); assert.equal(P8.raiseDoneCount(S), 5, '購入では増えない');
});

test('F2-3：育成放棄・Chapter 1〜3の終了・大会辞退（Chapter 1〜3）では増えない。育成完了は Chapter 4終了（B以下）・最終ルート終了・代替処理のときだけ', () => {
  const { P7, P8 } = load();
  for (const no of [1, 2, 3, 4]) P7.registerChapterBoard(no, line(1));
  const S = P8.newSave(); S.m = P8.initIndividual(S, mon(P7));
  for (let ch = 1; ch <= 3; ch++) { P8.depart(S, S.m); P8.roll(S, S.m, () => 0); runTurn(P8, S); assert.equal(P8.declineTournament(S, S.m).next, ch + 1); }
  assert.equal(P8.raiseDoneCount(S), 0);
  assert.equal(P8.abandon(S, S.m.uid).ok, true); assert.equal(P8.raiseDoneCount(S), 0, '育成放棄は育成完了ではない');
  const src = SRC.p8;
  assert.equal((src.match(/recordRaiseDone\(S\)/g) || []).length, 3, '呼び出しは closeChapter（done のときだけ）と finishWithoutFinal の2か所＋定義内');
  assert.match(src, /if \(nx\.state === RAISE\.DONE\) \{ r\.endStats = statSnap\(m\); recordRaiseDone\(S\); \}/, '（売却機能で、完了時の能力値の記録を同じ箇所に追加）');
});

test('F2-4：記録の無い旧セーブは推測で埋めない（育成完了個体がいても0回から・fromStart:false）。不正値も同様。v4/v5からの移行も同じで、セーブversionは6のまま', () => {
  const { P7, P8 } = load();
  const S = P8.newSave(); delete S.raiseRec;   // 3302ae3以前に作られた v6 セーブ相当
  S.m = P8.initIndividual(S, mon(P7)); S.m.raise.state = 'done'; S.box = [P8.initIndividual(S, mon(P7))]; S.box[0].raise.state = 'done';
  const R = P8.migrateSave(j(S));
  assert.deepEqual(R.raiseRec, { done: 0, fromStart: false }, '育成完了個体が2体いても、合体・放棄で消えた分が分からないため推測しない');
  assert.equal(R.v, 6);
  for (const bad of [null, 5, 'x', [], { done: -1 }, { done: 1.5 }, { done: '3' }]) assert.deepEqual(P8.migrateSave(j({ ...S, raiseRec: bad })).raiseRec, { done: 0, fromStart: false });
  assert.deepEqual(P8.migrateSave(j({ ...S, raiseRec: { done: 3 } })).raiseRec, { done: 3, fromStart: false }, '記録済みの回数は保つ');
  assert.deepEqual(P8.migrateSave(j({ ...S, raiseRec: { done: 3, fromStart: true } })).raiseRec, { done: 3, fromStart: true });
  const v5 = P7.newSave(); v5.m = mon(P7);
  const M5 = P8.migrateSave(j(v5)); assert.deepEqual(M5.raiseRec, { done: 0, fromStart: false }); assert.equal(M5.v, 6);
  assert.equal(P8.SAVE_KEY, 'mr4v6', '保存キーは変えない');
});

test('F2-5：入荷条件を満たしても販売は始めない（市場データ・購入判定は従来どおり入荷待ち）。市場・街の表示は育成完了回数を使う', () => {
  const { P8, M } = load();
  const S = P8.newSave(); S.raiseRec.done = 5; S.g = 9999;
  assert.equal(M.nobitonStock(S).met, true);
  assert.deepEqual(M.canPurchase(S, 'nobiton', 1), { ok: false, reason: 'waiting' }, '正式データ（技・入荷イベントなど）がそろうまで購入不可のまま');
  assert.deepEqual(M.MARKET_CATALOG.map((c) => [c.key, c.status, c.price ?? null]), [['solamo', 'sale', 500], ['gauru', 'sale', 500], ['nobiton', 'waiting', null]], '市場データ・価格は変えない');
  const info = between('function p10Info(){', '\nfunction p10BuyAsk(');
  assert.match(info, /const nb=c\.key=="nobiton"\?MMP10M\.nobitonStock\(S\):null;/);
  assert.match(info, /入荷条件：育成完了 \$\{nb\.need\}回（いま \$\{nb\.done\}回）/);
  assert.match(info, /nb\.fromStart\?"":"<br>※この版より前の育成完了は記録がないため、回数に含まれません"/);
  assert.match(info, /<button class="p10buy" disabled>入荷待ち<\/button>/, '購入ボタンは使えないまま');
  const bp = lineOf('const bprof=');
  assert.match(bp, /🐾 育成完了 \$\{MMP8\.raiseDoneCount\(S\)\}回/); assert.doesNotMatch(bp, /S\.cnt|育てた/, '購入・合体の回数（S.cnt）を育成回数として表示しない');
  assert.doesNotMatch(between('async function fuse(){', '\nfunction tog('), /raiseRec|raiseDone/, '合体では育成完了回数を変えない');
  assert.doesNotMatch(lineOf('function adopt('), /raiseRec|raiseDone/, '購入では育成完了回数を変えない');
});
