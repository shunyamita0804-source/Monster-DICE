// =========================================================
// 研究所NPC「エリオット」（研究所の案内・研究・解析を担当する研究者）
//  ・アップ画像のみ（closeup の6表情：normal・smile・guide・thinking・curious・serious）。小さい顔は立ち絵 normal から切り出した face.webp
//  ・研究所（museum()）の図鑑一覧と、図鑑の詳細（musd(i)）に、顔・名前つきの短い一言（ELLIOT_TALK）。会話ウィンドウは開かない
//  ・図鑑の見出し・「近日公開」などのシステム表示はエリオットの発言にしない。図鑑の中身・研究所の背景（base64 の AS.*）は変えない
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
const EXPR = ['normal', 'smile', 'guide', 'thinking', 'curious', 'serious'];
function loadNpc() { const ctx = { console }; ctx.window = ctx; vm.createContext(ctx); vm.runInContext(readFileSync(path.join(ROOT, 'js/npc/npc.js'), 'utf8'), ctx); return ctx.MMNPC; }
const lineOf = (s) => HTML.split('\n').find((l) => l.startsWith(s));
const elliotTalk = () => { const i = HTML.indexOf('const ELLIOT_TALK={'); return new Function(`return ${HTML.slice(i + 'const ELLIOT_TALK='.length, HTML.indexOf('};', i) + 1)}`)(); };
/** 可逆WebP（VP8L）の見出しを読む：形式・幅・高さ・透過の有無（2026-09-30：透過PNGから画素を変えずに変換） */
const webp = (p) => { const b = readFileSync(path.join(ROOT, p)); const v = b.readUInt32LE(21); return { sig: b.subarray(8, 12).toString(), type: b.subarray(12, 16).toString() + (b[20] === 0x2f && (v >>> 28) & 1 ? '+alpha' : ''), w: (v & 0x3fff) + 1, h: ((v >>> 14) & 0x3fff) + 1 }; };

test('ELI-1：エリオットは研究所の研究者として、アップ画像（closeup）の6表情で登録。Chapterボードには置かない', () => {
  const M = loadNpc(), e = M.get('elliot');
  assert.deepEqual([e.name, e.role, e.board, e.defaultView, e.defaultExpr], ['エリオット', '研究所の研究者', false, 'closeup', 'normal']);
  assert.deepEqual([...M.expressionsOf('elliot', 'closeup')], EXPR);
  assert.equal(M.imageOf('elliot', 'closeup', 'curious').src, 'assets/npc/elliot/closeup/curious.webp');
  assert.deepEqual(['dan', 'nick', 'karen', 'cedric', 'fina'].map((k) => M.get(k).name), ['ダン', 'ニック', 'カレン', 'セドリック', 'フィナ'], 'ほかのNPCはそのまま');
});

test('ELI-2：素材は透過PNG（RGBA）。立ち絵6枚は 573×760、小さい顔は 256×256。README に元画像との対応・透明化の方法・表情名が仮であること', () => {
  for (const e of EXPR) { const i = webp(`assets/npc/elliot/closeup/${e}.webp`); assert.deepEqual([i.sig, i.type, i.w, i.h], ['WEBP', 'VP8L+alpha', 573, 760], e); }
  const f = webp('assets/npc/elliot/face.webp'); assert.deepEqual([f.sig, f.type, f.w, f.h], ['WEBP', 'VP8L+alpha', 256, 256]);
  const md = readFileSync(path.join(ROOT, 'assets/npc/elliot/README.md'), 'utf8');
  assert.match(md, /画像内容から決めた仮名・要確認/); assert.match(md, /face\.webp/);
  for (const e of EXPR) assert.ok(md.includes(`closeup/${e}.webp`), e);
});

