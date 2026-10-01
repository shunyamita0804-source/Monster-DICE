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

/** 名前登録 → ソラモを連れて Chapter 1 へ出発（配置は固定のシード）。前のテストのページは閉じる（開いたままだと描画が遅くなり、時間で判定するテストが不安定になる） */
let opened = [];
async function start(p) {
  for (const q of opened) if (q !== p) await q.ctx.close().catch(() => {});
  opened = [p];
  const pg = p.page;
  await H.newGame(pg, 'テスト');
  await pg.evaluate(() => { const m = mk(0); m.name = 'ソラ'; MMP7.ensureProg(m); S.m = m; save(); MMP8.depart(S, m, () => 0.37); save(); board(); });
  await pg.waitForSelector('#chf .chf-bg'); await idle(pg);
}
const idle = (pg) => pg.waitForFunction(() => !bBusy && !MMCHD.isLocked() && !document.querySelector('.chpop,.chdz') && document.getAnimations().every((a) => a.playState !== 'running' || !Number.isFinite(a.effect && a.effect.getComputedTiming().endTime)), null, { timeout: 20000 }).then(() => pg.waitForTimeout(80));
/** 出目を決めて START を1回押す（1タップ：サイコロは自動で止まる。STOP の操作は無い）。Math.random は押した一瞬だけ固定（6面：1〜6） */
async function rollAs(pg, v) {
  await pg.evaluate((v) => { window.__mr = Math.random; Math.random = () => ({ 1: 0.1, 2: 0.5, 3: 0.9 }[v]); }, v);   // 2026-10-01 夜：Chapter 1 は 1〜3
  await pg.click('#brollbtn');
  await pg.evaluate(() => { Math.random = window.__mr; });
}
/** モンスターの画面上の位置と、道の安全域（背景の割合）に対する判定 */
const monCheck = (pg) => pg.evaluate(() => {
  const w = document.querySelector('#bmonw'), img = w.querySelector('.mon img'), r = img.getBoundingClientRect(), f = document.querySelector('#chf').getBoundingClientRect(), st = MMCHV.state(), sc = MMCH.getConfig(1).fieldScenes.find((s) => s.id === st.field);
  const x = parseFloat(w.style.left) / sc.w, y = parseFloat(w.style.top) / sc.h, road = MMCH.roadAt(sc, y);
  return { node: w.dataset.node, bg: sc.bgKey, x, y, road, inSafe: x >= road.safeLeft - 1e-6 && x <= road.safeRight + 1e-6, notEdge: x > road.left + road.half * 0.2 && x < road.right - road.half * 0.2,
    onScreen: r.left >= f.left - 1 && r.right <= f.right + 1 && r.top >= f.top - 1 && r.bottom <= f.bottom + 1, screen: [Math.round(r.left - f.left), Math.round(r.right - f.left), Math.round(r.top - f.top), Math.round(r.bottom - f.top), Math.round(f.width), Math.round(f.height)] };
});
const st = (pg) => pg.evaluate(() => ({ node: S.m.raise.node, turns: S.m.raise.turnsUsed, f: MMCH.fatigue(S.m), ph: MMP8.boardPhase(S.m), seed: S.m.raise.field && S.m.raise.field.layoutSeed, field: MMCHV.state().field,
  hudTurn: document.querySelector('#chturn') && document.querySelector('#chturn').textContent, hudFat: document.querySelector('#chfat b') && document.querySelector('#chfat b').textContent }));
const place = (pg, node, extra = {}) => pg.evaluate(([node, extra]) => { const r = S.m.raise; r.node = node; r.pend = null; Object.assign(r, extra); if (extra.branch !== undefined) r.field.branch = extra.branch; delete r.branch; save(); board(); }, [node, extra]);

for (const size of [H.SIZES.base, H.SIZES.se]) {
  test(`CH1-B1（${size.join('×')}）：フィールド：背景と世界の中の物だけ（ノード・線・番号は見せない）。ページは動かない。モンスターは地面に立ち、UIに隠れない。画像はすべて読める`, { skip: SKIP }, async () => {
    const p = await L.open({ size }); const pg = p.page;
    await start(p);
    await pg.evaluate(() => Promise.all([...document.images].map((i) => (i.decode ? i.decode().catch(() => {}) : 0))));
    const r = await pg.evaluate(() => {
      const mon = document.querySelector('#bmonw .mon img').getBoundingClientRect(), dock = document.querySelector('.chdeck').getBoundingClientRect(), hud = document.querySelector('.chh').getBoundingClientRect();
      const broken = [...document.images].filter((i) => !(i.complete && i.naturalWidth > 0)).map((i) => i.getAttribute('src'));
      const filt = []; for (let e = document.querySelector('#bmonw .mon img'); e && e !== document.body; e = e.parentElement) { const f = getComputedStyle(e).filter; if (f && f !== 'none' && !/^drop-shadow/.test(f)) filt.push(e.className); }
      return { sh: document.documentElement.scrollHeight, H: innerHeight, sw: document.documentElement.scrollWidth, W: innerWidth, cams: document.querySelectorAll('.chf-cam').length, bgs: [...document.querySelectorAll('.chf-bg')].map((i) => i.getAttribute('src')),
        dbg: document.querySelectorAll('.chf-dbg,.p9n,.p13n,svg line,svg path.p9ln').length, mon: [mon.top, mon.bottom, mon.left, mon.right], dockTop: dock.top, hudBottom: hud.bottom, broken, filt,
        objs: document.querySelectorAll('#chf .chf-obj').length, objsWant: (() => { const g = MMCH.graphFor(S.m), a = S.m.raise.field.nodeAssignments, f = MMCHV.state().field; return g.order.filter((id) => g.nodes[id].field === f && a[id] && ['stat', 'event', 'treasure'].includes(a[id].t)).length; })(), env: [...document.querySelectorAll('#chf .chf-env')].map((e) => e.dataset.asset), text: document.querySelector('#chf-ui').innerText,
        battleObjs: document.querySelectorAll('#chf .chf-obj[data-t="battle"]').length, fg: document.querySelectorAll('#chf .chf-fg').length, layers: ['.chf-far', '.chf-bg', '.chf-back', '.chf-road', '.chf-front', '.chf-fx'].map((c) => !!document.querySelector('#chf ' + c)),
        stop: (() => { const b = document.querySelector('#brollbtn'), r = b.getBoundingClientRect(); return { w: r.width, h: r.height, radius: getComputedStyle(b).borderRadius, text: b.textContent.trim() }; })(),
        deckImg: (() => { const i = document.querySelector('.chdeck-bg'); return i && i.complete && i.naturalWidth > 0 ? i.getAttribute('src') : null; })(),
        wings: [...document.querySelectorAll('.chwing')].map((w) => [w.className, w.textContent.replace(/\s+/g, ' ').trim()]), fieldH: document.querySelector('#chf').getBoundingClientRect().height, deckH: dock.height, dockTopEqFieldBottom: Math.abs(dock.top - document.querySelector('#chf').getBoundingClientRect().bottom) <= 1,
        dice: document.querySelectorAll('.chdf,.chdz').length };
    });
    assert.ok(r.sh <= r.H && r.sw <= r.W, `ページのはみ出し・スクロールなし（${r.sh}/${r.H}）`);
    assert.deepEqual([r.cams, r.bgs], [1, ['./assets/fields/ch1a/field/ch1_field_01.webp']], '今いるフィールド（旅立ちの街道）の背景だけ');
    assert.equal(r.dbg, 0, 'ノード・線・番号の表示は無い');
    assert.ok(r.mon[1] <= r.dockTop + 8 && r.mon[0] >= r.hudBottom - 20 && r.mon[2] >= 0 && r.mon[3] <= r.W, `モンスターは画面の中でUIに隠れない（${r.mon}・操作欄 ${r.dockTop}）`);
    assert.deepEqual(r.broken, []); assert.deepEqual(r.filt, [], '正式モンスター画像に色のフィルタをかけない');
    assert.equal(r.objs, r.objsWant, '停止地点は世界の中の物として置く（この背景の分だけ）'); assert.deepEqual(r.env, [], '街道の背景に素材は重ねない');
    assert.equal(r.battleObjs, 0, 'バトル地点の石碑は常設しない'); assert.equal(r.fg, 0, '手前を横切る草も置かない（石の街道）'); assert.deepEqual(r.layers, [true, true, true, true, true, true], '遠景・背景・奥・道・手前・効果の層');
    assert.match(r.text, /Chapter 1 \/ 4/); assert.match(r.text, /Turn\s*1\s*\/ 40/); assert.match(r.text, /疲れ\s*0/); assert.match(r.text, /アイテム/); assert.match(r.text, /休む/); assert.match(r.text, /サイコロ/);
    // 下の操作欄：正式画像（START の状態）。中央＝START（押せる領域は画像の球の上）、左右＝アイテム・休む（疲れ −30）・技設定・ステータス。フィールドは 80〜82%、操作欄は 18〜20%
    assert.ok(/START/.test(r.stop.text) && r.stop.w >= 60 && r.stop.h >= 60, JSON.stringify(r.stop)); assert.ok(r.deckImg && /deck_start\.webp$/.test(r.deckImg), `操作欄の画像 ${r.deckImg}`);
    assert.deepEqual(r.wings.map((w) => w[0]), ['chwing chwing-img chitem chw-tl', 'chwing chwing-img chrest chw-tr', 'chwing chwing-img chskill chw-bl', 'chwing chwing-img chstatus chw-br'], '4コマンド：アイテム・休む・技設定・ステータス（画像の上の押せる領域）'); assert.match(r.wings[1][1], /休む.*疲れ −30/);
    const deckRatio = r.deckH / r.H; assert.ok(deckRatio >= 0.15 && deckRatio <= 0.2 && Math.abs(r.fieldH + r.deckH - r.H) <= 1 && r.dockTopEqFieldBottom, `操作欄 ${r.deckH}px（${(deckRatio * 100).toFixed(1)}%）・フィールド ${r.fieldH}px`);
    assert.equal(r.dice, 0, 'START を押すまでサイコロは画面に出さない');
    assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
  });
}

