// =========================================================
// Audio 基盤（2026-10-02 正式改修）：js/audio/audio-manager.js（MMAUDIO）・js/audio/audio-registry.js・index.html の互換層
//  AUDIO-1〜15（Node で動かす。AudioContext・<audio>・XMLHttpRequest は偽物。画面の確認は tests/qa-e2e-feel.test.mjs の FE-7〜）
// =========================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const HTML = rd('index.html');
const tick = (ms = 0) => new Promise((ok) => setTimeout(ok, ms));

/** 偽の Web Audio・<audio>・XHR で Audio Manager を読む */
function env(o = {}) {
  const log = { audios: [], xhr: [], plays: 0, ctxs: 0 };
  class Param { constructor(v) { this.value = v; } setValueAtTime(v) { this.value = v; } linearRampToValueAtTime(v) { this.value = v; } cancelScheduledValues() {} }
  class Node { constructor() { this.gain = new Param(1); this.out = []; } connect(n) { this.out.push(n); return n; } disconnect() {} }
  class Buf { constructor(ch, len, sr) { this.numberOfChannels = ch; this.length = len; this.sampleRate = sr; this.ch = Array.from({ length: ch }, () => new Float32Array(len)); } getChannelData(i) { return this.ch[i]; } copyToChannel(a, i) { this.ch[i].set(a); } }
  class Ctx {
    constructor() { this.state = o.ctxState || 'running'; this.currentTime = 0; this.sampleRate = 44100; this.destination = { dest: true }; log.ctxs++; }
    resume() { this.state = 'running'; return Promise.resolve(); }
    suspend() { this.state = 'suspended'; return Promise.resolve(); }
    createGain() { return new Node(); }
    createMediaElementSource(el) { el.wired = (el.wired || 0) + 1; if (el.wired > 1) throw new Error('InvalidStateError: HTMLMediaElement already connected'); return new Node(); }
    createBuffer(ch, len, sr) { return new Buf(ch, len, sr); }
    createBufferSource() { const n = new Node(); n.start = () => { if (n.buffer && n.buffer.length > 1) log.plays++; n.started = true; }; n.stop = () => {}; return n; }
    decodeAudioData(ab, ok, ng) { if (o.decodeFail) { ng(new Error('EncodingError')); return; } const b = new Buf(1, 44100 * 6, 44100); b.ch[0][100] = 0.5; b.ch[0][4000] = 0.2; ok(b); }
  }
  class Audio {
    constructor() { this.src = ''; this.volume = 1; this.loop = false; this.paused = true; this.ls = {}; this.plays = 0; log.audios.push(this); }
    canPlayType() { return o.canPlay === false ? '' : 'probably'; }
    addEventListener(t, f) { (this.ls[t] = this.ls[t] || []).push(f); }
    emit(t) { (this.ls[t] || []).forEach((f) => f()); }
    play() { this.plays++; if (o.rejectPlay) { this.paused = true; const e = new Error('NotAllowedError'); e.name = 'NotAllowedError'; return Promise.reject(e); } this.paused = false; return Promise.resolve(); }
    pause() { this.paused = true; }
    load() {}
  }
  class XHR { open(m, u) { this.url = u; } send() { log.xhr.push(this.url); setTimeout(() => { if (o.xhrFail) { this.status = 404; this.response = null; } else { this.status = 200; this.response = new ArrayBuffer(8); } this.onload && this.onload(); }, 0); } }
  const doc = { hidden: false, ls: {}, addEventListener(t, f) { (this.ls[t] = this.ls[t] || []).push(f); }, emit(t) { (this.ls[t] || []).forEach((f) => f()); } };
  const store = o.store || { d: {}, getItem(k) { return this.d[k] ?? null; }, setItem(k, v) { this.d[k] = String(v); } };
  const w = { localStorage: store, Audio, XMLHttpRequest: XHR, document: doc };
  if (!o.noWebAudio) w.AudioContext = Ctx;
  new Function('window', rd('js/audio/audio-manager.js'))(w);
  return { A: w.MMAUDIO, log, w, doc, store };
}
/** 合成音（legacy）の偽物：呼ばれた記録だけ */
function legacySpy(A) {
  const L = { bgm: [], stop: 0, sfx: [], muted: false };
  A.attachLegacy({ bgm: (s) => L.bgm.push(s), stop: () => { L.stop++; }, sfx: (n, o) => { L.sfx.push([n, o && o.legacy]); return true; }, muted: () => L.muted, setMuted: (on) => { L.muted = on; } });
  return L;
}
const active = (A) => A.status().slots.filter((s) => s.active);
const BGM = (A, k = 'TOWN', src = './bgm/town.ogg', gain = 0.7) => A.registerBgm(k, src, { gain });

test('AUDIO-1：同じ場面を続けて指定しても BGM は増えない（<audio> は2本だけ・鳴っているのは1本・play() は1回）', async () => {
  const { A, log } = env(); legacySpy(A); BGM(A);
  assert.equal(A.scene('TOWN'), true); assert.equal(A.scene('TOWN'), false); assert.equal(A.scene('TOWN'), false); A.scene('TOWN', { fade: 'quick' });
  await tick(20);
  assert.equal(active(A).length, 1); assert.equal(log.audios.filter((a) => a.src === './bgm/town.ogg').length, 1);
  assert.equal(log.audios.find((a) => a.src === './bgm/town.ogg').plays, 1, 'play() は1回');
  assert.ok(log.audios.length <= 3, '<audio> はプール2本（＋canPlayType 用の1本）だけ：' + log.audios.length);
  assert.equal(A.status().plays, 1);
});

test('AUDIO-2：A → B で B だけが残る（A はフェードアウトして止まる。B はクロスフェードで上がる）', async () => {
  const { A, log } = env(); legacySpy(A); BGM(A, 'TOWN', './bgm/a.ogg', 0.7); BGM(A, 'MARKET', './bgm/b.ogg', 0.5);
  A.scene('TOWN'); await tick(5); A.scene('MARKET'); await tick(800);
  const a = log.audios.find((x) => x.src === './bgm/a.ogg'), b = log.audios.find((x) => x.src === './bgm/b.ogg');
  assert.ok(a.paused, 'A は止まる'); assert.ok(!b.paused, 'B は鳴っている');
  const s = A.status(); assert.equal(active(A).length, 1); assert.equal(active(A)[0].src, './bgm/b.ogg'); assert.equal(active(A)[0].gain, 0.5, 'B の音量＝registry の gain（GainNode）');
  assert.equal(s.slots.find((x) => x.src === './bgm/a.ogg'), undefined, 'A の slot は空になる'); assert.equal(s.scene, 'MARKET'); assert.equal(s.source, 'file');
});

