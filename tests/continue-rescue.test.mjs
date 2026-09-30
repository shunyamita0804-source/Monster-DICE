// =========================================================
// 継続用救済のテスト（所持金不足で次の育成へ進めなくなる問題）
//  正式方針：ゲームオーバーにしない・市場価格は500Gのまま。育成を続けられる未育成個体がなく、所持金不足で購入も合体もできない
//  ときだけ、市場で購入を確定する時点で不足分を補い、所持金を500Gにして通常どおり購入する（購入後0G）。
//  初回救済（手持ち・牧場とも0体・500G未満）は従来どおり。補填は購入の確定処理の中だけ（アイテム購入・合体費用には使えない）。
// =========================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const HTML = rd('index.html');
const SRC = { p7: rd('js/phase7/progression.js'), lg: rd('js/phase8/league.js'), p8: rd('js/phase8/raising.js'), mo: rd('js/phase10/monsters.js') };
function load() { const w = {}; for (const k of ['p7', 'lg', 'p8', 'mo']) new Function('window', SRC[k])(w); return { P7: w.MMP7, P8: w.MMP8, M: w.MMP10M }; }
const j = (o) => JSON.parse(JSON.stringify(o));
const lineOf = (prefix) => HTML.split('\n').find((l) => l.startsWith(prefix));
const between = (a, b) => { const i = HTML.indexOf(a), k = HTML.indexOf(b, i + a.length); if (i < 0 || k < 0) throw new Error('抽出失敗: ' + a); return HTML.slice(i, k); };
const owned = (S) => S.box.length + (S.m ? 1 : 0);
function mon(P7, P8, S, state = 'done', over = {}) {
  const m = P8.initIndividual(S, { sp: 0, name: 'ソラモ', age: 0, span: 30, h: 0, rk: 0, fa: 0, st: 0, last: null, li: 100, po: 100, in: 100, hi: 100, ev: 100, de: 100, sk: [0, 1, 2, 3], eq: [0, 1, 2, 3, -1, -1], ...over });
  P7.ensureProg(m); m.raise.state = state; return m;
}
/** 手持ち・牧場の構成（例：['done','done']）と所持金のセーブ */
function save(P7, P8, states, g) { const S = P8.newSave(); S.g = g; const ms = states.map((st) => mon(P7, P8, S, st)); S.m = ms[0] || null; S.box = ms.slice(1); return S; }
/** index.html の adopt() を実物のまま動かす（個体生成は正式データの未育成個体） */
function adoptOf(P7, P8, M, S, log) {
  const mk = (i) => mon(P7, P8, S, 'none', { sp: i, name: M.byId(i).name, ...M.baseOf(i) });
  return new Function('S', 'MMP10M', 'P10_WHY', 'mk', 'save', 'lobby', 'market', 'p8Blocked', 'sel', `${lineOf('function p11Esc(t){')}\n${lineOf('function adopt(i,nm){')}\nreturn adopt;`)(
    S, M, { no_money: 'お金が足りません。', full: '手持ちと牧場で8体までです。' }, mk, () => log.push('save'), (m) => log.push(['lobby', m]), (m, k) => log.push(['market', m, k]), () => false, []);
}

test('R1：初回救済は従来どおり（0体・500G未満→購入時に500Gへ補填→0G）。結果の形も変えない', () => {
  const { P8, M } = load();
  const S = P8.newSave(); S.g = 300;
  assert.deepEqual(M.canPurchase(S, 'solamo', 0), { ok: true, price: 500, rescue: true });
  assert.equal(S.g, 300, '判定だけでは所持金は変わらない');
  assert.deepEqual(M.purchase(S, 'solamo', 0), { ok: true, key: 'solamo', price: 500, rescued: true, before: 300, after: 0 });
  assert.equal(M.continueRescueApplies(P8.newSave(), 'solamo', 0), false, '0体は継続用救済の対象ではない（初回救済が扱う）');
});

test('R2：育成完了個体しかいない・450G → 購入の確定時に500Gへ補填して通常購入（500G）→ 購入後0G。ソラモ・ガウルとも', () => {
  const { P7, P8, M } = load();
  for (const key of ['solamo', 'gauru']) {
    const S = save(P7, P8, ['done'], 450);
    assert.equal(M.continueRescueApplies(S, key, 1), true);
    assert.deepEqual(M.canPurchase(S, key, 1), { ok: true, price: 500, rescue: false, continueRescue: true });
    assert.equal(S.g, 450, '確定前は450Gのまま（補填金を加えない）');
    assert.deepEqual(M.purchase(S, key, 1), { ok: true, key, price: 500, rescued: false, before: 450, after: 0, continueRescued: true, topUp: 50 });
    assert.equal(S.g, 0);
  }
  const S = save(P7, P8, ['done', 'done', 'done'], 0);   // 3体とも育成完了・0G
  assert.equal(M.canPurchase(S, 'solamo', 3).continueRescue, true);
});

