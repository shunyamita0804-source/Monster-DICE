// =========================================================
// QA（実ブラウザ＋静的）：技術回帰（タイマー・イベントリスナー・DOM の残り方／素材パス／共通会話の後始末）
//  ・ページの読み込み前に setTimeout／setInterval／requestAnimationFrame と window・document のリスナーを数える仕掛けを入れ、
//    画面を何周も行き来しても「動き続けるタイマー」「リスナー」「DOM の要素数」が増えないことを確かめる
//  ・フィナの会話（MMNPC）を何度開いて閉じても、会話ウィンドウ・文字送りのタイマー・立ち絵アニメの interval・keydown リスナーが残らない
//  ・サイコロ演出のあと、演出の要素と「処理中」の印が必ず元に戻る
//  ・index.html と読み込まれる JS が参照する素材・スクリプトが、大文字小文字まで一致して実在する（GitHub Pages は大文字小文字を区別する）
//  画面の通し・エラー・読み込み・画面サイズごとのはみ出し／押せるかは qa-e2e-tech-screens.test.mjs で確認する。
//  Playwright / Chromium が無い環境では実ブラウザのテストを省略（skip）する。
//
//  いまは壊れていると分かっているため、ここでは確かめない（既知の課題）：
//   ・同じ画面にある SVG のグラデーション id の重複（市場の p10cg、分岐の ic-*-22、チケットの tkg）
//   ・街と牧場の歩くモンスター（left のアニメーション）が待機中も毎フレームのレイアウトを起こす → 待機中のレイアウトは街・牧場を除いて確かめる
//   ・モーダル（メニュー・育成放棄・会話）を開いてもページのスクロールが止まらない
//   ・技の詳細シート（#dsh）は _hall() 以外の画面移動では消えない（今の画面からは起こせない）
// =========================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import * as H from './e2e/harness.mjs';

const ROOT = H.ROOT;
const SKIP = H.skipReason();
let L = null;
test.before(async () => { if (!SKIP) L = await H.launch(); });
test.after(async () => { if (L) await L.close(); });
// テストごとに開いたページを閉じる（開いたままだと BGM やアニメーションが重なり、後のテストが遅くなる）
const OPEN = [];
const openPage = async (o) => { const p = await L.open(o); OPEN.push(p); return p; };
test.afterEach(async () => { for (const p of OPEN.splice(0)) await p.ctx.close().catch(() => {}); });
/** 実ブラウザのテスト：B(名前, 関数) */
const B = (name, fn) => test(name, { skip: SKIP, timeout: 60000 }, fn);

