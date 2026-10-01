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
async function toField(pg) {
  await H.newGame(pg, 'テスト');
  await pg.evaluate(() => { const m = mk(0); m.name = 'ソラ'; MMP7.ensureProg(m); S.m = m; save(); MMP8.depart(S, m, () => 0.37); save(); board(); });
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
      await place(pg, 'f1_0', { turnsUsed: 0, fatigue: 0 }); await idle(pg);
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
  assert.equal(b.node, 'f1_1'); assert.ok(Math.abs(b.cam - a.cam) + Math.hypot(b.x - a.x, b.y - a.y) >= 40, `1地点＝手前のマスから次のマスへ（2026-10-01：新しい背景は1枚に6マス＝間隔が旧構成より短い）（カメラ ${Math.abs(b.cam - a.cam).toFixed(0)}px・画面 ${Math.hypot(b.x - a.x, b.y - a.y).toFixed(0)}px）`);
  await place(pg, 'f1_3'); await idle(pg); await rollAs(pg, 3); await idle(pg); const c = await pos();
  assert.deepEqual([c.node, c.field], ['f2_0', 2], '3地点：f1_4 → f1_5 → 背景の切り替え → f2_0');
  assert.ok(c.y > c.h * 0.35 && c.y < c.h * 0.85 && c.x > 0 && c.x < c.w, `切り替え後も画面の中央より少し下（${c.y.toFixed(0)} / ${c.h}）`);
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
  await pg.waitForSelector('.chgoal .p9rank'); await pg.waitForTimeout(450);
}
test('JR-6：大会のランク選択：挑戦できるランク（既存の解放条件）だけ押せるカード、それ以外は鎖と錠で封印（押せない）。セドリックは出さず、フィナが案内。ランクをタップするとフィナの見立て（余裕／互角／厳しい）', { skip: SKIP }, async () => {
  const p = await open(); const pg = p.page;
  await toGoal(pg);
  const r = await pg.evaluate(() => ({ open: [...document.querySelectorAll('.p9rank')].map((b) => b.getAttribute('onclick')), locked: [...document.querySelectorAll('.p9rlock')].map((d) => [d.dataset.rank, !!d.querySelector('.p9chain'), !!d.querySelector('.p9pad svg'), d.getAttribute('onclick')]), ced: document.querySelectorAll('.p9ced:not(.p9fina)').length, fina: document.querySelector('#p9fsay .p9fina .tx b').textContent, text: document.querySelector('#p9fsay').textContent }));
  assert.deepEqual(r.open, ['p8TourStart(0,this)', 'p8TourStart(1,this)'], 'Chapter 1・未クリア：E・D だけ');
  assert.deepEqual(r.locked, [['2', true, true, null], ['3', true, true, null], ['4', true, true, null], ['5', true, true, null]], 'C〜S は鎖と錠。押せない');
  assert.equal(r.ced, 0, 'ランク選択にセドリックは出さない'); assert.equal(r.fina, 'フィナ'); assert.match(r.text, /どのランクに挑戦する？/);
  await pg.click('button.p9rank[onclick^="p8TourStart(0,"]', { force: true }); await pg.waitForTimeout(120);
  const s1 = await pg.evaluate(() => ({ j: document.querySelector('#p9fsay').dataset.judge, t: document.querySelector('#p9fsay').textContent, started: !!S.m.raise.tour }));
  assert.equal(s1.j, 'easy', '能力100 vs ランクE（70）＝余裕'); assert.match(s1.t, /ランクE/); assert.equal(s1.started, false, '1回目のタップでは参加しない（見立てだけ）');
  await pg.waitForTimeout(3200);   // 2度押しの確認は3秒で戻る
  await pg.evaluate(() => { S.m.li = S.m.po = S.m.in = S.m.hi = S.m.ev = S.m.de = 60; board(); }); await pg.waitForSelector('.chgoal .p9rank'); await pg.waitForTimeout(450);
  await pg.click('button.p9rank[onclick^="p8TourStart(1,"]', { force: true }); await pg.waitForTimeout(120);
  assert.equal(await pg.evaluate(() => document.querySelector('#p9fsay').dataset.judge), 'hard', '能力60 vs ランクD（90）＝厳しい');
  assert.deepEqual(p.errors, []);
});

