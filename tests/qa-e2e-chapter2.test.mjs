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
async function rollAs(pg, v) { await pg.evaluate((v) => { window.__mr = Math.random; Math.random = () => ({ 1: 0.1, 2: 0.5, 3: 0.9 }[v]); }, v);   // Chapter 2 のサイコロは 1〜3（2026-10-01 夜）
 await pg.click('#brollbtn'); await pg.evaluate(() => { Math.random = window.__mr; }); }
const place = (pg, node, extra = {}) => pg.evaluate(([node, extra]) => { const r = S.m.raise; r.node = node; r.pend = null; if (/^[ab]\d_/.test(node)) r.field.branch = node[0].toUpperCase(); Object.assign(r, extra); save(); board(); }, [node, extra]);
const st = (pg) => pg.evaluate(() => { const sc = MMCH.getConfig(2).fieldScenes.find((s) => s.id === MMCHV.state().field); return { node: S.m.raise.node, ch: S.m.raise.ch, turns: S.m.raise.turnsUsed, ph: MMP8.boardPhase(S.m), bg: document.querySelector('#chf .chf-bg').getAttribute('src'), bgKey: sc && sc.bgKey, stage: sc && sc.stage, name: document.querySelector('#chfd').textContent, hud: document.querySelector('.chh').innerText.replace(/\s+/g, ' ') }; });

test('CH2-B1：Chapter 1 を終えた個体が出発準備から Chapter 2 へ出発 → 俯瞰図 → Chapter 名「潮風の海岸」→ 海上・海中を経由してスタート地点へ寄る → 01 の実プレイ画面で START。導入は育成個体 × Chapter 2 の初回に1回（再読み込みでは出ない）。HUD は Chapter 2 / 4', { skip: SKIP }, async () => {
  const p = await open({ intro: true }); const pg = p.page;
  await toFarm(pg); await departUI(pg);
  await pg.waitForSelector('.chintro.on', { timeout: 8000 }); await pg.waitForTimeout(300);
  const a = await pg.evaluate(() => ({ src: document.querySelector('.chintro-img').getAttribute('src'), title: document.querySelector('.chintro-title').textContent.replace(/\s+/g, ' '), busy: bBusy, seen: S.m.raise.field.introSeen === true, ch: S.m.raise.field.chapterId }));
  assert.equal(a.src, './assets/fields/ch2a/intro/ch2_intro_overview_v2.webp', '正式な俯瞰図（演出専用。プレイの背景ではない）'); assert.ok(!(await pg.evaluate(() => MMCH.getConfig(2).fieldScenes.some((s) => /intro/.test(s.bg)))), '俯瞰図は背景の順に入れない'); assert.match(a.title, /Chapter 2.*潮風の海岸/); assert.deepEqual([a.busy, a.seen, a.ch], [true, true, 2]);
  await pg.waitForFunction(() => !document.querySelector('.chintro'), null, { timeout: 15000 }); await idle(pg);
  const b = await st(pg); assert.deepEqual([b.node, b.ch, b.bgKey, b.stage, b.name], ['s1_0', 2, '01', 'coast', '海辺の遊歩道']); assert.match(b.hud, /Chapter 2 \/ 4.*潮風の海岸/);
  assert.equal(await pg.evaluate(() => !document.querySelector('#brollbtn').disabled && document.querySelector('#brollbtn').textContent.trim() === 'START'), true);
  await pg.reload(); await pg.waitForFunction(() => typeof MMP8 === 'object'); await pg.click('.p15start'); await pg.waitForSelector('#chf .chf-bg'); await pg.waitForTimeout(700);
  assert.equal(await pg.evaluate(() => !!document.querySelector('.chintro')), false, '再読み込みでは出さない'); assert.equal((await st(pg)).node, 's1_0');
  assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
});

