// =========================================================
// QA：セーブの互換・破壊防止（起動時の読み込み・移行・保護、セーブスロット、セーブコード、最初からやり直す）
//  前半（Node）：MMP8.loadFromStorage を記録つきの仮ストレージで実行し、「何を書き込むか／書き込まないか」を確かめる。
//  後半（実ブラウザ）：index.html を実際に起動し、localStorage の中身（mr4v6・mr4・退避キー・スロット）と S を確かめる。
//   ・旧キー mr4（v5）→ mr4v6 へ移行。mr4 は書き換えず、退避（mr4_v5backup）は原文のまま・既存の退避は上書きしない
//   ・新しい版（v7）のセーブは読み込まず、何をしても書き換えない（ロック画面）
//   ・読めないセーブは原文を mr4_unreadable_backup へそのまま退避し、新しいゲームとして始まる（現在の動作）
//   ・有効なセーブがあれば「つづきから」だけ。起動・開始で mr4v6 を書き換えず、同じ S で再開する
//   ・スロットのセーブ（上書きは2度押し）・ロード（2度押し）、セーブコードの往復、最初からやり直す（2度押し）
//   ・育成中に街・牧場・市場・セーブ画面の操作を直接呼んでもセーブは変わらない
//   ・牧場の個体に育成中の状態が付いたセーブを読み込んでも、育成中の個体は S.m の1体だけにそろう
//  育成中の各画面での再読み込み・売却・育成放棄は qa-e2e-save-reload.test.mjs で確認する。
//  Playwright / Chromium が無い環境では実ブラウザのテストだけ省略（skip）する。
// =========================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as H from './e2e/harness.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const P7SRC = rd('js/phase7/progression.js');
const P8SRC = rd('js/phase8/raising.js');
const LGSRC = existsSync(path.join(ROOT, 'js/phase8/league.js')) ? rd('js/phase8/league.js') : '';
/** 毎回まっさらな MMP7／MMP8 を作る */
function load() { const w = {}; new Function('window', P7SRC)(w); if (LGSRC) new Function('window', LGSRC)(w); new Function('window', P8SRC)(w); return { P7: w.MMP7, P8: w.MMP8 }; }
/** 書き込みを記録する仮ストレージ（localStorage 互換） */
function spyStore(init = {}) {
  const s = { ...init }, sets = [];
  return { s, sets, getItem: (k) => (k in s ? s[k] : null), setItem: (k, v) => { sets.push(k); s[k] = String(v); } };
}
const j = (o) => JSON.parse(JSON.stringify(o));
const mon = (over = {}) => ({ sp: 0, name: 'ソラモ', age: 0, span: 30, h: 0, rk: 0, fa: 0, st: 0, last: null, li: 100, po: 100, in: 100, hi: 100, ev: 100, de: 100, sk: [0, 1, 2, 3], eq: [0, 1, 2, 3, -1, -1], ...over });
// 旧版（Phase 7.1 以前）が旧キー mr4 に書いていた形のセーブ
const V5 = { v: 5, y: 1000, mo: 4, wk: 1, g: 321, cnt: 2, box: [mon({ name: 'あずけ' })], m: mon({ sp: 1, name: 'ハヤテ', li: 80, po: 110, in: 110, hi: 90, ev: 90, de: 60, sk: [10, 11, 12, 13], eq: [10, 11, 12, 13] }), chap: { status: 'board', clearedMax: 0, cleared: [] }, board: { ch: 1, node: 'm5' } };
const V4 = { v: 4, y: 1001, mo: 7, wk: 2, g: 1234, cnt: 3, wins: 5, br: 3, fx1: 1, box: [mon({ sp: 1, name: 'ガウル', rk: 1, sk: [10, 11, 12, 13], eq: [10, 11, 12, 13, -1, -1] })], m: mon({ rk: 4, sk: [0, 1, 2, 3, 4], eq: [0, 1, 2, 3, 4, -1] }), board: { ch: 2, node: 'm7', done: false } };
/** ゲームが書いたものと同じ形の v6 セーブ（fx1 済み・名前登録済み） */
function v6Save(over = {}) {
  const { P8 } = load(); const S = P8.newSave();
  S.m = P8.initIndividual(S, mon()); S.box.push(P8.initIndividual(S, mon({ sp: 1, name: 'ガウル' })));
  Object.assign(S, { g: 4321, fx1: 1, playerName: 'ほぞん', npcFlags: { finaIntro: 1 } }, over);
  delete S.playerNamePending;
  return P8.migrateSave(j(S));
}