test('AUDIO-3：A → B → C を続けて切り替えても C だけが残る。<audio> への MediaElementSource の接続は要素ごとに1回だけ', async () => {
  const { A, log } = env(); legacySpy(A);
  for (const [k, f] of [['TOWN', 'a'], ['MARKET', 'b'], ['RANCH', 'c'], ['FARM', 'd']]) BGM(A, k, `./bgm/${f}.ogg`);
  A.scene('TOWN'); A.scene('MARKET'); A.scene('RANCH'); await tick(800);
  const el = (f) => log.audios.find((x) => x.src === `./bgm/${f}.ogg`);
  assert.ok(!el('c').paused, 'C は鳴っている'); assert.equal(active(A).length, 1); assert.equal(active(A)[0].src, './bgm/c.ogg'); assert.ok(active(A)[0].gain > 0);
  assert.ok(log.audios.filter((x) => !x.paused).length === 1, '鳴っている <audio> は1本');
  for (let i = 0; i < 12; i++) A.scene(['TOWN', 'MARKET', 'RANCH', 'FARM'][i % 4]);
  await tick(800);
  assert.equal(active(A).length, 1); assert.equal(active(A)[0].src, './bgm/d.ogg'); assert.equal(log.audios.filter((x) => !x.paused).length, 1);
  for (const x of log.audios) assert.ok(!x.wired || x.wired === 1, 'createMediaElementSource は要素ごとに1回');
  assert.deepEqual(A.status().errors, []);
});

test('AUDIO-4：正式な BGM が鳴る場面では合成 BGM を止め、鳴らさない（二重再生なし）。曲の無い場面は合成 BGM', async () => {
  const { A } = env(); const L = legacySpy(A); BGM(A, 'TOWN', './bgm/town.ogg');
  A.scene('TOWN'); await tick(5);
  assert.deepEqual(L.bgm, [], '正式な曲の場面では合成 BGM を呼ばない'); assert.ok(L.stop >= 1, '合成 BGM は止める');
  A.scene('TRAINING'); await tick(5);
  assert.deepEqual(L.bgm, ['TRAINING']); assert.equal(A.status().source, 'legacy'); assert.equal(active(A).length, 0, 'ファイルの BGM はフェードアウトに入る');
  await tick(800); assert.equal(A.status().slots.filter((s) => !s.paused).length, 0);
  A.scene('TOWN'); await tick(5); assert.equal(A.status().source, 'file'); assert.deepEqual(L.bgm, ['TRAINING'], '戻っても合成 BGM は呼ばれない');
  assert.equal(L.stop >= 2, true);
});

test('AUDIO-5：正式な BGM の読み込み失敗（404・デコード不可）・再生できない形式は、合成 BGM へ落ちる。同じファイルを何度も試さない', async () => {
  const { A, log } = env(); const L = legacySpy(A); BGM(A, 'TOWN', './bgm/missing.ogg');
  A.scene('TOWN'); await tick(5);
  const el = log.audios.find((x) => x.src === './bgm/missing.ogg'); el.emit('error'); await tick(5);
  assert.deepEqual(L.bgm, ['TOWN'], '失敗したら同じ場面を合成 BGM で'); assert.equal(A.status().source, 'legacy'); assert.deepEqual(A.status().failed, ['./bgm/missing.ogg']);
  assert.equal(A.status().errors.length, 1);
  A.scene('MARKET'); A.scene('TOWN'); await tick(5);
  assert.equal(log.audios.filter((x) => x.src === './bgm/missing.ogg').length, 1, '失敗したファイルは試し直さない'); assert.deepEqual(L.bgm, ['TOWN', 'MARKET', 'TOWN']);
  assert.equal(A.status().errors.length, 1, '同じエラーは1回だけ記録');
  // 形式が再生できない（canPlayType が空）→ 最初から合成 BGM
  const e2 = env({ canPlay: false }); const L2 = legacySpy(e2.A); BGM(e2.A, 'TOWN', './bgm/town.ogg'); e2.A.scene('TOWN'); await tick(5);
  assert.deepEqual(L2.bgm, ['TOWN']); assert.equal(e2.log.audios.filter((x) => x.src === './bgm/town.ogg').length, 0);
  // src が配列なら再生できる形式を選ぶ
  const e3 = env(); legacySpy(e3.A); e3.A.registerBgm('TOWN', ['./bgm/town.xyz', './bgm/town.ogg']); e3.A.scene('TOWN'); await tick(5);
  assert.equal(active(e3.A)[0].src, './bgm/town.ogg');
});

test('AUDIO-6：ミュートで全部の経路が止まる（Master の GainNode＝ファイル BGM・合成 BGM、ファイル SE・合成 SE は鳴らさない）', async () => {
  const { A, log, w } = env(); const L = legacySpy(A); BGM(A, 'TOWN', './bgm/town.ogg'); A.registerSe('UI_CONFIRM', './se/ok.ogg');
  A.unlock(); await tick(10); A.scene('TOWN'); await tick(5);
  assert.equal(A.se('UI_CONFIRM'), true); assert.equal(log.plays, 1, 'ファイル SE は AudioBuffer で鳴る');
  A.setMuted(true);
  assert.equal(L.muted, true); assert.equal(A.status().muted, true);
  assert.equal(A.se('UI_CONFIRM'), false); assert.equal(A.se('DICE_LAND'), false); assert.equal(log.plays, 1); assert.deepEqual(L.sfx, [], 'ミュート中は合成 SE も呼ばない');
  const master = A.status(); assert.equal(master.source, 'file');
  // Master の gain が 0（GainNode。iPhone でも効く）
  const ctxMaster = w.__master; // 直接は見えないので、状態で確かめる：ミュート後に合成 BGM へ切り替えても鳴らさない
  A.scene('TRAINING'); await tick(5); assert.deepEqual(L.bgm, [], 'ミュート中は合成 BGM を始めない'); assert.equal(A.status().source, 'legacy');
  assert.equal(ctxMaster, undefined);
});

