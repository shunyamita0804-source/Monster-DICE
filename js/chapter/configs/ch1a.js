// =========================================================
// Chapter 1「はじまりの草原」Pattern A の config（Chapterフィールドエンジン js/chapter/engine.js 用）
//  このファイルはデータだけ。背景を決まった順にだけ1回ずつ通り、各背景の実際の道の中央線の上にマスを置く。
//  2026-10-02（正式背景）：assets/fields/ch1a/final/field/ch1_bg_01〜14（出どころは assets/fields/ch1a/final/README.md）。
//   進行するのは 01〜14 の14枚だけ（1本道）。14 の最後のマス＝ゴール（大会会場の門前）に着いたら、
//   到着イベント専用の背景 final/event/ch1_bg_15_event（公式大会会場・正門前。マス・サイコロなし）へ切り替え → フィナの会話 → 大会受付（config.arrival）。
//   旧構成の背景（field/ 10枚・road/ 15枚・journey/ 13枚）はファイルを残すが参照しない。
//  BACKGROUNDS：背景ごとに backgroundId・image・表示名【暫定】・地形・道の中央線 road [y, x, 半幅]（画像を目視で読んだ値。背景に対する割合）・
//   nodes＝その背景が担当するマスの座標 [x, y]（背景に対する割合。手前 → 奥）。マス数＝nodes の数（背景ごとに違ってよい）。
//   マスは道の中央線の上に、手前 y 0.87 から「道が細くなりすぎる手前」まで、奥行き補正で等間隔（奥ほど画面上の間隔が狭い）。
//   背景の最奥（遠景の道）まではマスを置かない（この先にも世界が続く景観として残す）。
//   必要なら背景ごとに camera（{ zoom:{ near, far } } など）を書ける。ずれていたら数字を直すだけ。
//  合計 64 マス（63歩）・40ターン・サイコロ 1〜3（2026-10-02 ユーザー判断：90マスは 40ターン・1〜3 では到達できないため 60〜65 の範囲で 64）。
// =========================================================
(function (root) {
  'use strict';
  const A = './assets/fields/ch1a/', FN = A + 'final/', F = FN + 'field/', I = A + 'intro/', U = A + 'ui/', D = A + 'dice/';
  const W = 762, H = 1536;   // 背景画像の大きさ
  const DEPTH = [[0.98, 1.22], [0.9, 1.1], [0.84, 1], [0.72, 0.84], [0.6, 0.62], [0.535, 0.5], [0.47, 0.4], [0.425, 0.34], [0.38, 0.28], [0.3, 0.2]];
  const BACKGROUNDS = [
    { backgroundId: '01', image: F + 'ch1_bg_01.webp', name: '旅立ちの小道', terrain: 'grass',
      road: [[0.97,0.5,0.45],[0.85,0.48,0.4],[0.75,0.47,0.33],[0.65,0.48,0.26],[0.58,0.52,0.18],[0.52,0.57,0.12],[0.47,0.58,0.08],[0.43,0.56,0.05]],
      nodes: [[0.483,0.87],[0.471,0.764],[0.478,0.673],[0.509,0.599],[0.552,0.541],[0.576,0.49]] },
    { backgroundId: '02', image: F + 'ch1_bg_02.webp', name: '木漏れ日の森道', terrain: 'forest',
      road: [[0.97,0.53,0.43],[0.85,0.51,0.37],[0.75,0.49,0.29],[0.65,0.49,0.21],[0.57,0.5,0.13],[0.52,0.53,0.09],[0.48,0.56,0.06]],
      nodes: [[0.513,0.87],[0.49,0.751],[0.49,0.65],[0.5,0.571],[0.537,0.51]] },
    { backgroundId: '03', image: F + 'ch1_bg_03.webp', name: '清流の石橋', terrain: 'bridge',
      road: [[0.97,0.5,0.46],[0.85,0.5,0.4],[0.75,0.5,0.33],[0.65,0.51,0.27],[0.55,0.5,0.2],[0.48,0.52,0.13],[0.44,0.56,0.09]],
      nodes: [[0.5,0.87],[0.501,0.742],[0.509,0.638],[0.5,0.555],[0.517,0.49]] },
    { backgroundId: '04', image: F + 'ch1_bg_04.webp', name: '遺跡の門', terrain: 'forest',
      road: [[0.97,0.5,0.48],[0.85,0.5,0.43],[0.75,0.51,0.36],[0.65,0.52,0.28],[0.57,0.52,0.21],[0.51,0.52,0.14],[0.47,0.53,0.1]],
      nodes: [[0.5,0.87],[0.51,0.752],[0.52,0.653],[0.52,0.573],[0.52,0.51]] },
    { backgroundId: '05', image: F + 'ch1_bg_05.webp', name: '滝の見える道', terrain: 'forest',
      road: [[0.97,0.5,0.45],[0.85,0.5,0.38],[0.75,0.49,0.3],[0.68,0.5,0.24],[0.62,0.52,0.17],[0.59,0.53,0.13]],
      nodes: [[0.5,0.87],[0.492,0.77],[0.5,0.682],[0.523,0.61]] },
    { backgroundId: '06', image: F + 'ch1_bg_06.webp', name: '大樹の森', terrain: 'forest',
      road: [[0.97,0.5,0.45],[0.85,0.5,0.38],[0.75,0.51,0.31],[0.68,0.54,0.21],[0.63,0.57,0.12],[0.59,0.6,0.07]],
      nodes: [[0.5,0.87],[0.508,0.774],[0.536,0.689],[0.578,0.62]] },
    { backgroundId: '07', image: F + 'ch1_bg_07.webp', name: '深い森の小道', terrain: 'forest',
      road: [[0.97,0.5,0.46],[0.85,0.5,0.4],[0.75,0.5,0.33],[0.68,0.51,0.25],[0.63,0.54,0.16],[0.6,0.56,0.11]],
      nodes: [[0.5,0.87],[0.5,0.774],[0.509,0.689],[0.547,0.62]] },
    { backgroundId: '08', image: F + 'ch1_bg_08.webp', name: '水道橋の見える道', terrain: 'highland',
      road: [[0.97,0.5,0.48],[0.85,0.5,0.45],[0.75,0.51,0.4],[0.67,0.53,0.33],[0.61,0.56,0.25],[0.56,0.6,0.15],[0.53,0.62,0.09]],
      nodes: [[0.5,0.87],[0.512,0.742],[0.545,0.639],[0.6,0.56]] },
    { backgroundId: '09', image: F + 'ch1_bg_09.webp', name: '天空の大橋', terrain: 'bridge',
      road: [[0.97,0.5,0.48],[0.85,0.5,0.46],[0.75,0.49,0.42],[0.65,0.48,0.37],[0.57,0.46,0.3],[0.5,0.44,0.19],[0.46,0.45,0.12],[0.43,0.46,0.07]],
      nodes: [[0.5,0.87],[0.49,0.752],[0.48,0.653],[0.461,0.575],[0.444,0.513],[0.45,0.46]] },
    { backgroundId: '10', image: F + 'ch1_bg_10.webp', name: '風の丘', terrain: 'highland',
      road: [[0.97,0.5,0.48],[0.85,0.5,0.46],[0.75,0.5,0.43],[0.65,0.5,0.37],[0.58,0.51,0.28],[0.53,0.52,0.18],[0.49,0.53,0.1]],
      nodes: [[0.5,0.87],[0.5,0.751],[0.5,0.652],[0.511,0.573],[0.525,0.51]] },
    { backgroundId: '11', image: F + 'ch1_bg_11.webp', name: '古塔の遺跡', terrain: 'highland',
      road: [[0.97,0.5,0.48],[0.85,0.5,0.45],[0.75,0.51,0.4],[0.65,0.52,0.33],[0.58,0.53,0.25],[0.53,0.53,0.16],[0.49,0.53,0.09]],
      nodes: [[0.5,0.87],[0.51,0.752],[0.52,0.652],[0.53,0.574],[0.53,0.51]] },
    { backgroundId: '12', image: F + 'ch1_bg_12.webp', name: '遺跡の高台', terrain: 'highland',
      road: [[0.97,0.5,0.48],[0.85,0.5,0.45],[0.75,0.51,0.42],[0.65,0.53,0.37],[0.59,0.53,0.27],[0.55,0.53,0.16],[0.53,0.53,0.11]],
      nodes: [[0.5,0.87],[0.511,0.745],[0.53,0.642],[0.53,0.56]] },
    { backgroundId: '13', image: F + 'ch1_bg_13.webp', name: '城へ続く道', terrain: 'grass',
      road: [[0.97,0.48,0.45],[0.85,0.47,0.4],[0.75,0.47,0.32],[0.67,0.48,0.23],[0.61,0.5,0.15],[0.56,0.53,0.09],[0.52,0.55,0.06]],
      nodes: [[0.472,0.87],[0.471,0.744],[0.49,0.641],[0.53,0.56]] },
    { backgroundId: '14', image: F + 'ch1_bg_14.webp', name: '大会会場の門前', terrain: 'highland',
      road: [[0.97,0.5,0.48],[0.85,0.5,0.47],[0.75,0.5,0.4],[0.7,0.5,0.3],[0.66,0.5,0.22],[0.63,0.5,0.15]],
      nodes: [[0.5,0.87],[0.5,0.769],[0.5,0.68]] },
  ];
  const TOTAL_NODES = 64;   // 01〜14 の合計（tests/chapter-engine.test.mjs で確認）
  const fieldScenes = [], paths = [], landmarks = {}, foreground = {};
  const at = (pts, y, k) => { const C = [...pts].sort((a, b) => a[0] - b[0]); if (y <= C[0][0]) return C[0][k]; for (let i = 1; i < C.length; i++) if (y <= C[i][0]) { const a = C[i - 1], b = C[i]; return +(a[k] + (b[k] - a[k]) * (y - a[0]) / (b[0] - a[0])).toFixed(4); } return C[C.length - 1][k]; };
  for (const B of BACKGROUNDS) {
    const sid = fieldScenes.length + 1, id = `w${sid}_`, near = B.nodes[0][1], far = B.nodes[B.nodes.length - 1][1];
    fieldScenes.push({ id: sid, name: B.name, bg: B.image, w: W, h: H, bgKey: B.backgroundId, stage: B.backgroundId, exit: 'up', farBand: { to: 0.26, k: 0.95 }, depth: DEPTH, zoom: (B.camera && B.camera.zoom) || { near: 1.45, far: 2.15 }, road: { center: B.road, safe: 0.7 }, ...(B.camera && B.camera.scene ? { camera: B.camera.scene } : {}) });
    landmarks[sid] = []; foreground[sid] = [];
    // 歩く道筋：マスの点と、その間にある道の中央線の点（手前 → 奥）。歩きの途中も道から外れない
    const mids = B.road.filter((p) => p[0] < near && p[0] > far).map((p) => [at(B.road, p[0], 1), p[0]]);
    const pts = [...B.nodes.map((q) => [q[0], q[1]]), ...mids].sort((a, b) => b[1] - a[1]);
    paths.push({ id, field: sid, n: B.nodes.length, nodePts: B.nodes, curve: 'linear', terrain: B.terrain, next: [], pts });
    if (paths.length > 1) paths[paths.length - 2].next = [id];
  }
  const ORDER = BACKGROUNDS.map((B) => B.backgroundId), NODES = Object.fromEntries(BACKGROUNDS.map((B) => [B.backgroundId, B.nodes.length]));
  const P = (id) => paths.find((p) => p.id === id), N = (id) => P(id).n;
  P('w1_').start = true; P('w1_').fixed = { 0: 'start' };
  P('w9_').fixed = { [Math.floor(N('w9_') / 2)]: 'strong' };   // 強敵：天空の大橋（09）の真ん中
  const gl = P('w14_'); gl.goal = true; gl.fixed = { [N('w14_') - 3]: 'rival', [N('w14_') - 1]: 'goal' };   // ライバル（強制停止）→ ゴール（大会会場の門前）

  const cfg = {
    chapterId: 1,
    patternId: 'A',
    title: 'はじまりの草原',
    patternTitle: 'はじまりの草原',
    playable: true,
    rules: { turnLimit: 40, diceSides: 3 },   // 2026-10-01 夜：通常 Chapter のサイコロは 1〜3・40ターン（Chapter 2 と同じ。4〜6 の素材・共通の仕組みは残す）【試遊用の値】
    forceStopKinds: ['rival'],
    tournamentDestination: 'official',
    // ---- ゴール（14 の最後のマス）に着いたあと：到着イベント専用の背景（マス・サイコロ・操作欄なし）→ フィナの短い会話 → 大会受付（ランク選択）。
    //  {name} はプレイヤー名（初期名アルト）。会話はこの個体のこの Chapter で1回（m.raise.field.arrivalSeen）。受付のあとは既存の大会（開始演出 → セドリックの進行） ----
    arrival: { bg: FN + 'event/ch1_bg_15_event.webp', name: '公式大会会場・正門前', fadeMs: 900,
      talk: [
        { npc: 'fina', expression: 'happy', text: 'やっと着いたね、{name}さん！' },
        { expression: 'smile', text: 'ここが公式大会の会場だよ。' },
        { expression: 'guide', text: 'さあ、早速受付に行こう！' },
      ] },
    backgroundTransition: { type: 'forward', ms: 700 },
    stageOrder: ORDER, nodesPerBackground: NODES, totalNodes: TOTAL_NODES,

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
