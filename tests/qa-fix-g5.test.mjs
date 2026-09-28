// =========================================================
// QA 修正 G5：共通会話 MMNPC（js/npc/npc.js）
//  ・会話を開いた入力を、会話の1回目のタップとして扱わない
//    - 名前欄で Enter（iPhone のキーボードの「完了」）→ 名前登録 → フィナのあいさつ、のとき、同じ Enter が
//      document の keydown（会話を送る）にも届き、1行目の文字送りが飛んでいた
//    - ボタンのダブルタップの2打目が、開いた会話に届いて1行目の文字送りが飛んでいた
//    → 画面の会話（talk）は、keydown を次のタスクから受け付ける（会話を開いた keydown そのものは届かない）。さらに
//      開いてから OPEN_GUARD_MS（0.2秒）のタップ・キーを無視する（連打の間隔の記録にも入れない）。
//      createTalk では openGuardMs を指定したときだけ（省略時は従来どおり）。時計は now()（テストでは差し替え）で測る
//  ・静止画の無いNPCのアニメーションの行で、1文字目が出た時点で立ち絵が隠れていた（アニメーションは動き続けていた）
//    → 静止画かアニメーションのどちらかがあれば表示する（フィナは静止画があるので従来から見た目は同じ）
//  文字送りの速さ（TYPE_MS = 32）・タップ操作（表示中＝全文／全文後＝次／最後＝終了）・連打の最短間隔・文章・見た目・公開API は変えていない。
// =========================================================
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as H from './e2e/harness.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(path.join(ROOT, 'js/npc/npc.js'), 'utf8');
const GUARD_MS = Number((SRC.match(/const OPEN_GUARD_MS = (\d+);/) || [])[1]);

/** テスト用の時計：setTimeout／setInterval／Date.now の代わり（npc-talk.test.mjs の時計にくり返しタイマーを足したもの） */
function clock() {
  let t = 0, id = 0; const q = new Map();
  return { now: () => t, schedule: (fn, ms) => { q.set(++id, { at: t + ms, fn }); return id; }, cancel: (k) => { q.delete(k); }, active: () => q.size,
    every: (fn, ms) => { q.set(++id, { at: t + ms, fn, every: ms }); return id; },
    run(ms) { const end = t + ms; for (;;) { let b = null; for (const e of q) if (e[1].at <= end && (!b || e[1].at < b[1].at)) b = e; if (!b) break; const v = b[1]; t = v.at; if (v.every) v.at += v.every; else q.delete(b[0]); v.fn(); } t = end; } };
}
/** 会話ウィンドウ（talk）を動かすための最小の画面（document）。keydown は document へ届く分だけを再現する */
function fakeDoc() {
  const docL = {};
  class El {
    constructor(tag) { this.tagName = tag; this.children = []; this.attrs = {}; this.dataset = {}; this.hidden = false; this.className = ''; this.textContent = ''; this.L = {}; this.parent = null; }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    getAttribute(k) { return k === 'src' ? (this.src == null ? null : this.src) : (k in this.attrs ? this.attrs[k] : null); }
    appendChild(c) { c.parent = this; this.children.push(c); return c; }
    append(...cs) { cs.forEach((c) => this.appendChild(c)); }
    addEventListener(t, f) { (this.L[t] = this.L[t] || []).push(f); }
    remove() { if (this.parent) { this.parent.children = this.parent.children.filter((x) => x !== this); this.parent = null; } }
    q(cls) { if (String(this.className).split(' ').includes(cls)) return this; for (const c of this.children) { const r = c.q(cls); if (r) return r; } return null; }
    click() { const e = { stopPropagation() {} }; (this.L.click || []).slice().forEach((f) => f(e)); }
  }
  const body = new El('body');
  return { body, createElement: (t) => new El(t), addEventListener: (t, f) => { (docL[t] = docL[t] || []).push(f); }, removeEventListener: (t, f) => { docL[t] = (docL[t] || []).filter((x) => x !== f); },
    keys: () => (docL.keydown || []).length, $: (cls) => body.q(cls),
    key(k) { const e = { key: k, prevented: false, preventDefault() { this.prevented = true; } }; (docL.keydown || []).slice().forEach((f) => f(e)); return e; } };
}
/** npc.js を読み込む。画面・時計を渡すと talk() もテストの時計で動く */
function load(c, doc) {
  const w = {};
  if (!c) { new Function('window', SRC)(w); return w.MMNPC; }
  class Img { constructor() { this.src = ''; } }
  new Function('window', 'document', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'Image', SRC)(w, doc, c.schedule, c.cancel, c.every, c.cancel, { now: c.now }, Img);
  return w.MMNPC;
}

