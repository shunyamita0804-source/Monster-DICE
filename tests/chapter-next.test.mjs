// =========================================================
// 次期Chapter（リアル巨大ボード方式）の内部基盤：NX-01〜NX-16
//  背景・マスの見た目はまだ無いので、合成した config（Chapter 番号は 2〜4 を借りる。サイコロ 1〜6・30ターン・100〜200マス・強制停止・固定＋可変）で
//  エンジン（MMCH）・進行（MMP8）・サイコロ（MMP7.rollDie／MMCHD）・セーブ互換を確かめる。数値（総マス数・背景の枚数）はテストの引数で、コードには固定しない。
//  現行の Chapter 1（1〜3・13枚）が変わっていないことも同じファイルで確認する（tests/chapter-engine.test.mjs と合わせて）
// =========================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadEngine, lcg } from './chapter-sim.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const j = (o) => JSON.parse(JSON.stringify(o));
const STATS = ['li', 'po', 'in', 'hi', 'ev', 'de'];
/** 面の数 sides の出目 v を出す乱数（rollDie＝1+floor(r*sides)） */
const die = (v, sides = 6) => () => (v - 0.5) / sides;
const mon = (P7, P8, S) => { const m = P8.initIndividual(S, { sp: 0, name: 'テスト', age: 0, span: 30, h: 0, rk: 0, fa: 0, st: 0, last: null, li: 100, po: 100, in: 100, hi: 100, ev: 100, de: 100, sk: [0, 1, 2, 3], eq: [0, 1, 2, 3, -1, -1] }); P7.ensureProg(m); return m; };

/**
 * 合成 config（Chapter 番号 chapterId・背景 scenes 枚・1枚あたり per 地点。総マス数＝scenes×per 前後。数字はすべて引数）
 *  骨格：スタート → … → 分岐（真ん中の背景）→ 2本の道（a／b）→ 合流 → … → ライバル（強制停止・ゴールの2つ手前）→ ゴール
 *  固定：特殊地点（special。合流の次）。可変：それ以外の候補ノード（配置で stat／event／battle／treasure）
 */