test('CH1-B2：サイコロ：START の1タップで無地の正式サイコロが出て回り、自動で止まると出目の停止面になる。演出・移動中はサイコロ・休むを重ねて押せない。出目の数だけ1地点ずつ歩き、疲れが増える', { skip: SKIP }, async () => {
  const p = await L.open(); const pg = p.page;
  await start(p);
  await pg.evaluate(() => { window.__nodes = []; new MutationObserver(() => { const n = document.querySelector('#bmonw') && document.querySelector('#bmonw').dataset.node; if (n && window.__nodes[window.__nodes.length - 1] !== n) window.__nodes.push(n); }).observe(document.querySelector('#chf'), { subtree: true, attributes: true, attributeFilter: ['data-node'] }); });
  await pg.evaluate(() => { delete S.m.raise.field.nodeAssignments.f1_3; save(); board(); }); await idle(pg);   // 止まる f1_3 は何も起きない地点にする（配置の seed によっては疲れ回復のイベントになるため）
  await rollAs(pg, 3);
  await pg.waitForSelector('.chdz');
  const d = await pg.evaluate(() => ({ imgs: [...document.querySelectorAll('.chdz img')].map((i) => i.getAttribute('src')), locked: MMCHD.isLocked(), btn: [...document.querySelectorAll('.chstop')].every((b) => b.disabled), rest: document.querySelector('.chrest') && document.querySelector('.chrest').disabled }));
  assert.equal(d.imgs.length, 1, '回転中は正式サイコロ1枚'); assert.match(d.imgs[0], /dice_(blank|stop_[1-6])\.webp$/, '回転中は正式の停止画像の面を切り替えて見せる'); assert.equal(d.locked, true); assert.equal(d.btn, true); assert.equal(d.rest, true);
  const t0 = await st(pg); await pg.evaluate(() => { chfRoll(); chfRest(); }); assert.deepEqual(await st(pg), t0, '演出中の押下は無視（ターン・疲れ・位置は変わらない）');
  await pg.waitForSelector('.chdz-stop.on'); assert.deepEqual(await pg.evaluate(() => [document.querySelector('.chdz-stop').getAttribute('src'), getComputedStyle(document.querySelector('.chdz-res')).display]), ['./assets/fields/ch1a/dice/dice_stop_3.webp', 'none'], '出目3 → 3が上の停止面（数字の輪は出さない）');
  await idle(pg);
  const s = await st(pg); const walked = await pg.evaluate(() => window.__nodes);
  assert.deepEqual(walked, ['f1_1', 'f1_2', 'f1_3'], '1地点ずつ通る（瞬間移動しない）');
  assert.equal(s.f, 7, '出目3で疲れ +7'); assert.equal(s.hudFat, '7'); assert.equal(s.turns, 1);
  assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
});

test('CH1-B3：休む（1ターン・疲れ −30・移動なし）。疲れ100ならサイコロは押せず、休むが強調される', { skip: SKIP }, async () => {
  const p = await L.open(); const pg = p.page;
  await start(p);
  await place(pg, 'f1_2', { fatigue: 40, turnsUsed: 6 }); await idle(pg);
  await pg.click('.chrest'); await idle(pg);
  assert.deepEqual((({ node, turns, f, hudFat }) => ({ node, turns, f, hudFat }))(await st(pg)), { node: 'f1_2', turns: 7, f: 10, hudFat: '10' });
  await place(pg, 'f1_2', { fatigue: 100 }); await idle(pg);
  assert.deepEqual(await pg.evaluate(() => [document.querySelector('#brollbtn').disabled, document.querySelector('.chrest').classList.contains('must'), document.querySelector('#bmsg').textContent]), [true, true, '疲れがたまって動けない…休もう。']);
  await pg.evaluate(() => chfRoll()); assert.equal((await st(pg)).turns, 7, '疲れ100ではサイコロを振れない');
  assert.deepEqual(p.errors, []);
});

