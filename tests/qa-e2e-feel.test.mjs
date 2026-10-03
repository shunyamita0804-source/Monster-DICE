// =========================================================
// 実ブラウザ：商用品質化・第1次（2026-10-02）の手ごたえ（390×844）
//  FE-1 押下の手ごたえ・連打で二重に移らない・入りかた／FE-2 能力UP の流れ／FE-3 宝箱 → 所持金へ／FE-4 野生の遭遇の間／
//  FE-5 フィナの節目の一言（1回だけ）／FE-6 システム通知に顔を付けない／FE-7 BGM の場面と音源なしでも止まらない
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
async function toField(pg, sp = 0) {
  await H.newGame(pg, 'テスト');
  await pg.evaluate((sp) => { const m = mk(0); m.sp = sp; m.name = 'ソラ'; MMP7.ensureProg(m); S.m = m; save(); MMP8.depart(S, m, () => 0.37); save(); board(); }, sp);
  await pg.waitForSelector('#chf .chf-bg'); await idle(pg);
}
const place = (pg, node, extra = {}) => pg.evaluate(([node, extra]) => { const r = S.m.raise, g = MMCH.graphFor(S.m); r.node = node; r.pend = null; r.field.fieldId = g.nodes[node].field; Object.assign(r, extra); save(); board(); }, [node, extra]).then(() => pg.waitForTimeout(300));
async function rollAs(pg, v) { await pg.evaluate((v) => { window.__mr = Math.random; Math.random = () => ({ 1: 0.1, 2: 0.5, 3: 0.9 }[v]); }, v); await pg.click('#brollbtn'); await pg.evaluate(() => { Math.random = window.__mr; }); }

test('FE-1：押下の手ごたえ：指が触れた瞬間にボタンがごく軽く沈み（scale のみ）、離すと戻る。画面を移るボタンは押下を少し見せてから移り、連打しても1回だけ。施設へは施設の入りかた', { skip: SKIP }, async () => {
  const p = await open({ navDelay: true }); const pg = p.page;
  await H.newGame(pg, 'テスト'); await pg.waitForTimeout(400);
  const b = await (await pg.$('nav.tcmds button')).boundingBox(), x = b.x + b.width / 2, y = b.y + b.height / 2;
  await pg.mouse.move(x, y); await pg.mouse.down(); await pg.waitForTimeout(50);
  const d = await pg.evaluate(() => { const e = document.querySelector('nav.tcmds button'); return [e.classList.contains('mm-press'), +getComputedStyle(e).scale, getComputedStyle(e).filter]; });
  assert.ok(d[0] && d[1] >= 0.96 && d[1] < 1, `押している間は少し沈む（${d[1]}）`); assert.equal(d[2], 'none', '色は変えない');
  await pg.mouse.up(); await pg.waitForSelector('.p10mk'); await pg.waitForTimeout(300);   // 1回のタップ＝押下を見せてから市場へ
  assert.equal(await pg.evaluate(() => document.querySelectorAll('.mm-press,.mm-go').length), 0, '離すと戻る（押下の印は残らない）');
  await pg.evaluate(() => lobby()); await pg.waitForTimeout(400);
  const n0 = await pg.evaluate(() => MMFEEL.navState().count);
  const t0 = Date.now(); await pg.mouse.click(x, y); await pg.mouse.click(x, y); await pg.mouse.click(x, y);
  const mid = await pg.evaluate(() => [!!document.querySelector('.p10mk'), MMFEEL.navState().pending]);
  await pg.waitForFunction(() => document.documentElement.dataset.mmout === '1', null, { timeout: 2000 });   // 2026-10-03：押下のあと今の画面をフェードアウト（切り替えの前）
  const out = await pg.evaluate(() => [!!document.querySelector('.p10mk'), document.querySelectorAll('nav.tcmds').length]);
  await pg.waitForSelector('.p10mk'); const ms = Date.now() - t0; await pg.waitForTimeout(500);
  const r = await pg.evaluate((n0) => ({ n: MMFEEL.navState().count - n0, mk: document.querySelectorAll('.p10mk').length }), n0);
  assert.deepEqual(mid, [false, true], '押した直後はまだ移らない（押下を見せる）'); assert.ok(ms < 900, `すぐに移る（${ms}ms）`);
  assert.deepEqual(r, { n: 1, mk: 1 }, '3回押しても1回だけ移る'); assert.deepEqual(out, [false, 1], 'フェードアウトの間はまだ街（切り替えはそのあと）');
  assert.equal(await pg.evaluate(() => document.documentElement.dataset.mmout), undefined, '切り替えたらフェードアウトの印は残らない');
  assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
});

