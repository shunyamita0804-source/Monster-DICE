// =========================================================
// QA：合体（ぽかぽか牧場の「合体」タブ）と、牧場の操作を続けたときの整合性
//  ・合体：ベース（①）→相手（②）→プレビュー→誕生。200G・2体→1体・親の uid が消える・子は新しい uid の未育成個体
//  ・子の技は今の技表（index.html の旧来の技表）の範囲だけ・重複なし・装備6枠
//  ・預ける／受け取る／売却／合体／購入を決まった順で続けても、手持ち・牧場・所持金がモデルと一致する
//  実ブラウザ（tests/e2e/harness.mjs）で index.html 全体を動かして確かめる。
//  （2度押しの間は 600ms 以上、画面が変わってからお金・個体が動くボタンを押すまで 500ms 以上あける）
//  仕様：CLAUDE.md §3「経済・市場・売却」（合体費用 200G、所持上限は手持ち＋牧場で8体・牧場は7体まで）
//  牧場・売却の画面テストは tests/qa-e2e-ranch-fusion.test.mjs
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
/** 再現可能な乱数（線形合同法） */
function lcg(seed) { let x = seed >>> 0; return () => { x = (Math.imul(x, 1103515245) + 12345) >>> 0; return (x >>> 1) / 0x80000000; }; }
const KS = ['li', 'po', 'in', 'hi', 'ev', 'de'];
const owned = (S) => [S.m, ...S.box].filter(Boolean);

// ---------------------------------------------------------
// 実ブラウザ：合体（index.html 全体）
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
  else if (tab === 'c') { await pg.evaluate(() => museum('fuse')); await pg.waitForSelector('.lbf .wpanel'); return; }   // 2026-10-04：合体は研究所（museum('fuse')＝labFuse）。選択 selm・誕生 fuse は従来どおり
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

