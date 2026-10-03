// =========================================================
// バトル共通演出の正式素材（window.MMBFX。2026-10-03）：fight()・Battle Engine・battle-bridge・adapter・.bt 系 CSS（Phase 6 保護対象）は変えない。
//  バトル画面に出る既存の表示を「外から」見て、正式素材を短く重ねるだけ（視覚レイヤー。ゲームの処理・時間・判定には触れない）：
//   ・ダメージ表示（pop の span.dmg。#f0／#f1＝どちらのモンスターか）：通常ヒット #6／クリティカル（.crt）#7／ミス・回避（.ms）#9
//   ・能力アップ／ダウン（efBurst(w, { lv })。lv＝±1 小・±2 中・±3 大＝lvOf）：#15〜#17／#18〜#20
//   ・決着の帯（#ban の「WIN!」／「LOSE」）：勝利 #28／敗北 #29（降参も LOSE）
//  素材の番号・元ファイルは assets/battle/common/README.md。未使用の19枚は original/ に保存だけ（別の用途へ使わない）
//  重ね方：モンスターの演出は #f0／#f1（モンスターの枠の上の効果の層）の先頭に入れる＝ダメージの数字・技の演出より下。決着は #bt の中で帯（#ban）より下。
//   同じ場所の前の演出は消してから出す（重ならない）。時間が来たら必ず消す（DOM を残さない）。#bt が消えたら中の物も消える
// =========================================================
(function (root) {
  'use strict';
  const DIR = './assets/battle/common/';
  // kind → { src, size（モンスターの枠の幅に対する倍率）, ms（表示の長さ）}
  const FX = Object.freeze({
    hit:      { src: DIR + 'bc06_hit.webp', size: 1.25, ms: 460 },
    critical: { src: DIR + 'bc07_critical.webp', size: 1.65, ms: 680 },
    miss:     { src: DIR + 'bc09_miss.webp', size: 1.35, ms: 520 },
    up1:      { src: DIR + 'bc15_stat_up_s.webp', size: 1.05, ms: 1000 },
    up2:      { src: DIR + 'bc16_stat_up_m.webp', size: 1.2, ms: 1100 },
    up3:      { src: DIR + 'bc17_stat_up_l.webp', size: 1.35, ms: 1200 },
    down1:    { src: DIR + 'bc18_stat_down_s.webp', size: 1.05, ms: 1000 },
    down2:    { src: DIR + 'bc19_stat_down_m.webp', size: 1.2, ms: 1100 },
    down3:    { src: DIR + 'bc20_stat_down_l.webp', size: 1.35, ms: 1200 },
    victory:  { src: DIR + 'bc28_victory.webp', ms: 1800 },
    defeat:   { src: DIR + 'bc29_defeat.webp', ms: 1800 },
  });
  const calm = () => !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  let cache = null, obs = null, last = [];
  const log = [];   // 直前の演出（テスト・確認用。最大30件）
  function preload() { if (cache || typeof Image === 'undefined') return; cache = Object.values(FX).map((f) => { const im = new Image(); im.decoding = 'async'; im.src = f.src; return im; }); }
  function note(kind, side) { log.push({ kind, side, t: Date.now() }); if (log.length > 30) log.shift(); }
  /** 能力アップ／ダウンの lv（±1〜3）→ 演出の種類 */
  const statKind = (lv) => { const n = Math.max(1, Math.min(3, Math.abs(lv | 0) || 1)); return (lv < 0 ? 'down' : 'up') + n; };
  /** モンスターの上に短く重ねる（side＝0 自分／1 相手） */
  function show(kind, side) {
    const F = FX[kind], host = typeof document !== 'undefined' && document.getElementById('f' + side);
    if (!F || !host) return false;
    const old = host.querySelector(':scope > .mbfx'); if (old) old.remove();   // 同じモンスターの前の演出は消す
    const mw = host.parentNode, w = Math.round(((mw && mw.clientWidth) || 150) * F.size);
    const d = document.createElement('div'); d.className = 'mbfx'; d.dataset.kind = kind;
    d.style.cssText = `width:${w}px;height:${w}px;margin:${-w / 2}px 0 0 ${-w / 2}px`;
    const img = document.createElement('img'); img.src = F.src; img.alt = ''; img.draggable = false; d.appendChild(img);
    host.insertBefore(d, host.firstChild);
    const up = kind.startsWith('up'), dn = kind.startsWith('down'), ms = calm() ? Math.min(F.ms, 500) : F.ms;
    if (d.animate && !calm()) {
      const k = kind === 'critical' ? [{ transform: 'scale(.55) rotate(-8deg)', opacity: 0 }, { transform: 'scale(1.08) rotate(0)', opacity: 1, offset: 0.22 }, { transform: 'scale(1)', opacity: 0.95, offset: 0.6 }, { transform: 'scale(1.06)', opacity: 0 }]
        : kind === 'hit' ? [{ transform: 'scale(.6)', opacity: 0 }, { transform: 'scale(1.05)', opacity: 1, offset: 0.3 }, { transform: 'scale(1.1)', opacity: 0 }]
        : kind === 'miss' ? [{ transform: 'translateX(-14%) scale(.9)', opacity: 0 }, { transform: 'translateX(0) scale(1)', opacity: 0.95, offset: 0.35 }, { transform: 'translateX(10%) scale(1.02)', opacity: 0 }]
        : up ? [{ transform: 'translateY(12%) scale(.85)', opacity: 0 }, { transform: 'translateY(0) scale(1)', opacity: 0.95, offset: 0.25 }, { transform: 'translateY(-4%) scale(1)', opacity: 0.9, offset: 0.7 }, { transform: 'translateY(-10%) scale(1)', opacity: 0 }]
        : dn ? [{ transform: 'translateY(-12%) scale(.85)', opacity: 0 }, { transform: 'translateY(0) scale(1)', opacity: 0.95, offset: 0.25 }, { transform: 'translateY(4%) scale(1)', opacity: 0.9, offset: 0.7 }, { transform: 'translateY(10%) scale(1)', opacity: 0 }]
        : [{ opacity: 0 }, { opacity: 1 }, { opacity: 0 }];
      d.animate(k, { duration: ms, easing: 'ease-out', fill: 'forwards' });
    }
    setTimeout(() => d.remove(), ms + 60);   // 必ず消す
    note(kind, side); return true;
  }
  /** 決着（勝利／敗北）：#bt の中で、帯（WIN!／LOSE）の後ろに短く重ねる */
  function showEnd(kind) {
    const F = FX[kind], bt = typeof document !== 'undefined' && document.getElementById('bt'); if (!F || !bt) return false;
    const old = bt.querySelector(':scope > .mbfx-end'); if (old) old.remove();
    const d = document.createElement('div'); d.className = 'mbfx-end'; d.dataset.kind = kind;
    const img = document.createElement('img'); img.src = F.src; img.alt = ''; img.draggable = false; d.appendChild(img);
    bt.appendChild(d);
    const ms = calm() ? 700 : F.ms;
    if (d.animate && !calm()) d.animate(kind === 'victory'
      ? [{ transform: 'translate(-50%,-50%) scale(.7)', opacity: 0 }, { transform: 'translate(-50%,-50%) scale(1.04)', opacity: 1, offset: 0.2 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: 1, offset: 0.75 }, { transform: 'translate(-50%,-50%) scale(1.02)', opacity: 0 }]
      : [{ transform: 'translate(-50%,-46%)', opacity: 0 }, { transform: 'translate(-50%,-50%)', opacity: 0.9, offset: 0.25 }, { transform: 'translate(-50%,-50%)', opacity: 0.85, offset: 0.75 }, { transform: 'translate(-50%,-52%)', opacity: 0 }], { duration: ms, easing: 'ease-out', fill: 'forwards' });
    setTimeout(() => d.remove(), ms + 60);
    note(kind, null); return true;
  }
  /** 能力アップ／ダウン（index.html の efBurst から。fight() は変えない） */
  function stat(side, lv) { return show(statKind(lv), side); }
  /** 追加されたノードを見て、対応する演出を出す（ダメージの数字・決着の帯） */
  function onAdded(n) {
    if (!n || n.nodeType !== 1) return;
    if (n.id === 'ban') { const t = (n.textContent || '').trim(); if (t === 'WIN!') showEnd('victory'); else if (t === 'LOSE') showEnd('defeat'); return; }
    const cl = n.classList, p = n.parentNode;
    if (n.tagName === 'SPAN' && cl && cl.contains('dmg') && !cl.contains('ef') && p && /^f[01]$/.test(p.id || '')) {
      const side = +p.id.slice(1);
      show(cl.contains('ms') ? 'miss' : cl.contains('crt') ? 'critical' : 'hit', side);
    }
  }
  /** バトル画面（#bt）が出たら見張りを始め、消えたら止める */
  function watch() {
    if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
    const top = new MutationObserver(() => {
      const bt = document.getElementById('bt');
      if (bt && (!obs || last[0] !== bt)) {
        if (obs) obs.disconnect();
        preload();
        obs = new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) onAdded(n); });
        obs.observe(bt, { childList: true, subtree: true }); last = [bt];
      } else if (!bt && obs) { obs.disconnect(); obs = null; last = []; }
    });
    const start = () => top.observe(document.body, { childList: true });
    if (document.body) start(); else root.addEventListener('DOMContentLoaded', start);
  }
  watch();
  root.MMBFX = Object.freeze({ FX, show, showEnd, stat, statKind, preload, log: () => log.map((x) => ({ ...x })) });
})(typeof window !== 'undefined' ? window : globalThis);
