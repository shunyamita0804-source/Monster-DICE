// =========================================================
// Phase 9：正式Chapter 1〜4 の育成ボード（window.MMP9C）
//  ボードの「形（マス・つながり・分岐のルート種別）」だけを持つ純粋データ。
//  進行ロジック（20ターン制・マス効果・途中保存）は js/phase8/raising.js、絵は js/phase9/board-art.js。
//  ・座標は幅400の縦長キャンバス（下がスタート、上が公式大会会場）。
//  ・ルート種別：main（通常ルート）/ short（近道：マスが少なく大会到達を優先）/ detour（寄り道：宝箱・修行チケット・能力マスが多い）
//  ・分岐点の conn は「通常ルートを先頭」に並べる。
//  ・Chapter名は js/phase7/progression.js の CHAPTER_DEFS が唯一の定義元（ここでは持たない）。
// =========================================================
(function (root) {
  'use strict';
  const TYPE_CODE = Object.freeze({ n: 'normal', L: 'life', P: 'power', W: 'wisdom', H: 'hit', V: 'evasion', D: 'toughness',
    E: 'event', T: 'treasure', B: 'battle', K: 'ticket', R: 'rare', S: 'start', G: 'tournament' });
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  /** 折れ線上に n 個の点を等間隔に置く（両端は含めない） */
  function along(pts, n) {
    const seg = []; let total = 0;
    for (let i = 1; i < pts.length; i++) { const d = dist(pts[i - 1], pts[i]); seg.push(d); total += d; }
    const out = [];
    for (let k = 1; k <= n; k++) {
      let t = (total * k) / (n + 1), i = 0;
      while (i < seg.length - 1 && t > seg[i]) { t -= seg[i]; i++; }
      const a = pts[i], b = pts[i + 1], r = seg[i] ? t / seg[i] : 0;
      out.push([Math.round(a[0] + (b[0] - a[0]) * r), Math.round(a[1] + (b[1] - a[1]) * r)]);
    }
    return out;
  }
  /**
   * def.J：分岐・合流点 { id: [x, y, 種類コード] }（S＝スタート、G＝ゴール）
   * def.P：ルート [{ id, from, to, via:[[x,y]...], types:'種類コード列（中間マス）', kind, label, bridge:[区間番号...] }]
   */
  function build(def) {
    const nodes = {}, conn = {}, lanes = {}, bridges = [];
    for (const [id, [x, y, c]] of Object.entries(def.J)) nodes[id] = { type: TYPE_CODE[c], x, y };
    for (const p of def.P) {
      const a = nodes[p.from], b = nodes[p.to];
      const pos = along([[a.x, a.y], ...(p.via || []), [b.x, b.y]], p.types.length);
      const ids = [...p.types].map((c, i) => { const id = `${p.id}${i + 1}`; nodes[id] = { type: TYPE_CODE[c], x: pos[i][0], y: pos[i][1], lane: p.id }; return id; });
      const chain = [p.from, ...ids, p.to];
      for (let i = 0; i < chain.length - 1; i++) { (conn[chain[i]] = conn[chain[i]] || []); if (!conn[chain[i]].includes(chain[i + 1])) conn[chain[i]].push(chain[i + 1]); }
      lanes[p.id] = { kind: p.kind || 'main', label: p.label || '', from: p.from, to: p.to, steps: ids.length + 1, via: p.via || [] };
      for (const g of p.bridge || []) bridges.push([chain[g - 1], chain[g]]);
    }
    return { nodes, conn, start: 'S', goal: 'G', lanes, bridges };
  }

  // ---------------------------------------------------------
  // Chapter 1「はじまりの草原」Map Pattern A「大橋と清流の草原」：分岐3か所（すべて再合流）
  //  正式地理（下→上）：START→旅立ちの草原→第一分岐（草原の本道／花畑の遠回り）→再合流→清流地帯→大きな川
  //   →第二分岐（石造りの大橋／川沿いの迂回路）→再合流→森の入口→第三分岐（木漏れ日の林道／見晴らしの岩丘）→再合流→大会前の高原→公式大会の門
  //  マスの総数（40）と種類ごとの数は旧Chapter 1と同じ（効果の新設・削除なし）。
  //  ノードIDは旧Chapter 1（a1〜g5・A〜D）と重ならない名前にしている：旧Chapter 1の途中で保存されたv6セーブは、
  //  存在しないノードとして既存の安全処理（ensureBoardPosition：同じChapterの開始地点・0ターンから）に乗る（別の場所から続かない）。
  //  第三分岐の「見晴らしの岩丘」を近道（short）にしているのは暫定（正式地理に長さの指定が無いため、各Chapterに近道がある既存ルールに合わせた）。
  // ---------------------------------------------------------
  const C1 = build({
    J: { S: [200, 1205, 'S'], J1: [200, 1060, 'n'], J2: [200, 900, 'L'], J3: [200, 760, 'n'], J4: [200, 560, 'T'], J5: [200, 440, 'n'], J6: [200, 300, 'E'], G: [200, 165, 'G'] },
    P: [
      { id: 'p', from: 'S', to: 'J1', via: [[150, 1150], [140, 1100]], types: 'LPnW', label: '旅立ちの草原' },
      { id: 'q', from: 'J1', to: 'J2', via: [[260, 1000], [250, 940]], types: 'HnP', label: '草原の本道' },
      { id: 'r', from: 'J1', to: 'J2', via: [[110, 1040], [60, 980], [70, 920], [130, 900]], types: 'TLWEV', kind: 'detour', label: '花畑の遠回り' },
      { id: 's', from: 'J2', to: 'J3', via: [[280, 860], [300, 800]], types: 'DnW', label: '清流地帯' },
      { id: 't', from: 'J3', to: 'J4', via: [[250, 700], [240, 620]], types: 'VnB', label: '石造りの大橋', bridge: [2, 3] },
      { id: 'u', from: 'J3', to: 'J4', via: [[120, 730], [60, 670], [70, 600], [130, 570]], types: 'EKPnH', kind: 'detour', label: '川沿いの迂回路' },
      { id: 'v', from: 'J4', to: 'J5', via: [[260, 520], [250, 470]], types: 'Bn', label: '森の入口' },
      { id: 'w', from: 'J5', to: 'J6', via: [[290, 420], [300, 360], [260, 320]], types: 'KWE', label: '木漏れ日の林道' },
      { id: 'x', from: 'J5', to: 'J6', via: [[130, 380]], types: 'D', kind: 'short', label: '見晴らしの岩丘' },
      { id: 'y', from: 'J6', to: 'G', via: [[150, 260], [140, 210]], types: 'PLT', label: '大会前の高原' },
    ],
  });
  // ---------------------------------------------------------
  // Chapter 2「潮風の海岸」：分岐3か所（海岸線・港・崖上・灯台・古城）
  // ---------------------------------------------------------
  const C2 = build({
    J: { S: [220, 1350, 'S'], A: [190, 1180, 'n'], B: [200, 920, 'T'], C: [270, 790, 'n'], D: [190, 520, 'E'], E: [270, 380, 'n'], G: [200, 125, 'G'] },
    P: [
      { id: 'a', from: 'S', to: 'A', via: [[150, 1310], [120, 1240]], types: 'LnWP' },
      { id: 'b', from: 'A', to: 'B', via: [[240, 1120], [250, 1040], [210, 980]], types: 'HEnVB', label: '港の桟橋', bridge: [2, 3] },
      { id: 'c', from: 'A', to: 'B', via: [[110, 1150], [60, 1080], [60, 990], [100, 930], [150, 900]], types: 'TPKLTEWV', kind: 'detour', label: '砂浜の海岸線' },
      { id: 'd', from: 'B', to: 'C', via: [[280, 900], [330, 840]], types: 'DnE' },
      { id: 'e', from: 'C', to: 'D', via: [[250, 710], [220, 640]], types: 'PWnL', label: '港町の坂道' },
      { id: 'f', from: 'C', to: 'D', via: [[300, 650]], types: 'Bn', kind: 'short', label: '断崖の上' },
      { id: 'h', from: 'C', to: 'D', via: [[180, 800], [100, 780], [60, 700], [80, 610], [140, 560]], types: 'VTLKHTD', kind: 'detour', label: '灯台の岬', bridge: [3] },
      { id: 'i', from: 'D', to: 'E', via: [[260, 490], [320, 440]], types: 'EnH' },
      { id: 'j', from: 'E', to: 'G', via: [[190, 350], [150, 290], [200, 230]], types: 'WDnP', label: '石橋の街道', bridge: [2] },
      { id: 'k', from: 'E', to: 'G', via: [[350, 340], [370, 260], [330, 190], [260, 170]], types: 'TKLPBTV', kind: 'detour', label: '古城の階段' },
    ],
  });
  // ---------------------------------------------------------
  // Chapter 3「天空の浮島」：分岐4か所（浮島を渡る空の道）
  // ---------------------------------------------------------
  const C3 = build({
    J: { S: [200, 1450, 'S'], A: [150, 1300, 'n'], B: [250, 1120, 'E'], C: [200, 990, 'n'], D: [230, 780, 'T'], E: [160, 640, 'n'], F: [250, 470, 'n'], G: [200, 170, 'G'] },
    P: [
      { id: 'a', from: 'S', to: 'A', via: [[280, 1410], [260, 1340]], types: 'LWn' },
      { id: 'b', from: 'A', to: 'B', via: [[200, 1250], [310, 1200]], types: 'PHnE', label: '中央の浮島', bridge: [4] },
      { id: 'c', from: 'A', to: 'B', via: [[70, 1260], [40, 1180], [80, 1110], [150, 1090]], types: 'TKLVTW', kind: 'detour', label: '飛空艇の発着場', bridge: [6] },
      { id: 'd', from: 'B', to: 'C', via: [[300, 1050]], types: 'Dn' },
      { id: 'e', from: 'C', to: 'D', via: [[120, 950], [110, 870]], types: 'WEnL', label: '雲上の小道', bridge: [4] },
      { id: 'f', from: 'C', to: 'D', via: [], types: 'Bn', kind: 'short', label: '空中橋', bridge: [1, 2, 3] },
      { id: 'h', from: 'C', to: 'D', via: [[300, 970], [360, 900], [360, 820], [310, 760]], types: 'TPRKHT', kind: 'detour', label: '古代遺跡' },
      { id: 'i', from: 'D', to: 'E', via: [[150, 730]], types: 'nV', bridge: [2] },
      { id: 'j', from: 'E', to: 'F', via: [[230, 600], [300, 540]], types: 'HPnD', label: '風の回廊' },
      { id: 'k', from: 'E', to: 'F', via: [[80, 600], [50, 520], [90, 450], [170, 440]], types: 'LTWKEV', kind: 'detour', label: '滝の浮島', bridge: [7] },
      { id: 'l', from: 'F', to: 'G', via: [[320, 400], [280, 320]], types: 'EnLP', label: '大階段' },
      { id: 'm', from: 'F', to: 'G', via: [[200, 360], [110, 330], [80, 260], [130, 205]], types: 'TBDnTW', kind: 'detour', label: '天空の遺跡', bridge: [2] },
    ],
  });
  // ---------------------------------------------------------
  // Chapter 4「灼熱の火山」：分岐4か所（溶岩・黒岩・砦。通常Chapterの最終章）
  // ---------------------------------------------------------
  const C4 = build({
    J: { S: [200, 1500, 'S'], A: [260, 1330, 'n'], B: [150, 1150, 'E'], C: [250, 980, 'n'], D: [150, 790, 'T'], E: [260, 640, 'n'], F: [170, 440, 'n'], G: [200, 180, 'G'] },
    P: [
      { id: 'a', from: 'S', to: 'A', via: [[280, 1460], [310, 1390]], types: 'PLn' },
      { id: 'b', from: 'A', to: 'B', via: [[340, 1260], [290, 1190], [200, 1180]], types: 'WHnD', label: '黒岩の道' },
      { id: 'c', from: 'A', to: 'B', via: [[160, 1320], [70, 1290], [40, 1210], [80, 1150]], types: 'TKPBLT', kind: 'detour', label: '砦の裏道', bridge: [4] },
      { id: 'd', from: 'B', to: 'C', via: [[200, 1080]], types: 'En' },
      { id: 'e', from: 'C', to: 'D', via: [[330, 930], [340, 850], [260, 810]], types: 'VPnL', label: '噴煙の坂' },
      { id: 'f', from: 'C', to: 'D', via: [[180, 900]], types: 'Bn', kind: 'short', label: '溶岩の石橋', bridge: [1, 2, 3] },
      { id: 'h', from: 'C', to: 'D', via: [[150, 990], [60, 940], [40, 860], [80, 790]], types: 'TWRKDT', kind: 'detour', label: '竜骨の谷' },
      { id: 'i', from: 'D', to: 'E', via: [[210, 730]], types: 'nH', bridge: [2] },
      { id: 'j', from: 'E', to: 'F', via: [[340, 590], [330, 510], [250, 470]], types: 'DEnW', label: '火口の縁' },
      { id: 'k', from: 'E', to: 'F', via: [[170, 640], [80, 600], [60, 520], [100, 450]], types: 'PTLnKV', kind: 'detour', label: '溶岩滝の岩場', bridge: [3] },
      { id: 'l', from: 'F', to: 'G', via: [[240, 390], [300, 320], [260, 250]], types: 'HnLE', label: '砦への坂道', bridge: [2] },
      { id: 'm', from: 'F', to: 'G', via: [[90, 390], [60, 300], [110, 230]], types: 'TBWnPT', kind: 'detour', label: '見張り塔' },
    ],
  });

  const CHAPTERS = Object.freeze([
    { no: 1, theme: 'meadow', H: 1260, track: C1, goalLabel: '公式戦', desc: 'モンスターとの旅のはじまり。豊かな草原で様々な経験を通じ、大きく成長しよう。' },
    { no: 2, theme: 'coast', H: 1400, track: C2, goalLabel: '公式戦', desc: '海風が吹き抜ける美しい海岸。港町や断崖を巡りながら、新たな出会いと経験を重ねよう。' },
    { no: 3, theme: 'sky', H: 1500, track: C3, goalLabel: '公式戦', desc: '雲海に浮かぶ神秘的な島々。風に乗って渡る空の道を進み、さらなる成長を目指そう。' },
    { no: 4, theme: 'volcano', H: 1550, track: C4, goalLabel: '最終大会', desc: '噴煙が立ち上る灼熱の大地。険しい道の先に、すべての育成の集大成となる最終大会が待つ。' },
  ].map((c) => Object.freeze({ ...c, W: 400 })));
  const byNo = (no) => CHAPTERS.find((c) => c.no === no) || null;
  root.MMP9C = Object.freeze({ TYPE_CODE, CHAPTERS, byNo, build, along });
})(typeof window !== 'undefined' ? window : globalThis);