// ---------------------------------------------------------
// Node：起動時の読み込み（loadFromStorage）が書き込むもの・書き込まないもの
// ---------------------------------------------------------
test('QA-SV-N1：新しい版のセーブ（v7・v6.5・旧キーの v7・mr4v6 が v7 で mr4 が v5）は locked。ストレージには一度も書き込まない', () => {
  const { P8 } = load();
  const v7 = JSON.stringify({ v: 7, g: 99999, m: { name: '未来' }, box: [] });
  for (const [label, init, ver] of [
    ['mr4v6 が v7', { mr4v6: v7 }, 7],
    ['mr4v6 が v6.5', { mr4v6: JSON.stringify({ v: 6.5, box: [] }) }, 6.5],
    ['旧キー mr4 だけが v7', { mr4: v7 }, 7],
    ['mr4v6 が v7・mr4 が v5', { mr4v6: v7, mr4: JSON.stringify(V5) }, 7],
  ]) {
    const st = spyStore(init), before = JSON.stringify(st.s);
    const r = P8.loadFromStorage(st);
    assert.equal(r.status, 'locked', label); assert.equal(r.locked, true, label);
    assert.equal(r.S, null, label); assert.equal(r.version, ver, label);
    assert.deepEqual(st.sets, [], `${label}：setItem を呼ばない`);
    assert.equal(JSON.stringify(st.s), before, `${label}：中身は変わらない`);
  }
});

test('QA-SV-N2：読めないセーブは原文そのままを退避キーへ1つだけ書く（mr4v6 は書き換えない）。2回目は別名で退避し、先の退避は変えない', () => {
  const { P8 } = load();
  for (const text of ['{"v":6,"g":1,', '', 'null', '[]', '"ミスモン"', '{"v":3,"box":[]}']) {
    const st = spyStore({ mr4v6: text });
    const r = P8.loadFromStorage(st);
    assert.equal(r.status, 'unreadable', JSON.stringify(text)); assert.equal(r.S, null); assert.equal(r.locked, false);
    assert.deepEqual(st.sets, ['mr4_unreadable_backup'], `${JSON.stringify(text)}：書くのは退避キーだけ`);
    assert.equal(st.s.mr4_unreadable_backup, text, '原文を1文字も変えずに退避');
    assert.equal(st.s.mr4v6, text, 'mr4v6 はローダーでは書き換えない');
  }
  // 2回目（すでに退避がある）
  const st = spyStore({ mr4v6: '{壊れた2', mr4_unreadable_backup: '{壊れた1' });
  const r = P8.loadFromStorage(st);
  assert.equal(r.status, 'unreadable');
  assert.match(r.backup, /^mr4_unreadable_backup_\d+$/);
  assert.deepEqual(st.sets, [r.backup]);
  assert.equal(st.s[r.backup], '{壊れた2'); assert.equal(st.s.mr4_unreadable_backup, '{壊れた1', '先の退避は上書きしない');
});

test('QA-SV-N3：旧キー mr4（v5・v4）→ mr4v6 へ移行。mr4 は書き換えず、版ごとの退避は原文・既存の退避は上書きしない', () => {
  const { P8 } = load();
  for (const [raw, bk] of [[V5, 'mr4_v5backup'], [V4, 'mr4_v4backup']]) {
    const text = JSON.stringify(raw);
    const st = spyStore({ mr4: text });
    const r = P8.loadFromStorage(st);
    assert.equal(r.status, 'migrated'); assert.equal(r.from, raw.v);
    assert.deepEqual([...st.sets].sort(), [bk, 'mr4v6'].sort(), `v${raw.v}：書くのは退避と mr4v6 だけ（mr4 は書かない）`);
    assert.equal(st.s.mr4, text, 'mr4 は変わらない');
    assert.equal(st.s[bk], text, '退避は原文のまま');
    const v6 = JSON.parse(st.s.mr4v6);
    assert.equal(v6.v, 6); assert.equal(v6.migratedFrom, raw.v);
    assert.deepEqual(v6, j(r.S), '書いた mr4v6 は読み込んだ S と同じ');
    // すでに退避がある場合は上書きしない
    const st2 = spyStore({ mr4: text, [bk]: '前からある退避' });
    assert.equal(P8.loadFromStorage(st2).status, 'migrated');
    assert.deepEqual(st2.sets, ['mr4v6'], `v${raw.v}：既存の退避には書かない`);
    assert.equal(st2.s[bk], '前からある退避');
  }
});

test('QA-SV-N4：mr4v6 があれば旧キー mr4 は読まず、何も書き込まない（status ok）', () => {
  const { P8 } = load();
  const v6 = v6Save();
  const st = spyStore({ mr4v6: JSON.stringify(v6), mr4: JSON.stringify(V5) });
  const r = P8.loadFromStorage(st);
  assert.equal(r.status, 'ok'); assert.equal(r.from, 6);
  assert.deepEqual(st.sets, [], 'setItem を呼ばない');
  assert.deepEqual(j(r.S), v6, '読み込んだ S は mr4v6 の内容そのまま');
});