// ---------------------------------------------------------
// 変えていないこと
// ---------------------------------------------------------
test('QA-G5-1：公開API・文字送りの速さ・連打の最短間隔は従来のまま。開いた直後に受け付けない時間は 0.15〜0.25秒', () => {
  const M = load();
  assert.deepEqual(Object.keys(M), ['TYPE_MS', 'MIN_TAP_MS', 'register', 'get', 'list', 'expressionsOf', 'animationsOf', 'imageOf', 'animOf', 'preload', 'splitChars', 'resolveLines', 'createTalk', 'talk', 'close', 'state', 'animState', 'fromLegacy']);
  assert.equal(M.TYPE_MS, 32); assert.equal(M.MIN_TAP_MS, 80);
  assert.ok(GUARD_MS >= 150 && GUARD_MS <= 250, `OPEN_GUARD_MS=${GUARD_MS}`); assert.equal((SRC.match(/const OPEN_GUARD_MS = \d+;/g) || []).length, 1, '定数は1か所');
  // createTalk を直接使うとき（openGuardMs 省略）は従来どおり、開いた直後のタップも受け付ける
  const c = clock(), T = M.createTalk(['一つ目のセリフです。'], c).start();
  assert.equal(T.tap(), 'full'); assert.equal(T.state().text, '一つ目のセリフです。');
});

// ---------------------------------------------------------
// 会話を開いた入力を、1回目のタップとして扱わない
// ---------------------------------------------------------
test('QA-G5-2：createTalk（openGuardMs）：開いてからの時間は差し替えた時計 now() で start() から測る。範囲内のタップは無視され、文字送りは続く。無視したタップは連打の間隔に数えない', () => {
  // 守ること：以前は開いた直後のタップ（会話を開いた入力の続き）で、すぐ全文表示になっていた（1行目の文字送りが飛ぶ）
  const M = load(), c = clock(), ups = [];
  c.run(5000);   // 作ってから start まで時間があっても、start() から数える
  const T = M.createTalk(['はじめまして。私はフィナです！', '二つ目。'], { ...c, openGuardMs: GUARD_MS, onUpdate: (s) => ups.push(s.text) });
  c.run(1000); T.start();
  assert.equal(T.tap(), 'ignored', '開いたのと同じ瞬間（名前欄の Enter が document へ届く）');
  assert.deepEqual([T.state().typing, T.state().text], [true, '']);
  c.run(120); assert.equal(T.tap(), 'ignored', 'ダブルタップの2打目（0.12秒後）');
  assert.equal(T.state().typing, true); assert.equal(T.state().text, 'はじめ', '文字送りはそのまま続く'); assert.equal(c.active(), 1);
  c.run(GUARD_MS - 121); assert.equal(T.tap(), 'ignored', '受け付けない時間の最後');
  c.run(1); assert.equal(T.tap(), 'full', '受け付けない時間を過ぎたら従来どおり（直前の無視したタップは連打の間隔に数えない）');
  assert.equal(T.state().text, 'はじめまして。私はフィナです！'); assert.equal(c.active(), 0);
  c.run(100); assert.equal(T.tap(), 'next'); assert.equal(T.state().idx, 1, '2行目以降は受け付けない時間なし（行ごとには数えない）');
  c.run(100); assert.equal(T.tap(), 'full'); c.run(100); assert.equal(T.tap(), 'end');
  // 端末の時計が戻っても（開いた時刻より前になっても）会話が送れなくならない
  let tt = 1000; const B = M.createTalk(['あいうえお'], { now: () => tt, schedule: () => 1, cancel: () => {}, openGuardMs: GUARD_MS }).start();
  tt = 999; assert.equal(B.tap(), 'full');
  ups.forEach((x) => assert.ok(['はじめまして。私はフィナです！', '二つ目。'].some((l) => l.startsWith(x)), `「${x}」`));
});

