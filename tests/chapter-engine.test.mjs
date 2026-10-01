// =========================================================
// Chapterフィールドエンジン（js/chapter/engine.js）と Chapter 1 Pattern A（js/chapter/configs/ch1a.js）、サイコロ（js/chapter/dice-renderer.js）
//  CH-ENGINE-01〜02・CH1-01〜27・DICE-01〜06・配置の制約・1000回のシミュレーション
//  2026-10-01：Chapter 1 は「リアル巨大ボード方式」（背景15枚＋周回・サイコロ 1〜6・30ターン・ライバルは強制停止）
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
const DIE = { 1: 0.05, 2: 0.2, 3: 0.4, 4: 0.55, 5: 0.75, 6: 0.95 };   // MMP7.rollDie(6, rnd)=1+floor(rnd*6)（Chapter 1 は 6面）
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

test('CH-ENGINE-01：config からフィールド（正式背景10枚を 01→10 の順に1回ずつ。1本道）・ノード・つながり・ルートを作る。Chapter 1 は MMP8 のトラックとして登録される', () => {
  const { CH, P8 } = loadEngine(), cfg = CH.getConfig(1), g = CH.buildGraph(cfg);
  assert.equal(cfg.patternId, 'A'); assert.deepEqual(CH.patterns(1), ['A'], '今は Pattern A だけ（存在しない B・C はプレイヤーに出さない）');
  assert.equal(cfg.fieldScenes.length, 10); assert.equal(new Set(cfg.fieldScenes.map((s) => s.bg)).size, 10, '背景はどれも1回だけ');
  for (const [i, s] of cfg.fieldScenes.entries()) { assert.equal(s.bg, `./assets/fields/ch1a/field/ch1_field_${String(i + 1).padStart(2, '0')}.webp`, '01→10 の順'); assert.ok(existsSync(path.join(ROOT, s.bg)), s.bg); assert.deepEqual([s.w, s.h], [864, 1536]); assert.ok(s.road && s.road.center.length >= 8 && s.road.center.every((c) => c.length === 3), `${s.name}：道の中央線（点ごとの半幅つき）`); }
  const L = CH.routeLengths(g); assert.deepEqual([L.min, L.max, L.nodes], [59, 59, 60], '59歩（ノード60）【暫定】');
  assert.equal(g.routes.length, 1, '1本道（橋／森の分岐は廃止）'); assert.deepEqual(g.branchAt, []); assert.deepEqual(cfg.branches, []);
  assert.equal(g.start, 'f1_0'); assert.equal(g.goal, 'f10_5');
  for (const p of cfg.paths) assert.equal(p.n, 6, `${p.id}：1枚の中のマス数【暫定】`);
  assert.equal(cfg.paths.length, 10); const fields = g.routes[0].seq.map((id) => g.nodes[id].field).filter((v, i, a) => i === 0 || a[i - 1] !== v); assert.deepEqual(fields, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], '背景は 01→10 の順に1回ずつ');
  for (const n of Object.values(g.nodes)) { assert.ok(n.x >= 0 && n.x <= 1 && n.y >= 0 && n.y <= 1, `${n.id} は背景に対する割合`); assert.ok(n.d > 0 && n.d <= 1.3); }
  const kinds = {}; for (const n of Object.values(g.nodes)) if (n.kind !== 'slot' && n.kind !== 'normal') kinds[n.id] = n.kind;
  assert.deepEqual(kinds, { f1_0: 'start', f6_3: 'strong', f10_3: 'rival', f10_5: 'goal' }, '骨格：スタート・強敵（天空の大橋）・ライバル（強制停止）・ゴール（大会会場）');
  assert.equal(g.nodes.f10_3.forceStop, true); assert.equal(P8.trackOf(1).nodes.f10_3.stop, true);
  assert.deepEqual([CH.rulesOf(cfg).diceSides, CH.rulesOf(cfg).turnLimit, CH.rulesOf(cfg).onTimeUp], [6, 30, 'end'], '6面・30ターン・間に合わなければ大会なしで終了');
  const t = P8.trackOf(1); assert.equal(t.start, 'f1_0'); assert.equal(t.engine, '1:A'); assert.equal(P8.isPlayable(1), true);
  assert.equal(P8.trackOf(2).engine, '2:A', 'Chapter 2 もエンジン（ch2a.js）'); assert.equal(P8.trackOf(3).engine, undefined, 'Chapter 3〜4 は従来のマップのまま（config を登録するまで）');
});


test('CH-ENGINE-02：Chapter を差し替えられる（config を登録するだけで Chapter 3 もエンジンで動く）。エンジンに Chapter 番号の分岐は無い', () => {
  const E = loadEngine(), { CH, P7, P8 } = E, c1 = CH.getConfig(1);
  const c3 = j(c1); c3.chapterId = 3; c3.patternId = 'A'; c3.title = '大空の回廊'; c3.rules = { turnLimit: 30 };
  CH.registerConfig(c3);
  assert.equal(CH.handles(3), true); assert.equal(P8.trackOf(3).engine, '3:A');
  const S = P8.newSave(); S.m = mon(P7, P8, S); const m = S.m; P8.depart(S, m, lcg(3));
  m.raise.node = P8.trackOf(1).goal; m.raise.goal = true; P8.declineTournament(S, m);
  m.raise.node = P8.trackOf(2).goal; m.raise.ch = 2; m.raise.state = 'board'; m.raise.goal = true; P8.declineTournament(S, m);   // Chapter 2 も終えた状態
  assert.equal(m.raise.state, 'farm'); m.raise.fatigue = 80;
  assert.equal(P8.depart(S, m, lcg(4)).ok, true);
  assert.deepEqual([m.raise.ch, m.raise.turnLimit, m.raise.field.chapterId, m.raise.fatigue], [3, 30, 3, 30], 'Chapter 3 の配置・30ターン・疲れの繰り越し');
  const code = rd('js/chapter/engine.js').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
  assert.doesNotMatch(code, /chapterId\s*===\s*\d|chapter\s*===\s*\d|ch\s*===\s*\d|\.ch\s*==\s*\d/, 'Chapter 番号での分岐を書かない');
  assert.doesNotMatch(code, /はじまりの草原|大橋|f1_|f3_/, 'Chapter 1 固有の値をエンジンに書かない');
});

