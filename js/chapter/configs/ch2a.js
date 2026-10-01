// =========================================================
// Chapter 2「潮風の海岸」Pattern A の config（Chapterフィールドエンジン js/chapter/engine.js 用）
//  このファイルはデータだけ。Chapter 1（ch1a.js）と同じ方式：背景を決まった順にだけ1回ずつ通り、各背景の実際の道の中央線の上にマスを置く。
//  2026-10-01 夜（正式背景）：assets/fields/ch2a/field/ch2_field_01〜09 → arena/ch2_arena_approach（出どころは assets/fields/ch2a/README.md）。
//   01 海辺の遊歩道 → 02 白砂の浜道 → 03 岬の古道 → 04 海上の大橋（強敵）→ 05 珊瑚の遺跡 →（海中）06 海底回廊の入口 → 07 海底の回廊 → 08 沈んだ神殿 →
//   （海上）09 夕凪の海道 → 10 大会会場への道（ライバル＝強制停止・ゴール）。表示名は【暫定】。1本道（分岐なし）。
//   海中の区間（06〜08）は画像に描かれた回廊・通路の床の上だけを歩く（水の中・柱の外は安全域に入れない）。
//   俯瞰図は intro/ch2_intro_overview_v2.webp（導入演出専用。背景の順には入れない）。
//   旧構成の背景（road/ 10枚）と旧俯瞰図 intro/ch2_intro_overview.webp はファイルを残すが参照しない。
//  道の中央線（ROADS）：各背景の画像を目視で読み、[y, x, 半幅]（背景に対する割合）を手前→奥に並べたもの（Chapter 1 と同じ書き方）。
//   モンスターは半幅の 70%（橋は 60%）の中から出ない。ずれていたら ROADS の数字を直すだけ。
// =========================================================
(function (root) {
  'use strict';
  const A = './assets/fields/ch2a/', F = A + 'field/', Z = A + 'arena/', I = A + 'intro/', C1 = './assets/fields/ch1a/';   // 目印・サイコロ・操作欄の画像は Chapter 1 と共通
  const W = 864, H = 1536;
  const DEPTH = [[0.98, 1.22], [0.9, 1.1], [0.84, 1], [0.72, 0.84], [0.6, 0.62], [0.535, 0.5], [0.47, 0.4], [0.425, 0.34], [0.38, 0.28], [0.3, 0.2]];
  const NEAR = 0.87;   // いちばん手前のマスの y
  // 背景：キー → [ファイル, 表示名【暫定】, 地形, 奥のマスの y（道が細くなりすぎる手前・門や階段の手前）, 道の中央線 [y, x, 半幅]（奥 → 手前）, 安全域の割合]
  const BG = {
    '01': [F + 'ch2_field_01', '海辺の遊歩道', 'coast', 0.40, [[0.30, 0.47, 0.03], [0.35, 0.46, 0.06], [0.40, 0.45, 0.10], [0.50, 0.46, 0.19], [0.60, 0.48, 0.27], [0.70, 0.50, 0.36], [0.80, 0.50, 0.42], [0.97, 0.50, 0.48]]],
    '02': [F + 'ch2_field_02', '白砂の浜道', 'coast', 0.30, [[0.12, 0.53, 0.02], [0.20, 0.55, 0.04], [0.30, 0.55, 0.08], [0.40, 0.54, 0.12], [0.50, 0.53, 0.16], [0.60, 0.54, 0.21], [0.70, 0.55, 0.26], [0.80, 0.55, 0.30], [0.90, 0.55, 0.34], [0.97, 0.55, 0.37]]],
    '03': [F + 'ch2_field_03', '岬の古道', 'coast', 0.38, [[0.33, 0.55, 0.08], [0.40, 0.55, 0.09], [0.50, 0.54, 0.11], [0.60, 0.55, 0.15], [0.70, 0.55, 0.19], [0.80, 0.56, 0.24], [0.90, 0.57, 0.28], [0.97, 0.57, 0.31]]],
    '04': [F + 'ch2_field_04', '海上の大橋', 'bridge', 0.30, [[0.15, 0.48, 0.03], [0.22, 0.49, 0.08], [0.30, 0.50, 0.12], [0.40, 0.50, 0.15], [0.50, 0.51, 0.18], [0.60, 0.51, 0.21], [0.70, 0.51, 0.25], [0.80, 0.51, 0.29], [0.90, 0.51, 0.33], [0.97, 0.51, 0.36]], 0.6],
    '05': [F + 'ch2_field_05', '珊瑚の遺跡', 'coast', 0.45, [[0.38, 0.53, 0.03], [0.44, 0.52, 0.06], [0.50, 0.52, 0.08], [0.55, 0.51, 0.10], [0.65, 0.50, 0.14], [0.75, 0.50, 0.19], [0.85, 0.50, 0.24], [0.97, 0.50, 0.30]]],
    '06': [F + 'ch2_field_06', '海底回廊の入口', 'undersea', 0.45, [[0.41, 0.45, 0.08], [0.45, 0.48, 0.14], [0.50, 0.50, 0.21], [0.60, 0.50, 0.30], [0.70, 0.50, 0.37], [0.80, 0.50, 0.42], [0.97, 0.50, 0.47]]],
    '07': [F + 'ch2_field_07', '海底の回廊', 'undersea', 0.62, [[0.585, 0.48, 0.07], [0.62, 0.49, 0.18], [0.70, 0.50, 0.28], [0.80, 0.50, 0.37], [0.90, 0.50, 0.43], [0.97, 0.50, 0.46]]],
    '08': [F + 'ch2_field_08', '沈んだ神殿', 'undersea', 0.50, [[0.45, 0.52, 0.03], [0.50, 0.51, 0.06], [0.60, 0.51, 0.10], [0.70, 0.51, 0.15], [0.80, 0.52, 0.20], [0.90, 0.52, 0.25], [0.97, 0.52, 0.28]]],
    '09': [F + 'ch2_field_09', '夕凪の海道', 'bridge', 0.34, [[0.25, 0.63, 0.02], [0.30, 0.60, 0.03], [0.40, 0.55, 0.06], [0.50, 0.54, 0.10], [0.60, 0.54, 0.14], [0.70, 0.53, 0.20], [0.80, 0.52, 0.26], [0.90, 0.51, 0.32], [0.97, 0.51, 0.35]], 0.6],
    '10': [Z + 'ch2_arena_approach', '大会会場への道', 'coast', 0.38, [[0.28, 0.50, 0.07], [0.37, 0.50, 0.09], [0.45, 0.50, 0.14], [0.50, 0.50, 0.18], [0.60, 0.50, 0.25], [0.70, 0.50, 0.31], [0.80, 0.50, 0.37], [0.97, 0.50, 0.45]]],
  };
  const ORDER = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10'];
  // 段階（表示・記録用。進む順は ORDER だけ）
  const STAGES = { coast: ['01', '02', '03', '04', '05'], undersea: ['06', '07', '08'], late: ['09'], arena: ['10'] };
  // 背景1枚あたりのマス数＝ルートの長さ【暫定。正式確定ではない】：道の長さに合わせて 5〜7（長い橋 04・09 は 7、短い 05・07 は 5）＝ 59歩（ノード60。Chapter 1 と同じ）。
  //  `node tests/chapter-sim.mjs 1000 cautious 2` で確認（2026-10-01：到達 100%・平均 19 ターン前後）
  const NODES = root.MMCH_CH2A_NODES || { '01': 6, '02': 6, '03': 6, '04': 7, '05': 5, '06': 6, '07': 5, '08': 6, '09': 7, '10': 6 };
  // path id：s1_〜s9_（フィールド 01〜09）・sa_（大会会場前）。旧構成の id（e1_…z1_）とは重ねない＝旧 Chapter 2 の途中のセーブは既存の安全処理で Chapter 2 の開始地点から
  const PID = (k) => (k === '10' ? 'sa_' : `s${+k}_`);
  const fieldScenes = [], paths = [], landmarks = {}, foreground = {};
  const at = (pts, y, k) => { const C = [...pts].sort((a, b) => a[0] - b[0]); if (y <= C[0][0]) return C[0][k]; for (let i = 1; i < C.length; i++) if (y <= C[i][0]) { const a = C[i - 1], b = C[i]; return +(a[k] + (b[k] - a[k]) * (y - a[0]) / (b[0] - a[0])).toFixed(4); } return C[C.length - 1][k]; };
  const stageOf = (k) => Object.keys(STAGES).find((s) => STAGES[s].includes(k));
  for (const k of ORDER) {
    const [file, name, terrain, far, road, safe] = BG[k], sid = fieldScenes.length + 1, id = PID(k);
    fieldScenes.push({ id: sid, name, bg: file + '.webp', w: W, h: H, bgKey: k, stage: stageOf(k), exit: 'up', farBand: { to: 0.26, k: 0.95 }, depth: DEPTH, zoom: { near: 1.32, far: 1.95 }, road: { center: road, safe: safe || 0.7 } });
    landmarks[sid] = []; foreground[sid] = [];
    const ys = [NEAR, ...road.map((p) => p[0]).filter((y) => y < NEAR && y > far).sort((a, b) => b - a), far];
    paths.push({ id, field: sid, n: NODES[k], curve: 'linear', terrain, next: [], pts: ys.map((y) => [at(road, y, 1), y]) });
    if (paths.length > 1) paths[paths.length - 2].next = [id];
  }
  const P = (id) => paths.find((p) => p.id === id), N = (id) => P(id).n;
  P('s1_').start = true; P('s1_').fixed = { 0: 'start' };
  P('s4_').fixed = { [Math.floor(N('s4_') / 2)]: 'strong' };   // 強敵：海上の大橋の真ん中【暫定】
  const gl = P('sa_'); gl.goal = true; gl.fixed = { [N('sa_') - 3]: 'rival', [N('sa_') - 1]: 'goal' };   // ライバル（強制停止）→ ゴール（大会会場の階段の手前）

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
    stages: STAGES, stageOrder: ORDER, nodesPerBackground: NODES,

    fieldScenes, paths, edges: {}, nodeOverrides: {},
    branches: [],

    camera: { anchorY: 0.66, lookAhead: 0.08, followDelay: 110, zoom: { idle: 1, move: 0.985, stop: 1.015, branch: 0.93, focus: 1.02 } },
    motion: { stepMs: 520, minMs: 380, maxMs: 760, baseLen: 170, terrain: { coast: { speed: 1 }, bridge: { speed: 1, fixed: true }, undersea: { speed: 0.95 } } },
    parallax: { far: 0.95, back: 0.97, road: 1, front: 1.12, canopy: 0.6 },

    // ---- Chapter開始の演出：正式な俯瞰図（intro/ch2_intro_overview_v2.webp。演出専用。背景の順には入れない）。
    //  大会会場（上の海上の島）→ 海上の塔 → 海中の回廊（via）→ スタート（下の海辺の街の遊歩道）へズーム／パン → 01 の実プレイ画面へ ----
    intro: { overviews: { A: I + 'ch2_intro_overview_v2.webp' },
      goalFocus: { x: 0.5, y: 0.08 }, startFocus: { x: 0.3, y: 0.9 }, zoom: { from: 1.0, to: 2.2 },
      via: [{ x: 0.5, y: 0.22, zoom: 1.35 }, { x: 0.52, y: 0.48, zoom: 1.5 }], holdMs: 1500, moveMs: 3000, fadeMs: 700, titleMs: 2200 },

    // ---- 操作欄・サイコロ：Chapter 1 と共通の正式画像 ----
    deck: { start: C1 + 'ui/deck_start.webp', aspect: 1100 / 353,
      hit: { center: { x: 0.385, y: 0.03, w: 0.23, h: 0.94 }, tl: { x: 0.012, y: 0.05, w: 0.37, h: 0.42 }, tr: { x: 0.618, y: 0.05, w: 0.37, h: 0.42 }, bl: { x: 0.012, y: 0.53, w: 0.37, h: 0.42 }, br: { x: 0.618, y: 0.53, w: 0.37, h: 0.42 } } },
    dice: { rollingSprite: C1 + 'dice/dice_blank.webp', resultSprites: { 1: C1 + 'dice/dice_stop_1.webp', 2: C1 + 'dice/dice_stop_2.webp', 3: C1 + 'dice/dice_stop_3.webp', 4: C1 + 'dice/dice_stop_4.webp', 5: C1 + 'dice/dice_stop_5.webp', 6: C1 + 'dice/dice_stop_6.webp' } },

    // ---- 配置の規則【暫定：総マス数が Chapter 1 と同じ 59歩なので同じ数】 ----
    layoutRules: {
      counts: { stat: [12, 15], event: [6, 9], battle: [4, 6], treasure: [3, 4] },   // 59歩：Chapter 1 と同じ【暫定】
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
