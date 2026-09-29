// =========================================================
// QA（実ブラウザ）：新規ゲーム〜市場の表示・切り替え
//  ・開始画面 → 名前登録（ボタン・Enter）→ フィナの初回あいさつ（1度だけ）→ 最初の街
//  ・市場：ソラモ・ガウル・ノビトン（入荷待ち）だけ。ジオルは出さない
//  ・左右の矢印（最後→最初・最初→最後の循環）・キー操作・ドット・左右の個体のタップ・横スワイプ
//  ・切り替え中（約0.3秒）は操作と購入を受け付けない。中央の個体＝購入対象
//  購入・救済・所持金不足・所持上限・購入確認中の切り替え・画面サイズは qa-e2e-newgame-market-buy.test.mjs で確認する。
//  Playwright / Chromium が無い環境では省略（skip）する。
// =========================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import * as H from './e2e/harness.mjs';

const SKIP = H.skipReason();
let L = null;
test.before(async () => { if (!SKIP) L = await H.launch(); });
test.after(async () => { if (L) await L.close(); });
// テストごとに開いたページを閉じる（開いたままだとアニメーションが重なり、後のテストの読み込みが遅くなる）
const OPEN = [];
const openPage = async (o) => { const p = await L.open(o); OPEN.push(p); return p; };
test.afterEach(async () => { for (const p of OPEN.splice(0)) await p.ctx.close().catch(() => {}); });
/** T(名前, 関数) または T(名前, { todo など }, 関数) */
const T = (name, a, b) => (typeof a === 'function' ? test(name, { skip: SKIP }, a) : test(name, { skip: SKIP, ...a }, b));

const KEYS = ['solamo', 'gauru', 'nobiton'];
const NAME = { solamo: 'ソラモ', gauru: 'ガウル', nobiton: 'ノビトン' };

/** ページの読み込みで出たエラー・読み込めなかったファイルが無いこと */
function noErrors(p) {
  assert.deepEqual(p.errors, [], 'pageerror / console.error が出ていない');
  assert.deepEqual(p.bad, [], 'ローカルのファイルがすべて読み込めている');
}
/** 開始画面の「タップしてはじめる」を押して、次の画面（selector）が出るまで待つ */
async function startFromTitle(pg, selector) {
  await pg.waitForSelector('.p15start');
  await pg.click('.p15start');
  await pg.waitForSelector(selector, { timeout: 20000 });
}
/** 会話を最後まで送り、各行の全文表示の状態を集める（開いた直後の入力を無視する作りでも進むよう、少し待ちながらタップする） */
async function talkLines(pg) {
  const lines = [];
  for (let i = 0; i < 150; i++) {
    const s = await pg.evaluate(() => {
      const st = window.MMNPC && MMNPC.state(), img = document.querySelector('.mmtalk img'), nx = document.querySelector('.mmtalk-next');
      return st && { idx: st.idx, total: st.total, name: st.name, expr: st.expr, typing: st.typing, text: st.text, full: st.full, img: img && img.getAttribute('src'), next: nx ? !nx.hidden : null };
    });
    if (!s) return lines;
    if (!s.typing) lines[s.idx] = s;
    await pg.click('.mmtalk', { force: true });
    await pg.waitForTimeout(40);
  }
  throw new Error('会話が終わらない');
}
/** 会話ウィンドウが追加された瞬間（文字送りのタイマーより前）の状態を記録する仕掛け */
const watchTalkOpen = (pg) => pg.evaluate(() => {
  window.__talkOpen = null;
  const mo = new MutationObserver(() => {
    const ov = document.querySelector('.mmtalk');
    if (!ov || window.__talkOpen) return;
    const s = MMNPC.state(), nx = ov.querySelector('.mmtalk-next');
    window.__talkOpen = { idx: s.idx, total: s.total, name: s.name, expr: s.expr, typing: s.typing, text: s.text, nextShown: !nx.hidden, img: ov.querySelector('img').getAttribute('src') };
    mo.disconnect();
  });
  mo.observe(document.body, { childList: true, subtree: true });
});

/**
 * 名前登録・フィナのあいさつを済ませた状態を直接作り、市場を開く（開始画面〜名前登録の流れは NG 系のテストで確認する）。
 *  m：手持ち（{sp, state, name}｜null）、box：牧場の個体の配列、g：所持金
 */
