// =========================================================
// Chapterフィールドのサイコロ（window.MMCHD）：出目の決定（rollDice）と見せ方（play）を分ける
//  ・rollingSprite：回転中の正式サイコロ本体（今ある正式画像1枚＝上面1・左面2・右面3。assets/fields/ch1a/dice/dice_rolling.webp）
//    連番画像は使わず、この1枚を translate・rotate・scale・影で動かす：画面下から飛び出す → 空中で回転 → 落下 → 着地 → 小さく1回跳ねる → 少し横へ転がる → 停止（約1秒）
//  ・resultSprites：出目ごとの停止画像（dice_stop_1〜3）。今は未登録（空）。1枚の画像を回して「2が上」「3が上」を偽造しない
//    → 未登録の間は、止まったサイコロの上に金色の光の輪と数字（「3！」）を短く出す。
//    停止画像が届いたら configure({ resultSprites: { 1: '…/dice_stop_1.webp', 2: '…', 3: '…' } }) だけで、数字の代わりにその画像を出す
//  ・出目は MMP7.rollDice（1〜3 等確率）。テストでは rollDice({ forcedResult: 3 }) で固定できる
//  ・演出中は isLocked() が true（サイコロ・休む・分岐の重複操作を防ぐ）
// =========================================================
(function (root) {
  'use strict';
  const C = { rollingSprite: './assets/fields/ch1a/dice/dice_rolling.webp', resultSprites: {}, min: 1, max: 3, ms: 1050, resultMs: 560 };
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
  /** 見せ方だけ（出目は決まっている）。DOM・アニメーションが使えない環境では何もせず true */
  async function play(value, opts = {}) {
    if (!valid(value)) return false;
    if (typeof document === 'undefined' || !document.body) return true;
    preload(); locked = true;
    const host = opts.host || document.body, calm = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const ov = document.createElement('div'); ov.className = 'chdz'; ov.setAttribute('aria-live', 'polite'); ov.dataset.result = String(value);
    const jx = (Math.random() * 2 - 1) * 14, dir = Math.random() < 0.5 ? -1 : 1, spin = 720 + Math.floor(Math.random() * 3) * 90;   // 着地位置・転がる向き・回転量に小さなばらつき
    ov.innerHTML = `<div class="chdz-sh"></div><div class="chdz-mv"><img class="chdz-img" alt="サイコロ" src="${C.rollingSprite}" draggable="false"></div><div class="chdz-res" hidden><span class="chdz-ring"></span><b>${value}</b><i>！</i></div>`;
    host.appendChild(ov);
    try {
      const mv = ov.querySelector('.chdz-mv'), img = ov.querySelector('.chdz-img'), sh = ov.querySelector('.chdz-sh'), T = calm ? 260 : C.ms;
      if (!calm && mv.animate) {
        const E = 'cubic-bezier(.3,0,.25,1)';
        const a1 = mv.animate([
          { transform: 'translate(-50%,0) translate(0px,38vh) scale(.55)', opacity: 0, offset: 0 },
          { transform: `translate(-50%,0) translate(${jx * 0.3}px,-6vh) scale(1.08)`, opacity: 1, offset: 0.2 },
          { transform: `translate(-50%,0) translate(${jx * 0.6}px,-17vh) scale(1.02)`, offset: 0.38 },
          { transform: `translate(-50%,0) translate(${jx}px,0) scale(1)`, offset: 0.62, easing: 'cubic-bezier(.5,0,1,1)' },
          { transform: `translate(-50%,0) translate(${jx + dir * 6}px,-3.2vh) scale(1)`, offset: 0.74, easing: 'cubic-bezier(0,0,.5,1)' },
          { transform: `translate(-50%,0) translate(${jx + dir * 12}px,0) scale(1)`, offset: 0.84 },
          { transform: `translate(-50%,0) translate(${jx + dir * 26}px,0) scale(1)`, offset: 1 },
        ], { duration: T, easing: 'linear', fill: 'forwards' });
        img.animate([
          { transform: 'rotate(0deg)' }, { transform: `rotate(${dir * spin * 0.55}deg)`, offset: 0.38 }, { transform: `rotate(${dir * spin}deg)`, offset: 0.62 },
          { transform: `rotate(${dir * (spin + 30)}deg)`, offset: 0.84 }, { transform: `rotate(${dir * (spin + 90)}deg)`, offset: 1 },
        ], { duration: T, easing: E, fill: 'forwards' });
        sh.animate([
          { transform: `translate(-50%,0) scale(.2)`, opacity: 0 }, { transform: `translate(calc(-50% + ${jx * 0.6}px),0) scale(.45)`, opacity: 0.25, offset: 0.38 },
          { transform: `translate(calc(-50% + ${jx}px),0) scale(1)`, opacity: 0.55, offset: 0.62 }, { transform: `translate(calc(-50% + ${jx + dir * 6}px),0) scale(.78)`, opacity: 0.4, offset: 0.74 },
          { transform: `translate(calc(-50% + ${jx + dir * 26}px),0) scale(1)`, opacity: 0.55, offset: 1 },
        ], { duration: T, easing: 'linear', fill: 'forwards' });
        await Promise.race([a1.finished.catch(() => {}), wait(T + 200)]);
      } else await wait(T);
      // 停止：停止画像があれば差し替え、無ければ金色の光の輪＋数字
      const rs = resultSprite(value), res = ov.querySelector('.chdz-res');
      if (rs) { img.src = rs; img.style.transform = 'none'; img.getAnimations && img.getAnimations().forEach((a) => a.cancel()); ov.dataset.face = 'sprite'; }
      else { res.hidden = false; ov.dataset.face = 'number'; }
      await wait(opts.fast ? 120 : C.resultMs);
      ov.classList.add('out'); await wait(160);
      return true;
    } catch (e) { return false; } finally { ov.remove(); locked = false; }
  }
  root.MMCHD = Object.freeze({ configure, roll, rollDice, play, preload, resultSprite, isLocked: () => locked });
})(typeof window !== 'undefined' ? window : globalThis);
