// =========================================================
// Chapter 1「はじまりの草原」Pattern A「大橋と清流の草原」の config（Chapterフィールドエンジン js/chapter/engine.js 用）
//  このファイルはデータだけ。Chapter 2 以降は同じ形の config を作って MMCH.registerConfig するだけで動く。
//  2026-09-30：正式背景13枚（assets/fields/ch1a/journey/。出どころ・並び順は assets/fields/ch1a/README.md）による「旅」。
//  背景1枚＝旅の一区間（FIELD）。1枚の道に 3〜6 地点を置き、1地点進むだけでも画面上では長い距離を歩く（1マス＝旅の一区間）。
//  座標は各背景画像に対する割合（x・y とも 0〜1。y は下ほど手前）。ノードは通常見えない（?chdebug=1 のときだけ表示）。
//  旅の順（開始 → 大会会場）：
//    共通  ：01 旅立ちの草原 → 02 大橋の見える草原 → 03 清流のほとり → 04 小さな石橋 → 05 分かれ道の丘（ここで分岐）
//    大橋  ：06 橋のたもとの集落 → 07 大橋を望む道 → 08 大橋（強敵）
//    森    ：09 古い石柱の道 → 10 森の小道 → 11 森の出口
//    合流  ：12 大会へ続く丘 → 13 大会会場の高原（ライバル・大会門）
// =========================================================
(function (root) {
  'use strict';
  const A = './assets/fields/ch1a/', J = A + 'journey/';
  // 13枚に共通の奥行き（道は画面下の手前から、上の 0.35〜0.45 付近で遠ざかる構図）。y → その場所の大きさ（手前＝1）
  const DEPTH = [[0.98, 1], [0.86, 0.86], [0.74, 0.7], [0.64, 0.56], [0.55, 0.45], [0.47, 0.36], [0.4, 0.29], [0.33, 0.24]];
  const scene = (id, name, file, w, h, extra) => ({ id, name, bg: J + file + '.webp', w, h, exit: 'up', farBand: { to: 0.3, k: 0.94 }, depth: DEPTH, zoom: { near: 1.28, far: 1.44 }, ...(extra || {}) });
  // 各フィールドの手前の草（視差の前景）と、手前を横切る草（数地点に1つ）。背景に描かれている物には素材を重ねない
  const front = (flip) => [{ asset: 'grass_front', x: 0.5, y: 0.992, w: 940, layer: 'front', haze: 0, sink: 0, flip: !!flip }];
  const fg = (x, y, slice, flip) => ({ asset: 'grass_front', x, y, w: 220, h: 72, slice, flip: !!flip });
  const cfg = {
    chapterId: 1,
    patternId: 'A',
    title: 'はじまりの草原',
    patternTitle: '大橋と清流の草原',
    playable: true,
    rules: { turnLimit: 30 },   // 疲れ・能力の確率・上昇量は MMCH.DEFAULT_RULES（正式仕様）のまま
    tournamentDestination: 'official',   // ゴール（大会門）→ 公式ランク大会（MMP8 の既存の大会）
    backgroundTransition: { type: 'forward', ms: 760 },

    // ---- 背景13枚（1つながりの旅）。depth：y（下ほど手前）ごとの大きさ。zoom：カメラの寄り（手前 near → 奥 far）。farBand：空・山の帯を遠景として少し遅く動かす ----
    fieldScenes: [
      scene(1, '旅立ちの草原', 'ch1_01_grassland_start', 768, 1360),
      scene(2, '大橋の見える草原', 'ch1_02_grassland_bridge_view', 864, 1536),
      scene(3, '清流のほとり', 'ch1_03_stream_side', 864, 1536),
      scene(4, '小さな石橋', 'ch1_04_small_stone_bridge', 768, 1360),
      scene(5, '分かれ道の丘', 'ch1_05_fork_hill', 864, 1536),
      scene(6, '橋のたもとの集落', 'ch1_06_bridge_village', 864, 1536),
      scene(7, '大橋を望む道', 'ch1_07_bridge_approach', 864, 1536),
      scene(8, '大橋', 'ch1_08_great_bridge', 864, 1536),
      scene(9, '古い石柱の道', 'ch1_09_old_pillars', 864, 1536),
      scene(10, '森の小道', 'ch1_10_forest_path', 864, 1536, { farBand: { to: 0.22, k: 0.96 } }),
      scene(11, '森の出口', 'ch1_11_forest_exit', 864, 1536, { farBand: { to: 0.22, k: 0.96 } }),
      scene(12, '大会へ続く丘', 'ch1_12_hill_to_arena', 768, 1360),
      scene(13, '大会会場の高原', 'ch1_13_highland_arena', 864, 1536),
    ],
    // ---- カメラ・歩き・視差（省略した項目は js/chapter/field-view.js の既定。Pattern・Chapter ごとにここで変えられる） ----
    //  1地点＝旅の一区間：1地点の距離が長いので、1地点 0.32〜0.62秒（画面上の距離と地形で変わる。3地点でも約1.6秒）
    camera: { anchorY: 0.64, lookAhead: 0.11, followDelay: 110, zoom: { idle: 1, move: 0.98, stop: 1.02, branch: 0.93, focus: 1.03 } },
    motion: { stepMs: 430, minMs: 320, maxMs: 620, baseLen: 150, terrain: { grass: { speed: 1 }, slope: { speed: 0.88 }, bridge: { speed: 1, fixed: true }, forest: { speed: 0.92 }, highland: { speed: 0.94 }, stream: { speed: 0.96 } } },
    parallax: { far: 0.94, back: 0.97, road: 1, front: 1.14, canopy: 0.6 },

    // ---- 道筋（各背景に描かれた土の道に沿ったノード）。fixed：固定の骨格（それ以外は候補ノード＝配置で種類が決まる） ----
    //  歩数（スタート→ゴール）：大橋ルート 44・森の小道 48（1000回のシミュレーションで平均22〜25ターン）
    //  pts は道の折れ線。エンジンが滑らかな曲線（Catmull-Rom）にしてノードを置き、モンスターは曲線に沿って歩く（curve:'linear' で折れ線のまま）
    paths: [
      { id: 'f1_', field: 1, n: 6, start: true, next: ['g1_'], noSlot: [1], terrain: 'grass',
        pts: [[0.44, 0.915], [0.43, 0.86], [0.45, 0.76], [0.48, 0.66], [0.46, 0.575], [0.41, 0.5], [0.37, 0.445]], fixed: { 0: 'start' } },
      { id: 'g1_', field: 2, n: 4, next: ['g2_'], terrain: 'grass',
        pts: [[0.5, 0.915], [0.49, 0.86], [0.52, 0.76], [0.54, 0.66], [0.5, 0.58], [0.44, 0.51], [0.39, 0.45]] },
      { id: 'g2_', field: 3, n: 4, next: ['g3_'], terrain: 'stream',
        pts: [[0.62, 0.915], [0.62, 0.86], [0.63, 0.76], [0.6, 0.66], [0.56, 0.58], [0.5, 0.51], [0.45, 0.45]] },
      { id: 'g3_', field: 4, n: 3, next: ['f2_'], terrain: 'stream',
        pts: [[0.56, 0.915], [0.56, 0.86], [0.58, 0.76], [0.58, 0.66], [0.54, 0.57], [0.5, 0.5], [0.48, 0.44]] },
      { id: 'f2_', field: 5, n: 4, next: ['a', 'b'], terrain: 'grass',
        pts: [[0.45, 0.915], [0.45, 0.86], [0.5, 0.76], [0.55, 0.66], [0.55, 0.58], [0.5, 0.51], [0.45, 0.45]], fixed: { 3: 'branch' } },
      // 大橋ルート：橋のたもとの集落 → 大橋を望む道 → 大橋（強敵）
      { id: 'a', field: 6, n: 4, branch: 'bridge', next: ['a2_'], terrain: 'grass',
        pts: [[0.5, 0.915], [0.5, 0.86], [0.5, 0.76], [0.5, 0.66], [0.52, 0.58], [0.55, 0.51], [0.58, 0.45], [0.6, 0.4]] },
      { id: 'a2_', field: 7, n: 4, branch: 'bridge', next: ['a3_'], terrain: 'grass',
        pts: [[0.55, 0.915], [0.55, 0.86], [0.6, 0.76], [0.65, 0.66], [0.65, 0.58], [0.62, 0.51], [0.6, 0.45]] },
      { id: 'a3_', field: 8, n: 5, branch: 'bridge', next: ['g4_'], terrain: 'bridge', landmark: { side: -1, gapScale: 0.7 },
        pts: [[0.6, 0.915], [0.59, 0.86], [0.6, 0.76], [0.62, 0.66], [0.62, 0.58], [0.6, 0.52]], fixed: { 2: 'strong' } },
      // 森の小道：古い石柱の道 → 森の小道 → 森の出口
      { id: 'b', field: 9, n: 5, branch: 'forest', next: ['b2_'], terrain: 'forest',
        pts: [[0.55, 0.915], [0.55, 0.86], [0.58, 0.76], [0.6, 0.66], [0.62, 0.58], [0.63, 0.51], [0.62, 0.45]] },
      { id: 'b2_', field: 10, n: 6, branch: 'forest', next: ['b3_'], terrain: 'forest',
        pts: [[0.5, 0.915], [0.48, 0.86], [0.5, 0.76], [0.55, 0.66], [0.6, 0.58], [0.62, 0.51], [0.63, 0.45]] },
      { id: 'b3_', field: 11, n: 6, branch: 'forest', next: ['g4_'], terrain: 'forest',
        pts: [[0.5, 0.915], [0.5, 0.86], [0.52, 0.76], [0.55, 0.66], [0.58, 0.58], [0.6, 0.51], [0.6, 0.45]] },
      // 合流：大会へ続く丘 → 大会会場の高原（ライバル → 大会門）
      { id: 'g4_', field: 12, n: 5, next: ['f3_'], terrain: 'slope',
        pts: [[0.5, 0.915], [0.5, 0.86], [0.58, 0.76], [0.62, 0.66], [0.56, 0.58], [0.52, 0.51], [0.58, 0.44], [0.64, 0.37], [0.68, 0.32]], fixed: { 0: 'merge' } },
      { id: 'f3_', field: 13, n: 6, goal: true, next: [], terrain: 'highland',
        pts: [[0.5, 0.915], [0.5, 0.86], [0.55, 0.76], [0.6, 0.66], [0.55, 0.58], [0.5, 0.51], [0.55, 0.44], [0.6, 0.38], [0.62, 0.33]], fixed: { 4: 'rival', 5: 'goal' } },
    ],
    // 別の道へ移る歩き方（分岐・合流）：'from>to' の中間点（背景の割合）。無ければ直線。背景をまたぐ移動は画面側の切り替え
    edges: {},
    // 地点ごとの上書き（構造の見本。monster＝止まる位置、landmark＝目印の位置・大きさ・透明度、camera＝カメラの寄り、terrain＝地形、side＝目印を置く側）
    nodeOverrides: {},
    branches: [{ at: 'f2_3', options: [
      { id: 'bridge', to: 'a0', label: '大橋ルート', desc: '集落を抜けて石造りの大橋を渡る、少し短い道。バトルが多め', lean: { battle: 1, stat: -1 } },
      { id: 'forest', to: 'b0', label: '森の小道', desc: '古い石柱の道から木立を抜ける、少し長い道。能力・イベント・宝箱が多め', lean: { stat: 1, event: 1, treasure: 1, battle: -1 } },
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
      maxFieldShare: 0.3, minFieldShare: 0,   // 背景13枚：1枚に特殊地点が集中しない（下限は無し＝分岐の反対側の背景は0）
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
    // ---- バトル：type ごとの名前と絵（asset key は type ごとに分ける。wild と rival は今は同じ絵、strong も同じ絵を仮に使う。figure：ライバル本人の立ち姿の asset key＝素材待ち） ----
    battleTypes: {
      wild: { label: '野生のモンスター', asset: 'battle_wild' },
      strong: { label: '強敵', asset: 'battle_strong' },
      rival: { label: 'ライバル', asset: 'battle_rival', figure: null },
    },

    // ---- サイコロ：回転中の正式画像1枚と、出目ごとの停止面（1・2・3 が上の面）。停止面は【暫定】正式の停止画像（dice_stop_1〜3）が届いたらファイルを差し替えるだけ ----
    dice: { rollingSprite: A + 'dice/dice_rolling.webp', resultSprites: { 1: A + 'dice/dice_stop_1.svg', 2: A + 'dice/dice_stop_2.svg', 3: A + 'dice/dice_stop_3.svg' } },

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
    // 目印の見せ方：stat・event は着いたときに初めて現れる（通常時の画面はすっきり）。treasure は最初から自然に置く
    landmarkVisibility: { stat: 'arrive', event: 'arrive', treasure: 'always' },
    monster: { h: 176 },   // 手前（大きさ1）でのモンスターの高さ（背景の画素）

    // ---- 環境：背景に描かれている物（大橋・集落・石柱・木立・大会門）には素材を重ねない。各背景とも手前の草の帯だけを視差の前景に置く ----
    landmarks: { 1: front(), 2: front(true), 3: front(), 4: front(true), 5: front(), 6: front(true), 7: front(), 8: front(true), 9: front(), 10: front(true), 11: front(), 12: front(true), 13: front() },
    // 手前を横切る草（道の少し手前に置く。モンスターが通り過ぎるとき一瞬だけ手前になる。1枚に1〜2つ）
    foreground: {
      1: [fg(0.36, 0.79, 0.15), fg(0.55, 0.61, 0.55, true)], 2: [fg(0.6, 0.78, 0.3)], 3: [fg(0.5, 0.79, 0.7, true)], 4: [fg(0.46, 0.8, 0.45)],
      5: [fg(0.6, 0.79, 0.05, true), fg(0.42, 0.6, 0.35)], 6: [fg(0.4, 0.8, 0.5)], 7: [fg(0.45, 0.79, 0.2, true)], 8: [fg(0.48, 0.79, 0.6)],
      9: [fg(0.44, 0.8, 0.1, true)], 10: [fg(0.62, 0.79, 0.4)], 11: [fg(0.4, 0.8, 0.75, true)], 12: [fg(0.4, 0.79, 0.25), fg(0.66, 0.6, 0.5, true)], 13: [fg(0.4, 0.8, 0.65)],
    },
    // 分岐ごとの手前の飾り（森の小道を進んでいる間だけ、画面の上に木の葉を重ねる）
    branchOverlays: { forest: { asset: 'leaf_canopy', field: 10, opacity: 0.92 } },
  };
  if (root.MMCH) root.MMCH.registerConfig(cfg);
  root.MMCH_CONFIG_CH1A = cfg;
})(typeof window !== 'undefined' ? window : globalThis);