test('R3：確定前の補填金は別用途に使えない。購入をやめれば補填金は残らない（アイテム購入・合体の判定は実際の所持金のまま）', () => {
  const { P7, P8, M } = load();
  const S = save(P7, P8, ['done', 'done'], 150);   // 合体できない（200G未満）→ 継続用救済の対象
  const before = j(S);
  assert.equal(M.canPurchase(S, 'solamo', 2).continueRescue, true);
  assert.deepEqual(j(S), before, '判定（画面表示・確認画面）ではセーブを一切変えない＝購入をやめても何も残らない');
  P7.registerItem({ id: 'test_item', name: 'テスト用アイテム', price: 300 }); P7.setShopCatalog(['test_item']);
  assert.deepEqual(P7.shopBuy(S, 'test_item'), { ok: false, reason: 'no_money' }, '補填金ではアイテムを買えない（150G）');
  assert.equal(S.g, 150);
  const fuse = between('async function fuse(){', '\nfunction tog(');
  assert.match(fuse, /if\(S\.g<200\)return;S\.g-=200;/, '合体は実際の所持金で判定し、補填しない（合体料金200Gは変えない）');
  assert.doesNotMatch(fuse, /purchase|continueRescue|ECONOMY/, '合体処理は市場の補填を使わない');
  assert.equal(M.FUSION_COST, 200, '判定用の合体費用は fuse() と同じ200G');
  assert.match(lineOf('function farm(msg,tab){') + between('function farm(msg,tab){', '\nfunction dep('), /\$\{S\.g<200\?"disabled":""\} onclick="fuse\(\)">合体させる！（200G）/);
});

test('R4：次の育成に使える個体がいれば継続用救済は動かない（未育成が手持ち・牧場のどちらか／育成中の個体がいる）', () => {
  const { P7, P8, M } = load();
  for (const states of [['none'], ['done', 'none'], ['none', 'done'], ['done', 'done', 'none'], ['farm'], ['board', 'done'], ['final']]) {
    const S = save(P7, P8, states, 100);
    assert.equal(M.continueRescueApplies(S, 'solamo', states.length), false, JSON.stringify(states));
    assert.deepEqual(M.purchase(S, 'solamo', states.length), { ok: false, reason: 'no_money' }); assert.equal(S.g, 100);
  }
});

test('R5：合体を使える（研究所の合体UIができた後）ときは、今の所持金で合体して次の育成へ進めるなら継続用救済は動かない（2体以上・200G以上）。199Gなら動く', () => {
  const { P7, P8, M } = load();
  M.setFusionAccess(() => true);   // 研究所の合体UIを作ったときに登録する想定（この load() の中だけ）
  assert.equal(M.fusionAvailable(), true);
  for (const g of [200, 300, 499]) for (const n of [2, 3]) {
    const S = save(P7, P8, Array(n).fill('done'), g);
    assert.deepEqual(M.purchase(S, 'solamo', n), { ok: false, reason: 'no_money' }, `${n}体・${g}G：合体できる`); assert.equal(S.g, g);
  }
  const S = save(P7, P8, ['done', 'done'], 199); assert.equal(M.canPurchase(S, 'solamo', 2).continueRescue, true, '199Gでは合体できない');
  const one = save(P7, P8, ['done'], 499); assert.equal(M.canPurchase(one, 'solamo', 1).continueRescue, true, '1体だけなら合体できない');
});

