// =========================================================
// 特訓NPC「ゲンシン」（5種類すべての特訓を1人で担当する指導役）
//  ・アップ画像のみ（closeup の6表情：normal・smile・guide・serious・strict・praise）。小さい顔は立ち絵 normal から切り出した face.png
//  ・特訓メニューの一言（.gssay）、特訓ボードの開始（出目を振る前）とゴールの一言（.gssay.over＝特訓場の背景の上。ボードの位置は動かさない）
//  ・チケット・能力の上昇・技・回数・条件・ゴールの処理の文はシステム表示のまま（顔・名前なし）。特訓のロジックは変えない
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
const EXPR = ['normal', 'smile', 'guide', 'serious', 'strict', 'praise'];
const KINDS = ['po', 'in', 'hi', 'ev', 'de'];
function loadNpc() { const ctx = { console }; ctx.window = ctx; vm.createContext(ctx); vm.runInContext(readFileSync(path.join(ROOT, 'js/npc/npc.js'), 'utf8'), ctx); return ctx.MMNPC; }
const lineOf = (s) => HTML.split('\n').find((l) => l.startsWith(s));
const talk = () => { const i = HTML.indexOf('const GENSHIN_TALK={'); return new Function(`return ${HTML.slice(i + 'const GENSHIN_TALK='.length, HTML.indexOf('};', i) + 1)}`)(); };
const png = (p) => { const b = readFileSync(path.join(ROOT, p)); return { sig: b.subarray(1, 4).toString(), w: b.readUInt32BE(16), h: b.readUInt32BE(20), type: b[25] }; };

test('GEN-1：ゲンシンは特訓の指導役として、アップ画像（closeup）の6表情で登録。ほかのNPCはそのまま', () => {
  const M = loadNpc(), g = M.get('genshin');
  assert.deepEqual([g.name, g.role, g.board, g.defaultView, g.defaultExpr], ['ゲンシン', '特訓の指導役', false, 'closeup', 'normal']);
  assert.deepEqual([...M.expressionsOf('genshin', 'closeup')], EXPR);
  assert.equal(M.imageOf('genshin', 'closeup', 'praise').src, 'assets/npc/genshin/closeup/praise.png');
  assert.deepEqual(['dan', 'nick', 'karen', 'cedric', 'elliot', 'vargas', 'fina'].map((k) => M.get(k).name), ['ダン', 'ニック', 'カレン', 'セドリック', 'エリオット', 'ヴァルガス', 'フィナ']);
});

test('GEN-2：素材は透過PNG（RGBA）。立ち絵6枚は 573×760、小さい顔は 256×256。README に元画像との対応・透明化の方法・表情名が仮であること', () => {
  for (const e of EXPR) { const i = png(`assets/npc/genshin/closeup/${e}.png`); assert.deepEqual([i.sig, i.type, i.w, i.h], ['PNG', 6, 573, 760], e); }
  const f = png('assets/npc/genshin/face.png'); assert.deepEqual([f.sig, f.type, f.w, f.h], ['PNG', 6, 256, 256]);
  const md = readFileSync(path.join(ROOT, 'assets/npc/genshin/README.md'), 'utf8');
  assert.match(md, /画像内容から決めた仮名・要確認/); assert.match(md, /市松模様/);
  for (const e of EXPR) assert.ok(md.includes(`closeup/${e}.png`), e);
});

test('GEN-3：一言は GENSHIN_TALK（メニュー・5種類それぞれの開始・ゴール）。短く落ち着いた口調。怒鳴り・熱血・軽い言い方・古風な武人語・大げさな褒め方はしない。システムの内容（チケット・上昇量・技）を話さない', () => {
  const T = talk();
  assert.deepEqual(T.menu, ['準備はいいか。', '焦るな。ひとつずつだ。', '今のお前たちなら、まだ伸びる。']);
  assert.deepEqual(Object.keys(T.start), KINDS, '5種類すべてにゲンシンの開始の一言（特訓ごとに別のNPCはいない）');
  assert.deepEqual(T.done, ['悪くない。その調子だ。', '今の感覚を忘れるな。', '今日はここまでだ。よくやった。']);
  for (const s of [...T.menu, ...Object.values(T.start), ...T.done]) {
    assert.ok(s.length <= 20, `短く：${s}`);
    assert.doesNotMatch(s, /！|根性|だぜ|ぜ。|でござる|拙者|じゃ。|なのだ|すごい|最高|チケット|上がった|覚えた|[0-9０-９]/, s);
  }
  assert.match(lineOf('const GENSHIN_FACE='), /^const GENSHIN_FACE="assets\/npc\/genshin\/face\.png";/);
});

