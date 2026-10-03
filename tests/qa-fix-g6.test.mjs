// =========================================================
// QA 修正 G6：その他（修行サイコロ・画面のスクロール位置・大会の最終試合の表示・合体の名前・npm test）
//  ・trRoll：出目の表示と0.25秒の間（if(dice)dice.textContent=["","①","②","③"][n];await sleep(250);）が、
//    Phase 12 の同期で直前の // コメントと同じ行につながり、実行されていなかった → bRoll と同じく次の行に戻す
//  ・修行ボード：サイコロを振るたびに trScr の scrollTo(0,0) で一番上へ戻り、高さ 750px 以下の画面では
//    「サイコロを振る」ボタンが毎回画面の外へ出ていた → 振った後の再表示では見ていたスクロール位置のまま
//    （修行を始めたときの最初の表示は従来どおり一番上から）
//  ・lobby()：街を開いてもスクロール位置が前の画面のまま（購入・合体の後、見出しが画面の外）→ ほかの画面と同じく一番上から
//  ・大会の最終試合：finishBattle の won が大会全体の結果（1位か）に置き換わり、「第N試合：勝ち！／負け…」が
//    試合そのものの勝敗と食い違っていた → finishBattle は試合の勝敗を matchWon でも返し、画面はそれを使う
//    （won・place・settled・reward の意味は変えない）
//  ・cname（合体で生まれる子の名前）：UTF-16 の単位で切っていたため、絵文字（サロゲートペア）が半分になっていた
//    → 文字（コードポイント）単位で「親1の前2文字＋親2の後ろ2文字」（ふつうの名前は以前と同じ結果）
//  ・package.json：npm test が tests/rules.test.mjs だけを実行していた → CLAUDE.md と同じ node --test tests/*.test.mjs
//  見た目・文章・価格・報酬・セーブ形式（v6・mr4v6）・Phase 6 保護対象は変えていない。
// =========================================================
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as H from './e2e/harness.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const HTML = rd('index.html');
const LINES = HTML.split('\n');
const lineOf = (prefix) => { const l = LINES.find((x) => x.startsWith(prefix)); assert.ok(l, '抽出失敗: ' + prefix); return l; };
const between = (a, b) => { const i = HTML.indexOf(a), k = HTML.indexOf(b, i + a.length); assert.ok(i >= 0 && k > i, '抽出失敗: ' + a); return HTML.slice(i, k); };
const J = (o) => JSON.parse(JSON.stringify(o));
function load() { const w = {}; for (const f of ['js/phase7/progression.js', 'js/phase8/league.js', 'js/phase8/raising.js', 'js/phase10/monsters.js']) new Function('window', rd(f))(w); return { P7: w.MMP7, P8: w.MMP8, LG: w.MMP8L }; }
function mon(P7, over = {}) {
  const m = { sp: 0, name: 'テスト', age: 0, span: 30, h: 0, rk: 0, fa: 0, st: 0, last: null, li: 100, po: 100, in: 100, hi: 100, ev: 100, de: 100, sk: [0, 1, 2, 3], eq: [0, 1, 2, 3, -1, -1], ...over };
  P7.ensureProg(m); return m;
}

// ---------------------------------------------------------
// 修行サイコロ（trRoll）：index.html の実物を取り出して動かす（tests/phase12.test.mjs の trEnv と同じ取り出し方）
// ---------------------------------------------------------
const TR_SRC = between('async function trRoll(){', '\n// ---- 出発準備');
/** 修行中のセーブ（pos：今いるマス、pending：保存済みの未処理の出目＝この出目で進む） */
function trainingSave(pos, pending) {
  const { P7, P8 } = load(); const S = P8.newSave(); S.m = P8.initIndividual(S, mon(P7));
  Object.assign(S.m.raise, { state: 'farm', ch: 2, log: [{ ch: 1 }] }); S.trainTix = 3;
  assert.equal(P7.startTraining(S, S.m, 'po').ok, true); S.m.raise.trainRun.pos = pos; S.m.raise.trainRun.roll = pending; return J(S);
}
/**
 * trRoll を動かす。ev に「演出・待ち（その時のサイコロ表示）・再表示」の順番を記録する。
 *  play：正式サイコロの演出（false で再生できない時の予備の演出へ）／win：スクロール位置を持つ window の代わり（無ければ window 無し）
 */