test('QA-SV-N5：移行結果は migrateSave の不動点（JSON で往復して読み直しても同じ）で、元のデータは書き換えない', () => {
  const { P8 } = load();
  for (const raw of [V5, V4, v6Save(), { ...V5, chap: { status: 'farm', clearedMax: 2, cleared: [1, 2] }, board: null }]) {
    const before = JSON.stringify(raw);
    const a = P8.migrateSave(raw);
    assert.equal(JSON.stringify(raw), before, '元のオブジェクトは変わらない');
    const b = P8.migrateSave(j(a));
    assert.deepEqual(j(b), j(a), `v${raw.v}：読み直しても内容は変わらない`);
    assert.equal(a.v, 6);
    assert.equal(a.box.filter((x) => ['board', 'farm', 'final'].includes(x.raise.state)).length, 0, '牧場の個体に進行は付かない');
  }
});

test('QA-SV-N6：連れている個体がいない旧セーブ（Chapter途中の記録つき）は、進行をどの個体にも付けずに街から再開する', () => {
  const { P8 } = load();
  const st = spyStore({ mr4: JSON.stringify({ ...V5, m: null }) });
  const r = P8.loadFromStorage(st);
  assert.equal(r.status, 'migrated');
  assert.equal(r.S.m, null);
  assert.deepEqual(r.S.box.map((x) => x.raise.state), ['none'], '牧場の個体に進行を付けない');
  assert.ok(!('chap' in r.S) && !('board' in r.S) && !('trainRun' in r.S), 'セーブ全体に旧い進行を残さない');
  assert.equal(P8.resumeTarget(r.S), 'town');
  assert.equal(P8.canVisitTown(r.S), true);
});

// ---------------------------------------------------------
// 実ブラウザ
// ---------------------------------------------------------
const SKIP = H.skipReason();
let L = null;
test.before(async () => { if (!SKIP) L = await H.launch(); });
test.after(async () => { if (L) await L.close(); });
// テストごとに開いたページを閉じる
const OPEN = [];
const openPage = async (o = {}) => { const p = await L.open(o); OPEN.push(p); return p; };
test.afterEach(async () => { for (const p of OPEN.splice(0)) await p.ctx.close().catch(() => {}); });
const T = (name, fn) => test(name, { skip: SKIP }, fn);

function noErrors(p) {
  assert.deepEqual(p.errors, [], 'pageerror / console.error が出ていない');
  assert.deepEqual(p.bad, [], 'ローカルのファイルがすべて読み込めている');
}
const stored = (pg) => pg.evaluate(() => localStorage.getItem('mr4v6'));
/** 育成中の個体（Chapter進行中・Chapter間ファーム・最終Chapter）は S.m の1体だけで、牧場の個体には進行が付いていない */
function assertProgressOnlyOnM(S, label) {
  for (const x of S.box) {
    assert.ok(!['board', 'farm', 'final'].includes(x.raise.state), `${label}：牧場の個体（${x.uid}）が育成中になっていない`);
    for (const k of ['ch', 'node', 'pend', 'tour', 'battle', 'trainRun']) assert.equal(x.raise[k], null, `${label}：牧場の個体の raise.${k} は空`);
  }
  for (const k of ['chap', 'board', 'trainRun']) assert.ok(!(k in S), `${label}：セーブ全体に ${k} を持たない`);
}
/** localStorage の全キーと中身 */
const allKeys = (pg) => pg.evaluate(() => Object.fromEntries(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)])));
const loadInfo = (pg) => pg.evaluate(() => ({ status: P8_LOAD.status, locked: P8_LOAD.locked, version: P8_LOAD.version, from: P8_LOAD.from, backup: P8_LOAD.backup || null }));
/** 名前登録・フィナのあいさつを済ませた街の状態を直接作る（連れている個体＝ソラモ、牧場＝ガウル box 体） */
async function setupTown(pg, { g = 1234, box = 1 } = {}) {
  await pg.evaluate((o) => {
    MMP11P.confirmName(S, 'セーブ'); S.npcFlags = { finaIntro: 1, raiseIntro: 1 };
    S.m = mk(0); for (let i = 0; i < o.box; i++) S.box.push(mk(1));
    S.g = o.g; save(); lobby();
  }, { g, box });
  await pg.waitForSelector('.map');
}
/** 開始画面の「タップしてはじめる」→ 再開画面（sel）が出るまで */
async function startFromTitle(pg, sel) {
  await pg.waitForSelector('.p15start');
  await pg.click('.p15start');
  await pg.waitForSelector(sel, { timeout: 15000 });
}
async function reload(pg) {
  await pg.reload();
  await pg.waitForFunction(() => typeof window.MMP8 === 'object' && typeof S === 'object');
}
/** 再読み込み→開始で、S が完全に同じ・起動と開始で mr4v6 を書き換えないことを確かめる */
async function reloadKeepsS(pg, sel, label) {
  const mem = await H.getS(pg), text = await stored(pg);
  assert.deepEqual(mem, JSON.parse(text), `${label}：画面の S とセーブ（mr4v6）が同じ`);
  await reload(pg);
  assert.equal(await stored(pg), text, `${label}：起動しただけでは mr4v6 を書き換えない`);
  assert.deepEqual(await H.getS(pg), mem, `${label}：起動直後の S は再読み込み前と同じ`);
  await startFromTitle(pg, sel);
  assert.deepEqual(await H.getS(pg), mem, `${label}：再開後の S は再読み込み前と同じ`);
  return mem;
}
/** セーブ画面を開き、押せるようになるまで少し待つ */
async function openSaveScreen(pg, details = false) {
  await pg.evaluate((d) => { savescr(); if (d) document.querySelector('details').open = true; }, details);
  await pg.waitForSelector('[onclick^="slotSave(1"]');
  await pg.waitForTimeout(600);
}
const PRESS_GAP = 700;   // 2度押しの間隔（2回目の押下が速すぎると無視される作りでも確認できる間隔）
const enc = (o) => Buffer.from(JSON.stringify(o), 'utf8').toString('base64');