test('JR-7：大会開始：2度押しで参加 → 暗転 → ランクのエンブレム「公式ランクE大会」→ セドリックの一言 → 順位表（参加者が右から順に入り、そのあと通常の表示）。次の対戦相手の行だけ光る', { skip: SKIP }, async () => {
  const p = await open(); const pg = p.page;
  await toGoal(pg);
  await pg.evaluate(() => { window.__seq = []; new MutationObserver(() => { const d = document.querySelector('#p9intro'); const k = !d ? 'none' : d.classList.contains('ced') ? 'cedric' : d.classList.contains('em') ? 'emblem' : 'dark'; if (window.__seq[window.__seq.length - 1] !== k) window.__seq.push(k); if (document.querySelector('.p9tour') && !window.__seq.includes('tour')) window.__seq.push('tour'); }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] }); });
  await pg.click('button.p9rank[onclick^="p8TourStart(0,"]', { force: true }); await pg.waitForTimeout(600); await pg.click('button.p9rank[onclick^="p8TourStart(0,"]', { force: true });
  await pg.waitForSelector('#p9intro.em');
  const em = await pg.evaluate(() => ({ l: document.querySelector('.p9iem-l').textContent, t: document.querySelector('.p9iem b').textContent, tour: !!S.m.raise.tour }));
  assert.deepEqual(em, { l: 'E', t: '公式ランクE大会', tour: true }, 'ランクのエンブレム（参加は確定済み）');
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
  test(`JR-8（${size.join('×')}）：VS：中央の VS のあと、自分が左から・相手が右から入る。対戦開始 → Battle 開始前の導入（両者・個性スキル・主要パラメーター＝Battle Engine と同じ値・BATTLE START）。START までは試合が始まらず、START で従来の fight() が始まる`, { skip: SKIP }, async () => {
    const p = await open({ size }); const pg = p.page;
    await toGoal(pg);
    await pg.evaluate(() => { MMP8.startTournament(S, S.m, 0); save(); p9VsScr(); });
    await pg.waitForSelector('.p9vs.p9vs-anim .p9go');
    const v = await pg.evaluate(() => { const me = document.querySelector('.p9vs-fr .fr.me'), op = document.querySelector('.p9vs-fr .fr:not(.me)'), vs = document.querySelector('.vsx'); const a = (e) => e.getAnimations().map((x) => x.animationName || (x.effect && x.effect.getKeyframes && x.effect.getKeyframes()[0] && 'kf')); return { me: a(me), op: a(op), vs: a(vs) }; });
    assert.ok(v.me.includes('p9vsL') && v.op.includes('p9vsR') && v.vs.includes('p9vsx'), `左右から入る（${JSON.stringify(v)}）`);
    await pg.waitForTimeout(1300);
    await pg.click('.p9go'); await pg.waitForTimeout(600); await pg.click('.p9go');
    await pg.waitForSelector('#pbt.in'); await pg.waitForTimeout(500);
    const pre = await pg.evaluate(() => { const st = [...document.querySelectorAll('.pbtst .vr')].map((r) => [...r.querySelectorAll('.v')].map((x) => +x.textContent)); const w = document.querySelector('.pbtwrap').getBoundingClientRect(); return { battle: S.m.raise.battle, bt: !!document.querySelector('#bt'), names: [...document.querySelectorAll('.pbtm b')].map((b) => b.textContent), skills: [...document.querySelectorAll('.pbtsk b')].map((b) => b.textContent), st, opp: MMP8L.PROVISIONAL_OPPONENT_STAT[0], inside: w.top >= 0 && w.bottom <= innerHeight && w.left >= 0 && w.right <= innerWidth, bg: /url\(/.test(document.querySelector('.pbtbg').style.backgroundImage) }; });
    assert.equal(pre.battle, null, 'START までは試合を始めない（beginBattle は START のあと）'); assert.equal(pre.bt, false, 'fight() は動いていない');
    assert.equal(pre.names[0], 'ソラ'); assert.deepEqual(pre.skills, ['―（未登録）', '―（未登録）'], '個性スキルの枠（正式データは未登録）');
    assert.deepEqual(pre.st, [[100, pre.opp], [100, pre.opp], [100, pre.opp], [100, pre.opp], [100, pre.opp], [100, pre.opp]], '主要パラメーター＝自分の6能力と、fight() が作る相手と同じ値（MMP8L.PROVISIONAL_OPPONENT_STAT）');
    assert.ok(pre.inside && pre.bg, '画面に収まり、バトルの背景の上');
    await pg.click('.pbtgo'); await pg.waitForSelector('#bt'); await pg.waitForTimeout(600);
    const after = await pg.evaluate(() => ({ kind: S.m.raise.battle && S.m.raise.battle.kind, pbt: !!document.querySelector('#pbt'), bt: !!document.querySelector('#bt') }));
    assert.deepEqual(after, { kind: 'league', pbt: false, bt: true }, 'START で従来の fight() が始まる（導入は消える）');
    assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
  });
}