test('QA-RF-B10：合体（ベース→相手→誕生）：200G・2体→1体、親の uid は消え、子は新しい uid の未育成個体として手持ちへ', { skip: H.skipReason() }, async () => {
  const p = await town(); const pg = p.page;
  try {
    const [ua, ub, uc] = await seed(pg, [{ sp: 0, name: 'ソラA' }, { sp: 1, name: 'ガウB' }, { sp: 0, name: 'ソラC' }], 1000);
    await pg.evaluate(() => { S.raiseRec = { done: 2, fromStart: true }; save(); });
    await toRanch(pg, 'c');
    assert.deepEqual(await pg.evaluate(() => [...document.querySelectorAll('.fz .slot')].map((x) => x.innerText.trim())), ['えらんでね', 'えらんでね']);
    assert.equal(await pg.$('.wpanel .go'), null);
    // ベース（①）：ガウB
    await tap(pg, '.wpanel button[onclick="selm(1)"]');
    await pg.waitForFunction(() => sel.length === 1);
    assert.deepEqual(await pg.evaluate(() => sel), [1]);
    assert.match(await txt(pg, '.wpanel button[onclick="selm(1)"]'), /^① ガウB/);
    assert.equal(await pg.$('.wpanel .go'), null);                               // 1体だけでは合体ボタンが出ない
    // 相手（②）：ソラC
    await tap(pg, '.wpanel button[onclick="selm(2)"]');
    await pg.waitForFunction(() => sel.length === 2);
    assert.deepEqual(await pg.evaluate(() => sel), [1, 2]);
    assert.match(await txt(pg, '.wpanel button[onclick="selm(2)"]'), /^② ソラC/);
    const card = await txt(pg, '.wpanel .card');
    assert.match(card, /生まれるモンスター：ガウラC/);
    assert.match(card, /ライフ 108 ちから 126 かしこさ 126 命中 114 回避 114 丈夫さ 96/);
    assert.equal(await pg.getAttribute('.wpanel .go', 'onclick'), 'fuse()');
    assert.equal(await pg.evaluate(() => document.querySelector('.wpanel .go').disabled), false);
    const before = await H.getS(pg);
    await tap(pg, '.wpanel .go');
    await pg.waitForFunction(() => /新しいモンスター ガウラC が生まれた！/.test((document.querySelector('#msg') || {}).innerText || ''), null, { timeout: 8000 });
    const s = await H.storedSave(pg);
    assert.equal(s.g, 800);
    assert.equal(owned(s).length, 2);
    // 子：手持ち。連れていたソラA（選ばなかった）は牧場へ
    const c = s.m;
    assert.deepEqual(s.box.map((x) => x.uid), [ua]);
    assert.ok(![ua, ub, uc].includes(c.uid)); assert.match(c.uid, /^m-/);
    for (const u of [ub, uc]) assert.ok(!JSON.stringify(s).includes(u), '親の uid が残っていない');
    assert.equal(c.name, 'ガウラC'); assert.equal(c.sp, 1); assert.equal(c.speed, 7);
    assert.deepEqual(KS.map((k) => c[k]), [108, 126, 126, 114, 114, 96]);
    assert.ok(c.s2 == null || (Number.isInteger(c.s2) && c.s2 !== c.sp && [0, 1].includes(c.s2)), `s2=${c.s2}`);   // 第2種族も今の種族を指す
    // 子は未育成の新しい個体（育成記録・ランク・修行回数は引き継がない）
    assert.equal(c.raise.state, 'none'); assert.equal(c.raise.startStats, undefined); assert.deepEqual(c.raise.log, []);
    assert.deepEqual(c.prog.rankClr, [false, false, false, false, false, false]);
    assert.deepEqual(c.prog.train, { po: 0, in: 0, hi: 0, ev: 0, de: 0 });
    assert.deepEqual(s.raiseRec, before.raiseRec);                               // 合体では育成完了回数は増えない
    assert.deepEqual(await pg.evaluate(() => sel), []);
    // 街：子を連れている（街にモンスターカードは出さない。2026-09-30。名前は案内文と連れている個体で確かめる）
    assert.equal(await pg.evaluate(() => S.m.name), 'ガウラC'); assert.equal(await pg.$('#app .card'), null);
    assert.equal(await pg.evaluate(() => document.querySelector('.hz[onclick="hall()"]').disabled), false);
    await invariants(p);
  } finally { await p.ctx.close(); }
});

test('QA-RF-B11：合体の選択：3体目は選べない・選び直せる。プレビューの名前と能力（上限999）が生まれる子と一致する', { skip: H.skipReason() }, async () => {
  const p = await town(); const pg = p.page;
  try {
    await seed(pg, [
      { sp: 0, name: 'ツヨイ', set: { li: 999, po: 999, in: 400 } },
      { sp: 1, name: 'ハヤイ', set: { li: 700 } },
      { sp: 0, name: 'カシコイ', set: { li: 999, po: 900, in: 999 } },
    ], 500);
    await toRanch(pg, 'c');
    await tap(pg, '.wpanel button[onclick="selm(0)"]');
    await tap(pg, '.wpanel button[onclick="selm(1)"]');
    await tap(pg, '.wpanel button[onclick="selm(2)"]');                       // 3体目は無視
    assert.deepEqual(await pg.evaluate(() => sel), [0, 1]);
    assert.equal(await pg.evaluate(() => document.querySelectorAll('.wpanel button.t.on').length), 2);
    // ①ツヨイを外す → ②だったハヤイが①になる。ハヤイも外して、カシコイ（①）・ツヨイ（②）の順に選び直す
    await tap(pg, '.wpanel button[onclick="selm(0)"]');
    assert.deepEqual(await pg.evaluate(() => sel), [1]);
    assert.match(await txt(pg, '.wpanel button[onclick="selm(1)"]'), /^① ハヤイ/);
    await tap(pg, '.wpanel button[onclick="selm(1)"]');                       // ハヤイも外す
    await tap(pg, '.wpanel button[onclick="selm(2)"]');                       // ①カシコイ
    await tap(pg, '.wpanel button[onclick="selm(0)"]');                       // ②ツヨイ
    assert.deepEqual(await pg.evaluate(() => sel), [2, 0]);
    const card = await txt(pg, '.wpanel .card');
    // cname(カシコイ, ツヨイ)＝先頭2文字＋末尾2文字、能力＝min(999, round((a+b)×0.6))
    assert.match(card, /生まれるモンスター：カシヨイ/);
    const want = { li: 999, po: 999, in: 839, hi: 120, ev: 120, de: 120 };
    assert.match(card, new RegExp(KS.map((k) => `${{ li: 'ライフ', po: 'ちから', in: 'かしこさ', hi: '命中', ev: '回避', de: '丈夫さ' }[k]} ${want[k]}`).join(' ')));
    await tap(pg, '.wpanel .go');
    await pg.waitForFunction(() => /新しいモンスター カシヨイ が生まれた！/.test((document.querySelector('#msg') || {}).innerText || ''), null, { timeout: 8000 });
    const s = await H.storedSave(pg);
    assert.equal(s.m.name, 'カシヨイ'); assert.equal(s.m.sp, 0);
    assert.deepEqual(Object.fromEntries(KS.map((k) => [k, s.m[k]])), want);
    assert.equal(s.g, 300);
    assert.deepEqual(names(s), ['カシヨイ', 'ハヤイ']);
    await invariants(p);
  } finally { await p.ctx.close(); }
});

