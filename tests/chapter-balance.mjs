// =========================================================
// Chapter 1（リアル巨大ボード方式）の距離・密度の比較（最終確定の前に見る資料。テストではない）
//  周回数の表（ch1a.js の LAPS）の候補ごとに、1000回の進行シミュレーション（tests/chapter-sim.mjs）で
//  平均・中央値・到達率（30ターン以内）・パーセンタイル・休む回数ごとの到達・ルート（橋／森）ごとの差・戦略（急ぐ＝橋固定／育成重視＝森固定）を出す。
//  使い方：node tests/chapter-balance.mjs [回数]
// =========================================================
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { runOnce, lcg } from './chapter-sim.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function loadWithLaps(laps) {
  const w = { MMCH_CH1A_LAPS: laps };
  for (const f of ['js/phase7/progression.js', 'js/phase8/league.js', 'js/phase8/raising.js', 'js/phase10/monsters.js', 'js/phase9/chapters.js', 'js/chapter/engine.js', 'js/chapter/configs/ch1a.js'])
    new Function('window', readFileSync(path.join(ROOT, f), 'utf8'))(w);
  for (const c of w.MMP9C.CHAPTERS) w.MMP7.registerChapterBoard(c.no, c.track, { provisional: false });
  return { P7: w.MMP7, P8: w.MMP8, CH: w.MMCH, w };
}
const L = (sh, br, fo, go) => ({ '01': sh, '02': sh, '03': sh, '04': sh, '05a': br, '06a': br, '07a': br, '08a': br, '09a': br, '05b': fo, '06b': fo, '07b': fo, '08b': fo, '09b': fo, '10': go });
export const CANDIDATES = [
  { id: 'A 1/1/1/1', laps: L(1, 1, 1, 1) },
  { id: 'B 1/1/2/1', laps: L(1, 1, 2, 1) },
  { id: 'C 2/1/2/1', laps: L(2, 1, 2, 1) },
  { id: 'D 2/1/2/2', laps: L(2, 1, 2, 2) },
  { id: 'E 2/2/2/2', laps: L(2, 2, 2, 2) },
  { id: 'F 2/2/3/2（今の既定）', laps: L(2, 2, 3, 2) },
];
const pct = (xs, q) => { const a = [...xs].sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(a.length * q))] : null; };
const avg = (xs) => (xs.length ? +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : null);
export function evaluate(laps, n = 1000, seed0 = 20261001) {
  const E = loadWithLaps(laps), cfg = E.CH.getConfig(1), g = E.CH.buildGraph(cfg), len = E.CH.routeLengths(g);
  // 配置の数は短いほうのルートの長さに比例（stat 20〜25%・event 11〜15%・battle 7.5〜11%・treasure 5〜7.5%）。候補ごとに密度をそろえて比べる
  const Lb = len.min, rng = (a, b) => [Math.round(Lb * a), Math.round(Lb * b)];
  cfg.layoutRules.counts = { stat: rng(0.2, 0.25), event: rng(0.11, 0.15), battle: rng(0.075, 0.11), treasure: rng(0.05, 0.075) };
  cfg.layoutRules.maxPerStat = Math.ceil(Lb * 0.25 / 6) + 1; cfg.layoutRules.maxBattlesFirst = [Math.min(16, Math.round(Lb * 0.2)), 1];
  const out = { length: { bridge: g.routes[0].seq.length - 1, forest: g.routes[1].seq.length - 1, nodes: len.nodes } };
  for (const [name, pick] of [['free', null], ['rush（橋固定）', 'bridge'], ['grow（森固定）', 'forest']]) {
    const runs = []; for (let i = 0; i < n; i++) runs.push(runOnce(E, seed0 + i * 101, 'cautious', pick));
    const reached = runs.filter((r) => r.goal), t = reached.map((r) => r.turns);
    const byRest = {}; for (const r of runs) { const k = Math.min(3, r.rests); (byRest[k] = byRest[k] || { n: 0, goal: 0 }).n++; if (r.goal) byRest[k].goal++; }
    out[name] = { reach: +(reached.length / n).toFixed(3), avg: avg(t), median: pct(t, 0.5), p10: pct(t, 0.1), p90: pct(t, 0.9), avgRests: avg(runs.map((r) => r.rests)),
      stops: { stat: avg(runs.map((r) => r.stat)), event: avg(runs.map((r) => r.event)), battle: avg(runs.map((r) => r.battle)), treasure: avg(runs.map((r) => r.treasure)) },
      reachByRests: Object.fromEntries(Object.entries(byRest).map(([k, v]) => [k === '3' ? '3+' : k, `${v.goal}/${v.n}`])) };
  }
  return out;
}
if (process.argv[1] && process.argv[1].endsWith('chapter-balance.mjs')) {
  const n = +(process.argv[2] || 1000);
  for (const c of CANDIDATES) { const r = evaluate(c.laps, n); console.log(`\n## ${c.id}  橋 ${r.length.bridge}マス／森 ${r.length.forest}マス（ノード ${r.length.nodes}）`); for (const k of ['free', 'rush（橋固定）', 'grow（森固定）']) { const x = r[k]; console.log(`  ${k.padEnd(12)} 到達 ${(x.reach * 100).toFixed(0)}%  平均 ${x.avg}  中央 ${x.median}  p10 ${x.p10}  p90 ${x.p90}  休む ${x.avgRests}  停止 ${JSON.stringify(x.stops)}  休む回数別の到達 ${JSON.stringify(x.reachByRests)}`); } }
}