function trEnv(save0, { play = true, win = null, onTraining = true } = {}) {
  const { P7, P8 } = load(); const S = P8.migrateSave(J(save0)), ev = [], dice = { textContent: '' };
  const $ = (s) => (s === '#p7dice' ? dice : s === '#p7msg' ? (onTraining ? {} : null) : null);
  const trRoll = new Function('S', 'MMP7', '$', 'sfx', 'p12Dice', 'R', 'sleep', 'LAB', 'SK', 'save', 'trScr', 'window', `let p7Busy=false;\n${TR_SRC}\nreturn trRoll;`)(
    S, P7, $, () => {}, { play: async (k, v) => { ev.push(['play', v]); return play; } }, () => 1, async (ms) => { ev.push(['sleep', ms, dice.textContent]); },
    { po: 'ちから', li: 'ライフ' }, {}, () => {}, (msg, done) => { ev.push(['screen', msg, !!done]); if (win) win.scrollTo(0, 0); },   // 実物の trScr は最後に scrollTo(0,0) する
    win || undefined);
  return { S, ev, trRoll };
}
const fakeWin = (y) => ({ scrollY: y, calls: [], scrollTo(x, v) { this.calls.push(v); this.scrollY = v; } });

test('QA-G6-1：修行サイコロ：正式サイコロの演出を再生できないとき、予備の演出のあと実際の出目（①〜③）を表示し、0.25秒おいてから進む', async () => {
  // 守ること：以前は出目の表示と0.25秒の間がコメントの中にあり、ランダムな面（⚀⚁⚂）のまま再表示されていた
  const E = trEnv(trainingSave(0, 2), { play: false });
  await E.trRoll();
  const k = E.ev.findIndex((e) => e[0] === 'screen');
  assert.ok(k > 1, '再表示される');
  assert.deepEqual(E.ev[k - 1], ['sleep', 250, '②'], '再表示の直前：出目 2 を ② で表示して0.25秒');
  assert.ok(E.ev.slice(1, k - 1).every((e) => e[0] === 'sleep' && e[1] < 250 && ['⚀', '⚁', '⚂'].includes(e[2])), '予備の演出（⚀⚁⚂）はそのまま');
  assert.equal(E.S.m.raise.trainRun.pos, 2, '出目の数だけ進む（進み方は変えていない）');
});

test('QA-G6-2：修行サイコロ：正式サイコロの演出のあとも、bRoll（Chapterボード）と同じく出目を表示して0.25秒おいてから進む。出目の表示の文はコメントの外にある', async () => {
  // 守ること：演出 → 出目の表示・0.25秒 → 前進 の順番（Phase 12 の同期で消えた0.25秒の間を戻した）
  for (const n of [1, 2, 3]) {
    const E = trEnv(trainingSave(0, n));
    await E.trRoll();
    assert.deepEqual(E.ev.map((e) => e[0]), ['play', 'sleep', 'screen'], `出目 ${n}：演出 → 待ち → 再表示`);
    assert.deepEqual(E.ev[0], ['play', n]); assert.deepEqual(E.ev[1], ['sleep', 250, ['', '①', '②', '③'][n]], '出目を表示して0.25秒');
    assert.ok(E.ev[2][1].startsWith(`${n}マス進んだ。`), '進んだ後の表示（文章は変えていない）');
  }
  const code = TR_SRC.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');   // 行末の // コメントを除いた実行される部分
  assert.ok(code.includes('if(dice)dice.textContent=["","①","②","③"][n];await sleep(250);'), '出目の表示と0.25秒の間は実行される位置にある');
  assert.ok(code.indexOf('p12Dice.play("std",n)') < code.indexOf('dice.textContent=["","①","②","③"][n]') && code.indexOf('dice.textContent=["","①","②","③"][n]') < code.indexOf('MMP7.advanceTraining(S,S.m,n)'), '演出 → 出目の表示 → 前進');
});

