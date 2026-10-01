// =========================================================
// Chapter 1「はじまりの草原」Pattern A の config（Chapterフィールドエンジン js/chapter/engine.js 用）
//  このファイルはデータだけ。Chapter 2（ch2a.js）と同じ方式：背景を決まった順にだけ1回ずつ通り、各背景の実際の道の中央線の上にマスを置く。
//  2026-10-01（新しい正式背景）：assets/fields/ch1a/field/ch1_field_01〜10（出どころは assets/fields/ch1a/README.md）。
//   01 草原 → 02 花畑・丘陵 → 03 森と清流 → 04 森林・渓谷（石橋）→ 05 森の遺跡 → 06 大橋（強敵）→ 07 高原 → 08 古代遺跡（S字）→ 09 大会地方 → 10 大会会場（ライバル＝強制停止・ゴール）。
//   1本道（橋／森の分岐は廃止）。俯瞰図は intro/ch1_intro_overview.webp（導入演出専用。背景の順には入れない）。
//   旧構成の背景（road/ 15枚・journey/ 13枚）はファイルを残すが参照しない。
//  道の中央線（ROADS）：各背景の画像を目視で読み、[y, x, 半幅]（背景に対する割合）を手前→奥に並べたもの。曲がった細い道のため幅も点ごとに書く。
//   モンスターは半幅の 70%（safe）の中から出ない（engine の roadAt／clampToRoad、field-view の roadX）。ずれていたら ROADS の数字を直すだけ。
// =========================================================
(function (root) {
  'use strict';
  const A = './assets/fields/ch1a/', F = A + 'field/', I = A + 'intro/', U = A + 'ui/', D = A + 'dice/';
  const W = 864, H = 1536;   // 背景画像の大きさ（Chapter 2 の 768×1360 と同じ縦横比）
  const DEPTH = [[0.98, 1.22], [0.9, 1.1], [0.84, 1], [0.72, 0.84], [0.6, 0.62], [0.535, 0.5], [0.47, 0.4], [0.425, 0.34], [0.38, 0.28], [0.3, 0.2]];
  const NEAR = 0.87;   // いちばん手前のマスの y
  // 背景：キー → [ファイル, 表示名【暫定】, 地形, 奥のマスの y（道が細くなりすぎる手前）, 道の中央線 [y, x, 半幅]（奥 → 手前）]
  const BG = {
    '01': ['ch1_field_01', '旅立ちの草原', 'grass', 0.47, [[0.45, 0.60, 0.025], [0.5, 0.57, 0.04], [0.55, 0.55, 0.06], [0.6, 0.53, 0.08], [0.7, 0.54, 0.13], [0.8, 0.50, 0.2], [0.9, 0.47, 0.26], [0.97, 0.46, 0.3]]],
    '02': ['ch1_field_02', '花の丘', 'grass', 0.46, [[0.43, 0.68, 0.025], [0.47, 0.63, 0.035], [0.5, 0.61, 0.04], [0.55, 0.62, 0.05], [0.6, 0.62, 0.07], [0.7, 0.62, 0.12], [0.8, 0.62, 0.18], [0.9, 0.62, 0.25], [0.97, 0.62, 0.3]]],
    '03': ['ch1_field_03', '森と清流', 'forest', 0.45, [[0.42, 0.47, 0.02], [0.47, 0.44, 0.03], [0.52, 0.40, 0.04], [0.58, 0.42, 0.06], [0.65, 0.47, 0.09], [0.75, 0.50, 0.14], [0.85, 0.48, 0.2], [0.97, 0.47, 0.28]]],
    '04': ['ch1_field_04', '渓谷の小道', 'forest', 0.40, [[0.35, 0.42, 0.02], [0.42, 0.39, 0.03], [0.5, 0.40, 0.04], [0.58, 0.42, 0.06], [0.65, 0.43, 0.09], [0.75, 0.45, 0.13], [0.85, 0.46, 0.2], [0.97, 0.47, 0.28]]],
    '05': ['ch1_field_05', '森の遺跡', 'forest', 0.42, [[0.42, 0.52, 0.02], [0.48, 0.50, 0.03], [0.55, 0.48, 0.05], [0.62, 0.47, 0.08], [0.7, 0.48, 0.11], [0.8, 0.49, 0.17], [0.9, 0.49, 0.23], [0.97, 0.49, 0.28]]],
    '06': ['ch1_field_06', '天空の大橋', 'bridge', 0.32, [[0.2, 0.62, 0.02], [0.3, 0.60, 0.03], [0.4, 0.58, 0.045], [0.5, 0.56, 0.06], [0.6, 0.55, 0.08], [0.7, 0.55, 0.1], [0.8, 0.56, 0.13], [0.9, 0.57, 0.17], [0.97, 0.58, 0.2]]],
    '07': ['ch1_field_07', '風の高原', 'highland', 0.32, [[0.22, 0.55, 0.015], [0.3, 0.55, 0.025], [0.4, 0.53, 0.04], [0.5, 0.52, 0.06], [0.6, 0.52, 0.09], [0.7, 0.52, 0.13], [0.8, 0.51, 0.19], [0.9, 0.51, 0.27], [0.97, 0.51, 0.32]]],
    '08': ['ch1_field_08', '古代遺跡の道', 'highland', 0.35, [[0.3, 0.60, 0.02], [0.35, 0.68, 0.03], [0.4, 0.62, 0.04], [0.45, 0.52, 0.05], [0.5, 0.48, 0.06], [0.55, 0.52, 0.07], [0.6, 0.58, 0.09], [0.7, 0.56, 0.12], [0.8, 0.52, 0.17], [0.9, 0.50, 0.23], [0.97, 0.50, 0.28]]],
    '09': ['ch1_field_09', '大会地方', 'highland', 0.32, [[0.25, 0.55, 0.015], [0.32, 0.55, 0.025], [0.38, 0.48, 0.035], [0.43, 0.45, 0.04], [0.48, 0.52, 0.05], [0.55, 0.60, 0.07], [0.62, 0.52, 0.09], [0.7, 0.45, 0.12], [0.8, 0.45, 0.17], [0.9, 0.45, 0.23], [0.97, 0.45, 0.28]]],
    '10': ['ch1_field_10', '大会会場', 'highland', 0.36, [[0.32, 0.53, 0.03], [0.4, 0.53, 0.05], [0.5, 0.53, 0.08], [0.6, 0.53, 0.12], [0.7, 0.53, 0.17], [0.8, 0.53, 0.22], [0.9, 0.53, 0.28], [0.97, 0.53, 0.32]]],
  };
  const ORDER = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10'];
  // 背景1枚あたりのマス数＝ルートの長さ【暫定。正式確定ではない】：各 6 ＝ 59歩（ノード60）。`node tests/chapter-sim.mjs 1000` で確認
  const NODES = root.MMCH_CH1A_NODES || Object.fromEntries(ORDER.map((k) => [k, 6]));
  const fieldScenes = [], paths = [], landmarks = {}, foreground = {};
  const at = (pts, y, k) => { const C = [...pts].sort((a, b) => a[0] - b[0]); if (y <= C[0][0]) return C[0][k]; for (let i = 1; i < C.length; i++) if (y <= C[i][0]) { const a = C[i - 1], b = C[i]; return +(a[k] + (b[k] - a[k]) * (y - a[0]) / (b[0] - a[0])).toFixed(4); } return C[C.length - 1][k]; };
  for (const k of ORDER) {
    const [file, name, terrain, far, road] = BG[k], sid = fieldScenes.length + 1, id = `f${+k}_`;
    fieldScenes.push({ id: sid, name, bg: F + file + '.webp', w: W, h: H, bgKey: k, stage: k, exit: 'up', farBand: { to: 0.26, k: 0.95 }, depth: DEPTH, zoom: { near: 1.32, far: 1.95 }, road: { center: road, safe: 0.7 } });
    landmarks[sid] = []; foreground[sid] = [];
    // 歩く道筋＝中央線（手前 NEAR → 奥 far）。マスはこの線の上に奥行きで等間隔（engine の alongPersp）。中間の点も道の上なので、歩きの途中も道から外れない
    const ys = [NEAR, ...road.map((p) => p[0]).filter((y) => y < NEAR && y > far).sort((a, b) => b - a), far];
    paths.push({ id, field: sid, n: NODES[k], curve: 'linear', terrain, next: [], pts: ys.map((y) => [at(road, y, 1), y]) });
    if (paths.length > 1) paths[paths.length - 2].next = [id];
  }
  const P = (id) => paths.find((p) => p.id === id), N = (id) => P(id).n;
  P('f1_').start = true; P('f1_').fixed = { 0: 'start' };
  P('f6_').fixed = { [Math.floor(N('f6_') / 2)]: 'strong' };   // 強敵：天空の大橋の真ん中
  const gl = P('f10_'); gl.goal = true; gl.fixed = { [N('f10_') - 3]: 'rival', [N('f10_') - 1]: 'goal' };   // ライバル（強制停止）→ ゴール（大会会場）

  const cfg = {
    chapterId: 1,
    patternId: 'A',
    title: 'はじまりの草原',
    patternTitle: 'はじまりの草原',
    playable: true,
    rules: { turnLimit: 30, diceSides: 6 },
    forceStopKinds: ['rival'],
    tournamentDestination: 'official',
    backgroundTransition: { type: 'forward', ms: 700 },
    stageOrder: ORDER, nodesPerBackground: NODES,

    fieldScenes, paths, edges: {}, nodeOverrides: {},
    branches: [],

    camera: { anchorY: 0.66, lookAhead: 0.08, followDelay: 110, zoom: { idle: 1, move: 0.985, stop: 1.015, branch: 0.93, focus: 1.02 } },
    motion: { stepMs: 520, minMs: 380, maxMs: 760, baseLen: 170, terrain: { grass: { speed: 1 }, highland: { speed: 0.96 }, bridge: { speed: 1, fixed: true }, forest: { speed: 0.94 } } },
    parallax: { far: 0.95, back: 0.97, road: 1, front: 1.12, canopy: 0.6 },

    // ---- Chapter開始の演出：正式な俯瞰図（intro/ch1_intro_overview.webp。演出専用）。大会会場（上）を見せてからスタート（下の草原の小道）へズーム／パン → 01 へ ----
    intro: { overviews: { A: I + 'ch1_intro_overview.webp' },
      goalFocus: { x: 0.66, y: 0.06 }, startFocus: { x: 0.5, y: 0.92 }, zoom: { from: 1.0, to: 2.2 }, holdMs: 1500, moveMs: 2200, fadeMs: 700, titleMs: 2200 },

    // ---- 操作欄：START の正式画像（STOP は使わない） ----
    deck: { start: U + 'deck_start.webp', aspect: 1100 / 353,
      hit: { center: { x: 0.385, y: 0.03, w: 0.23, h: 0.94 }, tl: { x: 0.012, y: 0.05, w: 0.37, h: 0.42 }, tr: { x: 0.618, y: 0.05, w: 0.37, h: 0.42 }, bl: { x: 0.012, y: 0.53, w: 0.37, h: 0.42 }, br: { x: 0.618, y: 0.53, w: 0.37, h: 0.42 } } },

    // ---- 配置の規則（固定骨格＋候補ノードへのランダムな割り当て）【暫定：総マス数と一緒に見直す】 ----
    layoutRules: {
      counts: { stat: [12, 15], event: [6, 9], battle: [4, 6], treasure: [3, 4] },   // 59歩の 20〜25%・10〜15%・7〜10%・5〜7%【暫定】
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