test('QA-RF-B12：合体の子の技：今の技表の範囲だけ・重複なし・装備6枠。継承は親の追加技からだけ（初期技・必殺技は継承しない）', { skip: H.skipReason() }, async () => {
  const p = await town(); const pg = p.page;
  try {
    // 旧セーブから引き継いだ「覚えた技」を持つ親（今の修行は能力上昇だけのため、画面の操作では作れない）
    await seed(pg, [
      { sp: 0, name: 'ソラモA', set: { sk: [0, 1, 2, 3, 4, 8], eq: [0, 1, 2, 3, 4, 8] } },
      { sp: 1, name: 'ガウルB', set: { sk: [10, 11, 12, 13, 15], eq: [10, 11, 12, 13, 15, -1] } },
      { sp: 0, name: 'ソラモC', set: { sk: [0, 1, 2, 3, 5, 9], eq: [0, 1, 2, 3, 5, 9] } },
      { sp: 0, name: 'ソラモD' },
    ], 1000);
    await pg.evaluate(() => {
      Object.assign(S.m.prog.learnSrc, { 4: 'po', 8: 'de' }); Object.assign(S.box[0].prog.learnSrc, { 15: 'in' }); Object.assign(S.box[1].prog.learnSrc, { 5: 'in', 9: 'de' }); save();
    });
    /** 選んだ2体を合体させる（技の抽選は r で固定）。子と、合体前の継承候補を返す */
    async function fuseWith(i, k, r) {
      await pg.evaluate(() => farm('', 'c'));
      await tap(pg, `.wpanel button[onclick="selm(${i})"]`);
      await tap(pg, `.wpanel button[onclick="selm(${k})"]`);
      const cand = await pg.evaluate(([i, k, r]) => {
        const all = [S.m, ...S.box].filter(Boolean), a = all[i], b = all[k];
        const c = MMP7.fusionInheritCandidates(a, b, [...(MMP7.getMoveset(a.sp) || { initial: SP[a.sp][6] }).initial]);
        window.__rnd = Math.random; Math.random = () => r;                   // 抽選を固定（合体の処理の間だけ）
        return c;
      }, [i, k, r]);
      await tap(pg, '.wpanel .go');
      await pg.waitForFunction(() => /新しいモンスター/.test((document.querySelector('#msg') || {}).innerText || ''), null, { timeout: 8000 });
      await pg.evaluate(() => { Math.random = window.__rnd; });
      const child = await pg.evaluate(() => ({ c: JSON.parse(JSON.stringify(S.m)), skl: skl(S.m), n: SK.length, spc: [...((DJP[S.m.sp] || {}).de || []), ...(S.m.s2 != null && DJP[S.m.s2] ? DJP[S.m.s2].de : [])] }));
      return { ...child, cand };
    }
    const check = ({ c, skl, n, spc }, init) => {
      assert.ok(c.sk.every((x) => Number.isInteger(x) && x >= 0 && x < n), `技表の範囲 ${c.sk}`);
      assert.ok(c.sk.every((x) => skl.includes(x)), `種族の技一覧の範囲 ${c.sk} / ${skl}`);
      assert.equal(new Set(c.sk).size, c.sk.length, '重複なし');
      assert.ok(c.sk.length <= 6);
      assert.deepEqual(c.sk.slice(0, 4), init, '子の初期4技');
      assert.ok(!c.sk.slice(4).some((x) => spc.includes(x)), '必殺技は継承しない');
      assert.equal(c.eq.length, 6);
      assert.deepEqual(c.eq.filter((x) => x !== -1), c.sk, '装備は覚えている技だけ（順番どおり）');
      assert.ok(c.eq.every((x) => x === -1 || c.sk.includes(x)));
      assert.deepEqual(Object.keys(c.prog.learnSrc).map(Number).sort((a, b) => a - b), [...c.sk].sort((a, b) => a - b));
    };
    // 1回目：ソラモA＋ガウルB。候補はAの4（8は必殺技）とBの15。抽選 0.999 → 最後の候補
    const f1 = await fuseWith(0, 1, 0.999);
    assert.deepEqual(f1.cand, [4, 15]);
    check(f1, [0, 1, 2, 3]);
    assert.deepEqual(f1.c.sk, [0, 1, 2, 3, 15]); assert.equal(f1.c.prog.learnSrc[15], 'inherit'); assert.equal(f1.c.s2, 1);
    // 2回目：いまの手持ち（1回目の子）＋ソラモC。候補は子の15とCの5（9は必殺技）。抽選 0 → 最初の候補
    const s1 = await H.getS(pg);
    assert.deepEqual(names(s1), ['ソラルB', 'ソラモC', 'ソラモD']);           // 子（ソラ＋ルB）が手持ち、残りは牧場
    const f2 = await fuseWith(0, 1, 0);
    assert.deepEqual(f2.cand, [15, 5]);
    check(f2, [0, 1, 2, 3]);
    assert.deepEqual(f2.c.sk, [0, 1, 2, 3, 15]);
    const s2 = await H.getS(pg);
    assert.deepEqual(names(s2), ['ソラモC', 'ソラモD']);
    assert.equal(s2.g, 600);
    await invariants(p);
  } finally { await p.ctx.close(); }
});

