// =========================================================
// Chapter 1（リアル巨大ボード方式）の距離・密度の比較（最終確定の前に見る資料。テストではない）
//  背景1枚あたりのマス数（ch1a.js の NODES：共通・橋・森・会場。周回なし＝背景はどれも1回だけ）の候補ごとに、進行シミュレーション（実物の MMP7・MMP8・MMCH）で
//   ・橋ルート／森ルートの総マス数
//   ・ルート固定（橋＝大会へ急ぐ／森＝寄り道して育成）ごとの 平均・中央値・p10／p90・30ターン以内の到達率・停止地点の回数
//   ・休む回数を決めた場合（0回＝疲れ100で動けないときだけ／1回・2回・3回＝疲れ40以上になった最初の k 回だけ休む）の平均・到達率
//  を出す。配置の数（counts）は短いほうのルートの長さに比例させ、候補どうしの密度をそろえる。
//  使い方：node tests/chapter-balance.mjs [回数] [候補ID（省略で全部）]
// =========================================================
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { lcg } from './chapter-sim.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function loadWithNodes(nodes) {
  const w = { MMCH_CH1A_NODES: nodes };
  for (const f of ['js/phase7/progression.js', 'js/phase8/league.js', 'js/phase8/raising.js', 'js/phase10/monsters.js', 'js/phase9/chapters.js', 'js/chapter/engine.js', 'js/chapter/configs/ch1a.js', 'js/chapter/configs/ch2a.js'])
    new Function('window', readFileSync(path.join(ROOT, f), 'utf8'))(w);
  for (const c of w.MMP9C.CHAPTERS) w.MMP7.registerChapterBoard(c.no, c.track, { provisional: false });
  return { P7: w.MMP7, P8: w.MMP8, CH: w.MMCH, w };
}
const L = (shared, bridge, forest, goal) => ({ shared, bridge, forest, goal });
export const CANDIDATES = [
  { id: 'G', label: '共通5・橋5・森7・会場5（短め）', nodes: L(5, 5, 7, 5) },
  { id: 'H', label: '共通6・橋5・森8・会場6', nodes: L(6, 5, 8, 6) },
  { id: 'I', label: '共通6・橋6・森8・会場6（今の暫定候補）', nodes: L(6, 6, 8, 6) },
  { id: 'J', label: '共通6・橋6・森9・会場6', nodes: L(6, 6, 9, 6) },
  { id: 'K', label: '共通7・橋6・森9・会場7（長め）', nodes: L(7, 6, 9, 7) },
];
const pct = (xs, q) => { const a = [...xs].sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(a.length * q))] : null; };
const avg = (xs) => (xs.length ? +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : null);
const mon = (P7, P8, S) => { const m = P8.initIndividual(S, { sp: 0, name: 'シム', age: 0, span: 30, h: 0, rk: 0, fa: 0, st: 0, last: null, li: 100, po: 100, in: 100, hi: 100, ev: 100, de: 100, sk: [0, 1, 2, 3], eq: [0, 1, 2, 3, -1, -1] }); P7.ensureProg(m); return m; };
/**
 * 1回の Chapter 1。route：'bridge'／'forest'／null（ランダム）。rests：休む方針
 *  'auto'＝疲れ86以上で休む（次の出目で100に届くおそれ）／数値 k＝疲れ40以上になった最初の k 回だけ休み、それ以外は疲れ100で動けないときだけ
 */
