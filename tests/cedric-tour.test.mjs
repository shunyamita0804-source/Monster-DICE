// =========================================================
// 大会NPC「セドリック」（公式ランク大会の進行・実況・案内。闘技場の管理者ヴァルガスとは別人物）
//  ・アップ画像のみ（closeup の6表情：normal・smile・guide・happy・surprised・serious）。小さい顔は立ち絵 normal から切り出した face.webp
//  ・大会の画面（ゴールのランク選択・順位表・VS画面・結果）に、顔・名前つきの短いアナウンス（CEDRIC_TALK）
//  ・システム表示（参加条件・報酬・試合結果の文・中断の案内など）はセドリックの発言にしない（顔・名前なしのまま）
//  ・Phase 6（fight() など）には触れない。大会の進行・報酬・参加条件は変えない
//  実ブラウザのテストは QA_E2E=1 のときだけ実行する（tests/e2e/harness.mjs）。
// =========================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import * as H from './e2e/harness.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const EXPR = ['normal', 'smile', 'guide', 'happy', 'surprised', 'serious'];
function loadNpc() { const ctx = { console }; ctx.window = ctx; vm.createContext(ctx); vm.runInContext(readFileSync(path.join(ROOT, 'js/npc/npc.js'), 'utf8'), ctx); return ctx.MMNPC; }
const lineOf = (s) => HTML.split('\n').find((l) => l.startsWith(s));
const cedricTalk = () => { const i = HTML.indexOf('const CEDRIC_TALK={'); return new Function(`return ${HTML.slice(i + 'const CEDRIC_TALK='.length, HTML.indexOf('};', i) + 1)}`)(); };
/** 可逆WebP（VP8L）の見出しを読む：形式・幅・高さ・透過の有無（2026-09-30：透過PNGから画素を変えずに変換） */
const webp = (p) => { const b = readFileSync(path.join(ROOT, p)); const v = b.readUInt32LE(21); return { sig: b.subarray(8, 12).toString(), type: b.subarray(12, 16).toString() + (b[20] === 0x2f && (v >>> 28) & 1 ? '+alpha' : ''), w: (v & 0x3fff) + 1, h: ((v >>> 14) & 0x3fff) + 1 }; };
const between = (a, b) => HTML.slice(HTML.indexOf(a), HTML.indexOf(b, HTML.indexOf(a)));

test('CED-1：セドリックは公式ランク大会の進行役として、アップ画像（closeup）の6表情で登録。Chapterボードには置かない', () => {
  const M = loadNpc(), c = M.get('cedric');
  assert.deepEqual([c.name, c.role, c.board, c.defaultView, c.defaultExpr], ['セドリック', '公式ランク大会の進行役', false, 'closeup', 'normal']);
  assert.deepEqual([...M.expressionsOf('cedric', 'closeup')], EXPR);
  assert.equal(M.imageOf('cedric', 'closeup', 'guide').src, 'assets/npc/cedric/closeup/guide.webp');
  assert.deepEqual(['dan', 'nick', 'karen', 'fina'].map((k) => M.get(k).name), ['ダン', 'ニック', 'カレン', 'フィナ'], 'ほかのNPCはそのまま');
});

test('CED-2：素材は透過PNG（RGBA）。立ち絵6枚は 573×760、小さい顔は 256×256。README に元画像との対応・透明化の方法・表情名が仮であること', () => {
  for (const e of EXPR) { const i = webp(`assets/npc/cedric/closeup/${e}.webp`); assert.deepEqual([i.sig, i.type, i.w, i.h], ['WEBP', 'VP8L+alpha', 573, 760], e); }
  const f = webp('assets/npc/cedric/face.webp'); assert.deepEqual([f.sig, f.type, f.w, f.h], ['WEBP', 'VP8L+alpha', 256, 256]);
  const md = readFileSync(path.join(ROOT, 'assets/npc/cedric/README.md'), 'utf8');
  assert.match(md, /市松模様/); assert.match(md, /face\.webp/); assert.match(md, /仮名・要確認/);
  for (const e of EXPR) assert.ok(md.includes(`closeup/${e}.webp`), e);
});