test('QA-G6-3：修行ボード：サイコロを振った後の再表示（ゴールを含む）は、見ていたスクロール位置のまま。一番上にいたときや修行の画面でないときは何もしない', async () => {
  // 守ること：以前は振るたびに一番上へ戻り、小さい画面では「サイコロを振る」ボタンが毎回画面の外へ出ていた
  const w1 = fakeWin(480), A = trEnv(trainingSave(0, 1), { win: w1 });
  await A.trRoll();
  assert.equal(A.ev.at(-1)[0], 'screen'); assert.equal(w1.scrollY, 480, '振った後も同じ位置'); assert.deepEqual(w1.calls, [0, 480]);
  const w2 = fakeWin(300), B = trEnv(trainingSave(13, 3), { win: w2 });
  await B.trRoll();
  assert.equal(B.S.m.raise.trainRun, null, 'ゴール（修行クリア）'); assert.equal(B.ev.at(-1)[2], true, 'ゴールの表示'); assert.equal(w2.scrollY, 300, 'ゴールの表示も同じ位置');
  const w3 = fakeWin(0), C = trEnv(trainingSave(0, 1), { win: w3 });
  await C.trRoll(); assert.deepEqual(w3.calls, [0], '一番上なら従来どおり（余計にスクロールしない）');
  const w4 = fakeWin(200), D = trEnv(trainingSave(0, 1), { win: w4, onTraining: false });
  await D.trRoll(); assert.equal(w4.scrollY, 0, '修行の画面が出ていないときは位置を戻さない');
  const E = trEnv(trainingSave(0, 1)); await E.trRoll(); assert.equal(E.S.m.raise.trainRun.pos, 1, 'window が無くても止まらない');
  assert.match(between('function trScr(msg,done){', '\nlet p7Busy=false;'), /try\{window\.scrollTo\(0,0\)\}catch\(e\)\{\}/, '修行を始めたときの最初の表示は従来どおり一番上から');
});

