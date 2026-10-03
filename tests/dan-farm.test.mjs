// =========================================================
// ファームNPC「ダン」（旧「コウ」の表示を置き換え）
//  ・アップ画像のみ（closeup の6表情：normal・smile・guide・serious・troubled・happy）。小さい顔は立ち絵 normal から切り出した face.webp
//  ・会話は「フィナ ↔ ダン」が基本（ダンはプレイヤーへ直接語りかけない）。育成開始：フィナがプレイヤーへ確認 → 選択肢「始める／まだやめておく」→「始める」のときだけ同じ会話でフィナ→ダン → 出発
//  ・ファームの吹き出し・Chapter間ファームのダンの一言は、顔と名前をダンへ。システム通知（画面に渡す msg）には NPC の顔・名前を付けない
//  ・旧コウのデータ（NP.b・NPI.b・npi_b_kou.png）は互換のため残す
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
/** 可逆WebP（VP8L）の見出しを読む：形式・幅・高さ・透過の有無（2026-09-30：透過PNGから画素を変えずに変換） */
const webp = (p) => { const b = readFileSync(path.join(ROOT, p)); const v = b.readUInt32LE(21); return { sig: b.subarray(8, 12).toString(), type: b.subarray(12, 16).toString() + (b[20] === 0x2f && (v >>> 28) & 1 ? '+alpha' : ''), w: (v & 0x3fff) + 1, h: ((v >>> 14) & 0x3fff) + 1 }; };

test('DAN-1：ダンはファーム担当として、アップ画像（closeup）の6表情で登録。Chapterボードには置かない', () => {
  const M = loadNpc(), d = M.get('dan');
  assert.deepEqual([d.name, d.role, d.board, d.defaultView, d.defaultExpr], ['ダン', 'ファーム担当', false, 'closeup', 'normal']);
  assert.deepEqual([...M.expressionsOf('dan', 'closeup')], EXPR);
  assert.equal(M.imageOf('dan', 'closeup', 'smile').src, 'assets/npc/dan/closeup/smile.webp');
});

test('DAN-2：素材は透過PNG（RGBA）。立ち絵6枚は高さ760px（表示の最大380pxの2倍）、小さい顔は正方形。README に元画像との対応', () => {
  for (const e of EXPR) { const i = webp(`assets/npc/dan/closeup/${e}.webp`); assert.deepEqual([i.sig, i.type, i.w, i.h], ['WEBP', 'VP8L+alpha', 573, 760], e); }
  const f = webp('assets/npc/dan/face.webp'); assert.deepEqual([f.sig, f.type, f.w, f.h], ['WEBP', 'VP8L+alpha', 256, 256]);
  assert.match(readFileSync(path.join(ROOT, 'assets/npc/dan/README.md'), 'utf8'), /face\.webp/);
});

test('DAN-3：ダンの顔はダンが話す一言（ファームの吹き出し・Chapter間ファーム）だけ。メッセージ欄（ステータス・わざ・修行・準備・ショップ）はシステム通知なので顔なし', () => {
  assert.match(lineOf('const DAN_FACE='), /^const DAN_FACE="assets\/npc\/dan\/face\.webp";/);
  assert.equal((HTML.match(/\$\{DAN_FACE\}/g) || []).length, 2);
  assert.equal((HTML.match(/\$\{msg\?`<div class="dmsg"><span>\$\{msg\}<\/span><\/div>`:""\}/g) || []).length, 2, 'dscr・p7Shell のメッセージ欄は文字だけ');
  assert.doesNotMatch(HTML, /class="dmsg"><img/);

  assert.equal((HTML.replace(/^\s*\/\/.*$/gm, '').match(/NPI\.b/g) || []).length, 0, '画面から旧コウの顔を参照しない（コメントを除く）');
  const hall = HTML.slice(HTML.indexOf('function fmScr(msg){'), HTML.indexOf('\n// ---- Phase 8：育成中の画面遷移'));   // ファーム（正式デザイン。育成開始前・Chapter間・育成完了）
  assert.match(hall, /\$\{msg\?`<div class="kbub kt ksys">\$\{msg\}<\/div>`:""\}<div class="kbub kdan\$\{msg\?"":" kt"\}"><b>ダン<\/b><br>\$\{bcomm\(\)\}<\/div>/, 'ファーム：通知は名前なしの別のトースト。ダンの吹き出しはダンの一言だけ');
  assert.match(hall, /s=p\.querySelector\('\.ksys'\),b=p\.querySelector\('\.kdan'\);if\(s\)s\.remove\(\);/, '顔を押すとダンの吹き出し（通知は消す）');
  assert.match(hall, /aria-label="ダンのコメントを見る"><img src="\$\{DAN_FACE\}" alt="">/);
  const code = HTML.replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(code.slice(code.indexOf('function _hall('), code.indexOf('\nfunction after(')), /コウ/, 'ファームにコウの名前を出さない');
  assert.doesNotMatch(hall, /コウ/, 'ファーム（fmScr）にコウの名前を出さない');
});

