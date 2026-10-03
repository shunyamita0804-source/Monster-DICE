// =========================================================
// QA（実ブラウザ）：市場での購入
//  ・初回購入救済（300G・0体 → 500Gまで補填して購入 → 0G）、500G以上は代金だけ、2体目は牧場へ
//  ・確認画面の連打・やめる・背景タップ・確認画面が閉じた後の押下
//  ・所持金不足（失敗しても状態は変わらない）、継続用救済（現在の実装どおり）
//  ・入荷待ち（ノビトン）・市場外（ジオル）は関数を直接呼んでも買えない
//  ・所持上限（手持ち＋牧場で8体）
//  ・循環の後も・購入確認中も、確認画面の種族＝中央の個体＝購入される種族
//  ・4つの画面サイズで市場と購入確認が画面内に収まる
//  Playwright / Chromium が無い環境では省略（skip）する。
// =========================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import * as H from './e2e/harness.mjs';

const SKIP = H.skipReason();
let L = null;
test.before(async () => { if (!SKIP) L = await H.launch(); });
test.after(async () => { if (L) await L.close(); });
// テストごとに開いたページを閉じる（開いたままだとアニメーションが重なり、後のテストの読み込みが遅くなる）
const OPEN = [];
const openPage = async (o) => { const p = await L.open(o); OPEN.push(p); return p; };
test.afterEach(async () => { for (const p of OPEN.splice(0)) await p.ctx.close().catch(() => {}); });
/** T(名前, 関数) または T(名前, { todo など }, 関数) */
const T = (name, a, b) => (typeof a === 'function' ? test(name, { skip: SKIP }, a) : test(name, { skip: SKIP, ...a }, b));

function noErrors(p) {
  assert.deepEqual(p.errors, [], 'pageerror / console.error が出ていない');
  assert.deepEqual(p.bad, [], 'ローカルのファイルがすべて読み込めている');
}
const owned = (S) => (S.m ? 1 : 0) + S.box.length;
const settle = (pg) => pg.waitForFunction(() => typeof P10_ANIM !== 'undefined' && !P10_ANIM && !!document.querySelector('#p10car .p10sl.on'), null, { timeout: 15000 });
/** 市場の購入欄の状態 */
const buyBox = (pg) => pg.evaluate(() => {
  const bb = document.querySelector('#p10info .p10buy'), on = document.querySelector('#p10car .p10sl.on'), msg = document.querySelector('.p10msg');
  return { center: on ? on.dataset.key : null, buyKey: bb ? (bb.dataset.key || null) : null, dis: bb ? bb.disabled : null, txt: bb ? bb.textContent.replace(/\s+/g, '') : null,
    notes: [...document.querySelectorAll('#p10info .p10note')].map((x) => x.textContent), msg: msg ? msg.textContent : null, ov: !!document.getElementById('p10ov'), anim: P10_ANIM };
});
/**
 * 名前登録・フィナのあいさつを済ませた状態を直接作り、市場を開く（開始画面〜名前登録の流れは QA-BY1 と qa-e2e-newgame-market.test.mjs で確認する）。
 *  m：手持ち（{sp, state, name}｜null）、box：牧場の個体の配列、g：所持金
 */
