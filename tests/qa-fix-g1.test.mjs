// =========================================================
// QA 修正 G1：セーブ読み込みの堅牢化（js/phase8/raising.js の normalizeV6／migrateSave／loadFromStorage、index.html の slotLoad）
//  ・形は読めても中身が壊れたセーブで起動が止まらない（変換中の例外は「読めないデータ」と同じく原文を退避して新規）
//  ・個体でない値（S.m・S.box）、壊れた要素（バッグ・保管庫・育成記録）を外す
//  ・今のコードが作らない形の途中状態（pend・trainRun・battle）は、既存の「中断」と同じ null に戻す
//  ・所持金 S.g：数字の文字列は数値へ、数値でない・負の値は0
//  ・正しいセーブ（ゲームの処理で作ったもの）は1文字も変わらない
//  セーブversion 6・キー mr4v6・checkpoint形式は変えていない。
//  純粋ロジックは直接実行し、起動・再開は実ブラウザ（tests/e2e/harness.mjs）でも確認する。
// =========================================================
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as H from './e2e/harness.mjs';
import { loadEngine, lcg as chLcg } from './chapter-sim.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const rd = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const HTML = rd('index.html');
// 本番（index.html）と同じ順で読み込む：補正フック（素早さ・プレイヤー名）も本番と同じく通る
const SRC = ['js/phase7/progression.js', 'js/phase8/league.js', 'js/phase8/raising.js', 'js/phase10/monsters.js', 'js/phase11/player.js', 'js/phase9/chapters.js'].map(rd);
function load() {
  const w = {}; for (const s of SRC) new Function('window', s)(w);
  for (const c of w.MMP9C.CHAPTERS) w.MMP7.registerChapterBoard(c.no, c.track, { provisional: false });
  w.MMP8L.setSpeciesCount(2);
  return { P7: w.MMP7, P8: w.MMP8, LG: w.MMP8L };
}
const j = (o) => JSON.parse(JSON.stringify(o));
const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
function store(init = {}) { const s = { ...init }; return { s, getItem: (k) => (k in s ? s[k] : null), setItem: (k, v) => { s[k] = String(v); } }; }
/** 再現可能な乱数（線形合同法） */
function lcg(seed) { let x = seed >>> 0; return () => { x = (Math.imul(x, 1103515245) + 12345) >>> 0; return (x >>> 1) / 0x80000000; }; }
function mon(over = {}) {
  return { sp: 0, name: 'ソラモ', age: 0, span: 30, h: 0, rk: 0, fa: 0, st: 0, last: null, li: 100, po: 100, in: 100, hi: 100, ev: 100, de: 100,
    sk: [0, 1, 2, 3], eq: [0, 1, 2, 3, -1, -1], ...over };
}
const GAURU = { sp: 1, name: 'ガウル', li: 80, po: 110, in: 110, hi: 90, ev: 90, de: 60, sk: [10, 11, 12, 13], eq: [10, 11, 12, 13, -1, -1] };
/** 街：未育成のソラモを連れ、牧場に未育成のガウル（ゲームの処理で作った正しいセーブ） */
function town({ P7, P8 }) {
  const S = P8.newSave(); S.g = 300; S.playerName = 'テスト'; delete S.playerNamePending; S.npcFlags = { finaIntro: true, raiseIntro: true };
  S.m = P8.initIndividual(S, P7.initProgForNew(mon()));
  S.box = [P8.initIndividual(S, P7.initProgForNew(mon(GAURU)))];
  S.inv.bag.push({ id: 'a' }); S.inv.vault.push({ id: 'b' });
  return S;
}
function onBoard(M) { const S = town(M); assert.equal(M.P8.depart(S, S.m).ok, true); S.m.raise.turnsUsed = 3; return S; }
function atFarm(M) {
  const S = onBoard(M); S.m.raise.turnsUsed = 20; assert.equal(M.P8.endChapter(S, S.m).ok, true);
  S.m.raise.log.push({ ch: 2, reachedGoal: false, turnsUsed: 20, turnLimit: 20, declined: false, tour: null });
  return S;
}
function training(M) { const S = atFarm(M); S.trainTix = 2; assert.equal(M.P7.startTraining(S, S.m, 'po').ok, true); S.m.raise.trainRun.pos = 4; return S; }