async function openMarket({ g = 300, m = null, box = [], raiseRec = null, focus = null, size, touch = false, name = 'いちば' } = {}) {
  const p = await openPage({ size: size || H.SIZES.base, touch });
  await p.page.evaluate((o) => {
    MMP11P.confirmName(S, o.name); S.npcFlags = { finaIntro: 1 };
    const make = (d) => { const x = mk(d.sp || 0); if (d.name) x.name = d.name; x.raise.state = d.state || 'none'; return x; };
    S.m = o.m ? make(o.m) : null; S.box = o.box.map(make); S.g = o.g;
    if (o.raiseRec) S.raiseRec = o.raiseRec;
    save(); lobby();
    market(null, o.focus || undefined);
  }, { g, m, box, raiseRec, focus, name });
  await settle(p.page);
  return p;
}
/** 切り替えの演出が終わるまで待つ */
const settle = (pg) => pg.waitForFunction(() => typeof P10_ANIM !== 'undefined' && !P10_ANIM && !!document.querySelector('#p10car .p10sl.on'), null, { timeout: 15000 });
/** 市場の表示の状態：中央の個体・情報欄・購入ボタン・ドット */
const car = (pg) => pg.evaluate(() => {
  const on = document.querySelectorAll('#p10car .p10sl.on'), bb = document.querySelector('#p10info .p10buy'), nm = document.querySelector('#p10info .p10nm b');
  return {
    mk: P10_MK, key: MMP10M.MARKET_CATALOG[P10_MK].key, anim: P10_ANIM, on: on[0] ? on[0].dataset.key : null, onCount: on.length,
    infoName: nm ? nm.textContent : null, buyKey: bb ? (bb.dataset.key || null) : null, buyDis: bb ? bb.disabled : null, buyTxt: bb ? bb.textContent.trim() : null,
    dot: [...document.querySelectorAll('.p10dot')].findIndex((d) => d.classList.contains('on')), dotsOn: document.querySelectorAll('.p10dot.on').length,
    info: (document.querySelector('#p10info') || {}).innerText || '', ov: !!document.getElementById('p10ov'),
  };
});
/** 中央・情報欄・購入ボタン・ドットがすべて同じ候補を指していること */
function assertCentered(c, key, msg = '') {
  const i = KEYS.indexOf(key);
  assert.equal(c.anim, false, msg + '演出は終わっている');
  assert.equal(c.mk, i, msg + 'P10_MK');
  assert.equal(c.key, key, msg + '選択中の候補');
  assert.equal(c.on, key, msg + '中央（.on）の個体');
  assert.equal(c.onCount, 1, msg + '中央は1体だけ');
  assert.equal(c.infoName, NAME[key], msg + '情報欄の名前');
  assert.equal(c.dot, i, msg + 'ドット'); assert.equal(c.dotsOn, 1, msg + '点灯するドットは1つ');
  if (key === 'nobiton') { assert.equal(c.buyKey, null, msg + '入荷待ちの購入ボタンは種族を持たない'); assert.equal(c.buyDis, true, msg + '入荷待ちは押せない'); }
  else assert.equal(c.buyKey, key, msg + '購入ボタンの種族＝中央の個体');
}
/** 市場の個体の、ほかの要素に隠れていない（その個体自身が一番上にある）点を探す */
const slidePoint = (pg, key) => pg.evaluate((key) => {
  const el = document.querySelector(`#p10car .p10sl[data-key="${key}"]`), r = el.querySelector('.p10im').getBoundingClientRect(), pts = [];
  for (let i = 1; i < 20; i++) for (let j = 1; j < 20; j++) pts.push([i / 20, j / 20]);
  pts.sort((a, b) => Math.hypot(a[0] - 0.5, a[1] - 0.5) - Math.hypot(b[0] - 0.5, b[1] - 0.5));   // 画像の中心に近い点から
  for (const [fx, fy] of pts) {
    const x = r.left + r.width * fx, y = r.top + r.height * fy;
    if (x < 0 || x >= innerWidth || y < 0 || y >= innerHeight) continue;
    const hit = document.elementFromPoint(x, y);
    if (hit && hit.closest('.p10sl') === el && !hit.closest('.p10arw')) return { x, y };
  }
  return null;
}, key);

// ---------------------------------------------------------
// 新規ゲーム：開始画面・名前登録・フィナの初回あいさつ・最初の街
// ---------------------------------------------------------
T('QA-NG1：開始画面：初回は正式画像（無加工）・「はじめてのプレイです」・開始ボタンが画面内に出る。所持金300G・名前未登録から始まる', async () => {
  const p = await openPage({ size: H.SIZES.base }); const pg = p.page;
  await pg.waitForFunction(() => { const i = document.querySelector('.mmtscr .mmtimg'); return i && i.complete; });
  const t = await pg.evaluate(() => {
    const i = document.querySelector('.mmtimg'), b = document.querySelector('.p15start').getBoundingClientRect();
    return { src: i.getAttribute('src'), nw: i.naturalWidth, filter: getComputedStyle(i).filter, tcap: document.querySelector('.tcap').textContent.trim(), btn: document.querySelector('.p15start').textContent.trim(),
      btnIn: b.left >= 0 && b.top >= 0 && b.right <= innerWidth && b.bottom <= innerHeight && b.width > 0 && b.height > 0, sw: document.documentElement.scrollWidth, iw: innerWidth,
      pending: S.playerNamePending, g: S.g, m: S.m, box: S.box.length, v: S.v };
  });
  assert.equal(t.src, 'assets/title/title_main.jpg', '開始画面は正式画像');
  assert.ok(t.nw > 0, '開始画面の画像が読み込めている');
  assert.equal(t.filter, 'none', '正式画像の色を CSS の filter で変えない');
  assert.equal(t.tcap, 'はじめてのプレイです');
  assert.equal(t.btn, 'タップしてはじめる');
  assert.ok(t.btnIn, '開始ボタンが 390×844 の画面内にある');
  assert.equal(t.sw, t.iw, '横スクロールが出ない');
  assert.equal(t.pending, true, '新規ゲームは名前の登録待ち');
  assert.deepEqual([t.g, t.m, t.box, t.v], [300, null, 0, 6], '初期所持金300G・モンスターなし・セーブversion 6');
  noErrors(p);
});