test('QA-G6-4：街（lobby）を開いたら、ほかの画面と同じく一番上から表示する', () => {
  // 守ること：以前は購入・合体の後などに街が途中までスクロールした位置で開き、見出しが画面の外だった
  const src = between('function lobby(msg,open){', '\n// ---- Phase 11：プレイヤー名');
  assert.match(src, /<\/div><\/div><\/div>`;try\{window\.scrollTo\(0,0\)\}catch\(e\)\{\} \/\/ 街は1画面で固定[^\n]*\n\}$/, '画面を描いた後に一番上へ（2026-09-30：街は1画面で固定。セーブ・ロードは下のバー）');
  assert.match(src, /^function lobby\(msg,open\)\{if\(p8Blocked\(\)\)return;if\(S\.playerNamePending\)return p11NameScr\(msg\);/, '育成中・名前登録前の扱いは従来どおり');
});

// ---------------------------------------------------------
// 大会の最終試合の表示：finishBattle（js/phase8/raising.js）と p8AfterBattle（index.html）
// ---------------------------------------------------------
function line1() { return { nodes: { s: { type: 'start', x: 0, y: 0 }, g: { type: 'tournament', x: 1, y: 0 } }, conn: { s: ['g'] }, start: 's', goal: 'g' }; }
/** Chapter 1 のゴールで大会（ランク E）に参加し、pattern のとおりに勝ち負けして、各試合の finishBattle の結果を返す */
function playTour(seed, pattern) {
  const { P7, P8, LG } = load(); P7.registerChapterBoard(1, line1());
  const S = P8.newSave(); S.g = 300; S.wins = 0; S.m = P8.initIndividual(S, mon(P7));
  P8.depart(S, S.m); P8.roll(S, S.m, () => 0);
  for (let g = 0; g < 20 && S.m.raise.pend; g++) { const st = S.m.raise.pend.stage; if (st === 'move') P8.step(S, S.m); else if (st === 'resolve') P8.resolveLanding(S, S.m, () => 0); else break; }
  assert.equal(P8.startTournament(S, S.m, 0, seed).ok, true);
  const lg = S.m.raise.tour.league; assert.equal(lg.rounds.length, pattern.length);
  const out = [];
  for (const won of pattern) {
    const opp = LG.playerMatch(lg).opp;
    assert.equal(P8.beginBattle(S, S.m, { kind: 'league', rank: 0 }).ok, true);
    if (won) { S.g += 100; S.wins += 1; }   // 旧fight()が勝ったときに付ける報酬（finishBattle で戻す）
    P8.markBattleDone(S); out.push({ f: P8.finishBattle(S, S.m, () => 0), cell: LG.resultCell(lg, lg.entrants[0].id, opp) });
  }
  return { S, out };
}
const afterBattle = new Function('board', 'S', 'finaFlags', 'save', `${lineOf('function p8AfterBattle(f){')}\nreturn p8AfterBattle;`)((m) => m, { m: null }, () => ({}), () => {});   // 2026-10-04：S ランク制覇のフラグ（finaFlags().chapter5）は空の入れ物で受ける

test('QA-G6-5：大会の最終試合に勝ったが大会は1位でない → 「第5試合：勝ち！ 大会は○位で終わった。」（以前は「負け…」と出ていた）', () => {
  const { out } = playTour(7, [false, false, false, false, true]);
  out.slice(0, 4).forEach(({ f }, i) => { assert.equal(f.matchWon, false); assert.equal(f.won, false); assert.equal(afterBattle(f), `第${i + 1}試合：負け…`); });
  const { f, cell } = out[4];
  assert.equal(cell, 'win', 'リーグの記録でも最終試合は勝ち');
  assert.deepEqual([f.settled, f.won, f.matchWon, f.round], [true, false, true, 4], 'won は大会全体の結果（従来どおり）、matchWon は試合の勝敗');
  assert.ok(f.place > 1);
  assert.equal(afterBattle(f), `第5試合：勝ち！ 大会は${f.place}位で終わった。`);
});

test('QA-G6-6：大会の最終試合に負けたが大会は1位 → 「第5試合：負け… 大会全体で1位になった！」（以前は「勝ち！」と出ていた）。報酬は従来どおり1回', () => {
  let hit = null;
  for (let seed = 1; seed <= 400 && !hit; seed++) { const r = playTour(seed, [true, true, true, true, false]); if (r.out[4].f.place === 1) hit = r; }
  assert.ok(hit, '最終試合に負けても1位になる大会がある');
  const { f, cell } = hit.out[4];
  assert.equal(cell, 'loss', 'リーグの記録でも最終試合は負け');
  assert.deepEqual([f.settled, f.won, f.matchWon, f.place], [true, true, false, 1]);
  assert.ok(f.reward && f.reward.firstClear, '1位の報酬（初回）は従来どおり');
  assert.equal(hit.S.g, 300 + 100, 'E の初回賞金 100G が1回だけ（個別試合の旧報酬は残らない）');
  assert.equal(afterBattle(f), '第5試合：負け… 大会全体で1位になった！');
  hit.out.slice(0, 4).forEach(({ f: x }, i) => assert.equal(afterBattle(x), `第${i + 1}試合：勝ち！`));
});

test('QA-G6-7：試合の勝敗（matchWon）はどの戦闘でも返す。matchWon の無い結果（古い raising.js）は従来どおり won で表示。途中終了・練習試合の表示は変わらない', () => {
  assert.equal(afterBattle({ kind: 'league', round: 1, won: true }), '第2試合：勝ち！');
  assert.equal(afterBattle({ kind: 'league', round: 2, won: false }), '第3試合：負け…');
  assert.equal(afterBattle({ kind: 'league', interrupted: true }), '大会の試合は途中で終わった。同じ試合をもう一度行えます。');
  assert.equal(afterBattle({ kind: 'practice', won: true, matchWon: true }), '練習試合に勝った！（練習試合のため賞金・ランクアップ・実績はありません）');
  assert.match(rd('js/phase8/raising.js'), /\n {4}out\.matchWon = won;[^\n]*\n {4}return out;\n {2}\}/, 'finishBattle の最後で試合の勝敗を返す');
  const src = rd('js/phase8/raising.js'); assert.ok(src.includes("if (!b.done) return { kind: b.kind, interrupted: true };"), '途中終了の結果は従来どおり');
});

// ---------------------------------------------------------
// 合体で生まれる子の名前（cname）
// ---------------------------------------------------------
const cname = new Function(`${lineOf('const cname=')}\nreturn cname;`)();
const oldCname = (a, b) => a.name.slice(0, 2) + b.name.slice(-2);
const nm = (name) => ({ name });

test('QA-G6-8：合体の子の名前：絵文字（サロゲートペア）を半分にしない。ふつうの名前は以前と同じ「前2文字＋後ろ2文字」', () => {
  // 守ること：以前は「ソ🐶」＋「ガ🐦」で壊れた文字（ソ\ud83d🐦）ができていた
  assert.equal(cname(nm('ソ🐶'), nm('ガ🐦')), 'ソ🐶ガ🐦');
  assert.equal(cname(nm('ソラモ'), nm('🐦ガ')), 'ソラ🐦ガ');
  assert.equal(cname(nm('🐶🐱🐭'), nm('ab🐦🐤')), '🐶🐱🐦🐤');
  for (const [a, b] of [['ソ🐶', 'ガ🐦'], ['ソラモ', '🐦ガ'], ['🐶🐱🐭', 'ab🐦🐤'], ['🐶', '🐦']]) assert.ok(cname(nm(a), nm(b)).isWellFormed(), `${a}+${b}`);
  assert.equal(oldCname(nm('ソ🐶'), nm('ガ🐦')).isWellFormed(), false, '（以前の切り方では壊れた文字になる例）');
  for (const [a, b] of [['ソラモ', 'ガウル'], ['ガウル', 'ソラモ'], ['ノビトン', 'ジオル'], ['A', 'B'], ['アルト', 'Z'], ['ｿﾗﾓ★', 'ｶﾞｳﾙ'], ['ソラモソラモソラ', 'ガウルガウルガウ'], ['Sora 2', 'x&<y>']])
    assert.equal(cname(nm(a), nm(b)), oldCname(nm(a), nm(b)), `ふつうの名前は以前と同じ：${a}+${b}`);
  assert.match(HTML, /c\.name=cname\(a,b\);/, '合体で子に名前を付ける所は従来どおり');
  assert.match(HTML, /<b>生まれるモンスター：\$\{p11Esc\(cname\(a,c\)\)\}<\/b>/, '表示は従来どおり p11Esc を通す');
});

test('QA-G6-9：npm test は CLAUDE.md と同じく全テスト（node --test tests/*.test.mjs）を実行する', () => {
  // 守ること：以前は tests/rules.test.mjs（134件）だけで、ほかのテストが npm test で実行されていなかった
  const pkg = JSON.parse(rd('package.json'));
  assert.equal(pkg.scripts.test, 'node --test tests/*.test.mjs');
  assert.equal(pkg.scripts.serve, 'python3 -m http.server 8000', 'ほかの設定は変えていない');
  assert.equal(pkg.type, 'module'); assert.equal(pkg.private, true);
});

// ---------------------------------------------------------
// 実ブラウザ（index.html 全体）
// ---------------------------------------------------------
let L = null;
before(async () => { if (!H.skipReason()) L = await H.launch(); });
after(async () => { if (L) await L.close(); });
/** 要素が画面（縦）に全部見えているか */
const inView = (page, sel) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }, sel);
/**
 * ページを開き、会話を速く送ったときに途中で取り消された画像の読み込み（net::ERR_ABORTED）を記録する。
 * bad() は 404 などの失敗だけを返す（取り消しは不具合ではない。実行環境が重いときだけ起こるため、ここでは数えない）
 */
async function openPage(opt) {
  const p = await L.open(opt), aborted = new Set();
  p.page.on('requestfailed', (r) => { if (/ERR_ABORTED/.test((r.failure() || {}).errorText || '')) aborted.add(r.url().slice(L.url.length)); });
  p.badNow = () => p.bad.filter((b) => !(b.startsWith('failed ') && aborted.has(b.slice('failed '.length))));
  return p;
}

test('QA-G6-B1：実ブラウザ（375×667・タッチ）：修行ボードで「サイコロを振る」を押すと、振った後もボタンが画面の中にある（3回続けて）', { skip: H.skipReason() }, async () => {
  // 守ること：以前は振るたびに一番上へ戻り、このサイズではボタンが毎回画面の外（scrollY 0・ボタンの上端 777px）になっていた
  const p = await openPage({ size: H.SIZES.se, touch: true }); const pg = p.page;
  await H.newGame(pg, 'テスト');
  await pg.evaluate(() => {
    MMP10M.purchase(S, 'solamo', 0); S.m = mk(0); const m = S.m; MMP8.depart(S, m);
    Object.assign(m.raise, { node: MMP8.trackOf(1).goal, goal: true, pend: null }); MMP8.declineTournament(S, m); S.trainTix = 3; save();
    p12Dice.play = async () => true;   // 正式サイコロの演出（約1.6秒）は省く（出目・進み方・画面は実物のまま）
    trStart('po');
  });
  await pg.waitForSelector('#p7roll');
  // 2026-09-30：ページ（html・body）はスクロールしない。修行ボードは画面の器（gameScroller()）の中でスクロールする
  const SY = () => pg.evaluate(() => scrollY + gameScroller().scrollTop);
  assert.equal(await SY(), 0, '修行を始めたときは従来どおり一番上から');
  const visible = () => pg.waitForFunction(() => { const r = document.getElementById('p7roll').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }, null, { timeout: 5000 });
  for (let k = 0; k < 3; k++) {
    await pg.evaluate(() => { const g = gameScroller(); g.scrollTop = g.scrollHeight; });   // プレイヤーがボタンまで（一番下まで）スクロールする
    await visible();
    const y0 = await pg.evaluate(() => { document.getElementById('p7msg').dataset.old = '1'; return scrollY + gameScroller().scrollTop; });
    assert.ok(y0 > 0, 'このサイズではスクロールしないとボタンが見えない');
    const pos0 = (await H.getS(pg)).m.raise.trainRun.pos;
    await pg.tap('#p7roll');
    await pg.waitForFunction(() => { const m = document.getElementById('p7msg'); return !!m && !m.dataset.old && !p7Busy; });
    assert.match(await pg.evaluate(() => document.getElementById('p7msg').textContent), /^[123]マス進んだ。/);
    assert.ok((await H.getS(pg)).m.raise.trainRun.pos > pos0, '進んだ');
    // 再表示の直後は画像・演出で高さが十数px 変わることがあるため、落ち着いた表示で確かめる（以前は scrollY 0 のまま戻らない）
    await visible().catch(() => {});
    assert.ok(await inView(pg, '#p7roll'), `${k + 1}回目：振った後もボタンが画面の中`);
    assert.ok(await SY() > 0, `${k + 1}回目：一番上へ戻らない`);
    assert.equal(await pg.evaluate(() => scrollY), 0, `${k + 1}回目：ページ自体は動かない`);
  }
  assert.deepEqual(p.errors, []); assert.deepEqual(p.badNow(), []);
});

test('QA-G6-B2：実ブラウザ（375×667）：新規開始 → 市場で購入（スクロールなし） → 街は一番上から → 牧場 → 街 → ファーム → 出発準備 → 出発（エラーなし）', { skip: H.skipReason() }, async () => {
  // 守ること：以前は購入後の街がスクロールした位置（scrollY 258・見出しの上端 -242px）で開いていた
  const p = await openPage({ size: H.SIZES.se }); const pg = p.page;
  await H.newGame(pg, 'テスト');
  await pg.evaluate(() => market());
  await H.marketDetail(pg); await pg.waitForSelector('#p10info .p10buy:not([disabled])');
  // 市場の整理（詳細は下からのシート）で、購入ボタンまでスクロールせずに届くようになった
  assert.deepEqual(await pg.evaluate(() => { const b = document.querySelector('#p10info .p10buy').getBoundingClientRect(); return [scrollY, b.bottom <= innerHeight]; }), [0, true], 'スクロールなしで購入ボタンが見える');
  await H.marketDetail(pg); await pg.click('#p10info .p10buy');
  await pg.waitForSelector('#p10ov .p10ok');
  await pg.waitForTimeout(500);   // 確認シートは開いてから0.35秒の押下を受け付けない（誤タップ防止）
  await pg.click('#p10ov .p10ok');
  await pg.waitForSelector('#app .map');
  assert.ok((await H.getS(pg)).m, '購入した');
  assert.equal(await pg.evaluate(() => scrollY), 0, '街は一番上から');
  assert.ok(await pg.evaluate(() => document.querySelector('h1').getBoundingClientRect().top >= 0), '見出しが見える');
  // 牧場（スクロールしてから街へ戻っても一番上から）
  await pg.click('#app .hz[onclick="farm()"]');
  await pg.waitForSelector('#app button[onclick="dep()"]');
  await pg.evaluate(() => window.scrollTo(0, 99999));
  assert.equal(await pg.evaluate(() => scrollY), 0, '牧場の画面でもページ自体はスクロールしない（2026-09-30：画面全体を固定）');
  await pg.click('#app button[onclick="pfSellUid=null;lobby()"]');
  await pg.waitForSelector('#app .map');
  assert.deepEqual(await pg.evaluate(() => [scrollY, document.getElementById('app').scrollTop]), [0, 0], '牧場から戻った街も一番上から');
  // ファーム → 出発準備 → 出発（フィナの確認 →「始める」→ フィナ→ダン → 出発）
  await pg.click('#app .tbar .hz[onclick="hall()"]');
  await pg.waitForSelector('#app button[onclick="prepScr()"]');
  await pg.click('#app button[onclick="prepScr()"]');
  const dep = '#app button[onclick="p7Depart(this)"]';
  await pg.waitForSelector(dep);
  await H.startRaising(pg, dep);   // フィナの確認 →「始める」→ フィナ→ダン → 出発
  assert.equal((await H.getS(pg)).m.raise.state, 'board', '出発した');
  assert.equal((await H.storedSave(pg)).v, 6, 'セーブは v6 のまま');
  assert.deepEqual(p.errors, []); assert.deepEqual(p.badNow(), []);
});