T('QA-SV1：旧キー mr4（v5・Chapter 1 途中）→ 起動時に mr4v6 へ移行。mr4 は書き換えず、mr4_v5backup は原文。ボードの開始地点から再開', async () => {
  const raw = JSON.stringify(V5);
  const p = await openPage({ raw: { mr4: raw } }); const pg = p.page;
  assert.deepEqual(await loadInfo(pg), { status: 'migrated', locked: false, version: null, from: 5, backup: null });
  let ks = await allKeys(pg);
  assert.deepEqual(Object.keys(ks), ['mr4', 'mr4_v5backup', 'mr4v6'], '増えたのは退避と mr4v6 だけ');
  assert.equal(ks.mr4, raw, '旧キー mr4 は書き換えない');
  assert.equal(ks.mr4_v5backup, raw, '退避は原文そのまま');
  const v6 = JSON.parse(ks.mr4v6);
  assert.equal(v6.v, 6); assert.equal(v6.migratedFrom, 5); assert.equal(v6.g, 321);
  assert.deepEqual([v6.m.raise.state, v6.m.raise.ch, v6.m.raise.turnsUsed], ['board', 1, 0], 'Chapter 1 の途中は同じ Chapter の0ターンから');
  assert.equal(v6.box[0].raise.state, 'none', '牧場の個体に進行は付かない');
  assert.deepEqual(await H.getS(pg), v6, '画面の S と mr4v6 は同じ');
  assert.match(await H.text(pg), /つづきからはじめます/);
  await startFromTitle(pg, '#brollbtn');
  const s = await H.getS(pg);
  assert.equal(s.m.raise.node, await pg.evaluate(() => MMP8.trackOf(1).start), 'Chapter 1 の開始地点');
  assert.equal(s.m.raise.turnsUsed, 0);
  assert.equal(s.m.name, 'ガウル', '旧名ハヤテ（ガウル）はガウルに');
  assert.equal(s.playerName, 'アルト'); assert.ok(!s.playerNamePending, '旧セーブは名前登録を求めない');
  // 再読み込み：こんどは mr4v6 から読み、mr4・退避はそのまま
  const text = await stored(pg);
  await reload(pg);
  assert.equal((await loadInfo(pg)).status, 'ok', '2回目の起動は mr4v6 から');
  ks = await allKeys(pg);
  assert.equal(ks.mr4, raw); assert.equal(ks.mr4_v5backup, raw); assert.equal(ks.mr4v6, text, '移行し直さない');
  noErrors(p);
});

T('QA-SV2：mr4v6 があれば旧キー mr4 は無視（退避も作らない）。旧キーから移行するときも既存の mr4_v5backup は上書きしない', async () => {
  const v6 = JSON.stringify(v6Save()), v5 = JSON.stringify(V5);
  const a = await openPage({ raw: { mr4v6: v6, mr4: v5 } });
  assert.equal((await loadInfo(a.page)).status, 'ok');
  assert.deepEqual(await allKeys(a.page), { mr4: v5, mr4v6: v6 }, 'どちらも書き換えず、退避も作らない');
  assert.equal(await a.page.evaluate(() => S.g), 4321, 'mr4v6 の内容で始まる');
  noErrors(a);
  const b = await openPage({ raw: { mr4: v5, mr4_v5backup: '前からある退避' } });
  assert.equal((await loadInfo(b.page)).status, 'migrated');
  const ks = await allKeys(b.page);
  assert.equal(ks.mr4_v5backup, '前からある退避', '既存の退避は上書きしない');
  assert.equal(ks.mr4, v5);
  assert.equal(JSON.parse(ks.mr4v6).migratedFrom, 5);
  noErrors(b);
});

