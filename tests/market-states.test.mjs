// =========================================================
// 市場画面の3状態（情報設計の整理）
//  STATE 1：カレンの会話中 … 市場の操作UI（詳細・矢印・ドット・名札・カレンのボタン）を隠す
//  STATE 2：通常の閲覧 … 中央・左右のモンスター、矢印、ドット、名前・価格の名札だけ（能力の詳細は出さない）
//  STATE 3：詳細 … 中央のモンスターをタップすると、下からのシートに能力7項目と購入ボタン。閉じると閲覧へ戻る
//  390×844 などで縦スクロールなしに購入ボタンまで届く。上部のプレイヤー情報は折り返さない。
//  購入の判定・価格・カルーセルの仕様は変えない。実ブラウザのテストは QA_E2E=1 のときだけ実行する。
// =========================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as H from './e2e/harness.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML = readFileSync(path.join(ROOT, 'index.html'), 'utf8');

test('MS-1：中央のモンスターのタップで詳細を開き、左右はその個体へ切り替える。スワイプ直後・切り替え中・購入確認中は開かない', () => {
  assert.match(HTML, /function p10Tap\(i\)\{if\(P10_SW&&P10_SW\.moved\)return;if\(i===P10_MK\)\{if\(!P10_ANIM&&!\$\("#p10ov"\)\)p10Detail\(true\)\}else p10Go\(i\)\}/);
  assert.match(HTML, /<div class="p10det" id="p10det" aria-hidden="true"><div class="p10detbg" onclick="p10Detail\(false\)"><\/div><div class="p10detp"><button class="p10detx" onclick="p10Detail\(false\)" aria-label="詳細を閉じる">×<\/button><section class="p10info" id="p10info"/);
});

test('MS-2：会話中（.p10mk.talk）は操作UIを隠す。カレンのボタンは初回のあいさつの後だけ出す', () => {
  assert.match(HTML, /\.p10mk\.talk \.p10arw,\.p10mk\.talk \.p10dots,\.p10mk\.talk \.p10plate,\.p10mk\.talk \.p10det,\.p10mk\.talk \.p10karen,\.p10mk\.talk \.p10kbar,\.p10mk\.talk \.p10msg\{visibility:hidden\}/);
  assert.match(HTML, /function karenSay\(lines\)\{if\(!window\.MMNPC\|\|!lines\)return Promise\.resolve\(\);const mk=\$\("\.p10mk"\);if\(mk\)mk\.classList\.add\("talk"\);return MMNPC\.talk\(lines\)\.then\(\(\)=>\{if\(mk\)mk\.classList\.remove\("talk"\)\}\)\}/);
  assert.match(HTML, /<div class="p10kbar" id="p10kbar" \$\{finaFlags\(\)\.karenIntro\?"":"hidden"\}><button class="p10karen" onclick="p10KarenTalk\(\)"/, '案内欄（顔のボタン＋一言）は初回のあいさつの後だけ');
});

// ---------------- 実ブラウザ ----------------
const SKIP = H.skipReason();
let L;
test.before(async () => { if (!SKIP) L = await H.launch(); });
test.after(async () => { if (L) await L.close(); });
const vis = (pg, sel) => pg.evaluate((s) => [...document.querySelectorAll(s)].some((e) => { const c = getComputedStyle(e), r = e.getBoundingClientRect(); return c.visibility !== 'hidden' && c.display !== 'none' && r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight; }), sel);
const UI = ['#p10car .p10arw', '.p10dots', '#p10car .p10plate', '.p10karen', '#p10kbar'];

test('MS-B1：初回来店：会話中は矢印・ドット・名札・カレンのボタン・詳細が見えない。会話が終わると閲覧状態に戻り、カレンのボタンが出る', { skip: SKIP }, async () => {
  const p = await L.open({ karen: true }); const pg = p.page;
  await H.newGame(pg, 'アルト'); await pg.click('.hz[onclick="market()"]'); await pg.waitForSelector('.mmtalk');
  for (const s of [...UI, '#p10info .p10buy']) assert.equal(await vis(pg, s), false, `会話中は隠す：${s}`);
  assert.ok(await pg.evaluate(() => document.querySelector('.p10mk').classList.contains('talk')));
  await H.finishTalk(pg); await pg.waitForFunction(() => !document.querySelector('.p10mk').classList.contains('talk'));
  for (const s of UI) assert.equal(await vis(pg, s), true, `会話の後は出す：${s}`);
  assert.equal(await vis(pg, '#p10info .p10buy'), false, 'ふだんは能力・購入ボタン（詳細）を出さない');
  assert.deepEqual(p.errors, []);
});

