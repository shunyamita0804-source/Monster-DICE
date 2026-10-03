// =========================================================
// 実ブラウザ：2026-09-30 の改修（Chapter 1 の13枚の旅・サイコロの停止面・操作欄の4コマンド・所持金 HUD・セーブ画面・市場の会話フェーズ・
//  大会のランク封印とフィナの見立て・開始演出とセドリック・参加者の登場・次の対戦相手・VS の登場・Battle 開始前の導入）
//  Battle Engine（fight()）は START のあとだけ動く。既存のセーブ v6・mr4v6 は変えない。QA_E2E=1 のときだけ実行（tests/e2e/harness.mjs）
// =========================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import * as H from './e2e/harness.mjs';

const SKIP = H.skipReason();
let L, opened = [];
test.before(async () => { if (!SKIP) L = await H.launch(); });
test.after(async () => { if (L) await L.close(); });
async function open(opt = {}) { for (const q of opened) await q.ctx.close().catch(() => {}); const p = await L.open(opt); opened = [p]; return p; }
const idle = (pg) => pg.waitForFunction(() => !bBusy && !MMCHD.isLocked() && !document.querySelector('.chpop,.chdz'), null, { timeout: 30000 }).then(() => pg.waitForTimeout(250));
/** フィールドを開く。fill（既定）：通常マスを能力マスで埋める（止まったときの結果を一定にして、1地点ずつの進み方・位置を確かめる。通常マスに止まる確認は JR-16） */
async function toField(pg, fill = true) {
  await H.newGame(pg, 'テスト');
  await pg.evaluate((fill) => { const m = mk(0); m.name = 'ソラ'; MMP7.ensureProg(m); S.m = m; save(); MMP8.depart(S, m, () => 0.37); if (fill) { const g = MMCH.graphFor(S.m), A = S.m.raise.field.nodeAssignments; for (const id of g.order) if (g.nodes[id].kind === 'slot' && !A[id]) A[id] = { t: 'stat', k: 'li' }; } save(); board(); }, fill);
  await pg.waitForSelector('#chf .chf-bg'); await idle(pg);
}
/** 出目を決めて START を1回押す（1タップ：サイコロは自動で止まる） */
async function rollAs(pg, v) {
  await pg.evaluate((v) => { window.__mr = Math.random; Math.random = () => ({ 1: 0.1, 2: 0.5, 3: 0.9 }[v]); }, v);   // 2026-10-01 夜：Chapter 1 は 1〜3
  await pg.click('#brollbtn'); await pg.evaluate(() => { Math.random = window.__mr; });
}
const place = (pg, node, extra = {}) => pg.evaluate(([node, extra]) => { const r = S.m.raise; r.node = node; r.pend = null; Object.assign(r, extra);  save(); board(); }, [node, extra]);

for (const size of [H.SIZES.base, H.SIZES.se]) {
  test(`JR-1（${size.join('×')}）：サイコロの停止面：内部の出目 1〜3（2026-10-01 夜）と、止まったサイコロの面（dice_stop_1〜3）が必ず一致する。回転中の絵から停止面へ切り替わり、数字の輪は出さない。出目は右上の小さな表示`, { skip: SKIP }, async () => {
    const p = await open({ size }); const pg = p.page;
    await toField(pg);
    for (const v of [1, 2, 3]) {
      await place(pg, 'p1_0', { turnsUsed: 0, fatigue: 0 }); await idle(pg);
      await pg.evaluate(() => { window.__face = null; new MutationObserver(() => { const s = document.querySelector('.chdz-stop.on'); if (s && !window.__face) window.__face = { src: s.getAttribute('src'), ring: getComputedStyle(document.querySelector('.chdz-res')).display, roll: S.m.raise.pend && S.m.raise.pend.roll }; }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] }); });
      await rollAs(pg, v);
      await pg.waitForFunction(() => !!window.__face, null, { timeout: 15000 });
      const f = await pg.evaluate(() => window.__face);
      assert.equal(f.roll, v, `内部の出目 ${v}`); assert.equal(f.src, `./assets/fields/ch1a/dice/dice_stop_${v}.webp`, `出目 ${v} → ${v} が上の停止面`); assert.equal(f.ring, 'none');
      await pg.waitForSelector('.chroll'); assert.match(await pg.evaluate(() => document.querySelector('.chroll').textContent), new RegExp(`出目${v}`));
      await idle(pg);
      assert.equal(await pg.evaluate(() => !!document.querySelector('.chroll')), false, '出目の表示は自然に消える');
    }
    assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
  });
}

test('JR-2：1地点進むだけでも画面上ではっきり歩き（カメラと合わせて40px以上）、3地点は背景をまたいで歩く。背景の切り替えのあとも、モンスターは新しい背景の道の上（入口の地点）に立つ', { skip: SKIP }, async () => {
  const p = await open(); const pg = p.page;
  await toField(pg);
  const pos = () => pg.evaluate(() => { const r = document.querySelector('#bmonw .mon img').getBoundingClientRect(), f = document.querySelector('#chf').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.bottom, w: f.width, h: f.height, node: S.m.raise.node, field: MMCHV.state().field, cam: MMCHV.state().cam.ty }; });
  const a = await pos(); await rollAs(pg, 1); await idle(pg); const b = await pos();
  assert.equal(b.node, 'p1_1'); assert.ok(Math.abs(b.cam - a.cam) + Math.hypot(b.x - a.x, b.y - a.y) >= 40, `1地点＝手前のマスから次のマスへ（2026-10-01：01 は5マス）（カメラ ${Math.abs(b.cam - a.cam).toFixed(0)}px・画面 ${Math.hypot(b.x - a.x, b.y - a.y).toFixed(0)}px）`);
  await place(pg, 'p1_2'); await idle(pg); await rollAs(pg, 3); await idle(pg); const c = await pos();
  assert.deepEqual([c.node, c.field], ['p2_0', 2], '3地点：p1_3 → p1_4 → 背景の切り替え → p2_0');
  assert.ok(c.y > c.h * 0.35 && c.y < c.h * 0.88 && c.x > 0 && c.x < c.w, `切り替え後も画面の中央より少し下（${c.y.toFixed(0)} / ${c.h}）`);
  const cams = await pg.evaluate(() => document.querySelectorAll('.chf-cam').length); assert.equal(cams, 1);
  assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
});

test('JR-3：操作欄の4コマンド（アイテム・休む・技設定・ステータス）＋ START。移動中はすべて押せない。技設定・ステータスは既存の画面（hall）へ。HUD に所持金', { skip: SKIP }, async () => {
  const p = await open(); const pg = p.page;
  await toField(pg);
  await pg.evaluate(() => { S.g = 1234; board(); }); await idle(pg);
  const r = await pg.evaluate(() => ({ cmds: [...document.querySelectorAll('.chwing')].map((w) => [w.className.replace(/chwing |chw-\w+/g, '').trim(), w.textContent.replace(/\s+/g, ' ').trim(), w.disabled]), gold: document.querySelector('#chgold').textContent.replace(/\s+/g, ''), stop: !document.querySelector('#brollbtn').disabled }));
  assert.deepEqual(r.cmds, [['chwing-img chitem', 'アイテム', false], ['chwing-img chrest', '休む疲れ −30', false], ['chwing-img chskill', '技設定', false], ['chwing-img chstatus', 'ステータス', false]]);
  assert.match(r.gold, /所持金1234G/); assert.equal(r.stop, true);
  await rollAs(pg, 2); await pg.waitForFunction(() => bBusy || MMCHD.isLocked());
  assert.deepEqual(await pg.evaluate(() => [...document.querySelectorAll('.chwing')].map((w) => w.disabled)), [true, true, true, true], '演出・移動中は4コマンドを押せない');
  await idle(pg);
  await pg.evaluate(() => chfOpen('st')); await pg.waitForSelector('#app .ds-st'); assert.equal(await pg.evaluate(() => !!document.querySelector('#app .ds-st')), true, 'ステータス＝既存の画面');
  await pg.evaluate(() => board()); await pg.waitForSelector('#chf .chf-bg'); await idle(pg);
  await pg.evaluate(() => chfOpen('w')); await pg.waitForFunction(() => !document.querySelector('#chf')); assert.equal(await pg.evaluate(() => /わざ|技/.test(document.querySelector('#app').innerText)), true, '技設定＝既存の技管理');
  assert.deepEqual(p.errors, []);
});

