// =========================================================
// Phase 7 テスト
//  ・js/phase7/progression.js（window.MMP7）の純粋ロジック
//  ・index.html 側の接続コード（bResolve・Chapterクリア時のafter・fuse・p7Load）を
//    index.html から実物のまま抽出し、最小限のスタブで実行して確認する
//  ・Phase 6 の保護対象（fight()本体・バトルCSS・横長media query・ルーレット・bridge・adapter）が
//    Phase 6 完成版とバイト単位で同一であることを確認する
//  既存41件（integration 10・act接続 13・Phase6 18）はここでは一切変更しない。
// =========================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const HTML = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const P7SRC = readFileSync(path.join(ROOT, 'js/phase7/progression.js'), 'utf8');
const sha = (t) => createHash('sha256').update(t).digest('hex');

/** 毎回まっさらなMMP7を作る（レジストリがテスト間で混ざらないように） */
function loadP7() {
  const win = {};
  new Function('window', P7SRC)(win);
  return win.MMP7;
}
/** 決まった値を順番に返す乱数（尽きたら最後の値を返し続ける） */
const seq = (...xs) => { let i = 0; return () => xs[Math.min(i++, xs.length - 1)]; };

function cut(src, startMarker, endMarker) {
  const i = src.indexOf(startMarker);
  if (i < 0) throw new Error('抽出開始位置がありません：' + startMarker);
  const j = src.indexOf(endMarker, i + startMarker.length);
  if (j < 0) throw new Error('抽出終了位置がありません：' + endMarker);
  return src.slice(i, j);
}
const lineOf = (src, startsWith) => {
  const l = src.split('\n').find((x) => x.startsWith(startsWith));
  if (!l) throw new Error('行がありません：' + startsWith);
  return l;
};

function monster(P, over = {}) {
  const m = { sp: 0, name: 'テスト', age: 0, span: 30, h: 0, rk: 0, fa: 0, st: 0, last: null,
    li: 100, po: 100, in: 100, hi: 100, ev: 100, de: 100, sk: [0, 1, 2, 3], eq: [0, 1, 2, 3, -1, -1], ...over };
  P.ensureProg(m);
  return m;
}
/** テスト専用の10技（本番には登録しない） */
const FIXTURE_MOVESET = { initial: [100, 101, 102, 103], po: [110], in: [111], hi: [112], ev: [113], de: [120, 121] };
function farmSave(P, over = {}) {
  const S = P.newSave();
  S.m = monster(P);
  return Object.assign(S, over);
}
/** Chapter 1クリア後にファームへ帰還した状態（修行が解禁されている） */
function trainSave(P, over = {}) {
  const S = farmSave(P, over);
  S.chap = { status: 'farm', clearedMax: 1, cleared: [1] };
  return S;
}

// ---------------------------------------------------------
// セーブ v5
// ---------------------------------------------------------
const V4_FIXTURE = {
  v: 4, y: 1001, mo: 7, wk: 2, g: 1234, cnt: 3, wins: 5, br: 3, fx1: 1,
  box: [{ sp: 1, name: 'ガウル', age: 3, span: 30, h: 0, rk: 1, fa: 0, st: 0, last: null, sk: [10, 11, 12, 13], eq: [10, 11, 12, 13, -1, -1], li: 80, po: 110, in: 110, hi: 90, ev: 90, de: 60 }],
  m: { sp: 0, name: 'ソラモ', age: 5, span: 30, h: 0, rk: 4, fa: 10, st: 5, last: 'po', sk: [0, 1, 2, 3, 4], eq: [0, 1, 2, 3, 4, -1], li: 150, po: 160, in: 120, hi: 130, ev: 110, de: 140 },
  board: { ch: 2, node: 'm7', done: false },
};

test('P7-1：v4セーブがv5へ正常移行する（既存フィールドは保持・新規フィールドを補完・元データは不変）', () => {
  const P = loadP7();
  const before = JSON.stringify(V4_FIXTURE);
  const S = P.migrateSave(V4_FIXTURE);
  assert.equal(JSON.stringify(V4_FIXTURE), before, '元のv4オブジェクトを書き換えないこと');
  assert.equal(S.v, 5);
  assert.equal(S.migratedFrom, 4);
  // 既存フィールドはそのまま
  for (const k of ['y', 'mo', 'wk', 'g', 'cnt', 'wins', 'br', 'fx1']) assert.equal(S[k], V4_FIXTURE[k], k);
  assert.deepEqual(S.m.sk, V4_FIXTURE.m.sk);
  assert.deepEqual(S.m.eq, V4_FIXTURE.m.eq);
  assert.equal(S.box[0].name, 'ガウル');
  assert.deepEqual(S.board, V4_FIXTURE.board);
  // 新規フィールド
  assert.deepEqual(S.chap, { status: 'board', clearedMax: 1, cleared: [1] }, '旧ch=2・途中マス → Chapter1クリア済み・Chapter2進行中');
  assert.deepEqual(S.inv, { bag: [], bagCapUnlocked: false, vault: [], vaultCap: null });
  assert.equal(S.trainTix, 0, '修行チケットは配布しない');
  assert.equal(S.trainRun, null);
  assert.deepEqual(S.rankRec.cleared, [true, true, true, true, false, false], '旧br=3（Bまで勝利）');
  assert.deepEqual(S.m.prog.rankClr, [true, true, true, true, false, false], '旧rk=4 → E〜Bクリア済み');
  assert.deepEqual(S.box[0].prog.rankClr, [true, false, false, false, false, false]);
  assert.deepEqual(S.m.prog.train, { po: 0, in: 0, hi: 0, ev: 0, de: 0 });
});

test('P7-1b：v4移行の境界（Sランク勝利済み→6枠、スタート地点→ファーム扱い、不正データはnull）', () => {
  const P = loadP7();
  const s1 = P.migrateSave({ ...V4_FIXTURE, br: 5, board: { ch: 3, node: 's', done: false } });
  assert.equal(s1.inv.bagCapUnlocked, true);
  assert.equal(P.bagCap(s1), 6);
  assert.equal(s1.chap.status, 'farm');
  assert.equal(s1.chap.clearedMax, 2);
  const s2 = P.migrateSave({ v: 4, y: 1000, mo: 4, wk: 1, g: 1000, box: [], m: null });
  assert.equal(s2.chap.status, 'farm');
  assert.equal(s2.chap.clearedMax, 0);
  assert.equal(P.migrateSave(null), null);
  assert.equal(P.migrateSave({ v: 3, box: [] }), null);
  assert.equal(P.migrateSave({ v: 4, box: 'x' }), null);
});

