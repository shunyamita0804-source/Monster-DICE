// =========================================================
// 画面全体を固定（2026-09-30）：ページ（html・body）は上下にスクロールしない。スワイプしても画面全体・背景がずれない。
//  スクロールはゲームの枠の中だけ：一覧（.dbody・牧場の .wpanel など）、1画面の器（図鑑の詳細 .mk2 など）、#app（街の下の欄・セーブ）。
//  実ブラウザのテストは QA_E2E=1 のときだけ実行する（tests/e2e/harness.mjs）。
// =========================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as H from './e2e/harness.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SKIP = H.skipReason();

test('PF-1：CSS：html・body はスクロールしない（バウンスも抑える）。ゲームの枠 main は 100dvh（古いブラウザは 100vh）、スクロールは #app と各画面の中だけ', () => {
  assert.match(HTML, /\nhtml,body\{height:100%;overflow:hidden;overscroll-behavior:none\}\n/);
  assert.match(HTML, /\nmain\{box-sizing:border-box;height:100vh;height:100dvh;display:flex;flex-direction:column;padding:16px 16px 0;overflow:hidden\}\n/);
  assert.match(HTML, /\n#app\{flex:1 1 auto;min-height:0;margin:-16px -16px 0;padding:16px;overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;/);
  assert.match(HTML, /#app>\.ds>\.dbody\{flex:1 1 auto;min-height:0;[^}]*overflow-y:auto;overscroll-behavior:contain/, '一覧（.dbody）だけスクロール');
  assert.match(HTML, /#app>\.rn>\.wpanel\{[^}]*overflow-y:auto;overscroll-behavior:contain/, '牧場は選んだ機能の中身だけスクロール');
  assert.match(HTML, /#app:has\(>\.map\.town\)\{position:relative;overflow:hidden;padding-bottom:0\}/, '街は1画面で固定（スクロールしない）');
  assert.match(HTML, /<div class="tlow\$\{msg\|\|!m\?" on":""\}"><div class="dlg/, '案内文は知らせることがあるときだけ背景の上に出す');
  assert.match(HTML, /<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">/, 'viewport は従来どおり（safe-area を使う）');
  assert.match(HTML, /window\.scrollTo=function\(a,b\)\{try\{const y=a&&typeof a=="object"\?a\.top:b,app=document\.getElementById\("app"\);if\(app&&typeof y=="number"\)app\.scrollTop=y\}catch\(e\)\{\}return f\.apply\(window,arguments\)\}/, '既存の「一番上から表示」は #app にも効く');
});

let L;
test.before(async () => { if (!SKIP) L = await H.launch(); });
test.after(async () => { if (L) await L.close(); });

/** 名前登録まで済ませ、手持ち1体・牧場3体（未育成・育成完了）・1250G にする */
async function setup(p) {
  const pg = p.page;
  await H.newGame(pg, 'テスト');
  await pg.evaluate(() => { const mkd = (i, nm, st) => { const m = mk(i); m.name = nm; MMP7.ensureProg(m); m.raise.state = st; return m; };
    S.m = mkd(0, 'ソラ', 'none'); S.box = [mkd(1, 'ハヤテ', 'done'), mkd(0, 'モコ', 'done'), mkd(1, 'ピィ', 'none')]; S.g = 1250; save(); });
}
const SCREENS = [
  ['街', 'lobby()', '.tbg'], ['市場', 'market()', '.p10mk'], ['牧場（預ける）', "farm('','a')", '.fscene'], ['牧場（様子を見る）', "rnView=null;farm('','e')", '.fscene'], ['牧場（売る）', "farm('','d')", '.fscene'],
  ['ファーム', "hall('t')", '.fm'], ['ステータス', "hall('st')", '.dbg'], ['技管理', "hall('w')", '.dbg'], ['特訓メニュー', "hall('s')", '.dbg'], ['出発準備', 'prepScr()', '.dbg'], ['アイテム', 'shopScr()', '.dbg'],
  ['プロフィール', 'profileScr()', '#app>.ds'], ['お知らせ', 'newsScr()', '#app>.ds'], ['設定', 'confScr()', '#app>.ds'], ['セーブ', 'savescr()', 'main'], ['研究所', 'museum()', '.labbg'], ['図鑑', "museum('book')", '.dbg'], ['図鑑の詳細', 'musd(0)', '.mk2'],   // 2026-10-03：研究所の入口（正式背景・1画面）と図鑑の一覧
];
/** 画面の登場アニメ（#app>* の scr：12px 下から0.3秒）など、終わりのあるアニメが止まるまで待つ（背景の位置を正しく測るため） */
const settle = (pg) => pg.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || !Number.isFinite(a.effect && a.effect.getComputedTiming().endTime)), null, { timeout: 10000 }).then(() => pg.waitForTimeout(60));
/** 下へ大きくスクロールする操作（マウスのホイール）をしたときの、ページ・背景・スクロールした所 */
async function wheel(pg, bgSel, x, y) {
  const top = (s) => pg.evaluate((s) => { const e = document.querySelector(s); return e ? Math.round(e.getBoundingClientRect().top) : null; }, bgSel);
  const bg0 = await top();
  await pg.mouse.move(x, y); await pg.mouse.wheel(0, 1200); await pg.waitForTimeout(300);
  const r = await pg.evaluate(() => ({ y: scrollY, doc: document.documentElement.scrollTop, body: document.body.scrollTop, sh: document.documentElement.scrollHeight, H: innerHeight, sw: document.documentElement.scrollWidth, W: innerWidth,
    moved: [...document.querySelectorAll('main *')].filter((e) => e.scrollTop > 0).map((e) => e.id ? '#' + e.id : '.' + String(e.className).split(' ')[0]) }));
  return { ...r, bg0, bg1: await top() };
}

for (const [key, size] of Object.entries(H.SIZES)) {
  test(`PF-B1（${size.join('×')}）：主な画面でページ全体の高さ＝画面の高さ。下へスクロールしてもページ・背景は動かない（中身の多い画面は一覧だけが動く）`, { skip: SKIP }, async () => {
    const p = await L.open({ size }); const pg = p.page;
    await setup(p);
    for (const [name, js, bg] of SCREENS) {
      await pg.evaluate((js) => (0, eval)(js), js); await pg.waitForTimeout(300); await settle(pg);
      const r = await wheel(pg, bg, size[0] / 2, size[1] * 0.7);
      assert.ok(r.sh <= r.H, `${name}：ページの高さ ${r.sh} ≤ 画面 ${r.H}`);
      assert.ok(r.sw <= r.W, `${name}：横のはみ出しなし`);
      assert.deepEqual([r.y, r.doc, r.body], [0, 0, 0], `${name}：ページはスクロールしない`);
      assert.equal(r.bg1, r.bg0, `${name}：背景（${bg}）は動かない`);
      assert.ok(!r.moved.includes('.p10mk') && !r.moved.includes('.fm'), `${name}：市場・ファームは1画面のまま（${r.moved}）`);
      await pg.mouse.wheel(0, -3000); await pg.waitForTimeout(150);
    }
    assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
  });
}

test('PF-B2（390×844）：一覧は、その部分だけスクロールできる（ステータス・技管理の .dbody、牧場の売る一覧、図鑑の詳細）。見出し・戻るボタンは動かない', { skip: SKIP }, async () => {
  const p = await L.open(); const pg = p.page;
  await setup(p);
  for (const [name, js, list, fixed] of [['ステータス', "hall('st')", '.dbody', '.dtop'], ['技管理', "hall('w')", '.dbody', '.dtitle'], ['牧場（売る）', "farm('','d')", '.rn .wpanel', '.rncmd'], ['図鑑の詳細', 'musd(0)', '.mk2', null]]) {
    await pg.evaluate((js) => (0, eval)(js), js); await pg.waitForTimeout(300); await settle(pg);
    const f0 = fixed && await pg.evaluate((s) => document.querySelector(s).getBoundingClientRect().top, fixed);
    const box = await pg.evaluate((s) => { const e = document.querySelector(s), r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + Math.min(r.height - 20, 60), can: e.scrollHeight > e.clientHeight }; }, list);
    assert.ok(box.can, `${name}：一覧は画面に収まりきらない（スクロールが必要な量）`);
    await pg.mouse.move(box.x, box.y); await pg.mouse.wheel(0, 400); await pg.waitForTimeout(300);
    assert.ok(await pg.evaluate((s) => document.querySelector(s).scrollTop > 0, list), `${name}：一覧がスクロールした`);
    if (fixed) assert.equal(await pg.evaluate((s) => document.querySelector(s).getBoundingClientRect().top, fixed), f0, `${name}：${fixed} は動かない`);
    assert.equal(await pg.evaluate(() => scrollY), 0, `${name}：ページは動かない`);
  }
  assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
});

test('PF-B3（375×667・タッチ）：スワイプ（指で上へ払う）でもページは動かない。牧場の売る一覧は一覧だけが動き、スクロールした後も一番下の「売る」を押せる', { skip: SKIP }, async () => {
  const p = await L.open({ size: H.SIZES.se, touch: true }); const pg = p.page;
  await setup(p);
  const cdp = await pg.context().newCDPSession(pg);
  // 指の操作（タッチの開始 → 少しずつ動かす → 離す）。dy>0 は指を上へ払う（下の内容を見る）。この環境では合成スクロール（synthesizeScrollGesture の touch）は動かないため、タッチそのものを送る
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  const swipe = async (x, y, dy) => { const n = Math.max(1, Math.round(Math.abs(dy) / 10)), y1 = Math.max(5, Math.min(660, y - dy)); await touch('touchStart', x, y); for (let i = 1; i <= n; i++) await touch('touchMove', x, y + (y1 - y) * i / n); await touch('touchEnd'); };
  for (const [name, js, bg] of [['街', 'lobby()', '.tbg'], ['市場', 'market()', '.p10mk'], ['ファーム', "hall('t')", '.fm'], ['牧場（売る）', "farm('','d')", '.fscene']]) {
    await pg.evaluate((js) => (0, eval)(js), js); await pg.waitForTimeout(300); await settle(pg);
    const bg0 = await pg.evaluate((s) => document.querySelector(s).getBoundingClientRect().top, bg);
    await swipe(187, 560, 400); await pg.waitForTimeout(300);
    assert.deepEqual(await pg.evaluate(() => [scrollY, document.documentElement.scrollTop]), [0, 0], `${name}：スワイプしてもページは動かない`);
    assert.equal(await pg.evaluate((s) => document.querySelector(s).getBoundingClientRect().top, bg), bg0, `${name}：背景は動かない`);
    await swipe(187, 100, -500); await pg.waitForTimeout(200);
  }
  // 牧場の売る一覧：一覧の上でスワイプすると一覧だけが動く → いちばん下の「売る」を押すと確認に進む（売却の処理は従来どおり）
  const w = await pg.evaluate(() => { const r = document.querySelector('.rn .wpanel').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await swipe(w.x, w.y + 60, 300); await pg.waitForTimeout(400);
  assert.ok(await pg.evaluate(() => document.querySelector('.rn .wpanel').scrollTop > 0), '一覧だけがスクロールした');
  const last = await pg.evaluate(() => { const b = [...document.querySelectorAll('.rn .wpanel button')].at(-1), r = b.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { in: r.top >= 0 && r.bottom <= innerHeight, hit: !!hit && (hit === b || b.contains(hit)), x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  assert.ok(last.in && last.hit, `いちばん下の「売る」が見えていて押せる（${JSON.stringify(last)}）`);
  const g0 = (await H.getS(pg)).g;
  await pg.touchscreen.tap(last.x, last.y); await pg.waitForTimeout(400);
  assert.ok(await pg.evaluate(() => /売却/.test(document.querySelector('.rn .wpanel').textContent)), '売却の確認へ進んだ');
  assert.equal((await H.getS(pg)).g, g0, '確認だけでは売らない（2度押しは従来どおり）');
  assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
});

test('PF-B4（4サイズ）：街は1画面で固定（スクロールしない）。セーブ・ロードは下のバー（ファーム 55%・プロフィール・セーブ・ロード）から押せる。案内文・ヴァルガスの一言はバーの上に見える', { skip: SKIP }, async () => {
  for (const size of Object.values(H.SIZES)) {
    const p = await L.open({ size }); const pg = p.page;
    await setup(p);
    await pg.evaluate(() => lobby()); await pg.waitForTimeout(300); await settle(pg);
    const bg0 = await pg.evaluate(() => document.querySelector('.tbg').getBoundingClientRect().top);
    await pg.mouse.move(size[0] / 2, size[1] / 3); await pg.mouse.wheel(0, 1500); await pg.waitForTimeout(300);
    const r = await pg.evaluate(() => { const a = document.getElementById('app'), sv = document.querySelector('.tbar .tsave.svb').getBoundingClientRect(), hit = document.elementFromPoint(sv.left + sv.width / 2, sv.top + sv.height / 2),
      cells = [...document.querySelectorAll('.tbar .tcmd')].slice(4).map((b) => Math.round(b.getBoundingClientRect().width));
      return { st: a.scrollTop, can: a.scrollHeight > a.clientHeight, y: scrollY, bg: document.querySelector('.tbg').getBoundingClientRect().top, hit: !!hit && hit.closest('.svb') != null, lab: document.querySelector('.tbar .tsave b').innerText.split('\n'), cells, tlow: getComputedStyle(document.querySelector('#app>.tlow')).display }; });
    const tag = size.join('×');
    assert.deepEqual([r.st, r.can, r.y], [0, false, 0], `${tag}：街はスクロールしない`);
    assert.equal(r.bg, bg0, `${tag}：背景は動かない`);
    assert.ok(r.hit, `${tag}：セーブ・ロードは押せる`); assert.deepEqual(r.lab, ['セーブ', 'ロード'], `${tag}：セーブ・ロードは2行`);
    const all = r.cells.reduce((a, b) => a + b, 0); assert.ok(Math.abs(r.cells[0] / all - 0.55) < 0.03 && Math.abs(r.cells[1] - r.cells[2]) <= 1, `${tag}：2段目は ファーム 55%・プロフィールとセーブ・ロードが半分ずつ（${r.cells}）`);
    assert.equal(r.tlow, 'none', `${tag}：知らせることが無いときは案内文を背景に重ねない`);
    await pg.click('.tbar .svb'); await pg.waitForSelector('#sc', { state: 'attached' });
    await pg.evaluate(() => lobby()); await pg.waitForTimeout(300); await settle(pg);
    await pg.click('.hz[onclick="townArena()"]'); await pg.waitForSelector('#vgsay'); await settle(pg);
    const v = await pg.evaluate(() => { const bar = document.querySelector('.tbar').getBoundingClientRect(), g = document.getElementById('vgsay').getBoundingClientRect(), m = document.getElementById('msg').getBoundingClientRect(); return { ok: m.top >= 0 && g.bottom <= bar.top + 1, msg: document.getElementById('msg').textContent }; });
    assert.ok(v.ok && v.msg === '闘技場は、まだ利用できません。', `${tag}：案内文とヴァルガスの一言がバーの上に見える`);
    assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
    await p.ctx.close();
  }
});
