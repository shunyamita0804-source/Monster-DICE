// =========================================================
// Chapter 1「はじまりの草原」Pattern A「大橋と清流の草原」の config（Chapterフィールドエンジン js/chapter/engine.js 用）
//  このファイルはデータだけ。Chapter 2 以降は同じ形の config を作って MMCH.registerConfig するだけで動く。
//  2026-10-01：「リアル巨大ボード方式」。正式背景15枚（assets/fields/ch1a/road/。出どころは assets/fields/ch1a/README.md）＝世界の中の巨大な古代街道。
//   背景1枚に輪の刻まれた石板が4つ（手前→奥）。石板1つ＝1マス（モンスターは輪の上に止まる）。カメラは低く、近景の石板2〜3枚だけが見える。
//   旅の順：01 旅立ちの街道 → 02 花の草原 → 03 清流の道 → 04 草原の遺跡（分岐）
//          橋ルート（短め）：05A 風の高原 → 06A 大橋への道 → 07A 古代橋の入口 → 08A 古代橋の中央（強敵）→ 09A 橋の出口
//          森ルート（長め）：05B 森の入口 → 06B 木漏れ日の道 → 07B 森の小川 → 08B 深い古代の森 → 09B 森の出口
//          合流：10 大会会場への道（ライバル＝強制停止・大会門）
//   同じ背景を「周回」として何度か通る（LAPS：背景ごとの周回数。総マス数＝周回数の表だけで変えられる＝【暫定・最終確定はシミュレーションの比較を見てから】）。
//   周回の切り替えは既存の背景の切り替え（端まで歩く → 短い暗転 → 入口から入る）。
//  座標は各背景画像に対する割合（x・y とも 0〜1。y は下ほど手前）。ノードは通常見えない（?chdebug=1 のときだけ表示）。
//  旧13枚の旅（journey/）・暫定の停止面（dice_stop_1〜3.svg）はファイルを残すが参照しない。
// =========================================================
(function (root) {
  'use strict';
  const A = './assets/fields/ch1a/', R = A + 'road/', I = A + 'intro/', U = A + 'ui/', D = A + 'dice/';
  // 石板の輪（マス）の y（手前→奥）。15枚とも同じ構図（同じ街道の続き）
  const RINGS = [0.84, 0.6, 0.47, 0.38];
  // 奥行き：y → その場所の大きさ（輪の間隔から。隣の輪どうしが同じ距離に見えるように）
  const DEPTH = [[0.98, 1.22], [0.9, 1.1], [0.84, 1], [0.72, 0.84], [0.6, 0.62], [0.535, 0.5], [0.47, 0.4], [0.425, 0.34], [0.38, 0.28], [0.3, 0.2]];
  // 背景：キー → [ファイル名, 表示名, 道の x（輪の y ごと：0.84・0.6・0.47・0.38 の順。道のカーブ）]
  const BG = {
    '01': ['01_journey_road', '旅立ちの街道', [0.5, 0.5, 0.5, 0.5]],
    '02': ['02_flower_meadow', '花の草原', [0.5, 0.54, 0.6, 0.66]],
    '03': ['03_stream_road', '清流の道', [0.5, 0.55, 0.62, 0.68]],
    '04': ['04_grassland_ruins', '草原の遺跡', [0.5, 0.5, 0.52, 0.55]],
    '05a': ['05a_windy_highland', '風の高原', [0.5, 0.5, 0.52, 0.54]],
    '06a': ['06a_bridge_approach', '大橋への道', [0.5, 0.53, 0.58, 0.63]],
    '07a': ['07a_ancient_bridge_entrance', '古代橋の入口', [0.5, 0.5, 0.5, 0.5]],
    '08a': ['08a_ancient_bridge_center', '古代橋の中央', [0.5, 0.47, 0.42, 0.37]],
    '09a': ['09a_bridge_exit', '橋の出口', [0.5, 0.53, 0.58, 0.62]],
    '05b': ['05b_forest_entrance', '森の入口', [0.5, 0.49, 0.46, 0.43]],
    '06b': ['06b_sunlit_forest_road', '木漏れ日の道', [0.5, 0.52, 0.57, 0.62]],
    '07b': ['07b_forest_stream', '森の小川', [0.5, 0.48, 0.45, 0.42]],
    '08b': ['08b_deep_ancient_forest', '深い古代の森', [0.5, 0.52, 0.55, 0.58]],
    '09b': ['09b_forest_exit', '森の出口', [0.5, 0.52, 0.56, 0.6]],
    '10': ['10_tournament_approach', '大会会場への道', [0.5, 0.5, 0.5, 0.5]],
  };
  // 周回数【暫定】：共通2周・橋1周・森2周・会場2周＝橋ルート 59マス／森ルート 79マス。1周＝石板4つ。
  //  tests/chapter-balance.mjs の比較（2026-10-01、各600回）：急ぐ（橋）＝到達100%・平均19ターン、育成重視（森）＝到達97%・平均25ターン。最終確定は比較結果を見てからの判断
  const LAPS = root.MMCH_CH1A_LAPS || { '01': 2, '02': 2, '03': 2, '04': 2, '05a': 1, '06a': 1, '07a': 1, '08a': 1, '09a': 1, '05b': 2, '06b': 2, '07b': 2, '08b': 2, '09b': 2, '10': 2 };
  // 旅の順とルート（path id の頭：共通 f1_／g1_／g2_／f2_、橋 a…、森 b…、合流 f3_。周回は b_／c_ を足す）
  const ORDER = { shared: [['01', 'f1_'], ['02', 'g1_'], ['03', 'g2_'], ['04', 'f2_']], bridge: [['05a', 'a'], ['06a', 'a2_'], ['07a', 'a3_'], ['08a', 'a4_'], ['09a', 'a5_']], forest: [['05b', 'b'], ['06b', 'b2_'], ['07b', 'b3_'], ['08b', 'b4_'], ['09b', 'b5_']], goal: [['10', 'f3_']] };
  const terrainOf = (k) => (/^0[5-9]b/.test(k) ? 'forest' : /^0[7-8]a/.test(k) ? 'bridge' : k === '05a' || k === '10' ? 'highland' : 'grass');
  const lapId = (base, j) => (j === 0 ? base : base.replace(/_?$/, '') + 'bcdefgh'[j - 1] + '_');
  const fieldScenes = [], paths = [], landmarks = {}, foreground = {};
  let sceneNo = 0;
  /** 背景 k を laps 回通る道を作る。prev は前の道の id（つなぐ）。戻り値＝この背景の最初と最後の道の id */
  function build(k, base, branch, chain) {
    const [file, name, xs] = BG[k], ids = [];
    for (let j = 0; j < LAPS[k]; j++) {
      const sid = ++sceneNo;
      fieldScenes.push({ id: sid, name, bg: R + file + '.webp', w: 768, h: 1360, bgKey: k, lap: j + 1, exit: 'up', farBand: { to: 0.26, k: 0.95 }, depth: DEPTH, zoom: { near: 1.32, far: 1.95 } });
      landmarks[sid] = []; foreground[sid] = [];
      const id = lapId(base, j);
      paths.push({ id, field: sid, n: RINGS.length, curve: 'linear', terrain: terrainOf(k), next: [], ...(branch ? { branch } : {}), pts: RINGS.map((y, i) => [xs[i], y]) });
      ids.push(id);
    }
    for (let j = 0; j < ids.length - 1; j++) paths.find((p) => p.id === ids[j]).next = [ids[j + 1]];
    if (chain.length) paths.find((p) => p.id === chain[chain.length - 1]).next.push(ids[0]);
    chain.push(...ids);
    return ids;
  }
  const shared = []; for (const [k, base] of ORDER.shared) build(k, base, null, shared);
  const bridge = [shared[shared.length - 1]]; for (const [k, base] of ORDER.bridge) build(k, base, 'bridge', bridge);
  const forest = [shared[shared.length - 1]]; for (const [k, base] of ORDER.forest) build(k, base, 'forest', forest);
  const goal = []; for (const [k, base] of ORDER.goal) build(k, base, null, goal);
  const P = (id) => paths.find((p) => p.id === id), last = (ids) => ids[ids.length - 1];
  P(last(bridge)).next = [goal[0]]; P(last(forest)).next = [goal[0]];
  // 固定の骨格：スタート・分岐（共通の最後）・強敵（橋の中央の最初の周の真ん中）・合流・ライバル（会場の道の最後の周のゴール2つ手前。強制停止）・ゴール
  P(shared[0]).start = true; P(shared[0]).fixed = { 0: 'start' };
  P(last(shared)).fixed = { [RINGS.length - 1]: 'branch' };
  P(lapId('a4_', 0)).fixed = { 1: 'strong' };
  P(goal[0]).fixed = { 0: 'merge' };
  const gl = P(last(goal)); gl.goal = true; gl.fixed = { ...(gl.fixed || {}), [RINGS.length - 3]: 'rival', [RINGS.length - 1]: 'goal' };
  const branchAt = `${last(shared)}${RINGS.length - 1}`, bridgeFirst = `${lapId('a', 0)}0`, forestFirst = `${lapId('b', 0)}0`;

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
    laps: LAPS, rings: RINGS,

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

    // ---- 操作欄：START／STOP の2状態の正式画像（4コマンド＋中央の球）。hit＝画像に対する割合（押せる領域） ----
    deck: { start: U + 'deck_start.webp', stop: U + 'deck_stop.webp', aspect: 1100 / 353,
      hit: { center: { x: 0.385, y: 0.03, w: 0.23, h: 0.94 }, tl: { x: 0.012, y: 0.05, w: 0.37, h: 0.42 }, tr: { x: 0.618, y: 0.05, w: 0.37, h: 0.42 }, bl: { x: 0.012, y: 0.53, w: 0.37, h: 0.42 }, br: { x: 0.618, y: 0.53, w: 0.37, h: 0.42 } } },

    // ---- 配置の規則（固定骨格＋候補ノードへのランダムな割り当て）。counts はスタート→ゴールの1ルートあたり【暫定：総マス数と一緒に見直す】 ----
    layoutRules: {
      counts: { stat: [12, 15], event: [6, 9], battle: [4, 6], treasure: [3, 4] },   // 短いほうのルート（59マス）の 20〜25%・11〜15%・7.5〜11%・5〜7.5%
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
    dice: { rollingSprite: D + 'dice_blank.webp', resultSprites: { 1: D + 'dice_stop_1.webp', 2: D + 'dice_stop_2.webp', 3: D + 'dice_stop_3.webp', 4: D + 'dice_stop_4.webp', 5: D + 'dice_stop_5.webp', 6: D + 'dice_stop_6.webp' }, autoStopMs: 3000 },

    assets: {
      stat_li: A + 'nodes/stat_life.webp', stat_po: A + 'nodes/stat_power.webp', stat_in: A + 'nodes/stat_intelligence.webp',
      stat_hi: A + 'nodes/stat_accuracy.webp', stat_ev: A + 'nodes/stat_evasion.webp', stat_de: A + 'nodes/stat_toughness.webp',
      event_normal: A + 'nodes/event_normal.webp', event_rare: A + 'nodes/event_rare.webp', event_special: A + 'nodes/event_special.webp',
      treasure_normal: A + 'nodes/treasure_normal.webp', treasure_rare: A + 'nodes/treasure_rare.webp', treasure_special: A + 'nodes/treasure_special.webp',
      battle_wild: A + 'nodes/battle_wild.webp', battle_rival: A + 'nodes/battle_rival.webp', battle_strong: A + 'nodes/battle_wild.webp',
      grass_front: A + 'env/grass_flower_border.webp',
    },
    // 目印：石板の脇（道の中央の輪にモンスター、目印は輪の横）。足元の草は置かない（石の道）
    nodeLook: {
      stat: { w: 104, side: 1, gap: 170, sink: 0.1, tuft: false },
      event: { h: 110, side: 1, gap: 170, sink: 0.06, tuft: false },
      eventNature: { w: 140, side: 1, gap: 170, sink: 0.08, tuft: false },
      treasure: { w: 88, side: -1, gap: 160, sink: 0.08, tuft: false },
      battle: { h: 140, side: 1, gap: 170, sink: 0.04, tuft: false },
      figure: { h: 190, side: 1, gap: 150, sink: 0.02, tuft: false },
      tuft: 'grass_front',
    },
    battleMarkers: false,
    landmarkVisibility: { stat: 'arrive', event: 'arrive', treasure: 'always' },
    monster: { h: 180 },
    landmarks, foreground, branchOverlays: {},
  };
  if (root.MMCH) root.MMCH.registerConfig(cfg);
  root.MMCH_CONFIG_CH1A = cfg;
})(typeof window !== 'undefined' ? window : globalThis);