test('CED-3：一言は CEDRIC_TALK。丁寧で公式感のある口調（です・ます）。絶叫・若者言葉・ダン／ニックの口調は使わない', () => {
  const T = cedricTalk();
  assert.deepEqual(T, {
    open: '公式ランク{R}大会を開始します。参加者を紹介しましょう。',
    entry: '公式ランク大会へようこそ。準備はよろしいですか？',
    first: 'それでは、始めましょう。最初の対戦はこちらです。',
    next: ['次の対戦はこちらです。', 'いい試合になりそうですね。'],
    vs: '両者、準備はよろしいですね！',
    won: '勝負あり！ 見事な戦いでした！',
    lost: '大会はここまでです。見事な戦いでした。' });
  const all = [T.open, T.entry, T.first, ...T.next, T.vs, T.won, T.lost];
  for (const s of all) assert.doesNotMatch(s, /うおお|激アツ|ヤバ|マジ|だぜ|だな|任せておけ|任せてくれ|賞金|チケット|報酬|G$/, s);
  assert.match(lineOf('const CEDRIC_FACE='), /^const CEDRIC_FACE="assets\/npc\/cedric\/face\.webp";/);
});

test('CED-4：表示場所：ゴールのランク選択・順位表（次の相手）・VS画面・結果画面。システム表示（.p9msg／.p9s／報酬／.p9prov）とは別の要素', () => {
  assert.match(lineOf('function p9Ced('), /^function p9Ced\(t\)\{return `<div class="p9ced"><img src="\$\{CEDRIC_FACE\}" alt=""><div class="tx"><b>セドリック<\/b>\$\{t\}<\/div><\/div>`\}$/);
  // 2026-09-30：ランク選択の案内はフィナ（セドリックは大会が始まってから＝開始演出 p9TourIntro の CEDRIC_TALK.open）
  assert.ok(between('function p8GoalHtml(', '\nconst P9_PADLOCK').includes('<h3>🏟 公式ランク大会</h3><div id="p9fsay">${p9Fina(FINA_RANK_TALK.pick)}</div><p class="p9s">'));
  assert.doesNotMatch(between('function p8GoalHtml(', '\nconst P9_PADLOCK'), /p9Ced|CEDRIC/, 'ランク選択の画面にセドリックは出さない');
  assert.ok(between('function p9TourIntro(', '\n// セドリック').includes('CEDRIC_TALK.open') || HTML.includes('${CEDRIC_TALK.open.replace("{R}",RN[k])}'), '大会開始の演出でセドリックの一言');
  const tour = between('function p8TourScr(msg){', '\nfunction p9TourResult(');
  assert.ok(tour.includes('${p9Ced(lg.round==0?CEDRIC_TALK.first:CEDRIC_TALK.next[lg.round%CEDRIC_TALK.next.length])}<div class="p9next">'));
  assert.ok(tour.includes('${msg?`<div class="p9msg p9tmsg">${msg}</div>`:""}'), '試合結果などの通知は顔・名前なしのまま');
  assert.ok(between('function p9VsScr(){', '\nfunction p9VsGo(').includes('${p9Ced(CEDRIC_TALK.vs)}<div class="p9vs-fr">'));
  assert.ok(between('function p9TourResult(msg){', '\nfunction p8RewardText(').includes('${p9Ced(rs.won?CEDRIC_TALK.won:CEDRIC_TALK.lost)}'));
  assert.equal((HTML.match(/p9Ced\(/g) || []).length, 4, '定義＋3か所（順位表・VS・結果）だけ。ランク選択はフィナ');
  // 大会の処理（参加・試合開始・辞退・終了）は変えていない
  assert.match(lineOf('function p8TourStart('), /^function p8TourStart\(k,b\)\{if\(bBusy\)return;if\(!p9arm\(b,`もう一度押すとランク\$\{RN\[k\]\}大会に参加`\)\)\{finaRankSay\(k\);return\}const r=MMP8\.startTournament\(S,S\.m,k\);if\(!r\.ok\)return board\(\);save\(\);p9TourIntro\(k\)\.then\(\(\)=>\{P9_ENTER=true;board\(\)\}\)\}$/, '1回目の押下はフィナの見立て、2回目で参加 → 開始演出 → 順位表');
  assert.match(lineOf('function p8TourFight('), /beginBattle\(S,m,\{kind:"league",rank:t\.rank\}\)/);
  const fight = HTML.slice(HTML.indexOf('async function fight('), HTML.indexOf('\n$("#snd").textContent'));
  assert.doesNotMatch(fight, /CEDRIC|p9Ced|セドリック/, 'Phase 6（fight()）には入れない');
});

// ---------------------------------------------------------
// 実ブラウザ
// ---------------------------------------------------------
const SKIP = H.skipReason();
let L = null, BASE = null;
const KS = ['li', 'po', 'in', 'hi', 'ev', 'de'];
const LOG1 = { ch: 1, reachedGoal: true, turnsUsed: 14, turnLimit: 20, declined: false, tour: { rank: 0, place: 1, won: true, firstClear: true } };
test.before(async () => {
  if (SKIP) return;
  L = await H.launch();
  const p = await L.open({ size: H.SIZES.base });
  await H.newGame(p.page, 'テスト');
  await p.page.evaluate(() => adopt(0, 'ソラモ'));
  BASE = await H.storedSave(p.page);
  await p.ctx.close();
});
test.after(async () => { if (L) await L.close(); });
/** Chapter 2 のゴールに着いた状態（クリア最高ランク E） */
function goalSave() {
  const s = JSON.parse(JSON.stringify(BASE));
  s.npcFlags = { ...s.npcFlags, raiseIntro: 1 };
  Object.assign(s.m.raise, { state: 'board', ch: 2, node: 'G', goal: true, turnsUsed: 12, turnLimit: 20, pend: null, tour: null, battle: null, trainRun: null, log: [LOG1], startStats: Object.fromEntries(KS.map((k) => [k, s.m[k]])) });
  s.m.prog.rankClr = [true, false, false, false, false, false];
  return Object.assign(s, { g: 1000 });
}
async function boot(size) {
  const p = await L.open({ size, save: goalSave() });
  await p.page.waitForSelector('.p15start');
  await p.page.evaluate(() => p8Resume());
  await p.page.waitForSelector('.p9rank', { timeout: 20000 });
  return p;
}
/** 顔・名前つきのセドリックの吹き出し（画面にある分すべて） */
const ceds = (pg) => pg.evaluate(() => [...document.querySelectorAll('.p9ced')].map((c) => { const i = c.querySelector('img');
  return { name: c.querySelector('b').textContent, src: i.getAttribute('src'), ok: i.complete && i.naturalWidth > 0, text: c.querySelector('.tx').textContent.replace(/^セドリック/, '') }; }));
const waitImg = (pg) => pg.waitForFunction(() => [...document.querySelectorAll('.p9ced img')].every((i) => i.complete && i.naturalWidth > 0));
/** システム表示（顔・名前なし）の中にセドリックが入っていない */
const sysClean = (pg) => pg.evaluate(() => [...document.querySelectorAll('.p9msg,.p9s,.p9rw,.p9prov,.p9lose .sub,.p9win .sub')].every((e) => !e.querySelector('img') && !/セドリック/.test(e.textContent)));
/** 大会の1試合を Phase 6 の fight() を使わずに終える（tests/qa-e2e-raising-late.test.mjs の simMatch と同じ） */
const simMatch = (pg, won) => pg.evaluate((won) => {
  const t = S.m.raise.tour; const b = MMP8.beginBattle(S, S.m, { kind: 'league', rank: t.rank }); if (!b.ok) return false;
  save(); if (won) { S.g += 350; S.wins = (S.wins || 0) + 1; } MMP8.markBattleDone(S); save(); after('試合終了'); return true;
}, won);
async function joinD(pg) {
  const sel = 'button.p9rank[onclick^="p8TourStart(1,"]';
  await pg.waitForTimeout(550); await pg.click(sel); await pg.waitForTimeout(700); await pg.click(sel);
  await pg.waitForSelector('.p9tour');
}
const noOverflow = (pg) => pg.evaluate(() => ({ sw: document.documentElement.scrollWidth, W: innerWidth,
  inside: [...document.querySelectorAll('.p9ced')].every((c) => { const r = c.getBoundingClientRect(); return r.left >= -1 && r.right <= innerWidth + 1; }) }));

test('CED-B1：ゴールのランク選択 → 順位表 → 試合後 → VS画面 → 結果（優勝）の各画面で、セドリックの名前・顔・一言。試合結果の通知は顔・名前なしの別表示', { skip: SKIP }, async () => {
  const p = await boot(H.SIZES.base); const pg = p.page; const T = await pg.evaluate(() => CEDRIC_TALK);
  // 大会一覧（ゴールのランク選択）
  await waitImg(pg);
  // 2026-09-30：ランク選択はフィナの見立て（セドリックは大会開始の紹介 p9TourIntro から）
  assert.deepEqual(await ceds(pg), [{ name: 'フィナ', src: 'assets/npc/fina/closeup/smile.webp', ok: true, text: 'フィナ' + (await pg.evaluate(() => FINA_RANK_TALK.pick)) }]);
  assert.equal(await pg.evaluate(() => document.querySelectorAll('.p9ced:not(.p9fina)').length), 0, 'ランク選択にセドリックは出さない');
  assert.ok(await sysClean(pg));
  assert.equal(await pg.evaluate(() => document.querySelectorAll('.p9rank').length), 3, 'ランクの選択肢は従来どおり（E・D・C）');
  // 参加 → 順位表（最初の試合の前）
  await joinD(pg); await waitImg(pg);
  assert.deepEqual((await ceds(pg)).map((c) => [c.name, c.ok, c.text]), [['セドリック', true, T.first]]);
  assert.equal(await pg.evaluate(() => !!document.querySelector('.p9tmsg')), false);
  // 1試合目のあと：通知（第1試合：勝ち！）は顔・名前なし、セドリックは次の対戦の案内
  assert.ok(await simMatch(pg, true)); await pg.waitForSelector('.p9tmsg'); await waitImg(pg);
  assert.equal(await pg.evaluate(() => document.querySelector('.p9tmsg').textContent), '第1試合：勝ち！');
  assert.ok(await sysClean(pg), '試合結果の通知にセドリックの顔・名前は付かない');
  assert.deepEqual((await ceds(pg)).map((c) => c.text), [T.next[1]]);
  // VS画面（試合開始の直前）
  await pg.waitForTimeout(550); await pg.click('button[onclick="p9VsScr()"]'); await pg.waitForSelector('.p9vs .p9go'); await waitImg(pg);
  assert.deepEqual((await ceds(pg)).map((c) => [c.name, c.ok, c.text]), [['セドリック', true, T.vs]]);
  assert.equal(await pg.evaluate(() => S.m.raise.battle), null, 'VS画面では試合はまだ始まらない（従来どおり）');
  await pg.evaluate(() => board()); await pg.waitForSelector('.p9tour .p9next');
  // 残り4試合も勝って優勝 → 結果画面
  for (let i = 0; i < 4; i++) assert.ok(await simMatch(pg, true));
  await pg.waitForSelector('.p9tour.p9won'); await waitImg(pg);
  assert.deepEqual((await ceds(pg)).map((c) => [c.name, c.ok, c.text]), [['セドリック', true, T.won]]);
  assert.ok(await sysClean(pg), '報酬・結果の表示にセドリックの顔・名前は付かない');
  const s = await H.getS(pg);
  assert.deepEqual([s.m.raise.tour.result.place, s.m.raise.tour.result.reward.prize, s.m.raise.tour.result.reward.tickets], [1, 200, 1], '報酬は従来どおり（ランクD初回優勝）');
  assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, [], '404なし');
  await p.ctx.close();
});