T('QA-NG2：開始ボタン → 名前登録画面（初期値「アルト」・8文字まで）。この名前で決定すると保存され、フィナの初回あいさつ（3行・表情 smile→normal→guide）のあと最初の街（市場・牧場は押せて、ファームは押せない）', async () => {
  const p = await openPage({ size: H.SIZES.base }); const pg = p.page;
  await startFromTitle(pg, '#p11nm');
  const nm = await pg.evaluate(() => ({ v: document.querySelector('#p11nm').value, ml: document.querySelector('#p11nm').getAttribute('maxlength'), lb: document.querySelector('.p11lb').textContent, t: document.querySelector('.p11t').textContent, talk: !!document.querySelector('.mmtalk') }));
  assert.equal(nm.v, 'アルト', '名前の初期値');
  assert.equal(nm.lb, 'プレイヤー名（8文字まで）');
  assert.equal(nm.t, 'ブリーダー登録');
  assert.equal(nm.talk, false, '名前を決める前にフィナは出ない');
  assert.ok(Number(nm.ml) >= 8, '入力欄は8文字以上入る');
  await pg.fill('#p11nm', 'ゆうしゃ');
  await watchTalkOpen(pg);
  await pg.click('.p11go');
  await pg.waitForSelector('.mmtalk');
  const open = await pg.evaluate(() => window.__talkOpen);
  assert.deepEqual({ ...open }, { idx: 0, total: 3, name: 'フィナ', expr: 'smile', typing: true, text: '', nextShown: false, img: 'assets/npc/fina/closeup/smile.png' },
    '開いた直後：1行目を1文字ずつ表示中で、▼はまだ出ない');
  const st = await H.storedSave(pg);
  assert.equal(st.v, 6); assert.equal(st.playerName, 'ゆうしゃ'); assert.ok(!st.playerNamePending, '名前登録待ちは消える');
  assert.deepEqual(st.npcFlags, { finaIntro: 1 }, 'あいさつ済みを会話の前に保存する');
  assert.equal(st.g, 300); assert.deepEqual(st.raiseRec, { done: 0, fromStart: true }, '育成完了回数は0回から記録');
  assert.equal(st.m, null); assert.deepEqual(st.box, []);
  const lines = await talkLines(pg);
  assert.deepEqual(lines.map((l) => [l.idx, l.name, l.expr, l.text, l.img, l.next]), [
    [0, 'フィナ', 'smile', 'はじめまして。私はフィナです！', 'assets/npc/fina/closeup/smile.png', true],
    [1, 'フィナ', 'normal', 'これからあなたのモンスター育成をお手伝いしますね。', 'assets/npc/fina/closeup/normal.png', true],
    [2, 'フィナ', 'guide', 'まずは市場へ行って、一緒に育てるモンスターを迎えてみましょう！', 'assets/npc/fina/closeup/guide.png', true],
  ], '全文表示のあとに▼が出る');
  const after = await pg.evaluate(() => ({ n: document.querySelectorAll('.mmtalk').length, st: MMNPC.state() }));
  assert.deepEqual(after, { n: 0, st: null }, '最後のタップで会話が閉じる');
  // 最初の街：市場・牧場は押せて、ファームはモンスターがいないので押せない
  await pg.waitForSelector('.map');
  const t = await pg.evaluate(() => ({
    hz: [...document.querySelectorAll('.hz')].map((b) => [b.getAttribute('onclick'), b.disabled]),
    pn: document.querySelector('.p115pn').textContent, prof: document.querySelector('.bprof').innerText.replace(/\s+/g, ' '),
    msg: document.querySelector('#msg').textContent, top: document.querySelector('.topbar').innerText.replace(/\s+/g, ' '),
    sw: document.documentElement.scrollWidth, iw: innerWidth, fina: document.querySelectorAll('img[src*="npc/fina"]').length,
  }));
  assert.deepEqual(t.hz, [['market()', false], ['farm()', false], ['hall()', true]]);
  assert.ok(t.pn.includes('ゆうしゃ'), 'プレイヤー名を表示');
  assert.match(t.prof, /300G/); assert.match(t.prof, /育成完了 0回/);
  assert.match(t.top, /300G/);
  assert.equal(t.msg, 'ようこそ、ゆうしゃさん！ まずは市場でモンスターを選ぼう。');
  assert.equal(t.sw, t.iw, '横スクロールが出ない');
  assert.equal(t.fina, 0, '会話が終われば街にフィナは残らない');
  noErrors(p);
});