test('CH1-01〜03：出目1〜6の数だけ1地点ずつ進む（瞬間移動しない）。6つ目のマス（01 の奥）の先は次の背景（f2_）', () => {
  for (const v of [1, 2, 3, 4, 5, 6]) {
    const E = onCh1(); const path = turn(E, v);
    assert.equal(path.length, v, `出目${v}`); assert.equal(E.m.raise.node, v <= 5 ? `f1_${v}` : 'f2_0'); assert.equal(E.m.raise.turnsUsed, 1);
  }
  const E = onCh1(); assert.equal(E.P8.diceSides(E.m), 6); assert.equal(E.P8.roll(E.S, E.m, () => 0.999).value, 6);
});

test('CH1-04：途中の地点を順番に通る（止まった地点だけ効果）', () => {
  const E = onCh1(); const g = E.CH.graphFor(E.m);
  const path = turn(E, 3); assert.deepEqual(path, ['f1_1', 'f1_2', 'f1_3']);
  for (let i = 1; i < path.length; i++) assert.ok(g.conn[path[i - 1]].includes(path[i]), 'つながった地点だけを通る');
  const before = j(E.m); finishTurnAnyway(E);
  for (const k of ['li', 'po', 'in', 'hi', 'ev', 'de']) if (E.m[k] !== before[k]) assert.ok(E.CH.typeAt(E.m, 'f1_3').t !== 'normal', '変化は停止地点の効果だけ');
});

