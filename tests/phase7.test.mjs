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

const P8SRC = readFileSync(path.join(ROOT, 'js/phase8/raising.js'), 'utf8');
/** Phase 8：同じMMP7インスタンスの上にMMP8を作る */
const LGSRC = readFileSync(path.join(ROOT, 'js/phase8/league.js'), 'utf8');
function loadP8(P) { const win = { MMP7: P }; new Function('window', LGSRC)(win); new Function('window', P8SRC)(win); return win.MMP8; }
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
  // Phase 8：修行の可否は個体の育成状態で判定する（Chapter 1を終えてChapter間ファームにいる個体）
  S.m.raise = { state: 'farm', ch: 2, log: [{ ch: 1 }], trainRun: null };
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
  // Phase 7.1：Chapter2はまだ地図が無いため、途中位置(node)を引き継ぐとソフトロックする。
  // 地図を仮実装する代わりに、安全なファーム帰還状態へ退避する（後述P7-38〜40で詳細に検証）。
  assert.deepEqual(S.board, { ch: 2, node: null, done: false }, '旧ch=2・地図未実装のため途中位置は救済せずファームへ退避');
  // 新規フィールド
  assert.deepEqual(S.chap, { status: 'farm', clearedMax: 1, cleared: [1] }, '旧ch=2・地図未実装のため進行中のまま引き継がず、Chapter1クリア済みのファーム帰還状態にする');
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

