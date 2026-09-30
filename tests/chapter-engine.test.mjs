// =========================================================
// Chapterフィールドエンジン（js/chapter/engine.js）と Chapter 1 Pattern A（js/chapter/configs/ch1a.js）、サイコロ（js/chapter/dice-renderer.js）
//  CH-ENGINE-01〜02・CH1-01〜24・DICE-01〜05・配置の制約・1000回のシミュレーション
//  実物の MMP7・MMP8（raising.js）・MMCH を Node で動かす（画面は tests/qa-e2e-chapter1.test.mjs）
// =========================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadEngine, simulate, lcg } from './chapter-sim.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const j = (o) => JSON.parse(JSON.stringify(o));
const fixed = (...vals) => { let i = 0; return () => vals[Math.min(i++, vals.length - 1)]; };   // 決まった乱数列（最後の値を繰り返す）
const DIE = { 1: 0.0, 2: 0.4, 3: 0.9 };   // MMP7.rollDice(rnd)=1+floor(rnd*3)
function mon(P7, P8, S) { const m = P8.initIndividual(S, { sp: 0, name: 'テスト', age: 0, span: 30, h: 0, rk: 0, fa: 0, st: 0, last: null, li: 100, po: 100, in: 100, hi: 100, ev: 100, de: 100, sk: [0, 1, 2, 3], eq: [0, 1, 2, 3, -1, -1] }); P7.ensureProg(m); return m; }
function onCh1(seed = 7) { const E = loadEngine(); const { P7, P8 } = E; const S = P8.newSave(); S.m = mon(P7, P8, S); assert.equal(P8.depart(S, S.m, lcg(seed)).ok, true); return { ...E, S, m: S.m }; }
/** 出目 v で1ターン（分岐があれば opt を選ぶ）。停止地点の処理まで */
function turn(E, v, opt) {
  const { P8, S, m } = E; const r = P8.roll(S, m, () => DIE[v]); assert.equal(r.ok, true, 'roll');
  const path = [];
  while (m.raise.pend && ['move', 'branch'].includes(m.raise.pend.stage)) {
    if (m.raise.pend.stage === 'branch') { P8.chooseBranch(S, m, m.raise.pend.opts.find((o) => o.startsWith(opt || 'a'))); path.push(m.raise.node); continue; }
    const s = P8.step(S, m); if (s.node) path.push(s.node);
  }
  return path;
}
function finishTurnAnyway(E) { const { P8, S, m } = E; if (m.raise.pend && m.raise.pend.stage === 'resolve') { const x = P8.resolveLanding(S, m, lcg(1)); if (m.raise.pend && m.raise.pend.stage === 'battle') P8.skipBattleSquare(S, m); return x; } return null; }

test('CH-ENGINE-01：config からフィールド（背景3枚）・ノード・つながり・ルートを作る。Chapter 1 は MMP8 のトラックとして登録される', () => {
  const { CH, P8 } = loadEngine(), cfg = CH.getConfig(1), g = CH.buildGraph(cfg);
  assert.equal(cfg.patternId, 'A'); assert.deepEqual(CH.patterns(1), ['A'], '今は Pattern A だけ（存在しない B・C はプレイヤーに出さない）');
  assert.deepEqual(cfg.fieldScenes.map((s) => [s.id, s.name]), [[1, '旅立ちの草原'], [2, '大橋と清流'], [3, '大会へ続く高原']]);
  assert.deepEqual(g.routes.map((r) => [r.branch, r.seq.length - 1]), [['bridge', 44], ['forest', 48]], '歩数：大橋 44・森 48');
  assert.deepEqual(g.branchAt, ['f2_3']); assert.equal(g.start, 'f1_0'); assert.equal(g.goal, 'f3_13');
  const perField = (seq) => [1, 2, 3].map((f) => seq.filter((id) => g.nodes[id].field === f).length);
  assert.deepEqual(perField(g.routes[0].seq), [14, 17, 14]); assert.deepEqual(perField(g.routes[1].seq), [14, 21, 14]);
  for (const n of Object.values(g.nodes)) { assert.ok(n.x >= 0 && n.x <= 1 && n.y >= 0 && n.y <= 1, `${n.id} は背景に対する割合`); assert.ok(n.d > 0 && n.d <= 1); }
  const t = P8.trackOf(1); assert.equal(t.start, 'f1_0'); assert.equal(t.engine, '1:A'); assert.equal(P8.isPlayable(1), true);
  assert.equal(P8.trackOf(2).engine, undefined, 'Chapter 2〜4 は従来のマップのまま（config を登録するまで）');
});

