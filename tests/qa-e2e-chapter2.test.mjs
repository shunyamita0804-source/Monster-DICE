// =========================================================
// 実ブラウザ：Chapter 2「潮風の海岸」Pattern A（js/chapter/configs/ch2a.js。2026-10-01 夜の正式背景：フィールド 01〜09 → 大会会場前）
//  Chapter 1 を終えた個体が出発準備から Chapter 2 へ出発 → 俯瞰図の導入（育成個体 × Chapter 2 の初回に1回。再読み込みでは出ない）→ START → 移動 →
//  背景の切り替え（01 → … → 05（海上）→ 06〜08（海中の回廊）→ 09（海上）→ 会場前の順にだけ。戻らない・飛ばさない）→ 道の安全域 → ゴール → 既存の公式大会のランク選択へ。
//  QA_E2E=1 のときだけ実行（tests/e2e/harness.mjs）。
// =========================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import * as H from './e2e/harness.mjs';

const SKIP = H.skipReason();
let L;
test.before(async () => { if (!SKIP) L = await H.launch(); });
test.after(async () => { if (L) await L.close(); });
let opened = [];
async function open(opt = {}) { for (const q of opened) await q.ctx.close().catch(() => {}); const p = await L.open(opt); opened = [p]; return p; }
const LOG1 = { ch: 1, reachedGoal: true, turnsUsed: 14, turnLimit: 30, declined: false, tour: { rank: 0, place: 1, won: true, firstClear: true } };   // Chapter 1 で E 優勝
/** 名前登録 → Chapter 1 を終えた個体（E 優勝）を連れて Chapter間ファームへ */
async function toFarm(pg) {
  await H.newGame(pg, 'テスト');
  await pg.evaluate((LOG1) => { const m = mk(0); m.name = 'ソラ'; MMP7.ensureProg(m); S.m = m; Object.assign(m.raise, { state: 'farm', ch: 2, log: [LOG1] }); m.rk = 1; S.br = Math.max(S.br || 0, 1); save(); hall('t'); }, LOG1);
  await pg.waitForSelector('.fm');
}
/** 出発準備 → 出発ボタン（Chapter間はフィナの会話なし・1回押すだけ） */
async function departUI(pg) { await pg.evaluate(() => prepScr()); await pg.waitForSelector('#app button[onclick="p7Depart(this)"]'); await pg.waitForTimeout(400); await pg.click('#app button[onclick="p7Depart(this)"]'); await pg.waitForSelector('#chf .chf-bg', { timeout: 15000 }); }
const idle = (pg) => pg.waitForFunction(() => !document.querySelector('.chintro') && !bBusy && !MMCHD.isLocked() && !document.querySelector('.chpop,.chdz'), null, { timeout: 30000 }).then(() => pg.waitForTimeout(80));
async function rollAs(pg, v) { await pg.evaluate((v) => { window.__mr = Math.random; Math.random = () => ({ 1: 0.05, 2: 0.2, 3: 0.4, 4: 0.55, 5: 0.75, 6: 0.95 }[v]); }, v); await pg.click('#brollbtn'); await pg.evaluate(() => { Math.random = window.__mr; }); }
const place = (pg, node, extra = {}) => pg.evaluate(([node, extra]) => { const r = S.m.raise; r.node = node; r.pend = null; Object.assign(r, extra); save(); board(); }, [node, extra]);
const st = (pg) => pg.evaluate(() => { const sc = MMCH.getConfig(2).fieldScenes.find((s) => s.id === MMCHV.state().field); return { node: S.m.raise.node, ch: S.m.raise.ch, turns: S.m.raise.turnsUsed, ph: MMP8.boardPhase(S.m), bg: document.querySelector('#chf .chf-bg').getAttribute('src'), bgKey: sc && sc.bgKey, stage: sc && sc.stage, name: document.querySelector('#chfd').textContent, hud: document.querySelector('.chh').innerText.replace(/\s+/g, ' ') }; });

