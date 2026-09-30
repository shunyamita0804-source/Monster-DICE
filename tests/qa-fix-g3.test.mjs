// =========================================================
// QA 修正 G3：連打・ダブルタップ・すり抜けタップ・タイマーの取り違え（index.html）
//  ・共通の小さなガード tapAt／tapSoon（連打・すり抜けタップ対策を1か所で管理）
//    - 2度押し確認（arm・p9arm・reset、フィナの会話のあと自動で確認状態になる出発ボタン）：
//      確認状態になってから0.4秒未満の押下では確定しない（その押下から数え直す＝連打が続くあいだは確定しない）。
//      0.4秒以上あけた押下は従来どおり確定
//      （arm・p9arm の3秒で取り消しは従来どおり。reset に期限を付けるかは要判断のため変えない）
//    - arm は取り消しのとき元の表示（innerHTML）に戻す（出発ボタンの <small> の小見出しが消えない）
//  ・tapHold：画面・シートを出した直後（0.35秒未満。連打中は数え直す）は押せないボタン（指定した場所だけ）
//    - 市場の購入確認シートの「連れて帰る／やめる」、修行メニューの修行カード（チケットを使う）
//    - ボードのメニューの背景タップ（閉じる）、セーブ・ロード画面の「最初からやり直す」は tapAt／tapSoon で同じ判定
//  ・育成放棄の最終確認：カウントダウンは閉じる・開き直すときに止める（待ち時間は毎回3秒）
//  ・board()：0.35秒後の着地処理は、ボードがまだ表示中のときだけ（離れたら次にボードを開いたときに1回だけ処理）
//  ・市場のスワイプ：カルーセルの外で離したとき・矢印を押したときはスワイプの始点を消す
//  価格・報酬・文言・見た目・セーブ version 6／キー mr4v6／checkpoint形式、Phase 6 保護対象は変えていない。
//  index.html の実物のコードを抽出して動かし（時計は差し替え）、実ブラウザ（tests/e2e/harness.mjs）でも確認する。
// =========================================================
import test, { before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as H from './e2e/harness.mjs';
import { loadEngine, lcg as chLcg } from './chapter-sim.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const rd = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const HTML = rd('index.html');
// 本番（index.html）と同じ順で読み込む
const SRC = ['js/phase7/progression.js', 'js/phase8/league.js', 'js/phase8/raising.js', 'js/phase10/monsters.js', 'js/phase11/player.js', 'js/phase9/chapters.js'].map(rd);
function load() {
  const w = {}; for (const s of SRC) new Function('window', s)(w);
  for (const c of w.MMP9C.CHAPTERS) w.MMP7.registerChapterBoard(c.no, c.track, { provisional: false });
  w.MMP8L.setSpeciesCount(2);
  return { P7: w.MMP7, P8: w.MMP8 };
}
const j = (o) => JSON.parse(JSON.stringify(o));
const lineOf = (prefix) => { const l = HTML.split('\n').find((x) => x.startsWith(prefix)); if (!l) throw new Error('抽出失敗: ' + prefix); return l; };
const between = (a, b) => { const i = HTML.indexOf(a), k = HTML.indexOf(b, i + a.length); if (i < 0 || k < 0) throw new Error('抽出失敗: ' + a); return HTML.slice(i, k); };
const GUARD = () => `${lineOf('function tapAt(')}\n${lineOf('function tapSoon(')}`;
function mon(over = {}) {
  return { sp: 0, name: 'ソラモ', age: 0, span: 30, h: 0, rk: 0, fa: 0, st: 0, last: null, li: 100, po: 100, in: 100, hi: 100, ev: 100, de: 100,
    sk: [0, 1, 2, 3], eq: [0, 1, 2, 3, -1, -1], ...over };
}
const GAURU = { sp: 1, name: 'ガウル', li: 80, po: 110, in: 110, hi: 90, ev: 90, de: 60, sk: [10, 11, 12, 13], eq: [10, 11, 12, 13, -1, -1] };
/** 街：未育成のソラモを連れ、牧場に未育成のガウル（ゲームの処理で作った正しいセーブ。フィナの会話は表示済み） */
function town({ P7, P8 }, g = 5000) {
  const S = P8.newSave(); S.g = g; S.playerName = 'テスト'; delete S.playerNamePending; S.npcFlags = { finaIntro: 1, raiseIntro: 1 };
  S.m = P8.initIndividual(S, P7.initProgForNew(mon()));
  S.box = [P8.initIndividual(S, P7.initProgForNew(mon(GAURU)))];
  return S;
}
function onBoard(M) { const S = town(M); assert.equal(M.P8.depart(S, S.m).ok, true); return S; }
/** Chapter 1 を終えた Chapter間ファーム（修行チケットあり） */
function atFarm(M) { const S = onBoard(M); S.m.raise.turnsUsed = 20; assert.equal(M.P8.endChapter(S, S.m).ok, true); S.trainTix = 3; return S; }

/** innerHTML／textContent を持つ最小のボタン（textContent を入れるとタグは消える＝本物と同じ） */
function el(html) {
  const cls = new Set();
  return { dataset: {}, h: html, get innerHTML() { return this.h; }, set innerHTML(v) { this.h = String(v); },
    get textContent() { return this.h.replace(/<[^>]*>/g, ''); }, set textContent(v) { this.h = String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;'); },
    classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c), contains: (c) => cls.has(c) } };
}
/** arm／p9arm を時計（performance.now）とタイマーを差し替えて動かす */
function armEnv(name) {
  const clk = { t: 5000 }, timers = [];
  const f = new Function('performance', 'setTimeout', `${GUARD()}\n${lineOf(`function ${name}(`)}\nreturn ${name};`)({ now: () => clk.t }, (fn, ms) => timers.push({ fn, ms }));
  return { f, clk, timers };
}

// ---------------------------------------------------------
// 2度押し確認（arm・p9arm・reset）
// ---------------------------------------------------------
test('QA-G3-1：arm()：確認状態になってから0.4秒未満の2回目では確定しない（ダブルタップでロード・売却・辞退・出発・育成完了を飛ばさない）。0.4秒以上なら従来どおり確定', () => {
  // 守ること：以前は2回目の押下がどれだけ早くても確定し、ダブルタップ1回でスロットのロード（上書き）・売却・大会辞退などが確定していた
  const { f, clk, timers } = armEnv('arm');
  const b = el('ロード');
  assert.equal(f(b, 'もう一度押すと読み込み'), false, '1回目は確認状態にするだけ'); assert.equal(b.dataset.a, '1'); assert.equal(b.textContent, 'もう一度押すと読み込み');
  assert.deepEqual(timers.map((x) => x.ms), [3000], '3秒で取り消し（従来どおり）');
  for (const dt of [0, 30, 50, 120, 250, 399]) { clk.t += dt; assert.equal(f(b, 'もう一度押すと読み込み'), false, `前の押下から ${dt}ms の押下では確定しない`); assert.equal(b.dataset.a, '1', '確認状態のまま'); }
  assert.equal(b.textContent, 'もう一度押すと読み込み', '表示もそのまま');
  clk.t += 400; assert.equal(f(b, 'もう一度押すと読み込み'), true, '0.4秒あければ確定（従来の2度押し）');
  const c = el('売却する'); f(c, 'もう一度押すと売却（50G）'); clk.t += 600; assert.equal(f(c, 'もう一度押すと売却（50G）'), true, '0.6秒後の2回目は確定');
  const d = el('育成を完了して街へ戻る'); f(d, 'もう一度押すと育成完了');
  for (let i = 0; i < 12; i++) { clk.t += 150; assert.equal(f(d, 'もう一度押すと育成完了'), false, '0.15秒ごとに押し続けても（連打のあいだは）確定しない'); }
  clk.t += 450; assert.equal(f(d, 'もう一度押すと育成完了'), true, '連打をやめて0.4秒以上あけた押下で確定');
});

test('QA-G3-2：arm()：3秒で取り消したときは元の表示（innerHTML）に戻す。出発ボタンの <small> の小見出しが太字の本文に混ざらない', () => {
  // 守ること：以前は textContent で戻していたため「…へ出発（育成開始）準備ができたら出発しよう」と1行につながっていた
  const { f, clk, timers } = armEnv('arm');
  const html = 'CHAPTER 1「はじまりの草原」へ出発（育成開始）<small>準備ができたら出発しよう</small>';
  const b = el(html);
  f(b, 'もう一度押すと育成開始（完了か放棄まで街へ戻れません）');
  assert.equal(b.innerHTML, 'もう一度押すと育成開始（完了か放棄まで街へ戻れません）', '確認中の表示は従来どおり文字だけ');
  timers[0].fn();
  assert.equal(b.dataset.a, ''); assert.equal(b.innerHTML, html, '元の表示（<small> 付き）に戻る');
  clk.t += 5000; assert.equal(f(b, 'もう一度押すと育成開始（完了か放棄まで街へ戻れません）'), false, '取り消し後の押下は、また1回目から（従来どおり）');
  const p = el('セーブ'); f(p, 'もう一度押すと上書き'); timers.at(-1).fn(); assert.equal(p.innerHTML, 'セーブ', '文字だけのボタンも同じ表示に戻る');
});

test('QA-G3-3：p9arm()（大会のランク・対戦開始）：0.4秒未満の2回目では確定しない。取り消しで元の表示と見た目（arm クラス）に戻る', () => {
  // 守ること：以前はランクカードのダブルタップで、ランクを選び直す間もなく大会が始まっていた
  const { f, clk, timers } = armEnv('p9arm');
  const html = '<span class="p9tx"><b>ランクE大会</b><small>賞金 100G</small></span>';
  const b = el(html);
  assert.equal(f(b, 'もう一度押すとランクE大会に参加'), false); assert.ok(b.classList.contains('arm'));
  assert.equal(b.innerHTML, '<span class="p9tx"><b>もう一度押すとランクE大会に参加</b></span>', '確認中の表示は従来どおり');
  for (const dt of [0, 40, 399]) { clk.t += dt; assert.equal(f(b, 'x'), false, `前の押下から ${dt}ms では確定しない`); }
  clk.t += 600; assert.equal(f(b, 'x'), true, '0.6秒あければ確定');
  const c = el(html); f(c, 'もう一度押すと試合開始'); timers.at(-1).fn();
  assert.equal(c.innerHTML, html); assert.equal(c.dataset.a, ''); assert.ok(!c.classList.contains('arm'));
});

test('QA-G3-4：最初からやり直す（reset）：画面を出した直後（0.35秒未満）の押下は受け付けず、確認状態にしてから0.4秒未満の2回目でも消さない。期限は従来どおり無し', () => {
  // 守ること：以前は街の「▶ セーブ・ロード」を3回すばやく押すと、次の画面の同じ位置の「最初からやり直す」が確定し、セーブが消えていた
  const clk = { t: 10000 }; const log = [];
  const R = new Function('p8Blocked', 'p10NewSave', 'save', 'render', 'performance',
    `let S={g:4000,m:{name:'ソラ'}},sel=[1,0];${GUARD()}\n${lineOf('function reset(')};return {reset,tapAt,get S(){return S},get sel(){return sel}};`)(
    () => false, () => ({ g: 300, m: null }), () => log.push('save'), () => log.push('render'), { now: () => clk.t });
  const b = el('最初からやり直す');
  R.tapAt(b);   // セーブ・ロード画面（savescr）を出した時刻
  for (const dt of [0, 60, 150, 250, 349]) { clk.t += dt; R.reset(b); assert.equal(b.dataset.s, undefined, `画面を出して（前の押下から）${dt}ms の押下では確認状態にもしない`); }
  assert.equal(b.textContent, '最初からやり直す'); assert.deepEqual(log, []);
  clk.t += 350; R.reset(b); assert.equal(b.dataset.s, '1'); assert.equal(b.textContent, 'もう一度押すと最初から', '0.35秒あければ1回目（確認状態）');
  for (const dt of [0, 50, 399]) { clk.t += dt; R.reset(b); assert.deepEqual(R.S, { g: 4000, m: { name: 'ソラ' } }, `確認状態の直後（前の押下から ${dt}ms）では消さない`); }
  assert.deepEqual(log, []); assert.deepEqual(R.sel, [1, 0]);
  clk.t += 60000; R.reset(b);   // 期限を付けるかは要判断（reset-arm-never-expires）のため従来どおり：時間がたっても2回目で最初から
  assert.deepEqual(R.S, { g: 300, m: null }); assert.deepEqual(R.sel, []); assert.deepEqual(log, ['save', 'render']);
  assert.doesNotMatch(lineOf('function reset('), /setTimeout/, 'reset に取り消しのタイマーは足していない');
  // セーブ・ロード画面を出すたびに「最初からやり直す」の表示時刻を記録する（画面に .ghost はこのボタン1つだけ）
  const scr = lineOf(' $("#app").innerHTML=`<div class="svs"><header class="svhead"><button class="back" onclick="lobby()">◀ 街にもどる</button><h2>セーブ・ロード</h2></header>');
  assert.match(scr, /<button class="ghost" onclick="reset\(this\)">最初からやり直す<\/button><\/div>`;tapAt\(\$\("#app \.ghost"\)\)\}$/);
  assert.equal(scr.split('class="ghost"').length - 1, 1);
});

// ---------------------------------------------------------
// 育成放棄のカウントダウン
// ---------------------------------------------------------
/** setInterval／clearInterval の差し替え（仮想時計で進める） */
function vtimers() {
  let now = 0, id = 0; const iv = new Map();
  return { setInterval: (f, ms) => { iv.set(++id, { f, ms, next: now + ms }); return id; }, clearInterval: (i) => { iv.delete(i); }, count: () => iv.size,
    get now() { return now; },
    to(t) { for (;;) { let best = null; for (const [i, x] of iv) if (x.next <= t && (!best || x.next < best[1].next)) best = [i, x]; if (!best) break; now = best[1].next; best[1].next += best[1].ms; best[1].f(); } now = t; } };
}
function abandonEnv() {
  const T = vtimers(); let modal = null, btn = null;
  const open = () => { const d = { remove() { if (modal === d) { modal = null; btn = null; } }, querySelector: () => ({ set innerHTML(h) { btn = { disabled: /id="p8abgo" disabled/.test(h), textContent: '' }; } }) }; modal = d; };
  const $ = (s) => (s === '#p8m' ? modal : s === '#p8abgo' ? btn : null);
  const src = [lineOf('function p11Esc(t){'), lineOf('let p8AbT='), between('function p8AbandonAsk2(uid){', '\nfunction p8AbandonGo('), lineOf('function p8ModalClose(')].join('\n');
  const api = new Function('S', '$', 'setInterval', 'clearInterval', `${src}\nreturn {ask2:p8AbandonAsk2,close:p8ModalClose};`)({ m: { uid: 'u1', name: 'ソラ' } }, $, T.setInterval, T.clearInterval);
  return { T, api, open, btn: () => btn };
}
test('QA-G3-5：育成放棄の最終確認：閉じて開き直しても（放棄に進むを2回押しても）「放棄する」が押せるまで毎回3秒', () => {
  // 守ること：以前は閉じた確認のカウントダウンが止まらず、開き直した新しいボタンまで数え進めて、2秒あまりで押せるようになっていた
  const a = abandonEnv();
  a.open(); a.api.ask2('u1'); a.T.to(2999); assert.equal(a.btn().disabled, true); a.T.to(3000); assert.equal(a.btn().disabled, false, '通常は3秒で押せる（従来どおり）');
  assert.equal(a.btn().textContent, '放棄する'); assert.equal(a.T.count(), 0, '数え終わったら止まる');
  const b = abandonEnv();
  b.open(); b.api.ask2('u1'); b.T.to(500); b.api.close(); assert.equal(b.T.count(), 0, '閉じたらカウントダウンを止める');
  b.T.to(600); b.open(); b.api.ask2('u1');   // やめない → もう一度「育成放棄」→「放棄に進む」
  b.T.to(3599); assert.equal(b.btn().disabled, true, '開き直してから3秒たつまでは押せない'); assert.equal(b.btn().textContent, '放棄する（1）');
  b.T.to(3600); assert.equal(b.btn().disabled, false);
  const c = abandonEnv();
  c.open(); c.api.ask2('u1'); c.T.to(500); c.api.ask2('u1'); assert.equal(c.T.count(), 1, '同じ確認を出し直しても数えるのは1つだけ');
  c.T.to(3499); assert.equal(c.btn().disabled, true); c.T.to(3500); assert.equal(c.btn().disabled, false);
  c.api.close(); assert.equal(c.btn(), null);
});

// ---------------------------------------------------------
// 市場のスワイプ
// ---------------------------------------------------------
function swipeEnv() {
  const L = {}, D = [], steps = [];
  const car = { addEventListener: (t, f) => { (L[t] = L[t] || []).push(f); } };
  const doc = { addEventListener: (t, f, o) => D.push({ t, f, once: !!(o && o.once) }) };
  const docUp = (e) => { for (const x of D.filter((y) => y.t === 'pointerup')) { x.f(e); if (x.once) D.splice(D.indexOf(x), 1); } };
  const fn = new Function('document', 'p10Step', 'setTimeout', `let P10_SW=null;${between('function p10Swipe(car){', '\n/** 購入の直前確認')}\nreturn p10Swipe;`)(doc, (d) => steps.push(d), () => {});
  fn(car);
  const ev = (x, y, arrow) => ({ target: { closest: (s) => (arrow && s === '.p10arw' ? {} : null) }, clientX: x, clientY: y });
  return { steps,
    down: (x, y, arrow) => (L.pointerdown || []).forEach((f) => f(ev(x, y, arrow))),
    upIn: (x, y, arrow) => { const e = ev(x, y, arrow); (L.pointerup || []).forEach((f) => f(e)); docUp(e); },   // カルーセルの中で離す（car → document の順に届く）
    upOut: (x, y) => docUp(ev(x, y, false)) };   // カルーセルの外で離す（document にだけ届く）
}
test('QA-G3-6：市場のスワイプ：カルーセルの外で離したら始点を消す。そのあとの矢印のクリックをスワイプと取り違えない（前へ→次へにならない）', () => {
  // 守ること：以前はマウスでカルーセルの外までドラッグして離すと始点が残り、次に「前へ」の矢印を押すと「次へ」に動いていた
  const a = swipeEnv(); a.down(200, 100); a.upIn(100, 100); assert.deepEqual(a.steps, [1], '通常のスワイプ（左へ払う＝次）は従来どおり');
  const r = swipeEnv(); r.down(100, 100); r.upIn(200, 100); assert.deepEqual(r.steps, [-1], '右へ払う＝前（従来どおり）');
  const b = swipeEnv(); b.down(200, 100); b.upOut(120, 300);
  b.down(10, 100, true); b.upIn(10, 100, true); assert.deepEqual(b.steps, [], '矢印の押下はスワイプとして扱わない（矢印自身の onclick だけが動く）');
  const c = swipeEnv(); c.down(200, 100); c.upOut(120, 300); c.upIn(40, 100); assert.deepEqual(c.steps, [], '外で離したあと、外から入って離しても古い始点は使わない');
  const d = swipeEnv(); d.down(200, 100); d.upIn(10, 100, true); assert.deepEqual(d.steps, [1], 'カルーセルの中から矢印の上まで払ったスワイプは従来どおり');
});

test('QA-G3-7：ガードは指定した場所だけ（全体には掛けない）。購入確認の「連れて帰る」の onclick・着地処理の中身は従来どおり', () => {
  const code = HTML.split('\n').filter((l) => !l.trimStart().startsWith('//')).join('\n');   // 説明のコメント行は数えない
  const uses = (name) => code.split(`${name}(`).length - 1;
  assert.equal(uses('tapHold'), 3, '定義＋市場の購入確認シート＋修行メニューだけ');
  assert.match(lineOf(' <div class="p10shb">'), /onclick="mkgo\(\$\{s\.id\}\);p10Close\(\)">連れて帰る（\$\{c\.price\}G）<\/button><\/div><\/div>`;document\.body\.appendChild\(d\);tapHold\(d\.querySelector\("\.p10shb"\),350\)\}$/);
  assert.match(lineOf(' if(id=="s")tapHold('), /^ if\(id=="s"\)tapHold\(\$\("#app \.dbody"\),350\);/, '修行メニュー（カードだけが入る .dbody）');
  assert.equal(uses('tapSoon'), 7, '定義＋tapHold・arm・p9arm・reset・ボードのメニューの背景・Battle 開始前の BATTLE START');
  assert.equal(uses('tapAt'), 9, '定義＋tapSoon（数え直し）・tapHold・arm・p9arm・reset・セーブ・ロード画面・ボードのメニュー・Battle 開始前');
  assert.match(lineOf('function p9Menu(){'), /tapAt\(d\);d\.onclick=e=>\{if\(e\.target===d&&!tapSoon\(d,350\)\)p9MenuClose\(\)\};/, 'ボードのメニューは背景タップ（閉じる）だけ。中のボタンは従来どおり');
  assert.match(between('function board(msg){', '\n/** 分岐'), /else if\(ph=="resolve"\)setTimeout\(\(\)=>\{if\(document\.getElementById\("bmonw"\)\)p8Resolve\(\)\},350\);/, 'ボードを離れていたら着地処理をしない');
  assert.match(lineOf('function p8Resolve('), /^function p8Resolve\(\)\{const m=S\.m;if\(bBusy\|\|!m\|\|!m\.raise\.pend\|\|m\.raise\.pend\.stage!="resolve"\)return;const r=MMP8\.resolveLanding\(S,m\);save\(\);/, 'p8Resolve 自体は変えていない');
});

// ---------------------------------------------------------
// 実ブラウザ（index.html 全体）
// ---------------------------------------------------------
let L = null;
/** このテストで開いたページ。テストが終わるたびに閉じる（開いたままだと各ページの BGM（Web Audio）が CPU を取り合い、後半のテストほど遅くなって時間の判定がずれる） */
const opened = [];
before(async () => {
  if (H.skipReason()) return;
  L = await H.launch();
  const open = L.open;
  L.open = async (opt) => { const p = await open(opt); opened.push(p); return p; };
});
afterEach(async () => { while (opened.length) { const p = opened.pop(); try { await p.ctx.close(); } catch (e) {} } });
after(async () => { if (L) await L.close(); });
/** 開始画面の「はじめる」を押して、復帰先の画面が出るまで待つ */
async function start(p, sel) {
  await p.page.waitForSelector('[onclick*="startGame"]', { timeout: 30000 });
  await p.page.click('[onclick*="startGame"]');
  await p.page.waitForSelector(sel, { timeout: 30000 });
}
/**
 * ページの時計（performance.now）を止められるようにする。連打（0〜50ms）の間は時計を止めて、
 * 実行環境の遅れ（CIの負荷など）で「0.35秒／0.4秒たった」ことにならないようにする（押下そのものは本物のマウス・タッチ）
 */
async function clock(page) {
  await page.evaluate(() => { if (window.__qa) return; const real = performance.now.bind(performance), q = window.__qa = { f: null }; performance.now = () => (q.f != null ? q.f : real()); q.freeze = () => { q.f = real(); }; q.thaw = () => { q.f = null; }; });
  return { freeze: () => page.evaluate(() => window.__qa.freeze()), thaw: () => page.evaluate(() => window.__qa.thaw()) };
}
/** 要素の中心（画面座標） */
const center = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, sel);
/** 押す（タッチ端末ならタップ、そうでなければマウスのクリック） */
async function press(page, pt, touch) { if (touch) await page.touchscreen.tap(pt.x, pt.y); else await page.mouse.click(pt.x, pt.y); }
/** 会話（MMNPC）の時計 Date.now を止められるようにする（qa-fix-g5 と同じ） */
const dnClock = (pg) => pg.evaluate(() => { if (window.__dn) return; const real = Date.now.bind(Date), q = window.__dn = { f: null }; Date.now = () => (q.f != null ? q.f : real()); q.freeze = () => { q.f = real(); }; q.add = (ms) => { q.f += ms; }; q.thaw = () => { q.f = null; }; });
/** 選択肢（.mmtalk-choice）が画面に出た瞬間に会話の時計を止める（ページの中で見張る）。テスト側の確認が負荷で遅れても、止まった時刻は「選択肢が出た直後」のまま */
const dnFreezeOnChoices = (pg) => pg.evaluate(() => {
  const q = window.__dn, hit = () => { if (q.f == null && document.querySelector('.mmtalk-choice')) { q.freeze(); return true; } return false; };
  if (hit()) return;
  const mo = new MutationObserver(() => { if (hit()) mo.disconnect(); });
  mo.observe(document.body, { childList: true, subtree: true });
});
const DELIBERATE = 600;   // 「ゆっくりもう一度押す」間隔（0.4秒より十分長い）

test('QA-G3-B1：実ブラウザ（タッチ）：市場の「購入する」→ 開いたシートの「連れて帰る」を0〜50msで連打しても購入されない。0.6秒後に押すと1回だけ購入', { skip: H.skipReason() }, async () => {
  // 守ること：以前は「購入する」のダブルタップの2打目が、開いた確認シートの「連れて帰る」に届き、名前入力・確認なしで購入されていた
  const M = load(); const p = await L.open({ save: j(town(M)), touch: true }); const pg = p.page;
  await start(p, '#app .map');
  await pg.evaluate(() => market());
  await H.marketDetail(pg); await pg.waitForSelector('.p10buy:not([disabled])'); await pg.waitForFunction(() => !P10_ANIM);
  const ck = await clock(pg);
  for (const gap of [0, 50]) {
    await pg.evaluate(() => document.querySelector('.p10buy').scrollIntoView({ block: 'nearest' }));   // 「購入する」は画面の下の方（見える位置へ）
    await ck.freeze();
    await press(pg, await center(pg, '.p10buy'), true);
    await pg.waitForSelector('#p10ov .p10ok');
    if (gap) await pg.waitForTimeout(gap);
    const ok = await center(pg, '#p10ov .p10ok'), no = await center(pg, '#p10ov .p10no');
    await press(pg, ok, true); await press(pg, ok, true);
    let S = await H.getS(pg);
    assert.equal(S.g, 5000, `${gap}ms の連打では購入しない`); assert.equal(S.box.length, 1);
    await press(pg, no, true);   // 左半分（やめる）に当たった場合も、直後は閉じない
    assert.equal(await pg.evaluate(() => document.querySelectorAll('#p10ov').length), 1, '確認シートは開いたまま（1枚だけ）');
    await ck.thaw();
    if (!gap) { await pg.waitForTimeout(DELIBERATE); await press(pg, await center(pg, '#p10ov .p10no'), true); await pg.waitForSelector('#p10ov', { state: 'detached' }); S = await H.getS(pg); assert.equal(S.g, 5000, 'ゆっくり押した「やめる」は従来どおり閉じる（購入しない）'); }
  }
  await pg.waitForTimeout(DELIBERATE);
  await press(pg, await center(pg, '#p10ov .p10ok'), true);
  await pg.waitForSelector('#app .map');
  const S = await H.getS(pg);
  assert.equal(S.g, 4500, '0.6秒後の押下では従来どおり購入（代金は1回だけ）'); assert.equal(S.box.length, 2); assert.equal(S.box[1].name, 'ソラモ');
  assert.equal((await H.storedSave(pg)).g, 4500);
  assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
});

test('QA-G3-B2：実ブラウザ：「▶ セーブ・ロード」を3回連打しても「最初からやり直す」は確定せず（確認状態にもならず）セーブは消えない。ゆっくりの2度押しは従来どおり', { skip: H.skipReason() }, async () => {
  // 守ること：以前は街を下までスクロールして「▶ セーブ・ロード」を3回すばやく押すと、同じ位置の「最初からやり直す」が確定してセーブが消えていた
  const M = load(); const p = await L.open({ save: j(town(M)) }); const pg = p.page;
  await start(p, '#app .map');
  await pg.evaluate(() => window.scrollTo(0, 99999));
  const ck = await clock(pg);
  await ck.freeze();
  await press(pg, await center(pg, '.svb'));
  await pg.waitForSelector('#app .ghost');
  await pg.evaluate(() => document.querySelector('#app .ghost').scrollIntoView({ block: 'nearest' }));   // 画面外なら見える位置へ（時計は止めたまま）
  const g = await center(pg, '#app .ghost');
  await press(pg, g); await press(pg, g);
  let st = await H.storedSave(pg); assert.equal(st.m && st.m.name, 'ソラモ', 'セーブは消えない'); assert.equal(st.box.length, 1);
  assert.equal(await pg.evaluate(() => document.querySelector('#app .ghost').textContent), '最初からやり直す', '画面を出した直後の押下では確認状態にもしない');
  await ck.thaw(); await pg.waitForTimeout(DELIBERATE);
  await ck.freeze();
  await press(pg, await center(pg, '#app .ghost'));
  assert.equal(await pg.evaluate(() => document.querySelector('#app .ghost').textContent), 'もう一度押すと最初から', 'ゆっくり押せば1回目（確認状態）');
  await press(pg, await center(pg, '#app .ghost'));
  st = await H.storedSave(pg); assert.equal(st.m.name, 'ソラモ', '確認状態にした直後の2回目では消さない');
  await ck.thaw(); await pg.waitForTimeout(DELIBERATE);
  await press(pg, await center(pg, '#app .ghost'));
  await pg.waitForFunction(() => S.m == null);
  st = await H.storedSave(pg); assert.equal(st.m, null, '0.6秒後の2回目では従来どおり最初から'); assert.equal(st.box.length, 0); assert.equal(st.v, 6);
  assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
});

test('QA-G3-B3：実ブラウザ：セーブスロットの「ロード」（2度押し）のダブルクリックでは読み込まない。0.6秒後の2回目で従来どおり読み込む', { skip: H.skipReason() }, async () => {
  // 守ること：以前はダブルクリック1回でスロットが読み込まれ、いまの進行（オートセーブ）が上書きされていた
  const M = load(); const cur = j(town(M)); const slot = j(town(M, 4321)); slot.box = [];
  const p = await L.open({ save: cur, raw: { mr4s1: JSON.stringify(slot) } }); const pg = p.page;
  await start(p, '#app .map');
  await pg.evaluate(() => savescr());
  const sel = '#app button[onclick="slotLoad(1,this)"]';
  await pg.waitForSelector(sel);
  const ck = await clock(pg);
  await ck.freeze();
  const b = await center(pg, sel);
  await pg.mouse.click(b.x, b.y, { clickCount: 1 }); await pg.mouse.click(b.x, b.y, { clickCount: 2 });
  assert.equal(await pg.evaluate((s) => document.querySelector(s).textContent, sel), 'もう一度押すと読み込み', '確認状態のまま');
  assert.equal((await H.getS(pg)).g, 5000, 'ダブルクリックでは読み込まない'); assert.equal((await H.storedSave(pg)).g, 5000, 'オートセーブもそのまま');
  await ck.thaw(); await pg.waitForTimeout(DELIBERATE);
  await pg.mouse.click(b.x, b.y);
  await pg.waitForSelector('#app .map');
  assert.equal((await H.getS(pg)).g, 4321, '0.6秒後の2回目で従来どおり読み込む'); assert.equal((await H.storedSave(pg)).g, 4321);
  assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
});

test('QA-G3-B4：実ブラウザ：Chapter間ファームの「🥋 修行」のダブルタップで、次の画面の修行カードを押してしまっても修行は始まらない（チケットは減らない）。0.6秒後なら始まる', { skip: H.skipReason() }, async () => {
  // 守ること：以前は「修行」の2打目が同じ位置の修行カードに届き、選んでいない修行が始まってチケットと回数枠を使っていた
  const M = load(); const p = await L.open({ save: j(atFarm(M)) }); const pg = p.page;
  await start(p, '#app .p9farm');
  const ck = await clock(pg);
  for (const gap of [0, 50]) {
    await ck.freeze();
    await press(pg, await center(pg, `#app .p15b[onclick="hall('s')"]`));
    await pg.waitForSelector('#app .p12tc:not([disabled])');
    if (gap) await pg.waitForTimeout(gap);
    const card = await center(pg, '#app .p12tc:not([disabled])');
    await press(pg, card); await press(pg, card);
    const S = await H.getS(pg);
    assert.equal(S.trainTix, 3, `${gap}ms の連打ではチケットを使わない`); assert.equal(S.m.raise.trainRun || null, null, '修行は始まっていない');
    assert.ok(await pg.$('#app .ds-s'), '修行メニューのまま');
    await ck.thaw();
    await pg.evaluate(() => hall('t')); await pg.waitForSelector('#app .p9farm');
  }
  await pg.evaluate(() => hall('s')); await pg.waitForSelector('#app .p12tc:not([disabled])');
  await pg.waitForTimeout(DELIBERATE);
  await pg.click('#app .p12tc:not([disabled])');
  await pg.waitForSelector('#p7roll');
  const S = await H.getS(pg);
  assert.equal(S.trainTix, 2, '0.6秒後に押せば従来どおり修行が始まる（チケット1枚）'); assert.ok(S.m.raise.trainRun);
  assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
});

test('QA-G3-B5：実ブラウザ：ボードの ☰ のダブルタップでメニューが開いてすぐ閉じない。0.6秒後の背景タップでは従来どおり閉じる', { skip: H.skipReason() }, async () => {
  // 守ること：以前は ☰ の2打目がメニューの背景に当たり、開いたメニューがすぐ閉じていた
  const M = load(); const p = await L.open({ save: j(onBoard(M)), touch: true }); const pg = p.page;
  await start(p, '#brollbtn');
  const ck = await clock(pg);
  const m = await center(pg, '.p9mbtn');
  await ck.freeze();
  await press(pg, m, true); await pg.waitForSelector('#p9ov'); await press(pg, m, true);
  assert.equal(await pg.evaluate((pt) => document.elementFromPoint(pt.x, pt.y) === document.getElementById('p9ov'), m), true, '2打目は背景に当たっている');
  assert.ok(await pg.$('#p9ov'), 'メニューは開いたまま');
  await ck.thaw(); await pg.waitForTimeout(DELIBERATE);
  await press(pg, m, true);
  await pg.waitForSelector('#p9ov', { state: 'detached' });
  await pg.click('.p9mbtn'); await pg.waitForSelector('#p9ov'); await pg.click('#p9ov .p9x');   // ✕ボタン・中のボタンは従来どおりすぐ効く
  await pg.waitForSelector('#p9ov', { state: 'detached' });
  assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
});

test('QA-G3-B6：実ブラウザ：ボードを出してすぐ別の画面へ移ったら、0.35秒後の着地処理はしない（画面を戻さない）。次にボードを開いたとき1回だけ処理（従来のボード・Chapterフィールドとも）', { skip: H.skipReason() }, async () => {
  // 守ること：以前は着地処理のタイマーがボードを離れたあとも動き、ステータス画面・開始画面の上にボードを描き直していた
  const M = load(), E = loadEngine();
  const board2 = j(onBoard(M)); Object.assign(board2.m.raise, { ch: 2, node: 'S' });
  const field = j(onBoard(M)); E.CH.initRun(field.m, E.CH.getConfig(1, 'A'), chLcg(3), 516106998);
  field.m.raise.field.nodeAssignments.f1_2 = { t: 'stat', k: 'po' }; Object.assign(field.m.raise, { node: 'f1_0', turnLimit: 30, fatigue: 5 });
  for (const [label, save0, sel, node] of [['Chapter 2（従来のボード）', board2, '.p9board #brollbtn', null], ['Chapter 1（Chapterフィールド）', field, '#chf-ui #brollbtn', 'f1_2']]) {
    const p = await L.open({ save: save0 }); const pg = p.page;
    await start(p, sel);
    const s0 = await pg.evaluate((node) => { const m = S.m; if (node) m.raise.node = node; m.raise.pend = { roll: 1, left: 0, stage: 'resolve' }; save(); const c = JSON.parse(JSON.stringify(S)); board(); hall('st'); return c; }, node);
    assert.equal(await H.text(pg).then((t) => /能力バランス/.test(t)), true, `${label}：ステータス画面`);
    await pg.waitForTimeout(700);   // 0.35秒（フィールドは0.3秒）のタイマーが過ぎるのを待つ（何も起きないことの確認）
    let S = await H.getS(pg);
    assert.ok(await pg.$('#app .ds-st'), `${label}：ステータス画面のまま（ボードに戻されない）`); assert.equal(await pg.$('#bmonw'), null);
    assert.deepEqual(S, s0, `${label}：止まったマスの処理は保存されたまま（何も変わらない）`);
    await pg.evaluate(() => board());
    await pg.waitForFunction(() => S.m.raise.pend == null && !bBusy && !document.querySelector('.chpop'), null, { timeout: 15000 });
    S = await H.getS(pg);
    if (node) { const d = S.m.po - s0.m.po; assert.ok(d >= 10 && d <= 23, `${label}：ちからの地点の効果は1回だけ（+${d}）`); }
    assert.deepEqual(await H.storedSave(pg), S, `${label}：処理した結果を保存`);
    await pg.waitForTimeout(600); assert.deepEqual(await H.getS(pg), S, `${label}：二重には適用しない`);
    assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
    await p.ctx.close();
  }
});

test('QA-G3-B7：実ブラウザ：育成放棄の最終確認を「やめない」で閉じてすぐ開き直しても、「放棄する」が押せるまで3秒待つ', { skip: H.skipReason() }, async () => {
  // 守ること：以前は閉じた確認のカウントダウンが動き続け、開き直すと2.5秒ほどで押せるようになっていた
  const M = load(); const p = await L.open({ save: j(atFarm(M)) }); const pg = p.page;
  await start(p, '#app .p9farm');
  await pg.evaluate(() => document.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('#p8m .p8danger:not(#p8abgo)')) window.__t0 = performance.now(); }, true));
  await pg.click('#app button[onclick="p8AbandonAsk()"]'); await pg.click('#p8m .p8danger'); await pg.waitForSelector('#p8abgo');
  await pg.waitForTimeout(500);
  await pg.click('#p8m .go'); await pg.waitForSelector('#p8m', { state: 'detached' });
  await pg.click('#app button[onclick="p8AbandonAsk()"]'); await pg.click('#p8m .p8danger'); await pg.waitForSelector('#p8abgo');
  const ms = await pg.evaluate(() => new Promise((ok) => { const b = document.getElementById('p8abgo'); if (!b.disabled) return ok(performance.now() - window.__t0); const o = new MutationObserver(() => { if (!b.disabled) { o.disconnect(); ok(performance.now() - window.__t0); } }); o.observe(b, { attributes: true }); }));
  assert.ok(ms >= 2900, `開き直してから ${Math.round(ms)}ms で押せるようになった（3秒待つ）`);
  await pg.click('#p8abgo'); await pg.waitForSelector('#app .map');
  assert.equal((await H.getS(pg)).m, null, '待ったあとの「放棄する」は従来どおり');
  assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
});