test('GEN-4：表示場所は特訓メニューと特訓ボード（開始・ゴール）だけ。システム表示（開始・上昇・ゴールの文）は変えず、ゲンシンの顔・名前を付けない。特訓のロジックには入れない', () => {
  assert.match(lineOf('function gsSay('), /^function gsSay\(t,over\)\{return `<div class="gssay\$\{over\?" over":""\}"><img src="\$\{GENSHIN_FACE\}" alt=""><div class="tx"><b>ゲンシン<\/b>\$\{t\}<\/div><\/div>`\}$/);
  const menu = HTML.slice(HTML.indexOf('function p7TrainMenu('), HTML.indexOf('\nfunction trStart('));
  assert.ok(menu.includes(' let h=gsSay(GENSHIN_TALK.menu[R(GENSHIN_TALK.menu.length)])+`<div class="dnote">特訓は15マスの一本道。'));
  const tr = HTML.slice(HTML.indexOf('function trScr(msg,done){'), HTML.indexOf('\nlet p7Busy=false;'));
  assert.ok(tr.includes('${done?gsSay(GENSHIN_TALK.done[R(GENSHIN_TALK.done.length)],1):run&&run.pos==0&&!Number.isInteger(run.roll)?gsSay(GENSHIN_TALK.start[K],1):""}<div class="p12plq">'), '特訓場の背景の上（ボードの位置は動かさない）');
  assert.ok(tr.includes('<div class="bmsg" id="p7msg">${msg||"サイコロを振って進もう！"}</div>'), 'システム表示の欄はそのまま');
  assert.equal(lineOf('function trStart('), 'function trStart(k){const r=MMP7.startTraining(S,S.m,k);if(!r.ok)return hall("s","特訓を始められません。"+(P7_WHY[r.reason]||""));save();trScr(`${LAB[k]}特訓スタート！（特訓チケットを1枚使った）サイコロを振って進もう。`)}');
  const roll = HTML.slice(HTML.indexOf('async function trRoll('), HTML.indexOf('\n// ---- 出発準備'));
  assert.doesNotMatch(roll, /gsSay|GENSHIN|ゲンシン/, '出目・上昇・ゴールの処理と文はそのまま');
  assert.equal((HTML.match(/gsSay\(/g) || []).length, 4, '定義＋メニュー1か所＋ボード2か所');
  const P7 = readFileSync(path.join(ROOT, 'js/phase7/progression.js'), 'utf8');
  assert.doesNotMatch(P7, /genshin|ゲンシン/i, '特訓のロジック（progression.js）には入れない');
  const fight = HTML.slice(HTML.indexOf('async function fight('), HTML.indexOf('\n$("#snd").textContent'));
  assert.doesNotMatch(fight, /GENSHIN|gsSay|ゲンシン/, 'Phase 6（fight()）には入れない');
});

// ---------------------------------------------------------
// 実ブラウザ
// ---------------------------------------------------------
const SKIP = H.skipReason();
let L = null;
test.before(async () => { if (!SKIP) L = await H.launch(); });
test.after(async () => { if (L) await L.close(); });
const LOG1 = { ch: 1, reachedGoal: true, turnsUsed: 14, turnLimit: 20, declined: false, tour: { rank: 0, place: 1, won: true, firstClear: true } };
async function atFarm(size) {
  const p = await L.open({ size }); const pg = p.page;
  await H.newGame(pg, 'テスト'); await pg.evaluate(() => adopt(0, 'ソラ'));
  await pg.evaluate((LOG1) => { Object.assign(S.m.raise, { state: 'farm', ch: 2, node: null, turnsUsed: 0, turnLimit: null, pend: null, goal: false, tour: null, battle: null, trainRun: null, log: [LOG1] });
    MMP7.ensureProg(S.m); S.m.prog.rankClr = [true, true, true, false, false, false]; S.trainTix = 7; save(); hall('s'); }, LOG1);
  await pg.waitForSelector('.gssay'); return p;
}
const gs = (pg) => pg.evaluate(() => [...document.querySelectorAll('.gssay')].map((e) => { const i = e.querySelector('img');
  return { over: e.classList.contains('over'), name: e.querySelector('b').textContent, ok: i.complete && i.naturalWidth > 0, src: i.getAttribute('src'), text: e.querySelector('.tx').textContent.replace(/^ゲンシン/, '') }; }));
const waitImg = (pg) => pg.waitForFunction(() => [...document.querySelectorAll('.gssay img')].every((i) => i.complete && i.naturalWidth > 0));
/** 特訓をゴールまで進める（出目の決定だけ固定。進む処理・上昇・ゴールの処理は本物） */
async function toGoal(pg) {
  await pg.evaluate(() => { const r = MMP7.trainRunOf(S.m); r.pos = 14; r.roll = 1; save(); trRoll(); });
  await pg.waitForFunction(() => !p7Busy && !MMP7.trainRunOf(S.m) && !!document.querySelector('#p7msg'));
}

test('GEN-B1：5種類すべて（丈夫さは2回）で、特訓メニュー・開始・ゴールにゲンシンの名前・顔・一言。チケット・回数・システムの文は従来どおり', { skip: SKIP }, async () => {
  const p = await atFarm(H.SIZES.base); const pg = p.page; const T = await pg.evaluate(() => GENSHIN_TALK);
  for (const [n, k] of [...KINDS, 'de'].entries()) {
    await pg.evaluate(() => hall('s')); await pg.waitForSelector('.gssay'); await waitImg(pg);
    let g = await gs(pg);
    assert.equal(g.length, 1); assert.deepEqual([g[0].over, g[0].name, g[0].ok, g[0].src], [false, 'ゲンシン', true, 'assets/npc/genshin/face.png']);
    assert.ok(T.menu.includes(g[0].text), g[0].text);
    assert.equal(await pg.evaluate(() => /ゲンシン/.test(document.querySelector('.dnote').textContent)), false, 'メニューの説明はシステム表示のまま');
    const tix0 = await pg.evaluate(() => S.trainTix);
    await pg.evaluate((k) => trStart(k), k); await pg.waitForSelector('.p12tr .gssay.over'); await waitImg(pg);
    g = await gs(pg);
    assert.deepEqual(g.map((x) => [x.over, x.name, x.ok, x.text]), [[true, 'ゲンシン', true, T.start[k]]], `${k}：開始の一言`);
    const lab = await pg.evaluate((k) => LAB[k], k);
    assert.equal(await pg.evaluate(() => document.querySelector('#p7msg').textContent), `${lab}特訓スタート！（特訓チケットを1枚使った）サイコロを振って進もう。`, 'システムの文は従来どおり（ゲンシンの発言にしない）');
    assert.equal(await pg.evaluate(() => S.trainTix), tix0 - 1, 'チケットは1枚だけ減る（従来どおり）');
    await toGoal(pg); await waitImg(pg);
    g = await gs(pg);
    assert.equal(g.length, 1); assert.ok(g[0].over && T.done.includes(g[0].text), g[0].text);
    assert.match(await pg.evaluate(() => document.querySelector('#p7msg').textContent), /^1マス進んだ。 ゴール！/, 'ゴールの文はシステム表示');
    assert.equal(await pg.evaluate((k) => S.m.prog.train[k], k), k === 'de' && n === 5 ? 2 : 1, '特訓の回数は従来どおり（丈夫さは2回まで）');
  }
  // 途中（出目を振った後）はボードの上にゲンシンを出さない
  await pg.evaluate(() => { S.trainTix = 1; S.m.prog.train.po = 0; save(); trStart('po'); }); await pg.waitForSelector('.p12tr .gssay.over');
  await pg.evaluate(() => { const r = MMP7.trainRunOf(S.m); r.roll = 1; save(); trRoll(); }); await pg.waitForFunction(() => !p7Busy && MMP7.trainRunOf(S.m).pos === 1);
  assert.equal(await pg.evaluate(() => document.querySelectorAll('.gssay').length), 0, '特訓の途中は出さない（画面を狭くしない）');
  assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, [], '404なし');
  await p.ctx.close();
});