test('QA-RF-B13：合体できない：所持金199G（ボタンが押せず、直接呼び出しでも何も変わらない）', { skip: H.skipReason() }, async () => {
  const p = await town(); const pg = p.page;
  try {
    const uids = await seed(pg, [{ sp: 0, name: 'ソラA' }, { sp: 1, name: 'ガウB' }], 199);
    await toRanch(pg, 'c');
    await tap(pg, '.wpanel button[onclick="selm(0)"]');
    await tap(pg, '.wpanel button[onclick="selm(1)"]');
    assert.match(await txt(pg, '.wpanel .card'), /生まれるモンスター：ソラウB/);
    assert.equal(await pg.evaluate(() => document.querySelector('.wpanel .go').disabled), true);
    const snap = await H.storedSave(pg);
    await pg.evaluate(async () => { await fuse(); });
    assert.deepEqual(await H.storedSave(pg), snap);
    const mem = await H.getS(pg);
    assert.equal(mem.g, 199); assert.deepEqual(owned(mem).map((x) => x.uid), uids);
    await invariants(p);
  } finally { await p.ctx.close(); }
});

test('QA-RF-B14：合体ボタンのダブルクリックでも合体は1回だけ（200G・2体→1体）', { skip: H.skipReason() }, async () => {
  const p = await town(); const pg = p.page;
  try {
    const [ua, ub, uc] = await seed(pg, [{ sp: 0, name: 'ソラA' }, { sp: 0, name: 'ソラB' }, { sp: 1, name: 'ガウC' }], 1000);
    await toRanch(pg, 'c');
    await tap(pg, '.wpanel button[onclick="selm(0)"]');
    await tap(pg, '.wpanel button[onclick="selm(1)"]');
    await pg.waitForTimeout(500);
    const h = await pg.waitForSelector('.wpanel .go');
    await h.evaluate((e) => e.scrollIntoView({ block: 'center' }));
    await h.dblclick({ force: true });
    await pg.waitForFunction(() => /新しいモンスター ソララB が生まれた！/.test((document.querySelector('#msg') || {}).innerText || ''), null, { timeout: 8000 });
    await pg.waitForTimeout(300);                                               // 2回目の押下の後始末を待つ
    const s = await H.storedSave(pg);
    assert.equal(s.g, 800);
    assert.equal(owned(s).length, 2);
    assert.deepEqual(s.box.map((x) => x.uid), [uc]);
    assert.ok(![ua, ub, uc].includes(s.m.uid));
    for (const u of [ua, ub]) assert.ok(!JSON.stringify(s).includes(u));
    await invariants(p);
  } finally { await p.ctx.close(); }
});