test('P7-2b：（Phase 8で改訂）起動時の読み込み：v4の原文をmr4_v4backupへ退避し、v6を新キーへ書く（旧キーmr4は書き換えない）', () => {
  const P = loadP7(); const P8 = loadP8(P);
  const store = { mr4: JSON.stringify(V4_FIXTURE) };
  const st = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
  const r = P8.loadFromStorage(st);
  assert.equal(r.S.v, 6);
  assert.equal(store.mr4_v4backup, JSON.stringify(V4_FIXTURE), 'v4原文がそのまま退避される');
  assert.equal(store.mr4, JSON.stringify(V4_FIXTURE), '旧キーは書き換えない（旧版で開いても安全）');
  assert.equal(JSON.parse(store[P8.SAVE_KEY]).v, 6);
  // 2回目の起動：新キーから読み、バックアップは上書きされない
  store.mr4 = JSON.stringify({ ...V4_FIXTURE, g: 1 });
  assert.equal(P8.loadFromStorage(st).status, 'ok');
  assert.equal(store.mr4_v4backup, JSON.stringify(V4_FIXTURE));
  assert.match(lineOf(HTML, 'const P8_LOAD='), /MMP8\.loadFromStorage\(/, 'index.htmlは起動時にMMP8.loadFromStorageを使う');
});

// ---------------------------------------------------------
// Chapter
// ---------------------------------------------------------
test('P7-3：（Phase 8で改訂）通常Chapterは20ターン制。ターン上限はChapter定義（データ）で持ち、ロジック・画面へ直書きしない', () => {
  const P = loadP7(); const P8 = loadP8(P);
  assert.equal(P8.DEFAULT_TURN_LIMIT, 20);
  for (const no of [1, 2, 3, 4]) assert.equal(P8.CHAPTER_RULES[no].turnLimit, P8.DEFAULT_TURN_LIMIT, `Chapter ${no}`);
  const code = P8SRC.replace(/\/\/.*$/gm, '');
  assert.equal((code.match(/DEFAULT_TURN_LIMIT = 20;/g) || []).length, 1, '基本ターン数の定義は1か所');
  assert.doesNotMatch(code, /turnLimit:\s*\d/, 'Chapter定義は数値を直書きせずDEFAULT_TURN_LIMITを参照');
  assert.doesNotMatch(code, /turnsUsed\s*[<>]=?\s*[1-9]/, '判定式に上限の数値を直書きしない');
  const boardCode = HTML.slice(HTML.indexOf('/* ===== 育成ボードシステム'));
  for (const l of boardCode.split('\n').filter((x) => x.includes('ターン'))) assert.doesNotMatch(l.replace(/\/\/.*$/, ''), /\b20\b/, '画面側にも20を直書きしない');
  assert.doesNotMatch(P7SRC.replace(/\/\/.*$/gm, ''), /turnLimit|maxTurns?|MAX_TURN/i, 'MMP7（Chapterの番号と名前だけ）にターン上限は置かない');
  assert.deepEqual(P.CHAPTER_DEFS.map((c) => c.name), ['はじまりの草原', '潮風の海岸', '天空の浮島', '灼熱の火山'], 'Phase 9：正式Chapter名');
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

test('P7-4：（Phase 8で改訂）何も起きないマスで何も起きない（能力・お金・イベント・戦闘すべて）', () => {
  const P = loadP7(); const P8 = loadP8(P);
  P.registerChapterBoard(1, { nodes: { s: { type: 'start' }, x: { type: 'normal' }, g: { type: 'tournament' } }, conn: { s: ['x'], x: ['g'] }, start: 's', goal: 'g' });
  const S = P8.newSave(); S.g = 500; S.m = P8.initIndividual(S, monster(P)); P8.depart(S, S.m);
  P8.roll(S, S.m, () => 0); P8.step(S, S.m);   // 出目1：何も起きないマス x に止まる
  const snap = () => JSON.stringify({ ...S, m: { ...S.m, raise: null } });
  const before = snap();
  const r = P8.resolveLanding(S, S.m, () => 0);
  assert.equal(r.fx.kind, 'none');
  assert.equal(snap(), before, '能力・お金などが一切変化しない');
  assert.equal(S.m.raise.pend, null, 'そのままターン終了（イベント・バトル・大会・修行は起動しない）');
  assert.equal(S.m.raise.battle, null);
  assert.equal(P.isNothingSquare('normal'), true);
  assert.equal(P.isNothingSquare('power'), false);
});

test('P7-4b：（Phase 8で改訂）旧「修行マス」から旧修行（師匠バトル）へは到達できない', () => {
  const P = loadP7(); const P8 = loadP8(P);
  P.registerChapterBoard(1, { nodes: { s: { type: 'start' }, t: { type: 'train' }, g: { type: 'tournament' } }, conn: { s: ['t'], t: ['g'] }, start: 's', goal: 'g' });
  const S = P8.newSave(); S.m = P8.initIndividual(S, monster(P)); P8.depart(S, S.m);
  P8.roll(S, S.m, () => 0); P8.step(S, S.m);
  const r = P8.resolveLanding(S, S.m, () => 0);
  assert.deepEqual(r.fx, { kind: 'none', note: 'old_train' }, '何も起きない（戦闘も始まらない）');
  assert.equal(S.m.raise.battle, null);
  const boardCode = cut(HTML, '/* ===== Phase 8：育成ボード', '// ---- ファーム：育成ボードタブの中身');
  assert.doesNotMatch(boardCode, /bTrainPrompt|fight\(0,/, 'ボード画面に旧修行（師匠バトル）への導線がない');
  const dscrS = cut(HTML, ' else if(id=="s"){', '\n');
  assert.match(dscrS, /p7TrainMenu\(\)/, '修行タブは新しい修行メニュー');
  assert.doesNotMatch(dscrS, /fight\(0,/);
});

test('P7-5：（Phase 8で改訂）Chapter終了後は次Chapterへ直行せず、個体がChapter間ファームへ戻る', () => {
  const P = loadP7(); const P8 = loadP8(P);
  P.registerChapterBoard(1, { nodes: { s: { type: 'start' }, g: { type: 'tournament' } }, conn: { s: ['g'] }, start: 's', goal: 'g' });
  const S = P8.newSave(); S.m = P8.initIndividual(S, monster(P));
  assert.equal(P8.depart(S, S.m).ok, true); assert.equal(S.m.raise.state, 'board');
  P8.roll(S, S.m, () => 0); P8.step(S, S.m);
  assert.equal(P8.resolveLanding(S, S.m, () => 0).goal, true);
  assert.equal(P8.endChapter(S, S.m).reason, 'tournament_pending', 'ゴール後は大会に挑戦するか辞退するまで終わらない');
  const e = P8.declineTournament(S, S.m);
  assert.equal(e.ok, true); assert.equal(e.next, 2);
  assert.equal(S.m.raise.state, 'farm', 'Chapter間ファーム'); assert.equal(S.m.raise.ch, 2, '次に出発できるのはChapter 2');
  assert.deepEqual(P8.canDepart(S, S.m), { ok: false, reason: 'no_map', key: 2 }, 'Chapter 2は未登録（マップ準備中）');
  const line = lineOf(HTML, 'function p8AfterChapterEnd(');
  assert.match(line, /hall\("t",/, '画面はファーム（hall）へ戻る');
  assert.doesNotMatch(line, /board\(/, 'ボードへ直行しない');
});

test('P7-5b：（Phase 8で改訂）Chapter出発はファーム（未育成・Chapter間）から・次Chapterのみ・修行中は不可', () => {
  const P = loadP7(); const P8 = loadP8(P);
  P.registerChapterBoard(1, { nodes: { s: { type: 'start' } }, conn: {}, start: 's' });
  const S = P8.newSave(); S.m = P8.initIndividual(S, monster(P));
  assert.equal(P8.nextChapterKey(S.m), 1, '未育成の個体が出発できるのはChapter 1だけ');
  S.m.raise.trainRun = { kind: 'po', pos: 0 };
  assert.equal(P8.canDepart(S, S.m).reason, 'training', '修行中は出発できない');
  S.m.raise.trainRun = null;
  assert.equal(P8.depart(S, S.m).ok, true);
  assert.equal(S.m.raise.node, 's', 'スタート地点から');
  assert.equal(P8.canDepart(S, S.m).reason, 'not_at_farm', 'Chapter中は再出発できない');
});

test('P7-5c：（Phase 9で改訂）本番のChapter登録は正式Chapter 1〜4の4件だけ（旧CH1の暫定登録・複製なし）', () => {
  const regs = HTML.match(/MMP7\.registerChapterBoard\(/g) || [];
  assert.equal(regs.length, 1, '登録箇所は1か所（正式データの一覧から登録）');
  assert.match(HTML, /for\(const c of MMP9C\.CHAPTERS\)MMP7\.registerChapterBoard\(c\.no,c\.track,\{provisional:false\}\);/);
  assert.doesNotMatch(HTML, /registerChapterBoard\(1,CH1/, '旧CH1は登録しない');
  assert.doesNotMatch(HTML, /const CH[2-4]\s*=/, '画面側にマップを複製しない');
});

// ---------------------------------------------------------
// 修行
// ---------------------------------------------------------
test('P7-6：修行チケット0枚では修行を開始できない', () => {
  const P = loadP7();
  const S = trainSave(P, { trainTix: 0 });
  for (const k of ['po', 'in', 'hi', 'ev']) assert.deepEqual(P.canStartTraining(S, S.m, k), { ok: false, reason: 'no_ticket' });
  assert.equal(P.startTraining(S, S.m, 'po').ok, false);
  assert.equal(P.trainRunOf(S.m), null);
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
  assert.deepEqual(P.trainRunOf(S.m), { kind: 'po', pos: 0 });
  assert.equal(P.startTraining(S, S.m, 'in').reason, 'in_progress', '修行中に2つ目は始められない（消費もしない）');
  assert.equal(S.trainTix, 2);
});

test('P7-7b：修行はファーム滞在中のみ（Chapter中は不可）', () => {
  const P = loadP7();
  const S = trainSave(P, { trainTix: 1 });
  S.m.raise.state = 'board';
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
  assert.equal(P.trainRunOf(S.m).pos, 15);
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

test('P7-10：特訓での能力上昇は「対応能力＋ライフ」だけ。専用能力マスに止まると同時に +2〜3 ずつ、元ライフマス（4・9・14）では何も起きない（5種類とも同じ。丈夫さは2回とも）', () => {
  for (const kind of ['po', 'in', 'hi', 'ev', 'de']) {
    const P = loadP7();
    const S = trainSave(P, { trainTix: 2 });
    S.m.prog.rankClr[3] = true;
    for (let round = 1; round <= (kind === 'de' ? 2 : 1); round++) {
      const before = { ...S.m };
      assert.equal(P.startTraining(S, S.m, kind).ok, true, `${kind}：${round}回目を始められる`);
      let r; const stops = [];
      do { r = P.advanceTraining(S, S.m, 1, () => 0.999); stops.push(r); } while (!r.goal); // 全マスに止まる
      for (const x of stops) {
        if (x.square === 's') {
          assert.deepEqual(x.gain, { key: kind, amount: 3 }, `${kind}：${x.to}マス目で対応能力 +3`);
          assert.deepEqual(x.lifeGain, { key: 'li', amount: 3 }, `${kind}：同じ停止でライフ +3`);
        } else {
          assert.equal(x.gain, null); assert.equal(x.lifeGain, null, `${kind}：${x.to}マス目（${x.square}）では何も上がらない`);
        }
      }
      for (const p of [4, 9, 14]) assert.equal(stops[p - 1].square, 'n', `元ライフマス ${p} は通常マス`);
      for (const k of ['li', 'po', 'in', 'hi', 'ev', 'de']) {
        if (k === kind || k === 'li') continue;
        assert.equal(S.m[k], before[k], `${kind}特訓で${k}が変化しない`);
      }
      assert.equal(S.m[kind] - before[kind], 9, `${kind}：専用能力マス3か所 ×3`);
      assert.equal(S.m.li - before.li, 9, `${kind}：ライフも専用能力マス3か所 ×3`);
      P.finishTraining(S, S.m);
    }
    assert.equal(S.m.prog.train[kind], kind === 'de' ? 2 : 1);
  }
  // 乱数0なら両方 +2（上昇量は +2〜3 のまま）
  const P = loadP7(); const S = trainSave(P, { trainTix: 1 }); P.startTraining(S, S.m, 'in');
  const r = P.advanceTraining(S, S.m, 2, () => 0);
  assert.deepEqual([r.gain, r.lifeGain], [{ key: 'in', amount: 2 }, { key: 'li', amount: 2 }]);
});

test('P7-10b：何も起きないマスでは修行中も何も起きない', () => {
  const P = loadP7();
  const S = trainSave(P, { trainTix: 1 });
  P.startTraining(S, S.m, 'po');
  // Phase 8：修行中の位置は個体（S.m.raise.trainRun）が持つため、位置以外が変わらないことを確認する
  const noPos = (m) => JSON.stringify({ ...m, raise: { ...m.raise, trainRun: null } });
  const before = noPos(S.m);
  const r = P.advanceTraining(S, S.m, 1); // 1マス目は通常マス
  assert.equal(r.square, 'n');
  assert.equal(r.gain, null);
  assert.equal(noPos(S.m), before);
  assert.equal(P.trainRunOf(S.m).pos, 1, '位置だけが進む');
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
    assert.equal(P.trainRunOf(S.m), null);
  }
});

test('P7-10c2：対応技を既に持っている個体でも挑戦でき、重複習得せずクリア扱い（道中の上昇は受ける）', () => {
  const P = loadP7();
  P.registerMoveset(0, FIXTURE_MOVESET);
  const S = trainSave(P, { trainTix: 1 });
  S.m.sk.push(110); // 合体などで既に持っている
  assert.deepEqual(P.canStartTraining(S, S.m, 'po'), { ok: true });
  const li0 = S.m.li;
  P.startTraining(S, S.m, 'po');
  P.advanceTraining(S, S.m, 2, () => 0);   // 2マス目（専用能力マス）に止まる
  let r; do { r = P.advanceTraining(S, S.m, 3, () => 0); } while (!r.goal);
  const f = P.finishTraining(S, S.m);
  assert.equal(f.learned, null);
  assert.equal(f.reason, 'already');
  assert.equal(S.m.sk.filter((x) => x === 110).length, 1);
  assert.equal(S.m.prog.train.po, 1, 'クリア扱い');
  assert.ok(S.m.li > li0, '道中の専用能力マスでライフも上がっている');
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

test('P7-11：（Phase 8で改訂）Cランク以上の大会が未クリアでは丈夫さ修行不可（E・Dのクリアや旧ランク欄では解放されない）', () => {
  const P = loadP7();
  const S = trainSave(P, { trainTix: 5 });
  S.m.rk = 5;   // 旧ランク欄が高くても実績が無ければ不可
  assert.deepEqual(P.canStartTraining(S, S.m, 'de'), { ok: false, reason: 'locked' });
  P.recordRankClear(S, S.m, 1);   // E・Dクリア
  assert.deepEqual(P.canStartTraining(S, S.m, 'de'), { ok: false, reason: 'locked' });
  assert.equal(S.trainTix, 5, 'チケットを消費しない');
  assert.equal(P.TOUGH_UNLOCK_RANK, 2, '解放条件はCランク（定数）');
});

test('P7-12：（Phase 8で改訂）Cランク以上をクリアすると丈夫さ修行が可能（上位ランクのクリアでも可）・2回制のまま', () => {
  const P = loadP7();
  const S = trainSave(P, { trainTix: 1 });
  P.recordRankClear(S, S.m, 2);
  assert.deepEqual(P.canStartTraining(S, S.m, 'de'), { ok: true });
  const T = trainSave(P, { trainTix: 1 });
  T.m.prog.rankClr[4] = true;   // Aだけの実績（下位が欠けた旧データ）でも可
  assert.deepEqual(P.canStartTraining(T, T.m, 'de'), { ok: true });
  assert.equal(P.TRAIN_MAX.de, 2, '丈夫さは2回まで');
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
  const stubs = { S, sel, MMP7: P, MMP8: loadP8(P), p8Blocked: () => false, IMG: [], save: () => {}, lobby: () => {}, fx: async () => {}, Math: Object.create(Math, { random: { value: rng } }) };
  const names = Object.keys(stubs);
  return new Function(...names, [spLine, ksLine, cnLine, mkLine, lineOf(HTML, 'function p11Esc(t){'), src, 'return fuse;'].join('\n'))(...names.map((n) => stubs[n]));
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
  S.m.raise = { state: 'board', ch: 1, log: [], trainRun: null };
  assert.equal(P.canAccessVault(S), false);
  assert.equal(P.moveVaultToBag(S, 0).reason, 'vault_locked');
  assert.equal(P.moveBagToVault(S, 0).reason, 'vault_locked');
  assert.equal(P.shopBuy(S, 'x').reason, 'not_at_farm');
  assert.equal(P.shopSell(S, 0).reason, 'not_at_farm');
  S.m.raise = { state: 'farm', ch: 2, log: [{ ch: 1 }], trainRun: { kind: 'po', pos: 3 } };
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

test('P7-33：（Phase 8で改訂）fight()は外側のラッパーで「戦闘前状態の記録」がある時だけ実行する（旧腕試し大会などの直呼びは実行しない）', () => {
  const P = loadP7(); const P8 = loadP8(P);
  const src = cut(HTML, 'const P8_FIGHT=fight;', '\nconst P8_AFTER=after;');
  const calls = [];
  const S = practiceSetup(P, P8);
  const wrap = new Function('S', 'fight', `${src}\nreturn fight;`)(S, (i, t) => calls.push([i, t]));
  wrap(3);
  assert.deepEqual(calls, [], '記録なしの呼び出しでは戦闘を始めない');
  assert.equal(P8.beginBattle(S, S.m, { kind: 'practice', rank: 0 }).ok, true);
  wrap(0);
  assert.deepEqual(calls, [[0, undefined]], '記録があれば元のfight()へそのまま委譲');
  P8.markBattleDone(S); wrap(0);
  assert.equal(calls.length, 1, '終了済みの記録では再び始めない');
});

// ---------------------------------------------------------
// Phase 7 修正（修行回数の正式化・Chapter 1前の修行禁止・バッグ満杯時は未確定）
// ---------------------------------------------------------
test('P7-34：Chapter 1終了前は修行不可（チケットがあっても・5種すべて）／その個体がChapter 1を終えると解禁', () => {
  const P = loadP7();
  const S = farmSave(P, { trainTix: 3 });
  P.recordRankClear(S, S.m, 3);
  for (const k of P.TRAIN_KINDS) assert.deepEqual(P.canStartTraining(S, S.m, k), { ok: false, reason: 'before_ch1' }, k);
  assert.equal(P.startTraining(S, S.m, 'po').ok, false);
  assert.equal(S.trainTix, 3, 'チケットを消費しない');
  // Phase 8：Chapter 1進行中（その個体がボード上）も不可
  S.m.raise = { state: 'board', ch: 1, log: [], trainRun: null };
  assert.equal(P.canStartTraining(S, S.m, 'po').reason, 'not_at_farm');
  // その個体がChapter 1を終えてChapter間ファームへ戻ると解禁
  S.m.raise = { state: 'farm', ch: 2, log: [{ ch: 1 }], trainRun: null };
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
  other.raise = { state: 'farm', ch: 2, log: [{ ch: 1 }], trainRun: null };
  assert.deepEqual(P.canStartTraining(S, other, 'po'), { ok: true });
  // 合体で生まれた個体は新しい個体として0から
  const a = S.m; const b = monster(P, { sp: 1, sk: [200, 201, 202, 203, 212] }); b.prog.learnSrc[212] = 'hi'; b.prog.train.hi = 1;
  S.box = [b];
  await loadFuse(P, S, [0, 1], () => 0)();
  assert.notEqual(S.m, a);
  assert.deepEqual(S.m.prog.train, { po: 0, in: 0, hi: 0, ev: 0, de: 0 });
  assert.equal(S.m.raise.state, 'none', 'Phase 8：合体の子は未育成の新個体');
  S.m.raise = { state: 'farm', ch: 2, log: [{ ch: 1 }], trainRun: null }; // 回数だけを検証するため、Chapter 1を終えた状態にする
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

// ---------------------------------------------------------
// Phase 7.1：バトルマス（練習試合）の報酬取り消し
//  ・fight()本体（Phase 6保護対象）は一切変更しない。
//  ・呼び出し前に保存しておいた値へ、公式大会でない場合だけその場で戻す。
// ---------------------------------------------------------
function loadBattleGlue() {
  return cut(HTML, 'let p7Fight=null,p7Note="";', '\n// ---- ファーム：育成ボードタブの中身');
}
function makeBattleEnv(S, P, origFight) {
  const document = { getElementById: () => null };
  const chained = [];
  const glue = loadBattleGlue();
  const env = new Function('S', 'MMP7', 'save', 'document', 'fight', 'after',
    'let p7Note;' + glue.replace('let p7Fight=null,p7Note="";', 'let p7Fight=null;p7Note="";') + '\nreturn {fight, after, get note(){return p7Note}};');
  const w = env(S, P, () => {}, document, origFight, (t) => chained.push(t));
  return { w, chained };
}

/** Phase 8：バトルマス（練習試合）の選択待ちまで進めたセーブ */
function practiceSetup(P, P8, over = {}) {
  P.registerChapterBoard(1, { nodes: { s: { type: 'start' }, b: { type: 'battle' }, g: { type: 'tournament' } }, conn: { s: ['b'], b: ['g'] }, start: 's', goal: 'g' });
  const S = Object.assign(P8.newSave(), over); S.m = P8.initIndividual(S, monster(P)); P8.depart(S, S.m);
  P8.roll(S, S.m, () => 0); P8.step(S, S.m); P8.resolveLanding(S, S.m, () => 0);
  return S;
}

test('P7-38：（Phase 8で改訂）練習試合に勝っても賞金・ランクアップ・S.wins/S.br・実績は残らない（戦闘前の状態へ戻す）', () => {
  const P = loadP7(); const P8 = loadP8(P);
  const S = practiceSetup(P, P8, { g: 700, wins: 0 });
  S.m.rk = 0;
  assert.equal(S.m.raise.pend.stage, 'battle');
  assert.equal(P8.beginBattle(S, S.m, { kind: 'practice', rank: 0 }).ok, true);
  // fight()本体が行う旧式の報酬付与と、終了時の印（adv()→markBattleDone）を再現
  S.g += 100; S.wins = 1; S.br = 0; S.m.rk = 1; P8.markBattleDone(S);
  const f = P8.finishBattle(S, S.m);
  assert.equal(f.won, true);
  assert.equal(S.g, 700); assert.equal(S.wins, 0); assert.equal('br' in S, false); assert.equal(S.m.rk, 0);
  assert.deepEqual(S.m.prog.rankClr, [false, false, false, false, false, false], '実績（ランククリア）も付かない');
  assert.equal(S.m.raise.pend, null, 'バトルマスの処理が終わりターン終了');
  assert.match(lineOf(HTML, 'function p8AfterBattle('), /練習試合のため/, '練習試合であることを画面に表示');
});

test('P7-39：（Phase 8で改訂）練習試合に負けても何も失わない・何も付かない', () => {
  const P = loadP7(); const P8 = loadP8(P);
  const S = practiceSetup(P, P8, { g: 700, wins: 3, br: 1 });
  S.m.rk = 2;
  P8.beginBattle(S, S.m, { kind: 'practice', rank: 2 });
  S.g += 30; P8.markBattleDone(S);   // 負け（勝利数は増えない）。旧fight()の参加賞相当の変化も戻す
  const f = P8.finishBattle(S, S.m);
  assert.equal(f.won, false);
  assert.deepEqual([S.g, S.wins, S.br, S.m.rk], [700, 3, 1, 2]);
  assert.equal(S.m.raise.pend, null);
});

test('P7-40：（Phase 8で改訂）公式大会は総当たりリーグ。個別試合の旧報酬は残らず、正式報酬は最終1位のときに大会全体で1回だけ', () => {
  const P = loadP7(); const P8 = loadP8(P);
  P.registerChapterBoard(1, { nodes: { s: { type: 'start' }, g: { type: 'tournament' } }, conn: { s: ['g'] }, start: 's', goal: 'g' });
  const S = P8.newSave(); S.g = 1000; S.wins = 0; S.m = P8.initIndividual(S, monster(P)); S.m.rk = 0;
  P8.depart(S, S.m); P8.roll(S, S.m, () => 0); P8.step(S, S.m); P8.resolveLanding(S, S.m, () => 0);
  assert.equal(P8.startTournament(S, S.m, 1, 42).ok, true);
  const n = S.m.raise.tour.league.rounds.length;
  assert.equal(n, 5, 'Dランクは6体・5試合');
  for (let i = 0; i < n; i++) {
    assert.equal(P8.beginBattle(S, S.m, { kind: 'league', rank: 1 }).ok, true);
    S.g += 200; S.wins += 1; S.br = 1; S.m.rk = 2; P8.markBattleDone(S);   // 旧fight()が付ける勝利報酬
    const f = P8.finishBattle(S, S.m, () => 0);
    if (i < n - 1) { assert.deepEqual([S.g, S.wins, S.m.rk], [1000, 0, 0], `第${i + 1}試合の旧報酬は残らない`); assert.ok(!f.settled); }
    else { assert.equal(f.settled, true); assert.equal(f.place, 1); }
  }
  assert.equal(S.g, 1200, '正式な初回賞金（D=200G）が1回だけ');
  assert.equal(S.wins, 1, '大会優勝として1回だけ記録'); assert.equal(S.br, 1);
  assert.equal(S.trainTix, 1); assert.deepEqual(S.m.prog.rankClr.slice(0, 2), [true, true]);
  assert.equal(P8.startTournament(S, S.m, 1).reason, 'already_entered', '同じChapterで2回目の大会はない');
  assert.equal(P8.endChapter(S, S.m).ok, true);
  assert.equal(S.g, 1200, 'Chapter終了で追加の付与はない（二重付与なし）');
});

// ---------------------------------------------------------
// Phase 7.1：旧v4セーブ（Chapter2〜4途中）のソフトロック救済
// ---------------------------------------------------------
function v4Fixture(chapterInProgress) {
  return {
    v: 4, y: 1002, mo: 8, wk: 3, g: 4321, cnt: 4, wins: 7, br: 4, fx1: 1,
    box: [{ sp: 1, name: 'ガウル', age: 6, span: 30, h: 10, rk: 2, fa: 20, st: 15, last: 'in',
      sk: [10, 11, 12, 13, 14], eq: [10, 11, 12, 13, 14, -1], li: 90, po: 120, in: 130, hi: 100, ev: 95, de: 70 }],
    m: { sp: 0, name: 'ソラモ', age: 8, span: 30, h: 5, rk: 4, fa: 12, st: 8, last: 'po',
      sk: [0, 1, 2, 3, 4, 5], eq: [0, 1, 2, 3, 4, 5], li: 170, po: 180, in: 140, hi: 150, ev: 120, de: 160 },
    board: { ch: chapterInProgress, node: 'm9', done: false },
  };
}
for (const ch of [2, 3, 4]) {
  test(`P7-4${ch}：旧v4 Chapter${ch}途中セーブは地図が無いため安全にファーム帰還状態へ退避される`, () => {
    const P = loadP7();
    const raw = v4Fixture(ch);
    const before = JSON.stringify(raw);
    const S = P.migrateSave(raw);
    assert.equal(JSON.stringify(raw), before, '元のv4オブジェクトは書き換えない');
    assert.equal(S.v, 5);
    assert.equal(S.chap.status, 'farm', `Chapter${ch}途中はボード進行中のまま引き継がずファームへ退避する`);
    assert.equal(S.chap.clearedMax, ch - 1, `Chapter1〜${ch - 1}はクリア済み扱いのまま`);
    assert.deepEqual(S.board, { ch, node: null, done: false }, '途中位置(node)だけを手放し、出発し直せる形にする');
  });
}

test('P7-44：ファーム退避後も個体・能力・技・所持金・ランク実績などは一切変更されない', () => {
  const P = loadP7();
  const raw = v4Fixture(3);
  const S = P.migrateSave(raw);
  for (const k of ['g', 'y', 'mo', 'wk', 'cnt', 'wins', 'br', 'fx1']) assert.equal(S[k], raw[k], k);
  assert.equal(S.m.name, raw.m.name);
  for (const k of ['li', 'po', 'in', 'hi', 'ev', 'de', 'age', 'span', 'h', 'fa', 'st', 'last', 'rk']) assert.equal(S.m[k], raw.m[k], 'm.' + k);
  assert.deepEqual(S.m.sk, raw.m.sk);
  assert.deepEqual(S.m.eq, raw.m.eq);
  assert.equal(S.box[0].name, raw.box[0].name);
  assert.deepEqual(S.box[0].sk, raw.box[0].sk);
  assert.equal(S.box[0].li, raw.box[0].li);
  assert.deepEqual(S.rankRec.cleared, [true, true, true, true, true, false], '旧br=4（Aまで勝利）は維持される');
  assert.deepEqual(S.m.prog.rankClr, [true, true, true, true, false, false], '旧rk=4 → E〜Bクリア済みは維持される');
  assert.deepEqual(S.box[0].prog.rankClr, [true, true, false, false, false, false], '旧rk=2 → E・Dクリア済みは維持される');
  // 変わるのはChapter進行状態だけ
  assert.equal(S.chap.status, 'farm');
  assert.deepEqual(S.board, { ch: 3, node: null, done: false });
});