async function openMarket(o = {}) {
  const p = await openPage({ size: o.size || H.SIZES.base });
  await setState(p.page, o);
  return p;
}
/** 同じページで所持金・個体を置き直して市場を開き直す */
async function setState(pg, { g = 300, m = null, box = [], focus = 'solamo' } = {}) {
  await pg.evaluate((o) => {
    if (S.playerNamePending) MMP11P.confirmName(S, 'かいもの');
    S.npcFlags = { finaIntro: 1 };
    const make = (d) => { const x = mk(d.sp || 0); if (d.name) x.name = d.name; x.raise.state = d.state || 'none'; return x; };
    S.m = o.m ? make(o.m) : null; S.box = o.box.map(make); S.g = o.g;
    save(); market(null, o.focus);
  }, { g, m, box, focus });
  await settle(pg);
}
/** 購入確認を開く（画面が変わった直後の押下を無視する作りでも通るよう、少し待ってから押す） */
async function openSheet(pg) {
  await settle(pg);
  await pg.waitForTimeout(500);
  await H.marketDetail(pg); await pg.click('#p10info .p10buy');
  await pg.waitForSelector('#p10ov');
  await pg.waitForTimeout(550);   // 購入シートは開いてから0.35秒間、押しても反応しない（二度押しの誤操作防止）
  return pg.evaluate(() => ({ title: document.querySelector('.p10sht').textContent, name: document.getElementById('mnm').value, max: document.getElementById('mnm').getAttribute('maxlength'),
    ok: document.querySelector('.p10ok').textContent, onclick: document.querySelector('.p10ok').getAttribute('onclick'), img: document.querySelector('.p10shm img').getAttribute('src'),
    notes: [...document.querySelectorAll('#p10ov .p10note')].map((x) => x.textContent) }));
}
/** 購入確認で名前を入れて「連れて帰る」を押し、街へ戻るまで待つ（確認画面を出した直後の押下は無視される予定なので 0.5 秒以上待つ） */
async function confirmBuy(pg, name) {
  await pg.waitForTimeout(550);
  if (name != null) await pg.fill('#mnm', name);
  await pg.click('#p10ov .p10ok');
  await pg.waitForFunction(() => !document.getElementById('p10ov') && !!document.querySelector('.map'), null, { timeout: 15000 });
}
const townMsg = (pg) => pg.evaluate(() => document.querySelector('#msg').textContent);

// ---------------------------------------------------------
// 初回購入救済・通常の購入
// ---------------------------------------------------------
T('QA-BY1：新規ゲーム（300G・0体）の初回購入：案内と確認画面に補填の説明 → 500Gまで補填して購入 → 0G。個体は手持ちに入り、再読込後も「つづきから」', async () => {
  const p = await openPage({ size: H.SIZES.base }); const pg = p.page;
  await H.newGame(pg, 'はじめて');
  await pg.waitForSelector('.map');
  await pg.click('.hz[onclick="market()"]');
  await settle(pg);
  const b = await buyBox(pg);
  assert.deepEqual([b.center, b.buyKey, b.dis, b.txt], ['solamo', 'solamo', false, '購入する500G']);
  assert.deepEqual(b.notes, ['はじめての1体は、所持金が500Gに満たなくても購入できます（所持金を500Gまで補填）。']);
  assert.equal(await pg.evaluate(() => S.g), 300, '市場を開いただけでは補填しない');
  const sh = await openSheet(pg);
  assert.deepEqual(sh, { title: 'ソラモを連れて帰りますか？', name: 'ソラモ', max: '8', ok: '連れて帰る（500G）', onclick: 'mkgo(0);p10Close()', img: './assets/monsters/solamo.png',
    notes: ['はじめての1体のため、所持金を500Gまで補填してから支払います。'] });
  assert.equal(await pg.evaluate(() => S.g), 300, '確認画面を開いただけでは補填しない');
  await confirmBuy(pg, 'ソラ太');
  assert.equal(await townMsg(pg), 'ソラ太をつれて帰った！（はじめての1体のため、所持金を500Gまで補填しました）');
  const st = await H.storedSave(pg);
  assert.equal(st.g, 0, '300G → 500Gに補填 → 500G支払い → 0G');
  assert.deepEqual([st.m.name, st.m.sp, st.m.speed, st.m.raise.state], ['ソラ太', 0, 5, 'none']);
  assert.match(st.m.uid, /^m-/); assert.deepEqual(st.box, []); assert.equal(st.cnt, 1);
  assert.deepEqual(st.raiseRec, { done: 0, fromStart: true }, '購入では育成完了回数は増えない');
  const town = await pg.evaluate(() => ({ hz: [...document.querySelectorAll('.hz')].map((b) => b.disabled) }));
  assert.deepEqual(town.hz, Array(9).fill(false), 'モンスターがいるのでファーム・アイテム屋も押せる（2026-10-03：街の札＝市場・牧場・研究所・闘技場・聖獣士管理局（未開放の案内）・アイテム屋／下のバー＝ファーム・プロフィール・セーブ／ロード）');
  await pg.evaluate(() => profileScr()); await pg.waitForSelector('.pfds');
  assert.equal(await pg.evaluate(() => document.querySelector('.pfrow dd').innerText.replace(/\s+/g, '')), '0G', 'プロフィールの所持金');
  await pg.evaluate(() => lobby()); await pg.waitForSelector('.tbar .tcmd');
  // 確認画面が閉じた後の押下（二度押し）は無視
  await pg.evaluate(() => mkgo(0));
  const s2 = await H.getS(pg);
  assert.deepEqual([s2.g, owned(s2), s2.cnt], [0, 1, 1], '閉じた後の mkgo は購入も補填もしない');
  // 再読込：つづきから → 街（フィナのあいさつは出ない）
  await pg.reload();
  await pg.waitForFunction(() => typeof S === 'object' && !!document.querySelector('.p15start'));
  assert.equal(await pg.evaluate(() => document.querySelector('.tcap').textContent.trim()), 'つづきからはじめます');
  await pg.click('.p15start');
  await pg.waitForSelector('.map', { timeout: 20000 });
  const r = await pg.evaluate(() => ({ talk: document.querySelectorAll('.mmtalk').length, name: S.m && S.m.name, g: S.g, cnt: S.cnt }));
  assert.deepEqual(r, { talk: 0, name: 'ソラ太', g: 0, cnt: 1 });
  noErrors(p);
});