test('QA-G5-3：画面の会話（talk）：会話を開いたのと同じ Enter が document に届いても1行目の文字送りは飛ばない。0.2秒後からは Enter・タップが従来どおり効く', async () => {
  // 守ること：以前は名前欄の Enter（onkeydown で名前登録→あいさつ）が、同じ keydown のまま会話の keydown にも届き、1行目がすぐ全文表示になっていた
  const c = clock(), doc = fakeDoc(), M = load(c, doc);
  let done = 0; M.talk([{ npc: 'fina', expression: 'smile', text: 'はじめまして。私はフィナです！' }, { expression: 'normal', text: 'よろしく。' }]).then(() => done++);
  assert.equal(doc.keys(), 0, '会話を開いたキー操作（同じ keydown の続き）には、まだ keydown を受け付けていない');
  doc.key('Enter');   // 会話を開いた Enter が document へ伝わってくる
  let s = M.state(); assert.deepEqual([s.idx, s.typing, s.text], [0, true, ''], '1行目の文字送りは飛ばない');
  c.run(0); assert.equal(doc.keys(), 1, '次のタスクから keydown を受け付ける（会話中だけ）');
  const e = doc.key('Enter'); assert.equal(e.prevented, true, 'Enter の既定の動作は従来どおり止める');
  s = M.state(); assert.deepEqual([s.idx, s.typing, s.text], [0, true, ''], '開いた直後（0.2秒未満）の Enter も会話を送らない（差し替えた時計で測る）');
  c.run(120); doc.$('mmtalk').click(); s = M.state();
  assert.deepEqual([s.idx, s.typing, s.text], [0, true, 'はじめ'], 'ダブルタップの2打目（0.12秒後）も会話を送らない');
  assert.equal(doc.$('mmtalk-text').textContent, 'はじめ'); assert.equal(doc.$('mmtalk-next').hidden, true, '▼は全文表示後だけ');
  c.run(GUARD_MS - 120); doc.key('Enter'); s = M.state();
  assert.deepEqual([s.idx, s.typing, s.text], [0, false, 'はじめまして。私はフィナです！'], '0.2秒後の Enter は従来どおり全文表示');
  assert.equal(doc.$('mmtalk-next').hidden, false);
  c.run(100); doc.$('mmtalk').click(); assert.equal(M.state().idx, 1, '全文表示後のタップで次のセリフ');
  c.run(100); doc.key(' '); c.run(100); doc.$('mmtalk').click();
  await Promise.resolve();
  assert.deepEqual([M.state(), done, doc.keys(), doc.$('mmtalk'), c.active()], [null, 1, 0, null, 0], '最後のタップで終了（keydown・画面・タイマーは残らない）');
  // keydown を受け付け始める前に閉じても、あとから keydown が付かない
  M.talk(['すぐ閉じる']); M.close(); c.run(100);
  assert.deepEqual([M.state(), doc.keys(), doc.$('mmtalk'), c.active()], [null, 0, null, 0]);
});