for (const size of [H.SIZES.base, H.SIZES.se]) {
  test(`JR-4（${size.join('×')}）：セーブ画面：3スロットのセーブ・ロードとオートセーブが1画面（スクロールなし）に収まる。セーブコード・最初からやり直すの機能は残る`, { skip: SKIP }, async () => {
    const p = await open({ size }); const pg = p.page;
    await H.newGame(pg, 'テスト');
    await pg.evaluate(() => { savescr(); });
    await pg.waitForSelector('[onclick^="slotSave(1"]');
    const r = await pg.evaluate(() => { const q = (s) => document.querySelector(s).getBoundingClientRect(); return { sh: document.documentElement.scrollHeight, H: innerHeight, app: [document.querySelector('#app').scrollHeight, document.querySelector('#app').clientHeight], slots: [1, 2, 3].map((n) => q(`[onclick^="slotSave(${n}"]`).bottom), auto: q('.svauto').bottom, ghost: q('.ghost').bottom, details: !!document.querySelector('details.svmore'), exp: !!document.querySelector('[onclick="exp()"]'), imp: !!document.querySelector('[onclick="imp()"]'), open: document.querySelector('details.svmore').open }; });
    assert.ok(r.sh <= r.H && r.app[0] <= r.app[1] + 1, `ページも #app もスクロールしない（${r.sh}/${r.H}・${r.app}）`);
    for (const b of r.slots) assert.ok(b <= r.H, `スロットの操作は画面内（${b}）`); assert.ok(r.auto <= r.H && r.ghost <= r.H);
    assert.ok(r.details && r.exp && r.imp && !r.open, 'セーブコードは折りたたみ（機能は残す）');
    // スロットにセーブ → ロード（2度押し）
    await pg.waitForTimeout(400); await pg.click('[onclick^="slotSave(1"]'); await pg.waitForFunction(() => localStorage.getItem('mr4s1') != null);
    await pg.waitForSelector('[onclick^="slotSave(1"]'); await pg.waitForTimeout(400); await pg.click('[onclick^="slotLoad(1"]'); await pg.waitForTimeout(500); await pg.click('[onclick^="slotLoad(1"]');
    await pg.waitForSelector('.map.town'); assert.match(await pg.evaluate(() => document.querySelector('#msg').textContent), /スロット1をロードしました/);
    assert.equal(await pg.evaluate(() => JSON.parse(localStorage.getItem('mr4v6')).v), 6, 'セーブは v6・mr4v6');
    assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
  });
}

test('JR-5：街：名前登録の直後の案内はフィナの台詞（顔・名前つき）。市場：カレンの会話中はモンスター選択UIを出さず（選べない）、会話が終わるとカレンが退場（フェード）→ 選択UIが現れて選べる', { skip: SKIP }, async () => {
  const p = await open({ karen: true }); const pg = p.page;
  await pg.click('[onclick*="startGame"]'); await pg.waitForSelector('#p11nm'); await pg.fill('#p11nm', 'アルト'); await pg.click('[onclick*="p11NameGo"]'); await pg.waitForTimeout(150);
  await H.finishTalk(pg); await pg.waitForFunction(() => !document.querySelector('.mmtalk'));
  const t = await pg.evaluate(() => ({ fina: !!document.querySelector('.dlg.fina img.dmf'), name: document.querySelector('.dlg.fina .dnm').textContent, text: document.querySelector('#msg').textContent }));
  assert.equal(t.fina, true); assert.equal(t.name, 'フィナ'); assert.match(t.text, /ようこそ、アルトさん！ まずは市場でモンスターを選ぼう。/);
  await pg.evaluate(() => market()); await pg.waitForSelector('.mmtalk'); await pg.waitForTimeout(300);
  const m1 = await pg.evaluate(() => ({ talk: document.querySelector('.p10mk').classList.contains('talk'), sl: getComputedStyle(document.querySelector('.p10sl')).opacity, karen: document.querySelector('.mmtalk').dataset.npc, arrows: getComputedStyle(document.querySelector('.p10arw')).visibility }));
  assert.deepEqual(m1, { talk: true, sl: '0', karen: 'karen', arrows: 'hidden' }, '会話フェーズ：カレンだけ。モンスター・矢印は出さない');
  const tapped = await pg.evaluate(() => { const s = document.querySelector('#p10car .p10sl.on'); const b = s.getBoundingClientRect(); const top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return !!top && !!top.closest('.p10sl'); });
  assert.equal(tapped, false, '会話中はモンスターに触れない（会話ウィンドウが手前）');
  await pg.evaluate(() => { window.__out = false; new MutationObserver(() => { if (document.querySelector('.mmtalk.mmtalk-out')) window.__out = true; }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] }); });
  await H.finishTalk(pg);
  assert.equal(await pg.evaluate(() => window.__out), true, 'カレンは急に消えずフェードで退場（.mmtalk-out を経て消える）');
  await pg.waitForFunction(() => !document.querySelector('.mmtalk'));
  await pg.waitForFunction(() => getComputedStyle(document.querySelector('.p10sl')).opacity === '1' && !document.querySelector('.p10mk').classList.contains('talk'));
  await pg.click('#p10car .p10arw.next'); await pg.waitForFunction(() => typeof P10_ANIM !== 'undefined' && !P10_ANIM);
  assert.equal(await pg.evaluate(() => P10_MK), 1, '会話のあとは選べる');
  assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
});