test('MS-B2：中央のモンスターをタップ → 詳細（名前・価格・販売状態・能力7項目・購入ボタン）→ × で閉じる／背景のタップでも閉じる', { skip: SKIP }, async () => {
  const p = await L.open(); const pg = p.page;
  await H.newGame(pg, 'アルト'); await pg.evaluate(() => market()); await pg.waitForFunction(() => !P10_ANIM); await pg.waitForTimeout(300);
  await pg.click('#p10car .p10sl.on .p10mon'); await pg.waitForFunction(() => document.querySelector('.p10mk').classList.contains('det')); await pg.waitForTimeout(300);
  const d = await pg.evaluate(() => ({ nm: document.querySelector('#p10info .p10nm b').textContent, st: document.querySelector('#p10info .p10st').textContent,
    bars: [...document.querySelectorAll('#p10info .p10bar span')].map((x) => x.textContent), buy: document.querySelector('#p10info .p10buy').textContent }));
  assert.deepEqual([d.nm, d.st], ['ソラモ', '販売中']);
  assert.deepEqual(d.bars, ['ライフ', 'ちから', 'かしこさ', '命中', '回避', '丈夫さ', '素早さ']);
  assert.match(d.buy, /購入する\s*.*500G/);
  assert.equal(await vis(pg, '#p10info .p10buy'), true);
  await pg.click('.p10detx'); await pg.waitForFunction(() => !document.querySelector('.p10mk').classList.contains('det'));
  await pg.click('#p10car .p10sl.on .p10plate'); await pg.waitForFunction(() => document.querySelector('.p10mk').classList.contains('det'));
  await pg.mouse.click(20, 120); await pg.waitForFunction(() => !document.querySelector('.p10mk').classList.contains('det'));
  assert.deepEqual(p.errors, []);
});

test('MS-B3：左右の矢印・左右の個体のタップ・スワイプで切り替わり、詳細は開かない。スワイプ直後のタップでも開かない', { skip: SKIP }, async () => {
  const p = await L.open(); const pg = p.page;
  await H.newGame(pg, 'アルト'); await pg.evaluate(() => market()); await pg.waitForFunction(() => !P10_ANIM); await pg.waitForTimeout(300);
  const det = () => pg.evaluate(() => document.querySelector('.p10mk').classList.contains('det'));
  await pg.click('#p10car .p10arw.next'); await pg.waitForFunction(() => !P10_ANIM); assert.equal(await pg.evaluate(() => P10_MK), 1); assert.equal(await det(), false);
  await pg.evaluate(() => document.querySelector('#p10car .p10sl[data-i="0"]').click()); await pg.waitForFunction(() => !P10_ANIM); assert.equal(await pg.evaluate(() => P10_MK), 0); assert.equal(await det(), false);
  const r = await pg.evaluate(() => { const b = document.getElementById('p10car').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height * 0.55 }; });
  await pg.mouse.move(r.x, r.y); await pg.mouse.down(); await pg.mouse.move(r.x - 120, r.y, { steps: 6 }); await pg.mouse.up();
  await pg.waitForFunction(() => !P10_ANIM); assert.equal(await pg.evaluate(() => P10_MK), 1, '左へ払うと次へ'); assert.equal(await det(), false, 'スワイプで詳細は開かない');
  // 購入対象は中央の個体と一致（詳細の購入ボタンの種族）
  await H.marketDetail(pg);
  assert.equal(await pg.evaluate(() => document.querySelector('#p10info .p10buy').dataset.key), await pg.evaluate(() => MMP10M.MARKET_CATALOG[P10_MK].key));
  assert.deepEqual(p.errors, []);
});