test('FE-2：能力UP：止まる → 間 → マスが光る → モンスターが反応 → 能力UPの枠（+0 から上がる）→ 余韻。その間 START は押せない。出来事は dice.throw → dice.land → dice.result → stat.up', { skip: SKIP }, async () => {
  const p = await open(); const pg = p.page; await toField(pg);
  await place(pg, 'p1_1'); await idle(pg);
  await pg.evaluate(() => { window.__fx = []; const t = () => { const pop = document.querySelector('.chpop:not(.out) .cnt'), w = document.querySelector('#bmonw'); window.__fx.push([pop ? pop.textContent : '', !!(w && w.classList.contains('react')), !!document.querySelector('.chf-tile.hit'), document.querySelector('#brollbtn') ? document.querySelector('#brollbtn').disabled : null]); if (window.__fx.length < 900) requestAnimationFrame(t); }; requestAnimationFrame(t); });
  const li0 = await pg.evaluate(() => S.m.li);
  await rollAs(pg, 1); await idle(pg);
  const fx = await pg.evaluate(() => window.__fx), cnts = fx.map((x) => x[0]).filter(Boolean), r = await pg.evaluate(() => [S.m.raise.node, S.m.li, MMFEEL.log()]);
  assert.equal(r[0], 'p1_2'); assert.equal(r[1] - li0, 5, 'ソラモのライフ（C）は +5');
  assert.equal(cnts[0], '+0', '数値は +0 から'); assert.equal(cnts[cnts.length - 1], '+5'); assert.ok(new Set(cnts).size >= 3, `カウントアップ（${[...new Set(cnts)].join(' ')}）`);
  const firstPop = fx.findIndex((x) => x[0]), firstReact = fx.findIndex((x) => x[1]), firstHit = fx.findIndex((x) => x[2]);
  assert.ok(firstHit >= 0 && firstReact > firstHit && firstPop > firstReact, `マス → モンスター → 枠の順（${firstHit}・${firstReact}・${firstPop}）`);
  assert.ok(fx.filter((x) => x[0]).every((x) => x[3] !== false), '結果を見せている間は START を押せない（ボタンが無いか disabled）');
  assert.deepEqual(r[2].filter((e) => e !== 'step').slice(-5), ['dice.throw', 'dice.land', 'dice.stop', 'dice.result', 'stat.up']);   // dice.stop＝完全に止まったフレーム（2026-10-03）   // step＝1マスごとの足音（2026-10-02 夜）は数えない
  assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
});

test('FE-3：宝箱：現れる → 揺れて開く → 報酬 →「+NG」が HUD の所持金へ飛び、HUD の数字が前の額から増える', { skip: SKIP }, async () => {
  const p = await open(); const pg = p.page; await toField(pg);
  await pg.evaluate(() => { const A = S.m.raise.field.nodeAssignments; A.p2_3.tier = 'normal'; save(); });
  await place(pg, 'p2_2'); await idle(pg);
  const g0 = await pg.evaluate(() => S.g);
  await pg.evaluate(() => { window.__g = []; const t = () => { const b = document.querySelector('#chgold b'), o = document.querySelector('#chf .chf-obj[data-id="p2_3"]'); window.__g.push([b ? +b.textContent : -1, !!document.querySelector('.chf-gfly'), o ? o.className : '']); if (window.__g.length < 900) requestAnimationFrame(t); }; requestAnimationFrame(t); });
  await rollAs(pg, 1); await idle(pg);
  const G = await pg.evaluate(() => window.__g), g1 = await pg.evaluate(() => S.g), hud = await pg.evaluate(() => +document.querySelector('#chgold b').textContent);
  assert.ok(g1 > g0, '所持金が増えた'); assert.equal(hud, g1, 'HUD は最後に新しい額');
  const fly = G.findIndex((x) => x[1]); assert.ok(fly > 0, '「+NG」が飛ぶ'); assert.ok(G.slice(0, fly).every((x) => x[0] === g0), '飛んで届くまで HUD は前の額');
  const vals = [...new Set(G.map((x) => x[0]).filter((v) => v >= 0))]; assert.ok(vals.length >= 3, `HUD の数字が増えていく（${vals.join(' ')}）`);
  assert.ok(G.some((x) => /shake/.test(x[2])) && G.some((x) => /open/.test(x[2])), '宝箱が揺れて開く');
  assert.deepEqual((await pg.evaluate(() => MMFEEL.log())).slice(-2), ['chest.open', 'gold.get']);
  assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
});

