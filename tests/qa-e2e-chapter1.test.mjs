// =========================================================
// 実ブラウザ：Chapter 1「はじまりの草原」Pattern A（Chapterフィールドエンジン）の画面
//  フィールドの表示（ノード・線・番号を見せない／1画面に今の背景だけ／ページは動かない）、サイコロ（1枚の画像の演出・ロック）、
//  1地点ずつの移動、休む、疲れ100、分岐の選択、背景の切り替え、バトルからの復帰（疲れ +5・同じ地点）、再読み込み、ゴール→公式大会。
//  バトルは Phase 6 の fight() を使わず、試合開始・終了の記録（beginBattle・markBattleDone）と after() で終える（他の実ブラウザテストと同じ）。
//  QA_E2E=1 のときだけ実行（tests/e2e/harness.mjs）。
// =========================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import * as H from './e2e/harness.mjs';

const SKIP = H.skipReason();
let L;
test.before(async () => { if (!SKIP) L = await H.launch(); });
test.after(async () => { if (L) await L.close(); });

/** 名前登録 → ソラモを連れて Chapter 1 へ出発（配置は固定のシード） */
async function start(p) {
  const pg = p.page;
  await H.newGame(pg, 'テスト');
  await pg.evaluate(() => { const m = mk(0); m.name = 'ソラ'; MMP7.ensureProg(m); S.m = m; save(); MMP8.depart(S, m, () => 0.37); save(); board(); });
  await pg.waitForSelector('#chf .chf-bg'); await idle(pg);
}
const idle = (pg) => pg.waitForFunction(() => !bBusy && !MMCHD.isLocked() && !document.querySelector('.chpop,.chdz') && document.getAnimations().every((a) => a.playState !== 'running' || !Number.isFinite(a.effect && a.effect.getComputedTiming().endTime)), null, { timeout: 20000 }).then(() => pg.waitForTimeout(80));
/** 出目を決めてサイコロを押す（Math.random をその一瞬だけ固定） */
async function rollAs(pg, v) {
  await pg.evaluate((v) => { window.__mr = Math.random; Math.random = () => ({ 1: 0.05, 2: 0.4, 3: 0.9 }[v]); }, v);
  await pg.click('#brollbtn');
  await pg.evaluate(() => { Math.random = window.__mr; });
}
const st = (pg) => pg.evaluate(() => ({ node: S.m.raise.node, turns: S.m.raise.turnsUsed, f: MMCH.fatigue(S.m), ph: MMP8.boardPhase(S.m), seed: S.m.raise.field && S.m.raise.field.layoutSeed, field: MMCHV.state().field,
  hudTurn: document.querySelector('#chturn') && document.querySelector('#chturn').textContent, hudFat: document.querySelector('#chfat b') && document.querySelector('#chfat b').textContent }));
const place = (pg, node, extra = {}) => pg.evaluate(([node, extra]) => { const r = S.m.raise; r.node = node; r.pend = null; Object.assign(r, extra); if (extra.branch !== undefined) r.field.branch = extra.branch; delete r.branch; save(); board(); }, [node, extra]);

