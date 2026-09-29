// =========================================================
// QA：ぽかぽか牧場（購入した個体の行き先・表示・預ける・受け取る・所持上限・売却）
//  ・純粋ロジック（MMP10M の売却額・売却条件、MMP8 の uid）は Node で直接確かめる
//  ・画面の流れは実ブラウザ（tests/e2e/harness.mjs）で index.html 全体を動かして確かめる
//    （2度押しの間は 600ms 以上、画面が変わってから操作ボタンを押すまで 500ms 以上あける）
//  ・どのブラウザテストも最後に「保存＝メモリ」「8体・牧場7体まで」「uid が一意」「エラーなし」を確認する
//  仕様：CLAUDE.md §3「経済・市場・売却」（所持上限8体・牧場7体、売却額の式・最大400G、
//        育成中と最後の1体は売却不可、確定は2度押し）
//  合体の画面テストと、操作を続けたときの整合性は tests/qa-e2e-ranch-fusion-fuse.test.mjs
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
// 本番（index.html）と同じ順で読み込む（素早さの補正フックなども本番と同じく通る）
const SRC = ['js/phase7/progression.js', 'js/phase8/league.js', 'js/phase8/raising.js', 'js/phase10/monsters.js', 'js/phase11/player.js'].map(rd);
function load() {
  const w = {}; for (const s of SRC) new Function('window', s)(w);
  return { P7: w.MMP7, P8: w.MMP8, M10: w.MMP10M };
}
const j = (o) => JSON.parse(JSON.stringify(o));
/** 再現可能な乱数（線形合同法） */
function lcg(seed) { let x = seed >>> 0; return () => { x = (Math.imul(x, 1103515245) + 12345) >>> 0; return (x >>> 1) / 0x80000000; }; }
const KS = ['li', 'po', 'in', 'hi', 'ev', 'de'];
const st = (v) => Object.fromEntries(KS.map((k) => [k, v]));
/** mk() と同じ形の個体（ゲームの処理で作ったもの） */
function mon({ P7, P8 }, S, over = {}) {
  const m = { sp: 0, name: 'ソラモ', age: 0, span: 30, h: 0, rk: 0, fa: 0, st: 0, last: null, li: 100, po: 100, in: 100, hi: 100, ev: 100, de: 100,
    sk: [0, 1, 2, 3], eq: [0, 1, 2, 3, -1, -1], ...over };
  return P8.initIndividual(S, P7.initProgForNew(m));
}
const owned = (S) => [S.m, ...S.box].filter(Boolean);

// ---------------------------------------------------------
// Node：売却額・売却条件・uid
// ---------------------------------------------------------
test('QA-RF-1：売却額の式（未育成50G／育成完了＝100G＋能力上昇の合計〔上限150G〕＋最高到達ランク加算、最大400G）を多数の個体で確認', () => {
  const M = load(); const { M10 } = M; const S = M.P8.newSave();
  const BONUS = [25, 50, 75, 100, 125, 150];
  // 決まった例（CLAUDE.md の式どおり）
  const ex = (a, b, clr) => { const m = mon(M, S); m.raise.state = 'done'; if (a) m.raise.startStats = st(a); if (b) m.raise.endStats = st(b); m.prog.rankClr = clr; return M10.sellQuote(m).price; };
  const F = false, T = true;
  assert.equal(M10.sellQuote(mon(M, S)).price, 50);                         // 未育成
  assert.equal(ex(100, 150, [T, T, T, F, F, F]), 325);                      // 上昇+300→150、C 75
  assert.equal(ex(100, 200, [T, T, T, T, T, T]), 400);                      // 100+150+150＝最大400
  assert.equal(ex(100, 101, [F, F, F, F, F, F]), 106);                      // 上昇+6、ランク未到達0
  assert.equal(ex(null, null, [T, F, F, F, F, F]), 125);                    // 記録の無い旧セーブ：上昇は0G（推測しない）
  assert.equal(ex(100, 100, [F, T, F, F, F, F]), 150);                      // Eを飛ばしてDだけ：D 50
  assert.equal(ex(150, 120, [F, F, F, F, F, F]), 100);                      // 能力が下がっても上昇は0（マイナスにしない）
  // 乱数で作った個体（再現可能）：式と一致し、最大400G・市場価格500G未満
  const rnd = lcg(20260928);
  for (let n = 0; n < 400; n++) {
    const m = mon(M, S); m.raise.state = 'done';
    const a = Object.fromEntries(KS.map((k) => [k, 50 + Math.floor(rnd() * 200)]));
    const b = Object.fromEntries(KS.map((k) => [k, a[k] + Math.floor(rnd() * 80) - 10]));
    const known = rnd() < 0.8; if (known) { m.raise.startStats = a; m.raise.endStats = b; }
    m.prog.rankClr = KS.map(() => rnd() < 0.4);
    const d = KS.reduce((s, k) => s + b[k] - a[k], 0), top = m.prog.rankClr.lastIndexOf(true);
    const want = Math.min(400, 100 + (known ? Math.min(150, Math.max(0, d)) : 0) + (top >= 0 ? BONUS[top] : 0));
    const q = M10.sellQuote(m);
    assert.equal(q.ok, true); assert.equal(q.kind, 'done'); assert.equal(q.price, want, JSON.stringify({ a, b, clr: m.prog.rankClr }));
    assert.ok(q.price <= 400 && q.price < M10.ECONOMY.marketPrice);
  }
  // 育成中（board・farm・final）は見積もりも出ない
  for (const s of ['board', 'farm', 'final']) { const m = mon(M, S); m.raise.state = s; assert.deepEqual(M10.sellQuote(m), { ok: false, reason: 'raising' }); }
});