test('DAN-4：旧コウのデータは互換のため残す（NP.b の名前とセリフ・NPI.b・assets/embedded/npi_b_kou.png）', () => {
  const NP = new Function(`${lineOf('const NP=')}\nreturn NP;`)();
  assert.equal(NP.b.n, 'コウ'); assert.equal(NP.b.t.length, 4);
  assert.match(lineOf('const NPI='), /,b:"assets\/embedded\/npi_b_kou\.png"\};$/);
  assert.ok(existsSync(path.join(ROOT, 'assets/embedded/npi_b_kou.png')));
});

test('DAN-5：セリフは DAN_TALK。育成開始はフィナ→ダン（左右で話者を分ける）。ファームの一言は落ち着いた口調（「〜ぜ！」・寿命・疲労なし）で、使う表情は登録済み', () => {
  const T = danTalk(), M = loadNpc();
  assert.deepEqual(T.handoff.map((l) => [l.npc, l.side, l.text]), [['fina', 'left', 'ダン、この子と一緒に行ってくるね！'], ['dan', 'right', 'ああ。準備はできてるな。気をつけて行ってこい。']]);
  for (const l of T.handoff) assert.ok(M.expressionsOf(l.npc, 'closeup').includes(l.expression), `${l.npc}:${l.expression}`);
  const all = [...T.farm, T.chapter(3), T.interval];
  assert.equal(T.chapter(3), '残り3ターンか。焦らずゴールを目指そう。');
  for (const s of all) assert.doesNotMatch(s, /ぜ！|寿命|疲労|ストレス|わよ/, s);
  assert.match(lineOf('function bcomm('), /^function bcomm\(\)\{const m=S\.m,st=window\.MMNPCE\?npcLine\("farm",null\):null;if\(st\)return st;const a=\[DAN_TALK\.farm\[R\(DAN_TALK\.farm\.length\)\]\];/, '旧コウのセリフ（NP.b.t）は使わない（2026-10-04：進行状態に合う一言＝MMNPCE が先）');
  assert.match(HTML, /finaTalk\(first\?"raiseFirst":"raiseAgain",\{start:DAN_TALK\.handoff\}\)\.then\(r=>\{delete b\.dataset\.fina;if\(r==="start"&&S\.m===m&&MMP7\.raiseState\(m\)=="none"\)p7Depart\(\)\}\)/, '「始める」のときだけ同じ会話で掛け合い → 従来の出発処理');
});

test('DAN-6：共通会話の選択肢：全文表示のあとに出て、本文のタップでは進まない。出てから0.35秒・直前のタップから0.4秒あけないと確定しない。選んだ続きを同じ会話で続け、選んだ id で終わる', () => {
  const M = loadNpc(); let clk = 0; const q = [];
  const mk = (branches) => { let ended; const c = M.createTalk([{ npc: 'fina', text: 'はじめる？', choices: [{ id: 'start', label: '始める' }, { id: 'cancel', label: 'やめる' }] }],
    { schedule: (fn) => { q.push(fn); return q.length; }, cancel: () => {}, now: () => clk, typeMs: 10, branches, onEnd: (ch) => { ended = ch; } }); return { c, ended: () => ended }; };
  const run = () => { while (q.length) q.shift()(); };
  clk = 0; let x = mk({ start: [{ npc: 'dan', text: 'ああ。' }] }); x.c.start();
  assert.equal(x.c.state().choices, null, '1文字ずつ表示中は選択肢を出さない');
  clk = 100; assert.equal(x.c.tap(), 'full'); assert.deepEqual(x.c.state().choices.map((c) => c.label), ['始める', 'やめる'], '全文表示のあとに選択肢');
  clk = 300; assert.equal(x.c.tap(), 'choice', '本文のタップでは進まない');
  clk = 450; assert.equal(x.c.choose('start'), 'ignored', '出てから0.35秒たっても、直前のタップから0.4秒未満なら確定しない（連打）');
  clk = 700; assert.equal(x.c.choose('start'), 'ignored', '押し続けている間は確定しない（押下ごとに間隔を測り直す）');
  clk = 1200; assert.equal(x.c.choose('nope'), 'ignored', '無い選択肢は無視');
  clk = 1700; assert.equal(x.c.choose('start'), 'next', '手を止めてから押すと確定し、続きへ');
  assert.equal(x.c.state().name, 'ダン'); assert.equal(x.c.state().choice, 'start'); run();
  clk = 1800; assert.equal(x.c.tap(), 'end'); assert.equal(x.ended(), 'start', '選んだ id で終わる');
  clk = 0; x = mk({}); x.c.start(); run(); clk = 300; assert.equal(x.c.state().choices.length, 2);
  assert.equal(x.c.choose('cancel'), 'ignored', '全文表示から0.35秒は無視'); clk = 800; assert.equal(x.c.choose('cancel'), 'end', '続きが無ければ会話を終える'); assert.equal(x.ended(), 'cancel');
  clk = 0; x = mk({}); x.c.start(); run(); x.c.end(); assert.equal(x.ended(), null, '選ばずに閉じたら null');
});

test('DAN-7：選択肢のボタンはネイビー・アイボリーの文字・アイボリーの細い罫線（2026-10-03）で、押しやすい高さ（44px 以上）。▼は選択肢を出している間は出さない', () => {
  const css = HTML.slice(HTML.indexOf('/* ===== 共通NPC会話（MMNPC'), HTML.indexOf('</style></head>'));
  assert.match(css, /\.mmtalk-choice\{[^}]*min-height:44px;[^}]*border:1px solid rgba\(240,232,212,\.7\);background:linear-gradient\(#1b2e5a,#0e1a38\);color:#f3ecd9;/);
  assert.match(readFileSync(path.join(ROOT, 'js/npc/npc.js'), 'utf8'), /nx\.hidden = s\.typing \|\| !!s\.choices;/);
});

// ---------------------------------------------------------
// 実ブラウザ
// ---------------------------------------------------------
const SKIP = H.skipReason();
let L;
test.before(async () => { if (!SKIP) L = await H.launch(); });
test.after(async () => { if (L) await L.close(); });
const talkState = (pg) => pg.evaluate(() => { const o = document.querySelector('.mmtalk:not(.mmtalk-out)'); if (!o) return null;
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

test('DAN-B1：ファーム：ダンの吹き出し（名前ダン・顔）。システム通知は名前・顔なし（ファームは別のトースト、ステータス・準備のメッセージ欄は文字だけ）', { skip: SKIP }, async () => {
  const p = await L.open(); const pg = p.page;
  await buyFirst(pg);
  await pg.evaluate(() => hall('t')); await pg.waitForSelector('.kdan'); await pg.waitForTimeout(300);
  assert.equal(await pg.evaluate(() => document.querySelector('.kdan b').textContent), 'ダン');
  assert.equal(await pg.evaluate(() => document.querySelectorAll('.ksys').length), 0, '通知が無ければダンの吹き出しだけ');
  assert.deepEqual(await imgOk(pg, '.kav img'), [['assets/npc/dan/face.webp', true]]);
  assert.equal(await pg.evaluate(() => document.querySelector('.kav').getAttribute('aria-label')), 'ダンのコメントを見る');
  assert.doesNotMatch(await H.text(pg), /コウ/);
  // 通知つき：名前なしの通知トースト。ダンの吹き出しは出していない。顔を押すと通知を消してダンの吹き出し
  await pg.evaluate(() => hall('t', 'テストの通知です。')); await pg.waitForSelector('.ksys'); await pg.waitForTimeout(300);
  assert.deepEqual(await pg.evaluate(() => { const s = document.querySelector('.ksys'); return [s.textContent, !!s.querySelector('b'), document.querySelector('.kdan').classList.contains('kt')]; }), ['テストの通知です。', false, false]);
  await pg.click('.kav'); await pg.waitForTimeout(200);
  assert.deepEqual(await pg.evaluate(() => [document.querySelectorAll('.ksys').length, document.querySelector('.kdan').classList.contains('kt')]), [0, true]);
  // メッセージ欄：文字だけ（顔なし）
  await pg.evaluate(() => hall('st', '並び順を変更しました。')); await pg.waitForSelector('.dmsg'); await pg.waitForTimeout(200);
  assert.deepEqual(await pg.evaluate(() => [document.querySelector('.dmsg').textContent, document.querySelectorAll('.dmsg img').length]), ['並び順を変更しました。', 0]);
  await pg.evaluate(() => prepScr('保管庫に入れました。')); await pg.waitForSelector('.dmsg'); await pg.waitForTimeout(200);
  assert.deepEqual(await pg.evaluate(() => [document.querySelector('.dmsg').textContent, document.querySelectorAll('.dmsg img').length]), ['保管庫に入れました。', 0]);
  assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
});

test('DAN-B2：育成開始：フィナの確認と選択肢。「まだやめておく」は何も始めず、掛け合いも出さない。「始める」のときだけ同じ会話でフィナ（左）→ダン（右・アップ画像）→ 出発。会話のDOMは残らない', { skip: SKIP }, async () => {
  const p = await L.open(); const pg = p.page;
  await buyFirst(pg);
  await pg.evaluate(() => prepScr()); const dep = 'button[onclick="p7Depart(this)"]'; await pg.waitForSelector(dep); await pg.waitForTimeout(500);
  await pg.evaluate(() => { window.__names = []; new MutationObserver(() => { const n = document.querySelector('.mmtalk-name'); if (n && n.textContent && window.__names.at(-1) !== n.textContent) window.__names.push(n.textContent); }).observe(document.body, { childList: true, subtree: true, characterData: true }); });
  // 1回目（初回）：説明＋確認 →「まだやめておく」
  await pg.click(dep); await pg.waitForSelector('.mmtalk');
  assert.equal(await H.chooseTalk(pg, 'cancel'), true);
  await pg.waitForFunction(() => !document.querySelector('.mmtalk'));
  assert.deepEqual(await pg.evaluate(() => window.__names), ['フィナ'], '「まだやめておく」ではダンは出ない');
  assert.equal(await pg.evaluate(() => S.m.raise.state), 'none');
  assert.equal(await pg.evaluate((s) => document.querySelector(s).dataset.a || '', dep), '', '2度押しの確認状態にしない');
  // 2回目：確認 →「始める」→ フィナ→ダン → 出発
  await pg.waitForTimeout(600); await pg.evaluate(() => { window.__names = []; });
  await pg.click(dep); await pg.waitForSelector('.mmtalk');
  assert.equal(await H.chooseTalk(pg, 'start'), true);
  const seen = [];
  for (let i = 0; i < 12; i++) {
    await pg.waitForTimeout(150); let s = await talkState(pg); if (!s) break;
    if (!s.next) { await pg.click('.mmtalk'); await pg.waitForTimeout(60); s = await talkState(pg); if (!s) break; }
    seen.push([s.name, s.side, s.text, s.img]);
    assert.equal(await pg.evaluate(() => S.m.raise.state), 'none', '掛け合いの間はまだ出発しない');
    await pg.waitForTimeout(120); await pg.click('.mmtalk');
  }
  assert.deepEqual(seen.map((x) => x.slice(0, 3)), [['フィナ', 'left', 'ダン、この子と一緒に行ってくるね！'], ['ダン', 'right', 'ああ。準備はできてるな。気をつけて行ってこい。']]);
  assert.match(seen[1][3], /assets\/npc\/dan\/closeup\/smile\.webp$/);
  await pg.waitForSelector('#brollbtn');
  assert.equal(await pg.evaluate(() => S.m.raise.state), 'board', '掛け合いのあと出発');
  assert.equal(await pg.evaluate(() => document.querySelectorAll('.mmtalk, .mmtalk-fig, .mmtalk-choice').length), 0, '会話のDOMは残らない');
  assert.equal(await pg.evaluate(() => document.querySelectorAll('img[src*="npc/"]').length), 0, 'ボードにNPCはいない');
  assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
});