T('QA-SV3：新しい版（v7）のセーブ → ロック画面。街・市場・牧場・セーブ画面・スロット・やり直し・save() を呼んでも localStorage は一切変わらない', async () => {
  const v7 = JSON.stringify({ v: 7, g: 99999, m: { name: '未来' }, box: [] }), slot = JSON.stringify(v6Save({ g: 5 }));
  const p = await openPage({ raw: { mr4v6: v7, mr4s1: slot } }); const pg = p.page;
  const seeded = { mr4s1: slot, mr4v6: v7 };
  assert.deepEqual(await loadInfo(pg), { status: 'locked', locked: true, version: 7, from: null, backup: null });
  assert.deepEqual(await allKeys(pg), seeded, '起動しただけでは何も書かない');
  await startFromTitle(pg, '.p8lock');
  assert.match(await H.text(pg), /新しい版/);
  await pg.evaluate(async () => {
    const b = () => document.createElement('button');
    lobby(); market(); farm('', 'a'); farm('', 'd'); museum(); savescr(); save();
    const s1 = b(); slotSave(2, s1); slotSave(2, s1);
    const l1 = b(); slotLoad(1, l1); slotLoad(1, l1);
    const r1 = b(); reset(r1); reset(r1);
    imp();
  });
  await pg.waitForTimeout(300);
  assert.ok(await pg.evaluate(() => !!document.querySelector('.p8lock')), 'ロック画面のまま');
  assert.deepEqual(await allKeys(pg), seeded, 'localStorage は一切変わらない');
  // 再読み込みしても同じ
  await reload(pg);
  assert.equal((await loadInfo(pg)).status, 'locked');
  await startFromTitle(pg, '.p8lock');
  assert.deepEqual(await allKeys(pg), seeded);
  noErrors(p);
});

T('QA-SV4：読めないセーブ（壊れたJSON）→ 原文を mr4_unreadable_backup にそのまま退避し、名前登録から新しいゲームが始まる', async () => {
  const bad = '{"v":6,"g":1,"m":{"name":"とちゅう"';
  const p = await openPage({ raw: { mr4v6: bad } }); const pg = p.page;
  const info = await loadInfo(pg);
  assert.equal(info.status, 'unreadable'); assert.equal(info.backup, 'mr4_unreadable_backup');
  assert.equal(await pg.evaluate(() => localStorage.getItem('mr4_unreadable_backup')), bad, '原文そのまま');
  await startFromTitle(pg, '#p11nm');
  await pg.fill('#p11nm', 'あたらしく');
  await pg.click('[onclick*="p11NameGo"]');
  await pg.waitForSelector('.mmtalk');
  await pg.waitForTimeout(300);
  await H.finishTalk(pg);
  await pg.waitForSelector('.map');
  const s = JSON.parse(await stored(pg));
  assert.equal(s.v, 6); assert.equal(s.playerName, 'あたらしく'); assert.equal(s.m, null); assert.deepEqual(s.box, []);
  assert.equal(s.g, 300, '新規ゲームの初期所持金');
  assert.equal(await pg.evaluate(() => localStorage.getItem('mr4_unreadable_backup')), bad, '新しく遊び始めても退避は残る');
  // 再読み込み：新しいセーブで続きから。退避は変わらない
  await reload(pg);
  assert.equal((await loadInfo(pg)).status, 'ok');
  assert.equal(await pg.evaluate(() => localStorage.getItem('mr4_unreadable_backup')), bad);
  noErrors(p);
});

T('QA-SV5：有効なセーブがあると開始画面は「つづきから」だけ。街・市場・牧場（預けたあと）・セーブ画面で再読み込みしても S は完全に同じ', async () => {
  const p = await openPage(); const pg = p.page;
  await setupTown(pg, { box: 1 });
  // 街：開始画面の操作と文言も確かめる
  const mem = await H.getS(pg), text = await stored(pg);
  await reload(pg);
  await pg.waitForSelector('.p15start');
  assert.deepEqual(await pg.evaluate(() => [...document.querySelectorAll('#app [onclick]')].map((b) => b.getAttribute('onclick'))), ['startGame(this)'],
    '開始画面の操作は「タップしてはじめる」だけ（新規開始の入口は無い）');
  assert.match(await H.text(pg), /つづきからはじめます/);
  assert.equal(await stored(pg), text, '起動しただけでは mr4v6 を書き換えない');
  await startFromTitle(pg, '.map');
  assert.equal(await stored(pg), text, '開始しても mr4v6 を書き換えない');
  assert.deepEqual(await H.getS(pg), mem, '同じ S で再開');
  // 市場
  await pg.evaluate(() => market());
  await pg.waitForSelector('.p10mk');
  await reloadKeepsS(pg, '.map', '市場');
  // 牧場：預ける（画面のボタン）→ 受け取るタブ
  await pg.evaluate(() => farm('', 'a'));
  await pg.waitForSelector('[onclick="dep()"]');
  await pg.waitForTimeout(500);
  await pg.click('[onclick="dep()"]');
  await pg.waitForSelector('[onclick="wd(0)"]');
  const s = await reloadKeepsS(pg, '.map', '牧場（預けたあと）');
  assert.equal(s.m, null); assert.equal(s.box.length, 2, '預けた結果も保存済み');
  await openSaveScreen(pg);
  await reloadKeepsS(pg, '.map', 'セーブ画面');
  noErrors(p);
});