test('MS-B4：詳細から購入 → 確認シート（カレンのアップ画像と一言）→ 購入成功（カレン）→ 街。購入は1回分', { skip: SKIP }, async () => {
  const p = await L.open({ karen: true }); const pg = p.page;
  await H.newGame(pg, 'アルト'); await pg.evaluate(() => { S.g = 1000; save(); market(); }); await H.finishTalk(pg); await pg.waitForFunction(() => !P10_ANIM); await pg.waitForTimeout(300);
  await pg.click('#p10car .p10sl.on .p10mon'); await pg.waitForFunction(() => document.querySelector('.p10mk').classList.contains('det')); await pg.waitForTimeout(300);
  await pg.click('#p10info .p10buy'); await pg.waitForSelector('#p10ov .kup'); await pg.waitForTimeout(500);
  await pg.click('#p10ov .p10ok'); await pg.waitForSelector('.mmtalk');
  assert.equal(await vis(pg, '#p10info .p10buy'), false, '購入成功の会話中も詳細は隠す');
  await H.finishTalk(pg); await pg.waitForSelector('.map.town');
  const s = await H.storedSave(pg); assert.deepEqual([s.g, s.cnt], [500, 1]);
  assert.deepEqual(p.errors, []);
});

test('MS-B5：モンスターは以前より上（画面の高さの約8%）。タイトル・プレイヤー情報と重ならず、名札・ドットは案内欄より上', { skip: SKIP }, async () => {
  const p = await L.open(); const pg = p.page;
  await H.newGame(pg, 'アルト'); await pg.evaluate(() => market()); await pg.waitForFunction(() => !P10_ANIM); await pg.waitForTimeout(300);
  const r = await pg.evaluate(() => { const b = (s) => document.querySelector(s).getBoundingClientRect(); return { lift: P15_LIFT, bgTop: parseFloat(document.querySelector('.p15mkbg').style.top), mon: b('#p10car .p10sl.on .p10mon').top, top: b('.p10top').bottom, dots: b('.p10dots').bottom, bar: b('#p10kbar').top, ih: innerHeight }; });
  assert.equal(r.lift, 0.08); assert.equal(r.bgTop, -Math.round(r.ih * 0.08), '背景も同じだけ上げる（台座の位置がずれない）');
  assert.ok(r.mon > r.top, 'タイトル・プレイヤー情報と重ならない'); assert.ok(r.dots < r.bar, 'ドットは案内欄より上');
  assert.deepEqual(p.errors, []);
});

for (const [k, size] of Object.entries(H.SIZES)) {
  test(`MS-B6（${size.join('×')}）：縦スクロールなし・横はみ出しなし。詳細を開くと購入ボタンまで画面内。上部のプレイヤー情報は折り返さない`, { skip: SKIP }, async () => {
    const p = await L.open({ size }); const pg = p.page;
    await H.newGame(pg, 'アルトリウス'); await pg.evaluate(() => market()); await pg.waitForFunction(() => !P10_ANIM); await pg.waitForTimeout(300);
    const pg0 = await pg.evaluate(() => ({ sh: document.documentElement.scrollHeight, ih: innerHeight, sw: document.documentElement.scrollWidth, iw: innerWidth,
      who: [...document.querySelectorAll('.p10who small, .p10who b, .p10gold')].map((e) => { const r = e.getBoundingClientRect(), lh = parseFloat(getComputedStyle(e).lineHeight) || parseFloat(getComputedStyle(e).fontSize) * 1.4; return r.height <= lh * 1.25 + 1; }) }));
    assert.ok(pg0.sh <= pg0.ih + 1, `縦スクロールなし ${pg0.sh} > ${pg0.ih}`); assert.ok(pg0.sw <= pg0.iw + 1);
    assert.ok(pg0.who.every(Boolean), 'プレイヤー名・ランク・所持Gがそれぞれ1行');
    await pg.click('#p10car .p10sl.on .p10plate'); await pg.waitForFunction(() => document.querySelector('.p10mk').classList.contains('det')); await pg.waitForTimeout(350);
    const r = await pg.evaluate(() => { const b = document.querySelector('#p10info .p10buy').getBoundingClientRect(), bars = [...document.querySelectorAll('#p10info .p10bar')].map((x) => x.getBoundingClientRect());
      return { top: b.top, bottom: b.bottom, ih: innerHeight, sy: scrollY, bars: bars.every((x) => x.top >= 0 && x.bottom <= innerHeight) }; });
    assert.ok(r.top >= 0 && r.bottom <= r.ih, `購入ボタンが画面内（${r.top}〜${r.bottom} / ${r.ih}）`); assert.equal(r.sy, 0); assert.ok(r.bars, '能力7項目も画面内');
    assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
  });
}