T('QA-NG3：名前は Enter キーでも決定できる（決定は1回だけ・会話は1行目から始まる）', async () => {
  const p = await openPage({ size: H.SIZES.base }); const pg = p.page;
  await startFromTitle(pg, '#p11nm');
  await pg.fill('#p11nm', 'エンター');
  await pg.press('#p11nm', 'Enter');
  await pg.waitForSelector('.mmtalk');
  const s = await pg.evaluate(() => { const s = MMNPC.state(); return { idx: s.idx, name: s.name, n: document.querySelectorAll('.mmtalk').length, reg: !!document.querySelector('#p11nm') }; });
  assert.deepEqual(s, { idx: 0, name: 'フィナ', n: 1, reg: false }, 'Enter で名前登録が終わり、会話が1つだけ1行目から始まる');
  const st = await H.storedSave(pg);
  assert.equal(st.playerName, 'エンター'); assert.ok(!st.playerNamePending); assert.deepEqual(st.npcFlags, { finaIntro: 1 });
  const lines = await talkLines(pg);
  assert.equal(lines.length, 3, 'あいさつは3行とも表示される');
  await pg.waitForSelector('.map');
  assert.equal(await pg.evaluate(() => document.querySelector('#msg').textContent), 'ようこそ、エンターさん！ まずは市場でモンスターを選ぼう。');
  noErrors(p);
});

T('QA-NG4：Enter キーで名前を決定しても、フィナの1行目の文字送りが飛ばされない', { todo: '既知の不具合：名前入力欄の Enter が、開いたばかりの会話の1回目のタップとしても処理され、1行目がいきなり全文表示になる（会話を開いた直後の入力を無視する修正で直る予定）' }, async () => {
  const p = await openPage({ size: H.SIZES.base }); const pg = p.page;
  await startFromTitle(pg, '#p11nm');
  // 同じキー入力の中で会話が開き、その入力が会話にも届くかを、時間に左右されないよう同期で確かめる
  const s = await pg.evaluate(() => {
    const e = document.querySelector('#p11nm'); e.value = 'エンター';
    e.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    const st = MMNPC.state(); return st && { idx: st.idx, typing: st.typing };
  });
  assert.deepEqual(s, { idx: 0, typing: true }, '1行目は1文字ずつ表示中のまま');
  noErrors(p);
});

T('QA-NG5：名前の整え方：空欄は「アルト」。HTML を含む長い名前は8文字に切り、画面では文字として表示する（街・市場）', async () => {
  const p1 = await openPage({ size: H.SIZES.base });
  await startFromTitle(p1.page, '#p11nm');
  await p1.page.fill('#p11nm', '   ');
  await p1.page.click('.p11go');
  await H.finishTalk(p1.page);
  assert.equal(await p1.page.evaluate(() => S.playerName), 'アルト', '空白だけなら「アルト」');
  assert.equal((await H.storedSave(p1.page)).playerName, 'アルト');
  assert.ok((await p1.page.evaluate(() => document.querySelector('.p115pn').textContent)).includes('アルト'));
  noErrors(p1);

  const p2 = await openPage({ size: H.SIZES.base }); const pg = p2.page;
  await startFromTitle(pg, '#p11nm');
  await pg.fill('#p11nm', '<b>x</b>1234567890');
  await pg.click('.p11go');
  await H.finishTalk(pg);
  await pg.waitForSelector('.map');
  assert.equal(await pg.evaluate(() => S.playerName), '<b>x</b>', '8文字までに切る');
  const t = await pg.evaluate(() => ({ pn: document.querySelector('.p115pn').textContent, pnB: document.querySelectorAll('.p115pn b').length,
    msg: document.querySelector('#msg').textContent, msgB: document.querySelectorAll('#msg b').length }));
  assert.ok(t.pn.includes('<b>x</b>'), 'プロフィールでは文字としてそのまま表示'); assert.equal(t.pnB, 0, 'HTML として解釈しない');
  assert.ok(t.msg.includes('ようこそ、<b>x</b>さん！'), '街の案内でも文字として表示'); assert.equal(t.msgB, 0);
  await pg.click('.hz[onclick="market()"]'); await settle(pg);
  const w = await pg.evaluate(() => ({ t: document.querySelector('.p10who b').textContent, n: document.querySelectorAll('.p10who b b').length }));
  assert.deepEqual(w, { t: '<b>x</b>', n: 0 }, '市場のプレイヤー欄でも文字として表示');
  noErrors(p2);
});

