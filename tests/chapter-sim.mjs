// =========================================================
// Chapterフィールドエンジンの進行シミュレーション（1000回以上）
//  実物の MMP7・MMP8（raising.js）・MMCH（engine.js）・Chapter 1 Pattern A の config を Node で動かし、
//  出発 → サイコロ（または休む）→ 1地点ずつ移動 → 分岐の選択 → 停止地点の効果 → バトル（勝ち負けは問わず最後まで）→ ゴール／30ターン切れ
//  を繰り返して、到達ターン・分岐ごとの平均・停止地点の回数・疲れを数える。
//  使い方：node tests/chapter-sim.mjs [回数] [休む方針（forced|cautious）]
// =========================================================
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function loadEngine() {
  const w = {};
  for (const f of ['js/phase7/progression.js', 'js/phase8/league.js', 'js/phase8/raising.js', 'js/phase10/monsters.js', 'js/phase9/chapters.js', 'js/chapter/engine.js', 'js/chapter/configs/ch1a.js'])
    new Function('window', readFileSync(path.join(ROOT, f), 'utf8'))(w);
  for (const c of w.MMP9C.CHAPTERS) w.MMP7.registerChapterBoard(c.no, c.track, { provisional: false });   // index.html と同じ登録（Chapter 1 はエンジンが担当）
  return { P7: w.MMP7, P8: w.MMP8, CH: w.MMCH, w };
}
export function lcg(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }

/** 1回の Chapter 1（Pattern A）。policy：forced＝疲れ100のときだけ休む／cautious＝疲れ86以上なら休む（次の出目で100に届くおそれ） */
export function runOnce(E, seed, policy = 'cautious', branchPick = null) {
  const { P7, P8, CH } = E, rnd = lcg(seed);
  const S = P8.newSave(); S.m = P8.initIndividual(S, { sp: 0, name: 'シム', age: 0, span: 30, h: 0, rk: 0, fa: 0, st: 0, last: null, li: 100, po: 100, in: 100, hi: 100, ev: 100, de: 100, sk: [0, 1, 2, 3], eq: [0, 1, 2, 3, -1, -1] });
  P7.ensureProg(S.m); const m = S.m;
  const d = P8.depart(S, m, rnd); if (!d.ok) throw new Error('depart ' + d.reason);
  const st = { turns: 0, goal: false, branch: null, stat: 0, event: 0, battle: 0, treasure: 0, rests: 0, forcedRests: 0, fatigueSum: 0, fatigueN: 0, hit100: 0, maxFatigue: 0, statOutcome: { ok: 0, great: 0, fail: 0 } };
  for (let guard = 0; guard < 200; guard++) {
    const ph = P8.boardPhase(m);
    if (ph === 'goal' || ph === 'timeup') break;
    if (ph === 'roll') {
      const f = CH.fatigue(m);
      st.fatigueSum += f; st.fatigueN++;
      if (!P8.canRoll(m)) { st.forcedRests++; st.rests++; P8.rest(S, m); continue; }
      if (policy === 'cautious' && f >= 86) { st.rests++; P8.rest(S, m); continue; }
      P8.roll(S, m, rnd);
      if (CH.fatigue(m) >= 100) st.hit100++;
      st.maxFatigue = Math.max(st.maxFatigue, CH.fatigue(m));
      continue;
    }
    if (ph === 'move') { P8.step(S, m); continue; }
    if (ph === 'branch') { const opts = m.raise.pend.opts, pickId = branchPick ? opts.find((o) => o.startsWith(branchPick === 'bridge' ? 'a' : 'b')) : opts[Math.floor(rnd() * opts.length)]; P8.chooseBranch(S, m, pickId); continue; }
    if (ph === 'resolve') {
      const r = P8.resolveLanding(S, m, rnd), fx = r.fx || {};
      if (fx.kind === 'chstat') { st.stat++; st.statOutcome[fx.outcome]++; }
      else if (fx.kind === 'treasure') st.treasure++;
      else if (fx.ev) st.event++;
      if (fx.kind === 'battle') { st.battle++; P8.beginBattle(S, m, { kind: 'practice', rank: 0 }); P8.markBattleDone(S); P8.finishBattle(S, m, rnd); }
      continue;
    }
    throw new Error('unexpected phase ' + ph);
  }
  st.turns = m.raise.turnsUsed; st.goal = !!m.raise.goal; st.branch = (m.raise.field && m.raise.field.branch) || null; st.endFatigue = CH.fatigue(m);
  return st;
}
export function simulate(E, n = 1000, policy = 'cautious', seed0 = 20260930) {
  const runs = []; for (let i = 0; i < n; i++) runs.push(runOnce(E, seed0 + i * 101, policy));
  const avg = (xs) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length), med = (xs) => { const a = [...xs].sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : 0; };
  const reached = runs.filter((r) => r.goal), by = (b) => reached.filter((r) => r.branch === b).map((r) => r.turns);
  return {
    n, policy,
    avgTurns: +avg(reached.map((r) => r.turns)).toFixed(2), medianTurns: med(reached.map((r) => r.turns)),
    reachRate: +(reached.length / n).toFixed(3),
    branch: { bridge: { runs: by('bridge').length, avgTurns: +avg(by('bridge')).toFixed(2) }, forest: { runs: by('forest').length, avgTurns: +avg(by('forest')).toFixed(2) } },
    avgStops: { stat: +avg(runs.map((r) => r.stat)).toFixed(2), event: +avg(runs.map((r) => r.event)).toFixed(2), battle: +avg(runs.map((r) => r.battle)).toFixed(2), treasure: +avg(runs.map((r) => r.treasure)).toFixed(2) },
    avgFatigue: +avg(runs.map((r) => r.fatigueSum / Math.max(1, r.fatigueN))).toFixed(1),
    fatigue100Rate: +avg(runs.map((r) => (r.hit100 > 0 ? 1 : 0))).toFixed(3),
    avgRests: +avg(runs.map((r) => r.rests)).toFixed(2), avgForcedRests: +avg(runs.map((r) => r.forcedRests)).toFixed(2),
    statOutcome: ['ok', 'great', 'fail'].reduce((o, k) => ({ ...o, [k]: runs.reduce((a, r) => a + r.statOutcome[k], 0) }), {}),
    minTurns: Math.min(...reached.map((r) => r.turns)), maxTurns: Math.max(...reached.map((r) => r.turns)),
  };
}
if (process.argv[1] && process.argv[1].endsWith('chapter-sim.mjs')) {
  const E = loadEngine(), n = +(process.argv[2] || 1000);
  for (const pol of process.argv[3] ? [process.argv[3]] : ['cautious', 'forced']) console.log(JSON.stringify(simulate(E, n, pol), null, 1));
}