// ---------------------------------------------------------
// 静止画の無いNPCのアニメーションの行
// ---------------------------------------------------------
test('QA-G5-4：画面の会話：静止画の無いNPCのアニメーションの行でも、文字送りのあいだ立ち絵を隠さない（静止画のあるNPC・画像の無いNPCは従来どおり）', () => {
  // 守ること：以前は1文字目が出た時点で立ち絵が隠れ、見えないままアニメーションだけが動き続けていた
  const c = clock(), doc = fakeDoc(), M = load(c, doc);
  const fr = [1, 2, 3].map((i) => `assets/npc/fina/animations/wave/wave_0${i}.png`);
  M.register('qa_anim', { name: 'アニメだけ', views: {}, anims: { closeup: { wave: { frames: fr, fps: 8 } } } });
  M.register('qa_none', { name: '画像なし', views: {} });
  M.talk([{ npc: 'qa_anim', anim: 'wave', text: 'あいうえお' }, { text: 'つぎ' }, { npc: 'qa_none', text: 'なし' }, { npc: 'fina', anim: 'wave', text: 'フィナ' }]);
  const fig = doc.$('mmtalk-fig'), img = fig.children[0], seen = [];
  for (let k = 0; k < 6; k++) { seen.push([M.state().text, fig.hidden]); c.run(M.TYPE_MS); }
  assert.deepEqual(seen, [['', false], ['あ', false], ['あい', false], ['あいう', false], ['あいうえ', false], ['あいうえお', false]], '文字送りのあいだ立ち絵を表示');
  c.run(500); assert.equal(fig.hidden, false); assert.ok(M.animState().running); assert.ok(fr.includes(img.src), 'アニメーションのコマを表示');
  c.run(100); doc.$('mmtalk').click(); c.run(200);
  assert.deepEqual([M.state().idx, M.state().anim, fig.hidden, M.animState().running], [1, null, true, false], 'アニメーションの無い行（静止画も無い）は従来どおり隠す');
  c.run(100); doc.$('mmtalk').click(); c.run(200);
  assert.deepEqual([M.state().idx, fig.hidden], [2, true], '画像の無いNPCは従来どおり隠す');
  c.run(100); doc.$('mmtalk').click(); c.run(M.TYPE_MS * 2);
  assert.deepEqual([M.state().idx, M.state().anim, fig.hidden], [3, 'wave', false], 'フィナのアニメーションは従来どおり表示');
  M.close(); assert.equal(M.animState().running, false);
});

// ---------------------------------------------------------
// 実ブラウザ
// ---------------------------------------------------------
let L = null;
before(async () => { if (H.available()) L = await H.launch(); });
after(async () => { if (L) await L.close(); });
/** ページを開く。テストが終わったらすぐ閉じる（開いたままのページで、ほかのテストのCPUを使わない） */
async function open(t, opt) { const p = await L.open(opt); t.after(() => p.ctx.close().catch(() => {})); return p; }

/** ページ内の Date.now を止めたり進めたりできるようにする（会話のタップの時間の判定に使う時計。文字送りのタイマーは本物のまま） */
const dnClock = (pg) => pg.evaluate(() => { if (window.__dn) return; const real = Date.now.bind(Date), q = window.__dn = { f: null }; Date.now = () => (q.f != null ? q.f : real()); q.freeze = () => { q.f = real(); }; q.add = (ms) => { q.f += ms; }; q.thaw = () => { q.f = null; }; });
/** 会話ウィンドウへのタップの前後の状態を記録する（前＝window の捕獲、後＝会話ウィンドウ自身の2つ目のリスナー＝会話の処理の直後） */
const recTaps = (pg) => pg.evaluate(() => {
  window.__taps = []; window.addEventListener('click', () => { window.__before = MMNPC.state(); }, true);
  new MutationObserver(() => { const ov = document.querySelector('.mmtalk'); if (ov && !ov.__qa) { ov.__qa = 1; ov.addEventListener('click', () => window.__taps.push({ before: window.__before, after: MMNPC.state() })); } }).observe(document.body, { childList: true });
});
const pick = (s) => s && { idx: s.idx, typing: s.typing, text: s.text };
/** 街：未育成のソラモを連れたセーブ（ゲームの処理で作った正しいセーブ。フィナのあいさつは表示済み・育成開始の説明はまだ） */
function townSave() {
  const w = {}; for (const f of ['js/phase7/progression.js', 'js/phase8/league.js', 'js/phase8/raising.js', 'js/phase10/monsters.js', 'js/phase11/player.js', 'js/phase9/chapters.js']) new Function('window', readFileSync(path.join(ROOT, f), 'utf8'))(w);
  for (const c of w.MMP9C.CHAPTERS) w.MMP7.registerChapterBoard(c.no, c.track, { provisional: false });
  w.MMP8L.setSpeciesCount(2);
  const S = w.MMP8.newSave(); S.g = 5000; S.playerName = 'テスト'; delete S.playerNamePending; S.npcFlags = { finaIntro: 1 };
  S.m = w.MMP8.initIndividual(S, w.MMP7.initProgForNew({ sp: 0, name: 'ソラモ', age: 0, span: 30, h: 0, rk: 0, fa: 0, st: 0, last: null, li: 100, po: 100, in: 100, hi: 100, ev: 100, de: 100, sk: [0, 1, 2, 3], eq: [0, 1, 2, 3, -1, -1] }));
  return JSON.parse(JSON.stringify(S));
}