T('QA-NG6：フィナの初回あいさつは1度だけ：会話を終えてから再読込 → 開始しても名前登録もあいさつも出ず、街から続ける', async () => {
  const p = await openPage({ size: H.SIZES.base }); const pg = p.page;
  await H.newGame(pg, 'いちど');
  await pg.waitForSelector('.map');
  await pg.reload();
  await pg.waitForFunction(() => typeof S === 'object' && !!document.querySelector('.p15start'));
  assert.equal(await pg.evaluate(() => document.querySelector('.tcap').textContent.trim()), 'はじめてのプレイです', 'モンスターがまだいないので初回表示のまま');
  await startFromTitle(pg, '.map');
  await pg.waitForTimeout(300);
  const t = await pg.evaluate(() => ({ talk: document.querySelectorAll('.mmtalk').length, reg: !!document.querySelector('#p11nm'), name: S.playerName, flags: S.npcFlags, msg: document.querySelector('#msg').textContent }));
  assert.deepEqual(t, { talk: 0, reg: false, name: 'いちど', flags: { finaIntro: 1 }, msg: 'モンスターがいません。まずは市場で選ぼう。' });
  noErrors(p);
});

T('QA-NG7：あいさつの途中で再読込しても、名前は保存済みで、あいさつは二度と出ない', async () => {
  const p = await openPage({ size: H.SIZES.base }); const pg = p.page;
  await startFromTitle(pg, '#p11nm');
  await pg.fill('#p11nm', 'とちゅう');
  await pg.click('.p11go');
  await pg.waitForSelector('.mmtalk');
  await pg.reload();
  await pg.waitForFunction(() => typeof S === 'object' && !!document.querySelector('.p15start'));
  assert.equal(await pg.evaluate(() => document.querySelectorAll('.mmtalk').length), 0, '再読込で会話は消える');
  await startFromTitle(pg, '.map');
  await pg.waitForTimeout(300);
  const t = await pg.evaluate(() => ({ talk: document.querySelectorAll('.mmtalk').length, reg: !!document.querySelector('#p11nm'), name: S.playerName, pending: !!S.playerNamePending, flags: S.npcFlags }));
  assert.deepEqual(t, { talk: 0, reg: false, name: 'とちゅう', pending: false, flags: { finaIntro: 1 } });
  noErrors(p);
});

T('QA-NG8：開始ボタンを同時に2回押しても、開始処理は1回だけ（名前登録画面が1つ出る）', async () => {
  const p = await openPage({ size: H.SIZES.base }); const pg = p.page;
  await pg.waitForSelector('.p15start');
  const n = await pg.evaluate(() => { const b = document.querySelector('.p15start'); b.click(); b.click(); return document.querySelectorAll('.tflash').length; });
  assert.equal(n, 1, '開始の演出は1回だけ');
  await pg.waitForSelector('#p11nm', { timeout: 20000 });
  await pg.waitForTimeout(500);   // 2回目の開始処理が遅れて走らないこと（開始処理は押してから約0.9秒後なので、もう走っていれば見える）
  const t = await pg.evaluate(() => ({ inputs: document.querySelectorAll('#p11nm').length, v: document.querySelector('#p11nm').value, talk: document.querySelectorAll('.mmtalk').length, pending: S.playerNamePending }));
  assert.deepEqual(t, { inputs: 1, v: 'アルト', talk: 0, pending: true });
  await pg.fill('#p11nm', 'れんだ');
  await pg.click('.p11go');
  await H.finishTalk(pg);
  await pg.waitForSelector('.map');
  assert.equal((await H.storedSave(pg)).playerName, 'れんだ');
  noErrors(p);
});