test('ELI-3：一言は ELLIOT_TALK。柔らかい敬語。博士口調（なのだ・であるぞ）・偉そうな言い方・ほかのNPCの口調は使わない', () => {
  const T = elliotTalk();
  assert.deepEqual(T, {
    lab: ['こんにちは。何を調べてみましょうか。', '図鑑の記録も、少しずつ埋まってきましたね。', '気になる子がいたら、記録を見てみましょう。'],
    book: ['こちらの記録も確認してみましょう。', '興味深い子ですね。記録を見てみましょう。'] });
  for (const s of [...T.lab, ...T.book]) {
    assert.doesNotMatch(s, /なのだ|であるぞ|じゃ。|だな|だぜ|わよ|任せ/, s);
    assert.match(s, /(ます|ましょう|ましょうか|ですね|ましたね)[。？]$/, `敬語：${s}`);
  }
  assert.match(lineOf('const ELLIOT_FACE='), /^const ELLIOT_FACE="assets\/npc\/elliot\/face\.webp";/);
});

test('ELI-4：表示場所は研究所の図鑑一覧（museum）と図鑑の詳細（musd）だけ。図鑑の中身・背景（AS.*）・入口の制限（p8Blocked）・関数名は従来どおり', () => {
  assert.match(lineOf('function elSay('), /^function elSay\(t\)\{return `<div class="elsay"><img src="\$\{ELLIOT_FACE\}" alt=""><div class="tx"><b>エリオット<\/b>\$\{t\}<\/div><\/div>`\}$/);
  const mu = lineOf('function museum(') + HTML.split('\n')[HTML.split('\n').findIndex((l) => l.startsWith('function museum(')) + 1];
  assert.ok(mu.startsWith('function museum(){if(p8Blocked())return;bgm("market");'), '研究所の入口の制限はそのまま');
  assert.ok(mu.includes('<div class="dbg" style="background-image:url(${AS.mkt})"></div>'), '背景（base64 の AS.mkt）はそのまま');
  assert.ok(mu.includes('<small>出会えるモンスターの記録</small></div></div><div class="dbody">${elSay(ELLIOT_TALK.lab[R(ELLIOT_TALK.lab.length)])}<div class="mgrid">'));
  assert.ok(mu.includes('<span>ノビトン</span><small>近日公開</small>'), '「近日公開」（ロック表示）はシステム表示のまま');
  const md = lineOf('function musd(');
  assert.ok(md.startsWith('function musd(i){if(p8Blocked())return;'));
  assert.ok(md.includes('<div class="mush">No.${String(i+1).padStart(3,"0")}　${SP[i][0]}</div>${elSay(ELLIOT_TALK.book[R(ELLIOT_TALK.book.length)])}<img class="pcard" src="${AS[AK[i]+"L"]}"'));
  assert.ok(md.includes('<img class="pcard" src="${AS[AK[i]+"R"]}"'), 'プロフィールカード（base64 の AS.*L／AS.*R）はそのまま');
  assert.equal((HTML.match(/elSay\(/g) || []).length, 3, '定義＋2か所だけ');
  for (const f of ['function farm(', 'function market(', 'function _hall(', 'function p9TourResult(']) {
    const i = HTML.indexOf(f); assert.doesNotMatch(HTML.slice(i, HTML.indexOf('\nfunction ', i + 10)), /elSay|ELLIOT/, `${f} には出さない`);
  }
  const fight = HTML.slice(HTML.indexOf('async function fight('), HTML.indexOf('\n$("#snd").textContent'));
  assert.doesNotMatch(fight, /ELLIOT|elSay|エリオット/, 'Phase 6（fight()）には入れない');
});

// ---------------------------------------------------------
// 実ブラウザ
// ---------------------------------------------------------
const SKIP = H.skipReason();
let L = null;
test.before(async () => { if (!SKIP) L = await H.launch(); });
test.after(async () => { if (L) await L.close(); });
const say = (pg) => pg.evaluate(() => [...document.querySelectorAll('.elsay')].map((c) => { const i = c.querySelector('img');
  return { name: c.querySelector('b').textContent, src: i.getAttribute('src'), ok: i.complete && i.naturalWidth > 0, text: c.querySelector('.tx').textContent.replace(/^エリオット/, '') }; }));
const waitImgs = (pg) => pg.waitForFunction(() => [...document.querySelectorAll('.elsay img,.pcard')].every((i) => i.complete && i.naturalWidth > 0));
const fit = (pg) => pg.evaluate(() => ({ sw: document.documentElement.scrollWidth, W: innerWidth,
  inside: [...document.querySelectorAll('.elsay')].every((c) => { const r = c.getBoundingClientRect(); return r.left >= -1 && r.right <= innerWidth + 1; }) }));

test('ELI-B1：研究所：図鑑一覧と詳細（ソラモ・ガウル）にエリオットの名前・顔・一言。図鑑の中身・「近日公開」・戻る操作は従来どおり', { skip: SKIP }, async () => {
  const p = await L.open(); const pg = p.page; const T = await pg.evaluate(() => ELLIOT_TALK);
  await H.newGame(pg, 'テスト');
  await pg.click('.hz[onclick="museum()"]', { force: true }); await pg.waitForSelector('.mgrid'); await waitImgs(pg);
  let s = await say(pg);
  assert.equal(s.length, 1); assert.deepEqual([s[0].name, s[0].src, s[0].ok], ['エリオット', 'assets/npc/elliot/face.webp', true]);
  assert.ok(T.lab.includes(s[0].text), s[0].text);
  const grid = await pg.evaluate(() => [...document.querySelectorAll('.mgc')].map((b) => b.innerText.replace(/\s+/g, ' ').trim()));
  assert.deepEqual(grid, ['No.001 ソラモ', 'No.002 ガウル', '？ No.003 ノビトン 近日公開'], '図鑑の中身は従来どおり');
  assert.equal(await pg.evaluate(() => [...document.querySelectorAll('.mgc.lk')].some((e) => e.querySelector('.elsay') || /エリオット/.test(e.textContent))), false, 'ロック表示にエリオットは付かない');
  for (const i of [0, 1]) {
    await pg.click(`.mgc[onclick="musd(${i})"]`); await pg.waitForSelector('.mk2 .pcard'); await waitImgs(pg);
    s = await say(pg);
    assert.equal(s.length, 1); assert.ok(s[0].ok); assert.ok(T.book.includes(s[0].text), s[0].text);
    assert.equal(await pg.evaluate(() => document.querySelectorAll('.mk2 .pcard').length), 2, 'プロフィールカード2枚はそのまま');
    assert.match(await pg.evaluate(() => document.querySelector('.mush').textContent), new RegExp(`No\\.00${i + 1}`));
    await pg.click('.mk2 .dback.wide'); await pg.waitForSelector('.mgrid');
  }
  await pg.click('.dtop .dback'); await pg.waitForSelector('.hz[onclick="museum()"]');
  assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, [], '404なし');
  await p.ctx.close();
});

test('ELI-B2：4つの画面サイズで、研究所の一覧・詳細のエリオットの吹き出しが画面に収まり、横にはみ出さない', { skip: SKIP }, async () => {
  for (const size of Object.values(H.SIZES)) {
    const p = await L.open({ size }); const pg = p.page; const tag = size.join('×');
    await H.newGame(pg, 'テスト');
    await pg.evaluate(() => museum()); await pg.waitForSelector('.mgrid'); await waitImgs(pg);
    let r = await fit(pg); assert.ok(r.inside, `${tag} 一覧：吹き出しが画面内`); assert.ok(r.sw <= r.W + 1, `${tag} 一覧：横にはみ出さない（${r.sw}/${r.W}）`);
    await pg.evaluate(() => musd(0)); await pg.waitForSelector('.mk2 .pcard'); await waitImgs(pg);
    r = await fit(pg); assert.ok(r.inside, `${tag} 詳細：吹き出しが画面内`); assert.ok(r.sw <= r.W + 1, `${tag} 詳細：横にはみ出さない（${r.sw}/${r.W}）`);
    assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
    await p.ctx.close();
  }
});