test('QA-RF-B15：預ける・受け取る・売却・合体・購入を決まった乱数の順で続けても、手持ち・牧場・所持金がモデルどおりで、再読込後も同じ', { skip: H.skipReason() }, async (t) => {
  const p = await town(); const pg = p.page;
  try {
    const uids = await seed(pg, [{ sp: 0, name: 'P0' }, { sp: 1, name: 'P1' }, { sp: 0, name: 'P2' }, { sp: 1, name: 'P3' }, { sp: 0, name: 'P4' }, { sp: 1, name: 'P5' }], 3000);
    // 育成完了の個体も混ぜる（売却額は 100G＋上昇150G（上限）＋ランクD 50G ＝ 300G／記録なし 100G）
    await pg.evaluate(() => {
      const st = (v) => ({ li: v, po: v, in: v, hi: v, ev: v, de: v });
      Object.assign(S.box[2].raise, { state: 'done', startStats: st(100), endStats: st(130) }); S.box[2].prog.rankClr = [true, true, false, false, false, false];
      S.box[0].raise.state = 'done'; save();
    });
    const M = { m: uids[0], box: uids.slice(1), g: 3000 };                      // モデル（uid と所持金）
    const all = () => [M.m, ...M.box].filter(Boolean);
    const rnd = lcg(20260928);
    const done = [];
    async function openTab(tab) {
      if (!(await pg.$('.ftile'))) { await pg.waitForSelector('#app .map'); await tap(pg, '.hz[onclick="farm()"]'); await pg.waitForSelector('.ftile'); }
      if (tab === 'c') await pg.evaluate(() => farm('', 'c')); else await tap(pg, tab === 'd' ? '.fsell' : `.ftile[onclick="farm('','${tab}')"]`);   // 合体は内部の選択画面を直接開く
      await pg.waitForFunction((t) => ft === t, tab);
    }
    async function toTown() { if (!(await pg.$('#app .map'))) { await tap(pg, '.back'); await pg.waitForSelector('#app .map'); } }
    const OPS = {
      async dep() {
        if (!M.m) return false;
        await openTab('a');
        if (M.box.length >= 7) {                                                // 牧場が7体：断られて何も変わらない
          await tap(pg, '.wpanel .go[onclick="dep()"]');
          await pg.waitForFunction(() => /牧場がいっぱいです。/.test(document.querySelector('.fbub').innerText));
          return 'dep(満杯)';
        }
        await tap(pg, '.wpanel .go[onclick="dep()"]');
        await pg.waitForFunction(() => S.m === null);
        M.box.push(M.m); M.m = null; return 'dep';
      },
      async wd(r) {
        if (!M.box.length) return false;
        const k = Math.floor(r * M.box.length);
        await openTab('b');
        await tap(pg, `.wpanel button[onclick="wd(${k})"]`);
        const x = M.box.splice(k, 1)[0];
        await pg.waitForFunction((u) => S.m && S.m.uid === u, x);
        if (M.m) M.box.push(M.m); M.m = x; return `wd(${k})`;
      },
      async sell(r) {
        const a = all(); if (a.length < 2) return false;
        const i = Math.floor(r * a.length);
        const price = await pg.evaluate((u) => MMP10M.sellQuote([S.m, ...S.box].find((x) => x && x.uid === u)).price, a[i]);
        await openTab('d');
        await tap(pg, `.wpanel button[onclick="pfSellPick(${i})"]`);
        await pg.waitForSelector('.pfsell');
        await tap(pg, '.wpanel button[onclick="pfSellGo(this)"]');
        await tap(pg, '.wpanel button[onclick="pfSellGo(this)"]', 650);
        await pg.waitForFunction(() => /売却しました/.test(document.querySelector('.fbub').innerText));
        if (M.m === a[i]) M.m = null; else M.box.splice(M.box.indexOf(a[i]), 1);
        M.g += price; return `sell(${i}) ${price}G`;
      },
      async fuse(r, r2) {
        const a = all(); if (a.length < 2 || M.g < 200) return false;
        const i = Math.floor(r * a.length), k = (i + 1 + Math.floor(r2 * (a.length - 1))) % a.length;
        await openTab('c');
        await tap(pg, `.wpanel button[onclick="selm(${i})"]`);
        await tap(pg, `.wpanel button[onclick="selm(${k})"]`);
        await tap(pg, '.wpanel .go');
        await pg.waitForFunction(() => /新しいモンスター/.test((document.querySelector('#msg') || {}).innerText || ''), null, { timeout: 8000 });
        const child = await pg.evaluate(() => S.m.uid);
        assert.ok(!a.includes(child), '子は新しい uid');
        M.box = a.filter((x, n) => n !== i && n !== k); M.m = child; M.g -= 200; return `fuse(${i},${k})`;
      },
      async buy(r) {
        const key = r < 0.5 ? 'solamo' : 'gauru';
        if (all().length < 8 && M.g < 500) return false;
        await toTown();
        await tap(pg, '.hz[onclick="market()"]');
        await pg.waitForSelector('#p10car');
        await pg.evaluate((k) => market(null, k), key);
        await pg.waitForFunction((k) => !P10_ANIM && $('#p10info .p10buy').dataset.key === k, key);
        if (all().length >= 8) {                                                // 8体：押せない
          await H.marketDetail(pg);                                             // 詳細を開いてから、見えている購入ボタンの文言を確かめる
          assert.deepEqual(await pg.evaluate(() => [$('#p10info .p10buy').disabled, $('#p10info .p10buy').innerText.trim()]), [true, '手持ちと牧場で8体までです。']);
          await pg.evaluate(() => lobby()); return 'buy(上限)';
        }
        await H.marketDetail(pg); await tap(pg, '#p10info .p10buy');
        await pg.waitForSelector('#p10ov');
        await pg.fill('#mnm', 'N' + done.length);
        await tap(pg, '.p10ok');
        await pg.waitForSelector('#app .map');
        const x = await pg.evaluate((u) => [S.m, ...S.box].filter(Boolean).map((y) => y.uid).find((y) => !u.includes(y)), all());
        assert.ok(x, '新しい個体');
        if (M.m) M.box.push(x); else M.m = x;
        M.g -= 500; return `buy(${key})`;
      },
    };
    // 操作の順は固定（どの切り替わりも一度は通る）。番号・種族は決まった乱数で選ぶ。できない操作なら次の種類へ
    //  （途中で手持ち＋牧場が8体・牧場7体になり、購入と預けるが断られる場面も通る）
    const PLAN = ['wd', 'dep', 'fuse', 'buy', 'sell', 'wd', 'buy', 'buy', 'dep', 'buy', 'buy', 'dep', 'fuse', 'wd', 'sell', 'sell', 'dep'];
    const KINDS = ['dep', 'wd', 'sell', 'fuse', 'buy'];
    for (let step = 0; step < PLAN.length; step++) {
      const r2 = rnd(), r3 = rnd();
      let res = false;
      for (let t = 0; t < KINDS.length && !res; t++) res = await OPS[KINDS[(KINDS.indexOf(PLAN[step]) + t) % KINDS.length]](r2, r3);
      assert.ok(res, `手順${step}：実行できる操作がある`);
      done.push(res);
      const S = await H.getS(pg), why = `手順${step} ${done.join(' → ')}`;
      assert.equal(S.m ? S.m.uid : null, M.m, `${why}：連れている個体`);
      assert.deepEqual(S.box.map((x) => x.uid), M.box, `${why}：牧場の並び`);
      assert.equal(S.g, M.g, `${why}：所持金`);
      await invariants(p);
    }
    t.diagnostic(done.join(' → '));
    // 操作の種類がひととおり出ている（乱数の種を変えたときの確認用）
    for (const k of ['dep', 'wd', 'sell', 'fuse', 'buy', 'dep(満杯)', 'buy(上限)']) assert.ok(done.some((d) => d.startsWith(k)), `${k} が含まれる：${done.join(' → ')}`);
    // 再読込 → はじめる：同じ状態から再開
    const before = await H.getS(pg);
    await reloadToTown(pg);
    assert.deepEqual(await H.getS(pg), before);
    await invariants(p);
  } finally { await p.ctx.close(); }
});