test('FE-4：野生：止まった瞬間には「！」を出さない（静止の間）→ 草むらが揺れる → 「！」→ 遭遇の演出（カットインと文を同時に）→ バトルの案内', { skip: SKIP }, async () => {
  const p = await open(); const pg = p.page; await toField(pg);
  await pg.evaluate(() => { S.m.raise.field.nodeAssignments.p3_2.bt = 'wild'; save(); });
  await place(pg, 'p3_1'); await idle(pg);
  await pg.evaluate(() => { window.__w = []; const t0 = performance.now(), t = () => { window.__w.push([Math.round(performance.now() - t0), S.m.raise.pend ? S.m.raise.pend.stage : null, !!document.querySelector('.chf-rustle'), !!document.querySelector('.chf-alert'), !!document.querySelector('.chf-enc .chf-enc-art') && !!document.querySelector('.chf-enc .chf-enc-tx'), !!document.querySelector('.chbat'), (document.querySelector('.chf-enc .chf-enc-tx') || {}).textContent || '']); if (window.__w.length < 1200) requestAnimationFrame(t); }; requestAnimationFrame(t); });
  await rollAs(pg, 1); await pg.waitForSelector('.chbat', { timeout: 20000 }); await pg.waitForTimeout(200);
  const W = await pg.evaluate(() => window.__w), at = (k) => (W.find((x) => x[k]) || [-1])[0];
  const stop = (W.find((x) => x[1] === 'resolve') || [-1])[0], rustle = at(2), alert = at(3), cut = at(4), sheet = at(5);
  assert.ok(stop >= 0 && rustle - stop >= 150, `止まってから静止の間（${rustle - stop}ms）`); assert.ok(alert > rustle && cut > alert && sheet > cut, `草むら ${rustle} → ！ ${alert} → カットイン ${cut} → 案内 ${sheet}`);
  assert.ok(stop >= 0 && rustle - stop >= 350, `止まってから静止の間（${rustle - stop}ms）`);
  assert.ok(sheet - cut >= 1200, `遭遇の演出を読める間（${sheet - cut}ms）`); assert.ok(sheet - stop < 3400, `長すぎない（${sheet - stop}ms）`);
  assert.equal(W.find((x) => x[4])[6], '野生のモンスターが現れた！', '絵と文が同じフレームで出る');
  assert.equal((await pg.evaluate(() => MMFEEL.log())).slice(-1)[0], 'wild.alert');
  assert.deepEqual(p.errors, []);
});

