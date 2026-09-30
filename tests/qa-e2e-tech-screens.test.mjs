// =========================================================
// QA（実ブラウザ）：技術回帰（画面の通し・JS エラー・読み込み・画面サイズごとのはみ出しと押せる位置）
//  ・390×844 で、開始画面から名前登録・フィナ・街・市場・牧場・博物館・セーブ・ファーム・Chapter 1 のボード・大会・VS・
//    試合中の再読み込み・Chapter間ファーム・修行・Chapter 2・育成完了までを通し、JS エラー・読み込み失敗・壊れた画像・横のはみ出し・
//    押せないボタン・正式モンスター画像の色フィルタが無いことを確かめる（サイコロの演出は qa-e2e-tech.test.mjs で確かめる）
//  ・375×667／360×800／430×932 でも主な画面を開き、横にはみ出さないこと、主なボタンがスクロールすれば押せる位置にあり、ほかの要素に隠れていないことを確かめる
//  ・開始画面の透明な開始ボタンが、画像に描かれた「タップしてはじめる」に重なっていること（いろいろな画面サイズ）
//  タイマー・リスナー・DOM の残り方と共通会話の後始末は qa-e2e-tech.test.mjs で確認する。
//  Playwright / Chromium が無い環境では省略（skip）する。
//
//  いまは壊れていると分かっているため、ここでは確かめない（既知の課題）：
//   ・市場の「購入する」ボタンは、どの画面サイズでも最初の画面の下にある（スクロールすれば押せることだけ確かめる）
//   ・修行ボードはサイコロを振るたびに先頭へスクロールし、高さ750px以下ではサイコロのボタンが画面の外に出る（振る前・スクロールすれば押せることだけ確かめる）
//   ・大会の順位表・VS の名前が 360／375 幅で「…ブリーダー …」に切れる
//   ・バトル画面（Phase 6・変更禁止）の相手のHPカードが 390 以下で右にはみ出す → バトル画面のはみ出しは確かめない
//   ・街のマスコット（正式画像）に色のフィルタがかかっている → 正式画像のフィルタの確認から街は除く
//   ・同じ画面にある SVG のグラデーション id の重複
// =========================================================
import test, { describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import * as H from './e2e/harness.mjs';

const ROOT = H.ROOT;
const SKIP = H.skipReason();
let L = null;
test.before(async () => { if (!SKIP) L = await H.launch(); });
test.after(async () => { if (L) await L.close(); });
const OPEN = [];
const openPage = async (o) => { const p = await L.open(o); OPEN.push(p); return p; };
test.afterEach(async () => { for (const p of OPEN.splice(0)) await p.ctx.close().catch(() => {}); });
/** 実ブラウザのテスト：B(名前, 関数) */
const B = (name, fn) => test(name, { skip: SKIP, timeout: 60000 }, fn);

/** ROOT からの相対パスが、各階層の名前まで大文字小文字一致で存在するファイルか */
function existsExact(rel) {
  const parts = rel.replace(/^\.\//, '').split('/').filter(Boolean);
  let dir = ROOT;
  for (const part of parts) {
    let names; try { names = readdirSync(dir); } catch (e) { return false; }
    if (!names.includes(part)) return false;
    dir = path.join(dir, part);
  }
  try { return statSync(dir).isFile(); } catch (e) { return false; }
}
/**
 * 読み込みの失敗のうち、コマ送り（サイコロ・フィナの立ち絵アニメ）で次のコマへ切り替わって取り消されたもの（実在するファイル）を除く。
 *  テスト用のサーバはキャッシュさせない（no-store）ため、テストを並べて動かして重いときは、前のコマの読み込み中に次のコマへ切り替わり
 *  取り消し（ERR_ABORTED）が記録されることがある。ゲームの不具合ではない（本番のキャッシュありでは起きないことを監査で確認済み）。
 */
const FRAME = /^(assets\/(?:dice\/(?:std|branch)\/\d\d\.webp|npc\/fina\/animations\/\w+\/\w+\.png))$/;
const realBad = (bad) => bad.filter((b) => { const m = /^failed (.*)$/.exec(b); return !(m && FRAME.test(m[1]) && existsExact(m[1])); });
/** 要素が出るまで待つ */
const waitSel = (pg, sel, timeout = 15000) => pg.waitForFunction((s) => !!document.querySelector(s), sel, { timeout });
/** 画面の画像の読み込みと、画面の出だしの演出（位置が少し動く約0.3秒の演出など、1秒以内で終わるアニメーション）が終わるまで待つ */
const imgsDone = (pg) => pg.waitForFunction(() => [...document.images].every((i) => i.complete)
  && document.getAnimations().every((a) => { if (a.playState !== 'running' || !a.effect) return true; const t = a.effect.getTiming(); return t.iterations === Infinity || !(Number(t.duration) <= 1000); }), null, { timeout: 15000 });

/**
 * 画面の確認（ページの中で実行）：横のはみ出し・主なボタンが押せる位置にあるか・壊れた画像・正式モンスター画像の色フィルタ
 *  sels：主なボタンのセレクタ（見えているもの全部を確かめる）。必要ならスクロールして中央の点がそのボタン（か中の要素）に当たること
 */
const PROBE = ({ sels, fixed }) => {
  const W = innerWidth, Hh = innerHeight, de = document.documentElement, out = { W, H: Hh, sw: de.scrollWidth, bsw: document.body.scrollWidth, btn: [], fixed: [], broken: [], filter: [], n: 0 };
  const vis = (e) => { const cs = getComputedStyle(e), r = e.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
  const d = (e) => e ? e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/).join('.') : '') : 'なし';
  const sx = scrollX, sy = scrollY;
  // スクロールせずに全体が見えているべきもの
  for (const sel of fixed || []) {
    const els = [...document.querySelectorAll(sel)].filter(vis);
    if (!els.length) out.fixed.push(sel + '：見つからない');
    for (const e of els) { const r = e.getBoundingClientRect(); if (r.left < -1 || r.top < -1 || r.right > W + 1 || r.bottom > Hh + 1) out.fixed.push(`${sel}：画面に収まっていない [${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}]`); }
  }
  for (const sel of sels || []) {
    const els = [...document.querySelectorAll(sel)].filter(vis);
    if (!els.length) { out.btn.push(sel + '：見つからない'); continue; }
    for (const e of els) {
      out.n++;
      if (e.scrollIntoViewIfNeeded) e.scrollIntoViewIfNeeded(true); else e.scrollIntoView({ block: 'center' });
      const r = e.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      if (cx < 0 || cx > W || cy < 0 || cy > Hh) { out.btn.push(`${sel}（${d(e)}）：スクロールしても画面の外 (${Math.round(cx)},${Math.round(cy)})`); continue; }
      const top = document.elementFromPoint(cx, cy);
      if (!top || !(top === e || e.contains(top))) out.btn.push(`${sel}（${d(e)}）：${d(top)} に隠れている`);
    }
  }
  window.scrollTo(sx, sy);
  for (const i of document.images) if (i.getAttribute('src') && !(i.complete && i.naturalWidth > 0)) out.broken.push(i.getAttribute('src').slice(0, 80));
  // 正式モンスター画像：本体と祖先に、影（drop-shadow）以外のフィルタがかかっていない
  for (const i of document.querySelectorAll('img[src*="assets/monsters/"]')) {
    for (let e = i; e && e !== document.body; e = e.parentElement) {
      const f = getComputedStyle(e).filter;
      if (f && f !== 'none' && f.replace(/drop-shadow\((?:[^()]|\([^()]*\))*\)/g, '').trim() !== '') { out.filter.push(`${i.getAttribute('src')} ← ${d(e)} filter:${f}`); break; }
    }
  }
  return out;
};
/** 画面を確かめて、問題があれば画面名つきで失敗にする */
async function check(pg, name, sels, { fixed = [], filter = true, wait = 0 } = {}) {
  if (wait) await pg.waitForTimeout(wait);   // 描画の直後だけ押下を受け付けない作りのボタンがある画面は、その時間が過ぎてから確かめる
  await imgsDone(pg);
  const r = await pg.evaluate(PROBE, { sels, fixed });
  const size = `${r.W}×${r.H} ${name}`;
  assert.ok(r.sw <= r.W + 1 && r.bsw <= r.W + 1, `${size}：横にはみ出している（scrollWidth ${r.sw}／body ${r.bsw}）`);
  assert.deepEqual(r.btn, [], `${size}：押せないボタン`);
  assert.deepEqual(r.fixed, [], `${size}：スクロールなしで見えるべきもの`);
  assert.deepEqual(r.broken, [], `${size}：読み込めていない画像`);
  if (filter) assert.deepEqual(r.filter, [], `${size}：正式モンスター画像に色のフィルタがかかっている`);
  return r;
}
/** 会話ウィンドウが画面に収まり、立ち絵の高さが min(44vh, 380px) 以内で、ウィンドウをタップできる */
async function checkTalk(pg, name) {
  await waitSel(pg, '.mmtalk .mmtalk-win');
  await pg.waitForTimeout(300);   // 開いた直後だけ入力を受け付けない作りでも、タップが届くかを確かめられるよう待つ
  await imgsDone(pg);
  const r = await pg.evaluate(() => {
    const ov = document.querySelector('.mmtalk'), w = ov.querySelector('.mmtalk-win').getBoundingClientRect(), f = ov.querySelector('.mmtalk-fig');
    const top = document.elementFromPoint(w.left + w.width / 2, w.top + w.height / 2);
    return { W: innerWidth, H: innerHeight, sw: document.documentElement.scrollWidth, win: [w.left, w.top, w.right, w.bottom].map(Math.round), figH: f.hidden ? 0 : f.getBoundingClientRect().height, hit: !!top && ov.contains(top), n: document.querySelectorAll('.mmtalk').length };
  });
  const size = `${r.W}×${r.H} ${name}`;
  assert.equal(r.n, 1, size + '：会話ウィンドウは1つ');
  assert.ok(r.sw <= r.W + 1, `${size}：横にはみ出している（${r.sw}）`);
  assert.ok(r.win[0] >= -1 && r.win[1] >= -1 && r.win[2] <= r.W + 1 && r.win[3] <= r.H + 1, `${size}：会話ウィンドウが画面に収まっていない ${r.win}`);
  assert.ok(r.figH > 0 && r.figH <= Math.min(0.44 * r.H, 380) + 1, `${size}：立ち絵の高さ ${r.figH}`);
  assert.ok(r.hit, size + '：会話ウィンドウの中央をタップすると会話に届く');
}
/** 市場の切り替えの演出が終わるまで待つ */
const settled = (pg) => pg.waitForFunction(() => typeof P10_ANIM !== 'undefined' && !P10_ANIM && !!document.querySelector('#p10car .p10sl.on') && !!document.querySelector('#p10info .p10buy'), null, { timeout: 15000 });
/** 市場で中央の個体を買う（確認シートが出た直後の押下を無視する作りでも押せるよう、少し待ってから「連れて帰る」を押す） */
async function buyCenter(pg) {
  await H.marketDetail(pg); await pg.click('#p10info .p10buy');
  await waitSel(pg, '#p10ov .p10ok');
  await pg.waitForTimeout(550);
  await pg.click('#p10ov .p10ok');
  await pg.waitForFunction(() => !document.getElementById('p10ov') && !document.getElementById('p10car'));
}
/** 2度押しの確認（2回目は1回目から十分に間をあける） */
async function press2(pg, sel) {
  await pg.click(sel);
  await pg.waitForTimeout(700);
  await pg.click(sel);
}

// 主な画面のボタン
const SEL = {
  title: ['.p15start'],
  name: ['#p11nm', '.p11go'],
  town: ['.hz:not(.dis)', '.hz[onclick="museum()"]', '.svb'],
  market: ['.p10back', '.p10arw.prev', '.p10arw.next', '.p10dot', '#p10car .p10sl.on .p10plate'],   // 購入ボタンは詳細シート（中央のモンスターをタップ）の中
  detail: ['#p10info .p10buy', '.p10detx'],
  sheet: ['#p10ov #mnm', '#p10ov .p10no', '#p10ov .p10ok'],
  ranch: ['button.back', '.ftile', '.fsell', '.wpanel button'],
  museum: ['.dtop .dback', '.mgc'],
  save: ['button.back', '.card.slot button', 'button.ghost'],
  hall: ['button.back', '.fmb', '[onclick="prepScr()"]'],   // ファーム（育成開始前）：街へ戻る・4コマンド・進行ボタン「育成を始める」
  prep: ['.dback', '[onclick*="p7Depart"]'],
  board: ['.p9mbtn', '#brollbtn'],
  goal: ['.p9mbtn', '.p9rank', '.p9btn2'],
  farmInterval: ['.fmb', '.fmgo', '.fmrd', '.fmab'],   // Chapter間ファーム：4コマンド・進行ボタン・中断・育成放棄
  trainMenu: ['.dback', '.p12tc:not([disabled])'],
  trainBoard: ['#p7roll'],
};

// =========================================================
// 390×844 の通し（前のテストの続きから進む）
// =========================================================
describe('QA-TS：390×844 の通し（JS エラー・読み込み・壊れた画像・はみ出し・押せる位置）', { skip: SKIP }, () => {
  let p = null, pg = null;
  const res = [], failed = [], reqs = new Set();
  before(async () => {
    p = await L.open({ size: H.SIZES.base });
    pg = p.page;
    // ローカルへの応答と、読み込みの失敗（理由つき）を集める
    pg.on('response', (r) => { if (r.url().startsWith(L.url)) res.push([r.status(), r.url().slice(L.url.length)]); });
    pg.on('requestfailed', (r) => { if (r.url().startsWith(L.url)) failed.push([r.url().slice(L.url.length), r.failure() && r.failure().errorText]); });
    pg.on('request', (r) => { if (r.url().startsWith(L.url)) reqs.add(r.url().slice(L.url.length)); });
  });
  after(async () => { if (p) await p.ctx.close().catch(() => {}); });
  const T = (name, fn) => test(name, { timeout: 60000 }, fn);

  T('QA-TS1：開始画面と名前登録：はみ出さず、「タップしてはじめる」・名前欄・決定ボタンが押せる', async () => {
    // 最初の読み込みの応答は before の後に集め始めるため、ここで読み込み直して最初から集める
    await pg.reload();
    await pg.waitForFunction(() => typeof window.MMP8 === 'object');
    await waitSel(pg, '.p15start');
    await check(pg, '開始画面', SEL.title);
    await pg.click('.p15start');
    await waitSel(pg, '#p11nm');
    await check(pg, '名前登録', SEL.name);
  });

  T('QA-TS2：フィナのあいさつ（会話ウィンドウが画面に収まる）→ 最初の街', async () => {
    await pg.fill('#p11nm', 'ツウシ');
    await pg.click('.p11go');
    await checkTalk(pg, 'フィナのあいさつ');
    await H.finishTalk(pg);
    await waitSel(pg, '.hz[onclick="market()"]');
    await check(pg, '街（0体）', SEL.town, { filter: false });
  });

  T('QA-TS3：市場（ソラモ・ガウル・入荷待ちのノビトン）→ 購入確認シート → 購入 → 街', async () => {
    await pg.click('.hz[onclick="market()"]');
    await settled(pg);
    await check(pg, '市場（ソラモ）', SEL.market);
    for (const k of ['gauru', 'nobiton', 'solamo']) {
      await pg.click('.p10arw.next');
      await pg.waitForFunction((k) => !P10_ANIM && MMP10M.MARKET_CATALOG[P10_MK].key === k, k);
      await settled(pg);
      await check(pg, '市場（' + k + '）', SEL.market);
    }
    await H.marketDetail(pg); await check(pg, '市場の詳細', SEL.detail);
    await pg.click('#p10info .p10buy');
    await waitSel(pg, '#p10ov .p10ok');
    await check(pg, '購入確認シート', SEL.sheet, { fixed: ['#p10ov .p10ok', '#p10ov .p10no'], wait: 400 });
    await pg.waitForTimeout(150);   // 確認シートが出てから 0.5 秒以上たってから押す
    await pg.click('#p10ov .p10ok');
    await waitSel(pg, '.hz[onclick="hall()"]:not(.dis)');
    await check(pg, '街（1体）', SEL.town, { filter: false });
    const s = await H.getS(pg);
    assert.equal(s.m && s.m.sp, 0, 'ソラモを連れて帰った');
  });

  T('QA-TS4：2体目（ガウル）→ 牧場の4つのタブ（預ける・受け取る・合体・売る）', async () => {
    await pg.evaluate(() => { S.g = 5000; save(); market(null, 'gauru'); });
    await settled(pg);
    await buyCenter(pg);
    await pg.click('.hz[onclick="farm()"]');
    await waitSel(pg, '.fsell');
    await check(pg, '牧場（預ける）', SEL.ranch);
    await pg.click('.ftile[onclick*="\'b\'"]');
    await waitSel(pg, '.ftile.on[onclick*="\'b\'"]');
    await check(pg, '牧場（受け取る）', SEL.ranch);
    await pg.click('.ftile[onclick*="\'c\'"]');
    await waitSel(pg, '.ftile.on[onclick*="\'c\'"]');
    await check(pg, '牧場（合体）', SEL.ranch);
    await pg.click('.fsell');
    await waitSel(pg, '.fsell.on');
    await check(pg, '牧場（売る）', SEL.ranch);
    await pg.click('button.back');
    await waitSel(pg, '.svb');
  });

  T('QA-TS5：博物館（一覧・詳細）とセーブ（セーブコードの欄も開く）', async () => {
    await pg.click('.hz[onclick="museum()"]', { force: true });   // 博物館のピンは揺れる演出があるため、位置の安定を待たずに押す
    await waitSel(pg, '.mgc');
    await check(pg, '博物館', SEL.museum);
    await pg.click('.mgc');
    await waitSel(pg, '.mk2 .dback.wide');
    await check(pg, '博物館の詳細', ['.mk2 .dback']);
    await pg.click('.mk2 .dback.wide');
    await waitSel(pg, '.mgc');
    await pg.click('.dtop .dback');
    await waitSel(pg, '.svb');
    await pg.click('.svb');
    await waitSel(pg, 'button.ghost');
    await check(pg, 'セーブ', SEL.save, { wait: 400 });
    await pg.click('details summary');
    await pg.waitForFunction(() => document.querySelector('details').open);
    await check(pg, 'セーブ（コードの欄）', [...SEL.save, 'details button', '#sc']);
    await pg.click('button.back');
    await waitSel(pg, '.svb');
  });

  T('QA-TS6：ファーム（未育成）→ 出発準備 → フィナの確認（選択肢）→「始める」→ フィナ→ダン → Chapter 1（サイコロのボタンはスクロールなしで見える）', async () => {
    await pg.click('.hz[onclick="hall()"]');
    await waitSel(pg, '[onclick="prepScr()"]');
    await check(pg, 'ファーム（未育成）', SEL.hall);
    await pg.click('[onclick="prepScr()"]');
    await waitSel(pg, '[onclick*="p7Depart"]');
    await check(pg, '出発準備', SEL.prep);
    await pg.click('[onclick*="p7Depart"]');
    await checkTalk(pg, 'フィナの育成開始の会話');
    for (let i = 0; i < 20 && !(await pg.evaluate(() => !!(MMNPC.state() && MMNPC.state().choices))); i++) { await pg.click('.mmtalk', { force: true }); await pg.waitForTimeout(80); }
    await checkTalk(pg, '育成開始の選択肢（始める／まだやめておく）');
    const cb = await pg.evaluate(() => [...document.querySelectorAll('.mmtalk-choice')].map((b) => { const r = b.getBoundingClientRect(); return [b.textContent, r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth, Math.round(r.height)]; }));
    assert.deepEqual(cb.map((x) => x[0]), ['始める', 'まだやめておく']);
    for (const [t, inView, h] of cb) { assert.ok(inView, `選択肢「${t}」が画面に収まっている`); assert.ok(h >= 44, `選択肢「${t}」は押しやすい高さ（${h}px）`); }
    assert.equal(await H.chooseTalk(pg, 'start'), true);
    await checkTalk(pg, 'フィナ→ダンの掛け合い');
    await H.finishTalk(pg);
    await waitSel(pg, '#brollbtn');
    await check(pg, 'Chapter 1 ボード', SEL.board, { fixed: ['#brollbtn'] });
    assert.equal(await pg.evaluate(() => document.querySelectorAll('img[src*="npc/fina"]').length), 0, 'ボードにフィナはいない');
    assert.deepEqual(await pg.evaluate(() => [S.m.raise.ch, MMP8.boardPhase(S.m), S.m.raise.turnsUsed]), [1, 'roll', 0], 'Chapter 1 に出発した（サイコロの演出は qa-e2e-tech.test.mjs で確かめる）');
  });

  T('QA-TS7：ゴール → 大会（2度押し）→ 順位表 → VS（2度押し）→ 試合 → 試合中の再読み込みで試合はやり直し（順位表に戻る）', async () => {
    // ゴールまでの移動は、ゲームの状態を直接ゴールにして描き直す（マスの効果・分岐は qa の別ファイルで確かめる）
    await pg.evaluate(() => { const m = S.m, trk = MMP8.trackOf(m.raise.ch); Object.assign(m.raise, { node: trk.goal, goal: true, pend: null }); save(); board(); });
    await waitSel(pg, '.p9rank');
    await check(pg, 'ゴール（大会の選択）', SEL.goal, { fixed: ['.p9rank', '.p9btn2'] });
    await press2(pg, '.p9rank');
    await waitSel(pg, '[onclick="p9VsScr()"]');
    await check(pg, '大会の順位表', ['.p9mbtn', '[onclick="p9VsScr()"]']);
    await pg.click('[onclick="p9VsScr()"]');
    await waitSel(pg, '.p9go');
    await check(pg, 'VS', ['.p9go', '.p9vs .p9btn2']);
    await press2(pg, '.p9go');
    await pg.waitForFunction(() => !!document.getElementById('bt'), null, { timeout: 15000 });
    await pg.waitForTimeout(800);
    const before = await pg.evaluate(() => ({ round: S.m.raise.tour.league.round, battle: !!S.m.raise.battle }));
    assert.equal(before.battle, true, '試合中');
    await pg.reload();
    await pg.waitForFunction(() => typeof window.MMP8 === 'object');
    await pg.click('.p15start');
    await waitSel(pg, '[onclick="p9VsScr()"]');
    const after = await pg.evaluate(() => ({ round: S.m.raise.tour.league.round, battle: S.m.raise.battle, ph: MMP8.boardPhase(S.m), bt: !!document.getElementById('bt') }));
    assert.deepEqual(after, { round: before.round, battle: null, ph: 'tour', bt: false }, '試合は結果なしでやり直しになり、順位表に戻る');
    await check(pg, '大会の順位表（再読み込み後）', ['.p9mbtn', '[onclick="p9VsScr()"]']);
  });

  T('QA-TS8：Chapter間ファーム → 修行メニュー → 修行ボード', async () => {
    // 大会を最後まで戦う代わりに、大会の記録を外してゴールで辞退した状態にする（この画面の通しが目的）
    await pg.evaluate(() => { const m = S.m; m.raise.tour = null; m.raise.battle = null; MMP8.declineTournament(S, m); S.trainTix = 3; save(); hall('t'); });
    await waitSel(pg, '.fmgo.p9c-go');
    await check(pg, 'Chapter間ファーム', SEL.farmInterval);
    await pg.click(`.p15b[onclick="hall('s')"]`);
    await waitSel(pg, `[onclick="trStart('po')"]`);
    await check(pg, '修行メニュー', SEL.trainMenu, { wait: 400 });
    await pg.waitForTimeout(150);   // 画面が出てから 0.5 秒以上たってから押す
    await pg.click(`[onclick="trStart('po')"]`);
    await waitSel(pg, '#p7roll');
    await check(pg, '修行ボード', SEL.trainBoard);
    assert.equal(await pg.evaluate(() => MMP7.trainRunOf(S.m).kind), 'po', 'ちからの修行が始まった（修行のサイコロは qa-e2e-tech.test.mjs で確かめる）');
  });

  T('QA-TS9：Chapter 2 のボード（地図）→ 育成完了（フィナの会話）→ 街', async () => {
    // 修行はゲームの関数で最後まで進め、Chapter間ファームの「ボード」→ 出発準備 → 出発
    await pg.evaluate(() => { for (let i = 0; i < 20 && MMP7.trainRunOf(S.m); i++) { const r = MMP7.advanceTraining(S, S.m, 3); if (r.goal) MMP7.finishTraining(S, S.m); } save(); hall('t'); });
    await waitSel(pg, '.fmgo.p9c-go');
    await pg.click('.fmgo.p9c-go');
    await waitSel(pg, '[onclick*="p7Depart"]');
    await pg.click('[onclick*="p7Depart"]');
    await waitSel(pg, '#brollbtn');
    assert.equal(await pg.evaluate(() => S.m.raise.ch), 2, 'Chapter 2 へ出発した');
    await check(pg, 'Chapter 2 ボード', SEL.board);
    // 最終ルートは未登録のため、Chapter間ファームの「育成を完了して街へ戻る」（2度押し）で完了する
    await pg.evaluate(() => { const m = S.m; Object.assign(m.raise, { state: 'farm', ch: MMP8.FINAL, node: null, pend: null, goal: false, tour: null, battle: null }); save(); p8Resume(); });
    await waitSel(pg, '[onclick*="pfixFinishNoFinal"]');
    await check(pg, 'Chapter間ファーム（最終）', [...SEL.farmInterval, '[onclick*="pfixFinishNoFinal"]']);
    await press2(pg, '[onclick*="pfixFinishNoFinal"]');
    await checkTalk(pg, 'フィナの育成完了の会話');
    await H.finishTalk(pg);
    await waitSel(pg, '.p9dn');
    const btns = await pg.evaluate(() => [...document.querySelectorAll('#app button')].map((b) => b.getAttribute('onclick') || ''));
    assert.ok(btns.length >= 1, '育成完了画面にボタンがある');
    await check(pg, '育成完了', ['#app button']);
    assert.equal((await H.getS(pg)).raiseRec.done, 1, '育成完了回数が1回');
    await pg.evaluate(() => lobby());
    await waitSel(pg, '.svb');
    await check(pg, '街（育成完了後）', SEL.town, { filter: false });
  });

  T('QA-TS10：通しの間、JS エラーなし・読み込みの失敗なし・ローカルの応答はすべて 200・要求したファイルは大文字小文字まで一致して実在', async () => {
    assert.deepEqual(p.errors, [], 'pageerror / console.error');
    assert.deepEqual(realBad(p.bad), [], '404・読み込み失敗');
    assert.deepEqual(failed.filter(([u, why]) => !(why === 'net::ERR_ABORTED' && FRAME.test(u) && existsExact(u))), [], '読み込みの失敗（理由つき）');
    assert.ok(res.length >= 30, '応答が集まっている：' + res.length);
    assert.deepEqual(res.filter(([s]) => s !== 200), [], '200 以外の応答');
    const files = [...reqs].map((u) => decodeURIComponent(u.split(/[?#]/)[0])).filter(Boolean);
    assert.ok(files.includes('index.html') && files.some((f) => f.startsWith('assets/npc/fina/')) && files.some((f) => f.startsWith('assets/dice/')) && files.some((f) => f.startsWith('assets/scenes/')), '主な素材を読み込んでいる');
    assert.deepEqual(files.filter((f) => !existsExact(f)), [], '要求したファイルが実在しない（大文字小文字も一致させる）');
  });
});

// =========================================================
// ほかの画面サイズ（375×667・360×800・430×932）
// =========================================================
for (const [key, label] of [['se', 'iPhone SE 相当'], ['android', 'Android 相当'], ['max', '大きい iPhone 相当']]) {
  const [w, h] = H.SIZES[key];
  B(`QA-TR-${key}：${w}×${h}（${label}）で主な画面（開始・名前登録・フィナの会話・街・市場・購入確認・牧場・セーブ・Chapter 1 ボード・ゴール・Chapter間ファーム・修行ボード）がはみ出さず、主なボタンが押せる`, async () => {
    const p = await openPage({ size: [w, h] });
    const pg = p.page;
    await waitSel(pg, '.p15start');
    await check(pg, '開始画面', SEL.title);
    await pg.click('.p15start');
    await waitSel(pg, '#p11nm');
    await check(pg, '名前登録', SEL.name);
    await pg.fill('#p11nm', 'サイズ');
    await pg.click('.p11go');
    await checkTalk(pg, 'フィナのあいさつ');
    await H.finishTalk(pg);
    await waitSel(pg, '.hz[onclick="market()"]');
    await check(pg, '街', SEL.town, { filter: false });
    await pg.click('.hz[onclick="market()"]');
    await settled(pg);
    await check(pg, '市場', SEL.market);
    await H.marketDetail(pg); await check(pg, '市場の詳細', SEL.detail);
    await pg.click('#p10info .p10buy');
    await waitSel(pg, '#p10ov .p10ok');
    await check(pg, '購入確認シート', SEL.sheet, { fixed: ['#p10ov .p10ok', '#p10ov .p10no'], wait: 400 });
    await pg.waitForTimeout(150);   // 確認シートが出てから 0.5 秒以上たってから押す
    await pg.click('#p10ov .p10ok');
    await waitSel(pg, '.hz[onclick="farm()"]');
    await pg.click('.hz[onclick="farm()"]');
    await waitSel(pg, '.fsell');
    await check(pg, '牧場', SEL.ranch);
    await pg.click('button.back');
    await waitSel(pg, '.svb');
    await pg.click('.svb');
    await waitSel(pg, 'button.ghost');
    await check(pg, 'セーブ', SEL.save, { wait: 400 });
    // 育成の画面は、進行の関数で状態を作って開く（出発・ゴール・辞退の流れは通しのテストで確かめる）
    await pg.evaluate(() => { MMP8.depart(S, S.m); save(); board(); });
    await waitSel(pg, '#brollbtn');
    await check(pg, 'Chapter 1 ボード', SEL.board, { fixed: ['#brollbtn'] });
    await pg.evaluate(() => { const m = S.m, trk = MMP8.trackOf(1); Object.assign(m.raise, { node: trk.goal, goal: true, pend: null }); save(); board(); });
    await waitSel(pg, '.p9rank');
    await check(pg, 'ゴール（大会の選択）', SEL.goal, { fixed: ['.p9rank', '.p9btn2'] });
    await pg.evaluate(() => { MMP8.declineTournament(S, S.m); S.trainTix = 3; save(); hall('t'); });
    await waitSel(pg, '.fmgo.p9c-go');
    await check(pg, 'Chapter間ファーム', SEL.farmInterval);
    await pg.click(`.p15b[onclick="hall('s')"]`);
    await waitSel(pg, `[onclick="trStart('po')"]`);
    await pg.waitForTimeout(550);
    await pg.click(`[onclick="trStart('po')"]`);
    await waitSel(pg, '#p7roll');
    await check(pg, '修行ボード', SEL.trainBoard);
    assert.deepEqual(p.errors, [], 'pageerror / console.error');
    assert.deepEqual(realBad(p.bad), [], '404・読み込み失敗');
  });
}

B('QA-TR-title：開始画面の透明な開始ボタンは、どの画面サイズでも画像に描かれた「タップしてはじめる」に重なり、タップが届く（はみ出し・縦スクロールなし）', async () => {
  const p = await openPage({ size: H.SIZES.base });
  const pg = p.page;
  const sizes = [...Object.values(H.SIZES), [320, 568], [414, 896], [768, 1024], [844, 390]];
  for (const [w, h] of sizes) {
    await pg.setViewportSize({ width: w, height: h });
    await pg.waitForFunction(([w, h]) => innerWidth === w && innerHeight === h, [w, h]);
    await waitSel(pg, '.mmtimg');
    await imgsDone(pg);
    const r = await pg.evaluate(() => {
      const im = document.querySelector('.mmtimg'), b = document.querySelector('.p15start'), ir = im.getBoundingClientRect(), br = b.getBoundingClientRect();
      // object-fit: contain で実際に絵が描かれている範囲
      const k = Math.min(ir.width / im.naturalWidth, ir.height / im.naturalHeight), cw = im.naturalWidth * k, ch = im.naturalHeight * k, cl = ir.left + (ir.width - cw) / 2, ct = ir.top + (ir.height - ch) / 2;
      const hit = document.elementFromPoint(br.left + br.width / 2, br.top + br.height / 2);
      return { nat: [im.naturalWidth, im.naturalHeight], pos: [(br.left - cl) / cw * 100, (br.top - ct) / ch * 100, br.width / cw * 100, br.height / ch * 100], hit: !!hit && hit.classList.contains('p15start'),
        sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight, W: innerWidth, H: innerHeight, inView: br.left >= 0 && br.top >= 0 && br.right <= innerWidth && br.bottom <= innerHeight };
    });
    const tag = `${w}×${h}`;
    assert.deepEqual(r.nat, [1152, 2048], tag + '：正式の開始画面画像');
    [19.965, 84.473, 60.33, 8.301].forEach((v, i) => assert.ok(Math.abs(r.pos[i] - v) <= 0.3, `${tag}：開始ボタンの位置（絵に対する%）${r.pos.map((x) => x.toFixed(2))}`));
    assert.ok(r.hit, tag + '：ボタンの中央をタップすると開始ボタンに届く');
    assert.ok(r.inView, tag + '：ボタン全体が画面の中');
    assert.ok(r.sw <= r.W + 1 && r.sh <= r.H + 1, `${tag}：はみ出し・スクロールなし（${r.sw}×${r.sh}）`);
  }
  assert.deepEqual(p.errors, []); assert.deepEqual(realBad(p.bad), []);
});