test('CH-ENGINE-02：Chapter を差し替えられる（config を登録するだけで Chapter 2 もエンジンで動く）。エンジンに Chapter 番号の分岐は無い', () => {
  const E = loadEngine(), { CH, P7, P8 } = E, c1 = CH.getConfig(1);
  const c2 = j(c1); c2.chapterId = 2; c2.patternId = 'A'; c2.title = '潮風の海岸'; c2.rules = { turnLimit: 30 };
  CH.registerConfig(c2);
  assert.equal(CH.handles(2), true); assert.equal(P8.trackOf(2).engine, '2:A');
  const S = P8.newSave(); S.m = mon(P7, P8, S); const m = S.m; P8.depart(S, m, lcg(3));
  m.raise.node = P8.trackOf(1).goal; m.raise.goal = true; P8.declineTournament(S, m);
  assert.equal(m.raise.state, 'farm'); m.raise.fatigue = 80;
  assert.equal(P8.depart(S, m, lcg(4)).ok, true);
  assert.deepEqual([m.raise.ch, m.raise.turnLimit, m.raise.field.chapterId, m.raise.fatigue], [2, 30, 2, 30], 'Chapter 2 の配置・30ターン・疲れの繰り越し');
  const code = rd('js/chapter/engine.js').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
  assert.doesNotMatch(code, /chapterId\s*===\s*\d|chapter\s*===\s*\d|ch\s*===\s*\d|\.ch\s*==\s*\d/, 'Chapter 番号での分岐を書かない');
  assert.doesNotMatch(code, /はじまりの草原|大橋|f1_|f3_/, 'Chapter 1 固有の値をエンジンに書かない');
});

test('CH1-01〜03：出目1なら1地点、出目2なら2地点、出目3なら3地点進む（瞬間移動しない）', () => {
  for (const v of [1, 2, 3]) {
    const E = onCh1(); const path = turn(E, v);
    assert.equal(path.length, v, `出目${v}`); assert.equal(E.m.raise.node, `f1_${v}`); assert.equal(E.m.raise.turnsUsed, 1);
  }
});

test('CH1-04：途中の地点を順番に通る（止まった地点だけ効果）', () => {
  const E = onCh1(); const g = E.CH.graphFor(E.m);
  const path = turn(E, 3); assert.deepEqual(path, ['f1_1', 'f1_2', 'f1_3']);
  for (let i = 1; i < path.length; i++) assert.ok(g.conn[path[i - 1]].includes(path[i]), 'つながった地点だけを通る');
  const before = j(E.m); finishTurnAnyway(E);
  for (const k of ['li', 'po', 'in', 'hi', 'ev', 'de']) if (E.m[k] !== before[k]) assert.ok(E.CH.typeAt(E.m, 'f1_3').t !== 'normal', '変化は停止地点の効果だけ');
});

test('CH1-05：移動疲れ：出目1 +3・出目2 +5・出目3 +7（出目が決まった時点で加算）', () => {
  for (const [v, add] of [[1, 3], [2, 5], [3, 7]]) {
    const E = onCh1(); E.P8.roll(E.S, E.m, () => DIE[v]);
    assert.equal(E.CH.fatigue(E.m), add); assert.equal(E.m.raise.pend.fatigueAdded, add, '停止地点の判定より前に加算済み');
  }
});

test('CH1-06：休む：1ターン消費・疲れ −30・移動なし（ライフは回復しない）', () => {
  const E = onCh1(); const { P8, S, m, CH } = E; m.raise.fatigue = 70; const li = m.li, node = m.raise.node;
  const r = P8.rest(S, m); assert.equal(r.ok, true);
  assert.deepEqual([m.raise.turnsUsed, CH.fatigue(m), m.raise.node, m.li], [1, 40, node, li]);
  m.raise.fatigue = 10; P8.rest(S, m); assert.equal(CH.fatigue(m), 0, '0未満にならない');
  m.raise.pend = { roll: 1, left: 1, stage: 'move' }; assert.equal(P8.rest(S, m).ok, false, 'ターンの途中は休めない');
});

