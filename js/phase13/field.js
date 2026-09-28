// =========================================================
// Chapterボード 新表示方式（試作）：フィールド配置（window.MMP13F）
//  内部はこれまでどおりノード式（js/phase9/chapters.js のノード・つながり・分岐をそのまま使う）。
//  ここはノードを「フィールド画像のどこに見せるか」だけを持つ表示用データ。進行ロジック・セーブには関わらない
//  （位置は保存せず、セーブにある現在ノードIDから毎回ここで引く）。
//  ・対象は Chapter 1「はじまりの草原」Map Pattern A「大橋と清流の草原」のみ（他Chapterは従来のボード表示のまま）
//  ・背景画像は仮素材（assets/fields/ch1_meadow.jpg）。正式背景が届いたら image と J・via の座標だけ差し替える
//  ・座標は画像（1536×1024）の画素座標。画面下（手前）から上（奥）へ進み、奥ほど小さく見せる（depth）
//  ・J：分岐・合流点（S＝スタート、G＝ゴール）、via：各ルートが通る地形上の道筋。
//    ルート上のマスは chapters.js と同じ数だけ道筋に沿って等間隔に置く（ノード数・種類・順番は変えない）
// =========================================================
(function (root) {
  'use strict';
  const fz = Object.freeze;
  const FIELDS = fz({
    1: fz({
      key: 'ch1_meadow', pattern: 'A', name: '大橋と清流の草原', provisional: true,
      image: fz({ src: './assets/fields/ch1_meadow.jpg', w: 1536, h: 1024 }),
      // 奥行き：画像の高さ（y）ごとの見た目の大きさ
      depth: fz([[130, 0.46], [260, 0.52], [520, 0.68], [950, 1]]),   // 奥でもモンスターが小さな駒に見えすぎない程度に（手前1.0 → 奥0.46）
      zoom: fz({ near: 1.15, far: 1.45 }),   // カメラの拡大：奥へ進むほど少しだけ寄る（目的地へ近づく印象。仮背景が荒れない範囲）
      monSize: 160,                          // 手前でのモンスターの大きさ（画像の画素）
      J: fz({ S: [760, 945], J1: [600, 815], J2: [640, 655], J3: [1060, 520], J4: [1255, 262], J5: [1185, 215], J6: [1320, 200], G: [1372, 142] }),
      via: fz({
        p: [[700, 905], [650, 860]],                                          // 旅立ちの草原：手前の土の道を奥へ
        q: [[620, 740]],                                                      // 草原の本道：中央の道をまっすぐ
        r: [[470, 800], [300, 760], [210, 690], [300, 620], [470, 635]],       // 花畑の遠回り：左手の花が咲く草地を回る
        s: [[780, 630], [900, 590], [990, 552]],                              // 清流地帯：湖畔の手前の岩と草の水辺へ
        t: [[930, 505], [870, 400], [900, 292], [1080, 268]],                  // 石造りの大橋：崖を上がり、奥の大きな石橋を渡る
        u: [[1170, 512], [1235, 465], [1305, 415], [1330, 330]],               // 川沿いの迂回路：滝の足元の岩場を回って崖の上へ
        v: [[1225, 238]],                                                     // 森の入口：城の手前の木立へ
        w: [[1150, 190], [1215, 168], [1275, 178]],                           // 木漏れ日の林道：木立の中を抜ける
        x: [[1270, 245]],                                                     // 見晴らしの岩丘：崖のふちの岩場
        y: [[1395, 190], [1420, 160]],                                        // 大会前の高原：城の足元へ
      }),
    }),
  });
  const has = (no) => !!FIELDS[no];
  const get = (no) => FIELDS[no] || null;
  function depth(no, y) {
    const F = FIELDS[no]; if (!F) return 1; const c = F.depth;
    if (y <= c[0][0]) return c[0][1]; if (y >= c[c.length - 1][0]) return c[c.length - 1][1];
    for (let i = 1; i < c.length; i++) if (y <= c[i][0]) { const [y0, d0] = c[i - 1], [y1, d1] = c[i]; return d0 + (d1 - d0) * (y - y0) / (y1 - y0); }
    return 1;
  }
  /** カメラの拡大率（奥ほど少し寄る） */
  function zoomAt(no, d) { const F = FIELDS[no]; if (!F) return 1; const dmin = F.depth[0][1], t = Math.max(0, Math.min(1, (d - dmin) / (1 - dmin))); return F.zoom.far + (F.zoom.near - F.zoom.far) * t; }
  /** ノードID → フィールド上の位置。track は MMP9C の Chapter データ（nodes・lanes） */
  function layout(no, track) {
    const F = FIELDS[no]; if (!F || !track || !root.MMP9C) return null;
    const pos = {}, segs = [];
    for (const [id, p] of Object.entries(F.J)) pos[id] = { x: p[0], y: p[1] };
    for (const [lid, ln] of Object.entries(track.lanes)) {
      const a = pos[ln.from], b = pos[ln.to]; if (!a || !b) return null;
      const n = ln.steps - 1, pts = root.MMP9C.along([[a.x, a.y], ...(F.via[lid] || []), [b.x, b.y]], n);
      const chain = [ln.from];
      for (let i = 0; i < n; i++) { const id = `${lid}${i + 1}`; pos[id] = { x: pts[i][0], y: pts[i][1], lane: lid }; chain.push(id); }
      chain.push(ln.to);
      for (let i = 0; i < chain.length - 1; i++) segs.push({ a: chain[i], b: chain[i + 1], lane: lid });
    }
    for (const id of Object.keys(track.nodes)) { if (!pos[id]) return null; pos[id].d = depth(no, pos[id].y); }
    return { pos, segs };
  }
  root.MMP13F = fz({ FIELDS, has, get, depth, zoomAt, layout });
})(typeof window !== 'undefined' ? window : globalThis);
