// =========================================================
// QA 修正 G2：index.html の起動・画面まわりの安全策
//  ・旧データの補正（旧名ハヤテ→ガウル／旧技IDの移行 fx1）を1つの関数 legacyFix にまとめ、
//    起動・セーブスロット・セーブコードの読み込みのすべてで通す（MMP8.migrateSave の補正フック）
//    - ハヤテ→ガウルは種族ガウル（sp 1）の個体だけ。ソラモなどに付けた「ハヤテ」は変えない
//    - fx1 は sk・eq が配列でないと例外で起動全体が止まっていた → 配列のときだけ移行
//  ・slotLoad／imp：読み込み・移行が通ってから S とオートセーブを置き換える。
//    最初の画面の表示で失敗したら元の進行に戻し、保存も元に戻す（読み込めないデータは何も保存しない）
//  ・dep()：連れている個体がいなければ何もしない（null を牧場に入れない）
//  ・わざ（技管理）：旧技表の無い種族・未知の s2・未知の技ID・sk 欠けでも表示できる（正しいデータの見た目は同じ）
//  ・fuse()：親2体と子の種族を確かめてから 200G・合体回数を使う
//  ・育成放棄・最初からやり直す：合体の選択（番号）を解除
//  セーブversion 6・キー mr4v6・checkpoint形式、Phase 6 保護対象は変えていない。
//  index.html の実物のコードを抽出して動かし、実ブラウザ（tests/e2e/harness.mjs）でも確認する。
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
const once = (src, a, b) => { assert.equal(src.split(a).length - 1, 1, '置き換え元は1か所: ' + a.slice(0, 60)); return src.replace(a, () => b); };
function mon(over = {}) {
  return { sp: 0, name: 'ソラモ', age: 0, span: 30, h: 0, rk: 0, fa: 0, st: 0, last: null, li: 100, po: 100, in: 100, hi: 100, ev: 100, de: 100,
    sk: [0, 1, 2, 3], eq: [0, 1, 2, 3, -1, -1], ...over };
}
const GAURU = { sp: 1, name: 'ガウル', li: 80, po: 110, in: 110, hi: 90, ev: 90, de: 60, sk: [10, 11, 12, 13], eq: [10, 11, 12, 13, -1, -1] };
/** 街：未育成のソラモを連れ、牧場に未育成のガウル（ゲームの処理で作ったセーブ） */
function town({ P7, P8 }, g = 300) {
  const S = P8.newSave(); S.g = g; S.playerName = 'テスト'; delete S.playerNamePending; S.npcFlags = { finaIntro: true, raiseIntro: true };
  S.m = P8.initIndividual(S, P7.initProgForNew(mon()));
  S.box = [P8.initIndividual(S, P7.initProgForNew(mon(GAURU)))];
  return S;
}
/** 以前の起動時の補正（変更前の index.html の2行そのまま）。正しいデータでの結果が変わらないことの比較用 */
const OLD_BOOT_FIX = '[S.m,...(S.box||[])].filter(Boolean).forEach(x=>{if(x.name=="ハヤテ")x.name="ガウル"});\n'
  + 'if(!S.fx1){[S.m,...(S.box||[])].filter(Boolean).forEach(x=>{if(x.sp!=0||!x.sk)return;[[4,0],[5,1]].forEach(([o,nw])=>{if(x.sk.includes(o)&&!x.sk.includes(nw)){x.sk=x.sk.map(k=>k==o?nw:k);if(x.eq)x.eq=x.eq.map(k=>k==o?nw:k)}})});S.fx1=1;save()}';
const legacyFixFn = () => new Function(`${lineOf('function legacyFix(')}\nreturn legacyFix;`)();

// ---------------------------------------------------------
// 旧データの補正（legacyFix）
// ---------------------------------------------------------
test('QA-G2-1：旧名ハヤテ→ガウルは種族ガウル（sp 1）の個体だけ。ソラモに付けた「ハヤテ」などは変えない', () => {
  // 守ること：以前は種族を見ずに「ハヤテ」という名前をすべて「ガウル」に変えていた（ソラモの名前がガウルになる）
  const fix = legacyFixFn();
  const S = { fx1: 1, m: mon({ name: 'ハヤテ' }), box: [mon({ ...GAURU, name: 'ハヤテ' }), mon({ ...GAURU, sp: '1', name: 'ハヤテ' }), mon({ ...GAURU, name: 'ハヤテ2' }), mon({ sp: 2, name: 'ハヤテ' })] };
  assert.equal(fix(S), false, 'fx1 済みなら保存の合図は出さない');
  assert.deepEqual([S.m.name, ...S.box.map((x) => x.name)], ['ハヤテ', 'ガウル', 'ガウル', 'ハヤテ2', 'ハヤテ']);
  // 旧名の移行（sp 1 のハヤテ→ガウル）は従来どおり。旧名は正式データの formerNames と一致
  const { M } = load();
  assert.deepEqual(M.byId(1).formerNames, ['ハヤテ']); assert.equal(M.byId(1).name, 'ガウル');
  assert.match(HTML, /if\(x\.sp!=1\)return;if\(x\.name=="ハヤテ"\)x\.name="ガウル"/);
  assert.equal(HTML.split('x.name="ガウル"').length - 1, 1, '名前の補正は legacyFix の1か所だけ');
});