test('AUDIO-7：ミュート解除で BGM が増えない（ファイル BGM は鳴らし直さない。合成 BGM はその場面だけ1回）', async () => {
  const { A, log } = env(); const L = legacySpy(A); BGM(A, 'TOWN', './bgm/town.ogg');
  A.unlock(); A.scene('TOWN'); await tick(5);
  const n0 = log.audios.length, p0 = log.audios.find((x) => x.src === './bgm/town.ogg').plays;
  A.setMuted(true); A.setMuted(false); A.setMuted(true); A.setMuted(false); await tick(5);
  assert.equal(log.audios.length, n0); assert.equal(log.audios.find((x) => x.src === './bgm/town.ogg').plays, p0, 'ファイル BGM は鳴らし直さない'); assert.equal(active(A).length, 1);
  assert.deepEqual(L.bgm, []);
  A.scene('TRAINING'); await tick(5); assert.deepEqual(L.bgm, ['TRAINING']);
  const s1 = L.stop; A.setMuted(true); assert.ok(L.stop > s1, 'ミュートで合成 BGM は止める'); A.setMuted(false); assert.deepEqual(L.bgm, ['TRAINING', 'TRAINING'], '合成 BGM はその場面を1回だけ鳴らし直す');
});

test('AUDIO-8：音量は localStorage mmaudio（{ bgm, se }）と互換。既存の値を読み、0〜1 に収めて保存する', () => {
  const store = { d: { mmaudio: JSON.stringify({ bgm: 0.5, se: 0.3 }) }, getItem(k) { return this.d[k] ?? null; }, setItem(k, v) { this.d[k] = String(v); } };
  const { A } = env({ store });
  assert.deepEqual(A.status().volume, { bgm: 0.5, se: 0.3 });
  A.setVolume('bgm', 3); A.setVolume('se', -1); A.setVolume('nope', 1);
  assert.deepEqual(A.status().volume, { bgm: 1, se: 0 }); assert.deepEqual(JSON.parse(store.getItem('mmaudio')), { bgm: 1, se: 0 });
  const bad = { d: { mmaudio: '{broken' }, getItem(k) { return this.d[k] ?? null; }, setItem(k, v) { this.d[k] = String(v); } };
  assert.deepEqual(env({ store: bad }).A.status().volume, { bgm: 0.8, se: 0.9 }, '壊れた値は既定値');
});

