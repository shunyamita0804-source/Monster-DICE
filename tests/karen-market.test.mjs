// =========================================================
// 市場NPC「カレン」と、会話UIの正式デザイン（深い青・白文字・金枠）、NPC同士の会話（話者の切り替え・左右）
//  ・カレンはアップ画像のみ（closeup の6表情：normal・smile・guide・troubled・happy・serious）。全身は使わない
//  ・市場での表示：初回来店（1度だけ）／購入確認（シートの中の1行）／購入成功／上部のボタン（中央の個体に合わせて案内）
//  ・購入の判定・カルーセル・購入ボタンの状態は変えない
//  実ブラウザのテストは QA_E2E=1 のときだけ実行する（tests/e2e/harness.mjs）。
// =========================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import * as H from './e2e/harness.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const EXPR = ['normal', 'smile', 'guide', 'troubled', 'happy', 'serious'];
function loadNpc() { const ctx = { console }; ctx.window = ctx; vm.createContext(ctx); vm.runInContext(readFileSync(path.join(ROOT, 'js/npc/npc.js'), 'utf8'), ctx); return ctx.MMNPC; }
const karenTalkData = () => { const i = HTML.indexOf('const KAREN_TALK={'); return new Function(`return ${HTML.slice(i + 'const KAREN_TALK='.length, HTML.indexOf('};', i) + 1)}`)(); };

test('KR-1：カレンは市場担当として、アップ画像（closeup）の6表情だけで登録。全身は無い（指定しても上半身で表示）', () => {
  const M = loadNpc(), k = M.get('karen');
  assert.deepEqual([k.name, k.role, k.board, k.defaultView, k.defaultExpr], ['カレン', '市場担当', false, 'closeup', 'normal']);
  assert.deepEqual([...M.expressionsOf('karen', 'closeup')], EXPR); assert.deepEqual([...M.expressionsOf('karen', 'fullbody')], []);
  const fb = M.imageOf('karen', 'fullbody', 'happy'); assert.deepEqual([fb.view, fb.expr, fb.src], ['closeup', 'happy', 'assets/npc/karen/closeup/happy.png']);
  assert.equal(M.imageOf('karen', 'closeup', 'surprised').expr, 'normal', '無い表情は基本の表情で代わりに表示（勝手に参照しない）');
});

test('KR-2：素材は6枚とも透過PNG（RGBA）・高さ760px（表示の最大380pxの2倍）で、四隅は透明', () => {
  for (const e of EXPR) {
    const f = path.join(ROOT, `assets/npc/karen/closeup/${e}.png`); assert.ok(existsSync(f), e);
    const b = readFileSync(f); assert.equal(b.subarray(1, 4).toString(), 'PNG'); assert.equal(b[25], 6, `${e}：RGBA`);
    assert.equal(b.readUInt32BE(20), 760, `${e}：高さ760`);
  }
  assert.match(readFileSync(path.join(ROOT, 'assets/npc/karen/README.md'), 'utf8'), /市松模様/);
});

test('KR-3：セリフは KAREN_TALK にまとめ、使う表情はすべて登録済み。所持金不足・未解放・購入前・購入成功・初回・通常がある', () => {
  const T = karenTalkData(), M = loadNpc();
  assert.deepEqual(Object.keys(T), ['intro', 'greet', 'ask', 'bought', 'nomoney', 'waiting']);
  for (const [k, lines] of Object.entries(T)) { assert.equal(lines[0].npc, 'karen', k); for (const l of lines) assert.ok(M.expressionsOf('karen', 'closeup').includes(l.expression), `${k}：${l.expression}`); }
  assert.deepEqual(T.intro.map((l) => [l.expression, l.text]), [['smile', 'いらっしゃい。気になる子を見ていってね。'], ['guide', '気になる子をタップすると、詳しく見られるよ。']], '入店のあいさつは短く2行');
  assert.deepEqual([T.greet, T.ask, T.bought, T.nomoney, T.waiting].map((x) => x[0].expression), ['smile', 'normal', 'happy', 'troubled', 'guide']);
});

