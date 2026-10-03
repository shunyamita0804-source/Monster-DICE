// =========================================================
// Chapter開始の演出（window.MMCHI）：旅路全体を見渡す「引きの俯瞰図」→ スタート地点へズーム／パン → 実プレイのフィールドへ
//  ・俯瞰図は演出専用の画像（config.intro.overviews[patternId]。プレイの背景の流用ではない）。差し替えは config だけ。
//  ・流れ（2026-10-02 正式）：全景を表示して止める → 「Chapter N」→ Chapter 名 → 少し見せて消える → 全景の中を旅の開始地点へカメラが移動
//    → 移動の終わりに、下に描いてある実プレイの画面（FIELD 1。js/chapter/field-view.js が先に作っている）へクロスフェード → ソラモ・マス・UI が現れる → START。約3.9秒。
//  ・Chapter・Pattern ごとの違いは config.intro だけ（label・name・overviews・camera{from,to,via}・patterns[patternId]{overview,camera}・timing）。コードに Chapter 専用の値を書かない。
//  ・タップで飛ばす（何回押しても1回だけ）。視差効果を減らす設定では短く。出すかどうかの判定は field-view（m.raise.field.introSeen＝この個体のこの Chapter で1回）
// =========================================================
(function (root) {
  'use strict';
  const mem = new Set();
  const SS = 'mmch_intro:';
  const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function shown(key) { if (mem.has(key)) return true; try { return root.sessionStorage && root.sessionStorage.getItem(SS + key) === '1'; } catch (e) { return false; } }
  function mark(key) { mem.add(key); try { root.sessionStorage && root.sessionStorage.setItem(SS + key, '1'); } catch (e) {} }
  function reset(key) {
    if (key != null) { mem.delete(key); try { root.sessionStorage && root.sessionStorage.removeItem(SS + key); } catch (e) {} return; }
    mem.clear();
    try { const ss = root.sessionStorage; if (ss) for (let i = ss.length - 1; i >= 0; i--) { const k = ss.key(i); if (k && k.startsWith(SS)) ss.removeItem(k); } } catch (e) {}
  }
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
  // ---- 演出の時間（ms。config.intro.timing で上書き。全体で約4.7秒） ----
  //  2026-10-03（試遊）：画面が出てすぐズームしない。全景を止めて見せる（stillMs）→「Chapter N」→ Chapter 名 → 名前が出そろったところで開始の音（opts.onTitle）
  //   → 読める間と余韻（titleHoldMs）→ タイトルが消える → 開始地点へズーム（moveMs）→ 操作できる
  const TIMING = Object.freeze({ stillMs: 700, chapterInMs: 450, nameInMs: 400, titleHoldMs: 1350, titleOutMs: 350, moveMs: 1250, joinMs: 450, uiInMs: 300 });
  /**
   * カメラ（俯瞰図の上の焦点 { x, y }＝画像に対する割合、zoom＝画面いっぱい（cover）に対する倍率）。
   *  探す順：config.intro.patterns[patternId].camera → config.intro.camera → 旧形式（goalFocus・startFocus・zoom・via）
   *  from＝全景（止めて Chapter 名を見せる位置）、to＝旅の開始地点、via＝途中で見せる地点（任意）
   */
  function cameraOf(I, patternId) {
    const P = (I.patterns && I.patterns[patternId]) || {}, C = P.camera || I.camera, Z = I.zoom || {};
    if (C && C.from && C.to) return { from: { zoom: 1, ...C.from }, to: { zoom: 2.2, ...C.to }, via: Array.isArray(C.via) ? C.via : [] };
    return { from: { ...(I.goalFocus || { x: 0.5, y: 0.5 }), zoom: Z.from || 1 }, to: { ...(I.startFocus || { x: 0.5, y: 0.9 }), zoom: Z.to || 2.2 }, via: Array.isArray(I.via) ? I.via : [] };
  }
  /** 俯瞰図：config.intro.patterns[patternId].overview → overviews[patternId] → 最初の1枚 */
  function imageOf(cfg, patternId) { const I = cfg && cfg.intro, P = I && I.patterns && I.patterns[patternId]; return (P && P.overview) || overviewOf(cfg, patternId); }
  let current = null;
  /**
   * 演出を再生する（Promise。終わると俯瞰図は消え、下の実プレイ画面（FIELD 1）が見えている）
   *  流れ：全景を表示して止める → 「Chapter N」がゆっくり現れる → Chapter 名 → 少し見せる → タイトルが消える
   *        → 全景の中を旅の開始地点へカメラが移動 → その終わりに FIELD 1 へクロスフェード（UI の表示は呼び出し側＝field-view）
   *  opts：{ key, host, chapterId, title, patternId, calm }。タップで飛ばす（何回押しても1回だけ。飛ばしたら最後の状態へすぐ移る）
   *  戻り値：{ played, skipped }
   */
  async function play(cfg, opts = {}) {
    const I = cfg && cfg.intro, src = imageOf(cfg, opts.patternId), host = opts.host || document.body;
    if (!I || !src || !host || typeof document === 'undefined') return { played: false, skipped: false };
    if (opts.key) mark(opts.key);
    const calm = !!opts.calm, T = { ...TIMING, ...(I.timing || {}) }, CAM = cameraOf(I, opts.patternId);
    const label = I.label || `Chapter ${opts.chapterId != null ? opts.chapterId : cfg.chapterId}`, name = opts.title || I.name || cfg.title || '';
    const ov = document.createElement('div'); ov.className = 'chintro'; ov.setAttribute('role', 'presentation');
    ov.innerHTML = `<div class="chintro-cam"><img class="chintro-img" src="${esc(src)}" alt="" draggable="false" decoding="async"></div>
      <div class="chintro-title"><small class="chintro-ch">${esc(label)}</small><b class="chintro-name">${esc(name)}</b></div>
      <p class="chintro-tap">タップでとばす</p>`;
    host.appendChild(ov);
    const cam = ov.querySelector('.chintro-cam'), img = ov.querySelector('.chintro-img'), title = ov.querySelector('.chintro-title');
    const ch = ov.querySelector('.chintro-ch'), nm = ov.querySelector('.chintro-name');
    let skipped = false, wake = null, anim = null, cued = false;
    const titleCue = () => { if (cued) return; cued = true; try { if (typeof opts.onTitle === 'function') opts.onTitle(); } catch (e) {} };
    const skip = () => { if (skipped) return; skipped = true; if (wake) wake(); };   // 何回押しても1回だけ
    ov.addEventListener('pointerdown', (e) => { e.preventDefault(); skip(); });
    current = { skip };
    const race = (ms) => new Promise((ok) => { if (skipped || ms <= 0) return ok(); const t = setTimeout(() => { wake = null; ok(); }, ms); wake = () => { clearTimeout(t); wake = null; ok(); }; });
    const fadeIn = (el, ms) => { el.style.transition = `opacity ${ms}ms ease, transform ${ms}ms ease`; el.classList.add('on'); };
    try {
      await new Promise((ok) => { if (img.complete && img.naturalWidth) return ok(); img.onload = ok; img.onerror = ok; setTimeout(ok, 2500); });
      const W = host.clientWidth || 390, Hh = host.clientHeight || 700, iw = img.naturalWidth || 864, ih = img.naturalHeight || 1536;
      cam.style.width = `${iw}px`; cam.style.height = `${ih}px`;
      const at = (v) => fit(W, Hh, iw, ih, v, v.zoom || 1), f0 = at(CAM.from), f1 = at(CAM.to);
      cam.style.transform = tf(f0);
      ov.classList.add('on'); void ov.offsetWidth; ov.classList.add('shown');   // 全景を表示（カメラは止めたまま）
      if (!calm) {
        await race(T.stillMs);
        // Chapter N → Chapter 名 → 見せる → 消える
        fadeIn(title, 1); fadeIn(ch, T.chapterInMs); await race(T.chapterInMs);
        fadeIn(nm, T.nameInMs); await race(T.nameInMs);
        if (!skipped) titleCue();   // Chapter 名が出そろって読める状態になった瞬間に開始の音（ズームより前）
        await race(T.titleHoldMs);   // 読める間＋音の余韻（この間カメラは止めたまま）
        title.style.transition = `opacity ${T.titleOutMs}ms ease`; title.classList.remove('on'); await race(T.titleOutMs);
        // 全景の中を旅の開始地点へ。終わりの joinMs で FIELD 1 へクロスフェード（カメラは動いたまま＝止まってから切り替わらない）
        if (!skipped && cam.animate) {
          const keys = [{ transform: tf(f0) }, ...CAM.via.filter((v) => v && Number.isFinite(v.x) && Number.isFinite(v.y)).map((v) => ({ transform: tf(at(v)) })), { transform: tf(f1) }];
          anim = cam.animate(keys, { duration: T.moveMs, easing: 'cubic-bezier(.45,.05,.35,1)', fill: 'forwards' });
          await race(Math.max(0, T.moveMs - T.joinMs));
          ov.style.transition = `opacity ${T.joinMs}ms ease`; ov.classList.add('out');
          await race(T.joinMs);
        }
      } else {   // 視差効果を減らす設定：カメラは動かさず、タイトルを短く見せて切り替える
        fadeIn(title, 1); fadeIn(ch, 200); fadeIn(nm, 200); titleCue(); await race(900);
      }
      if (skipped) { try { if (anim) anim.cancel(); } catch (e) {} cam.style.transform = tf(f1); title.classList.remove('on'); }
      // 最後の状態：俯瞰図を消して FIELD 1（飛ばしたときは短いフェード。押した指の「クリック」が下の START に届かないよう、消えるまで俯瞰図が受け止める）
      ov.style.transition = `opacity ${skipped ? 160 : 200}ms ease`; ov.classList.add('out');
      await wait(skipped ? 180 : (ov.style.opacity === '0' ? 0 : 60));
      return { played: true, skipped, cued };
    } catch (e) { return { played: false, skipped }; } finally { ov.remove(); current = null; }
  }
  root.MMCHI = Object.freeze({ play, shown, mark, reset, overviewOf, imageOf, cameraOf, TIMING, fit, skip: () => { if (current) current.skip(); }, isPlaying: () => !!current });
})(typeof window !== 'undefined' ? window : globalThis);