for (const size of [H.SIZES.base, H.SIZES.se]) {
  test(`CH1-B1（${size.join('×')}）：フィールド：背景と世界の中の物だけ（ノード・線・番号は見せない）。ページは動かない。モンスターは地面に立ち、UIに隠れない。画像はすべて読める`, { skip: SKIP }, async () => {
    const p = await L.open({ size }); const pg = p.page;
    await start(p);
    await pg.evaluate(() => Promise.all([...document.images].map((i) => (i.decode ? i.decode().catch(() => {}) : 0))));
    const r = await pg.evaluate(() => {
      const mon = document.querySelector('#bmonw .mon img').getBoundingClientRect(), dock = document.querySelector('.chbtns').getBoundingClientRect(), hud = document.querySelector('.chh').getBoundingClientRect();
      const broken = [...document.images].filter((i) => !(i.complete && i.naturalWidth > 0)).map((i) => i.getAttribute('src'));
      const filt = []; for (let e = document.querySelector('#bmonw .mon img'); e && e !== document.body; e = e.parentElement) { const f = getComputedStyle(e).filter; if (f && f !== 'none' && !/^drop-shadow/.test(f)) filt.push(e.className); }
      return { sh: document.documentElement.scrollHeight, H: innerHeight, sw: document.documentElement.scrollWidth, W: innerWidth, cams: document.querySelectorAll('.chf-cam').length, bgs: [...document.querySelectorAll('.chf-bg')].map((i) => i.getAttribute('src')),
        dbg: document.querySelectorAll('.chf-dbg,.p9n,.p13n,svg line,svg path.p9ln').length, mon: [mon.top, mon.bottom, mon.left, mon.right], dockTop: dock.top, hudBottom: hud.bottom, broken, filt,
        objs: document.querySelectorAll('#chf .chf-obj').length, env: [...document.querySelectorAll('#chf .chf-env')].map((e) => e.dataset.asset), text: document.querySelector('#chf-ui').innerText };
    });
    assert.ok(r.sh <= r.H && r.sw <= r.W, `ページのはみ出し・スクロールなし（${r.sh}/${r.H}）`);
    assert.deepEqual([r.cams, r.bgs], [1, ['./assets/fields/ch1a/bg_01.webp']], '今いるフィールド（FIELD 1）の背景だけ');
    assert.equal(r.dbg, 0, 'ノード・線・番号の表示は無い');
    assert.ok(r.mon[1] <= r.dockTop + 8 && r.mon[0] >= r.hudBottom - 20 && r.mon[2] >= 0 && r.mon[3] <= r.W, `モンスターは画面の中でUIに隠れない（${r.mon}・操作欄 ${r.dockTop}）`);
    assert.deepEqual(r.broken, []); assert.deepEqual(r.filt, [], '正式モンスター画像に色のフィルタをかけない');
    assert.ok(r.objs >= 5, '停止地点は世界の中の物として置く'); assert.ok(r.env.includes('grass_front'), '手前の草（モンスターより手前の層）');
    assert.match(r.text, /Chapter 1 \/ 4/); assert.match(r.text, /Turn\s*1\s*\/ 30/); assert.match(r.text, /疲れ\s*0/); assert.match(r.text, /アイテム/); assert.match(r.text, /休む/); assert.match(r.text, /サイコロ/);
    assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
  });
}

test('CH1-B2：サイコロ：1枚の正式画像が回って止まり、出目を金の輪と数字で出す。演出・移動中はサイコロ・休むを重ねて押せない。出目の数だけ1地点ずつ歩き、疲れが増える', { skip: SKIP }, async () => {
  const p = await L.open(); const pg = p.page;
  await start(p);
  await pg.evaluate(() => { window.__nodes = []; new MutationObserver(() => { const n = document.querySelector('#bmonw') && document.querySelector('#bmonw').dataset.node; if (n && window.__nodes[window.__nodes.length - 1] !== n) window.__nodes.push(n); }).observe(document.querySelector('#chf'), { subtree: true, attributes: true, attributeFilter: ['data-node'] }); });
  await rollAs(pg, 3);
  await pg.waitForSelector('.chdz');
  const d = await pg.evaluate(() => ({ imgs: [...document.querySelectorAll('.chdz img')].map((i) => i.getAttribute('src')), locked: MMCHD.isLocked(), btn: document.querySelector('#brollbtn') && document.querySelector('#brollbtn').disabled, rest: document.querySelector('.chrest') && document.querySelector('.chrest').disabled }));
  assert.deepEqual(d.imgs, ['./assets/fields/ch1a/dice/dice_rolling.webp'], '正式サイコロ1枚'); assert.equal(d.locked, true); assert.equal(d.btn, true); assert.equal(d.rest, true);
  const t0 = await st(pg); await pg.evaluate(() => { chfRoll(); chfRest(); }); assert.deepEqual(await st(pg), t0, '演出中の押下は無視（ターン・疲れ・位置は変わらない）');
  await pg.waitForSelector('.chdz-res:not([hidden])'); assert.match(await pg.evaluate(() => document.querySelector('.chdz-res').textContent), /^3！$/);
  await idle(pg);
  const s = await st(pg); const walked = await pg.evaluate(() => window.__nodes);
  assert.deepEqual(walked, ['f1_1', 'f1_2', 'f1_3'], '1地点ずつ通る（瞬間移動しない）');
  assert.equal(s.f, 7, '出目3で疲れ +7'); assert.equal(s.hudFat, '7'); assert.equal(s.turns, 1);
  assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
});