T('QA-SV6：スロットにセーブすると mr4s1 に今の S をそのまま書く。既存のスロットの上書きは2度押し（1回目では書き換えない）', async () => {
  const p = await openPage(); const pg = p.page;
  await setupTown(pg);
  await openSaveScreen(pg);
  await pg.click('[onclick^="slotSave(1"]');
  await pg.waitForFunction(() => /スロット1にセーブしました/.test(document.getElementById('msg').textContent));
  const slot1 = await pg.evaluate(() => localStorage.getItem('mr4s1'));
  assert.equal(slot1, await pg.evaluate(() => JSON.stringify(S)), 'スロットは今の S そのもの');
  assert.equal(slot1, await stored(pg), 'オートセーブとも同じ');
  // 所持金を変えてから上書き
  await pg.evaluate(() => { S.g = 50; save(); });
  await openSaveScreen(pg);
  await pg.click('[onclick^="slotSave(1"]');
  await pg.waitForTimeout(PRESS_GAP);
  assert.equal(await pg.evaluate(() => localStorage.getItem('mr4s1')), slot1, '1回目の押下では上書きしない');
  assert.match(await pg.evaluate(() => document.querySelector('[onclick^="slotSave(1"]').textContent), /もう一度押すと上書き/);
  await pg.click('[onclick^="slotSave(1"]');
  await pg.waitForFunction(() => /スロット1にセーブしました/.test(document.getElementById('msg').textContent));
  assert.equal(JSON.parse(await pg.evaluate(() => localStorage.getItem('mr4s1'))).g, 50, '2回目の押下で上書き');
  assert.equal(await pg.evaluate(() => localStorage.getItem('mr4s2')), null, 'ほかのスロットには書かない');
  noErrors(p);
});

T('QA-SV7：スロットのロードは2度押し（1回目では何も変えない）。ロード後の S はスロットの内容どおりで、オートセーブ（mr4v6）も同じ', async () => {
  const p = await openPage(); const pg = p.page;
  await setupTown(pg, { g: 777, box: 2 });
  await openSaveScreen(pg);
  await pg.click('[onclick^="slotSave(2"]');
  await pg.waitForFunction(() => localStorage.getItem('mr4s2') != null);
  const saved = await H.getS(pg);
  // セーブ後に進行が変わった（所持金・個体数）
  await pg.evaluate(() => { S.g = 1; S.box = []; save(); });
  const cur = await stored(pg);
  await openSaveScreen(pg);
  await pg.click('[onclick^="slotLoad(2"]');
  await pg.waitForTimeout(PRESS_GAP);
  assert.equal(await stored(pg), cur, '1回目の押下ではロードしない');
  assert.equal(await pg.evaluate(() => S.g), 1);
  await pg.click('[onclick^="slotLoad(2"]');
  await pg.waitForSelector('.map');
  assert.match(await H.text(pg), /スロット2をロードしました/);
  assert.deepEqual(await H.getS(pg), saved, 'S はスロットの内容どおり');
  assert.deepEqual(JSON.parse(await stored(pg)), saved, 'オートセーブもスロットの内容');
  await reloadKeepsS(pg, '.map', 'スロットのロード後');
  noErrors(p);
});

T('QA-SV8：育成中のセーブを入れたスロットをロード → ボードから再開。新しい版（v7）のスロットはロードできず mr4v6 も変えない', async () => {
  const p = await openPage(); const pg = p.page;
  await setupTown(pg);
  // スロット3：同じ進行で育成を始めた状態、スロット2：新しい版
  const raising = await pg.evaluate(() => { const c = JSON.parse(JSON.stringify(S)); MMP8.depart(c, c.m); c.g = 555; localStorage.setItem('mr4s3', JSON.stringify(c)); localStorage.setItem('mr4s2', JSON.stringify({ v: 7, g: 99999, m: null, box: [] })); return c; });
  const cur = await stored(pg);
  await openSaveScreen(pg);
  await pg.click('[onclick^="slotLoad(2"]');
  await pg.waitForFunction(() => /読み込めません/.test(document.getElementById('msg').textContent));
  assert.equal(await stored(pg), cur, '新しい版のスロットでは mr4v6 を変えない');
  assert.equal(JSON.parse(await pg.evaluate(() => localStorage.getItem('mr4s2'))).v, 7, 'スロット2もそのまま');
  await pg.waitForTimeout(600);
  await pg.click('[onclick^="slotLoad(3"]');
  await pg.waitForTimeout(PRESS_GAP);
  await pg.click('[onclick^="slotLoad(3"]');
  await pg.waitForSelector('#brollbtn');
  const s = await H.getS(pg);
  assert.equal(s.g, 555); assert.equal(s.m.uid, raising.m.uid);
  assert.deepEqual([s.m.raise.state, s.m.raise.ch], ['board', 1], '育成中の個体はボードへ');
  assert.deepEqual(JSON.parse(await stored(pg)), s);
  noErrors(p);
});