test('KR-4：NPC同士の会話：行ごとに npc を切り替えると、名前・画像・表情が話者に切り替わり、左右（side）は話者ごとに覚える', () => {
  const M = loadNpc();
  const L = M.resolveLines([
    { npc: 'fina', expression: 'smile', text: 'a' }, { npc: 'karen', side: 'right', expression: 'happy', text: 'b' },
    { npc: 'fina', text: 'c' }, { npc: 'karen', text: 'd' }, { expression: 'troubled', text: 'e' }]);
  assert.deepEqual(L.map((l) => [l.npc, l.name, l.side, l.expr, l.img && l.img.src.split('/').slice(-3).join('/')]), [
    ['fina', 'フィナ', 'left', 'smile', 'fina/closeup/smile.png'],
    ['karen', 'カレン', 'right', 'happy', 'karen/closeup/happy.png'],
    ['fina', 'フィナ', 'left', 'normal', 'fina/closeup/normal.png'],
    ['karen', 'カレン', 'right', 'normal', 'karen/closeup/normal.png'],
    ['karen', 'カレン', 'right', 'troubled', 'karen/closeup/troubled.png']]);
  // 進行役の状態にも話者と左右が出る
  let t = 0; const q = []; const c = M.createTalk(L.map((l) => ({ npc: l.npc, side: l.side, expression: l.expr, text: l.text })), { now: () => t, schedule: (fn) => { q.push(fn); return q.length; }, cancel() {} }).start();
  const seen = []; for (let i = 0; i < 5; i++) { const s = c.state(); seen.push([s.name, s.side]); t += 1000; c.tap(); t += 1000; c.tap(); }
  assert.deepEqual(seen, [['フィナ', 'left'], ['カレン', 'right'], ['フィナ', 'left'], ['カレン', 'right'], ['カレン', 'right']]);
});

