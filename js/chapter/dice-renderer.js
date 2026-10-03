// =========================================================
// Chapterフィールドのサイコロ（window.MMCHD）：出目の決定（rollDice）と見せ方（play）を分ける
//  ・出目は MMP7.rollDice（1〜3 等確率）。STOP を押すタイミングで出目を狙える仕様にはしない（表示と乱数は別。テストでは rollDice({ forcedResult: 3 })）
//  ・rollingSprite：回転中の正式サイコロ本体（今ある正式画像1枚＝上面1・左面2・右面3。assets/fields/ch1a/dice/dice_rolling.webp）
//    連番画像は使わず、この1枚を translate・rotate・scale・影で動かす：
//    STOP の上で浮いていた場所（opts.from）から飛び上がる → 空中で速く回る → 減速しながらフィールドの手前（opts.land）へ落ちる → 着地 → 小さく1回跳ねる →
//    少し横へ転がる → 最後の約0.18秒で正式の角度（0°）へ自然に戻って止まる（傾いたまま止まらない。回転量は 360° の倍数に収束）
//  ・resultSprites：出目ごとの停止面（1・2・3 が上の面）。ゲームでは config.dice（ch1a.js）から configure する（今は暫定の SVG＝dice_stop_1〜3.svg。正式画像が届いたらファイルを差し替えるだけ）。
//    止まる瞬間に、回転中の絵から停止面へ短くクロスフェードし、内部の出目と表示の面を必ず一致させる。1枚の画像を回して「2が上」「3が上」を偽造しない。
//    未登録のとき（このモジュール単体の既定）は、止まったサイコロの上に金色の光の輪と数字（「3！」）を出す
//  ・演出中は isLocked() が true（サイコロ・休む・分岐・アイテムの重複操作を防ぐ）。phase()：'auto'（回転〜着地）→ 'result'（停止面）。旧 manualStop は 'spin' → 'land'
// =========================================================
(function (root) {
  'use strict';
  // sides：面の数（config.dice.sides。省略時は 3）。resultSprites に無い出目（例：6面で 4〜6 の停止画像が未着）は、数字の輪で出す（fallback。エンジン・演出は止まらない）
  //  1タップ（2026-10-01 正式）：play(value) は START の1回の押下で「出現 → 飛び上がって速く回る（約0.3秒）→ 落ちながら減速（約0.6秒）→ 着地・小さく跳ねる → 停止面（約0.42秒）→ 消える」まで
  //   自動で進む（合計約1.7秒。ms＝回転〜着地、resultMs＝停止面を見せる時間）。出目は play を呼ぶ前に決まっている（演出の長さ・止まる瞬間は確率を変えない）。
  //  manualStop:true（旧 START／STOP。通常の Chapter では使わない）：宙で回り続け、requestStop() で落ちて止まる。API は互換のため残す
  //  2026-10-03（試遊で「軽すぎる」）：throwFrames（既存の正式10コマ＝assets/dice/std/01〜10。描き直さない）があれば、投げる → 空中 → 着地の衝撃 → 跳ねる を10コマで見せ、
  //   そのあと停止面（resultSprites）で短く転がって減速 → 完全に止まる → その瞬間に dice.stop（停止の音の差し込み口。今は無音）→ 出目を見せる（dice.result）。
  //   ms＝出現〜完全停止、airMs＝投げて着地まで、impactMs＝着地の衝撃（08・09）、bounceMs＝小さく跳ねる、rollMs＝転がって減速。frameBox＝10コマの絵の中のサイコロ（10コマ目）の位置と高さ（画素）
  const C = { rollingSprite: './assets/fields/ch1a/dice/dice_rolling.webp', resultSprites: {}, min: 1, max: 3, sides: 3, ms: 1660, resultMs: 520, settleMs: 180, upMs: 360, landMs: 640,
    throwFrames: null, airMs: 560, impactMs: 200, bounceMs: 260, rollMs: 640, frameBox: { w: 561, h: 449, cx: 279.5, cy: 244, dh: 338 } };
  let locked = false, cache = null, phase = null, stopResolve = null, lastTiming = null;
  function configure(o) {
    if (o && typeof o === 'object') {
      Object.assign(C, o); if (o.resultSprites) C.resultSprites = { ...o.resultSprites }; cache = null;
      if (Number.isInteger(o.sides) && o.sides >= 1) { C.sides = o.sides; C.min = 1; C.max = o.sides; } else if (Number.isInteger(o.max)) C.sides = C.max - C.min + 1;
    }
    return { ...C, resultSprites: { ...C.resultSprites } };
  }
  const valid = (v) => Number.isInteger(v) && v >= C.min && v <= C.max;
  /** 出目だけを決める（描画しない）。forcedResult があればそれ（テスト用）。面の数は configure({ sides }) */
  function roll({ forcedResult, rnd } = {}) {
    if (forcedResult != null) { if (!valid(forcedResult)) throw new Error(`MMCHD：forcedResult は ${C.min}〜${C.max}`); return forcedResult; }
    const P7 = root.MMP7; return P7 && P7.rollDie ? P7.rollDie(C.max - C.min + 1, rnd || Math.random) : C.min + Math.floor((rnd || Math.random)() * (C.max - C.min + 1));
  }
  /** 出目を決めて演出する：{ result, animationPromise } */
  function rollDice(opts = {}) { const result = roll(opts); return { result, animationPromise: opts.animate === false ? Promise.resolve(true) : play(result, opts) }; }
  const resultSprite = (v) => { const s = C.resultSprites && C.resultSprites[v]; return typeof s === 'string' && s ? s : null; };
  function preload() { if (cache || typeof Image === 'undefined') return; cache = [C.rollingSprite, ...Object.values(C.resultSprites || {}), ...(Array.isArray(C.throwFrames) ? C.throwFrames : [])].map((src) => { const im = new Image(); im.decoding = 'async'; im.src = src; return im; }); }
  /** 先読みが終わった画像か（読み込み途中の画像へ差し替えない） */
  const isReady = (src) => !!(src && cache && cache.some((im) => im.complete && im.naturalWidth > 0 && im.src.endsWith(String(src).replace(/^\.\//, ''))));
  const frame = () => new Promise((ok) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => ok()) : setTimeout(ok, 16)));
  const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
  /**
   * 回転の時間割（0〜1）：速く回る → 減速 → 着地でほぼ止まる → 跳ねと転がりで少し進む → 最後に正式の角度へ収束。
   *  final は 360 の倍数（見た目は 0°）。settle は最後の収束にかける割合
   */
  function spinFrames(dir, spin, settle, startDeg = 0) {
    // startDeg：今の角度から続ける（STOP の瞬間の角度）。収束の区間（settle）は最後の 26% まで（手前の keyframe 0.72 より後ろ）
    const b = startDeg, fin = Math.round((b + spin + 140) / 360) * 360, s = Math.max(0.74, 1 - settle);
    return [
      { transform: `rotate(${dir * b}deg)`, offset: 0, easing: 'cubic-bezier(.2,0,.4,1)' },
      { transform: `rotate(${dir * (b + spin * 0.62)}deg)`, offset: 0.34, easing: 'cubic-bezier(.3,0,.6,1)' },
      { transform: `rotate(${dir * (b + spin)}deg)`, offset: 0.6, easing: 'ease-out' },
      { transform: `rotate(${dir * (b + spin + 70)}deg)`, offset: 0.72, easing: 'ease-out' },
      { transform: `rotate(${dir * (fin - 34)}deg)`, offset: s, easing: 'cubic-bezier(.25,.1,.25,1)' },
      { transform: `rotate(${dir * fin}deg)`, offset: 1 },
    ];
  }
  /**
   * 回転中の面（2026-10-01）：無地の宝石に見えないよう、正式の停止画像（resultSprites＝各出目が上の面）を回転に合わせて切り替える。
   *  速く回る間は短い間隔、落ちながら長い間隔、着地（全体の 60%）の少し前からは出目の面のまま。出目・確率には触れない（見た目だけ）。
   *  停止画像が全部そろっていないとき（C.spinFaces:false を含む）は、従来どおり rollingSprite のまま
   */
  function spinFaces(img, value, T) {
    if (C.spinFaces === false) return;
    const faces = []; for (let v = C.min; v <= C.max; v++) { const s = resultSprite(v); if (!s) return; faces.push(v); }
    const sched = [], landAt = T * 0.5; let t = 0, k = 0, prev = value;
    while (t < landAt) { const p = t / landAt, gap = 70 + 150 * p * p; let v; do { v = faces[(k++ * 5 + 3) % faces.length]; } while (v === prev && faces.length > 1); sched.push([t, v]); prev = v; t += gap; }
    sched.push([landAt, value]);
    // 先読み（preload）が終わった面だけに切り替える（読み込み途中の画像へ差し替えて通信を打ち切らない。無ければその回は飛ばす）
    const ready = (src) => !!(cache && cache.some((im) => im.complete && im.naturalWidth > 0 && im.src.endsWith(src.replace(/^\.\//, ''))));
    for (const [ms, v] of sched) setTimeout(() => { const src = resultSprite(v); if (img.isConnected && ready(src)) img.src = src; }, ms);
    img.dataset.faces = String(sched.length);
  }
  /** 見せ方だけ（出目は決まっている）。DOM・アニメーションが使えない環境では何もせず true */
  const feel = (n) => { try { if (root.MMFEEL) root.MMFEEL.emit(n); } catch (e) {} };   // 出来事（音・ハプティクス）は MMFEEL へ
  async function play(value, opts = {}) {
    if (!valid(value)) return false;
    if (typeof document === 'undefined' || !document.body) return true;
    preload(); locked = true;
    let landT = 0;
    const tStart = (typeof performance !== 'undefined' ? performance.now() : Date.now()), tick = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) - tStart; let tSpin = 0, tFace = 0;
    const host = opts.host || document.body, calm = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const hw = host.clientWidth || 390, hh = host.clientHeight || 700;
    const from = opts.from || { x: hw / 2, y: hh * 0.9 }, land = opts.land || { x: hw / 2, y: hh * 0.56 };
    const ov = document.createElement('div'); ov.className = 'chdz'; ov.setAttribute('aria-live', 'polite'); ov.dataset.result = String(value);
    const jx = (Math.random() * 2 - 1) * 12, dir = Math.random() < 0.5 ? -1 : 1, spin = 900 + Math.floor(Math.random() * 3) * 90;   // 着地位置・転がる向き・回転量に小さなばらつき（止まる角度は常に正式）
    const lx = land.x - from.x + jx, ly = land.y - from.y;
    ov.innerHTML = `<div class="chdz-sh" style="left:${(land.x + jx).toFixed(1)}px;top:${land.y.toFixed(1)}px"></div><div class="chdz-mv" style="left:${from.x.toFixed(1)}px;top:${from.y.toFixed(1)}px"><img class="chdz-img" alt="サイコロ" src="${C.rollingSprite}" draggable="false"></div><div class="chdz-res" hidden style="left:${(land.x + jx + dir * 22).toFixed(1)}px;top:${land.y.toFixed(1)}px"><span class="chdz-ring"></span><b>${value}</b><i>！</i></div>`;
    host.appendChild(ov);
    try {
      const mv = ov.querySelector('.chdz-mv'), img = ov.querySelector('.chdz-img'), sh = ov.querySelector('.chdz-sh'), T = calm ? 260 : (C.legacyMs || 980), settle = Math.min(0.3, C.settleMs / T);
      if (opts.manualStop) {
        // START → 宙で回り続ける（spin）→ プレイヤーの STOP（requestStop）で落ちて止まる（land）。回転は止めた瞬間の角度から正式の角度へ収束
        const ax = lx * 0.5, ay = ly - 110;   // 宙に浮く位置（着地点の上）
        phase = 'spin'; ov.dataset.phase = 'spin';
        const stopP = new Promise((ok) => { stopResolve = ok; });
        if (!calm && mv.animate) {
          mv.animate([{ transform: 'translate(-50%,-50%) translate(0px,0px) scale(.9)', easing: 'cubic-bezier(.2,.6,.4,1)' }, { transform: `translate(-50%,-50%) translate(${ax.toFixed(1)}px,${ay.toFixed(1)}px) scale(1.16)` }], { duration: C.upMs, fill: 'forwards' });
          sh.animate([{ transform: 'translate(-50%,-50%) scale(.3)', opacity: 0 }, { transform: 'translate(-50%,-50%) scale(.5)', opacity: 0.2 }], { duration: C.upMs, fill: 'forwards' });
          img.classList.add('spin');
        } else { mv.style.transform = `translate(-50%,-50%) translate(${ax.toFixed(1)}px,${ay.toFixed(1)}px)`; }
        const t0 = performance.now();
        await stopP;
        stopResolve = null; phase = 'land'; ov.dataset.phase = 'land';
        const T2 = calm ? 200 : C.landMs, settle2 = Math.min(0.3, C.settleMs / T2);
        if (!calm && mv.animate) {
          const deg = ((performance.now() - t0) / 900 * 360) % 360;   // CSS の回転（0.9秒で1回転）の今の角度から続ける
          img.classList.remove('spin'); img.style.transform = `rotate(${(dir * deg).toFixed(1)}deg)`;
          const a2 = mv.animate([
            { transform: `translate(-50%,-50%) translate(${ax.toFixed(1)}px,${ay.toFixed(1)}px) scale(1.16)`, offset: 0, easing: 'cubic-bezier(.4,0,.8,.6)' },
            { transform: `translate(-50%,-50%) translate(${lx.toFixed(1)}px,${ly.toFixed(1)}px) scale(1)`, offset: 0.42, easing: 'cubic-bezier(0,0,.5,1)' },
            { transform: `translate(-50%,-50%) translate(${(lx + dir * 6).toFixed(1)}px,${(ly - 22).toFixed(1)}px) scale(1)`, offset: 0.6, easing: 'cubic-bezier(.5,0,1,1)' },
            { transform: `translate(-50%,-50%) translate(${(lx + dir * 12).toFixed(1)}px,${ly.toFixed(1)}px) scale(1)`, offset: 0.75, easing: 'ease-out' },
            { transform: `translate(-50%,-50%) translate(${(lx + dir * 22).toFixed(1)}px,${ly.toFixed(1)}px) scale(1)`, offset: 1 },
          ], { duration: T2, easing: 'linear', fill: 'forwards' });
          img.animate(spinFrames(dir, 420, settle2, deg), { duration: T2, easing: 'linear', fill: 'forwards' });
          sh.animate([{ transform: 'translate(-50%,-50%) scale(.5)', opacity: 0.2 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: 0.55, offset: 0.42 }, { transform: `translate(calc(-50% + ${dir * 22}px),-50%) scale(1)`, opacity: 0.55, offset: 1 }], { duration: T2, easing: 'linear', fill: 'forwards' });
          await Promise.race([a2.finished.catch(() => {}), wait(T2 + 200)]);
        } else { mv.style.transform = `translate(-50%,-50%) translate(${lx.toFixed(1)}px,${ly.toFixed(1)}px)`; await wait(T2); }
      } else if (!calm && mv.animate && Array.isArray(C.throwFrames) && C.throwFrames.length >= 10 && C.throwFrames.every(isReady) && faceSet().length) {
        await physical(ov, mv, img, sh, value, lx, ly, dir);
      } else if (!calm && mv.animate) {
        // 1タップ：START の位置から飛び上がって速く回る → 落ちながら減速 → 着地 → 小さく跳ねて止まる（自動。止める操作は無い）
        phase = 'auto'; ov.dataset.phase = 'auto';
        feel('dice.throw'); landT = setTimeout(() => { ov.classList.add('landed'); feel('dice.land'); }, T * 0.6);   // 着地の瞬間（音・将来のハプティクス）
        spinFaces(img, value, T);   // 回転中も各面（1〜sides の停止画像）が一瞬ずつ見える。着地の前から出目の面に落ち着く
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
      } else { phase = 'auto'; ov.dataset.phase = 'auto'; mv.style.transform = `translate(-50%,-50%) translate(${lx.toFixed(1)}px,${ly.toFixed(1)}px)`; await wait(T); }
      if (!ov.dataset.stopped) { ov.dataset.stopped = '1'; feel('dice.stop'); }   // 旧い見せ方・視差を減らす設定：ここで止まった
      tSpin = tick(); phase = 'result'; ov.dataset.phase = 'result'; feel('dice.result');
      // 停止：停止画像があれば差し替え、無ければ金色の光の輪＋数字
      //  停止面（出目ごとの画像）があれば、回転中の絵から停止面へ短くクロスフェード（急に差し替えない）。無ければ金色の光の輪＋数字
      const rs = resultSprite(value), res = ov.querySelector('.chdz-res');
      if (rs && ov.dataset.phase === 'lock') {
        // 物理的な見せ方（LOCK 済み）：止まった絵をそのまま出目の面として見せる（新しい画像に差し替えない・弾ませない＝止まったあとに面が動いて見えない）。金の光の輪だけ後ろに
        img.classList.add('chdz-stop', 'on', 'locked'); mv.insertAdjacentHTML('afterbegin', '<i class="chdz-glow"></i>'); ov.dataset.face = 'sprite'; await wait(calm ? 0 : 160);
      } else if (rs) {
        const stop = document.createElement('img'); stop.className = 'chdz-stop'; stop.alt = `出目 ${value}`; stop.src = rs; stop.draggable = false; mv.appendChild(stop);
        void stop.offsetWidth; stop.classList.add('on', 'pop'); img.classList.add('off'); mv.insertAdjacentHTML('beforeend', '<i class="chdz-glow"></i>');   // 出目の面が小さく弾み、金の光の輪＝「3が出た」と分かる間（resultMs）
        ov.dataset.face = 'sprite'; await wait(calm ? 0 : 160);
      } else { res.hidden = false; ov.dataset.face = 'number'; }
      await wait(opts.fast ? 120 : C.resultMs);
      tFace = tick() - tSpin;
      ov.classList.add('out'); await wait(160);
      lastTiming = { value, spinMs: Math.round(tSpin), faceMs: Math.round(tFace), totalMs: Math.round(tick()), calm, manual: !!opts.manualStop };
      return true;
    } catch (e) { if (root.MM_QA_DEBUG) console.warn('MMCHD.play', e); return false; } finally { clearTimeout(landT); ov.remove(); locked = false; phase = null; stopResolve = null; }
  }
  /** 停止面がそろっている出目（転がる間に見せる面） */
  function faceSet() { const out = []; for (let v = C.min; v <= C.max; v++) { const s = resultSprite(v); if (!s || !isReady(s)) return []; out.push(v); } return out; }
  /**
   * 物理的な見せ方（2026-10-03）：投げる（01〜07）→ 着地の衝撃（08・09）→ 小さく跳ねる（10）→ 停止面で短く転がって減速 → 完全に止まる。
   *  止まった絵＝出目の面（転がる最後の約0.3秒は出目の面のまま滑って止まる）。完全に止まったフレームで dice.stop（停止の音の差し込み口）。
   *  出目は play の前に決まっている（見た目だけ。乱数・確率には触れない）
   */
  async function physical(ov, mv, img, sh, value, lx, ly, dir) {
    // 2026-10-03（実機で「止まったあとも面が変わって見える」）：状態を ROLL → LAND → BOUNCE → SETTLE → LOCK に分け、絵の切り替えは setTimeout ではなく
    //  動き（Web Animations）の時刻 currentTime に合わせて rAF で進める（タイマーの遅れで、止まって見えたあとに面が変わらない）。LOCK のあとは
    //  動きが完全に終わった時点で LOCK。LOCK のあとは絵・向き・面・出目を一切変えない（最後の約0.3秒は出目の面に固定したまま滑る）
    const setPhase = (p) => { phase = p === 'lock' ? 'lock' : 'auto'; ov.dataset.phase = p; };
    setPhase('roll');
    const B = C.frameBox, box = mv.clientWidth || 88, k = box / B.dh, F = C.throwFrames;
    const fr = document.createElement('img'); fr.className = 'chdz-fr'; fr.alt = ''; fr.draggable = false; fr.src = F[0];
    fr.style.cssText = `width:${(B.w * k).toFixed(1)}px;height:${(B.h * k).toFixed(1)}px;left:${(box / 2 - B.cx * k).toFixed(1)}px;top:${(box / 2 - B.cy * k).toFixed(1)}px`;
    mv.appendChild(fr); img.classList.add('off');
    const air = C.airMs, imp = C.impactMs, bnc = C.bounceMs, rol = C.rollMs, total = air + imp + bnc + rol;
    let faceLock = false; const E = [];   // 時刻（ms）→ 切り替え。LOCK のあとの面の切り替えは無視
    const ev = (ms, fn) => E.push([ms, fn]), face = (src) => { if (!faceLock) img.src = src; };
    // ---- 投げる → 空中（01〜07）：START の位置から弧を描いて着地点へ ----
    feel('dice.throw');
    for (let i = 1; i <= 6; i++) ev(Math.round(air * i / 7), () => { fr.src = F[i]; });
    // ---- 着地の衝撃（08・09）→ 跳ねる（10）----
    ev(air, () => { fr.src = F[7]; ov.classList.add('landed'); setPhase('land'); feel('dice.land'); });
    ev(air + imp * 0.5, () => { fr.src = F[8]; });
    ev(air + imp, () => { fr.src = F[9]; setPhase('bounce'); });
    // ---- 停止面で転がる（SETTLE）：面の切り替えは減速に合わせて間隔が伸びる。最後の約0.3秒は出目の面のまま滑る（LOCK）----
    const faces = faceSet(), r0 = air + imp + bnc * 0.55, lock = total - 300; let t = r0, n = 0, prev = 0;
    ev(r0, () => { setPhase('settle'); face(resultSprite(faces[(n++ * 5 + 3) % faces.length])); img.classList.remove('off'); fr.classList.add('off'); });
    while (true) { const p = (t - r0) / Math.max(1, lock - r0); t += 70 + 170 * p * p; if (t >= lock) break; let v; do { v = faces[(n++ * 5 + 3) % faces.length]; } while (v === prev && faces.length > 1); prev = v; const src = resultSprite(v); ev(t, () => face(src)); }
    ev(lock, () => { img.src = resultSprite(value); faceLock = true; });   // 出目の面に固定（このあと 0.3秒は面を変えずに滑って止まる＝SETTLE の終わり）
    E.sort((a, b) => a[0] - b[0]);
    img.dataset.faces = String(n + 1);
    const P = (x, y, s = 1) => `translate(-50%,-50%) translate(${x.toFixed(1)}px,${y.toFixed(1)}px) scale(${s})`;
    const o1 = air / total, o2 = (air + imp) / total, o3 = (air + imp + bnc * 0.5) / total, o4 = (air + imp + bnc) / total;
    const a1 = mv.animate([
      { transform: P(0, 0, 0.85), offset: 0, easing: 'cubic-bezier(.15,.7,.35,1)' },
      { transform: P(lx * 0.4, ly - 96, 1.16), offset: o1 * 0.45, easing: 'cubic-bezier(.55,0,.85,.5)' },   // 投げ上げて頂点
      { transform: P(lx, ly, 1), offset: o1, easing: 'linear' },                                              // 落ちて着地
      { transform: P(lx + dir * 3, ly + 2, 1.04), offset: o2, easing: 'cubic-bezier(.2,.7,.4,1)' },           // 着地の衝撃（少し沈む）
      { transform: P(lx + dir * 10, ly - 20, 1), offset: o3, easing: 'cubic-bezier(.6,0,.9,.6)' },           // 小さく跳ねる
      { transform: P(lx + dir * 16, ly, 1), offset: o4, easing: 'cubic-bezier(.1,.6,.3,1)' },                // もう一度着地 → 転がって減速
      { transform: P(lx + dir * 44, ly, 1), offset: 1 },                                                     // 完全に止まる
    ], { duration: total, easing: 'linear', fill: 'forwards' });
    const rr = img.animate([   // 転がる間の傾き：揺れながら小さくなり、正式の角度（0°）で止まる
      { transform: `rotate(${dir * 28}deg)`, offset: 0 }, { transform: `rotate(${dir * 28}deg)`, offset: o3 },
      { transform: `rotate(${-dir * 12}deg)`, offset: o4 + (1 - o4) * 0.3, easing: 'ease-in-out' }, { transform: `rotate(${dir * 4}deg)`, offset: o4 + (1 - o4) * 0.65, easing: 'ease-out' },
      { transform: 'rotate(0deg)', offset: 1 },
    ], { duration: total, easing: 'linear', fill: 'forwards' });
    sh.animate([
      { transform: 'translate(-50%,-50%) scale(.3)', opacity: 0 }, { transform: 'translate(-50%,-50%) scale(.45)', opacity: 0.18, offset: o1 * 0.45 },
      { transform: 'translate(-50%,-50%) scale(1.05)', opacity: 0.6, offset: o1 }, { transform: `translate(calc(-50% + ${dir * 10}px),-50%) scale(.8)`, opacity: 0.4, offset: o3 },
      { transform: `translate(calc(-50% + ${dir * 16}px),-50%) scale(1)`, opacity: 0.55, offset: o4 }, { transform: `translate(calc(-50% + ${dir * 44}px),-50%) scale(1)`, opacity: 0.55, offset: 1 },
    ], { duration: total, easing: 'linear', fill: 'forwards' });
    // 動きの時刻で切り替えを進める（rAF。タブが裏に回って rAF が止まっても、最後は下でそろえる）
    let ei = 0, done = false; const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const clock = () => { const c = a1.currentTime; return typeof c === 'number' ? c : ((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0); };
    const run = (upTo) => { while (ei < E.length && E[ei][0] <= upTo) { if (ov.isConnected) E[ei][1](); ei++; } };
    const raf = root.requestAnimationFrame ? (f) => root.requestAnimationFrame(f) : (f) => setTimeout(f, 16);
    const loop = () => { if (done) return; run(clock()); if (ei < E.length) raf(loop); };
    raf(loop);
    try { await Promise.race([Promise.all([a1.finished, rr.finished]).catch(() => {}), wait(total + 250)]); } finally { done = true; run(Infinity); }
    img.src = resultSprite(value); faceLock = true; setPhase('lock'); fr.remove();
    await frame();   // 止まった姿が描かれたフレームで「完全停止」
    ov.dataset.stopped = '1'; feel('dice.stop');
  }
  /** STOP：宙で回っているサイコロを止める（出目は既に決まっている）。回っていなければ false */
  function requestStop() { if (!stopResolve) return false; const f = stopResolve; stopResolve = null; f(); return true; }
  /** 停止面が登録されていない出目（数字で出す出目）。正式な停止画像が届く前の確認用 */
  const missingSprites = () => { const out = []; for (let v = C.min; v <= C.max; v++) if (!resultSprite(v)) out.push(v); return out; };
  /** 直前の演出の実測（spinMs＝出現〜着地、faceMs＝停止面を見せた時間、totalMs＝消えるまで。テスト・報告用） */
  root.MMCHD = Object.freeze({ configure, roll, rollDice, play, preload, resultSprite, missingSprites, spinFrames, requestStop, isLocked: () => locked, phase: () => phase, lastTiming: () => (lastTiming ? { ...lastTiming } : null), spinFaces });
})(typeof window !== 'undefined' ? window : globalThis);