async function toGoal(pg, { rk = 0, stats } = {}) {
  await H.newGame(pg, 'テスト');
  await pg.evaluate(([rk, stats]) => { const m = mk(0); m.name = 'ソラ'; if (stats) Object.assign(m, stats); MMP7.ensureProg(m); m.rk = rk; S.m = m; save(); MMP8.depart(S, m, () => 0.37); const t = MMP8.trackOf(1); Object.assign(m.raise, { node: t.goal, goal: true, pend: null, turnsUsed: 20 }); save(); board(); }, [rk, stats || null]);
  await pg.waitForSelector('#chrcv .rcv-row'); await pg.waitForTimeout(450);
}
test('JR-6：大会受付のランク選択：上から S→E。参加できるランク（既存の解放条件）だけ選べ、それ以外は鎖と錠（参加不可・押せない）。セドリックは出さず、フィナが案内。ランクを選ぶとフィナの見立て（余裕／互角／厳しい）。参加はプレイヤーが「この大会に参加する」で決める', { skip: SKIP }, async () => {
  const p = await open(); const pg = p.page;
  await toGoal(pg);
  const r = await pg.evaluate(() => ({ open: [...document.querySelectorAll('.rcv-row.ok')].map((b) => b.dataset.rank), locked: [...document.querySelectorAll('.rcv-row.lk')].map((d) => [d.dataset.rank, !!d.querySelector('.rcv-chain'), !!d.querySelector('.rcv-pad svg'), d.tagName, d.textContent.includes('参加不可')]), order: [...document.querySelectorAll('.rcv-row')].map((x) => x.querySelector('.rcv-em b').textContent).join(''), ban: document.querySelector('.rcv-ban b').textContent, ced: document.querySelectorAll('.p9ced:not(.p9fina)').length, fina: document.querySelector('#p9fsay .p9fina .tx b').textContent, text: document.querySelector('#p9fsay').textContent, join: [document.querySelector('#p9join').disabled, document.querySelector('#p9join').textContent] }));
  assert.deepEqual(r.open, ['1', '0'], 'Chapter 1・未クリア：E・D だけ'); assert.equal(r.order, 'SABCDE'); assert.equal(r.ban, '公式大会');
  assert.deepEqual(r.locked, [['5', true, true, 'DIV', true], ['4', true, true, 'DIV', true], ['3', true, true, 'DIV', true], ['2', true, true, 'DIV', true]], 'C〜S は鎖と錠・参加不可（押せない）');
  assert.equal(r.ced, 0, 'ランク選択にセドリックは出さない'); assert.equal(r.fina, 'フィナ'); assert.match(r.text, /どのランクに挑戦する？/); assert.equal(r.join[0], true, 'ランクを選ぶまで参加できない'); assert.match(r.join[1], /この大会に参加する/);
  await pg.click('.rcv-row.ok[data-rank="0"]', { force: true }); await pg.waitForTimeout(120);
  const s1 = await pg.evaluate(() => ({ j: document.querySelector('#p9fsay').dataset.judge, t: document.querySelector('#p9fsay').textContent, started: !!S.m.raise.tour, sel: [...document.querySelectorAll('.rcv-row.sel')].map((x) => x.dataset.rank), join: !document.querySelector('#p9join').disabled }));
  assert.equal(s1.j, 'easy', '能力100 vs ランクE（70）＝余裕'); assert.match(s1.t, /ランクE/); assert.equal(s1.started, false, '選ぶだけでは参加しない（見立てだけ）'); assert.deepEqual(s1.sel, ['0']); assert.equal(s1.join, true);
  await pg.evaluate(() => { S.m.li = S.m.po = S.m.in = S.m.hi = S.m.ev = S.m.de = 60; board(); }); await pg.waitForSelector('#chrcv .rcv-row'); await pg.waitForTimeout(450);
  await pg.click('.rcv-row.ok[data-rank="1"]', { force: true }); await pg.waitForTimeout(120);
  assert.equal(await pg.evaluate(() => document.querySelector('#p9fsay').dataset.judge), 'hard', '能力60 vs ランクD（90）＝厳しい');
  await pg.click('.rcv-row.lk[data-rank="2"]', { force: true }); assert.deepEqual(await pg.evaluate(() => [...document.querySelectorAll('.rcv-row.sel')].map((x) => x.dataset.rank)), ['1'], '参加不可のランクは選べない');
  assert.deepEqual(p.errors, []);
});

test('JR-7：大会開始：ランクを選んで「この大会に参加する」→ 暗転 → ランクのロゴ（E・RANK・「公式ランクE大会」）→ セドリックの一言 → 順位表（参加者が右から順に入り、そのあと通常の表示）。次の対戦相手の行だけ光る', { skip: SKIP }, async () => {
  const p = await open(); const pg = p.page;
  await toGoal(pg);
  await pg.evaluate(() => { window.__seq = []; new MutationObserver(() => { const d = document.querySelector('#p9intro'); const k = !d ? 'none' : d.classList.contains('ced') ? 'cedric' : d.classList.contains('em') ? 'emblem' : 'dark'; if (window.__seq[window.__seq.length - 1] !== k) window.__seq.push(k); if (document.querySelector('.p9tour') && !window.__seq.includes('tour')) window.__seq.push('tour'); }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] }); });
  await pg.click('.rcv-row.ok[data-rank="0"]', { force: true }); await pg.waitForTimeout(450); await pg.click('#p9join', { force: true });
  await pg.waitForSelector('#p9intro.em');
  await pg.waitForFunction(() => { const e = document.querySelector('.p9iem-l'); return !!e && e.getBoundingClientRect().width >= 110; }, null, { timeout: 1300 }).catch(() => {});   // 拡大の登場アニメの途中で測らない（約0.5秒）
  const em = await pg.evaluate(() => ({ l: document.querySelector('.p9iem-l').textContent, r: document.querySelector('.p9iem-r').textContent, t: document.querySelector('.p9iem b').textContent, tour: !!S.m.raise.tour, w: Math.round(document.querySelector('.p9iem-l').getBoundingClientRect().width) }));
  assert.deepEqual({ ...em, w: em.w >= 110 }, { l: 'E', r: 'RANK', t: '公式ランクE大会', tour: true, w: true }, 'ランクのロゴを大きく（参加は確定済み）');
  await pg.waitForSelector('#p9intro.ced');
  assert.deepEqual(await pg.evaluate(() => [document.querySelector('.p9iced .tx b').textContent, document.querySelector('.p9iced .tx').textContent.replace('セドリック', '')]), ['セドリック', '公式ランクE大会を開始します。参加者を紹介しましょう。']);
  await pg.waitForFunction(() => !document.querySelector('#p9intro') && !!document.querySelector('.p9tour'), null, { timeout: 15000 });
  const seq = await pg.evaluate(() => window.__seq);
  assert.ok(seq.indexOf('emblem') < seq.indexOf('cedric') && seq.indexOf('cedric') < seq.indexOf('tour'), `順序：エンブレム → セドリック → 順位表（${seq.join('→')}）`);
  const en = await pg.evaluate(() => ({ enter: !!document.querySelector('.p9st.p9enter'), rows: [...document.querySelectorAll('.p9st .p9r:not(.hd)')].map((r) => r.getAnimations().length > 0) }));
  assert.equal(en.enter, true); assert.ok(en.rows.some(Boolean), '参加者が順に入ってくる');
  await pg.waitForFunction(() => [...document.querySelectorAll('.p9st .p9r:not(.hd)')].every((r) => r.getAnimations().every((a) => a.playState !== 'running' || !Number.isFinite(a.effect.getComputedTiming().endTime))), null, { timeout: 10000 });
  const st = await pg.evaluate(() => { const rows = [...document.querySelectorAll('.p9st .p9r:not(.hd)')]; const nx = rows.filter((r) => r.classList.contains('nxt')); const pm = MMP8.tourNext(S.m); return { n: rows.length, nxt: nx.length, name: nx[0] && nx[0].querySelector('.nm').textContent, opp: MMP8L.entrantView(S.m.raise.tour.league, pm.opp).name, inside: rows.every((r) => { const b = r.getBoundingClientRect(); return b.left >= -1 && b.right <= innerWidth + 1; }), vis: rows.every((r) => getComputedStyle(r).opacity === '1'), ced: document.querySelectorAll('.p9ced:not(.p9fina)').length }; });
  assert.equal(st.n, 6); assert.equal(st.nxt, 1, '次の対戦相手の行だけ'); assert.ok(st.name.includes(st.opp)); assert.ok(st.inside && st.vis, '登場のあとは通常の表示'); assert.equal(st.ced, 1, '順位表のセドリックは従来どおり');
  assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
});

