// =========================================================
// ファームNPC「ダン」（旧「コウ」の表示を置き換え）
//  ・アップ画像のみ（closeup の6表情：normal・smile・guide・serious・troubled・happy）。小さい顔は立ち絵 normal から切り出した face.png
//  ・会話は「フィナ ↔ ダン」が基本（ダンはプレイヤーへ直接語りかけない）。育成開始：フィナの確認会話のあと、同じ会話でフィナ→ダン
//  ・ファームの吹き出し・Chapter間ファーム・メッセージ欄の顔と名前をダンへ。旧コウのデータ（NP.b・NPI.b・npi_b_kou.png）は互換のため残す
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
const EXPR = ['normal', 'smile', 'guide', 'serious', 'troubled', 'happy'];
function loadNpc() { const ctx = { console }; ctx.window = ctx; vm.createContext(ctx); vm.runInContext(readFileSync(path.join(ROOT, 'js/npc/npc.js'), 'utf8'), ctx); return ctx.MMNPC; }
const lineOf = (s) => HTML.split('\n').find((l) => l.startsWith(s));
const danTalk = () => { const i = HTML.indexOf('const DAN_TALK={'); return new Function(`return ${HTML.slice(i + 'const DAN_TALK='.length, HTML.indexOf('};', i) + 1)}`)(); };
const png = (p) => { const b = readFileSync(path.join(ROOT, p)); return { sig: b.subarray(1, 4).toString(), w: b.readUInt32BE(16), h: b.readUInt32BE(20), type: b[25] }; };

test('DAN-1：ダンはファーム担当として、アップ画像（closeup）の6表情で登録。Chapterボードには置かない', () => {
  const M = loadNpc(), d = M.get('dan');
  assert.deepEqual([d.name, d.role, d.board, d.defaultView, d.defaultExpr], ['ダン', 'ファーム担当', false, 'closeup', 'normal']);
  assert.deepEqual([...M.expressionsOf('dan', 'closeup')], EXPR);
  assert.equal(M.imageOf('dan', 'closeup', 'smile').src, 'assets/npc/dan/closeup/smile.png');
});

test('DAN-2：素材は透過PNG（RGBA）。立ち絵6枚は高さ760px（表示の最大380pxの2倍）、小さい顔は正方形。README に元画像との対応', () => {
  for (const e of EXPR) { const i = png(`assets/npc/dan/closeup/${e}.png`); assert.deepEqual([i.sig, i.type, i.w, i.h], ['PNG', 6, 573, 760], e); }
  const f = png('assets/npc/dan/face.png'); assert.deepEqual([f.sig, f.type, f.w, f.h], ['PNG', 6, 256, 256]);
  assert.match(readFileSync(path.join(ROOT, 'assets/npc/dan/README.md'), 'utf8'), /face\.png/);
});

test('DAN-3：旧コウの顔（NPI.b）を表示していた4か所（ファーム・ステータス等のメッセージ欄・Chapter間ファーム・準備/ショップ）はダンの顔。名前もダン', () => {
  assert.match(lineOf('const DAN_FACE='), /^const DAN_FACE="assets\/npc\/dan\/face\.png";/);
  assert.equal((HTML.match(/\$\{DAN_FACE\}/g) || []).length, 4);
  assert.equal((HTML.replace(/^\s*\/\/.*$/gm, '').match(/NPI\.b/g) || []).length, 0, '画面から旧コウの顔を参照しない（コメントを除く）');
  const hall = lineOf(' $("#app").innerHTML=`${MMP8.canVisitTown(S)');
  assert.match(hall, /<div class="kbub kt"><b>ダン<\/b><br>\$\{msg\|\|bcomm\(\)\}<\/div>/);
  assert.match(hall, /aria-label="ダンのコメントを見る"><img src="\$\{DAN_FACE\}" alt="">/);
  const code = HTML.replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(code.slice(code.indexOf('function _hall('), code.indexOf('\nfunction after(')), /コウ/, 'ファームにコウの名前を出さない');
});

test('DAN-4：旧コウのデータは互換のため残す（NP.b の名前とセリフ・NPI.b・assets/embedded/npi_b_kou.png）', () => {
  const NP = new Function(`${lineOf('const NP=')}\nreturn NP;`)();
  assert.equal(NP.b.n, 'コウ'); assert.equal(NP.b.t.length, 4);
  assert.match(lineOf('const NPI='), /,b:"assets\/embedded\/npi_b_kou\.png"\};$/);
  assert.ok(existsSync(path.join(ROOT, 'assets/embedded/npi_b_kou.png')));
});