T('QA-SV9：セーブコードを作る → 別の進行になったあと、そのコードで読み込むと S が元どおり（往復で完全一致）', async () => {
  const p = await openPage(); const pg = p.page;
  await setupTown(pg, { g: 2468, box: 2 });
  await pg.evaluate(() => { S.trainTix = 4; S.raiseRec = { done: 3, fromStart: true }; save(); });
  await openSaveScreen(pg, true);
  const before = await H.getS(pg);
  await pg.click('[onclick="exp()"]');
  await pg.waitForFunction(() => document.getElementById('sc').value.length > 0);
  const code = await pg.evaluate(() => document.getElementById('sc').value);
  // 別の進行にする
  await pg.evaluate(() => { S.g = 3; S.m.name = 'かわった'; S.box.pop(); save(); });
  await openSaveScreen(pg, true);
  await pg.fill('#sc', code);
  await pg.click('[onclick="imp()"]');
  await pg.waitForSelector('.map');
  assert.match(await H.text(pg), /ロードしました/);
  assert.deepEqual(await H.getS(pg), before, 'S はコードを作ったときと同じ');
  assert.deepEqual(JSON.parse(await stored(pg)), before, 'オートセーブも同じ');
  noErrors(p);
});

T('QA-SV10：新しい版・壊れたセーブコードは読み込まず mr4v6 を変えない。旧版（v5）のコードは v6 に移行して読み込む', async () => {
  const p = await openPage(); const pg = p.page;
  await setupTown(pg);
  const cur = await stored(pg);
  await openSaveScreen(pg, true);
  for (const [label, code] of [['新しい版', enc({ v: 7, g: 1, m: null, box: [] })], ['base64 でない', '!!!'], ['JSON でない', Buffer.from('{"v":6,').toString('base64')]]) {
    await pg.evaluate(() => { document.getElementById('msg').textContent = ''; });
    await pg.fill('#sc', code);
    await pg.click('[onclick="imp()"]');
    await pg.waitForFunction(() => /セーブコードが正しくありません/.test(document.getElementById('msg').textContent));
    assert.equal(await stored(pg), cur, `${label}：mr4v6 は変わらない`);
  }
  await pg.fill('#sc', enc({ ...V5, g: 42, chap: { status: 'farm', clearedMax: 1, cleared: [1] }, board: null }));
  await pg.click('[onclick="imp()"]');
  await pg.waitForSelector('.p9farm');
  const s = JSON.parse(await stored(pg));
  assert.equal(s.v, 6); assert.equal(s.migratedFrom, 5); assert.equal(s.g, 42);
  assert.deepEqual([s.m.raise.state, s.m.raise.ch], ['farm', 2], 'Chapter 1 を終えた旧セーブは Chapter間ファーム（次は Chapter 2）');
  assert.equal(s.box[0].raise.state, 'none');
  noErrors(p);
});

T('QA-SV11：最初からやり直すは2度押し。1回目では何も消えず、2回目で新規（300G・0体・名前登録から）。スロットは消えない', async () => {
  const p = await openPage(); const pg = p.page;
  await setupTown(pg, { g: 5000 });
  await openSaveScreen(pg);
  await pg.click('[onclick^="slotSave(1"]');
  await pg.waitForFunction(() => localStorage.getItem('mr4s1') != null);
  const slot = await pg.evaluate(() => localStorage.getItem('mr4s1'));
  await openSaveScreen(pg);
  const cur = await stored(pg);
  await pg.click('[onclick^="reset"]');
  await pg.waitForTimeout(PRESS_GAP);
  assert.equal(await stored(pg), cur, '1回目の押下では消さない');
  assert.match(await pg.evaluate(() => document.querySelector('[onclick^="reset"]').textContent), /もう一度押すと最初から/);
  await pg.click('[onclick^="reset"]');
  await pg.waitForSelector('#p11nm');
  const s = JSON.parse(await stored(pg));
  assert.equal(s.v, 6); assert.equal(s.g, 300); assert.equal(s.m, null); assert.deepEqual(s.box, []);
  assert.equal(s.playerNamePending, true, '名前登録から');
  assert.equal(await pg.evaluate(() => localStorage.getItem('mr4s1')), slot, 'スロットは残る');
  noErrors(p);
});