test('QA-G3-B8：実ブラウザ（マウス）：市場のカルーセルの外までドラッグして離したあと、「前へ」の矢印は前へ動く（次へにならない）', { skip: H.skipReason() }, async () => {
  // 守ること：以前はカルーセルの外で離したスワイプの始点が残り、次の矢印のクリックが逆向きのスワイプとして扱われていた
  const M = load(); const p = await L.open({ save: j(town(M)) }); const pg = p.page;
  await start(p, '#app .map');
  await pg.evaluate(() => market());
  await pg.waitForSelector('#p10car'); await pg.waitForFunction(() => !P10_ANIM);
  const n = await pg.evaluate(() => MMP10M.MARKET_CATALOG.length), k0 = await pg.evaluate(() => P10_MK);
  const r = await pg.evaluate(() => { const b = document.getElementById('p10car').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, bottom: b.bottom }; });
  await pg.mouse.move(r.x, r.y); await pg.mouse.down(); await pg.mouse.move(r.x - 30, r.bottom + 60, { steps: 5 }); await pg.mouse.up();
  await pg.waitForTimeout(50);
  assert.equal(await pg.evaluate(() => P10_MK), k0, '外で離したドラッグでは動かない（従来どおり）');
  await pg.click('#p10car .p10arw.prev');
  await pg.waitForFunction(() => !P10_ANIM);
  assert.equal(await pg.evaluate(() => P10_MK), (k0 - 1 + n) % n, '「前へ」で前の候補へ');
  assert.equal(await pg.evaluate(() => document.querySelector('#p10car .p10sl.on').dataset.key), await pg.evaluate(() => MMP10M.MARKET_CATALOG[P10_MK].key));
  await pg.click('#p10car .p10arw.next'); await pg.waitForFunction(() => !P10_ANIM);
  assert.equal(await pg.evaluate(() => P10_MK), k0, '「次へ」も従来どおり');
  assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
});

