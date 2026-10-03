// 公開URL（GitHub Pages）の確認。main へ push した後に実行する。
//   node tools/public-check.mjs [スクリーンショットの保存先]
// 1) 公開された index.html が、いまの HEAD の index.html と同じになるまで待つ（最大15分）
// 2) Playwright＋Chromium で 390×844 の通しの流れ（開始→名前→フィナ→街→市場で購入→牧場→通知→ファーム→育成開始の選択肢）を確認
// 3) 375×667・360×800・430×932 で牧場とファームの横はみ出しを確認
// 4xx/5xx 応答（Google Fonts は除く）と pageerror も記録する。NG が1つでもあれば終了コード 1。
// リポジトリのファイルは変更しない。スクリーンショットはリポジトリの外（既定は OS の一時ディレクトリ）に置く。
// ブラウザの通信は Node の fetch で取り直して渡す（プロキシの証明書をブラウザが信頼しない環境でも、TLS の検証を切らずに確認するため）。
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const URL = process.env.MM_PUBLIC_URL || 'https://shunyamita0804-source.github.io/mystic-monsters/';
const OUT = process.argv[2] || path.join(os.tmpdir(), 'mm-public-check');
const WAIT_MS = 15 * 60 * 1000;
mkdirSync(OUT, { recursive: true });

const require = createRequire(import.meta.url);
function loadPlaywright() {
  try { return require('playwright'); } catch (e) {}
  return require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
}
const { chromium } = loadPlaywright();

const R = []; const bad = []; const errs = [];
const rec = (k, ok, d = '') => R.push({ k, ok, d });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (b) => createHash('sha256').update(b).digest('hex');

// 1) 公開の反映待ち
const head = execSync('git rev-parse --short HEAD').toString().trim();
const want = sha(execSync('git show HEAD:index.html', { maxBuffer: 64 * 1024 * 1024 }));
let got = '', t0 = Date.now();
for (;;) {
  try {
    const r = await fetch(URL + 'index.html?cb=' + Date.now(), { headers: { 'cache-control': 'no-cache' } });
    got = r.ok ? sha(Buffer.from(await r.arrayBuffer())) : 'HTTP ' + r.status;
  } catch (e) { got = String(e); }
  if (got === want || Date.now() - t0 > WAIT_MS) break;
  await sleep(20000);
}
rec(`公開版の index.html が HEAD（${head}）と同じ`, got === want, got === want ? `${Math.round((Date.now() - t0) / 1000)}秒で一致` : `15分待っても不一致（${got.slice(0, 16)}）`);