test('CED-B2：優勝できなかった結果画面は「大会はここまでです。」の一言（報酬なしの案内はシステム表示のまま）', { skip: SKIP }, async () => {
  const p = await boot(H.SIZES.base); const pg = p.page; const T = await pg.evaluate(() => CEDRIC_TALK);
  await joinD(pg);
  for (let i = 0; i < 5; i++) assert.ok(await simMatch(pg, false));
  await pg.waitForSelector('.p9tour .p9lose'); await waitImg(pg);
  assert.deepEqual((await ceds(pg)).map((c) => [c.ok, c.text]), [[true, T.lost]]);
  assert.match(await pg.evaluate(() => document.querySelector('.p9lose .sub').textContent), /報酬はありません/);
  assert.ok(await sysClean(pg));
  assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
  await p.ctx.close();
});

test('CED-B3：4つの画面サイズで、ランク選択・順位表・VS画面・結果画面のセドリックの吹き出しが画面に収まり、横にはみ出さない', { skip: SKIP }, async () => {
  for (const size of Object.values(H.SIZES)) {
    const p = await boot(size); const pg = p.page; const tag = size.join('×');
    const check = async (label) => { await waitImg(pg); const r = await noOverflow(pg); assert.ok(r.inside, `${tag} ${label}：吹き出しが画面内`); assert.ok(r.sw <= r.W + 1, `${tag} ${label}：横にはみ出さない（${r.sw}/${r.W}）`); };
    await check('ランク選択');
    await joinD(pg); await check('順位表');
    await pg.evaluate(() => p9VsScr()); await pg.waitForSelector('.p9vs .p9go'); await check('VS画面');
    await pg.evaluate(() => board()); await pg.waitForSelector('.p9tour .p9next');
    for (let i = 0; i < 5; i++) assert.ok(await simMatch(pg, true));
    await pg.waitForSelector('.p9tour.p9won'); await check('結果画面');
    assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
    await p.ctx.close();
  }
});