T('QA-BY2：確認画面の「連れて帰る」を同時に2回押しても、購入・補填は1回だけ', async () => {
  const p = await openMarket({ g: 300 }); const pg = p.page;
  await openSheet(pg);
  await pg.waitForTimeout(550);
  await pg.evaluate(() => { const b = document.querySelector('#p10ov .p10ok'); b.click(); b.click(); });
  await pg.waitForSelector('.map');
  const s = await H.getS(pg), st = await H.storedSave(pg);
  assert.deepEqual([s.g, owned(s), s.cnt], [0, 1, 1]);
  assert.deepEqual([st.g, owned(st), st.cnt], [0, 1, 1], '保存内容も1回分');
  noErrors(p);
});

T('QA-BY3：「やめる」・背景のタップで閉じると何も起きない（所持金300Gのまま・補填金も残らない）。閉じた後も同じ個体を買える', async () => {
  const p = await openMarket({ g: 300, focus: 'gauru' }); const pg = p.page;
  await openSheet(pg);
  await pg.click('.p10no');
  let s = await H.getS(pg), b = await buyBox(pg);
  assert.equal(b.ov, false, '「やめる」で閉じる');
  assert.deepEqual([s.g, owned(s), s.cnt || 0], [300, 0, 0]);
  assert.deepEqual([b.center, b.buyKey, b.dis], ['gauru', 'gauru', false]);
  await openSheet(pg);
  await pg.mouse.click(195, 30);   // 確認画面の外（背景）
  s = await H.getS(pg); b = await buyBox(pg);
  assert.equal(b.ov, false, '背景のタップで閉じる');
  assert.deepEqual([s.g, owned(s), s.cnt || 0], [300, 0, 0]);
  assert.equal((await H.storedSave(pg)).g, 300, '保存された所持金も300Gのまま');
  await pg.evaluate(() => mkgo(1));
  assert.equal(owned(await H.getS(pg)), 0, '閉じた後の mkgo は無視');
  await openSheet(pg);
  await confirmBuy(pg, null);
  s = await H.getS(pg);
  assert.deepEqual([s.g, s.m.sp, s.m.name, s.m.speed], [0, 1, 'ガウル', 7], 'あらためて買えばガウル（素早さ7）を1体');
  noErrors(p);
});