export function makeNextConfig({ chapterId = 3, patternId = 'N', scenes = 9, per = 17, diceSides = 6, turnLimit = 30, onTimeUp = 'tournament', forceStopKinds = ['rival'], counts } = {}) {
  const fieldScenes = [], paths = [];
  for (let i = 1; i <= scenes; i++) fieldScenes.push({ id: i, name: `背景${i}`, bg: `./assets/next/bg_${i}.webp`, w: 864, h: 1536, depth: [[0.98, 1], [0.4, 0.3]], zoom: { near: 1.2, far: 1.4 } });
  const pts = [[0.5, 0.92], [0.52, 0.7], [0.48, 0.5], [0.5, 0.4]];
  const mid = Math.ceil(scenes / 2);
  for (let i = 1; i <= scenes; i++) {
    if (i < mid) paths.push({ id: `s${i}_`, field: i, n: per, start: i === 1, next: [`s${i + 1}_`], pts, fixed: i === 1 ? { 0: 'start' } : {} });
    else if (i === mid) paths.push({ id: `s${i}_`, field: i, n: per, next: ['ra_', 'rb_'], pts, fixed: { [per - 1]: 'branch' } });
    else if (i === mid + 1) { paths.push({ id: 'ra_', field: i, n: per, branch: 'A', next: ['m_'], pts }); paths.push({ id: 'rb_', field: i, n: per + 4, branch: 'B', next: ['m_'], pts }); }
    else if (i === mid + 2) paths.push({ id: 'm_', field: i, n: per, next: [i === scenes ? null : `s${i + 1}_`].filter(Boolean), pts, fixed: { 0: 'merge', 1: 'special' } });
    else paths.push({ id: `s${i}_`, field: i, n: per, next: i === scenes ? [] : [`s${i + 1}_`], goal: i === scenes, pts, fixed: i === scenes ? { [per - 3]: 'rival', [per - 1]: 'goal' } : {} });
  }
  const last = paths[paths.length - 1]; if (!last.goal) { last.goal = true; last.next = []; last.fixed = { ...(last.fixed || {}), [last.n - 3]: 'rival', [last.n - 1]: 'goal' }; }
  const total = paths.reduce((s, p) => s + p.n, 0);
  return {
    chapterId, patternId, title: '次期Chapter（合成）', patternTitle: '基盤テスト', playable: true,
    rules: { turnLimit, diceSides, onTimeUp },
    forceStopKinds,
    fieldScenes, paths, edges: {}, nodeOverrides: {},
    branches: [{ at: `s${mid}_${per - 1}`, options: [{ id: 'A', to: 'ra_0', label: 'Aの道', desc: '' }, { id: 'B', to: 'rb_0', label: 'Bの道', desc: '' }] }],
    layoutRules: { counts: counts || { stat: [Math.round(total * 0.2), Math.round(total * 0.28)], event: [Math.round(total * 0.1), Math.round(total * 0.14)], battle: [Math.round(total * 0.06), Math.round(total * 0.09)], treasure: [Math.round(total * 0.04), Math.round(total * 0.06)] },
      maxPerStat: Math.max(3, Math.ceil(total * 0.28 / 6) + 1), recoveryEvents: [1, 3], recoveryPerRoute: true, noBattleFirst: 5, maxBattlesFirst: [15, 2], noEventLast: 3, maxFieldShare: 0.4, minFieldShare: 0, eventTierWeights: { normal: 70, rare: 25, special: 5 } },
    eventPool: [
      { id: 'shade', tier: 'normal', recovery: true, weight: 4, handler: 'fatigue', params: { amount: 10 }, text: '木陰でひと休みした。' },
      { id: 'spring', tier: 'rare', recovery: true, weight: 2, handler: 'fatigue', params: { amount: 30 }, text: '泉で休んだ。' },
      { id: 'coin', tier: 'normal', weight: 3, handler: 'gold', params: { amount: 50 }, text: 'お金を見つけた！' },
      { id: 'herb', tier: 'normal', weight: 3, handler: 'stat_random', params: { amount: 6 }, text: '珍しい草を見つけた！' },
      { id: 'sage', tier: 'rare', weight: 2, handler: 'stat_random', params: { amount: 20 }, text: '賢者に会った。' },
      { id: 'legend', tier: 'special', weight: 1, handler: 'stat_all', params: { amount: 8 }, text: '伝説の泉。' },
    ],
    treasurePool: { tierWeights: { normal: 70, rare: 25, special: 5 }, contents: { handler: 'gold_table', params: { table: [{ w: 4, gold: 50 }, { w: 1, gold: 150 }] } } },
    battleTypes: { wild: { label: '野生のモンスター', asset: 'battle_wild' }, strong: { label: '強敵', asset: 'battle_strong' }, rival: { label: 'ライバル', asset: 'battle_rival', figure: null } },
    specials: { m_1: { handler: 'gold', params: { amount: 100 }, text: 'Chapter固有のイベント（合成）', once: true } },
    companion: { npc: 'fina', reactions: { gold: ['やった、お金だ！'], rival: [{ expression: 'serious', text: 'ライバルが来た…！' }] } },
    dice: { rollingSprite: './assets/fields/ch1a/dice/dice_rolling.webp', resultSprites: { 1: './assets/fields/ch1a/dice/dice_stop_1.svg', 2: './assets/fields/ch1a/dice/dice_stop_2.svg', 3: './assets/fields/ch1a/dice/dice_stop_3.svg' } },
    assets: {}, landmarks: {}, foreground: {}, nodeLook: {}, landmarkVisibility: {},
  };
}
/** 合成 config を登録して、その Chapter へ出発した状態 */
function onNext(opts = {}, seed = 7) {
  const E = loadEngine(); const { P7, P8, CH } = E; const cfg = makeNextConfig(opts); CH.registerConfig(cfg);
  const S = P8.newSave(); S.m = mon(P7, P8, S); const m = S.m;
  // 育成状態を「Chapter cfg.chapterId へ出発できる」形に（未育成の出発は Chapter 1 固定のため、Chapter間ファームから出発する）
  Object.assign(m.raise, { state: 'farm', ch: cfg.chapterId, log: [{ ch: 1, reachedGoal: true, turnsUsed: 20, turnLimit: 30, declined: true, tour: null }] });
  // 2026-10-01 夜：Chapter 3・4 は公式C・B大会クリアが出発の条件。ここでは基盤の規則を見るため、出発のときだけ条件を満たした実績にして戻す
  const keep = [...m.prog.rankClr], need = (P8.CHAPTER_RANK_GATE || {})[cfg.chapterId]; if (need != null) m.prog.rankClr = keep.map((v, i) => v || i <= need);
  const d = P8.depart(S, m, lcg(seed)); assert.equal(d.ok, true, `depart ${JSON.stringify(d)}`); m.prog.rankClr = keep;
  return { ...E, S, m, cfg, g: CH.buildGraph(cfg) };
}
/** 出目 v（面の数 sides）で1ターン：分岐は opt（'ra_0'／'rb_0'）。戻り値＝通った地点（通過＋停止）。停止処理はしない */
function turn(E, v, opt = 'ra_0') {
  const { P8, S, m } = E, sides = P8.diceSides(m); const r = P8.roll(S, m, die(v, sides)); assert.equal(r.ok, true, 'roll'); assert.equal(r.value, v, `出目 ${v}`);
  const trail = [];
  while (m.raise.pend && ['move', 'branch'].includes(m.raise.pend.stage)) {
    if (m.raise.pend.stage === 'branch') { P8.chooseBranch(S, m, opt); trail.push(m.raise.node); continue; }
    const s = P8.step(S, m); if (s.node) trail.push(s.node);
  }
  return trail;
}
function land(E, rnd = lcg(1)) { const { P8, S, m } = E; if (m.raise.pend && m.raise.pend.stage === 'resolve') { const x = P8.resolveLanding(S, m, rnd); if (m.raise.pend && m.raise.pend.stage === 'battle') P8.skipBattleSquare(S, m); return x; } return null; }
const snap = (E) => ({ g: E.S.g, fat: E.m.raise.fatigue, st: STATS.map((k) => E.m[k]), field: j(E.m.raise.field) });

