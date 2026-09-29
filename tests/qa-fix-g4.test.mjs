// =========================================================
// QA 修正 G4：モンスター名（プレイヤーが入力した文字）を HTML ではなく文字として表示する（index.html）
//  ・市場の購入シート（#mnm）で付けた名前・合体で生まれた名前・セーブコード／スロットから読み込んだ名前は、
//    画面に出すところ（innerHTML／テンプレート文字列）で共通の p11Esc（プレイヤー名と同じ）を通して表示する
//    - 街（モンスターカード・メッセージ）、牧場（預ける・受け取る・合体・売る）、セーブ画面のスロット表示、
//      ファーム（ステータス・育成完了の表示）、Chapter間ファーム、大会（次の相手・順位表・星取表）、VS画面、
//      育成完了画面、育成放棄の確認
//  ・保存する名前は変えない（入力できる文字も制限しない）。ふつうの名前（< > & " ' を含まない）は見た目も同じ
//  ・fight() の中（Phase 6 保護対象）と、fight() からだけ呼ぶバトル開始演出 intro() は変えていない（要判断として報告）
//  守ること：以前は名前「<!--」で街の「セーブ・ロード」、Chapter間ファームのコマンド（出発・中断・育成放棄）、
//  大会の「対戦へ」、育成完了画面の「牧場へ」などが消えて進めなくなり（再読込でも直らない）、
//  セーブコードの名前「<img src=x onerror=…>」でスクリプトが動いていた。
//  価格・報酬・文言・見た目・セーブ version 6／キー mr4v6／checkpoint形式、Phase 6 保護対象は変えていない。
// =========================================================
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as H from './e2e/harness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const rd = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const HTML = rd('index.html');
// 本番（index.html）と同じ順で読み込む
const SRC = ['js/phase7/progression.js', 'js/phase8/league.js', 'js/phase8/raising.js', 'js/phase10/monsters.js', 'js/phase11/player.js', 'js/phase9/chapters.js'].map(rd);
function load() {
  const w = {}; for (const s of SRC) new Function('window', s)(w);
  for (const c of w.MMP9C.CHAPTERS) w.MMP7.registerChapterBoard(c.no, c.track, { provisional: false });
  w.MMP8L.setSpeciesCount(2);
  return { P7: w.MMP7, P8: w.MMP8, M: w.MMP10M };
}
const j = (o) => JSON.parse(JSON.stringify(o));
const lineOf = (prefix) => { const l = HTML.split('\n').find((x) => x.startsWith(prefix)); if (!l) throw new Error('抽出失敗: ' + prefix); return l; };
const between = (a, b) => { const i = HTML.indexOf(a), k = HTML.indexOf(b, i + a.length); if (i < 0 || k < 0) throw new Error('抽出失敗: ' + a); return HTML.slice(i, k); };
const ESC = lineOf('function p11Esc(t){');