T('QA-BY4：500G以上なら補填なしで代金500Gだけ。名前は8文字まで、空欄なら種族名。2体目は牧場に預ける', async () => {
  const p = await openMarket({ g: 600, focus: 'gauru' }); const pg = p.page;
  let b = await buyBox(pg);
  assert.deepEqual(b.notes, [], '600Gなら補填の説明は出ない');
  const sh = await openSheet(pg);
  assert.deepEqual([sh.title, sh.notes, sh.onclick], ['ガウルを連れて帰りますか？', [], 'mkgo(1);p10Close()']);
  await confirmBuy(pg, 'ABCDEFGHIJ');
  assert.equal(await townMsg(pg), 'ABCDEFGHをつれて帰った！', '補填の文言は出ない');
  let s = await H.getS(pg);
  assert.deepEqual([s.g, s.m.name, s.m.sp, s.box.length], [100, 'ABCDEFGH', 1, 0], '600G → 100G、名前は8文字まで');
  // 2体目（ソラモ）：名前を空欄にすると種族名。手持ちがいるので牧場へ
  await setState(pg, { g: 5000, m: { sp: 1, name: 'ハネ' }, focus: 'solamo' });
  b = await buyBox(pg);
  assert.deepEqual([b.dis, b.notes], [false, []]);
  await openSheet(pg);
  await confirmBuy(pg, '');
  assert.equal(await townMsg(pg), 'ソラモをつれて帰った！（牧場に預けました）');
  s = await H.getS(pg);
  assert.deepEqual([s.g, s.m.name, s.box.length, s.box[0].name, s.box[0].sp, s.box[0].raise.state], [4500, 'ハネ', 1, 'ソラモ', 0, 'none']);
  assert.notEqual(s.box[0].uid, s.m.uid, '個体ごとに別の uid');
  const st = await H.storedSave(pg);
  assert.deepEqual([st.g, owned(st)], [4500, 2]);
  noErrors(p);
});

// ---------------------------------------------------------
// 所持金不足・継続用救済
// ---------------------------------------------------------
T('QA-BY5：所持金不足（未育成1体・0G）：購入ボタンは「お金が足りません。」で押せず、補填もしない。関数を直接呼んでも状態は変わらない', async () => {
  const p = await openMarket({ g: 0, m: { sp: 0, name: 'いる' } }); const pg = p.page;
  for (const key of ['solamo', 'gauru']) {
    await pg.evaluate((k) => market(null, k), key); await settle(pg);
    const b = await buyBox(pg);
    assert.deepEqual([b.center, b.buyKey, b.dis, b.txt, b.notes], [key, key, true, 'お金が足りません。', []], key);
  }
  const before = JSON.stringify(await H.getS(pg)), stored0 = JSON.stringify(await H.storedSave(pg));
  await pg.evaluate(() => p10BuyAsk());
  assert.equal((await buyBox(pg)).ov, false, '購入確認は開かない');
  await pg.evaluate(() => mkgo(0));
  assert.equal(JSON.stringify(await H.getS(pg)), before, '確認画面なしの mkgo は何もしない');
  await pg.evaluate(() => adopt(0, 'ズル'));
  await settle(pg);
  let b = await buyBox(pg);
  assert.equal(JSON.stringify(await H.getS(pg)), before, '直接 adopt しても所持金・個体は変わらない');
  assert.deepEqual([b.msg, b.center, b.anim], ['お金が足りません。', 'solamo', false], '市場に戻り理由を表示');
  await pg.evaluate(() => adopt(1, 'ズル'));
  await settle(pg);
  b = await buyBox(pg);
  assert.equal(JSON.stringify(await H.getS(pg)), before);
  assert.deepEqual([b.msg, b.center], ['お金が足りません。', 'gauru']);
  assert.equal(JSON.stringify(await H.storedSave(pg)), stored0, '保存内容も変わらない');
  // 499G でも同じ（未育成の個体がいるので救済なし）
  await setState(pg, { g: 499, m: { sp: 0 }, box: [{ sp: 1, state: 'done' }] });
  b = await buyBox(pg);
  assert.deepEqual([b.dis, b.txt], [true, 'お金が足りません。']);
  noErrors(p);
});