test('P7-2：v5を保存・ロードしても新規状態が維持される', () => {
  const P = loadP7();
  const S = trainSave(P, { trainTix: 2 });
  S.inv.bag.push({ id: 'x' }); S.inv.vault.push({ id: 'y' }); S.inv.bagCapUnlocked = true;
  S.chap = { status: 'farm', clearedMax: 2, cleared: [1, 2] };
  S.m.prog.train.de = 1; S.m.prog.rankClr[3] = true; S.m.prog.learnSrc[120] = 'de';
  S.trainRun = { kind: 'hi', pos: 7 };
  const loaded = P.migrateSave(JSON.parse(JSON.stringify(S)));
  assert.deepEqual(loaded, JSON.parse(JSON.stringify(S)));
});

test('P7-2b：index.htmlのp7Load：v4を読むと原文をmr4_v4backupへ退避し、v5を書き戻す', () => {
  const P = loadP7();
  const store = { mr4: JSON.stringify(V4_FIXTURE) };
  const localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
  const load = () => JSON.parse(localStorage.getItem('mr4'));
  const src = lineOf(HTML, 'function p7Load(){');
  const p7Load = new Function('localStorage', 'load', 'MMP7', src + '\nreturn p7Load;')(localStorage, load, P);
  const S = p7Load();
  assert.equal(S.v, 5);
  assert.equal(store.mr4_v4backup, JSON.stringify(V4_FIXTURE), 'v4原文がそのまま退避される');
  assert.equal(JSON.parse(store.mr4).v, 5);
  // 2回目の起動でバックアップが上書きされない
  store.mr4 = JSON.stringify({ ...V4_FIXTURE, g: 1 });
  p7Load();
  assert.equal(store.mr4_v4backup, JSON.stringify(V4_FIXTURE));
});

// ---------------------------------------------------------
// Chapter
// ---------------------------------------------------------
test('P7-3：通常Chapterにターン制限が追加されていない', () => {
  const P = loadP7();
  const S = P.newSave();
  const keys = JSON.stringify(S.chap) + JSON.stringify(P.CHAPTER_DEFS);
  assert.doesNotMatch(keys, /turn|limit|ターン/i, 'Chapter状態・定義にターン上限を持たない');
  assert.doesNotMatch(P7SRC.replace(/\/\/.*$/gm, ''), /turnLimit|maxTurns?|MAX_TURN/i);
  const boardCode = HTML.slice(HTML.indexOf('/* ===== 育成ボードシステム'));
  assert.doesNotMatch(boardCode, /turnLimit|maxTurns?|MAX_TURN|ターン制限|\bturns?\s*[<>]=?/i, '育成ボードのコードにターン上限の判定がない');
  assert.deepEqual(P.CHAPTER_DEFS.map((c) => c.name), ['はじまりの草原', '海岸地方', '空のエリア', '火山地方']);
});

function loadBResolve(P, S, nodeType) {
  const src = cut(HTML, 'async function bResolve(nodeId){', '\nfunction TYPE_LABEL_TO_KEY');
  const tl = lineOf(HTML, 'function TYPE_LABEL_TO_KEY');
  const calls = { board: [], other: [] };
  const stubs = {
    S, MMP7: P, R: () => 0, KS: ['li', 'po', 'in', 'hi', 'ev', 'de'], LAB: {},
    BTYPE_LABEL: { normal: '通常', power: 'ちから', train: '修行' }, BEV: [], BRARE: [],
    bNode: () => ({ type: nodeType }), bState: () => S.board,
    board: (msg) => calls.board.push(msg), save: () => {},
    bTournamentPrompt: async () => calls.other.push('tournament'), bTrainPrompt: async () => calls.other.push('train'),
    bBattlePrompt: async () => calls.other.push('battle'),
  };
  const names = Object.keys(stubs);
  const fn = new Function(...names, src + '\n' + tl + '\nreturn bResolve;')(...names.map((n) => stubs[n]));
  return { bResolve: fn, calls };
}

test('P7-4：通常マス（何も起きないマス）で何も起きない', async () => {
  const P = loadP7();
  const S = farmSave(P, { board: { ch: 1, node: 'x' }, g: 500 });
  S.chap.status = 'board';
  const before = JSON.stringify(S);
  const { bResolve, calls } = loadBResolve(P, S, 'normal');
  await bResolve('x');
  assert.equal(JSON.stringify(S), before, '能力・お金・疲労・位置などが一切変化しない');
  assert.deepEqual(calls.board, [undefined], 'メッセージなしでボードへ戻るだけ');
  assert.deepEqual(calls.other, [], 'イベント・バトル・大会・修行は起動しない');
  assert.equal(P.isNothingSquare('normal'), true);
  assert.equal(P.isNothingSquare('power'), false);
});