test('QA-RF-B16：育成放棄のあと、放棄前の合体の選択が残らず、残った2体をそのまま選んで合体できる', {
  skip: H.skipReason(),
}, async () => {
  const p = await town(); const pg = p.page;
  try {
    const [, ub, uc] = await seed(pg, [{ sp: 0, name: 'ソラA' }, { sp: 1, name: 'ガウB' }, { sp: 0, name: 'ソラC' }], 1000);
    await toRanch(pg, 'c');
    await tap(pg, '.wpanel button[onclick="selm(2)"]');
    await tap(pg, '.wpanel button[onclick="selm(0)"]');
    assert.deepEqual(await pg.evaluate(() => sel), [2, 0]);
    // 連れているソラAで育成を始め（出発の会話と2度押しは育成開始のテストの範囲なので、確定後の状態から）、メニューから育成放棄
    await pg.evaluate(() => { const r = MMP8.depart(S, S.m); if (!r.ok) throw new Error(r.reason); save(); board(); });
    await pg.waitForSelector('#brollbtn');
    await tap(pg, '.p9mbtn');
    await tap(pg, '.p8menu .p8danger', 500);
    await tap(pg, '#p8m .p8danger', 500);
    await pg.waitForFunction(() => { const b = document.querySelector('#p8abgo'); return b && !b.disabled; }, null, { timeout: 8000 });
    await tap(pg, '#p8abgo', 500);
    await pg.waitForFunction(() => /育成を放棄しました/.test((document.querySelector('#msg') || {}).innerText || ''));
    assert.deepEqual(owned(await H.storedSave(pg)).map((x) => x.uid), [ub, uc]);
    // 牧場の合体タブ：選択は空で、2体を選べば合体できる
    await toRanch(pg, 'c');
    assert.deepEqual(await pg.evaluate(() => [...document.querySelectorAll('.fz .slot')].map((x) => x.innerText.trim())), ['えらんでね', 'えらんでね']);
    assert.deepEqual(await pg.evaluate(() => sel), []);
    await tap(pg, '.wpanel button[onclick="selm(0)"]');
    await tap(pg, '.wpanel button[onclick="selm(1)"]');
    assert.ok(await pg.$('.wpanel .go[onclick="fuse()"]'), '合体ボタンが出る');
    await invariants(p);
  } finally { await p.ctx.close(); }
});