T('QA-BY6：継続用救済（現在の実装どおり）：育成完了の個体だけ・500G未満・合体もできない（合体を使えない今は2体以上・200G以上でも）ときだけ、確定時に不足分を補って購入（購入後0G）', async () => {
  const p = await openMarket({ g: 450, m: { sp: 0, state: 'done' } }); const pg = p.page;
  const NOTE = '育成を続けられるモンスターがいないため、所持金が500Gに満たなくても購入できます（購入を確定したときだけ不足分を補填し、購入後の所持金は0Gになります）。';
  // A：育成完了1体・450G → 救済あり
  let b = await buyBox(pg);
  assert.deepEqual([b.dis, b.txt, b.notes], [false, '購入する500G', [NOTE]]);
  let sh = await openSheet(pg);
  assert.deepEqual(sh.notes, ['育成を続けられるモンスターがいないため、所持金を500Gまで補填してから支払います（購入後の所持金は0Gになります）。']);
  assert.equal(await pg.evaluate(() => S.g), 450, '確認画面を開いても所持金は450Gのまま（確定前は補填しない）');
  await confirmBuy(pg, null);
  assert.equal(await townMsg(pg), 'ソラモをつれて帰った！（牧場に預けました）（育成を続けるため、不足分50Gを補填して購入しました）');
  let s = await H.getS(pg);
  assert.deepEqual([s.g, owned(s)], [0, 2]);
  // B：未育成の個体がいれば救済なし
  await setState(pg, { g: 100, m: { sp: 0, state: 'done' }, box: [{ sp: 1, state: 'none' }] });
  b = await buyBox(pg); assert.deepEqual([b.dis, b.txt, b.notes], [true, 'お金が足りません。', []], '未育成がいる');
  // C：2体・200G以上でも、研究所の合体UIが未実装の今は合体を使えない（画面から行けない）ので救済あり（2026-09-30）
  assert.equal(await pg.evaluate(() => MMP10M.fusionAvailable(S)), false, 'ゲームは合体を「使える」と登録していない');
  await setState(pg, { g: 250, m: { sp: 0, state: 'done' }, box: [{ sp: 1, state: 'done' }] });
  b = await buyBox(pg); assert.deepEqual([b.dis, b.txt, b.notes], [false, '購入する500G', [NOTE]], '合体を使えない今は救済あり');
  // C'：合体を使えるようになった後（研究所の合体UIが登録する想定）は、合体（2体・200G以上）ができれば救済なし
  await pg.evaluate(() => MMP10M.setFusionAccess(() => true));
  await setState(pg, { g: 250, m: { sp: 0, state: 'done' }, box: [{ sp: 1, state: 'done' }] });
  b = await buyBox(pg); assert.deepEqual([b.dis, b.txt, b.notes], [true, 'お金が足りません。', []], '合体できる');
  // D：2体でも199Gなら合体できないので救済あり
  await setState(pg, { g: 199, m: { sp: 0, state: 'done' }, box: [{ sp: 1, state: 'done' }], focus: 'gauru' });
  b = await buyBox(pg); assert.deepEqual([b.dis, b.notes], [false, [NOTE]], '199G');
  await openSheet(pg);
  await confirmBuy(pg, null);
  assert.match(await townMsg(pg), /不足分301Gを補填して購入しました/);
  s = await H.getS(pg);
  assert.deepEqual([s.g, owned(s), s.box[s.box.length - 1].sp], [0, 3, 1]);
  // E：手持ち・牧場とも0体・0G → 初回救済（継続用救済の説明は出ない）
  await setState(pg, { g: 0 });
  b = await buyBox(pg);
  assert.deepEqual([b.dis, b.notes], [false, ['はじめての1体は、所持金が500Gに満たなくても購入できます（所持金を500Gまで補填）。']]);
  noErrors(p);
});