// ---------------------------------------------------------
// 起動を止めない（loadFromStorage／slotLoad）
// ---------------------------------------------------------
test('QA-G1-1：変換中に例外が出るセーブでも loadFromStorage は止まらず、原文を退避して新規扱い（unreadable）', () => {
  // 守ること：以前は migrateSave の例外がそのまま起動処理（index.html の P8_LOAD）まで抜け、画面が真っ白のまま・退避も無かった
  const M = load();
  M.P8.addSaveNormalizer((S, c) => { if (!c.isNew) throw new TypeError('変換中の例外（テスト用）'); });
  const text = JSON.stringify(town(load()));
  const st = store({ mr4v6: text });
  let r; assert.doesNotThrow(() => { r = M.P8.loadFromStorage(st); });
  assert.equal(r.status, 'unreadable'); assert.equal(r.S, null); assert.equal(r.locked, false);
  assert.equal(st.s.mr4_unreadable_backup, text, '原文を退避キーへ');
  assert.equal(st.s.mr4v6, text, '元のセーブは書き換えない');
  // 旧キー（v5）でも同じ：退避して新規。新キー・版ごとの退避キーには書かない
  const v5 = j(Object.assign(M.P7.newSave(), { m: mon(), box: [] }));
  const st5 = store({ mr4: JSON.stringify(v5), mr4_unreadable_backup: 'old' });
  assert.doesNotThrow(() => { r = M.P8.loadFromStorage(st5); });
  assert.equal(r.status, 'unreadable');
  assert.equal(st5.s.mr4_unreadable_backup, 'old', '既存の退避は上書きしない');
  assert.ok(Object.keys(st5.s).some((k) => k.startsWith('mr4_unreadable_backup_') && st5.s[k] === JSON.stringify(v5)));
  assert.ok(!('mr4v6' in st5.s) && !('mr4_v5backup' in st5.s));
  assert.equal(st5.s.mr4, JSON.stringify(v5), '旧キーは書き換えない');
});

