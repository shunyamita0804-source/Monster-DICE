// =========================================================
// 実ブラウザ（Chromium + Playwright）で index.html を動かすテストの共通部品
//  ・Playwright が見つからない環境では available() が false を返し、各テストは skip する（node --test の結果は失敗にしない）
//  ・リポジトリ直下を簡易HTTPサーバで配信する（ビルドなし・外部サービスなし）
//  ・外部フォント（Google Fonts）は通信を止めて空で返す（オフライン・証明書の都合で結果が変わらないように）
//  ・pageerror / console.error / 404 / 読み込み失敗を記録する
// =========================================================
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SAVE_KEY = 'mr4v6';
export const SIZES = { base: [390, 844], se: [375, 667], android: [360, 800], max: [430, 932] };

let PW;   // undefined: 未確認 / null: 無い / object: playwright
function loadPlaywright() {
  if (PW !== undefined) return PW;
  const tries = [() => createRequire(import.meta.url)('playwright')];
  if (process.env.PLAYWRIGHT_MODULE) tries.push(() => createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE));
  tries.push(() => createRequire(execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() + '/')('playwright'));
  for (const t of tries) { try { PW = t(); return PW; } catch (e) { /* 次へ */ } }
  PW = null; return PW;
}
/** 実ブラウザテストを実行できるか（Playwright と Chromium が使えるか） */
export function available() {
  const pw = loadPlaywright(); if (!pw) return false;
  try { return !!pw.chromium.executablePath(); } catch (e) { return false; }
}
// 実ブラウザテストは重いので、ふだんの node --test tests/*.test.mjs では省略する（速く・安定して回すため）。
// 実行するとき：QA_E2E=1 node --test --test-concurrency=1 tests/*.test.mjs （1ファイルずつ順番に。並列だと約9MBの読み込みが重なり時間計測が不安定になる）
export const skipReason = () => (process.env.QA_E2E !== '1' ? '実ブラウザテスト：QA_E2E=1 のときだけ実行'
  : available() ? false : 'Playwright / Chromium が無い環境のため実ブラウザテストを省略');

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.PNG': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.md': 'text/plain; charset=utf-8' };

/** リポジトリ直下を配信するサーバを起動する。{ url, close, requests } */
export async function serve() {
  const requests = [];
  const server = createServer(async (req, res) => {
    const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const f = path.join(ROOT, u === '/' ? 'index.html' : u);
    requests.push(u);
    if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    try {
      const s = await stat(f); if (!s.isFile()) throw new Error('not file');
      res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(await readFile(f));
    } catch (e) { res.writeHead(404); res.end('not found'); }
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const url = `http://127.0.0.1:${server.address().port}/`;
  return { url, requests, close: () => new Promise((ok) => server.close(ok)) };
}

/**
 * ブラウザとサーバを用意する。戻り値の open() でページを開く。最後に close() を呼ぶこと。
 *  open({ size, save, raw, clock }) … save：mr4v6 に入れるセーブ（オブジェクト）／raw：localStorage に入れる {キー: 文字列}
 */
export async function launch() {
  const pw = loadPlaywright();
  const srv = await serve();
  const browser = await pw.chromium.launch();
  const pages = [];
  async function open(opt = {}) {
    const [w, h] = opt.size || SIZES.base;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: !!opt.touch, isMobile: !!opt.touch });
    const errors = [], bad = [];
    await ctx.route(/^https?:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com)\//, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    const seed = {};
    if (opt.save) seed[SAVE_KEY] = JSON.stringify(opt.save);
    Object.assign(seed, opt.raw || {});
    if (Object.keys(seed).length) {
      await ctx.addInitScript((kv) => {
        // 最初の読み込みのときだけ入れる（再読み込みでは入れ直さない＝ゲームが保存した内容で再開する）
        try { if (!sessionStorage.getItem('__seeded')) { for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, v); sessionStorage.setItem('__seeded', '1'); } } catch (e) {}
      }, seed);
    }
    // 市場のカレンの会話（初回来店・購入成功）は、ふだんのテストでは出さない（市場・購入の操作を止めないため）。カレンのテストは open({ karen: true })
    if (!opt.karen) await ctx.addInitScript(() => { window.MM_QA_NO_KAREN = true; });
    const page = await ctx.newPage();
    // 全テストを並列で流すと、約9MBの index.html の読み込みが遅くなる。待ち時間は長めにとる（成功時の速さは変わらない）
    page.setDefaultTimeout(90000); page.setDefaultNavigationTimeout(120000);
    page.on('pageerror', (e) => errors.push(String(e && e.message || e)));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
    page.on('response', (r) => { if (r.status() >= 400 && r.url().startsWith(srv.url)) bad.push(r.status() + ' ' + r.url().slice(srv.url.length)); });
    page.on('requestfailed', (r) => { if (r.url().startsWith(srv.url)) bad.push('failed ' + r.url().slice(srv.url.length)); });
    await page.goto(srv.url + 'index.html' + (opt.query || ''));
    await page.waitForFunction(() => typeof window.MMP8 === 'object' && typeof S === 'object', null, { timeout: 120000 });
    const p = { page, ctx, errors, bad };
    pages.push(p);
    return p;
  }
  async function close() { for (const p of pages) { try { await p.ctx.close(); } catch (e) {} } await browser.close(); await srv.close(); }
  return { open, close, url: srv.url, requests: srv.requests };
}

/** ページ内のセーブ（S）のコピー */
export const getS = (page) => page.evaluate(() => JSON.parse(JSON.stringify(S)));
/** localStorage のセーブ（mr4v6）のコピー（無ければ null） */
export const storedSave = (page) => page.evaluate((k) => { const t = localStorage.getItem(k); return t == null ? null : JSON.parse(t); }, SAVE_KEY);
/** 画面の文字 */
export const text = (page) => page.evaluate(() => document.body.innerText);
/** 共通会話（MMNPC）が開いていれば最後まで送る（1文字表示中は全文→次へ、を繰り返す） */
export async function finishTalk(page, max = 60) {
  for (let i = 0; i < max; i++) {
    const open = await page.evaluate(() => !!document.querySelector('.mmtalk'));
    if (!open) return i;
    await page.click('.mmtalk', { force: true });
    await page.waitForTimeout(20);
  }
  throw new Error('会話が終わらない');
}
/** 開始画面から新しいゲームを始め、名前を登録して街まで進む（フィナの初回あいさつも送る） */
export async function newGame(page, name = 'テスト') {
  await page.click('.tpage [onclick*="startGame"], [onclick*="startGame"]');
  await page.waitForSelector('#p11nm', { timeout: 5000 });
  await page.fill('#p11nm', name);
  await page.click('[onclick*="p11NameGo"]');
  await page.waitForTimeout(100);
  await finishTalk(page);
}
