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

test('MS-3：画面下が切れない作り：市場の高さは実際に見えている高さ（dvh）、案内欄は市場の枠の下端から safe-area 分だけ上げる、詳細シートの最大の高さも dvh と safe-area で計算', () => {
  assert.match(HTML, /\.p10mk\{box-sizing:border-box;margin-bottom:-16px;min-height:100vh;min-height:100dvh;overflow:clip\}/);
  assert.match(HTML, /\.p10kbar\{position:absolute;left:10px;right:10px;bottom:calc\(10px \+ env\(safe-area-inset-bottom,0px\)\);/, '案内欄は市場の枠（高さ＝見えている画面）の下端から safe-area 分だけ上');
  assert.match(HTML, /max-height:calc\(100dvh - 150px - env\(safe-area-inset-bottom,0px\)\);/);
});

test('MS-3b：市場の枠の中身はスクロールしない（overflow:clip＋切り替えのたびに0へ）。閉じた詳細シートは見えずフォーカスも入らない', () => {
  assert.match(HTML, /min-height:100dvh;overflow:clip\}/);
  assert.match(HTML, /if\(mk&&\(mk\.scrollTop\|\|mk\.scrollLeft\)\)\{mk\.scrollTop=0;mk\.scrollLeft=0\}/, '古いブラウザでも切り替えのたびに戻す');
  assert.match(HTML, /\.p10detp\{[^}]*transform:translateY\(105%\);transition:transform \.22s ease-out,visibility 0s \.22s;visibility:hidden\}/);
});

test('MS-4：カレンのセリフに「〜わよ」「〜だわ」を使わない（口調は「〜よ／〜ね／〜の／〜てね」が基本）', () => {
  const i = HTML.indexOf('const KAREN_TALK={'), talk = HTML.slice(i, HTML.indexOf('\nfunction p10KarenTalk(', i));
  const pick = HTML.split('\n').find((l) => l.startsWith('const KAREN_PICK='));
  for (const src of [talk, pick]) assert.doesNotMatch(src, /わよ|だわ/);
});