test('GEN-B2：4つの画面サイズで、特訓メニュー・開始・ゴールのゲンシンの吹き出しが画面に収まり、横にはみ出さない', { skip: SKIP }, async () => {
  for (const size of Object.values(H.SIZES)) {
    const p = await atFarm(size); const pg = p.page; const tag = size.join('×');
    const check = async (label) => { await waitImg(pg); const r = await pg.evaluate(() => ({ sw: document.documentElement.scrollWidth, W: innerWidth,
      inside: [...document.querySelectorAll('.gssay')].every((e) => { const b = e.getBoundingClientRect(); return b.left >= -1 && b.right <= innerWidth + 1; }) }));
      assert.ok(r.inside, `${tag} ${label}：吹き出しが画面内`); assert.ok(r.sw <= r.W + 1, `${tag} ${label}：横にはみ出さない（${r.sw}/${r.W}）`); };
    await check('メニュー');
    await pg.evaluate(() => trStart('hi')); await pg.waitForSelector('.p12tr .gssay.over'); await check('開始');
    const stage = await pg.evaluate(() => { const s = document.querySelector('.p12stage').getBoundingClientRect(), g = document.querySelector('.gssay.over').getBoundingClientRect(), q = document.querySelector('.p12plq').getBoundingClientRect();
      return { inStage: g.top >= s.top && g.bottom <= s.bottom, abovePlaque: g.bottom <= q.top + 1 }; });
    assert.deepEqual(stage, { inStage: true, abovePlaque: true }, `${tag}：特訓場の背景の中、名札より上`);
    await toGoal(pg); await check('ゴール');
    assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
    await p.ctx.close();
  }
});