// 試す名前（購入シートは8文字まで。セーブコードからは長さの制限なし）
const CM = '<!--';                                 // 後ろの画面（ボタン）をコメントにして消していた
const BOLD = '<b>X</b>';                           // 名前がタグとして効いていた
const XSS = '"><img src=x onerror=alert(1)>';      // 属性を閉じて画像タグ（スクリプト）を入れる
const XSS8 = XSS.slice(0, 8);                      // 購入シートで入力したとき（8文字まで）＝ '"><img s'
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function mon(over = {}) {
  return { sp: 0, name: 'ソラモ', age: 0, span: 30, h: 0, rk: 0, fa: 0, st: 0, last: null, li: 100, po: 100, in: 100, hi: 100, ev: 100, de: 100,
    sk: [0, 1, 2, 3], eq: [0, 1, 2, 3, -1, -1], ...over };
}
const GAURU = { sp: 1, name: 'ガウル', li: 80, po: 110, in: 110, hi: 90, ev: 90, de: 60, sk: [10, 11, 12, 13], eq: [10, 11, 12, 13, -1, -1] };
/** 街：未育成の個体を連れ、牧場に未育成のガウル（ゲームの処理で作った正しいセーブ。フィナの会話は表示済み） */
function town({ P7, P8 }, name = 'ソラモ', g = 5000) {
  const S = P8.newSave(); S.g = g; S.playerName = 'テスト'; delete S.playerNamePending; S.npcFlags = { finaIntro: 1, raiseIntro: 1 };
  S.m = P8.initIndividual(S, P7.initProgForNew(mon({ name })));
  S.box = [P8.initIndividual(S, P7.initProgForNew(mon(GAURU)))];
  return S;
}
function onBoard(M, name) { const S = town(M, name); assert.equal(M.P8.depart(S, S.m).ok, true); return S; }
/** Chapter 1 を終えた Chapter間ファーム */
function atFarm(M, name) { const S = onBoard(M, name); S.m.raise.turnsUsed = 20; assert.equal(M.P8.endChapter(S, S.m).ok, true); S.trainTix = 3; return S; }
/** Chapter 1 のゴールで公式ランクE大会に参加した直後（第1試合の前） */
function inTour(M, name) {
  const S = onBoard(M, name); S.m.raise.goal = true;
  assert.equal(M.P8.startTournament(S, S.m, 0, 12345).ok, true); assert.equal(M.P8.boardPhase(S.m), 'tour');
  return S;
}

// ---------------------------------------------------------
// index.html の実物のコード
// ---------------------------------------------------------
test('QA-G4-1：共通の p11Esc は < > & " \' を文字参照にする。ふつうの名前はそのまま', () => {
  const e = new Function(`${ESC}\nreturn p11Esc;`)();
  assert.equal(e(CM), '&lt;!--'); assert.equal(e(BOLD), '&lt;b&gt;X&lt;/b&gt;');
  assert.equal(e(XSS), '&quot;&gt;&lt;img src=x onerror=alert(1)&gt;'); assert.equal(e(`a&b'c`), 'a&amp;b&#39;c');
  for (const n of ['ソラモ', 'ガウル', 'ソラガウ', 'Sora 2', 'ｿﾗﾓ★']) assert.equal(e(n), n, 'ふつうの名前は変わらない');
  assert.equal(e(undefined), 'undefined', '名前が無い旧データも従来の表示（${undefined}）と同じ');
});