test('QA-G5-B1：実ブラウザ：名前欄で Enter を押して名前登録すると、フィナのあいさつの1行目は1文字ずつ表示される（Enter で飛ばない）', { skip: H.skipReason() }, async (t) => {
  // 守ること：以前は Enter の keydown が会話の keydown にも届き、1行目がすぐ全文（typing:false）になっていた。iPhone の「完了」キーも Enter を送る（実機は未確認）
  const p = await open(t); const pg = p.page;
  await pg.click('[onclick*="startGame"]'); await pg.waitForSelector('#p11nm');
  await pg.fill('#p11nm', 'エンター');
  // window の keydown（document より後）で、同じ Enter の処理が終わった直後の会話の状態を記録する
  await pg.evaluate(() => window.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !window.__afterKey) window.__afterKey = MMNPC.state(); }));
  await pg.press('#p11nm', 'Enter');
  await pg.waitForSelector('.mmtalk');
  const s = await pg.evaluate(() => window.__afterKey);
  assert.deepEqual([s.idx, s.typing, s.text, s.full], [0, true, '', 'はじめまして。私はフィナです！'], '1行目は1文字目から文字送り');
  assert.equal((await H.getS(pg)).playerName, 'エンター', '名前登録は従来どおり');
  await pg.waitForFunction(() => MMNPC.state() && MMNPC.state().text.length >= 2);
  await H.finishTalk(pg);
  assert.equal(await pg.evaluate(() => document.querySelectorAll('.mmtalk').length), 0);
  assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
});

test('QA-G5-B2：実ブラウザ（タッチ）：「この名前ではじめる」をダブルタップしても、2打目（0.12秒後）はあいさつを送らない。0.2秒後のタップは従来どおり全文表示', { skip: H.skipReason() }, async (t) => {
  // 守ること：以前は2打目が開いた会話に届き、1行目がすぐ全文表示になっていた。時間の判定に使う Date.now は固定して、実行環境の遅れで結果が変わらないようにする
  const p = await open(t, { touch: true }); const pg = p.page;
  await pg.click('[onclick*="startGame"]'); await pg.waitForSelector('#p11nm');
  await pg.fill('#p11nm', 'ダブル');
  const btn = '[onclick*="p11NameGo"]';
  const pt = await pg.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, btn);
  await dnClock(pg); await recTaps(pg);
  await pg.evaluate(() => window.__dn.freeze());
  await pg.touchscreen.tap(pt.x, pt.y);   // 1打目：名前登録→あいさつ
  await pg.waitForSelector('.mmtalk');
  await pg.evaluate(() => window.__dn.add(120));
  await pg.touchscreen.tap(pt.x, pt.y);   // 2打目：同じ場所（会話ウィンドウの上）
  await pg.waitForFunction(() => window.__taps.length >= 1);
  const t1 = await pg.evaluate(() => window.__taps[0]);
  assert.equal(t1.before.idx, 0); assert.deepEqual(pick(t1.after), pick(t1.before), '2打目では会話は進まない（全文表示にもならない）');
  await pg.evaluate((g) => window.__dn.add(g), GUARD_MS - 120);
  await pg.touchscreen.tap(pt.x, pt.y);
  await pg.waitForFunction(() => window.__taps.length >= 2);
  const t2 = await pg.evaluate(() => window.__taps[1]);
  if (t2.before.typing) assert.deepEqual([t2.after.idx, t2.after.typing, t2.after.text], [0, false, t2.before.full], '受け付けない時間を過ぎたタップは全文表示');
  else assert.equal(t2.after.idx, t2.before.idx + 1, '（文字送りが先に終わっていたら）次のセリフ');
  await pg.evaluate(() => window.__dn.thaw());
  await H.finishTalk(pg);
  assert.equal((await H.getS(pg)).playerName, 'ダブル');
  assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
});