test('R10：研究所の合体UIが未実装の今は「合体を使えない」扱い：育成完了2体以上・200〜499G でも継続用救済が発生する', () => {
  const { P7, P8, M } = load();
  assert.equal(M.fusionAvailable(), false, '既定は合体を使えない（画面から合体へ行けない）');
  for (const g of [200, 300, 499]) for (const n of [2, 3, 7]) {
    const S = save(P7, P8, Array(n).fill('done'), g);
    assert.equal(M.continueRescueApplies(S, 'solamo', n), true, `${n}体・${g}G`);
    assert.deepEqual(M.canPurchase(S, 'gauru', n), { ok: true, price: 500, rescue: false, continueRescue: true });
    assert.equal(S.g, g, '判定だけでは所持金は変わらない');
    assert.deepEqual(M.purchase(S, 'solamo', n), { ok: true, key: 'solamo', price: 500, rescued: false, before: g, after: 0, continueRescued: true, topUp: 500 - g });
  }
  // 救済の他の条件は従来どおり
  assert.equal(M.continueRescueApplies(save(P7, P8, ['done', 'none'], 300), 'solamo', 2), false, '未育成の個体がいれば発動しない');
  assert.equal(M.continueRescueApplies(save(P7, P8, ['done', 'done'], 500), 'solamo', 2), false, '500G以上なら発動しない');
  assert.deepEqual(M.purchase(save(P7, P8, Array(8).fill('done'), 300), 'solamo', 8), { ok: false, reason: 'full' }, '所持上限8体が先');
  assert.equal(M.continueRescueApplies(save(P7, P8, ['done', 'done'], 300), 'nobiton', 2), false, '入荷待ちは対象外');
  // 登録の扱い：関数以外・例外を出す関数は「使えない」
  M.setFusionAccess(null); assert.equal(M.fusionAvailable(), false);
  M.setFusionAccess(() => { throw new Error('x'); }); assert.equal(M.fusionAvailable(), false);
  M.setFusionAccess((S) => !!(S && S.g >= 0)); assert.equal(M.fusionAvailable({ g: 1 }), true, '判定関数にはセーブが渡る');
  assert.equal(M.continueRescueApplies(save(P7, P8, ['done', 'done'], 300), 'solamo', 2), false, '合体を使えるようになれば従来の条件に戻る');
});

test('R11：売却との関係は従来どおり（救済は売却を条件に含めない。売却の可否・売却額・売却後の購入は変わらない）', () => {
  const { P7, P8, M } = load();
  const S = save(P7, P8, ['done', 'done'], 300);
  assert.equal(M.continueRescueApplies(S, 'solamo', 2), true, '売れる個体がいても救済は発生する（売却は条件に含めない：未決のまま従来どおり）');
  const u = S.box[0].uid;
  assert.deepEqual([M.canSell(S, u).ok, M.canSell(S, u).price], [true, 100], '売却の可否・売却額（育成完了・記録なし＝100G）は変わらない');
  assert.deepEqual(M.sell(S, u), { ok: true, uid: u, name: 'ソラモ', sp: 0, kind: 'done', price: 100, before: 300, after: 400 });
  assert.deepEqual(M.canSell(S, S.m.uid), { ok: false, reason: 'last' }, '最後の1体は売却できない');
  assert.deepEqual(M.purchase(S, 'solamo', 1), { ok: true, key: 'solamo', price: 500, rescued: false, before: 400, after: 0, continueRescued: true, topUp: 100 });
  const R = save(P7, P8, ['raising', 'done'], 300);
  assert.equal(M.canSell(R, R.box[0].uid).reason, 'raising', '育成中の個体がいる間は売却できない（従来どおり）');
});

