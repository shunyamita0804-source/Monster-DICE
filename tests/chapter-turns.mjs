// =========================================================
// Chapter のターン上限の比較（2026-10-03 のターン数の監査）。ゲームのコードは変えず、メモリ上の設定だけを差し替えて実物の進行を回す。
//  使い方：node tests/chapter-turns.mjs [回数（既定 3000）] [比べるターン数（既定 "40,30"）]
//  Chapter 1・2（エンジン）＝分岐ごと・休む方針ごと（cautious＝疲れ86以上で休む／forced＝疲れ100のときだけ休む）、Chapter 3・4（旧ボード）＝比べるターン数と現在の 20
// =========================================================
import { loadEngine, runOnce, lcg } from './chapter-sim.mjs';

const N = +process.argv[2] || 3000, LIMS = (process.argv[3] || '40,30').split(',').map(Number);
const pct = (a, b) => (100 * a / b).toFixed(1) + '%';
const summary = (ts) => { ts.sort((a, b) => a - b); const q = (p) => ts[Math.min(ts.length - 1, Math.floor(p * ts.length))]; return { avg: (ts.reduce((a, b) => a + b, 0) / (ts.length || 1)).toFixed(1), med: q(0.5), p90: q(0.9), max: ts[ts.length - 1] }; };
const rows = [];
for (const ch of [1, 2]) for (const lim of LIMS) for (const pol of ['cautious', 'forced']) for (const br of (ch === 1 ? ['forest', 'bridge'] : ['A', 'B'])) {
  const E = loadEngine(); E.CH.getConfig(ch).rules.turnLimit = lim;
  const rs = []; for (let i = 0; i < N; i++) rs.push(runOnce(E, 20261003 + i * 101, pol, br, ch));
  const g = rs.filter((r) => r.goal);
  rows.push({ ch, lim, pol, br, reach: pct(g.length, N), ...summary(g.map((r) => r.turns)) });
}
// Chapter 3・4（旧ボード）：出発してから、出目・移動・分岐（最初の道）・停止処理・バトル（記録だけ）をゴールかターン切れまで
const { P7, P8 } = loadEngine();
for (const ch of [3, 4]) for (const lim of [20, ...LIMS.filter((x) => x !== 20)]) {
  let goal = 0; const ts = [];
  for (let i = 0; i < N; i++) {
    const rnd = lcg(777 + i * 31), S = P8.newSave();
    S.m = P8.initIndividual(S, { sp: 0, name: 'シム', age: 0, span: 30, h: 0, rk: 0, fa: 0, st: 0, last: null, li: 100, po: 100, in: 100, hi: 100, ev: 100, de: 100, sk: [0, 1, 2, 3], eq: [0, 1, 2, 3, -1, -1] });
    P7.ensureProg(S.m); const m = S.m;
    Object.assign(m.raise, { state: 'farm', ch, log: Array.from({ length: ch - 1 }, (_, k) => ({ ch: k + 1, reachedGoal: true })) }); m.prog.rankClr = [true, true, true, true, false, false];
    if (!P8.depart(S, m, rnd).ok) throw new Error('depart'); m.raise.turnLimit = lim;
    for (let k = 0; k < 400; k++) {
      const ph = P8.boardPhase(m); if (ph === 'goal' || ph === 'timeup') break;
      if (ph === 'roll') { if (P8.canRoll && !P8.canRoll(m)) P8.rest(S, m); else P8.roll(S, m, rnd); }
      else if (ph === 'move') P8.step(S, m);
      else if (ph === 'branch') P8.chooseBranch(S, m, m.raise.pend.opts[0]);
      else if (ph === 'resolve') { const r = P8.resolveLanding(S, m, rnd); if (r.fx && r.fx.kind === 'choice') P8.resolveChoice(S, m, r.fx.options[Math.floor(rnd() * r.fx.options.length)].id, rnd); }   // 2026-10-04：2択の出来事はランダムに選ぶ
      else if (ph === 'battle') { if (P8.beginBattle(S, m, { kind: 'practice', rank: 0 }).ok) P8.markBattleDone(S); else m.raise.pend = null; }
      else m.raise.pend = null;
    }
    if (m.raise.goal) { goal++; ts.push(m.raise.turnsUsed); }
  }
  rows.push({ ch, lim, pol: '-', br: '-', reach: pct(goal, N), ...summary(ts) });
}
console.table(rows);
