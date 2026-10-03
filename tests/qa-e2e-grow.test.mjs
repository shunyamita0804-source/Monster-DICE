// =========================================================
// 実ブラウザ：第二段階 PHASE E（2026-10-04）：能力UPの成長演出・疲れの増減・休憩の帯・宝箱の光（390×844）
//  GR-B1 能力マス／GR-B2 休憩（回復イベント）と疲れの増減／GR-B3 宝箱の光の粒
//  QA_E2E=1 のときだけ実行（tests/e2e/harness.mjs）
// =========================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import * as H from './e2e/harness.mjs';

const SKIP = H.skipReason();
let L, opened = [];
test.before(async () => { if (!SKIP) L = await H.launch(); });
test.after(async () => { if (L) await L.close(); });
async function open(opt = {}) { for (const q of opened) await q.ctx.close().catch(() => {}); const p = await L.open(opt); opened = [p]; return p; }
const idle = (pg) => pg.waitForFunction(() => !bBusy && !MMCHD.isLocked() && !document.querySelector('.chpop,.chdz,.chf-fina'), null, { timeout: 30000 }).then(() => pg.waitForTimeout(200));
async function toField(pg) {
  await H.newGame(pg, 'テスト');
  await pg.evaluate(() => { const m = mk(0); m.name = 'ソラ'; MMP7.ensureProg(m); S.m = m; save(); MMP8.depart(S, m, () => 0.37); save(); board(); });
  await pg.waitForSelector('#chf .chf-bg'); await idle(pg);
}
const place = (pg, node) => pg.evaluate((node) => { const r = S.m.raise, g = MMCH.graphFor(S.m); r.node = node; r.pend = null; r.field.fieldId = g.nodes[node].field; save(); board(); }, node);
async function rollAs(pg, v) { await pg.evaluate((v) => { window.__mr = Math.random; Math.random = () => ({ 1: 0.1, 2: 0.5, 3: 0.9 }[v]); }, v); await pg.click('#brollbtn'); await pg.evaluate(() => { Math.random = window.__mr; }); }
/** 配置から、種別名（rest・treasure…）のマスとその1つ手前のマスを探す */
const findTile = (pg, type) => pg.evaluate((type) => { const m = S.m, g = MMCH.graphFor(m); for (let i = 1; i < g.order.length; i++) { const id = g.order[i]; if (MMCH.nodeTypeName(MMCH.typeAt(m, id)) === type && (g.conn[g.order[i - 1]] || [])[0] === id) return [g.order[i - 1], id]; } return null; }, type);

test('GR-B1（390×844）：能力マス：アイコン（正式マスUI）が浮く →「ライフ +5」が +0 から上がる → 黄のゲージが 999 を最大とした目盛りで伸びる → 粒子。全体 0.6〜1.3秒。枠は frame_stat_up', { skip: SKIP }, async () => {
  const p = await open(); const pg = p.page; await toField(pg);
  await place(pg, 'p1_1'); await idle(pg);
  const li0 = await pg.evaluate(() => S.m.li);
  await pg.evaluate(() => { window.__g = []; const t = () => { const d = document.querySelector('.chpop:not(.out)'), r = d && d.querySelector('.chf-grow'), i = r && r.querySelector('.chf-gauge i'); window.__g.push(d ? { t: performance.now(), on: !!(r && r.classList.contains('on')), grown: !!(r && r.classList.contains('grown')), cnt: r ? r.querySelector('.cnt').textContent : '', w: i ? i.style.width : '', ic: r ? (r.querySelector('.chf-grow-ic img') || {}).getAttribute?.('src') || '' : '', c: r ? getComputedStyle(r).getPropertyValue('--c').trim() : '', frame: d.classList.contains('framed') } : null); if (window.__g.length < 1200) requestAnimationFrame(t); }; requestAnimationFrame(t); });
  await rollAs(pg, 1); await idle(pg);
  const G = (await pg.evaluate(() => window.__g)).filter(Boolean), li1 = await pg.evaluate(() => S.m.li);
  assert.equal(li1 - li0, 5); assert.ok(G.length > 5, '成長の枠が出た');
  const ms = G[G.length - 1].t - G[0].t; assert.ok(ms >= 600 && ms <= 1300, `全体 0.6〜1.3秒（${Math.round(ms)}ms）`);
  assert.ok(G.every((x) => x.frame), '枠は正式素材のまま'); assert.ok(G.some((x) => x.on), 'アイコンが浮く'); assert.ok(G.every((x) => /tile_stat_life\.webp$/.test(x.ic)), 'アイコンは正式マスUIのライフ');
  assert.equal(G[0].cnt, '+0'); assert.equal(G[G.length - 1].cnt, '+5'); assert.ok(new Set(G.map((x) => x.cnt)).size >= 3, 'カウントアップ');
  const pc = (v) => Math.round(Math.min(999, v) / 999 * 1000) / 10;
  assert.equal(G[0].w, `${pc(li0)}%`, 'ゲージは上がる前の値から'); assert.equal(G[G.length - 1].w, `${pc(li1)}%`, '上がった後の値へ（999 を最大）'); assert.ok(G.some((x) => x.grown), '粒子');
  assert.equal(G[0].c, '#f2c94c', 'ライフ＝黄');
  assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
});