test('CH2-B1：Chapter 1 を終えた個体が出発準備から Chapter 2 へ出発 → 俯瞰図 → Chapter 名「潮風の海岸」→ 海上・海中を経由してスタート地点へ寄る → 01 の実プレイ画面で START。導入は育成個体 × Chapter 2 の初回に1回（再読み込みでは出ない）。HUD は Chapter 2 / 4', { skip: SKIP }, async () => {
  const p = await open({ intro: true }); const pg = p.page;
  await toFarm(pg); await departUI(pg);
  await pg.waitForSelector('.chintro.on', { timeout: 8000 }); await pg.waitForTimeout(300);
  const a = await pg.evaluate(() => ({ src: document.querySelector('.chintro-img').getAttribute('src'), title: document.querySelector('.chintro-title').textContent.replace(/\s+/g, ' '), busy: bBusy, seen: S.m.raise.field.introSeen === true, ch: S.m.raise.field.chapterId }));
  assert.equal(a.src, './assets/fields/ch2a/intro/ch2_intro_overview_v2.webp', '正式な俯瞰図（演出専用。プレイの背景ではない）'); assert.ok(!(await pg.evaluate(() => MMCH.getConfig(2).fieldScenes.some((s) => /intro/.test(s.bg)))), '俯瞰図は背景の順に入れない'); assert.match(a.title, /CHAPTER 2.*潮風の海岸/); assert.deepEqual([a.busy, a.seen, a.ch], [true, true, 2]);
  await pg.waitForFunction(() => !document.querySelector('.chintro'), null, { timeout: 15000 }); await idle(pg);
  const b = await st(pg); assert.deepEqual([b.node, b.ch, b.bgKey, b.stage, b.name], ['s1_0', 2, '01', 'coast', '海辺の遊歩道']); assert.match(b.hud, /Chapter 2 \/ 4.*潮風の海岸/);
  assert.equal(await pg.evaluate(() => !document.querySelector('#brollbtn').disabled && document.querySelector('#brollbtn').textContent.trim() === 'START'), true);
  await pg.reload(); await pg.waitForFunction(() => typeof MMP8 === 'object'); await pg.click('.p15start'); await pg.waitForSelector('#chf .chf-bg'); await pg.waitForTimeout(700);
  assert.equal(await pg.evaluate(() => !!document.querySelector('.chintro')), false, '再読み込みでは出さない'); assert.equal((await st(pg)).node, 's1_0');
  assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
});