test('QA-RF-2：売却の条件と確定：育成中の個体がいれば不可／最後の1体は不可／選んだ個体だけ外れ、所持金は1回だけ増える', () => {
  const M = load(); const { M10 } = M;
  const S = M.P8.newSave(); S.g = 300;
  S.m = mon(M, S, { name: 'A' }); S.box = [mon(M, S, { name: 'B', sp: 1 }), mon(M, S, { name: 'C' })];
  const [a, b, c] = owned(S).map((x) => x.uid);
  // 連れている個体が育成中 → 牧場のどの個体も売れない
  S.m.raise.state = 'farm';
  assert.equal(M10.canSell(S, b).reason, 'raising');
  assert.equal(M10.sell(S, b).ok, false); assert.equal(S.g, 300); assert.equal(owned(S).length, 3);
  S.m.raise.state = 'done';                                                  // 育成完了なら売れる
  assert.equal(M10.canSell(S, b).ok, true);
  // 牧場の個体を売る：その個体だけが外れ、+50G
  const r = M10.sell(S, b);
  assert.equal(r.ok, true); assert.equal(r.price, 50); assert.equal(S.g, 350);
  assert.deepEqual(owned(S).map((x) => x.uid), [a, c]);
  assert.ok(!JSON.stringify(S).includes(b));
  // 同じ uid をもう一度売ろうとしても何も起きない
  assert.equal(M10.sell(S, b).reason, 'not_found'); assert.equal(S.g, 350);
  assert.equal(M10.sell(S, null).reason, 'not_found');
  // 連れている個体（育成完了・記録なし＝100G）を売る → S.m は null、牧場はそのまま
  const r2 = M10.sell(S, a);
  assert.equal(r2.ok, true); assert.equal(r2.price, 100); assert.equal(S.m, null); assert.equal(S.g, 450);
  assert.deepEqual(S.box.map((x) => x.uid), [c]);
  // 最後の1体
  assert.equal(M10.canSell(S, c).reason, 'last'); assert.equal(M10.sell(S, c).ok, false); assert.equal(S.box.length, 1); assert.equal(S.g, 450);
});

test('QA-RF-3：uid：新しい個体の uid は一意の文字列。欠けた・重複した uid は読み込み時に振り直し、正しい uid は変えない', () => {
  const M = load(); const S = M.P8.newSave();
  const xs = Array.from({ length: 300 }, () => mon(M, S));
  assert.ok(xs.every((x) => typeof x.uid === 'string' && /^m-/.test(x.uid)));
  assert.equal(new Set(xs.map((x) => x.uid)).size, xs.length);
  // 読み込み：1体目・2体目の uid はそのまま、重複（3体目）と欠け（4体目）だけ新しい uid
  S.m = xs[0]; S.box = [xs[1], { ...j(xs[2]), uid: xs[1].uid }, (() => { const y = j(xs[3]); delete y.uid; return y; })()];
  const L2 = M.P8.migrateSave(j(S));
  const u = owned(L2).map((x) => x.uid);
  assert.equal(u[0], xs[0].uid); assert.equal(u[1], xs[1].uid);
  assert.equal(new Set(u).size, 4); assert.ok(u.every((x) => typeof x === 'string' && /^m-/.test(x)));
  // 正しいセーブは読み込みで uid が変わらない
  const ok = M.P8.newSave(); ok.m = xs[5]; ok.box = [xs[6], xs[7]];
  assert.deepEqual(owned(M.P8.migrateSave(j(ok))).map((x) => x.uid), [xs[5].uid, xs[6].uid, xs[7].uid]);
});

// ---------------------------------------------------------
// 実ブラウザ：牧場・売却（index.html 全体）
// ---------------------------------------------------------
let L = null;
before(async () => { if (!H.skipReason()) L = await H.launch(); });
after(async () => { if (L) await L.close(); });