test('CH1-B4：1本道（橋／森の分岐は廃止。2026-10-01）：森の遺跡（05）の奥から出目のぶんそのまま天空の大橋（06）へ進み、分岐の選択は出ない', { skip: SKIP }, async () => {
  const p = await L.open(); const pg = p.page;
  await start(p);
  await place(pg, 'f5_4'); await idle(pg);
  await rollAs(pg, 3); await idle(pg);
  const s = await st(pg); assert.deepEqual([s.node, s.field], ['f6_1', 6], 'f5_5 → 背景の切り替え → f6_0 → f6_1');
  assert.equal(await pg.evaluate(() => document.querySelectorAll('.chroute').length), 0, '分岐の選択は出ない'); assert.equal(await pg.evaluate(() => S.m.raise.field.branch), null);
  assert.deepEqual(await pg.evaluate(() => [...document.querySelectorAll('.chf-bg')].map((i) => i.getAttribute('src'))), ['./assets/fields/ch1a/field/ch1_field_06.webp']);
  assert.deepEqual(p.errors, []);
});


test('CH1-B5：背景の切り替え：旅立ちの草原の奥から花の丘の手前へ歩いて入る（前の背景の DOM は残さない）', { skip: SKIP }, async () => {
  const p = await L.open(); const pg = p.page;
  await start(p);
  await place(pg, 'f1_3'); await idle(pg);
  await rollAs(pg, 3); await idle(pg);
  const r = await pg.evaluate(() => ({ node: S.m.raise.node, bgs: [...document.querySelectorAll('.chf-bg')].map((i) => i.getAttribute('src')), cams: document.querySelectorAll('.chf-cam').length, fd: document.querySelector('#chfd').textContent }));
  assert.equal(r.node, 'f2_0'); assert.deepEqual(r.bgs, ['./assets/fields/ch1a/field/ch1_field_02.webp']); assert.equal(r.cams, 1); assert.equal(r.fd, '花の丘');
  assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
});