// ---------------------------------------------------------
// 共通：ファイルの実在（大文字小文字まで一致）
// ---------------------------------------------------------
/** ROOT からの相対パスが、各階層の名前まで大文字小文字一致で存在するファイルか */
function existsExact(rel) {
  const parts = rel.replace(/^\.\//, '').split('/').filter(Boolean);
  let dir = ROOT;
  for (let i = 0; i < parts.length; i++) {
    let names; try { names = readdirSync(dir); } catch (e) { return false; }
    if (!names.includes(parts[i])) return false;
    dir = path.join(dir, parts[i]);
  }
  try { return statSync(dir).isFile(); } catch (e) { return false; }
}
const clean = (u) => decodeURIComponent(String(u).split(/[?#]/)[0]).replace(/^\.\//, '').replace(/^\//, '');
const HTML = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const HTML_NO_B64 = HTML.replace(/data:[a-z0-9.+\/-]+;base64,[A-Za-z0-9+\/=]+/gi, 'DATAURI');
/** index.html が読み込むスクリプト（<script src>）。外部URLは除く */
const SCRIPTS = [...HTML.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1]).filter((s) => !/^https?:/.test(s)).map(clean);

// ---------------------------------------------------------
// 共通：計測の仕掛け（ページの読み込み前に入れる）
// ---------------------------------------------------------
/** タイマー・rAF・window／document のリスナーを数える。どのファイルから作られたか（npc.js／index.html など）も記録する */
const INSTR = () => {
  if (window.__T) return;
  const T = window.__T = { to: new Map(), iv: new Map(), raf: new Map(), lis: new Map() };
  const from = () => { const s = new Error().stack || ''; return /\/js\/npc\/npc\.js/.test(s) ? 'npc' : /index\.html/.test(s) ? 'index' : ((s.match(/\/(js\/[\w\/.-]+\.js)/) || [])[1] || 'other'); };
  const W = window, oST = W.setTimeout, oCT = W.clearTimeout, oSI = W.setInterval, oCI = W.clearInterval, oRAF = W.requestAnimationFrame, oCAF = W.cancelAnimationFrame;
  W.setTimeout = function (fn, ms, ...a) { const f = from(); const id = oST.call(W, function () { T.to.delete(id); return typeof fn === 'function' ? fn.apply(this, a) : undefined; }, ms); T.to.set(id, { ms, f }); return id; };
  W.clearTimeout = function (id) { T.to.delete(id); return oCT.call(W, id); };
  W.setInterval = function (fn, ms, ...a) { const id = oSI.call(W, fn, ms, ...a); T.iv.set(id, { ms, f: from() }); return id; };
  W.clearInterval = function (id) { T.iv.delete(id); return oCI.call(W, id); };
  W.requestAnimationFrame = function (fn) { const id = oRAF.call(W, (t) => { T.raf.delete(id); fn(t); }); T.raf.set(id, from()); return id; };
  W.cancelAnimationFrame = function (id) { T.raf.delete(id); return oCAF.call(W, id); };
  const tgt = (t) => (t === W ? 'window' : t === document ? 'document' : null);
  const oAdd = EventTarget.prototype.addEventListener, oRem = EventTarget.prototype.removeEventListener;
  EventTarget.prototype.addEventListener = function (type, fn, o) {
    const t = tgt(this); if (t && fn) { const k = `${t}:${type}`; const s = T.lis.get(k) || new Set(); s.add(fn); T.lis.set(k, s); }
    return oAdd.call(this, type, fn, o);
  };
  EventTarget.prototype.removeEventListener = function (type, fn, o) {
    const t = tgt(this); if (t && fn) { const s = T.lis.get(`${t}:${type}`); if (s) s.delete(fn); }
    return oRem.call(this, type, fn, o);
  };
};
/** いまの計測値（Playwright 自身が付けるリスナーは除く） */
const SNAP = () => {
  const T = window.__T, lis = {};
  // Playwright がクリックの確認のために window に付けるリスナー（ゲームは window にはこれらを付けない）
  const pw = /^window:(__playwright|mousemove|mousedown|mouseup|pointerdown|pointerup|pointermove|touchstart|touchend|touchcancel|click|auxclick|dblclick|contextmenu)/;
  for (const [k, s] of T.lis) if (s.size && !pw.test(k)) lis[k] = s.size;
  return {
    iv: [...T.iv.values()].map((v) => `${v.f}:${v.ms}`), to: [...T.to.values()].map((v) => `${v.f}:${v.ms}`), raf: T.raf.size, lis,
    nodes: document.getElementsByTagName('*').length, talk: document.querySelectorAll('.mmtalk').length,
    ov: ['#p10ov', '#p9ov', '#p8m', '.p12dz', '#dsh', '#bt'].filter((s) => document.querySelector(s)),
    bodyOverflow: document.body.style.overflow, bodyKids: [...document.body.children].filter((e) => !/^(SCRIPT|MAIN)$/.test(e.tagName) && e.id !== 'ov' && e.id !== 'snd').map((e) => e.tagName + '.' + e.className),
  };
};
/** CDP：ガベージコレクションの後の DOM ノード数（切り離されたが参照が残っているノードも含む）と JS のイベントリスナー数 */
async function cdp(page) {
  const c = await page.context().newCDPSession(page);
  try {
    await c.send('HeapProfiler.collectGarbage'); await c.send('HeapProfiler.collectGarbage');
    const d = await c.send('Memory.getDOMCounters');
    return { nodes: d.nodes, listeners: d.jsEventListeners };
  } finally { await c.detach().catch(() => {}); }
}
/**
 * 計測の仕掛けを入れたページを開く。setup があれば、先にゲームの関数で状態を作って save() し、
 * 仕掛けを入れて再読み込みしてから、開始画面の「タップしてはじめる」で続きから始める（セーブ→再読込→再開の実際の流れ）。
 */
async function openInstr(o = {}, setup = null, arg = null) {
  const p = await openPage(o);
  if (setup) await p.page.evaluate(setup, arg);
  await p.ctx.addInitScript(INSTR);
  await p.page.reload();
  await p.page.waitForFunction(() => typeof window.MMP8 === 'object' && typeof S === 'object' && !!window.__T);
  if (setup) await resume(p.page);
  return p;
}
/** 乱数を固定する（出目・マスの効果を毎回同じにして、結果がぶれないようにする） */
const SEED_RANDOM = () => { let a = 20260928; Math.random = () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
/**
 * 読み込み後に計測の仕掛けを入れて、TWO の状態で街（dep=true なら Chapter 1 のボード）を開く。
 *  読み込み時に付くリスナーは数えない（画面の行き来や会話など、後から作られるものを数えるとき用）。seed=true なら乱数も固定する
 */
async function openTown(o = {}, dep = false, seed = false) {
  const p = await openPage(o);
  if (seed) await p.page.evaluate(SEED_RANDOM);
  await p.page.evaluate(INSTR);
  await p.page.evaluate(TWO, dep);
  await p.page.evaluate((dep) => (dep ? board() : lobby()), dep);
  await waitSel(p.page, dep ? '#brollbtn' : '.hz[onclick="market()"]');
  return p;
}
/** 名前登録・フィナのあいさつ済みで、手持ちソラモ・牧場にガウル・所持金5000G（dep=true なら手持ちで Chapter 1 に出発済み） */
const TWO = (dep) => {
  MMP11P.confirmName(S, 'ギジュツ'); S.npcFlags = { finaIntro: 1 };
  S.m = mk(0); S.box = [mk(1)]; S.g = 5000;
  if (dep && !MMP8.depart(S, S.m).ok) throw new Error('出発できない');
  save();
};
/** 一時的なタイマー（演出の後始末など）が全部終わるまで待つ（動き続けるタイマー＝interval は待たない） */
const quiet = (pg, ms = 8000) => pg.waitForFunction(() => window.__T.to.size === 0 && window.__T.raf.size === 0, null, { timeout: ms });
const snap = (pg) => pg.evaluate(SNAP);
/** 要素が出るまで待つ（waitForSelector は要素の参照を持ち続け、DOM の数え方を狂わせるため使わない） */
const waitSel = (pg, sel, timeout = 15000) => pg.waitForFunction((s) => !!document.querySelector(s), sel, { timeout });
/**
 * 読み込みの失敗のうち、コマ送り（サイコロ・フィナの立ち絵アニメ）で次のコマへ切り替わって取り消されたもの（実在するファイル）を除く。
 *  テスト用のサーバはキャッシュさせない（no-store）ため、テストを並べて動かして重いときは、前のコマの読み込み中に次のコマへ切り替わり
 *  取り消し（ERR_ABORTED）が記録されることがある。ゲームの不具合ではない（本番のキャッシュありでは起きないことを監査で確認済み）。
 *  404 などの応答と、ほかのファイルの失敗はそのまま失敗にする。
 */
const realBad = (bad) => bad.filter((b) => { const m = /^failed (assets\/(?:dice\/(?:std|branch)\/\d\d\.webp|npc\/fina\/animations\/\w+\/\w+\.png))$/.exec(b); return !(m && existsExact(m[1])); });
/** ページの読み込みで出たエラー・読み込めなかったファイルが無いこと */
function noErrors(p) {
  assert.deepEqual(p.errors, [], 'pageerror / console.error が出ていない');
  assert.deepEqual(realBad(p.bad), [], 'ローカルのファイルがすべて読み込めている');
}
/** 開始画面から「つづき」を始める（seed したセーブで再開） */
async function resume(pg) {
  await waitSel(pg, '.p15start');
  await pg.click('.p15start');
  await pg.waitForFunction(() => !document.querySelector('.p15start') && !!document.querySelector('#app > *'), null, { timeout: 15000 });
}
// =========================================================
// 静的：素材・スクリプトのパス
// =========================================================
test('QA-TD1：index.html が読み込むスクリプトと、index.html・読み込まれる JS の中に書かれた素材パスが、大文字小文字まで一致して実在する', () => {
  assert.ok(SCRIPTS.length >= 13, '読み込むスクリプトの一覧が取れている：' + SCRIPTS.length);
  for (const s of SCRIPTS) assert.ok(existsExact(s), `<script src> のファイルが無い（大文字小文字も一致させる）：${s}`);
  const links = [...HTML.matchAll(/<link[^>]*rel="(?:apple-touch-icon|icon)"[^>]*href="([^"]+)"/g)].map((m) => clean(m[1]));
  assert.equal(links.length, 2, 'ホーム画面アイコンとファビコンの2つ');
  const refs = new Set(links);
  const RE = /(?:\.\/)?((?:assets|js)\/[A-Za-z0-9_\-\/.]+\.(?:png|PNG|jpe?g|JPE?G|webp|svg|gif|js|mp3|ogg|wav|m4a))(?![A-Za-z0-9_])/g;
  for (const [f, src] of [['index.html', HTML_NO_B64], ...SCRIPTS.map((s) => [s, readFileSync(path.join(ROOT, s), 'utf8')])]) {
    for (const m of src.matchAll(RE)) refs.add(clean(m[1]));
    for (const m of src.matchAll(/url\(\s*['"]?((?!data:|https?:|\$\{)[^'")\s]+)['"]?\s*\)/g)) if (/\.(png|jpe?g|webp|svg|gif)$/i.test(clean(m[1]))) refs.add(clean(m[1]));
  }
  assert.ok(refs.size >= 10, '素材パスが見つかっている：' + [...refs].join(', '));
  const missing = [...refs].filter((r) => !existsExact(r));
  assert.deepEqual(missing, [], '参照先のファイルが無い（または大文字小文字が違う）');
});

test('QA-TD2：ホーム画面アイコンの2行は Google Fonts の stylesheet 行の直後にあり、ファイルは 180×180／32×32 の PNG', () => {
  const lines = HTML.split('\n'), i = lines.findIndex((l) => /fonts\.googleapis\.com\/css2/.test(l) && /rel="stylesheet"/.test(l));
  assert.ok(i >= 0, 'Google Fonts の stylesheet 行がある');
  assert.equal(lines[i + 1].trim(), '<link rel="apple-touch-icon" sizes="180x180" href="./apple-touch-icon-v2.PNG?v=soramo-20260928">');
  assert.equal(lines[i + 2].trim(), '<link rel="icon" type="image/png" sizes="32x32" href="./favicon.png?v=soramo-20260928">');
  for (const [f, w] of [['apple-touch-icon-v2.PNG', 180], ['favicon.png', 32]]) {
    assert.ok(existsExact(f), f + ' がある（大文字小文字も一致）');
    const b = readFileSync(path.join(ROOT, f));
    assert.equal(b.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', f + ' は PNG');
    assert.equal(b.subarray(12, 16).toString('latin1'), 'IHDR');
    assert.deepEqual([b.readUInt32BE(16), b.readUInt32BE(20)], [w, w], f + ' の大きさ');
  }
});

test('QA-TD3：新しい画像を base64 で埋め込んでいない（JS には0件、index.html は今の数より増えない）', () => {
  const walk = (d) => readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : /\.m?js$/.test(e.name) ? [path.join(d, e.name)] : []));
  const js = walk('js');
  assert.ok(js.length >= 13);
  for (const f of js) assert.equal((readFileSync(path.join(ROOT, f), 'utf8').match(/data:image\//g) || []).length, 0, f + ' に base64 画像が無い');
  const n = (HTML.match(/data:image\//g) || []).length;
  assert.ok(n <= 197, `index.html の埋め込み画像は 197 件以下（いま ${n} 件）。新しい画像は assets/ にファイルとして置く`);
});

// =========================================================
// 実ブラウザ：実行時に組み立てる素材パス
// =========================================================
B('QA-TD4：実行時に使う画像（正式モンスター・背景・市場・サイコロ全コマ・フィールド・フィナの表情とアニメ全コマ・開始画面）が全部実在し、読み込める', async () => {
  const p = await openPage({ size: H.SIZES.base });
  const list = await p.page.evaluate(() => {
    const out = [];
    const add = (s) => { if (typeof s === 'string' && s) out.push(s); };
    for (const s of MMP10M.SPECIES) { add(s.image && s.image.src); add(s.silhouette && s.silhouette.src); }
    add(MMP12S.FARM_INTERVAL.src); add(MMP12S.MARKET_BG.src);
    for (const k of Object.keys(MMP12S.TRAINING)) add(MMP12S.TRAINING[k].image.src);
    for (const k of Object.keys(MMP12D.SETS)) MMP12D.SETS[k].frames.forEach(add);
    for (let no = 1; no <= 4; no++) { const f = MMP13F.get(no); if (f) add(f.image && f.image.src); }
    const fina = MMNPC.get('fina');
    for (const v of Object.values(fina.views)) Object.values(v).forEach(add);
    for (const v of Object.values(fina.anims)) for (const a of Object.values(v)) a.frames.forEach(add);
    add(MMTITLE.src);
    document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]').forEach((l) => add(l.getAttribute('href')));
    return out;
  });
  const uniq = [...new Set(list.map(clean))];
  assert.ok(uniq.length >= 56, '実行時の画像パスが集まっている：' + uniq.length);
  assert.equal(uniq.filter((x) => x.startsWith('assets/dice/')).length, 20, 'サイコロ（通常用・分岐用）10コマずつ');
  assert.equal(uniq.filter((x) => x.startsWith('assets/npc/fina/')).length, 20, 'フィナの表情8枚＋アニメ2種×6コマ');
  for (const k of ['solamo', 'gauru', 'nobiton', 'jiol']) assert.ok(uniq.includes(`assets/monsters/${k}.png`), k + ' の正式画像');
  assert.ok(uniq.includes('assets/title/title_main.jpg'));
  assert.deepEqual(uniq.filter((r) => !existsExact(r)), [], '実在しない（または大文字小文字が違う）画像パス');
  // 実際にブラウザで読み込めること（画像として壊れていない）
  const broken = await p.page.evaluate((srcs) => Promise.all(srcs.map((s) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i.naturalWidth > 0 ? null : s); i.onerror = () => ok(s); i.src = s; }))).then((r) => r.filter(Boolean)), uniq);
  assert.deepEqual(broken, [], '読み込めない画像');
  noErrors(p);
});

// =========================================================
// 実ブラウザ：画面を行き来しても増えない
// =========================================================
B('QA-TL1：街→市場（次へ・購入確認・やめる）→街→牧場→街→博物館→街→セーブ→街 を15周しても、タイマー・リスナー・DOM が増えない', async () => {
  const p = await openInstr({ size: H.SIZES.base }, TWO, false);
  const pg = p.page;
  await waitSel(pg, '.hz[onclick="market()"]');
  const boot = await snap(pg);   // 街に入った直後のリスナー。ゲームの常設リスナーは読み込み時に付く
  // 画面の出だしの演出（位置が動く）で Playwright が1回ごとに約0.4秒待つため、位置の安定を待たずに押す。押した結果は毎回待って確かめる
  const tap = (sel) => pg.click(sel, { force: true });
  const cycle = async () => {
    await tap('.hz[onclick="market()"]');
    await pg.waitForFunction(() => !!document.querySelector('#p10car .p10sl.on') && !P10_ANIM);
    // ソラモなら「次へ」でガウル、ガウルなら「前へ」でソラモ（入荷待ちのノビトンは購入確認が開かないため避ける）
    const at = await pg.evaluate(() => MMP10M.MARKET_CATALOG[P10_MK].key);
    await tap(at === 'solamo' ? '.p10arw.next' : '.p10arw.prev');
    await pg.waitForFunction((k) => !P10_ANIM && MMP10M.MARKET_CATALOG[P10_MK].key === k && !document.querySelector('#p10info .p10buy').disabled, at === 'solamo' ? 'gauru' : 'solamo');
    await H.marketDetail(pg); await tap('#p10info .p10buy');
    await waitSel(pg, '#p10ov .p10no');
    await pg.waitForTimeout(450);   // 購入シートは開いてから0.35秒間、押しても反応しない
    await tap('#p10ov .p10no');
    await pg.waitForFunction(() => !document.getElementById('p10ov'));
    await tap('.p10detx'); await pg.waitForFunction(() => !document.querySelector('.p10mk').classList.contains('det'));   // 詳細シートを閉じてから戻る（開いている間は背景のタップでシートが閉じる）
    await tap('.p10back');
    await waitSel(pg, '.hz[onclick="farm()"]');
    await tap('.hz[onclick="farm()"]');
    await waitSel(pg, '.fsell');
    await tap('button.back');
    await waitSel(pg, '.hz[onclick="museum()"]');
    await tap('.hz[onclick="museum()"]');
    await waitSel(pg, '.mgc');
    await tap('.dtop .dback');
    await waitSel(pg, '.svb');
    await tap('.svb');
    await waitSel(pg, 'button.ghost');
    await tap('button.back');
    await waitSel(pg, '.svb');
  };
  await cycle();
  await quiet(pg);
  const s1 = await snap(pg), c1 = await cdp(pg);
  for (let i = 2; i <= 15; i++) await cycle();
  await quiet(pg);
  const s15 = await snap(pg), c15 = await cdp(pg);
  // 街に戻っている・何も残っていない
  assert.equal(await pg.evaluate(() => !!document.querySelector('#app .svb') && !!document.querySelector('.hz[onclick="market()"]')), true, '街に戻っている');
  assert.deepEqual(s15.ov, [], '確認シート・メニューなどが残っていない');
  assert.deepEqual(s15.bodyKids, [], 'body の直下に余計な要素が残っていない');
  assert.equal(s15.bodyOverflow, '', 'スクロールの固定が残っていない');
  assert.equal(s15.talk, 0);
  // タイマー：一時的なものは0、動き続けるのは BGM の1つだけ（画面を替えても増えない）
  assert.deepEqual(s15.to, []); assert.equal(s15.raf, 0);
  assert.ok(s15.iv.length <= 1 && s15.iv.length <= s1.iv.length, '動き続けるタイマーが増えない：' + JSON.stringify([s1.iv, s15.iv]));
  assert.ok(s15.iv.every((x) => x.startsWith('index:')), 'BGM 以外の interval が無い：' + s15.iv);
  // リスナー：どの種類も1周目より増えず、起動直後の数も超えない
  for (const [k, n] of Object.entries(s15.lis)) {
    assert.ok(n <= (s1.lis[k] || 0), `${k} のリスナーが増えた：${s1.lis[k] || 0} → ${n}`);
    if (k.startsWith('document:')) assert.ok(n <= (boot.lis[k] || 0), `${k} のリスナーが起動直後（${boot.lis[k] || 0}）より多い：${n}`);
  }
  // DOM：同じ街の画面で要素数が同じ。GC 後の DOM ノード数（切り離されたノードも含む）と JS リスナー数も増えない
  assert.equal(s15.nodes, s1.nodes, '街の画面の要素数');
  assert.ok(c15.nodes <= c1.nodes + 40, `DOM ノード数が増えている（切り離された要素が残る）：${c1.nodes} → ${c15.nodes}`);
  assert.ok(c15.listeners <= c1.listeners + 4, `JS のイベントリスナー数が増えている：${c1.listeners} → ${c15.listeners}`);
  noErrors(p);
});

B('QA-TL2：育成中の画面（ボード↔ステータス・技管理・技の詳細、メニュー・凡例、育成放棄の確認、フィナの会話）を6周しても何も残らない', async () => {
  const p = await openTown({ size: H.SIZES.base }, true);
  const pg = p.page;
  const uid = await pg.evaluate(() => S.m.uid);
  const cycle = async () => {
    await pg.evaluate(() => { hall('st'); hall('t'); hall('w'); });
    await pg.evaluate(() => skd(S.m.sk[0]));
    await pg.evaluate(() => hall('t'));
    await waitSel(pg, '#brollbtn');
    await pg.evaluate(() => { p9Menu(); p9Legend(); });
    await waitSel(pg, '#p9ov');
    await pg.waitForTimeout(500);   // 開いた直後の閉じる操作を無視する作りでも閉じられるよう待つ
    await pg.click('#p9ov .p9x');
    await pg.waitForFunction(() => !document.getElementById('p9ov'));
    await pg.evaluate(() => p8AbandonAsk());
    await waitSel(pg, '#p8m');
    await pg.evaluate((u) => p8AbandonAsk2(u), uid);
    await waitSel(pg, '#p8abgo');
    await pg.click('#p8m .go');   // 「やめない」
    await pg.waitForFunction(() => !document.getElementById('p8m'));
    await pg.evaluate(() => { MMNPC.talk([{ npc: 'fina', anim: 'wave', text: 'テストです。こんにちは。' }, { text: '二行目です。' }]); });
    await waitSel(pg, '.mmtalk');
    await pg.waitForTimeout(120);
    await pg.evaluate(() => MMNPC.close());
    await pg.evaluate(() => board());
    await waitSel(pg, '#brollbtn');
  };
  await cycle();
  // 育成放棄のカウントダウン（1秒ごと）は、確認画面が閉じた後の次の回で止まる
  await pg.waitForFunction(() => window.__T.iv.size <= 1 && window.__T.to.size === 0, null, { timeout: 8000 });
  const s1 = await snap(pg), c1 = await cdp(pg);
  for (let i = 2; i <= 6; i++) await cycle();
  await pg.waitForFunction(() => window.__T.iv.size <= 1 && window.__T.to.size === 0 && window.__T.raf.size === 0, null, { timeout: 8000 });
  const s6 = await snap(pg), c6 = await cdp(pg);
  const st = await pg.evaluate(() => ({ state: MMNPC.state(), anim: MMNPC.animState().running, ph: MMP8.boardPhase(S.m), rs: MMP7.raiseState(S.m) }));
  assert.deepEqual(st, { state: null, anim: false, ph: 'roll', rs: 'board' }, '会話は閉じ、育成はそのまま（放棄されていない）');
  assert.deepEqual(s6.ov, [], 'メニュー・育成放棄の確認・技の詳細・サイコロが残っていない');
  assert.equal(s6.talk, 0, '会話ウィンドウが残っていない');
  assert.deepEqual(s6.bodyKids, [], 'body の直下に余計な要素が残っていない');
  assert.ok(s6.iv.every((x) => x.startsWith('index:')) && s6.iv.length <= 1, '立ち絵アニメ・カウントダウンの interval が残っていない：' + s6.iv);
  assert.equal(s6.lis['document:keydown'], s1.lis['document:keydown'], '会話の keydown リスナーが外れている');
  for (const [k, n] of Object.entries(s6.lis)) assert.ok(n <= (s1.lis[k] || 0), `${k} のリスナーが増えた：${s1.lis[k] || 0} → ${n}`);
  assert.equal(s6.nodes, s1.nodes, 'ボード画面の要素数');
  assert.ok(c6.nodes <= c1.nodes + 40, `DOM ノード数が増えている：${c1.nodes} → ${c6.nodes}`);
  assert.ok(c6.listeners <= c1.listeners + 4, `JS のイベントリスナー数が増えている：${c1.listeners} → ${c6.listeners}`);
  noErrors(p);
});

// =========================================================
// 実ブラウザ：共通会話（MMNPC）の後始末
// =========================================================
/** 会話ウィンドウが追加された瞬間（最初の文字送りのタイマーを予約した直後）の状態を記録する仕掛け */
const watchTalkOpen = (pg) => pg.evaluate(() => {
  window.__talkOpen = null;
  const mo = new MutationObserver(() => {
    const ov = document.querySelector('.mmtalk');
    if (!ov || window.__talkOpen) return;
    const s = MMNPC.state(), nx = ov.querySelector('.mmtalk-next'), T = window.__T;
    window.__talkOpen = { n: document.querySelectorAll('.mmtalk').length, name: ov.querySelector('.mmtalk-name').textContent, img: ov.querySelector('.mmtalk-fig img').getAttribute('src'),
      idx: s.idx, typing: s.typing, text: s.text, nextShown: !nx.hidden, npcTo: [...T.to.values()].filter((v) => v.f === 'npc').length, keydown: (T.lis.get('document:keydown') || new Set()).size };
    mo.disconnect();
  });
  mo.observe(document.body, { childList: true });
});
/** 会話まわりの計測：会話ウィンドウの数・状態・npc.js のタイマー・document の keydown リスナー */
const talkSnap = (pg) => pg.evaluate(() => {
  const T = window.__T, ov = document.querySelector('.mmtalk'), s = MMNPC.state();
  return { n: document.querySelectorAll('.mmtalk').length, state: s && { idx: s.idx, total: s.total, typing: s.typing, text: s.text, full: s.full, expr: s.expr, view: s.view, anim: s.anim, fallback: s.fallback },
    anim: MMNPC.animState().running, npcTo: [...T.to.values()].filter((v) => v.f === 'npc').length, npcIv: [...T.iv.values()].filter((v) => v.f === 'npc').length,
    keydown: (T.lis.get('document:keydown') || new Set()).size, text: ov ? ov.querySelector('.mmtalk-text').textContent : null, next: ov ? !ov.querySelector('.mmtalk-next').hidden : null,
    img: ov ? ov.querySelector('.mmtalk-fig img').getAttribute('src') : null, fig: ov ? ov.querySelector('.mmtalk-fig').className : null };
});
/** 会話が終わって何も残っていないこと */
async function assertTalkGone(pg, keydown0, msg) {
  await pg.waitForFunction(() => !document.querySelector('.mmtalk') && !MMNPC.state(), null, { timeout: 10000 });
  const t = await talkSnap(pg);
  assert.deepEqual({ n: t.n, state: t.state, anim: t.anim, npcTo: t.npcTo, npcIv: t.npcIv, keydown: t.keydown }, { n: 0, state: null, anim: false, npcTo: 0, npcIv: 0, keydown: keydown0 }, msg + '：会話ウィンドウ・文字送りのタイマー・立ち絵アニメ・keydown リスナーが残っていない');
}
/** 長い行（文字送りに数秒かかる。タップの前に少し待っても、まだ表示中であることが確かな長さ） */
const LONG = 'これはテスト用の長いセリフです。文字送りが終わる前にタップすると、全文がすぐに表示されるはずです。最後まで読んでくださいね。';
const LONG2 = '二つ目のセリフです。こちらも十分に長くして、文字送りの途中でキー操作を試せるようにしています。よろしくお願いします。';

B('QA-TN1：名前登録直後のフィナのあいさつ：開いた瞬間は文字送り中（▼なし）、最後まで送ると何も残らず、表示済みの記録が保存されて再読み込み後は出ない', async () => {
  const p = await openInstr({ size: H.SIZES.base });
  const pg = p.page;
  await pg.click('.p15start');
  await waitSel(pg, '#p11nm');
  const keydown0 = (await talkSnap(pg)).keydown;
  await pg.fill('#p11nm', 'アルト');
  await watchTalkOpen(pg);
  await pg.click('.p11go');
  await pg.waitForFunction(() => !!window.__talkOpen);
  const o = await pg.evaluate(() => window.__talkOpen);
  delete o.npcTo; delete o.keydown;   // タイマー・リスナーの数は長い行で確かめる（QA-TN2）
  assert.deepEqual(o, { n: 1, name: 'フィナ', img: 'assets/npc/fina/closeup/smile.png', idx: 0, typing: true, text: '', nextShown: false }, '開いた瞬間の会話（1文字目の前・▼なし）');
  const st = await H.storedSave(pg);
  assert.equal(st.npcFlags && st.npcFlags.finaIntro, 1, '会話を出す前に「表示済み」を保存している');
  await H.finishTalk(pg);
  await assertTalkGone(pg, keydown0, 'あいさつの後');
  assert.equal(await pg.evaluate(() => !!document.querySelector('.hz[onclick="market()"]')), true, '街に着いている');
  // 再読み込みして続きから：もう出ない
  await pg.reload();
  await pg.waitForFunction(() => typeof window.MMP8 === 'object' && !!window.__T);
  await resume(pg);
  await waitSel(pg, '.hz[onclick="market()"]');
  await pg.waitForTimeout(400);
  assert.equal(await pg.evaluate(() => document.querySelectorAll('.mmtalk').length), 0, '再読み込み後はあいさつが出ない');
  assert.equal((await H.storedSave(pg)).playerName, 'アルト');
  noErrors(p);
});

B('QA-TN2：文字送り中のタップで全文・▼表示・タイマー0、次のタップで次の行。Enter キーでも進み、連打（同時に5回）は1回分だけ。終わると keydown リスナーが外れる', async () => {
  const p = await openTown({ size: H.SIZES.base });
  const pg = p.page;
  await quiet(pg);
  const keydown0 = (await talkSnap(pg)).keydown;
  await pg.evaluate(([a, b]) => { window.__ended = 0; MMNPC.talk([{ npc: 'fina', text: a }, { expression: 'happy', text: b }]).then(() => { window.__ended++; }); }, [LONG, LONG2]);
  await pg.waitForTimeout(300);   // 開いた直後の入力を無視する作りでも受け付けられるよう待つ（行は60文字以上＝2秒ほどかかるので、まだ文字送り中）
  await pg.waitForFunction((k) => { const T = window.__T; return [...T.to.values()].filter((v) => v.f === 'npc').length === 1 && (T.lis.get('document:keydown') || new Set()).size === k + 1; }, keydown0, { timeout: 5000 });
  let t = await talkSnap(pg);
  assert.equal(t.state.typing, true, 'まだ文字送り中');
  assert.ok(t.text.length >= 1 && t.text.length < LONG.length && LONG.startsWith(t.text), '1文字ずつ・順番どおり：' + t.text);
  assert.deepEqual([t.next, t.npcTo, t.keydown, t.img], [false, 1, keydown0 + 1, 'assets/npc/fina/closeup/normal.png']);
  await pg.click('.mmtalk', { force: true });
  t = await talkSnap(pg);
  assert.deepEqual([t.text, t.state.typing, t.next, t.npcTo, t.state.idx], [LONG, false, true, 0, 0], 'タップで全文表示・▼表示・文字送りのタイマーなし');
  await pg.waitForTimeout(150);
  await pg.click('.mmtalk', { force: true });
  t = await talkSnap(pg);
  assert.deepEqual([t.state.idx, t.state.expr, t.img, t.state.typing, t.next], [1, 'happy', 'assets/npc/fina/closeup/happy.png', true, false], '次のタップで次の行（表情も切り替わる）');
  // 同時に5回押しても1回分（全文表示）だけ
  await pg.waitForTimeout(150);
  await pg.evaluate(() => { const ov = document.querySelector('.mmtalk'); for (let i = 0; i < 5; i++) ov.click(); });
  t = await talkSnap(pg);
  assert.deepEqual([t.state.idx, t.state.typing, t.text], [1, false, LONG2], '連打しても2行進んだり終わったりしない');
  // Enter キーで最後の行を終える
  await pg.waitForTimeout(150);
  await pg.keyboard.press('Enter');
  await assertTalkGone(pg, keydown0, 'Enter で終えた後');
  assert.equal(await pg.evaluate(() => window.__ended), 1, '会話の終了は1回だけ（Promise が解決）');
  await pg.keyboard.press('Enter');   // 終わった後のキーは何もしない
  assert.equal(await pg.evaluate(() => document.querySelectorAll('.mmtalk').length), 0);
  noErrors(p);
});

B('QA-TN3：フィナの会話を5回（タップで送って選択肢で終える・Enter キーで最後まで・途中で閉じる・アニメ付き）開いて終えるたびに、何も残らず DOM も増えない', async () => {
  const p = await openTown({ size: H.SIZES.base });
  const pg = p.page;
  await quiet(pg);
  // Playwright は最初のクリックで window に確認用のリスナーを付けるため、数え始める前に1回クリックしておく（何も起きない街の「街」の札）
  await pg.click('.tttl');
  await quiet(pg);
  const keydown0 = (await talkSnap(pg)).keydown;
  const c0 = await cdp(pg);
  const open = async (code) => { await pg.evaluate(code); await pg.waitForFunction(() => !!document.querySelector('.mmtalk') && !!MMNPC.state()); };
  // 1) 育成開始（初回の説明つき）をタップで送り、選択肢「まだやめておく」で終える（選択肢のボタンも残らない）
  await open(() => { window.__r = []; finaTalk('raiseFirst').then(() => window.__r.push('raiseFirst')); });
  assert.equal(await H.chooseTalk(pg, 'cancel'), true);
  await assertTalkGone(pg, keydown0, '1回目');
  // 2) 育成完了を Enter キーで最後まで
  await open(() => { finaTalk('done').then(() => window.__r.push('done')); });
  await pg.waitForTimeout(250);
  for (let i = 0; i < 20 && (await pg.evaluate(() => !!document.querySelector('.mmtalk'))); i++) { await pg.keyboard.press('Enter'); await pg.waitForTimeout(100); }
  await assertTalkGone(pg, keydown0, '2回目（Enter）');
  // 3) あいさつを途中で閉じる
  await open(() => { finaTalk('intro').then(() => window.__r.push('intro')); });
  await pg.waitForTimeout(100);
  await pg.evaluate(() => MMNPC.close());
  await assertTalkGone(pg, keydown0, '3回目（途中で閉じる）');
  // 4) 2回目以降の育成開始（1行）：選択肢「始める」で終える（続きの行を渡していないので、そこで会話を終える）
  await open(() => { finaTalk('raiseAgain').then(() => window.__r.push('raiseAgain')); });
  assert.equal(await H.chooseTalk(pg, 'start'), true);
  await assertTalkGone(pg, keydown0, '4回目');
  // 5) 立ち絵アニメ付きの行を最後まで
  await open(() => { MMNPC.talk([{ npc: 'fina', anim: 'wave', text: 'アニメーションのテストです。' }, { anim: 'wave_blink', text: 'もう一つです。' }]).then(() => window.__r.push('anim')); });
  assert.equal((await talkSnap(pg)).npcIv, 1, '立ち絵アニメの interval は1つ');
  await H.finishTalk(pg);
  await assertTalkGone(pg, keydown0, '5回目（アニメ）');
  assert.deepEqual(await pg.evaluate(() => window.__r), ['raiseFirst', 'done', 'intro', 'raiseAgain', 'anim'], 'どの会話も終わりが通知される（途中で閉じた会話も）');
  await quiet(pg);
  const c5 = await cdp(pg);
  assert.ok(c5.nodes <= c0.nodes + 40, `会話ウィンドウが DOM に残っていない：${c0.nodes} → ${c5.nodes}`);
  assert.ok(c5.listeners <= c0.listeners + 2, `イベントリスナーが残っていない：${c0.listeners} → ${c5.listeners}`);
  const s = await snap(pg);
  assert.ok(s.iv.every((x) => x.startsWith('index:')) && s.iv.length <= 1, '残る interval は BGM だけ：' + s.iv);
  assert.equal(await pg.evaluate(() => !!document.querySelector('.hz[onclick="market()"]')), true, '街の画面はそのまま');
  noErrors(p);
});

B('QA-TN4：立ち絵アニメ：wave／wave_blink の行では npc.js の interval が1つでコマが切り替わり、静止画の行で止まり、閉じると0。全身の指定は上半身で代わりに表示', async () => {
  const p = await openTown({ size: H.SIZES.base });
  const pg = p.page;
  const frames = await pg.evaluate(() => { const a = MMNPC.get('fina').anims.closeup; return { wave: a.wave.frames, blink: a.wave_blink.frames }; });
  assert.equal(frames.wave.length, 6); assert.equal(frames.blink.length, 6);
  const keydown0 = (await talkSnap(pg)).keydown;
  await pg.evaluate(([a, b]) => { MMNPC.talk([{ npc: 'fina', anim: 'wave', text: a }, { anim: 'wave_blink', text: b }, { text: a }, { view: 'fullbody', expression: 'happy', text: b }]); }, [LONG, LONG2]);
  await waitSel(pg, '.mmtalk');
  /** 画像の src を一定時間集める */
  const sample = (ms) => pg.evaluate((ms) => new Promise((ok) => { const seen = new Set(), img = document.querySelector('.mmtalk-fig img'), t0 = performance.now(); (function f() { seen.add(img.getAttribute('src')); if (performance.now() - t0 < ms) requestAnimationFrame(f); else ok([...seen]); })(); }), ms);
  const advance = async (idx) => { for (let i = 0; i < 6 && (await pg.evaluate(() => MMNPC.state() && MMNPC.state().idx)) < idx; i++) { await pg.click('.mmtalk', { force: true }); await pg.waitForTimeout(120); } assert.equal((await talkSnap(pg)).state.idx, idx); };
  let t = await talkSnap(pg);
  assert.deepEqual([t.state.idx, t.state.anim, t.npcIv, t.anim], [0, 'wave', 1, true], '1行目：wave・interval 1つ');
  let seen = await sample(900);
  assert.ok(seen.length >= 3 && seen.every((s) => frames.wave.includes(s)), 'wave のコマが切り替わる：' + seen);
  await pg.waitForTimeout(150);
  await advance(1);
  t = await talkSnap(pg);
  assert.deepEqual([t.state.anim, t.npcIv, t.anim], ['wave_blink', 1, true], '2行目：wave_blink・interval は1つのまま（前の行の interval は止まる）');
  seen = await sample(900);
  assert.ok(seen.length >= 3 && seen.every((s) => frames.blink.includes(s)), 'wave_blink のコマが切り替わる：' + seen);
  await advance(2);
  t = await talkSnap(pg);
  assert.deepEqual([t.state.anim, t.npcIv, t.anim, t.img], [null, 0, false, 'assets/npc/fina/closeup/normal.png'], '3行目：静止画・interval なし');
  await advance(3);
  t = await talkSnap(pg);
  assert.deepEqual([t.fig, t.img, t.state.fallback, t.npcIv], ['mmtalk-fig closeup', 'assets/npc/fina/closeup/happy.png', true, 0], '全身（未着）の指定は上半身で代わりに表示');
  await pg.evaluate(() => MMNPC.close());
  await assertTalkGone(pg, keydown0, '閉じた後');
  noErrors(p);
});

B('QA-TN5：会話中に次の会話を開くと、前の会話は終わり（Promise が解決）、ウィンドウは1つで、表示は新しい会話の文だけ', async () => {
  const p = await openTown({ size: H.SIZES.base });
  const pg = p.page;
  await quiet(pg);
  const keydown0 = (await talkSnap(pg)).keydown;
  const B2 = 'あたらしい会話です。前の会話の文字は、ここには決して混ざりません。最後まで確認してください。';
  await pg.evaluate((a) => { window.__a = 0; window.__b = 0; MMNPC.talk([{ npc: 'fina', text: a }, { text: a }]).then(() => { window.__a++; }); }, LONG);
  await pg.waitForTimeout(120);
  const samples = await pg.evaluate((b) => new Promise((ok) => {
    MMNPC.talk([{ npc: 'fina', expression: 'smile', text: b }]).then(() => { window.__b++; });
    const out = [], t0 = performance.now();
    const id = setInterval(() => { const ov = document.querySelectorAll('.mmtalk'); out.push([ov.length, ov[0] ? ov[0].querySelector('.mmtalk-text').textContent : null]); if (performance.now() - t0 > 700) { clearInterval(id); ok(out); } }, 60);
  }), B2);
  assert.equal(await pg.evaluate(() => window.__a), 1, '前の会話は終わった');
  assert.ok(samples.length >= 5);
  for (const [n, tx] of samples) { assert.equal(n, 1, 'ウィンドウは1つ'); assert.ok(B2.startsWith(tx), '新しい会話の文だけ：' + tx); }
  const t = await talkSnap(pg);
  assert.deepEqual([t.n, t.npcTo <= 1, t.keydown], [1, true, keydown0 + 1], '文字送りのタイマーは1つ・keydown リスナーも1つだけ');
  await H.finishTalk(pg);
  await assertTalkGone(pg, keydown0, '新しい会話の後');
  assert.deepEqual(await pg.evaluate(() => [window.__a, window.__b]), [1, 1]);
  noErrors(p);
});

// =========================================================
// 実ブラウザ：サイコロ演出の後始末・待機中の画面の負荷
// =========================================================
/** ボードで振れる状態（roll）になるまで、分かれ道は最初のルート・練習試合はやめておく、をゲームの関数で選ぶ */
async function toRollPhase(pg) {
  for (let i = 0; i < 6; i++) {
    const ph = await pg.evaluate(() => MMP8.boardPhase(S.m));
    if (ph === 'roll') return;
    if (ph === 'branch') await pg.evaluate(() => bPickBranch(S.m.raise.pend.opts[0]));
    else if (ph === 'battle') await pg.evaluate(() => bBattleSkip());
    else throw new Error('振れない状態：' + ph);
    await pg.waitForFunction(() => !bBusy && !['move', 'resolve'].includes(MMP8.boardPhase(S.m)), null, { timeout: 15000 });
  }
  throw new Error('振れる状態にならない');
}

B('QA-TD5：サイコロ演出（Chapter 1 のボード・修行ボード）のあと、演出の要素が消え、処理中の印が戻り、タイマーが残らない。移動中に board() を3回描き直しても1回分しか進まない', async () => {
  const p = await openTown({ size: H.SIZES.base }, true, true);
  const pg = p.page;
  await pg.waitForTimeout(500);
  // 1) ボタンで振る
  await pg.click('#brollbtn');
  await pg.waitForFunction(() => !!document.querySelector('.p12dz') || !bBusy, null, { timeout: 5000 });
  await pg.waitForFunction(() => !bBusy && !document.querySelector('.p12dz') && !['move', 'resolve'].includes(MMP8.boardPhase(S.m)), null, { timeout: 20000 });
  await quiet(pg);
  let s = await snap(pg);
  let st = await pg.evaluate(() => ({ turns: S.m.raise.turnsUsed, busy: bBusy, dz: !!document.querySelector('.p12dz') }));
  assert.deepEqual(st, { turns: 1, busy: false, dz: false }, '1ターン使い、演出の要素・処理中の印が残っていない');
  assert.deepEqual([s.to, s.raf, s.ov, s.bodyKids], [[], 0, [], []], 'タイマー・rAF・演出の要素が残っていない');
  assert.ok(s.iv.every((x) => x.startsWith('index:')) && s.iv.length <= 1, '残る interval は BGM だけ：' + s.iv);
  // 2) 移動中に board() を3回描き直す（描き直しのたびに続きの処理が予約されるが、進むのは1回分だけ）
  await toRollPhase(pg);
  const r = await pg.evaluate(() => {
    const m = S.m, t0 = m.raise.turnsUsed;
    const roll = MMP8.roll(S, m); save();
    // 振った直後の写しの上で、移動だけを先に計算しておく（期待する到着地点）
    const c = JSON.parse(JSON.stringify(S));
    while (c.m.raise.pend && c.m.raise.pend.stage === 'move') MMP8.step(c, c.m);
    board(); board(); board();
    return { t0, value: roll.value, expect: c.m.raise.node };
  });
  await pg.waitForFunction(() => !bBusy && !['move', 'resolve'].includes(MMP8.boardPhase(S.m)), null, { timeout: 20000 });
  await quiet(pg);
  st = await pg.evaluate(() => ({ turns: S.m.raise.turnsUsed, node: S.m.raise.node, stage: S.m.raise.pend && S.m.raise.pend.stage }));
  assert.equal(st.turns, r.t0 + 1, 'ターンは1つだけ進む');
  assert.equal(st.node, r.expect, `出目 ${r.value} の分だけ進んだ地点で止まる（二重に進まない）`);
  assert.notEqual(st.stage, 'move');
  s = await snap(pg);
  assert.deepEqual([s.to, s.raf], [[], 0], '続きの処理のタイマーが残っていない');
  // 3) 修行ボード：ゴールまで進めて辞退 → Chapter間ファーム → 修行（チケットで開始）→ ボタンで振る
  await pg.evaluate(() => {
    const m = S.m, trk = MMP8.trackOf(m.raise.ch);
    Object.assign(m.raise, { node: trk.goal, goal: true, pend: null }); MMP8.declineTournament(S, m); S.trainTix = 3; save(); hall('s');
  });
  await waitSel(pg, `[onclick="trStart('po')"]`);
  await pg.waitForTimeout(550);   // 画面が出た直後の押下を無視する作りでも押せるよう待つ
  await pg.click(`[onclick="trStart('po')"]`);
  await waitSel(pg, '#p7roll');
  await pg.waitForTimeout(550);
  await pg.click('#p7roll');
  await pg.waitForFunction(() => !p7Busy && !document.querySelector('.p12dz') && !!document.getElementById('p7roll'), null, { timeout: 20000 });
  await quiet(pg);
  st = await pg.evaluate(() => ({ busy: p7Busy, pos: MMP7.trainRunOf(S.m) && MMP7.trainRunOf(S.m).pos, roll: MMP7.trainRunOf(S.m) && MMP7.trainRunOf(S.m).roll, tix: S.trainTix }));
  assert.equal(st.busy, false); assert.ok(st.pos >= 1 && st.pos <= 3, '出目の分だけ進んだ：' + st.pos);
  assert.equal(st.roll, undefined, '使い終えた出目は残らない（二重に進まない）'); assert.equal(st.tix, 2, 'チケットは1枚だけ使う');
  s = await snap(pg);
  assert.deepEqual([s.to, s.raf, s.ov, s.bodyKids], [[], 0, [], []], '修行のサイコロの後も何も残らない');
  noErrors(p);
});

B('QA-TP1：待機中の画面（開始画面・市場・博物館・ファーム・Chapter 1／2 のボード・Chapter間ファーム）は、何もしていない間にレイアウトとスタイル計算を繰り返さない', async () => {
  // 音はオフ（BGM のタイマーを止めて、画面そのものの負荷だけを見る）。街・牧場は歩くモンスターの演出で毎フレームのレイアウトがある既知の課題のため除く
  const p = await openPage({ size: H.SIZES.base, raw: { mr4a: '0' } });
  const pg = p.page;
  await pg.evaluate(TWO, false);
  const c = await pg.context().newCDPSession(pg);
  await c.send('Performance.enable');
  const metric = async () => { const m = (await c.send('Performance.getMetrics')).metrics; const g = (n) => m.find((x) => x.name === n).value; return { layout: g('LayoutCount'), style: g('RecalcStyleCount') }; };
  const idle = async (name, code) => {
    await pg.evaluate(code);
    await pg.waitForFunction(() => [...document.images].every((i) => i.complete) && (typeof P10_ANIM === 'undefined' || !P10_ANIM), null, { timeout: 10000 });
    await pg.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));
    await pg.waitForTimeout(450);   // 画面の出だしの演出（約0.3秒）と、描画直後の押下を少しの間だけ無視する作りの待ち時間が過ぎてから測る
    const a = await metric();
    await pg.waitForTimeout(500);   // 毎フレームのレイアウトがあれば、この間に30回ほど数えられる
    const b = await metric();
    return [name, b.layout - a.layout, b.style - a.style];
  };
  const out = [];
  out.push(await idle('開始画面', () => title()));
  out.push(await idle('市場', () => market(null, 'solamo')));
  out.push(await idle('博物館', () => museum()));
  out.push(await idle('ファーム（未育成）', () => hall('t')));
  out.push(await idle('Chapter 1 ボード', () => { MMP8.depart(S, S.m); save(); board(); }));
  out.push(await idle('Chapter間ファーム', () => { const m = S.m, trk = MMP8.trackOf(1); Object.assign(m.raise, { node: trk.goal, goal: true, pend: null }); MMP8.declineTournament(S, m); save(); hall('t'); }));
  out.push(await idle('Chapter 2 ボード', () => { MMP8.depart(S, S.m); save(); board(); }));
  await c.detach().catch(() => {});
  assert.equal(await pg.evaluate(() => S.m.raise.ch), 2, 'Chapter 2 まで進んでいる');
  assert.deepEqual(out.filter((x) => x[1] !== 0 || x[2] !== 0), [], '待機中にレイアウト／スタイル計算が起きた画面 [名前, レイアウト回数, スタイル計算回数]');
  noErrors(p);
});