test('FE-5：フィナの節目の一言（config.story）：Chapter に入った最初に1回（小さな吹き出し・背景を隠さない）。再読み込みでは出さない。通常マスでは話さない', { skip: SKIP }, async () => {
  const p = await open({ story: true }); const pg = p.page; await toField(pg);
  await pg.waitForSelector('.chf-fina', { timeout: 6000 });
  const b = await pg.evaluate(() => { const e = document.querySelector('.chf-fina'), r = e.getBoundingClientRect(); return { text: e.textContent, h: r.height, top: r.top, H: innerHeight }; });
  assert.match(b.text, /フィナ.*いよいよ出発だね/); assert.ok(b.h < b.H * 0.16 && b.top > b.H * 0.6, `小さな吹き出し（${Math.round(b.h)}px・上端 ${Math.round(b.top)}）`);
  await pg.click('.chf-fina', { force: true }); await pg.waitForFunction(() => !document.querySelector('.chf-fina'), null, { timeout: 3000 });
  assert.deepEqual(await pg.evaluate(() => S.m.raise.field.storySeen), ['ch1_start']);
  await pg.reload(); await pg.waitForFunction(() => typeof S === 'object' && S.m); await pg.evaluate(() => board()); await pg.waitForSelector('#chf .chf-bg'); await pg.waitForTimeout(1500);
  assert.equal(await pg.evaluate(() => !!document.querySelector('.chf-fina')), false, '再読み込みでは出さない');
  await rollAs(pg, 1); await idle(pg); assert.equal(await pg.evaluate(() => S.m.raise.node), 'p1_1');
  assert.deepEqual(await pg.evaluate(() => S.m.raise.field.storySeen), ['ch1_start'], '通常マスでは話さない');
  assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
});

test('FE-6：システム通知（育成放棄など）は顔・名前の無い通知（モンスターの絵を付けない）。フィナの案内だけフィナの顔と名前', { skip: SKIP }, async () => {
  const p = await open(); const pg = p.page;
  await H.newGame(pg, 'テスト');
  await pg.evaluate(() => lobby('ソラモの育成を放棄しました。')); await pg.waitForTimeout(400);
  const s = await pg.evaluate(() => { const d = document.querySelector('#app>.tlow .dlg'); return { cls: d.className, mon: !!d.querySelector('.mon,svg'), sys: !!d.querySelector('.dsys'), name: !!d.querySelector('.dnm') }; });
  assert.deepEqual(s, { cls: 'dlg sys', mon: false, sys: true, name: false });
  await pg.evaluate(() => lobby(finaMsg('ようこそ！'))); await pg.waitForTimeout(400);
  assert.deepEqual(await pg.evaluate(() => { const d = document.querySelector('#app>.tlow .dlg'); return [d.className, !!d.querySelector('.dmf'), d.querySelector('.dnm').textContent]; }), ['dlg fina', true, 'フィナ']);
  assert.deepEqual(p.errors, []);
});

test('FE-7：BGM の場面：街＝TOWN、市場＝MARKET、Chapter＝CHAPTER_1（街の BGM のままにしない）。正式な音源が無くても止まらない（エラーなし・同じ場面は1回）', { skip: SKIP }, async () => {
  const p = await open(); const pg = p.page;
  await H.newGame(pg, 'テスト'); await pg.waitForTimeout(300);
  const a = await pg.evaluate(() => MMAUDIO.status()); assert.equal(a.scene, 'TOWN');
  await pg.evaluate(() => market()); await pg.waitForTimeout(300); assert.equal(await pg.evaluate(() => MMAUDIO.status().scene), 'MARKET');
  await pg.evaluate(() => { const m = mk(0); m.name = 'ソラ'; MMP7.ensureProg(m); S.m = m; save(); MMP8.depart(S, m, () => 0.37); save(); board(); }); await pg.waitForSelector('#chf .chf-bg');
  const c = await pg.evaluate(() => { const n = MMAUDIO.status().plays; board(); board(); return [MMAUDIO.status(), n]; });
  assert.equal(c[0].scene, 'CHAPTER_1'); assert.equal(c[0].plays, c[1], '同じ場面は鳴らし直さない'); assert.deepEqual(c[0].errors, []); assert.ok(c[0].files.bgm.includes('MARKET') && c[0].files.se.includes('STAT_UP') && c[0].silent.se.includes('UI_CONFIRM') && c[0].files.bgm.includes('TOWN') && c[0].files.bgm.includes('CHAPTER_1'), '正式な音源は registry から登録されている（街の曲・コマンドのタップ音は 2026-10-03 第4弾で NG → 無音）'); assert.equal(c[0].source, 'file', 'Chapter 1 は第5弾で仮採用した曲（HydroGene「Spirits Forest」）をファイルで鳴らす'); assert.equal(c[0].slots.filter((x) => x.active).length, 1, '鳴っている曲は1本だけ');
  assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
});