test('P7-4b：旧「修行マス」から旧修行（師匠バトル）へは到達できない', async () => {
  const P = loadP7();
  const S = farmSave(P, { board: { ch: 1, node: 'x' } });
  const before = JSON.stringify(S);
  const { bResolve, calls } = loadBResolve(P, S, 'train');
  await bResolve('x');
  assert.deepEqual(calls.other, [], 'bTrainPrompt（旧修行選択）を呼ばない');
  assert.equal(JSON.stringify(S), before);
  const dscrS = cut(HTML, ' else if(id=="s"){', '\n');
  assert.doesNotMatch(dscrS, /fight\(/, 'ファームの修行タブから師匠バトルへ行かない');
  assert.match(dscrS, /p7TrainMenu\(\)/);
});

test('P7-5：Chapterクリア後は次Chapterへ直行せず、ファームへ戻る', () => {
  const P = loadP7();
  const S = farmSave(P);
  P.registerChapterBoard(1, { nodes: { s: { type: 'start' }, g: { type: 'tournament' } }, conn: { s: ['g'] }, start: 's', goal: 'g' });
  assert.equal(P.departChapter(S, 1).ok, true);
  assert.equal(S.chap.status, 'board');
  S.board.node = 'g'; S.board.pending = 'tournament';
  // index.html の after 拡張（章末大会の勝敗処理）を実物のまま実行する
  const src = cut(HTML, 'const _origAfter=after;', '\n/* fight()呼び出し前');
  const calls = { hall: [], board: [], orig: [] };
  const stubs = { S, MMP7: P, save: () => {}, bState: () => S.board, p7Note: '',
    board: (m) => calls.board.push(m), hall: (t, m) => calls.hall.push([t, m]) };
  const names = Object.keys(stubs);
  const run = new Function('after', ...names, 'let _res;' + src.replace('after=function', '_res=function') + '\nreturn _res;');
  const after = run((t) => calls.orig.push(t), ...names.map((n) => stubs[n]));
  after('勝利！ 賞金 100G を獲得！');
  assert.equal(S.chap.status, 'farm', 'ファーム帰還状態');
  assert.deepEqual(S.chap.cleared, [1]);
  assert.equal(P.nextChapterNo(S), 2, '次に出発できるのはChapter 2');
  assert.equal(calls.board.length, 0, '次Chapterのボードへ直行しない');
  assert.equal(calls.hall.length, 1);
  assert.equal(calls.hall[0][0], 't', 'ファームの育成ボードタブへ戻る');
  assert.ok(!S.board.pending, '章末大会の保留フラグが残らない');
  // Chapter 2 は未登録（マップ準備中）なので出発できない
  assert.deepEqual(P.canDepart(S, 2), { ok: false, reason: 'no_map' });
});

test('P7-5b：Chapter出発はファームから・次Chapterのみ・修行中は不可', () => {
  const P = loadP7();
  P.registerChapterBoard(1, { nodes: { s: { type: 'start' } }, conn: {}, start: 's' });
  const S = farmSave(P);
  assert.equal(P.canDepart(S, 2).reason, 'not_next');
  S.trainRun = { kind: 'po', pos: 0 };
  assert.equal(P.canDepart(S, 1).reason, 'training');
  S.trainRun = null;
  assert.equal(P.departChapter(S, 1).ok, true);
  assert.equal(S.board.node, 's');
  assert.equal(P.canDepart(S, 1).reason, 'not_at_farm', 'Chapter中は再出発できない');
});

test('P7-5c：本番のChapter登録は「旧CH1をChapter 1へ暫定登録」の1件だけ（複製なし）', () => {
  const regs = HTML.match(/MMP7\.registerChapterBoard\(/g) || [];
  assert.equal(regs.length, 1);
  assert.match(HTML, /MMP7\.registerChapterBoard\(1,CH1,\{provisional:true/);
  assert.doesNotMatch(HTML, /const CH[2-4]\s*=/, 'CH2〜4を作っていない');
});

// ---------------------------------------------------------
// 修行
// ---------------------------------------------------------
test('P7-6：修行チケット0枚では修行を開始できない', () => {
  const P = loadP7();
  const S = trainSave(P, { trainTix: 0 });
  for (const k of ['po', 'in', 'hi', 'ev']) assert.deepEqual(P.canStartTraining(S, S.m, k), { ok: false, reason: 'no_ticket' });
  assert.equal(P.startTraining(S, S.m, 'po').ok, false);
  assert.equal(S.trainRun, null);
});

test('P7-6b：本番ではチケットを配布しない（初期0・付与コードなし）', () => {
  const P = loadP7();
  assert.equal(P.newSave().trainTix, 0);
  const glue = HTML.replace(/<script src="[^"]*"><\/script>/g, '');
  assert.doesNotMatch(glue, /trainTix\s*(\+\+|\+=|=\s*[1-9])/, 'index.htmlにチケットを増やす処理がない');
});

test('P7-7：修行開始時にチケットを1枚だけ消費する', () => {
  const P = loadP7();
  const S = trainSave(P, { trainTix: 3 });
  assert.equal(P.startTraining(S, S.m, 'po').ok, true);
  assert.equal(S.trainTix, 2);
  assert.deepEqual(S.trainRun, { kind: 'po', pos: 0 });
  assert.equal(P.startTraining(S, S.m, 'in').reason, 'in_progress', '修行中に2つ目は始められない（消費もしない）');
  assert.equal(S.trainTix, 2);
});

test('P7-7b：修行はファーム滞在中のみ（Chapter中は不可）', () => {
  const P = loadP7();
  const S = trainSave(P, { trainTix: 1 });
  S.chap.status = 'board';
  assert.equal(P.canStartTraining(S, S.m, 'po').reason, 'not_at_farm');
});

test('P7-8：修行ボードは15マス（一本道・15マス目がゴール・通常マスを含む）', () => {
  const P = loadP7();
  assert.equal(P.TRAIN_LEN, 15);
  assert.equal(P.trainSquare(15), 'g');
  for (let i = 1; i < 15; i++) assert.ok(['n', 's', 'l'].includes(P.trainSquare(i)), `${i}マス目`);
  assert.equal(P.trainSquare(0), null);
  assert.equal(P.trainSquare(16), null);
  const n = P.TRAIN_TEMPLATE.filter((x) => x === 'n').length;
  const up = P.TRAIN_TEMPLATE.length - n;
  assert.ok(n > up, '何も起きないマスが能力上昇マスより多い');
  // 出目3ばかりでも15を超えず、ゴールで止まる
  const S = trainSave(P, { trainTix: 1 });
  P.startTraining(S, S.m, 'hi');
  let r; let rolls = 0;
  do { r = P.advanceTraining(S, S.m, 3, () => 0); rolls++; } while (!r.goal);
  assert.equal(S.trainRun.pos, 15);
  assert.equal(rolls, 5);
});

test('P7-9：修行ボードのサイコロは1〜3', () => {
  const P = loadP7();
  assert.equal(P.rollDice(() => 0), 1);
  assert.equal(P.rollDice(() => 0.3333), 1);
  assert.equal(P.rollDice(() => 0.34), 2);
  assert.equal(P.rollDice(() => 0.67), 3);
  assert.equal(P.rollDice(() => 0.9999), 3);
  const S = trainSave(P, { trainTix: 1 });
  P.startTraining(S, S.m, 'po');
  assert.throws(() => P.advanceTraining(S, S.m, 0));
  assert.throws(() => P.advanceTraining(S, S.m, 4));
});

test('P7-10：修行での能力上昇は「対応能力＋ライフ」だけ（しかも控えめ）', () => {
  for (const kind of ['po', 'in', 'hi', 'ev', 'de']) {
    const P = loadP7();
    const S = trainSave(P, { trainTix: 1 });
    S.m.prog.rankClr[3] = true;
    const before = { ...S.m };
    P.startTraining(S, S.m, kind);
    let r; const gains = [];
    do { r = P.advanceTraining(S, S.m, 1, () => 0.999); if (r.gain) gains.push(r.gain); } while (!r.goal); // 全マスに止まる
    for (const k of ['li', 'po', 'in', 'hi', 'ev', 'de']) {
      if (k === kind || k === 'li') continue;
      assert.equal(S.m[k], before[k], `${kind}修行で${k}が変化しない`);
    }
    assert.ok(gains.every((g) => g.key === kind || g.key === 'li'));
    const statUp = S.m[kind] - before[kind];
    assert.ok(statUp > 0 && statUp <= 10, `${kind}：全マス停止でも上昇は小さい（${statUp}）`);
    assert.ok(S.m.li - before.li > 0 && S.m.li - before.li <= 10);
  }
});

test('P7-10b：何も起きないマスでは修行中も何も起きない', () => {
  const P = loadP7();
  const S = trainSave(P, { trainTix: 1 });
  P.startTraining(S, S.m, 'po');
  const before = JSON.stringify(S.m);
  const r = P.advanceTraining(S, S.m, 1); // 1マス目は通常マス
  assert.equal(r.square, 'n');
  assert.equal(r.gain, null);
  assert.equal(JSON.stringify(S.m), before);
});

function runToGoal(P, S, kind) {
  P.startTraining(S, S.m, kind);
  let r; do { r = P.advanceTraining(S, S.m, 3, () => 0); } while (!r.goal);
}

test('P7-10c：修行ゴールで種族ごとに固定された技を覚える（ランダムではない）', () => {
  const P = loadP7();
  P.registerMoveset(0, FIXTURE_MOVESET);
  for (const [kind, id] of [['po', 110], ['in', 111], ['hi', 112], ['ev', 113]]) {
    const S = trainSave(P, { trainTix: 2 });
    runToGoal(P, S, kind);
    const f = P.finishTraining(S, S.m, () => 0.999);
    assert.equal(f.learned, id, `${kind}修行は常に${id}`);
    assert.equal(S.m.sk.filter((x) => x === id).length, 1);
    assert.equal(S.m.prog.learnSrc[id], kind);
    assert.equal(S.m.prog.train[kind], 1);
    assert.equal(S.trainRun, null);
  }
});

test('P7-10c2：対応技を既に持っている個体でも挑戦でき、重複習得せずクリア扱い（道中の上昇は受ける）', () => {
  const P = loadP7();
  P.registerMoveset(0, FIXTURE_MOVESET);
  const S = trainSave(P, { trainTix: 1 });
  S.m.sk.push(110); // 合体などで既に持っている
  assert.deepEqual(P.canStartTraining(S, S.m, 'po'), { ok: true });
  const li0 = S.m.li;
  runToGoal(P, S, 'po');
  const f = P.finishTraining(S, S.m);
  assert.equal(f.learned, null);
  assert.equal(f.reason, 'already');
  assert.equal(S.m.sk.filter((x) => x === 110).length, 1);
  assert.equal(S.m.prog.train.po, 1, 'クリア扱い');
  assert.ok(S.m.li > li0, '道中のライフ上昇は受けている');
});

test('P7-10d：技データ未登録の種族では何も覚えない（存在しない技を作らない）', () => {
  const P = loadP7();
  const S = trainSave(P, { trainTix: 1 });
  const sk0 = [...S.m.sk];
  runToGoal(P, S, 'po');
  const f = P.finishTraining(S, S.m);
  assert.equal(f.learned, null);
  assert.equal(f.reason, 'unregistered');
  assert.deepEqual(S.m.sk, sk0);
  assert.equal(S.m.prog.train.po, 1);
});

test('P7-10e：10技登録構造は 初期4・ちから1・かしこさ1・命中1・回避1・丈夫さ2 を強制する', () => {
  const P = loadP7();
  assert.deepEqual({ ...P.MOVESET_SLOTS }, { initial: 4, po: 1, in: 1, hi: 1, ev: 1, de: 2 });
  assert.throws(() => P.registerMoveset(0, { ...FIXTURE_MOVESET, initial: [1, 2, 3] }));
  assert.throws(() => P.registerMoveset(0, { ...FIXTURE_MOVESET, de: [120] }));
  assert.throws(() => P.registerMoveset(0, { ...FIXTURE_MOVESET, po: [100] }), '重複ID');
  assert.equal(P.getMoveset(0), null);
  P.registerMoveset(0, FIXTURE_MOVESET);
  assert.deepEqual([...P.getMoveset(0).de], [120, 121]);
  assert.doesNotMatch(HTML, /MMP7\.registerMoveset\(/, '本番では正式10技を登録していない');
});

test('P7-11：Bランク未クリアでは丈夫さ修行不可（現在ランクがB以上でも実績が無ければ不可）', () => {
  const P = loadP7();
  const S = trainSave(P, { trainTix: 5 });
  assert.equal(P.canStartTraining(S, S.m, 'de').reason, 'locked');
  S.m.rk = 5; // 合体などでランクだけ高い個体
  assert.equal(P.canStartTraining(S, S.m, 'de').reason, 'locked');
  P.recordRankClear(S, S.m, 2); // Cクリアでは足りない
  assert.equal(P.canStartTraining(S, S.m, 'de').reason, 'locked');
});

test('P7-12：Bランククリア後は丈夫さ修行が可能', () => {
  const P = loadP7();
  const S = trainSave(P, { trainTix: 1 });
  P.recordRankClear(S, S.m, 3);
  assert.equal(P.hasClearedRank(S.m, 3), true);
  assert.deepEqual(P.canStartTraining(S, S.m, 'de'), { ok: true });
});

test('P7-13/14/15/16：丈夫さ修行は最大2回。1回目は2技からランダム1つ、2回目は残り1つ、重複なし', () => {
  for (const [r1, first, second] of [[0, 120, 121], [0.999, 121, 120]]) {
    const P = loadP7();
    P.registerMoveset(0, FIXTURE_MOVESET);
    const S = trainSave(P, { trainTix: 5 });
    P.recordRankClear(S, S.m, 3);
    runToGoal(P, S, 'de');
    assert.equal(P.finishTraining(S, S.m, () => r1).learned, first, '1回目：2候補のうち乱数で1つ');
    runToGoal(P, S, 'de');
    assert.equal(P.finishTraining(S, S.m, () => r1).learned, second, '2回目：残った1つ（乱数に関係なく）');
    assert.equal(S.m.prog.train.de, 2);
    assert.equal(S.m.sk.filter((x) => x === 120).length, 1);
    assert.equal(S.m.sk.filter((x) => x === 121).length, 1);
    assert.equal(S.m.prog.learnSrc[120], 'de');
    assert.deepEqual(P.canStartTraining(S, S.m, 'de'), { ok: false, reason: 'max' }, '3回目は不可');
    assert.equal(S.trainTix, 3, '3回目の失敗でチケットを消費しない');
  }
});

test('P7-16b：丈夫さ技を片方すでに持っていたら、1回目でもう片方を覚える', () => {
  const P = loadP7();
  P.registerMoveset(0, FIXTURE_MOVESET);
  const S = trainSave(P, { trainTix: 2 });
  S.m.sk.push(121);
  P.recordRankClear(S, S.m, 3);
  runToGoal(P, S, 'de');
  assert.equal(P.finishTraining(S, S.m, () => 0.999).learned, 120);
});

test('P7-16c：SPECIAL_MOVESは丈夫さ技とは別概念のまま空（Phase 6どおり）', () => {
  assert.match(HTML, /const SPECIAL_MOVES=new Set\(\[\]\);/);
});

// ---------------------------------------------------------
// 合体
// ---------------------------------------------------------
function parents(P) {
  P.registerMoveset(0, FIXTURE_MOVESET);
  P.registerMoveset(1, { initial: [200, 201, 202, 203], po: [210], in: [211], hi: [212], ev: [213], de: [220, 221] });
  const a = monster(P, { sp: 0, sk: [100, 101, 102, 103, 110, 120] });
  a.prog.learnSrc = { 100: 'init', 101: 'init', 102: 'init', 103: 'init', 110: 'po', 120: 'de' };
  const b = monster(P, { sp: 1, sk: [200, 201, 202, 203, 212, 221] });
  b.prog.learnSrc = { 200: 'init', 201: 'init', 202: 'init', 203: 'init', 212: 'hi', 221: 'de' };
  return { a, b };
}

test('P7-17：通常合体で親の初期4技を継承候補にしない', () => {
  const P = loadP7();
  const { a, b } = parents(P);
  const c = P.fusionInheritCandidates(a, b, [100, 101, 102, 103]);
  for (const k of [100, 101, 102, 103, 200, 201, 202, 203]) assert.ok(!c.includes(k), `初期技${k}`);
});

test('P7-18：通常合体で必殺技（丈夫さ修行技）を継承しない', () => {
  const P = loadP7();
  const { a, b } = parents(P);
  const c = P.fusionInheritCandidates(a, b, [100, 101, 102, 103]);
  assert.ok(!c.includes(120) && !c.includes(221));
  assert.deepEqual(c.sort(), [110, 212]);
  // 旧データ（出自の記録が無い個体）でも、旧「丈夫さ修行＝必殺技」プールは除外される
  const Q = loadP7();
  Q.configureLegacy({ initialMoves: (m) => (m.sp === 0 ? [0, 1, 2, 3] : []), specialMoves: (m) => (m.sp === 0 ? [8, 9] : []) });
  const old = { sp: 0, sk: [0, 1, 2, 3, 4, 8, 9] };
  assert.deepEqual(Q.fusionInheritCandidates(old, { sp: 0, sk: [0, 1, 2, 3] }, [0, 1, 2, 3]), [4]);
});

test('P7-19：継承可能な追加技があれば、ランダムで1技だけ継承する', () => {
  const P = loadP7();
  const { a, b } = parents(P);
  assert.equal(P.pickFusionInherit(a, b, [100, 101, 102, 103], () => 0), 110);
  assert.equal(P.pickFusionInherit(a, b, [100, 101, 102, 103], () => 0.999), 212);
});

test('P7-20：継承候補がなければ存在しない技を生成しない', () => {
  const P = loadP7();
  P.registerMoveset(0, FIXTURE_MOVESET);
  const a = monster(P, { sp: 0, sk: [100, 101, 102, 103, 120] }); a.prog.learnSrc = { 120: 'de' };
  const b = monster(P, { sp: 0, sk: [100, 101, 102, 103] });
  assert.deepEqual(P.fusionInheritCandidates(a, b, [100, 101, 102, 103]), []);
  assert.equal(P.pickFusionInherit(a, b, [100, 101, 102, 103], () => 0.5), null);
});

function loadFuse(P, S, sel, rng) {
  const src = cut(HTML, 'async function fuse(){', '\nfunction tog(k)');
  const spLine = lineOf(HTML, 'const SP=');
  const ksLine = lineOf(HTML, 'const KS=');
  const mkLine = lineOf(HTML, 'function mk(sp){');
  const cnLine = lineOf(HTML, 'const cname=');
  const stubs = { S, sel, MMP7: P, IMG: [], save: () => {}, lobby: () => {}, fx: async () => {}, Math: Object.create(Math, { random: { value: rng } }) };
  const names = Object.keys(stubs);
  return new Function(...names, [spLine, ksLine, cnLine, mkLine, src, 'return fuse;'].join('\n'))(...names.map((n) => stubs[n]));
}

test('P7-21：index.htmlの合体：子は自身の初期4技＋継承1技（全継承しない）', async () => {
  const P = loadP7();
  const { a, b } = parents(P);
  a.sp = 0; b.sp = 1;
  const S = { g: 1000, m: a, box: [b] };
  await loadFuse(P, S, [0, 1], () => 0)();
  const c = S.m;
  assert.deepEqual(c.sk.slice(0, 4), [100, 101, 102, 103], '子の種族（親1）の初期4技');
  assert.equal(c.sk.length, 5, '初期4＋継承1');
  assert.ok([110, 212].includes(c.sk[4]));
  assert.equal(c.prog.learnSrc[c.sk[4]], 'inherit');
  assert.equal(c.eq.length, 6);
  assert.deepEqual(c.eq, [...c.sk, -1]);
  assert.equal(S.box.length, 0, '親2体は消える');
  assert.equal(S.g, 800);
});

test('P7-21b：index.htmlの合体：継承候補がなければ初期4技だけで誕生する', async () => {
  const P = loadP7();
  P.registerMoveset(0, FIXTURE_MOVESET);
  const a = monster(P, { sp: 0, sk: [100, 101, 102, 103] });
  const b = monster(P, { sp: 0, sk: [100, 101, 102, 103] });
  const S = { g: 1000, m: a, box: [b] };
  await loadFuse(P, S, [0, 1], () => 0.5)();
  assert.deepEqual(S.m.sk, [100, 101, 102, 103]);
  assert.deepEqual(S.m.eq, [100, 101, 102, 103, -1, -1]);
});

test('P7-21c：合体の子の種族は拡張ポイント経由（本番は未登録＝親1の種族）', () => {
  const P = loadP7();
  assert.deepEqual(P.resolveFusionSpecies({ sp: 1 }, { sp: 0 }), { sp: 1, special: false });
  P.addFusionSpeciesResolver((a, b) => (a.sp === 0 && b.sp === 1 ? { sp: 99 } : null));
  assert.deepEqual(P.resolveFusionSpecies({ sp: 0 }, { sp: 1 }), { sp: 99, special: true });
  assert.deepEqual(P.resolveFusionSpecies({ sp: 1 }, { sp: 1 }), { sp: 1, special: false });
  assert.doesNotMatch(HTML, /MMP7\.addFusionSpeciesResolver\(/, '本番では合体専用種を登録していない');
});

// ---------------------------------------------------------
// バッグ／保管庫
// ---------------------------------------------------------
test('P7-22/23：バッグ初期容量5・1枠1個（スタック不可）・容量を超えない（満杯時の扱いは未確定）', () => {
  const P = loadP7();
  const S = P.newSave();
  assert.equal(P.bagCap(S), 5);
  for (let i = 0; i < 5; i++) assert.equal(P.bagAdd(S, 'same').ok, true);
  assert.equal(S.inv.bag.length, 5, '同じアイテムでも1個1枠');
  assert.ok(S.inv.bag.every((x) => x.id === 'same' && Object.keys(x).length === 1), '個数フィールドを持たない');
  // 満杯時の正式処理は未確定：方針未決定を返すだけで状態を変えない（容量を超えて入らないことだけを確認）
  const before = JSON.stringify(S);
  assert.deepEqual(P.bagAdd(S, 'same'), { ok: false, reason: 'full', policy: 'undecided' });
  assert.equal(JSON.stringify(S), before);
  assert.equal(S.inv.bag.length, 5, '容量を超えない');
});

test('P7-24/25/26：Sランク初回クリアで6枠。再クリアでも7以上にならず、別個体でも維持される', () => {
  const P = loadP7();
  const S = farmSave(P);
  P.recordRankClear(S, S.m, 4);
  assert.equal(P.bagCap(S), 5, 'Aクリアでは増えない');
  assert.equal(P.recordRankClear(S, S.m, 5).bagUnlocked, true);
  assert.equal(P.bagCap(S), 6);
  assert.equal(P.recordRankClear(S, S.m, 5).bagUnlocked, false, '2回目は解放扱いにならない');
  for (let i = 0; i < 5; i++) P.recordRankClear(S, S.m, 5);
  assert.equal(P.bagCap(S), 6, '何度クリアしても6のまま');
  S.box.push(S.m); S.m = monster(P, { sp: 1 }); // 別個体を育成
  assert.equal(P.bagCap(S), 6);
  const reloaded = P.migrateSave(JSON.parse(JSON.stringify(S)));
  assert.equal(P.bagCap(reloaded), 6, 'セーブ／ロード後も6');
  assert.equal(P.BAG_UNLOCKED_CAP, 6);
});

test('P7-27：保管庫（ファームでのみ入れ替え・容量は未設定で将来設定可能）', () => {
  const P = loadP7();
  const S = farmSave(P);
  assert.equal(S.inv.vaultCap, null, '容量は未確定のまま（null）');
  S.inv.vault.push({ id: 'a' }, { id: 'b' });
  assert.equal(P.moveVaultToBag(S, 0).ok, true);
  assert.deepEqual(S.inv.bag, [{ id: 'a' }]);
  assert.equal(P.moveBagToVault(S, 0).ok, true);
  assert.deepEqual(S.inv.vault.map((x) => x.id), ['b', 'a']);
  S.inv.vaultCap = 2; // 将来容量が決まった場合
  S.inv.bag.push({ id: 'c' });
  assert.deepEqual(P.moveBagToVault(S, 0), { ok: false, reason: 'vault_full' });
});

test('P7-28：Chapter中は保管庫にアクセスできない（バッグ⇄保管庫・アイテム屋とも）', () => {
  const P = loadP7();
  P.registerItem({ id: 'x', name: 'テスト品', price: 10, sellPrice: 5 });
  P.setShopCatalog(['x']);
  const S = farmSave(P);
  S.inv.vault.push({ id: 'x' }); S.inv.bag.push({ id: 'x' });
  S.chap.status = 'board';
  assert.equal(P.canAccessVault(S), false);
  assert.equal(P.moveVaultToBag(S, 0).reason, 'vault_locked');
  assert.equal(P.moveBagToVault(S, 0).reason, 'vault_locked');
  assert.equal(P.shopBuy(S, 'x').reason, 'not_at_farm');
  assert.equal(P.shopSell(S, 0).reason, 'not_at_farm');
  S.chap.status = 'farm'; S.trainRun = { kind: 'po', pos: 3 };
  assert.equal(P.canAccessVault(S), false, '修行中もアクセス不可');
});

test('P7-29：出発準備（ファーム滞在中）でバッグを編集でき、容量を超えられない', () => {
  const P = loadP7();
  const S = farmSave(P);
  for (let i = 0; i < 7; i++) S.inv.vault.push({ id: 'i' + i });
  let moved = 0;
  while (P.moveVaultToBag(S, 0).ok) moved++;
  assert.equal(moved, 5);
  assert.equal(P.moveVaultToBag(S, 0).reason, 'full');
  assert.equal(S.inv.bag.length, 5);
  assert.equal(S.inv.vault.length, 2);
  S.inv.bagCapUnlocked = true;
  assert.equal(P.moveVaultToBag(S, 0).ok, true);
  assert.equal(S.inv.bag.length, 6);
});

test('P7-30：アイテム屋の基盤（購入品は保管庫へ・価格未設定は売買不可・本番は商品なし）', () => {
  const P = loadP7();
  const S = farmSave(P, { g: 100 });
  P.registerItem({ id: 'a', name: 'A', price: 30, sellPrice: 10 });
  P.registerItem({ id: 'b', name: 'B' });
  P.setShopCatalog(['a', 'b']);
  assert.equal(P.shopBuy(S, 'a').ok, true);
  assert.equal(S.g, 70);
  assert.deepEqual(S.inv.vault, [{ id: 'a' }]);
  assert.deepEqual(S.inv.bag, [], 'バッグには入らない');
  assert.equal(P.shopBuy(S, 'b').reason, 'no_price');
  assert.equal(P.shopSell(S, 0).ok, true);
  assert.equal(S.g, 80);
  const Q = loadP7();
  assert.deepEqual(Q.getShopCatalog(), []);
  assert.doesNotMatch(HTML, /MMP7\.(registerItem|setShopCatalog)\(/, '本番ではアイテム・商品を登録していない');
});

// ---------------------------------------------------------
// Phase 6 の保護対象が無変更であること
// ---------------------------------------------------------
test('P7-31：Phase 6の7枠ルーレット・fight()本体・Battle Engine接続がPhase 6完成版とバイト単位で同一', () => {
  const fightSrc = cut(HTML, 'async function fight(', '\n$("#snd").textContent');
  assert.equal(sha(fightSrc), 'd46e27f6e22851c266f03419a0e3ff03327217b64be3baa3c0813a44de0aa8f7', 'fight()（spin・act・resolveAction接続・STOP・CPU）');
  const rl = HTML.match(/const SPECIAL_MOVES=new Set\(\[\]\);[\s\S]*?const buildRouletteSlots=eq=>\{[\s\S]*?\};/)[0];
  assert.equal(sha(rl), '48c9c06726883d41f093f1123fb59f8fb19c336e03123ded8c5fa3c3ff8c66da', 'SPECIAL_MOVES・weight・FIXED_MISS・buildRouletteSlots');
  assert.equal(sha(readFileSync(path.join(ROOT, 'js/battle-bridge.js'))), 'bff08e0f356386c488daaef60b893f40d3f43161bef819a2728938b31e42ae3b');
  assert.equal(sha(readFileSync(path.join(ROOT, 'js/integration/adapter.js'))), 'f99617acb0864f0dc204732c44d21572bdd2e396f794d9ff5c99b4658c50c229');
});

test('P7-32：スマホ縦画面のバトルUI（.bt系CSS）と横長media queryがPhase 6完成版と同一', () => {
  const css = HTML.slice(HTML.indexOf('<style>'), HTML.indexOf('</style>'));
  const bt = css.split('\n').filter((l) => l.startsWith('.bt') || l.includes('.bt ')).join('\n');
  assert.equal(sha(bt), 'cca21960aa12467b3dd44e293a984455bc17492c4ec3e7c824cf1fdfe789bb83');
  let media = css.slice(css.indexOf('@media (min-width:900px) and (min-aspect-ratio:4/3)'));
  media = media.slice(0, media.indexOf('\n}\n') + 3);
  assert.equal(sha(media), '143f30ec8e87a2c59afba7546f7a55b77bfef2afc4ee3fd1583d60ca780501c7');
  const p7css = css.slice(css.indexOf('/* ===== Phase 7'));
  assert.doesNotMatch(p7css, /\.bt[\s.{]|#rl|#go|\.rl|\.rw/, 'Phase 7のCSSはバトル画面のセレクタに触れない');
});

test('P7-33：fight()は呼び出しの前後で記録するだけのラッパー（大会勝利のみ実績記録・練習試合マスは対象外）', () => {
  const P = loadP7();
  const glue = cut(HTML, 'let p7Fight=null,p7Note="";', '\n// ---- ファーム：育成ボードタブの中身');
  const S = farmSave(P, { wins: 0, board: { ch: 1, node: 'x', pending: null } });
  let chained = [];
  const fightCalls = [];
  const document = { getElementById: () => null };
  const env = new Function('S', 'MMP7', 'save', 'document', 'fight', 'after',
    'let p7Note;' + glue.replace('let p7Fight=null,p7Note="";', 'let p7Fight=null;p7Note="";') + '\nreturn {fight, after, get note(){return p7Note}};');
  const origFight = (i, t) => fightCalls.push([i, t]);
  const w = env(S, P, () => {}, document, origFight, (t) => chained.push(t));
  // 大会（腕試し）でSランク勝利
  w.fight(5); S.wins = 1; w.after('勝利！');
  assert.deepEqual(fightCalls, [[5, undefined]], '元のfightへそのまま委譲');
  assert.equal(S.m.prog.rankClr[5], true);
  assert.equal(P.bagCap(S), 6);
  assert.match(chained[0], /バッグが6枠/);
  // 練習試合（バトルマス）で勝ってもランククリア実績にしない
  S.m.prog.rankClr[3] = false; S.board.pending = 'battle';
  w.fight(3); S.wins = 2; w.after('勝利！');
  assert.equal(S.m.prog.rankClr[3], false);
  // 負けたら記録しない
  S.board.pending = null;
  w.fight(3); w.after('敗北…');
  assert.equal(S.m.prog.rankClr[3], false);
});

// ---------------------------------------------------------
// Phase 7 修正（修行回数の正式化・Chapter 1前の修行禁止・バッグ満杯時は未確定）
// ---------------------------------------------------------
test('P7-34：Chapter 1未クリアでは修行不可（チケットがあっても・5種すべて）／クリア後に解禁', () => {
  const P = loadP7();
  P.registerChapterBoard(1, { nodes: { s: { type: 'start' } }, conn: {}, start: 's' });
  const S = farmSave(P, { trainTix: 3 });
  P.recordRankClear(S, S.m, 3);
  for (const k of P.TRAIN_KINDS) assert.deepEqual(P.canStartTraining(S, S.m, k), { ok: false, reason: 'before_ch1' }, k);
  assert.equal(P.startTraining(S, S.m, 'po').ok, false);
  assert.equal(S.trainTix, 3, 'チケットを消費しない');
  // Chapter 1へ出発しても（Chapter中なので）不可
  P.departChapter(S, 1);
  assert.equal(P.canStartTraining(S, S.m, 'po').reason, 'not_at_farm');
  // Chapter 1クリア → ファーム帰還で解禁
  P.clearChapter(S, 1);
  for (const k of P.TRAIN_KINDS) assert.deepEqual(P.canStartTraining(S, S.m, k), { ok: true }, k);
});

test('P7-34b：新規ゲームの初期状態は修行不可（before_ch1）', () => {
  const P = loadP7();
  const S = P.newSave();
  S.m = monster(P);
  S.trainTix = 1;
  assert.equal(P.canStartTraining(S, S.m, 'po').reason, 'before_ch1');
});

test('P7-35：ちから・かしこさ・命中・回避は各1回まで、丈夫さは2回まで（合計6回）', () => {
  const P = loadP7();
  P.registerMoveset(0, FIXTURE_MOVESET);
  const S = trainSave(P, { trainTix: 10 });
  P.recordRankClear(S, S.m, 3);
  assert.deepEqual({ ...P.TRAIN_MAX }, { po: 1, in: 1, hi: 1, ev: 1, de: 2 });
  let done = 0;
  for (const k of ['po', 'in', 'hi', 'ev', 'de', 'de']) {
    assert.deepEqual(P.canStartTraining(S, S.m, k), { ok: true }, `${k}（${done + 1}回目）`);
    runToGoal(P, S, k); P.finishTraining(S, S.m); done++;
  }
  assert.equal(done, 6);
  for (const k of P.TRAIN_KINDS) assert.deepEqual(P.canStartTraining(S, S.m, k), { ok: false, reason: 'max' }, `${k}は再挑戦不可`);
  assert.equal(S.trainTix, 4, '再挑戦を断ったときはチケットを消費しない');
  assert.deepEqual(S.m.prog.train, { po: 1, in: 1, hi: 1, ev: 1, de: 2 });
});

test('P7-35b：技を覚えられなかった修行（既習得・技データ未登録）でもクリア済みとなり再挑戦不可', () => {
  const P = loadP7();
  const S = trainSave(P, { trainTix: 2 }); // 技データ未登録の種族
  runToGoal(P, S, 'hi');
  assert.equal(P.finishTraining(S, S.m).reason, 'unregistered');
  assert.equal(P.canStartTraining(S, S.m, 'hi').reason, 'max');
});

test('P7-36：修行回数は個体単位（別個体・合体で生まれた個体は0から）', async () => {
  const P = loadP7();
  P.registerMoveset(0, FIXTURE_MOVESET);
  P.registerMoveset(1, { initial: [200, 201, 202, 203], po: [210], in: [211], hi: [212], ev: [213], de: [220, 221] });
  const S = trainSave(P, { trainTix: 5, g: 1000 });
  runToGoal(P, S, 'po'); P.finishTraining(S, S.m);
  assert.equal(P.canStartTraining(S, S.m, 'po').reason, 'max');
  // 別個体は影響を受けない
  const other = monster(P, { sp: 1, sk: [200, 201, 202, 203] });
  assert.deepEqual(P.canStartTraining(S, other, 'po'), { ok: true });
  // 合体で生まれた個体は新しい個体として0から
  const a = S.m; const b = monster(P, { sp: 1, sk: [200, 201, 202, 203, 212] }); b.prog.learnSrc[212] = 'hi'; b.prog.train.hi = 1;
  S.box = [b];
  await loadFuse(P, S, [0, 1], () => 0)();
  assert.notEqual(S.m, a);
  assert.deepEqual(S.m.prog.train, { po: 0, in: 0, hi: 0, ev: 0, de: 0 });
  assert.deepEqual(P.canStartTraining(S, S.m, 'po'), { ok: true });
});

test('P7-37：バッグ満杯時の処理は固定されていない（将来ハンドラを差し込める）', () => {
  const P = loadP7();
  const S = P.newSave();
  for (let i = 0; i < 5; i++) P.bagAdd(S, 'i' + i);
  assert.equal(P.bagAdd(S, 'x').policy, 'undecided', '本番は方針未決定');
  // 将来、正式な処理（例：保管庫へ送る）を差し込めることの確認（テスト専用のハンドラ）
  P.setBagFullHandler((S2, item) => { S2.inv.vault.push(item); return { ok: true, sentTo: 'vault' }; });
  assert.deepEqual(P.bagAdd(S, 'x'), { ok: true, sentTo: 'vault' });
  assert.deepEqual(S.inv.vault, [{ id: 'x' }]);
  assert.equal(S.inv.bag.length, 5);
  P.setBagFullHandler(null);
  assert.equal(P.bagAdd(S, 'y').policy, 'undecided');
  assert.doesNotMatch(HTML, /MMP7\.setBagFullHandler\(|MMP7\.bagAdd\(/, '本番では満杯時処理もアイテム取得処理も接続していない');
});