test('CH1-B3：休む（1ターン・疲れ −30・移動なし）。疲れ100ならサイコロは押せず、休むが強調される', { skip: SKIP }, async () => {
  const p = await L.open(); const pg = p.page;
  await start(p);
  await place(pg, 'f1_4', { fatigue: 40, turnsUsed: 6 }); await idle(pg);
  await pg.click('.chrest'); await idle(pg);
  assert.deepEqual((({ node, turns, f, hudFat }) => ({ node, turns, f, hudFat }))(await st(pg)), { node: 'f1_4', turns: 7, f: 10, hudFat: '10' });
  await place(pg, 'f1_4', { fatigue: 100 }); await idle(pg);
  assert.deepEqual(await pg.evaluate(() => [document.querySelector('#brollbtn').disabled, document.querySelector('.chrest').classList.contains('must'), document.querySelector('#bmsg').textContent]), [true, true, '疲れがたまって動けない…休もう。']);
  await pg.evaluate(() => chfRoll()); assert.equal((await st(pg)).turns, 7, '疲れ100ではサイコロを振れない');
  assert.deepEqual(p.errors, []);
});

test('CH1-B4：分かれ道：大橋ルート／森の小道を選ぶ（出目で勝手に決めない）。選んだ後は選ばなかった道の物を出さない', { skip: SKIP }, async () => {
  const p = await L.open(); const pg = p.page;
  await start(p);
  await place(pg, 'f2_2'); await idle(pg);
  await rollAs(pg, 3);
  await pg.waitForSelector('.chroute');
  assert.deepEqual(await pg.evaluate(() => [...document.querySelectorAll('.chroute b')].map((b) => b.textContent)), ['大橋ルート', '森の小道']);
  const s0 = await st(pg); assert.deepEqual([s0.node, s0.ph], ['f2_3', 'branch']);
  await pg.waitForTimeout(500); assert.equal((await st(pg)).node, 'f2_3', '選ぶまで進まない');
  await pg.click('.chroute.k-forest'); await idle(pg);
  const s = await st(pg); assert.equal(s.node, 'b1', '残り2歩：森の小道の b0 → b1');
  assert.equal(await pg.evaluate(() => S.m.raise.field.branch), 'forest');
  assert.equal(await pg.evaluate(() => [...document.querySelectorAll('#chf .chf-obj')].filter((e) => e.dataset.id.startsWith('a') && !e.classList.contains('gone')).length), 0, '大橋ルートの物は消える');
  assert.deepEqual(p.errors, []);
});

test('CH1-B5：背景の切り替え：FIELD 1 の奥から FIELD 2 の手前へ歩いて入る（前の背景の DOM は残さない）', { skip: SKIP }, async () => {
  const p = await L.open(); const pg = p.page;
  await start(p);
  await place(pg, 'f1_12'); await idle(pg);
  await rollAs(pg, 3); await idle(pg);
  const r = await pg.evaluate(() => ({ node: S.m.raise.node, bgs: [...document.querySelectorAll('.chf-bg')].map((i) => i.getAttribute('src')), cams: document.querySelectorAll('.chf-cam').length, fd: document.querySelector('#chfd').textContent }));
  assert.equal(r.node, 'f2_1'); assert.deepEqual(r.bgs, ['./assets/fields/ch1a/bg_02.webp']); assert.equal(r.cams, 1); assert.equal(r.fd, '大橋と清流');
  assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
});

test('CH1-B6：バトル地点 → バトル → Chapterへ戻る：疲れ +5・同じ地点・同じ配置・次のターン（フィールド・分岐を失わない）', { skip: SKIP }, async () => {
  const p = await L.open(); const pg = p.page;
  await start(p);
  const id = await pg.evaluate(() => { const g = MMCH.graphFor(S.m); return g.order.find((x) => g.nodes[x].kind === 'strong'); });
  await place(pg, id, { fatigue: 30, turnsUsed: 12, branch: 'bridge', pend: { roll: 2, left: 0, stage: 'resolve' } });
  await pg.waitForSelector('.chbat'); await idle(pg);
  assert.match(await pg.evaluate(() => document.querySelector('.chbat h3').textContent), /強敵/);
  const before = await pg.evaluate(() => JSON.stringify(S.m.raise.field));
  await pg.evaluate(() => { MMP8.beginBattle(S, S.m, { kind: 'practice', rank: 0 }); save(); MMP8.markBattleDone(S); save(); after('試合終了'); });
  await pg.waitForSelector('#chf .chf-bg'); await idle(pg);
  const s = await st(pg);
  assert.deepEqual([s.node, s.f, s.turns, s.ph, s.hudFat], [id, 35, 12, 'roll', '35']);
  assert.equal(await pg.evaluate(() => JSON.stringify(S.m.raise.field)), before, '配置・分岐・開けた宝箱はそのまま');
  assert.deepEqual(p.errors, []);
});

