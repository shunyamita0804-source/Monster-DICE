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
    const srcs = srcsOf(v); if (!srcs.length) assert.ok(v.fallback && A.SCENES.includes(v.fallback), `${k}：曲か fallback が要る`);
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

test('AUDIO-14：registry の SE：出来事の名前が正しく、ファイルが実在し、gain が正の数。ふだんは鳴らない5つ（STEP…）にも候補がある', () => {
  const { got } = loadRegistry(), { A } = env();
  assert.ok(Object.keys(got.se).length >= 15);
  for (const [k, v] of Object.entries(got.se)) {
    assert.ok(A.SE.includes(k), `出来事の名前：${k}`);
    const srcs = srcsOf(v); assert.ok(srcs.length, k);
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
  const credits = rd('AUDIO_CREDITS.md'); for (const n of ['JP Soundworks', 'CC BY 4.0', 'Interface SFX Pack 1', 'Ivokard', 'CC0']) assert.ok(credits.includes(n), n);
});

test('AUDIO-16：場面の別名（旧名）は正式名へ読み替える。fallback の連鎖で曲を引き継ぐ場面は、同じ曲なら鳴らし直さない', async () => {
  const { A, log } = env(); legacySpy(A); BGM(A, 'WILD_BATTLE', './bgm/battle.ogg'); A.registerBgm('RARE_WILD_BATTLE', [], { fallback: 'WILD_BATTLE' }); A.registerBgm('RIVAL_BATTLE', [], { fallback: 'RARE_WILD_BATTLE' });
  assert.equal(A.resolveScene('FACILITY'), 'MARKET'); assert.equal(A.resolveScene('BATTLE'), 'WILD_BATTLE'); assert.equal(A.resolveScene('TOURNAMENT'), 'TOURNAMENT_LOBBY_LOW'); assert.equal(A.resolveScene('SPECIAL'), 'SPECIAL_BATTLE'); assert.equal(A.resolveScene('x'), null);
  assert.equal(A.resolveBgm('RIVAL_BATTLE').key, 'WILD_BATTLE');
  A.scene('BATTLE'); await tick(5); assert.equal(A.status().scene, 'WILD_BATTLE');
  A.scene('RIVAL_BATTLE'); await tick(5); assert.equal(A.status().scene, 'RIVAL_BATTLE'); assert.equal(log.audios.find((x) => x.src === './bgm/battle.ogg').plays, 1, '同じ曲は鳴らし直さない'); assert.equal(active(A).length, 1);
  assert.deepEqual(A.status().inherits, ['RARE_WILD_BATTLE', 'RIVAL_BATTLE']);
});