test('GR-B2（390×844）：サイコロのあと疲れの増減（+3）がチップの脇に浮く。休憩のマス（回復）：青の帯＋「−N」の増減、チップの段階が合う', { skip: SKIP }, async () => {
  const p = await open(); const pg = p.page; await toField(pg);
  const t = await findTile(pg, 'rest'); assert.ok(t, '休憩のマスがある');
  await pg.evaluate(() => { S.m.raise.fatigue = 60; save(); }); await place(pg, t[0]); await idle(pg);
  await pg.evaluate(() => { window.__f = []; const o = new MutationObserver(() => { for (const e of document.querySelectorAll('#chf-ui .chf-fatfly,#chf-ui .chf-restveil')) if (!e.__seen) { e.__seen = 1; window.__f.push([e.className, e.textContent]); } }); o.observe(document.querySelector('#chf-ui'), { childList: true, subtree: true }); });
  await rollAs(pg, 1); await idle(pg);
  const F = await pg.evaluate(() => window.__f), fat = await pg.evaluate(() => [MMCH.fatigue(S.m), document.querySelector('#chfat').className, document.querySelector('#chfat b').textContent]);
  assert.deepEqual(F[0], ['chf-fatfly up', '+3'], 'サイコロ（出目1）＝疲れ +3');
  assert.ok(F.some((x) => x[0] === 'chf-restveil'), '休憩の青の帯'); assert.ok(F.some((x) => x[0] === 'chf-fatfly dn' && /^−\d+$/.test(x[1])), '疲れの回復「−N」');
  assert.ok(fat[0] < 63, '疲れが減った'); assert.equal(fat[2], String(fat[0]), 'HUD は最後に今の値'); assert.ok(fat[1].includes(fat[0] >= 80 ? 'f-hi' : fat[0] >= 50 ? 'f-mid' : 'f-lo'), 'チップの段階');
  assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
});

test('GR-B3（390×844）：宝箱：揺れて開く → 光の粒（宝箱の位置）→ 報酬 → 所持金へ', { skip: SKIP }, async () => {
  const p = await open(); const pg = p.page; await toField(pg);
  await pg.evaluate(() => { const A = S.m.raise.field.nodeAssignments; A.p2_3.tier = 'normal'; save(); });
  await place(pg, 'p2_2'); await idle(pg);
  await pg.evaluate(() => { window.__c = []; const t = () => { const o = document.querySelector('#chf .chf-obj[data-id="p2_3"]'); window.__c.push([o ? o.className : '', !!document.querySelector('#chffx .chf-csparks'), !!document.querySelector('.chf-gfly')]); if (window.__c.length < 1200) requestAnimationFrame(t); }; requestAnimationFrame(t); });
  const g0 = await pg.evaluate(() => S.g);
  await rollAs(pg, 1); await idle(pg);
  const C = await pg.evaluate(() => window.__c), g1 = await pg.evaluate(() => S.g);
  assert.ok(g1 > g0); const sp = C.findIndex((x) => x[1]), op = C.findIndex((x) => /open/.test(x[0])), fly = C.findIndex((x) => x[2]);
  assert.ok(sp > 0 && op > 0 && sp >= op - 2, `開くと同時に光の粒（open ${op}・粒 ${sp}）`); assert.ok(fly > sp, '光の粒のあとに所持金へ');
  assert.equal(await pg.evaluate(() => document.querySelectorAll('#chffx .chf-csparks').length), 0, '粒は消える');
  assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
});