test('DAN-5：セリフは DAN_TALK。育成開始はフィナ→ダン（左右で話者を分ける）。ファームの一言は落ち着いた口調（「〜ぜ！」・寿命・疲労なし）で、使う表情は登録済み', () => {
  const T = danTalk(), M = loadNpc();
  assert.deepEqual(T.handoff.map((l) => [l.npc, l.side, l.text]), [['fina', 'left', 'ダン、この子のことお願いしてもいい？'], ['dan', 'right', 'ああ。こっちは任せてくれ。']]);
  for (const l of T.handoff) assert.ok(M.expressionsOf(l.npc, 'closeup').includes(l.expression), `${l.npc}:${l.expression}`);
  const all = [...T.farm, T.chapter(3), T.interval];
  assert.equal(T.chapter(3), '残り3ターンか。焦らずゴールを目指そう。');
  for (const s of all) assert.doesNotMatch(s, /ぜ！|寿命|疲労|ストレス|わよ/, s);
  assert.match(lineOf('function bcomm('), /^function bcomm\(\)\{const m=S\.m,a=\[DAN_TALK\.farm\[R\(DAN_TALK\.farm\.length\)\]\];/, '旧コウのセリフ（NP.b.t）は使わない');
  assert.match(HTML, /finaTalk\(first\?"raiseFirst":"raiseAgain",DAN_TALK\.handoff\)\.then\(/, '確認会話に続けて、同じ会話ウィンドウで掛け合い → 従来の2度押し確認');
});

// ---------------------------------------------------------
// 実ブラウザ
// ---------------------------------------------------------
const SKIP = H.skipReason();
let L;
test.before(async () => { if (!SKIP) L = await H.launch(); });
test.after(async () => { if (L) await L.close(); });
const talkState = (pg) => pg.evaluate(() => { const o = document.querySelector('.mmtalk'); if (!o) return null;
  const im = document.querySelector('.mmtalk-fig img');
  return { name: document.querySelector('.mmtalk-name').textContent, text: document.querySelector('.mmtalk-text').textContent, next: !document.querySelector('.mmtalk-next').hidden,
    img: im.getAttribute('src'), side: document.querySelector('.mmtalk-stage').dataset.side }; });
async function buyFirst(pg) {
  await H.newGame(pg, 'テスト');
  await pg.evaluate(() => market()); await pg.waitForFunction(() => document.querySelector('#p10car .p10sl.on') && !P10_ANIM);
  await H.marketDetail(pg); await pg.waitForTimeout(500); await pg.click('#p10info .p10buy', { force: true });
  await pg.waitForSelector('#p10ov'); await pg.fill('#mnm', 'ソラ'); await pg.waitForTimeout(600); await pg.click('.p10ok', { force: true });
  await pg.waitForSelector('#app .map');
}
const imgOk = (pg, sel) => pg.evaluate((s) => [...document.querySelectorAll(s)].map((i) => [i.getAttribute('src'), i.complete && i.naturalWidth > 0]), sel);

test('DAN-B1：ファーム：吹き出しの名前はダン、顔はダン（画像が読み込める）。メッセージ欄（ステータス・準備）の顔もダン', { skip: SKIP }, async () => {
  const p = await L.open(); const pg = p.page;
  await buyFirst(pg);
  await pg.evaluate(() => hall('t')); await pg.waitForSelector('.kbub'); await pg.waitForTimeout(300);
  assert.equal(await pg.evaluate(() => document.querySelector('.kbub b').textContent), 'ダン');
  assert.deepEqual(await imgOk(pg, '.kav img'), [['assets/npc/dan/face.png', true]]);
  assert.equal(await pg.evaluate(() => document.querySelector('.kav').getAttribute('aria-label')), 'ダンのコメントを見る');
  assert.doesNotMatch(await H.text(pg), /コウ/);
  await pg.evaluate(() => hall('st', 'テスト')); await pg.waitForSelector('.dmsg img'); await pg.waitForTimeout(200);
  assert.deepEqual(await imgOk(pg, '.dmsg img'), [['assets/npc/dan/face.png', true]]);
  await pg.evaluate(() => prepScr('テスト')); await pg.waitForSelector('.dmsg img'); await pg.waitForTimeout(200);
  assert.deepEqual(await imgOk(pg, '.dmsg img'), [['assets/npc/dan/face.png', true]]);
  assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
});

test('DAN-B2：育成開始：フィナの確認のあと、同じ会話でフィナ（左）→ダン（右・アップ画像）。終わると従来の2度押し確認で、会話中は育成を始めない', { skip: SKIP }, async () => {
  const p = await L.open(); const pg = p.page;
  await buyFirst(pg);
  await pg.evaluate(() => prepScr()); const dep = 'button[onclick="p7Depart(this)"]'; await pg.waitForSelector(dep); await pg.waitForTimeout(500);
  await pg.click(dep); await pg.waitForSelector('.mmtalk');
  const seen = [];
  for (let i = 0; i < 20; i++) {
    await pg.waitForTimeout(150); let s = await talkState(pg); if (!s) break;
    if (!s.next) { await pg.click('.mmtalk'); await pg.waitForTimeout(60); s = await talkState(pg); }
    seen.push([s.name, s.side, s.text, s.img]);
    assert.equal(await pg.evaluate(() => S.m.raise.state), 'none', '会話中は育成を始めない');
    await pg.waitForTimeout(120); await pg.click('.mmtalk');
  }
  const tail = seen.slice(-2);
  assert.deepEqual(tail.map((x) => x.slice(0, 3)), [['フィナ', 'left', 'ダン、この子のことお願いしてもいい？'], ['ダン', 'right', 'ああ。こっちは任せてくれ。']]);
  assert.match(tail[1][3], /assets\/npc\/dan\/closeup\/smile\.png$/);
  assert.ok(seen.slice(0, -2).every((x) => x[0] === 'フィナ'), 'その前はフィナの確認会話');
  assert.equal(await pg.evaluate(() => document.querySelectorAll('.mmtalk, .mmtalk-fig').length), 0, '会話のDOMは残らない');
  await pg.waitForFunction((s) => document.querySelector(s).dataset.a === '1', dep);
  assert.equal(await pg.evaluate(() => S.m.raise.state), 'none');
  assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
});