// ---------------------------------------------------------
// 入荷待ち・市場外・所持上限
// ---------------------------------------------------------
T('QA-BY7：入荷待ちのノビトン・市場にいないジオルは、関数を直接呼んでも買えない（所持金・個体・保存内容は変わらない）', async () => {
  const p = await openMarket({ g: 5000, m: { sp: 0 } }); const pg = p.page;
  const before = JSON.stringify(await H.getS(pg)), stored0 = JSON.stringify(await H.storedSave(pg));
  assert.deepEqual(await pg.evaluate(() => [MMP10M.canPurchase(S, 'nobiton', 1), MMP10M.canPurchase(S, 'jiol', 1)]),
    [{ ok: false, reason: 'waiting' }, { ok: false, reason: 'not_in_market' }]);
  await pg.evaluate(() => adopt(2, 'ノビ')); await settle(pg);
  let b = await buyBox(pg);
  assert.equal(JSON.stringify(await H.getS(pg)), before, 'adopt(2)：変わらない');
  assert.deepEqual([b.msg, b.center, b.dis], ['このモンスターは現在入荷待ちです。', 'nobiton', true]);
  await pg.evaluate(() => p10BuyAsk());
  assert.equal((await buyBox(pg)).ov, false, 'ノビトンの購入確認は開かない');
  await pg.evaluate(() => adopt(3, 'ジオ')); await settle(pg);
  b = await buyBox(pg);
  assert.equal(JSON.stringify(await H.getS(pg)), before, 'adopt(3)：変わらない');
  assert.equal(b.msg, 'このモンスターは市場にいません。');
  assert.doesNotMatch(await pg.evaluate(() => document.getElementById('app').innerHTML), /ジオル|jiol/, '理由の表示でもジオルは出ない');
  // ソラモの購入確認を開いたまま、別の種族の番号で確定させようとしても買えない
  await pg.evaluate(() => market(null, 'solamo')); await settle(pg);
  await openSheet(pg);
  await pg.waitForTimeout(550);
  await pg.evaluate(() => { mkgo(2); mkgo(3); });
  assert.equal(JSON.stringify(await H.getS(pg)), before, '確認画面を開いたままの mkgo(2)・mkgo(3)：変わらない');
  await pg.evaluate(() => p10Close());
  assert.equal(JSON.stringify(await H.storedSave(pg)), stored0, '保存内容も変わらない');
  noErrors(p);
});

T('QA-BY8：所持上限は手持ち＋牧場で8体：7体なら買えて8体目は牧場へ。8体では「手持ちと牧場で8体までです。」で押せず、直接呼んでも買えない', async () => {
  const seven = Array.from({ length: 6 }, (_, i) => ({ sp: i % 2, name: 'B' + i }));
  const p = await openMarket({ g: 5000, m: { sp: 0, name: 'て' }, box: seven, focus: 'gauru' }); const pg = p.page;
  let b = await buyBox(pg);
  assert.deepEqual([b.dis, b.buyKey], [false, 'gauru'], '7体なら買える');
  await openSheet(pg);
  await confirmBuy(pg, 'はち');
  let s = await H.getS(pg);
  assert.deepEqual([owned(s), s.box.length, s.box[6].name, s.g], [8, 7, 'はち', 4500]);
  const uids = [s.m, ...s.box].map((x) => x.uid);
  assert.equal(new Set(uids).size, 8, 'uid はすべて別'); assert.ok(uids.every((u) => /^m-/.test(u)));
  for (const key of ['solamo', 'gauru']) {
    await pg.evaluate((k) => market(null, k), key); await settle(pg);
    b = await buyBox(pg);
    assert.deepEqual([b.dis, b.txt, b.notes], [true, '手持ちと牧場で8体までです。', []], key);
  }
  const before = JSON.stringify(await H.getS(pg));
  await pg.evaluate(() => p10BuyAsk());
  assert.equal((await buyBox(pg)).ov, false);
  await pg.evaluate(() => adopt(0, 'X')); await settle(pg);
  b = await buyBox(pg);
  assert.equal(JSON.stringify(await H.getS(pg)), before, '直接 adopt しても9体目は増えない');
  assert.equal(b.msg, '手持ちと牧場で8体までです。');
  // 育成完了8体・0G：救済より所持上限の判定が先
  await setState(pg, { g: 0, m: { sp: 0, state: 'done' }, box: Array.from({ length: 7 }, () => ({ sp: 1, state: 'done' })) });
  b = await buyBox(pg);
  assert.deepEqual([b.dis, b.txt, b.notes], [true, '手持ちと牧場で8体までです。', []]);
  noErrors(p);
});

