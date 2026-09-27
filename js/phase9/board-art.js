// =========================================================
// Phase 9：育成ボードの絵（window.MMP9ART）
//  Chapterデータ（js/phase9/chapters.js）から、地形・道・橋・マスの台座・会場・スタート門をSVGで描く。
//  参考画像は「世界観・構成」の参考にのみ使い、画像そのものは使わない（すべてベクター描画）。
//  ゲーム進行の状態は持たない純粋な描画関数（同じChapterは毎回同じ絵になる：固定シード）。
// =========================================================
(function (root) {
  'use strict';
  const rng = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const r1 = (n) => Math.round(n * 10) / 10;
  function dSeg(px, py, ax, ay, bx, by) { const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy; let t = L ? ((px - ax) * dx + (py - ay) * dy) / L : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(px - (ax + t * dx), py - (ay + t * dy)); }

  // ---------------- マスの種類：見た目と説明（UIでも共通で使う） ----------------
  const SQ = Object.freeze({
    life: { label: 'ライフ', c1: '#ff8fab', c2: '#c21d4a', desc: '止まるとライフが上がる' },
    power: { label: 'ちから', c1: '#ffa26b', c2: '#c2410c', desc: '止まるとちからが上がる' },
    wisdom: { label: 'かしこさ', c1: '#78d894', c2: '#1e7a3c', desc: '止まるとかしこさが上がる' },
    hit: { label: '命中', c1: '#ffd966', c2: '#b7791f', desc: '止まると命中が上がる' },
    evasion: { label: '回避', c1: '#86d8ff', c2: '#1f78c8', desc: '止まると回避が上がる' },
    toughness: { label: '丈夫さ', c1: '#9db0ff', c2: '#2f47a8', desc: '止まると丈夫さが上がる' },
    event: { label: 'イベント', c1: '#cfa6ff', c2: '#6a2fc0', desc: '何かが起きる（良いことも悪いことも）' },
    rare: { label: 'レア', c1: '#fff3b0', c2: '#d19b14', desc: 'めずらしい出来事が起きる' },
    treasure: { label: '宝箱', c1: '#ffe0a0', c2: '#9a5a16', desc: '宝箱を開けてお金を手に入れる' },
    battle: { label: '練習試合', c1: '#ff9a8a', c2: '#a51d1d', desc: '練習試合に挑戦できる（報酬なし）' },
    ticket: { label: '修行チケット', c1: '#ffeb99', c2: '#c28a12', desc: '修行チケットを1枚手に入れる' },
    normal: { label: '何も起きない', c1: null, c2: null, desc: '何も起きない' },
    start: { label: 'スタート', c1: null, c2: null, desc: 'スタート地点' },
    tournament: { label: '公式大会', c1: null, c2: null, desc: '公式大会の会場（ゴール）' },
  });
  const GLYPH = {
    life: '<path d="M12 21C12 21 3 15.2 3 9.4A4.6 4.6 0 0 1 12 7.3a4.6 4.6 0 0 1 9 2.1C21 15.2 12 21 12 21z"/>',
    power: '<rect x="5" y="9.5" width="14" height="10" rx="3.6"/><rect x="5.4" y="5.2" width="3.3" height="6.5" rx="1.65"/><rect x="9" y="4.2" width="3.3" height="7.2" rx="1.65"/><rect x="12.6" y="4.5" width="3.3" height="7" rx="1.65"/><rect x="16.1" y="5.8" width="3" height="5.8" rx="1.5"/><path d="M5.2 13.4h5.2a2 2 0 0 1 0 4H6.2" fill="none" stroke="rgba(0,0,0,.28)" stroke-width="1.3"/>',
    wisdom: '<path d="M2.5 6.2c3.2-1.4 6.4-1.2 9 .9v12.6c-2.6-1.9-5.8-2.1-9-.8z"/><path d="M21.5 6.2c-3.2-1.4-6.4-1.2-9 .9v12.6c2.6-1.9 5.8-2.1 9-.8z"/>',
    hit: '<circle cx="12" cy="12" r="8.6" fill="none" stroke="#fff" stroke-width="2.5"/><circle cx="12" cy="12" r="4.6" fill="none" stroke="#fff" stroke-width="2.5"/><circle cx="12" cy="12" r="1.9"/>',
    evasion: '<path d="M19.8 3.3C11 4.3 6.1 9.4 5.1 18.4l2-1c.8-3.5 3.3-6.4 7.2-8.4-2.7 2.5-4.7 5.6-5.8 8.9 6.4-1.1 10.3-6.2 11.3-14.6z"/><path d="M3.8 20.6l3.1-3.1" stroke="#fff" stroke-width="1.9" stroke-linecap="round"/>',
    toughness: '<path d="M12 2.5l7.6 2.8v6.1c0 4.9-3.2 8.7-7.6 10.4-4.4-1.7-7.6-5.5-7.6-10.4V5.3z"/><path d="M12 5.6v13.3c3-1.5 5.1-4.3 5.1-7.7V7.4z" fill="rgba(0,0,0,.18)"/>',
    event: '<path d="M8.6 8.9a3.5 3.5 0 1 1 5.4 2.9c-1.1.8-1.8 1.4-1.8 2.9v.7" fill="none" stroke="#fff" stroke-width="2.7" stroke-linecap="round"/><circle cx="12.2" cy="19" r="1.7"/>',
    rare: '<path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z"/>',
    treasure: '<path d="M3.5 10.5h17v8a1.6 1.6 0 0 1-1.6 1.6H5.1a1.6 1.6 0 0 1-1.6-1.6z" fill="#ffd27a"/><path d="M4 10C4 6.4 7.6 4.6 12 4.6S20 6.4 20 10z" fill="#ffe7ae"/><path d="M3.5 13h17" stroke="#6b3b0e" stroke-width="1.3"/><rect x="10.3" y="9.2" width="3.4" height="4.8" rx=".8" fill="#6b3b0e"/><path d="M7 5.6v14.5M17 5.6v14.5" stroke="#8a5216" stroke-width="1.2"/>',
    battle: '<path d="M4.5 4.5l10 10M19.5 4.5l-10 10" stroke="#fff" stroke-width="2.7" stroke-linecap="round"/><path d="M6.4 15.1l2.5 2.5M17.6 15.1l-2.5 2.5" stroke="#fff" stroke-width="2.9" stroke-linecap="round"/><circle cx="5.8" cy="18.6" r="2"/><circle cx="18.2" cy="18.6" r="2"/>',
    ticket: '<path d="M2.8 7.2h18.4v3.2a1.9 1.9 0 0 0 0 3.4v3.2H2.8v-3.2a1.9 1.9 0 0 0 0-3.4z"/><path d="M12 8.9l1 2 2.2.3-1.6 1.5.4 2.2-2-1-2 1 .4-2.2-1.6-1.5 2.2-.3z" fill="#b8780c"/><path d="M8 7.4v9.6" stroke="#b8780c" stroke-width="1" stroke-dasharray="1.4 1.2"/>',
  };
  /** マスのアイコン（HTML中で使う単体SVG） */
  function iconSvg(type, size = 22) {
    const s = SQ[type] || SQ.normal;
    if (!GLYPH[type]) return `<svg class="p9ic" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="#b9ae98" stroke="#7b705c" stroke-width="2"/><circle cx="12" cy="12" r="2.4" fill="#7b705c"/></svg>`;
    return `<svg class="p9ic" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><defs><radialGradient id="ic-${type}-${size}" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="${s.c1}"/><stop offset="1" stop-color="${s.c2}"/></radialGradient></defs><circle cx="12" cy="12" r="11.5" fill="url(#ic-${type}-${size})" stroke="rgba(255,255,255,.7)" stroke-width="1"/><g transform="translate(4.2 4.2) scale(.65)" fill="#fff">${GLYPH[type]}</g></svg>`;
  }
  /** HUD用：修行チケットのアイコン（金色の券） */
  function ticketIcon(size = 26) {
    return `<svg class="p9tk" viewBox="0 0 32 22" width="${size}" height="${Math.round(size * 22 / 32)}" aria-hidden="true"><defs><linearGradient id="tkg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe9a3"/><stop offset=".55" stop-color="#f2c14e"/><stop offset="1" stop-color="#b9821c"/></linearGradient></defs><path d="M2 3h28v5.2a2.8 2.8 0 0 0 0 5.6V19H2v-5.2a2.8 2.8 0 0 0 0-5.6z" fill="url(#tkg)" stroke="#7a4d0c" stroke-width="1.4"/><path d="M11 4.5v13" stroke="#8a5a12" stroke-width="1.1" stroke-dasharray="1.6 1.4"/><path d="M20 6.6l1.4 2.9 3.2.4-2.3 2.2.6 3.1-2.9-1.5-2.9 1.5.6-3.1-2.3-2.2 3.2-.4z" fill="#fff6d6" stroke="#8a5a12" stroke-width=".8"/></svg>`;
  }

  // ---------------- テーマ（地形・道の色） ----------------
  const THEME = {
    meadow: { sky: ['#9fd6ff', '#e4f5ff'], ground: ['#a6da78', '#7fc25a', '#6aae48'], shoulder: '#5f9e3e', roadEdge: '#9a7a4a', road: '#e2c992', dots: '#b99a62', stream: ['#3f8fd6', '#8fd0ff'], ped: ['#e8e0cf', '#aaa08b'] },
    coast: { sky: ['#8fd0ff', '#dff3ff'], ground: ['#b7d98a', '#9cc870', '#86b85c'], shoulder: '#c9b27d', roadEdge: '#8d7654', road: '#e8d6a6', dots: '#bda57a', stream: ['#1f8fc9', '#7fd7f5'], ped: ['#ece5d6', '#a79d88'] },
    sky: { sky: ['#6fb8f2', '#d9f0ff'], ground: null, shoulder: '#7fbf55', roadEdge: '#8a826f', road: '#ddd6c3', dots: '#b3aa94', stream: null, ped: ['#f0ece2', '#aca38f'] },
    volcano: { sky: ['#3b1d24', '#a8452a'], ground: ['#4a342c', '#3a2822', '#2c1e1a'], shoulder: '#2a1c18', roadEdge: '#2c1f1a', road: '#8c7a6b', dots: '#6b5a4d', stream: ['#ff5a14', '#ffd166'], ped: ['#b8aa9a', '#6f6255'] },
  };

  // ---------------- 小物 ----------------
  const tree = (x, y, s, c1 = '#3f8f3a', c2 = '#5fb24f') => `<g transform="translate(${r1(x)} ${r1(y)}) scale(${s})"><ellipse cx="0" cy="12" rx="11" ry="3.5" fill="rgba(0,0,0,.18)"/><rect x="-1.8" y="2" width="3.6" height="10" rx="1" fill="#6b4a2b"/><circle cx="0" cy="-3" r="10" fill="${c1}"/><circle cx="-4" cy="-6" r="6.5" fill="${c2}"/><circle cx="4" cy="-1" r="6" fill="${c1}"/><circle cx="-3" cy="-9" r="2.6" fill="#fff" opacity=".18"/></g>`;
  const pine = (x, y, s, c = '#2f6f3a') => `<g transform="translate(${r1(x)} ${r1(y)}) scale(${s})"><ellipse cx="0" cy="13" rx="8" ry="2.6" fill="rgba(0,0,0,.18)"/><rect x="-1.4" y="6" width="2.8" height="7" fill="#5a3d24"/><path d="M0-16L9 0H-9z" fill="${c}"/><path d="M0-9L11 7H-11z" fill="${c}"/><path d="M0-16L3-10-3-10z" fill="#fff" opacity=".15"/></g>`;
  const bush = (x, y, s, c = '#4e9a3c') => `<g transform="translate(${r1(x)} ${r1(y)}) scale(${s})"><ellipse cx="0" cy="4" rx="9" ry="3" fill="rgba(0,0,0,.15)"/><circle cx="-4" cy="0" r="5" fill="${c}"/><circle cx="3" cy="-1" r="6" fill="${c}"/><circle cx="1" cy="-4" r="3" fill="#fff" opacity=".12"/></g>`;
  const flowers = (x, y, rnd) => { let o = ''; const cs = ['#ffd1e8', '#fff3a0', '#ffffff', '#ffb3c6', '#c9b6ff']; for (let i = 0; i < 5; i++) o += `<circle cx="${r1(x + (rnd() - .5) * 18)}" cy="${r1(y + (rnd() - .5) * 10)}" r="1.6" fill="${cs[Math.floor(rnd() * cs.length)]}"/>`; return o; };
  const house = (x, y, s, roof = '#c2523a') => `<g transform="translate(${r1(x)} ${r1(y)}) scale(${s})"><ellipse cx="0" cy="14" rx="20" ry="4" fill="rgba(0,0,0,.2)"/><rect x="-15" y="-4" width="30" height="18" fill="#f3e3c4" stroke="#6b4a2b" stroke-width="1.2"/><path d="M-19-3L0-18 19-3z" fill="${roof}" stroke="#6b2a1a" stroke-width="1.2"/><rect x="-4" y="4" width="8" height="10" fill="#7a4f28"/><rect x="-12" y="1" width="6" height="5" fill="#9fd3ff" stroke="#6b4a2b"/><rect x="6" y="1" width="6" height="5" fill="#9fd3ff" stroke="#6b4a2b"/><rect x="8" y="-17" width="4" height="8" fill="#8a6a4a"/></g>`;
  const windmill = (x, y, s) => `<g transform="translate(${r1(x)} ${r1(y)}) scale(${s})"><ellipse cx="0" cy="22" rx="16" ry="4" fill="rgba(0,0,0,.2)"/><path d="M-10 22L-6-14H6L10 22z" fill="#efe1c3" stroke="#6b4a2b" stroke-width="1.2"/><path d="M-8-13L0-24 8-13z" fill="#b5503a" stroke="#6b2a1a"/><rect x="-3" y="10" width="6" height="12" fill="#7a4f28"/><g class="p9mill" transform="translate(0 -12)"><path d="M0 0L-3-26h6zM0 0l26-3v6zM0 0l3 26h-6zM0 0l-26 3v-6z" fill="#f7f0de" stroke="#6b4a2b" stroke-width="1"/><circle r="3" fill="#6b4a2b"/></g></g>`;
  const sheep = (x, y) => `<g transform="translate(${r1(x)} ${r1(y)})"><ellipse cx="0" cy="5" rx="7" ry="2" fill="rgba(0,0,0,.15)"/><ellipse cx="0" cy="0" rx="7" ry="5" fill="#fff" stroke="#d6d6d6"/><circle cx="6" cy="-1" r="2.6" fill="#3a3a3a"/></g>`;
  const rock = (x, y, s, c = '#8d8a82', c2 = '#b3afa6') => `<g transform="translate(${r1(x)} ${r1(y)}) scale(${s})"><ellipse cx="0" cy="6" rx="12" ry="3.5" fill="rgba(0,0,0,.2)"/><path d="M-11 6L-8-4-1-9 7-6 11 6z" fill="${c}"/><path d="M-8-4L-1-9 3-2-3 1z" fill="${c2}"/></g>`;
  const palm = (x, y, s) => `<g transform="translate(${r1(x)} ${r1(y)}) scale(${s})"><ellipse cx="0" cy="14" rx="9" ry="3" fill="rgba(0,0,0,.18)"/><path d="M-1 14C0 4 2-4 5-12" stroke="#8a5a2b" stroke-width="3" fill="none"/><path d="M5-12c-6-4-13-2-16 3 5-3 10-3 16-3zM5-12c6-5 13-4 16 1-5-2-10-2-16-1zM5-12c-3-6-9-9-15-7 5 0 10 3 15 7zM5-12c4-6 10-8 15-5-5 0-10 2-15 5z" fill="#3f9a4a"/></g>`;
  const cloud = (x, y, s, o = .95) => `<g transform="translate(${r1(x)} ${r1(y)}) scale(${s})" opacity="${o}"><ellipse cx="0" cy="0" rx="26" ry="10" fill="#fff"/><circle cx="-10" cy="-6" r="10" fill="#fff"/><circle cx="6" cy="-9" r="12" fill="#fff"/><circle cx="18" cy="-3" r="8" fill="#fff"/><ellipse cx="0" cy="4" rx="24" ry="5" fill="#e3eef8"/></g>`;
  const tower = (x, y, s, flag = '#b3261e', stone = '#8a8173') => `<g transform="translate(${r1(x)} ${r1(y)}) scale(${s})"><ellipse cx="0" cy="18" rx="12" ry="3.5" fill="rgba(0,0,0,.25)"/><rect x="-8" y="-14" width="16" height="32" fill="${stone}" stroke="#3e372f" stroke-width="1.1"/><path d="M-10-14h20v-6h-4v3h-4v-3h-4v3h-4v-3h-4z" fill="${stone}" stroke="#3e372f" stroke-width="1.1"/><rect x="-2.5" y="-6" width="5" height="8" rx="2.5" fill="#2a2420"/><path d="M0-20v-14" stroke="#4a3a2a" stroke-width="1.2"/><path d="M0-34h11l-3 4 3 4H0z" fill="${flag}"/></g>`;
  const banner = (x, y, s, c = '#2c4fa8', e = '#ffd54a') => `<g transform="translate(${r1(x)} ${r1(y)}) scale(${s})"><path d="M0 16V-22" stroke="#5a3d24" stroke-width="2"/><path d="M1-20h12v20l-6-4-6 4z" fill="${c}" stroke="${e}" stroke-width=".8"/><path d="M7-15l1.5 3 3 .4-2.2 2 .6 3-2.9-1.5-2.9 1.5.6-3-2.2-2 3-.4z" fill="${e}"/></g>`;

  // ---------------- 背景（テーマごと） ----------------
  function background(ch, T, rnd, pf) {
    const W = ch.W, H = ch.H; let o = '';
    if (ch.theme === 'sky') {
      o += `<rect width="${W}" height="${H}" fill="url(#${pf}sky)"/>`;
      for (let i = 0; i < 26; i++) o += cloud(rnd() * W, 120 + rnd() * (H - 150), .8 + rnd() * 1.6, .55 + rnd() * .35);
      const far = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})" opacity=".75"><path d="M-40 0h80l-12 16-20 28-16-18-14 10z" fill="#9aa7b8"/><ellipse cx="0" cy="0" rx="42" ry="9" fill="#9cc98a"/><rect x="-10" y="-30" width="8" height="30" fill="#c9c3b6"/><rect x="2" y="-40" width="10" height="40" fill="#d6d0c3"/><path d="M-12-30l4-10 4 10zM0-40l7-12 7 12z" fill="#7d8fb8"/></g>`;
      o += far(70, 150, .8) + far(330, 120, .6) + far(40, 520, .5) + far(360, 820, .55) + far(30, 1100, .45);
      o += `<g transform="translate(300 250) scale(.9)" opacity=".85"><ellipse cx="0" cy="0" rx="34" ry="12" fill="#efe6cf" stroke="#8a6a44"/><path d="M-20 12h40l-6 10h-28z" fill="#8a5a2b"/><path d="M-30 0h60M-20-9v18M0-12v24M20-9v18" stroke="#b39a74" stroke-width="1"/></g>`;
      return o;
    }
    o += `<rect width="${W}" height="${H}" fill="url(#${pf}ground)"/>`;
    o += `<rect width="${W}" height="150" fill="url(#${pf}sky)"/>`;
    if (ch.theme === 'meadow') {
      o += `<path d="M0 150L40 95 80 128 130 70 180 118 230 60 280 112 330 78 400 126V170H0z" fill="#9fb9d8"/><path d="M130 70l12 16-20-2zM230 60l14 18-24-3zM330 78l10 14-18-2z" fill="#fff"/><path d="M0 165C60 138 120 150 200 140S330 150 400 138V190H0z" fill="#8cc466"/>`;
      o += `<path d="M18 170c4 30 2 60 6 90" stroke="#bfe8ff" stroke-width="6" opacity=".9"/><path d="M372 180c-3 26-1 48-4 70" stroke="#bfe8ff" stroke-width="5" opacity=".9"/>`;
      for (let i = 0; i < 60; i++) o += `<ellipse cx="${r1(rnd() * W)}" cy="${r1(190 + rnd() * (H - 200))}" rx="${r1(14 + rnd() * 26)}" ry="${r1(5 + rnd() * 8)}" fill="#b9e38b" opacity=".35"/>`;
    } else if (ch.theme === 'coast') {
      o += `<path d="M0 150L50 120 90 134 140 104 190 126 250 100 310 124 360 108 400 120V165H0z" fill="#a8bcd6"/>`;
      o += `<g opacity=".8">${[20, 42, 60, 78, 96].map((x, i) => `<rect x="${x}" y="${128 - i % 3 * 6}" width="12" height="${22 + i % 3 * 6}" fill="#f1e6d6"/><path d="M${x - 2} ${128 - i % 3 * 6}l8-8 8 8z" fill="#c2523a"/>`).join('')}</g>`;
    } else if (ch.theme === 'volcano') {
      o += `<path d="M0 160L70 60 110 40 150 70 220 150z" fill="#2b1a1a"/><path d="M92 50l18-10 14 12-8 4z" fill="#ff7a2a"/><path d="M104 46c-6 30-14 60-30 100" stroke="#ff5a14" stroke-width="5" fill="none" opacity=".9"/><path d="M104 46c-6 30-14 60-30 100" stroke="#ffd166" stroke-width="2" fill="none"/>`;
      o += `<g opacity=".55">${[0, 1, 2, 3].map((i) => `<ellipse cx="${110 + i * 16}" cy="${30 - i * 12}" rx="${18 + i * 8}" ry="${10 + i * 4}" fill="#6b5b5b"/>`).join('')}</g>`;
      o += `<path d="M200 160L260 90 300 110 340 70 400 120V175H200z" fill="#3a2324"/>`;
      for (let i = 0; i < 40; i++) { const x = rnd() * W, y = 200 + rnd() * (H - 220); o += `<path d="M${r1(x)} ${r1(y)}l${r1(8 + rnd() * 14)} ${r1(-3 + rnd() * 6)}l${r1(6 + rnd() * 10)} ${r1(-4 + rnd() * 8)}" stroke="#ff6a1a" stroke-width="1.4" fill="none" opacity=".55"/>`; }
    }
    return o;
  }
  /** 海（Chapter 2）：道の左側に海岸線を作る（道にはかからない） */
  function sea(ch, nodes, pf) {
    const H = ch.H, pts = [];
    for (let y = 140; y <= H; y += 40) {
      const near = Object.values(nodes).filter((n) => Math.abs(n.y - y) < 70).map((n) => n.x);
      const x = Math.max(0, Math.min(150, (near.length ? Math.min(...near) : 160) - 40));
      pts.push([x, y]);
    }
    const line = pts.map(([x, y]) => `${r1(x)} ${y}`).join(' L');
    return `<path d="M0 140 L${line} L0 ${H}z" fill="url(#${pf}sea)"/><path d="M${line}" stroke="#f3e2b0" stroke-width="12" fill="none" stroke-linejoin="round" opacity=".95"/><path d="M${line}" stroke="#ffffff" stroke-width="2.5" fill="none" stroke-dasharray="6 7" opacity=".8" transform="translate(-8 0)"/>`;
  }

  // ---------------- 描画本体 ----------------
  /** @returns {string} SVG文字列（<svg>…</svg>）。opt.id を付けると要素idに使う */
  function render(ch, opt = {}) {
    const pf = `p9c${ch.no}`, t = ch.track, T = THEME[ch.theme] || THEME.meadow, W = ch.W, H = ch.H, rnd = rng(1000 + ch.no * 7);
    const N = t.nodes, edges = [];
    for (const a of Object.keys(t.conn)) for (const b of t.conn[a]) edges.push([a, b]);
    const isBridge = (a, b) => t.bridges.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
    const P = (id) => [N[id].x, N[id].y];
    // 道・マス・会場を避けて小物を置く
    const blocked = [];
    const free = (x, y, r, extra = []) => {
      if (x < 8 || x > W - 8 || y < 170 || y > H - 10) return false;
      for (const [a, b] of edges) { const [ax, ay] = P(a), [bx, by] = P(b); if (dSeg(x, y, ax, ay, bx, by) < r + 20) return false; }
      for (const q of blocked) if (Math.hypot(q[0] - x, q[1] - y) < r + q[2]) return false;
      for (const f of extra) if (!f(x, y, r)) return false;
      return true;
    };
    const G = N[t.goal], St = N[t.start];
    blocked.push([G.x, G.y - 30, 120], [St.x, St.y, 60]);
    // 橋の下の流れ（川・海の入り江・溶岩）：橋に垂直に、他の道にかからない長さだけ
    const streams = [];
    if (T.stream) for (const [a, b] of t.bridges) {
      const [ax, ay] = P(a), [bx, by] = P(b), mx = (ax + bx) / 2, my = (ay + by) / 2, L = Math.hypot(bx - ax, by - ay) || 1;
      const nx = -(by - ay) / L, ny = (bx - ax) / L;
      const reach = (sg) => { let d = 14; for (; d < 118; d += 4) { const x = mx + nx * d * sg, y = my + ny * d * sg; if (x < -10 || x > W + 10 || y < 160) break; let hit = false; for (const [p, q] of edges) { if ((p === a && q === b) || (p === b && q === a)) continue; const [px, py] = P(p), [qx, qy] = P(q); if (dSeg(x, y, px, py, qx, qy) < 24) { hit = true; break; } } if (hit) break; } return d; };
      const d1 = reach(1), d2 = reach(-1);
      streams.push([mx + nx * d1, my + ny * d1, mx - nx * d2, my - ny * d2]);
    }
    const inStream = (x, y, r) => streams.every(([x1, y1, x2, y2]) => dSeg(x, y, x1, y1, x2, y2) > r + 18);
    let o = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" class="p9map" ${opt.id ? `id="${opt.id}"` : ''} role="img" aria-label="${opt.label || ''}"><defs>
<linearGradient id="${pf}sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${T.sky[0]}"/><stop offset="1" stop-color="${T.sky[1]}"/></linearGradient>
${T.ground ? `<linearGradient id="${pf}ground" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${T.ground[0]}"/><stop offset=".5" stop-color="${T.ground[1]}"/><stop offset="1" stop-color="${T.ground[2]}"/></linearGradient>` : ''}
<linearGradient id="${pf}sea" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0f6aa8"/><stop offset=".7" stop-color="#2aa4d8"/><stop offset="1" stop-color="#7fdcf2"/></linearGradient>
<linearGradient id="${pf}pedTop" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${T.ped[0]}"/><stop offset="1" stop-color="${T.ped[1]}"/></linearGradient>
${Object.entries(SQ).filter(([, s]) => s.c1).map(([k, s]) => `<radialGradient id="${pf}o-${k}" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="${s.c1}"/><stop offset="1" stop-color="${s.c2}"/></radialGradient>`).join('')}
${Object.entries(GLYPH).map(([k, g]) => `<symbol id="${pf}g-${k}" viewBox="0 0 24 24">${g}</symbol>`).join('')}
</defs>`;
    o += background(ch, T, rnd, pf);
    if (ch.theme === 'coast') o += sea(ch, N, pf);
    // 浮島（Chapter 3）：道の下に島の帯。橋の区間は島を作らない（雲海が見える）
    if (ch.theme === 'sky') {
      const solid = edges.filter(([a, b]) => !isBridge(a, b));
      const band = (w, c, dy) => solid.map(([a, b]) => `<line x1="${N[a].x}" y1="${N[a].y + dy}" x2="${N[b].x}" y2="${N[b].y + dy}" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>`).join('');
      o += band(66, '#6f6355', 22) + band(62, '#8b7d6b', 12) + band(60, '#7fbf55', 0) + band(44, '#95d06a', -2);
      for (const id of Object.keys(N)) o += `<ellipse cx="${N[id].x}" cy="${N[id].y + 2}" rx="34" ry="24" fill="#7fbf55"/>`;
    }
    // 流れ：ゆるく曲がる水路（橋の下を通る）＋両端のたまり（泉・池・溶岩だまり）
    for (const [x1, y1, x2, y2] of streams) {
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, L = Math.hypot(x2 - x1, y2 - y1) || 1, ox = -(y2 - y1) / L * 10, oy = (x2 - x1) / L * 10;
      const d = `M${r1(x1)} ${r1(y1)} Q${r1((x1 + mx) / 2 + ox)} ${r1((y1 + my) / 2 + oy)} ${r1(mx)} ${r1(my)} T${r1(x2)} ${r1(y2)}`;
      const lava = ch.theme === 'volcano', bank = lava ? '#1c1210' : ch.theme === 'coast' ? '#e9d7a4' : '#5a8f3a';
      o += `<path d="${d}" stroke="${bank}" stroke-width="36" stroke-linecap="round" fill="none" opacity="${lava ? .8 : .45}"/>`;
      for (const [x, y] of [[x1, y1], [x2, y2]]) o += `<ellipse cx="${r1(x)}" cy="${r1(y)}" rx="21" ry="13" fill="${T.stream[0]}" stroke="${bank}" stroke-width="3" opacity=".95"/>`;
      o += `<path d="${d}" stroke="${T.stream[0]}" stroke-width="26" stroke-linecap="round" fill="none"/>`;
      o += `<path d="${d}" stroke="${T.stream[1]}" stroke-width="9" stroke-linecap="round" fill="none" opacity=".65"${lava ? ' class="p9lava"' : ''} stroke-dasharray="${lava ? '14 6' : '10 8'}"/>`;
      if (!lava) for (const [x, y] of [[x1, y1], [x2, y2]]) o += rock(x + 14, y - 6, .55, '#8d8a82', '#c9c5bb');
    }
    // 小物（テーマごと）
    const place = (n, r, fn, extra = []) => { let k = 0; for (let tries = 0; k < n && tries < n * 60; tries++) { const x = rnd() * W, y = 170 + rnd() * (H - 180); if (free(x, y, r, [inStream, ...extra])) { blocked.push([x, y, r]); o += fn(x, y); k++; } } };
    const notSea = (x, y) => { if (ch.theme !== 'coast') return true; const near = Object.values(N).filter((n) => Math.abs(n.y - y) < 70).map((n) => n.x); return x > (near.length ? Math.min(...near) : 160) - 20; };
    if (ch.theme === 'meadow') {
      const wm = N.c3 || N.c2; if (wm) { const x = Math.max(34, wm.x - 2), y = wm.y + 70; if (free(x, y, 26)) { blocked.push([x, y, 30]); o += windmill(x, y, 1.1); } }
      place(3, 18, (x, y) => house(x, y, .85)); place(10, 8, (x, y) => sheep(x, y)); place(55, 11, (x, y) => (rnd() < .6 ? tree(x, y, .9 + rnd() * .5) : pine(x, y, .8 + rnd() * .5)));
      place(40, 7, (x, y) => bush(x, y, .9)); place(60, 5, (x, y) => flowers(x, y, rnd));
    } else if (ch.theme === 'coast') {
      place(4, 18, (x, y) => house(x, y, .85, rnd() < .5 ? '#2f6fb3' : '#c2523a'), [notSea]); place(18, 10, (x, y) => palm(x, y, 1), [notSea]);
      place(28, 9, (x, y) => rock(x, y, .9 + rnd() * .5), [notSea]); place(30, 7, (x, y) => bush(x, y, .9, '#5a9a44'), [notSea]);
      for (let i = 0; i < 12; i++) { const y = 200 + rnd() * (H - 260); o += `<path d="M${r1(10 + rnd() * 50)} ${r1(y)}q4-4 8 0q4-4 8 0" stroke="#fff" stroke-width="1.6" fill="none"/>`; }
      o += `<g transform="translate(34 ${H - 260}) scale(1.1)"><path d="M-22 10h44l-8 12h-28z" fill="#7a4f28"/><path d="M0 10V-34" stroke="#5a3a1c" stroke-width="2.4"/><path d="M2-32c14 6 14 26 0 36z" fill="#f4eee0"/><path d="M-2-28c-12 6-12 22 0 30z" fill="#efe6d2"/></g>`;
      const lh = N.h3 || N.h2; if (lh) { const x = Math.max(22, lh.x - 34), y = lh.y - 6; o += `<g transform="translate(${x} ${y})"><ellipse cx="0" cy="26" rx="16" ry="5" fill="rgba(0,0,0,.25)"/><path d="M-8 26L-5-18h10L8 26z" fill="#f7f3ea" stroke="#6b5a48"/><path d="M-7 4h14M-6-8h12" stroke="#c2523a" stroke-width="4"/><rect x="-6" y="-28" width="12" height="10" fill="#ffe27a" stroke="#6b5a48"/><path d="M-8-28L0-36 8-28z" fill="#c2523a"/><path d="M6-23l40-10v18z" fill="#fff6c2" opacity=".35"/></g>`; }
    } else if (ch.theme === 'sky') {
      place(26, 9, (x, y) => (rnd() < .5 ? tree(x, y, .8 + rnd() * .3, '#3e8a3d', '#62b04e') : bush(x, y, .9)), [(x, y) => Object.values(N).some((n) => Math.hypot(n.x - x, n.y - y) < 46)]);
      place(8, 12, (x, y) => tower(x, y, .7, '#2c4fa8', '#cfc8b8'), [(x, y) => Object.values(N).some((n) => Math.hypot(n.x - x, n.y - y) < 50)]);
      const ad = N.c2 || N.c1; if (ad) o += `<g transform="translate(${Math.max(40, ad.x - 10)} ${ad.y - 70})" class="p9float"><ellipse cx="0" cy="0" rx="36" ry="13" fill="#f2ead2" stroke="#8a6a44" stroke-width="1.2"/><path d="M-36 0h72M-24-11v22M0-13v26M24-11v22" stroke="#bfa57c" stroke-width="1"/><path d="M-16 13h32l-5 10h-22z" fill="#8a5a2b" stroke="#5a3a1c"/><path d="M36 0l10-7v14z" fill="#c9b48a"/></g>`;
    } else if (ch.theme === 'volcano') {
      place(34, 10, (x, y) => rock(x, y, .9 + rnd() * .6, '#2b211d', '#4a3b33')); place(7, 12, (x, y) => tower(x, y, .8, '#b3261e', '#5b514a'));
      place(12, 7, (x, y) => `<g transform="translate(${r1(x)} ${r1(y)})"><path d="M-5 6h10l-2-8h-6z" fill="#4a3b33"/><path d="M0-2c-5-6 0-10 0-14 3 4 6 8 0 14z" fill="#ff7a1a" class="p9fire"/><path d="M0-3c-2-3 0-6 0-8 2 3 3 5 0 8z" fill="#ffd166"/></g>`);
      const db = N.h2 || N.h1; if (db) o += `<g transform="translate(${Math.max(40, db.x - 4)} ${db.y + 50})" opacity=".85"><path d="M-30 0c10-18 30-22 50-8" stroke="#e8dcc6" stroke-width="3" fill="none"/>${[0, 1, 2, 3, 4].map((i) => `<path d="M${-22 + i * 10} ${-6 - (i === 2 ? 4 : 0)}c-2-10 2-18 8-22" stroke="#e8dcc6" stroke-width="2.2" fill="none"/>`).join('')}<circle cx="24" cy="-6" r="6" fill="#e8dcc6"/></g>`;
    }
    // 道（肩→縁→路面→小石）
    const road = (w, c, extra = '') => edges.map(([a, b]) => `<line x1="${N[a].x}" y1="${N[a].y}" x2="${N[b].x}" y2="${N[b].y}" stroke="${c}" stroke-width="${w}" stroke-linecap="round"${extra}/>`).join('');
    if (ch.theme !== 'sky') o += `<g opacity=".45">${road(34, T.shoulder)}</g>`;
    o += road(19, T.roadEdge) + road(14, T.road) + `<g opacity=".4">${road(14, T.dots, ' stroke-dasharray="2 9"')}</g>`;
    // 橋
    for (const [a, b] of t.bridges) {
      const [ax, ay] = P(a), [bx, by] = P(b), L = Math.hypot(bx - ax, by - ay) || 1, nx = -(by - ay) / L * 9, ny = (bx - ax) / L * 9;
      const k = 0.26, sx = ax + (bx - ax) * k, sy = ay + (by - ay) * k, ex = bx - (bx - ax) * k, ey = by - (by - ay) * k;
      o += `<line x1="${r1(sx)}" y1="${r1(sy)}" x2="${r1(ex)}" y2="${r1(ey)}" stroke="#5a3a1c" stroke-width="19" stroke-linecap="butt"/><line x1="${r1(sx)}" y1="${r1(sy)}" x2="${r1(ex)}" y2="${r1(ey)}" stroke="${ch.theme === 'volcano' || ch.theme === 'sky' ? '#9a8f80' : '#b8844c'}" stroke-width="15" stroke-dasharray="3.4 1.6"/>`;
      for (const sg of [1, -1]) o += `<line x1="${r1(sx + nx * sg)}" y1="${r1(sy + ny * sg)}" x2="${r1(ex + nx * sg)}" y2="${r1(ey + ny * sg)}" stroke="#3e2a16" stroke-width="2"/><circle cx="${r1(sx + nx * sg)}" cy="${r1(sy + ny * sg)}" r="2.2" fill="#3e2a16"/><circle cx="${r1(ex + nx * sg)}" cy="${r1(ey + ny * sg)}" r="2.2" fill="#3e2a16"/>`;
    }
    // 会場（ゴール）
    const gx = G.x, gy = G.y, fl = ch.theme === 'volcano' ? '#b3261e' : '#c0392b';
    o += `<g class="p9arena" transform="translate(${gx} ${gy - 34})">
<ellipse cx="0" cy="38" rx="118" ry="22" fill="rgba(0,0,0,.25)"/>
<path d="M-108 30V-8Q0-46 108-8V30z" fill="${ch.theme === 'volcano' ? '#5b4c44' : '#cdbf9f'}" stroke="#3e3226" stroke-width="1.6"/>
${[-84, -56, -28, 0, 28, 56, 84].map((x) => `<path d="M${x - 9} 26v-14a9 9 0 0 1 18 0v14z" fill="${ch.theme === 'volcano' ? '#2a1d18' : '#6b5a45'}"/>`).join('')}
<path d="M-112 30h224v10h-224z" fill="${ch.theme === 'volcano' ? '#40342e' : '#a8977a'}" stroke="#3e3226"/>
${[-96, -60, -24, 24, 60, 96].map((x, i) => `<path d="M${x} ${-8 - Math.round(Math.cos(x / 70) * 22)}v-20" stroke="#4a3a2a" stroke-width="1.6"/><path d="M${x} ${-28 - Math.round(Math.cos(x / 70) * 22)}h13l-4 5 4 5h-13z" fill="${i % 2 ? '#2c4fa8' : fl}"/>`).join('')}
<path d="M-20 40v-26a20 20 0 0 1 40 0v26z" fill="#2a1d18" stroke="#c9a24d" stroke-width="2"/>
<g transform="translate(0 -28)"><rect x="-44" y="-12" width="88" height="24" rx="4" fill="#8e1b17" stroke="#f0c75e" stroke-width="2"/><text x="0" y="6" text-anchor="middle" font-size="14" font-weight="900" fill="#fff4d0" font-family="'M PLUS Rounded 1c','Hiragino Maru Gothic ProN',sans-serif">${ch.goalLabel}</text>
<g transform="translate(0 -24)"><path d="M-10-8l20 16M10-8l-20 16" stroke="#e8e2d0" stroke-width="3.2" stroke-linecap="round"/><path d="M-10 4l4 4M10 4l-4 4" stroke="#c9a24d" stroke-width="3.4" stroke-linecap="round"/></g></g></g>`;
    // スタート門
    const bc = ch.theme === 'volcano' ? '#a8231c' : '#2c4fa8';
    o += `<g class="p9gate" transform="translate(${St.x} ${St.y})"><path d="M-40 18V-30M40 18V-30" stroke="#6b4423" stroke-width="7"/><path d="M-50-34h100v-12h-100z" fill="#8a5a2b" stroke="#4a2c12" stroke-width="1.6"/><text x="0" y="-36.5" text-anchor="middle" font-size="11" font-weight="900" fill="#fff4d0" font-family="Georgia,'Times New Roman',serif" letter-spacing="1">START</text>${banner(-40, -8, .9, bc)}${banner(40, -8, .9, bc).replace('translate(40', 'translate(28')}</g>`;
    // マス（台座＋宝珠＋アイコン）
    for (const id of Object.keys(N)) {
      const n = N[id], s = SQ[n.type] || SQ.normal; if (n.type === 'tournament' || n.type === 'start') {
        o += `<g class="p9n p9j" data-id="${id}" transform="translate(${n.x} ${n.y})"><ellipse class="p9ring" cx="0" cy="5" rx="26" ry="12"/><ellipse cx="0" cy="6" rx="22" ry="9" fill="url(#${pf}pedTop)" stroke="rgba(0,0,0,.3)"/><circle class="p9hit" r="24" fill="transparent"/></g>`;
        continue;
      }
      o += `<g class="p9n t-${n.type}" data-id="${id}" transform="translate(${n.x} ${n.y})"><ellipse cx="0" cy="12" rx="21" ry="7" fill="rgba(0,0,0,.28)"/><ellipse cx="0" cy="8" rx="19.5" ry="8.5" fill="${T.ped[1]}"/><ellipse class="p9ring" cx="0" cy="5" rx="25" ry="12"/><ellipse cx="0" cy="4.5" rx="19.5" ry="8" fill="url(#${pf}pedTop)" stroke="rgba(0,0,0,.28)"/>${s.c1 ? `<circle cx="0" cy="-5" r="13" fill="url(#${pf}o-${n.type})" stroke="rgba(255,255,255,.75)" stroke-width="1.3"/><ellipse cx="-4" cy="-10.5" rx="5.8" ry="3.2" fill="#fff" opacity=".38"/><use href="#${pf}g-${n.type}" x="-8.5" y="-13.5" width="17" height="17" fill="#fff"/>` : `<circle cx="0" cy="4.5" r="3.2" fill="rgba(0,0,0,.2)"/>`}<circle class="p9hit" r="24" fill="transparent"/></g>`;
    }
    return o + '</svg>';
  }
  root.MMP9ART = Object.freeze({ SQ, render, iconSvg, ticketIcon, THEME });
})(typeof window !== 'undefined' ? window : globalThis);