test('R12：合体の処理そのものは残っている（fuse・selm・合体の選択画面・費用200G）。救済の変更は monsters.js の判定だけ。ゲーム側で合体を「使える」と登録していない', () => {
  const fuse = between('async function fuse(){', '\nfunction ');
  assert.match(fuse, /if\(S\.g<200\)return;S\.g-=200;/, '合体費用200Gはそのまま');
  assert.match(HTML, /function selm\(i\)\{/, 'selm は残る');
  assert.match(HTML, /onclick="fuse\(\)">合体させる！（200G）/, '合体の選択画面（farm(\'\',\'c\')）は残る');
  assert.doesNotMatch(HTML, /setFusionAccess/, '研究所の合体UIが未実装のため、index.html は合体を使えると登録しない');
  assert.doesNotMatch(SRC.mo, /S\.(fusion|fuse|canFuse)\b|fusionAccess\s*:/, 'セーブに新しい項目を足さない');
});

test('R6：500G以上なら救済なしで代金500Gだけを支払う。価格・入荷待ち・市場外・所持上限の判定は従来どおり', () => {
  const { P7, P8, M } = load();
  for (const g of [500, 520, 1450]) {
    const S = save(P7, P8, ['done'], g);
    assert.deepEqual(M.purchase(S, 'solamo', 1), { ok: true, key: 'solamo', price: 500, rescued: false, before: g, after: g - 500 });
  }
  const S = save(P7, P8, ['done'], 100);
  assert.deepEqual(M.purchase(S, 'nobiton', 1), { ok: false, reason: 'waiting' }, 'ノビトンは入荷待ちのまま（救済も起きない）');
  assert.deepEqual(M.purchase(S, 'jiol', 1), { ok: false, reason: 'not_in_market' }, 'ジオルは市場に出さない');
  const F = save(P7, P8, Array(8).fill('done'), 100);
  assert.deepEqual(M.purchase(F, 'solamo', 8), { ok: false, reason: 'full' }, '所持上限8体は従来どおり（救済より先に判定）');
  assert.deepEqual(M.MARKET_CATALOG.map((c) => [c.key, c.status, c.price ?? null]), [['solamo', 'sale', 500], ['gauru', 'sale', 500], ['nobiton', 'waiting', null]]);
  assert.deepEqual(M.ECONOMY, { initialGold: 300, marketPrice: 500 });
});

test('R7：二度押し・再読込で補填・購入が二重にならない（実物の adopt()）。確認画面が閉じた後の押下は無視する', () => {
  const { P7, P8, M } = load();
  let S = save(P7, P8, ['done'], 450); const log = [];
  const adopt = adoptOf(P7, P8, M, S, log);
  adopt(0, 'ソラモ'); adopt(0, 'ソラモ');   // 同じ確定ボタンを2回押したのと同じ
  assert.deepEqual([S.g, owned(S), S.cnt], [0, 2, 1], '1体だけ購入・補填も1回');
  assert.match(log[1][1], /をつれて帰った！（牧場に預けました）（育成を続けるため、不足分50Gを補填して購入しました）/);
  assert.deepEqual(log.at(-1), ['market', 'お金が足りません。', 'solamo'], '2回目は未育成個体がいるため救済されず、購入されない');
  S = P8.migrateSave(j(S));   // 再読込
  assert.deepEqual([S.g, owned(S), S.box[0].raise.state], [0, 2, 'none']);
  assert.deepEqual(M.purchase(S, 'solamo', 2), { ok: false, reason: 'no_money' }, '再読込後も救済は起きない（未育成個体がいる）');
  assert.match(lineOf('function mkgo(i){'), /if\(!document\.getElementById\("p10ov"\)\)return;/, '確認画面が閉じた後の二度押しは何もしない');
});

test('R8：画面：購入ボタン・確認画面に継続用救済の説明を出す（初回救済の説明はそのまま）。補填はゲーム側で行わない', () => {
  const info = between('function p10Info(){', '\nfunction p10BuyAsk(');
  assert.match(info, /\$\{chk\.ok&&chk\.rescue\?`<p class="p10note">はじめての1体は、/, '初回救済の説明はそのまま');
  assert.match(info, /\$\{chk\.ok&&chk\.continueRescue\?`<p class="p10note">育成を続けられるモンスターがいないため、所持金が\$\{MMP10M\.ECONOMY\.marketPrice\}Gに満たなくても購入できます/);
  assert.match(info, /\$\{chk\.ok\?`購入する　\$\{P10_COIN\}\$\{c\.price\}G`:P10_WHY\[chk\.reason\]\}/, '購入ボタンの価格表示は従来どおり（500G）');
  const ask = between('function p10BuyAsk(){', '\nfunction p10Close(');
  assert.match(ask, /\$\{chk\.continueRescue\?`<p class="p10note">育成を続けられるモンスターがいないため、所持金を\$\{MMP10M\.ECONOMY\.marketPrice\}Gまで補填してから支払います（購入後の所持金は0Gになります）。<\/p>`:""\}/);
  assert.match(ask, /onclick="mkgo\(\$\{s\.id\}\);p10Close\(\)">連れて帰る（\$\{c\.price\}G）/, '確定ボタンは従来どおり');
  assert.doesNotMatch(HTML, /S\.g\s*=\s*(500\b|MMP10M\.ECONOMY)|S\.g\+=500\b/, 'ゲーム側で勝手に補填しない（補填は MMP10M.purchase の中だけ）');
});

test('R9：低収入（大会なし）でも育成を続けられる：育成完了のたびに「未育成個体」「合体」「救済での購入」のどれかで次の育成へ進める', () => {
  const { P7, P8, M } = load();
  // 収入0Gが続く最も厳しい場合：救済で購入→育成完了→…（合体はできない）。所持上限に届くまでは毎回進める
  let S = P8.newSave(); S.g = 300; const log = []; let adopt = adoptOf(P7, P8, M, S, log);
  adopt(0, 'A'); assert.equal(S.g, 0, '初回救済');
  for (let n = 1; n < 8; n++) {
    S.m.raise.state = 'done'; S.box.forEach((x) => { x.raise.state = 'done'; });   // 育成完了（収入0G）
    assert.equal(M.canPurchase(S, 'solamo', owned(S)).continueRescue, true, `${n}体とも育成完了・0G → 継続用救済`);
    adopt(0, 'B'); assert.deepEqual([S.g, owned(S)], [0, n + 1]);
  }
  S.m.raise.state = 'done'; S.box.forEach((x) => { x.raise.state = 'done'; });
  assert.deepEqual(M.canPurchase(S, 'solamo', 8), { ok: false, reason: 'full' }, '【残る制約】8体とも育成完了・200G未満だと、購入（上限）も合体（200G）もできない');
});