test('CH1-B7：再読み込み → 開始でも、同じ配置・同じ地点・同じ疲れ・ターンから（再抽選しない）', { skip: SKIP }, async () => {
  const p = await L.open(); const pg = p.page;
  await start(p);
  await rollAs(pg, 2); await idle(pg);
  const a = await pg.evaluate(() => ({ f: JSON.stringify(S.m.raise.field.nodeAssignments), seed: S.m.raise.field.layoutSeed, node: S.m.raise.node, fat: MMCH.fatigue(S.m), t: S.m.raise.turnsUsed }));
  await pg.reload(); await pg.waitForFunction(() => typeof MMP8 === 'object');
  await pg.click('.p15start'); await pg.waitForSelector('#chf .chf-bg'); await idle(pg);
  const b = await pg.evaluate(() => ({ f: JSON.stringify(S.m.raise.field.nodeAssignments), seed: S.m.raise.field.layoutSeed, node: S.m.raise.node, fat: MMCH.fatigue(S.m), t: S.m.raise.turnsUsed }));
  assert.deepEqual(b, a);
  assert.equal(await pg.evaluate(() => JSON.parse(localStorage.getItem('mr4v6')).v), 6, 'セーブは v6・mr4v6');
  assert.deepEqual(p.errors, []);
});

test('CH1-B8：ゴール（大会門）→ 公式ランク大会の選択 → 大会へ（大会では疲れを増やさない）', { skip: SKIP }, async () => {
  const p = await L.open(); const pg = p.page;
  await start(p);
  await place(pg, 'f3_12', { fatigue: 60, turnsUsed: 20 }); await idle(pg);
  await rollAs(pg, 3); await pg.waitForSelector('.chgoal .p9rank'); await idle(pg);
  assert.deepEqual(await pg.evaluate(() => [S.m.raise.node, S.m.raise.goal, S.m.raise.turnsUsed]), ['f3_13', true, 21], '出目がゴールを超えてもゴールで止まる');
  const f0 = (await st(pg)).f;
  // 画面が出た直後（0.35秒）の押下は無視・2度押しの2回目は0.4秒以上あける作りなので、他の育成テストと同じ間隔で押す
  await pg.evaluate(() => { window.__clk = []; document.addEventListener('click', (e) => window.__clk.push([Math.round(performance.now()), e.target.className || e.target.tagName, e.target.closest('.p9rank') ? e.target.closest('.p9rank').dataset.a : '-', bBusy]), true); });
  // 押す前に見えていることを確かめ、force で押す（負荷が高いと Playwright の「動きが止まるまで待つ」が数秒かかり、2度押しの確認（3秒で取り消し）が切れるため。他の実ブラウザテストの tap と同じ）
  await pg.waitForSelector('.chgoal .p9rank', { state: 'visible' });
  await pg.waitForTimeout(550); await pg.click('.chgoal .p9rank', { force: true }); await pg.waitForTimeout(700); await pg.click('.chgoal .p9rank', { force: true });
  const ok = await pg.waitForSelector('[onclick="p9VsScr()"]', { timeout: 15000 }).then(() => true, () => false);
  if (!ok) assert.fail('大会へ進まない：' + JSON.stringify(await pg.evaluate(() => ({ tour: S.m.raise.tour, goal: S.m.raise.goal, pend: S.m.raise.pend, busy: bBusy, clk: window.__clk, now: Math.round(performance.now()), armed: [...document.querySelectorAll('.p9rank')].map((b) => [b.dataset.a, b.textContent.slice(0, 20)]), app: document.querySelector('#app').innerText.slice(0, 300) }))));
  assert.equal(await pg.evaluate(() => MMCH.fatigue(S.m)), f0, '大会に入っても疲れは変わらない');
  assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
});
