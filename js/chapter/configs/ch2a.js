// =========================================================
// Chapter 2「潮風の海岸」Pattern A「海岸地方」の config（Chapterフィールドエンジン js/chapter/engine.js 用。2026-10-01）
//  このファイルはデータだけ。Chapter 1（ch1a.js）と同じ仕組み（リアル巨大ボード方式・周回なし・道の中央線の安全域・1タップのサイコロ・俯瞰図の導入）で動く。
//  背景10枚（assets/fields/ch2a/road/。出どころは assets/fields/ch2a/README.md）＝海岸地方を長く旅して大会会場へ：
//   序盤 3枚（early a／b／c）→ 中盤 3枚（middle a／b／c）→ 終盤 3枚（late a／b／c）→ 大会会場前 1枚（arena approach）。
//   段階（STAGES）の順にだけ進み、戻らない・飛ばさない（スライドショー・ランダムの並べ替えはしない）。各段階の3枚は景観のバリエーション。
//   Chapter 3・4 も、この STAGES（intro／early／middle／late／arena）と NODES を書き換えた config を足すだけで同じ構造にできる。
//  分岐は無い（1本道。橋／森のような選択は Chapter 1 だけ）。固定の骨格：スタート（序盤a の手前）・強敵（終盤b の真ん中）・ライバル（会場前のゴール2つ手前。強制停止）・ゴール（会場前の奥＝大会門）。
//  マス（能力・イベント・野生バトル・宝箱）の割り当て・停止時の効果・通過・強制停止は既存のエンジン。配置の数（counts）・イベントの値は【暫定】（Chapter 1 と同じ値を総マス数に比例させた）。
//  座標は各背景画像に対する割合（x・y とも 0〜1。y は下ほど手前）。
// =========================================================
(function (root) {
  'use strict';
  const A = './assets/fields/ch2a/', R = A + 'road/', I = A + 'intro/', C1 = './assets/fields/ch1a/';   // 目印・サイコロ・操作欄の画像は Chapter 1 と共通
  const DEPTH = [[0.98, 1.22], [0.9, 1.1], [0.84, 1], [0.72, 0.84], [0.6, 0.62], [0.535, 0.5], [0.47, 0.4], [0.425, 0.34], [0.38, 0.28], [0.3, 0.2]];
  const ROAD_Y = [0.3, 0.34, 0.38, 0.42, 0.46, 0.5, 0.55, 0.6, 0.65, 0.7, 0.8, 0.9, 0.97];
  const NEAR = 0.87, FAR = 0.36;
  const ROAD_SHAPE = { vanish: 0.245, slope: 0.95, maxHalf: 0.5, safe: 0.7 };
  /**
   * 背景：キー → [ファイル名, 表示名【暫定】, 道の中央線の x（ROAD_Y の順＝奥 0.3 → 手前 0.97）, 幅のモデルの上書き, 地形]
   *  中央線は実画像の計測（海・空・緑以外の帯）＋目視。y 0.65 より手前は石畳が画面幅いっぱい＝0.5。崖の白い岩が道と同じ色なので、奥は目視を優先
   */
  const BG = {
    e1: ['ch2_01_early_a', '白浜の海岸道', [0.66, 0.6, 0.56, 0.55, 0.52, 0.52, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]],
    e2: ['ch2_02_early_b', '岩礁の海辺', [0.68, 0.64, 0.6, 0.58, 0.56, 0.55, 0.52, 0.51, 0.5, 0.5, 0.5, 0.5, 0.5]],
    e3: ['ch2_03_early_c', '海風の丘', [0.68, 0.63, 0.6, 0.6, 0.57, 0.56, 0.52, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]],
    m1: ['ch2_04_middle_a', '海上の石橋', [0.52, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5], { safe: 0.6 }, 'bridge'],
    m2: ['ch2_05_middle_b', '離島への道', [0.55, 0.55, 0.56, 0.57, 0.57, 0.56, 0.54, 0.52, 0.5, 0.5, 0.5, 0.5, 0.5]],
    m3: ['ch2_06_middle_c', '遺跡の海岸', [0.62, 0.6, 0.58, 0.55, 0.52, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]],
    l1: ['ch2_07_late_a', '白亜の門', [0.6, 0.58, 0.56, 0.55, 0.54, 0.52, 0.51, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]],
    l2: ['ch2_08_late_b', '岬の大橋', [0.62, 0.6, 0.58, 0.57, 0.55, 0.52, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5], { safe: 0.6 }, 'bridge'],
    l3: ['ch2_09_late_c', '高台の道', [0.7, 0.68, 0.65, 0.6, 0.58, 0.56, 0.53, 0.52, 0.5, 0.5, 0.5, 0.5, 0.5]],
    z1: ['ch2_10_arena_approach', '大会会場への道', [0.55, 0.55, 0.55, 0.55, 0.54, 0.53, 0.52, 0.51, 0.5, 0.5, 0.5, 0.5, 0.5]],
  };
  // 段階（この順にだけ進む）。Chapter 3・4 はここと BG を書き換える
  const STAGES = { early: ['e1', 'e2', 'e3'], middle: ['m1', 'm2', 'm3'], late: ['l1', 'l2', 'l3'], arena: ['z1'] };
  const STAGE_ORDER = ['early', 'middle', 'late', 'arena'];
  // 背景1枚あたりのマス数＝ルートの長さ【暫定候補。正式確定ではない】：序盤 7・中盤 7・終盤 7・会場前 6 ＝ 68歩（ノード69）。
  //  比較は `node tests/chapter-sim.mjs 1000 cautious 2`（2026-10-01：到達 100%・平均 22 ターン前後）
  const NODES = root.MMCH_CH2A_NODES || { early: 7, middle: 7, late: 7, arena: 6 };
  // path id：e1_／e2_／e3_（序盤）・m1_…（中盤）・l1_…（終盤）・z1_（会場前）
  const fieldScenes = [], paths = [], landmarks = {}, foreground = {};
  const centerAt = (xs, y) => { if (y <= ROAD_Y[0]) return xs[0]; for (let i = 1; i < ROAD_Y.length; i++) if (y <= ROAD_Y[i]) { const r = (y - ROAD_Y[i - 1]) / (ROAD_Y[i] - ROAD_Y[i - 1]); return +(xs[i - 1] + (xs[i] - xs[i - 1]) * r).toFixed(4); } return xs[xs.length - 1]; };
  const chain = [];
  for (const stage of STAGE_ORDER) for (const k of STAGES[stage]) {
    const [file, name, xs, shape, terrain] = BG[k], sid = fieldScenes.length + 1, id = `${k}_`;
    const road = { ...ROAD_SHAPE, ...(shape || {}), center: ROAD_Y.map((y, i) => [y, xs[i]]) };
    fieldScenes.push({ id: sid, name, bg: R + file + '.webp', w: 768, h: 1360, bgKey: k, stage, exit: 'up', farBand: { to: 0.26, k: 0.95 }, depth: DEPTH, zoom: { near: 1.32, far: 1.95 }, road });
    landmarks[sid] = []; foreground[sid] = [];
    const ys = [NEAR, 0.8, 0.72, 0.64, 0.56, 0.5, 0.45, 0.4, FAR];
    paths.push({ id, field: sid, n: NODES[stage], curve: 'linear', terrain: terrain || 'coast', next: [], pts: ys.map((y) => [centerAt(xs, y), y]) });
    if (chain.length) paths[paths.length - 2].next = [id];
    chain.push(id);
  }
  const P = (id) => paths.find((p) => p.id === id), N = (id) => P(id).n;
  P('e1_').start = true; P('e1_').fixed = { 0: 'start' };
  P('l2_').fixed = { [Math.floor(N('l2_') / 2)]: 'strong' };
  const gl = P('z1_'); gl.goal = true; gl.fixed = { [N('z1_') - 3]: 'rival', [N('z1_') - 1]: 'goal' };

  const cfg = {
    chapterId: 2,
    patternId: 'A',
    title: '潮風の海岸',
    patternTitle: '海岸地方',
    playable: true,
    rules: { turnLimit: 30, diceSides: 6 },
    forceStopKinds: ['rival'],
    tournamentDestination: 'official',
    backgroundTransition: { type: 'forward', ms: 700 },
    stages: STAGES, stageOrder: STAGE_ORDER, nodesPerBackground: NODES, roadShape: ROAD_SHAPE,

    fieldScenes, paths, edges: {}, nodeOverrides: {},
    branches: [],

    camera: { anchorY: 0.66, lookAhead: 0.08, followDelay: 110, zoom: { idle: 1, move: 0.985, stop: 1.015, branch: 0.93, focus: 1.02 } },
    motion: { stepMs: 520, minMs: 380, maxMs: 760, baseLen: 170, terrain: { coast: { speed: 1 }, bridge: { speed: 1, fixed: true } } },
    parallax: { far: 0.95, back: 0.97, road: 1, front: 1.12, canopy: 0.6 },

    // ---- Chapter開始の演出：正式な俯瞰図（intro/ch2_intro_overview.webp。演出専用。プレイの背景10枚とは別で、背景の順には入れない）。
    //  会場（右上の円形闘技場）を見せてから、スタート付近（左下の大橋）へズーム／パン → 序盤a の実プレイ画面へ ----
    intro: { overviews: { A: I + 'ch2_intro_overview.webp' },
      goalFocus: { x: 0.78, y: 0.14 }, startFocus: { x: 0.2, y: 0.9 }, zoom: { from: 1.0, to: 2.2 }, holdMs: 1500, moveMs: 2200, fadeMs: 700, titleMs: 2200 },

    // ---- 操作欄・サイコロ：Chapter 1 と共通の正式画像 ----
    deck: { start: C1 + 'ui/deck_start.webp', aspect: 1100 / 353,
      hit: { center: { x: 0.385, y: 0.03, w: 0.23, h: 0.94 }, tl: { x: 0.012, y: 0.05, w: 0.37, h: 0.42 }, tr: { x: 0.618, y: 0.05, w: 0.37, h: 0.42 }, bl: { x: 0.012, y: 0.53, w: 0.37, h: 0.42 }, br: { x: 0.618, y: 0.53, w: 0.37, h: 0.42 } } },
    dice: { rollingSprite: C1 + 'dice/dice_blank.webp', resultSprites: { 1: C1 + 'dice/dice_stop_1.webp', 2: C1 + 'dice/dice_stop_2.webp', 3: C1 + 'dice/dice_stop_3.webp', 4: C1 + 'dice/dice_stop_4.webp', 5: C1 + 'dice/dice_stop_5.webp', 6: C1 + 'dice/dice_stop_6.webp' } },

    // ---- 配置の規則【暫定：Chapter 1（59歩）の割合を 68歩に比例させた】 ----
    layoutRules: {
      counts: { stat: [14, 17], event: [7, 10], battle: [5, 7], treasure: [3, 5] },
      maxPerStat: 4, recoveryEvents: [2, 4], recoveryPerRoute: true,
      noBattleFirst: 5, maxBattlesFirst: [12, 1], noEventLast: 4,
      maxFieldShare: 0.25, minFieldShare: 0,
      eventTierWeights: { normal: 70, rare: 25, special: 5 },
    },
    // ---- イベント（値は Chapter 1 と同じ【暫定】。疲れ回復は正式仕様） ----
    eventPool: [
      { id: 'shade', tier: 'normal', recovery: true, weight: 4, handler: 'fatigue', params: { amount: 10 }, text: '岩陰でひと休みした。', look: { h: 104 } },
      { id: 'break', tier: 'normal', recovery: true, weight: 3, handler: 'fatigue', params: { amount: 20 }, text: '海辺で小休憩をとった。', look: { h: 104 } },
      { id: 'spring', tier: 'rare', recovery: true, weight: 2, handler: 'fatigue', params: { amount: 30 }, text: '澄んだ泉で体を休めた。', look: { h: 118 } },
      { id: 'holy_spring', tier: 'special', recovery: true, weight: 1, handler: 'fatigue', params: { full: true }, text: '不思議な泉の力で、疲れがすっかり取れた！', look: { h: 132 } },
      { id: 'herb', tier: 'normal', weight: 3, handler: 'stat_random', params: { amount: 6 }, text: '珍しい海草を見つけた！', look: { h: 104 } },
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
    companion: { npc: 'fina', reactions: {} },
    assets: {
      stat_li: C1 + 'nodes/stat_life.webp', stat_po: C1 + 'nodes/stat_power.webp', stat_in: C1 + 'nodes/stat_intelligence.webp',
      stat_hi: C1 + 'nodes/stat_accuracy.webp', stat_ev: C1 + 'nodes/stat_evasion.webp', stat_de: C1 + 'nodes/stat_toughness.webp',
      event_normal: C1 + 'nodes/event_normal.webp', event_rare: C1 + 'nodes/event_rare.webp', event_special: C1 + 'nodes/event_special.webp',
      treasure_normal: C1 + 'nodes/treasure_normal.webp', treasure_rare: C1 + 'nodes/treasure_rare.webp', treasure_special: C1 + 'nodes/treasure_special.webp',
      battle_wild: C1 + 'nodes/battle_wild.webp', battle_rival: C1 + 'nodes/battle_rival.webp', battle_strong: C1 + 'nodes/battle_wild.webp',
      grass_front: C1 + 'env/grass_flower_border.webp',
    },
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
    monster: { h: 180, w: 150 },
    landmarks, foreground, branchOverlays: {},
  };
  if (root.MMCH) root.MMCH.registerConfig(cfg);
  root.MMCH_CONFIG_CH2A = cfg;
})(typeof window !== 'undefined' ? window : globalThis);