test('KR-5：会話ウィンドウは深い青・白文字・金枠。名前欄は紺に金縁・金文字。立ち絵に色のフィルターをかけない', () => {
  const css = HTML.slice(HTML.indexOf('/* ===== 共通NPC会話（MMNPC'), HTML.indexOf('</style></head>'));
  assert.match(css, /\.mmtalk-win\{[^}]*border:2px solid #e8c86a;background:linear-gradient\(#1e3f8f,#0c1f56/);
  assert.match(css, /\.mmtalk-name\{[^}]*border:2px solid #e8c86a;background:linear-gradient\(#13306f,#07163f\);color:#f6dc92/);
  assert.match(css, /\.mmtalk-text\{[^}]*color:#fff;/);
  assert.match(css, /\.mmtalk-stage\[data-side=right\] \.mmtalk-name\{left:auto;right:14px\}/);
  assert.doesNotMatch(css, /filter|hue-rotate/);
});

test('KR-6：市場の入口で初回あいさつ（karenIntro）。購入確認はシートの中の1行、購入成功は会話のあと街へ（購入処理そのものは同じ）', () => {
  assert.match(HTML, /p10Go\(P10_MK,true\);p10Info\(\);try\{window\.scrollTo\(0,0\)\}catch\(e\)\{\}karenIntro\(\)\}/);
  assert.match(HTML, /function karenIntro\(\)\{const f=finaFlags\(\);if\(f\.karenIntro\)return;f\.karenIntro=1;save\(\);karenTalk\("intro"\)\.then\(/);
  assert.match(HTML, /<div class="p10sheet" role="dialog" aria-modal="true">\$\{karenLine\("ask"\)\}/);
  assert.match(HTML, /sel=\[\];save\(\);const go=\(\)=>lobby\(/, '保存してから会話');
  assert.match(HTML, /const kt=typeof karenTalk=="function"\?karenTalk\("bought"\):null;if\(kt\)kt\.then\(go\);else go\(\)\}/);
  assert.match(HTML, /function p10KarenTalk\(\)\{if\(P10_ANIM\|\|\$\("#p10ov"\)\)return;/, '切り替え中・購入確認中は話しかけない');
});

// ---------------- 実ブラウザ ----------------
const SKIP = H.skipReason();
let L;
test.before(async () => { if (!SKIP) L = await H.launch(); });
test.after(async () => { if (L) await L.close(); });
const talkState = (pg) => pg.evaluate(() => { const o = document.querySelector('.mmtalk'); if (!o) return null;
  return { name: document.querySelector('.mmtalk-name').textContent, text: document.querySelector('.mmtalk-text').textContent, next: !document.querySelector('.mmtalk-next').hidden,
    img: document.querySelector('.mmtalk-fig img').getAttribute('src'), side: document.querySelector('.mmtalk-stage').dataset.side, n: document.querySelectorAll('.mmtalk').length }; });
async function toMarket(p, gold) {
  await H.newGame(p.page, 'テスト');
  if (gold != null) await p.page.evaluate((g) => { S.g = g; save(); lobby(); }, gold);
  await p.page.click('.hz[onclick="market()"]');
}

test('KR-B1：入店：カレンのアップ画像で2行（smile→guide）。文字送り・途中タップで全文・▼は全文後だけ・最後で閉じてアップ画像が消える。再来店・再読み込みでは出ない', { skip: SKIP }, async () => {
  const p = await L.open({ karen: true }); const pg = p.page;
  await toMarket(p);
  await pg.waitForSelector('.mmtalk'); await pg.waitForTimeout(260);
  let s = await talkState(pg);
  assert.equal(s.name, 'カレン'); assert.match(s.img, /karen\/closeup\/smile\.png$/); assert.equal(s.n, 1);
  assert.ok(s.text.length < 'いらっしゃい。気になる子を見ていってね。'.length && !s.next, '1文字ずつ表示中は▼なし');
  await pg.click('.mmtalk'); s = await talkState(pg);
  assert.deepEqual([s.text, s.next], ['いらっしゃい。気になる子を見ていってね。', true], '途中タップで全文・▼');
  await pg.waitForTimeout(120); await pg.click('.mmtalk'); await pg.waitForTimeout(30);
  s = await talkState(pg); assert.match(s.img, /guide\.png$/); assert.equal(s.next, false);
  assert.equal(await H.finishTalk(pg) > 0, true);
  assert.equal(await pg.evaluate(() => document.querySelectorAll('.mmtalk, .mmtalk-fig').length), 0, 'アップ画像は消える');
  assert.equal((await H.storedSave(pg)).npcFlags.karenIntro, 1);
  const k0 = await pg.evaluate(() => P10_MK); await pg.click('#p10car .p10arw.next'); await pg.waitForFunction(() => !P10_ANIM);
  assert.equal(await pg.evaluate(() => P10_MK), (k0 + 1) % 3);
  await pg.click('.p10back'); await pg.waitForSelector('.map.town'); await pg.click('.hz[onclick="market()"]'); await pg.waitForSelector('#p10car');
  await pg.waitForTimeout(300); assert.equal(await talkState(pg), null, '2回目の来店では出ない');
  await pg.reload(); await pg.waitForFunction(() => typeof S === 'object'); await pg.evaluate(() => market()); await pg.waitForTimeout(300);
  assert.equal(await talkState(pg), null, '再読み込み後も出ない');
  assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
});

test('KR-B2：購入確認：カレンのアップ画像（normal）と一言。購入成功でカレン（happy）のあと街へ。所持金・個体数は従来どおり1回分', { skip: SKIP }, async () => {
  const p = await L.open({ karen: true }); const pg = p.page;
  await toMarket(p, 1000); await H.finishTalk(pg);
  await pg.waitForFunction(() => !P10_ANIM); await pg.waitForTimeout(400);
  await H.marketDetail(pg); await pg.click('.p10buy'); await pg.waitForSelector('#p10ov .kup');
  const kl = await pg.evaluate(() => ({ t: document.querySelector('#p10ov .kupw').innerText, img: document.querySelector('#p10ov .kupf').getAttribute('src'), h: document.querySelector('#p10ov .kupf').getBoundingClientRect().height, title: document.querySelector('.p10sht').textContent }));
  assert.ok(kl.h >= 120, `購入確認ではカレンのアップ画像をしっかり見せる（高さ${kl.h}px）`);
  assert.match(kl.t, /カレン\s*この子を迎えるのね？/); assert.match(kl.img, /karen\/closeup\/normal\.png$/); assert.equal(kl.title, 'ソラモを連れて帰りますか？');
  await pg.waitForTimeout(500); await pg.click('#p10ov .p10ok');
  await pg.waitForSelector('.mmtalk'); await pg.waitForTimeout(260); await pg.click('.mmtalk');
  const s = await talkState(pg); assert.deepEqual([s.name, s.text], ['カレン', 'ありがとう。大切に育ててあげてね。']); assert.match(s.img, /happy\.png$/);
  const st = await H.storedSave(pg); assert.deepEqual([st.g, st.cnt, st.m.sp], [500, 1, 0], '会話の前に購入・保存は済んでいる');
  await H.finishTalk(pg); await pg.waitForSelector('.map.town');
  assert.match(await pg.evaluate(() => document.querySelector('#msg').textContent), /をつれて帰った！/);
  assert.deepEqual(await pg.evaluate(() => [document.querySelectorAll('.mmtalk').length, document.querySelectorAll('#p10ov').length]), [0, 0]);
  assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
});

test('KR-B3：通常閲覧：カレンは画面下の案内欄（小さい顔＋一言）。切り替えのたびに一言が変わり、会話ウィンドウは開かない。顔のボタンで一言案内', { skip: SKIP }, async () => {
  const p = await L.open({ karen: true }); const pg = p.page;
  await toMarket(p, 1000); await H.finishTalk(pg); await pg.waitForFunction(() => !P10_ANIM);
  const hint = () => pg.evaluate(() => [document.getElementById('p10kt').textContent, document.querySelector('#p10kbar img').getAttribute('src').split('/').pop(), document.querySelectorAll('.mmtalk').length]);
  assert.deepEqual(await hint(), ['ソラモね。バランスのいい子よ。', 'smile.png', 0]);
  await pg.click('#p10car .p10arw.next'); await pg.waitForFunction(() => !P10_ANIM);
  assert.deepEqual(await hint(), ['ガウルね。素早さが魅力の子よ。', 'smile.png', 0], '切り替えても会話ウィンドウは開かない');
  await pg.click('#p10car .p10arw.next'); await pg.waitForFunction(() => !P10_ANIM);
  assert.deepEqual(await hint(), ['この子は、まだ市場には来ていないの。', 'guide.png', 0]);
  await pg.click('#p10car .p10arw.next'); await pg.waitForFunction(() => !P10_ANIM);
  await pg.click('.p10karen');
  assert.deepEqual(await hint(), ['気になったら、この子をタップして詳しく見てみてね。', 'smile.png', 0], '顔のボタン：選択中の子を詳しく見る方法を一言');
  // 所持金不足（救済の条件に当たらない：未育成の個体を連れている）
  await pg.evaluate(() => { S.m = mk(0); S.g = 100; save(); market(null, 'solamo'); }); await pg.waitForFunction(() => !P10_ANIM);
  const dis = await pg.evaluate(() => document.querySelector('.p10buy').disabled);
  assert.deepEqual(await hint(), ['今の所持金では、まだ迎えられないみたい。', 'troubled.png', 0]);
  await pg.click('.p10karen'); assert.deepEqual((await hint())[0], '今の所持金では、まだ迎えられないみたい。');
  assert.equal(await pg.evaluate(() => document.querySelector('.p10buy').disabled), dis, '購入ボタンの状態は変えない');
  assert.equal((await H.getS(pg)).g, 100);
  assert.deepEqual(p.errors, []);
});

test('KR-B4：案内欄とボタンを何度使っても、会話DOM・画像要素・タイマーが増えない', { skip: SKIP }, async () => {
  const p = await L.open({ karen: true }); const pg = p.page;
  await toMarket(p, 1000); await H.finishTalk(pg); await pg.waitForFunction(() => !P10_ANIM);
  const n0 = await pg.evaluate(() => [document.getElementsByTagName('*').length, document.images.length]);
  for (let i = 0; i < 10; i++) { await pg.click('.p10karen'); await pg.click('#p10car .p10arw.next'); await pg.waitForFunction(() => !P10_ANIM); }
  assert.deepEqual(await pg.evaluate(() => [document.getElementsByTagName('*').length, document.images.length]), n0);
  assert.equal(await pg.evaluate(() => MMNPC.state()), null);
  assert.deepEqual(await pg.evaluate(() => [document.querySelectorAll('.mmtalk').length, MMNPC.animState().running]), [0, false]);
  assert.deepEqual(p.errors, []);
});

for (const [k, size] of Object.entries(H.SIZES)) {
  test(`KR-B5（${size.join('×')}）：初回の会話中：名前・本文・▼が画面内、横はみ出しなし。購入確認シートのボタンも画面内`, { skip: SKIP }, async () => {
    const p = await L.open({ size, karen: true }); const pg = p.page;
    await toMarket(p, 1000); await pg.waitForSelector('.mmtalk'); await pg.waitForTimeout(260); await pg.click('.mmtalk');
    const r = await pg.evaluate(() => { const b = (s) => { const x = document.querySelector(s).getBoundingClientRect(); return [x.left, x.top, x.right, x.bottom]; };
      return { sw: document.documentElement.scrollWidth, iw: innerWidth, ih: innerHeight, name: b('.mmtalk-name'), text: b('.mmtalk-text'), next: b('.mmtalk-next') }; });
    assert.ok(r.sw <= r.iw + 1);
    for (const x of [r.name, r.text, r.next]) assert.ok(x[0] >= 0 && x[1] >= 0 && x[2] <= r.iw && x[3] <= r.ih, JSON.stringify(x));
    await H.finishTalk(pg); await pg.waitForFunction(() => !P10_ANIM); await pg.waitForTimeout(400);
    await H.marketDetail(pg); await pg.click('.p10buy'); await pg.waitForSelector('#p10ov .p10ok');
    const ok = await pg.evaluate(() => { const x = document.querySelector('#p10ov .p10ok').getBoundingClientRect(); return x.bottom <= innerHeight && x.top >= 0; });
    assert.ok(ok, '連れて帰るボタンが画面内');
    assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
  });
}