test('MS-2：会話中（.p10mk.talk）は操作UIを隠す。カレンのボタンは初回のあいさつの後だけ出す', () => {
  assert.match(HTML, /\.p10mk\.talk \.p10arw,\.p10mk\.talk \.p10dots,\.p10mk\.talk \.p10plate,\.p10mk\.talk \.p10det,\.p10mk\.talk \.p10karen,\.p10mk\.talk \.p10kbar,\.p10mk\.talk \.p10msg\{visibility:hidden\}/);
  assert.match(HTML, /function karenSay\(lines,o\)\{if\(!window\.MMNPC\|\|!lines\)return Promise\.resolve\(\);const mk=\$\("\.p10mk"\);if\(mk\)mk\.classList\.add\("talk"\);return MMNPC\.talk\(lines,\{kind:"npc",\.\.\.\(o\|\|\{\}\)\}\)\.then\(\(\)=>\{if\(mk\)mk\.classList\.remove\("talk"\)\}\)\}/);
  assert.match(HTML, /<div class="p10kbar\$\{finaFlags\(\)\.karenIntro\?"":" wait"\}" id="p10kbar"><button class="p10karen" onclick="p10KarenTalk\(\)"/, '案内欄（顔のボタン＋一言）は初回のあいさつの後だけ');
  assert.match(HTML, /\.p10mk\.det\.talk \.p10detp\{visibility:hidden\}/, '詳細を開いたままでも会話中は隠す');
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

test('MS-B7：矢印・左右のタップ・キー操作を素早く混ぜても、市場の枠の中身がずれず、案内欄は画面下・左の矢印は押せる（以前は中身が386pxずれて案内欄が矢印に重なることがあった）', { skip: SKIP }, async () => {
  const p = await L.open(); const pg = p.page;
  await H.newGame(pg, 'アルト'); await pg.evaluate(() => market()); await pg.waitForFunction(() => !P10_ANIM); await pg.waitForTimeout(300);
  const pv = await pg.evaluate(() => { const b = document.querySelector('.p10arw.prev').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
  for (let i = 0; i < 6; i++) {
    await pg.click('.p10arw.next'); await pg.mouse.click(pv.x, pv.y); await pg.keyboard.press('ArrowRight'); await pg.keyboard.press('Tab');
    await pg.waitForFunction(() => !P10_ANIM);
    const r = await pg.evaluate(([x, y]) => { const mk = document.querySelector('.p10mk'), kb = document.getElementById('p10kbar').getBoundingClientRect(), e = document.elementFromPoint(x, y);
      return { sc: mk.scrollTop, kbBottom: kb.bottom, ih: innerHeight, hitPrev: !!(e && e.closest('.p10arw.prev')) }; }, [pv.x, pv.y]);
    assert.equal(r.sc, 0, `${i}回目：枠の中身がずれていない`); assert.ok(r.kbBottom <= r.ih && r.kbBottom > r.ih - 80, `${i}回目：案内欄は画面下`); assert.ok(r.hitPrev, `${i}回目：左の矢印が押せる`);
  }
  assert.deepEqual(p.errors, []);
});

/**
 * 画面の登場アニメ（#app>* の scr：translateY(12px)→0、0.3秒）や詳細シートの動きがすべて終わり、
 * 市場の枠の位置と文書の高さが2フレーム続けて同じになるまで待つ（負荷が高いとき、アニメの途中で高さを測って 12px 多く出ていた）。
 * くり返し続くアニメ（終わりの無いもの）は待たない。
 */
async function settled(pg) {
  const ok = await pg.evaluate(() => new Promise((res) => {
    const t0 = performance.now(); let last = null, same = 0;
    const tick = () => {
      const moving = document.getAnimations().some((a) => a.playState === 'running' && a.effect && Number.isFinite(a.effect.getComputedTiming().endTime));
      const r = document.querySelector('.p10mk').getBoundingClientRect(), key = `${r.top},${r.height},${document.documentElement.scrollHeight}`;
      same = !moving && key === last ? same + 1 : 0; last = key;
      if (same >= 2) return res(true);
      if (performance.now() - t0 > 10000) return res(false);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }));
  assert.ok(ok, '画面のアニメが終わり、位置が落ち着く（10秒以内）');
}

for (const [k, size] of Object.entries(H.SIZES)) {
  test(`MS-B6（${size.join('×')}）：縦スクロールなし・横はみ出しなし。詳細を開くと購入ボタンまで画面内。上部のプレイヤー情報は折り返さない`, { skip: SKIP }, async () => {
    const p = await L.open({ size }); const pg = p.page;
    await H.newGame(pg, 'アルトリウス'); await pg.evaluate(() => market()); await pg.waitForFunction(() => !P10_ANIM); await settled(pg);
    const pg0 = await pg.evaluate(() => ({ sh: document.documentElement.scrollHeight, ih: innerHeight, sw: document.documentElement.scrollWidth, iw: innerWidth,
      who: [...document.querySelectorAll('.p10who small, .p10who b, .p10gold')].map((e) => { const r = e.getBoundingClientRect(), lh = parseFloat(getComputedStyle(e).lineHeight) || parseFloat(getComputedStyle(e).fontSize) * 1.4; return r.height <= lh * 1.25 + 1; }) }));
    assert.ok(pg0.sh <= pg0.ih + 1, `縦スクロールなし ${pg0.sh} > ${pg0.ih}`); assert.ok(pg0.sw <= pg0.iw + 1);
    assert.ok(pg0.who.every(Boolean), 'プレイヤー名・ランク・所持Gがそれぞれ1行');
    const kb = await pg.evaluate(() => { const r = document.getElementById('p10kbar').getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, ih: innerHeight, iw: innerWidth, hidden: document.getElementById('p10kbar').classList.contains('wait') }; });
    assert.equal(kb.hidden, false);
    assert.ok(kb.t >= 0 && kb.l >= 0 && kb.r <= kb.iw && kb.b <= kb.ih - 4, `カレンの案内欄の枠全体が画面内（下端 ${kb.b} / ${kb.ih}）`);
    await pg.click('#p10car .p10sl.on .p10plate'); await pg.waitForFunction(() => document.querySelector('.p10mk').classList.contains('det')); await settled(pg);
    const r = await pg.evaluate(() => { const b = document.querySelector('#p10info .p10buy').getBoundingClientRect(), bars = [...document.querySelectorAll('#p10info .p10bar')].map((x) => x.getBoundingClientRect());
      return { top: b.top, bottom: b.bottom, ih: innerHeight, sy: scrollY, bars: bars.every((x) => x.top >= 0 && x.bottom <= innerHeight) }; });
    assert.ok(r.top >= 0 && r.bottom <= r.ih, `購入ボタンが画面内（${r.top}〜${r.bottom} / ${r.ih}）`); assert.equal(r.sy, 0); assert.ok(r.bars, '能力7項目も画面内');
    // 詳細シートの一番下（購入ボタン下の説明文・シートの枠）まで、スクロールなしで完全に画面内
    const sh = await pg.evaluate(() => { const i = document.getElementById('p10info'), pp = document.querySelector('.p10detp'), notes = [...i.querySelectorAll('.p10note')].map((n) => n.getBoundingClientRect().bottom);
      return { panel: pp.getBoundingClientRect().bottom, info: i.getBoundingClientRect().bottom, top: i.getBoundingClientRect().top, notes, clipped: i.scrollHeight > i.clientHeight + 1, ih: innerHeight }; });
    assert.ok(sh.notes.length >= 1, '新規ゲーム（300G）なので購入ボタンの下に補填の説明がある＝一番長い状態で確かめる');
    assert.ok(sh.notes.every((b) => b <= sh.ih), '購入ボタン下の説明文まで画面内');
    assert.ok(sh.info <= sh.ih && sh.panel <= sh.ih + 1 && sh.top >= 0, `詳細シートの最下端まで画面内（${sh.info} / ${sh.ih}）`);
    assert.equal(sh.clipped, false, '詳細の中身がシートの中でスクロールしていない（全部見えている）');
    assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
  });
}