test('CH1-07：疲れ100ならサイコロは振れない（休むだけ）。99なら振れる', () => {
  const E = onCh1(); const { P8, S, m } = E; m.raise.fatigue = 100;
  assert.equal(P8.canRoll(m), false); assert.equal(P8.roll(S, m, () => 0).ok, false); assert.equal(P8.canRest(m), true);
  P8.rest(S, m); assert.equal(P8.canRoll(m), true, '休めば振れる');
  m.raise.fatigue = 99; assert.equal(P8.canRoll(m), true); P8.roll(S, m, () => DIE[3]); assert.equal(E.CH.fatigue(m), 100, '上限100');
});

test('CH1-08：能力の結果：疲れの帯ごとの確率（1回の抽選で失敗／大成功／成功を排他的に決める）', () => {
  const { CH } = loadEngine(), cfg = CH.getConfig(1);
  const table = [[0, 0, 20], [19, 0, 20], [20, 0, 15], [39, 0, 15], [40, 10, 10], [59, 10, 10], [60, 20, 5], [79, 20, 5], [80, 30, 0], [100, 30, 0]];
  for (const [f, fail, great] of table) {
    const o = CH.statOdds(cfg, f); assert.deepEqual([o.fail, o.great], [fail, great], `疲れ${f}`);
    // 境界：抽選値（0〜100）が fail 未満→失敗、fail＋great 未満→大成功、それ以外→成功
    if (fail) assert.equal(CH.statOutcome(cfg, f, () => (fail - 0.01) / 100), 'fail');
    if (great) assert.equal(CH.statOutcome(cfg, f, () => (fail + great - 0.01) / 100), 'great');
    assert.equal(CH.statOutcome(cfg, f, () => (fail + great + 0.01) / 100), 'ok');
  }
  const r = lcg(99), cnt = { ok: 0, great: 0, fail: 0 }; for (let i = 0; i < 20000; i++) cnt[CH.statOutcome(cfg, 45, r)]++;
  assert.ok(Math.abs(cnt.fail / 20000 - 0.1) < 0.01 && Math.abs(cnt.great / 20000 - 0.1) < 0.01, JSON.stringify(cnt));
});

test('CH1-09：能力：成功 +10〜15、大成功は base×1.5（四捨五入）、失敗 +0', () => {
  const { CH } = loadEngine(), cfg = CH.getConfig(1);
  for (let base = 10; base <= 15; base++) { const r = () => (base - 10 + 0.5) / 6; assert.equal(CH.statAmount(cfg, 'ok', r), base); assert.equal(CH.statAmount(cfg, 'great', r), Math.round(base * 1.5)); }
  assert.equal(CH.statAmount(cfg, 'fail', () => 0.5), 0);
  assert.deepEqual([10, 11, 12, 13, 14, 15].map((b) => Math.round(b * 1.5)), [15, 17, 18, 20, 21, 23]);
  // 停止地点で実際に上がる（能力地点は対応能力固定）
  const E = onCh1(); const g = E.CH.graphFor(E.m), id = g.order.find((x) => E.m.raise.field.nodeAssignments[x] && E.m.raise.field.nodeAssignments[x].t === 'stat');
  const k = E.m.raise.field.nodeAssignments[id].k, b = E.m[k]; E.m.raise.node = id; E.m.raise.pend = { roll: 1, left: 0, stage: 'resolve' };
  const fx = E.P8.resolveLanding(E.S, E.m, () => 0.5).fx; assert.equal(fx.kind, 'chstat'); assert.equal(fx.key, k); assert.equal(E.m[k] - b, fx.amount);
});

