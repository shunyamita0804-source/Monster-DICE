// =========================================================
// Chapterフィールドのサイコロ（window.MMCHD）：出目の決定（rollDice）と見せ方（play）を分ける
//  ・出目は MMP7.rollDice（1〜3 等確率）。STOP を押すタイミングで出目を狙える仕様にはしない（表示と乱数は別。テストでは rollDice({ forcedResult: 3 })）
//  ・rollingSprite：回転中の正式サイコロ本体（今ある正式画像1枚＝上面1・左面2・右面3。assets/fields/ch1a/dice/dice_rolling.webp）
//    連番画像は使わず、この1枚を translate・rotate・scale・影で動かす：
//    STOP の上で浮いていた場所（opts.from）から飛び上がる → 空中で速く回る → 減速しながらフィールドの手前（opts.land）へ落ちる → 着地 → 小さく1回跳ねる →
//    少し横へ転がる → 最後の約0.18秒で正式の角度（0°）へ自然に戻って止まる（傾いたまま止まらない。回転量は 360° の倍数に収束）
//  ・resultSprites：出目ごとの停止画像（dice_stop_1〜3）。今は未登録（空）。1枚の画像を回して「2が上」「3が上」を偽造しない
//    → 未登録の間は、止まったサイコロの上に金色の光の輪と数字（「3！」）を短く出す。
//    停止画像が届いたら configure({ resultSprites: { 1: '…/dice_stop_1.webp', 2: '…', 3: '…' } }) だけで、数字の代わりにその画像を出す
//  ・演出中は isLocked() が true（サイコロ・休む・分岐・アイテムの重複操作を防ぐ）
// =========================================================
(function (root) {
  'use strict';
  const C = { rollingSprite: './assets/fields/ch1a/dice/dice_rolling.webp', resultSprites: {}, min: 1, max: 3, ms: 920, resultMs: 480, settleMs: 180 };
  let locked = false, cache = null;
  function configure(o) { if (o && typeof o === 'object') { Object.assign(C, o); if (o.resultSprites) C.resultSprites = { ...o.resultSprites }; cache = null; } return { ...C, resultSprites: { ...C.resultSprites } }; }
  const valid = (v) => Number.isInteger(v) && v >= C.min && v <= C.max;
  /** 出目だけを決める（描画しない）。forcedResult があればそれ（テスト用） */
  function roll({ forcedResult, rnd } = {}) {
    if (forcedResult != null) { if (!valid(forcedResult)) throw new Error('MMCHD：forcedResult は 1〜3'); return forcedResult; }
    const P7 = root.MMP7; return P7 && P7.rollDice ? P7.rollDice(rnd || Math.random) : C.min + Math.floor((rnd || Math.random)() * (C.max - C.min + 1));
  }
  /** 出目を決めて演出する：{ result, animationPromise } */
  function rollDice(opts = {}) { const result = roll(opts); return { result, animationPromise: opts.animate === false ? Promise.resolve(true) : play(result, opts) }; }
  const resultSprite = (v) => { const s = C.resultSprites && C.resultSprites[v]; return typeof s === 'string' && s ? s : null; };
  function preload() { if (cache || typeof Image === 'undefined') return; cache = [C.rollingSprite, ...Object.values(C.resultSprites || {})].map((src) => { const im = new Image(); im.decoding = 'async'; im.src = src; return im; }); }
  const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
  /**
   * 回転の時間割（0〜1）：速く回る → 減速 → 着地でほぼ止まる → 跳ねと転がりで少し進む → 最後に正式の角度へ収束。
   *  final は 360 の倍数（見た目は 0°）。settle は最後の収束にかける割合
   */
  function spinFrames(dir, spin, settle) {
    const fin = Math.round((spin + 140) / 360) * 360, s = 1 - settle;
    return [
      { transform: 'rotate(0deg)', offset: 0, easing: 'cubic-bezier(.2,0,.4,1)' },
      { transform: `rotate(${dir * spin * 0.62}deg)`, offset: 0.34, easing: 'cubic-bezier(.3,0,.6,1)' },
      { transform: `rotate(${dir * spin}deg)`, offset: 0.6, easing: 'ease-out' },
      { transform: `rotate(${dir * (spin + 70)}deg)`, offset: 0.72, easing: 'ease-out' },
      { transform: `rotate(${dir * (fin - 34)}deg)`, offset: s, easing: 'cubic-bezier(.25,.1,.25,1)' },
      { transform: `rotate(${dir * fin}deg)`, offset: 1 },
    ];
  }
  /** 見せ方だけ（出目は決まっている）。DOM・アニメーションが使えない環境では何もせず true */
  async function play(value, opts = {}) {
    if (!valid(value)) return false;
    if (typeof document === 'undefined' || !document.body) return true;
    preload(); locked = true;
    const host = opts.host || document.body, calm = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const hw = host.clientWidth || 390, hh = host.clientHeight || 700;
    const from = opts.from || { x: hw / 2, y: hh * 0.9 }, land = opts.land || { x: hw / 2, y: hh * 0.56 };
    const ov = document.createElement('div'); ov.className = 'chdz'; ov.setAttribute('aria-live', 'polite'); ov.dataset.result = String(value);
    const jx = (Math.random() * 2 - 1) * 12, dir = Math.random() < 0.5 ? -1 : 1, spin = 900 + Math.floor(Math.random() * 3) * 90;   // 着地位置・転がる向き・回転量に小さなばらつき（止まる角度は常に正式）
    const lx = land.x - from.x + jx, ly = land.y - from.y;
    ov.innerHTML = `<div class="chdz-sh" style="left:${(land.x + jx).toFixed(1)}px;top:${land.y.toFixed(1)}px"></div><div class="chdz-mv" style="left:${from.x.toFixed(1)}px;top:${from.y.toFixed(1)}px"><img class="chdz-img" alt="サイコロ" src="${C.rollingSprite}" draggable="false"></div><div class="chdz-res" hidden style="left:${(land.x + jx + dir * 22).toFixed(1)}px;top:${land.y.toFixed(1)}px"><span class="chdz-ring"></span><b>${value}</b><i>！</i></div>`;
    host.appendChild(ov);
    try {
      const mv = ov.querySelector('.chdz-mv'), img = ov.querySelector('.chdz-img'), sh = ov.querySelector('.chdz-sh'), T = calm ? 260 : C.ms, settle = Math.min(0.3, C.settleMs / T);
      if (!calm && mv.animate) {
        const a1 = mv.animate([
          { transform: 'translate(-50%,-50%) translate(0px,0px) scale(.9)', opacity: 1, offset: 0, easing: 'cubic-bezier(.2,.6,.4,1)' },
          { transform: `translate(-50%,-50%) translate(${(lx * 0.45).toFixed(1)}px,${(ly - 70).toFixed(1)}px) scale(1.18)`, offset: 0.34, easing: 'cubic-bezier(.4,0,.8,.6)' },   // 飛び上がって速く回る
          { transform: `translate(-50%,-50%) translate(${lx.toFixed(1)}px,${ly.toFixed(1)}px) scale(1)`, offset: 0.6, easing: 'cubic-bezier(0,0,.5,1)' },      // 落下・着地
          { transform: `translate(-50%,-50%) translate(${(lx + dir * 6).toFixed(1)}px,${(ly - 22).toFixed(1)}px) scale(1)`, offset: 0.72, easing: 'cubic-bezier(.5,0,1,1)' },   // 小さく跳ねる
          { transform: `translate(-50%,-50%) translate(${(lx + dir * 12).toFixed(1)}px,${ly.toFixed(1)}px) scale(1)`, offset: 0.82, easing: 'ease-out' },
          { transform: `translate(-50%,-50%) translate(${(lx + dir * 22).toFixed(1)}px,${ly.toFixed(1)}px) scale(1)`, offset: 1 },   // 少し転がって止まる
        ], { duration: T, easing: 'linear', fill: 'forwards' });
        img.animate(spinFrames(dir, spin, settle), { duration: T, easing: 'linear', fill: 'forwards' });
        sh.animate([
          { transform: 'translate(-50%,-50%) scale(.3)', opacity: 0 }, { transform: 'translate(-50%,-50%) scale(.5)', opacity: 0.2, offset: 0.34 },
          { transform: 'translate(-50%,-50%) scale(1)', opacity: 0.55, offset: 0.6 }, { transform: `translate(calc(-50% + ${dir * 6}px),-50%) scale(.8)`, opacity: 0.4, offset: 0.72 },
          { transform: `translate(calc(-50% + ${dir * 22}px),-50%) scale(1)`, opacity: 0.55, offset: 1 },
        ], { duration: T, easing: 'linear', fill: 'forwards' });
        await Promise.race([a1.finished.catch(() => {}), wait(T + 200)]);
      } else { mv.style.transform = `translate(-50%,-50%) translate(${lx.toFixed(1)}px,${ly.toFixed(1)}px)`; await wait(T); }
      // 停止：停止画像があれば差し替え、無ければ金色の光の輪＋数字
      const rs = resultSprite(value), res = ov.querySelector('.chdz-res');
      if (rs) { img.src = rs; img.getAnimations && img.getAnimations().forEach((a) => a.cancel()); img.style.transform = 'none'; ov.dataset.face = 'sprite'; }
      else { res.hidden = false; ov.dataset.face = 'number'; }
      await wait(opts.fast ? 120 : C.resultMs);
      ov.classList.add('out'); await wait(160);
      return true;
    } catch (e) { return false; } finally { ov.remove(); locked = false; }
  }
  root.MMCHD = Object.freeze({ configure, roll, rollDice, play, preload, resultSprite, spinFrames, isLocked: () => locked });
})(typeof window !== 'undefined' ? window : globalThis);
