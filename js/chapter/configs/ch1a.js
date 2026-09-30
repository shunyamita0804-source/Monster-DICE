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
    //  farBand：背景の上の帯（空・山）を遠景として少し遅く動かす（to＝帯の下端の割合、k＝カメラに対する速さ）
    fieldScenes: [
      { id: 1, name: '旅立ちの草原', bg: A + 'bg_01.webp', w: 864, h: 1536, exit: 'up', farBand: { to: 0.3, k: 0.94 },
        depth: [[0.98, 1], [0.85, 0.86], [0.72, 0.68], [0.62, 0.53], [0.52, 0.41], [0.44, 0.32]], zoom: { near: 1.3, far: 1.42 } },
      { id: 2, name: '大橋と清流', bg: A + 'bg_02.webp', w: 864, h: 1536, exit: 'up', farBand: { to: 0.28, k: 0.94 },
        depth: [[0.98, 1], [0.86, 0.86], [0.76, 0.72], [0.64, 0.57], [0.52, 0.45], [0.44, 0.37], [0.34, 0.28]], zoom: { near: 1.3, far: 1.4 } },
      { id: 3, name: '大会へ続く高原', bg: A + 'bg_03.webp', w: 864, h: 1536, exit: 'up', farBand: { to: 0.26, k: 0.94 },
        depth: [[0.98, 1], [0.85, 0.85], [0.72, 0.66], [0.6, 0.5], [0.5, 0.39], [0.4, 0.3], [0.28, 0.21]], zoom: { near: 1.3, far: 1.46 } },
    ],
    // ---- カメラ・歩き・視差（省略した項目は js/chapter/field-view.js の既定。Pattern・Chapter ごとにここで変えられる） ----
    camera: { anchorY: 0.64, lookAhead: 0.11, followDelay: 110, zoom: { idle: 1, move: 0.98, stop: 1.02, branch: 0.93, focus: 1.03 } },
    motion: { stepMs: 260, minMs: 200, maxMs: 350, terrain: { grass: { speed: 1 }, slope: { speed: 0.86 }, bridge: { speed: 1, fixed: true }, forest: { speed: 0.9 }, highland: { speed: 0.93 } } },
    parallax: { far: 0.94, back: 0.97, road: 1, front: 1.14, canopy: 0.6 },

    // ---- 道筋（背景の道に沿ったノード）。fixed：固定の骨格（それ以外は候補ノード＝配置で種類が決まる） ----
    //  歩数（スタート→ゴール）：大橋ルート 44・森の小道 48。FIELD 1：14 / FIELD 2：4＋13（大橋）または 4＋17（森）/ FIELD 3：14（1000回のシミュレーションで平均22〜25ターンになるよう調整）
    //  pts は道の折れ線。エンジンが滑らかな曲線（Catmull-Rom）にしてノードを置き、モンスターは曲線に沿って歩く（curve:'linear' で折れ線のまま）。terrain：歩く速さの地形（motion.terrain）
    paths: [
      { id: 'f1_', field: 1, n: 14, start: true, next: ['f2_'], noSlot: [1], terrain: 'grass',
        pts: [[0.465, 0.835], [0.47, 0.79], [0.485, 0.745], [0.515, 0.675], [0.545, 0.615], [0.565, 0.565], [0.59, 0.52], [0.62, 0.48], [0.65, 0.45]],
        fixed: { 0: 'start', 13: 'transition' } },
      { id: 'f2_', field: 2, n: 4, next: ['a', 'b'], terrain: 'grass',
        pts: [[0.5, 0.855], [0.49, 0.82], [0.48, 0.79]],
        fixed: { 0: 'transition', 3: 'branch' } },
      { id: 'a', field: 2, n: 13, branch: 'bridge', next: ['f3_'], terrain: 'bridge', landmark: { side: -1, gapScale: 0.42 },   // 大橋ルート：斜面を上がって大橋を渡る（a0〜a5 は斜面＝nodeOverrides で slope）
        pts: [[0.44, 0.745], [0.37, 0.68], [0.3, 0.62], [0.23, 0.56], [0.16, 0.505], [0.11, 0.465], [0.2, 0.445], [0.35, 0.422], [0.5, 0.4], [0.65, 0.378], [0.8, 0.358], [0.94, 0.338]],
        fixed: { 8: 'strong', 12: 'transition' } },
      { id: 'b', field: 2, n: 17, branch: 'forest', next: ['f3_'], terrain: 'forest',   // 森の小道：手前の花の草地から左手の木立を抜ける
        pts: [[0.43, 0.81], [0.38, 0.845], [0.31, 0.87], [0.24, 0.865], [0.18, 0.84], [0.13, 0.8], [0.1, 0.755], [0.085, 0.7], [0.08, 0.645], [0.085, 0.595], [0.095, 0.56]],
        fixed: { 16: 'transition' } },
      { id: 'f3_', field: 3, n: 14, goal: true, next: [], terrain: 'highland',
        pts: [[0.475, 0.84], [0.485, 0.79], [0.5, 0.75], [0.53, 0.68], [0.555, 0.62], [0.575, 0.565], [0.61, 0.5], [0.66, 0.45], [0.705, 0.405], [0.72, 0.365], [0.69, 0.33], [0.645, 0.302], [0.605, 0.284]],
        fixed: { 0: 'merge', 9: 'rival', 13: 'goal' } },
    ],
    // 別の道へ移る歩き方（分岐・合流）：'from>to' の中間点（背景の割合）。無ければ直線
    edges: { 'f2_3>a0': [[0.466, 0.772]], 'f2_3>b0': [[0.462, 0.806]] },
    // 地点ごとの上書き（構造の見本。monster＝止まる位置、landmark＝目印の位置・大きさ・透明度、camera＝カメラの寄り、terrain＝地形、side＝目印を置く側）
    nodeOverrides: { a0: { terrain: 'slope' }, a1: { terrain: 'slope' }, a2: { terrain: 'slope' }, a3: { terrain: 'slope' }, a4: { terrain: 'slope' }, a5: { terrain: 'slope' } },
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
    //  asset：道端に置く自然物（内容に応じた物。イベントの印は並べない）。look：その物の大きさ・置き方（nodeLook.eventNature の上書き）。asset が無いものは tier の祠を小さく置く【暫定：泉・祠の正式素材は未着】
    eventPool: [
      { id: 'shade', tier: 'normal', recovery: true, weight: 4, handler: 'fatigue', params: { amount: 10 }, text: '木陰でひと休みした。', asset: 'ancient_tree', look: { w: 168, gap: 200, sink: 0.08 } },
      { id: 'break', tier: 'normal', recovery: true, weight: 3, handler: 'fatigue', params: { amount: 20 }, text: '小川のそばで小休憩をとった。', asset: 'rock_strip_b', look: { w: 176, gap: 190, sink: 0.14 } },
      { id: 'spring', tier: 'rare', recovery: true, weight: 2, handler: 'fatigue', params: { amount: 30 }, text: '澄んだ泉で体を休めた。', look: { h: 118 } },
      { id: 'holy_spring', tier: 'special', recovery: true, weight: 1, handler: 'fatigue', params: { full: true }, text: '不思議な泉の力で、疲れがすっかり取れた！', look: { h: 132 } },
      { id: 'herb', tier: 'normal', weight: 3, handler: 'stat_random', params: { amount: 6 }, text: '珍しい草を見つけた！', asset: 'flower_path', look: { w: 160, gap: 190, sink: 0.16 } },
      { id: 'trip', tier: 'normal', weight: 2, handler: 'stat_random', params: { amount: -4 }, text: '石につまずいて転んでしまった…', asset: 'rock_strip_long', look: { w: 150, gap: 180, sink: 0.14 } },
      { id: 'coin', tier: 'normal', weight: 3, handler: 'gold', params: { amount: 50 }, text: '道端でお金を見つけた！', look: { h: 104 } },
      { id: 'sage', tier: 'rare', weight: 2, handler: 'stat_random', params: { amount: 20 }, text: '旅の賢者に教えを受けた！', look: { h: 118 } },
      { id: 'charm', tier: 'rare', weight: 2, handler: 'gold', params: { amount: 150 }, text: '幸運のお守りを見つけた！', look: { h: 118 } },
      { id: 'legend_spring', tier: 'special', weight: 1, handler: 'stat_all', params: { amount: 8 }, text: '伝説の泉の力で、ライフ以外の能力がそれぞれ上がった！', look: { h: 132 } },
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
    // 停止地点の目印の見た目：大きさは背景の画素（手前＝大きさ1のとき）。モンスターは道の上に止まり、目印は道の脇（gap＝道からの距離。side は 1＝ノードの側、-1＝反対側、0＝足元）
    //  stat＝古代の石碑（少し埋めて草で足元を隠す）、treasure＝草むらの脇の宝箱、eventNature＝内容に応じた自然物、event＝tier の祠（自然物が無いイベントだけ）
    //  battle は目印を置かない（battleMarkers: true にすると旧来の石碑を常設）。tuft＝足元の草に使う素材
    nodeLook: {
      stat: { w: 112, side: 1, gap: 196, sink: 0.14 },
      event: { h: 118, side: 1, gap: 196, sink: 0.06 },
      eventNature: { w: 160, side: 1, gap: 210, sink: 0.1 },
      treasure: { w: 92, side: -1, gap: 190, sink: 0.1 },
      battle: { h: 150, side: 1, gap: 196, sink: 0.04 },
      figure: { h: 190, side: 1, gap: 170, sink: 0.02, tuft: false },
      tuft: 'grass_front',
    },
    battleMarkers: false,
    monster: { h: 176 },   // 手前（大きさ1）でのモンスターの高さ（背景の画素）

    // ---- 環境（固定のランドマーク）。x・y＝足元の位置（割合）、w＝幅（背景の画素）、layer：back（モンスターより奥・y で前後）／front（常に手前）
    //  haze：遠景ほど淡く（0〜1）、sink：足元を地面へ埋める割合、shadow：接地影、flip：左右反転
    //  背景に描かれている物（大橋・大会門・木立・遺跡）は重ねない。手前の草・岩は視差の前景（front）。奥（haze 0.15 以上）は遠景として少し遅く動く
    landmarks: {
      1: [
        { asset: 'flower_path', x: 0.2, y: 0.705, w: 330, layer: 'back', haze: 0.18, sink: 0.12, shadow: 0.35 },
        { asset: 'rock_strip_b', x: 0.86, y: 0.99, w: 470, layer: 'front', haze: 0, sink: 0.08, shadow: 0.25 },
        { asset: 'grass_front', x: 0.5, y: 0.965, w: 920, layer: 'front', haze: 0, sink: 0 },
      ],
      2: [
        { asset: 'rock_strip_long', x: 0.83, y: 0.995, w: 440, layer: 'front', haze: 0, sink: 0.06, shadow: 0.2 },
        { asset: 'grass_front', x: 0.5, y: 0.965, w: 920, layer: 'front', haze: 0, sink: 0, flip: true },
      ],
      3: [
        { asset: 'rock_strip_long', x: 0.13, y: 0.995, w: 420, layer: 'front', haze: 0, sink: 0.06, shadow: 0.2, flip: true },
        { asset: 'grass_front', x: 0.5, y: 0.965, w: 920, layer: 'front', haze: 0, sink: 0 },
      ],
    },
    // 手前を横切る草（道の少し手前に置く。モンスターが通り過ぎるとき一瞬だけ手前になる。数地点に1つ）。x・y＝足元、w・h＝背景の画素、slice＝草の帯のどの部分を使うか（0〜1）
    foreground: {
      1: [{ asset: 'grass_front', x: 0.41, y: 0.8, w: 230, h: 76, slice: 0.15 }, { asset: 'grass_front', x: 0.61, y: 0.652, w: 190, h: 62, slice: 0.55, flip: true }],
      2: [{ asset: 'grass_front', x: 0.56, y: 0.835, w: 220, h: 72, slice: 0.3 }, { asset: 'grass_front', x: 0.2, y: 0.86, w: 200, h: 66, slice: 0.7 }],
      3: [{ asset: 'grass_front', x: 0.41, y: 0.8, w: 220, h: 72, slice: 0.45 }, { asset: 'grass_front', x: 0.63, y: 0.6, w: 170, h: 56, slice: 0.05, flip: true }],
    },
    // 分岐ごとの手前の飾り（森の小道を進んでいる間だけ、画面の上に木の葉を重ねる）
    branchOverlays: { forest: { asset: 'leaf_canopy', field: 2, opacity: 0.92 } },
  };
  if (root.MMCH) root.MMCH.registerConfig(cfg);
  root.MMCH_CONFIG_CH1A = cfg;
})(typeof window !== 'undefined' ? window : globalThis);