T('QA-BY9：手持ちがいない（牧場に育成完了7体・0G）ときは、買った個体が手持ちに入り8体になる（継続用救済で0G）', async () => {
  const p = await openMarket({ g: 0, m: null, box: Array.from({ length: 7 }, (_, i) => ({ sp: i % 2, state: 'done', name: 'D' + i })) }); const pg = p.page;
  const b = await buyBox(pg);
  assert.equal(b.dis, false);
  await openSheet(pg);
  await confirmBuy(pg, 'てもち');
  assert.equal(await townMsg(pg), 'てもちをつれて帰った！（育成を続けるため、不足分500Gを補填して購入しました）');
  const s = await H.getS(pg);
  assert.deepEqual([s.m && s.m.name, s.box.length, owned(s), s.g], ['てもち', 7, 8, 0]);
  noErrors(p);
});

T('QA-BY10：矢印で端から端へ循環させた後も、確認画面の種族と購入される種族は中央の個体と同じ', async () => {
  const p = await openMarket({ g: 5000 }); const pg = p.page;
  // ソラモ →（前へ：最初→最後）ノビトン →（前へ）ガウル
  await pg.click('.p10arw.prev'); await settle(pg);
  let b = await buyBox(pg);
  assert.deepEqual([b.center, b.buyKey, b.dis], ['nobiton', null, true], '最初→最後：ノビトン（入荷待ち）');
  await pg.click('.p10arw.prev'); await settle(pg);
  b = await buyBox(pg);
  assert.deepEqual([b.center, b.buyKey, b.dis], ['gauru', 'gauru', false]);
  let sh = await openSheet(pg);
  assert.deepEqual([sh.title, sh.onclick, sh.name, sh.img], ['ガウルを連れて帰りますか？', 'mkgo(1);p10Close()', 'ガウル', './assets/monsters/gauru.png']);
  await confirmBuy(pg, null);
  let s = await H.getS(pg);
  assert.deepEqual([s.m.sp, s.m.name, s.m.speed, s.g], [1, 'ガウル', 7, 4500]);
  // ノビトン →（次へ：最後→最初）ソラモ
  await pg.click('.hz[onclick="market()"]'); await settle(pg);
  await pg.evaluate(() => market(null, 'nobiton')); await settle(pg);
  await pg.click('.p10arw.next'); await settle(pg);
  b = await buyBox(pg);
  assert.deepEqual([b.center, b.buyKey, b.dis], ['solamo', 'solamo', false], '最後→最初：ソラモ');
  sh = await openSheet(pg);
  assert.deepEqual([sh.title, sh.onclick, sh.name, sh.img], ['ソラモを連れて帰りますか？', 'mkgo(0);p10Close()', 'ソラモ', './assets/monsters/solamo.png']);
  await confirmBuy(pg, null);
  s = await H.getS(pg);
  assert.deepEqual([s.box.length, s.box[0].sp, s.box[0].speed, s.g, s.m.sp], [1, 0, 5, 4000, 1]);
  noErrors(p);
});