test('QA-G3-B9：実ブラウザ：新規開始→市場で購入→牧場→出発。フィナの確認の選択肢は、会話を送ったタップの続き（連打）では確定しない。「まだやめておく」ではボタンも元のまま（確認状態にしない）。手を止めて「始める」を押すと、フィナ→ダンのあと出発（エラーなし）', { skip: H.skipReason() }, async () => {
  // 守ること：以前はフィナの会話をタップで送った次のタップで、確認を読む間もなく出発していた。今は確認が選択肢（始める／まだやめておく）で、連打のリズムでは確定しない
  const p = await L.open(); const pg = p.page;
  await H.newGame(pg, 'スモーク');
  await pg.waitForSelector('#app .map');
  await pg.click('.hz[onclick="market()"]');
  await H.marketDetail(pg); await pg.waitForSelector('.p10buy:not([disabled])'); await pg.waitForFunction(() => !P10_ANIM);
  await H.marketDetail(pg); await pg.click('.p10buy'); await pg.waitForSelector('#p10ov .p10ok');
  await pg.waitForTimeout(DELIBERATE);
  await pg.click('#p10ov .p10ok');
  await pg.waitForSelector('#app .map');
  let S = await H.getS(pg); assert.equal(S.m.sp, 0); assert.equal(S.g, 0, 'はじめての1体（補填つき）は従来どおり');
  await pg.click('.hz[onclick="farm()"]'); await pg.waitForSelector('#app .ftiles');
  await pg.click('#app button.back'); await pg.waitForSelector('#app .map');
  await pg.click('.hz[onclick="hall()"]'); await pg.click('#app button[onclick="prepScr()"]');
  const dep = '#app button[onclick="p7Depart(this)"]';
  await pg.waitForSelector(dep);
  const html0 = await pg.evaluate((s) => document.querySelector(s).innerHTML, dep);
  assert.match(html0, /<small>準備ができたら出発しよう<\/small>/);
  await dnClock(pg); await dnFreezeOnChoices(pg);
  // 会話を送り、選択肢が出た瞬間から時計（Date.now：会話の時計）を止める＝そこからの押下は、実行環境の遅れがあっても「選択肢が出た直後・連打」として扱われる
  await pg.click(dep); await pg.waitForSelector('.mmtalk');
  for (let i = 0; i < 40; i++) { if (await pg.evaluate(() => { const s = MMNPC.state(); if (s && s.choices) { if (window.__dn.f == null) window.__dn.freeze(); return true; } return false; })) break; await pg.click('.mmtalk', { force: true }); await pg.waitForTimeout(40); }
  const c = await center(pg, '.mmtalk-choice[data-choice="start"]');
  assert.ok(c, '選択肢「始める」が出た');
  await pg.mouse.click(c.x, c.y); await pg.mouse.click(c.x, c.y);
  assert.equal((await H.getS(pg)).m.raise.state, 'none', '会話の直後の連打では出発しない');
  assert.equal(await pg.evaluate(() => MMNPC.state() && MMNPC.state().choice), null, '連打では選択肢を確定しない');
  await pg.evaluate(() => window.__dn.thaw());
  assert.equal(await H.chooseTalk(pg, 'cancel'), true);
  await pg.waitForFunction(() => !document.querySelector('.mmtalk'));
  assert.equal(await pg.evaluate((s) => document.querySelector(s).innerHTML, dep), html0, '「まだやめておく」のあとも元の表示（<small> 付き。確認状態にしない）');
  assert.equal((await H.getS(pg)).m.raise.state, 'none');
  // もう一度（2回目以降は確認の1行だけ）：手を止めて「始める」→ フィナ→ダン → 出発
  await pg.waitForTimeout(DELIBERATE);
  await H.startRaising(pg, dep);
  const S2 = await H.getS(pg);
  assert.equal(S2.m.raise.state, 'board'); assert.equal(S2.m.raise.ch, 1);
  assert.equal(await pg.evaluate(() => document.querySelectorAll('.mmtalk').length), 0);
  assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
});

