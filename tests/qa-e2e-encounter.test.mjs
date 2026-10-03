// =========================================================
// QA（実ブラウザ）：Chapter 1 の野生の遭遇の流れ（2026-10-03 夜の試遊フィードバック）
//  ・遭遇の演出（「野生のモンスターが現れた！」）の間、予兆の草むら（.chf-rustle）・「！」が残らない
//  ・フィナの一言には「タップで進む ▼」が出て、会話欄のタップでも START でも進む（START ではサイコロを振らない）→ バトルの案内
//  ・マスの外側の土台は、同じ奥行きなら種類が違っても同じ大きさ（390×844・375×667）
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
const SHOT = path.join(os.tmpdir(), 'mm-encounter');

async function start(pg) {
  await H.newGame(pg, 'テスト');
  await pg.evaluate(() => { const m = mk(0); m.name = 'ソラ'; MMP7.ensureProg(m); S.m = m; save(); MMP8.depart(S, m, () => 0.37); save(); board(); });
  await pg.waitForSelector('#chf .chf-bg');
  await pg.waitForTimeout(600);
  if (await pg.$('.chf-fina')) await pg.waitForFunction(() => !document.querySelector('.chf-fina'), null, { timeout: 8000 });   // 出発のフィナの一言（config.story）が自動で消えるまで
  await idle(pg);
}
const idle = (pg) => pg.waitForFunction(() => !bBusy && !MMCHD.isLocked() && !document.querySelector('.chpop,.chdz,.chf-enc,.chf-fina'), null, { timeout: 20000 }).then(() => pg.waitForTimeout(250));
/** 最初の野生のマスに「止まった直後」の状態を作る（結果の処理＝遭遇の演出から始まる） */
const toWild = (pg) => pg.evaluate(() => {
  const g = MMCH.graphFor(S.m), a = S.m.raise.field.nodeAssignments, id = g.order.find((x) => a[x] && a[x].t === 'battle' && a[x].bt === 'wild');
  const r = S.m.raise; r.node = id; r.pend = { roll: 1, left: 0, stage: 'resolve' }; save(); board(); return id;
});