test('QA-G4-2：モンスター名を画面に出すところ（fight()・バトル開始演出を除く）は、すべて p11Esc を通す', () => {
  // 守ること：以前は m.name・x.name などをそのまま innerHTML に入れていた（23か所）。今後の追加でも素通しにしない
  const skip = [['async function fight(', '\n$("#snd").textContent'], ['async function intro(pl){', '\nasync function fight('], ['const leg=A=>', '\nfunction skb(']]
    .map(([a, b]) => { const i = HTML.indexOf(a), k = HTML.indexOf(b, i + a.length); assert.ok(i > 0 && k > i, a); return [i, k]; });
  let code = '';
  for (let i = 0; i < HTML.length; ) { const n = HTML.indexOf('\n', i), e = n < 0 ? HTML.length : n + 1; if (!skip.some(([a, b]) => i >= a && i < b) && e - i < 50000) code += HTML.slice(i, e); i = e; }   // 画像データの長い行は除く
  const ALLOW = [
    /p11Esc\((?:[A-Za-z_$][\w$]*\.)+name\)/g,                     // 文字として表示（m.name・x.name・S.m.name・d.m.name など）
    /\$\{s\.name\}/g, /MMP10M\.byKey\(c\.key\)\.name/g, /\(MMP10M\.byId\(x\.sp\)\|\|\{\}\)\.name/g,   // 種族の正式データ（MMP10M）
    /\$\{T\.name\}/g, /d\?d\.name:it\.id/g, /\$\{d\.name\}<small>/g,   // 修行場・アイテムの定義
    /if\(x\.name=="ハヤテ"\)x\.name="ガウル"/g,                       // 旧セーブの名前の移行（表示ではない）
    /if\(nm\)x\.name=nm;/g, /c\.name=cname\(a,b\);/g, /a\.name\.slice\(0,2\)\+b\.name\.slice\(-2\)/g,   // 名前を付ける（保存する名前はそのまま）
    /name:v\.name,/g, /e\.player\?S\.m\.name:String\(e\.name\)/g,    // 大会の表示データ（表示するところで p11Esc）
  ];
  for (const re of ALLOW) code = code.replace(re, '');
  const left = [...code.matchAll(/.{0,50}\.name\b.{0,30}/g)].map((m) => m[0]);
  assert.deepEqual(left, [], '素通しのモンスター名が残っていない');
  // 名前から作った文字列も、表示するところで p11Esc を通す
  assert.match(HTML, /<b>生まれるモンスター：\$\{p11Esc\(cname\(a,c\)\)\}<\/b>/);
  assert.match(HTML, /<span class="nm">\$\{p11Esc\(p9Short\(lg,e\.id\)\)\}<\/span>/);
  assert.doesNotMatch(HTML, /\$\{(cname|p9Short)\(/, 'cname・p9Short の結果をそのまま入れない');
  // Phase 6 保護対象（fight()）は変えていない（P7-31 と同じハッシュ）
  assert.doesNotMatch(between('async function fight(', '\n$("#snd").textContent'), /p11Esc/);
});

test('QA-G4-3：モンスターカード・合体の枠・ステータス・セーブスロットの表示で、名前は文字のまま（ふつうの名前は以前と同じ表示）', () => {
  const env = new Function('msv', 'MMP8', `const KS=["li"],LAB={li:"ライフ"},RN=["E","D","C","B","A","S"];${ESC}\n${lineOf('const mcard=')}\n${lineOf('const slot=')}\n${lineOf('const stat=')}\n${lineOf('const slab=')}\nreturn {mcard,slot,stat,slab};`)(() => '<i class="mv"></i>', { rankLabel: () => 'E' });
  for (const n of [CM, BOLD, XSS]) {
    const m = { name: n, li: 100, prog: {} };
    for (const k of ['mcard', 'slot', 'stat']) { const h = env[k](m); assert.ok(h.includes(`<b>${esc(n)}</b>`), `${k}：${n}`); assert.ok(!h.includes(n), `${k}：${n} を素通ししない`); }
    const s = env.slab({ m, g: 10 }); assert.equal(s, `${esc(n)}（ランクE）　🪙10G`);
  }
  const m = { name: 'ソラモ', li: 100, prog: {} };
  assert.equal(env.mcard(m), '<div class="card"><div class="row"><div class="mw" id="m0"><div class="mon"><i class="mv"></i></div><div class="fx" id="f0"></div></div><div class="info"><b>ソラモ</b> <small>ランクE</small><div class="st"><span>ライフ 100</span></div></div></div></div>', 'ふつうの名前は以前と同じ');
  assert.equal(env.slab({ m, g: 10 }), 'ソラモ（ランクE）　🪙10G'); assert.equal(env.slab(null), '（空き）');
});

test('QA-G4-4：購入（実物の adopt()）：街のメッセージの名前は文字として出す。保存する名前は入力のまま', () => {
  const { P7, P8, M } = load();
  for (const n of [CM, BOLD, XSS8]) {
    const S = P8.newSave(); S.g = 300; const log = [];
    const mk = (i) => P8.initIndividual(S, P7.initProgForNew(mon({ sp: i, name: M.byId(i).name, ...M.baseOf(i) })));
    const adopt = new Function('S', 'MMP10M', 'P10_WHY', 'mk', 'save', 'lobby', 'market', 'p8Blocked', 'sel', `${ESC}\n${lineOf('function adopt(i,nm){')}\nreturn adopt;`)(
      S, M, {}, mk, () => log.push('save'), (x) => log.push(['lobby', x]), () => log.push('market'), () => false, []);
    adopt(0, n);
    assert.equal(S.m.name, n, '保存する名前は入力のまま（変えない）'); assert.equal(S.g, 0, '初回救済・代金は従来どおり');
    assert.deepEqual(log, ['save', ['lobby', `${esc(n)}をつれて帰った！（はじめての1体のため、所持金を500Gまで補填しました）`]]);
  }
});

// ---------------------------------------------------------
// 実ブラウザ（index.html 全体）
// ---------------------------------------------------------
let L = null;
before(async () => { if (!H.skipReason()) L = await H.launch(); });
after(async () => { if (L) await L.close(); });
/** ページを開き、alert などのダイアログを記録する（スクリプトが動いたかの確認） */
async function open(opt) { const p = await L.open(opt); p.dialogs = []; p.page.on('dialog', (d) => { p.dialogs.push(d.message()); d.dismiss().catch(() => {}); }); return p; }
/** 開始画面の「はじめる」を押して、復帰先の画面が出るまで待つ */
async function start(p, sel) {
  await p.page.waitForSelector('[onclick*="startGame"]', { timeout: 30000 });
  await p.page.click('[onclick*="startGame"]');
  await p.page.waitForSelector(sel, { timeout: 30000 });
}
const txt = (pg, sel) => pg.$$eval(sel, (a) => a.map((e) => e.textContent));
const count = (pg, sel) => pg.$$eval(sel, (a) => a.length);
/** 入れた名前の画像タグ・タグが画面に無いこと（名前が HTML として効いていない） */
async function noInjected(p) {
  assert.equal(await count(p.page, 'img[src="x"]'), 0, '名前の画像タグが入っていない');
  assert.deepEqual(p.dialogs, [], 'スクリプトは動かない');
}
/** 2度押し・シートの「直後は押せない」待ち（0.4秒）が過ぎるまで待つ（実行環境の遅れに左右されない） */
const armed = (pg, sel) => pg.waitForFunction((s) => { const b = document.querySelector(s); return b && b.dataset.tapt && performance.now() - Number(b.dataset.tapt) > 450; }, sel);
/** 街から市場へ行き、中央のモンスターを名前を付けて購入する（実物の購入シート） */
async function buy(pg, name) {
  await pg.click('.hz[onclick="market()"]');
  await H.marketDetail(pg); await pg.waitForSelector('.p10buy:not([disabled])'); await pg.waitForFunction(() => !P10_ANIM);
  await H.marketDetail(pg); await pg.click('.p10buy'); await pg.waitForSelector('#p10ov .p10ok');
  await pg.fill('#mnm', name);
  await armed(pg, '#p10ov .p10shb');
  await pg.click('#p10ov .p10ok');
  await pg.waitForSelector('#app .map');
}

test('QA-G4-B1：実ブラウザ：新規開始→市場で「<!--」「<b>X</b>」「"><img src=x …」と名付けて購入→街・牧場の4タブ・セーブ画面で名前は文字のまま、ボタンも消えない→出発できる（エラーなし）', { skip: H.skipReason() }, async () => {
  // 守ること：以前は「<!--」で街の「セーブ・ロード」、牧場の「預ける」「受け取る」「売る」などのボタンが消えていた
  const p = await open(); const pg = p.page;
  await H.newGame(pg, 'テスト');
  await pg.waitForSelector('#app .map');
  await buy(pg, CM);
  let S = await H.getS(pg); assert.equal(S.m.name, CM, '名前は入力のまま保存'); assert.equal(S.g, 0, '初回救済は従来どおり');
  assert.equal(await count(pg, '#app .svb'), 1, '街の「セーブ・ロード」が残る');
  assert.equal((await txt(pg, '#msg'))[0], `${CM}をつれて帰った！（はじめての1体のため、所持金を500Gまで補填しました）`);
  assert.deepEqual(await txt(pg, '#app .card .info b'), [CM], 'モンスターカードの名前');
  await pg.evaluate(() => { S.g = 5000; save(); lobby(); });
  await buy(pg, BOLD);
  assert.equal((await txt(pg, '#msg'))[0], `${BOLD}をつれて帰った！（牧場に預けました）`); assert.equal(await count(pg, '#msg b'), 0, '名前のタグは効かない');
  await buy(pg, XSS);
  S = await H.getS(pg); assert.deepEqual(S.box.map((x) => x.name), [BOLD, XSS8], '購入シートは従来どおり8文字まで');
  assert.equal((await txt(pg, '#msg'))[0], `${XSS8}をつれて帰った！（牧場に預けました）`); assert.equal(await count(pg, '#app .svb'), 1);
  await noInjected(p);
  // 牧場：預ける・受け取る・合体・売る
  await pg.click('.hz[onclick="farm()"]'); await pg.waitForSelector('#app .ftiles');
  assert.deepEqual(await txt(pg, '.wpanel .card .info b'), [CM]); assert.equal(await count(pg, '.wpanel button[onclick="dep()"]'), 1, '「このモンスターを預ける」が残る');
  await pg.click(`.ftile[onclick="farm('','b')"]`);
  assert.deepEqual(await txt(pg, '.wpanel .row .info b'), [BOLD, XSS8]); assert.equal(await count(pg, '.wpanel button[onclick^="wd("]'), 2, '「受け取る」が2つ');
  await pg.click(`.ftile[onclick="farm('','c')"]`);
  assert.equal(await count(pg, '.wpanel button[onclick^="selm("]'), 3);
  await pg.click('.wpanel button[onclick="selm(0)"]'); await pg.click('.wpanel button[onclick="selm(1)"]');
  assert.deepEqual(await txt(pg, '.wpanel .fz .slot b'), [CM, BOLD], '合体の枠');
  assert.ok((await txt(pg, '.wpanel .card b'))[0] === `生まれるモンスター：${CM.slice(0, 2)}${BOLD.slice(-2)}`, '生まれるモンスターの名前（従来どおり前2文字＋後2文字）');
  assert.equal(await count(pg, '.wpanel button[onclick="fuse()"]'), 1, '「合体させる！」が残る');
  await pg.click('.fsell');
  assert.deepEqual(await txt(pg, '.wpanel .row .info b'), [CM, BOLD, XSS8]); assert.equal(await count(pg, '.wpanel button[onclick^="pfSellPick("]:not([disabled])'), 3);
  await pg.click('.wpanel button[onclick="pfSellPick(2)"]');
  assert.deepEqual((await txt(pg, '.wpanel .pfsell > b')).slice(1), [XSS8], '売却の確認の名前'); assert.equal(await count(pg, '.wpanel button[onclick="pfSellGo(this)"]'), 1);
  await pg.click('.wpanel button[onclick="pfSellPick(-1)"]');
  await pg.click(`.ftile[onclick="farm('','b')"]`); await pg.click('.wpanel button[onclick="wd(0)"]');
  assert.ok((await txt(pg, '.fbub'))[0].endsWith(`${BOLD}を受け取りました。`), '受け取りのメッセージ');
  await pg.click(`.ftile[onclick="farm('','b')"]`); await pg.click('.wpanel button[onclick="wd(1)"]');   // 「<!--」を連れ直す
  S = await H.getS(pg); assert.equal(S.m.name, CM); assert.equal(S.box.length, 2);
  await noInjected(p);
  // セーブ画面：スロット表示
  await pg.click('#app button.back'); await pg.waitForSelector('#app .map');
  await pg.click('#app .svb'); await pg.waitForSelector('#app button[onclick="slotSave(1,this)"]');
  await pg.click('#app button[onclick="slotSave(1,this)"]'); await pg.waitForFunction(() => /スロット1にセーブしました/.test(document.querySelector('#msg').textContent));
  const labels = await txt(pg, '#app .card.slot small');
  assert.ok(labels[0].startsWith(`${CM}（ランク`), 'スロット1'); assert.ok(labels[3].startsWith(`${CM}（ランク`), 'オートセーブ');
  assert.equal(await count(pg, '#app button[onclick="imp()"]'), 1); assert.equal(await count(pg, '#app .ghost'), 1, '「最初からやり直す」も残る');
  // 出発（フィナの会話 → 2度押し）
  await pg.click('#app button.back'); await pg.waitForSelector('#app .map');
  await pg.click('.hz[onclick="hall()"]'); await pg.click('#app button[onclick="prepScr()"]');
  const dep = '#app button[onclick="p7Depart(this)"]';
  await pg.waitForSelector(dep); await pg.click(dep); await H.finishTalk(pg);
  await pg.waitForFunction((s) => document.querySelector(s).dataset.a === '1', dep);
  await armed(pg, dep); await pg.click(dep);
  await pg.waitForSelector('#brollbtn');
  S = await H.getS(pg); assert.equal(S.m.raise.state, 'board'); assert.equal(S.m.name, CM);
  await noInjected(p);
  assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
});

test('QA-G4-B2：実ブラウザ：名前「<!--」の個体でも Chapter間ファームのコマンド7つ・ステータス・育成放棄の確認が出る（再読込後も同じ）', { skip: H.skipReason() }, async () => {
  // 守ること：以前はコマンドが0個になり（出発・中断・育成放棄も無い）、再読込しても直らず進めなくなっていた
  const M = load(); const p = await open({ save: j(atFarm(M, CM)) }); const pg = p.page;
  await start(p, '#app .p9farm');
  for (const k of [0, 1]) {
    if (k) { await pg.reload(); await start(p, '#app .p9farm'); }
    assert.equal(await count(pg, '#app .p9cmd button'), 7, 'コマンド（ボード・修行・ステータス・技管理・アイテム・中断・育成放棄）');
    assert.deepEqual(await txt(pg, '#app .p9plate b'), [CM]);
  }
  await pg.click('#app .p9cmd button[onclick="hall(\'st\')"]'); await pg.waitForSelector('#app .dnm');
  assert.deepEqual(await txt(pg, '#app .dnm'), [CM], 'ステータスの名前');
  await pg.evaluate(() => hall('t')); await pg.waitForSelector('#app .p9cmd');
  await pg.click('#app .p9cmd button[onclick="p8AbandonAsk()"]'); await pg.waitForSelector('.p8mc');
  assert.equal((await txt(pg, '.p8mc p'))[0], `${CM}の育成をやめますか？`); assert.equal(await count(pg, '.p8mc button'), 2, '「やめない」「放棄に進む」');
  await pg.click('.p8mc button.p8danger'); await pg.waitForSelector('#p8abgo');
  assert.equal((await txt(pg, '.p8mc p'))[0], `本当に${CM}を放棄しますか？この操作は取り消せません。`); assert.equal(await count(pg, '.p8mc button'), 2);
  await pg.click('.p8mc button.go'); await pg.waitForSelector('.p8mc', { state: 'detached' });
  assert.equal((await H.getS(pg)).m.raise.state, 'farm', '放棄はしていない');
  await noInjected(p);
  assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
});

test('QA-G4-B3：実ブラウザ：大会（次の相手・順位表・星取表）と VS画面で名前は文字のまま。「対戦へ」「対戦開始」「順位表にもどる」が残る', { skip: H.skipReason() }, async () => {
  // 守ること：以前は「<!--」で「対戦へ」が消え、VS画面のボタンも無くなっていた。画像タグの名前も効いていた
  for (const n of [CM, XSS]) {
    const M = load(); const p = await open({ save: j(inTour(M, n)) }); const pg = p.page;
    await start(p, '#app .p9tour');
    assert.equal((await txt(pg, '#app .p9next .nm b'))[0], n, '次の相手（自分の名前）');
    assert.equal(await count(pg, '#app .p9next button[onclick="p9VsScr()"]'), 1, '「対戦へ」が残る');
    assert.deepEqual(await txt(pg, '#app .p9r.me .nm'), [`${n}あなた`], '順位表');
    assert.ok((await txt(pg, '#app tr.me .nm')).includes(n), '星取表');
    await pg.click('#app .p9next button[onclick="p9VsScr()"]'); await pg.waitForSelector('#app .p9vs');
    assert.equal((await txt(pg, '#app .p9vs-fr .np'))[0], n, 'VS画面');
    assert.equal(await count(pg, '#app .p9vs button'), 2, '「対戦開始」「順位表にもどる」');
    await noInjected(p);
    assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
    await p.ctx.close();
  }
});

test('QA-G4-B4：実ブラウザ：育成完了画面・ファームの完了表示で名前は文字のまま。「牧場へ」が残る', { skip: H.skipReason() }, async () => {
  // 守ること：以前は「<!--」で育成完了画面の「牧場へ」が消えていた
  const M = load(); const S = town(M, CM); S.m.raise.state = 'done'; S.m.raise.log = [{ ch: 1, reachedGoal: true, turnsUsed: 18 }];
  const p = await open({ save: j(S) }); const pg = p.page;
  await start(p, '#app .map');
  await pg.evaluate(() => p8DoneScr()); await pg.waitForSelector('#app .p9done');
  assert.equal((await txt(pg, '#app .p9dn b.big'))[0], `🎉 ${CM}の育成が完了した！`);
  assert.equal(await count(pg, `#app button[onclick="farm('','a')"]`), 1, '「牧場へ」が残る');
  await H.finishTalk(pg);
  await pg.evaluate(() => hall('t')); await pg.waitForSelector('#app .dnote');
  assert.ok((await txt(pg, '#app .dnote'))[0].startsWith(`🎉 ${CM}の育成は完了しています。`));
  await noInjected(p);
  assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
});

test('QA-G4-B5：実ブラウザ：セーブコードの名前「"><img src=x onerror=alert(1)>」を読み込んでもスクリプトは動かず、名前は文字で出る', { skip: H.skipReason() }, async () => {
  // 守ること：以前はセーブコード（共有ボタンで渡せる）の名前の画像タグが効き、onerror のスクリプトが動いていた
  const M = load(); const code = town(M, XSS); code.box[0].name = CM;
  const b64 = Buffer.from(JSON.stringify(code), 'utf8').toString('base64');
  const p = await open({ save: j(town(M)) }); const pg = p.page;
  await start(p, '#app .map');
  await pg.click('#app .svb'); await pg.waitForSelector('#sc', { state: 'attached' });
  await pg.click('#app details summary');   // 「セーブコードで引っこし・バックアップ」を開く
  await pg.fill('#sc', b64); await pg.click('#app button[onclick="imp()"]');
  await pg.waitForFunction(() => /ロードしました/.test((document.querySelector('#msg') || {}).textContent || ''));
  const S = await H.getS(pg); assert.equal(S.m.name, XSS, '読み込んだ名前はそのまま'); assert.equal(S.box[0].name, CM);
  assert.deepEqual(await txt(pg, '#app .card .info b'), [XSS]); assert.equal(await count(pg, '#app .svb'), 1);
  await pg.click('.hz[onclick="farm()"]'); await pg.waitForSelector('#app .ftiles');
  await pg.click('.fsell');
  assert.deepEqual(await txt(pg, '.wpanel .row .info b'), [XSS, CM]); assert.equal(await count(pg, '.wpanel button[onclick^="pfSellPick("]'), 2);
  await noInjected(p);
  assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, [], '画像（src=x）の読み込みも起きない');
});