function runOnce(E, seed, route, rests) {
  const { P7, P8, CH } = E, rnd = lcg(seed), S = P8.newSave(); S.m = mon(P7, P8, S); const m = S.m;
  P8.depart(S, m, rnd);
  const st = { stat: 0, event: 0, battle: 0, treasure: 0, rests: 0, forced: 0 };
  let planned = typeof rests === 'number' ? rests : 0;
  for (let guard = 0; guard < 2000; guard++) {
    const ph = P8.boardPhase(m);
    if (ph === 'goal' || ph === 'timeup') break;
    if (ph === 'roll') {
      const f = CH.fatigue(m);
      if (!P8.canRoll(m)) { st.rests++; st.forced++; P8.rest(S, m); continue; }
      if (rests === 'auto' && f >= 86) { st.rests++; P8.rest(S, m); continue; }
      if (typeof rests === 'number' && planned > 0 && f >= 40) { planned--; st.rests++; P8.rest(S, m); continue; }
      P8.roll(S, m, rnd); continue;
    }
    if (ph === 'move') { P8.step(S, m); continue; }
    if (ph === 'branch') { const o = m.raise.pend.opts; P8.chooseBranch(S, m, route ? o.find((x) => x.startsWith(route === 'bridge' ? 'a' : 'b')) : o[Math.floor(rnd() * o.length)]); continue; }
    if (ph === 'resolve') { const r = P8.resolveLanding(S, m, rnd), fx = r.fx || {}; if (fx.kind === 'chstat') st.stat++; else if (fx.kind === 'treasure') st.treasure++; else if (fx.ev) st.event++; if (fx.kind === 'battle') { st.battle++; P8.beginBattle(S, m, { kind: 'practice', rank: 0 }); P8.markBattleDone(S); P8.finishBattle(S, m, rnd); } continue; }
    throw new Error('phase ' + ph);
  }
  return { ...st, turns: m.raise.turnsUsed, goal: !!m.raise.goal, branch: m.raise.field && m.raise.field.branch };
}
function summarize(runs) {
  const reached = runs.filter((r) => r.goal), t = reached.map((r) => r.turns);
  return { n: runs.length, reach: +(reached.length / runs.length).toFixed(3), avg: avg(t), median: pct(t, 0.5), p10: pct(t, 0.1), p90: pct(t, 0.9), rests: avg(runs.map((r) => r.rests)), forced: avg(runs.map((r) => r.forced)),
    stops: { stat: avg(runs.map((r) => r.stat)), event: avg(runs.map((r) => r.event)), battle: avg(runs.map((r) => r.battle)), treasure: avg(runs.map((r) => r.treasure)) } };
}
export function evaluate(nodes, n = 1000, seed0 = 20261001) {
  const E = loadWithNodes(nodes), cfg = E.CH.getConfig(1), g = E.CH.buildGraph(cfg), len = E.CH.routeLengths(g);
  const Lb = len.min, rng = (a, b) => [Math.round(Lb * a), Math.round(Lb * b)];
  cfg.layoutRules.counts = { stat: rng(0.2, 0.25), event: rng(0.11, 0.15), battle: rng(0.075, 0.11), treasure: rng(0.05, 0.075) };
  cfg.layoutRules.maxPerStat = Math.ceil(Lb * 0.25 / 6) + 1; cfg.layoutRules.maxBattlesFirst = [Math.min(16, Math.round(Lb * 0.2)), 1];
  const out = { length: { bridge: g.routes[0].seq.length - 1, forest: g.routes[1].seq.length - 1, nodes: len.nodes }, routes: {}, rests: {} };
  const many = (route, rests) => { const runs = []; for (let i = 0; i < n; i++) runs.push(runOnce(E, seed0 + i * 101, route, rests)); return summarize(runs); };
  for (const [k, route] of [['橋（急ぐ）', 'bridge'], ['森（寄り道）', 'forest'], ['自由（ランダム）', null]]) out.routes[k] = many(route, 'auto');
  for (const route of ['bridge', 'forest']) { out.rests[route] = {}; for (const k of [0, 1, 2, 3]) out.rests[route][k] = many(route, k); }
  return out;
}
if (process.argv[1] && process.argv[1].endsWith('chapter-balance.mjs')) {
  const n = +(process.argv[2] || 1000), only = process.argv[3];
  for (const c of CANDIDATES.filter((x) => !only || x.id === only)) {
    const r = evaluate(c.nodes, n);
    console.log(`\n## 候補 ${c.id}：${c.label}　橋ルート ${r.length.bridge}マス／森ルート ${r.length.forest}マス（ノード ${r.length.nodes}）`);
    console.log('  [ルート別・休むは疲れ86以上で]');
    for (const [k, x] of Object.entries(r.routes)) console.log(`   ${k.padEnd(9)} 到達 ${(x.reach * 100).toFixed(1)}%  平均 ${x.avg}  中央値 ${x.median}  p10〜p90 ${x.p10}〜${x.p90}  休む平均 ${x.rests}（うち強制 ${x.forced}）  停止 能力${x.stops.stat}・イベント${x.stops.event}・バトル${x.stops.battle}・宝箱${x.stops.treasure}`);
    console.log('  [休む回数を決めた場合（疲れ40以上の最初の k 回だけ休む。0回＝疲れ100で動けないときだけ）]');
    for (const route of ['bridge', 'forest']) for (const k of [0, 1, 2, 3]) { const x = r.rests[route][k]; console.log(`   ${route === 'bridge' ? '橋' : '森'} 休む${k}回  到達 ${(x.reach * 100).toFixed(1)}%  平均 ${x.avg}  中央値 ${x.median}  p90 ${x.p90}  実際の休む平均 ${x.rests}（うち強制 ${x.forced}）`); }
  }
}