test('CH1-05：移動疲れ：出目1 +3・出目2 +5・出目3 +7（出目が決まった時点で加算）。4〜6 は表の最大 +7【暫定・未決】', () => {
  for (const [v, add] of [[1, 3], [2, 5], [3, 7], [4, 7], [5, 7], [6, 7]]) {
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

test('CH1-12〜13：1本道（橋／森の分岐は廃止）。分岐の選択は出ず、背景の切り替えをまたいでそのまま進む。強敵は天空の大橋（06）の真ん中', () => {
  const E = onCh1(); E.m.raise.node = 'f5_4'; E.m.raise.pend = null;
  const t = turn(E, 3); assert.deepEqual(t, ['f5_5', 'f6_0', 'f6_1'], '05 → 06 へそのまま'); assert.equal(E.m.raise.field.branch, null);
  const g = E.CH.graphFor(E.m); assert.equal(g.nodes.f6_3.kind, 'strong'); assert.equal(g.nodes.f6_3.terrain, 'bridge');
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
  // 疲れ回復イベントは Chapter 全体で layoutRules.recoveryEvents の範囲（どちらのルートにも1個以上）
  for (let s = 1; s <= 300; s++) { const n = Object.values(CH.generateLayout(cfg, s).assign).filter((a) => a.recovery).length; const [lo, hi] = cfg.layoutRules.recoveryEvents; assert.ok(n >= lo && n <= hi, `seed ${s}: ${n}`); }
});

test('配置の制約（300シード）：各ルートの数・6能力すべて・同種3連続なし・宝箱の隣接なし・序盤のバトルなし・ゴール直前のイベントなし・1背景に集中しない', () => {
  const { CH } = loadEngine(), cfg = CH.getConfig(1), g = CH.buildGraph(cfg);
  for (let s = 1; s <= 300; s++) {
    const L = CH.generateLayout(cfg, s); assert.deepEqual(CH.validateLayout(cfg, g, L.assign), [], `seed ${s}`);
    for (const rt of g.routes) {
      const f = rt.seq.map((id) => (L.assign[id] || {}).t || 'normal'), c = (t) => f.filter((x) => x === t).length;
      for (const t of ['stat', 'event', 'battle', 'treasure']) { const [lo, hi] = cfg.layoutRules.counts[t]; assert.ok(c(t) >= lo && c(t) <= hi, `${s} ${rt.branch} ${t}=${c(t)}`); }
    }
  }
  const bad = { f1_2: { t: 'battle', bt: 'wild' } }; assert.ok(CH.validateLayout(cfg, g, bad).some((e) => /early battle/.test(e)), '違反を見つける');
});

test('CH1-19〜21：30ターン目にゴール＝成功。30ターン使い切ってゴールしていなければChapter終了（大会なし・育成失敗ではない・能力は保持）。出目がゴールを超えてもゴールで止まる。ライバルは強制停止', () => {
  const E = onCh1(51); const { P8, S, m } = E;
  m.raise.node = 'f10_4'; m.raise.turnsUsed = 29; m.raise.fatigue = 0;
  const path = turn(E, 6); assert.deepEqual(path, ['f10_5'], '6でも1地点でゴールに止まる（残りの移動は消える）');
  finishTurnAnyway(E); assert.deepEqual([m.raise.turnsUsed, m.raise.goal, P8.boardPhase(m)], [30, true, 'goal'], '30ターン目のゴールは成功');
  assert.equal(P8.canStartTournament(S, m, 0).ok, true, '公式大会へ');
  const E2 = onCh1(52); E2.m.raise.node = 'f1_1'; E2.m.raise.turnsUsed = 29; E2.m.po = 150; turn(E2, 1); finishTurnAnyway(E2);
  assert.equal(E2.P8.boardPhase(E2.m), 'timeup'); assert.equal(E2.P8.canRoll(E2.m), false); assert.equal(E2.P8.canRest(E2.m), false);
  const end = E2.P8.endChapter(E2.S, E2.m); assert.equal(end.ok, true); assert.equal(end.entry.reachedGoal, false); assert.equal(end.entry.tour, null);
  assert.deepEqual([E2.m.raise.state, E2.m.raise.ch, E2.m.po >= 150], ['farm', 2, true], '次のChapterへ（育成失敗ではない。獲得した能力は保持）');
  const E3 = onCh1(53); E3.m.raise.node = 'f1_0'; E3.m.raise.turnsUsed = 29; E3.P8.rest(E3.S, E3.m); assert.equal(E3.P8.boardPhase(E3.m), 'timeup', '30ターン目に休んでも終わり（大会なし）');
  // ライバル（f10_3）は強制停止：f10_1 から 6 が出ても f10_2 → f10_3 で止まり、残りの歩数は消える。次のターンで f10_4 → ゴール
  const E4 = onCh1(54); E4.m.raise.node = 'f10_1'; E4.m.raise.fatigue = 0; const t4 = turn(E4, 6); assert.deepEqual(t4, ['f10_2', 'f10_3']); assert.equal(E4.m.raise.pend.left, 0);
  const r4 = E4.P8.resolveLanding(E4.S, E4.m, lcg(1)); assert.deepEqual([r4.fx.kind, r4.fx.battleType], ['battle', 'rival']); E4.P8.skipBattleSquare(E4.S, E4.m);
  turn(E4, 2); assert.equal(E4.m.raise.node, 'f10_5'); assert.equal(E4.m.raise.pend.left, 0, 'ゴールで止まる');
});

test('CH1-22：次のChapterの開始時の疲れ＝max(0, 前Chapterの疲れ − 50)。大会・Chapterの終了では疲れは変わらない', () => {
  for (const [f, want] of [[80, 30], [45, 0], [100, 50], [0, 0]]) {
    const E = onCh1(61); const { P8, S, m } = E; m.raise.node = 'f10_5'; m.raise.goal = true; m.raise.fatigue = f;
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

test('シミュレーション（1000回）：6面・30ターン。到達ターン・30ターン内到達率・停止地点・疲れ。総マス数は【暫定】なので範囲だけ', () => {
  const E = loadEngine();
  for (const pol of ['cautious', 'forced']) {
    const s = simulate(E, 1000, pol);
    assert.ok(s.avgTurns >= 15 && s.avgTurns <= 30, `${pol}：平均 ${s.avgTurns}`);
    assert.ok(s.reachRate >= 0.9 && s.reachRate <= 1, `${pol}：30ターン内到達率 ${s.reachRate}`);
    assert.ok(s.avgStops.stat > 3 && s.avgStops.event > 1.5 && s.avgStops.battle > 1 && s.avgStops.treasure > 0.6, JSON.stringify(s.avgStops));
    assert.ok(s.maxTurns <= 30);
  }
});


// =========================================================
// 2026-09-30 改修：道の曲線・中間点・止まる位置と目印の分離・見せ方の config（Chapter 移動体験の品質向上）
// =========================================================
test('CH1-25：道の曲線（Catmull-Rom）の仕組みは残す。巨大街道は折れ線（curve:linear＝石板の輪をまっすぐ結ぶ）。隣の地点へは道筋の点列で歩く', () => {
  const { CH } = loadEngine(), cfg = CH.getConfig(1), g = CH.buildGraph(cfg);
  const c = CH.smoothCurve([[0, 0], [1, 1], [2, 0]], 4);
  assert.equal(c.length, 9, '2区間 × 4分割 ＋ 始点'); assert.deepEqual(c[0], [0, 0]); assert.deepEqual(c[c.length - 1], [2, 0]);
  assert.ok(c[2][1] > 0.4 && c[2][1] < 1, '中間は通る点の間を滑らかにつなぐ');
  assert.deepEqual(CH.smoothCurve([[0, 0], [1, 1]]), [[0, 0], [1, 1]], '点が2つなら折れ線のまま');
  for (const p of cfg.paths) { const cv = g.curves[p.id]; assert.ok(cv && cv.pts.length === p.pts.length && cv.pts.length >= 4, `${p.id}：道の中央線の折れ線（${cv.pts.length}点）`); assert.equal(cv.terrain, p.terrain); }
  const r = CH.routeBetween(g, 'f1_1', 'f1_2');
  assert.ok(r.length >= 2, `道筋（${r.length}）`); assert.deepEqual(r[0], [g.nodes.f1_1.mx, g.nodes.f1_1.my]); assert.deepEqual(r[r.length - 1], [g.nodes.f1_2.mx, g.nodes.f1_2.my]);
  for (let i = 1; i < r.length; i++) assert.ok(r[i][1] <= r[i - 1][1] + 0.01, '奥へ向かって進む（戻らない）');
  const ids = g.order.filter((id) => g.nodes[id].path === 'f1_');
  for (let i = 1; i < ids.length; i++) assert.ok(g.nodes[ids[i]].s > g.nodes[ids[i - 1]].s);
  // 道の中央線の上に、奥行き補正で等間隔（手前 0.87 → 奥＝背景ごとの道が細くなる手前。奥ほど画面上の間隔が縮む）
  assert.deepEqual([g.nodes[ids[0]].y, g.nodes[ids[ids.length - 1]].y], [0.87, 0.47]);
  for (let i = 2; i < ids.length; i++) assert.ok(g.nodes[ids[i - 1]].y - g.nodes[ids[i]].y < g.nodes[ids[i - 2]].y - g.nodes[ids[i - 1]].y + 1e-9, `${ids[i]}：奥ほど詰まる`);
  // 曲がった道（08 古代遺跡の S字）：隣の地点へ歩く点列の途中も、すべて道の安全域の中
  for (const k of ['f8_', 'f9_', 'f3_']) { const sc = cfg.fieldScenes.find((x) => x.id === g.curves[k].field), ns = g.order.filter((id) => g.nodes[id].path === k); for (let i = 1; i < ns.length; i++) for (const [x, y] of CH.routeBetween(g, ns[i - 1], ns[i])) { const rd2 = CH.roadAt(sc, y); assert.ok(x >= rd2.safeLeft - 1e-6 && x <= rd2.safeRight + 1e-6, `${k}：歩く途中 (${x}, ${y}) は道の中`); } }
  // 別のフィールド（次の背景）へ：空（画面側が背景の切り替えをする）
  assert.deepEqual(CH.routeBetween(g, 'f1_5', 'f2_0'), []);
});

test('CH1-26：別の道へ移るときは config.edges の中間点（曲線化）を通る。無い組み合わせは直線。止まる位置（mx/my）と目印は config.nodeOverrides で分けられる', () => {
  const { CH } = loadEngine(), cfg = CH.getConfig(1), g = CH.buildGraph(cfg);
  assert.deepEqual(CH.routeBetween(g, 'f5_5', 'f6_0'), [], '次の背景へは切り替え');
  const ce = j(cfg); ce.chapterId = 5; ce.patternId = 'E'; ce.paths.find((p) => p.id === 'f6_').field = ce.paths.find((p) => p.id === 'f5_').field; ce.edges = { 'f5_5>f6_0': [[0.5, 0.8]] }; const ge = CH.registerConfig(ce);
  const ra = CH.routeBetween(ge, 'f5_5', 'f6_0'); assert.ok(ra.length > 3, `同じ背景の中で別の道へ移るときは中間点を曲線化（${ra.length}）`);
  assert.deepEqual(ra[0], [ge.nodes.f5_5.mx, ge.nodes.f5_5.my]); assert.deepEqual(ra[ra.length - 1], [ge.nodes.f6_0.mx, ge.nodes.f6_0.my]);
  const c2 = j(cfg); c2.chapterId = 3; c2.patternId = 'T'; c2.nodeOverrides = { f1_1: { monster: [0.5, 0.65], landmark: { x: 0.3, y: 0.6, scale: 1.2, opacity: 0.8, anchor: 'foot' }, camera: { zoom: 1.02 }, terrain: 'slope', side: -1 } };
  const g2 = CH.registerConfig(c2), n = g2.nodes.f1_1;
  assert.deepEqual([n.mx, n.my], [0.5, 0.65], '止まる位置は道の点と別に持てる'); assert.notDeepEqual([n.x, n.y], [n.mx, n.my]);
  assert.deepEqual(n.lm, { x: 0.3, y: 0.6, scale: 1.2, opacity: 0.8, anchor: 'foot' }); assert.deepEqual(n.cam, { zoom: 1.02 }); assert.equal(n.terrain, 'slope'); assert.equal(n.side, -1);
  const r = CH.routeBetween(g2, 'f1_0', 'f1_1'); assert.deepEqual(r[r.length - 1], [0.5, 0.65], '歩く道筋の終点は止まる位置');
  assert.deepEqual(['f1_1', 'f3_1', 'f6_3', 'f8_1'].map((id) => g.nodes[id].terrain), ['grass', 'forest', 'bridge', 'highland']);
  const c3 = j(cfg); c3.chapterId = 4; c3.patternId = 'L'; delete c3.paths[0].curve; const g3 = CH.registerConfig(c3);
  assert.ok(g3.curves.f1_.pts.length > cfg.paths[0].pts.length, 'curve を省けば滑らかな曲線');
});


test('CH1-27：見せ方の config：バトルの目印は常設しない、背景（街道・遺跡・橋・森）に素材を重ねない、サイコロの停止面 1〜6 は正式画像、低いカメラ・視差・歩きの設定、Chapter開始の俯瞰図（Pattern ごと）と START の操作欄（STOP は使わない）', () => {
  const { CH } = loadEngine(), cfg = CH.getConfig(1);
  assert.equal(cfg.battleMarkers, false);
  for (const s of cfg.fieldScenes) { assert.deepEqual(cfg.landmarks[s.id], [], `背景 ${s.id}：背景に描かれている物に素材を重ねない`); assert.deepEqual(cfg.foreground[s.id], []); }
  assert.deepEqual(cfg.landmarkVisibility, { stat: 'arrive', event: 'arrive', treasure: 'always' }, '石碑・イベントの物は着いたときに初めて現れる。宝箱は最初から');
  assert.deepEqual(Object.keys(cfg.dice.resultSprites), ['1', '2', '3', '4', '5', '6'], 'サイコロの停止面（1〜6）'); for (let v = 1; v <= 6; v++) { assert.match(cfg.dice.resultSprites[v], /dice_stop_\d\.webp$/); assert.ok(existsSync(path.join(ROOT, cfg.dice.resultSprites[v])), `dice_stop_${v}`); }
  assert.ok(existsSync(path.join(ROOT, cfg.dice.rollingSprite)), '回転中の無地のサイコロ（停止面がそろわないときの予備）');
  for (const e of cfg.eventPool) assert.ok(!e.asset, `${e.id}：街道の上に木・岩は置かない（tier の祠を小さく）`);
  assert.ok(cfg.nodeLook.stat.side !== 0 && cfg.nodeLook.stat.gap >= 120, '能力の石碑は輪の横（モンスターの上に重ねない）'); assert.equal(cfg.nodeLook.stat.tuft, false, '石の道に草は置かない');
  assert.ok(cfg.camera && cfg.camera.zoom.move < 1 && cfg.camera.zoom.stop > 1 && cfg.camera.zoom.branch < 1 && cfg.camera.lookAhead > 0 && cfg.camera.followDelay >= 80 && cfg.camera.followDelay <= 150);
  assert.ok(cfg.parallax.far < cfg.parallax.back && cfg.parallax.back < cfg.parallax.road && cfg.parallax.road < cfg.parallax.front, '遠景 → 中景 → 前景の順に速い');
  assert.ok(cfg.motion.minMs >= 300 && cfg.motion.maxMs <= 800 && cfg.motion.terrain.forest.speed < 1 && cfg.motion.terrain.bridge.fixed, '1地点＝石板1つ：1地点 0.38〜0.76秒。森は少しゆっくり、橋はやや一定');
  for (const s of cfg.fieldScenes) { assert.ok(s.farBand && s.farBand.k < 1, `${s.name}：遠景の帯`); assert.ok(s.zoom.near >= 1.2 && s.zoom.far > s.zoom.near, '低いカメラ（近景の石板が大きい）'); }
  // Chapter開始の俯瞰図：正式な演出専用の画像（intro/ch1_intro_overview.webp。プレイの背景とは別のファイル。背景の順には入れない）
  const I = cfg.intro; assert.ok(I && I.overviews && I.startFocus && I.goalFocus && I.zoom.to > I.zoom.from);
  assert.deepEqual(I.overviews, { A: './assets/fields/ch1a/intro/ch1_intro_overview.webp' }); assert.ok(existsSync(path.join(ROOT, I.overviews.A))); assert.ok(!cfg.fieldScenes.some((s) => s.bg === I.overviews.A));
  for (let k = 1; k <= 3; k++) assert.ok(existsSync(path.join(ROOT, `assets/fields/ch1a/intro/ch1_intro_overview_pattern${k}.webp`)), '旧の俯瞰図はファイルだけ残す（参照しない）');
  // START の操作欄：正式画像と押せる領域。STOP の画像（ui/deck_stop.webp）はファイルだけ残し、config からは参照しない（1タップで自動停止）
  assert.ok(existsSync(path.join(ROOT, cfg.deck.start))); assert.equal(cfg.deck.stop, undefined, 'STOP は使わない'); assert.ok(existsSync(path.join(ROOT, 'assets/fields/ch1a/ui/deck_stop.webp')), 'ファイルは残す'); for (const k of ['center', 'tl', 'tr', 'bl', 'br']) assert.ok(cfg.deck.hit[k] && cfg.deck.hit[k].w > 0 && cfg.deck.hit[k].h > 0, k);
  const view = rd('js/chapter/field-view.js').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
  assert.doesNotMatch(view, /chapterId\s*===\s*\d|f1_|f2_|f3_|'a\d'|大橋|はじまりの草原/, '画面側に Pattern A 専用の座標・分岐を書かない');
  assert.match(view, /registerMonsterAnimator/, '歩行アニメの差し込み口'); assert.match(view, /routeBetween/, '道の曲線に沿って歩く'); assert.match(view, /requestAnimationFrame/, 'カメラは毎フレーム追従');
  assert.doesNotMatch(view, /manualStop: true|chfStop|requestStop|chdf/, 'STOP の操作は無い（1タップで自動停止。サイコロは START を押すまで出さない）'); assert.match(view, /MMCHI\.play/, 'Chapter開始の俯瞰図（js\/chapter\/intro.js）');
  assert.match(view, /clampToRoad/, 'モンスターの x は道の安全域に収める');
});

test('CH1-28：道の安全域（fieldScenes[].road）：中央線と半幅は点ごと（曲がった細い道）。すべての止まる位置は安全域の中。clampToRoad は端に寄った x を戻し、体の半幅ぶん内側にする。半幅を書かない背景は従来の消失点のモデル', () => {
  const { CH } = loadEngine(), cfg = CH.getConfig(1), g = CH.buildGraph(cfg);
  const sc = cfg.fieldScenes[0], far = CH.roadAt(sc, 0.47), near = CH.roadAt(sc, 0.87);
  assert.ok(far.half < near.half && far.half < 0.06 && near.half > 0.2, `奥ほど細い（${far.half} → ${near.half}）`);
  assert.ok(far.safeRight - far.safeLeft < far.right - far.left, '安全域は絵の道より内側');
  const s8 = cfg.fieldScenes.find((s) => s.bgKey === '08'); assert.ok(CH.roadAt(s8, 0.35).x > 0.65 && CH.roadAt(s8, 0.5).x < 0.5 && CH.roadAt(s8, 0.6).x > 0.55, '08 古代遺跡：S字の中央線');
  assert.equal(CH.roadAt({}, 0.5), null, 'road の無い背景は制限なし'); assert.deepEqual(CH.clampToRoad({}, 0.1, 0.5), { x: 0.1, clamped: false, road: null });
  let n = 0;
  for (const id of g.order) { const nd = g.nodes[id], s = cfg.fieldScenes.find((x) => x.id === nd.field), r = CH.roadAt(s, nd.my); assert.ok(nd.mx >= r.safeLeft && nd.mx <= r.safeRight, `${id}：安全域の中（${nd.mx} in ${r.safeLeft}〜${r.safeRight}）`); assert.ok(Math.abs(nd.mx - r.x) < 0.012, `${id}：中央線の上（${nd.mx} vs ${r.x}）`); n++; }
  assert.equal(n, 60);
  const c = CH.clampToRoad(sc, 0.05, 0.7, 0.03); assert.equal(c.clamped, true); assert.ok(c.x >= c.road.safeLeft + 0.03 - 1e-9 && c.x < 0.55, `端に寄った x は安全域へ（${c.x}）`);
  assert.deepEqual(CH.clampToRoad(sc, 0.5, 0.47, 0.2).x, CH.roadAt(sc, 0.47).x, '安全域が体より狭ければ中央');
  const c2 = j(cfg); c2.chapterId = 3; c2.patternId = 'R'; c2.nodeOverrides = { f1_1: { monster: [0.02, 0.7] } }; const g2 = CH.registerConfig(c2);
  assert.ok(g2.nodes.f1_1.mx > 0.3, `nodeOverrides の止まる位置も安全域に収める（${g2.nodes.f1_1.mx}）`);
  const vm = { road: { center: [[0.3, 0.5], [0.97, 0.5]], vanish: 0.245, slope: 0.95, maxHalf: 0.5, safe: 0.7 } }; assert.equal(CH.roadAt(vm, 0.87).half, 0.5, '半幅を書かない背景は従来の消失点のモデル（2026-10-01 夜から Chapter 2 も半幅つき）');
});


test('DICE-06：サイコロの回転は最後に 360° の倍数（正式の角度）へ収束する（傾いたまま止まらない）。収束は最後の 0.15〜0.2 秒', () => {
  const w = {}; new Function('window', rd('js/phase7/progression.js'))(w); new Function('window', rd('js/chapter/dice-renderer.js'))(w); const D = w.MMCHD;
  for (const dir of [1, -1]) for (const spin of [900, 990, 1080]) {
    const fr = D.spinFrames(dir, spin, 0.19), last = fr[fr.length - 1], deg = parseFloat(last.transform.match(/rotate\(([-\d.]+)deg\)/)[1]);
    assert.equal(Math.abs(deg % 360), 0, `${dir}×${spin}：${deg}`); assert.equal(last.offset, 1);
    const before = fr[fr.length - 2]; assert.ok(Math.abs(1 - before.offset - 0.19) < 1e-9, '収束の区間');
  }
  const c = D.configure(); assert.ok(c.settleMs >= 150 && c.settleMs <= 200); assert.ok(c.ms >= 700 && c.ms <= 1200, '出現〜着地 0.7〜1.2秒'); assert.ok(c.resultMs >= 300 && c.resultMs <= 500, '停止面 0.3〜0.5秒');
});

test('BF-01：バトル画面の表示だけの補正（js/battle/fit.js）：fight()・.bt 系 CSS に触れず、寸法から「切れない最大の大きさ」を計算する', () => {
  const w = { addEventListener() {} }; new Function('window', rd('js/battle/fit.js'))(w); const F = w.MMBF;
  assert.deepEqual(F.compute({ top: 148, bottom: 371, width: 179, vsBottom: 371, height: 223 }), { size: 171, lift: 0 }, '390×844：使える高さ 223 − 余白');
  assert.deepEqual(F.compute({ top: 133, bottom: 293, width: 172, vsBottom: 293, height: 160 }), { size: 144, lift: 0 }, '375×667');
  assert.deepEqual(F.compute({ top: 100, bottom: 400, width: 120, vsBottom: 400, height: 300 }), { size: 112, lift: 0 }, '横幅で制限');
  assert.deepEqual(F.compute({ top: 100, bottom: 700, width: 400, vsBottom: 700, height: 600 }), { size: 210, lift: 0 }, '上限');
  assert.equal(F.compute({ top: 100, bottom: 360, width: 200, vsBottom: 400, height: 260 }).lift, 44, '技UIが絵の枠より上なら足元を上げる');
  const src = rd('js/battle/fit.js'); assert.doesNotMatch(src, /innerHTML|insertAdjacentHTML|createElement/, 'DOM を作らない（インラインの寸法だけ）');
  assert.doesNotMatch(rd('index.html').slice(rd('index.html').indexOf('<style>'), rd('index.html').indexOf('</style>')).split('\n').filter((l) => /^\.chf|^\.chd|^\.chs|^\.chw|^\.chh|^\.chp|^\.chm|^\.chc|^#app>\.chfw/.test(l)).join('\n'), /\.bt[\s.{]|#rl|#go|\.rl|\.rw/, 'Chapter の CSS はバトルのセレクタに触れない');
});

test('CH1-29：導入演出の「初回」の記録 introSeen は個体の Chapter の配置（m.raise.field）に持つ：出発で新しい配置（記録なし）→ Chapter の終了で配置ごと消える → 次の Chapter の出発でまた記録なし。読み込みの検査（validField・sanitize）で消えない', () => {
  const E = onCh1(71); const { P8, S, m, CH } = E;
  assert.equal(m.raise.field.introSeen, undefined, '出発した直後は記録なし（＝初回）');
  m.raise.field.introSeen = true;
  const S2 = P8.migrateSave(j(S)); assert.equal(S2.m.raise.field.introSeen, true, 'セーブ → 読み込みで残る'); assert.equal(CH.validField(S2.m.raise.field), true); CH.sanitize(S2.m); assert.equal(S2.m.raise.field.introSeen, true);
  m.raise.node = P8.trackOf(1).goal; m.raise.goal = true; P8.declineTournament(S, m);
  assert.equal(m.raise.field, null, 'Chapter の終了で配置ごと消える');
  P8.depart(S, m, lcg(72)); assert.deepEqual([m.raise.ch, m.raise.field.chapterId, m.raise.field.introSeen], [2, 2, undefined], '次の Chapter（潮風の海岸）の出発＝新しい配置＝初回');
  const code = rd('js/chapter/field-view.js').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
  assert.match(code, /f\.introSeen/, '画面側は配置の introSeen で判定'); assert.doesNotMatch(code, /MMCHI\.shown\(/, 'sessionStorage の記録では判定しない');
});

// =========================================================
// Chapter 2「潮風の海岸」Pattern A（js/chapter/configs/ch2a.js。2026-10-01）
// =========================================================
test('CH2-01：Chapter 2 の config（正式背景 2026-10-01 夜）：フィールド 01〜09 → 大会会場前 の10枚をそれぞれ1回だけ、この順にだけ通る。1本道（分岐なし）。59歩（ノード60）【暫定】。俯瞰図は演出専用', () => {
  const { CH, P8 } = loadEngine(), cfg = CH.getConfig(2), g = CH.buildGraph(cfg);
  assert.deepEqual([cfg.chapterId, cfg.patternId, cfg.title, cfg.playable], [2, 'A', '潮風の海岸', true]);
  assert.deepEqual(cfg.stageOrder, ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10']);
  assert.equal(cfg.fieldScenes.length, 10); assert.equal(new Set(cfg.fieldScenes.map((s) => s.bg)).size, 10, '背景はどれも1回だけ');
  assert.deepEqual(cfg.fieldScenes.map((s) => s.bg.replace('./assets/fields/ch2a/', '')), [...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => `field/ch2_field_0${i}.webp`), 'arena/ch2_arena_approach.webp'], '01→09→会場前の順');
  for (const s of cfg.fieldScenes) { assert.ok(existsSync(path.join(ROOT, s.bg)), s.bg); assert.deepEqual([s.w, s.h], [864, 1536]); assert.ok(s.road && s.road.center.length >= 6 && s.road.center.every((c) => c.length === 3), `${s.name}：中央線と半幅`); }
  assert.ok(!cfg.fieldScenes.some((s) => /\/road\//.test(s.bg)), '旧背景（road/）は参照しない');
  assert.deepEqual(cfg.fieldScenes.map((s) => s.stage), ['coast', 'coast', 'coast', 'coast', 'coast', 'undersea', 'undersea', 'undersea', 'late', 'arena'], '海上 → 海中 → 海上 → 会場前');
  assert.equal(g.routes.length, 1, '1本道'); assert.deepEqual(g.branchAt, []); assert.deepEqual(CH.routeLengths(g), { min: 59, max: 59, nodes: 60 });
  const seq = g.routes[0].seq.map((id) => g.nodes[id].field), fields = seq.filter((v, i, a) => i === 0 || a[i - 1] !== v); assert.deepEqual(fields, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], '背景は 1→10 の順に1回ずつ');
  assert.deepEqual([g.start, g.goal], ['s1_0', 'sa_5']);
  const kinds = {}; for (const n of Object.values(g.nodes)) if (n.kind !== 'slot') kinds[n.id] = n.kind; assert.deepEqual(kinds, { s1_0: 'start', s4_3: 'strong', sa_3: 'rival', sa_5: 'goal' }, '骨格：スタート・強敵（海上の大橋）・ライバル（強制停止）・ゴール');
  assert.equal(g.nodes.sa_3.forceStop, true); assert.equal(P8.trackOf(2).nodes.sa_3.stop, true);
  assert.deepEqual([CH.rulesOf(cfg).diceSides, CH.rulesOf(cfg).turnLimit, CH.rulesOf(cfg).onTimeUp], [6, 30, 'end']);
  // 止まる位置も、歩く途中の点も、道の安全域の中（海中の区間も回廊の床の上だけ）
  for (const id of g.order) { const n = g.nodes[id], s = cfg.fieldScenes.find((x) => x.id === n.field), r = CH.roadAt(s, n.my); assert.ok(n.mx >= r.safeLeft && n.mx <= r.safeRight, `${id}：道の安全域の中`); }
  for (let i = 1; i < g.order.length; i++) { const a = g.order[i - 1], b = g.order[i]; if (g.nodes[a].field !== g.nodes[b].field) continue; const s = cfg.fieldScenes.find((x) => x.id === g.nodes[a].field); for (const [x, y] of CH.routeBetween(g, a, b)) { const r = CH.roadAt(s, y); assert.ok(x >= r.safeLeft - 1e-6 && x <= r.safeRight + 1e-6, `${a}→${b}：歩く途中も道の上`); } }
  assert.match(cfg.intro.overviews.A, /\/ch2a\/intro\/ch2_intro_overview_v2\.webp$/, '正式な俯瞰図（演出専用）'); assert.ok(existsSync(path.join(ROOT, cfg.intro.overviews.A))); assert.ok(!cfg.fieldScenes.some((s) => s.bg === cfg.intro.overviews.A), 'プレイの背景には入れない');
  assert.ok(Array.isArray(cfg.intro.via) && cfg.intro.via.length >= 1, '海上・海中を経由してスタートへ'); assert.ok(cfg.deck.start && Object.keys(cfg.dice.resultSprites).length === 6);
  assert.ok(existsSync(path.join(ROOT, 'assets/fields/ch2a/road/ch2_01_early_a.webp')) && existsSync(path.join(ROOT, 'assets/fields/ch2a/intro/ch2_intro_overview.webp')), '旧素材はファイルだけ残す');
  for (let s = 1; s <= 60; s++) assert.doesNotThrow(() => CH.generateLayout(cfg, s), `seed ${s}：配置が作れる`);
});

test('CH2-02：Chapter 1 を終えた個体が Chapter 2 へ出発できる（疲れ −50・30ターン・6面・配置は seed で固定）。ゴール（大会門）で公式大会へ。ターン切れは大会なしで Chapter 3 へ', () => {
  const E = onCh1(81); const { P8, S, m, CH } = E;
  m.raise.node = P8.trackOf(1).goal; m.raise.goal = true; m.raise.fatigue = 90; P8.declineTournament(S, m);
  assert.deepEqual([m.raise.state, m.raise.ch], ['farm', 2]); assert.equal(P8.canDepart(S, m).ok, true, 'Chapter 2 のマップがある');
  assert.equal(P8.depart(S, m, lcg(82)).ok, true);
  assert.deepEqual([m.raise.ch, m.raise.turnLimit, m.raise.field.chapterId, m.raise.field.patternId, m.raise.fatigue, m.raise.node, P8.diceSides(m)], [2, 30, 2, 'A', 40, 's1_0', 6]);
  const seed = m.raise.field.layoutSeed, assign = JSON.stringify(m.raise.field.nodeAssignments);
  const S2 = P8.migrateSave(j(S)); assert.deepEqual([S2.m.raise.field.layoutSeed, JSON.stringify(S2.m.raise.field.nodeAssignments)], [seed, assign], '読み込み後も同じ配置');
  const t = turn(E, 6); assert.equal(t.length, 6); assert.equal(m.raise.node, 's2_0');
  m.raise.node = 'sa_4'; m.raise.pend = null; m.raise.fatigue = 0; turn(E, 5); assert.deepEqual([m.raise.node, m.raise.pend.left], ['sa_5', 0], '出目がゴールを超えてもゴールで止まる');
  finishTurnAnyway(E); assert.deepEqual([m.raise.goal, P8.boardPhase(m)], [true, 'goal']); assert.equal(P8.canStartTournament(S, m, 0).ok, true, '公式大会へ');
  const E2 = onCh1(83); E2.m.raise.node = E2.P8.trackOf(1).goal; E2.m.raise.goal = true; E2.P8.declineTournament(E2.S, E2.m); E2.P8.depart(E2.S, E2.m, lcg(84));
  E2.m.raise.node = 's6_1'; E2.m.raise.turnsUsed = 29; E2.m.raise.fatigue = 0; turn(E2, 1); finishTurnAnyway(E2);
  assert.equal(E2.P8.boardPhase(E2.m), 'timeup'); const end = E2.P8.endChapter(E2.S, E2.m); assert.deepEqual([end.ok, end.entry.reachedGoal, E2.m.raise.state, E2.m.raise.ch], [true, false, 'farm', 3], 'ターン切れ → 大会なし → Chapter 3 へ');
});

test('CH2-03：旧 Chapter 2（背景 road/ 10枚・ノード e1_〜z1_）の途中のセーブ：旧ノードは新しい構成に無いので、Chapter 2 の開始地点（0ターン）から。能力・所持金・疲れ・個体は保つ。セーブ形式は変えない', () => {
  const E = onCh1(91); const { P8, S, m, CH } = E;
  m.raise.node = P8.trackOf(1).goal; m.raise.goal = true; P8.declineTournament(S, m); P8.depart(S, m, lcg(92));
  // 旧構成のときの途中の状態を作る（旧ノード ID・旧配置）
  const f = m.raise.field; f.nodeAssignments = { e1_2: { t: 'stat', k: 'po' }, m2_3: { t: 'event', ev: 'shade' } }; f.fieldId = 5; m.raise.node = 'm2_3'; m.raise.turnsUsed = 12; m.raise.fatigue = 33;
  S.gold = 777; m.st = m.st || {}; const stats = JSON.stringify([m.li, m.po, m.in, m.hi, m.ev, m.de, m.st]), sp = m.sp;
  const S2 = P8.migrateSave(j(S)); assert.equal(S2.v, 6);
  assert.equal(P8.ensureBoardPosition(S2, S2.m).changed, true, 'ボードを開くときに作り直す（既存の安全処理）');
  assert.deepEqual([S2.m.raise.ch, S2.m.raise.node, S2.m.raise.turnsUsed, S2.m.raise.fatigue, S2.gold], [2, 's1_0', 0, 33, 777], '開始地点・0ターンから。疲れ・所持金はそのまま');
  assert.equal(JSON.stringify([S2.m.li, S2.m.po, S2.m.in, S2.m.hi, S2.m.ev, S2.m.de, S2.m.st]), stats, '能力はそのまま'); assert.equal(S2.m.sp, sp);
  assert.ok(CH.validField(S2.m.raise.field) && Object.keys(S2.m.raise.field.nodeAssignments).every((id) => /^s(\d|a)_/.test(id)), '新しい配置');
});