for (const size of [H.SIZES.base, H.SIZES.se]) {
  for (const how of ['start', 'bubble']) {
    test(`ENC-B1（${size.join('×')}・${how === 'start' ? 'START で進む' : '会話欄のタップで進む'}）：野生の遭遇 → 草むらが残らない → フィナの一言に「タップで進む ▼」→ 進むとバトルの案内（サイコロは振らない）`, { skip: SKIP }, async () => {
      const p = await openPage({ size, story: true }); const pg = p.page;
      mkdirSync(SHOT, { recursive: true });
      await start(pg);
      const turns0 = await pg.evaluate(() => S.m.raise.turnsUsed);
      // 予兆（草むら・！）→ 遭遇の演出：演出の間、予兆の絵が残っていないかを毎フレーム見る
      await pg.evaluate(() => { window.__enc = { frames: 0, leftover: 0 }; const tick = () => { if (document.querySelector('.chf-enc')) { __enc.frames++; if (document.querySelector('.chf-rustle,.chf-alert')) __enc.leftover++; } if (!document.querySelector('.chbat') && __enc.n++ < 3000) requestAnimationFrame(tick); }; __enc.n = 0; requestAnimationFrame(tick); });
      await toWild(pg);
      await pg.waitForSelector('.chf-enc', { timeout: 15000 });
      await pg.waitForTimeout(500);
      if (how === 'start') await pg.screenshot({ path: path.join(SHOT, `${size[0]}_1_encounter.png`) });
      // フィナの一言
      await pg.waitForSelector('.chf-fina', { timeout: 15000 });
      const enc = await pg.evaluate(() => window.__enc);
      assert.ok(enc.frames > 10, `遭遇の演出を見た（${enc.frames} フレーム）`);
      assert.equal(enc.leftover, 0, '遭遇の演出の間、草むら・！が残っていない');
      assert.equal(await pg.evaluate(() => document.querySelectorAll('.chf-rustle,.chf-alert').length), 0);
      const r = await pg.evaluate(() => {
        const f = document.querySelector('.chf-fina'), go = f.querySelector('.chf-fina-go'), gr = go.getBoundingClientRect(), fr = f.getBoundingClientRect();
        const st = document.querySelector('#chdock .chstopw').getBoundingClientRect(), ov = document.querySelector('.chf-fina-st');
        const top = document.elementFromPoint(st.left + st.width / 2, st.top + st.height / 2);
        return { text: f.querySelector('span').textContent, go: go.textContent, goIn: gr.left >= fr.left && gr.right <= fr.right + 0.5 && gr.bottom <= fr.bottom + 0.5 && gr.top >= fr.top, vis: getComputedStyle(go).visibility, ov: !!ov, startHit: !!top && top.classList.contains('chf-fina-st'), sw: document.documentElement.scrollWidth, W: innerWidth };
      });
      assert.equal(r.text, '野生のモンスターだ！ 気をつけて！');
      assert.equal(r.go, 'タップで進む▼', '進み方の案内');
      assert.ok(r.goIn && r.vis === 'visible', '案内は会話欄の中に見える');
      assert.ok(r.ov && r.startHit, 'この会話の間だけ START の位置は「会話を進める」');
      assert.ok(r.sw <= r.W + 1, '横にはみ出さない');
      await pg.waitForTimeout(450);
      if (how === 'start') await pg.screenshot({ path: path.join(SHOT, `${size[0]}_2_fina.png`) });
      if (how === 'start') { const b = await pg.$('#chdock .chstopw'); const bb = await b.boundingBox(); await pg.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); }
      else await pg.click('.chf-fina');
      await pg.waitForFunction(() => !document.querySelector('.chf-fina'), null, { timeout: 2000 });
      await pg.waitForSelector('.chbat', { timeout: 15000 });
      assert.equal(await pg.evaluate(() => !!document.querySelector('.chf-fina-st')), false, '会話が終わったら START は元のまま');
      assert.equal(await pg.evaluate(() => S.m.raise.turnsUsed), turns0, 'START で会話を進めてもサイコロは振らない');
      if (how === 'start') await pg.screenshot({ path: path.join(SHOT, `${size[0]}_3_battle.png`) });
      assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
    });
  }

  test(`ENC-B2（${size.join('×')}）：マスの外側の土台は、同じ奥行きなら種類が違っても同じ大きさ（中の紋様だけが違う）。道の幅を越えない`, { skip: SKIP }, async () => {
    const p = await openPage({ size }); const pg = p.page;
    await start(pg);
    for (const id of ['p3_0', 'p9_0', 'p12_0']) {
      await pg.evaluate((id) => { const r = S.m.raise; r.node = id; r.pend = null; save(); board(); }, id);
      await pg.waitForSelector('#chf .chf-bg'); await idle(pg);
      const t = await pg.evaluate(() => {
        const g = MMCH.graphFor(S.m), f = MMCHV.state().field, sc = MMCH.getConfig(1).fieldScenes.find((s) => s.id === f);
        return [...document.querySelectorAll('#chf .chf-tile')].map((e) => { const n = g.nodes[e.dataset.id], b = e.querySelector('.chf-tbase'); return { id: e.dataset.id, type: e.dataset.type, d: n.d, w: parseFloat(e.style.width), base: !!b, op: Number(getComputedStyle(e).opacity), road: MMCHV.seenRoadW(sc, n) }; });
      });
      for (const x of t) {
        const want = Math.min(193 * Math.pow(x.d, 0.9), x.road * 0.62);
        assert.ok(Math.abs(x.w - want) < 0.2, `${x.id}（${x.type}）：外側の大きさは奥行きだけで決まる（${x.w} / ${want.toFixed(1)}）`);
        assert.ok(x.base, `${x.id}：共通の土台`); assert.ok(x.op >= 0.99 || x.op >= 0.67, `${x.id}：薄くしない（${x.op}）`);
      }
      await pg.screenshot({ path: path.join(SHOT, `${size[0]}_tiles_${id}.png`) });
    }
    assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
  });
}