// =========================================================
// 2026-10-01 リアル巨大ボード方式：Chapter開始の俯瞰図 → ズーム／パン → 実プレイ画面、START の1タップ（自動停止）、ターン切れ（大会なし → ファーム → 次の Chapter）、フィナのリアクションの差し込み口
// =========================================================
test('JR-9：Chapter に入った瞬間、旅路全体の俯瞰図（演出専用の画像。Pattern A）が全画面に出て Chapter 名 → スタート地点へズーム／パン → 01 の実プレイ画面へ。その間は操作できない。1回だけ（再読み込みでは出ない）。タップで短縮', { skip: SKIP }, async () => {
  const p = await open({ intro: true }); const pg = p.page;
  await H.newGame(pg, 'テスト');
  await pg.evaluate(() => { window.__tf = []; const tick = () => { const c = document.querySelector('.chintro-cam'); if (c) { const m = /matrix\(([-\d.e]+)/.exec(getComputedStyle(c).transform); if (m) window.__tf.push(+m[1]); } if (window.__tf.length < 2000) setTimeout(tick, 50); }; tick(); });   // ズーム／パンは Web Animations なので、見た目の倍率（computed の matrix）を記録
  await pg.evaluate(() => { const m = mk(0); m.name = 'ソラ'; MMP7.ensureProg(m); S.m = m; save(); MMP8.depart(S, m, () => 0.37); save(); board(); });
  await pg.waitForSelector('.chintro.on', { timeout: 8000 }); await pg.waitForTimeout(400);
  const a = await pg.evaluate(() => { const im = document.querySelector('.chintro-img'), r = im.getBoundingClientRect(), f = document.querySelector('#chfw').getBoundingClientRect(); return { src: im.getAttribute('src'), cover: r.width >= f.width - 1 && r.height >= f.height - 1, title: document.querySelector('.chintro-title').textContent.replace(/\s+/g, ' '), titleOn: document.querySelector('.chintro-title').classList.contains('on'), busy: bBusy, start: document.querySelector('#brollbtn') && document.querySelector('#brollbtn').disabled, bgUnder: !!document.querySelector('#chf .chf-bg'), z: getComputedStyle(document.querySelector('.chintro')).zIndex }; });
  assert.equal(a.src, './assets/fields/ch1a/intro/ch1_intro_overview.webp', '正式な俯瞰図（プレイの背景の流用ではない）'); assert.ok(a.cover, '全画面'); assert.match(a.title, /CHAPTER 1.*はじまりの草原/); assert.equal(a.titleOn, true);
  assert.deepEqual([a.busy, a.start, a.bgUnder], [true, true, true], '演出中は操作できない。下には実プレイの画面（01）が出来ている');
  const t0 = await pg.evaluate(() => MMCHI.isPlaying()); assert.equal(t0, true);
  await pg.waitForFunction(() => !document.querySelector('.chintro'), null, { timeout: 15000 });
  const tf = await pg.evaluate(() => window.__tf);
  assert.ok(tf.length >= 10 && Math.max(...tf) > tf[0] * 1.5, `俯瞰（引き）からスタート地点へ寄る（倍率 ${tf[0] && tf[0].toFixed(3)} → 最大 ${Math.max(...tf).toFixed(3)}）`);
  await idle(pg);
  const b = await pg.evaluate(() => ({ bg: document.querySelector('#chf .chf-bg').getAttribute('src'), node: S.m.raise.node, start: document.querySelector('#brollbtn').textContent.trim(), on: !document.querySelector('#brollbtn').disabled, busy: bBusy }));
  assert.deepEqual(b, { bg: './assets/fields/ch1a/field/ch1_field_01.webp', node: 'f1_0', start: 'START', on: true, busy: false }, '俯瞰図のあとは 01 の実プレイ画面で START が押せる');
  // 再読み込みでは出ない：「見た」はこの個体のこの Chapter の配置（m.raise.field.introSeen）に保存（セーブ全体の項目や sessionStorage では判定しない）
  assert.equal(await pg.evaluate(() => { const s = JSON.parse(localStorage.getItem('mr4v6')); return s.m.raise.field.introSeen === true && !Object.keys(s).some((k) => /intro/i.test(k)) && !Object.keys(s.m.raise).some((k) => /intro/i.test(k)); }), true, '見たかどうかは個体の Chapter の配置に持つ');
  await pg.reload(); await pg.waitForFunction(() => typeof MMP8 === 'object'); await pg.click('.p15start'); await pg.waitForSelector('#chf .chf-bg'); await pg.waitForTimeout(600);
  assert.equal(await pg.evaluate(() => !!document.querySelector('.chintro')), false, '再読み込みでは出さない');
  // タップで短縮：この Chapter の配置を作り直した状態（＝新しい出発）で出し直す
  await pg.evaluate(() => { delete S.m.raise.field.introSeen; save(); document.querySelector('#app').innerHTML = ''; board(); });   // 演出は画面を作るときだけ（同じ画面の描き直しでは出ない）
  await pg.waitForSelector('.chintro.on', { timeout: 8000 }); await pg.waitForTimeout(300); await pg.click('.chintro');
  await pg.waitForFunction(() => !document.querySelector('.chintro'), null, { timeout: 4000 });
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
  assert.ok(gone >= 1200 && gone <= 3500, `サイコロは自動で止まって消える（${gone}ms。設計 約1.7秒）`);
  assert.equal(await pg.evaluate(() => typeof window.chfStop), 'undefined', 'STOP の関数は無い');
  await idle(pg);
  assert.deepEqual(await pg.evaluate(() => [S.m.raise.node, S.m.raise.turnsUsed, document.querySelector('#brollbtn').textContent.trim(), !document.querySelector('#brollbtn').disabled]), ['f1_3', 1, 'START', true], `保存済みの出目 ${saved} で3地点 → START に戻る`); assert.equal(saved, 3);
  assert.deepEqual(p.errors, []);
});

test('JR-11：40ターン目（2026-10-01 夜）に大会会場へ着けなかった：大会なし・ランクは上がらない・Chapter は終了して能力と持ち物は保持 → ファーム → 次の Chapter へ進める', { skip: SKIP }, async () => {
  const p = await open(); const pg = p.page;
  await toField(pg);
  await pg.evaluate(() => { const r = S.m.raise; r.node = 'f2_0'; r.turnsUsed = 39; r.fatigue = 10; S.m.po = 160; S.g = 999; S.inv.bag.push({ id: 'herb' }); save(); board(); }); await idle(pg);
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
  const a = await st(); assert.deepEqual([a.intro, a.node, a.seen], [true, 'f1_0', true], '1体目：Chapter 1 の初突入で導入演出'); await settle();
  await pg.click('#brollbtn'); await settle();   // プレイ中（1ターン進めた）
  await pg.reload(); await pg.waitForFunction(() => typeof MMP8 === 'object'); await pg.click('.p15start'); await pg.waitForSelector('#chf .chf-bg'); await pg.waitForTimeout(700);
  const b = await st(); assert.deepEqual([b.intro, b.uid, b.seen], [false, a.uid, true], '同じ育成の再読み込み：導入演出なし・続きから');
  // 育成放棄（フィールドのメニュー → 2段階の確認）→ 街
  await pg.evaluate(() => p9Menu()); await pg.waitForSelector('#p9ov'); await pg.waitForTimeout(450); await pg.click('#p9ov button[onclick*="p8AbandonAsk"]');
  await pg.waitForSelector('#p8m'); await pg.waitForTimeout(450); await pg.click('#p8m button[onclick*="p8AbandonAsk2"]');
  await pg.waitForFunction(() => { const b = document.querySelector('#p8abgo'); return b && !b.disabled; }, null, { timeout: 8000 }); await pg.click('#p8abgo');
  await pg.waitForSelector('.tbar .tcmd'); assert.equal(await pg.evaluate(() => S.m), null, '放棄で育成中の個体は消える');
  await buy('ガウ'); await depart();
  const c = await st(); assert.deepEqual([c.intro, c.node, c.seen], [true, 'f1_0', true], '2体目：Chapter 1 の初突入で導入演出が再び出る'); assert.notEqual(c.uid, a.uid);
  await settle();
  assert.deepEqual(await pg.evaluate(() => ({ on: !document.querySelector('#brollbtn').disabled, bg: document.querySelector('#chf .chf-bg').getAttribute('src') })), { on: true, bg: './assets/fields/ch1a/field/ch1_field_01.webp' });
  assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
});