test('AUDIO-9：旧 sfx(n) → 出来事の名前 → MMAUDIO。fight()（Phase 6）の中の sfx(n) も届く。合成音へ落ちるときは元の番号の音のまま', () => {
  assert.match(HTML, /function sfx\(t,dl\)\{const n=sfxEventOf\(t\);if\(n&&MMAUDIO\.se\(n,\{delay:dl,legacy:t\}\)\)return;sfxSynth\(t,dl\)\}/);
  assert.match(HTML, /function sfxSynth\(t,dl\)\{const c=AU\.ctx;/);
  assert.match(HTML, /sfx:\(n,o\)=>\{const t=o&&o\.legacy!=null\?o\.legacy:LEGACY_SE\[n\];if\(t==null\)return false;sfxSynth\(t,o&&o\.delay\);return true\}/, '合成音は元の番号で鳴らす');
  const T = new Function(HTML.match(/const SFX_EVENT=\{[^;]*\};/)[0] + 'return SFX_EVENT;')();
  const { A } = env(); const L = legacySpy(A);
  for (const [n, [a, b]] of Object.entries(T)) { for (const x of [a, b]) if (x) assert.ok(A.SE.includes(x), `${n} → ${x} は SE の名前`); }
  assert.deepEqual(T[7], ['DICE_THROW', 'ROULETTE_TICK'], 'バトル中の 7 はルーレットのコマ送り');
  assert.equal(A.se('DICE_THROW', { legacy: 7 }), true); assert.deepEqual(L.sfx, [['DICE_THROW', 7]]);
  // fight() の中は変えていない（sfx の呼び出しが残っている）。本体のハッシュは tests/phase7.test.mjs
  const fight = HTML.slice(HTML.indexOf('async function fight(i,teach){'), HTML.indexOf('$("#snd").textContent', HTML.indexOf('async function fight(i,teach){')));
  assert.ok(/sfx\(9\)/.test(fight) && /sfx\(7\)/.test(fight) && /sfx\(3\)/.test(fight) && /skSfx\(k\)/.test(fight));
  assert.match(HTML, /function sfxEventOf\(t\)\{const b=!!document\.getElementById\("bt"\)/);
  // 画面の鍵 → 場面（音源のパスは index.html に書かない）
  assert.match(HTML, /function bgm\(sc\)\{const s=audioSceneFor\(sc\);if\(s\)MMAUDIO\.scene\(s\)\}/);
  assert.doesNotMatch(HTML, /new Audio\(|\.mp3|\.ogg|\.wav|assets\/audio/, 'index.html に音源のファイル名・パスを書かない（registry だけ）');
  for (const f of ['js/chapter/field-view.js', 'js/chapter/dice-renderer.js', 'js/feel/game-feel.js', 'js/phase8/raising.js']) assert.doesNotMatch(rd(f), /\.ogg|\.mp3|assets\/audio/, f);
  assert.doesNotMatch(rd('js/chapter/field-view.js'), /root\.sfx\(7\)/, 'サイコロの合成音の直接呼び出し（DICE_THROW と二重）は無い');
  const LB = new Function(HTML.match(/const LEGACY_BGM=\{[^}]*\};/)[0] + 'return LEGACY_BGM;')();
  for (const s of A.SCENES) assert.ok(LB[s], `${s} の合成 BGM がある`);
  for (const s of Object.keys(LB)) assert.ok(A.SCENES.includes(s), s);
  const LS = new Function(HTML.match(/const LEGACY_SE=\{[^}]*\};/)[0] + 'return LEGACY_SE;')();
  for (const k of Object.keys(LS)) assert.ok(A.SE.includes(k), k);
  for (const k of ['STEP', 'TILE_STOP', 'CHAPTER_START', 'CHAPTER_CLEAR', 'TOURNAMENT_START']) assert.equal(LS[k], undefined, `${k} は合成音では鳴らさない`);
});

test('AUDIO-10：未登録の SE・場面、404、decode の失敗、play() の拒否でもゲームは止まらない（false／記録だけ。同じ記録は1回）', async () => {
  const { A } = env({ xhrFail: true }); A.attachLegacy({ bgm() {}, stop() {}, sfx: (n) => n === 'UI_CONFIRM', muted: () => false, setMuted() {} });
  assert.equal(A.se('NOPE'), false); assert.equal(A.scene('NOPE'), false); assert.equal(A.se('BATTLE_BLOCK'), false, '登録も合成音も無い SE は何もしない');
  A.registerSe('UI_CONFIRM', './se/missing.ogg'); A.unlock(); await tick(10);
  assert.equal(A.status().se.UI_CONFIRM, 'failed'); assert.equal(A.se('UI_CONFIRM'), true, '合成音へ'); await tick(40); A.se('UI_CONFIRM'); assert.equal(A.status().errors.filter((e) => /se-load/.test(e)).length, 1, '同じ読み込み失敗は1回だけ記録');
  const e2 = env({ decodeFail: true }); legacySpy(e2.A); e2.A.registerSe('STAT_UP', './se/x.ogg'); e2.A.unlock(); await tick(10);
  assert.equal(e2.A.status().se.STAT_UP, 'failed'); assert.doesNotThrow(() => e2.A.se('STAT_UP'));
  const e3 = env({ rejectPlay: true }); legacySpy(e3.A); BGM(e3.A, 'TITLE', './bgm/title.ogg'); assert.doesNotThrow(() => e3.A.scene('TITLE')); await tick(10);
  assert.equal(e3.A.status().pendingScene, 'TITLE', '拒否は保留して最初の操作で再開'); assert.doesNotThrow(() => e3.A.unlock());
  assert.throws(() => A.registerBgm('NOPE', 'x.ogg')); assert.throws(() => A.registerSe('NOPE', 'x.ogg')); assert.throws(() => A.registerBgm('TOWN', [], { fallback: 'NOPE' }));
  assert.doesNotThrow(() => { A.stopBgm(); A.setMuted(true); A.setMuted(false); A.unlock(); });
});

test('AUDIO-11：AudioContext は1つだけ。suspended → 最初の操作で resume。裏に回ったら suspend、戻ったら resume して BGM を続ける', async () => {
  const { A, log, doc } = env({ ctxState: 'suspended' }); legacySpy(A); BGM(A, 'TOWN', './bgm/town.ogg'); A.registerSe('UI_CONFIRM', './se/ok.ogg');
  A.scene('TOWN'); await tick(10);
  assert.equal(A.status().context, 'suspended'); assert.equal(A.se('UI_CONFIRM'), true, '止まっている間は合成音へ'); assert.equal(log.plays, 0);
  A.unlock(); A.unlock(); A.unlock(); await tick(5);
  assert.equal(A.status().context, 'running'); assert.equal(log.ctxs, 1, 'AudioContext は1つ'); assert.equal(A.context(), A.context());
  await tick(40); assert.equal(A.se('UI_CONFIRM'), true); assert.equal(log.plays, 1, '動き出したらファイルの SE（AudioBuffer）');
  doc.hidden = true; doc.emit('visibilitychange'); assert.equal(A.status().context, 'suspended'); assert.ok(log.audios.find((x) => x.src === './bgm/town.ogg').paused, '裏では BGM も止める');
  doc.hidden = false; doc.emit('visibilitychange'); await tick(5);
  assert.equal(A.status().context, 'running'); assert.ok(!log.audios.find((x) => x.src === './bgm/town.ogg').paused, '戻ったら続きから'); assert.equal(active(A).length, 1);
  // 中断（electron 以外の 'interrupted' など）からの復帰：operation の unlock で play() し直す
  const el = log.audios.find((x) => x.src === './bgm/town.ogg'); el.paused = true; A.unlock(); assert.ok(!el.paused);
});

test('AUDIO-12：Web Audio が使えない環境でも止まらない（<audio> の volume で鳴らし、SE は合成音へ。AudioContext は作らない）', async () => {
  const { A, log } = env({ noWebAudio: true }); const L = legacySpy(A); BGM(A, 'TOWN', './bgm/town.ogg', 0.5); A.registerSe('UI_CONFIRM', './se/ok.ogg');
  assert.doesNotThrow(() => { A.unlock(); A.scene('TOWN'); A.se('UI_CONFIRM'); A.setMuted(true); A.setMuted(false); A.setVolume('bgm', 0.5); });
  await tick(800);
  const el = log.audios.find((x) => x.src === './bgm/town.ogg'); assert.ok(el && !el.paused); assert.ok(Math.abs(el.volume - 0.25) < 0.01, `volume＝bgm 0.5 × gain 0.5：${el.volume}`);
  assert.equal(A.status().webAudio, false); assert.equal(A.status().context, null); assert.deepEqual(L.sfx, [['UI_CONFIRM', undefined]]);
  A.setMuted(true); await tick(300); assert.ok(el.volume < 0.01, 'ミュートは volume で'); A.setMuted(false); await tick(300); assert.ok(el.volume > 0.2);
});

/** registry（js/audio/audio-registry.js）を読む：MMAUDIO の偽物に登録させて中身を取り出す */
function loadRegistry() {
  const got = { bgm: {}, se: {} }, w = { MMAUDIO: { registerAll: (r) => { Object.assign(got.bgm, r.bgm); Object.assign(got.se, r.se); } } };
  new Function('window', rd('js/audio/audio-registry.js'))(w);
  return { got, REG: w.MMAUDIO_REGISTRY };
}
const srcsOf = (v) => (typeof v === 'string' ? [v] : [].concat(v.srcs || v.src || []));
const onDisk = (src) => path.join(ROOT, src.replace(/^\.\//, ''));

test('AUDIO-13：registry の BGM：場面の名前が正しく、ファイルが実在し、gain が正の数、fallback の場面が存在する。index.html から読み込む順も正しい', () => {
  const { got, REG } = loadRegistry(), { A } = env();
  assert.ok(Object.keys(got.bgm).length >= 8, 'BGM の登録がある');
  for (const [k, v] of Object.entries(got.bgm)) {
    assert.ok(A.SCENES.includes(k), `場面の名前：${k}`);
    const srcs = srcsOf(v); if (!srcs.length) assert.ok(v.silent === true || (v.fallback && A.SCENES.includes(v.fallback)), `${k}：曲か fallback か silent が要る`);
    for (const s of srcs) { assert.match(s, /^\.\/assets\/audio\/bgm\//, s); assert.ok(existsSync(onDisk(s)) && statSync(onDisk(s)).size > 1000, `ファイルが実在：${s}`); }
    if (v.gain != null) assert.ok(Number.isFinite(v.gain) && v.gain > 0 && v.gain <= 1.5, `${k} の gain`);
    if (v.fallback) assert.ok(srcsOf(got.bgm[v.fallback] || {}).length, `${k} の fallback（${v.fallback}）には曲がある`);
  }
  assert.doesNotThrow(() => A.registerAll(REG));
  // 同じ曲を多数の場面へ使い回していない（1曲＝1場面。fallback は別）
  const used = {}; for (const [k, v] of Object.entries(got.bgm)) for (const s of srcsOf(v)) { used[s] = used[s] || []; used[s].push(k); }
  for (const [s, ks] of Object.entries(used)) assert.equal(ks.length, 1, `${s} は1場面だけ：${ks}`);
  assert.match(HTML, /<script src="\.\/js\/audio\/audio-manager\.js"><\/script>\n<script src="\.\/js\/audio\/audio-registry\.js"><\/script>/, 'registry は Audio Manager の直後に読む');
  assert.doesNotMatch(rd('js/audio/audio-registry.js'), /\bfetch\s*\(|^\s*import\s|^\s*export\s/m);
});

test('AUDIO-14：registry の SE：出来事の名前が正しく、ファイルが実在し、gain が正の数。ふだんは鳴らない5つ（STEP…）も registry で決めてある（ファイルか silent）', () => {
  const { got } = loadRegistry(), { A } = env();
  assert.ok(Object.keys(got.se).length >= 15);
  for (const [k, v] of Object.entries(got.se)) {
    assert.ok(A.SE.includes(k), `出来事の名前：${k}`);
    const srcs = srcsOf(v); assert.ok(srcs.length || v.silent === true, `${k}：ファイルか silent`);
    for (const s of srcs) { assert.match(s, /^\.\/assets\/audio\/se\//, s); assert.ok(existsSync(onDisk(s)) && statSync(onDisk(s)).size > 100, `ファイルが実在：${s}`); }
    if (v.gain != null) assert.ok(Number.isFinite(v.gain) && v.gain > 0 && v.gain <= 8, `${k} の gain`);
  }
  for (const k of ['UI_CONFIRM', 'UI_CANCEL', 'UI_ERROR', 'DICE_THROW', 'DICE_LAND', 'STAT_UP', 'GOLD_GET', 'CHEST_OPEN', 'WILD_ALERT', 'BATTLE_START', 'STEP', 'TILE_STOP', 'CHAPTER_START', 'CHAPTER_CLEAR', 'TOURNAMENT_START']) assert.ok(got.se[k], k);
});

test('AUDIO-15：assets/audio に同じ曲の別形式（ogg／mp3／wav…）の重複が無く、ZIP・WAV・一時ファイルも無い。置いたファイルはすべて registry から参照されている', () => {
  const files = []; const walk = (d) => { for (const n of readdirSync(d)) { const p = path.join(d, n); if (statSync(p).isDirectory()) walk(p); else files.push(p); } };
  walk(path.join(ROOT, 'assets/audio'));
  const audio = files.filter((f) => !/README\.md$/.test(f));
  for (const f of audio) assert.match(f, /\.(ogg|m4a|mp3)$/, `音源の形式：${f}`);
  const stems = {}; for (const f of audio) { const k = f.replace(/\.[a-z0-9]+$/i, ''); (stems[k] = stems[k] || []).push(f); }
  for (const [k, v] of Object.entries(stems)) assert.equal(v.length, 1, `同じ曲の別形式：${v}`);
  for (const f of files) assert.doesNotMatch(f, /\.(zip|wav|tmp|bak|DS_Store)$/i, f);
  const { got } = loadRegistry(); const ref = new Set([...Object.values(got.bgm), ...Object.values(got.se)].flatMap(srcsOf).map(onDisk));
  for (const f of audio) assert.ok(ref.has(f), `registry から参照されていないファイル：${path.relative(ROOT, f)}`);
  assert.ok(existsSync(path.join(ROOT, 'AUDIO_CREDITS.md')) && existsSync(path.join(ROOT, 'assets/audio/README.md')));
  const credits = rd('AUDIO_CREDITS.md'); for (const n of ['JP Soundworks', 'CC BY 4.0', 'Interface SFX Pack 1', 'Ivokard', 'CC0', 'alkakrab', 'Free 25 Fantasy RPG Game Tracks Vol.3', 'HydroGene']) assert.ok(credits.includes(n), n);
});

test('AUDIO-16：場面の別名（旧名）は正式名へ読み替える。fallback の連鎖で曲を引き継ぐ場面は、同じ曲なら鳴らし直さない', async () => {
  const { A, log } = env(); legacySpy(A); BGM(A, 'WILD_BATTLE', './bgm/battle.ogg'); A.registerBgm('RARE_WILD_BATTLE', [], { fallback: 'WILD_BATTLE' }); A.registerBgm('RIVAL_BATTLE', [], { fallback: 'RARE_WILD_BATTLE' });
  assert.equal(A.resolveScene('FACILITY'), 'MARKET'); assert.equal(A.resolveScene('BATTLE'), 'WILD_BATTLE'); assert.equal(A.resolveScene('TOURNAMENT'), 'TOURNAMENT_LOBBY_LOW'); assert.equal(A.resolveScene('SPECIAL'), 'SPECIAL_BATTLE'); assert.equal(A.resolveScene('x'), null);
  assert.equal(A.resolveBgm('RIVAL_BATTLE').key, 'WILD_BATTLE');
  A.scene('BATTLE'); await tick(5); assert.equal(A.status().scene, 'WILD_BATTLE');
  A.scene('RIVAL_BATTLE'); await tick(5); assert.equal(A.status().scene, 'RIVAL_BATTLE'); assert.equal(log.audios.find((x) => x.src === './bgm/battle.ogg').plays, 1, '同じ曲は鳴らし直さない'); assert.equal(active(A).length, 1);
  assert.deepEqual(A.status().inherits, ['RARE_WILD_BATTLE', 'RIVAL_BATTLE']);
});

test('AUDIO-17：registry の silent：場面は BGM も合成 BGM も鳴らさない（ほかの曲は止める・同じ場面は何もしない）。出来事は合成音にも落とさない', async () => {
  const { A, log } = env(); const L = legacySpy(A); BGM(A, 'MARKET', './bgm/m.ogg'); A.registerBgm('TOWN', [], { silent: true }); A.registerSe('STEP', [], { silent: true });
  A.scene('MARKET'); await tick(5); A.scene('TOWN'); await tick(800);
  assert.equal(A.status().source, 'silent'); assert.equal(active(A).length, 0); assert.ok(log.audios.find((x) => x.src === '' || x.paused), 'ほかの曲は止める'); assert.deepEqual(L.bgm, [], '合成 BGM も鳴らさない'); assert.ok(L.stop >= 1);
  assert.equal(A.scene('TOWN'), false, '同じ無音の場面は何もしない');
  A.setMuted(true); A.setMuted(false); assert.deepEqual(L.bgm, [], 'ミュート解除でも鳴らさない');
  assert.equal(A.se('STEP'), true); assert.deepEqual(L.sfx, [], '合成音へ落とさない'); assert.deepEqual(A.status().silent, { bgm: ['TOWN'], se: ['STEP'] });
  assert.doesNotThrow(() => A.registerAll({ bgm: { CHAPTER_1: { silent: true } }, se: { DICE_THROW: { silent: true } } }));
});

test('AUDIO-18：最初のタップ（AudioContext の resume を頼んだ直後・まだ suspended）でも、ファイルの SE は予約して1回だけ鳴る（合成音へ二重に落ちない）。裏に回っている間は予約しない', async () => {
  const { A, log, doc } = env({ ctxState: 'suspended' }); const L = legacySpy(A); A.registerSe('TITLE_START', './se/start.ogg');
  A.context(); await tick(20);
  let resumed = 0; const c = A.context(); c.resume = () => { resumed++; return new Promise((ok) => setTimeout(() => { c.state = 'running'; ok(); }, 30)); };
  A.unlock(); assert.equal(c.state, 'suspended');
  assert.equal(A.se('TITLE_START'), true); assert.equal(log.plays, 1, 'resume を待たずに予約'); assert.deepEqual(L.sfx, [], '合成音は鳴らさない');
  await tick(60); assert.equal(c.state, 'running'); assert.equal(resumed, 1);
  c.state = 'suspended'; doc.hidden = true; doc.emit('visibilitychange'); await tick(5); assert.equal(A.se('TITLE_START'), true); assert.equal(log.plays, 1, '裏では予約しない（合成音へ）');
});

test('AUDIO-19：index.html：開始のタップは TITLE_START の1音だけ（ファイルが鳴らなければ合成のファンファーレ）。名前登録まで TITLE の曲。VS（対戦相手の発表）・能力比較は TOURNAMENT_MATCHUP、実戦の曲は「FIGHT!」の開始音のあと。ゴールは TOURNAMENT_ENTRY', () => {
  assert.match(HTML, /unlock\(\);clearInterval\(AU\.tm\);AU\.tm=null;AU\.sc=null;if\(!MMAUDIO\.se\("TITLE_START"\)\)fanfare\(\);/);
  assert.match(HTML, /class="p15start" data-nsfx="1"/, '開始ボタンは UI_CONFIRM を鳴らさない');
  assert.match(HTML, /function p11NameScr\(msg\)\{bgm\("title"\);/);
  assert.match(HTML, /bgm\("matchup"\);try\{MMFEEL\.emit\("battle\.matchup"\)\}catch\(e\)\{\}p9Immersive\(true\);/, 'VS は BGM を止めて発表の音');
  assert.match(HTML, /data-nsfx="1" onclick="p9VsScr\(\)"/, 'VS へ進むボタンの決定音と発表の音を重ねない');
  assert.match(HTML, /function p9PreBattle\(kind,rank,go\)\{const m=S\.m;bgm\("matchup"\);/, '能力比較は発表と同じ場面（音を重ねない）');
  const fight = HTML.slice(HTML.indexOf('async function fight(i,teach){'), HTML.indexOf('$("#snd").textContent', HTML.indexOf('async function fight(i,teach){')));
  assert.ok(fight.startsWith('async function fight(i,teach){if(document.getElementById("bt")||!S.m)return;bgm(teach!=null?"dojo":"battle");'), 'fight() は変えていない');
  assert.match(fight, /sfx\(9\);done\(\)/, 'STOP は sfx(9)'); assert.match(fight, /ban\("FIGHT!","#ff5a3a"\);sfx\(3\);/, '開始は sfx(3)');
  // 画面の鍵 → 場面・実戦の曲の予約（S・AU・MMAUDIO・document の偽物）
  const src = HTML.match(/const BGM_SCENE=\{[^}]*\};/)[0] + HTML.match(/const SFX_EVENT=\{[^\n]*\};/)[0] + HTML.slice(HTML.indexOf('function sfxEventOf(t){'), HTML.indexOf('function bgm(sc){'));
  const mk = (raise, bt) => { const calls = [], timers = [], AU = {}, S = { m: raise ? { raise } : null };
    const env = { S, AU, MMAUDIO: { scene: (s, o) => calls.push(['scene', s]), stopBgm: (o) => calls.push(['stop', o && o.fade]) }, MMP8: { boardPhase: (m) => (m.raise.goal ? 'goal' : 'roll') },
      document: { getElementById: (id) => (id === 'bt' && bt ? {} : null) }, setTimeout: (f, ms) => { timers.push([f, ms]); return timers.length; }, clearTimeout: () => {} };
    const f = new Function(...Object.keys(env), src + 'return { audioSceneFor, sfxEventOf, battleSceneFor };')(...Object.values(env));
    return { ...f, calls, timers, AU };
  };
  const t = mk({ ch: 1, goal: true }); assert.equal(t.audioSceneFor('chapter'), 'TOURNAMENT_ENTRY'); assert.equal(mk({ ch: 2 }).audioSceneFor('chapter'), 'CHAPTER_2');
  assert.equal(t.audioSceneFor('matchup'), 'TOURNAMENT_MATCHUP'); assert.equal(t.audioSceneFor('entry'), 'TOURNAMENT_ENTRY');
  const b = mk({ battle: { kind: 'league', rank: 4 }, tour: { status: 'league', rank: 4 } }, true);
  assert.equal(b.audioSceneFor('battle'), null, 'fight() の最初では曲を始めない'); assert.deepEqual(b.calls, [['stop', 'quick']], 'それまでの曲は短く止める'); assert.equal(b.AU.btScene, 'TOURNAMENT_BATTLE_HIGH');
  assert.equal(b.sfxEventOf(9), 'ROULETTE_STOP'); assert.equal(b.sfxEventOf(7), 'ROULETTE_TICK');
  assert.equal(b.sfxEventOf(3), 'BATTLE_START'); const go = b.timers.find((x) => x[1] === 450); assert.ok(go, '開始音の0.45秒後に実戦の曲');
  go[0](); assert.deepEqual(b.calls.at(-1), ['scene', 'TOURNAMENT_BATTLE_HIGH']); assert.equal(b.sfxEventOf(3), 'VICTORY');
  assert.equal(mk({ battle: { kind: 'league', rank: 1 }, tour: { status: 'league', rank: 1 } }).battleSceneFor(), 'TOURNAMENT_BATTLE_LOW');
  for (const [bt, sc] of [['wild', 'WILD_BATTLE'], ['rare', 'RARE_WILD_BATTLE'], ['rival', 'RIVAL_BATTLE']]) assert.equal(mk({ pend: { fx: { battleType: bt } }, battle: { kind: 'practice', rank: 0 } }).battleSceneFor(), sc);
  assert.equal(mk({}, false).sfxEventOf(9), 'BATTLE_ATTACK', 'バトルの外の 9');
  // field-view：止まるマスでは足音を鳴らさない・大会会場は専用の出来事と受付の場面
  const FV = rd('js/chapter/field-view.js');
  assert.match(FV, /markCur\(id\); if \(!last\) feel\('step', \{ id \}\);/);
  assert.equal((FV.match(/id="brollbtn" data-nsfx="1"/g) || []).length, 2, 'START は決定音を鳴らさない（投げる音だけ）');
  assert.match(HTML, /if\(AU\.on\)setTimeout\(\(\)=>MMAUDIO\.se\("UI_CONFIRM"\),250\)\}/, '音を戻した合図は UI_CONFIRM（バトル中の sfx(3)＝開始・勝利と取り違えない）'); assert.match(FV, /feel\('tournament\.arrive'\);/); assert.match(FV, /if \(root\.bgm\) root\.bgm\('chapter'\);/);
});

test('AUDIO-20：ループ区間（loopStart／loopEnd）：終わりの手前で次の1本を loopStart で待たせ、loopEnd でクロスフェード。鳴っているのは1本だけ・常駐のタイマーなし。最後まで来たら loopStart へ。次の1本を鳴らせなければ元の1本へ戻す', async () => {
  const { A, log } = env(); legacySpy(A); A.registerBgm('TOWN', './bgm/t.ogg', { gain: 0.8, loopStart: 2, loopEnd: 20, loopXfade: 0.5 }); A.unlock(); A.scene('TOWN'); await tick(10);
  const el0 = log.audios.find((x) => x.src === './bgm/t.ogg');
  assert.equal(el0.loop, false, 'ループ区間のある曲は <audio> の loop を使わない');
  el0.currentTime = 15; el0.emit('timeupdate'); assert.equal(log.audios.filter((x) => /t\.ogg#t=2$/.test(x.src)).length, 0, 'まだ準備しない');
  el0.currentTime = 16.6; el0.emit('timeupdate');
  const el1 = log.audios.find((x) => x.src === './bgm/t.ogg#t=2'); assert.ok(el1 && el1.paused, '次の1本を loopStart（#t=2）で待たせる（鳴らさない）');
  assert.equal(A.status().slots.filter((s) => s.waiting).length, 1);
  const p1 = el1.plays;   // 最初の操作のときに無音で1回鳴らしてある（iPhone 用の準備）
  el0.currentTime = 19.2; el0.emit('timeupdate'); el0.emit('timeupdate');   // 渡すのは1回だけ
  await tick(450);
  const s1 = A.status(); assert.equal(s1.slots.filter((s) => s.active).length, 1, '鳴らしているのは1本'); assert.ok(!el1.paused, '次の1本が鳴る'); assert.equal(el1.plays - p1, 1, 'play() は1回');
  await tick(650); assert.ok(el0.paused, '前の1本はクロスフェードのあと止まる'); assert.equal(log.audios.filter((x) => !x.paused).length, 1);
  assert.equal(A.status().slots.find((s) => s.active).gain, 0.8, '音量は registry の gain');
  // 最後まで来た（裏でタイマーが遅れたなど）→ loopStart から
  const cur = log.audios.find((x) => !x.paused); cur.currentTime = 30; cur.emit('ended'); assert.equal(cur.currentTime, 2);
  // 次の1本を鳴らせない（iPhone の自動再生の制約など）→ 元の1本で続ける
  cur.currentTime = 16.6; cur.emit('timeupdate'); const nx = log.audios.find((x) => x !== cur && /#t=2$/.test(x.src) && x.paused);
  assert.ok(nx); nx.play = () => Promise.reject(Object.assign(new Error('NotAllowedError'), { name: 'NotAllowedError' }));
  cur.currentTime = 19.3; cur.emit('timeupdate'); await tick(400);
  assert.equal(A.status().slots.filter((s) => s.active).length, 1); assert.ok(!cur.paused, '元の1本が鳴り続ける'); assert.equal(cur.currentTime, 2, 'loopStart から');
  // 不正なループ区間はふつうのループ
  const e2 = env(); legacySpy(e2.A); e2.A.registerBgm('TOWN', './bgm/u.ogg', { loopStart: 10, loopEnd: 12 }); e2.A.unlock(); e2.A.scene('TOWN'); await tick(5);
  assert.equal(e2.log.audios.find((x) => x.src === './bgm/u.ogg').loop, true);
  // 場面を変えたら、待たせていた1本はその場面の曲に使い回す（増えない）
  const e3 = env(); legacySpy(e3.A); e3.A.registerBgm('TOWN', './bgm/t.ogg', { loopEnd: 20 }); e3.A.registerBgm('MARKET', './bgm/m.ogg'); e3.A.unlock(); e3.A.scene('TOWN'); await tick(5);
  const t0 = e3.log.audios.find((x) => x.src === './bgm/t.ogg'); t0.currentTime = 17; t0.emit('timeupdate');
  e3.A.scene('MARKET'); await tick(800);
  assert.equal(e3.A.status().slots.filter((s) => s.active).length, 1); assert.equal(e3.log.audios.filter((x) => !x.paused).length, 1); assert.ok(e3.log.audios.length <= 3);
});

test('AUDIO-21：SE の maxMs／fadeMs：長い余韻の素材を、ファイルを変えずに短く鳴らす（最後に音量を下げて止める）', async () => {
  const { A, log } = env(); legacySpy(A); A.registerSe('WILD_ALERT', './se/fx3.ogg', { gain: 2, maxMs: 2000, fadeMs: 700 }); A.registerSe('UI_CONFIRM', './se/ok.ogg');
  const c = A.context(); await tick(20); const gains = [], stops = [];
  const cg = c.createGain.bind(c); c.createGain = () => { const g = cg(); const p = g.gain, sv = p.setValueAtTime.bind(p), lr = p.linearRampToValueAtTime.bind(p); p.setValueAtTime = (v, t) => { gains.push(['set', v, t]); sv(v, t); }; p.linearRampToValueAtTime = (v, t) => { gains.push(['ramp', v, t]); lr(v, t); }; return g; };
  const cs = c.createBufferSource.bind(c); c.createBufferSource = () => { const n = cs(); n.stop = (t) => stops.push(t); return n; };
  assert.equal(A.se('WILD_ALERT'), true); assert.equal(log.plays, 1);
  assert.deepEqual(gains, [['set', 2, 1.3], ['ramp', 0, 2]], '1.3秒から下げて2秒で0'); assert.deepEqual(stops, [2.02], '2秒で止める');
  gains.length = 0; stops.length = 0; A.se('UI_CONFIRM'); assert.deepEqual([gains, stops], [[], []], 'maxMs の無い SE は最後まで');
  assert.equal(A.registryOf('se').WILD_ALERT.maxMs, 2000);
});

test('AUDIO-22：registry のループ区間・maxMs は正しい値（loopEnd は loopStart＋4秒より後・クロスフェードは区間の半分以下）。第3弾で採用したファイルは alkakrab のパック', () => {
  const { got } = loadRegistry(), { A } = env(); A.registerAll({ bgm: got.bgm, se: got.se });
  const R = A.registryOf('bgm');
  for (const [k, v] of Object.entries(got.bgm)) if (v.loopEnd != null) assert.ok(R[k].loopRange, `${k} のループ区間が有効`);
  for (const k of ['RIVAL_BATTLE', 'TOURNAMENT_BATTLE_HIGH']) assert.match(srcsOf(got.bgm[k])[0], /alkakrab_fantasy_rpg_vol3\//, k);   // TOWN・FARM は 2026-10-03 第4弾の試遊で NG → silent（AUDIO-23）
  for (const k of ['CHAPTER_START', 'WILD_ALERT']) assert.match(srcsOf(got.se[k])[0], /alkakrab_fantasy_rpg_vol3\//, k);   // MATCHUP は第4弾で NG → silent
  for (const [k, v] of Object.entries(got.se)) if (v.maxMs != null) assert.ok(v.maxMs >= 300 && v.maxMs <= 4000 && (v.fadeMs == null || v.fadeMs <= v.maxMs), k);
  assert.equal(got.bgm.CHAPTER_1.silent, true, 'Chapter 1 は第3弾でも見送り（候補が戦闘曲並みに忙しい）');
});

test('AUDIO-23：2026-10-03 第4弾の試遊で NG の音は無音（silent＝合成音にも落とさない・代わりの音を選ばない）。OK の音（CHAPTER_START・MARKET など）はそのまま。NG のファイルは置かない', () => {
  const { got } = loadRegistry();
  for (const k of ['TOWN', 'FARM', 'TOURNAMENT_ENTRY', 'TOURNAMENT_LOBBY_LOW', 'TOURNAMENT_LOBBY_HIGH', 'TOURNAMENT_MATCHUP', 'RESULT']) assert.deepEqual(got.bgm[k], { silent: true }, `BGM ${k}`);
  for (const k of ['TITLE_START', 'UI_CONFIRM', 'DICE_THROW', 'DICE_LAND', 'DICE_ROLL', 'DICE_STOP', 'TILE_STOP', 'TOURNAMENT_ARRIVAL', 'MATCHUP']) assert.deepEqual(got.se[k], { silent: true }, `SE ${k}`);
  assert.match(srcsOf(got.se.CHAPTER_START)[0], /fx_2\.ogg$/, 'Chapter 開始の音は OK（そのまま）'); assert.match(srcsOf(got.bgm.MARKET)[0], /town_village_theme_2\.ogg$/, '市場の曲は OK（そのまま）');
  const all = JSON.stringify(got);
  for (const f of ['ambient_4_tranquil_radiance', 'ambient_3_lost_river', 'event_music_4', 'confirm_style_1_004', 'confirm_style_5_001', 'pluck_3', 'pluck_5', 'fx_1.ogg']) assert.ok(!all.includes(f), `NG の音 ${f} を別の場面へ使い回さない`);
  const HTML = readFileSync(path.join(ROOT, 'index.html'), 'utf8'), intro = HTML.slice(HTML.indexOf('function p9TourIntro('), HTML.indexOf('// ---- Phase 9：公式大会（大会掲示板'));
  assert.doesNotMatch(intro, /sfx\(/, '大会開始の演出で音を鳴らさない（風切り音は NG）');
  const DR = readFileSync(path.join(ROOT, 'js/chapter/dice-renderer.js'), 'utf8'), GF = readFileSync(path.join(ROOT, 'js/feel/game-feel.js'), 'utf8');
  assert.match(GF, /'dice\.stop': \{ level: 2, se: 'DICE_STOP' \}/, '停止の音の差し込み口＝dice.stop → DICE_STOP（今は無音）');
  assert.match(DR, /await frame\(\);   \/\/ 止まった姿が描かれたフレームで「完全停止」\n    ov\.dataset\.stopped = '1'; feel\('dice\.stop'\);/, 'dice.stop はサイコロが見た目の上で止まったフレーム');
});
