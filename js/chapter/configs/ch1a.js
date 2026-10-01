// =========================================================
// Chapter 1「はじまりの草原」Pattern A「大橋と清流の草原」の config（Chapterフィールドエンジン js/chapter/engine.js 用）
//  このファイルはデータだけ。Chapter 2 以降は同じ形の config を作って MMCH.registerConfig するだけで動く。
//  2026-10-01：「リアル巨大ボード方式」。正式背景15枚（assets/fields/ch1a/road/。出どころは assets/fields/ch1a/README.md）＝世界の中の巨大な古代街道。
//   2026-10-01（周回の廃止）：背景はどれも1回だけ通り、1枚の中に複数のマス（NODES：共通 6・橋 6・森 8・会場 6【暫定】）を道の中央線の上に奥行きで等間隔に置く。
//   カメラは低く、近景の石板2〜3枚ぶんだけが見える。モンスターは各背景の「道の中央線」（fieldScenes[].road：中央 x と幅のモデル）の安全域から出ない（engine の clampToRoad）。
//   旅の順：01 旅立ちの街道 → 02 花の草原 → 03 清流の道 → 04 草原の遺跡（分岐）
//          橋ルート（短め）：05A 風の高原 → 06A 大橋への道 → 07A 古代橋の入口 → 08A 古代橋の中央（強敵）→ 09A 橋の出口
//          森ルート（長め）：05B 森の入口 → 06B 木漏れ日の道 → 07B 森の小川 → 08B 深い古代の森 → 09B 森の出口
//          合流：10 大会会場への道（ライバル＝強制停止・大会門）
//   総マス数は NODES（背景1枚あたりのマス数）だけで変えられる【暫定・最終確定はシミュレーションの比較を見てから】。背景の切り替えは既存（端まで歩く → 短い暗転 → 入口から入る）。
//  座標は各背景画像に対する割合（x・y とも 0〜1。y は下ほど手前）。ノードは通常見えない（?chdebug=1 のときだけ表示）。
//  旧13枚の旅（journey/）・暫定の停止面（dice_stop_1〜3.svg）はファイルを残すが参照しない。
// =========================================================
(function (root) {
  'use strict';
  const A = './assets/fields/ch1a/', R = A + 'road/', I = A + 'intro/', U = A + 'ui/', D = A + 'dice/';
  // 奥行き：y → その場所の大きさ（石板の間隔から。隣の石板どうしが同じ距離に見えるように）
  const DEPTH = [[0.98, 1.22], [0.9, 1.1], [0.84, 1], [0.72, 0.84], [0.6, 0.62], [0.535, 0.5], [0.47, 0.4], [0.425, 0.34], [0.38, 0.28], [0.3, 0.2]];
  // 道の中央線を定義する y（手前 → 奥）。ノードはこの線の上に、奥行き補正で等間隔に置く（alongPersp）。奥の端（0.36）より先は道が細すぎるので使わない
  const ROAD_Y = [0.3, 0.34, 0.38, 0.42, 0.46, 0.5, 0.55, 0.6, 0.65, 0.7, 0.8, 0.9, 0.97];
  const NEAR = 0.87, FAR = 0.36;
  // 道の幅のモデル（15枚とも同じ構図の街道）：消失点 vanish から手前へ広がる。半幅 = min(maxHalf, slope × (y − vanish))。安全域は半幅 × safe（端には寄らない）
  const ROAD_SHAPE = { vanish: 0.245, slope: 0.95, maxHalf: 0.5, safe: 0.7 };
  /**
   * 背景：キー → [ファイル名, 表示名, 道の中央線の x（ROAD_Y の順＝奥 0.3 → 手前 0.97）, 幅のモデルの上書き]
   *  中央線は実画像の計測（scratchpad の画素計測＋目視。y 0.65 より手前は石畳が画面幅いっぱい＝輪の中心 0.5）
   */
  const BG = {
    '01': ['01_journey_road', '旅立ちの街道', [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]],
    '02': ['02_flower_meadow', '花の草原', [0.63, 0.59, 0.555, 0.53, 0.515, 0.505, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]],
    '03': ['03_stream_road', '清流の道', [0.68, 0.62, 0.575, 0.55, 0.54, 0.53, 0.52, 0.51, 0.5, 0.5, 0.5, 0.5, 0.5]],
    '04': ['04_grassland_ruins', '草原の遺跡', [0.61, 0.565, 0.545, 0.535, 0.53, 0.525, 0.52, 0.51, 0.5, 0.5, 0.5, 0.5, 0.5]],
    '05a': ['05a_windy_highland', '風の高原', [0.585, 0.55, 0.535, 0.53, 0.53, 0.53, 0.525, 0.515, 0.5, 0.5, 0.5, 0.5, 0.5]],
    '06a': ['06a_bridge_approach', '大橋への道', [0.585, 0.555, 0.53, 0.52, 0.52, 0.52, 0.52, 0.51, 0.5, 0.5, 0.5, 0.5, 0.5]],
    '07a': ['07a_ancient_bridge_entrance', '古代橋の入口', [0.51, 0.505, 0.505, 0.505, 0.505, 0.505, 0.505, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5], { safe: 0.6 }],
    '08a': ['08a_ancient_bridge_center', '古代橋の中央', [0.55, 0.535, 0.525, 0.52, 0.515, 0.51, 0.505, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5], { safe: 0.6 }],
    '09a': ['09a_bridge_exit', '橋の出口', [0.59, 0.555, 0.535, 0.53, 0.53, 0.525, 0.52, 0.51, 0.5, 0.5, 0.5, 0.5, 0.5]],
    '05b': ['05b_forest_entrance', '森の入口', [0.555, 0.535, 0.525, 0.525, 0.525, 0.525, 0.52, 0.515, 0.5, 0.5, 0.5, 0.5, 0.5]],
    '06b': ['06b_sunlit_forest_road', '木漏れ日の道', [0.61, 0.565, 0.54, 0.53, 0.53, 0.53, 0.525, 0.515, 0.5, 0.5, 0.5, 0.5, 0.5]],
    '07b': ['07b_forest_stream', '森の小川', [0.57, 0.545, 0.535, 0.535, 0.535, 0.535, 0.53, 0.52, 0.505, 0.5, 0.5, 0.5, 0.5]],
    '08b': ['08b_deep_ancient_forest', '深い古代の森', [0.545, 0.53, 0.525, 0.525, 0.53, 0.53, 0.53, 0.52, 0.505, 0.5, 0.5, 0.5, 0.5]],
    '09b': ['09b_forest_exit', '森の出口', [0.585, 0.55, 0.53, 0.525, 0.525, 0.52, 0.52, 0.515, 0.5, 0.5, 0.5, 0.5, 0.5]],
    '10': ['10_tournament_approach', '大会会場への道', [0.51, 0.51, 0.51, 0.51, 0.51, 0.51, 0.51, 0.505, 0.5, 0.5, 0.5, 0.5, 0.5]],
  };
  // 背景1枚あたりのマス数＝ルートの長さ【暫定候補。正式確定ではない】：共通 6・橋 6・森 8・会場 6 ＝ 橋ルート 60マス／森ルート 70マス（背景はどれも1回だけ通る。周回なし）。
  //  ここ（またはこの表）を変えるだけで総マス数が変わる。tests/chapter-balance.mjs で候補を比較する。最終距離はシミュレーションと実際の試遊感を見てから決める
  const NODES = root.MMCH_CH1A_NODES || { shared: 6, bridge: 6, forest: 8, goal: 6 };
  // 旅の順とルート（path id の頭：共通 f1_／g1_／g2_／f2_、橋 a…、森 b…、合流 f3_）
  const ORDER = { shared: [['01', 'f1_'], ['02', 'g1_'], ['03', 'g2_'], ['04', 'f2_']], bridge: [['05a', 'a'], ['06a', 'a2_'], ['07a', 'a3_'], ['08a', 'a4_'], ['09a', 'a5_']], forest: [['05b', 'b'], ['06b', 'b2_'], ['07b', 'b3_'], ['08b', 'b4_'], ['09b', 'b5_']], goal: [['10', 'f3_']] };
  const terrainOf = (k) => (/^0[5-9]b/.test(k) ? 'forest' : /^0[7-8]a/.test(k) ? 'bridge' : k === '05a' || k === '10' ? 'highland' : 'grass');
  const fieldScenes = [], paths = [], landmarks = {}, foreground = {};
  /** 中央線の x（y で線形補間） */
  const centerAt = (xs, y) => { if (y <= ROAD_Y[0]) return xs[0]; for (let i = 1; i < ROAD_Y.length; i++) if (y <= ROAD_Y[i]) { const r = (y - ROAD_Y[i - 1]) / (ROAD_Y[i] - ROAD_Y[i - 1]); return +(xs[i - 1] + (xs[i] - xs[i - 1]) * r).toFixed(4); } return xs[xs.length - 1]; };
  /** 背景 k に n マスの道を1本作る（各背景は1回だけ通る）。chain＝前の道につなぐ */
  function build(k, base, n, branch, chain) {
    const [file, name, xs, shape] = BG[k], sid = fieldScenes.length + 1;
    const road = { ...ROAD_SHAPE, ...(shape || {}), center: ROAD_Y.map((y, i) => [y, xs[i]]) };
    fieldScenes.push({ id: sid, name, bg: R + file + '.webp', w: 768, h: 1360, bgKey: k, exit: 'up', farBand: { to: 0.26, k: 0.95 }, depth: DEPTH, zoom: { near: 1.32, far: 1.95 }, road });
    landmarks[sid] = []; foreground[sid] = [];
    // 道の点列＝中央線（手前 NEAR → 奥 FAR）。ノードは engine が奥行き補正で等間隔に置く
    const ys = [NEAR, 0.8, 0.72, 0.64, 0.56, 0.5, 0.45, 0.4, FAR];
    paths.push({ id: base, field: sid, n, curve: 'linear', terrain: terrainOf(k), next: [], ...(branch ? { branch } : {}), pts: ys.map((y) => [centerAt(xs, y), y]) });
    if (chain.length) paths.find((p) => p.id === chain[chain.length - 1]).next.push(base);
    chain.push(base);
    return base;
  }
  const shared = []; for (const [k, base] of ORDER.shared) build(k, base, NODES.shared, null, shared);
  const bridge = [shared[shared.length - 1]]; for (const [k, base] of ORDER.bridge) build(k, base, NODES.bridge, 'bridge', bridge);
  const forest = [shared[shared.length - 1]]; for (const [k, base] of ORDER.forest) build(k, base, NODES.forest, 'forest', forest);
  const goal = []; for (const [k, base] of ORDER.goal) build(k, base, NODES.goal, null, goal);
  const P = (id) => paths.find((p) => p.id === id), last = (ids) => ids[ids.length - 1], N = (id) => P(id).n;
  P(last(bridge)).next = [goal[0]]; P(last(forest)).next = [goal[0]];
  // 固定の骨格：スタート（01 の手前）・分岐（04 の奥の端）・強敵（08A 橋の中央）・合流（10 の手前）・ライバル（ゴールの2つ手前。強制停止）・ゴール（10 の奥＝大会門）
  P(shared[0]).start = true; P(shared[0]).fixed = { 0: 'start' };
  P(last(shared)).fixed = { [N(last(shared)) - 1]: 'branch' };
  P('a4_').fixed = { [Math.floor(N('a4_') / 2)]: 'strong' };
  P(goal[0]).fixed = { 0: 'merge' };
  const gl = P(last(goal)); gl.goal = true; gl.fixed = { ...(gl.fixed || {}), [N(last(goal)) - 3]: 'rival', [N(last(goal)) - 1]: 'goal' };
  const branchAt = `${last(shared)}${N(last(shared)) - 1}`, bridgeFirst = 'a0', forestFirst = 'b0';

  const cfg = {
    chapterId: 1,
    patternId: 'A',
    title: 'はじまりの草原',
    patternTitle: '大橋と清流の草原',
    playable: true,
    // 通常Chapter：サイコロ 1〜6・30ターン。ターンを使い切ったら大会なしで Chapter 終了（能力・持ち物は保持 → ファーム → 次の Chapter）
    rules: { turnLimit: 30, diceSides: 6 },
    forceStopKinds: ['rival'],   // ライバルは出目が残っていても必ず止まる（必須イベント）
    tournamentDestination: 'official',
    backgroundTransition: { type: 'forward', ms: 700 },
    nodesPerBackground: NODES, roadShape: ROAD_SHAPE,

    fieldScenes, paths, edges: {}, nodeOverrides: {},
    branches: [{ at: branchAt, options: [
      { id: 'bridge', to: bridgeFirst, label: '橋ルート', desc: '風の高原から古代橋を渡る、少し短い道。大会へ急ぐならこちら', lean: { battle: 1, stat: -1 } },
      { id: 'forest', to: forestFirst, label: '森ルート', desc: '古代の森を抜ける、少し長い道。能力・イベント・宝箱が多め', lean: { stat: 1, event: 1, treasure: 1, battle: -1 } },
    ] }],

    // ---- カメラ・歩き・視差：低いカメラでモンスターと一緒に前へ（近景の石板だけが見える） ----
    camera: { anchorY: 0.66, lookAhead: 0.08, followDelay: 110, zoom: { idle: 1, move: 0.985, stop: 1.015, branch: 0.93, focus: 1.02 } },
    motion: { stepMs: 520, minMs: 380, maxMs: 760, baseLen: 170, terrain: { grass: { speed: 1 }, highland: { speed: 0.96 }, bridge: { speed: 1, fixed: true }, forest: { speed: 0.94 } } },
    parallax: { far: 0.95, back: 0.97, road: 1, front: 1.12, canopy: 0.6 },

    // ---- Chapter開始の演出：旅路全体の俯瞰図（演出専用。プレイの背景とは別の画像）→ スタート地点へズーム／パン → 01 の実プレイ画面へ ----
    //  overviews：Pattern（A／B／C）ごとの俯瞰図。startFocus＝俯瞰図の中のスタート付近（割合）。goalFocus＝会場（最初に見せる）
    intro: { overviews: { A: I + 'ch1_intro_overview_pattern1.webp', B: I + 'ch1_intro_overview_pattern2.webp', C: I + 'ch1_intro_overview_pattern3.webp' },
      goalFocus: { x: 0.5, y: 0.28 }, startFocus: { x: 0.5, y: 0.93 }, zoom: { from: 1.0, to: 2.3 }, holdMs: 1500, moveMs: 2200, fadeMs: 700, titleMs: 2200 },

    // ---- 操作欄：START の正式画像（4コマンド＋中央の球）。hit＝画像に対する割合（押せる領域）。2026-10-01：サイコロは START の1タップで自動停止（STOP の操作は廃止。ui/deck_stop.webp はファイルだけ残し、使わない） ----
    deck: { start: U + 'deck_start.webp', aspect: 1100 / 353,
      hit: { center: { x: 0.385, y: 0.03, w: 0.23, h: 0.94 }, tl: { x: 0.012, y: 0.05, w: 0.37, h: 0.42 }, tr: { x: 0.618, y: 0.05, w: 0.37, h: 0.42 }, bl: { x: 0.012, y: 0.53, w: 0.37, h: 0.42 }, br: { x: 0.618, y: 0.53, w: 0.37, h: 0.42 } } },

    // ---- 配置の規則（固定骨格＋候補ノードへのランダムな割り当て）。counts はスタート→ゴールの1ルートあたり【暫定：総マス数と一緒に見直す】 ----
    layoutRules: {
      counts: { stat: [12, 15], event: [6, 9], battle: [4, 6], treasure: [3, 4] },   // 短いほうのルート（60マス）の 20〜25%・10〜15%・7〜10%・5〜7%
      maxPerStat: 4, recoveryEvents: [2, 4], recoveryPerRoute: true,
      noBattleFirst: 5, maxBattlesFirst: [12, 1], noEventLast: 4,
      maxFieldShare: 0.25, minFieldShare: 0,
      eventTierWeights: { normal: 70, rare: 25, special: 5 },
    },

    // ---- イベント（値は旧Chapterの暫定イベントと同じ【暫定】。疲れ回復は正式仕様）。目印は tier の祠を石板の脇に小さく置く（街道の上に木・岩は置かない） ----
    eventPool: [
      { id: 'shade', tier: 'normal', recovery: true, weight: 4, handler: 'fatigue', params: { amount: 10 }, text: '石板の木陰でひと休みした。', look: { h: 104 } },
      { id: 'break', tier: 'normal', recovery: true, weight: 3, handler: 'fatigue', params: { amount: 20 }, text: '街道のそばで小休憩をとった。', look: { h: 104 } },
      { id: 'spring', tier: 'rare', recovery: true, weight: 2, handler: 'fatigue', params: { amount: 30 }, text: '澄んだ泉で体を休めた。', look: { h: 118 } },
      { id: 'holy_spring', tier: 'special', recovery: true, weight: 1, handler: 'fatigue', params: { full: true }, text: '不思議な泉の力で、疲れがすっかり取れた！', look: { h: 132 } },
      { id: 'herb', tier: 'normal', weight: 3, handler: 'stat_random', params: { amount: 6 }, text: '珍しい草を見つけた！', look: { h: 104 } },
      { id: 'trip', tier: 'normal', weight: 2, handler: 'stat_random', params: { amount: -4 }, text: '石につまずいて転んでしまった…', look: { h: 104 } },
      { id: 'coin', tier: 'normal', weight: 3, handler: 'gold', params: { amount: 50 }, text: '道端でお金を見つけた！', look: { h: 104 } },
      { id: 'sage', tier: 'rare', weight: 2, handler: 'stat_random', params: { amount: 20 }, text: '旅の賢者に教えを受けた！', look: { h: 118 } },
      { id: 'charm', tier: 'rare', weight: 2, handler: 'gold', params: { amount: 150 }, text: '幸運のお守りを見つけた！', look: { h: 118 } },
      { id: 'legend_spring', tier: 'special', weight: 1, handler: 'stat_all', params: { amount: 8 }, text: '伝説の泉の力で、ライフ以外の能力がそれぞれ上がった！', look: { h: 132 } },
    ],
    treasurePool: { tierWeights: { normal: 70, rare: 25, special: 5 }, contents: { handler: 'gold_table', params: { table: [{ w: 4, gold: 50 }, { w: 1, gold: 150 }] } } },
    battleTypes: {
      wild: { label: '野生のモンスター', asset: 'battle_wild' },
      strong: { label: '強敵', asset: 'battle_strong' },
      rival: { label: 'ライバル', asset: 'battle_rival', figure: null },
    },
    // 同行者（フィナ）のリアクション：本文は未決（空＝何も出さない）。例：gold: ['50G拾ったよ。ラッキーだね。']。key は MMCH.REACTION_KEYS
    companion: { npc: 'fina', reactions: {} },

    // ---- サイコロ：回転中は無地の正式サイコロ（dice_blank）、停止面は正式の dice_stop_1〜6（上面＝出目） ----
    dice: { rollingSprite: D + 'dice_blank.webp', resultSprites: { 1: D + 'dice_stop_1.webp', 2: D + 'dice_stop_2.webp', 3: D + 'dice_stop_3.webp', 4: D + 'dice_stop_4.webp', 5: D + 'dice_stop_5.webp', 6: D + 'dice_stop_6.webp' } },

    assets: {
      stat_li: A + 'nodes/stat_life.webp', stat_po: A + 'nodes/stat_power.webp', stat_in: A + 'nodes/stat_intelligence.webp',
      stat_hi: A + 'nodes/stat_accuracy.webp', stat_ev: A + 'nodes/stat_evasion.webp', stat_de: A + 'nodes/stat_toughness.webp',
      event_normal: A + 'nodes/event_normal.webp', event_rare: A + 'nodes/event_rare.webp', event_special: A + 'nodes/event_special.webp',
      treasure_normal: A + 'nodes/treasure_normal.webp', treasure_rare: A + 'nodes/treasure_rare.webp', treasure_special: A + 'nodes/treasure_special.webp',
      battle_wild: A + 'nodes/battle_wild.webp', battle_rival: A + 'nodes/battle_rival.webp', battle_strong: A + 'nodes/battle_wild.webp',
      grass_front: A + 'env/grass_flower_border.webp',
    },
    // 目印：石板の脇（道の中央の輪にモンスター、目印は輪の横。奥の輪でもモンスターに重ならない距離 gap）。足元の草は置かない（石の道）
    nodeLook: {
      stat: { w: 104, side: 1, gap: 215, sink: 0.1, tuft: false },
      event: { h: 110, side: 1, gap: 215, sink: 0.06, tuft: false },
      eventNature: { w: 140, side: 1, gap: 215, sink: 0.08, tuft: false },
      treasure: { w: 88, side: -1, gap: 205, sink: 0.08, tuft: false },
      battle: { h: 140, side: 1, gap: 170, sink: 0.04, tuft: false },
      figure: { h: 190, side: 1, gap: 150, sink: 0.02, tuft: false },
      tuft: 'grass_front',
    },
    battleMarkers: false,
    landmarkVisibility: { stat: 'arrive', event: 'arrive', treasure: 'always' },
    monster: { h: 180, w: 150 },   // w＝体の幅（道の安全域の計算に使う。画像の見た目の幅）
    landmarks, foreground, branchOverlays: {},
  };
  if (root.MMCH) root.MMCH.registerConfig(cfg);
  root.MMCH_CONFIG_CH1A = cfg;
})(typeof window !== 'undefined' ? window : globalThis);
