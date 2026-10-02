// =========================================================
// Audio Manager `MMAUDIO`（2026-10-02 商用品質化・第1次）
//  ゲームの音は「場面（BGM scene）」と「出来事（SE）」の名前で鳴らす。実際の音源は後から登録して差し替える：
//   - registerBgm(scene, src, { volume, loop })：正式な BGM ファイル（今は未着＝何も登録していない）
//   - registerSe(name, src, { volume })：正式な SE ファイル（今は未着）
//   - attachLegacy({ bgm, sfx, muted, setMuted })：index.html の今の合成音（WebAudio の bgm()／sfx()）。ファイルが無い場面・出来事はこれで鳴らす
//  ファイルの BGM はクロスフェードで切り替える（同じ場面の二重再生はしない）。読み込み・再生の失敗はゲームの進行を止めない（握りつぶして status に記録）。
//  音量（BGM／SE）・ミュートはここで一元管理し、localStorage（mmaudio。セーブデータとは別）に保存する。ブラウザの自動再生の制約：最初の操作で unlock() し、保留した BGM を再開する
// =========================================================
(function (root) {
  'use strict';
  const fz = Object.freeze;
  /** BGM の場面（名前は固定。曲はファイル名ではなく場面で指定する） */
  const SCENES = fz(['TITLE', 'TOWN', 'FACILITY', 'FARM', 'TRAINING', 'CHAPTER_1', 'CHAPTER_2', 'CHAPTER_3', 'CHAPTER_4', 'BATTLE', 'TOURNAMENT', 'RESULT', 'SPECIAL']);
  /** SE の種類 */
  const SE = fz(['UI_CONFIRM', 'UI_CANCEL', 'UI_ERROR', 'UI_OPEN', 'DICE_THROW', 'DICE_ROLL', 'DICE_LAND', 'STEP', 'TILE_STOP', 'STAT_UP', 'GOLD_GET', 'CHEST_OPEN', 'EVENT',
    'WILD_ALERT', 'BATTLE_START', 'VICTORY', 'CHAPTER_START', 'CHAPTER_CLEAR', 'TOURNAMENT_START', 'UNLOCK']);
  /** フェードの長さ（ms）。通常の切り替えと、遭遇などの急な切り替え */
  const FADE = fz({ normal: 700, quick: 220, none: 0 });
  const DEF_VOL = fz({ bgm: 0.8, se: 0.9 });
  const KEY = 'mmaudio';

  const BGM_FILES = {}, SE_FILES = {};
  let legacy = null;   // { bgm(scene), sfx(name), muted(), setMuted(on) }
  const st = { scene: null, source: 'none', el: null, pendingScene: null, unlocked: false, errors: [], plays: 0, vol: { ...DEF_VOL }, muted: false };
  try { const v = JSON.parse((root.localStorage && root.localStorage.getItem(KEY)) || 'null'); if (v && typeof v === 'object') { for (const k of ['bgm', 'se']) if (Number.isFinite(v[k])) st.vol[k] = Math.max(0, Math.min(1, v[k])); } } catch (e) {}
  const persist = () => { try { root.localStorage && root.localStorage.setItem(KEY, JSON.stringify({ bgm: st.vol.bgm, se: st.vol.se })); } catch (e) {} };
  const note = (where, e) => { st.errors.push(`${where}:${e && e.message ? e.message : e}`); if (st.errors.length > 20) st.errors.shift(); };
  const isMuted = () => { try { return legacy && legacy.muted ? !!legacy.muted() : st.muted; } catch (e) { return st.muted; } };

  function registerBgm(scene, src, opts = {}) { if (!SCENES.includes(scene) || typeof src !== 'string') throw new Error('MMAUDIO：BGM の登録が不正です'); BGM_FILES[scene] = fz({ src, volume: opts.volume != null ? opts.volume : 1, loop: opts.loop !== false }); }
  function registerSe(name, src, opts = {}) { if (!SE.includes(name) || typeof src !== 'string') throw new Error('MMAUDIO：SE の登録が不正です'); SE_FILES[name] = fz({ src, volume: opts.volume != null ? opts.volume : 1 }); }
  function attachLegacy(a) { legacy = a && typeof a === 'object' ? a : null; }

  // ---- ファイルの BGM（HTMLAudioElement）。音量はフェード用に rAF／タイマーで少しずつ変える ----
  function ramp(el, to, ms, done) {
    if (!el) { if (done) done(); return; }
    const from = el.volume, t0 = Date.now();
    if (!ms) { try { el.volume = to; } catch (e) {} if (done) done(); return; }
    const step = () => { const k = Math.min(1, (Date.now() - t0) / ms); try { el.volume = Math.max(0, Math.min(1, from + (to - from) * k)); } catch (e) {} if (k < 1) setTimeout(step, 30); else if (done) done(); };
    step();
  }
  function stopFile(ms) {
    const el = st.el; st.el = null; if (!el) return;
    ramp(el, 0, ms, () => { try { el.pause(); el.removeAttribute('src'); el.load && el.load(); } catch (e) {} });
  }
  function playFile(scene, ms) {
    const f = BGM_FILES[scene]; if (!f || typeof root.Audio !== 'function') return false;
    let el; try { el = new root.Audio(); el.src = f.src; el.loop = f.loop; el.preload = 'auto'; el.volume = 0; } catch (e) { note('bgm', e); return false; }
    el.addEventListener && el.addEventListener('error', () => { note('bgm-load', scene); if (st.el === el) { st.el = null; st.source = 'none'; } });
    stopFile(ms);
    st.el = el; st.source = 'file';
    const target = isMuted() ? 0 : st.vol.bgm * f.volume;
    try {
      const p = el.play();
      if (p && typeof p.then === 'function') p.then(() => ramp(el, target, ms)).catch((e) => { note('bgm-play', e); st.pendingScene = scene; });   // 自動再生の制約：最初の操作（unlock）で再開
      else ramp(el, target, ms);
    } catch (e) { note('bgm-play', e); st.pendingScene = scene; }
    return true;
  }

  /**
   * 場面の BGM（scene）。同じ場面がすでに鳴っていれば何もしない（二重再生の防止）。
   *  opts.fade：'normal'（既定・約0.7秒のクロスフェード）／'quick'（遭遇など）／'none'。ファイルが無い場面は今の合成音（legacy）で鳴らす
   */
  function scene(name, opts = {}) {
    if (!SCENES.includes(name)) { note('scene', name); return false; }
    if (st.scene === name && (st.source !== 'file' || st.el)) return false;
    const ms = FADE[opts.fade || 'normal'] != null ? FADE[opts.fade || 'normal'] : FADE.normal;
    st.scene = name; st.plays++;
    try {
      if (BGM_FILES[name] && playFile(name, ms)) return true;
      stopFile(ms);
      if (legacy && typeof legacy.bgm === 'function') { legacy.bgm(name); st.source = 'legacy'; } else st.source = 'none';
    } catch (e) { note('scene', e); st.source = 'none'; }
    return true;
  }
  function stopBgm(opts = {}) { stopFile(FADE[opts.fade || 'normal']); try { legacy && legacy.stop && legacy.stop(); } catch (e) { note('stop', e); } st.scene = null; st.source = 'none'; }

  /** SE（出来事の名前）。ミュート中・音源の無い出来事は何もしない。失敗しても投げない */
  function se(name, opts = {}) {
    if (!SE.includes(name)) { note('se', name); return false; }
    if (isMuted()) return false;
    try {
      const f = SE_FILES[name];
      if (f && typeof root.Audio === 'function') { const a = new root.Audio(f.src); a.volume = Math.max(0, Math.min(1, st.vol.se * f.volume * (opts.volume != null ? opts.volume : 1))); const p = a.play(); if (p && p.catch) p.catch((e) => note('se-play', e)); return true; }
      if (legacy && typeof legacy.sfx === 'function') return legacy.sfx(name, opts) !== false;
    } catch (e) { note('se', e); }
    return false;
  }

  function setVolume(kind, v) {
    if (!(kind in st.vol) || !Number.isFinite(v)) return;
    st.vol[kind] = Math.max(0, Math.min(1, v)); persist();
    if (kind === 'bgm' && st.el) { const f = BGM_FILES[st.scene]; try { st.el.volume = isMuted() ? 0 : st.vol.bgm * (f ? f.volume : 1); } catch (e) {} }
  }
  function setMuted(on) {
    st.muted = !!on;
    try { if (legacy && legacy.setMuted) legacy.setMuted(!!on); } catch (e) { note('mute', e); }
    if (st.el) { const f = BGM_FILES[st.scene]; ramp(st.el, on ? 0 : st.vol.bgm * (f ? f.volume : 1), FADE.quick); }
  }
  /** 最初の操作で呼ぶ（自動再生の制約）。保留していたファイルの BGM を再開する */
  function unlock() {
    st.unlocked = true;
    if (st.pendingScene && st.el) { const el = st.el, f = BGM_FILES[st.pendingScene]; st.pendingScene = null; try { const p = el.play(); if (p && p.then) p.then(() => ramp(el, isMuted() ? 0 : st.vol.bgm * (f ? f.volume : 1), FADE.quick)).catch((e) => note('bgm-unlock', e)); } catch (e) { note('bgm-unlock', e); } }
  }
  /** 今の状態（テスト・デバッグ用） */
  const status = () => ({ scene: st.scene, source: st.source, playing: !!st.el || st.source === 'legacy', plays: st.plays, volume: { ...st.vol }, muted: isMuted(), unlocked: st.unlocked, errors: [...st.errors],
    files: { bgm: Object.keys(BGM_FILES), se: Object.keys(SE_FILES) } });

  root.MMAUDIO = fz({ SCENES, SE, FADE, registerBgm, registerSe, attachLegacy, scene, stopBgm, se, setVolume, setMuted, unlock, status });
  try { if (root.document) ['pointerdown', 'touchend', 'keydown'].forEach((e) => root.document.addEventListener(e, unlock, { passive: true })); } catch (e) {}
})(typeof window !== 'undefined' ? window : globalThis);