T('QA-BY11：購入確認を開いている間は、矢印・キー操作で中央の個体が変わらない（確認画面の種族と中央の個体が食い違わない）', async () => {
  const p = await openMarket({ g: 300, focus: 'gauru' }); const pg = p.page;
  const sh = await openSheet(pg);
  assert.equal(sh.title, 'ガウルを連れて帰りますか？');
  await pg.keyboard.press('ArrowRight');
  await pg.keyboard.press('ArrowLeft');
  const r = await pg.evaluate(() => { const a = p10Step(1), b = p10Step(-1); return { a, b, mk: P10_MK, anim: P10_ANIM }; });
  assert.deepEqual(r, { a: false, b: false, mk: 1, anim: false }, '確認画面が開いている間は切り替えない');
  await pg.waitForTimeout(400);
  const b = await buyBox(pg);
  assert.deepEqual([b.center, b.buyKey, b.ov, b.anim], ['gauru', 'gauru', true, false]);
  assert.equal(await pg.evaluate(() => document.querySelector('.p10sht').textContent), 'ガウルを連れて帰りますか？', '確認画面の種族もそのまま');
  await confirmBuy(pg, null);
  const s = await H.getS(pg);
  assert.deepEqual([s.m.sp, s.m.name, s.g], [1, 'ガウル', 0], '買えるのは確認画面の（中央の）ガウル');
  noErrors(p);
});

T('QA-BY12：4つの画面サイズで、市場に横スクロールが出ず、左右の矢印・中央の個体・購入確認のボタンが画面内に収まる', async () => {
  for (const [label, size] of Object.entries(H.SIZES)) {
    const p = await openMarket({ size }); const pg = p.page;
    const t = await pg.evaluate(() => {
      const box = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom }; };
      return { sw: document.documentElement.scrollWidth, iw: innerWidth, prev: box('.p10arw.prev'), next: box('.p10arw.next'), on: box('#p10car .p10sl.on .p10im') };
    });
    assert.equal(t.sw, t.iw, `${label}：横スクロールが出ない`);
    for (const k of ['prev', 'next', 'on']) assert.ok(t[k].l >= 0 && t[k].r <= t.iw + 0.5, `${label}：${k} が横方向に画面内 ${JSON.stringify(t[k])}`);
    await openSheet(pg);
    const d = await pg.evaluate(() => { const b = document.querySelector('.p10ok').getBoundingClientRect(), n = document.querySelector('.p10no').getBoundingClientRect();
      return { ok: b.top >= 0 && b.bottom <= innerHeight && b.left >= 0 && b.right <= innerWidth, no: n.top >= 0 && n.bottom <= innerHeight && n.left >= 0 && n.right <= innerWidth, sw: document.documentElement.scrollWidth === innerWidth }; });
    assert.deepEqual(d, { ok: true, no: true, sw: true }, `${label}：購入確認の「連れて帰る」「やめる」が画面内`);
    noErrors(p);
    await p.ctx.close();
  }
});

T('QA-BY13：購入確認で入れたモンスター名に HTML が含まれていても、画面では文字として表示する', async () => {
  const p = await openMarket({ g: 300 }); const pg = p.page;
  await openSheet(pg);
  await confirmBuy(pg, '<b>x</b>');
  const t = await pg.evaluate(() => ({ msg: document.querySelector('#msg').textContent, msgB: document.querySelectorAll('#msg b').length, app: document.getElementById('app').innerText, svb: !!document.querySelector('.svb') }));
  assert.ok(t.msg.startsWith('<b>x</b>をつれて帰った！'), '街の案内に名前を文字のまま表示');
  assert.equal(t.msgB, 0, '案内の中に <b> 要素ができない');
  assert.ok(t.app.includes('<b>x</b>'), 'モンスターの情報欄にも文字のまま表示');
  assert.equal(t.svb, true);
  noErrors(p);
});