test('QA-G5-B3：実ブラウザ：静止画の無いNPCのアニメーションの行でも、立ち絵が表示されたまま（フィナは従来どおり）', { skip: H.skipReason() }, async (t) => {
  // 守ること：以前は1文字目が出た時点で .mmtalk-fig が hidden になっていた
  const p = await open(t); const pg = p.page;
  const pre = await pg.evaluate(async () => {
    const fr = [1, 2, 3, 4, 5, 6].map((i) => `assets/npc/fina/animations/wave/wave_0${i}.png`);
    MMNPC.register('qa_anim', { name: 'テスト', views: {}, anims: { closeup: { wave: { frames: fr, fps: 8 } } } });
    const r = await MMNPC.preload('qa_anim');
    MMNPC.talk([{ npc: 'qa_anim', anim: 'wave', text: 'アニメーションだけのテストです' }]);   // 会話の終わり（Promise）は待たない
    return r.map((x) => x.ok);
  });
  assert.deepEqual(pre, [true, true, true, true, true, true], 'コマの画像はすべて読み込める');
  await pg.waitForFunction(() => MMNPC.state() && MMNPC.state().text.length >= 3);
  const r = await pg.evaluate(() => { const f = document.querySelector('.mmtalk-fig'), i = f.querySelector('img'); return { hidden: f.hidden, disp: getComputedStyle(f).display, src: i.getAttribute('src'), anim: MMNPC.animState().running }; });
  assert.equal(r.hidden, false); assert.notEqual(r.disp, 'none'); assert.match(r.src, /wave_0\d\.png$/); assert.equal(r.anim, true);
  await H.finishTalk(pg);
  await pg.evaluate(() => { MMNPC.talk([{ npc: 'fina', anim: 'wave', text: 'フィナのアニメーションです' }]); });   // 会話の終わり（Promise）は待たない
  await pg.waitForFunction(() => MMNPC.state() && MMNPC.state().text.length >= 3);
  assert.equal(await pg.evaluate(() => document.querySelector('.mmtalk-fig').hidden), false);
  await H.finishTalk(pg);
  // コマの切り替えで読み込み途中の画像が取り消される（failed）ことは、負荷の高い環境ではありうる（エラーではない）。404 などは無いこと
  assert.deepEqual(p.errors, []); assert.deepEqual(p.bad.filter((x) => !x.startsWith('failed ')), []);
});

test('QA-G5-B4：実ブラウザ：育成開始の出発ボタンをダブルタップしても、2打目（0.12秒後）はフィナの確認会話を送らない。会話のあとは従来どおり2度押しの確認（まだ出発しない）', { skip: H.skipReason() }, async (t) => {
  // 守ること：以前は2打目が開いた会話に届き、1行目「このモンスターで育成を始めますか？」がすぐ全文表示になっていた
  const p = await open(t, { save: townSave() }); const pg = p.page;
  await pg.waitForSelector('[onclick*="startGame"]'); await pg.click('[onclick*="startGame"]'); await pg.waitForSelector('#app .map');
  await pg.evaluate(() => prepScr());
  const dep = '#app button[onclick="p7Depart(this)"]';
  await pg.waitForSelector(dep);
  await pg.evaluate((d) => { const b = document.querySelector(d); new MutationObserver(() => { if (b.dataset.a === '1') window.__armed = 1; }).observe(b, { attributes: true, attributeFilter: ['data-a'] }); }, dep);
  await dnClock(pg); await recTaps(pg);
  await pg.evaluate(() => window.__dn.freeze());
  await pg.click(dep); await pg.waitForSelector('.mmtalk');   // 1打目：フィナの確認会話
  await pg.evaluate(() => window.__dn.add(120));
  await pg.click('.mmtalk', { force: true });   // 2打目（同じ場所＝会話ウィンドウの上）
  await pg.waitForFunction(() => window.__taps.length >= 1);
  const t1 = await pg.evaluate(() => window.__taps[0]);
  assert.equal(t1.before.full, 'このモンスターで育成を始めますか？'); assert.deepEqual(pick(t1.after), pick(t1.before), '2打目では会話は進まない');
  await pg.evaluate(() => window.__dn.thaw());
  await H.finishTalk(pg);
  await pg.waitForFunction(() => window.__armed === 1);
  const S = await H.getS(pg);
  assert.equal(S.m.raise.state, 'none', '会話のあとは従来どおり確認（2度押し）。まだ出発しない'); assert.equal(S.npcFlags.raiseIntro, 1);
  assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
});