/** 名前登録済み・モンスター0体のセーブ（新規ゲームの名前登録直後と同じ形） */
const BASE = (() => { const { P8 } = load(); const S = P8.newSave(); S.g = 300; S.playerName = 'テスト'; delete S.playerNamePending; S.npcFlags = { finaIntro: 1 }; return S; })();
/** セーブを入れて開き、街へ（開始画面の「はじめる」が呼ぶ復帰処理 p8Resume と同じ。音と演出の待ち時間だけ省く） */
async function town(save = BASE) {
  const p = await L.open({ save, size: H.SIZES.base });
  await p.page.evaluate(() => p8Resume());
  await p.page.waitForSelector('#app .map', { timeout: 15000 });
  return p;
}
/** 再読み込みして、開始画面の「はじめる」を押して街へ（保存内容から再開する） */
async function reloadToTown(pg) {
  await pg.reload();
  await pg.waitForFunction(() => typeof S === 'object' && !!document.querySelector('[onclick*="startGame"]'));
  await tap(pg, '[onclick*="startGame"]');
  await pg.waitForSelector('#app .map', { timeout: 15000 });
}
/** ゲーム自身の mk()（市場の購入と同じ個体生成）で個体を作り、1体目を連れて残りを牧場へ置く。uid の配列を返す */
const seed = (pg, specs, g, carry = true) => pg.evaluate(([specs, g, carry]) => {
  S.g = g; const xs = specs.map((s) => { const x = mk(s.sp); x.name = s.name; for (const k of Object.keys(s.set || {})) x[k] = s.set[k]; return x; });
  S.m = carry ? xs.shift() : null; S.box = xs; sel = []; save(); lobby(); return [S.m, ...S.box].filter(Boolean).map((x) => x.uid);
}, [specs, g, carry]);
const txt = (pg, s) => pg.evaluate((s) => { const e = document.querySelector(s); return e ? e.innerText.replace(/\s+/g, ' ').trim() : null; }, s);
const names = (S) => owned(S).map((x) => x.name);
/**
 * 画面のボタンを押す（実際のマウス操作）。押す前に「画面内に表示され、押せる状態で、他の要素に隠れていない」ことを確かめる。
 *  ・お金・個体が動くボタン（購入・連れて帰る・売却・合体・預ける・受け取る）は、描画直後の押下を無視する修正が入っても通るように
 *    500ms あけてから押す（2度押しの2回目は呼び出し側で 650ms）。タブ・選択・やめる などは少しだけ待つ
 *  ・Playwright 標準の「動きが止まるまで待つ」確認は、牧場を歩くモンスターのアニメーションで1回0.4秒ほどかかるため、
 *    上の確認を自前で行ってから force で押す
 */