test('CH1-10：配置はシードで決まり、Chapter開始時に確定して保存される（同じシード＝同じ配置）', () => {
  const { CH } = loadEngine(), cfg = CH.getConfig(1);
  const a = CH.generateLayout(cfg, 12345), b = CH.generateLayout(cfg, 12345), c = CH.generateLayout(cfg, 54321);
  assert.deepEqual(a, b); assert.notDeepEqual(a.assign, c.assign);
  const E = onCh1(11), f = E.m.raise.field;
  assert.deepEqual(CH.generateLayout(cfg, f.layoutSeed).assign, f.nodeAssignments, '保存された割り当て＝シードから作った割り当て');
  for (const k of ['chapterId', 'patternId', 'fieldId', 'layoutSeed', 'nodeAssignments', 'consumedEvents', 'openedTreasures', 'branch']) assert.ok(k in f, k);
});

test('CH1-11：再読み込み（セーブ→読み込み）・Chapter再開でも配置・位置・疲れ・ターンは引き直さない', () => {
  const E = onCh1(21); turn(E, 3); finishTurnAnyway(E); turn(E, 2);
  const saved = j(E.S), S2 = E.P8.migrateSave(saved), m2 = S2.m;
  assert.deepEqual(m2.raise.field, E.m.raise.field); assert.deepEqual([m2.raise.node, m2.raise.turnsUsed, m2.raise.fatigue, m2.raise.pend], [E.m.raise.node, E.m.raise.turnsUsed, E.m.raise.fatigue, E.m.raise.pend]);
  assert.deepEqual(E.P8.ensureBoardPosition(S2, m2), { changed: false }, 'ボードを開いても作り直さない');
  // 壊れた配置は（引き直しではなく）Chapterの開始地点から作り直す
  const bad = j(saved); bad.m.raise.field.nodeAssignments = { nope: { t: 'stat' } }; const S3 = E.P8.migrateSave(bad);
  assert.equal(S3.m.raise.field, null); E.P8.ensureBoardPosition(S3, S3.m); assert.deepEqual([S3.m.raise.node, S3.m.raise.turnsUsed], ['f1_0', 0]);
});

test('CH1-12〜13：分岐はプレイヤーが選ぶ（出目で勝手に決めない）。大橋・森のどちらも FIELD 3 の入口で合流する', () => {
  for (const [opt, first, br] of [['a', 'a0', 'bridge'], ['b', 'b0', 'forest']]) {
    const E = onCh1(); E.m.raise.node = 'f2_2'; E.m.raise.pend = null;
    E.P8.roll(E.S, E.m, () => DIE[3]); let s = E.P8.step(E.S, E.m); assert.equal(s.node, 'f2_3');
    s = E.P8.step(E.S, E.m); assert.deepEqual([s.stage, s.opts], ['branch', ['a0', 'b0']], '分岐で止まって選ばせる');
    assert.equal(E.P8.step(E.S, E.m).stage, 'branch', '選ぶまで進まない');
    const c = E.P8.chooseBranch(E.S, E.m, first); assert.equal(c.ok, true); assert.equal(E.m.raise.field.branch, br);
    const g = E.CH.graphFor(E.m), last = g.order.filter((id) => g.nodes[id].path === opt).pop();
    assert.deepEqual(g.conn[last], ['f3_0'], `${br} の終わりは FIELD 3 の入口（合流）`);
  }
});

