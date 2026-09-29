// =========================================================
// 市場の耐久テスト（試遊中に市場で一度アプリが落ちた件の調査用。原因は未特定）
//  出入り20回・左右切り替え50回・詳細の開閉30回・カレン案内20回・購入確認→やめる20回をくり返しても、
//  DOM要素数・画像要素数・window/document/body のイベント登録数・タイマー（setTimeout/setInterval/rAF）の残数が増えず、
//  JSエラー・操作不能が起きないことを確かめる。メモリ量はブラウザから正確に測れないため、ここでは上の指標で代わりに確かめる。
//  実ブラウザのテストは QA_E2E=1 のときだけ実行する（tests/e2e/harness.mjs）。
// =========================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import * as H from './e2e/harness.mjs';

const SKIP = H.skipReason();

test('ME-B1：市場の耐久：出入り20・切り替え50・詳細30・案内20・購入確認キャンセル20 で DOM・イベント・タイマーが増えない', { skip: SKIP, timeout: 600000 }, async () => {
  const L = await H.launch();
  try {
    const p = await L.open({ karen: true }); const pg = p.page;
    await H.newGame(pg, 'アルト'); await pg.evaluate(() => { S.g = 5000; save(); lobby(); });
    // window / document / body のイベント登録と、タイマーの残数を数える（読み込み後に差し替え）
    await pg.evaluate(() => {
      const C = window.__QA = { ev: 0, to: new Set(), iv: new Set(), raf: new Set() };
      const top = (t) => t === window || t === document || t === document.body;
      const add = EventTarget.prototype.addEventListener, rem = EventTarget.prototype.removeEventListener;
      EventTarget.prototype.addEventListener = function (ty, f, o) { if (top(this) && !(o && o.once)) C.ev++; return add.call(this, ty, f, o); };
      EventTarget.prototype.removeEventListener = function (ty, f, o) { if (top(this)) C.ev--; return rem.call(this, ty, f, o); };
      const st = setTimeout, ct = clearTimeout, si = setInterval, ci = clearInterval, ra = requestAnimationFrame, ca = cancelAnimationFrame;
      window.setTimeout = (f, ms, ...a) => { const id = st(() => { C.to.delete(id); if (typeof f === 'function') f(...a); }, ms); C.to.add(id); return id; };
      window.clearTimeout = (id) => { C.to.delete(id); ct(id); };
      window.setInterval = (f, ms, ...a) => { const id = si(f, ms, ...a); C.iv.add(id); return id; };
      window.clearInterval = (id) => { C.iv.delete(id); ci(id); };
      window.requestAnimationFrame = (f) => { const id = ra((t) => { C.raf.delete(id); f(t); }); C.raf.add(id); return id; };
      window.cancelAnimationFrame = (id) => { C.raf.delete(id); ca(id); };
    });
    const snap = () => pg.evaluate(() => ({ dom: document.getElementsByTagName('*').length, img: document.images.length, talk: document.querySelectorAll('.mmtalk').length,
      ov: document.querySelectorAll('#p10ov').length, ev: __QA.ev, iv: __QA.iv.size, raf: __QA.raf.size }));
    const idle = () => pg.waitForFunction(() => typeof P10_ANIM === 'undefined' || !P10_ANIM);
    const town0 = await snap();
    for (let i = 0; i < 20; i++) {
      await pg.click('.hz[onclick="market()"]'); await pg.waitForSelector('#p10car'); if (await pg.$('.mmtalk')) await H.finishTalk(pg); await idle();
      await pg.click('.p10back'); await pg.waitForSelector('.map.town');
    }
    const town1 = await snap();
    assert.deepEqual({ ...town1, iv: 0 }, { ...town0, iv: 0 }, '街→市場→街を20回：DOM・画像・イベントが増えない');
    assert.ok(town1.iv <= Math.max(1, town0.iv), 'くり返しのタイマーはBGMの1つだけ（増えない）');
    await pg.click('.hz[onclick="market()"]'); await pg.waitForSelector('#p10car'); if (await pg.$('.mmtalk')) await H.finishTalk(pg); await idle(); await pg.waitForTimeout(300);
    const m0 = await snap();
    for (let i = 0; i < 50; i++) { await pg.click(i % 3 ? '#p10car .p10arw.next' : '#p10car .p10arw.prev'); await idle(); }
    for (let i = 0; i < 30; i++) { await pg.click('#p10car .p10sl.on .p10plate'); await pg.waitForFunction(() => document.querySelector('.p10mk').classList.contains('det')); await pg.click('.p10detx'); await pg.waitForFunction(() => !document.querySelector('.p10mk').classList.contains('det')); }
    for (let i = 0; i < 20; i++) await pg.click('.p10karen');
    await pg.evaluate(() => p10Go(MMP10M.MARKET_CATALOG.findIndex((c) => c.key === 'solamo'))); await idle();
    for (let i = 0; i < 20; i++) {
      await H.marketDetail(pg); await pg.click('#p10info .p10buy'); await pg.waitForSelector('#p10ov .p10no'); await pg.waitForTimeout(400);
      await pg.click('#p10ov .p10no'); await pg.waitForFunction(() => !document.getElementById('p10ov')); await pg.evaluate(() => p10Detail(false));
    }
    await pg.waitForTimeout(400);
    const m1 = await snap();
    assert.deepEqual({ ...m1, iv: 0 }, { ...m0, iv: 0 }, '市場で切り替え・詳細・案内・購入確認キャンセルをくり返しても DOM・画像・イベントが増えない');
    assert.ok(m1.iv <= Math.max(1, m0.iv));
    const s = await H.getS(pg); assert.deepEqual([s.g, s.cnt || 0], [5000, 0], '購入確認をやめたので所持金・購入数は変わらない');
    // 最後に通常どおり操作できる
    const k0 = await pg.evaluate(() => P10_MK); await pg.click('#p10car .p10arw.next'); await idle();
    assert.equal(await pg.evaluate(() => P10_MK), (k0 + 1) % 3, '最後まで矢印で切り替えられる（操作不能になっていない）');
    assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
  } finally { await L.close(); }
});