// 2) 画面の確認
let exe;
for (const p of ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome']) if (existsSync(p) && !exe) exe = p;
const browser = await chromium.launch(exe ? { executablePath: exe } : {}).catch(() => chromium.launch());
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const host = new globalThis.URL(URL).origin;
await ctx.route('**/*', async (route) => {
  const req = route.request(); const u = req.url();
  if (!u.startsWith(host)) return /fonts\.(googleapis|gstatic)/.test(u) ? route.abort() : route.continue();
  try {
    const h = { ...req.headers() }; delete h['accept-encoding'];
    const r = await fetch(u, { method: req.method(), headers: h, redirect: 'manual' });
    const body = Buffer.from(await r.arrayBuffer());
    const hd = {}; r.headers.forEach((v, k) => { if (!['content-encoding', 'content-length', 'transfer-encoding'].includes(k)) hd[k] = v; });
    await route.fulfill({ status: r.status, headers: hd, body });
  } catch (e) { errs.push('取得失敗 ' + u + ' ' + e + (e && e.cause ? ' cause=' + (e.cause.code || '') + ' ' + String(e.cause.message || e.cause).slice(0, 160) : '') + ' type=' + req.resourceType()); await route.abort(); }   // 原因（通信・プロキシ・コード）を切り分けられるよう、cause とリソースの種類も記録
});
const page = await ctx.newPage();
page.on('response', (r) => { if (r.status() >= 400 && !/fonts\.(googleapis|gstatic)/.test(r.url())) bad.push(`${r.status()} ${r.url().slice(0, 150)}`); });
page.on('pageerror', (e) => errs.push(('pageerror ' + String(e) + ' | stack: ' + String(e && e.stack || '')).slice(0, 700)));

// 会話（.mmtalk）を送る。選択肢が出たら 'choice'、閉じたら 'none'
async function drain(max = 40) {
  for (let i = 0; i < max; i++) {
    const st = await page.evaluate(() => !document.querySelector('.mmtalk') ? 'none' : document.querySelector('.mmtalk-choice') ? 'choice' : 'open');
    if (st !== 'open') return st;
    await page.click('.mmtalk', { force: true }).catch(() => {});
    await sleep(250);
  }
  return 'timeout';
}

try {
  await page.goto(URL, { waitUntil: 'load', timeout: 120000 });
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.reload({ waitUntil: 'load', timeout: 120000 });
  await sleep(1500);

  await page.click('[onclick*="startGame"]'); await sleep(600);
  // 2026-10-03：新しいゲームの最初はプロローグ A〜E（背景5枚が読めること・スキップの2度押しで名前登録へ）
  const pro = await page.waitForFunction(() => { const b = document.querySelector('.mmpro .mmpro-bg.on'); return b && /prologue_a\.webp/.test(b.style.backgroundImage); }, null, { timeout: 20000 }).then(() => true, () => false);
  const proImgs = await page.evaluate(() => Promise.all(['a', 'b', 'c', 'd', 'e'].map((k) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i.naturalWidth > 0); i.onerror = () => ok(false); i.src = `assets/prologue/prologue_${k}.webp`; })))).then((a) => a.every(Boolean));
  await page.screenshot({ path: `${OUT}/prologue_a_390.png` });
  if (pro) { await sleep(500); await page.click('.mmpro-skip'); await sleep(500); await page.click('.mmpro-skip'); }
  await page.waitForSelector('#p11nm', { timeout: 20000 });
  rec('プロローグ A（背景5枚が読める・スキップで聖獣士登録へ）', pro && proImgs, `表示:${pro} 背景:${proImgs}`);
  await page.fill('#p11nm', 'テスト');
  await page.click('[onclick*="p11NameGo"]'); await sleep(800);
  const d1 = await drain(); await sleep(600);
  const town = await page.evaluate(() => !!document.querySelector('[onclick*="market()"]'));
  rec('開始→名前→フィナ→街', d1 === 'none' && town, `会話:${d1} 街:${town}`);
  await page.screenshot({ path: `${OUT}/town_390.png` });

  await page.evaluate(() => market()); await sleep(1000);
  const d2 = await drain(); await sleep(500);
  await page.evaluate(() => p10Detail(true)); await sleep(700);
  await page.click('#p10info .p10buy'); await sleep(500);
  await page.fill('#p10ov #mnm', 'ソラ'); await sleep(600);
  await page.click('.p10ok'); await sleep(1000);
  const d3 = await drain(); await sleep(800);
  const bought = await page.evaluate(() => ({ m: !!S.m, name: S.m && S.m.name }));
  rec('市場で購入→街', d2 === 'none' && d3 === 'none' && bought.m, JSON.stringify(bought));

  await page.evaluate(() => farm()); await sleep(1200);
  const f = await page.evaluate(() => {
    const b = document.querySelector('.rnnick .tx'); const img = document.querySelector('.rnnick .nstf');   // 2026-10-03：ニックは半身の立ち絵＋会話窓
    return { cls: b && b.className, name: b && b.querySelector('b') && b.querySelector('b').textContent,
      src: img && img.getAttribute('src'), nw: img && img.naturalWidth, dan: document.body.innerText.includes('ダン') };
  });
  rec('牧場：ニックの立ち絵と一言（画像が読める・「ダン」なし）', f.cls === 'tx fnick' && f.name === 'ニック' && /assets\/npc\/nick\/closeup\/smile\.webp/.test(f.src || '') && f.nw > 0 && !f.dan, JSON.stringify(f));
  await page.screenshot({ path: `${OUT}/ranch_390.png` });

  await page.evaluate(() => { farm('', 'a'); dep(); }); await sleep(800);
  const n = await page.evaluate(() => { const b = document.querySelector('.fbub'); return { cls: b && b.className, text: b && b.textContent, img: !!(b && b.querySelector('img')), b: !!(b && b.querySelector('b')) }; });
  rec('牧場：預けたときの通知（顔・名前なし）', n.cls === 'fbub sys' && /預けました/.test(n.text) && !n.img && !n.b, JSON.stringify(n));
  await page.evaluate(() => { farm('', 'b'); wd(0); }); await sleep(800);
  rec('牧場：受け取り', await page.evaluate(() => !!S.m));

  await page.evaluate(() => hall('t')); await sleep(1200);
  const h = await page.evaluate(() => { const b = document.querySelector('.kdan b'); const i = document.querySelector('.kav img'); return { name: b && b.textContent, src: i && i.getAttribute('src'), nw: i && i.naturalWidth }; });
  rec('ファーム：ダン（顔が読める）', h.name === 'ダン' && /assets\/npc\/dan\/face\.webp/.test(h.src || '') && h.nw > 0, JSON.stringify(h));
  await page.screenshot({ path: `${OUT}/hall_390.png` });

  await page.evaluate(() => prepScr()); await sleep(1000);
  await page.click('button[onclick="p7Depart(this)"]'); await sleep(800);
  const d4 = await drain(); await sleep(600);
  const c = await page.evaluate(() => ({ ch: [...document.querySelectorAll('.mmtalk-choice')].map((x) => x.textContent.trim()),
    next: (() => { const x = document.querySelector('.mmtalk-next'); if (!x) return false; const s = getComputedStyle(x); return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0'; })() }));
  await page.screenshot({ path: `${OUT}/depart_choice_390.png` });
  rec('育成開始：選択肢「始める／まだやめておく」（▼なし）', d4 === 'choice' && c.ch.length === 2 && c.ch.includes('始める') && c.ch.includes('まだやめておく') && !c.next, JSON.stringify({ d4, ...c }));
  await sleep(500);
  for (const el of await page.$$('.mmtalk-choice')) if ((await el.textContent()).includes('まだやめておく')) { await el.click(); break; }
  await sleep(1000);
  const aft = await page.evaluate(() => ({ talk: !!document.querySelector('.mmtalk'), state: S.m && S.m.raise && S.m.raise.state }));
  rec('「まだやめておく」で育成が始まらない', !aft.talk && aft.state === 'none', JSON.stringify(aft));

  // 3) ほかの画面サイズでの横はみ出し
  for (const [w, hh] of [[375, 667], [360, 800], [430, 932]]) {
    await page.setViewportSize({ width: w, height: hh }); await sleep(300);
    for (const [nm, fn] of [['ranch', () => farm()], ['hall', () => hall('t')]]) {
      await page.evaluate(fn); await sleep(900);
      const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
      rec(`${w}×${hh} ${nm === 'ranch' ? '牧場' : 'ファーム'}：横はみ出しなし`, o.sw <= o.iw, JSON.stringify(o));
      await page.screenshot({ path: `${OUT}/${nm}_${w}x${hh}.png` });
    }
  }
} catch (e) {
  rec('確認の途中で例外', false, String(e).slice(0, 400));
  await page.screenshot({ path: `${OUT}/error.png` }).catch(() => {});
}
await browser.close();

rec('4xx/5xx 応答なし', bad.length === 0, bad.join(' / '));
rec('pageerror なし', errs.length === 0, errs.join(' / '));
for (const x of R) console.log(`${x.ok ? 'OK' : 'NG'} | ${x.k}${x.d ? ' | ' + x.d : ''}`);
console.log(`スクリーンショット：${OUT}`);
process.exit(R.every((x) => x.ok) ? 0 : 1);