test('QA-G3-B10：実ブラウザ（タッチ）：出発ボタンの位置をタップし続けてフィナの会話を送り、選択肢が出てもそのまま連打を続けても出発しない。手を止めて「始める」を押すと出発', { skip: H.skipReason() }, async () => {
  // 守ること：以前は会話を送るタップのリズムのまま次のタップで出発していた。今は確認が選択肢で、連打（0.4秒未満の間隔）では確定しない
  const M = load(); const p = await L.open({ save: j(town(M)), touch: true }); const pg = p.page;
  await start(p, '#app .map');
  await pg.evaluate(() => prepScr());
  const dep = '#app button[onclick="p7Depart(this)"]';
  await pg.waitForSelector(dep);
  await pg.evaluate((s) => document.querySelector(s).scrollIntoView({ block: 'nearest' }), dep);
  await dnClock(pg); await dnFreezeOnChoices(pg);
  const pt = await center(pg, dep);
  let choiceAt = -1, talked = false, onChoice = 0;
  for (let i = 0; i < 80; i++) {
    await pg.touchscreen.tap(pt.x, pt.y);
    await pg.waitForTimeout(60);
    const st = await pg.evaluate(([x, y]) => { const s = window.MMNPC && MMNPC.state(); if (s && s.choices && !window.__dn.f) window.__dn.freeze();   // 選択肢が出た瞬間から会話の時計を止める
      const hit = document.elementFromPoint(x, y); return { raise: S.m.raise.state, talk: !!document.querySelector('.mmtalk'), choices: !!(s && s.choices), onChoice: !!(hit && hit.closest && hit.closest('.mmtalk-choice')) }; }, [pt.x, pt.y]);
    assert.equal(st.raise, 'none', `${i + 1}回目のタップで出発してしまった`);
    if (st.talk) talked = true;
    if (st.choices && choiceAt < 0) choiceAt = i;
    if (st.onChoice) onChoice++;
    if (choiceAt >= 0 && i - choiceAt >= 8) break;
  }
  assert.ok(talked, 'フィナの会話が出た'); assert.ok(choiceAt >= 0, '確認の選択肢が出た');
  assert.equal(await pg.evaluate(() => MMNPC.state() && MMNPC.state().choice), null, '連打では選択肢を確定しない');
  await pg.evaluate(() => window.__dn.thaw());
  // 手を止めてから「始める」→ フィナ→ダン → 出発
  assert.equal(await H.chooseTalk(pg, 'start'), true);
  await H.finishTalk(pg);
  await pg.waitForSelector('#brollbtn');
  assert.equal((await H.getS(pg)).m.raise.state, 'board', '手を止めてから選べば従来どおり出発');
  assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
});

