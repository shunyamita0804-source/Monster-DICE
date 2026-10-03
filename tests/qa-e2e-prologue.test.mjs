// =========================================================
// QA（実ブラウザ）：プロローグ A〜E（js/prologue/prologue.js。2026-10-03 に A・B の正式画像を受け取り5枚そろった）
//  ・新しいゲームの開始 → プロローグ（A→B→C→D→E の順に背景・ナレーション）→ 聖獣士登録（名前登録）
//  ・タップ：表示中のページを全部出す → もう一度で次へ。文字は画面に収まる（390×844・375×667）
//  ・スキップは2度押し。見たあとは再読み込みしても出ない
//  Playwright / Chromium が無い環境では省略（skip）する。
// =========================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as H from './e2e/harness.mjs';

const SKIP = H.skipReason();
let L = null;
test.before(async () => { if (!SKIP) L = await H.launch(); });
test.after(async () => { if (L) await L.close(); });
const OPEN = [];
const openPage = async (o) => { const p = await L.open(o); OPEN.push(p); return p; };
test.afterEach(async () => { for (const p of OPEN.splice(0)) await p.ctx.close().catch(() => {}); });
const T = (name, fn) => test(name, { skip: SKIP }, fn);
const SHOT = path.join(os.tmpdir(), 'mm-prologue');

/** 今のページの様子（背景・文章・文字の位置） */
const state = (pg) => pg.evaluate(() => {
  const ov = document.querySelector('.mmpro'); if (!ov) return null;
  const bg = ov.querySelector('.mmpro-bg.on'), ps = [...ov.querySelectorAll('.mmpro-nar p')];
  const on = ps.filter((p) => p.classList.contains('on'));
  const rs = on.filter((p) => !p.classList.contains('sp')).map((p) => p.getBoundingClientRect());
  return {
    bg: bg ? (/prologue_(\w)\.webp/.exec(bg.style.backgroundImage) || [])[1] : null,
    text: ps.map((p) => p.textContent).join('').replace(/ /g, ''), all: on.length === ps.length, n: ps.length,
    top: rs.length ? Math.min(...rs.map((r) => r.top)) : null, bottom: rs.length ? Math.max(...rs.map((r) => r.bottom)) : null,
    left: rs.length ? Math.min(...rs.map((r) => r.left)) : null, right: rs.length ? Math.max(...rs.map((r) => r.right)) : null,
    W: innerWidth, H: innerHeight, sw: document.documentElement.scrollWidth,
  };
});

for (const size of [[390, 844], [375, 667]]) {
  T(`PRO-B1（${size.join('×')}）：新しいゲーム → プロローグ A→B→C→D→E（タップで全文 → 次へ・文字は画面に収まる）→ 聖獣士登録。再読み込みでは出ない`, async () => {
    const p = await openPage({ size, prologue: true }); const pg = p.page;
    mkdirSync(SHOT, { recursive: true });
    await pg.click('.p15start');
    await pg.waitForSelector('.mmpro .mmpro-nar p.on', { timeout: 20000 });
    const seen = [], shot = new Set();
    for (let i = 0; i < 20; i++) {
      await pg.waitForTimeout(520);
      const s0 = await state(pg); if (!s0) break;
      await pg.mouse.click(size[0] / 2, size[1] * 0.4);   // 1回目：今のページを全部出す
      await pg.waitForTimeout(1100);   // 最後の行が浮かび上がり終わるまで
      const s = await state(pg); if (!s) break;
      assert.ok(s.all, `${s.bg}：タップで全文が出る`);
      seen.push({ bg: s.bg, text: s.text });
      assert.ok(s.sw <= s.W + 1, '横にはみ出さない');
      assert.ok(s.top >= 40 && s.bottom <= s.H - 20 && s.left >= 0 && s.right <= s.W, `${s.bg}「${s.text.slice(0, 12)}」の文字が画面に収まる ${JSON.stringify([s.top, s.bottom, s.left, s.right])}`);
      if (!shot.has(s.bg)) { shot.add(s.bg); await pg.screenshot({ path: path.join(SHOT, `${size[0]}_${s.bg}.png`) }); }
      await pg.mouse.click(size[0] / 2, size[1] * 0.4);   // 2回目：次へ
      await pg.waitForFunction((t) => { const ov = document.querySelector('.mmpro'); if (!ov) return true; const x = [...ov.querySelectorAll('.mmpro-nar p')].map((p) => p.textContent).join('').replace(/ /g, ''); return x !== t && !!ov.querySelector('.mmpro-nar p.on'); }, s.text, { timeout: 15000 });
    }
    const order = seen.map((x) => x.bg).filter((b, i, a) => a[i - 1] !== b);
    assert.deepEqual(order, ['a', 'b', 'c', 'd', 'e'], '背景は A→B→C→D→E の順');
    assert.equal(seen.length, 10, 'A 3・B 3・C 1・D 1・E 2 ページ');
    assert.match(seen[0].text, /『聖獣』がいる。/); assert.match(seen[3].text, /五年前。/); assert.match(seen[4].text, /三人と三体は力を合わせ/); assert.match(seen[9].text, /ここから始まる。$/);
    await pg.waitForSelector('#p11nm', { timeout: 20000 });
    assert.equal(await pg.evaluate(() => !!document.querySelector('.mmpro')), false, 'プロローグは閉じている');
    assert.equal((await H.storedSave(pg)).npcFlags.prologue, 1, '見た記録を保存');
    await pg.reload(); await pg.waitForFunction(() => typeof window.MMP8 === 'object');
    await pg.click('.p15start');
    await pg.waitForSelector('#p11nm', { timeout: 20000 });
    assert.equal(await pg.evaluate(() => !!document.querySelector('.mmpro')), false, '再読み込みでは出ない');
    assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
  });
}

T('PRO-B2：スキップは2度押し（1回目は「もう一度でスキップ」）→ 聖獣士登録', async () => {
  const p = await openPage({ prologue: true }); const pg = p.page;
  await pg.click('.p15start');
  await pg.waitForSelector('.mmpro .mmpro-skip');
  await pg.waitForTimeout(400);
  await pg.click('.mmpro-skip');
  assert.equal(await pg.textContent('.mmpro-skip'), 'もう一度でスキップ');
  assert.ok(await pg.$('.mmpro'), '1回目では閉じない');
  await pg.waitForTimeout(450);
  await pg.click('.mmpro-skip');
  await pg.waitForSelector('#p11nm', { timeout: 20000 });
  assert.equal(await pg.evaluate(() => !!document.querySelector('.mmpro')), false);
  assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
});