test('CH2-B2：START の1タップで出目（1〜3）のぶん1地点ずつ進み、背景は 01 → … → 09 → 会場前 の順にだけ切り替わる（海上 → 海中 → 海上。戻らない・飛ばさない・各1回）。歩いている途中も止まっても道の安全域の中・画面の中（390×844・375×667）', { skip: SKIP }, async () => {
  for (const size of [[390, 844], [375, 667]]) {
  const p = await open({ size }); const pg = p.page;
  await toFarm(pg); await departUI(pg); await idle(pg);
  await rollAs(pg, 3); await pg.waitForSelector('.chdz'); await idle(pg);
  const a = await st(pg); assert.deepEqual([a.node, a.turns, a.bgKey], ['s1_3', 1, '01'], '3地点進む（同じ背景の中）');
  await place(pg, 's1_6'); await idle(pg); await rollAs(pg, 3); await idle(pg);
  const b = await st(pg); assert.deepEqual([b.node, b.bgKey, b.name], ['s2_1', '02', '白砂の浜道'], '背景の切り替え：01 の奥 → 02');
  // 道の安全域：いくつかの背景で歩きを記録
  await pg.evaluate(() => { window.__trk = []; const tick = () => { const w = document.querySelector('#bmonw'); if (w && w.classList.contains('walk')) { const img = w.querySelector('.mon img'), r = img.getBoundingClientRect(), f = document.querySelector('#chf').getBoundingClientRect(), stt = MMCHV.state(), sc = MMCH.getConfig(2).fieldScenes.find((s) => s.id === stt.field); const x = parseFloat(w.style.left) / sc.w, y = parseFloat(w.style.top) / sc.h, road = MMCH.roadAt(sc, y); window.__trk.push({ bg: sc.bgKey, ok: x >= road.safeLeft - 1e-6 && x <= road.safeRight + 1e-6, off: !(r.left >= f.left - 1 && r.right <= f.right + 1 && r.top >= f.top - 1 && r.bottom <= f.bottom + 1) }); } if (window.__trk.length < 5000) setTimeout(tick, 30); }; tick(); });
  const seen = [];
  for (const node of ['s2_7', 's3_5', 's4_8', 's5_6', 'a6_2', 'a7_3', 'm7_0', 's8_6', 's9_7']) { await place(pg, node); await idle(pg); await rollAs(pg, 2); await idle(pg); const s = await st(pg); seen.push([node, s.node, s.bgKey, s.stage]); }
  assert.deepEqual(seen.map((x) => x[1]), ['s3_1', 's4_1', 's5_1', 's6_1', 'a7_1', 's8_0', 's8_1', 's9_1', 'sa_1'], `2地点ずつ（${JSON.stringify(seen)}）`);
  assert.deepEqual(seen.map((x) => x[2]), ['03', '04', '05', '06', '07', '08', '08', '09', '10'], `背景の切り替えは順番どおり（${JSON.stringify(seen)}）`);
  assert.deepEqual(seen.map((x) => x[3]), ['coast', 'coast', 'coast', 'undersea', 'undersea', 'undersea', 'undersea', 'late', 'arena'], '海上 → 海中 → 海上 → 会場前');
  const trk = await pg.evaluate(() => window.__trk), bad = trk.filter((t) => !t.ok || t.off);
  assert.ok(trk.length >= 20 && new Set(trk.map((t) => t.bg)).size >= 8, `歩きを複数の背景で記録（${trk.length}）`); assert.ok(['06', '07', '08'].every((k) => trk.some((t) => t.bg === k)), '海中の区間も記録'); assert.deepEqual(bad, [], `${size}：歩いている途中も安全域・画面の中`);
  // ルート全体：段階は単調・背景は各1回（グラフ）
  const order = await pg.evaluate(() => { const g = MMCH.graphFor(S.m), cfg = MMCH.getConfig(2); return g.routes[1].seq.map((id) => cfg.fieldScenes.find((s) => s.id === g.nodes[id].field).bgKey).filter((v, i, a) => i === 0 || a[i - 1] !== v); });
  assert.deepEqual(order, ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10']);
  assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
  }
});

test('CH2-B3：会場前のゴール（大会会場の階段の手前）：出目がゴールを超えてもゴールで止まり、既存の公式大会のランク選択へ（E 優勝の個体は E・D）。ライバルは強制停止', { skip: SKIP }, async () => {
  const p = await open(); const pg = p.page;
  await toFarm(pg); await departUI(pg); await idle(pg);
  await place(pg, 'sa_0', { fatigue: 0, turnsUsed: 20 }); await idle(pg);
  await rollAs(pg, 3); await pg.waitForSelector('.chbat', { timeout: 20000 });
  assert.deepEqual(await pg.evaluate(() => [S.m.raise.node, S.m.raise.pend.left, document.querySelector('.chbat h3').textContent]), ['sa_2', 0, 'ライバル'], 'ライバルで止まり残りは消える');
  await pg.waitForTimeout(450); await pg.click('.chbat .p9btn2'); await idle(pg);
  await place(pg, 'sa_3', { fatigue: 10, turnsUsed: 22 }); await idle(pg);
  await rollAs(pg, 3); await pg.waitForSelector('.chgoal .p9rank', { timeout: 20000 }); await idle(pg);
  const r = await pg.evaluate(() => ({ node: S.m.raise.node, goal: S.m.raise.goal, ranks: [...document.querySelectorAll('.chgoal .p9rank')].map((b) => b.getAttribute('onclick')), locks: document.querySelectorAll('.chgoal .p9rlock').length, msg: document.querySelector('#bmsg').textContent }));
  assert.deepEqual([r.node, r.goal, r.ranks, r.locks], ['sa_4', true, ['p8TourStart(0,this)', 'p8TourStart(1,this)'], 4], 'ゴール → 既存の大会のランク選択（E・D）'); assert.match(r.msg, /大会会場に着いた/);
  assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
});

test('CH2-B4：分岐（06 の分かれ道）：選ぶ前はどちらの道の物も見せず、入口の印だけ。A／B を選ぶと選んだ道の物だけが現れ、選ばなかった道は通らない。分かれ道・分岐の途中で再読み込みしても状態を保つ。A・B とも合流して 08 へ（390×844・375×667）', { skip: SKIP }, async () => {
  for (const size of [[390, 844], [375, 667]]) for (const pick of ['a', 'b']) {
    const p = await open({ size }); const pg = p.page;
    await toFarm(pg); await departUI(pg); await idle(pg);
    // 分岐の道に必ず見える物（宝箱）を置いて、見え方を確かめる
    await pg.evaluate(() => { const f = S.m.raise.field; for (const id of Object.keys(f.nodeAssignments)) if (/^[ab][67]_/.test(id)) delete f.nodeAssignments[id]; f.nodeAssignments.a6_1 = { t: 'treasure', tier: 'normal' }; f.nodeAssignments.b6_2 = { t: 'treasure', tier: 'normal' }; });
    await place(pg, 's6_0', { fatigue: 0 }); await idle(pg);
    const vis = () => pg.evaluate(() => [...document.querySelectorAll('#chf .chf-obj')].filter((e) => getComputedStyle(e).display !== 'none' && !e.classList.contains('gone')).map((e) => e.dataset.id).filter((id) => /^[ab]/.test(id)));
    await rollAs(pg, 3); await pg.waitForSelector('.chbr .chroute', { timeout: 20000 }); await pg.waitForTimeout(600);
    const b = await pg.evaluate(() => ({ node: S.m.raise.node, left: S.m.raise.pend.left, opts: S.m.raise.pend.opts, labels: [...document.querySelectorAll('.chbr .chroute b')].map((x) => x.textContent), hints: [...document.querySelectorAll('.chf-brhint')].map((x) => x.dataset.id), branch: S.m.raise.field.branch }));
    assert.deepEqual(b, { node: 's6_2', left: 1, opts: ['a6_0', 'b6_0'], labels: ['左の回廊', '右の回廊'], hints: ['a6_0', 'b6_0'], branch: null }, '分かれ道で止まり、プレイヤーが選ぶ（入口の印だけ）');
    assert.deepEqual(await vis(), [], '選ぶ前はどちらの道の物も見せない');
    await pg.reload(); await pg.waitForFunction(() => typeof MMP8 === 'object'); await pg.click('.p15start'); await pg.waitForSelector('.chbr .chroute', { timeout: 20000 });
    assert.deepEqual(await pg.evaluate(() => [S.m.raise.node, S.m.raise.pend.stage, S.m.raise.pend.left]), ['s6_2', 'branch', 1], '分かれ道で再読み込みしても選ぶところから');
    await pg.waitForTimeout(450); await pg.click(`.chbr .chroute[onclick*="${pick}6_0"]`); await idle(pg);
    assert.deepEqual(await pg.evaluate(() => [S.m.raise.node, S.m.raise.field.branch, document.querySelectorAll('.chf-brhint').length]), [`${pick}6_0`, pick.toUpperCase(), 0]);
    assert.deepEqual(await vis(), [pick === 'a' ? 'a6_1' : 'b6_2'], '選んだ道の物だけ');
    const path = [];
    for (let k = 0; k < 12; k++) {
      if ((await pg.evaluate(() => S.m.raise.node)).startsWith('s8')) break;
      await pg.evaluate(() => { S.m.raise.fatigue = 0; }); await rollAs(pg, 2); await idle(pg);
      if (await pg.evaluate(() => !!document.querySelector('.chbat'))) { await pg.waitForTimeout(450); await pg.click('.chbat .p9btn2'); await idle(pg); }
      path.push(await pg.evaluate(() => S.m.raise.node));
      if (k === 0) { await pg.reload(); await pg.waitForFunction(() => typeof MMP8 === 'object'); await pg.click('.p15start'); await pg.waitForSelector('#chf .chf-bg'); await idle(pg); assert.deepEqual(await pg.evaluate(() => [S.m.raise.node, S.m.raise.field.branch]), [path[0], pick.toUpperCase()], '分岐の途中で再読み込みしても道を保つ'); assert.ok((await vis()).every((id) => id.startsWith(pick)), '再読み込み後も、選ばなかった道の物は出さない'); }
    }
    const other = pick === 'a' ? 'b' : 'a';
    assert.ok(path.every((id) => !id.startsWith(other)), `${size}・${pick}：選ばなかった道は通らない（${path.join(' ')}）`);
    assert.ok(path[path.length - 1].startsWith('s8'), `${pick}：合流して 08 へ（${path.join(' ')}）`);
    assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
  }
});

test('CH2-B5：Chapter 3 の解放条件（公式Cランク大会クリア）：届かない個体は Chapter 2 のあとファームで「Chapter 3 解放条件／公式Cランク大会クリア／このモンスターの育成はここまでです」→「育成を完了して街へ戻る」（2度押し）→ 育成完了画面 → 牧場へ。個体・能力・所持金はそのまま。条件を満たせば「Chapter 3へ進む」（390×844・375×667）', { skip: SKIP }, async () => {
  for (const size of [[390, 844], [375, 667]]) {
    const p = await open({ size }); const pg = p.page;
    await toFarm(pg); await departUI(pg); await idle(pg);
    // 40ターン目に会場へ届かない → ターン切れ → Chapter を終えてファームへ（既存の流れ）
    await place(pg, 's9_1', { fatigue: 0, turnsUsed: 39 }); await idle(pg); await rollAs(pg, 1); await idle(pg);
    await pg.waitForSelector('.chsheet button[onclick="p8EndChapter()"]', { timeout: 20000 }); await pg.waitForTimeout(300); await pg.click('.chsheet button[onclick="p8EndChapter()"]');
    await pg.waitForSelector('.fm .fmgo', { timeout: 20000 }); await pg.waitForTimeout(400);
    const before = await pg.evaluate(() => ({ uid: S.m.uid, name: S.m.name, po: S.m.po, li: S.m.li, g: S.g, sk: JSON.stringify(S.m.sk) }));
    const a = await pg.evaluate(() => { const b = document.querySelector('.fm .fmgo'), r = b.getBoundingClientRect(); return { state: S.m.raise.state, ch: S.m.raise.ch, reason: MMP8.canDepart(S, S.m).reason, go: b.querySelector('b').textContent, sub: (b.querySelector('small') || {}).textContent || '', note: (document.querySelector('.fm .ksys') || {}).textContent || '', inView: r.top >= 0 && r.bottom <= innerHeight, sw: document.documentElement.scrollWidth, iw: innerWidth }; });
    assert.deepEqual([a.state, a.ch, a.reason, a.go], ['farm', 3, 'rank_gate', '育成を完了して街へ戻る'], `${size}`);
    assert.match(a.sub, /Chapter 3 解放条件：公式Cランク大会クリア/); assert.match(a.note, /Chapter 3 解放条件.*公式Cランク大会クリア.*このモンスターの育成はここまでです/);
    assert.ok(a.inView, '進行ボタンは画面の中'); assert.equal(a.sw, a.iw, '横にはみ出さない');
    await pg.click('.fm .fmgo'); await pg.waitForTimeout(500); await pg.click('.fm .fmgo');   // 2度押し
    await pg.waitForSelector('.p9done', { timeout: 20000 }); await H.finishTalk(pg);
    const d = await pg.evaluate(() => ({ state: S.m.raise.state, txt: document.querySelector('.p9done').textContent, done: MMP8.raiseDoneCount(S), saved: JSON.parse(localStorage.getItem('mr4v6')).m.raise.state }));
    assert.deepEqual([d.state, d.done, d.saved], ['done', 1, 'done']); assert.match(d.txt, /Chapter 3 の解放条件（公式Cランク大会クリア）に届かなかったため/); assert.match(d.txt, /解放条件（公式Cランク大会クリア）に届かず（ここで育成完了）/);
    const after = await pg.evaluate(() => ({ uid: S.m.uid, name: S.m.name, po: S.m.po, li: S.m.li, g: S.g, sk: JSON.stringify(S.m.sk) }));
    assert.deepEqual(after, before, '個体・能力・技・所持金はそのまま');
    await pg.click('.p9done .p9btn'); await pg.waitForSelector('.rn', { timeout: 20000 });
    assert.equal(await pg.evaluate(() => S.box.length + (S.m ? 1 : 0) >= 1 && MMP7.raiseState(S.m || S.box[S.box.length - 1]) === 'done'), true, '牧場へ（育成完了の個体として）');
    // 条件を満たした個体（公式C大会クリア済み）は Chapter 3 へ進める
    const q = await open({ size }); const pq = q.page; await toFarm(pq);
    await pq.evaluate(() => { Object.assign(S.m.raise, { ch: 3, log: [{ ch: 1, reachedGoal: true }, { ch: 2, reachedGoal: true }] }); S.m.prog.rankClr = [true, true, true, false, false, false]; save(); hall('t'); });
    await pq.waitForSelector('.fm .fmgo'); const ok = await pq.evaluate(() => [MMP8.canDepart(S, S.m).ok, document.querySelector('.fm .fmgo b').textContent, !!document.querySelector('.fm .ksys')]);
    assert.deepEqual(ok, [true, 'Chapter 3へ進む', false]);
    assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []); assert.deepEqual(q.errors, []);
  }
});