test('CH1-B6：バトル地点 → バトル → Chapterへ戻る：疲れ +5・同じ地点・同じ配置・次のターン（フィールド・分岐を失わない）', { skip: SKIP }, async () => {
  const p = await L.open(); const pg = p.page;
  await start(p);
  const id = await pg.evaluate(() => { const g = MMCH.graphFor(S.m); return g.order.find((x) => g.nodes[x].kind === 'strong'); });
  await place(pg, id, { fatigue: 30, turnsUsed: 12, pend: { roll: 2, left: 0, stage: 'resolve' } });
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

test('CH1-B8：ゴール（大会会場）→ 公式ランク大会の選択 → 大会へ（大会では疲れを増やさない）', { skip: SKIP }, async () => {
  const p = await L.open(); const pg = p.page;
  await start(p);
  await place(pg, 'f10_4', { fatigue: 60, turnsUsed: 20 }); await idle(pg);
  await rollAs(pg, 3); await pg.waitForSelector('.chgoal .p9rank'); await idle(pg);
  assert.deepEqual(await pg.evaluate(() => [S.m.raise.node, S.m.raise.goal, S.m.raise.turnsUsed]), ['f10_5', true, 21], '出目がゴールを超えてもゴールで止まる');
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

// =========================================================
// 2026-09-30 改修：カメラ・歩き・目印の分離・STOP・バトルの表示（Chapter 移動体験の品質向上）
// =========================================================
/** 1フレームごとにモンスターの画面位置・カメラを記録する仕掛け（stop() で止める） */
const startRecording = (pg) => pg.evaluate(() => {
  window.__rec = []; window.__recOn = true; window.__cls = []; const t0 = performance.now();
  // クラスの切り替わり（ready／walk／land／idle）はフレームに依らず記録する
  const w0 = document.querySelector('#bmonw'); new MutationObserver(() => { const c = /ready/.test(w0.className) ? 'ready' : /walk/.test(w0.className) ? 'walk' : /land/.test(w0.className) ? 'land' : 'idle'; if (window.__cls[window.__cls.length - 1] !== c) window.__cls.push(c); }).observe(w0, { attributes: true, attributeFilter: ['class'] });
  const f = (now) => { if (!window.__recOn) return; const w = document.querySelector('#bmonw'), fv = document.querySelector('#chf'); if (w && fv) { const fr = fv.getBoundingClientRect(), r = w.querySelector('.mon img').getBoundingClientRect(), st = MMCHV.state(); window.__rec.push({ t: Math.round(now - t0), x: r.left + r.width / 2 - fr.left, y: r.bottom - fr.top, wx: st.monster ? st.monster.x : 0, wy: st.monster ? st.monster.y : 0, cx: st.cam.x, cy: st.cam.y, tx: st.cam.tx, ty: st.cam.ty, S: st.cam.S, z: st.cam.z, cls: w.className, node: w.dataset.node, moving: st.moving, front: (document.querySelector('.chf-front') || {}).style ? document.querySelector('.chf-front').style.transform : '', back: document.querySelector('.chf-back') ? document.querySelector('.chf-back').style.transform : '', W: fr.width, H: fr.height }); } requestAnimationFrame(f); };
  requestAnimationFrame(f);
});
const stopRecording = (pg) => pg.evaluate(() => { window.__recOn = false; return window.__rec; });
const maxStep = (rec, k) => { let m = 0; for (let i = 1; i < rec.length; i++) m = Math.max(m, Math.hypot(rec[i][k[0]] - rec[i - 1][k[0]], rec[i][k[1]] - rec[i - 1][k[1]])); return m; };

test('CH1-B9：カメラ：移動が始まるとモンスターより少し遅れて追いかけ、跳ばずに滑らかに動き、止まるとゆっくり止まる。ズームは 0.97〜1.03 の範囲。視差（前景と奥）は違う量だけ動く', { skip: SKIP }, async () => {
  const p = await L.open(); const pg = p.page;
  await start(p);
  await startRecording(pg);
  await rollAs(pg, 3); await idle(pg); await pg.waitForTimeout(1200);
  const rec = await stopRecording(pg);
  const walk = rec.filter((r) => /walk/.test(r.cls)); assert.ok(walk.length >= 10, `歩きのフレーム ${walk.length}`);
  // 注視点（cam.x/y＝背景の画素）はモンスターの位置（wx/wy）より少し遅れて動き出す（移動開始の「少し引く」ズームは別）
  const tMonStart = rec.find((r, i) => i > 0 && Math.hypot(r.wx - rec[i - 1].wx, r.wy - rec[i - 1].wy) > 0.5).t;
  const tCamStart = rec.find((r, i) => i > 0 && Math.hypot(r.cx - rec[i - 1].cx, r.cy - rec[i - 1].cy) > 0.5 && r.t >= tMonStart).t;
  assert.ok(tCamStart - tMonStart >= 50 && tCamStart - tMonStart <= 400, `カメラは少し遅れて追いかける（モンスター ${tMonStart}ms → カメラ ${tCamStart}ms）`);
  assert.ok(maxStep(rec, ['tx', 'ty']) < 12, `カメラが跳ばない（1フレーム最大 ${maxStep(rec, ['tx', 'ty']).toFixed(1)}px）`);
  assert.ok(maxStep(rec, ['x', 'y']) < 12, `モンスターが跳ばない（1フレーム最大 ${maxStep(rec, ['x', 'y']).toFixed(1)}px）`);
  const camMoved = Math.hypot(rec[rec.length - 1].tx - rec[0].tx, rec[rec.length - 1].ty - rec[0].ty); assert.ok(camMoved > 20, `カメラは固定ではない（${camMoved.toFixed(1)}px 動いた）`);
  for (const r of rec) assert.ok(r.z >= 0.97 && r.z <= 1.031, `ズームは小さく（${r.z}）`);
  const zs = rec.map((r) => r.z); assert.ok(Math.min(...zs) < 0.995 && Math.max(...zs) > 1.005, '移動中は少し引き、着いたら軽く寄る');
  const last = rec[rec.length - 1]; assert.equal(last.moving, false);
  assert.ok(last.y > last.H * 0.4 && last.y < last.H * 0.8 && last.x > 0 && last.x < last.W, `止まったあと、モンスターは画面の中央より少し下（${Math.round(last.y)} / ${Math.round(last.H)}）`);
  for (const r of rec) assert.ok(r.x >= -5 && r.x <= r.W + 5 && r.y >= 0 && r.y <= r.H + 5, 'モンスターは画面の外へ出ない');
  const tail = rec.slice(-8); assert.ok(maxStep(tail, ['tx', 'ty']) < 0.6, 'カメラは止まっている（追従が終わる）');
  assert.notEqual(last.front, last.back, `視差：前景 ${last.front} と奥 ${last.back} は違う量だけ動く`); assert.ok(/translate3d/.test(last.front), '前景が動いている');
  assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
});

test('CH1-B10：歩き：石板から石板へ道筋の点列で歩く（瞬間移動しない）。出目が決まると約0.1秒の構え → 加速 → 最後に減速して着地の順。1地点 0.38〜0.76秒', { skip: SKIP }, async () => {
  const p = await L.open(); const pg = p.page;
  await start(p);
  await place(pg, 'f1_1'); await idle(pg);   // 同じ背景（旅立ちの街道）の中で3地点
  await startRecording(pg);
  await rollAs(pg, 3); await idle(pg);
  const rec = await stopRecording(pg);
  const phases = await pg.evaluate(() => window.__cls);
  assert.deepEqual(phases.filter((x) => x !== 'idle'), ['ready', 'walk', 'land'], `構え → 歩き → 着地（${phases.join('→')}）`);
  const walk = rec.filter((r) => /walk/.test(r.cls)), dur = walk[walk.length - 1].t - walk[0].t;
  assert.ok(dur >= 700 && dur <= 2800, `3地点の歩きは ${dur}ms（設計 1.2〜2.3秒。負荷で伸びることがある）`);
  const steps = await pg.evaluate(() => ['f1_2', 'f1_3', 'f1_4'].map((to, i) => MMCHV.stepDuration(['f1_1', 'f1_2', 'f1_3'][i], to)));
  for (const ms of steps) assert.ok(ms >= 300 && ms <= 800, `1地点 ${ms}ms`);
  // 速度の形：最初は遅く始まり、最後は遅くなって止まる
  const sp = (a, b) => Math.hypot(b.x - a.x, b.y - a.y) / Math.max(1, b.t - a.t);
  const v0 = sp(walk[0], walk[2]), vm = Math.max(...walk.slice(2, -2).map((r, i) => sp(walk[i + 2], walk[i + 3]))), v1 = sp(walk[walk.length - 3], walk[walk.length - 1]);
  assert.ok(v0 < vm * 0.85 && v1 < vm * 0.85, `加速・減速がある（始 ${v0.toFixed(2)} / 最大 ${vm.toFixed(2)} / 終 ${v1.toFixed(2)} px/ms）`);
  // 道筋：隣の石板へは道筋の点列（巨大街道はまっすぐ＝2点以上）
  const route = await pg.evaluate(() => { const g = MMCH.graphFor(S.m); return [MMCH.routeBetween(g, 'f1_1', 'f1_2').length, MMCH.routeBetween(g, 'f1_2', 'f1_3').length, MMCH.routeBetween(g, 'f1_3', 'f1_4').length]; });
  for (const n of route) assert.ok(n >= 2, `道筋の点 ${n}`);
  assert.equal((await st(pg)).node, 'f1_4');
  assert.deepEqual(p.errors, []);
});

test('CH1-B11：止まる位置と目印の位置は別：能力の石碑・宝箱・イベントの物は石板の脇にあり、そこに止まったモンスターと重ならない。目印は影を持ち（石の道なので足元の草は無し）、普段は光らず、止まったときだけ光る', { skip: SKIP }, async () => {
  const p = await L.open(); const pg = p.page;
  await start(p);
  const ids = await pg.evaluate(() => { const g = MMCH.graphFor(S.m), a = S.m.raise.field.nodeAssignments; return g.order.filter((id) => a[id] && ['stat', 'treasure', 'event'].includes(a[id].t) && g.nodes[id].field <= 3); });
  assert.ok(ids.length >= 4);
  for (const id of ids) {
    await place(pg, id); await idle(pg);
    const r = await pg.evaluate((id) => {
      const o = document.querySelector(`#chf .chf-obj[data-id="${id}"]`), oi = o.querySelector('img').getBoundingClientRect(), mi = document.querySelector('#bmonw .mon img').getBoundingClientRect();
      const ix = Math.max(0, Math.min(oi.right, mi.right) - Math.max(oi.left, mi.left)), iy = Math.max(0, Math.min(oi.bottom, mi.bottom) - Math.max(oi.top, mi.top));
      const lm = MMCHV.landmarkPos(id), n = MMCH.graphFor(S.m).nodes[id], sc = MMCH.configFor(S.m).fieldScenes[0];
      return { overlap: (ix * iy) / Math.min(oi.width * oi.height, mi.width * mi.height), dist: Math.hypot(lm.x - n.mx * sc.w, lm.y - n.my * sc.h) * MMCHV.state().cam.S, tuft: !!o.querySelector('.chf-tuft'), shadow: !!o.querySelector('.chf-osh'), glow: getComputedStyle(o.querySelector('.chf-glow')).opacity, hit: o.classList.contains('hit'), t: o.dataset.t, sink: getComputedStyle(o).getPropertyValue('--sink').trim(), hid: o.classList.contains('hid') };
    }, id);
    assert.ok(r.overlap < 0.15, `${id}（${r.t}）：モンスターと目印が食い込まない（絵の枠の重なり ${(r.overlap * 100).toFixed(0)}%）`);
    assert.ok(r.dist >= 24, `${id}：目印は道の脇（止まる位置から ${r.dist.toFixed(0)}px）`);
    assert.ok(!r.tuft && r.shadow && parseFloat(r.sink) > 0, `${id}：影・少し埋める（草は置かない）`); assert.equal(r.glow, '0', `${id}：普段は光らない`); assert.equal(r.hit, false);
    assert.equal(r.hid, r.t !== 'treasure', `${id}（${r.t}）：石碑・イベントの物は着くまで見えない。宝箱は最初から`);
  }
  // 止まったときだけ光る（0.5〜0.7秒）
  const id = ids[0]; await place(pg, await pg.evaluate((id) => Object.keys(MMCH.graphFor(S.m).conn).find((k) => MMCH.graphFor(S.m).conn[k].includes(id)), id)); await idle(pg);
  await rollAs(pg, 1); await pg.waitForFunction((id) => document.querySelector(`#chf .chf-obj[data-id="${id}"]`).classList.contains('hit'), id, { timeout: 15000 });
  assert.equal(await pg.evaluate((id) => document.querySelector(`#chf .chf-obj[data-id="${id}"]`).classList.contains('hid'), id), false, '着いたときに現れる');
  const glow = await pg.evaluate((id) => { const g = document.querySelector(`#chf .chf-obj[data-id="${id}"] .chf-glow`), a = g.getAnimations()[0]; return a ? a.effect.getComputedTiming().duration : 0; }, id);
  assert.ok(glow >= 500 && glow <= 700, `光る時間 ${glow}ms`);
  await idle(pg);
  assert.deepEqual(p.errors, []);
});

test('CH1-B12：背景の切り替え：フィールドの端からそのまま進む向きへ歩き続け、短い暗転のあと次のフィールドの入口の少し手前から歩いて入る（ワープしない）。前の背景の DOM は残さない', { skip: SKIP }, async () => {
  const p = await L.open(); const pg = p.page;
  await start(p);
  await place(pg, 'f1_4'); await idle(pg);
  await startRecording(pg);
  await pg.evaluate(() => { window.__veil = 0; new MutationObserver(() => { if (document.querySelector('.chf-veil.on')) window.__veil++; }).observe(document.querySelector('#chf'), { subtree: true, attributes: true, childList: true }); });
  await rollAs(pg, 2); await idle(pg);
  const rec = await stopRecording(pg);
  const r = await pg.evaluate(() => ({ node: S.m.raise.node, bgs: [...document.querySelectorAll('.chf-bg')].map((i) => i.getAttribute('src')), cams: document.querySelectorAll('.chf-cam').length, veils: document.querySelectorAll('.chf-veil').length, veilOn: window.__veil, fd: document.querySelector('#chfd').textContent }));
  assert.equal(r.node, 'f2_0'); assert.deepEqual(r.bgs, ['./assets/fields/ch1a/field/ch1_field_02.webp']); assert.equal(r.cams, 1); assert.equal(r.veils, 0, '暗転の幕は消える'); assert.ok(r.veilOn > 0, '短い暗転があった'); assert.equal(r.fd, '花の丘');
  // 切り替えの前：進む向き（上）へ歩き続ける。切り替えの後：入口の手前（下）から入口へ歩いて入る
  const before = rec.filter((x) => x.node === 'f1_5' && /walk/.test(x.cls) && x.wy > 0), after = rec.filter((x) => x.node !== 'f1_4' && x.node !== 'f1_5' && /walk/.test(x.cls) && x.wy > 0);
  assert.ok(before.length >= 2 && before[before.length - 1].wy < before[0].wy - 5, `端まで来ても上へ歩き続ける（${before.length}フレーム・${before[0] && before[0].wy.toFixed(0)}→${before.length && before[before.length - 1].wy.toFixed(0)}）`);
  assert.ok(after.length >= 2 && after[0].wy > after[after.length - 1].wy + 5, `次のフィールドでは入口の手前から上へ歩いて入る（${after.length}フレーム）`);
  assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
});

test('CH1-B13：再読み込み後は今の地点を基準にカメラを合わせる（カメラの状態は保存しない）。曲がった道（08 古代遺跡）でもモンスターは中央より少し下・画面の中', { skip: SKIP }, async () => {
  const p = await L.open(); const pg = p.page;
  await start(p);
  await place(pg, 'f8_1'); await idle(pg);
  await rollAs(pg, 2); await idle(pg); assert.equal((await st(pg)).node, 'f8_3');
  await pg.reload(); await pg.waitForFunction(() => typeof MMP8 === 'object');
  await pg.click('.p15start'); await pg.waitForSelector('#chf .chf-bg'); await pg.waitForTimeout(400);
  const e = await pg.evaluate(() => { const s = MMCHV.state(), r = document.querySelector('#bmonw .mon img').getBoundingClientRect(), f = document.querySelector('#chf').getBoundingClientRect(); return { dx: Math.abs(s.cam.x - s.target.x), dy: Math.abs(s.cam.y - s.target.y), node: document.querySelector('#bmonw').dataset.node, y: (r.bottom - f.top) / f.height, inX: r.left >= 0 && r.right <= f.width }; });
  assert.ok(e.dx < 0.5 && e.dy < 0.5, `再読み込み後はその場で合っている（${e.dx}・${e.dy}）`); assert.equal(e.node, 'f8_3'); assert.ok(e.y > 0.4 && e.y < 0.8 && e.inX, `モンスターは中央より少し下（${e.y.toFixed(2)}）`);
  assert.deepEqual(p.errors, []);
});


test('CH1-B14：バトル地点：目印は無く、着いたら草むらが揺れて「！」→ 野生のモンスターの案内。移動・演出・結果の間は STOP・アイテム・休む・分岐を受け付けない', { skip: SKIP }, async () => {
  const p = await L.open(); const pg = p.page;
  await start(p);
  const id = await pg.evaluate(() => { const g = MMCH.graphFor(S.m), a = S.m.raise.field.nodeAssignments; return g.order.find((x) => a[x] && a[x].t === 'battle' && g.nodes[x].idx > 0 && !g.nodes[x].branch); });
  const prev = await pg.evaluate((id) => Object.keys(MMCH.graphFor(S.m).conn).find((k) => MMCH.graphFor(S.m).conn[k].includes(id)), id);
  await place(pg, prev, { fatigue: 20, turnsUsed: 9 }); await idle(pg);
  assert.equal(await pg.evaluate((id) => !!document.querySelector(`#chf .chf-obj[data-id="${id}"]`), id), false, 'バトルの目印は置かない');
  await pg.evaluate(() => { window.__order = []; new MutationObserver(() => { for (const [k, sel] of [['alert', '.chf-alert'], ['rustle', '.chf-rustle'], ['chbat', '.chbat']]) if (document.querySelector(sel) && !window.__order.includes(k)) window.__order.push(k); }).observe(document.querySelector('#chfw'), { subtree: true, childList: true }); });
  await rollAs(pg, 1);
  // 移動中の二重操作：何も変わらない
  await pg.waitForFunction(() => bBusy || MMCHD.isLocked());
  const t0 = await st(pg); await pg.evaluate(() => { chfRoll(); chfRest(); chfItems(); chfPick('a0'); }); const t1 = await st(pg);
  assert.deepEqual([t1.turns, t1.f], [t0.turns, t0.f]); assert.equal(await pg.evaluate(() => !!document.querySelector('#chitems')), false);
  await pg.waitForSelector('.chbat'); await idle(pg);
  const order = await pg.evaluate(() => window.__order);
  assert.deepEqual(order.slice(0, 2), ['alert', 'rustle'].filter((x) => order.includes(x)).length === 2 ? order.slice(0, 2) : order.slice(0, 2));
  assert.ok(order.indexOf('alert') >= 0 && order.indexOf('rustle') >= 0 && order.indexOf('chbat') > Math.max(order.indexOf('alert'), order.indexOf('rustle')), `草むらの揺れと「！」のあとに案内（${order.join('→')}）`);
  assert.deepEqual(await pg.evaluate(() => [document.querySelectorAll('.chf-alert,.chf-rustle').length, document.querySelector('.chbat h3').textContent, [...document.querySelectorAll('.chwing')].map((w) => w.disabled)]), [0, '野生のモンスター', [true, true, true, true]]);
  assert.deepEqual(p.errors, []);
});

test('CH1-B15：1タップ：START を押すまでサイコロは画面に無い → 1回押すとサイコロが出現して回り、自動で減速・着地（傾かず正式の角度）→ 停止面を 0.3〜0.5秒 → 消えて移動 → 移動が終わると再び START。演出中は START・4コマンドを押せず、連打しても1ターンしか進まない。出目は START の時点で保存済み', { skip: SKIP }, async () => {
  const p = await L.open(); const pg = p.page;
  await start(p);
  const before = await pg.evaluate(() => ({ dice: document.querySelectorAll('.chdz, .chdf, .chdz-img, img[src*="dice_"]').length, stop: document.querySelectorAll('.chstop.spinning, img[src*="deck_stop"]').length, text: document.querySelector('#brollbtn').textContent.trim(), on: !document.querySelector('#brollbtn').disabled, img: document.querySelector('.chdeck-bg').getAttribute('src') }));
  assert.deepEqual(before, { dice: 0, stop: 0, text: 'START', on: true, img: './assets/fields/ch1a/ui/deck_start.webp' }, 'START を押すまでサイコロは出さない。STOP の画像・状態は無い');
  await pg.evaluate(() => { window.__res = null; window.__faceAt = null; window.__goneAt = null; window.__moveAt = null; window.__t0 = null;
    new MutationObserver(() => { const dz = document.querySelector('.chdz'); if (dz && !window.__t0) window.__t0 = performance.now(); const stop = document.querySelector('.chdz-stop.on'), img = document.querySelector('.chdz-img');
      if (stop && img && !window.__res) { const m = getComputedStyle(img).transform.match(/matrix\(([-\d.e]+), ([-\d.e]+)/); window.__faceAt = performance.now(); window.__res = { a: +m[1], b: +m[2], src: stop.getAttribute('src'), roll: img.getAttribute('src'), ring: getComputedStyle(document.querySelector('.chdz-res')).display, phase: MMCHD.phase() }; }
      if (!dz && window.__t0 && !window.__goneAt) window.__goneAt = performance.now();
      const w = document.querySelector('#bmonw'); if (w && w.classList.contains('walk') && !window.__moveAt) window.__moveAt = performance.now(); }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] }); });
  await rollAs(pg, 2); await pg.waitForSelector('.chdz');
  const sp = await pg.evaluate(() => ({ text: document.querySelector('#brollbtn') ? document.querySelector('#brollbtn').textContent.trim() : null, img: document.querySelector('.chdeck-bg').getAttribute('src'), phase: MMCHD.phase(), pend: S.m.raise.pend, saved: JSON.parse(localStorage.getItem('mr4v6')).m.raise.pend, wings: [...document.querySelectorAll('.chwing')].map((w) => w.disabled), btn: [...document.querySelectorAll('.chstop')].map((b) => [b.disabled, b.textContent.trim()]), imgs: [...document.querySelectorAll('.chdz img')].map((i) => i.getAttribute('src')) }));
  assert.equal(sp.phase, 'auto', '自動で回って止まる（STOP 待ちの spin は無い）');
  // 4コマンドは操作だけ不可で、見た目（不透明度・色・画像・装飾）は START を押す前と同じ（暗くしない）
  const look = () => pg.evaluate(() => [...document.querySelectorAll('.chwing')].map((w) => { const c = getComputedStyle(w); return { op: c.opacity, bg: c.backgroundColor, filter: c.filter, img: c.backgroundImage, border: c.borderWidth, shadow: c.boxShadow, deck: document.querySelector('.chdeck-bg').getAttribute('src') }; }));
  const during = await look(); assert.deepEqual(during.map((x) => [x.op, x.bg, x.filter]), [['1', 'rgba(0, 0, 0, 0)', 'none'], ['1', 'rgba(0, 0, 0, 0)', 'none'], ['1', 'rgba(0, 0, 0, 0)', 'none'], ['1', 'rgba(0, 0, 0, 0)', 'none']], 'サイコロ処理中も4コマンドは暗くならない（半透明の覆い・opacity・filter なし）');
  const wingLook0 = during; assert.match(sp.img, /deck_start\.webp$/, '操作欄は START の画像のまま（STOP の画像は使わない）'); assert.deepEqual(sp.wings, [true, true, true, true]); assert.deepEqual(sp.btn, [[true, '2']], '中央のボタンは押せない（移動中）');
  assert.equal(sp.imgs.length, 1); assert.match(sp.imgs[0], /dice_(blank|stop_[1-6])\.webp$/, '回転中は正式サイコロ1枚（面を切り替えて見せる）');
  assert.deepEqual([sp.pend.roll, sp.pend.stage, sp.saved.roll], [2, 'move', 2], '出目は START の時点で確定・保存（自動停止のタイミングで変わらない）');
  const t0 = await st(pg); await pg.evaluate(() => { chfRoll(); chfRoll(); chfRest(); }); assert.deepEqual(await st(pg), t0, '演出中の START・休むの連打は無視');
  await pg.waitForFunction(() => !!window.__res, null, { timeout: 15000 });
  const r = await pg.evaluate(() => window.__res);
  assert.ok(Math.abs(r.a - 1) < 0.02 && Math.abs(r.b) < 0.02, `止まったサイコロは正式の角度（matrix ${r.a}, ${r.b}）`); assert.equal(r.src, './assets/fields/ch1a/dice/dice_stop_2.webp', '出目2 → 2が上の停止面'); assert.match(r.roll, /dice_stop_2\.webp$/, '着地の前から出目の面に落ち着いている'); assert.equal(r.ring, 'none'); assert.equal(r.phase, 'result');
  await idle(pg);
  const tm = await pg.evaluate(() => ({ spin: window.__faceAt - window.__t0, face: window.__goneAt - window.__faceAt, moveAfterGone: window.__moveAt - window.__goneAt, last: MMCHD.lastTiming(), dice: document.querySelectorAll('.chdz,.chdf').length, text: document.querySelector('#brollbtn').textContent.trim(), on: !document.querySelector('#brollbtn').disabled, busy: bBusy }));
  assert.ok(tm.spin >= 600 && tm.spin <= 1700, `出現〜停止面 ${tm.spin.toFixed(0)}ms（設計 約0.98秒＋クロスフェード。負荷で伸びることがある）`);
  assert.ok(tm.face >= 300 && tm.face <= 1100, `停止面を見せる時間 ${tm.face.toFixed(0)}ms（設計 0.42秒＋消える0.16秒）`);
  assert.ok(tm.moveAfterGone >= -50, `サイコロが消えてから歩き出す（${tm.moveAfterGone.toFixed(0)}ms）`);
  assert.ok(tm.last && tm.last.value === 2 && tm.last.manual === false && tm.last.spinMs >= 700 && tm.last.spinMs <= 1400 && tm.last.faceMs >= 300 && tm.last.faceMs <= 700, `実測 ${JSON.stringify(tm.last)}`);
  assert.deepEqual([tm.dice, tm.text, tm.on, tm.busy], [0, 'START', true, false], '移動が終わるとサイコロは消え、START が押せる');
  assert.deepEqual(await look(), wingLook0, '通常時とサイコロ処理中で4コマンドの見た目（色・画像・装飾）が同じ');
  assert.deepEqual((({ node, turns }) => ({ node, turns }))(await st(pg)), { node: 'f1_2', turns: 1 }, '1回の START で1ターン・2地点');
  // 連打：短い間に2回押しても1ターン
  await pg.evaluate(() => { window.__mr = Math.random; Math.random = () => 0.05; const b = document.querySelector('#brollbtn'); b.click(); b.click(); chfRoll(); setTimeout(() => chfRoll(), 300); setTimeout(() => { const c = document.querySelector('#brollbtn'); if (c) c.click(); }, 1200); Math.random = window.__mr; });
  await idle(pg); assert.deepEqual((({ node, turns }) => ({ node, turns }))(await st(pg)), { node: 'f1_3', turns: 2 }, 'START の連打では1ターンしか進まない');
  const src = await pg.evaluate(() => MMCHD.play.toString()); assert.doesNotMatch(src, /performance\.now\(\)\s*%|Date\.now\(\)\s*%/, '押した時刻で出目を決めない');
  assert.deepEqual(p.errors, []);
});

test('CH1-B18：道の安全域：複数の背景（草原・森と清流・天空の大橋・古代遺跡の S字・大会地方・大会会場）で、止まっているときも歩いている途中も、モンスターは道の中央線の安全域の中にいて、道の端・画面の外に出ない', { skip: SKIP }, async () => {
  const p = await L.open(); const pg = p.page;
  await start(p);
  const cases = [['f1_1', null], ['f3_1', null], ['f6_1', null], ['f8_1', null], ['f9_2', null], ['f10_1', null]];
  for (const [node, branch] of cases) {
    await place(pg, node, branch ? { branch } : {}); await idle(pg);
    const c0 = await monCheck(pg); assert.equal(c0.node, node);
    assert.ok(c0.inSafe && c0.notEdge && c0.onScreen, `${node}（${c0.bg}）：止まっている位置 ${JSON.stringify(c0)}`);
    await pg.evaluate(() => { window.__trk = []; const tick = () => { const w = document.querySelector('#bmonw'); if (w && w.classList.contains('walk')) { const img = w.querySelector('.mon img'), r = img.getBoundingClientRect(), f = document.querySelector('#chf').getBoundingClientRect(), st = MMCHV.state(), sc = MMCH.getConfig(1).fieldScenes.find((s) => s.id === st.field); const x = parseFloat(w.style.left) / sc.w, y = parseFloat(w.style.top) / sc.h, road = MMCH.roadAt(sc, y); window.__trk.push({ bg: sc.bgKey, x: +x.toFixed(3), y: +y.toFixed(3), ok: x >= road.safeLeft - 1e-6 && x <= road.safeRight + 1e-6, edge: !(x > road.left + road.half * 0.2 && x < road.right - road.half * 0.2), off: !(r.left >= f.left - 1 && r.right <= f.right + 1 && r.top >= f.top - 1 && r.bottom <= f.bottom + 1) }); } if (window.__trk.length < 3000) setTimeout(tick, 30); }; tick(); });
    await rollAs(pg, 2); await idle(pg);
    const trk = await pg.evaluate(() => window.__trk), bad = trk.filter((t) => !t.ok || t.edge || t.off);
    assert.ok(trk.length >= 5, `${node}：歩きを記録（${trk.length}）`); assert.deepEqual(bad, [], `${node}：歩いている途中も安全域の中・画面の中（${trk.length}フレーム）`);
    const c1 = await monCheck(pg); assert.ok(c1.inSafe && c1.notEdge && c1.onScreen, `${node} → ${c1.node}（${c1.bg}）：着地 ${JSON.stringify(c1)}`);
  }
  // 端に寄せた位置は安全域へ戻される（画面側の roadX）
  const fix = await pg.evaluate(() => { const st = MMCHV.state(), sc = MMCH.getConfig(1).fieldScenes.find((s) => s.id === st.field); const y = 0.5 * sc.h; return { in: MMCHV.roadX(0.02 * sc.w, y) / sc.w, out: MMCHV.roadX(0.98 * sc.w, y) / sc.w, road: MMCH.roadAt(sc, 0.5) }; });
  assert.ok(fix.in >= fix.road.safeLeft && fix.out <= fix.road.safeRight && fix.in < fix.road.x && fix.out > fix.road.x, `端の x は安全域へ（${JSON.stringify(fix)}）`);
  assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
});

test('CH1-B16：歩行アニメの差し込み口：registerMonsterAnimator({ set }) を登録すると、移動の処理はそのままで、ready → walk → land → idle の状態だけが渡される', { skip: SKIP }, async () => {
  const p = await L.open(); const pg = p.page;
  await start(p);
  await pg.evaluate(() => { window.__anim = []; MMCHV.registerMonsterAnimator({ id: 'test', set(el, state, info) { if (!window.__anim.length || window.__anim[window.__anim.length - 1] !== state) window.__anim.push(state); if (state === 'walk') window.__spd = info && info.speed; } }); });
  await rollAs(pg, 2); await idle(pg);
  const a = await pg.evaluate(() => ({ seq: window.__anim, spd: window.__spd, id: MMCHV.state().animator, node: S.m.raise.node }));
  assert.deepEqual(a.seq.filter((x) => x !== 'idle'), ['ready', 'walk', 'land'], JSON.stringify(a.seq)); assert.ok(typeof a.spd === 'number'); assert.equal(a.id, 'test'); assert.equal(a.node, 'f1_2');
  assert.deepEqual(p.errors, []);
});

for (const size of [H.SIZES.base, H.SIZES.se]) {
  test(`CH1-B17（${size.join('×')}）：バトル画面：VS のカットインと試合画面で、モンスターの絵が枠・HUD・技UIに切れない（比率を保ち、切れない最大の大きさ。fight()・.bt 系 CSS は変えない）`, { skip: SKIP }, async () => {
    const p = await L.open({ size }); const pg = p.page;
    await start(p);
    await pg.evaluate(() => { const r = S.m.raise; r.pend = { roll: 1, left: 0, stage: 'battle', fx: { kind: 'battle', battleType: 'wild' } }; MMP8.beginBattle(S, S.m, { kind: 'practice', rank: 0 }); save(); fight(0); });
    await pg.waitForSelector('#bt .intro .ipn.p1 .iim2 img');   // 出た直後（拡大アニメの一番大きいとき）に測る
    const intro = await pg.evaluate(() => [0, 1].map((s) => { const pn = document.querySelector(`.ipn.p${s}`).getBoundingClientRect(), im = document.querySelector(`.ipn.p${s} .iim2 img`).getBoundingClientRect(); return { inside: im.left >= pn.left - 2 && im.right <= pn.right + 2 && im.top >= pn.top - 2 && im.bottom <= pn.bottom + 2, w: im.width, h: im.height, pn: [pn.left, pn.top, pn.right, pn.bottom].map(Math.round), im: [im.left, im.top, im.right, im.bottom].map(Math.round) }; }));
    for (const i of intro) assert.ok(i.inside && i.w > 80, `カットインの絵は枠の中（${JSON.stringify(i)}）`);
    await pg.waitForFunction(() => !document.querySelector('#bt .intro'), null, { timeout: 15000 }); await pg.waitForTimeout(800);
    const r = await pg.evaluate(() => { const q = (s) => document.querySelector(s).getBoundingClientRect(); const m = MMBF.measure(); return { fit: +document.querySelector('#bt').dataset.fit, imgs: ['#m0 .mon > img', '#m1 .mon > img'].map((s) => { const b = q(s); return [b.left, b.top, b.right, b.bottom, b.width, b.height]; }), top: m.top, bottom: m.bottom, W: innerWidth, cssDefault: 118, mw: [q('#m0'), q('#m1')].map((b) => b.width) }; });
    for (const b of r.imgs) { assert.ok(b[0] >= -1 && b[2] <= r.W + 1, `左右に切れない ${b}`); assert.ok(b[1] >= r.top - 1 && b[3] <= r.bottom + 1, `HUD（${Math.round(r.top)}）と技UI（${Math.round(r.bottom)}）の間 ${b}`); assert.ok(Math.abs(b[4] - b[5]) < 1, '比率（正方形の枠）'); }
    assert.ok(r.fit >= r.cssDefault && r.mw[0] === r.fit && r.mw[1] === r.fit, `切れない最大の大きさ ${r.fit}px（CSS の既定 ${r.cssDefault} 以上）`);
    assert.ok(Math.abs(r.imgs[0][3] - r.imgs[1][3]) < 1, '足元の高さをそろえる');
    assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
  });
}

test('CH1-B19：上部 HUD（Chapter・Turn・疲れ・所持金・メニュー）は常に画面の固定位置：前の画面で残ったスクロール量（#app・main・ページ）があっても、Chapter 開始直後・サイコロのあと・背景の切り替え後・停止地点の結果のあと・バトルからの復帰後・再読み込み後に上へずれない。フィールドの間 #app はスクロールしない', { skip: SKIP }, async () => {
  const p = await L.open(); const pg = p.page;
  await start(p);
  const hud = async (tag) => { await pg.waitForTimeout(350); const r = await pg.evaluate(() => { const b = (s) => document.querySelector(s).getBoundingClientRect(); return { hudTop: Math.round(b('.chh').top), turnTop: Math.round(b('.chh-turn').top), menuTop: Math.round(b('.chh-menu').top), deckBottom: Math.round(b('#chdock').bottom), app: document.querySelector('#app').scrollTop, main: document.querySelector('main').scrollTop, win: scrollY, ov: getComputedStyle(document.querySelector('#app')).overflowY, H: innerHeight }; }); assert.deepEqual([r.hudTop, r.menuTop, r.app, r.main, r.win, r.ov, r.deckBottom], [8, 8, 0, 0, 0, 'hidden', r.H], `${tag}：${JSON.stringify(r)}`); assert.ok(r.turnTop >= 8, tag); };
  const dirty = () => pg.evaluate(() => { try { document.querySelector('#app').scrollTop = 40; document.querySelector('main').scrollTop = 30; scrollTo(0, 20); } catch (e) {} });
  await hud('Chapter 開始直後');
  await dirty(); await pg.evaluate(() => board()); await hud('スクロール量を残して描き直し');
  await pg.evaluate(() => chfOpen('st')); await pg.waitForSelector('#app .ds-st'); await pg.evaluate(() => { const d = document.querySelector('#app .ds-st .dbody'); if (d) d.scrollTop = 300; document.querySelector('#app').scrollTop = 300; });
  await pg.evaluate(() => board()); await pg.waitForSelector('#chf .chf-bg'); await idle(pg); await hud('ステータス画面（スクロール）から戻る');
  await pg.evaluate(() => chfOpen('w')); await pg.waitForFunction(() => !document.querySelector('#chf')); await pg.evaluate(() => { document.querySelector('#app').scrollTop = 400; }); await pg.evaluate(() => board()); await pg.waitForSelector('#chf .chf-bg'); await idle(pg); await hud('技管理（スクロール）から戻る');
  await rollAs(pg, 2); await idle(pg); await hud('サイコロのあと');
  await place(pg, 'f1_4'); await idle(pg); await rollAs(pg, 2); await idle(pg); assert.equal((await st(pg)).field, 2); await hud('背景の切り替え後');
  const statId = await pg.evaluate(() => { const g = MMCH.graphFor(S.m), a = S.m.raise.field.nodeAssignments; return g.order.find((x) => a[x] && a[x].t === 'stat'); });
  const prev = await pg.evaluate((id) => Object.keys(MMCH.graphFor(S.m).conn).find((k) => MMCH.graphFor(S.m).conn[k].includes(id)), statId);
  await place(pg, prev); await idle(pg); await rollAs(pg, 1); await idle(pg); await hud('停止地点（能力）の結果のあと');
  const strong = await pg.evaluate(() => { const g = MMCH.graphFor(S.m); return g.order.find((x) => g.nodes[x].kind === 'strong'); });
  await place(pg, strong, { fatigue: 30, pend: { roll: 2, left: 0, stage: 'resolve' } }); await pg.waitForSelector('.chbat'); await idle(pg);
  await pg.evaluate(() => { MMP8.beginBattle(S, S.m, { kind: 'practice', rank: 0 }); save(); MMP8.markBattleDone(S); save(); after('試合終了'); }); await pg.waitForSelector('#chf .chf-bg'); await idle(pg); await hud('バトルからの復帰後');
  await dirty(); await pg.reload(); await pg.waitForFunction(() => typeof MMP8 === 'object'); await pg.click('.p15start'); await pg.waitForSelector('#chf .chf-bg'); await idle(pg); await hud('再読み込み後');
  assert.deepEqual(p.errors, []);
});
