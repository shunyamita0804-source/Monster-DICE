// =========================================================
// バトル画面の表示だけの補正（window.MMBF）：モンスターの絵を「上の HUD（名前・HP）より下、下の技UIより上、左右に切れない」枠に収める
//  ・fight()・Battle Engine・battle-bridge・adapter・.bt 系 CSS（Phase 6 保護対象）は変えない。#bt が画面に出たときに、
//    その時の画面の寸法から「切れない最大の大きさ」を計算し、.mw／.mon にインラインの幅・高さを入れるだけ（比率は維持。足元は下ぞろえ）
//  ・個体ごとの CSS は持たない：どの種族（将来20体以上）でも、絵の枠（.mw）の大きさを共通の計算で決める
//  ・計算：使える高さ＝（技UI・説明欄の上端 と 絵の枠の下端 の低いほう）−（HP パネルの下端）− 余白、使える幅＝左右それぞれの側（.mside）の幅 − 余白、
//    大きさ＝min(高さ, 幅, 上限)。CSS の既定（118px）より小さくなるのは、画面が狭くて切れるときだけ
//  ・画面の向きや大きさが変わったら計算し直す。#bt が消えたら何もしない
// =========================================================
(function (root) {
  'use strict';
  const C = { margin: 8, max: 210, min: 72 };
  const $ = (s, el) => (el || document).querySelector(s);
  function measure() {
    const bt = $('#bt'); if (!bt) return null;
    const rect = (e) => (e ? e.getBoundingClientRect() : null);
    const vs = rect($('.vs', bt)), hp = [rect($('#hp0', bt)), rect($('#hp1', bt))].filter(Boolean), tpl = rect($('.tpl', bt)), tm = rect($('.tm', bt));
    const bui = rect($('.bui', bt)), cap = rect($('#msg', bt)), rl = rect($('#rl', bt)), sides = [rect($('.mside.s0', bt)), rect($('.mside.s1', bt))];
    if (!vs || !sides[0] || !sides[1]) return null;
    const top = Math.max(tm ? tm.bottom : 0, tpl ? tpl.bottom : 0, ...hp.map((r) => r.bottom));
    const bottoms = [vs.bottom, bui && bui.top > top ? bui.top : Infinity, cap && cap.top > top ? cap.top : Infinity, rl && rl.top > top ? rl.top : Infinity];
    const bottom = Math.min(...bottoms);
    const width = Math.min(sides[0].width, sides[1].width);
    return { top, bottom, width, vsBottom: vs.bottom, height: bottom - top };
  }
  /** 切れない最大の大きさ（px）と、絵の枠の下端を上げる量 */
  function compute(m) {
    if (!m) return null;
    const size = Math.max(C.min, Math.min(C.max, m.height - C.margin * 2, m.width - C.margin));
    const lift = m.vsBottom > m.bottom + 0.5 ? m.vsBottom - m.bottom + C.margin * 0.5 : 0;   // 技UIが絵の枠の下端より上にあるときだけ、足元を上げる
    return { size: Math.round(size), lift: Math.round(lift) };
  }
  function fit() {
    const bt = $('#bt'); if (!bt) return null;
    const r = compute(measure()); if (!r) return null;
    bt.querySelectorAll('.mside .mw').forEach((mw) => {
      mw.style.width = `${r.size}px`; mw.style.height = 'auto'; mw.style.marginBottom = r.lift ? `${r.lift}px` : '';
      const mon = $('.mon', mw); if (mon) { mon.style.width = `${r.size}px`; mon.style.height = `${r.size}px`; }
      mw.querySelectorAll('.mon > img:not(.b2)').forEach((img) => { img.style.objectFit = 'contain'; img.style.objectPosition = 'center bottom'; });   // 足元を下ぞろえ
    });
    bt.dataset.fit = String(r.size);
    return r;
  }
  let timer = 0;
  function schedule() { if (timer) return; timer = setTimeout(() => { timer = 0; fit(); }, 30); }
  function watch() {
    if (typeof MutationObserver === 'undefined' || !document.body) return;
    new MutationObserver((muts) => { for (const mu of muts) for (const n of mu.addedNodes) if (n && n.id === 'bt') { schedule(); setTimeout(fit, 400); } }).observe(document.body, { childList: true });
    root.addEventListener('resize', () => { if ($('#bt')) schedule(); });
  }
  if (typeof document !== 'undefined') { if (document.body) watch(); else document.addEventListener('DOMContentLoaded', watch); }
  root.MMBF = Object.freeze({ measure, compute, fit, config: C });
})(typeof window !== 'undefined' ? window : globalThis);