test('QA-G2-2：旧技IDの移行（fx1）は sk・eq が配列でなくても例外を出さない（起動全体が止まらない）', () => {
  // 守ること：以前は fx1 の無いセーブで sk がオブジェクト・文字列、eq が配列でないと「x.sk.includes is not a function」で
  //           index.html の本体スクリプトが止まり、開始画面も出ない真っ白な画面のままだった
  const fix = legacyFixFn();
  const S = { m: mon({ sk: {} }), box: [mon({ sk: '4' }), mon({ sk: [4, 1, 2, 3], eq: {} }), mon({ sk: [4, 5, 2, 3], eq: '4' }), mon({ sk: null }), mon({ sk: undefined, eq: undefined })] };
  let r; assert.doesNotThrow(() => { r = fix(S); });
  assert.equal(r, true); assert.equal(S.fx1, 1);
  assert.deepEqual(S.m.sk, {}); assert.equal(S.box[0].sk, '4', '配列でない sk はそのまま');
  assert.deepEqual(S.box[1].sk, [0, 1, 2, 3]); assert.deepEqual(S.box[1].eq, {}, '配列でない eq はそのまま');
  assert.deepEqual(S.box[2].sk, [0, 1, 2, 3]); assert.equal(S.box[2].eq, '4');
  // 牧場が配列でない・個体が無いセーブでも止まらない
  for (const d of [{}, { m: null, box: {} }, { m: null, box: 'x' }]) assert.doesNotThrow(() => fix(d));
});

test('QA-G2-3：正しいデータでの補正結果（名前・sk・eq・fx1・保存の有無）は以前の起動時の補正と同じ', () => {
  // 守ること：まとめ直しで、旧セーブ（ソラモの旧技ID 4・5）の移行結果や fx1 の扱いが変わらないこと
  const fix = legacyFixFn();
  const cases = [
    { m: mon({ sk: [4, 5, 2, 3], eq: [4, 5, 2, 3, -1, -1] }), box: [] },
    { m: mon({ sk: [4, 0, 2, 3], eq: [4, 0, -1, -1, -1, -1] }), box: [mon({ sk: [5, 1, 2], eq: [5] })] },
    { m: mon({ sk: [0, 1, 2, 3, 4, 5], eq: [4, 5, 0, 1, -1, -1] }), box: [mon({ ...GAURU, sk: [4, 5, 10], eq: [4, 5, 10] })] },
    { m: mon({ sk: [5], eq: undefined }), box: [mon({ sk: [] })] },
    { m: null, box: [mon({ ...GAURU, name: 'ハヤテ' }), mon({ sk: [4, 5] })] },
    { m: mon({ sk: [4, 5, 2, 3] }), box: [], fx1: 1 },
    { m: null, box: [] },
  ];
  for (const c of cases) {
    const a = j(c), b = j(c); let saved = 0;
    new Function('S', 'save', OLD_BOOT_FIX)(a, () => { saved++; });
    const r = fix(b);
    assert.deepEqual(b, a, JSON.stringify(c)); assert.equal(r, saved === 1, '保存の合図も同じ');
  }
});

