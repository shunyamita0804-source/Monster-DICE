// =========================================================
// QA（実ブラウザ）：第二段階 PHASE C（2026-10-04）：研究所（図鑑・合体・配合表）と出発準備
//  LP-B1：研究所 → 図鑑（2列・近日公開）→ 詳細（ゲージ）→ 配合表 → 合体。390×844・375×667 で横にはみ出さず、ページは伸びない
//  LP-B2：出発準備：5スロット・保管庫のシート・Chapter のカード・「出発する」→ フィナの確認（従来の出発）
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
const SHOT = path.join(os.tmpdir(), 'mm-lab-prep');
const fit = (pg) => pg.evaluate(() => ({ sw: document.documentElement.scrollWidth, W: innerWidth, sh: document.scrollingElement.scrollHeight, H: innerHeight, app: document.querySelector('#app').scrollHeight, appH: document.querySelector('#app').clientHeight }));

for (const size of [H.SIZES.base, H.SIZES.se]) {
  test(`LP-B1（${size.join('×')}）：研究所 → 図鑑（2列・No.・正式画像・ノビトンは近日公開）→ 詳細（999 を最大としたゲージ・成長適性）→ 配合表 → 合体（2体以上が必要）`, { skip: SKIP }, async () => {
    const p = await openPage({ size }); const pg = p.page; mkdirSync(SHOT, { recursive: true });
    await H.newGame(pg, 'テスト');
    await pg.evaluate(() => { const m = mk(0); MMP7.ensureProg(m); S.m = m; save(); lobby(); });
    await pg.click('.tpin[onclick="museum()"]'); await pg.waitForSelector('.lab .labnav');
    assert.deepEqual(await pg.evaluate(() => [...document.querySelectorAll('.labnav .labc b')].map((b) => b.textContent)), ['図鑑', '合体', '配合表']);
    assert.doesNotMatch(await pg.textContent('.lab'), /特殊復元|研究・記録・復元/);
    let f = await fit(pg); assert.ok(f.sw <= f.W + 1 && f.sh <= f.H + 1, `入口：はみ出さない ${JSON.stringify(f)}`);
    await pg.click('.labnav .labc:nth-child(1)'); await pg.waitForSelector('.lbk .lbgrid');
    const cards = await pg.evaluate(() => [...document.querySelectorAll('.lbgrid .lbc')].map((c) => ({ no: c.querySelector('.lbno').textContent, nm: c.querySelector('.lbnm').textContent, img: c.querySelector('img') ? c.querySelector('img').getAttribute('src') : null, lk: c.classList.contains('lk'), w: c.getBoundingClientRect().width, x: c.getBoundingClientRect().left })));
    assert.deepEqual(cards.map((c) => [c.no, c.nm, c.lk]), [['No.001', 'ソラモ', false], ['No.002', 'ガウル', false], ['No.003', 'ノビトン', true]]);
    assert.match(cards[0].img, /assets\/monsters\/solamo\.png$/); assert.match(cards[1].img, /assets\/monsters\/gauru\.png$/); assert.equal(cards[2].img, null);
    assert.ok(Math.abs(cards[0].w - cards[1].w) < 1 && cards[1].x > cards[0].x + cards[0].w - 1, '2列');
    assert.match(await pg.textContent('.labplq'), /発見 2 \/ 3/);
    f = await fit(pg); assert.ok(f.sw <= f.W + 1 && f.sh <= f.H + 1, `図鑑：ページは伸びない ${JSON.stringify(f)}`);
    await pg.screenshot({ path: path.join(SHOT, `${size[0]}_book.png`) });
    await pg.click('.lbgrid .lbc:nth-child(2)'); await pg.waitForSelector('.lbd .lbsts');
    const st = await pg.evaluate(() => [...document.querySelectorAll('.lbst')].map((r) => ({ k: r.querySelector('.lbsk').textContent, w: parseFloat(r.querySelector('.lbg i').style.width), v: +r.querySelector('b').textContent, g: r.querySelector('.lbgr').textContent })));
    assert.deepEqual(st.map((r) => [r.k, r.v, r.g]), [['ライフ', 80, 'D'], ['ちから', 110, 'B'], ['かしこさ', 110, 'B'], ['命中', 90, 'C'], ['回避', 90, 'B'], ['丈夫さ', 60, 'E']], 'ガウルの基礎能力と成長適性');
    for (const r of st) assert.equal(r.w, Math.round(r.v / 999 * 100), `${r.k}：ゲージは 999 を 100% とする`);
    assert.match(await pg.textContent('.lbd'), /鳥種/); assert.equal(await pg.evaluate(() => document.querySelectorAll('.lbd img.pcard').length), 0);
    await pg.screenshot({ path: path.join(SHOT, `${size[0]}_detail.png`) });
    await pg.click('.lbd .dback'); await pg.waitForSelector('.lbk');
    await pg.click('.labnav .labc:nth-child(3)'); await pg.waitForSelector('.lbt .lbtr');
    assert.deepEqual(await pg.evaluate(() => [...document.querySelectorAll('.lbtr')].map((r) => r.textContent.replace(/\s+/g, ''))), ['ソラモ×ソラモ→ソラモ', 'ソラモ×ガウル→ソラモ', 'ガウル×ソラモ→ガウル', 'ガウル×ガウル→ガウル']);
    await pg.click('.labnav .labc:nth-child(2)'); await pg.waitForSelector('.lbf .wpanel');
    assert.match(await pg.textContent('.lbf .wpanel'), /合体には2体以上必要です/);
    f = await fit(pg); assert.ok(f.sw <= f.W + 1 && f.sh <= f.H + 1);
    await pg.click('.lbf .dback'); await pg.waitForSelector('.lab .labnpc');
    assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
  });

  test(`LP-B2（${size.join('×')}）：出発準備：育成中モンスター・Chapter の札・バッグ5スロット・保管庫のシート・Chapter 1 のカード・「出発する」→ フィナの確認（従来の出発）`, { skip: SKIP }, async () => {
    const p = await openPage({ size }); const pg = p.page; mkdirSync(SHOT, { recursive: true });
    await H.newGame(pg, 'テスト');
    await pg.evaluate(() => { const m = mk(0); m.name = 'ソラ'; MMP7.ensureProg(m); S.m = m; S.inv.vault.push({ id: 'qa_item' }); save(); prepScr(); });
    await pg.waitForSelector('.pp .ppslots');
    const r = await pg.evaluate(() => ({ slots: document.querySelectorAll('.ppsl').length, on: document.querySelectorAll('.ppsl.on').length, name: document.querySelector('.ppname b').textContent, img: document.querySelector('.ppmon img').getAttribute('src'), ch: document.querySelector('.ppch').textContent.replace(/\s+/g, ''), card: document.querySelector('.ppcin').textContent.replace(/\s+/g, ''), art: getComputedStyle(document.querySelector('.ppart')).backgroundImage, go: document.querySelector('.ppgobtn').textContent.replace(/\s+/g, ''), goOn: !document.querySelector('.ppgobtn').disabled, sheet: document.querySelector('#ppvault').hidden }));
    assert.equal(r.slots, 5); assert.equal(r.on, 0); assert.equal(r.name, 'ソラ'); assert.match(r.img, /assets\/monsters\/solamo\.png$/);
    assert.match(r.ch, /CHAPTER1はじまりの草原/); assert.match(r.card, /^CHAPTER1はじまりの草原/); assert.match(r.art, /ch1_intro_overview\.webp/); assert.match(r.go, /^出発する/); assert.equal(r.goOn, true); assert.equal(r.sheet, true);
    let f = await fit(pg); assert.ok(f.sw <= f.W + 1 && f.sh <= f.H + 1, `はみ出さない ${JSON.stringify(f)}`);
    await pg.screenshot({ path: path.join(SHOT, `${size[0]}_prep.png`) });
    // 空きスロット → 保管庫のシート → バッグへ → スロットが埋まる → タップで保管庫へ戻す
    await pg.click('.ppsl:nth-child(1)'); await pg.waitForFunction(() => !document.querySelector('#ppvault').hidden);
    assert.match(await pg.textContent('#ppvault'), /qa_item/);
    await pg.click('#ppvault .p7it button'); await pg.waitForSelector('.ppsl.on');
    assert.deepEqual(await pg.evaluate(() => [S.inv.bag.length, S.inv.vault.length, document.querySelector('.ppsl.on b').textContent]), [1, 0, 'qa_item']);
    await pg.click('.ppsl.on'); await pg.waitForFunction(() => !document.querySelector('.ppsl.on'));
    assert.deepEqual(await pg.evaluate(() => [S.inv.bag.length, S.inv.vault.length]), [0, 1]);
    await pg.evaluate(() => { S.inv.vault = []; save(); prepScr(); }); await pg.waitForSelector('.pp .ppslots');
    await H.startRaising(pg); await pg.waitForSelector('#chf .chf-bg', { timeout: 20000 });
    assert.equal(await pg.evaluate(() => MMP7.raiseState(S.m)), 'board', '「出発する」から従来の出発（フィナの確認 → ボード）');
    assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
  });
}
