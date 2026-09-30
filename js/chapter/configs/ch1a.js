// =========================================================
// Chapter 1「はじまりの草原」Pattern A「大橋と清流の草原」の config（Chapterフィールドエンジン js/chapter/engine.js 用）
//  このファイルはデータだけ。Chapter 2 以降は同じ形の config を作って MMCH.registerConfig するだけで動く。
//  座標は背景画像（864×1536）に対する割合（x・y とも 0〜1。y は下ほど手前）。ノードは通常見えない（?chdebug=1 のときだけ表示）。
//  素材は assets/fields/ch1a/（出どころ・加工は assets/fields/ch1a/README.md）。
// =========================================================
(function (root) {
  'use strict';
  const A = './assets/fields/ch1a/';
  const cfg = {
    chapterId: 1,
    patternId: 'A',
    title: 'はじまりの草原',
    patternTitle: '大橋と清流の草原',
    playable: true,
    rules: { turnLimit: 30 },   // 疲れ・能力の確率・上昇量は MMCH.DEFAULT_RULES（正式仕様）のまま
    tournamentDestination: 'official',   // ゴール（大会門）→ 公式ランク大会（MMP8 の既存の大会）
    backgroundTransition: { type: 'forward', ms: 760 },

    // ---- 背景（3フィールドで1つながりの旅）。depth：y（下ほど手前）ごとの大きさ。zoom：カメラの寄り（手前 near → 奥 far） ----
    fieldScenes: [
      { id: 1, name: '旅立ちの草原', bg: A + 'bg_01.webp', w: 864, h: 1536, exit: 'up',
        depth: [[0.98, 1], [0.85, 0.86], [0.72, 0.68], [0.62, 0.53], [0.52, 0.41], [0.44, 0.32]], zoom: { near: 1.3, far: 1.42 } },
      { id: 2, name: '大橋と清流', bg: A + 'bg_02.webp', w: 864, h: 1536, exit: 'up',
        depth: [[0.98, 1], [0.86, 0.86], [0.76, 0.72], [0.64, 0.57], [0.52, 0.45], [0.44, 0.37], [0.34, 0.28]], zoom: { near: 1.3, far: 1.4 } },
      { id: 3, name: '大会へ続く高原', bg: A + 'bg_03.webp', w: 864, h: 1536, exit: 'up',
        depth: [[0.98, 1], [0.85, 0.85], [0.72, 0.66], [0.6, 0.5], [0.5, 0.39], [0.4, 0.3], [0.28, 0.21]], zoom: { near: 1.3, far: 1.46 } },
    ],

    // ---- 道筋（背景の道に沿ったノード）。fixed：固定の骨格（それ以外は候補ノード＝配置で種類が決まる） ----
    //  歩数（スタート→ゴール）：大橋ルート 44・森の小道 48。FIELD 1：14 / FIELD 2：4＋13（大橋）または 4＋17（森）/ FIELD 3：14（1000回のシミュレーションで平均22〜25ターンになるよう調整）
    paths: [
      { id: 'f1_', field: 1, n: 14, start: true, next: ['f2_'], noSlot: [1],
        pts: [[0.465, 0.835], [0.47, 0.79], [0.485, 0.745], [0.515, 0.675], [0.545, 0.615], [0.565, 0.565], [0.59, 0.52], [0.62, 0.48], [0.65, 0.45]],
        fixed: { 0: 'start', 13: 'transition' } },
      { id: 'f2_', field: 2, n: 4, next: ['a', 'b'],
        pts: [[0.5, 0.855], [0.49, 0.82], [0.48, 0.79]],
        fixed: { 0: 'transition', 3: 'branch' } },
      { id: 'a', field: 2, n: 13, branch: 'bridge', next: ['f3_'],   // 大橋ルート：斜面を上がって大橋を渡る
        pts: [[0.44, 0.745], [0.37, 0.68], [0.3, 0.62], [0.23, 0.56], [0.16, 0.505], [0.11, 0.465], [0.2, 0.445], [0.35, 0.422], [0.5, 0.4], [0.65, 0.378], [0.8, 0.358], [0.94, 0.338]],
        fixed: { 8: 'strong', 12: 'transition' } },
      { id: 'b', field: 2, n: 17, branch: 'forest', next: ['f3_'],   // 森の小道：手前の花の草地から左手の木立を抜ける
        pts: [[0.43, 0.81], [0.38, 0.845], [0.31, 0.87], [0.24, 0.865], [0.18, 0.84], [0.13, 0.8], [0.1, 0.755], [0.085, 0.7], [0.08, 0.645], [0.085, 0.595], [0.095, 0.56]],
        fixed: { 16: 'transition' } },
      { id: 'f3_', field: 3, n: 14, goal: true, next: [],
        pts: [[0.475, 0.84], [0.485, 0.79], [0.5, 0.75], [0.53, 0.68], [0.555, 0.62], [0.575, 0.565], [0.61, 0.5], [0.66, 0.45], [0.705, 0.405], [0.72, 0.365], [0.69, 0.33], [0.645, 0.302], [0.605, 0.284]],
        fixed: { 0: 'merge', 9: 'rival', 13: 'goal' } },
    ],
    branches: [{ at: 'f2_3', options: [
      { id: 'bridge', to: 'a0', label: '大橋ルート', desc: '石造りの大橋を渡る、少し短い道。バトルが多め', lean: { battle: 1, stat: -1 } },
      { id: 'forest', to: 'b0', label: '森の小道', desc: '木立を抜ける、少し長い道。能力・イベント・宝箱が多め', lean: { stat: 1, event: 1, treasure: 1, battle: -1 } },
    ] }],

    // ---- 配置の規則（固定骨格＋候補ノードへのランダムな割り当て）。counts はスタート→ゴールの1ルートあたり ----
    layoutRules: {
      counts: { stat: [11, 13], event: [6, 8], battle: [4, 6], treasure: [2, 3] },
      maxPerStat: 3,             // 6能力はすべて1回以上、同じ能力は3回まで
      recoveryEvents: [1, 3],    // 疲れ回復イベントはChapter全体で1〜3個
      recoveryPerRoute: true,    // どちらのルートにも1個以上
      noBattleFirst: 5,          // 序盤5地点はバトルなし
      maxBattlesFirst: [15, 1],  // 最初の15地点のバトルは1回まで
      noEventLast: 5,            // ゴール直前の5地点はイベントなし
      maxFieldShare: 0.5, minFieldShare: 0.15,
      eventTierWeights: { normal: 70, rare: 25, special: 5 },
    },

    // ---- イベント（handler は MMCH のイベント処理の名前。値は旧Chapterの暫定イベントと同じ【暫定】。疲れ回復は正式仕様） ----
    eventPool: [
      { id: 'shade', tier: 'normal', recovery: true, weight: 4, handler: 'fatigue', params: { amount: 10 }, text: '木陰でひと休みした。' },
      { id: 'break', tier: 'normal', recovery: true, weight: 3, handler: 'fatigue', params: { amount: 20 }, text: '小川のそばで小休憩をとった。' },
      { id: 'spring', tier: 'rare', recovery: true, weight: 2, handler: 'fatigue', params: { amount: 30 }, text: '澄んだ泉で体を休めた。' },
      { id: 'holy_spring', tier: 'special', recovery: true, weight: 1, handler: 'fatigue', params: { full: true }, text: '不思議な泉の力で、疲れがすっかり取れた！' },
      { id: 'herb', tier: 'normal', weight: 3, handler: 'stat_random', params: { amount: 6 }, text: '珍しい草を見つけた！' },
      { id: 'trip', tier: 'normal', weight: 2, handler: 'stat_random', params: { amount: -4 }, text: '石につまずいて転んでしまった…' },
      { id: 'coin', tier: 'normal', weight: 3, handler: 'gold', params: { amount: 50 }, text: '道端でお金を見つけた！' },
      { id: 'sage', tier: 'rare', weight: 2, handler: 'stat_random', params: { amount: 20 }, text: '旅の賢者に教えを受けた！' },
      { id: 'charm', tier: 'rare', weight: 2, handler: 'gold', params: { amount: 150 }, text: '幸運のお守りを見つけた！' },
      { id: 'legend_spring', tier: 'special', weight: 1, handler: 'stat_all', params: { amount: 8 }, text: '伝説の泉の力で、ライフ以外の能力がそれぞれ上がった！' },
    ],
    // ---- 宝箱：tier ごとの絵と出る割合。中身は【暫定】既存の宝箱マスと同じ（所持金 50G／150G、4：1）。正式な中身が決まったら byTier で分ける ----
    treasurePool: {
      tierWeights: { normal: 70, rare: 25, special: 5 },
      contents: { handler: 'gold_table', params: { table: [{ w: 4, gold: 50 }, { w: 1, gold: 150 }] } },
    },
    // ---- バトル：type ごとの名前と絵（asset key は type ごとに分ける。wild と rival は今は同じ絵、strong も同じ絵を仮に使う） ----
    battleTypes: {
      wild: { label: '野生のモンスター', asset: 'battle_wild' },
      strong: { label: '強敵', asset: 'battle_strong' },
      rival: { label: 'ライバル', asset: 'battle_rival' },
    },

    // ---- 絵（asset key → ファイル）。差し替えはここだけ ----
    assets: {
      stat_li: A + 'nodes/stat_life.webp', stat_po: A + 'nodes/stat_power.webp', stat_in: A + 'nodes/stat_intelligence.webp',
      stat_hi: A + 'nodes/stat_accuracy.webp', stat_ev: A + 'nodes/stat_evasion.webp', stat_de: A + 'nodes/stat_toughness.webp',
      event_normal: A + 'nodes/event_normal.webp', event_rare: A + 'nodes/event_rare.webp', event_special: A + 'nodes/event_special.webp',
      treasure_normal: A + 'nodes/treasure_normal.webp', treasure_rare: A + 'nodes/treasure_rare.webp', treasure_special: A + 'nodes/treasure_special.webp',
      battle_wild: A + 'nodes/battle_wild.webp', battle_rival: A + 'nodes/battle_rival.webp', battle_strong: A + 'nodes/battle_wild.webp',
      grass_front: A + 'env/grass_flower_border.webp', leaf_canopy: A + 'env/leaf_canopy_frame.webp', rock_strip_long: A + 'env/rock_strip_long.webp',
      rock_strip_b: A + 'env/rock_strip_b.webp', flower_path: A + 'env/flower_path.webp', forest_path_b: A + 'env/forest_path_b.webp',
      ancient_tree: A + 'env/ancient_tree_large.webp', ancient_pillar: A + 'env/ancient_pillar.webp',
    },
    // 停止地点の見た目：大きさは背景の画素（手前＝大きさ1のとき）。side は道のどちら側に置くか（1＝右、-1＝左、0＝足元）
    nodeLook: {
      stat: { w: 132, side: 0, sink: 0.1 },
      event: { h: 176, side: 1, gap: 78, sink: 0.04 },
      treasure: { w: 104, side: -1, gap: 74, sink: 0.06 },
      battle: { h: 184, side: 1, gap: 84, sink: 0.04 },
    },
    monster: { h: 176 },   // 手前（大きさ1）でのモンスターの高さ（背景の画素）

    // ---- 環境（固定のランドマーク）。x・y＝足元の位置（割合）、w＝幅（背景の画素）、layer：back（モンスターより奥・y で前後）／front（常に手前）
    //  haze：遠景ほど淡く（0〜1）、sink：足元を地面へ埋める割合、shadow：接地影、flip：左右反転
    landmarks: {
      1: [
        { asset: 'flower_path', x: 0.2, y: 0.705, w: 330, layer: 'back', haze: 0.18, sink: 0.12, shadow: 0.35 },
        { asset: 'rock_strip_b', x: 0.86, y: 0.99, w: 470, layer: 'front', haze: 0, sink: 0.08, shadow: 0.25 },
        { asset: 'grass_front', x: 0.5, y: 0.965, w: 920, layer: 'front', haze: 0, sink: 0 },
      ],
      2: [
        { asset: 'forest_path_b', x: 0.13, y: 0.895, w: 360, layer: 'back', haze: 0.04, sink: 0.1, shadow: 0.3 },
        { asset: 'rock_strip_long', x: 0.83, y: 0.995, w: 440, layer: 'front', haze: 0, sink: 0.06, shadow: 0.2 },
        { asset: 'grass_front', x: 0.5, y: 0.965, w: 920, layer: 'front', haze: 0, sink: 0, flip: true },
      ],
      3: [
        { asset: 'ancient_tree', x: 0.87, y: 0.625, w: 240, layer: 'back', haze: 0.22, sink: 0.08, shadow: 0.35 },
        { asset: 'ancient_pillar', x: 0.4, y: 0.565, w: 42, layer: 'back', haze: 0.3, sink: 0.06, shadow: 0.3 },
        { asset: 'ancient_pillar', x: 0.77, y: 0.52, w: 36, layer: 'back', haze: 0.36, sink: 0.06, shadow: 0.3, flip: true },
        { asset: 'rock_strip_long', x: 0.13, y: 0.995, w: 420, layer: 'front', haze: 0, sink: 0.06, shadow: 0.2, flip: true },
        { asset: 'grass_front', x: 0.5, y: 0.965, w: 920, layer: 'front', haze: 0, sink: 0 },
      ],
    },
    // 分岐ごとの手前の飾り（森の小道を進んでいる間だけ、画面の上に木の葉を重ねる）
    branchOverlays: { forest: { asset: 'leaf_canopy', field: 2, opacity: 0.92 } },
  };
  if (root.MMCH) root.MMCH.registerConfig(cfg);
  root.MMCH_CONFIG_CH1A = cfg;
})(typeof window !== 'undefined' ? window : globalThis);