// ---------------------------------------------------------
// 市場：並び・入荷待ち・ジオルを出さない
// ---------------------------------------------------------
T('QA-MK1：街の市場ボタンで市場を開く：ソラモ・ガウル・ノビトンの3体だけ（ジオルは出さない）。中央はソラモで、購入ボタン・ドット・プレイヤー欄がそろう', async () => {
  const p = await openPage({ size: H.SIZES.base }); const pg = p.page;
  await H.newGame(pg, 'いちば');
  await pg.click('.hz[onclick="market()"]');
  await settle(pg);
  await pg.waitForFunction(() => [...document.querySelectorAll('#p10car .p10im')].every((i) => i.complete));
  const t = await pg.evaluate(() => ({
    slides: [...document.querySelectorAll('#p10car .p10sl')].map((s) => [s.dataset.key, s.classList.contains('wait'), s.querySelector('.p10im').getAttribute('src'), s.querySelector('.p10im').naturalWidth > 0, s.querySelector('.p10plate').innerText.replace(/\s+/g, ' ')]),
    dots: [...document.querySelectorAll('.p10dot')].map((d) => d.getAttribute('aria-label')),
    html: document.getElementById('app').innerHTML, who: document.querySelector('.p10who').innerText.replace(/\s+/g, ' '),
    filters: [...document.querySelectorAll('#p10car .p10im')].map((i) => getComputedStyle(i).filter),
    back: document.querySelector('.p10back').getAttribute('onclick'), arrows: [...document.querySelectorAll('.p10arw')].map((a) => a.getAttribute('aria-label')),
    fina: document.querySelectorAll('img[src*="npc/fina"], .mmtalk').length,
  }));
  assert.equal(t.fina, 0, '市場にはフィナを出さない（登場は指定の3か所だけ）');
  assert.deepEqual(t.slides, [
    ['solamo', false, './assets/monsters/solamo.png', true, 'ソラモ 500G'],
    ['gauru', false, './assets/monsters/gauru.png', true, 'ガウル 500G'],
    ['nobiton', true, './assets/monsters/nobiton_silhouette.png', true, 'ノビトン 入荷待ち'],
  ], '販売中の2体は正式画像と500G、ノビトンは影絵で入荷待ち');
  assert.deepEqual(t.dots, ['ソラモ', 'ガウル', 'ノビトン']);
  assert.doesNotMatch(t.html, /ジオル|jiol/, 'ジオルは市場に出さない');
  assert.ok(t.filters.every((f) => f === 'none'), '正式画像の色を filter で変えない');
  assert.match(t.who, /いちば/); assert.match(t.who, /300 ?G/);
  assert.equal(t.back, 'lobby()'); assert.deepEqual(t.arrows, ['前のモンスター', '次のモンスター']);
  const c = await car(pg);
  assertCentered(c, 'solamo');
  assert.equal(c.buyDis, false); assert.equal(c.buyTxt.replace(/\s+/g, ''), '購入する500G');
  assert.equal(await pg.evaluate(() => MMP10M.MARKET_CATALOG.some((x) => x.key === 'jiol')), false);
  await pg.click('.p10back');
  await pg.waitForSelector('.map');
  noErrors(p);
});

T('QA-MK2：ノビトンは入荷待ち：入荷条件「育成完了 5回（いま N回）」を表示し、購入ボタンは押せない。条件を満たしても販売は始まらない', async () => {
  const p = await openMarket({ focus: 'nobiton' }); const pg = p.page;
  let c = await car(pg);
  assertCentered(c, 'nobiton');
  assert.equal(c.buyTxt, '入荷待ち');
  assert.match(c.info, /入荷待ち/); assert.match(c.info, /ただいま入荷を待っています。/);
  assert.match(c.info, /入荷条件：育成完了 5回（いま 0回）/);
  assert.doesNotMatch(c.info, /※この版より前/, '新規ゲームは最初から数えるので注記なし');
  await pg.evaluate(() => p10BuyAsk());
  assert.equal(await pg.evaluate(() => !!document.getElementById('p10ov')), false, '入荷待ちは購入確認を開かない');
  // 記録の無い旧セーブ（途中から数え始めた）
  await pg.evaluate(() => { S.raiseRec = { done: 2, fromStart: false }; market(null, 'nobiton'); });
  await settle(pg); c = await car(pg);
  assert.match(c.info, /入荷条件：育成完了 5回（いま 2回）/);
  assert.match(c.info, /※この版より前の育成完了は記録がないため、回数に含まれません/);
  assert.equal(c.buyDis, true);
  // 5回に達しても販売はしない（入荷条件達成の表示だけ）
  await pg.evaluate(() => { S.raiseRec = { done: 5, fromStart: true }; S.g = 5000; market(null, 'nobiton'); });
  await settle(pg); c = await car(pg);
  assert.match(c.info, /入荷条件達成/); assert.match(c.info, /いま 5回/);
  assert.equal(c.buyDis, true); assert.equal(c.buyKey, null);
  assert.deepEqual(await pg.evaluate(() => MMP10M.canPurchase(S, 'nobiton', 0)), { ok: false, reason: 'waiting' });
  noErrors(p);
});

// ---------------------------------------------------------
// 市場：切り替え（矢印・キー・ドット・タップ・スワイプ）
// ---------------------------------------------------------
T('QA-MK3：右の矢印：ソラモ→ガウル→ノビトン→ソラモ（最後→最初へ循環）。止まるたびに中央・情報欄・購入ボタン・ドットが一致する', async () => {
  const p = await openMarket(); const pg = p.page;
  assertCentered(await car(pg), 'solamo', '開いたとき：');
  for (const key of ['gauru', 'nobiton', 'solamo', 'gauru']) {
    await pg.click('.p10arw.next');
    await settle(pg);
    assertCentered(await car(pg), key, `次へ→${key}：`);
  }
  noErrors(p);
});