for (const size of [H.SIZES.base, H.SIZES.se]) {
  test(`JR-8（${size.join('×')}）：VS（相手の発表＋能力比較の1枚。2026-10-03）：バトルの背景の上で、中央の VS のあと、自分が左から・相手が右から入る。能力＝Battle Engine と同じ値。対戦開始（2度押し）で、間の画面なしに従来の fight() が始まる`, { skip: SKIP }, async () => {
    const p = await open({ size }); const pg = p.page;
    await toGoal(pg);
    await pg.evaluate(() => { MMP8.startTournament(S, S.m, 0); save(); p9VsScr(); });
    await pg.waitForSelector('.p9vs.p9vs-anim .p9go');
    const v = await pg.evaluate(() => { const me = document.querySelector('.p9vs-fr .fr.me'), op = document.querySelector('.p9vs-fr .fr:not(.me)'), vs = document.querySelector('.vsx'); const a = (e) => e.getAnimations().map((x) => x.animationName || (x.effect && x.effect.getKeyframes && x.effect.getKeyframes()[0] && 'kf')); return { me: a(me), op: a(op), vs: a(vs) }; });
    assert.ok(v.me.includes('p9vsL') && v.op.includes('p9vsR') && v.vs.includes('p9vsx'), `左右から入る（${JSON.stringify(v)}）`);
    await pg.waitForTimeout(1300);
    const pre = await pg.evaluate(() => { const st = [...document.querySelectorAll('.p9vs-tb .vr')].map((r) => [...r.querySelectorAll('.v')].map((x) => +x.textContent)); const go = document.querySelector('.p9go').getBoundingClientRect(); return { battle: S.m.raise.battle, bt: !!document.querySelector('#bt'), names: [...document.querySelectorAll('.p9vs-fr .np')].map((b) => b.textContent), st, opp: MMP8L.PROVISIONAL_OPPONENT_STAT[0], inside: go.bottom <= innerHeight && go.top >= 0, bg: /url\(/.test(getComputedStyle(document.querySelector('.p9vs')).backgroundImage) }; });
    assert.equal(pre.battle, null, '対戦開始までは試合を始めない'); assert.equal(pre.bt, false, 'fight() は動いていない');
    assert.equal(pre.names[0], 'ソラ');
    assert.deepEqual(pre.st, [[100, pre.opp], [100, pre.opp], [100, pre.opp], [100, pre.opp], [100, pre.opp], [100, pre.opp]], '能力の比較＝自分の6能力と、fight() が作る相手と同じ値（MMP8L.PROVISIONAL_OPPONENT_STAT）');
    assert.ok(pre.inside && pre.bg, '対戦開始のボタンまで画面に収まり、バトルの背景の上');
    await pg.click('.p9go'); await pg.waitForTimeout(600); await pg.click('.p9go');
    await pg.waitForSelector('#bt'); await pg.waitForTimeout(600);
    const after = await pg.evaluate(() => ({ kind: S.m.raise.battle && S.m.raise.battle.kind, pbt: !!document.querySelector('#pbt'), bt: !!document.querySelector('#bt') }));
    assert.deepEqual(after, { kind: 'league', pbt: false, bt: true }, '対戦開始で、間の画面なしに従来の fight() が始まる');
    assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
  });
}

// =========================================================
// 2026-10-01 リアル巨大ボード方式：Chapter開始の俯瞰図 → ズーム／パン → 実プレイ画面、START の1タップ（自動停止）、ターン切れ（大会なし → ファーム → 次の Chapter）、フィナのリアクションの差し込み口
// =========================================================
test('JR-9：Chapter開始の演出（2026-10-02 正式）：全景を止めて見せる →「Chapter 1」→「はじまりの草原」→ 消える → 全景の中を開始地点へカメラ移動 → FIELD 1 → ソラモ・マス・UI。約3〜4秒。演出中は UI を出さず操作できない。新しく Chapter に入ったときだけ（再読み込みでは出ない）。タップで飛ばす（連打しても1回・下の START に届かない）', { skip: SKIP }, async () => {
  const p = await open({ intro: true }); const pg = p.page;
  await H.newGame(pg, 'テスト');
  await pg.evaluate(() => { window.__iv = []; const tick = () => { const ov = document.querySelector('.chintro'); if (ov) { const c = ov.querySelector('.chintro-cam'), m = new DOMMatrix(getComputedStyle(c).transform); window.__iv.push({ t: performance.now(), s: m.a, ty: m.f, ch: ov.querySelector('.chintro-ch').classList.contains('on'), nm: ov.querySelector('.chintro-name').classList.contains('on'), title: getComputedStyle(ov.querySelector('.chintro-title')).opacity, ui: getComputedStyle(document.querySelector('#chf-ui')).opacity, mon: getComputedStyle(document.querySelector('#bmonw')).opacity }); } requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
  const t0 = await pg.evaluate(() => { const m = mk(0); m.name = 'ソラ'; MMP7.ensureProg(m); S.m = m; save(); MMP8.depart(S, m, () => 0.37); save(); const t = performance.now(); board(); return t; });
  await pg.waitForSelector('.chintro', { timeout: 8000 });
  const a = await pg.evaluate(() => { const im = document.querySelector('.chintro-img'), r = im.getBoundingClientRect(), f = document.querySelector('#chfw').getBoundingClientRect(); return { src: im.getAttribute('src'), cover: r.width >= f.width - 1 && r.height >= f.height - 1, ch: document.querySelector('.chintro-ch').textContent, nm: document.querySelector('.chintro-name').textContent, busy: bBusy, start: document.querySelector('#brollbtn').disabled, bgUnder: !!document.querySelector('#chf .chf-bg'), cls: document.querySelector('#chfw').className }; });
  assert.equal(a.src, './assets/fields/ch1a/intro/ch1_intro_overview.webp', '正式な全景（プレイの背景の流用ではない）'); assert.ok(a.cover, '全画面');
  assert.deepEqual([a.ch, a.nm], ['Chapter 1', 'はじまりの草原']); assert.deepEqual([a.busy, a.start, a.bgUnder], [true, true, true], '演出中は操作できない。下には FIELD 1 が出来ている'); assert.match(a.cls, /chf-intro/);
  await pg.waitForFunction(() => !document.querySelector('.chintro') && !bBusy && !document.querySelector('#brollbtn').disabled, null, { timeout: 15000 });
  const t1 = await pg.evaluate(() => performance.now()), iv = await pg.evaluate(() => window.__iv), rel = (x) => x.t - iv[0].t;
  assert.ok(t1 - t0 >= 3000 && t1 - t0 <= 5200, `出発から操作できるまで ${Math.round(t1 - t0)}ms（3〜4秒程度＋読み込み）`);
  assert.ok(iv.every((x) => +x.ui === 0 && +x.mon === 0), 'イントロ中は UI・ソラモを出さない');
  const chAt = iv.find((x) => x.ch), nmAt = iv.find((x) => x.nm), first = chAt.s, ci = iv.indexOf(chAt);   // 基準は「Chapter 1」が出た時点のカメラ（それより前は全景の画像の読み込み待ちを含む）
  assert.ok(chAt && nmAt && rel(chAt) >= 350 && rel(nmAt) > rel(chAt), `全景を止めてから「Chapter 1」→ Chapter 名（${chAt && Math.round(rel(chAt))}ms → ${nmAt && Math.round(rel(nmAt))}ms）`);
  assert.ok(iv.slice(ci).filter((x) => rel(x) < rel(nmAt) + 800).every((x) => Math.abs(x.s - first) < 1e-3), 'タイトルを見せている間カメラは止まっている');
  const moveFrom = iv.findIndex((x, i) => i > ci && Math.abs(x.s - first) > 1e-3); assert.ok(moveFrom > ci && iv.slice(ci, moveFrom).some((x) => +x.title < 0.05 && x.nm), 'タイトルが消えてからカメラが動く');
  assert.ok(Math.max(...iv.map((x) => x.s)) > first * 1.8, '全景から開始地点へ寄る');
  const b = await pg.evaluate(() => ({ bg: document.querySelector('#chf .chf-bg').getAttribute('src'), node: S.m.raise.node, cls: document.querySelector('#chfw').className, ui: getComputedStyle(document.querySelector('#chf-ui')).opacity, mon: !!document.querySelector('#bmonw img.on'), turns: S.m.raise.turnsUsed }));
  assert.equal(b.bg, './assets/fields/ch1a/final/field/ch1_bg_01.webp'); assert.equal(b.node, 'p1_0'); assert.doesNotMatch(b.cls, /chf-intro/); assert.equal(b.mon, true); assert.equal(b.turns, 0);
  // 再読み込み（Chapter の途中から）では出さない：「見た」はこの個体のこの Chapter の配置（m.raise.field.introSeen）
  assert.equal(await pg.evaluate(() => JSON.parse(localStorage.getItem('mr4v6')).m.raise.field.introSeen), true);
  await pg.reload(); await pg.waitForFunction(() => typeof MMP8 === 'object'); await pg.click('.p15start'); await pg.waitForSelector('#chf .chf-bg'); await pg.waitForTimeout(600);
  assert.equal(await pg.evaluate(() => !!document.querySelector('.chintro')), false, '再読み込みでは出さない');
  // タップで飛ばす：START の位置を連打しても、飛ばすのは1回・サイコロは振られない・正式な開始状態
  for (const at of [300, 1500, 3100]) {
    await pg.evaluate(() => { delete S.m.raise.field.introSeen; save(); document.querySelector('#app').innerHTML = ''; board(); });   // 新しい出発と同じ状態
    await pg.waitForSelector('.chintro', { timeout: 8000 }); await pg.waitForTimeout(at);
    const pos = await pg.evaluate(() => { const r = document.querySelector('#brollbtn').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
    const tS = Date.now(); for (let i = 0; i < 6; i++) { await pg.mouse.click(pos[0], pos[1]); await pg.waitForTimeout(40); }
    await pg.waitForFunction(() => !document.querySelector('.chintro') && !bBusy && !document.querySelector('#brollbtn').disabled, null, { timeout: 4000 });
    assert.ok(Date.now() - tS < 1500, `飛ばすとすぐ（${Date.now() - tS}ms）`);
    await pg.waitForTimeout(500);
    const c = await pg.evaluate(() => ({ turns: S.m.raise.turnsUsed, pend: S.m.raise.pend, intros: document.querySelectorAll('.chintro').length, cls: document.querySelector('#chfw').className, tiles: document.querySelectorAll('#chf .chf-tile').length, mon: !!document.querySelector('#bmonw img.on'), node: S.m.raise.node }));
    assert.deepEqual([c.turns, c.pend, c.intros, c.node, c.mon], [0, null, 0, 'p1_0', true], `${at}ms で飛ばす：飛ばしたタップでサイコロは振られない`); assert.doesNotMatch(c.cls, /chf-intro/); assert.ok(c.tiles > 0);
  }
  await pg.click('#brollbtn'); await pg.waitForFunction(() => S.m.raise.turnsUsed === 1, null, { timeout: 5000 });   // そのあと START は押せる
  assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
});

test('JR-16：通常マスに止まる（2026-10-02 の60マス再設計）：通常マスは止まれる公式のマス（共通の台座。出目に数える）。止まると何も起きずにターンが終わり、START に戻る。歩く途中の経由点（道の中央線の点）はマスではない＝1歩ずつマスへ', { skip: SKIP }, async () => {
  const p = await open(); const pg = p.page;
  await toField(pg, false);
  const nm = await pg.evaluate(() => { const g = MMCH.graphFor(S.m); return g.order.filter((id) => g.nodes[id].kind === 'slot' && g.nodes[id].tile === 'normal' && g.nodes[id].field <= 2); });
  assert.deepEqual(nm, ['p1_1', 'p1_3', 'p2_2'], '01・02 の通常マス');
  await pg.evaluate(() => { window.__nodes = []; const t = () => { const w = document.querySelector('#bmonw'); if (w && w.dataset.node && window.__nodes[window.__nodes.length - 1] !== w.dataset.node) window.__nodes.push(w.dataset.node); requestAnimationFrame(t); }; requestAnimationFrame(t); });
  const s0 = await pg.evaluate(() => ({ st: [S.m.li, S.m.po, S.m.in, S.m.hi, S.m.ev, S.m.de], g: S.g }));
  await rollAs(pg, 1); await idle(pg);
  const r = await pg.evaluate(() => ({ node: S.m.raise.node, turns: S.m.raise.turnsUsed, pend: S.m.raise.pend, ph: MMP8.boardPhase(S.m), st: [S.m.li, S.m.po, S.m.in, S.m.hi, S.m.ev, S.m.de], g: S.g, tile: (() => { const t = document.querySelector('#chf .chf-tile[data-id="p1_1"]'); return t ? [t.dataset.type, t.classList.contains('ped'), t.classList.contains('k-normal')] : null; })(), start: !document.querySelector('#brollbtn').disabled, f: MMCH.fatigue(S.m) }));
  assert.deepEqual([r.node, r.turns, r.pend, r.ph, r.start], ['p1_1', 1, null, 'roll', true], '出目1で通常マス p1_1 に止まり、ターンが終わって START に戻る');
  assert.deepEqual([r.st, r.g, r.f], [s0.st, s0.g, 3], '何も起きない（疲れは出目1のぶんだけ）'); assert.deepEqual(r.tile, ['normal', true, true], '通常マスは共通の台座');
  await rollAs(pg, 2); await idle(pg); assert.equal(await pg.evaluate(() => S.m.raise.node), 'p1_3', '出目2：p1_2 を通過して通常マス p1_3 に止まる');
  assert.deepEqual(await pg.evaluate(() => window.__nodes), ['p1_0', 'p1_1', 'p1_2', 'p1_3'], '経由点はマスにならない（data-node はマスだけ）');
  assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
});

test('JR-10：START の1タップだけで、サイコロは自動で止まって（STOP の操作なし）START の時点で保存した出目のぶん進む。止まるまで約1秒、停止面を見せてから移動。STOP を押す場面・STOP の画像は無い', { skip: SKIP }, async () => {
  const p = await open(); const pg = p.page;
  await toField(pg);
  assert.equal(await pg.evaluate(() => document.querySelectorAll('.chdz,.chdf,[onclick*="chfStop"],img[src*="deck_stop"]').length), 0, 'START の前：サイコロ・STOP は無い');
  await rollAs(pg, 3);
  const saved = await pg.evaluate(() => JSON.parse(localStorage.getItem('mr4v6')).m.raise.pend.roll);
  await pg.waitForSelector('.chdz'); const t0 = Date.now();
  await pg.waitForFunction(() => !document.querySelector('.chdz'), null, { timeout: 8000 }); const gone = Date.now() - t0;
  assert.ok(gone >= 1800 && gone <= 4500, `サイコロは自動で止まって消える（${gone}ms。設計 約2.4秒＝2026-10-03 投げる → 着地 → 跳ねる → 転がる → 完全停止 → 出目）`);
  assert.equal(await pg.evaluate(() => typeof window.chfStop), 'undefined', 'STOP の関数は無い');
  await idle(pg);
  assert.deepEqual(await pg.evaluate(() => [S.m.raise.node, S.m.raise.turnsUsed, document.querySelector('#brollbtn').textContent.trim(), !document.querySelector('#brollbtn').disabled]), ['p1_3', 1, 'START', true], `保存済みの出目 ${saved} で3地点 → START に戻る`); assert.equal(saved, 3);
  assert.deepEqual(p.errors, []);
});

test('JR-11：40ターン目（2026-10-01 夜）に大会会場へ着けなかった：大会なし・ランクは上がらない・Chapter は終了して能力と持ち物は保持 → ファーム → 次の Chapter へ進める', { skip: SKIP }, async () => {
  const p = await open(); const pg = p.page;
  await toField(pg);
  await pg.evaluate(() => { const r = S.m.raise; r.node = 'p2_0'; r.turnsUsed = 39; r.fatigue = 10; S.m.po = 160; S.g = 999; S.inv.bag.push({ id: 'herb' }); save(); board(); }); await idle(pg);
  await rollAs(pg, 2); await pg.waitForSelector('.chsheet [onclick="p8EndChapter()"]', { timeout: 20000 });
  const a = await pg.evaluate(() => ({ ph: MMP8.boardPhase(S.m), text: document.querySelector('.chsheet').innerText.replace(/\s+/g, ' '), tour: S.m.raise.tour, canRoll: MMP8.canRoll(S.m), ranks: document.querySelectorAll('.p9rank').length }));
  assert.equal(a.ph, 'timeup'); assert.match(a.text, /公式大会には参加できません/); assert.equal(a.tour, null); assert.equal(a.canRoll, false); assert.equal(a.ranks, 0, '大会の選択は出ない');
  await pg.waitForTimeout(450); await pg.click('.chsheet [onclick="p8EndChapter()"]');
  await pg.waitForSelector('.p9farm, .fm', { timeout: 15000 });
  const b = await pg.evaluate(() => ({ state: S.m.raise.state, ch: S.m.raise.ch, po: S.m.po, g: S.g, bag: S.inv.bag.length, rank: MMP8.rankLabel(S.m), log: S.m.raise.log.slice(-1)[0] }));
  assert.deepEqual([b.state, b.ch, b.po, b.g, b.bag, b.rank, b.log.reachedGoal, b.log.tour], ['farm', 2, 160, 999, 1, 'ー', false, null], '能力・所持金・持ち物は保持。ランクは上がらない。次は Chapter 2');
  assert.deepEqual(p.errors, []);
});

test('JR-12：フィナのリアクションの差し込み口：config.companion.reactions に本文があるときだけ、停止地点の結果のあとにフィナの小さな吹き出しが出る（本文が無い既定では何も出ない）', { skip: SKIP }, async () => {
  const p = await open(); const pg = p.page;
  await toField(pg);
  const id = await pg.evaluate(() => { const g = MMCH.graphFor(S.m), a = S.m.raise.field.nodeAssignments; return g.order.find((x) => a[x] && a[x].t === 'treasure'); });
  const prev = (x) => pg.evaluate((id) => Object.keys(MMCH.graphFor(S.m).conn).find((k) => MMCH.graphFor(S.m).conn[k].includes(id)), x);
  await place(pg, await prev(id)); await idle(pg);
  await pg.evaluate(() => { window.__fina = 0; new MutationObserver(() => { if (document.querySelector('.chf-fina')) window.__fina++; }).observe(document.body, { subtree: true, childList: true }); });
  await rollAs(pg, 1); await idle(pg);
  assert.equal(await pg.evaluate(() => window.__fina), 0, '本文が無い既定では何も出ない');
  // 本文を入れると出る（内容は仕様側で決める。ここでは例文）
  const id2 = await pg.evaluate(() => { const g = MMCH.graphFor(S.m), a = S.m.raise.field.nodeAssignments; return g.order.find((x) => a[x] && a[x].t === 'stat'); });
  await place(pg, await prev(id2)); await idle(pg);
  await pg.evaluate(() => { MMCH.getConfig(1).companion.reactions.stat_up = ['やったね！ 強くなったよ。']; MMCH.getConfig(1).companion.reactions.stat_great = ['すごい！ 大成功だよ！']; MMCH.getConfig(1).companion.reactions.stat_fail = ['残念…。次は大丈夫だよ。']; window.__fina = 0; window.__finaText = null; new MutationObserver(() => { const f = document.querySelector('.chf-fina'); if (f && !window.__finaText) { window.__finaText = f.innerText.replace(/\s+/g, ' '); window.__finaImg = f.querySelector('img').getAttribute('src'); } }).observe(document.body, { subtree: true, childList: true }); });
  await rollAs(pg, 1); await pg.waitForFunction(() => !!window.__finaText, null, { timeout: 15000 });
  const r = await pg.evaluate(() => ({ text: window.__finaText, img: window.__finaImg }));
  assert.match(r.text, /フィナ/); assert.match(r.text, /強くなったよ|大成功|残念/); assert.match(r.img, /assets\/npc\/fina\/closeup\/\w+\.webp$/);
  await idle(pg); assert.equal(await pg.evaluate(() => !!document.querySelector('.chf-fina')), false, '吹き出しは自然に消える');
  assert.deepEqual(p.errors, []);
});

test('JR-13：導入演出は「育成個体 × Chapter の初回」に1回：新規育成の Chapter 1 で出る → プレイ中の再読み込みでは出ない → 育成放棄 → 別の個体で新規育成 → Chapter 1 で再び出る（実際の操作：市場で購入 → ファーム → 出発 → フィナの選択肢）', { skip: SKIP }, async () => {
  const p = await open({ intro: true }); const pg = p.page;
  await H.newGame(pg, 'テスト');
  const buy = async (name) => { await pg.evaluate(() => market()); await H.marketDetail(pg); await pg.evaluate(() => p10BuyAsk()); await pg.waitForSelector('#mnm'); await pg.fill('#mnm', name); await pg.waitForTimeout(400); await pg.click('#p10ov [onclick*="mkgo"]'); await H.finishTalk(pg).catch(() => {}); await pg.waitForSelector('.tbar .tcmd'); };
  const depart = async () => { await pg.click('.tbar button[onclick*="hall"]'); await pg.waitForSelector('.fm'); await pg.evaluate(() => prepScr()); await H.startRaising(pg); };
  const st = () => pg.evaluate(() => ({ intro: !!document.querySelector('.chintro'), uid: S.m.uid, node: S.m.raise.node, seen: S.m.raise.field.introSeen === true }));
  const settle = () => pg.waitForFunction(() => !document.querySelector('.chintro') && !bBusy && !MMCHD.isLocked() && !document.querySelector('.chpop,.chdz'), null, { timeout: 30000 });
  await buy('ソラ'); await depart();
  const a = await st(); assert.deepEqual([a.intro, a.node, a.seen], [true, 'p1_0', true], '1体目：Chapter 1 の初突入で導入演出'); await settle();
  await pg.click('#brollbtn'); await settle();   // プレイ中（1ターン進めた）
  await pg.reload(); await pg.waitForFunction(() => typeof MMP8 === 'object'); await pg.click('.p15start'); await pg.waitForSelector('#chf .chf-bg'); await pg.waitForTimeout(700);
  const b = await st(); assert.deepEqual([b.intro, b.uid, b.seen], [false, a.uid, true], '同じ育成の再読み込み：導入演出なし・続きから');
  // 育成放棄（フィールドのメニュー → 2段階の確認）→ 街
  await pg.evaluate(() => p9Menu()); await pg.waitForSelector('#p9ov'); await pg.waitForTimeout(450); await pg.click('#p9ov button[onclick*="p8AbandonAsk"]');
  await pg.waitForSelector('#p8m'); await pg.waitForTimeout(450); await pg.click('#p8m button[onclick*="p8AbandonAsk2"]');
  await pg.waitForFunction(() => { const b = document.querySelector('#p8abgo'); return b && !b.disabled; }, null, { timeout: 8000 }); await pg.click('#p8abgo');
  await pg.waitForSelector('.tbar .tcmd'); assert.equal(await pg.evaluate(() => S.m), null, '放棄で育成中の個体は消える');
  await buy('ガウ'); await depart();
  const c = await st(); assert.deepEqual([c.intro, c.node, c.seen], [true, 'p1_0', true], '2体目：Chapter 1 の初突入で導入演出が再び出る'); assert.notEqual(c.uid, a.uid);
  await settle();
  assert.deepEqual(await pg.evaluate(() => ({ on: !document.querySelector('#brollbtn').disabled, bg: document.querySelector('#chf .chf-bg').getAttribute('src') })), { on: true, bg: './assets/fields/ch1a/final/field/ch1_bg_01.webp' });
  assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
});

test('JR-13：大会会場への到着：14 の最後のマス（ゴール）に着くと、到着イベント専用の背景（15）へ切り替わり、マス・サイコロ・操作欄が消える → フィナの短い会話（プレイヤー名入り）→ 大会受付。再読み込みでは会話を繰り返さず受付から', { skip: SKIP }, async () => {
  const p = await open({ arrival: true }); const pg = p.page;
  await H.newGame(pg, 'ユウ');
  await pg.evaluate(() => { const m = mk(0); m.name = 'ソラ'; MMP7.ensureProg(m); S.m = m; save(); MMP8.depart(S, m, () => 0.37); save(); board(); });
  await pg.waitForSelector('#chf .chf-bg'); await idle(pg);
  await place(pg, 'p14_1', { turnsUsed: 30 }); await idle(pg);
  assert.equal(await pg.evaluate(() => document.querySelector('#chf .chf-bg').getAttribute('src')), './assets/fields/ch1a/final/field/ch1_bg_14.webp');
  await rollAs(pg, 1);
  await pg.waitForSelector('#chfarr.on', { timeout: 20000 });
  const a = await pg.evaluate(() => ({ node: S.m.raise.node, goal: S.m.raise.goal, bg: document.querySelector('#chfarr img').getAttribute('src'), name: document.querySelector('.chf-arrive-name b').textContent, deck: !!document.querySelector('#chdock,#brollbtn,.chh,.chsheet') }));
  assert.deepEqual(a, { node: 'p14_2', goal: true, bg: './assets/fields/ch1a/final/event/ch1_bg_15_event.webp', name: '公式大会会場・正門前', deck: false }, '15 の背景へ。HUD・操作欄・マスの UI は出さない');
  await pg.waitForSelector('.mmtalk:not(.mmtalk-out)', { timeout: 15000 });
  const lines = []; for (let i = 0; i < 12 && await pg.$('.mmtalk:not(.mmtalk-out)'); i++) { await pg.waitForTimeout(450); const t = await pg.evaluate(() => { const e = document.querySelector('.mmtalk:not(.mmtalk-out)'); return e ? [e.querySelector('.mmtalk-name').textContent, e.getAttribute('aria-label') || '', e.querySelector('.mmtalk-text').textContent] : null; }); if (t && !lines.some((x) => x[2] === t[2])) lines.push(t); await pg.click('.mmtalk', { force: true }).catch(() => {}); }
  await pg.waitForSelector('#chrcv .rcv-row', { timeout: 15000 });
  const said = [...new Set(lines.map((l) => l[2]))].filter((t) => ['やっと着いたね、ユウさん！', 'ここが公式大会の会場だよ。', 'さあ、早速受付に行こう！'].includes(t));
  assert.deepEqual(said, ['やっと着いたね、ユウさん！', 'ここが公式大会の会場だよ。', 'さあ、早速受付に行こう！'], `フィナの3行（プレイヤー名）：${JSON.stringify(lines)}`); assert.ok(lines.every((l) => l[0] === 'フィナ'));
  assert.equal(await pg.evaluate(() => S.m.raise.field.arrivalSeen), true);
  await pg.reload(); await pg.waitForFunction(() => typeof S === 'object' && S.m); await pg.evaluate(() => board());
  await pg.waitForSelector('#chrcv .rcv-row', { timeout: 20000 }); await pg.waitForTimeout(400);
  assert.deepEqual(await pg.evaluate(() => ({ talk: !!document.querySelector('.mmtalk'), on: document.querySelector('#chfarr').classList.contains('on'), rows: document.querySelectorAll('.rcv-row.ok').length })), { talk: false, on: true, rows: 2 }, '再読み込み：会話は繰り返さず受付から');
  assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
});

test('JR-14：マスUI（正式素材）：今の背景のマスに正式素材が、ノードの座標どおりに共通の台座の上に出る（通常マスは絵の無い台座だけ）。仮表示（点線・「仮 #番号」）は通常プレイに出ない（?chdebug=1 だけ）。旧目印（石碑・宝箱など）は出さない。能力マスに止まると適性の値（ガウルの丈夫さ E＝+3）', { skip: SKIP }, async () => {
  const p = await open(); const pg = p.page;
  await H.newGame(pg, 'テスト');
  await pg.evaluate(() => { const m = mk(1); m.name = 'ガル'; MMP7.ensureProg(m); S.m = m; save(); MMP8.depart(S, m, () => 0.37); const a = S.m.raise.field.nodeAssignments; a.p1_1 = { t: 'stat', k: 'de' }; a.p1_2 = { t: 'treasure', tier: 'normal' }; delete a.p1_3; a.p1_4 = { t: 'treasure', tier: 'rare' }; save(); board(); });
  await pg.waitForSelector('#chf .chf-bg'); await idle(pg);
  const read = () => pg.evaluate(() => { const g = MMCH.graphFor(S.m), sc = MMCH.getConfig(1).fieldScenes[0]; return { objs: document.querySelectorAll('#chf .chf-obj:not(.hid)').length, tiles: [...document.querySelectorAll('#chf .chf-tile')].map((t) => { const n = g.nodes[t.dataset.id], im = t.querySelector('img'); return { id: t.dataset.id, ph: t.classList.contains('ph'), text: t.textContent, img: im && im.getAttribute('src'), ok: !!(im && im.complete && im.naturalWidth), dx: Math.abs(parseFloat(t.style.left) - n.mx * sc.w), dy: Math.abs(parseFloat(t.style.top) - n.my * sc.h), type: t.dataset.type }; }) }; });
  const a = await read();
  assert.equal(a.objs, 0, '旧目印は出さない'); assert.ok(a.tiles.every((t) => !t.ph && !/仮/.test(t.text) && (t.ok || t.type === 'normal') && t.dx < 0.5 && t.dy < 0.5), `正式素材がノードの座標に：${JSON.stringify(a.tiles)}`);
  const by = Object.fromEntries(a.tiles.map((t) => [t.id, t.img]));
  assert.equal(by.p1_1, './assets/fields/ch1a/tiles/tile_stat_toughness.webp'); assert.equal(by.p1_2, './assets/fields/ch1a/tiles/tile_treasure.webp'); assert.equal(by.p1_3, null, '通常マスは絵の無い台座だけ'); assert.equal(a.tiles.find((t) => t.id === 'p1_3').type, 'normal'); assert.equal(by.p1_0, undefined, 'スタートには置かない');
  // 能力マス（丈夫さ）に止まる：ガウル（丈夫さ E）は +3、マスが光り、使ったマスは少し暗く
  const de0 = await pg.evaluate(() => S.m.de); await rollAs(pg, 1); await pg.waitForSelector('.chpop'); await pg.waitForFunction(() => /\+3/.test((document.querySelector('.chpop') || {}).textContent || ''), null, { timeout: 5000 }); const pop = await pg.evaluate(() => [document.querySelector('.chpop').textContent, document.querySelector('.chf-tile[data-id="p1_1"]').classList.contains('hit')]); await idle(pg);
  assert.deepEqual([pop[1], await pg.evaluate(() => S.m.de) - de0, await pg.evaluate(() => document.querySelector('.chf-tile[data-id="p1_1"]').classList.contains('used'))], [true, 3, true]); assert.match(pop[0], /丈夫さ \+3/);
  // 宝箱（normal）：止まると通常の宝箱が現れて開く。rare は宝箱の絵を出さない（従来の表示＝マスUIだけ）
  const chest = () => pg.evaluate(() => { const o = document.querySelector('#chf .chf-obj[data-id="p1_2"]'), im = o && o.querySelector('img'); return o ? { hid: o.classList.contains('hid'), src: im.getAttribute('src'), ok: im.naturalWidth > 0 } : null; });
  assert.deepEqual(await chest(), { hid: true, src: './assets/fields/ch1a/tiles/chest_normal_closed.webp', ok: true }, '止まるまでは見えない');
  assert.equal(await pg.evaluate(() => !!document.querySelector('#chf .chf-obj[data-id="p1_4"]')), false, 'rare の宝箱は正式の宝箱の絵を流用しない');
  await rollAs(pg, 1); await pg.waitForSelector('.chpop'); await idle(pg);
  assert.deepEqual(await chest(), { hid: false, src: './assets/fields/ch1a/tiles/chest_normal_open.webp', ok: true }, '止まると現れて開く');
  // デバッグ（?chdebug=1）：ノードの点と道筋が出る（仮表示は出さない＝どのマスにも正式の表示がある）
  const q = await open({ query: '?chdebug=1' }); const qg = q.page; await H.newGame(qg, 'テスト');
  await qg.evaluate(() => { const m = mk(0); m.name = 'ソラ'; MMP7.ensureProg(m); S.m = m; save(); MMP8.depart(S, m, () => 0.37); save(); board(); });
  await qg.waitForSelector('#chf .chf-bg'); assert.deepEqual(await qg.evaluate(() => [!!document.querySelector('.chf-dbg'), document.querySelectorAll('.chf-tile.ph').length, !!document.querySelector('.chf-tile.k-normal[data-id="p1_3"]')]), [true, 0, true], 'デバッグでもマスは正式の表示（通常マスは台座）');
  assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
});


test('JR-15：ソラモの後ろ向き歩行（390×844）：止まっている間は 01、移動の間だけ 01→08 をループ（3マス連続でも途切れない・背景の切り替えをまたいでも続く）、着いたら 01 に戻る。見えるコマはいつも1枚。足元はマスの上、画面の中央下。素材の読み込みの失敗なし', { skip: SKIP }, async () => {
  const p = await open(); const pg = p.page;
  await toField(pg);
  const st = () => pg.evaluate(() => { const b = document.querySelector('#bmonw .chf-spr'), on = b.querySelectorAll('img.on'), r = on[0].getBoundingClientRect(), w = document.querySelector('#bmonw'); return { f: b.dataset.f, n: on.length, walk: w.classList.contains('walk'), bottom: r.bottom, H: innerHeight, node: S.m.raise.node, flip: !!document.querySelector('#bmonw .chf-flip.r'), ok: [...b.querySelectorAll('img')].every((i) => i.complete && i.naturalWidth > 0) }; });
  const s0 = await st(); assert.deepEqual([s0.f, s0.n, s0.walk, s0.ok], ['1', 1, false, true], '止まっている間は 01');
  assert.ok(s0.bottom > s0.H * 0.55 && s0.bottom < s0.H * 0.75, `足元は画面の中央下（${Math.round(s0.bottom)}/${s0.H}）`);
  async function walkSample(v) {
    await rollAs(pg, v); const seen = []; let n1 = true, flip = false;
    for (let i = 0; i < 120; i++) { const x = await st(); if (x.walk) seen.push(x.f); if (x.n !== 1) n1 = false; if (x.flip) flip = true; if (i > 20 && !(await pg.evaluate(() => bBusy))) break; await pg.waitForTimeout(40); }
    await idle(pg); return { seen, n1, flip, end: await st() };
  }
  const a = await walkSample(3);
  assert.equal(a.end.node, 'p1_3'); assert.ok(new Set(a.seen).size >= 6, `3マスの間に 8コマを順に見せる（${a.seen.join('')}）`); assert.ok(a.n1, '見えるコマはいつも1枚'); assert.equal(a.flip, false, '後ろ姿は左右反転しない');
  const ch = a.seen.map(Number).filter((f, i, A) => i === 0 || f !== A[i - 1]), d = ch.slice(1).map((f, i) => (f - ch[i] + 8) % 8);
  assert.ok(d.every((x) => x >= 1 && x <= 3), `コマは前へだけ進む（${ch.join('')}）`);
  assert.deepEqual([a.end.f, a.end.walk], ['1', false], '着いたら 01');
  // 背景 01 → 02 をまたいで止まる：歩いたまま前の背景が透明になって次の背景へ溶けて変わる（2026-10-02 の60マス再設計：暗転は使わない）。その間も歩行のコマは止まらない
  await pg.evaluate(() => { window.__sw = []; const t = () => { const o = document.querySelector('.chf-cam.chf-xout'), b = document.querySelector('#bmonw .chf-spr'); window.__sw.push([document.querySelectorAll('.chf-cam').length, o ? +getComputedStyle(o).opacity : -1, !!document.querySelector('.chf-veil'), b ? b.dataset.f : '']); requestAnimationFrame(t); }; requestAnimationFrame(t); });
  const b = await walkSample(3);
  const sw = await pg.evaluate(() => window.__sw), xf = sw.filter((x) => x[0] === 2);
  assert.ok(xf.length >= 3, `前と次の背景が重なる（${xf.length}フレーム）`); assert.ok(xf.some((x) => x[1] > 0.2 && x[1] < 0.8), '前の背景は少しずつ透明に'); assert.ok(!sw.some((x) => x[2]), '暗転しない');
  assert.ok(new Set(xf.map((x) => x[3])).size >= 2, `クロスフェードの間も歩行のコマが進む（${xf.map((x) => x[3]).join('')}）`);
  assert.equal(b.end.node, 'p2_1'); assert.ok(new Set(b.seen).size >= 6); assert.deepEqual([b.end.f, b.end.walk, b.end.n], ['1', false, 1], '背景をまたいで止まっても 01');
  assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
});