const COSTLY = /p10buy|p10ok|pfSellGo|fuse\(\)|\.go$|dep\(\)|wd\(/;
async function tap(pg, sel, ms) {
  await pg.waitForTimeout(ms ?? (COSTLY.test(sel) ? 500 : 80));
  const h = await pg.waitForSelector(sel, { state: 'visible', timeout: 10000 });
  const st = await h.evaluate((e) => {
    e.scrollIntoView({ block: 'center', inline: 'nearest' });
    const r = e.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2, hit = document.elementFromPoint(x, y);
    return { disabled: !!e.disabled, covered: !(hit && (hit === e || e.contains(hit))), by: hit ? hit.className || hit.tagName : null };
  });
  assert.equal(st.disabled, false, `${sel} が押せる状態`);
  assert.equal(st.covered, false, `${sel} が他の要素（${st.by}）に隠れていない`);
  await h.click({ force: true });
}
/** 街 → ぽかぽか牧場（タップ）→ 指定タブ */
async function toRanch(pg, tab) {
  await tap(pg, '.hz[onclick="farm()"]');
  await pg.waitForSelector('#app .wpanel');
  if (tab === 'd') await tap(pg, '.fsell');
  else if (tab) await tap(pg, `.ftile[onclick="farm('','${tab}')"]`);
  await pg.waitForFunction((t) => typeof ft === 'string' && (!t || ft === t), tab || null);
}
/** 不変条件：保存＝メモリ、8体・牧場7体まで、牧場に個体以外が無い、uid が一意、エラー・404なし */
async function invariants(p) {
  const mem = await H.getS(p.page), sto = await H.storedSave(p.page);
  assert.deepEqual(sto, mem, '保存内容とメモリが一致');
  const all = owned(mem);
  assert.ok(all.length <= 8, `所持 ${all.length}`); assert.ok(mem.box.length <= 7, `牧場 ${mem.box.length}`);
  assert.ok(mem.box.every((x) => x && typeof x === 'object' && !Array.isArray(x)));
  const u = all.map((x) => x.uid);
  assert.ok(u.every((x) => typeof x === 'string' && /^m-/.test(x))); assert.equal(new Set(u).size, u.length);
  assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
}
/** 売却：一覧で「売る」→ 確認の「売却する」を 600ms 以上あけて2回押す */
async function sellByUi(pg, i) {
  await tap(pg, `.wpanel button[onclick="pfSellPick(${i})"]`);
  await pg.waitForSelector('.pfsell');
  await tap(pg, '.wpanel button[onclick="pfSellGo(this)"]');
  await tap(pg, '.wpanel button[onclick="pfSellGo(this)"]', 650);
  await pg.waitForFunction(() => /売却しました/.test(document.querySelector('.fbub').innerText));
}

test('QA-RF-B1：市場で買った1体目は手持ち、2体目は牧場へ。どちらも一意の uid・未育成・正式の素早さを持つ', { skip: H.skipReason() }, async () => {
  const p = await L.open({ size: H.SIZES.base }); const pg = p.page;
  try {
    await H.newGame(pg, 'ぼくじょう');
    await tap(pg, '.hz[onclick="market()"]');
    await pg.waitForSelector('#p10car');
    await pg.waitForFunction(() => !P10_ANIM && $('#p10info .p10buy').dataset.key === 'solamo');
    await H.marketDetail(pg); await tap(pg, '#p10info .p10buy');
    await pg.waitForSelector('#p10ov');
    await pg.fill('#mnm', 'ソラA');
    await tap(pg, '.p10ok');
    await pg.waitForSelector('#app .map');
    let s = await H.storedSave(pg);
    assert.equal(s.m.name, 'ソラA'); assert.equal(s.m.sp, 0); assert.equal(s.m.speed, 5); assert.equal(s.m.raise.state, 'none');
    assert.deepEqual(s.box, []); assert.equal(s.g, 0);                          // 初回購入救済（300G→500G→0G）
    const uidA = s.m.uid;
    // 2体目（お金を用意）：牧場へ入り、連れている個体はそのまま
    await pg.evaluate(() => { S.g = 5000; save(); market(null, 'gauru'); });
    await pg.waitForFunction(() => !P10_ANIM && $('#p10info .p10buy').dataset.key === 'gauru');
    await H.marketDetail(pg); await tap(pg, '#p10info .p10buy');
    await pg.waitForSelector('#p10ov');
    await pg.fill('#mnm', 'ガウB');
    await tap(pg, '.p10ok');
    await pg.waitForSelector('#app .map');
    s = await H.storedSave(pg);
    assert.equal(s.g, 4500);
    assert.equal(s.m.uid, uidA); assert.equal(s.m.name, 'ソラA');
    assert.equal(s.box.length, 1);
    assert.equal(s.box[0].name, 'ガウB'); assert.equal(s.box[0].sp, 1); assert.equal(s.box[0].speed, 7); assert.equal(s.box[0].raise.state, 'none');
    assert.notEqual(s.box[0].uid, uidA);
    assert.match(await txt(pg, '#msg'), /ガウBをつれて帰った！（牧場に預けました）/);
    // 牧場の「受け取る」タブに並ぶ
    await toRanch(pg, 'b');
    assert.match(await txt(pg, `.ftile[onclick="farm('','b')"]`), /受け取る\(1\)/);
    assert.match(await txt(pg, '.wpanel'), /ガウB/);
    await invariants(p);
  } finally { await p.ctx.close(); }
});

test('QA-RF-B2：牧場の表示：連れている個体・牧場の個体の名前と6能力が見え、受け取った個体のステータス画面が開く', { skip: H.skipReason() }, async () => {
  const p = await town(); const pg = p.page;
  try {
    await seed(pg, [{ sp: 0, name: 'ソラA' }, { sp: 1, name: 'ガウB' }, { sp: 0, name: 'ソラC' }], 1000);
    await toRanch(pg);
    // タブ・ボタンの並び（預ける／受け取る／合体、売る）
    assert.deepEqual(await pg.evaluate(() => [...document.querySelectorAll('.ftile')].map((b) => b.getAttribute('onclick'))), ["farm('','a')", "farm('','b')", "farm('','c')"]);
    assert.equal(await pg.getAttribute('.fsell', 'onclick'), "farm('','d')");
    assert.equal(await pg.evaluate(() => ft), 'a');
    assert.match(await txt(pg, '.wpanel'), /ソラA.*ライフ 100.*ちから 100.*かしこさ 100.*命中 100.*回避 100.*丈夫さ 100/);
    assert.match(await txt(pg, '.fhud'), /1000G/);
    assert.equal(await pg.evaluate(() => document.querySelectorAll('.fscene .wk').length), 3);   // 3体とも牧場を歩く
    assert.match(await txt(pg, `.ftile[onclick="farm('','b')"]`), /受け取る\(2\)/);
    // 受け取るタブ：牧場の2体の6能力
    await tap(pg, `.ftile[onclick="farm('','b')"]`);
    const rows = await pg.evaluate(() => [...document.querySelectorAll('.wpanel .row')].map((r) => r.innerText.replace(/\s+/g, ' ')));
    assert.equal(rows.length, 2);
    assert.match(rows[0], /ガウB.*ライフ80 ちから110 かしこさ110 命中90 回避90 丈夫さ60/);
    assert.match(rows[1], /ソラC.*ライフ100 ちから100/);
    // ガウBを受け取る → 連れている個体になり、ソラAは牧場へ
    await tap(pg, '.wpanel button[onclick="wd(0)"]');
    await pg.waitForFunction(() => S.m && S.m.name === 'ガウB');
    assert.match(await txt(pg, '.fbub'), /ガウBを受け取りました。/);
    assert.equal(await pg.evaluate(() => ft), 'a');
    assert.match(await txt(pg, '.wpanel'), /ガウB.*ライフ 80.*ちから 110.*丈夫さ 60/);
    // 街 → ファーム → ステータス：受け取ったガウBの能力・素早さ
    await tap(pg, '.back');
    await pg.waitForSelector('#app .map');
    await tap(pg, '.hz[onclick="hall()"]');
    await pg.waitForSelector('.ttab');
    await tap(pg, `.ttab[onclick="hall('st')"]`);
    await pg.waitForSelector('.dhero');
    const t = await txt(pg, '#app');
    assert.match(t, /ガウB/); assert.match(t, /ガウル/);
    assert.match(t, /ライフ 80 \/ 999/); assert.match(t, /ちから 110 \/ 999/); assert.match(t, /丈夫さ 60 \/ 999/); assert.match(t, /素早さ 7 \/ 10/);
    await invariants(p);
  } finally { await p.ctx.close(); }
});

test('QA-RF-B3：預ける・受け取る（入れ替え）：並びと uid が保たれ、再読込後も同じ状態から再開する', { skip: H.skipReason() }, async () => {
  const p = await town(); const pg = p.page;
  try {
    const [ua, ub] = await seed(pg, [{ sp: 0, name: 'ソラA' }, { sp: 1, name: 'ガウB' }], 800);
    await toRanch(pg, 'a');
    await tap(pg, '.wpanel .go[onclick="dep()"]');
    await pg.waitForFunction(() => S.m === null);
    let s = await H.storedSave(pg);
    assert.equal(s.m, null); assert.deepEqual(s.box.map((x) => x.uid), [ub, ua]);
    assert.match(await txt(pg, '.fbub'), /預けました。/);
    assert.equal(await pg.evaluate(() => ft), 'b');
    assert.match(await txt(pg, `.ftile[onclick="farm('','b')"]`), /受け取る\(2\)/);
    // 手持ちが空の「預ける」タブ
    await tap(pg, `.ftile[onclick="farm('','a')"]`);
    assert.match(await txt(pg, '.wpanel'), /いま連れているモンスターはいません。/);
    assert.equal(await pg.$('.wpanel .go[onclick="dep()"]'), null);
    // 手持ちが空のまま受け取る（牧場1体へ）
    await tap(pg, `.ftile[onclick="farm('','b')"]`);
    await tap(pg, '.wpanel button[onclick="wd(1)"]');
    await pg.waitForFunction(() => S.m && S.m.name === 'ソラA');
    s = await H.storedSave(pg);
    assert.equal(s.m.uid, ua); assert.deepEqual(s.box.map((x) => x.uid), [ub]);
    // 入れ替え：ガウBを受け取ると、連れていたソラAが牧場へ
    await tap(pg, `.ftile[onclick="farm('','b')"]`);
    await tap(pg, '.wpanel button[onclick="wd(0)"]');
    await pg.waitForFunction(() => S.m && S.m.name === 'ガウB');
    s = await H.storedSave(pg);
    assert.equal(s.m.uid, ub); assert.deepEqual(s.box.map((x) => x.uid), [ua]);
    assert.equal(s.g, 800);                                                     // 預ける・受け取るはお金がかからない
    await invariants(p);
    // 再読込 → はじめる → 街：同じ状態
    const before = await H.getS(pg);
    await reloadToTown(pg);
    assert.deepEqual(await H.getS(pg), before);
    await invariants(p);
  } finally { await p.ctx.close(); }
});

test('QA-RF-B4：所持上限：牧場は7体まで（預けられない）／手持ちが空なら8体目は手持ちへ／8体で購入できない', { skip: H.skipReason() }, async () => {
  const p = await town(); const pg = p.page;
  try {
    await seed(pg, Array.from({ length: 7 }, (_, i) => ({ sp: i % 2, name: 'M' + i })), 5000);
    await toRanch(pg, 'a');
    await tap(pg, '.wpanel .go[onclick="dep()"]');                          // 牧場6体 → 7体
    await pg.waitForFunction(() => S.m === null && S.box.length === 7);
    // 手持ちが空・牧場7体で購入 → 手持ちへ入る（牧場は7体のまま）
    await tap(pg, '.back');
    await pg.waitForSelector('#app .map');
    await pg.evaluate(() => market(null, 'solamo'));
    await pg.waitForFunction(() => !P10_ANIM && $('#p10info .p10buy').dataset.key === 'solamo' && !$('#p10info .p10buy').disabled);
    await H.marketDetail(pg); await tap(pg, '#p10info .p10buy');
    await pg.waitForSelector('#p10ov');
    await pg.fill('#mnm', 'ハチ');
    await tap(pg, '.p10ok');
    await pg.waitForSelector('#app .map');
    let s = await H.storedSave(pg);
    assert.equal(s.m.name, 'ハチ'); assert.equal(s.box.length, 7); assert.equal(owned(s).length, 8); assert.equal(s.g, 4500);
    assert.doesNotMatch(await txt(pg, '#msg'), /牧場に預けました/);
    // 8体：牧場へ預けられない（何も変わらない）
    const snap = await H.storedSave(pg);
    await toRanch(pg, 'a');
    await tap(pg, '.wpanel .go[onclick="dep()"]');
    await pg.waitForFunction(() => /牧場がいっぱいです。/.test(document.querySelector('.fbub').innerText));
    assert.deepEqual(await H.storedSave(pg), snap);
    assert.deepEqual(await H.getS(pg), snap);
    // 8体：受け取る（入れ替え）はできる。牧場は7体のまま
    await tap(pg, `.ftile[onclick="farm('','b')"]`);
    await tap(pg, '.wpanel button[onclick="wd(6)"]');                       // 牧場の7体目（最初に預けたM0）
    await pg.waitForFunction(() => S.m && S.m.name === 'M0');
    s = await H.storedSave(pg);
    assert.equal(s.box.length, 7); assert.equal(s.box[6].name, 'ハチ');
    // 8体：市場の購入ボタンは押せない。直接の購入処理も断られる
    await pg.evaluate(() => market(null, 'gauru'));
    await pg.waitForFunction(() => !P10_ANIM && $('#p10info .p10buy').dataset.key === 'gauru');
    await H.marketDetail(pg);                                                // 詳細を開いてから、見えている購入ボタンの文言を確かめる
    assert.deepEqual(await pg.evaluate(() => { const b = $('#p10info .p10buy'); return [b.disabled, b.innerText.trim()]; }), [true, '手持ちと牧場で8体までです。']);
    const r = await pg.evaluate(() => { const g = S.g, n = [S.m, ...S.box].length; adopt(1, 'X'); return [S.g - g, [S.m, ...S.box].length - n]; });
    assert.deepEqual(r, [0, 0]);
    assert.equal((await H.storedSave(pg)).g, 4500);
    await invariants(p);
  } finally { await p.ctx.close(); }
});

test('QA-RF-B5：未育成の売却（50G）：1回目は確認だけ、2回目で確定。売った個体の uid はどこにも残らず、所持金は1回だけ増える', { skip: H.skipReason() }, async () => {
  const p = await town(); const pg = p.page;
  try {
    const [ua, ub, uc] = await seed(pg, [{ sp: 0, name: 'ソラA' }, { sp: 1, name: 'ガウB' }, { sp: 0, name: 'ソラC' }], 1000);
    await toRanch(pg, 'd');
    const rows = await pg.evaluate(() => [...document.querySelectorAll('.wpanel .row')].map((r) => r.innerText.replace(/\s+/g, ' ')));
    assert.equal(rows.length, 3);
    assert.ok(rows.every((r) => /未育成・売却額 50G/.test(r)));
    assert.match(rows[0], /ソラA（連れている）/);
    assert.deepEqual(await pg.evaluate(() => [...document.querySelectorAll('.wpanel .row button')].map((b) => b.disabled)), [false, false, false]);
    // 確認画面
    await tap(pg, '.wpanel button[onclick="pfSellPick(2)"]');
    await pg.waitForSelector('.pfsell');
    assert.equal(await pg.evaluate(() => pfSellUid), uc);
    const conf = await txt(pg, '.pfsell');
    assert.match(conf, /ソラC/); assert.match(conf, /種族：ソラモ/); assert.match(conf, /売却額：50G/); assert.match(conf, /未育成のモンスター：50G/); assert.match(conf, /所持金 1000G → 1050G/);
    // 1回目：まだ売れない
    await tap(pg, '.wpanel button[onclick="pfSellGo(this)"]');
    await pg.waitForFunction(() => /もう一度押すと売却（50G）/.test(document.querySelector('.wpanel .go').textContent));
    assert.equal((await H.getS(pg)).g, 1000); assert.equal((await H.storedSave(pg)).g, 1000);
    assert.equal(owned(await H.storedSave(pg)).length, 3);
    // 2回目（600ms 以上あけて）：確定
    await tap(pg, '.wpanel button[onclick="pfSellGo(this)"]', 650);
    await pg.waitForFunction(() => /ソラCを50Gで売却しました。/.test(document.querySelector('.fbub').innerText));
    const s = await H.storedSave(pg);
    assert.equal(s.g, 1050);
    assert.deepEqual(owned(s).map((x) => x.uid), [ua, ub]);
    assert.ok(!JSON.stringify(s).includes(uc)); assert.ok(!JSON.stringify(await H.getS(pg)).includes(uc));
    assert.deepEqual(await pg.evaluate(() => [pfSellUid, sel]), [null, []]);
    assert.equal(await pg.$('.pfsell'), null);
    assert.equal(await pg.evaluate(() => document.querySelectorAll('.wpanel .row').length), 2);
    assert.match(await txt(pg, '.fhud'), /1050G/);
    assert.equal(await pg.evaluate(() => document.querySelectorAll('.fscene .wk').length), 2);
    // 残った押下・直接呼び出し・同じ uid の再売却では増えない
    const again = await pg.evaluate((uc) => { pfSellGo(document.createElement('button')); pfSellGo(document.createElement('button')); return [S.g, MMP10M.sell(S, uc).reason, S.g]; }, uc);
    assert.deepEqual(again, [1050, 'not_found', 1050]);
    assert.equal((await H.storedSave(pg)).g, 1050);
    await invariants(p);
    // 再読込しても戻らない・二重にならない
    await reloadToTown(pg);
    const s2 = await H.getS(pg);
    assert.equal(s2.g, 1050); assert.deepEqual(owned(s2).map((x) => x.uid), [ua, ub]);
    await invariants(p);
  } finally { await p.ctx.close(); }
});

test('QA-RF-B6：売却の取り消し：1回押したあと「やめる」なら売れず、選び直した確認は最初からまた2度押しが要る', { skip: H.skipReason() }, async () => {
  const p = await town(); const pg = p.page;
  try {
    const [ua, ub] = await seed(pg, [{ sp: 0, name: 'ソラA' }, { sp: 1, name: 'ガウB' }], 700);
    await toRanch(pg, 'd');
    await tap(pg, '.wpanel button[onclick="pfSellPick(1)"]');
    await pg.waitForSelector('.pfsell');
    await tap(pg, '.wpanel button[onclick="pfSellGo(this)"]');
    await pg.waitForFunction(() => /もう一度押すと売却/.test(document.querySelector('.wpanel .go').textContent));
    await tap(pg, '.wpanel button[onclick="pfSellPick(-1)"]');
    await pg.waitForFunction(() => !document.querySelector('.pfsell'));
    assert.equal(await pg.evaluate(() => pfSellUid), null);
    let s = await H.storedSave(pg);
    assert.equal(s.g, 700); assert.deepEqual(owned(s).map((x) => x.uid), [ua, ub]);
    // 選び直す：新しい確認の1回目はまた確認だけ
    await tap(pg, '.wpanel button[onclick="pfSellPick(1)"]');
    await pg.waitForSelector('.pfsell');
    assert.equal(await pg.evaluate(() => document.querySelector('.wpanel .go').textContent), '売却する（50G）');
    await tap(pg, '.wpanel button[onclick="pfSellGo(this)"]');
    await pg.waitForFunction(() => /もう一度押すと売却/.test(document.querySelector('.wpanel .go').textContent));
    s = await H.storedSave(pg);
    assert.equal(s.g, 700); assert.equal(owned(s).length, 2);
    // 別のタブへ移ると選択は解除される
    await tap(pg, `.ftile[onclick="farm('','b')"]`);
    assert.equal(await pg.evaluate(() => pfSellUid), null);
    await tap(pg, '.fsell');
    assert.equal(await pg.$('.pfsell'), null);
    await invariants(p);
  } finally { await p.ctx.close(); }
});

test('QA-RF-B7：育成完了の売却額：一覧・確認の内訳が式どおり（上昇の上限150G・ランク加算・記録なし）で、売ると表示の額が1回だけ入る', { skip: H.skipReason() }, async () => {
  const p = await town(); const pg = p.page;
  try {
    await seed(pg, Array.from({ length: 6 }, (_, i) => ({ sp: i % 2, name: 'R' + i })), 1000);
    const quotes = await pg.evaluate(() => {
      const st = (v) => ({ li: v, po: v, in: v, hi: v, ev: v, de: v });
      const done = (x, a, b, clr) => { x.raise.state = 'done'; if (a) x.raise.startStats = st(a); if (b) x.raise.endStats = st(b); x.prog.rankClr = clr; };
      done(S.box[0], 100, 150, [true, true, true, false, false, false]);      // 上昇+300→150、C 75 → 325
      done(S.box[1], 100, 200, [true, true, true, true, true, true]);         // 100+150+150 → 400
      done(S.box[2], 100, 101, [false, false, false, false, false, false]);   // 上昇+6 → 106
      done(S.box[3], null, null, [true, false, false, false, false, false]);  // 記録なし＋E 25 → 125
      done(S.box[4], 100, 100, [false, true, false, false, false, false]);    // D 50 → 150
      save(); return [S.m, ...S.box].map((x) => MMP10M.sellQuote(x).price);
    });
    assert.deepEqual(quotes, [50, 325, 400, 106, 125, 150]);
    const raiseRec = (await H.storedSave(pg)).raiseRec;
    await toRanch(pg, 'd');
    const rows = await pg.evaluate(() => [...document.querySelectorAll('.wpanel .row')].map((r) => r.innerText.replace(/\s+/g, ' ')));
    assert.match(rows[0], /未育成・売却額 50G/);
    [325, 400, 106, 125, 150].forEach((v, i) => assert.match(rows[i + 1], new RegExp(`育成完了・売却額 ${v}G`)));
    // 内訳の表示
    await tap(pg, '.wpanel button[onclick="pfSellPick(2)"]');
    await pg.waitForSelector('.pfsell');
    let c = await txt(pg, '.pfsell');
    assert.match(c, /売却額：400G/); assert.match(c, /基本100G＋能力上昇150G（\+600・上限150G）＋公式ランクS 150G/);
    await tap(pg, '.wpanel button[onclick="pfSellPick(-1)"]');               // やめる → 一覧へ
    await tap(pg, '.wpanel button[onclick="pfSellPick(4)"]');
    await pg.waitForSelector('.pfsell');
    c = await txt(pg, '.pfsell');
    assert.match(c, /売却額：125G/); assert.match(c, /能力上昇0G（育成開始時の記録なし）＋公式ランクE 25G/);
    await tap(pg, '.wpanel button[onclick="pfSellPick(-1)"]');
    // 325G の個体を売る
    await sellByUi(pg, 1);
    const s = await H.storedSave(pg);
    assert.equal(s.g, 1325);
    assert.match(await txt(pg, '.fbub'), /R1を325Gで売却しました。/);
    assert.deepEqual(names(s), ['R0', 'R2', 'R3', 'R4', 'R5']);
    assert.deepEqual(s.raiseRec, raiseRec);                                     // 売却で育成完了回数は変わらない
    await invariants(p);
  } finally { await p.ctx.close(); }
});

test('QA-RF-B8：連れている個体の売却：手持ちが空になり（S.m＝null）、残り1体になると売却ボタンは押せない', { skip: H.skipReason() }, async () => {
  const p = await town(); const pg = p.page;
  try {
    const [ua, ub] = await seed(pg, [{ sp: 1, name: 'ガウA' }, { sp: 0, name: 'ソラB' }], 0);
    await toRanch(pg, 'd');
    await tap(pg, '.wpanel button[onclick="pfSellPick(0)"]');
    await pg.waitForSelector('.pfsell');
    assert.match(await txt(pg, '.pfsell'), /ガウA.*種族：ガウル（連れている）/);
    await tap(pg, '.wpanel button[onclick="pfSellGo(this)"]');
    await tap(pg, '.wpanel button[onclick="pfSellGo(this)"]', 650);
    await pg.waitForFunction(() => /ガウAを50Gで売却しました。/.test(document.querySelector('.fbub').innerText));
    const s = await H.storedSave(pg);
    assert.equal(s.m, null); assert.equal(s.g, 50); assert.deepEqual(s.box.map((x) => x.uid), [ub]);
    assert.ok(!JSON.stringify(s).includes(ua));
    // 残り1体：一覧は「最後の1体」、ボタンは押せない
    assert.match(await txt(pg, '.wpanel'), /^最後の1体は売却できません。/);
    assert.deepEqual(await pg.evaluate(() => [...document.querySelectorAll('.wpanel button')].map((b) => b.disabled)), [true]);
    // 街：連れている個体がいないのでファームは押せない
    await tap(pg, '.back');
    await pg.waitForSelector('#app .map');
    assert.equal(await pg.evaluate(() => document.querySelector('.hz[onclick="hall()"]').disabled), true);
    await invariants(p);
  } finally { await p.ctx.close(); }
});

test('QA-RF-B9：売却・合体・入れ替えができない：最後の1体（直接呼び出しも断る）／育成中（牧場へ入れずボードへ戻る・何も変わらない）', { skip: H.skipReason() }, async () => {
  // 最後の1体
  const p = await town(); const pg = p.page;
  try {
    await seed(pg, [{ sp: 0, name: 'ひとり' }], 300);
    await toRanch(pg, 'd');
    assert.match(await txt(pg, '.wpanel'), /^最後の1体は売却できません。/);
    assert.ok(await pg.evaluate(() => [...document.querySelectorAll('.wpanel button')].every((b) => b.disabled)));
    const r = await pg.evaluate(() => { const g = S.g, m = S.m; pfSellUid = S.m.uid; pfSellGo(document.createElement('button')); return [S.g - g, S.m === m, pfSellUid, document.querySelector('.fbub').innerText]; });
    assert.equal(r[0], 0); assert.equal(r[1], true); assert.equal(r[2], null); assert.match(r[3], /最後の1体は売却できません。/);
    // 合体タブ：1体では選べない
    await tap(pg, `.ftile[onclick="farm('','c')"]`);
    assert.match(await txt(pg, '.wpanel'), /合体には2体以上必要です。/);
    assert.equal(await pg.$('.wpanel button[onclick^="selm("]'), null);
    await invariants(p);
  } finally { await p.ctx.close(); }
  // 育成中
  const q = await town(); const qg = q.page;
  try {
    const [ua, ub, uc] = await seed(qg, [{ sp: 0, name: 'イク' }, { sp: 1, name: 'ボク' }, { sp: 0, name: 'ジョウ' }], 900);
    await qg.evaluate(() => { const r = MMP8.depart(S, S.m); if (!r.ok) throw new Error('depart ' + r.reason); save(); board(); });
    await qg.waitForSelector('#brollbtn');
    const snap = await H.storedSave(qg);
    assert.equal(snap.m.raise.state, 'board');
    assert.equal(await qg.evaluate((u) => MMP10M.canSell(S, u).reason, ub), 'raising');
    await qg.evaluate(async ([ub]) => {
      farm('', 'd'); farm('', 'c'); pfSellPick(1);
      pfSellUid = ub; pfSellGo(document.createElement('button'));
      sel = [1, 2]; await fuse();
      dep(); wd(0); selm(0);
    }, [ub]);
    assert.deepEqual(await H.storedSave(qg), snap);
    const mem = await H.getS(qg);
    assert.equal(mem.g, 900); assert.deepEqual(owned(mem).map((x) => x.uid), [ua, ub, uc]);
    assert.equal(await qg.$('.fsell'), null);                                   // 牧場の画面は出ていない
    assert.ok(await qg.$('#brollbtn'));                                         // ボードのまま
    await qg.evaluate(() => { sel = []; pfSellUid = null; });
    await invariants(q);
  } finally { await q.ctx.close(); }
});

test('QA-RF-B17：小さい画面（375×667・360×800、タッチ端末）でも、8体の牧場で受け取る・合体・売却のボタンが隠れずに押せ、横にはみ出さない', { skip: H.skipReason() }, async () => {
  for (const size of [H.SIZES.se, H.SIZES.android]) {
    const p = await L.open({ save: BASE, size, touch: true }); const pg = p.page;
    try {
      await pg.evaluate(() => p8Resume());
      await pg.waitForSelector('#app .map');
      const uids = await seed(pg, Array.from({ length: 8 }, (_, i) => ({ sp: i % 2, name: 'S' + i })), 2000);
      const noHScroll = async (where) => assert.ok(await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${size.join('×')} ${where}：横にはみ出さない`);
      await noHScroll('街');
      await toRanch(pg, 'a');
      await noHScroll('預ける');
      // 受け取る：一番下（7体目）の個体
      await tap(pg, `.ftile[onclick="farm('','b')"]`);
      await noHScroll('受け取る');
      await tap(pg, '.wpanel button[onclick="wd(6)"]');
      await pg.waitForFunction((u) => S.m && S.m.uid === u, uids[7]);
      // 合体：一覧の下のほうの2体
      await tap(pg, `.ftile[onclick="farm('','c')"]`);
      await tap(pg, '.wpanel button[onclick="selm(7)"]');
      await tap(pg, '.wpanel button[onclick="selm(6)"]');
      await noHScroll('合体');
      await tap(pg, '.wpanel .go');
      await pg.waitForFunction(() => /新しいモンスター/.test((document.querySelector('#msg') || {}).innerText || ''), null, { timeout: 8000 });
      assert.equal(owned(await H.storedSave(pg)).length, 7);
      assert.equal((await H.storedSave(pg)).g, 1800);
      // 売却：一覧の一番下
      await toRanch(pg, 'd');
      await noHScroll('売却');
      await sellByUi(pg, 6);
      await noHScroll('売却後');
      const s = await H.storedSave(pg);
      assert.equal(owned(s).length, 6); assert.equal(s.g, 1850);
      await invariants(p);
    } finally { await p.ctx.close(); }
  }
});
