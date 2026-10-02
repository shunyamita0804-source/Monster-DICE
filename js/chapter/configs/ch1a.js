// =========================================================
// Chapter 1「はじまりの草原」Pattern A の config（Chapterフィールドエンジン js/chapter/engine.js 用）
//  このファイルはデータだけ。背景を決まった順にだけ1回ずつ通り、各背景の実際の道の中央線の上にマスを置く。
//  2026-10-02（正式背景）：assets/fields/ch1a/final/field/ch1_bg_01〜14（出どころは assets/fields/ch1a/final/README.md）。
//  2026-10-02（60マス再設計）：共通区間 01〜05 → 05 の最後のマス＝分かれ道 → 森の道（06 大樹の森・07 深い森の小道）／大橋の道（08 水道橋の見える道・09 天空の大橋）
//   → 10 風の丘の最初のマス＝合流 → 終盤 11〜13 → 14 大会会場の門前（ライバル → ゴール）。1回の旅で通る背景は12枚（森か大橋のどちらか）。
//   14 の最後のマス＝ゴールに着いたら、到着イベント専用の背景 final/event/ch1_bg_15_event（マス・サイコロなし）→ フィナの会話 → 大会受付（config.arrival）。
//   旧構成の背景（field/ 10枚・road/ 15枚・journey/ 13枚）はファイルを残すが参照しない。
//  BACKGROUNDS：背景ごとに backgroundId・route・image・表示名【暫定】・地形・道の中央線 road [y, x, 半幅]（画像を目視で読んだ値。背景に対する割合）・
//   nodes＝その背景のマス [x, y, 種類]（背景に対する割合。手前 → 奥）。マス数は背景ごとに違ってよい（道の長さ・見え方で決めた。固定の「1枚 N マス」は無い）。
//   背景の最奥（遠景の道）まではマスを置かない（この先にも世界が続く景観として残す）。必要なら背景ごとに camera を書ける。ずれていたら数字を直すだけ。
//  公式マス 60（スタートを含まない。通常19・能力18（6能力×3）・野生6・イベント6・宝4・休む3・ライバル1・分岐／合流2・ゴール1）・40ターン・サイコロ 1〜3。
// =========================================================
(function (root) {
  'use strict';
  const A = './assets/fields/ch1a/', TL = A + 'tiles/', FN = A + 'final/', F = FN + 'field/', I = A + 'intro/', U = A + 'ui/', D = A + 'dice/';
  const W = 762, H = 1536;   // 背景画像の大きさ
  const DEPTH = [[0.98, 1.22], [0.9, 1.1], [0.84, 1], [0.72, 0.84], [0.6, 0.62], [0.535, 0.5], [0.47, 0.4], [0.425, 0.34], [0.38, 0.28], [0.3, 0.2]];
  // route：common（共通区間 01〜05）→ 05 の最後のマス＝分かれ道（branch）→ forest（森の道 06〜07）／bridge（大橋の道 08〜09）→ late（合流 10 の最初のマス＝merge → 終盤 → 14 の大会会場の門前）。
  //  nodes＝[x, y, マスの種類]（手前 → 奥。種類は MMCH.NODE_TYPES の名前＋branch・merge・start。通常マス normal も止まれる公式のマス）。座標は道の中央線の上（画像を見て置いた値。等間隔ではない）
  const BACKGROUNDS = [
    { backgroundId: '01', route: 'common', image: F + 'ch1_bg_01.webp', name: '旅立ちの小道', terrain: 'grass',
      road: [[0.97,0.5,0.45],[0.85,0.48,0.4],[0.75,0.47,0.33],[0.65,0.48,0.26],[0.58,0.52,0.18],[0.52,0.57,0.12],[0.47,0.58,0.08],[0.43,0.56,0.05]],
      nodes: [[0.483,0.87,'start'],[0.471,0.74,'normal'],[0.489,0.634,'stat_life'],[0.541,0.555,'normal'],[0.576,0.49,'stat_power']] },
    { backgroundId: '02', route: 'common', image: F + 'ch1_bg_02.webp', name: '木漏れ日の森道', terrain: 'forest',
      road: [[0.97,0.53,0.43],[0.85,0.51,0.37],[0.75,0.49,0.29],[0.65,0.49,0.21],[0.57,0.5,0.13],[0.52,0.53,0.09],[0.48,0.56,0.06]],
      nodes: [[0.513,0.87,'event'],[0.49,0.751,'stat_intelligence'],[0.49,0.65,'normal'],[0.5,0.571,'treasure'],[0.537,0.51,'stat_accuracy']] },
    { backgroundId: '03', route: 'common', image: F + 'ch1_bg_03.webp', name: '清流の石橋', terrain: 'bridge',
      road: [[0.97,0.5,0.46],[0.85,0.5,0.4],[0.75,0.5,0.33],[0.65,0.51,0.27],[0.55,0.5,0.2],[0.48,0.52,0.13],[0.44,0.56,0.09]],
      nodes: [[0.5,0.87,'normal'],[0.501,0.742,'stat_evasion'],[0.509,0.638,'wild'],[0.5,0.555,'normal'],[0.517,0.49,'stat_toughness']] },
    { backgroundId: '04', route: 'common', image: F + 'ch1_bg_04.webp', name: '遺跡の門', terrain: 'forest',
      road: [[0.97,0.5,0.48],[0.85,0.5,0.43],[0.75,0.51,0.36],[0.65,0.52,0.28],[0.57,0.52,0.21],[0.51,0.52,0.14],[0.47,0.53,0.1]],
      nodes: [[0.5,0.87,'rest'],[0.51,0.752,'stat_life'],[0.52,0.653,'normal'],[0.52,0.573,'wild'],[0.52,0.51,'event']] },
    { backgroundId: '05', route: 'common', image: F + 'ch1_bg_05.webp', name: '滝の見える道', terrain: 'forest',
      road: [[0.97,0.5,0.45],[0.85,0.5,0.38],[0.75,0.49,0.3],[0.68,0.5,0.24],[0.62,0.52,0.17],[0.59,0.53,0.13]],
      nodes: [[0.5,0.87,'normal'],[0.49,0.753,'stat_intelligence'],[0.502,0.675,'normal'],[0.528,0.595,'branch']] },
    // ---- 森の道（分かれ道の左）：大樹の森 → 深い森の小道。能力・イベント・休む・宝が多い ----
    { backgroundId: '06', route: 'forest', image: F + 'ch1_bg_06.webp', name: '大樹の森', terrain: 'forest',
      road: [[0.97,0.5,0.45],[0.85,0.5,0.38],[0.75,0.51,0.31],[0.68,0.54,0.21],[0.63,0.57,0.12],[0.59,0.6,0.07]],
      nodes: [[0.5,0.87,'stat_evasion'],[0.509,0.759,'event'],[0.538,0.685,'stat_life'],[0.585,0.61,'rest']] },
    { backgroundId: '07', route: 'forest', image: F + 'ch1_bg_07.webp', name: '深い森の小道', terrain: 'forest',
      road: [[0.97,0.5,0.46],[0.85,0.5,0.4],[0.75,0.5,0.33],[0.68,0.51,0.25],[0.63,0.54,0.16],[0.6,0.56,0.11]],
      nodes: [[0.5,0.87,'treasure'],[0.5,0.773,'stat_intelligence'],[0.515,0.671,'normal'],[0.557,0.605,'stat_accuracy']] },
    // ---- 大橋の道（分かれ道の右）：水道橋の見える道 → 天空の大橋。野生バトルが多い ----
    { backgroundId: '08', route: 'bridge', image: F + 'ch1_bg_08.webp', name: '水道橋の見える道', terrain: 'highland',
      road: [[0.97,0.5,0.48],[0.85,0.5,0.45],[0.75,0.51,0.4],[0.67,0.53,0.33],[0.61,0.56,0.25],[0.56,0.6,0.15],[0.53,0.62,0.09]],
      nodes: [[0.5,0.87,'normal'],[0.512,0.742,'wild'],[0.545,0.639,'stat_power'],[0.6,0.56,'event']] },
    { backgroundId: '09', route: 'bridge', image: F + 'ch1_bg_09.webp', name: '天空の大橋', terrain: 'bridge',
      road: [[0.97,0.5,0.48],[0.85,0.5,0.46],[0.75,0.49,0.42],[0.65,0.48,0.37],[0.57,0.46,0.3],[0.5,0.44,0.19],[0.46,0.45,0.12],[0.43,0.46,0.07]],
      nodes: [[0.5,0.87,'normal'],[0.49,0.752,'treasure'],[0.48,0.653,'normal'],[0.461,0.575,'wild'],[0.444,0.513,'stat_toughness'],[0.45,0.46,'normal']] },
    // ---- 合流後（終盤）：風の丘の最初のマス＝合流 → 古塔の遺跡 → 遺跡の高台 → 城へ続く道 → 大会会場の門前（ライバル → ゴール） ----
    { backgroundId: '10', route: 'late', image: F + 'ch1_bg_10.webp', name: '風の丘', terrain: 'highland',
      road: [[0.97,0.5,0.48],[0.85,0.5,0.46],[0.75,0.5,0.43],[0.65,0.5,0.37],[0.58,0.51,0.28],[0.53,0.52,0.18],[0.49,0.53,0.1]],
      nodes: [[0.5,0.87,'merge'],[0.5,0.751,'stat_power'],[0.5,0.652,'normal'],[0.511,0.573,'wild'],[0.525,0.51,'stat_evasion']] },
    { backgroundId: '11', route: 'late', image: F + 'ch1_bg_11.webp', name: '古塔の遺跡', terrain: 'highland',
      road: [[0.97,0.5,0.48],[0.85,0.5,0.45],[0.75,0.51,0.4],[0.65,0.52,0.33],[0.58,0.53,0.25],[0.53,0.53,0.16],[0.49,0.53,0.09]],
      nodes: [[0.5,0.87,'event'],[0.511,0.737,'normal'],[0.526,0.605,'stat_toughness'],[0.53,0.525,'treasure']] },
    { backgroundId: '12', route: 'late', image: F + 'ch1_bg_12.webp', name: '遺跡の高台', terrain: 'highland',
      road: [[0.97,0.5,0.48],[0.85,0.5,0.45],[0.75,0.51,0.42],[0.65,0.53,0.37],[0.59,0.53,0.27],[0.55,0.53,0.16],[0.53,0.53,0.11]],
      nodes: [[0.5,0.87,'normal'],[0.511,0.745,'stat_accuracy'],[0.53,0.642,'rest'],[0.53,0.56,'normal']] },
    { backgroundId: '13', route: 'late', image: F + 'ch1_bg_13.webp', name: '城へ続く道', terrain: 'grass',
      road: [[0.97,0.48,0.45],[0.85,0.47,0.4],[0.75,0.47,0.32],[0.67,0.48,0.23],[0.61,0.5,0.15],[0.56,0.53,0.09],[0.52,0.55,0.06]],
      nodes: [[0.472,0.87,'wild'],[0.477,0.69,'event'],[0.521,0.575,'normal']] },
    { backgroundId: '14', route: 'late', image: F + 'ch1_bg_14.webp', name: '大会会場の門前', terrain: 'highland',
      road: [[0.97,0.5,0.48],[0.85,0.5,0.47],[0.75,0.5,0.4],[0.7,0.5,0.3],[0.66,0.5,0.22],[0.63,0.5,0.15]],
      nodes: [[0.5,0.87,'rival'],[0.5,0.769,'normal'],[0.5,0.68,'goal']] },
  ];
  const TOTAL_TILES = 60;   // 公式マスの総数（スタートを含まない。森・大橋の両方を合わせた全体。tests/chapter-engine.test.mjs と layoutRules.expect で確認）
  const fieldScenes = [], paths = [], landmarks = {}, foreground = {};
  const at = (pts, y, k) => { const C = [...pts].sort((a, b) => a[0] - b[0]); if (y <= C[0][0]) return C[0][k]; for (let i = 1; i < C.length; i++) if (y <= C[i][0]) { const a = C[i - 1], b = C[i]; return +(a[k] + (b[k] - a[k]) * (y - a[0]) / (b[0] - a[0])).toFixed(4); } return C[C.length - 1][k]; };
  for (const B of BACKGROUNDS) {
    const sid = fieldScenes.length + 1, id = `p${sid}_`, near = B.nodes[0][1], far = B.nodes[B.nodes.length - 1][1];
    fieldScenes.push({ id: sid, name: B.name, route: B.route, bg: B.image, w: W, h: H, bgKey: B.backgroundId, stage: B.backgroundId, exit: 'up', farBand: { to: 0.26, k: 0.95 }, depth: DEPTH, zoom: (B.camera && B.camera.zoom) || { near: 1.45, far: 2.15 }, road: { center: B.road, safe: 0.7 }, ...(B.camera && B.camera.scene ? { camera: B.camera.scene } : {}) });
    landmarks[sid] = []; foreground[sid] = [];
    // 歩く道筋：マスの点と、その間にある道の中央線の点（手前 → 奥）。中央線の点は歩きの見た目だけの経由点で、サイコロの出目には数えない（出目＝公式のマス＝ノード）
    const mids = B.road.filter((p) => p[0] < near && p[0] > far).map((p) => [at(B.road, p[0], 1), p[0]]);
    const pts = [...B.nodes.map((q) => [q[0], q[1]]), ...mids].sort((a, b) => b[1] - a[1]);
    paths.push({ id, field: sid, n: B.nodes.length, nodePts: B.nodes.map((q) => [q[0], q[1]]), tiles: B.nodes.map((q) => q[2] || 'normal'), tileLook: B.nodes.map((q) => q[3] || null), curve: 'linear', terrain: B.terrain, next: [], pts,
      ...(B.route === 'forest' || B.route === 'bridge' ? { branch: B.route } : {}) });
  }
  const P = (id) => paths.find((p) => p.id === id), N = (id) => P(id).n, PID = (bg) => `p${BACKGROUNDS.findIndex((B) => B.backgroundId === bg) + 1}_`;
  // つながり：共通 01→05、05 の分かれ道 → 森 06→07 ／ 大橋 08→09、どちらも → 10 の合流 → 14
  const LINKS = [['01', '02'], ['02', '03'], ['03', '04'], ['04', '05'], ['05', '06'], ['05', '08'], ['06', '07'], ['07', '10'], ['08', '09'], ['09', '10'], ['10', '11'], ['11', '12'], ['12', '13'], ['13', '14']];
  for (const [a, b] of LINKS) P(PID(a)).next.push(PID(b));
  const ORDER = BACKGROUNDS.map((B) => B.backgroundId), NODES = Object.fromEntries(BACKGROUNDS.map((B) => [B.backgroundId, B.nodes.filter((q) => q[2] !== 'start').length]));
  const ROUTES = { common: ['01', '02', '03', '04', '05'], forest: ['06', '07'], bridge: ['08', '09'], late: ['10', '11', '12', '13', '14'] };
  P(PID('01')).start = true;
  P(PID('14')).goal = true;   // ゴール＝14 の最後のマス（大会会場の門前）。ライバル（強制停止）はその2つ手前
  const BRANCH_AT = `${PID('05')}${N(PID('05')) - 1}`;
  // 分かれ道（05 の最後のマス）：左＝森の道、右＝大橋の道。gate＝分かれ道で道の先に立てる左右の門（正式素材 tiles/branch_gate_left・right。ZIP の 02_branching を透過化）。label・desc は【暫定】
  const BRANCHES = [{ at: BRANCH_AT, options: [
    { id: 'forest', to: `${PID('06')}0`, label: '森の道', desc: '大樹の森を抜ける。能力・休むマスが多い【暫定】', side: -1, gate: 'gate_left', lean: {} },
    { id: 'bridge', to: `${PID('08')}0`, label: '大橋の道', desc: '天空の大橋を渡る。野生バトルが多い【暫定】', side: 1, gate: 'gate_right', lean: {} },
  ] }];

  const cfg = {
    chapterId: 1,
    patternId: 'A',
    title: 'はじまりの草原',
    patternTitle: 'はじまりの草原',
    playable: true,
    // 通常マス（normal）は止まれる公式のマス（2026-10-02 の60マス再設計：出目に数え、止まると何も起きずにターンが終わる。旧 passNormal＝通過専用は廃止）。
    //  歩きの見た目だけの経由点（paths[].pts の道の中央線の点）はマスではなく、出目に数えない
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
    // 背景の切り替え：歩き続けたまま前の背景から次の背景へクロスフェード（ms＝溶ける時間（歩いて入る enterMs の間に終わる）、outMs／out＝前の背景の先へ歩き続ける時間・距離、back／enterMs＝次の背景の入口の手前から歩いて入る距離・時間。境目はマスではない）
    backgroundTransition: { type: 'crossfade', ms: 460, outMs: 260, out: 80, back: 90, enterMs: 540 },
    stageOrder: ORDER, routes: ROUTES, tilesPerBackground: NODES, totalTiles: TOTAL_TILES,

    fieldScenes, paths, edges: {}, nodeOverrides: {},
    branches: BRANCHES,

    // anchorY 0.72（2026-10-02 歩行アニメ：0.66 → 0.72。ソラモを画面の中央下に置き、進む先の道を広く見せる）
    camera: { anchorY: 0.72, lookAhead: 0.08, followDelay: 110, zoom: { idle: 1, move: 0.985, stop: 1.015, branch: 0.93, focus: 1.02 } },
    motion: { stepMs: 520, minMs: 380, maxMs: 760, baseLen: 170, terrain: { grass: { speed: 1 }, highland: { speed: 0.96 }, bridge: { speed: 1, fixed: true }, forest: { speed: 0.94 } } },
    parallax: { far: 0.95, back: 0.97, road: 1, front: 1.12, canopy: 0.6 },

    // ---- Chapter開始の演出（js/chapter/intro.js。2026-10-02 正式の流れ）：全景を止めて見せる →「Chapter 1」→「はじまりの草原」→ 消える
    //  → 全景の中を旅の開始地点（下端の草原の小道＝FIELD 1 の柵のある小道）へカメラが移動 → FIELD 1 へクロスフェード → ソラモ・マス・UI。
    //  Pattern ごとの全景画像とカメラは patterns[patternId]（Pattern B／C はここに { overview, camera:{ from, to, via } } を足すだけ）。
    //  camera の x・y は全景画像に対する割合、zoom は画面いっぱい（cover）に対する倍率。timing を書けば時間も変えられる（既定は intro.js の TIMING＝約3.9秒） ----
    intro: { label: 'Chapter 1', name: 'はじまりの草原', overviews: { A: I + 'ch1_intro_overview.webp' },
      patterns: { A: { overview: I + 'ch1_intro_overview.webp', camera: { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.93, zoom: 2.3 } } } } },

    // ---- 操作欄：START の正式画像（STOP は使わない） ----
    deck: { start: U + 'deck_start.webp', aspect: 1100 / 353,
      hit: { center: { x: 0.385, y: 0.03, w: 0.23, h: 0.94 }, tl: { x: 0.012, y: 0.05, w: 0.37, h: 0.42 }, tr: { x: 0.618, y: 0.05, w: 0.37, h: 0.42 }, bl: { x: 0.012, y: 0.53, w: 0.37, h: 0.42 }, br: { x: 0.618, y: 0.53, w: 0.37, h: 0.42 } } },

    // ---- 配置の規則（2026-10-02 の60マス再設計：固定配置）。マスの種類は BACKGROUNDS[].nodes の3番目のとおり（ランダムに並べ替えない）。
    //  Chapter開始時に seed で決めるのは中身だけ：イベントの内容（eventPool。休む＝疲れ回復のイベント）・宝箱の段階・野生がレアモンスターマスになるか（rareBattleRate）。
    //  expect＝正式の内訳（スタートを含まない60マス）。構成を変えたら validateLayout がこの数で確かめる ----
    layoutRules: {
      fixed: true,
      expect: { total: TOTAL_TILES, groups: { normal: 19, stat: 18, wild: 6, event: 6, treasure: 4, rest: 3, rival: 1, branchSpecial: 2, goal: 1 }, perStat: 3 },
      rareBattleRate: 0.1,   // 野生のマスがレアモンスターマスになる確率（2026-10-02 正式：10%）。配置を作るとき（Chapter開始時に1回）に決めて保存する
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
      wild: { label: '野生のモンスター', asset: 'battle_wild', cutin: 'fx_battle_encounter' },   // cutin：野生バトル突入のカットイン（2026-10-02 正式。赤と金の交差。レア・ライバルには付けない）
      rare: { label: 'レアモンスター', asset: 'battle_wild' },   // レアモンスターマス（10%）。敵データ・報酬・遭遇演出は未登録＝【暫定】バトルの中身は野生と同じ
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
      battle_wild: A + 'nodes/battle_wild.webp', battle_rival: A + 'nodes/battle_rival.webp',
      grass_front: A + 'env/grass_flower_border.webp',
      // 演出（2026-10-02。ZIP mystic-monsters-board-ui-assets-2026-10-01-v2 の 03_board_effects を透過化。assets/fields/ch1a/effects/README.md）
      fx_battle_encounter: A + 'effects/effect_battle_encounter.webp', fx_stat_up: A + 'effects/frame_stat_up.webp', fx_turn_warning: A + 'effects/ui_turn_warning.webp',
      // 宝箱（2026-10-02 正式素材。ZIP の 05_goal_and_treasure を透過化）：normal＝通常の宝箱、special＝虹色の宝箱。rare は従来の表示のまま（この2つを流用しない）
      chest_normal_closed: TL + 'chest_normal_closed.webp', chest_normal_open: TL + 'chest_normal_open.webp',
      chest_special_closed: TL + 'chest_rainbow_closed.webp', chest_special_open: TL + 'chest_rainbow_open.webp',
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
    // ---- マスUI（2026-10-02 正式素材：assets/fields/ch1a/tiles/。ZIP mystic-monsters-board-ui-assets-complete-2026-10-02 の 01_board_nodes・05_goal_and_treasure を透過化）。
    //  60個の座標は BACKGROUNDS[].nodes のまま、種別ごとの素材だけを差し替える。種別名は MMCH.NODE_TYPES。探す順＝種別名 → まとめた種類（stat・event・battle）→ normal。
    //  通常マス（normal）・スタート（start）の正式素材は未着（ZIP の MISSING_OR_PENDING）＝何も置かない。位置確認の仮表示は ?chdebug=1 のときだけ。
    //  バトルのマスは 野生（赤い爪）・レアモンスター（深紅。ZIP の board_node_strong_enemy＝tile_rare_monster）・ライバル（紫の交差した剣）の3種類だけ（強敵マスは無い）
    //  replacesLandmarks：マスUIが種別を示すので、同じ意味の旧目印（道端の石碑・宝箱・イベントの物）は出さない ----
    tileUI: {
      sprites: {
        stat_life: TL + 'tile_stat_life.webp', stat_power: TL + 'tile_stat_power.webp', stat_intelligence: TL + 'tile_stat_intelligence.webp',
        stat_accuracy: TL + 'tile_stat_accuracy.webp', stat_evasion: TL + 'tile_stat_evasion.webp', stat_toughness: TL + 'tile_stat_toughness.webp',
        wild: TL + 'tile_wild_battle.webp', rare: TL + 'tile_rare_monster.webp', rival: TL + 'tile_rival.webp',
        treasure: TL + 'tile_treasure.webp', rest: TL + 'tile_rest.webp', event: TL + 'tile_event.webp', goal: TL + 'tile_chapter_goal.webp',
        branch: TL + 'tile_branch.webp', merge: TL + 'tile_merge.webp',   // 分かれ道・合流（2026-10-02。ZIP の 02_branching の board_node_branch／merge を透過化）
      },
      // 宝箱のマスに止まったとき、マスの脇に現れて開く宝箱（tier ごと。書いていない tier＝rare は従来の表示＝マスUIだけ）
      chests: { normal: { closed: 'chest_normal_closed', open: 'chest_normal_open', w: 128 }, special: { closed: 'chest_special_closed', open: 'chest_special_open', w: 134 } },
      // 大きさ：基準 w × 奥行き^depthPow（背景の画素）。flat＝縦の潰れ（奥 far ほど平たい楕円・手前 near ほど円に近い。奥行き d で補間）。normal＝通常マスの大きさの倍率（控えめ）。
      //  pedestal＝共通の台座（接地影・石の台座の厚み thick・金属の縁 rim。CSS だけ）。ノードごとの上書きは BACKGROUNDS[].nodes の4番目 { s, f }
      size: { w: 190, depthPow: 0.7, flat: { near: 0.52, far: 0.3, dNear: 1.12, dFar: 0.4 }, normal: 0.8, thick: 0.06, rim: 0.016 }, pedestal: true, placeholder: false, replacesLandmarks: true,
      gates: { gate_left: TL + 'branch_gate_left.webp', gate_right: TL + 'branch_gate_right.webp' },   // 分かれ道で道の先に立てる左右の門（branches[].options[].gate）   // 表示の大きさ：基準 230px × 奥行き^0.65（手前 約250px・奥 約130px＝背景の画素。縦は 0.46 に潰して地面に置いた見え方）
    },
    // 演出の割り当て（config.assets のキー）。statUp＝能力マスの結果の枠（文字は HTML）。turnWarning.at＝警告を出す残りターン（未決＝空＝出さない。例：[5, 1]）
    effects: { statUp: 'fx_stat_up', turnWarning: { asset: 'fx_turn_warning', at: [] } },
    battleMarkers: false,
    landmarkVisibility: { stat: 'arrive', event: 'arrive', treasure: 'arrive' },   // 宝箱はマスUIがあるので、止まったときに現れる
    // ---- 歩行アニメ（2026-10-02 正式素材：ソラモの後ろ向き歩行 8カット。assets/monsters/solamo_walk_back/）。種族キーごと。無い種族は従来の画像＋CSS の上下動。
    //  その場歩行の絵：移動の間だけ 01→08 をループ（fps × 歩く速さ）、止まったら idle（01）。後ろ姿なので左右反転・前傾はしない（noFlip） ----
    monsterSprites: {
      // 2026-10-02 正式素材（ZIP mismon_walk_sprites_transparent。assets/monsters/{種族}_walk/README.md）：ガウル 6コマ（後ろ姿）・ノビトン 8コマ（横向き＝右向き）・ジオル 8コマ。
      //  移動の時間は種族で変えない（歩く速さは共通）。コマの速さだけ：ガウルは 6コマなので 9fps（1周 約0.67秒＝8コマの 12fps と同じ）。h は箱に対する高さ（体型の違い）
      gauru: { walk: { frames: [1, 2, 3, 4, 5, 6].map((i) => `./assets/monsters/gauru_walk/gauru_walk_0${i}.webp`), fps: 9, idle: 0, h: 1.05, noFlip: true } },
      nobiton: { walk: { frames: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => `./assets/monsters/nobiton_walk/nobiton_walk_0${i}.webp`), fps: 12, idle: 0, h: 0.86, noFlip: true } },
      jiol: { walk: { frames: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => `./assets/monsters/jiol_walk/jiol_walk_0${i}.webp`), fps: 12, idle: 0, h: 0.95, noFlip: true } },
      solamo: { walk: { frames: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => `./assets/monsters/solamo_walk_back/solamo_walk_back_0${i}.webp`), fps: 12, idle: 0, h: 0.9, noFlip: true } },
    },
    monster: { h: 180, w: 150 },   // w＝体の幅（道の安全域の計算に使う。画像の見た目の幅）
    landmarks, foreground, branchOverlays: {},
  };
  if (root.MMCH) root.MMCH.registerConfig(cfg);
  root.MMCH_CONFIG_CH1A = cfg;
})(typeof window !== 'undefined' ? window : globalThis);