test('QA-G1-2：セーブスロットの読み込み（slotLoad）は migrateSave の例外で止まらず「読み込めません」を表示する', () => {
  // 守ること：以前はスロットの中身で migrateSave が例外を出すと、ボタンを押しても何も表示されなかった
  const line = HTML.split('\n').find((l) => l.startsWith('function slotLoad('));
  assert.match(line, /^function slotLoad\(n,b\)\{if\(p8Blocked\(\)\)return;/, '育成中の拒否（二重ガード）はそのまま');
  const mk = new Function('p8Blocked', 'sl', 'MMP8', 'savescr', 'arm', 'save', 'lobby',
    `let S='元のS',sel=[1];${line};return {run:(n,b)=>slotLoad(n,b),get S(){return S},get sel(){return sel}};`);
  const log = [];
  const env = mk(() => false, () => ({ v: 6, m: 'x' }), { migrateSave: () => { throw new TypeError('壊れたスロット'); } },
    (m) => log.push(['savescr', m]), () => true, () => log.push(['save']), (m) => log.push(['lobby', m]));
  assert.doesNotThrow(() => env.run(1, {}));
  assert.deepEqual(log, [['savescr', 'このスロットは読み込めません（この版より新しい版のデータ、または壊れたデータです）。']]);
  assert.equal(env.S, '元のS', '今の進行は変えない'); assert.deepEqual(env.sel, [1]);
  // 正しいスロットは従来どおり読み込む
  const ok = mk(() => false, () => ({ v: 6 }), { migrateSave: (d) => ({ ...d, loaded: true }) },
    (m) => log.push(['savescr', m]), () => true, () => log.push(['save']), (m) => log.push(['lobby', m]));
  ok.run(2, {});
  assert.deepEqual(ok.S, { v: 6, loaded: true }); assert.deepEqual(log.slice(1), [['save'], ['lobby', 'スロット2をロードしました！']]);
});

// ---------------------------------------------------------
// 個体でない値・壊れた要素を外す
// ---------------------------------------------------------
test('QA-G1-3：S.m・S.box の個体でない値（数値・文字列・真偽値・配列）は外して起動できる（v6）', () => {
  // 守ること：以前は ensureUids が「数値にuidを付けられない」例外を出し、起動（loadFromStorage）ごと止まっていた
  const M = load(); const base = j(town(M));
  for (const bad of ['ソラモ', 5, true, []]) {
    const raw = { ...j(base), m: bad }; const before = JSON.stringify(raw);
    const st = store({ mr4v6: before });
    let r; assert.doesNotThrow(() => { r = M.P8.loadFromStorage(st); }, `m=${JSON.stringify(bad)}`);
    assert.equal(r.status, 'ok'); assert.equal(r.S.m, null, '連れている個体は無し');
    assert.deepEqual(r.S.box.map((x) => x.uid), base.box.map((x) => x.uid), '牧場の個体はそのまま');
    assert.equal(M.P8.resumeTarget(r.S), 'town');
    M.P8.migrateSave(raw); assert.equal(JSON.stringify(raw), before, '元データは書き換えない');
  }
  const raw = { ...j(base), box: [1, 'x', null, true, [], base.box[0], { ...base.box[0], uid: 'm-other-1-1' }] };
  const S = M.P8.migrateSave(raw);
  assert.equal(S.box.length, 2, '個体（オブジェクト）だけ残す'); assert.ok(S.box.every(isObj));
  assert.equal(S.box[0].uid, base.box[0].uid); assert.equal(S.box[1].uid, 'm-other-1-1', '順番もそのまま');
  assert.equal(S.m.uid, base.m.uid);
});

test('QA-G1-4：旧セーブ（v5・v4）の S.m・S.box の個体でない値も外して移行する（元データは書き換えない）', () => {
  // 守ること：以前は MMP7.migrateSave（ensureProg）で例外になり、旧キーからの移行ごと起動が止まっていた
  const M = load();
  const v5 = j(Object.assign(M.P7.newSave(), { g: 777, m: 'x', box: ['x', 3, mon(GAURU)], chap: { status: 'farm', clearedMax: 1, cleared: [1] } }));
  const text = JSON.stringify(v5); const st = store({ mr4: text });
  let r; assert.doesNotThrow(() => { r = M.P8.loadFromStorage(st); });
  assert.equal(r.status, 'migrated'); assert.equal(r.S.v, 6); assert.equal(r.S.migratedFrom, 5);
  assert.equal(r.S.m, null); assert.equal(r.S.box.length, 1); assert.equal(r.S.box[0].name, 'ガウル'); assert.equal(r.S.box[0].raise.state, 'none');
  assert.equal(r.S.g, 777);
  assert.equal(st.s.mr4_v5backup, text, 'v5原文を退避'); assert.equal(st.s.mr4, text, '旧キーは書き換えない');
  const v4 = { v: 4, y: 1001, mo: 7, wk: 2, g: 1234, cnt: 3, wins: 5, br: 3, m: 'ソラモ', box: [null, mon({ ...GAURU, rk: 1 }), [1]], board: { ch: 1, node: 'm7', done: false } };
  const before = JSON.stringify(v4);
  const S4 = M.P8.migrateSave(v4);
  assert.equal(JSON.stringify(v4), before, '元データは書き換えない');
  assert.equal(S4.migratedFrom, 4); assert.equal(S4.m, null); assert.equal(S4.box.length, 1);
  assert.deepEqual(S4.box[0].prog.rankClr, [true, false, false, false, false, false], '残した個体の移行（旧rk→実績）は従来どおり');
});

test('QA-G1-5：バッグ・保管庫・育成記録（raise.log）の壊れた要素（null・数値など）は外す（正しい要素は順番もそのまま）', () => {
  // 守ること：以前は null がそのまま残り、受け取るタブ・持ち物画面・育成完了画面が「null の id／ch を読めない」で止まっていた
  const M = load(); const S0 = atFarm(M);
  const raw = j(S0);
  raw.inv.bag = [null, { id: 'a' }, 1, 'x', [], { id: 'c' }];
  raw.inv.vault = [{ id: 'b' }, null];
  raw.m.raise.log = [null, raw.m.raise.log[0], 7, 'x', raw.m.raise.log[1]];
  raw.box[0].raise.log = [null];
  const S = M.P8.migrateSave(raw);
  assert.deepEqual(S.inv.bag, [{ id: 'a' }, { id: 'c' }]);
  assert.deepEqual(S.inv.vault, [{ id: 'b' }]);
  assert.deepEqual(S.m.raise.log, j(S0.m.raise.log), '育成記録の正しい要素はそのまま');
  assert.deepEqual(S.box[0].raise.log, []);
  assert.equal(M.P7.hasEndedChapter(S.m, 1), true);
});

// ---------------------------------------------------------
// 再開できなくなる途中状態
// ---------------------------------------------------------
test('QA-G1-6：再開できなくなる途中状態（pend・trainRun・battle）は、既存の「中断」と同じ null に戻す', () => {
  // 守ること：以前は分岐待ちに opts が無い・修行の種類が不明・戦闘の snap が無いセーブで、開始画面から先へ進めなかった（再読み込みしても同じ）
  const M = load(); const { P8 } = M;
  const board = j(onBoard(M));
  const badPend = [{ stage: 'branch' }, { stage: 'branch', left: 1, opts: 'a' }, { stage: 'branch', opts: ['a'] }, { stage: 'zzz' }, 'x', 5, [],
    { stage: 'move' }, { stage: 'move', left: '2', roll: 2 }, { roll: 2, left: 1 }];
  for (const pend of badPend) {
    const raw = j(board); raw.m.raise.pend = pend;
    const S = P8.migrateSave(raw), r = S.m.raise;
    assert.equal(r.pend, null, `pend=${JSON.stringify(pend)}`);
    assert.equal(r.turnsUsed, 3, '使ったターンはそのまま（振り直しにはならない）');
    assert.equal(P8.boardPhase(S.m), 'roll'); assert.equal(P8.canRoll(S.m), true);
  }
  const farm = j(training(M));
  for (const trainRun of [{ kind: 'zz', pos: 3 }, { kind: 'po', pos: 99 }, { kind: 'po', pos: -1 }, { kind: 'po', pos: 1.5 }, { kind: 'po' }, 'x', 1, []]) {
    const raw = j(farm); raw.m.raise.trainRun = trainRun;
    const S = P8.migrateSave(raw);
    assert.equal(S.m.raise.trainRun, null, `trainRun=${JSON.stringify(trainRun)}`);
    assert.equal(P8.resumeTarget(S), 'farm', 'Chapter間ファームから再開');
    assert.equal(S.trainTix, 1, '消費済みのチケットは戻さない（v5の読み込みと同じ）');
  }
  const bsq = j(onBoard(M)); bsq.m.raise.pend = { roll: 1, left: 0, stage: 'battle', fx: { kind: 'battle' } };
  for (const battle of [{ kind: 'practice', done: true }, { kind: 'practice', done: true, snap: 'x' }, { kind: 'constructor', done: true, snap: {} }, { kind: 'zz', snap: {} }, 'x', 1, []]) {
    const raw = j(bsq); raw.m.raise.battle = battle;
    const S = P8.migrateSave(raw);
    assert.equal(S.m.raise.battle, null, `battle=${JSON.stringify(battle)}`);
    assert.equal(P8.boardPhase(S.m), 'battle', 'バトルマスの選択（挑戦・やめる）からやり直せる');
    assert.doesNotThrow(() => P8.finishBattle(S, S.m));
  }
});

test('QA-G1-7：正しい途中状態はそのまま（ゲームの処理で作った各局面のセーブを読み直しても1文字も変わらない）', () => {
  // 守ること：読み込み時の補正が、正しいセーブ（移動中・分岐待ち・マス処理・練習試合・大会・修行など）を書き換えないこと
  const M = load(); const { P7, P8 } = M;
  const seen = new Set();
  const check = (label, S) => {
    const t = JSON.stringify(S), back = P8.migrateSave(JSON.parse(t));
    assert.equal(JSON.stringify(back), t, label);
    const m = S.m; if (m && m.raise) seen.add(P8.boardPhase(m) + (m.raise.battle ? '+battle' : '') + (m.raise.trainRun ? '+train' : ''));
  };
  const S = town(M), m = S.m, rnd = lcg(11), dice = () => 0.99;   // 出目は常に3（20ターン内にゴールする）
  check('town', S);
  P8.depart(S, m); check('depart', S);
  let practiced = 0;
  for (let i = 0; i < 400 && !m.raise.goal && P8.turnsLeft(m) > 0; i++) {
    const ph = P8.boardPhase(m);
    if (ph === 'roll') P8.roll(S, m, dice);
    else if (ph === 'move') P8.step(S, m);
    else if (ph === 'branch') P8.chooseBranch(S, m, m.raise.pend.opts[i % m.raise.pend.opts.length]);
    else if (ph === 'resolve') P8.resolveLanding(S, m, rnd);
    else if (ph === 'battle') {
      if (practiced++ < 2) {
        assert.equal(P8.beginBattle(S, m, { kind: 'practice', rank: P8.practiceRank(m) }).ok, true); check('practice-begin', S);
        S.g += 40; S.wins = (S.wins || 0) + 1; P8.markBattleDone(S); check('practice-done', S);   // 旧fight()の報酬（finishBattleで戻る）
        P8.finishBattle(S, m, rnd);
      } else P8.skipBattleSquare(S, m);
    }
    check(`board:${ph}:${i}`, S);
  }
  assert.equal(m.raise.goal, true, 'ゴールに着く');
  assert.equal(P8.startTournament(S, m, 0, 42).ok, true); check('tour-start', S);
  for (let k = 0; k < 20 && P8.tourNext(m); k++) {
    assert.equal(P8.beginBattle(S, m, { kind: 'league', rank: 0 }).ok, true); check('league-begin', S);
    S.wins = (S.wins || 0) + 1; P8.markBattleDone(S); check('league-done', S);
    P8.finishBattle(S, m, rnd); check('league-finish', S);
  }
  assert.equal(m.raise.tour.status, 'settled');
  assert.equal(P8.endChapter(S, m).ok, true); check('farm', S);
  S.trainTix = Math.max(S.trainTix, 1);
  assert.equal(P7.startTraining(S, m, 'po').ok, true); check('train-start', S);
  while (m.raise.trainRun.pos < P7.TRAIN_LEN) { P7.advanceTraining(S, m, 3, rnd); check('train', S); }
  P7.finishTraining(S, m, rnd); check('train-finish', S);
  for (const k of ['roll', 'move', 'branch', 'resolve', 'battle', 'battle+battle', 'tour+battle', 'tour_done', 'roll+train'])
    assert.ok(seen.has(k), `局面 ${k} を確認した（${[...seen].join(',')}）`);
  // 旧セーブからの移行結果も、もう一度読み込んで変わらない
  const v5 = j(Object.assign(P7.newSave(), { m: mon(), box: [mon(GAURU)], chap: { status: 'farm', clearedMax: 1, cleared: [1] }, trainRun: { kind: 'in', pos: 3 } }));
  check('from-v5', P8.migrateSave(v5));
});

// ---------------------------------------------------------
// 所持金
// ---------------------------------------------------------
test('QA-G1-8：所持金 S.g：数字の文字列は数値へ、数値でない・負の値は0、0以上の数値はそのまま', () => {
  // 守ること：以前は "1000" のままで、収入が文字列連結（"1000"+50→"100050"）になり、"abc" では購入の所持金チェックをすり抜けていた
  const M = load(); const base = j(town(M));
  const cases = [['1000', 1000], [' 250 ', 250], ['12.5', 12.5], ['abc', 0], ['', 0], ['-50', 0], [null, 0], [undefined, 0], [[1], 0], [{}, 0], [true, 0],
    [-50, 0], [0, 0], [12.5, 12.5], [300, 300], [99999999, 99999999]];
  for (const [g, want] of cases) {
    const raw = j(base); if (g === undefined) delete raw.g; else raw.g = g;
    const S = M.P8.migrateSave(raw);
    assert.equal(S.g, want, `g=${JSON.stringify(g)}`);
  }
  assert.equal(M.P8.migrateSave({ ...j(base), g: NaN }).g, 0);
  assert.equal(M.P8.migrateSave({ ...j(base), g: Infinity }).g, 0);
  const v5 = j(Object.assign(M.P7.newSave(), { g: '777', m: mon(), box: [] }));
  assert.equal(M.P8.migrateSave(v5).g, 777, '旧セーブ（v5）も同じ');
});

// ---------------------------------------------------------
// ファズ（決まった乱数で壊したセーブ）
// ---------------------------------------------------------
test('QA-G1-9：ランダムに壊したセーブ（決まった乱数のファズ）でも例外を出さず、読み込み結果は画面が前提にする形になる', () => {
  // 守ること：どんな値が入っていても migrateSave／loadFromStorage が例外を出さないこと（以前は数値・文字列の個体で例外）
  const M = load(); const { P7, P8 } = M;
  const rnd = lcg(20260928), pick = (a) => a[Math.floor(rnd() * a.length)];
  const JUNK = [undefined, null, 0, 1, -1, 99, -5.5, '', 'x', '5', 'board', 'move', 'branch', 'po', true, false, [], [1], ['x'], [null], {}, { a: 1 }, { stage: 'move' }, [{}]];
  const tour = (() => { const S = onBoard(M); const r = S.m.raise, trk = P8.trackOf(1); r.node = trk.goal; r.goal = true; P8.startTournament(S, S.m, 0, 7); return S; })();
  const branch = (() => { const S = onBoard(M); S.m.raise.pend = { roll: 3, left: 2, stage: 'branch', opts: ['a', 'b'] }; return S; })();
  const V4 = { v: 4, y: 1001, mo: 7, wk: 2, g: 1234, cnt: 3, wins: 5, br: 3, m: mon({ rk: 4 }), box: [mon({ ...GAURU, rk: 1 })], board: { ch: 2, node: 'm7', done: false } };
  const V5 = Object.assign(P7.newSave(), { m: mon(), box: [mon(GAURU)], chap: { status: 'board', clearedMax: 0, cleared: [] }, trainRun: { kind: 'in', pos: 3 } });
  const bases = { town: j(town(M)), branch: j(branch), training: j(training(M)), tour: j(tour), v5: j(V5), v4: j(V4) };
  const paths = (o, pre = []) => { const out = []; if (o && typeof o === 'object') for (const k of Object.keys(o)) { out.push([...pre, k]); if (k !== 'league') out.push(...paths(o[k], [...pre, k])); } return out; };
  const setPath = (o, p, v) => { let x = o; for (let i = 0; i < p.length - 1; i++) x = x[p[i]]; if (v === undefined) delete x[p[p.length - 1]]; else x[p[p.length - 1]] = v; };
  const validPend = (p) => p === null || (isObj(p) && ['move', 'branch', 'resolve', 'battle'].includes(p.stage));
  let n = 0;
  const one = (label, raw) => {
    n++;
    const text = JSON.stringify(raw);
    let S; assert.doesNotThrow(() => { S = P8.migrateSave(JSON.parse(text)); }, label);
    let r; assert.doesNotThrow(() => { r = P8.loadFromStorage(store({ [raw.v === 6 ? 'mr4v6' : 'mr4']: text })); }, label);
    if (!S) { assert.ok(r.status === 'unreadable' || r.status === 'locked', label); return; }
    assert.ok(S.m === null || S.m === undefined || isObj(S.m), label + '：S.m');
    assert.ok(S.box.every(isObj) && S.inv.bag.every(isObj) && S.inv.vault.every(isObj), label + '：box・bag・vault');
    assert.ok(Number.isFinite(S.g) && S.g >= 0, label + '：g');
    for (const x of [S.m, ...S.box].filter(Boolean)) {
      const q = x.raise;
      assert.ok(q.log.every(isObj) && validPend(q.pend), label + '：log・pend');
      assert.ok(q.trainRun === null || (P7.TRAIN_KINDS.includes(q.trainRun.kind) && Number.isInteger(q.trainRun.pos)), label + '：trainRun');
      assert.ok(q.battle === null || isObj(q.battle.snap), label + '：battle');
    }
    assert.doesNotThrow(() => P8.resumeTarget(S), label);
    // もう一度読み込んでも例外なし・読めるまま
    let again; assert.doesNotThrow(() => { again = P8.migrateSave(j(S)); }, label + '：再読み込み');
    assert.ok(again, label + '：再読み込み');
  };
  const JL = [undefined, null, 0, 1, '', 'x', '5', true, [], [1], ['x'], [null], {}];
  for (const [bn, base] of Object.entries(bases)) {
    for (const p of paths(base)) for (const v of JL) { const o = j(base); setPath(o, p, v); one(`${bn}:${p.join('.')}=${JSON.stringify(v)}`, o); }
    for (let i = 0; i < 300; i++) {
      const o = j(base), lab = [];
      for (let k = 1 + Math.floor(rnd() * 4); k > 0; k--) { const pp = paths(o); if (!pp.length) break; const p = pick(pp), v = pick(JUNK); setPath(o, p, v && typeof v === 'object' ? j(v) : v); /* 値はコピーして入れる（同じ配列を2か所に入れて自分自身を含む形にしない） */ lab.push(`${p.join('.')}=${JSON.stringify(v)}`); }
      one(`${bn}:rand:${lab.join(',')}`, o);
    }
  }
  for (const t of [{ v: 6 }, { v: 6, m: 1 }, { v: 6, box: [1] }, { v: 6, m: true, box: ['x'] }, { v: 5, box: [1] }, { v: 5, m: 'x' }, { v: 4, m: 'x' }, { v: 6, inv: { bag: 'x' } }, { v: 6, box: [[]] }]) one(JSON.stringify(t), t);
  assert.ok(n > 3000, `${n}件`);
});

// ---------------------------------------------------------
// 実ブラウザ：起動・再開（index.html 全体）
// ---------------------------------------------------------
let L = null;
before(async () => { if (!H.skipReason()) L = await H.launch(); });
after(async () => { if (L) await L.close(); });
/** 開始画面の「はじめる」を押して、復帰先の画面が出るまで待つ */
async function start(p, sel) {
  await p.page.waitForSelector('[onclick*="startGame"]', { timeout: 30000 });
  await p.page.click('[onclick*="startGame"]');
  await p.page.waitForSelector(sel, { timeout: 30000 });
}

test('QA-G1-B1：S.m が文字列・牧場に数値や null が入ったセーブでも起動でき、開始画面から街へ進める', { skip: H.skipReason() }, async () => {
  // 守ること：以前は起動時の例外で S が作られず、開始画面も出ない真っ白な画面のままだった（再読み込みしても同じ）
  const M = load(); const base = j(town(M));
  const raw = { ...base, m: 'ソラモ', box: [1, null, base.box[0]], g: '450' };
  const p = await L.open({ raw: { mr4v6: JSON.stringify(raw) } });
  await start(p, '#app .map');
  const S = await H.getS(p.page);
  assert.equal(S.m, null); assert.equal(S.box.length, 1); assert.equal(S.box[0].uid, base.box[0].uid); assert.equal(S.g, 450);
  // 所持金は街ではなくプロフィールに出す（2026-09-29 の街UI変更）。文字列の '450' が数値 450 として表示されること
  await p.page.click('.tbar .hz[onclick="profileScr()"]');
  await p.page.waitForSelector('.pfds .pfrow dd');
  assert.equal(await p.page.evaluate(() => document.querySelector('.pfds .pfrow dd').innerText.replace(/\s+/g, '')), '450G', 'プロフィールの所持金');
  await p.page.evaluate(() => farm('', 'b'));   // 牧場の「受け取る」タブ（以前は null の個体で止まった）
  await p.page.waitForFunction(() => /受け取る/.test(document.body.innerText));
  assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
});

/** Chapter 1（Chapterフィールド）の途中：実物のエンジンで配置を作り、w1_3・3ターン使用にする（assign で地点の種類を上書き） */
function onField(M, assign = {}) {
  const S = town(M), E = loadEngine(); assert.equal(M.P8.depart(S, S.m).ok, true);
  E.CH.initRun(S.m, E.CH.getConfig(1, 'A'), chLcg(5), 516106998);
  Object.assign(S.m.raise.field.nodeAssignments, assign);
  Object.assign(S.m.raise, { node: 'w1_3', turnsUsed: 3, turnLimit: 30, fatigue: 20 });
  return S;
}
/** 従来のボード（Chapter 2）の途中 */
function onBoard2(M) { const S = onBoard(M); Object.assign(S.m.raise, { ch: 3, node: 'S', log: [{ ch: 1, reachedGoal: true, turnsUsed: 14, turnLimit: 30, declined: true, tour: null }, { ch: 2, reachedGoal: true, turnsUsed: 16, turnLimit: 30, declined: true, tour: null }] }); return S; }   // 2026-10-01：Chapter 2 もエンジンになったため、従来のボードは Chapter 3 で確認する

test('QA-G1-B2：分岐待ち（pend）が壊れたChapter途中のセーブでも再開でき、サイコロを振れる（従来のボード・Chapterフィールドとも）', { skip: H.skipReason() }, async () => {
  // 守ること：以前は p9BranchHtml が opts を読めず、開始画面から先へ進めなかった
  const M = load();
  for (const [label, S0, sel] of [['Chapter 3（従来のボード）', j(onBoard2(M)), '.p9board #brollbtn'], ['Chapter 1（Chapterフィールド）', j(onField(M)), '#chf-ui #brollbtn']]) {
    S0.m.raise.pend = { stage: 'branch' };
    const p = await L.open({ save: S0 });
    await start(p, sel);
    const S = await H.getS(p.page);
    assert.equal(S.m.raise.pend, null, label); assert.equal(S.m.raise.turnsUsed, 3, label);
    assert.equal(await p.page.evaluate(() => !document.querySelector('#brollbtn').disabled), true, `${label}：サイコロを振れる`);
    assert.deepEqual(p.errors, []);
  }
});

test('QA-G1-B3：修行の種類が壊れたセーブでも再開でき、Chapter間ファームが開く', { skip: H.skipReason() }, async () => {
  // 守ること：以前は trScr が修行場の情報を読めず（null.accent）、開始画面から先へ進めなかった
  const M = load(); const S0 = j(training(M)); S0.m.raise.trainRun = { kind: 'zz', pos: 3 };
  const p = await L.open({ save: S0 });
  await start(p, '#app .p9farm');
  const S = await H.getS(p.page);
  assert.equal(S.m.raise.trainRun, null); assert.equal(S.m.raise.state, 'farm');
  assert.equal(await p.page.evaluate(() => MMP8.resumeTarget(S)), 'farm');
  assert.deepEqual(p.errors, []);
});

test('QA-G1-B4：戦闘前状態（battle）の snap が無いセーブでも再開でき、バトルマスの選択に戻る（従来のボード・Chapterフィールドとも）', { skip: H.skipReason() }, async () => {
  // 守ること：以前は finishBattle が snap.wins を読めず、開始画面から先へ進めなかった
  const M = load();
  for (const [label, S0, fx] of [['Chapter 3（従来のボード）', j(onBoard2(M)), { kind: 'battle' }], ['Chapter 1（Chapterフィールド）', j(onField(M, { f1_3: { t: 'battle', bt: 'wild' } })), { kind: 'battle', battleType: 'wild' }]]) {
    S0.m.raise.pend = { roll: 1, left: 0, stage: 'battle', fx }; S0.m.raise.battle = { kind: 'practice', done: true };
    const p = await L.open({ save: S0 });
    await start(p, '[onclick="bBattleGo()"]');
    const S = await H.getS(p.page);
    assert.equal(S.m.raise.battle, null, label); assert.equal(S.m.raise.pend.stage, 'battle', label);
    assert.deepEqual(p.errors, []);
  }
});