T('QA-SV12：育成中は、街・牧場・市場・セーブ画面の操作を直接呼んでも S と mr4v6 は変わらず、ボードに戻る', async () => {
  const p = await openPage(); const pg = p.page;
  await setupTown(pg, { g: 5000, box: 2 });
  await pg.evaluate(() => { localStorage.setItem('mr4s1', JSON.stringify(S)); MMP8.depart(S, S.m); save(); board(); });
  await pg.waitForSelector('#brollbtn');
  const S0 = await H.getS(pg), st0 = await stored(pg), slot0 = await pg.evaluate(() => localStorage.getItem('mr4s1'));
  const calls = ['dep()', 'wd(0)', 'selm(0);selm(1)', 'fuse()', 'adopt(0,"X")', 'mkgo(0)', 'mkd(0)', 'pfSellPick(1)', 'pfSellGo(b);pfSellGo(b)',
    'slotSave(1,b);slotSave(1,b)', 'slotLoad(1,b);slotLoad(1,b)', 'imp()', 'reset(b);reset(b)', 'farm()', 'farm("","d")', 'market()', 'lobby()', 'savescr()', 'museum()'];
  for (const c of calls) {
    await pg.evaluate(async (c) => { const b = document.createElement('button'); await new Function('b', `return (async()=>{${c}})()`)(b); }, c);
    assert.deepEqual(await H.getS(pg), S0, `${c}：S は変わらない`);
    assert.equal(await stored(pg), st0, `${c}：mr4v6 は変わらない`);
    assert.ok(await pg.evaluate(() => !!document.querySelector('#chf-ui #brollbtn')), `${c}：ボード（Chapter 1 はChapterフィールド）のまま`);
  }
  assert.equal(await pg.evaluate(() => localStorage.getItem('mr4s1')), slot0, 'スロットも変わらない');
  assert.deepEqual(await pg.evaluate(() => sel), []);
  noErrors(p);
});

// ---------------------------------------------------------
// Chapter進行は連れている個体だけ（読み込み時の補正）
// ---------------------------------------------------------
T('QA-SV13：育成中の状態が牧場の個体に付いたセーブを読み込むと、育成中の個体は S.m の1体だけにそろう（進行は保たれる）', async () => {
  const p = await openPage(); const pg = p.page;
  await setupTown(pg, { box: 2 });
  // (a) 連れている個体は未育成、牧場の1体目が Chapter 1（Chapterフィールド）の途中（w1_2・3ターン使用・配置あり）
  const ids = await pg.evaluate(() => {
    const c = JSON.parse(JSON.stringify(S)), x = c.box[0];
    Object.assign(x.raise, { state: 'board', ch: 1, node: 'w1_2', turnsUsed: 3, turnLimit: 30, fatigue: 12 });
    MMCH.initRun(x, MMCH.getConfig(1, 'A'), Math.random);
    localStorage.setItem('mr4v6', JSON.stringify(c));
    return { m: c.m.uid, x: x.uid, y: c.box[1].uid };
  });
  await pg.reload();
  await pg.waitForFunction(() => typeof S === 'object');
  let s = await H.getS(pg);
  assert.equal(s.m.uid, ids.x, '育成中の個体が連れている個体になる');
  assert.deepEqual([s.m.raise.state, s.m.raise.ch, s.m.raise.node, s.m.raise.turnsUsed, s.m.raise.fatigue], ['board', 1, 'w1_2', 3, 12], '進行はそのまま');
  assert.deepEqual(s.box.map((x) => x.uid).sort(), [ids.m, ids.y].sort(), '元の連れている個体は牧場へ（個体数は変わらない）');
  assertProgressOnlyOnM(s, '読み込み(a)');
  await pg.click('.p15start');
  await pg.waitForSelector('#brollbtn');
  assert.equal(await pg.evaluate(() => S.m.raise.node), 'w1_2', 'ボードの同じ位置から再開');
  // (b) 連れている個体も牧場の個体も育成中 → 牧場の個体の進行は外れる（連れている個体の進行は保つ）
  await pg.evaluate(() => {
    const c = JSON.parse(JSON.stringify(S)), x = c.box[0];
    Object.assign(x.raise, { state: 'farm', ch: 3, trainRun: { kind: 'po', pos: 4 } });
    localStorage.setItem('mr4v6', JSON.stringify(c));
  });
  const mBefore = await pg.evaluate(() => JSON.stringify(S.m));
  await pg.reload();
  await pg.waitForFunction(() => typeof S === 'object');
  s = await H.getS(pg);
  assert.equal(JSON.stringify(s.m), mBefore, '連れている個体の進行はそのまま');
  assertProgressOnlyOnM(s, '読み込み(b)');
  assert.equal(s.box[0].raise.state, 'none', '牧場の個体は未育成に戻る');
  noErrors(p);
});
