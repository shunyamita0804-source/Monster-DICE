// =========================================================
// Chapterフィールドエンジン（window.MMCH）
//  正式な「Chapterフィールド／育成ボード」の共通エンジン。Chapterごとの違いはすべて config（js/chapter/configs/*.js）に書き、
//  ここには Chapter 固有の値・分岐（if (chapter === 2) など）を置かない。Chapter 2〜4 は config を registerConfig するだけで動く。
//
//  ・config → グラフ（ノード・つながり・フィールド）を作る（buildGraph）。ノードの座標は背景画像に対する 0〜1 の割合
//  ・Chapter開始時に、固定の骨格（スタート・背景の切替・分岐・合流・強敵・ライバル・ゴール）はそのまま、
//    候補ノード（slot）へ種類をシード付き乱数で割り当てる（generateLayout）。結果は個体の m.raise.field に保存し、
//    再読み込み・セーブ／ロード・バトルからの復帰では引き直さない
//  ・疲れ（0〜100）：出目で +3/+5/+7、ボード上のバトル後 +5、休む −30（1ターン消費・移動なし）、100 ならサイコロ不可
//  ・能力地点：疲れ（出目を足した後）で 失敗／成功／大成功 を1回の抽選で決める。成功 +statGainRange、大成功 ×1.5（四捨五入）
//  ・イベント：イベントの種類（handler）ごとの処理を EVENT_HANDLERS に登録する（巨大な switch にしない）
//  ・宝箱：tier（normal / rare / special）と開封まで。中身は未決（config.treasurePool.contents が null のあいだは何も渡さない）
//  ・バトル：type（wild / strong / rival）。絵の asset key は type ごとに分ける（同じ絵でも差し替えは config だけ）
//
//  進行（ターン・移動・分岐・停止地点・バトルの前後・大会）は js/phase8/raising.js（MMP8）の既存の仕組みをそのまま使い、
//  このエンジンは MMP8.registerChapterDriver で「疲れ・休む・停止地点の種類・効果」を差し込むだけ。セーブは v6（mr4v6）のまま。
//  画面（フィールドの描画・カメラ・歩く見た目・サイコロの演出）は js/chapter/field-view.js・js/chapter/dice-renderer.js。
// =========================================================
(function (root) {
  'use strict';
  const fz = Object.freeze;
  const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const STATS = fz(['li', 'po', 'in', 'hi', 'ev', 'de']);                  // 正式6能力
  const SPECIAL = fz(['stat', 'event', 'battle', 'treasure']);             // 特殊地点の種類
  const TIERS = fz(['normal', 'rare', 'special']);
  const BATTLE_TYPES = fz(['wild', 'strong', 'rival']);

  // ---------------------------------------------------------
  // 既定のルール（config で上書きできる。正式仕様の値）
  // ---------------------------------------------------------
  const DEFAULT_RULES = fz({
    turnLimit: 30,
    dice: fz({ min: 1, max: 3 }),
    statGainRange: fz([10, 15]),
    greatMultiplier: 1.5,
    fatigueRules: fz({ max: 100, roll: fz({ 1: 3, 2: 5, 3: 7 }), battle: 5, rest: 30, carry: 50 }),
    // 疲れの帯ごとの能力結果（%）。1回の抽選で 失敗 → 大成功 → 成功 の順に排他的に決める
    statOdds: fz([
      fz({ max: 19, fail: 0, great: 20 }),
      fz({ max: 39, fail: 0, great: 15 }),
      fz({ max: 59, fail: 10, great: 10 }),
      fz({ max: 79, fail: 20, great: 5 }),
      fz({ max: 100, fail: 30, great: 0 }),
    ]),
    fatigueItems: fz({ small: fz({ amount: 10 }), medium: fz({ amount: 30 }), large: fz({ full: true }) }),
  });

  // ---------------------------------------------------------
  // シード付き乱数（mulberry32）。同じシードなら同じ配置になる
  // ---------------------------------------------------------
  function rng(seed) {
    let a = (seed >>> 0) || 1;
    return function () { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const newSeed = (rnd) => (Math.floor((rnd || Math.random)() * 0x7fffffff) >>> 0) || 1;
  const pick = (arr, r) => arr[Math.floor(r() * arr.length)];
  function pickWeighted(list, r, w = (x) => x.weight || 1) { const tot = list.reduce((s, x) => s + w(x), 0); let t = r() * tot; for (const x of list) { t -= w(x); if (t < 0) return x; } return list[list.length - 1]; }
  function shuffle(arr, r) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  const randInt = (lo, hi, r) => lo + Math.floor(r() * (hi - lo + 1));

  // ---------------------------------------------------------
  // config の登録（Chapter × Pattern）
  // ---------------------------------------------------------
  const CONFIGS = {};   // { chapterId: { patternId: config } }
  const GRAPHS = new Map();
  const rulesOf = (cfg) => ({ ...DEFAULT_RULES, ...(cfg.rules || {}), fatigueRules: { ...DEFAULT_RULES.fatigueRules, ...((cfg.rules || {}).fatigueRules || {}) } });
  function registerConfig(cfg) {
    if (!isObj(cfg) || !Number.isInteger(cfg.chapterId) || typeof cfg.patternId !== 'string') throw new Error('MMCH：config が不正です');
    for (const k of ['fieldScenes', 'paths', 'layoutRules']) if (!cfg[k]) throw new Error(`MMCH：config.${k} がありません`);
    (CONFIGS[cfg.chapterId] = CONFIGS[cfg.chapterId] || {})[cfg.patternId] = cfg;
    GRAPHS.delete(`${cfg.chapterId}:${cfg.patternId}`);
    return buildGraph(cfg);
  }
  /** 遊べる（正式背景がそろった）Pattern だけ。存在しない B / C はプレイヤーに出さない */
  const patterns = (chapterId) => Object.keys(CONFIGS[chapterId] || {}).filter((p) => CONFIGS[chapterId][p].playable !== false);
  const handles = (chapterId) => patterns(chapterId).length > 0;
  function getConfig(chapterId, patternId) { const c = CONFIGS[chapterId]; if (!c) return null; return (patternId && c[patternId]) || c[patterns(chapterId)[0]] || null; }
  /** Pattern の選び方（今は遊べる Pattern から等確率。正式な選び方が決まったらここだけ変える） */
  function selectPattern(chapterId, rnd = Math.random) { const ps = patterns(chapterId); return ps.length ? ps[Math.floor(rnd() * ps.length)] : null; }

  // ---------------------------------------------------------
  // グラフ：paths（背景ごとの道筋）からノード・つながりを作る
  //  path = { id, field, pts:[[x,y]...], n, next:[pathId...], start?, goal?, branch?, fixed:{ index: kind }, bias? }
  //  ノードID は `${path.id}${index}`。各ノードは field・x・y（背景に対する割合）・kind（固定の骨格）を持つ
  // ---------------------------------------------------------
  /** 道の点列を通る滑らかな曲線（Catmull-Rom）。画面では「マスの間を直線で飛ぶ」のではなく、道のカーブに沿って歩く。seg＝点と点の間の分割数 */
  function smoothCurve(pts, seg = 10) {
    if (!Array.isArray(pts) || pts.length < 3) return (pts || []).map((p) => [p[0], p[1]]);
    const P = [pts[0], ...pts, pts[pts.length - 1]], out = [[pts[0][0], pts[0][1]]];
    for (let i = 1; i < P.length - 2; i++) {
      const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
      for (let k = 1; k <= seg; k++) {
        const t = k / seg, t2 = t * t, t3 = t2 * t;
        const x = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
        const y = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
        out.push([+x.toFixed(4), +y.toFixed(4)]);
      }
    }
    return out;
  }
  /** 点列を「その場所の大きさで割った長さ」（奥ほど画面上の間隔が縮む）で測る：各点の累積距離 s と全長 */
  function measure(pts, depthAt, W = 1, H = 1) {
    const s = [0];
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], d = Math.hypot((x1 - x0) * W, (y1 - y0) * H), k = (depthAt((y0 + y1) / 2) || 1);   // 背景の画素での長さ
      s.push(s[i - 1] + d / k);
    }
    return { s, total: s[s.length - 1] };
  }
  /** 曲線上の距離 s の位置 [x, y] */
  function pointAt(pts, S, s) {
    if (s <= 0) return [pts[0][0], pts[0][1]];
    for (let i = 1; i < pts.length; i++) if (s <= S.s[i]) { const a = pts[i - 1], b = pts[i], L = S.s[i] - S.s[i - 1], r = L ? (s - S.s[i - 1]) / L : 0; return [+(a[0] + (b[0] - a[0]) * r).toFixed(4), +(a[1] + (b[1] - a[1]) * r).toFixed(4)]; }
    const e = pts[pts.length - 1]; return [e[0], e[1]];
  }
  function alongPersp(pts, n, depthAt, W = 1, H = 1) {
    // 同じ歩幅で奥へ進むほど画面上の間隔が縮むよう、画面上の長さを「その場所の大きさ」で割った長さで等分する
    const S = measure(pts, depthAt, W, H), out = [];
    for (let k = 0; k < n; k++) out.push(pointAt(pts, S, n === 1 ? 0 : (S.total * k) / (n - 1)));
    return out;
  }
  function depthOf(scene, y) {
    const c = scene.depth; if (!c || !c.length) return 1;
    if (y >= c[0][0]) return c[0][1]; if (y <= c[c.length - 1][0]) return c[c.length - 1][1];
    for (let i = 1; i < c.length; i++) if (y >= c[i][0]) { const [y0, d0] = c[i - 1], [y1, d1] = c[i]; return d0 + (d1 - d0) * (y - y0) / (y1 - y0); }
    return 1;
  }
  function buildGraph(cfg) {
    const key = `${cfg.chapterId}:${cfg.patternId}`; if (GRAPHS.has(key)) return GRAPHS.get(key);
    const scenes = {}; for (const s of cfg.fieldScenes) scenes[s.id] = s;
    const nodes = {}, conn = {}, order = [], curves = {}, OV = cfg.nodeOverrides || {};
    let start = null, goal = null;
    for (const p of cfg.paths) {
      const sc = scenes[p.field]; if (!sc) throw new Error(`MMCH：path ${p.id} の field ${p.field} がありません`);
      // 道の曲線（既定は滑らか。config の path.curve が 'linear' なら折れ線のまま）。ノードはこの曲線の上に等間隔（奥行き補正）で置く
      const pts = p.curve === 'linear' ? p.pts.map((q) => [q[0], q[1]]) : smoothCurve(p.pts, p.curveSegments || 10);
      const depthAt = (y) => depthOf(sc, y), M = measure(pts, depthAt, sc.w || 1, sc.h || 1);
      curves[p.id] = { pts, s: M.s, total: M.total, field: p.field, terrain: p.terrain || 'grass', speed: p.speed || 1 };
      for (let i = 0; i < p.n; i++) {
        const id = `${p.id}${i}`, kind = (p.fixed && p.fixed[i]) || 'slot', s = p.n === 1 ? 0 : (M.total * i) / (p.n - 1), pos = pointAt(pts, M, s), o = OV[id] || {};
        nodes[id] = { id, path: p.id, idx: i, field: p.field, x: pos[0], y: pos[1], s, d: +depthOf(sc, pos[1]).toFixed(3), kind, branch: p.branch || null,
          side: o.side || (p.side && p.side[i]) || (i % 2 ? 1 : -1), terrain: o.terrain || p.terrain || 'grass',
          // 見せ方の上書き（config.nodeOverrides）：monster＝止まる位置（既定は道の上の点）、landmark＝目印の位置・大きさ、camera＝カメラの寄り
          mx: o.monster ? o.monster[0] : pos[0], my: o.monster ? o.monster[1] : pos[1], lm: o.landmark || null, cam: o.camera || null };
        if (p.noSlot && p.noSlot.includes(i) && kind === 'slot') nodes[id].kind = 'normal';
        order.push(id);
        if (i > 0) conn[`${p.id}${i - 1}`] = [id];
      }
      if (p.start) start = `${p.id}0`;
      if (p.goal) goal = `${p.id}${p.n - 1}`;
    }
    for (const p of cfg.paths) { const last = `${p.id}${p.n - 1}`; conn[last] = (p.next || []).map((q) => `${q}0`); }
    if (!start || !goal) throw new Error('MMCH：スタート・ゴールがありません');
    for (const [id, to] of Object.entries(conn)) for (const t of to) if (!nodes[t]) throw new Error(`MMCH：${id} → ${t} のノードがありません`);
    // 各ルート（スタート→ゴールの道順）を列挙する（分岐の組み合わせ）
    const routes = [];
    (function walk(id, seq, br) { const s = [...seq, id], nx = conn[id] || []; const b = nodes[id].branch || br; if (!nx.length) { routes.push({ branch: b, seq: s }); return; } for (const t of nx) walk(t, s, b); })(start, [], null);
    const branchAt = Object.keys(conn).filter((id) => conn[id].length > 1);
    const g = fz({ key, chapterId: cfg.chapterId, patternId: cfg.patternId, nodes, conn, order, start, goal, routes, branchAt, curves, edges: cfg.edges || {} });
    GRAPHS.set(key, g);
    return g;
  }
  /**
   * 地点 from → to の歩く道筋（背景に対する割合の点列。最初＝from の止まる位置、最後＝to の止まる位置）。
   *  同じ道の隣どうし：道の曲線に沿う（マスの間を直線で飛ばない）。別の道へ（分岐・合流）：config.edges['from>to'] の中間点（あれば曲線化）、無ければ直線。
   *  別のフィールドへ（背景の切り替え）：空（画面側が切り替えの演出をする）
   */
  function routeBetween(g, from, to) {
    const a = g.nodes[from], b = g.nodes[to]; if (!a || !b) return [];
    if (a.field !== b.field) return [];
    const head = [a.mx, a.my], tail = [b.mx, b.my];
    let mid = [];
    if (a.path === b.path) {
      const c = g.curves[a.path], lo = Math.min(a.s, b.s), hi = Math.max(a.s, b.s);
      mid = c.pts.filter((p, i) => c.s[i] > lo + 1e-6 && c.s[i] < hi - 1e-6);
      if (a.s > b.s) mid.reverse();
    } else {
      const e = g.edges[`${from}>${to}`];
      if (Array.isArray(e) && e.length) mid = smoothCurve([head, ...e, tail], 8).slice(1, -1);
    }
    return [head, ...mid, tail];
  }
  /** MMP8（raising.js）へ登録する形のトラック（nodes・conn・start・goal）。種類はラン（Chapter開始時の配置）ごとに決まるため type は骨格だけ */
  const TRACKS = new Map();
  function trackOf(cfg) {
    const key = `${cfg.chapterId}:${cfg.patternId}`; if (TRACKS.has(key)) return TRACKS.get(key);
    const g = buildGraph(cfg), nodes = {};
    for (const [id, n] of Object.entries(g.nodes)) nodes[id] = { type: n.kind === 'goal' ? 'tournament' : n.kind === 'start' ? 'start' : 'normal', x: n.x, y: n.y, field: n.field, lane: n.path };
    const t = fz({ nodes: fz(nodes), conn: g.conn, start: g.start, goal: g.goal, engine: key });
    TRACKS.set(key, t);
    return t;
  }
  /** 現在地から「次の分岐かゴール」までの歩数（分岐の案内用） */
  function stepsToMerge(g, from, mergeAt) { let n = 0, x = from; while (x && x !== mergeAt && n < 200) { const nx = g.conn[x] || []; if (nx.length !== 1) break; x = nx[0]; n++; } return n + 1; }

  // ---------------------------------------------------------
  // 配置（Chapter開始時に1回だけ）：固定骨格＋候補ノードへのシード付き割り当て
  // ---------------------------------------------------------
  const kindOfAssign = (a) => (a && a.t) || 'normal';
  function routeFacts(g, seq, assign) {
    return seq.map((id) => { const n = g.nodes[id], a = assign[id] || (n.kind === 'strong' || n.kind === 'rival' ? { t: 'battle', bt: n.kind } : null); return { id, field: n.field, t: kindOfAssign(a), a }; });
  }
  /** 配置の制約を満たすか（違反の理由の配列。空なら合格） */
  function validateLayout(cfg, g, assign) {
    const L = cfg.layoutRules, errs = [];
    let recoveryTotal = 0;
    for (const a of Object.values(assign)) if (a.t === 'event' && a.recovery) recoveryTotal++;
    const [rlo, rhi] = L.recoveryEvents || [1, 3];
    if (recoveryTotal < rlo || recoveryTotal > rhi) errs.push(`recovery:${recoveryTotal}`);
    for (const rt of g.routes) {
      const f = routeFacts(g, rt.seq, assign), cnt = { stat: 0, event: 0, battle: 0, treasure: 0 }, stats = {};
      f.forEach((x) => { if (cnt[x.t] != null) cnt[x.t]++; if (x.t === 'stat') stats[x.a.k] = (stats[x.a.k] || 0) + 1; });
      for (const t of SPECIAL) { const [lo, hi] = L.counts[t]; if (cnt[t] < lo || cnt[t] > hi) errs.push(`${rt.branch}:${t}=${cnt[t]}`); }
      for (const k of STATS) { const c = stats[k] || 0; if (c < 1) errs.push(`${rt.branch}:no ${k}`); if (c > (L.maxPerStat || 3)) errs.push(`${rt.branch}:${k}x${c}`); }
      for (let i = 2; i < f.length; i++) if (SPECIAL.includes(f[i].t) && f[i].t === f[i - 1].t && f[i].t === f[i - 2].t) errs.push(`${rt.branch}:3x${f[i].t}@${i}`);
      for (let i = 1; i < f.length; i++) if (f[i].t === 'treasure' && f[i - 1].t === 'treasure') errs.push(`${rt.branch}:treasure adjacent`);
      for (let i = 0; i < Math.min(L.noBattleFirst || 0, f.length); i++) if (f[i].t === 'battle') errs.push(`${rt.branch}:early battle`);
      if (L.maxBattlesFirst) { const [n, mx] = L.maxBattlesFirst; if (f.slice(0, n).filter((x) => x.t === 'battle').length > mx) errs.push(`${rt.branch}:too many early battles`); }
      for (let i = Math.max(0, f.length - 1 - (L.noEventLast || 0)); i < f.length - 1; i++) if (f[i].t === 'event') errs.push(`${rt.branch}:late event`);
      // 1つの背景に特殊地点が集中しない
      const byField = {}; let sp = 0;
      f.forEach((x) => { if (SPECIAL.includes(x.t)) { byField[x.field] = (byField[x.field] || 0) + 1; sp++; } });
      for (const s of cfg.fieldScenes) { const share = (byField[s.id] || 0) / Math.max(1, sp); if (share > (L.maxFieldShare != null ? L.maxFieldShare : 0.5)) errs.push(`${rt.branch}:field${s.id} ${share.toFixed(2)}`); if (share < (L.minFieldShare != null ? L.minFieldShare : 0.15)) errs.push(`${rt.branch}:field${s.id} low ${share.toFixed(2)}`); }
      if (L.recoveryPerRoute && !f.some((x) => x.a && x.a.recovery)) errs.push(`${rt.branch}:no recovery`);
    }
    return errs;
  }
  /** 候補ノードへの割り当てを1回作る（制約の検査は validateLayout） */
  function draftLayout(cfg, g, r) {
    const L = cfg.layoutRules, assign = {};
    const slots = g.order.filter((id) => g.nodes[id].kind === 'slot');
    const shared = slots.filter((id) => !g.nodes[id].branch), byBranch = {};
    slots.filter((id) => g.nodes[id].branch).forEach((id) => { (byBranch[g.nodes[id].branch] = byBranch[g.nodes[id].branch] || []).push(id); });
    const fixedIn = (seq, t) => seq.filter((id) => ['strong', 'rival'].includes(g.nodes[id].kind) && t === 'battle').length;
    // ルートごとの目標数（分岐の傾向 bias を反映）
    const target = {};
    for (const rt of g.routes) {
      const bias = (cfg.branches || []).flatMap((b) => b.options).find((o) => o.id === rt.branch);
      target[rt.branch] = {};
      for (const t of SPECIAL) { const [lo, hi] = L.counts[t], lean = bias && bias.lean ? bias.lean[t] || 0 : 0; const base = randInt(lo, hi, r); target[rt.branch][t] = clamp(base + lean, lo, hi) - fixedIn(rt.seq, t); }
    }
    // 共通の区間に置く数：各ルートの目標 × 共通区間の割合（少ないほうに合わせる）
    const sharedCount = {};
    for (const t of SPECIAL) {
      sharedCount[t] = Math.min(...g.routes.map((rt) => { const own = (byBranch[rt.branch] || []).length; return Math.round(target[rt.branch][t] * shared.length / Math.max(1, shared.length + own)); }));
    }
    const fill = (ids, counts) => {
      const bag = []; for (const t of SPECIAL) for (let i = 0; i < Math.max(0, counts[t]); i++) bag.push(t);
      while (bag.length < ids.length) bag.push('normal');
      const order = shuffle(ids, r); bag.length = order.length;
      order.forEach((id, i) => { if (bag[i] && bag[i] !== 'normal') assign[id] = { t: bag[i] }; });
    };
    fill(shared, sharedCount);
    for (const rt of g.routes) { const ids = byBranch[rt.branch] || []; if (!ids.length) continue; const c = {}; for (const t of SPECIAL) c[t] = target[rt.branch][t] - sharedCount[t]; fill(ids, c); }
    // 中身：能力は6種類を巡回して偏りを防ぐ、イベント・宝箱は tier と内容、バトルは野生
    const statIds = g.order.filter((id) => assign[id] && assign[id].t === 'stat');
    let bagS = []; statIds.forEach((id) => { if (!bagS.length) bagS = shuffle(STATS, r); assign[id].k = bagS.pop(); });
    const pool = cfg.eventPool || [], rec = pool.filter((e) => e.recovery), other = pool.filter((e) => !e.recovery);
    const evIds = shuffle(g.order.filter((id) => assign[id] && assign[id].t === 'event'), r);
    const [rlo, rhi] = L.recoveryEvents || [1, 3], nRec = Math.min(evIds.length, randInt(rlo, rhi, r));
    evIds.forEach((id, i) => {
      const e = i < nRec ? pickWeighted(rec, r) : (() => { const tier = pickWeighted(TIERS.map((t) => ({ t, weight: (L.eventTierWeights || {})[t] || 0 })), r).t; const c = other.filter((x) => x.tier === tier); return c.length ? pickWeighted(c, r) : pickWeighted(other, r); })();
      Object.assign(assign[id], { tier: e.tier, ev: e.id }, e.recovery ? { recovery: true } : {});
    });
    for (const id of g.order) if (assign[id] && assign[id].t === 'treasure') assign[id].tier = pickWeighted(TIERS.map((t) => ({ t, weight: ((cfg.treasurePool || {}).tierWeights || {})[t] || 0 })), r).t;
    for (const id of g.order) if (assign[id] && assign[id].t === 'battle') assign[id].bt = 'wild';
    // 固定の強敵・ライバル
    for (const id of g.order) { const k = g.nodes[id].kind; if (k === 'strong' || k === 'rival') assign[id] = { t: 'battle', bt: k, fixed: true }; }
    return assign;
  }
  /** 配置を作る。同じ seed なら同じ結果（制約を満たすまで seed から決まる順番で作り直す） */
  function generateLayout(cfg, seed) {
    const g = buildGraph(cfg);
    for (let attempt = 0; attempt < 400; attempt++) {
      const r = rng((seed >>> 0) + attempt * 7919);
      const a = draftLayout(cfg, g, r);
      if (!validateLayout(cfg, g, a).length) return { seed: seed >>> 0, attempt, assign: a };
    }
    throw new Error('MMCH：配置の制約を満たせません（config.layoutRules を見直してください）');
  }

  // ---------------------------------------------------------
  // 個体の状態（m.raise.field・m.raise.fatigue）
  // ---------------------------------------------------------
  function initRun(m, cfg, rnd = Math.random, seed) {
    const s = Number.isInteger(seed) ? seed >>> 0 : newSeed(rnd), L = generateLayout(cfg, s), g = buildGraph(cfg);
    m.raise.field = { chapterId: cfg.chapterId, patternId: cfg.patternId, fieldId: g.nodes[g.start].field, layoutSeed: L.seed, nodeAssignments: L.assign, consumedEvents: [], openedTreasures: [], clearedStats: [], branch: null };
    return m.raise.field;
  }
  const fieldOf = (m) => (m && isObj(m.raise) && isObj(m.raise.field) ? m.raise.field : null);
  function configFor(m) { const f = fieldOf(m); return f ? getConfig(f.chapterId, f.patternId) : null; }
  const graphFor = (m) => { const c = configFor(m); return c ? buildGraph(c) : null; };
  /** 読み込み時の検査：壊れた・手で書き換えた配置は作り直さず null（Chapter の開始地点から作り直す既存の安全処理に任せる） */
  function validField(f) {
    if (!isObj(f) || !Number.isInteger(f.chapterId) || typeof f.patternId !== 'string' || !Number.isInteger(f.layoutSeed) || !isObj(f.nodeAssignments)) return false;
    const cfg = getConfig(f.chapterId, f.patternId); if (!cfg || cfg.patternId !== f.patternId) return false;
    const g = buildGraph(cfg);
    for (const [id, a] of Object.entries(f.nodeAssignments)) if (!g.nodes[id] || !isObj(a) || !SPECIAL.includes(a.t)) return false;
    for (const k of ['consumedEvents', 'openedTreasures', 'clearedStats']) if (f[k] != null && !(Array.isArray(f[k]) && f[k].every((x) => typeof x === 'string'))) return false;
    return true;
  }
  const clampFatigue = (v) => (Number.isFinite(v) ? clamp(Math.round(v), 0, DEFAULT_RULES.fatigueRules.max) : 0);
  function sanitize(m) {
    const r = m && m.raise; if (!isObj(r)) return m;
    r.fatigue = clampFatigue(r.fatigue);
    if (r.field != null && !validField(r.field)) r.field = null;
    if (r.field) for (const k of ['consumedEvents', 'openedTreasures', 'clearedStats']) if (!Array.isArray(r.field[k])) r.field[k] = [];
    return m;
  }
  /** 停止地点の種類（配置の割り当て。無ければ骨格の種類） */
  function typeAt(m, id) {
    const f = fieldOf(m), g = graphFor(m); if (!f || !g || !g.nodes[id]) return null;
    const a = f.nodeAssignments[id], k = g.nodes[id].kind;
    if (a) return { ...a };
    return { t: k === 'goal' ? 'goal' : k === 'start' ? 'start' : 'normal' };
  }

  // ---------------------------------------------------------
  // 疲れ
  // ---------------------------------------------------------
  const rules = (m) => rulesOf(configFor(m) || {});
  const fatigue = (m) => clampFatigue(m && m.raise ? m.raise.fatigue : 0);
  function addFatigue(m, n) { const b = fatigue(m); m.raise.fatigue = clampFatigue(b + n); return m.raise.fatigue - b; }
  const rollFatigue = (cfgOrRules, v) => (cfgOrRules.fatigueRules || DEFAULT_RULES.fatigueRules).roll[v] || 0;
  /** 疲れ 100 ならサイコロは振れない（休むだけ） */
  const canRoll = (m) => fatigue(m) < rules(m).fatigueRules.max;
  /** 疲れ回復（アイテム・イベント共通）。{ amount } は減らす量、{ full: true } は全回復 */
  function recover(m, eff) { const b = fatigue(m); m.raise.fatigue = eff && eff.full ? 0 : clampFatigue(b - Math.abs((eff && eff.amount) || 0)); return b - m.raise.fatigue; }
  /** 次の Chapter の開始時：max(0, 前Chapterの疲れ − carry) */
  const carryFatigue = (f, carry = DEFAULT_RULES.fatigueRules.carry) => Math.max(0, clampFatigue(f) - carry);

  // 疲れ回復アイテム：正式なアイテムIDが決まったら registerFatigueItem(itemId, 'small' | 'medium' | 'large' | { amount | full }) で登録する（本番は未登録）
  const FATIGUE_ITEMS = {};
  function registerFatigueItem(itemId, eff) { const e = typeof eff === 'string' ? DEFAULT_RULES.fatigueItems[eff] : eff; if (typeof itemId !== 'string' || !isObj(e)) throw new Error('MMCH：アイテムの登録が不正です'); FATIGUE_ITEMS[itemId] = fz({ ...e }); }
  const fatigueItemEffect = (itemId) => FATIGUE_ITEMS[itemId] || null;
  /** サイコロを振る前に使う（ターンは消費しない）。bag の中の登録済みアイテムだけ */
  function useFatigueItem(S, m, bagIndex) {
    const it = S && S.inv && Array.isArray(S.inv.bag) ? S.inv.bag[bagIndex] : null, eff = it && fatigueItemEffect(it.id);
    if (!eff || !m || !m.raise || m.raise.pend || m.raise.goal || m.raise.tour || m.raise.battle) return { ok: false };
    S.inv.bag.splice(bagIndex, 1);
    return { ok: true, itemId: it.id, recovered: recover(m, eff), fatigue: fatigue(m) };
  }

  // ---------------------------------------------------------
  // 能力地点
  // ---------------------------------------------------------
  function statOdds(cfg, f) { const R = rulesOf(cfg || {}); return R.statOdds.find((b) => f <= b.max) || R.statOdds[R.statOdds.length - 1]; }
  /** 1回の抽選で 失敗／大成功／成功 を排他的に決める */
  function statOutcome(cfg, f, r) { const o = statOdds(cfg, f), x = r() * 100; return x < o.fail ? 'fail' : x < o.fail + o.great ? 'great' : 'ok'; }
  function statAmount(cfg, outcome, r) { const R = rulesOf(cfg || {}), [lo, hi] = R.statGainRange; if (outcome === 'fail') return 0; const base = randInt(lo, hi, r); return outcome === 'great' ? Math.round(base * R.greatMultiplier) : base; }
  const STAT_MAX = 999;
  function addStat(m, k, n) { const b = m[k] || 0; m[k] = clamp(b + n, 0, STAT_MAX); return m[k] - b; }

  // ---------------------------------------------------------
  // イベント：handler ごとの処理（データ駆動。新しい種類は registerEventHandler で追加する）
  // ---------------------------------------------------------
  const EVENT_HANDLERS = {
    fatigue: (S, m, p) => ({ kind: 'fatigue', recovered: recover(m, p), fatigue: fatigue(m) }),
    stat_random: (S, m, p, r) => { const key = pick(p.keys || STATS.slice(1), r); return { kind: 'stat', key, amount: addStat(m, key, p.amount) }; },
    stat_all: (S, m, p) => ({ kind: 'multi', gains: (p.keys || STATS.slice(1)).map((key) => ({ key, amount: addStat(m, key, p.amount) })) }),
    gold: (S, m, p) => { S.g = (S.g || 0) + p.amount; return { kind: 'gold', amount: p.amount }; },
    gold_table: (S, m, p, r) => { const x = pickWeighted(p.table || [], r, (e) => e.w); const amount = x ? x.gold : 0; S.g = (S.g || 0) + amount; return { kind: 'gold', amount }; },
  };
  function registerEventHandler(name, fn) { if (typeof name !== 'string' || typeof fn !== 'function') throw new Error('MMCH：イベント処理の登録が不正です'); EVENT_HANDLERS[name] = fn; }

  // ---------------------------------------------------------
  // 停止地点の効果（MMP8.resolveLanding から呼ばれる）
  // ---------------------------------------------------------
  function resolve(S, m, id, rnd = Math.random) {
    const f = fieldOf(m), cfg = configFor(m), a = typeAt(m, id);
    if (!f || !cfg || !a) return null;
    f.fieldId = graphFor(m).nodes[id].field;
    if (a.t === 'stat') {
      const outcome = statOutcome(cfg, fatigue(m), rnd), amount = addStat(m, a.k, statAmount(cfg, outcome, rnd));
      if (!f.clearedStats.includes(id)) f.clearedStats.push(id);
      return { kind: 'chstat', key: a.k, outcome, amount, fatigue: fatigue(m) };
    }
    if (a.t === 'event') {
      if (f.consumedEvents.includes(id)) return { kind: 'none', note: 'consumed' };
      const e = (cfg.eventPool || []).find((x) => x.id === a.ev), h = e && EVENT_HANDLERS[e.handler];
      f.consumedEvents.push(id);
      if (!h) return { kind: 'none', note: 'event' };
      return { ...h(S, m, e.params || {}, rnd), ev: e.id, tier: a.tier, text: e.text || '' };
    }
    if (a.t === 'treasure') {
      if (f.openedTreasures.includes(id)) return { kind: 'none', note: 'opened' };
      f.openedTreasures.push(id);
      // 中身：config.treasurePool.contents（handler＋params）。無ければ開けるだけ（中身は未決のため新しいアイテムは作らない）
      const c = (cfg.treasurePool || {}).contents, h = c && EVENT_HANDLERS[c.handler];
      const reward = h ? h(S, m, (c.byTier && c.byTier[a.tier]) || c.params || {}, rnd) : null;
      return { kind: 'treasure', tier: a.tier, reward };
    }
    if (a.t === 'battle') return { kind: 'battle', battleType: a.bt || 'wild' };
    return a.t === 'goal' ? { kind: 'none', note: 'goal' } : { kind: 'none', note: 'normal' };
  }

  // ---------------------------------------------------------
  // MMP8（raising.js）へのつなぎ（Chapter ドライバー）
  // ---------------------------------------------------------
  const DRIVER = fz({
    handles: (key) => Number.isInteger(key) && handles(key),
    turnLimit: (key) => rulesOf(getConfig(key) || {}).turnLimit,
    /** 出発：Pattern を選んで配置を確定（疲れは前Chapterから max(0, f − carry)） */
    onDepart(S, m, key, rnd = Math.random, fresh) {
      const pat = selectPattern(key, rnd), cfg = getConfig(key, pat);
      m.raise.fatigue = fresh ? 0 : carryFatigue(m.raise.fatigue, rulesOf(cfg).fatigueRules.carry);
      initRun(m, cfg, rnd);
      return { patternId: cfg.patternId };
    },
    /** 疲れの繰り越し（エンジンを使わない Chapter へ出発するときも同じ規則） */
    onDepartOther(S, m, key, fresh) { m.raise.fatigue = fresh ? 0 : carryFatigue(m.raise.fatigue); m.raise.field = null; },
    /** 担当する Chapter のマップ（個体の Pattern。まだ無ければその Chapter の既定の Pattern） */
    trackFor(m, key) { const own = m && configFor(m), cfg = own && own.chapterId === key ? own : getConfig(key); return cfg ? trackOf(cfg) : null; },
    /** ボードを開くとき：配置が無い・壊れている（旧セーブなど）なら、その Chapter の開始地点・0ターンから（大会の途中ならゴールのまま大会を続ける） */
    ensure(S, m, rnd = Math.random) {
      const f = fieldOf(m), key = m.raise.ch;
      if (f && validField(f) && f.chapterId === key && trackOf(configFor(m)).nodes[m.raise.node]) return { changed: false };
      const cfg = getConfig(key, selectPattern(key, rnd));
      initRun(m, cfg, rnd);
      const t = trackOf(cfg), R = rulesOf(cfg);
      if (m.raise.tour) Object.assign(m.raise, { node: t.goal, pend: null, goal: true, turnLimit: R.turnLimit });
      else Object.assign(m.raise, { node: t.start, turnsUsed: 0, pend: null, goal: false, turnLimit: R.turnLimit });
      return { changed: true };
    },
    canRoll: (m) => canRoll(m),
    onRoll(S, m, v) { const add = rollFatigue(rulesOf(configFor(m) || {}), v); addFatigue(m, add); return { fatigueAdded: add }; },
    canRest: (m) => !!fieldOf(m),
    onRest(S, m) { return { recovered: recover(m, { amount: rules(m).fatigueRules.rest }) }; },
    onStep(S, m) { const g = graphFor(m), f = fieldOf(m); if (g && f && g.nodes[m.raise.node]) { f.fieldId = g.nodes[m.raise.node].field; if (g.nodes[m.raise.node].branch) f.branch = g.nodes[m.raise.node].branch; } },
    resolve: (S, m, id, rnd) => resolve(S, m, id, rnd),
    onBattleFinished(S, m) { return { fatigueAdded: addFatigue(m, rules(m).fatigueRules.battle) }; },
    onClose(S, m) { m.raise.field = null; },
    sanitize: (m) => sanitize(m),
  });
  function attach(P8 = root.MMP8) { if (P8 && typeof P8.registerChapterDriver === 'function') P8.registerChapterDriver(DRIVER); }

  root.MMCH = fz({ STATS, SPECIAL, TIERS, BATTLE_TYPES, DEFAULT_RULES, rng, newSeed, registerConfig, getConfig, patterns, handles, selectPattern,
    buildGraph, trackOf, alongPersp, smoothCurve, measure, pointAt, routeBetween, depthOf, stepsToMerge, validateLayout, generateLayout, initRun, fieldOf, configFor, graphFor, validField, sanitize, typeAt,
    fatigue, addFatigue, rollFatigue, canRoll, recover, carryFatigue, registerFatigueItem, fatigueItemEffect, useFatigueItem,
    statOdds, statOutcome, statAmount, registerEventHandler, resolve, DRIVER, attach, rulesOf });
  attach();
})(typeof window !== 'undefined' ? window : globalThis);
