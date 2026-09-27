// =========================================================
// Phase 8：公式ランク大会（総当たりリーグ）の計算（window.MMP8L）
//  参加人数：E・D＝6体、C〜S＝8体（プレイヤーを含む）。全員が全員と1回ずつ戦う（円形法）。
//  NPC同士の試合は大会の作成時に内部演算して結果を確定し、大会状態に保存する（中断・再開で再抽選しない）。
//  同じ勝ち数の順位：勝ち数 → 同じ勝ち数どうしの対戦成績 → 大会作成時に決めた抽選値【暫定】。
//  【暫定】NPCの名前・強さ・NPC同士の勝敗の決め方は仮実装。正式データ・ロジックは
//          setNpcProvider / setNpcMatchResolver で差し替えられる（保存済みの大会には影響しない）。
// =========================================================
(function (root) {
  'use strict';
  const L = {};
  const LEAGUE_SIZE = Object.freeze([6, 6, 8, 8, 8, 8]);   // E, D, C, B, A, S

  /** 再現可能な乱数（大会ごとのシード値から） */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  /** 円形法の総当たり日程（nは偶数）。rounds[r] = [[a,b], ...]。各ラウンドで全員が1試合ずつ */
  function roundRobin(n) {
    const ids = Array.from({ length: n }, (_, i) => i), rounds = [];
    for (let r = 0; r < n - 1; r++) {
      const pairs = [];
      for (let i = 0; i < n / 2; i++) pairs.push([ids[i], ids[n - 1 - i]]);
      rounds.push(pairs);
      ids.splice(1, 0, ids.pop());   // 先頭を固定して残りを回転
    }
    return rounds;
  }

  // ---- 【暫定】NPC（正式NPCデータ未確定） ----
  // 大会参加者の能力値は、現在の fight() が実際に作る対戦相手と同じ「ランクごとの一律値」（fight()内部の RV と同じ値）。
  // 種族は既存の正式種族から選ぶだけ（新しい種族・見た目は作らない）。名前・種族と実際の試合の相手の一致は、後のバトルPhaseで行う。
  const PROVISIONAL_OPPONENT_STAT = Object.freeze([70, 90, 120, 160, 220, 300]);
  const STAT_KEYS = Object.freeze(['li', 'po', 'in', 'hi', 'ev', 'de']);
  let speciesCount = 1;
  function setSpeciesCount(n) { speciesCount = Math.max(1, n | 0); }
  const provisionalStats = (rank) => Object.fromEntries(STAT_KEYS.map((k) => [k, PROVISIONAL_OPPONENT_STAT[rank]]));
  const PROVISIONAL_NPC_NAMES = Object.freeze(['アカネ', 'ソウマ', 'ルリ', 'ハヤテ', 'コハク', 'シオン', 'ユズ', 'レン', 'カエデ', 'ミナト', 'ツバキ', 'ヒナタ', 'サクヤ', 'イブキ']);
  const PROVISIONAL_NPC_TITLE = Object.freeze(['見習い', '町の', '腕利きの', '歴戦の', '名門の', '伝説の']);
  function provisionalNpcs(rank, count, rnd) {
    const names = [...PROVISIONAL_NPC_NAMES], out = [];
    for (let i = 0; i < count; i++) {
      const name = names.splice(Math.floor(rnd() * names.length), 1)[0];
      out.push({ name: `${PROVISIONAL_NPC_TITLE[rank]}ブリーダー ${name}`, power: 10 + rank * 10 + Math.floor(rnd() * 10),
        sp: Math.floor(rnd() * speciesCount), stats: provisionalStats(rank), provisional: true });
    }
    return out;
  }
  /** NPC同士の勝敗：強さの比で勝率を決める（aが勝てば true） */
  const provisionalResolver = (a, b, rnd) => rnd() < (a.power + 1) / (a.power + b.power + 2);
  let npcProvider = provisionalNpcs, npcResolver = provisionalResolver;
  function setNpcProvider(fn) { npcProvider = typeof fn === 'function' ? fn : provisionalNpcs; }
  function setNpcMatchResolver(fn) { npcResolver = typeof fn === 'function' ? fn : provisionalResolver; }

  /** 大会を作る（参加者・日程・NPC同士の結果・同勝数用の抽選値をここで確定） */
  function createLeague(rank, seed, playerName) {
    const size = LEAGUE_SIZE[rank];
    if (!size) throw new Error(`ランクが不正です：${rank}`);
    const rnd = mulberry32(seed);
    const npcs = npcProvider(rank, size - 1, rnd);
    const entrants = [{ id: 0, player: true, name: playerName || 'あなた' }, ...npcs.map((n, i) => ({ id: i + 1, player: false, name: n.name, power: n.power,
      sp: Number.isInteger(n.sp) ? n.sp : 0, stats: n.stats || provisionalStats(rank), provisional: n.provisional !== false }))];
    entrants.forEach((e) => { e.lot = rnd(); });
    const rounds = roundRobin(size).map((pairs) => pairs.map(([a, b]) => ({ a, b, winner: null })));
    for (const rd of rounds) for (const mt of rd) if (mt.a !== 0 && mt.b !== 0) mt.winner = npcResolver(entrants[mt.a], entrants[mt.b], rnd) ? mt.a : mt.b;
    return { rank, size, seed, entrants, rounds, round: 0 };   // round＝終わったラウンド数（プレイヤーの試合が終わるたびに1進む）
  }
  const isFinished = (lg) => lg.round >= lg.rounds.length;
  /** プレイヤーの次の試合（無ければ null） */
  function playerMatch(lg) {
    if (isFinished(lg)) return null;
    const mt = lg.rounds[lg.round].find((x) => x.a === 0 || x.b === 0);
    return { round: lg.round, opp: mt.a === 0 ? mt.b : mt.a, match: mt };
  }
  /** プレイヤーの試合結果を記録し、そのラウンドを終える（同じラウンドのNPC戦の結果も公開される） */
  function recordPlayerResult(lg, won) {
    const pm = playerMatch(lg); if (!pm) return null;
    pm.match.winner = won ? 0 : pm.opp; lg.round += 1;
    return pm;
  }
  /** 終わったラウンドまでの順位表 */
  function standings(lg) {
    const done = lg.rounds.slice(0, lg.round).flat().filter((mt) => mt.winner != null);
    const tally = lg.entrants.map((e) => ({ id: e.id, name: e.name, player: !!e.player, w: 0, l: 0, lot: e.lot }));
    for (const mt of done) { tally[mt.winner].w++; tally[mt.winner === mt.a ? mt.b : mt.a].l++; }
    for (const t of tally) {   // 同じ勝ち数どうしの対戦での勝ち数
      const grp = tally.filter((x) => x.w === t.w).map((x) => x.id);
      t.tb = done.filter((mt) => mt.winner === t.id && grp.includes(mt.a === t.id ? mt.b : mt.a)).length;
    }
    tally.sort((p, q) => q.w - p.w || q.tb - p.tb || p.lot - q.lot);
    tally.forEach((t, i) => { t.place = i + 1; });
    return tally;
  }
  const playerPlace = (lg) => standings(lg).find((t) => t.player).place;
  /** 表示用の参加者データ（画面はこれだけを見る）。Phase 8の大会データのように種族・能力が無い場合は暫定値で補う */
  function entrantView(lg, id) {
    const e = lg.entrants[id]; if (!e) return null;
    if (e.player) return { id, player: true, name: e.name };
    return { id, player: false, name: e.name, sp: Number.isInteger(e.sp) ? e.sp : 0, stats: e.stats || provisionalStats(lg.rank), provisional: e.provisional !== false };
  }
  /** 対戦表のマス（行 a から見た列 b）：self / win / loss / next（自分の次の試合）/ pending（未対戦・結果未公開） */
  function resultCell(lg, a, b) {
    if (a === b) return 'self';
    for (let r = 0; r < lg.rounds.length; r++) for (const mt of lg.rounds[r]) {
      if (!((mt.a === a && mt.b === b) || (mt.a === b && mt.b === a))) continue;
      if (r < lg.round && mt.winner != null) return mt.winner === a ? 'win' : 'loss';
      return r === lg.round && (a === 0 || b === 0) ? 'next' : 'pending';
    }
    return 'pending';
  }
  Object.assign(L, { LEAGUE_SIZE, mulberry32, roundRobin, createLeague, isFinished, playerMatch, recordPlayerResult, standings, playerPlace,
    setNpcProvider, setNpcMatchResolver, PROVISIONAL: true, PROVISIONAL_OPPONENT_STAT, STAT_KEYS, setSpeciesCount, entrantView, resultCell });
  root.MMP8L = Object.freeze(L);
})(typeof window !== 'undefined' ? window : globalThis);