test('QA-G2-4：旧データの補正は起動・セーブスロット・セーブコードの共通処理（MMP8.migrateSave の読み込み用フック）で通る', () => {
  // 守ること：以前はスロット・セーブコードの読み込み（slotLoad／imp）ではハヤテ→ガウル・fx1 の補正が通らず、
  //           次に再読み込みするまで古い名前・旧技IDのまま保存されていた
  const src = HTML.split('\n');
  const reg = src.findIndex((l) => l === 'MMP8.addSaveNormalizer((d,c)=>{if(!c.isNew)legacyFix(d)});');
  const boot = src.findIndex((l) => l.startsWith('const P8_LOAD='));
  assert.ok(reg >= 0 && reg < boot, '起動時の読み込み（P8_LOAD）より前に登録');
  assert.match(HTML, /let S=P8_LOAD\.S\|\|p10NewSave\(\),sel=\[\],ht="t";\nif\(legacyFix\(S\)\)save\(\);\n/, '新規ゲームは従来どおり起動時に fx1 を付けて保存');
  assert.match(lineOf('function slotLoad('), /MMP8\.migrateSave\(sl\(n\)\)/); assert.match(lineOf('function imp('), /MMP8\.migrateSave\(/);
  const w = load();
  new Function('MMP8', `${lineOf('function legacyFix(')}\n${src[reg]}`)(w.P8);
  const legacyFix = legacyFixFn();
  const make = (v) => { const S = j(town(w)); S.m.name = 'ハヤテ'; S.m.sk = [4, 5, 2, 3]; S.m.eq = [4, 5, 2, 3, -1, -1]; S.box[0].name = 'ハヤテ'; delete S.fx1; S.v = v; return S; };
  // v6（スロット・セーブコード・mr4v6 の起動）
  const raw = make(6), before = JSON.stringify(raw);
  const S = w.P8.migrateSave(raw);
  assert.equal(JSON.stringify(raw), before, '元データは書き換えない');
  assert.deepEqual([S.m.name, S.box[0].name], ['ハヤテ', 'ガウル']);
  assert.deepEqual(S.m.sk, [0, 1, 2, 3]); assert.deepEqual(S.m.eq, [0, 1, 2, 3, -1, -1]); assert.equal(S.fx1, 1);
  const st = { s: { mr4v6: before }, getItem(k) { return k in this.s ? this.s[k] : null; }, setItem(k, v) { this.s[k] = String(v); } };
  const r = w.P8.loadFromStorage(st);
  assert.equal(r.status, 'ok'); assert.equal(r.S.box[0].name, 'ガウル'); assert.equal(r.S.fx1, 1);
  assert.equal(legacyFix(r.S), false, '起動時の2回目の補正は何もしない');
  // v4 の旧セーブ（旧キーからの移行）も同じ
  const v4 = { v: 4, y: 1001, mo: 7, wk: 2, g: 1234, cnt: 3, wins: 5, br: 3, m: mon({ ...GAURU, name: 'ハヤテ' }), box: [mon({ name: 'ハヤテ', sk: [4, 5, 2, 3] })] };
  const S4 = w.P8.migrateSave(j(v4));
  assert.deepEqual([S4.m.name, S4.box[0].name], ['ガウル', 'ハヤテ']); assert.deepEqual(S4.box[0].sk, [0, 1, 2, 3]);
  // 新規セーブ（isNew）には付けない → 起動時に legacyFix が fx1 を付けて保存する（従来どおり）
  const N = w.P8.newSave(); assert.equal('fx1' in N, false); assert.equal(legacyFix(N), true); assert.equal(N.fx1, 1);
});

// ---------------------------------------------------------
// slotLoad／imp：読み込みは「全部できたら置き換え」
// ---------------------------------------------------------
const SLOT_NG = 'このスロットは読み込めません（この版より新しい版のデータ、または壊れたデータです）。';
function slotEnv(migrate, lobbyThrows) {
  const log = [];
  const f = new Function('p8Blocked', 'sl', 'MMP8', 'savescr', 'arm', 'save', 'lobby',
    `let S={g:777,name:'元の進行'},sel=[1];${lineOf('function slotLoad(')};return {run:(n,b)=>slotLoad(n,b),get S(){return S},get sel(){return sel},save(){save()}};`);
  let env;
  env = f(() => false, () => ({ v: 6 }), { migrateSave: migrate }, (m) => log.push(['savescr', m]), () => true,
    () => log.push(['save', JSON.stringify(env.S)]), (m) => { log.push(['lobby', m]); if (lobbyThrows) throw new TypeError('表示の失敗（テスト用）'); });
  return { env, log };
}
test('QA-G2-5：slotLoad：最初の画面の表示で失敗したら元の進行に戻し、オートセーブも元に戻す（読み込み済みの壊れた進行を残さない）', () => {
  // 守ること：以前は S の置き換え・保存のあとに表示で例外が出ると、壊れたスロットの内容がオートセーブに残り、
  //           画面には何も出ないまま（再読み込み後に開始画面から進めない）だった
  const { env, log } = slotEnv((d) => ({ ...d, g: 5 }), true);
  assert.doesNotThrow(() => env.run(1, {}));
  assert.deepEqual(env.S, { g: 777, name: '元の進行' }, '今の進行のまま'); assert.deepEqual(env.sel, []);
  assert.deepEqual(log, [['save', '{"v":6,"g":5}'], ['lobby', 'スロット1をロードしました！'], ['save', '{"g":777,"name":"元の進行"}'], ['savescr', SLOT_NG]],
    '最後の保存は元の進行（オートセーブを元に戻す）');
  // 正しいスロットは従来どおり
  const ok = slotEnv((d) => ({ ...d, loaded: true }), false);
  ok.env.run(2, {});
  assert.deepEqual(ok.env.S, { v: 6, loaded: true }); assert.deepEqual(ok.env.sel, []);
  assert.deepEqual(ok.log, [['save', '{"v":6,"loaded":true}'], ['lobby', 'スロット2をロードしました！']]);
  // 読み込めないスロットは何も保存しない
  for (const mig of [() => null, () => { throw new Error('x'); }]) {
    const ng = slotEnv(mig, false); ng.env.run(3, {});
    assert.deepEqual(ng.env.S, { g: 777, name: '元の進行' }); assert.deepEqual(ng.log, [['savescr', SLOT_NG]]);
  }
});

const code = (o) => Buffer.from(JSON.stringify(o), 'utf8').toString('base64');
function impEnv(value, migrate, lobbyThrows) {
  const log = [];
  const f = new Function('p8Blocked', 'MMP8', '$', 'msg0', 'savescr', 'save', 'lobby',
    `let S={g:777,name:'元の進行'},sel=[1];${lineOf('function imp(')};return {run:()=>imp(),get S(){return S},get sel(){return sel}};`);
  let env;
  env = f(() => false, { migrateSave: migrate }, () => ({ value }), (m) => log.push(['msg0', m]), (m) => log.push(['savescr', m]),
    () => log.push(['save', JSON.stringify(env.S)]), (m) => { log.push(['lobby', m]); if (lobbyThrows) throw new TypeError('表示の失敗（テスト用）'); });
  return { env, log };
}
test('QA-G2-6：imp（セーブコード）：最初の画面の表示で失敗したら元の進行に戻し、オートセーブも元に戻す。正しくないコードは何も保存しない', () => {
  // 守ること：以前は表示で例外が出ると「セーブコードが正しくありません。」と出るのに、読み込んだ進行がオートセーブへ保存済みだった
  const NG = 'セーブコードが正しくありません。';
  const { env, log } = impEnv(code({ v: 6, g: 5, box: [] }), (d) => d, true);
  assert.doesNotThrow(() => env.run());
  assert.deepEqual(env.S, { g: 777, name: '元の進行' }); assert.deepEqual(env.sel, []);
  assert.deepEqual(log, [['save', '{"v":6,"g":5,"box":[]}'], ['lobby', 'ロードしました！'], ['save', '{"g":777,"name":"元の進行"}'], ['savescr', NG]]);
  // 正しいコードは従来どおり
  const ok = impEnv(`  ${code({ v: 6, g: 5, box: [], name: 'ハヤテ' })}\n`, (d) => ({ ...d, loaded: true }), false);
  ok.env.run();
  assert.deepEqual(ok.env.S, { v: 6, g: 5, box: [], name: 'ハヤテ', loaded: true }); assert.deepEqual(ok.env.sel, []);
  assert.deepEqual(ok.log.map((x) => x[0]), ['save', 'lobby']); assert.equal(ok.log[1][1], 'ロードしました！');
  // 正しくないコード（文字化け・JSON でない・移行できない・牧場が配列でない）は今の進行のまま、何も保存しない
  for (const [value, mig] of [['@@@', (d) => d], [Buffer.from('xyz').toString('base64'), (d) => d], [code({ v: 99 }), () => null], [code({ v: 6 }), () => ({ box: 'x' })], [code({ v: 6 }), () => { throw new Error('x'); }]]) {
    const ng = impEnv(value, mig, false); ng.env.run();
    assert.deepEqual(ng.env.S, { g: 777, name: '元の進行' }); assert.deepEqual(ng.env.sel, [1]); assert.deepEqual(ng.log, [['msg0', NG]], value);
  }
});

// ---------------------------------------------------------
// dep・育成放棄・やり直し・合体
// ---------------------------------------------------------
test('QA-G2-7：dep()：連れている個体がいなければ何もしない（牧場に null を入れない・保存しない）', () => {
  // 守ること：以前は S.m が無いときに null を牧場へ入れて保存し、受け取るタブが毎回「null の sp を読めない」で止まっていた
  const depEnv = (S, log) => new Function('S', 'p8Blocked', 'MMP7', 'farm', 'save', `let sel=[1];${lineOf('function dep(')};return {dep,get sel(){return sel}};`)(
    S, () => false, { trainRunOf: () => null }, (m, t) => log.push(['farm', m, t]), () => log.push(['save']));
  const x = mon();
  for (const box of [[x], []]) {
    const S = { m: null, box: [...box] }, log = [], w = depEnv(S, log);
    w.dep();
    assert.deepEqual(S.box, box); assert.equal(S.m, null); assert.deepEqual(log, [['farm', '', 'a']]); assert.deepEqual(w.sel, [1]);
  }
  assert.match(lineOf('function dep('), /^function dep\(\)\{if\(p8Blocked\(\)\)return;if\(!S\.m\)return farm\(""\,"a"\);/, '育成中の拒否（二重ガード）が先');
  // 連れている個体がいれば従来どおり預ける
  const S2 = { m: x, box: [] }, log2 = [], w2 = depEnv(S2, log2);
  w2.dep();
  assert.deepEqual(S2, { m: null, box: [x] }); assert.deepEqual(log2, [['save'], ['farm', '預けました。', 'b']]); assert.deepEqual(w2.sel, []);
});

test('QA-G2-8：育成放棄（p8AbandonGo）・最初からやり直す（reset）で合体の選択（番号）を解除する', () => {
  // 守ること：以前は放棄で個体の並び（番号）が変わっても選択が残り、合体タブで選んでいない2体が選ばれた状態になっていた
  const log = [];
  const ab = new Function('S', '$', 'MMP8', 'p8ModalClose', 'p8Resume', 'save', 'lobby',
    `let sel=[2,0];${lineOf('function p11Esc(t){')}\n${lineOf('function p8AbandonGo(')};return {go:p8AbandonGo,get sel(){return sel}};`)(
    { m: {} }, () => ({ disabled: false }), { abandon: () => ({ ok: true, name: 'A' }) }, () => {}, () => log.push('resume'), () => log.push('save'), (m) => log.push(m));
  ab.go('u1');
  assert.deepEqual(ab.sel, []); assert.deepEqual(log, ['save', 'Aの育成を放棄しました。']);
  // 放棄できなかったとき（別の個体など）は何も変えない
  const ng = new Function('S', '$', 'MMP8', 'p8ModalClose', 'p8Resume', 'save', 'lobby',
    `let sel=[2,0];${lineOf('function p11Esc(t){')}\n${lineOf('function p8AbandonGo(')};return {go:p8AbandonGo,get sel(){return sel}};`)(
    { m: {} }, () => ({ disabled: false }), { abandon: () => ({ ok: false }) }, () => {}, () => {}, () => { throw new Error('保存しない'); }, () => {});
  ng.go('u1'); assert.deepEqual(ng.sel, [2, 0]);
  const clk = { t: 1000 };   // QA G3：reset の2回目は確認状態から0.4秒以上たってから（連打対策）。時計を差し替える
  const rs = new Function('p8Blocked', 'p10NewSave', 'save', 'render', 'performance',
    `let S={g:1},sel=[1,0];${lineOf('function tapAt(')}\n${lineOf('function tapSoon(')}\n${lineOf('function reset(')};return {reset,get sel(){return sel},get S(){return S}};`)(() => false, () => ({ g: 300 }), () => {}, () => {}, { now: () => clk.t });
  const b = { dataset: {}, textContent: '' };
  rs.reset(b); assert.deepEqual(rs.sel, [1, 0], '1回目の押下では何も変えない');
  clk.t += 600; rs.reset(b); assert.deepEqual(rs.sel, []); assert.deepEqual(rs.S, { g: 300 });
});

/** index.html の fuse()（src を差し替えると変更前のコードでも動かせる） */
function loadFuse(w, S, sel, src, rng = () => 0.5) {
  const log = [];
  const stubs = { S, sel, MMP7: w.P7, MMP8: w.P8, p8Blocked: () => false, save: () => log.push('save'), lobby: (m) => log.push(['lobby', m]), fx: async () => {}, Math: Object.create(Math, { random: { value: rng } }) };
  const names = Object.keys(stubs);
  const f = new Function(...names, [lineOf('const SP='), lineOf('const KS='), lineOf('const cname='), lineOf('function mk(sp){'), lineOf('function p11Esc(t){'), src, 'return fuse;'].join('\n'))(...names.map((n) => stubs[n]));
  return { fuse: f, log };
}
const fuseNew = () => between('async function fuse(){', '\nfunction tog(k)');
/** 変更前の fuse()（今のコードから差分を戻したもの） */
const fuseOld = () => once(fuseNew(), 'if(sel.length!=2||!a||!b||a===b)return;const fsp=MMP7.resolveFusionSpecies(a,b);let c;try{c=mk(fsp.sp)}catch(e){return}if(S.g<200)return;S.g-=200;S.cnt=(S.cnt||0)+1;c.rk=',
  'if(S.g<200)return;S.g-=200;S.cnt=(S.cnt||0)+1;const fsp=MMP7.resolveFusionSpecies(a,b);const c=mk(fsp.sp);c.rk=');
test('QA-G2-9：fuse()：親2体がそろっていない・子の種族を作れないときは 200G・合体回数を使わない', async () => {
  // 守ること：以前は所持金・合体回数を先に減らしてから親や子の種族を確かめ、例外で合体できないのに200Gだけ減っていた
  const w = load();
  const pair = () => { const S = town(w, 1000); S.cnt = 4; return S; };
  for (const [label, sel, edit] of [['1体だけ選択', [0]], ['古い番号（2体しかいない）', [2, 0]], ['選択なし', []], ['同じ番号', [0, 0]],
    ['旧技表の無い種族（ノビトン）', [0, 1], (S) => { S.m.sp = 2; }], ['旧技表の無い種族（ジオル）', [0, 1], (S) => { S.m.sp = 3; }]]) {
    const S = pair(); if (edit) edit(S); const before = JSON.stringify(S);
    const { fuse, log } = loadFuse(w, S, sel, fuseNew());
    await assert.doesNotReject(fuse(), label);
    assert.equal(JSON.stringify(S), before, label + '：所持金・合体回数・個体は変わらない'); assert.deepEqual(log, [], label + '：保存しない');
  }
  // 以前のコードでは同じ状況で200G減っていた（このテストが以前のコードで失敗することの確認）
  { const S = pair(); await assert.rejects(loadFuse(w, S, [0], fuseOld()).fuse()); assert.equal(S.g, 800); }
  // 所持金不足は従来どおり何もしない
  { const S = pair(); S.g = 199; const before = JSON.stringify(S); await loadFuse(w, S, [0, 1], fuseNew()).fuse(); assert.equal(JSON.stringify(S), before); }
  assert.match(fuseNew(), /if\(S\.g<200\)return;S\.g-=200;/, '合体料金200G・所持金の判定は変えない');
});

test('QA-G2-10：fuse()：正しい2体の合体結果（子の能力・技・名前・所持金・合体回数）は以前と同じ', async () => {
  // 守ること：確認の順番を入れ替えても、ソラモ・ガウルの合体結果が変わらないこと
  const w = load();
  const strip = (S) => { const o = j(S); if (o.m) { delete o.m.uid; } return o; };
  for (const [sel, rng] of [[[0, 1], () => 0], [[1, 0], () => 0.99], [[0, 1], () => 0.5]]) {
    const A = town(w, 1000), B = j(A); A.cnt = B.cnt = 2;
    A.m.po = B.m.po = 333; A.box[0].rk = B.box[0].rk = 2; A.m.sk.push(4); B.m.sk.push(4); A.m.prog.learnSrc[4] = B.m.prog.learnSrc[4] = 'po';
    const n = loadFuse(w, A, sel, fuseNew(), rng), o = loadFuse(w, B, sel, fuseOld(), rng);
    await n.fuse(); await o.fuse();
    assert.deepEqual(strip(A), strip(B), JSON.stringify(sel)); assert.deepEqual(n.log, o.log);
    assert.equal(A.g, 800); assert.equal(A.cnt, 3); assert.equal(A.box.length, 0); assert.equal(typeof A.m.uid, 'string');
  }
});

// ---------------------------------------------------------
// わざ（技管理）の技一覧
// ---------------------------------------------------------
test('QA-G2-11：技一覧（skl）は旧技表の無い種族・未知の s2 でも例外を出さず、正しいデータでは以前と同じ', () => {
  // 守ること：以前はノビトン・ジオル・未知の種族・未知の s2 で「SKS[m.sp] is not iterable」となり、わざ画面が開けなかった
  const pre = `${lineOf('const SKS=')}\n`;
  const skl = new Function(`${pre}${lineOf('const skl=')}\nreturn skl;`)();
  const old = new Function(`${pre}const skl=m=>[...SKS[m.sp],...(m.s2!=null&&m.s2!=m.sp?SKS[m.s2]:[])];\nreturn skl;`)();
  for (const m of [{ sp: 0 }, { sp: 1 }, { sp: 0, s2: 1 }, { sp: 1, s2: 0 }, { sp: 0, s2: 0 }, { sp: 1, s2: null }, { sp: '1' }, { sp: 0, s2: '1' }])
    assert.deepEqual(skl(m), old(m), JSON.stringify(m));
  for (const m of [{ sp: 2 }, { sp: 3 }, { sp: 99 }, {}, { sp: 'hayate' }]) { assert.throws(() => old(m)); assert.deepEqual(skl(m), [], JSON.stringify(m)); }
  assert.deepEqual(skl({ sp: 0, s2: 99 }), old({ sp: 0 }), '未知の s2 は無いものとして扱う');
  assert.deepEqual(skl({ sp: 2, s2: 1 }), old({ sp: 1 }));
});

// ---------------------------------------------------------
// 実ブラウザ（index.html 全体）
// ---------------------------------------------------------
let L = null;
before(async () => { if (!H.skipReason()) L = await H.launch(); });
after(async () => { if (L) await L.close(); });
/** 開始画面の「はじめる」を押して、復帰先の画面が出るまで待つ */
async function start(p, sel) {
  await p.page.waitForSelector('[onclick*="startGame"]', { timeout: 30000 });
  await p.page.click('[onclick*="startGame"]');
  await p.page.waitForSelector(sel, { timeout: 30000 });
}
const openSaveScreen = async (page) => { await page.evaluate(() => savescr()); await page.waitForSelector('#app button[onclick="slotLoad(1,this)"]'); };
async function slotLoadUI(page, n) {
  await openSaveScreen(page);
  await page.click(`button[onclick="slotLoad(${n},this)"]`);
  await page.waitForFunction((k) => /もう一度押すと読み込み/.test(document.querySelector(`button[onclick="slotLoad(${k},this)"]`).textContent), n);
  await page.waitForTimeout(450);   // QA G3：2度押しの確定は確認状態から0.4秒以上たってから
  await page.click(`button[onclick="slotLoad(${n},this)"]`);
}
async function impUI(page, c) {
  await openSaveScreen(page);
  await page.click('#app details summary');
  await page.fill('#sc', c);
  await page.click('button[onclick="imp()"]');
}

test('QA-G2-B1：実ブラウザ：ソラモに付けた「ハヤテ」は起動で変わらず、スロット・セーブコードの読み込みでも旧データの補正が通る', { skip: H.skipReason() }, async () => {
  // 守ること：以前は起動のたびにソラモの「ハヤテ」がガウルになり、スロット・セーブコードの読み込みでは旧名・旧技IDのまま保存されていた
  const w = load();
  const S0 = j(town(w, 777)); S0.fx1 = 1; S0.m.name = 'ハヤテ'; S0.box[0].name = 'ハヤテ';
  const slot = j(town(w, 555)); delete slot.fx1; [slot.m, slot.box[0]] = [slot.box[0], slot.m];   // 連れているのはガウル
  slot.m.name = 'ハヤテ'; slot.box[0].name = 'ハヤテ'; slot.box[0].sk = [4, 5, 2, 3]; slot.box[0].eq = [4, 5, 2, 3, -1, -1];
  const cd = j(slot); cd.g = 444; cd.m.uid = 'm-code-1'; cd.box[0].uid = 'm-code-2';
  const p = await L.open({ save: S0, raw: { mr4s1: JSON.stringify(slot) } });
  await start(p, '#app .map');
  let S = await H.getS(p.page);
  assert.deepEqual([S.m.sp, S.m.name, S.box[0].sp, S.box[0].name], [0, 'ハヤテ', 1, 'ガウル'], '起動：ソラモのハヤテはそのまま、ガウルの旧名は移行');
  // セーブスロット
  await slotLoadUI(p.page, 1);
  await p.page.waitForFunction(() => /スロット1をロードしました/.test(document.body.innerText));
  S = await H.getS(p.page); let st = await H.storedSave(p.page);
  for (const x of [S, st]) {
    assert.equal(x.g, 555); assert.deepEqual([x.m.sp, x.m.name, x.box[0].sp, x.box[0].name], [1, 'ガウル', 0, 'ハヤテ']);
    assert.deepEqual(x.box[0].sk, [0, 1, 2, 3]); assert.deepEqual(x.box[0].eq, [0, 1, 2, 3, -1, -1]); assert.equal(x.fx1, 1);
  }
  // セーブコード
  await impUI(p.page, code(cd));
  await p.page.waitForFunction(() => /ロードしました！/.test(document.body.innerText) && S.g === 444);
  S = await H.getS(p.page); st = await H.storedSave(p.page);
  for (const x of [S, st]) {
    assert.deepEqual([x.m.uid, x.m.name, x.box[0].name], ['m-code-1', 'ガウル', 'ハヤテ']); assert.deepEqual(x.box[0].sk, [0, 1, 2, 3]); assert.equal(x.fx1, 1);
  }
  assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
});

test('QA-G2-B2：実ブラウザ：読み込んだ直後の画面表示で失敗しても、今の進行とオートセーブは元のまま', { skip: H.skipReason() }, async () => {
  // 守ること：以前は読み込み→保存→表示の順で、表示で失敗すると壊れた内容がオートセーブに残っていた
  //  （表示の失敗は lobby を一時的に差し替えて再現する。本物の壊れたデータに依存しない）
  const w = load();
  const S0 = j(town(w, 777)), slot = j(town(w, 5));
  const p = await L.open({ save: S0, raw: { mr4s2: JSON.stringify(slot) } });
  await start(p, '#app .map');
  await p.page.evaluate(() => { window.__lobby = lobby; window.lobby = function (t) { if (/ロードしました/.test(String(t))) throw new TypeError('表示の失敗（テスト用）'); return window.__lobby.apply(this, arguments); }; });
  await impUI(p.page, code(slot));
  await p.page.waitForFunction(() => document.getElementById('msg') && document.getElementById('msg').textContent === 'セーブコードが正しくありません。');
  assert.equal((await H.getS(p.page)).g, 777); assert.equal((await H.storedSave(p.page)).g, 777);
  await slotLoadUI(p.page, 2);
  await p.page.waitForFunction(() => document.getElementById('msg') && /このスロットは読み込めません/.test(document.getElementById('msg').textContent));
  assert.equal((await H.getS(p.page)).g, 777); assert.equal((await H.storedSave(p.page)).g, 777);
  // 表示できれば従来どおり読み込む
  await p.page.evaluate(() => { window.lobby = window.__lobby; });
  await slotLoadUI(p.page, 2);
  await p.page.waitForFunction(() => /スロット2をロードしました/.test(document.body.innerText));
  assert.equal((await H.getS(p.page)).g, 5); assert.equal((await H.storedSave(p.page)).g, 5);
  assert.deepEqual(p.errors, []);
});

test('QA-G2-B3：実ブラウザ：わざ（技管理）は未知の種族・s2・技ID・sk 欠けでも開け、正しいデータの見た目は以前と同じ', { skip: H.skipReason() }, async () => {
  // 守ること：以前は「SKS[m.sp] is not iterable」「reading '7'」「reading 'includes'」で画面が開けなかった
  const w = load();
  const S0 = j(town(w, 777)); S0.m.s2 = 1; S0.m.sk = [0, 1, 2, 3, 4, 14]; S0.m.eq = [0, 14, 2, -1, 4, -1];
  const p = await L.open({ save: S0 });
  await start(p, '#app .map');
  // 変更前の dscr・skSheet（今のコードから差分を戻したもの）
  const R = [['const own=Array.isArray(m.sk)?m.sk:[],st3=(k)=>k<0||!SK[k]?`', 'const st3=(k)=>k<0?`'], ['const rows=m.eq.map((k,q)=>k<0||!SK[k]?`', 'const rows=m.eq.map((k,q)=>k<0?`'],
    ['ok=own.includes(k),at=m.eq.indexOf(k);return `<div class="dsk', 'ok=m.sk.includes(k),at=m.eq.indexOf(k);return `<div class="dsk'],
    ['const n=m.eq.filter(x=>x>=0&&SK[x]).length;', 'const n=m.eq.filter(x=>x>=0).length;'], ['${own.length} / ${skl(m).length}', '${m.sk.length} / ${skl(m).length}']];
  const R2 = [['ok=Array.isArray(m.sk)&&m.sk.includes(k),', 'ok=m.sk.includes(k),']];
  const n = await p.page.evaluate(([R, R2]) => {
    const swap = (src, rs) => { for (const [a, b] of rs) { if (src.split(a).length !== 2) throw new Error('差分が見つからない: ' + a); src = src.replace(a, () => b); } return src; };
    window.__new = { dscr, skSheet }; window.__old = { dscr: swap(dscr.toString(), R), skSheet: swap(skSheet.toString(), R2) };
    return Object.keys(window.__old).length;
  }, [R, R2]);
  assert.equal(n, 2);
  const render = (which, last) => p.page.evaluate(([which, last]) => {
    if (which === 'old') { (0, eval)(window.__old.dscr); (0, eval)(window.__old.skSheet); } else { window.dscr = window.__new.dscr; window.skSheet = window.__new.skSheet; }
    lastSk = last; hall('w'); const d = document.getElementById('dsh');
    return { app: document.getElementById('app').innerHTML, sheet: d ? d.innerHTML : null };
  }, [which, last]);
  for (const last of [-1, 0, 14, 7]) {
    const a = await render('new', last), b = await render('old', last);
    assert.equal(a.app, b.app, `わざ画面（lastSk=${last}）`); assert.equal(a.sheet, b.sheet);
    assert.match(a.app, /バトルのルーレット/);
  }
  // 壊れた・未対応のデータ（ページ内だけで書き換え。保存はしない）
  const cases = [['ノビトン', { sp: 2 }], ['ジオル', { sp: 3 }], ['未知の種族', { sp: 99 }], ['未知の s2', { s2: 99 }], ['未知の技ID', { eq: [0, 1, 2, 3, 99, -1] }],
    ['文字列の技ID', { eq: [0, 'x', 2, 3, -1, -1] }], ['sk 欠け', { sk: undefined }]];
  for (const [label, edit] of cases) {
    const r = await p.page.evaluate(([edit]) => {
      const bk = JSON.stringify(S.m); Object.assign(S.m, edit); if ('sk' in edit && edit.sk === undefined) delete S.m.sk;
      const out = {};
      for (const which of ['new', 'old']) {
        if (which === 'old') { (0, eval)(window.__old.dscr); (0, eval)(window.__old.skSheet); } else { window.dscr = window.__new.dscr; window.skSheet = window.__new.skSheet; }
        try { lastSk = 0; hall('w'); out[which] = { ok: true, text: document.getElementById('app').innerText, miss: document.querySelectorAll('#app .rw.ms').length, sheet: !!document.getElementById('dsh') }; } catch (e) { out[which] = { ok: false, err: String(e.message) }; }
      }
      window.dscr = window.__new.dscr; window.skSheet = window.__new.skSheet; lastSk = -1;
      S.m = JSON.parse(bk); return out;
    }, [edit]);
    assert.equal(r.new.ok, true, `${label}：${r.new.err || ''}`); assert.match(r.new.text, /バトルのルーレット/, label); assert.equal(r.new.sheet, true, label);
    if (label === '未知の技ID' || label === '文字列の技ID') {
      assert.equal(r.new.miss, label === '未知の技ID' ? 2 : 3, label + '：未知の技は空き枠（ミス）と同じ表示'); assert.equal(r.old.ok, false, label + '：以前のコードでは開けない');
    }
    if (label === 'sk 欠け') assert.equal(r.old.ok, false, '以前のコードでは開けない');
  }
  assert.deepEqual(p.errors, []);
});

test('QA-G2-B4：実ブラウザ：育成放棄で合体の選択を解除／連れていないときの dep()／親がそろわない fuse() は何もしない', { skip: H.skipReason() }, async () => {
  // 守ること：以前は放棄後も古い番号の選択が残り、dep() は null を牧場へ入れて保存、fuse() は200Gだけ減らしていた
  const w = load();
  const S0 = j(town(w, 1000)); S0.box.push(j(S0.box[0])); S0.box[1].uid = 'm-extra-1'; S0.box[1].name = 'ガウB';
  const p = await L.open({ save: S0 });
  await start(p, '#app .map');
  // 3体のうち ①ガウB ②ソラモ を選んでから出発 → 育成放棄（2段階確認。待ち時間のボタンはテストでは待たずに有効化）
  await p.page.evaluate(() => { farm('', 'c'); selm(2); selm(0); });
  assert.deepEqual(await p.page.evaluate(() => sel), [2, 0]);
  await p.page.evaluate(() => { MMP8.depart(S, S.m); save(); p8Resume(); });
  await p.page.waitForSelector('#brollbtn');
  await p.page.evaluate(() => { p8AbandonAsk(); p8AbandonAsk2(S.m.uid); document.getElementById('p8abgo').disabled = false; });
  await p.page.click('#p8abgo');
  await p.page.waitForSelector('#app .map');
  assert.deepEqual(await p.page.evaluate(() => sel), [], '放棄で選択を解除');
  await p.page.evaluate(() => farm('', 'c'));
  assert.equal(await p.page.evaluate(() => document.querySelectorAll('#app .wpanel .t.on').length), 0, '合体タブに選択済みの個体が無い');
  // 連れていない状態で dep()
  const before = await H.storedSave(p.page);
  assert.equal(before.m, null); assert.equal(before.box.length, 2);
  await p.page.evaluate(() => dep());
  assert.match(await H.text(p.page), /いま連れているモンスターはいません。/);
  assert.deepEqual(await H.storedSave(p.page), before, '保存内容は変わらない'); assert.equal((await H.getS(p.page)).box.length, 2);
  // 親がそろわない fuse()
  const g0 = (await H.getS(p.page)).g;
  await p.page.evaluate(async () => { sel = [0]; await fuse(); sel = [5, 0]; await fuse(); sel = []; });
  const S = await H.getS(p.page);
  assert.equal(S.g, g0); assert.equal(S.box.length, 2); assert.deepEqual(await H.storedSave(p.page), before);
  await p.page.evaluate(() => farm('', 'b'));
  await p.page.waitForFunction(() => /受け取る/.test(document.body.innerText));
  assert.deepEqual(p.errors, []);
});

test('QA-G2-B5：実ブラウザ：新規開始→市場で購入→牧場→出発（育成開始）まで、エラーなしで進める', { skip: H.skipReason() }, async () => {
  // 守ること：今回の修正（起動時の補正・読み込み・牧場・合体まわり）で通常の流れを壊していないこと
  const p = await L.open();
  await H.newGame(p.page, 'スモーク');
  await p.page.waitForSelector('#app .map');
  assert.equal((await H.storedSave(p.page)).fx1, 1, '新規ゲームは従来どおり fx1 付きで保存');
  await p.page.click('.hz[onclick="market()"]');
  await H.marketDetail(p.page); await p.page.waitForSelector('.p10buy:not([disabled])');
  await p.page.waitForFunction(() => !P10_ANIM);
  await H.marketDetail(p.page); await p.page.click('.p10buy');
  await p.page.waitForSelector('#p10ov .p10ok');
  await p.page.waitForTimeout(400);   // QA G3：確認シートを開いた直後（0.35秒）のタップは受け付けない
  await p.page.click('#p10ov .p10ok');
  await p.page.waitForSelector('#app .map');
  let S = await H.getS(p.page);
  assert.equal(S.m.sp, 0); assert.equal(S.m.name, 'ソラモ'); assert.equal(S.g, 0);
  await p.page.click('.hz[onclick="farm()"]');
  await p.page.waitForSelector('#app .ftiles');
  await p.page.click('#app button.back');
  await p.page.waitForSelector('#app .map');
  await p.page.click('.hz[onclick="hall()"]');
  await p.page.click('#app button[onclick="prepScr()"]');
  await p.page.waitForSelector('#app button[onclick="p7Depart(this)"]');
  await p.page.click('#app button[onclick="p7Depart(this)"]');
  await H.finishTalk(p.page);
  await p.page.waitForFunction(() => /もう一度押すと育成開始/.test((document.querySelector('#app button[onclick="p7Depart(this)"]') || {}).textContent || ''));
  await p.page.waitForTimeout(450);   // QA G3：2度押しの確定は確認状態から0.4秒以上たってから
  await p.page.click('#app button[onclick="p7Depart(this)"]');
  await p.page.waitForSelector('#brollbtn');
  S = await H.getS(p.page);
  assert.equal(S.m.raise.state, 'board'); assert.equal(S.m.raise.ch, 1);
  assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
});