test('CH2-B2：START の1タップで出目のぶん進み、背景は 01 → … → 09 → 会場前 の順にだけ切り替わる（海上 → 海中 → 海上。戻らない・飛ばさない・各1回）。歩いている途中も止まっても道の安全域の中・画面の中（390×844・375×667）', { skip: SKIP }, async () => {
  for (const size of [[390, 844], [375, 667]]) {
  const p = await open({ size }); const pg = p.page;
  await toFarm(pg); await departUI(pg); await idle(pg);
  await rollAs(pg, 3); await pg.waitForSelector('.chdz'); await idle(pg);
  const a = await st(pg); assert.deepEqual([a.node, a.turns, a.bgKey], ['s1_3', 1, '01'], '3地点進む（同じ背景の中）');
  await rollAs(pg, 6); await idle(pg);
  const b = await st(pg); assert.deepEqual([b.node, b.bgKey, b.name], ['s2_3', '02', '白砂の浜道'], '背景の切り替え：01 の奥 → 02');
  // 道の安全域：いくつかの背景で歩きを記録
  await pg.evaluate(() => { window.__trk = []; const tick = () => { const w = document.querySelector('#bmonw'); if (w && w.classList.contains('walk')) { const img = w.querySelector('.mon img'), r = img.getBoundingClientRect(), f = document.querySelector('#chf').getBoundingClientRect(), stt = MMCHV.state(), sc = MMCH.getConfig(2).fieldScenes.find((s) => s.id === stt.field); const x = parseFloat(w.style.left) / sc.w, y = parseFloat(w.style.top) / sc.h, road = MMCH.roadAt(sc, y); window.__trk.push({ bg: sc.bgKey, ok: x >= road.safeLeft - 1e-6 && x <= road.safeRight + 1e-6, off: !(r.left >= f.left - 1 && r.right <= f.right + 1 && r.top >= f.top - 1 && r.bottom <= f.bottom + 1) }); } if (window.__trk.length < 5000) setTimeout(tick, 30); }; tick(); });
  const seen = [];
  for (const node of ['s2_5', 's3_4', 's4_6', 's5_4', 's6_5', 's7_4', 's8_5', 's9_6']) { await place(pg, node); await idle(pg); await rollAs(pg, 2); await idle(pg); const s = await st(pg); seen.push([node, s.node, s.bgKey, s.stage]); }
  assert.deepEqual(seen.map((x) => x[2]), ['03', '04', '05', '06', '07', '08', '09', '10'], `背景の切り替えは順番どおり（${JSON.stringify(seen)}）`);
  assert.deepEqual(seen.map((x) => x[3]), ['coast', 'coast', 'coast', 'undersea', 'undersea', 'undersea', 'late', 'arena'], '海上 → 海中 → 海上 → 会場前');
  const trk = await pg.evaluate(() => window.__trk), bad = trk.filter((t) => !t.ok || t.off);
  assert.ok(trk.length >= 20 && new Set(trk.map((t) => t.bg)).size >= 8, `歩きを複数の背景で記録（${trk.length}）`); assert.ok(['06', '07', '08'].every((k) => trk.some((t) => t.bg === k)), '海中の区間も記録'); assert.deepEqual(bad, [], `${size}：歩いている途中も安全域・画面の中`);
  // ルート全体：段階は単調・背景は各1回（グラフ）
  const order = await pg.evaluate(() => { const g = MMCH.graphFor(S.m), cfg = MMCH.getConfig(2); return g.routes[0].seq.map((id) => cfg.fieldScenes.find((s) => s.id === g.nodes[id].field).bgKey).filter((v, i, a) => i === 0 || a[i - 1] !== v); });
  assert.deepEqual(order, ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10']);
  assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
  }
});

test('CH2-B3：会場前のゴール（大会会場の階段の手前）：出目がゴールを超えてもゴールで止まり、既存の公式大会のランク選択へ（E 優勝の個体は E・D）。ライバルは強制停止', { skip: SKIP }, async () => {
  const p = await open(); const pg = p.page;
  await toFarm(pg); await departUI(pg); await idle(pg);
  await place(pg, 'sa_1', { fatigue: 0, turnsUsed: 20 }); await idle(pg);
  await rollAs(pg, 6); await pg.waitForSelector('.chbat', { timeout: 20000 });
  assert.deepEqual(await pg.evaluate(() => [S.m.raise.node, S.m.raise.pend.left, document.querySelector('.chbat h3').textContent]), ['sa_3', 0, 'ライバル'], 'ライバルで止まり残りは消える');
  await pg.waitForTimeout(450); await pg.click('.chbat .p9btn2'); await idle(pg);
  await place(pg, 'sa_4', { fatigue: 10, turnsUsed: 22 }); await idle(pg);
  await rollAs(pg, 4); await pg.waitForSelector('.chgoal .p9rank', { timeout: 20000 }); await idle(pg);
  const r = await pg.evaluate(() => ({ node: S.m.raise.node, goal: S.m.raise.goal, ranks: [...document.querySelectorAll('.chgoal .p9rank')].map((b) => b.getAttribute('onclick')), locks: document.querySelectorAll('.chgoal .p9rlock').length, msg: document.querySelector('#bmsg').textContent }));
  assert.deepEqual([r.node, r.goal, r.ranks, r.locks], ['sa_5', true, ['p8TourStart(0,this)', 'p8TourStart(1,this)'], 4], 'ゴール → 既存の大会のランク選択（E・D）'); assert.match(r.msg, /大会会場に着いた/);
  assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
});
