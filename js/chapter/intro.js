// =========================================================
// Chapter開始の演出（window.MMCHI）：旅路全体を見渡す「引きの俯瞰図」→ スタート地点へズーム／パン → 実プレイのフィールドへ
//  ・俯瞰図は演出専用の画像（config.intro.overviews[patternId]。プレイの背景の流用ではない）。差し替えは config だけ。
//  ・流れ：俯瞰図を全画面に（会場のほうを少し見せる）→ Chapter 名 → スタート付近（config.intro.startFocus）へ寄る → 暗転なしのクロスフェードで
//    下に描いてある実プレイの画面（js/chapter/field-view.js が先に作っている）へ → START が押せる。
//  ・タップで短縮。視差効果を減らす設定では短く。1回だけ出す（shown：セッションの中で記憶。セーブには持たない。再読み込みでは出さない）
// =========================================================
(function (root) {
  'use strict';
  const mem = new Set();
  const SS = 'mmch_intro:';
  const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function shown(key) { if (mem.has(key)) return true; try { return root.sessionStorage && root.sessionStorage.getItem(SS + key) === '1'; } catch (e) { return false; } }
  function mark(key) { mem.add(key); try { root.sessionStorage && root.sessionStorage.setItem(SS + key, '1'); } catch (e) {} }
  function reset(key) { if (key == null) { mem.clear(); return; } mem.delete(key); try { root.sessionStorage && root.sessionStorage.removeItem(SS + key); } catch (e) {} }
  /** 俯瞰図：Pattern ごと（無ければ最初の1枚） */
  function overviewOf(cfg, patternId) { const I = cfg && cfg.intro, o = I && I.overviews; if (!o) return null; if (typeof o === 'string') return o; return o[patternId] || o[Object.keys(o)[0]] || null; }
  /** 画像を host いっぱいに（cover）置いたときの、焦点（割合）を中央に置く transform（scale と translate） */
  function fit(hostW, hostH, imgW, imgH, focus, zoom) {
    const base = Math.max(hostW / imgW, hostH / imgH), S = base * zoom, w = imgW * S, h = imgH * S;
    let tx = hostW / 2 - focus.x * w, ty = hostH / 2 - focus.y * h;
    tx = w <= hostW ? (hostW - w) / 2 : Math.max(hostW - w, Math.min(0, tx));
    ty = h <= hostH ? (hostH - h) / 2 : Math.max(hostH - h, Math.min(0, ty));
    return { S, tx, ty, w, h };
  }
  const tf = (f) => `translate3d(${f.tx.toFixed(2)}px,${f.ty.toFixed(2)}px,0) scale(${f.S.toFixed(5)})`;
  let current = null;
  /**
   * 演出を再生する（Promise。終わると俯瞰図は消え、下の実プレイ画面が見えている）
   *  opts：{ key, host, chapterId, title, patternId, calm, skip }
   */
  async function play(cfg, opts = {}) {
    const I = cfg && cfg.intro, src = overviewOf(cfg, opts.patternId), host = opts.host || document.body;
    if (!I || !src || !host || typeof document === 'undefined') return false;
    if (opts.key) mark(opts.key);
    const calm = !!opts.calm, Z = I.zoom || { from: 1, to: 2.2 }, hold = calm ? 500 : (I.holdMs || 1500), move = calm ? 350 : (I.moveMs || 2200), fade = calm ? 200 : (I.fadeMs || 700);
    const ov = document.createElement('div'); ov.className = 'chintro'; ov.setAttribute('role', 'presentation');
    ov.innerHTML = `<div class="chintro-cam"><img class="chintro-img" src="${esc(src)}" alt="" draggable="false" decoding="async"></div>
      <div class="chintro-title"><small>CHAPTER ${esc(opts.chapterId != null ? opts.chapterId : cfg.chapterId)}</small><b>${esc(opts.title || cfg.title || '')}</b><i>旅のはじまり</i></div>
      <p class="chintro-tap">タップでとばす</p>`;
    host.appendChild(ov);
    const cam = ov.querySelector('.chintro-cam'), img = ov.querySelector('.chintro-img'), title = ov.querySelector('.chintro-title');
    let skipped = false; const onTap = () => { skipped = true; }; ov.addEventListener('pointerdown', onTap);
    current = { skip: () => { skipped = true; } };
    const race = (ms) => new Promise((ok) => { const t0 = performance.now(); (function tick() { if (skipped || performance.now() - t0 >= ms) return ok(); setTimeout(tick, 40); })(); });
    try {
      await new Promise((ok) => { if (img.complete && img.naturalWidth) return ok(); img.onload = ok; img.onerror = ok; setTimeout(ok, 2500); });
      const W = host.clientWidth || 390, Hh = host.clientHeight || 700, iw = img.naturalWidth || 768, ih = img.naturalHeight || 1360;
      cam.style.width = `${iw}px`; cam.style.height = `${ih}px`;
      const f0 = fit(W, Hh, iw, ih, I.goalFocus || { x: 0.5, y: 0.35 }, Z.from || 1), f1 = fit(W, Hh, iw, ih, I.startFocus || { x: 0.5, y: 0.9 }, Z.to || 2.2);
      // 1) 俯瞰図：全体（会場のほう）をゆっくり見せる。Chapter 名が入る
      cam.style.transform = tf(f0); ov.classList.add('on');
      title.classList.add('on');
      const drift = fit(W, Hh, iw, ih, I.goalFocus || { x: 0.5, y: 0.35 }, (Z.from || 1) * 1.05);
      if (!calm && cam.animate) cam.animate([{ transform: tf(f0) }, { transform: tf(drift) }], { duration: hold + 200, easing: 'ease-out', fill: 'forwards' });
      await race(hold);
      // 2) スタート地点へズーム／パン（この先に長い旅路があることを見せてから、今いる場所へ寄る）
      title.classList.remove('on');
      if (!skipped && !calm && cam.animate) { const a = cam.animate([{ transform: tf(drift) }, { transform: tf(f1) }], { duration: move, easing: 'cubic-bezier(.55,.05,.3,1)', fill: 'forwards' }); await race(move); try { a.finish(); } catch (e) {} }
      else cam.style.transform = tf(f1);
      // 3) 実プレイ画面へ（下に描いてある 01 のフィールドをクロスフェードで見せる）
      ov.classList.add('out');
      await wait(skipped ? Math.min(fade, 260) : fade);
      return true;
    } catch (e) { return false; } finally { ov.removeEventListener('pointerdown', onTap); ov.remove(); current = null; }
  }
  root.MMCHI = Object.freeze({ play, shown, mark, reset, overviewOf, fit, skip: () => { if (current) current.skip(); }, isPlaying: () => !!current });
})(typeof window !== 'undefined' ? window : globalThis);