test('CH1-14〜15：ボード上のバトルの後は疲れ +5（野生・強敵・ライバル同じ）。同じ地点・同じ配置のまま次のターンへ。途中終了・公式大会では増やさない', () => {
  for (const bt of ['wild', 'strong', 'rival']) {
    const E = onCh1(31); const { P8, S, m, CH } = E, g = CH.graphFor(m);
    const id = bt === 'wild' ? g.order.find((x) => m.raise.field.nodeAssignments[x] && m.raise.field.nodeAssignments[x].bt === 'wild') : g.order.find((x) => g.nodes[x].kind === bt);
    m.raise.node = id; m.raise.fatigue = 40; m.raise.turnsUsed = 5; m.raise.pend = { roll: 2, left: 0, stage: 'resolve' };
    const r = P8.resolveLanding(S, m, lcg(2)), fieldBefore = j(m.raise.field); assert.equal(r.fx.kind, 'battle'); assert.equal(r.fx.battleType, bt); assert.equal(m.raise.pend.stage, 'battle');
    assert.equal(P8.beginBattle(S, m, { kind: 'practice', rank: 0 }).ok, true); P8.markBattleDone(S);
    const f = P8.finishBattle(S, m); assert.equal(f.fatigueAdded, 5);
    assert.deepEqual([CH.fatigue(m), m.raise.node, m.raise.turnsUsed, m.raise.pend, P8.boardPhase(m)], [45, id, 5, null, 'roll'], bt);
    assert.deepEqual(m.raise.field, fieldBefore, '配置・分岐・開けた宝箱などはそのまま');
  }
  const E = onCh1(32); const { P8, S, m } = E; m.raise.pend = { roll: 1, left: 0, stage: 'battle', fx: { kind: 'battle' } }; m.raise.fatigue = 10;
  P8.beginBattle(S, m, { kind: 'practice', rank: 0 }); const f = P8.finishBattle(S, m); assert.equal(f.interrupted, true); assert.equal(E.CH.fatigue(m), 10, '途中終了（やり直し）では増やさない');
  assert.equal(P8.skipBattleSquare(S, m).ok, true); assert.equal(E.CH.fatigue(m), 10, 'やめておいた時も増やさない');
  assert.match(rd('js/phase8/raising.js'), /if \(b\.kind === 'practice'\) \{\n\s+const d = driverFor\(r\.ch\); if \(d && d\.onBattleFinished\)/, '疲れはボード上のバトル（practice）だけ。公式大会（league）の試合では増やさない');
});

test('CH1-16：バトル地点の絵：wild・strong・rival は asset key を分ける（今は同じ絵でも、ファイルを差し替えるだけで変えられる）', () => {
  const { CH } = loadEngine(), cfg = CH.getConfig(1), bt = cfg.battleTypes;
  assert.deepEqual(Object.keys(bt), ['wild', 'strong', 'rival']);
  assert.deepEqual([bt.wild.asset, bt.strong.asset, bt.rival.asset], ['battle_wild', 'battle_strong', 'battle_rival']);
  assert.notEqual(cfg.assets.battle_wild, cfg.assets.battle_rival, '別のファイル名');
  for (const k of ['battle_wild', 'battle_rival', 'battle_strong']) assert.ok(existsSync(path.join(ROOT, cfg.assets[k])), k);
  assert.equal(rd(cfg.assets.battle_wild).length, rd(cfg.assets.battle_rival).length, '今は同じ絵（素材の指定どおり）');
});

test('CH1-17〜18：宝箱・イベント地点は3段階（normal / rare / special）。絵と種類を分ける。開けた宝箱・使ったイベントは記録し、同じ地点で2回起きない', () => {
  const { CH } = loadEngine(), cfg = CH.getConfig(1), seen = { treasure: new Set(), event: new Set() };
  for (let s = 1; s <= 300; s++) for (const a of Object.values(CH.generateLayout(cfg, s).assign)) if (a.t === 'treasure' || a.t === 'event') { assert.ok(CH.TIERS.includes(a.tier)); seen[a.t].add(a.tier); }
  assert.deepEqual([...seen.treasure].sort(), ['normal', 'rare', 'special']); assert.deepEqual([...seen.event].sort(), ['normal', 'rare', 'special']);
  for (const t of CH.TIERS) for (const k of [`treasure_${t}`, `event_${t}`]) assert.ok(existsSync(path.join(ROOT, cfg.assets[k])), k);
  assert.equal(new Set(CH.TIERS.map((t) => cfg.assets[`treasure_${t}`])).size, 3, '宝箱の絵は3種類');
  const E = onCh1(41), g = E.CH.graphFor(E.m), A = E.m.raise.field.nodeAssignments;
  for (const t of ['treasure', 'event']) {
    const id = g.order.find((x) => A[x] && A[x].t === t); E.m.raise.node = id; E.m.raise.pend = { roll: 1, left: 0, stage: 'resolve' };
    const fx = E.P8.resolveLanding(E.S, E.m, lcg(5)).fx; assert.equal(fx.tier, A[id].tier);
    assert.ok((t === 'treasure' ? E.m.raise.field.openedTreasures : E.m.raise.field.consumedEvents).includes(id));
    E.m.raise.pend = { roll: 1, left: 0, stage: 'resolve' }; assert.equal(E.P8.resolveLanding(E.S, E.m, lcg(5)).fx.kind, 'none', '2回目は何も起きない');
  }
  // 疲れ回復イベントは Chapter 全体で 1〜3 個（どちらのルートにも1個以上）
  for (let s = 1; s <= 300; s++) { const n = Object.values(CH.generateLayout(cfg, s).assign).filter((a) => a.recovery).length; assert.ok(n >= 1 && n <= 3, `seed ${s}: ${n}`); }
});

test('配置の制約（300シード）：各ルートの数・6能力すべて・同種3連続なし・宝箱の隣接なし・序盤のバトルなし・ゴール直前のイベントなし・1背景に集中しない', () => {
  const { CH } = loadEngine(), cfg = CH.getConfig(1), g = CH.buildGraph(cfg);
  for (let s = 1; s <= 300; s++) {
    const L = CH.generateLayout(cfg, s); assert.deepEqual(CH.validateLayout(cfg, g, L.assign), [], `seed ${s}`);
    for (const rt of g.routes) {
      const f = rt.seq.map((id) => (L.assign[id] || {}).t || 'normal'), c = (t) => f.filter((x) => x === t).length;
      assert.ok(c('stat') >= 11 && c('stat') <= 13 && c('event') >= 6 && c('event') <= 8 && c('battle') >= 4 && c('battle') <= 6 && c('treasure') >= 2 && c('treasure') <= 3, `${s} ${rt.branch}`);
    }
  }
  const bad = { f1_2: { t: 'battle', bt: 'wild' } }; assert.ok(CH.validateLayout(cfg, g, bad).some((e) => /early battle/.test(e)), '違反を見つける');
});

test('CH1-19〜21：30ターン目にゴール＝成功。30ターン使い切ってゴールしていなければChapter終了（大会なし・育成失敗ではない）。出目がゴールを超えてもゴールで止まる', () => {
  const E = onCh1(51); const { P8, S, m } = E;
  m.raise.node = 'f3_12'; m.raise.turnsUsed = 29; m.raise.fatigue = 0;
  const path = turn(E, 3); assert.deepEqual(path, ['f3_13'], '3でも1地点でゴールに止まる（残りの移動は消える）');
  finishTurnAnyway(E); assert.deepEqual([m.raise.turnsUsed, m.raise.goal, P8.boardPhase(m)], [30, true, 'goal'], '30ターン目のゴールは成功');
  assert.equal(P8.canStartTournament(S, m, 0).ok, true, '公式大会へ');
  const E2 = onCh1(52); E2.m.raise.node = 'f1_5'; E2.m.raise.turnsUsed = 29; turn(E2, 1); finishTurnAnyway(E2);
  assert.equal(E2.P8.boardPhase(E2.m), 'timeup'); assert.equal(E2.P8.canRoll(E2.m), false); assert.equal(E2.P8.canRest(E2.m), false);
  const end = E2.P8.endChapter(E2.S, E2.m); assert.equal(end.ok, true); assert.equal(end.entry.reachedGoal, false); assert.equal(end.entry.tour, null);
  assert.deepEqual([E2.m.raise.state, E2.m.raise.ch], ['farm', 2], '次のChapterへ（育成失敗ではない）');
  const E3 = onCh1(53); E3.m.raise.node = 'f1_0'; E3.m.raise.turnsUsed = 29; E3.P8.rest(E3.S, E3.m); assert.equal(E3.P8.boardPhase(E3.m), 'timeup', '30ターン目に休んでも終わり');
});

test('CH1-22：次のChapterの開始時の疲れ＝max(0, 前Chapterの疲れ − 50)。大会・Chapterの終了では疲れは変わらない', () => {
  for (const [f, want] of [[80, 30], [45, 0], [100, 50], [0, 0]]) {
    const E = onCh1(61); const { P8, S, m } = E; m.raise.node = 'f3_13'; m.raise.goal = true; m.raise.fatigue = f;
    P8.declineTournament(S, m); assert.equal(m.raise.fatigue, f, 'Chapter終了時の疲れを保持'); assert.equal(m.raise.field, null, '配置はChapterごと');
    P8.depart(S, m, lcg(62)); assert.equal(m.raise.fatigue, want, `${f} → ${want}`);
  }
  const E = onCh1(63); E.m.raise.fatigue = 90; assert.equal(E.m.raise.fatigue, 90);
  const fresh = onCh1(64); assert.equal(fresh.m.raise.fatigue, 0, '育成開始（Chapter 1）は0から');
});

test('CH1-23〜24：セーブは version 6・キー mr4v6 のまま。疲れ・配置は個体の m.raise の任意項目（古いセーブは疲れ0・配置なし）', () => {
  const E = onCh1(71); assert.equal(E.P8.SAVE_VERSION, 6); assert.equal(E.P8.SAVE_KEY, 'mr4v6'); assert.equal(E.S.v, 6);
  const old = j(E.S); delete old.m.raise.fatigue; delete old.m.raise.field; const S2 = E.P8.migrateSave(old);
  assert.deepEqual([S2.v, S2.m.raise.fatigue, S2.m.raise.field], [6, 0, null]);
  const store = { d: {}, getItem(k) { return this.d[k] ?? null; }, setItem(k, v) { this.d[k] = v; } }; store.setItem('mr4v6', JSON.stringify(E.S));
  const r = E.P8.loadFromStorage(store); assert.equal(r.status, 'ok'); assert.deepEqual(r.S.m.raise.field, E.m.raise.field);
  for (const bad of [-5, 250, 'x', null]) { const o = j(E.S); o.m.raise.fatigue = bad; const x = E.P8.migrateSave(o).m.raise.fatigue; assert.ok(Number.isInteger(x) && x >= 0 && x <= 100, `${bad} → ${x}`); }
});

test('DICE-01〜05：出目は1〜3だけ（等確率）。forcedResult で固定できる。演出中はロック。1枚の画像で動き、停止画像は resultSprites に登録するだけで差し替わる', async () => {
  const w = {}; new Function('window', rd('js/phase7/progression.js'))(w); new Function('window', rd('js/chapter/dice-renderer.js'))(w); const D = w.MMCHD;
  const r = lcg(3), cnt = { 1: 0, 2: 0, 3: 0 }; for (let i = 0; i < 30000; i++) cnt[D.roll({ rnd: r })]++;
  assert.deepEqual(Object.keys(cnt), ['1', '2', '3']); for (const v of [1, 2, 3]) assert.ok(Math.abs(cnt[v] / 30000 - 1 / 3) < 0.012, JSON.stringify(cnt));
  for (const v of [1, 2, 3]) { const x = D.rollDice({ forcedResult: v }); assert.equal(x.result, v); assert.equal(await x.animationPromise, true); }
  assert.throws(() => D.rollDice({ forcedResult: 4 })); assert.equal(D.isLocked(), false);
  const c = D.configure(); assert.equal(c.rollingSprite, './assets/fields/ch1a/dice/dice_rolling.webp'); assert.ok(existsSync(path.join(ROOT, c.rollingSprite)), '正式サイコロ1枚');
  assert.deepEqual(c.resultSprites, {}, '停止画像（2・3が上）は偽造しない＝未登録'); assert.equal(D.resultSprite(2), null);
  D.configure({ resultSprites: { 1: 'a1.webp', 2: 'a2.webp', 3: 'a3.webp' } }); assert.equal(D.resultSprite(2), 'a2.webp', '登録するだけで差し替わる');
  const src = rd('js/chapter/dice-renderer.js'); assert.match(src, /translate/); assert.match(src, /rotate/); assert.doesNotMatch(src, /frames|\/01\.webp/, '連番画像を使わない');
});

test('シミュレーション（1000回）：平均22〜25ターン付近・30ターン内到達率・分岐ごとの平均・停止地点・疲れ', () => {
  const E = loadEngine();
  for (const pol of ['cautious', 'forced']) {
    const s = simulate(E, 1000, pol);
    assert.ok(s.avgTurns >= 22 && s.avgTurns <= 25.5, `${pol}：平均 ${s.avgTurns}`);
    assert.ok(s.reachRate >= 0.95, `${pol}：30ターン内到達率 ${s.reachRate}`);
    assert.ok(s.branch.bridge.avgTurns < s.branch.forest.avgTurns, '大橋のほうが少し早い');
    assert.ok(s.avgStops.stat > 4 && s.avgStops.event > 2 && s.avgStops.battle > 1.5 && s.avgStops.treasure > 0.8, JSON.stringify(s.avgStops));
  }
});
