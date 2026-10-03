// =========================================================
// Audio Manager `MMAUDIO`（2026-10-02 Audio 基盤の正式改修。初版は商用品質化・第1次）
//  ゲームの音は「場面（BGM scene）」と「出来事（SE）」の名前で鳴らす。音源ファイルとの対応は js/audio/audio-registry.js（BGM_REGISTRY／SE_REGISTRY）に
//  集めてあり、画面やイベントのコードにはファイル名を書かない（曲・SE の差し替えは registry の1行を変えるだけ）。
//  構成（Web Audio API。iPhone Safari は HTMLMediaElement.volume を変えられないため、音量・ミュート・クロスフェードはすべて GainNode で行う）：
//    ファイル BGM：<audio> を2本だけ（slot）→ MediaElementAudioSourceNode（要素ごとに1回だけ接続）→ slot の GainNode（クロスフェード）→ BGM の GainNode
//    ファイル SE ：XMLHttpRequest で取得 → decodeAudioData → AudioBuffer（末尾の無音は読み込み時に切り落とす）→ SE の GainNode
//    合成音（index.html の bgmLegacy／sfx）：attachLegacy で渡された出口（legacyInput）→ Master
//    Master の GainNode ＝ ミュート（ファイル BGM・合成 BGM・ファイル SE・合成 SE のすべてに効く）
//  AudioContext は1つだけ（context()）。最初の操作（unlock）で作って resume し、裏に回ったら suspend、戻ったら resume する。
//  音源が無い・読み込めない・再生できない場面や出来事は、合成音（legacy）へ自動で落とす（ゲームは止めない。同じエラーは1回しか記録しない）。
//  場面の名前は SCENES（旧名 FACILITY・BATTLE・TOURNAMENT・SPECIAL は SCENE_ALIAS で読み替える）。
//  registry で { silent: true } と書いた場面・出来事は、ファイルも合成音も鳴らさない（「この音は合わない・後日差し替え」のとき。2026-10-03）。
// =========================================================
(function (root) {
  'use strict';
  const fz = Object.freeze;
  /** BGM の場面（正式名）。曲はファイル名ではなく場面で指定する */
  const SCENES = fz(['TITLE', 'TOWN', 'MARKET', 'RANCH', 'LABORATORY', 'FARM', 'TRAINING',
    'CHAPTER_1', 'CHAPTER_2', 'CHAPTER_3', 'CHAPTER_4',
    'WILD_BATTLE', 'RARE_WILD_BATTLE', 'RIVAL_BATTLE',
    'TOURNAMENT_ENTRY', 'TOURNAMENT_LOBBY_LOW', 'TOURNAMENT_LOBBY_HIGH', 'TOURNAMENT_MATCHUP', 'TOURNAMENT_BATTLE_LOW', 'TOURNAMENT_BATTLE_HIGH',
    'SPECIAL_BATTLE', 'RESULT']);
  /** 旧い場面名 → 正式名（既存の呼び出しを壊さない） */
  const SCENE_ALIAS = fz({ FACILITY: 'MARKET', BATTLE: 'WILD_BATTLE', TOURNAMENT: 'TOURNAMENT_LOBBY_LOW', SPECIAL: 'SPECIAL_BATTLE' });
  /** SE の種類（出来事の名前） */
  const SE = fz([
    'UI_CONFIRM', 'UI_CANCEL', 'UI_ERROR', 'UI_OPEN', 'UI_SELECT', 'UI_TAB', 'TITLE_START',
    'DICE_THROW', 'DICE_ROLL', 'DICE_LAND', 'DICE_STOP', 'STEP', 'TILE_STOP', 'STAT_UP', 'GOLD_GET', 'CHEST_APPEAR', 'CHEST_OPEN', 'EVENT', 'WILD_ALERT',
    'MATCHUP', 'BATTLE_INTRO', 'BATTLE_START', 'BATTLE_ATTACK', 'BATTLE_HIT', 'BATTLE_CRIT', 'BATTLE_MISS', 'BATTLE_BLOCK', 'BUFF', 'DEBUFF', 'HEAL', 'ROULETTE_TICK', 'ROULETTE_STOP', 'VICTORY', 'DEFEAT',
    'SWOOSH', 'CHAPTER_START', 'CHAPTER_CLEAR', 'TOURNAMENT_ARRIVAL', 'TOURNAMENT_START', 'UNLOCK', 'REWARD']);
  /** フェードの長さ（ms）。通常の切り替えと、遭遇などの急な切り替え */
  const FADE = fz({ normal: 700, quick: 220, none: 0 });
  const DEF_VOL = fz({ bgm: 0.8, se: 0.9 });
  const KEY = 'mmaudio';
  /** 拡張子 → canPlayType に渡す MIME（再生できる形式だけを選ぶ。iPhone Safari で Ogg Vorbis が再生できない版は合成音へ落ちる） */
  const MIME = fz({ ogg: 'audio/ogg; codecs="vorbis"', oga: 'audio/ogg; codecs="vorbis"', opus: 'audio/ogg; codecs="opus"', m4a: 'audio/mp4; codecs="mp4a.40.2"', mp4: 'audio/mp4; codecs="mp4a.40.2"', aac: 'audio/aac', mp3: 'audio/mpeg', wav: 'audio/wav', webm: 'audio/webm; codecs="vorbis"', flac: 'audio/flac' });
  /** iPhone Safari で <audio> を最初の操作に結びつけるための無音（0.01秒の WAV。画像ではない技術上の最小データ） */
  const SILENT = 'data:audio/wav;base64,UklGRsQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YaAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
  const SE_MAX_SECONDS = 4;   // SE の AudioBuffer はこの長さまで（長い素材の末尾の無音を切る）
  const SE_DEBOUNCE_MS = 35;  // 同じ SE の連打（同じフレームの二重発火）をまとめる

  const BGM = {}, SEF = {};   // registry：場面 → { srcs, gain, loop, fallback }、SE 名 → { srcs, gain, data, buffer, failed }
  let legacy = null;          // { bgm(scene), stop(), sfx(name, opts), muted(), setMuted(on) }
  const st = { scene: null, source: 'none', ctx: null, master: null, bgmGain: null, seGain: null, legacyGain: null, webAudio: null,
    unlocked: false, muted: false, vol: { ...DEF_VOL }, errors: [], plays: 0, slots: [], cur: null, pendingScene: null, failed: {}, canPlay: {}, lastSe: {}, hidden: false, probe: null };
  try { const v = JSON.parse((root.localStorage && root.localStorage.getItem(KEY)) || 'null'); if (v && typeof v === 'object') { for (const k of ['bgm', 'se']) if (Number.isFinite(v[k])) st.vol[k] = Math.max(0, Math.min(1, v[k])); } } catch (e) {}
  const persist = () => { try { root.localStorage && root.localStorage.setItem(KEY, JSON.stringify({ bgm: st.vol.bgm, se: st.vol.se })); } catch (e) {} };
  /** 失敗の記録（同じ内容は1回だけ。console には出さない） */
  const note = (where, e) => { const s = `${where}:${e && e.message ? e.message : e}`; if (st.errors.includes(s)) return; st.errors.push(s); if (st.errors.length > 30) st.errors.shift(); };
  const isMuted = () => { try { return legacy && legacy.muted ? !!legacy.muted() : st.muted; } catch (e) { return st.muted; } };
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const ext = (src) => { const m = /\.([a-z0-9]+)(?:[?#].*)?$/i.exec(String(src)); return m ? m[1].toLowerCase() : ''; };

  // ---- registry ----
  const srcList = (src) => (Array.isArray(src) ? src : [src]).filter((s) => typeof s === 'string' && s);
  function registerBgm(scene, src, opts = {}) {
    const key = resolveScene(scene); if (!key) throw new Error('MMAUDIO：BGM の登録が不正です（場面）');
    const srcs = srcList(src), fb = opts.fallback ? resolveScene(opts.fallback) : null;
    if (opts.silent) { BGM[key] = fz({ srcs: fz([]), gain: 1, loop: true, fallback: null, silent: true }); return; }   // この場面は BGM を鳴らさない（合成音も鳴らさない）
    if (!srcs.length && !fb) throw new Error('MMAUDIO：BGM の登録が不正です（ファイルか fallback か silent が要る）');
    if (opts.fallback && !fb) throw new Error('MMAUDIO：BGM の fallback の場面が不正です');
    const g = opts.gain != null ? opts.gain : (opts.volume != null ? opts.volume : 1);
    BGM[key] = fz({ srcs: fz(srcs), gain: Number.isFinite(g) ? Math.max(0, g) : 1, loop: opts.loop !== false, fallback: fb, loopRange: loopRangeOf(opts) });
  }
  /**
   * ループ区間（秒）：{ loopStart, loopEnd, loopXfade }。曲の終わりがフェードアウトする素材を、ファイルを加工せずに自然につなぐ。
   *  loopEnd に来たら、もう1本の <audio> を loopStart から鳴らし、loopXfade 秒かけてクロスフェードする（GainNode）。不正な値は null（＝ふつうのループ）
   */
  function loopRangeOf(o) {
    const a = Number(o.loopStart || 0), b = Number(o.loopEnd), x = o.loopXfade != null ? Number(o.loopXfade) : 1.5;
    if (o.loopEnd == null || !Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(x) || a < 0 || b < a + 4 || x < 0 || x > (b - a) / 2) return null;
    return fz({ start: a, end: b, xf: x });
  }
  function registerSe(name, src, opts = {}) {
    if (!SE.includes(name)) throw new Error('MMAUDIO：SE の登録が不正です（名前）');
    if (opts.silent) { SEF[name] = { srcs: fz([]), gain: 0, silent: true, data: null, buffer: null, failed: false, loading: false }; return; }   // この出来事は鳴らさない（合成音も鳴らさない）
    const srcs = srcList(src); if (!srcs.length) throw new Error('MMAUDIO：SE の登録が不正です（ファイルか silent が要る）');
    const g = opts.gain != null ? opts.gain : (opts.volume != null ? opts.volume : 1);
    const mx = Number(opts.maxMs), fd = Number(opts.fadeMs);   // maxMs：再生する長さ（ms。長い余韻の素材を、ファイルを変えずに短く鳴らす）、fadeMs：最後に音量を下げる長さ
    SEF[name] = { srcs: fz(srcs), gain: Number.isFinite(g) ? Math.max(0, g) : 1, maxMs: Number.isFinite(mx) && mx > 0 ? mx : 0, fadeMs: Number.isFinite(fd) && fd > 0 ? fd : 300, data: null, buffer: null, failed: false, loading: false };
    loadSe(name);
  }
  /** registry をまとめて登録する（js/audio/audio-registry.js から）。値は文字列（ファイル）か { src|srcs, gain, loop, fallback } */
  function registerAll(reg) {
    const r = reg || {}, out = { bgm: 0, se: 0 };
    for (const [k, v] of Object.entries(r.bgm || r.BGM || {})) { const o = typeof v === 'string' ? { src: v } : (v || { silent: true }); registerBgm(k, o.srcs || o.src || [], o); out.bgm++; }
    for (const [k, v] of Object.entries(r.se || r.SE || {})) { const o = typeof v === 'string' ? { src: v } : (v || { silent: true }); registerSe(k, o.srcs || o.src || [], o); out.se++; }
    return out;
  }
  function clearRegistry() { for (const k of Object.keys(BGM)) delete BGM[k]; for (const k of Object.keys(SEF)) delete SEF[k]; }
  function attachLegacy(a) { legacy = a && typeof a === 'object' ? a : null; }
  const resolveScene = (name) => (SCENES.includes(name) ? name : (SCENE_ALIAS[name] || null));
  /** 場面の BGM の登録（fallback の連鎖をたどる。登録が無ければ null） */
  function resolveBgm(key, depth = 0) {
    const e = BGM[key]; if (!e || depth > 8) return null;
    if (e.silent) return { key, ...e };
    if (e.srcs.length) return { key, ...e };
    return e.fallback ? resolveBgm(e.fallback, depth + 1) : null;
  }
  /** 再生できる形式のファイルを選ぶ（canPlayType。無ければ null＝合成音へ） */
  function pickSrc(srcs) {
    for (const s of srcs) { if (st.failed[s]) continue; if (canPlay(s)) return s; }
    return null;
  }
  function canPlay(src) {
    const x = ext(src); if (x in st.canPlay) return st.canPlay[x];
    const m = MIME[x]; let ok = !!m;   // 知らない拡張子は再生できない扱い（候補の中から再生できる形式を選ぶ）
    try { if (!st.probe && typeof root.Audio === 'function') st.probe = new root.Audio(); if (st.probe && m && typeof st.probe.canPlayType === 'function') ok = st.probe.canPlayType(m) !== ''; } catch (e) { ok = !!m; }
    st.canPlay[x] = ok; return ok;
  }

  // ---- AudioContext（1つだけ）と GainNode ----
  function context() {
    if (st.ctx) return st.ctx;
    if (st.webAudio === false) return null;
    const C = root.AudioContext || root.webkitAudioContext; if (!C) { st.webAudio = false; return null; }
    let c; try { c = new C(); } catch (e) { note('ctx', e); st.webAudio = false; return null; }
    st.ctx = c; st.webAudio = true;
    try {
      st.master = c.createGain(); st.master.gain.value = isMuted() ? 0 : 1; st.master.connect(c.destination);
      st.bgmGain = c.createGain(); st.bgmGain.gain.value = st.vol.bgm; st.bgmGain.connect(st.master);
      st.seGain = c.createGain(); st.seGain.gain.value = st.vol.se; st.seGain.connect(st.master);
      st.legacyGain = c.createGain(); st.legacyGain.gain.value = 1; st.legacyGain.connect(st.master);
    } catch (e) { note('ctx-graph', e); }
    for (const s of st.slots) attachSlot(s);
    for (const n of Object.keys(SEF)) decodeSe(n);
    return c;
  }
  /** 合成音（index.html の AU.out …）の出口。ここへつなぐとミュートが共通になる */
  const legacyInput = () => (context() ? st.legacyGain : null);
  function rampParam(p, to, ms) {
    const c = st.ctx; if (!p || !c) return;
    try {
      const t = c.currentTime, v = Number.isFinite(p.value) ? p.value : to;
      if (p.cancelScheduledValues) p.cancelScheduledValues(t);
      if (p.setValueAtTime) p.setValueAtTime(v, t);
      if (ms > 0 && p.linearRampToValueAtTime) p.linearRampToValueAtTime(to, t + ms / 1000); else if (p.setValueAtTime) p.setValueAtTime(to, t); else p.value = to;
    } catch (e) { try { p.value = to; } catch (e2) {} }
  }

  // ---- ファイル BGM：<audio> を2本だけ使い回す（slot） ----
  function makeSlot(i) {
    if (typeof root.Audio !== 'function') return null;
    let el; try { el = new root.Audio(); } catch (e) { note('audio', e); return null; }
    const s = { i, el, src: null, scene: null, node: null, gain: null, token: 0, timer: null, active: false, primed: false, plain: false, loopRange: null, loopT: null, prepared: false };
    try { el.preload = 'auto'; el.loop = true; if (el.addEventListener) { el.addEventListener('error', () => onElError(s)); el.addEventListener('timeupdate', () => onTick(s)); el.addEventListener('ended', () => onEnded(s)); } } catch (e) {}
    return s;
  }
  function slots() {
    if (!st.slots.length) { for (let i = 0; i < 2; i++) { const s = makeSlot(i); if (s) st.slots.push(s); } }
    return st.slots;
  }
  /** <audio> を AudioContext につなぐ（要素ごとに1回だけ。失敗したら el.volume で動かす plain） */
  function attachSlot(s) {
    const c = st.ctx; if (!c || s.node || s.plain) return;
    try { s.node = c.createMediaElementSource(s.el); s.gain = c.createGain(); s.gain.gain.value = 0; s.node.connect(s.gain); s.gain.connect(st.bgmGain); }
    catch (e) { note('media-source', e); s.plain = true; s.node = null; s.gain = null; }
  }
  const plain = (s) => !s.gain;   // GainNode が無い（Web Audio が使えない）slot は el.volume で動かす
  const slotTarget = (s) => (plain(s) ? clamp01(st.vol.bgm * (s.gainTarget != null ? s.gainTarget : 1) * (isMuted() ? 0 : 1)) : (s.gainTarget != null ? s.gainTarget : 1));
  function setGain(s, to, ms) {
    if (s.gain) { rampParam(s.gain.gain, to, ms); return; }
    // Web Audio が使えないときだけ el.volume（iPhone では効かないが、合成音も無い環境の最後の手段）
    const el = s.el, from = Number.isFinite(el.volume) ? el.volume : 1, t0 = Date.now();
    if (s.volTimer) { clearTimeout(s.volTimer); s.volTimer = null; }
    if (!ms) { try { el.volume = clamp01(to); } catch (e) {} return; }
    const step = () => { const k = Math.min(1, (Date.now() - t0) / ms); try { el.volume = clamp01(from + (to - from) * k); } catch (e) {} s.volTimer = k < 1 ? setTimeout(step, 30) : null; };
    step();
  }
  function fadeOutSlot(s, ms) {
    if (!s) return;
    if (s.loopT) { clearTimeout(s.loopT); s.loopT = null; }
    s.active = false; s.token++;
    setGain(s, 0, ms);
    if (s.timer) clearTimeout(s.timer);
    s.timer = setTimeout(() => { s.timer = null; if (s.active) return; try { s.el.pause(); } catch (e) {} s.src = null; s.scene = null; }, ms + 40);
  }
  function stopFiles(ms) { for (const s of st.slots) if (s.active) fadeOutSlot(s, ms); st.cur = null; }
  function onElError(s) {
    const src = s.src; if (!src) return;
    st.failed[src] = true; note('bgm-load', src);
    if (st.cur === s) { s.active = false; st.cur = null; st.pendingScene = null; try { s.el.pause(); } catch (e) {} s.src = null; const key = s.scene; s.scene = null; st.source = 'none'; if (key && st.scene === key) startLegacy(key); }
  }
  /** 場面の BGM をファイルで鳴らす。鳴らせない（登録なし・形式が合わない・読み込み失敗）なら false */
  function playFile(key, entry, ms) {
    const src = pickSrc(entry.srcs); if (!src) return false;
    const all = slots(); if (!all.length) return false;
    const cur = st.cur;
    if (cur && cur.active && cur.src === src) { cur.scene = key; cur.gainTarget = entry.gain; cur.loopRange = entry.loopRange || null; st.source = 'file'; legacyStop(); setGain(cur, slotTarget(cur), ms); return true; }   // 同じ曲なら鳴らし直さない
    const s = all.find((x) => x !== cur) || all[0];
    if (s.timer) { clearTimeout(s.timer); s.timer = null; }
    if (s.loopT) { clearTimeout(s.loopT); s.loopT = null; }
    const token = ++s.token;
    s.src = src; s.scene = key; s.gainTarget = entry.gain; s.active = true; s.prepared = false; s.waiting = false; s.loopRange = entry.loopRange || null;
    attachSlot(s);
    try { s.el.loop = entry.loop !== false && !s.loopRange; s.el.src = src; if (s.el.load) s.el.load(); } catch (e) { note('bgm-src', e); s.active = false; s.src = null; return false; }
    setGain(s, 0, 0);
    if (cur && cur !== s) fadeOutSlot(cur, ms);
    st.cur = s; st.source = 'file'; legacyStop();
    const up = () => { if (s.token !== token || !s.active) return; if (st.pendingScene === key) st.pendingScene = null; setGain(s, slotTarget(s), ms); };
    try {
      const p = s.el.play();
      if (p && typeof p.then === 'function') p.then(up).catch((e) => { if (s.token !== token) return; if (e && /NotSupported/i.test(e.name || '')) { onElError(s); return; } if (!(e && /NotAllowed/i.test(e.name || ''))) note('bgm-play', e); st.pendingScene = key; });   // 自動再生の制約（NotAllowedError）は失敗ではなく保留：最初の操作（unlock）で再開
      else up();
    } catch (e) { note('bgm-play', e); st.pendingScene = key; }
    return true;
  }
  // ---- ループ区間（loopStart／loopEnd）：もう1本の <audio> へクロスフェードで渡す。タイマーは常駐させない（timeupdate と、渡す直前の1回だけ） ----
  const otherSlot = (s) => st.slots.find((x) => x !== s) || null;
  function onTick(s) {
    const L = s.loopRange; if (!L || s !== st.cur || !s.active || st.hidden) return;
    const t = s.el.currentTime; if (!Number.isFinite(t)) return;
    const at = L.end - L.xf;   // ここで次の1本を鳴らし始める
    if (t >= at - 3 && !s.prepared) prepLoop(s);
    if (t >= at - 1.2 && !s.loopT) s.loopT = setTimeout(() => { s.loopT = null; loopHandoff(s); }, Math.max(0, (at - t) * 1000));
  }
  /** 次の1本を loopStart の位置で待たせる（鳴らさない） */
  function prepLoop(s) {
    s.prepared = true;   // このループで1回だけ試す
    const o = otherSlot(s); if (!o || o.active || o.timer) return;
    o.token++; o.src = s.src; o.scene = s.scene; o.gainTarget = s.gainTarget; o.loopRange = s.loopRange; o.prepared = false; o.waiting = true;
    attachSlot(o); setGain(o, 0, 0);
    try { o.el.loop = false; o.el.src = s.src + '#t=' + s.loopRange.start; if (o.el.load) o.el.load(); } catch (e) { o.waiting = false; note('loop-prep', e); }
  }
  function loopHandoff(s) {
    const L = s.loopRange; if (!L || s !== st.cur || !s.active) return;
    if (st.hidden) { s.prepared = false; return; }   // 裏に回っている間は渡さない（戻ったあと最後まで来たら ended で loopStart へ）
    const o = otherSlot(s);
    if (!o || !o.waiting || o.src !== s.src || o.active) { try { s.el.currentTime = L.start; } catch (e) {} s.prepared = false; return; }   // 次の1本が無い：その場で戻す
    o.waiting = false; o.active = true; o.prepared = false; const tok = o.token, ms = L.xf * 1000;
    try { if (Math.abs((o.el.currentTime || 0) - L.start) > 0.3) o.el.currentTime = L.start; } catch (e) {}
    st.cur = o; fadeOutSlot(s, ms);
    const back = () => { if (o.token !== tok) return; o.active = false; if (st.cur === o) { st.cur = s; s.active = true; s.token++; if (s.timer) { clearTimeout(s.timer); s.timer = null; } setGain(s, slotTarget(s), 120); try { s.el.currentTime = L.start; const q = s.el.play(); if (q && q.catch) q.catch(() => {}); } catch (e) {} } };   // 次の1本を鳴らせなかった：元の1本へ戻す
    try { const p = o.el.play(); if (p && typeof p.then === 'function') p.then(() => { if (o.token === tok && o.active) setGain(o, slotTarget(o), ms); }).catch((e) => { note('loop-play', e); back(); }); else setGain(o, slotTarget(o), ms); }
    catch (e) { note('loop-play', e); back(); }
  }
  /** 曲の最後まで来てしまった（裏に回ってタイマーが遅れたなど）：loopStart へ戻して続ける */
  function onEnded(s) {
    const L = s.loopRange; if (!L || s !== st.cur || !s.active) return;
    try { s.el.currentTime = L.start; const p = s.el.play(); if (p && p.catch) p.catch(() => {}); } catch (e) {}
    s.prepared = false;
  }
  function legacyStop() { try { if (legacy && typeof legacy.stop === 'function') legacy.stop(); } catch (e) { note('legacy-stop', e); } }
  function startLegacy(key) {
    if (legacy && typeof legacy.bgm === 'function') { st.source = 'legacy'; if (!isMuted()) { try { legacy.bgm(key); } catch (e) { note('legacy-bgm', e); } } }
    else st.source = 'none';
  }
  /** iPhone Safari：最初の操作のときに、使っていない <audio> を一度鳴らしておく（あとで操作の外から play() できる） */
  function primeSlots() {
    for (const s of slots()) {
      if (s.primed || s.active || s.src) continue;
      s.primed = true;
      try { s.el.src = SILENT; const p = s.el.play(); if (p && p.then) p.then(() => { try { if (!s.active) s.el.pause(); } catch (e) {} }).catch(() => {}); } catch (e) {}
    }
  }

  /**
   * 場面の BGM（scene）。同じ場面がすでに鳴っていれば何もしない（二重再生の防止）。
   *  opts.fade：'normal'（既定・約0.7秒のクロスフェード）／'quick'（遭遇など）／'none'。ファイルが無い（または再生できない）場面は合成音（legacy）で鳴らす
   */
  function scene(name, opts = {}) {
    const key = resolveScene(name);
    if (!key) { note('scene', name); return false; }
    if (st.scene === key && st.source !== 'none') return false;   // 同じ場面（無音の場面を含む）は何もしない
    const ms = FADE[opts.fade || 'normal'] != null ? FADE[opts.fade || 'normal'] : FADE.normal;
    st.scene = key; st.plays++;
    try {
      const entry = resolveBgm(key);
      if (entry && entry.silent) { stopFiles(ms); legacyStop(); st.source = 'silent'; st.pendingScene = null; return true; }   // 無音の場面：ファイルも合成音も止める
      if (entry) context();   // ファイルの BGM は GainNode を通す（AudioContext は1つ。resume は最初の操作）
      if (entry && playFile(key, entry, ms)) return true;
      stopFiles(ms);
      startLegacy(key);
    } catch (e) { note('scene', e); st.source = 'none'; }
    return true;
  }
  function stopBgm(opts = {}) { stopFiles(FADE[opts.fade || 'normal'] != null ? FADE[opts.fade || 'normal'] : FADE.normal); legacyStop(); st.scene = null; st.source = 'none'; st.pendingScene = null; }

  // ---- ファイル SE：XMLHttpRequest → decodeAudioData → AudioBuffer ----
  function loadSe(name) {
    const f = SEF[name]; if (!f || f.loading || f.data || f.buffer || f.failed) return;
    const src = pickSrc(f.srcs); if (!src) { f.failed = true; return; }
    const X = root.XMLHttpRequest; if (typeof X !== 'function') return;
    f.loading = true;
    try {
      const x = new X(); x.open('GET', src, true); x.responseType = 'arraybuffer';
      x.onload = () => { f.loading = false; if (x.status >= 200 && x.status < 300 && x.response) { f.data = x.response; decodeSe(name); } else { f.failed = true; note('se-load', src); } };
      x.onerror = () => { f.loading = false; f.failed = true; note('se-load', src); };
      x.send();
    } catch (e) { f.loading = false; f.failed = true; note('se-load', e); }
  }
  function decodeSe(name) {
    const f = SEF[name], c = st.ctx; if (!f || !c || !f.data || f.buffer || f.decoding) return;
    f.decoding = true;
    const ok = (buf) => { f.decoding = false; f.data = null; f.buffer = trimTail(buf); }, ng = (e) => { f.decoding = false; f.data = null; f.failed = true; note('se-decode', name + ' ' + (e && e.message ? e.message : e)); };
    try {
      const r = c.decodeAudioData(f.data.slice ? f.data.slice(0) : f.data, ok, ng);   // callback 形式（古い Safari）。Promise も返れば両方に備える
      if (r && typeof r.then === 'function') r.then(ok, ng).catch(() => {});
    } catch (e) { ng(e); }
  }
  /** 末尾の無音を切り落とす（Interface SFX Pack は1つ6秒の器に短い音が入っている。素材ファイルは変えない） */
  function trimTail(buf) {
    try {
      const c = st.ctx, ch = buf.numberOfChannels, sr = buf.sampleRate, len = buf.length; let end = 0;
      for (let k = 0; k < ch; k++) { const d = buf.getChannelData(k); for (let i = len - 1; i > end; i--) { if (Math.abs(d[i]) > 0.0008) { if (i > end) end = i; break; } } }
      let keep = Math.min(len, end + Math.round(sr * 0.06));
      keep = Math.min(keep, Math.round(sr * SE_MAX_SECONDS));
      if (keep >= len * 0.97 || keep < 16 || !c.createBuffer) return buf;
      const out = c.createBuffer(ch, keep, sr);
      for (let k = 0; k < ch; k++) { const s = buf.getChannelData(k).subarray(0, keep); if (out.copyToChannel) out.copyToChannel(s, k); else out.getChannelData(k).set(s); }
      return out;
    } catch (e) { return buf; }
  }
  function playBuffer(f, opts) {
    const c = st.ctx, g = c.createGain(), src = c.createBufferSource();
    g.gain.value = Math.max(0, f.gain * (opts.volume != null ? opts.volume : 1));
    src.buffer = f.buffer; src.connect(g); g.connect(st.seGain);
    src.onended = () => { try { src.disconnect(); g.disconnect(); } catch (e) {} };
    const t0 = c.currentTime + Math.max(0, opts.delay || 0);
    src.start(t0);
    if (f.maxMs) {   // 長い余韻の素材を短く鳴らす（ファイルは変えない。最後の fadeMs で音量を下げて止める）
      const end = t0 + f.maxMs / 1000, fs = Math.min(f.fadeMs, f.maxMs) / 1000, v = g.gain.value;
      try { g.gain.setValueAtTime(v, Math.max(t0, end - fs)); g.gain.linearRampToValueAtTime(0, end); src.stop(end + 0.02); } catch (e) {}
    }
  }
  /** SE（出来事の名前）。ミュート中・音源の無い出来事は合成音へ（無ければ何もしない）。失敗しても投げない */
  function se(name, opts = {}) {
    if (!SE.includes(name)) { note('se', name); return false; }
    if (isMuted()) return false;
    const now = Date.now(); if (st.lastSe[name] && now - st.lastSe[name] < SE_DEBOUNCE_MS) return true; st.lastSe[name] = now;
    try {
      const f = SEF[name];
      if (f && f.silent) return true;   // 鳴らさないと決めた出来事（合成音にも落とさない）
      if (f && !f.failed) {
        // running、または最初の操作で resume を頼んだ直後（iPhone は resume が少し遅れる。予約した音は resume と同時に鳴る）
        if (f.buffer && st.ctx && (st.ctx.state === 'running' || (st.resuming && st.ctx.state === 'suspended' && !st.hidden))) { playBuffer(f, opts); return true; }
        if (!f.buffer) { if (!f.data) loadSe(name); else decodeSe(name); }
      }
      if (legacy && typeof legacy.sfx === 'function') return legacy.sfx(name, opts) !== false;
    } catch (e) { note('se', e); }
    return false;
  }

  // ---- 音量・ミュート・自動再生の解除・表裏 ----
  function setVolume(kind, v) {
    if (!(kind in st.vol) || !Number.isFinite(v)) return;
    st.vol[kind] = clamp01(v); persist();
    if (kind === 'bgm') { if (st.bgmGain) rampParam(st.bgmGain.gain, st.vol.bgm, FADE.quick); for (const s of st.slots) if (plain(s) && s.active) setGain(s, slotTarget(s), 0); }
    if (kind === 'se' && st.seGain) rampParam(st.seGain.gain, st.vol.se, 0);
  }
  /** ミュート（Master の GainNode。ファイル BGM・合成 BGM・ファイル SE・合成 SE のすべてに効く）。合成 BGM は止め、解除のときにその場面だけ鳴らし直す */
  function setMuted(on) {
    st.muted = !!on;
    try { if (legacy && legacy.setMuted) legacy.setMuted(!!on); } catch (e) { note('mute', e); }
    if (st.master) rampParam(st.master.gain, on ? 0 : 1, FADE.quick);
    for (const s of st.slots) if (plain(s) && s.active) setGain(s, slotTarget(s), FADE.quick);
    if (on) { if (st.source === 'legacy') legacyStop(); return; }
    if (st.source === 'legacy' && st.scene && legacy && typeof legacy.bgm === 'function') { try { legacy.bgm(st.scene); } catch (e) { note('legacy-bgm', e); } }
    if (st.source === 'file' && st.pendingScene) retryPending();
  }
  function retryPending() {
    const key = st.pendingScene, cur = st.cur; if (!key) return;
    if (cur && cur.scene === key && cur.active) { try { const p = cur.el.play(); if (p && p.then) p.then(() => { st.pendingScene = null; setGain(cur, slotTarget(cur), FADE.quick); }).catch(() => {}); else { st.pendingScene = null; setGain(cur, slotTarget(cur), FADE.quick); } } catch (e) {} }
    else { st.pendingScene = null; st.scene = null; scene(key, { fade: 'none' }); }
  }
  /** 最初の操作で呼ぶ（自動再生の制約）：AudioContext を作って resume し、保留していた BGM を再開する。何度呼んでも安全・軽い */
  function unlock() {
    st.unlocked = true;
    const c = context();
    if (c) {
      if (c.state !== 'running') { st.resuming = true; try { const p = c.resume(); const done = () => { st.resuming = false; }; if (p && p.then) p.then(done, (e) => { done(); note('resume', e); }); else done(); } catch (e) { st.resuming = false; note('resume', e); } }
      if (!st.ticked) { st.ticked = true; try { const b = c.createBuffer(1, 1, 22050), n = c.createBufferSource(); n.buffer = b; n.connect(st.master || c.destination); n.start(0); } catch (e) {} }
      for (const n of Object.keys(SEF)) decodeSe(n);
    }
    primeSlots();
    if (st.pendingScene) retryPending();
    else if (st.cur && st.cur.active && st.cur.el.paused) { try { const p = st.cur.el.play(); if (p && p.catch) p.catch(() => {}); } catch (e) {} }   // 中断（電話など）からの復帰
    if (st.source === 'legacy' && st.scene && !isMuted() && legacy && typeof legacy.bgm === 'function') { try { legacy.bgm(st.scene); } catch (e) { note('legacy-bgm', e); } }
  }
  function onVisibility() {
    const d = root.document; if (!d) return;
    st.hidden = !!d.hidden; const c = st.ctx;
    if (st.hidden) { try { if (c && c.state === 'running') c.suspend(); } catch (e) {} for (const s of st.slots) if (s.active) { try { s.el.pause(); } catch (e) {} } return; }
    try { if (c && c.state !== 'running') { const p = c.resume(); if (p && p.catch) p.catch(() => {}); } } catch (e) {}
    const cur = st.cur; if (cur && cur.active && cur.el.paused) { try { const p = cur.el.play(); if (p && p.catch) p.catch(() => { st.pendingScene = cur.scene; }); } catch (e) { st.pendingScene = cur.scene; } }
  }
  /** 今の状態（テスト・デバッグ用） */
  const status = () => ({ scene: st.scene, source: st.source, playing: !!(st.cur && st.cur.active) || st.source === 'legacy', plays: st.plays, volume: { ...st.vol }, muted: isMuted(), unlocked: st.unlocked,
    webAudio: st.webAudio, context: st.ctx ? st.ctx.state : null, pendingScene: st.pendingScene, errors: [...st.errors], failed: Object.keys(st.failed),
    files: { bgm: Object.keys(BGM).filter((k) => BGM[k].srcs.length), se: Object.keys(SEF).filter((k) => !SEF[k].silent) }, inherits: Object.keys(BGM).filter((k) => !BGM[k].srcs.length && !BGM[k].silent),
    silent: { bgm: Object.keys(BGM).filter((k) => BGM[k].silent), se: Object.keys(SEF).filter((k) => SEF[k].silent) },
    se: Object.fromEntries(Object.keys(SEF).map((k) => [k, SEF[k].silent ? 'silent' : SEF[k].buffer ? 'ready' : (SEF[k].failed ? 'failed' : 'loading')])),
    slots: st.slots.map((s) => ({ i: s.i, src: s.src, scene: s.scene, active: s.active, paused: !!s.el.paused, loop: s.loopRange ? [s.loopRange.start, s.loopRange.end] : null, waiting: !!s.waiting, time: Number.isFinite(s.el.currentTime) ? Math.round(s.el.currentTime * 100) / 100 : null, gain: s.gain ? s.gain.gain.value : s.el.volume })) });
  const registryOf = (kind) => (kind === 'se' ? Object.fromEntries(Object.keys(SEF).map((k) => [k, { srcs: [...SEF[k].srcs], gain: SEF[k].gain, silent: !!SEF[k].silent, maxMs: SEF[k].maxMs }])) : Object.fromEntries(Object.keys(BGM).map((k) => [k, { ...BGM[k], srcs: [...BGM[k].srcs] }])));

  root.MMAUDIO = fz({ SCENES, SCENE_ALIAS, SE, FADE, registerBgm, registerSe, registerAll, clearRegistry, registryOf, attachLegacy, resolveScene, resolveBgm, scene, stopBgm, se, setVolume, setMuted, unlock, context, legacyInput, status });
  try { if (root.document) { ['pointerdown', 'touchend', 'keydown'].forEach((e) => root.document.addEventListener(e, unlock, { passive: true })); root.document.addEventListener('visibilitychange', onVisibility); } } catch (e) {}
})(typeof window !== 'undefined' ? window : globalThis);