T('QA-MK4：左の矢印：ソラモ→ノビトン（最初→最後へ循環）→ガウル→ソラモ', async () => {
  const p = await openMarket(); const pg = p.page;
  for (const key of ['nobiton', 'gauru', 'solamo', 'nobiton']) {
    await pg.click('.p10arw.prev');
    await settle(pg);
    assertCentered(await car(pg), key, `前へ→${key}：`);
  }
  noErrors(p);
});

T('QA-MK5：キー操作（→・←）・ドット・左右の個体のタップでも切り替わる（遠い候補も1つずつ回して中央へ）', async () => {
  const p = await openMarket(); const pg = p.page;
  await pg.keyboard.press('ArrowRight'); await settle(pg); assertCentered(await car(pg), 'gauru', '→キー：');
  await pg.keyboard.press('ArrowRight'); await settle(pg); assertCentered(await car(pg), 'nobiton', '→キー（2回目）：');
  await pg.keyboard.press('ArrowRight'); await settle(pg); assertCentered(await car(pg), 'solamo', '→キー（最後→最初）：');
  await pg.keyboard.press('ArrowLeft'); await settle(pg); assertCentered(await car(pg), 'nobiton', '←キー（最初→最後）：');
  await pg.click('.p10dot[data-i="1"]'); await settle(pg); assertCentered(await car(pg), 'gauru', 'ドット2つ目：');
  await pg.click('.p10dot[data-i="0"]'); await settle(pg); assertCentered(await car(pg), 'solamo', 'ドット1つ目：');
  await pg.click('.p10dot[data-i="2"]'); await settle(pg); assertCentered(await car(pg), 'nobiton', 'ドット3つ目（循環で隣）：');
  // 中央の左右に見えている個体をタップ（ノビトンが中央：右にソラモ、左にガウル）
  let pt = await slidePoint(pg, 'solamo');
  assert.ok(pt, '右の個体（ソラモ）に押せる場所がある');
  await pg.mouse.click(pt.x, pt.y); await settle(pg); assertCentered(await car(pg), 'solamo', '右の個体をタップ：');
  pt = await slidePoint(pg, 'nobiton');
  assert.ok(pt, '左の個体（ノビトン）に押せる場所がある');
  await pg.mouse.click(pt.x, pt.y); await settle(pg); assertCentered(await car(pg), 'nobiton', '左の個体をタップ：');
  // 中央の個体のタップでは動かない
  pt = await slidePoint(pg, 'nobiton');
  await pg.mouse.click(pt.x, pt.y); await pg.waitForTimeout(100); await settle(pg);
  assertCentered(await car(pg), 'nobiton', '中央の個体をタップ：');
  noErrors(p);
});

T('QA-MK6：横スワイプ（タッチ）：左へ払う＝次、右へ払う＝前（最初→最後の循環も）。縦のドラッグでは切り替わらず、横スクロールも出ない', async () => {
  const p = await openMarket({ touch: true }); const pg = p.page;
  const cdp = await pg.context().newCDPSession(pg);
  const swipe = async (x0, x1, y0, y1) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] });
    for (let i = 1; i <= 6; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (x1 - x0) * i / 6, y: y0 + (y1 - y0) * i / 6 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  const midY = () => pg.evaluate(() => { const r = document.getElementById('p10car').getBoundingClientRect(); return Math.round(r.top + r.height / 2); });
  let y = await midY();
  await swipe(300, 120, y, y); await settle(pg); assertCentered(await car(pg), 'gauru', '左へ払う：');
  await swipe(120, 300, y, y); await settle(pg); assertCentered(await car(pg), 'solamo', '右へ払う：');
  await swipe(120, 300, y, y); await settle(pg); assertCentered(await car(pg), 'nobiton', '右へ払う（最初→最後）：');
  await swipe(300, 120, y, y); await settle(pg); assertCentered(await car(pg), 'solamo', '左へ払う（最後→最初）：');
  y = await midY();
  await swipe(200, 215, y - 100, y + 60); await pg.waitForTimeout(150); await settle(pg);
  assertCentered(await car(pg), 'solamo', '縦のドラッグ：');
  const sc = await pg.evaluate(() => ({ sx: scrollX, sw: document.documentElement.scrollWidth, iw: innerWidth }));
  assert.equal(sc.sx, 0); assert.equal(sc.sw, sc.iw, '横スクロールが出ない');
  noErrors(p);
});

