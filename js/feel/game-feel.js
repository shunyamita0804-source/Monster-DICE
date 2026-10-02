// =========================================================
// Game Feel の共通基盤 `MMFEEL`（2026-10-02 商用品質化・第1次）
//  1) LEVEL：出来事の重さ（0 軽いUI操作 … 5 大会・Chapterクリア）。演出の長さ・余韻は LEVEL ごとの値（MOTION）から決める（画面ごとに数字を書かない）
//  2) MOTION（motion tokens）：押下・画面遷移・報酬・遭遇などの時間とイージング。CSS には :root の変数（--mm-*）として渡す
//  3) 押下の手ごたえ：ボタンに指が触れた瞬間にごく軽く沈む（.mm-press。scale のみ・色は変えない）。離すと戻る
//  4) 画面を移るボタン（NAV）：押下の反応を約0.11秒見せてから移る。その間の2回目のタップ・別のボタンは無視（二重遷移の防止）。
//     遷移の種類（施設へ／戻る）で入りかたを変える（html[data-mmtr]）
//  5) 出来事（emit）：名前 → SE（MMAUDIO）＋将来のハプティクス（registerHaptics でネイティブ側へつなぐ。Web では何もしない）
// =========================================================
(function (root) {
  'use strict';
  const fz = Object.freeze;
  const LEVEL = fz({ UI: 0, NORMAL: 1, MINOR: 2, REWARD: 3, ENCOUNTER: 4, MAJOR: 5 });
  /** 時間（ms）とイージング。press＝押下、nav＝押してから移るまで、enter＝画面の入り、hold＝結果を見せる余韻（LEVEL ごと） */
  const MOTION = fz({
    press: fz({ ms: 110, scale: 0.97 }),
    nav: fz({ ms: 110, guard: 260 }),
    enter: fz({ light: 220, facility: 280, back: 200, special: 520 }),
    ease: fz({ ui: 'cubic-bezier(.2,.7,.3,1)', out: 'cubic-bezier(.16,1,.3,1)', in: 'cubic-bezier(.5,0,.75,0)', snap: 'cubic-bezier(.3,1.4,.5,1)' }),
    hold: fz({ 0: 0, 1: 120, 2: 520, 3: 700, 4: 380, 5: 1100 }),   // 結果を見せたあとの余韻（遭遇は次の画面へ続くので短め）
    beat: fz({ 0: 0, 1: 0, 2: 140, 3: 180, 4: 260, 5: 400 }),      // 止まってから結果が出るまでの「間」
    count: fz({ 3: 520, 5: 900 }),                                    // 数値のカウントアップ
  });
  /** 出来事 → 重さ・SE・ハプティクス（ハプティクスの強さは将来のネイティブ側で解釈する名前） */
  const EVENTS = fz({
    'ui.confirm': { level: 0, se: 'UI_CONFIRM' }, 'ui.cancel': { level: 0, se: 'UI_CANCEL' }, 'ui.error': { level: 0, se: 'UI_ERROR', haptic: 'warning' }, 'ui.open': { level: 1, se: 'UI_OPEN' },
    'dice.throw': { level: 1, se: 'DICE_THROW', haptic: 'light' }, 'dice.land': { level: 2, se: 'DICE_LAND', haptic: 'medium' }, 'dice.result': { level: 2, se: 'DICE_ROLL' },
    'tile.stop': { level: 1, se: 'TILE_STOP' }, 'stat.up': { level: 3, se: 'STAT_UP', haptic: 'success' }, 'gold.get': { level: 3, se: 'GOLD_GET', haptic: 'light' },
    'chest.open': { level: 3, se: 'CHEST_OPEN', haptic: 'medium' }, 'event': { level: 2, se: 'EVENT' }, 'wild.alert': { level: 4, se: 'WILD_ALERT', haptic: 'heavy' },
    'battle.start': { level: 4, se: 'BATTLE_START', haptic: 'heavy' }, 'victory': { level: 5, se: 'VICTORY', haptic: 'success' }, 'chapter.start': { level: 5, se: 'CHAPTER_START' },
    'chapter.clear': { level: 5, se: 'CHAPTER_CLEAR', haptic: 'success' }, 'tournament.start': { level: 5, se: 'TOURNAMENT_START' }, 'unlock': { level: 5, se: 'UNLOCK', haptic: 'success' },
  });
  const LOG = [];
  let haptics = null;
  const listeners = [];
  function registerHaptics(fn) { haptics = typeof fn === 'function' ? fn : null; }
  function on(fn) { if (typeof fn === 'function') listeners.push(fn); }
  /** 出来事を知らせる：SE（MMAUDIO）・ハプティクス（登録したときだけ）・購読者。失敗しても投げない */
  function emit(name, detail) {
    const E = EVENTS[name]; if (!E) return null;
    LOG.push({ name, t: Date.now() }); if (LOG.length > 60) LOG.shift();
    try { if (E.se && root.MMAUDIO) root.MMAUDIO.se(E.se); } catch (e) {}
    try { if (E.haptic && haptics) haptics(E.haptic, name, detail); } catch (e) {}
    for (const f of listeners) { try { f(name, E, detail); } catch (e) {} }
    return E;
  }
  const hold = (level) => MOTION.hold[level] != null ? MOTION.hold[level] : 0;
  const beat = (level) => MOTION.beat[level] != null ? MOTION.beat[level] : 0;
  const calm = () => !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const wait = (ms) => new Promise((ok) => setTimeout(ok, calm() ? Math.min(ms, 60) : ms));
  /** 数値のカウントアップ（el の文字を from → to。prefix／suffix つき）。終わると解決 */
  function countUp(el, from, to, ms, fmt) {
    const f = fmt || ((v) => String(v));
    return new Promise((ok) => {
      if (!el) return ok();
      if (calm() || !ms || from === to) { el.textContent = f(to); return ok(); }
      const t0 = performance.now(), d = to - from;
      const tick = (now) => { const k = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - k, 3); el.textContent = f(Math.round(from + d * e)); if (k < 1) requestAnimationFrame(tick); else ok(); };
      requestAnimationFrame(tick);
    });
  }
  /** 要素を軽く弾ませる（.mm-bump を付け直す。CSS のアニメーション） */
  function bump(el, cls = 'mm-bump') { if (!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); setTimeout(() => el.classList.remove(cls), 700); }

  // ---------------------------------------------------------
  // 押下の手ごたえ・画面を移るボタン
  // ---------------------------------------------------------
  const PRESS = 'button, [role="button"], .skt, .p10sl';
  /** 画面を移るボタン：onclick が画面を開く関数で始まるもの、または data-nav を持つもの。値＝入りかた */
  const NAV_FN = fz({ market: 'facility', farm: 'facility', museum: 'facility', profileScr: 'facility', savescr: 'facility', newsScr: 'facility', confScr: 'facility', shopScr: 'facility',
    hall: 'facility', prepScr: 'facility', lobby: 'back' });
  const NAV_ONLY_BARE = fz(['farm']);   // 引数なしで呼んだときだけ画面を移る関数
  function navKind(el) {
    if (!el || el.disabled) return null;
    if (el.dataset && el.dataset.nav) return el.dataset.nav;
    const oc = el.getAttribute && el.getAttribute('onclick'); if (!oc) return null;
    const m = oc.match(/^\s*([A-Za-z_$][\w$]*)\s*\((\s*\))?/); if (!m || !NAV_FN[m[1]]) return null;
    if (NAV_ONLY_BARE.includes(m[1]) && !m[2]) return null;   // 牧場の中のタブ（farm('','a') など）は画面の移動ではない
    return NAV_FN[m[1]];
  }
  const NAV = { pending: null, until: 0, count: 0 };
  /** 次の画面の入りかた（html[data-mmtr]。CSS の #app>* のアニメーション）。少したったら外す */
  function transition(kind) {
    const h = root.document && root.document.documentElement; if (!h) return;
    h.dataset.mmtr = kind || 'light'; clearTimeout(transition.t); transition.t = setTimeout(() => { delete h.dataset.mmtr; }, 900);
  }
  function setupInput(doc) {
    let pressed = null, t0 = 0;
    const release = () => { const el = pressed; pressed = null; if (!el) return; const left = MOTION.press.ms - (Date.now() - t0); setTimeout(() => el.classList.remove('mm-press'), Math.max(0, left)); };
    doc.addEventListener('pointerdown', (e) => {
      const el = e.target && e.target.closest ? e.target.closest(PRESS) : null; if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return;
      if (pressed && pressed !== el) pressed.classList.remove('mm-press');
      pressed = el; t0 = Date.now(); el.classList.add('mm-press');
    }, { capture: true, passive: true });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave', 'dragstart']) doc.addEventListener(ev, release, { capture: true, passive: true });
    // 画面を移るボタン：押下の反応を見せてから移る。待っている間・移った直後のタップは無視（二重遷移の防止）
    doc.addEventListener('click', (e) => {
      const el = e.target && e.target.closest ? e.target.closest('button,[role="button"],[data-nav]') : null; if (!el) return;
      const kind = navKind(el); if (!kind) return;
      if (el.dataset.mmGo) return;   // 待ったあとの本当のクリック（下の setTimeout）
      if (NAV.pending || (Date.now() < NAV.until && !root.MM_QA_NAV_INSTANT)) { e.preventDefault(); e.stopImmediatePropagation(); return; }
      if (!e.isTrusted || calm() || root.MM_QA_NAV_INSTANT) { transition(kind); NAV.until = Date.now() + MOTION.nav.guard; NAV.count++; return; }   // スクリプトからのクリック・視差を減らす設定・自動テスト（MM_QA_NAV_INSTANT。押下の待ちは tests/qa-e2e-feel の FE-1 で確かめる）はすぐ移る
      e.preventDefault(); e.stopImmediatePropagation();
      NAV.pending = el; el.classList.add('mm-press', 'mm-go'); emit('ui.confirm');
      setTimeout(() => {
        NAV.pending = null; el.classList.remove('mm-press', 'mm-go');
        if (!el.isConnected || el.disabled) return;
        transition(kind); NAV.until = Date.now() + MOTION.nav.guard; NAV.count++;
        el.dataset.mmGo = '1'; el.dataset.nsfx = '1';
        try { el.click(); } finally { delete el.dataset.mmGo; delete el.dataset.nsfx; }
      }, MOTION.nav.ms);
    }, true);
  }
  function setupTokens(doc) {
    const s = doc.documentElement.style;
    s.setProperty('--mm-press-scale', String(MOTION.press.scale)); s.setProperty('--mm-press-ms', `${MOTION.press.ms}ms`);
    for (const [k, v] of Object.entries(MOTION.enter)) s.setProperty(`--mm-enter-${k}`, `${v}ms`);
    for (const [k, v] of Object.entries(MOTION.ease)) s.setProperty(`--mm-ease-${k}`, v);
  }
  if (root.document && root.document.addEventListener) { setupInput(root.document); if (root.document.documentElement) setupTokens(root.document); }

  root.MMFEEL = fz({ LEVEL, MOTION, EVENTS, emit, on, registerHaptics, hold, beat, wait, countUp, bump, transition, navKind, NAV_FN,
    log: () => LOG.map((x) => x.name), navState: () => ({ pending: !!NAV.pending, count: NAV.count, guardLeft: Math.max(0, NAV.until - Date.now()) }) });
})(typeof window !== 'undefined' ? window : globalThis);