test('NX-01：サイコロの面の数は config（rules.diceSides）。6面なら 1〜6 だけ・等確率、3面なら 1〜3 だけ。旧形式 rules.dice.{min,max} も読める', () => {
  const { P7, CH } = loadEngine();
  for (const sides of [3, 6]) { const r = lcg(11 + sides), cnt = {}; for (let i = 0; i < 60000; i++) { const v = P7.rollDie(sides, r); cnt[v] = (cnt[v] || 0) + 1; }
    assert.deepEqual(Object.keys(cnt).map(Number).sort((a, b) => a - b), Array.from({ length: sides }, (_, i) => i + 1), `${sides}面：${Object.keys(cnt)}`);
    for (let v = 1; v <= sides; v++) assert.ok(Math.abs(cnt[v] / 60000 - 1 / sides) < 0.01, `${sides}面の出目${v}：${cnt[v]}`); }
  assert.deepEqual([0, 0.1666, 0.1667, 0.5, 0.8333, 0.9999].map((x) => P7.rollDie(6, () => x)), [1, 1, 2, 4, 5, 6], '固定乱数で期待した出目');
  assert.deepEqual([0, 0.34, 0.67, 0.9999].map((x) => P7.rollDice(() => x)), [1, 2, 3, 3], 'rollDice（特訓・旧ボード）は 1〜3 のまま');
  assert.throws(() => P7.rollDie(0)); assert.throws(() => P7.rollDie(6, () => 1));
  assert.equal(CH.rulesOf({ rules: { diceSides: 6 } }).diceSides, 6); assert.equal(CH.rulesOf({}).diceSides, 3, '既定は 1〜3');
  assert.deepEqual(CH.rulesOf({ rules: { dice: { min: 1, max: 6 } } }).dice, { min: 1, max: 6 }, '旧形式');
  assert.equal(CH.rulesOf(CH.getConfig(1)).diceSides, 3, 'Chapter 1 は 1〜3（2026-10-01 夜。6面の仕組みは合成 config で確かめる）');
});

test('NX-02：MMP8.roll は面の数をドライバから受け取る。6面の Chapter で出目6は6地点進む（出目＝移動距離）。エンジンを使わない Chapter は 1〜3', () => {
  const E = onNext(); const { P8, m } = E;
  assert.equal(P8.diceSides(m), 6);
  for (const v of [1, 2, 3, 4, 5, 6]) { const E2 = onNext({}, 3); const t = turn(E2, v); assert.equal(t.length, v, `出目${v}で${v}地点`); assert.equal(E2.m.raise.node, `s1_${v}`); assert.equal(E2.m.raise.pend.roll, v); assert.equal(E2.m.raise.pend.left, 0); }
  const E1 = loadEngine(); const S = E1.P8.newSave(); S.m = mon(E1.P7, E1.P8, S); E1.P8.depart(S, S.m, lcg(1));
  assert.equal(E1.P8.diceSides(S.m), 3); assert.equal(E1.P8.roll(S, S.m, () => 0.999).value, 3, 'Chapter 1 の最大は 3（2026-10-01 夜）');
  assert.equal(E1.P8.diceSides({ raise: { ch: 4 } }), 3, 'エンジンを使わない Chapter は 1〜3');
});

test('NX-03：通過と停止の分離：出目6で通った 5地点（能力・イベント・宝箱・バトルを含む）は何も起こさず、6地点目だけ resolve する', () => {
  const E = onNext({}, 5); const { P8, CH, S, m, g } = E, A = m.raise.field.nodeAssignments;
  // 通過する5地点に「必ず何かある」よう、割り当てを直接置く（配置の検査は resolve に関係しない）
  Object.assign(A, { s1_1: { t: 'stat', k: 'po' }, s1_2: { t: 'treasure', tier: 'normal' }, s1_3: { t: 'event', ev: 'coin', tier: 'normal' }, s1_4: { t: 'battle', bt: 'wild' }, s1_5: { t: 'event', ev: 'shade', tier: 'normal', recovery: true } }); delete A.s1_6;
  const passed = []; CH.registerPassHandler('__probe', () => {});   // 種類 '__probe' は無い＝既定は何も起きない
  const before = snap(E); const t = turn(E, 6); assert.deepEqual(t, ['s1_1', 's1_2', 's1_3', 's1_4', 's1_5', 's1_6']);
  const after = snap(E);
  assert.deepEqual([after.g, after.st, after.field.consumedEvents, after.field.openedTreasures, after.field.clearedStats], [before.g, before.st, [], [], []], '通過した地点では所持金・能力・記録が変わらない');
  assert.equal(after.fat, before.fat + CH.rollFatigue(CH.rulesOf(E.cfg), 6), '疲れは出目の分だけ');
  assert.equal(m.raise.pend.stage, 'resolve'); assert.equal(m.raise.node, 's1_6');
  const r = P8.resolveLanding(S, m, lcg(2)); assert.equal(r.ok, true); assert.equal(CH.typeAt(m, 's1_6').t, 'normal'); assert.equal(r.fx.kind, 'none', '停止地点（通常）だけ処理');
  void passed;
  // onPass は登録した種類だけ呼ばれる（既定は無し）。登録しても停止地点の処理とは別
  const E2 = onNext({}, 5); Object.assign(E2.m.raise.field.nodeAssignments, { s1_2: { t: 'treasure', tier: 'normal' } });
  const seen = []; E2.CH.registerPassHandler('treasure', (S2, m2, id) => { seen.push(id); return null; });
  turn(E2, 3); assert.deepEqual(seen, ['s1_2'], '通過処理は通過した地点だけ（停止地点 s1_3 は呼ばれない）'); assert.deepEqual(E2.m.raise.field.openedTreasures, [], '通過処理を登録しても宝箱は開かない');
});