T('QA-MK7：マウスで横にドラッグしても切り替わる（左へ＝次、右へ＝前）', async () => {
  const p = await openMarket(); const pg = p.page;
  const r = await pg.evaluate(() => { const b = document.getElementById('p10car').getBoundingClientRect(); return { x: b.left, w: b.width, y: b.top + b.height / 2 }; });
  const drag = async (f0, f1) => { await pg.mouse.move(r.x + r.w * f0, r.y); await pg.mouse.down(); await pg.mouse.move(r.x + r.w * f1, r.y, { steps: 6 }); await pg.mouse.up(); };
  await drag(0.7, 0.2); await settle(pg); assertCentered(await car(pg), 'gauru', '左へドラッグ：');
  await drag(0.25, 0.75); await settle(pg); assertCentered(await car(pg), 'solamo', '右へドラッグ：');
  await drag(0.25, 0.75); await settle(pg); assertCentered(await car(pg), 'nobiton', '右へドラッグ（最初→最後）：');
  noErrors(p);
});

T('QA-MK8：切り替え中（約0.3秒）は、矢印・キー・ドット・個体のタップ・購入を受け付けない（同じ瞬間の連打で1つだけ進む）', async () => {
  const p = await openMarket(); const pg = p.page;
  const during = await pg.evaluate(() => {
    const nx = document.querySelector('.p10arw.next'), pv = document.querySelector('.p10arw.prev');
    nx.click();
    const r = { anim: P10_ANIM, mk: P10_MK, buyDis: document.querySelector('#p10info .p10buy').disabled };
    for (let i = 0; i < 4; i++) nx.click();
    pv.click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    p10Go(2);
    document.querySelector('.p10dot[data-i="0"]').click();
    document.querySelector('#p10car .p10sl[data-key="nobiton"]').click();
    r.step = p10Step(1);
    p10BuyAsk();
    r.ov = !!document.getElementById('p10ov');
    r.mkAfter = P10_MK; r.animAfter = P10_ANIM;
    return r;
  });
  assert.deepEqual(during, { anim: true, mk: 1, buyDis: true, step: false, ov: false, mkAfter: 1, animAfter: true },
    '最初の1回だけ進み、切り替え中は購入ボタンも押せない');
  await settle(pg);
  const c = await car(pg);
  assertCentered(c, 'gauru', '演出の後：');
  assert.equal(c.buyDis, false, '演出が終われば購入ボタンは押せる');
  assert.equal(c.ov, false, '購入確認は開いていない');
  noErrors(p);
});

T('QA-MK9：切り替え中の実際のクリック・キー入力は無視され、演出が終わった後の入力は受け付ける', async () => {
  const p = await openMarket(); const pg = p.page;
  const pv = await pg.evaluate(() => { const b = document.querySelector('.p10arw.prev').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
  const t0 = Date.now();
  await pg.click('.p10arw.next');
  await pg.mouse.click(pv.x, pv.y);
  await pg.keyboard.press('ArrowRight');
  const busy = await pg.evaluate(() => P10_ANIM);
  const elapsed = Date.now() - t0;
  await settle(pg);
  // 3つの入力がすべて約0.3秒の演出中に届いたとき（busy）だけ、1つだけ進んだことを確かめる（極端に遅い環境では判定しない）
  if (busy && elapsed < 250) assertCentered(await car(pg), 'gauru', '演出中の入力は無視：');
  // 演出の後はふつうに受け付ける
  const before = (await car(pg)).mk;
  await pg.mouse.click(pv.x, pv.y); await settle(pg);
  assert.equal((await car(pg)).mk, (before + 2) % 3, '演出の後の「前へ」は受け付ける');
  noErrors(p);
});

T('QA-MK10：マウスのドラッグを市場の外で離した後でも、「前へ」の矢印は前へ進む', { todo: '既知の不具合：市場の外でボタンを離すとスワイプの開始位置が残り、次の矢印クリックがスワイプとして扱われて逆へ進む（PC のマウス操作のみ）' }, async () => {
  const p = await openMarket(); const pg = p.page;
  const r = await pg.evaluate(() => { const c = document.getElementById('p10car').getBoundingClientRect(), a = document.querySelector('.p10arw.prev').getBoundingClientRect();
    return { cx: c.left + c.width * 0.8, cy: c.top + c.height / 2, below: c.bottom + 60, ax: a.left + a.width / 2, ay: a.top + a.height / 2 }; });
  await pg.mouse.move(r.cx, r.cy); await pg.mouse.down(); await pg.mouse.move(r.cx, r.below, { steps: 5 }); await pg.mouse.up();
  await pg.waitForTimeout(100); await settle(pg);
  assertCentered(await car(pg), 'solamo', '縦のドラッグでは動かない：');
  await pg.mouse.click(r.ax, r.ay); await settle(pg);
  assertCentered(await car(pg), 'nobiton', '「前へ」でソラモ→ノビトン：');
  noErrors(p);
});