test('NX-04：強制停止（forceStop）：ライバルの地点は出目が残っていても止まり、残りの歩数は消える（次のターンへ持ち越さない）。画面側の if ではなく config（forceStopKinds／path.forceStop／nodeOverrides）', () => {
  const E = onNext(); const { P8, CH, S, m, g } = E;
  const rival = g.order.find((id) => g.nodes[id].kind === 'rival'), before = g.order[g.order.indexOf(rival) - 2];
  assert.equal(g.nodes[rival].forceStop, true); assert.equal(P8.trackOf(E.cfg.chapterId).nodes[rival].stop, true, 'MMP8 のマップに stop:true');
  m.raise.node = before; m.raise.pend = null; m.raise.turnsUsed = 3;
  const t = turn(E, 6); assert.deepEqual(t, [g.order[g.order.indexOf(rival) - 1], rival], '2地点で強制停止');
  assert.deepEqual([m.raise.node, m.raise.pend.left, m.raise.pend.stage, m.raise.pend.roll], [rival, 0, 'resolve', 6]);
  const r = P8.resolveLanding(S, m, lcg(3)); assert.deepEqual([r.fx.kind, r.fx.battleType, m.raise.pend.stage], ['battle', 'rival', 'battle']);
  P8.skipBattleSquare(S, m); assert.equal(m.raise.pend, null); assert.equal(m.raise.turnsUsed, 4);
  const t2 = turn(E, 1); assert.deepEqual(t2, [g.order[g.order.indexOf(rival) + 1]], '次のターンは余った歩数を使わず、出目どおり1地点');
  // 個別の指定：path.forceStop＝[index]・nodeOverrides[id].forceStop＝true・種類（forceStopKinds）は既定で無し
  const c2 = makeNextConfig({ chapterId: 4, forceStopKinds: [] }); c2.paths[0].forceStop = [4]; c2.nodeOverrides = { s2_3: { forceStop: true } }; const g2 = CH.registerConfig(c2);
  assert.deepEqual([g2.nodes.s1_4.forceStop, g2.nodes.s2_3.forceStop, g2.nodes[g2.order.find((id) => g2.nodes[id].kind === 'rival')].forceStop], [true, true, false]);
  // Chapter 1：強制停止はライバルだけ（config.forceStopKinds）
  const g1 = CH.buildGraph(CH.getConfig(1)); assert.deepEqual(Object.values(g1.nodes).filter((n) => n.forceStop).map((n) => n.kind), ['rival']); assert.equal(Object.values(P8.trackOf(1).nodes).filter((n) => n.stop).length, 1);
  // 画面側・エンジンにライバル専用の分岐を書かない
  for (const f of ['js/chapter/engine.js', 'js/chapter/field-view.js', 'js/phase8/raising.js']) assert.doesNotMatch(rd(f).split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n'), /kind\s*===\s*'rival'\s*(&&|\?)[^\n]*(left\s*=\s*0|stage\s*=\s*'resolve')/, `${f}：ライバル専用の停止処理を書かない`);
  assert.match(rd('js/phase8/raising.js'), /trk\.nodes\[id\]\.stop === true/, 'MMP8 はマップの node.stop だけを見る');
});

test('NX-05：分岐の直後に強制停止・ゴールの手前で強制停止（出目が大きくてもゴールを飛ばさない）', () => {
  const E = onNext(); const { P8, S, m, g } = E;
  const rival = g.order.find((id) => g.nodes[id].kind === 'rival');
  m.raise.node = g.order[g.order.indexOf(rival) - 1]; m.raise.pend = null;
  turn(E, 6); assert.equal(m.raise.node, rival, '1地点先の強制停止（ゴールは2地点先）'); land(E);
  turn(E, 6); assert.equal(m.raise.node, g.goal, 'ゴールで止まり残りは消える'); const r = land(E); assert.equal(r.goal, true); assert.equal(P8.boardPhase(m), 'goal');
  // 分岐で選んだ先が強制停止なら選んだ時点で止まる
  const c = makeNextConfig({ chapterId: 4 }); c.nodeOverrides = { ra_0: { forceStop: true } }; E.CH.registerConfig(c);
  const E2 = (() => { const X = loadEngine(); X.CH.registerConfig(c); const S2 = X.P8.newSave(); S2.m = mon(X.P7, X.P8, S2); Object.assign(S2.m.raise, { state: 'farm', ch: 4, log: [{ ch: 1 }, { ch: 2 }, { ch: 3 }] }); S2.m.prog.rankClr = [true, true, true, true, false, false]; X.P8.depart(S2, S2.m, lcg(2)); return { ...X, S: S2, m: S2.m, cfg: c, g: X.CH.buildGraph(c) }; })();
  const br = E2.g.branchAt[0]; E2.m.raise.node = E2.g.order[E2.g.order.indexOf(br) - 1]; E2.m.raise.pend = null;
  const t = turn(E2, 6, 'ra_0'); assert.deepEqual(t, [br, 'ra_0']); assert.deepEqual([E2.m.raise.pend.stage, E2.m.raise.pend.left], ['resolve', 0]);
});

test('NX-06：30ターン制：ターンの状態は Engine（turnInfo）で一元管理。30ターン目の移動・停止イベントを終えてから終了（途中で終わらない）', () => {
  const E = onNext(); const { P8, CH, S, m } = E;
  assert.deepEqual(CH.turnInfo(m), { used: 0, limit: 30, left: 30, current: 1, isLast: false, exhausted: false });
  m.raise.turnsUsed = 29; Object.assign(m.raise.field.nodeAssignments, { s1_4: { t: 'event', ev: 'coin', tier: 'normal' } });
  assert.deepEqual(CH.turnInfo(m), { used: 29, limit: 30, left: 1, current: 30, isLast: true, exhausted: false });
  const g0 = S.g; turn(E, 4); assert.deepEqual([m.raise.turnsUsed, P8.boardPhase(m), CH.turnInfo(m).exhausted, P8.turnsLeft(m)], [30, 'resolve', false, 0], '30ターン目の停止処理はまだ残っている');
  const r = P8.resolveLanding(S, m, lcg(4)); assert.equal(r.fx.kind, 'gold'); assert.equal(S.g, g0 + 50, '30ターン目の停止イベントが起きる');
  assert.deepEqual([r.timeUp, r.goal, P8.boardPhase(m), CH.turnInfo(m).exhausted], [true, true, 'goal', true], "onTimeUp:'tournament'：停止処理のあと大会へ（ゴール扱い）");
  assert.equal(P8.canStartTournament(S, m, 0).ok, true, '既存の大会処理へそのまま渡せる');
  // 30ターン目にバトル地点：バトルを終えてから
  const E2 = onNext({}, 8); E2.m.raise.turnsUsed = 29; Object.assign(E2.m.raise.field.nodeAssignments, { s1_2: { t: 'battle', bt: 'wild' } });
  turn(E2, 2); const r2 = E2.P8.resolveLanding(E2.S, E2.m, lcg(5)); assert.deepEqual([r2.fx.kind, E2.P8.boardPhase(E2.m)], ['battle', 'battle']);
  E2.P8.beginBattle(E2.S, E2.m, { kind: 'practice', rank: 0 }); E2.P8.markBattleDone(E2.S); const f = E2.P8.finishBattle(E2.S, E2.m); assert.deepEqual([f.timeUp, f.goal, E2.P8.boardPhase(E2.m)], [true, true, 'goal']);
  // 既定（onTimeUp:'end'。現行の Chapter 1 と同じ）：停止処理のあと timeup（大会なし）
  const E3 = onNext({ onTimeUp: 'end' }); E3.m.raise.turnsUsed = 29; turn(E3, 3); const r3 = E3.P8.resolveLanding(E3.S, E3.m, lcg(6));
  assert.deepEqual([r3.timeUp, r3.goal, E3.P8.boardPhase(E3.m)], [true, undefined, 'timeup']); assert.equal(E3.P8.canRoll(E3.m), false);
  assert.equal(E3.CH.rulesOf(E3.CH.getConfig(1)).onTimeUp, 'end', '現行 Chapter 1 は変えない');
  // 30ターン目に休んでも終わり
  // 30ターン目を休んで終えたときも同じ規則：'tournament' なら大会へ、'end' なら timeup
  const E4 = onNext(); E4.m.raise.turnsUsed = 29; const r4 = E4.P8.rest(E4.S, E4.m); assert.deepEqual([r4.timeUp, r4.goal, E4.P8.boardPhase(E4.m)], [true, true, 'goal']);
  const E5 = onNext({ onTimeUp: 'end' }); E5.m.raise.turnsUsed = 29; const r5 = E5.P8.rest(E5.S, E5.m); assert.deepEqual([r5.timeUp, r5.goal, E5.P8.boardPhase(E5.m)], [true, undefined, 'timeup']);
});

test('NX-07：30ターンを最後まで通す（6面・強制停止・分岐あり）。ターンは 30 で止まり、それ以上は振れない', () => {
  for (const seed of [1, 2, 3]) {
    const E = onNext({}, 100 + seed); const { P8, S, m } = E, rnd = lcg(500 + seed);
    let turns = 0;
    for (let guard = 0; guard < 1000; guard++) {
      const ph = P8.boardPhase(m);
      if (ph === 'goal' || ph === 'timeup') break;
      if (ph === 'roll') { if (!P8.canRoll(m)) { P8.rest(S, m); turns++; continue; } P8.roll(S, m, rnd); turns++; continue; }
      if (ph === 'move') { P8.step(S, m); continue; }
      if (ph === 'branch') { P8.chooseBranch(S, m, m.raise.pend.opts[0]); continue; }
      if (ph === 'resolve') { const r = P8.resolveLanding(S, m, rnd); if (r.fx.kind === 'battle') { P8.beginBattle(S, m, { kind: 'practice', rank: 0 }); P8.markBattleDone(S); P8.finishBattle(S, m, rnd); } continue; }
      throw new Error('phase ' + ph);
    }
    assert.ok(m.raise.turnsUsed <= 30 && turns === m.raise.turnsUsed, `seed ${seed}：${m.raise.turnsUsed}`);
    assert.ok(['goal'].includes(P8.boardPhase(m)), 'ゴール到達か、30ターン後に大会へ');
    assert.equal(P8.roll(S, m, rnd).ok, false);
  }
});

test('NX-08：100〜200マスのルート：総マス数・背景の枚数は config から（コードに固定しない）。同じ仕組みで 100・150・200 マスが成立する', () => {
  const { CH } = loadEngine();
  for (const [scenes, per, chapterId] of [[7, 15, 2], [9, 17, 3], [12, 15, 4]]) {
    const cfg = makeNextConfig({ chapterId, scenes, per }), g = CH.registerConfig(cfg), L = CH.routeLengths(g);
    assert.ok(L.nodes >= 100 && L.nodes <= 220, `${scenes}×${per}：${L.nodes} ノード`); assert.ok(L.min >= 100 - 1 && L.max <= 210, `歩数 ${L.min}〜${L.max}`);
    assert.equal(CH.sceneOrder(cfg, g).length, scenes); assert.deepEqual(CH.sceneNodes(g, 1).length, per);
    const lay = CH.generateLayout(cfg, 12345); assert.deepEqual(CH.validateLayout(cfg, g, lay.assign), []);
    assert.ok(CH.stepsToMerge(g, g.start, g.branchAt[0]) > 50, '固定の上限（200）に頼らない距離の計算');
    const t = CH.trackOf(cfg); assert.equal(Object.keys(t.nodes).length, L.nodes);
  }
  const code = [rd('js/chapter/engine.js'), rd('js/chapter/field-view.js'), rd('js/phase8/raising.js')].map((s) => s.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n')).join('\n');
  assert.doesNotMatch(code, /\b(135|130|150|200)\s*(;|\)|,)\s*$/m, '総マス数の固定値を書かない'); assert.doesNotMatch(code, /field\s*\+\s*1|fieldId\s*\+\s*1/, '背景IDの連番を前提にしない');
  assert.doesNotMatch(code, /n < 200/, 'stepsToMerge の固定上限');
});

test('NX-09：固定＋可変：骨格（start・branch・merge・rival・special・goal）は config で固定、候補ノードの内容は配置（seed）で決まり、描画位置（座標）と内容（種類）は別', () => {
  const E = onNext(); const { CH, g, m, cfg } = E;
  const kinds = {}; for (const n of Object.values(g.nodes)) kinds[n.kind] = (kinds[n.kind] || 0) + 1;
  assert.deepEqual([kinds.start, kinds.branch, kinds.merge, kinds.rival, kinds.special, kinds.goal], [1, 1, 1, 1, 1, 1]); assert.ok(kinds.slot > 100, `候補ノード ${kinds.slot}`);
  const A = m.raise.field.nodeAssignments;
  for (const [id, a] of Object.entries(A)) { if (a.fixed) { assert.ok(['strong', 'rival'].includes(g.nodes[id].kind), `${id} は固定の骨格`); continue; } assert.equal(g.nodes[id].kind, 'slot', `${id} は候補ノード`); assert.ok(CH.SPECIAL.includes(a.t)); assert.ok(typeof g.nodes[id].x === 'number', '座標は骨格、内容は割り当て'); }
  assert.deepEqual(CH.typeAt(m, 'm_1'), { t: 'special', fixed: true, handler: 'gold', params: { amount: 100 }, text: 'Chapter固有のイベント（合成）', once: true });
  const rival = g.order.find((id) => g.nodes[id].kind === 'rival'); assert.deepEqual(CH.typeAt(m, rival), { t: 'battle', bt: 'rival', fixed: true });
  // 別の seed なら可変地点だけ変わる（固定は同じ）
  const b = CH.generateLayout(cfg, 999).assign; assert.notDeepEqual(b, A); for (const id of Object.keys(b)) assert.ok(b[id].fixed ? g.nodes[id].kind === 'rival' : g.nodes[id].kind === 'slot');
  assert.deepEqual(b[rival], A[rival], '固定のライバルは seed に関係なく同じ');
  // special：1回だけ（consumedEvents に記録）
  m.raise.node = 'm_1'; m.raise.pend = { roll: 1, left: 0, stage: 'resolve' }; const g0 = E.S.g; const r = E.P8.resolveLanding(E.S, m, lcg(1));
  assert.deepEqual([r.fx.kind, r.fx.amount, r.fx.special, E.S.g - g0], ['gold', 100, 'm_1', 100]); assert.ok(m.raise.field.consumedEvents.includes('m_1'));
  m.raise.pend = { roll: 1, left: 0, stage: 'resolve' }; assert.equal(E.P8.resolveLanding(E.S, m, lcg(1)).fx.kind, 'none', '2回目は起きない');
});

test('NX-10：マス種別の正式名：stat_life…stat_toughness・event・rest・treasure・wild・strong・rival・special（既存の t／k／bt との対応。新しい名前を乱立させない）', () => {
  const { CH } = loadEngine();
  assert.deepEqual(Object.keys(CH.NODE_TYPES), ['stat_life', 'stat_power', 'stat_intelligence', 'stat_accuracy', 'stat_evasion', 'stat_toughness', 'event', 'rest', 'treasure', 'wild', 'strong', 'rival', 'special', 'start', 'goal', 'normal']);
  assert.deepEqual(CH.assignOfType('stat_power'), { t: 'stat', k: 'po' }); assert.deepEqual(CH.assignOfType('rival'), { t: 'battle', bt: 'rival' }); assert.deepEqual(CH.assignOfType('rest'), { t: 'event', recovery: true }); assert.equal(CH.assignOfType('nope'), null);
  assert.equal(CH.nodeTypeName({ t: 'stat', k: 'li' }), 'stat_life'); assert.equal(CH.nodeTypeName({ t: 'battle', bt: 'strong' }), 'strong'); assert.equal(CH.nodeTypeName({ t: 'event', ev: 'shade', recovery: true }), 'rest'); assert.equal(CH.nodeTypeName({ t: 'event', ev: 'coin' }), 'event'); assert.equal(CH.nodeTypeName(null), 'normal');
  // Chapter 1 の配置を正式名で数えられる（内部の割り当ては変わらない）
  const cfg = CH.getConfig(1), a = CH.generateLayout(cfg, 1).assign, names = new Set(Object.values(a).map(CH.nodeTypeName));
  for (const k of ['stat_life', 'stat_power', 'event', 'treasure', 'wild']) assert.ok(names.has(k), k);
});

test('NX-11：可変マスの配置は seed で決まり、同じ seed＝同じ配置。Chapter開始時に生成した結果をセーブし、ロード後（migrateSave・loadFromStorage）も同じ盤面・同じ位置・同じ残りターン', () => {
  const E = onNext({}, 77); const { CH, P8, S, m, cfg } = E;
  const a = CH.generateLayout(cfg, 4242), b = CH.generateLayout(cfg, 4242); assert.deepEqual(a, b); assert.notDeepEqual(CH.generateLayout(cfg, 4243).assign, a.assign);
  assert.deepEqual(CH.generateLayout(cfg, m.raise.field.layoutSeed).assign, m.raise.field.nodeAssignments, 'セーブした割り当て＝seed から作った割り当て');
  turn(E, 5); land(E); turn(E, 4); land(E); turn(E, 6);
  const saved = j(S), S2 = P8.migrateSave(saved);
  assert.deepEqual(S2.m.raise.field, m.raise.field); assert.deepEqual([S2.m.raise.node, S2.m.raise.turnsUsed, S2.m.raise.turnLimit, S2.m.raise.pend, S2.m.raise.fatigue], [m.raise.node, 3, 30, m.raise.pend, m.raise.fatigue]);
  assert.deepEqual(P8.ensureBoardPosition(S2, S2.m), { changed: false }, 'ロード後にフィールドを開いても引き直さない');
  const store = { d: {}, getItem(k) { return this.d[k] ?? null; }, setItem(k, v) { this.d[k] = v; } }; store.setItem('mr4v6', JSON.stringify(S));
  const r = P8.loadFromStorage(store); assert.equal(r.status, 'ok'); assert.deepEqual(r.S.m.raise.field.nodeAssignments, m.raise.field.nodeAssignments); assert.equal(r.S.v, 6);
  // 続きの移動も同じ（pend の残りは 0＝停止処理から）
  assert.equal(S2.m.raise.pend.stage, 'resolve'); const x = P8.resolveLanding(S2, S2.m, lcg(9)); assert.equal(x.ok, true);
});

test('NX-12：既存セーブとの互換：version 6・キー mr4v6・checkpoint（pend）の形は変えない。疲れ・配置は任意項目のまま。旧セーブ（fatigue／field 無し・旧 Chapter 1 の地点）は今までどおり読める', () => {
  const E = onNext(); const { P8, S, m } = E;
  assert.equal(P8.SAVE_VERSION, 6); assert.equal(P8.SAVE_KEY, 'mr4v6'); assert.equal(S.v, 6);
  assert.deepEqual(Object.keys(m.raise).sort(), ['battle', 'ch', 'fatigue', 'field', 'goal', 'log', 'node', 'pend', 'state', 'tour', 'trainRun', 'turnLimit', 'turnsUsed'].sort(), 'm.raise に新しい項目を足していない');
  assert.deepEqual(Object.keys(m.raise.field).sort(), ['branch', 'chapterId', 'clearedStats', 'consumedEvents', 'fieldId', 'layoutSeed', 'nodeAssignments', 'openedTreasures', 'patternId'].sort(), 'field に新しい項目を足していない');
  turn(E, 6); assert.deepEqual(Object.keys(m.raise.pend).sort(), ['fatigueAdded', 'left', 'roll', 'stage'], 'pend（checkpoint）の形は同じ');
  const old = j(S); delete old.m.raise.fatigue; delete old.m.raise.field; const S2 = P8.migrateSave(old); assert.deepEqual([S2.v, S2.m.raise.fatigue, S2.m.raise.field], [6, 0, null]);
  const E1 = loadEngine(); const S1 = E1.P8.newSave(); S1.m = mon(E1.P7, E1.P8, S1); E1.P8.depart(S1, S1.m, lcg(1));
  const legacy = j(S1); legacy.m.raise.node = 'p7'; legacy.m.raise.field = null; const S3 = E1.P8.migrateSave(legacy); E1.P8.ensureBoardPosition(S3, S3.m);
  assert.deepEqual([S3.m.raise.node, S3.m.raise.turnsUsed, S3.m.raise.field.chapterId], ['f1_0', 0, 1], '旧 Chapter 1 の地点は開始地点から（従来どおり）');
});

test('NX-13：疲れ：出目 1〜3 は正式値（+3/+5/+7）。4〜6 は表の最大（+7）【暫定・未決。config の fatigueRules.roll に書けば置き換わる】', () => {
  const { CH } = loadEngine();
  assert.deepEqual([1, 2, 3, 4, 5, 6].map((v) => CH.rollFatigue(CH.DEFAULT_RULES, v)), [3, 5, 7, 7, 7, 7]);
  assert.deepEqual([4, 6].map((v) => CH.rollFatigue(CH.rulesOf({ rules: { fatigueRules: { roll: { 1: 3, 2: 5, 3: 7, 4: 9, 5: 11, 6: 13 } } } }), v)), [9, 13], 'config で 4〜6 を決められる');
  const E = onNext(); E.P8.roll(E.S, E.m, die(6)); assert.equal(E.CH.fatigue(E.m), 7); assert.equal(E.m.raise.pend.fatigueAdded, 7);
});

test('NX-14：サイコロの演出（MMCHD）：面の数は configure({ sides })。停止面が無い出目（4〜6）は数字で出す fallback（画像を足さなくても壊れない）', async () => {
  const w = {}; new Function('window', rd('js/phase7/progression.js'))(w); new Function('window', rd('js/chapter/dice-renderer.js'))(w); const D = w.MMCHD;
  assert.deepEqual([D.configure().sides, D.configure().max], [3, 3], '既定 1〜3');
  D.configure({ sides: 6, resultSprites: { 1: 'a1.svg', 2: 'a2.svg', 3: 'a3.svg' } });
  const r = lcg(5), seen = new Set(); for (let i = 0; i < 6000; i++) seen.add(D.roll({ rnd: r })); assert.deepEqual([...seen].sort(), [1, 2, 3, 4, 5, 6]);
  for (const v of [4, 5, 6]) { const x = D.rollDice({ forcedResult: v }); assert.equal(x.result, v); assert.equal(await x.animationPromise, true, '停止面が無くても演出は完了する'); assert.equal(D.resultSprite(v), null); }
  assert.deepEqual(D.missingSprites(), [4, 5, 6], '未着の停止面を確認できる'); assert.throws(() => D.rollDice({ forcedResult: 7 }));
  D.configure({ sides: 3 }); assert.throws(() => D.rollDice({ forcedResult: 4 })); assert.deepEqual(D.missingSprites(), []);
  assert.match(rd('js/chapter/dice-renderer.js'), /ov\.dataset\.face = 'number'/, '停止面が無いときは数字の輪');
  assert.match(rd('js/chapter/field-view.js'), /sides: MMCH\.rulesOf\(V\.cfg\)\.diceSides/, '画面は config の面の数で演出する');
});

test('NX-15：同行者（フィナ）のリアクションの差し込み口：停止地点の結果 → key → config.companion.reactions の行。未登録なら null（何も出さない）。画面は registerReactionRenderer で差し替える', () => {
  const E = onNext(); const { CH, m } = E;
  assert.deepEqual([...CH.REACTION_KEYS], ['gold', 'stat_up', 'stat_great', 'stat_fail', 'treasure', 'wild', 'strong', 'rival', 'tired', 'recovered', 'goal_near', 'time_last']);
  assert.deepEqual([{ kind: 'gold' }, { kind: 'chstat', outcome: 'ok' }, { kind: 'chstat', outcome: 'great' }, { kind: 'chstat', outcome: 'fail' }, { kind: 'treasure' }, { kind: 'battle', battleType: 'wild' }, { kind: 'battle', battleType: 'rival' }, { kind: 'fatigue' }, { kind: 'none' }].map((fx) => CH.reactionKeyOf(fx)),
    ['gold', 'stat_up', 'stat_great', 'stat_fail', 'treasure', 'wild', 'rival', 'recovered', null]);
  assert.deepEqual(CH.companionReaction(m, { kind: 'gold', amount: 50 }, { rnd: () => 0 }), { key: 'gold', npc: 'fina', expression: 'normal', text: 'やった、お金だ！' });
  assert.deepEqual(CH.companionReaction(m, { kind: 'battle', battleType: 'rival' }), { key: 'rival', npc: 'fina', expression: 'serious', text: 'ライバルが来た…！' });
  assert.equal(CH.companionReaction(m, { kind: 'treasure' }), null, '本文が無い種類は出さない');
  const E1 = loadEngine(); const S = E1.P8.newSave(); S.m = mon(E1.P7, E1.P8, S); E1.P8.depart(S, S.m, lcg(1));
  assert.equal(E1.CH.companionReaction(S.m, { kind: 'gold', amount: 50 }), null, '現行 Chapter 1 には本文が無い＝何も出さない（会話は後で正式に入れる）');
  E1.CH.registerReactionResolver(() => ({ key: 'x', npc: 'fina', expression: 'smile', text: '差し替え' })); assert.equal(E1.CH.companionReaction(S.m, { kind: 'gold' }).text, '差し替え');
  const view = rd('js/chapter/field-view.js'); assert.match(view, /registerReactionRenderer/); assert.match(view, /companionReaction\(m, fx\)/); assert.match(view, /if \(!reactionRenderer\) return;/, '描画が未登録なら何もしない（会話UIは未決）');
});

test('NX-16：Chapter 1（1〜3・正式背景10枚・40ターン・大会なしの timeup・ライバル強制停止）。ダンは Chapter に同行しない（同行者はフィナ＋育成中のモンスター）', () => {
  const E = loadEngine(); const { CH, P8 } = E, cfg = CH.getConfig(1), R = CH.rulesOf(cfg);
  assert.deepEqual([R.diceSides, R.turnLimit, R.onTimeUp, new Set(cfg.fieldScenes.map((s) => s.bg)).size, cfg.forceStopKinds], [3, 40, 'end', 10, ['rival']]);
  assert.deepEqual(CH.generateLayout(cfg, 12345).assign, CH.generateLayout(cfg, 12345).assign);
  // 同じ seed の配置は基盤の追加前後で変わらない（配置の乱数は layoutRules.counts に書いた種類だけ消費する）：代表的な seed の割り当て数
  const a = CH.generateLayout(cfg, 1).assign, cnt = {}; for (const x of Object.values(a)) cnt[x.t] = (cnt[x.t] || 0) + 1;
  assert.ok(cnt.stat >= 12 && cnt.event >= 6 && cnt.battle >= 2 && cnt.treasure >= 3, JSON.stringify(cnt));
  // 同行者：ダンの台詞は Chapter フィールド（field-view・engine・config）に無い。出発時の掛け合い（DAN_TALK.handoff）は index.html の1か所だけ（内容の見直しは仕様側＝報告）
  for (const f of ['js/chapter/engine.js', 'js/chapter/field-view.js', 'js/chapter/configs/ch1a.js']) assert.doesNotMatch(rd(f), /DAN_TALK|npc:\s*['"]dan['"]|ダン/, `${f}：ダンは Chapter に出ない`);
  const html = rd('index.html'); assert.equal((html.match(/DAN_TALK\.handoff/g) || []).length, 1, '出発時の掛け合いは1か所');
  const view = rd('js/chapter/field-view.js'); assert.doesNotMatch(view.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n'), /1・2・3|DICE_MAX|<= 3\b/, '画面側に 1〜3 の固定なし');
});
