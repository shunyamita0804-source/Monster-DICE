// =========================================================
// Phase 8 テスト：育成進行システムの再構築
//  ・セーブv6／uid／個体の育成状態、個体ごとのChapter進行・20ターン制、街への帰還禁止・中断再開、
//    公式ランク大会（総当たりリーグ）・報酬、修行チケット、育成放棄、最終Chapter判定、旧仕様の無効化
//  ・純粋ロジック（js/phase8/raising.js・league.js・js/phase7/progression.js）は直接実行し、
//    index.html の画面側は実物のコードを抽出・静的検査して確認する。
//  既存97件（統合10・act接続13・Phase6 18・Phase7 56）とは別ファイル。
// =========================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const rd = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const HTML = rd('index.html');
const P7SRC = rd('js/phase7/progression.js');
const P8SRC = rd('js/phase8/raising.js');
const LGSRC = existsSync(path.join(ROOT, 'js/phase8/league.js')) ? rd('js/phase8/league.js') : '';
/** 毎回まっさらな MMP7／MMP8L／MMP8 を作る（src8を差し替えると定数変更の検証ができる） */
function load(src8 = P8SRC) { const w = {}; new Function('window', P7SRC)(w); if (LGSRC) new Function('window', LGSRC)(w); new Function('window', src8)(w); return { P7: w.MMP7, P8: w.MMP8, LG: w.MMP8L }; }
const seq = (...xs) => { let i = 0; return () => xs[Math.min(i++, xs.length - 1)]; };
function mon(P7, over = {}) {
  const m = { sp: 0, name: 'テスト', age: 0, span: 30, h: 0, rk: 0, fa: 0, st: 0, last: null, li: 100, po: 100, in: 100, hi: 100, ev: 100, de: 100, sk: [0, 1, 2, 3], eq: [0, 1, 2, 3, -1, -1], ...over };
  P7.ensureProg(m); return m;
}
function store(init = {}) { const s = { ...init }; return { s, getItem: (k) => (k in s ? s[k] : null), setItem: (k, v) => { s[k] = String(v); } }; }
function v5Save(P7, over = {}) { const S = P7.newSave(); S.m = mon(P7, { name: 'ソラモ' }); S.box = [mon(P7, { sp: 1, name: 'ガウル' })]; return Object.assign(S, over); }
const j = (o) => JSON.parse(JSON.stringify(o));
const fnLine = (name) => HTML.split('\n').find((l) => l.startsWith(name));

// ---------------------------------------------------------
// Step 2：セーブv6・uid・個体の育成状態
// ---------------------------------------------------------
test('S2-1：新規セーブはv6で、Chapter進行・修行状態をセーブ全体に持たない', () => {
  const { P8 } = load(); const S = P8.newSave();
  assert.equal(S.v, 6);
  assert.ok(!('chap' in S) && !('board' in S) && !('trainRun' in S));
  assert.equal(S.trainTix, 0); assert.deepEqual(S.inv.bag, []);
});

test('S2-2：uidは重複しない（新規個体・既存の重複も補正、既存のuidは変えない）', () => {
  const { P7, P8 } = load(); const S = P8.newSave();
  for (let i = 0; i < 300; i++) S.box.push(P8.initIndividual(S, mon(P7)));
  assert.equal(new Set(S.box.map((x) => x.uid)).size, 300);
  const keep = S.box[0].uid; S.box[1].uid = keep; delete S.box[2].uid;
  P8.ensureUids(S);
  assert.equal(new Set(S.box.map((x) => x.uid)).size, 300);
  assert.equal(S.box[0].uid, keep);
  assert.equal(P8.initIndividual(S, mon(P7)).raise.state, 'none', '新しい個体は未育成');
});

test('S2-3：v5（Chapter 1途中）→v6：連れている個体に紐づけ、同Chapterの開始地点・0ターンから。預け個体に進行は付かない', () => {
  const { P7, P8 } = load();
  const S5 = v5Save(P7, { g: 777, trainTix: 3, chap: { status: 'board', clearedMax: 0, cleared: [] }, board: { ch: 1, node: 'm7', done: false, pending: 'battle' } });
  S5.inv.bag.push({ id: 'a' }); S5.inv.vault.push({ id: 'b' }); S5.inv.bagCapUnlocked = true;
  S5.m.prog.rankClr[1] = true; S5.m.prog.train.po = 1; S5.m.sk.push(4); S5.m.po = 321;
  const raw = j(S5); const before = JSON.stringify(raw);
  const S = P8.migrateSave(raw);
  assert.equal(JSON.stringify(raw), before, '元データは書き換えない');
  assert.equal(S.v, 6); assert.equal(S.migratedFrom, 5);
  assert.ok(!('chap' in S) && !('board' in S) && !('trainRun' in S));
  const r = S.m.raise;
  assert.equal(r.state, 'board'); assert.equal(r.ch, 1);
  assert.equal(r.node, null, 'null＝開始地点（ボード表示時にスタートへ置く）');
  assert.equal(r.turnsUsed, 0); assert.equal(r.turnLimit, P8.DEFAULT_TURN_LIMIT); assert.equal(r.pend, null);
  assert.equal(S.box[0].raise.state, 'none', '預け個体は牧場個体のまま');
  assert.equal(S.g, 777); assert.equal(S.trainTix, 3);
  assert.deepEqual(S.inv, { bag: [{ id: 'a' }], bagCapUnlocked: true, vault: [{ id: 'b' }], vaultCap: null });
  assert.equal(S.m.po, 321); assert.deepEqual(S.m.sk, [0, 1, 2, 3, 4]);
  assert.equal(S.m.prog.rankClr[1], true); assert.equal(S.m.prog.train.po, 1);
  assert.ok(S.m.uid && S.box[0].uid && S.m.uid !== S.box[0].uid);
});

test('S2-4：v5（Chapter間）→v6：終えたChapterを個体へ。Chapter 4後はA以上なら最終Chapter、B以下なら育成完了', () => {
  const { P7, P8 } = load();
  const a = P8.migrateSave(j(v5Save(P7, { chap: { status: 'farm', clearedMax: 2, cleared: [1, 2] } })));
  assert.equal(a.m.raise.state, 'farm'); assert.equal(a.m.raise.ch, 3);
  assert.deepEqual(a.m.raise.log.map((e) => e.ch), [1, 2]);
  const S4 = v5Save(P7, { chap: { status: 'farm', clearedMax: 4, cleared: [1, 2, 3, 4] } });
  S4.m.prog.rankClr = [true, true, true, true, true, false];
  const b = P8.migrateSave(j(S4));
  assert.equal(b.m.raise.state, 'farm'); assert.equal(b.m.raise.ch, P8.FINAL);
  S4.m.prog.rankClr = [true, true, true, true, false, false];
  assert.equal(P8.migrateSave(j(S4)).m.raise.state, 'done');
  assert.equal(P8.migrateSave(j(v5Save(P7))).m.raise.state, 'none', 'Chapter 1へ出発していなければ未育成');
  const e = P8.migrateSave(j(v5Save(P7, { chap: { status: 'farm', clearedMax: 1, cleared: [1] }, trainRun: { kind: 'hi', pos: 7 } })));
  assert.deepEqual(e.m.raise.trainRun, { kind: 'hi', pos: 7 }, '修行中の状態も個体へ');
});

test('S2-5：v4→v6の段階移行（Phase 7.1のChapter 2〜4途中救済を維持・旧ランク実績は有効）', () => {
  const { P8 } = load();
  const v4 = { v: 4, y: 1002, mo: 8, wk: 3, g: 4321, cnt: 4, wins: 7, br: 4, fx1: 1,
    box: [{ sp: 1, name: 'ガウル', age: 6, span: 30, h: 10, rk: 2, fa: 20, st: 15, last: 'in', sk: [10, 11, 12, 13, 14], eq: [10, 11, 12, 13, 14, -1], li: 90, po: 120, in: 130, hi: 100, ev: 95, de: 70 }],
    m: { sp: 0, name: 'ソラモ', age: 8, span: 30, h: 5, rk: 4, fa: 12, st: 8, last: 'po', sk: [0, 1, 2, 3, 4, 5], eq: [0, 1, 2, 3, 4, 5], li: 170, po: 180, in: 140, hi: 150, ev: 120, de: 160 },
    board: { ch: 3, node: 'm9', done: false } };
  const S = P8.migrateSave(v4);
  assert.equal(S.v, 6); assert.equal(S.migratedFrom, 4);
  assert.equal(S.m.raise.state, 'farm', 'Chapter 3途中（地図なし）は7.1と同じくChapter 3の前のファームへ');
  assert.equal(S.m.raise.ch, 3); assert.deepEqual(S.m.raise.log.map((e) => e.ch), [1, 2]);
  assert.deepEqual(S.m.prog.rankClr, [true, true, true, true, false, false]);
  assert.equal(S.g, 4321); assert.equal(S.box[0].raise.state, 'none');
  const S1 = P8.migrateSave({ ...v4, board: { ch: 1, node: 'm5', done: false } });
  assert.equal(S1.m.raise.state, 'board'); assert.equal(S1.m.raise.ch, 1); assert.equal(S1.m.raise.turnsUsed, 0);
});

test('S2-6：起動時の読み込み：v5原文を退避・新キーへv6・旧キーは書き換えない・2回目以降は新キーから', () => {
  const { P7, P8 } = load();
  const text = JSON.stringify(v5Save(P7, { g: 50, chap: { status: 'board', clearedMax: 0, cleared: [] }, board: { ch: 1, node: 'm3' } }));
  const st = store({ mr4: text });
  const r = P8.loadFromStorage(st);
  assert.equal(r.status, 'migrated'); assert.equal(r.S.v, 6);
  assert.equal(st.s.mr4_v5backup, text); assert.equal(st.s.mr4, text, '旧キーは書き換えない');
  assert.equal(JSON.parse(st.s[P8.SAVE_KEY]).v, 6);
  st.s[P8.SAVE_KEY] = JSON.stringify({ ...JSON.parse(st.s[P8.SAVE_KEY]), g: 9 });
  const r2 = P8.loadFromStorage(st);
  assert.equal(r2.status, 'ok'); assert.equal(r2.S.g, 9); assert.equal(st.s.mr4_v5backup, text, 'バックアップは上書きしない');
});

test('S2-7：自分より新しい版のセーブは読み込まず・何も書き換えない。index.htmlはその間保存しない', () => {
  const { P8 } = load();
  const st = store({ [P8.SAVE_KEY]: JSON.stringify({ v: 7, g: 1, box: [], m: null }), mr4: '{"v":5}' });
  const before = JSON.stringify(st.s);
  const r = P8.loadFromStorage(st);
  assert.equal(r.status, 'locked'); assert.equal(r.locked, true); assert.equal(r.S, null); assert.equal(r.version, 7);
  assert.equal(JSON.stringify(st.s), before, '元データを一切変更しない');
  assert.equal(P8.migrateSave({ v: 7, box: [] }), null);
  const saveLine = fnLine('function save(){');
  assert.match(saveLine, /^function save\(\)\{if\(P8_LOAD\.locked\)return;/);
  assert.match(saveLine, /MMP8\.SAVE_KEY/); assert.doesNotMatch(saveLine, /"mr4"/, 'v6を旧キーへ書かない');
});

test('S2-8：壊れたデータは原文を退避（既存の退避は上書きしない）', () => {
  const { P8 } = load();
  const st = store({ mr4: '{壊れた', mr4_unreadable_backup: 'old' });
  assert.equal(P8.loadFromStorage(st).status, 'unreadable');
  assert.equal(st.s.mr4_unreadable_backup, 'old');
  assert.ok(Object.keys(st.s).some((k) => k.startsWith('mr4_unreadable_backup_') && st.s[k] === '{壊れた'));
});

test('S2-9：育成中の個体は常に連れている個体（S.m）1体だけ（不整合データの補正）', () => {
  const { P7, P8 } = load(); const S = P8.newSave();
  S.m = mon(P7, { name: 'A' }); S.box = [mon(P7, { name: 'B' })];
  P8.normalizeV6(S); Object.assign(S.box[0].raise, { state: 'farm', ch: 2, log: [{ ch: 1 }] });
  const T = P8.normalizeV6(j(S));
  assert.equal(T.m.name, 'B'); assert.equal(T.box[0].name, 'A'); assert.equal(T.box[0].raise.state, 'none');
});

test('S2-10：修行・保管庫の可否は個体の育成状態で判定する（修行中の状態も個体が持つ）', () => {
  const { P7, P8 } = load(); const S = P8.newSave(); S.m = P8.initIndividual(S, mon(P7)); S.trainTix = 2;
  assert.equal(P7.canStartTraining(S, S.m, 'po').reason, 'before_ch1'); assert.equal(P7.canAccessVault(S), true);
  Object.assign(S.m.raise, { state: 'board', ch: 1 });
  assert.equal(P7.canStartTraining(S, S.m, 'po').reason, 'not_at_farm'); assert.equal(P7.canAccessVault(S), false);
  Object.assign(S.m.raise, { state: 'farm', ch: 2, log: [{ ch: 1 }] });
  assert.deepEqual(P7.canStartTraining(S, S.m, 'po'), { ok: true });
  assert.equal(P7.startTraining(S, S.m, 'po').ok, true);
  assert.deepEqual(S.m.raise.trainRun, { kind: 'po', pos: 0 }); assert.equal(S.trainRun, undefined);
  assert.equal(P7.canAccessVault(S), false, '修行中は保管庫不可');
});

// ---------------------------------------------------------
// Step 3：街への帰還禁止・Chapter間ファーム・中断／再開
// ---------------------------------------------------------
const T1 = { nodes: { s: { type: 'start' }, a: { type: 'normal' }, g: { type: 'tournament' } }, conn: { s: ['a'], a: ['g'] }, start: 's', goal: 'g' };
function raisingSave(P7, P8, maps = [1]) {
  for (const no of maps) P7.registerChapterBoard(no, T1);
  const S = P8.newSave(); S.m = P8.initIndividual(S, mon(P7, { name: 'A' })); S.box = [P8.initIndividual(S, mon(P7, { name: 'B', sp: 1 }))];
  return S;
}
/** index.html の関数を実物のまま取り出して動かす（1行関数用） */
function htmlEnv(names, deps, extra = '') {
  const src = names.map((n) => HTML.split('\n').find((l) => l.startsWith(`function ${n}(`))).join('\n') + '\n' + extra;
  const keys = Object.keys(deps);
  return new Function(...keys, `${src}\nreturn {${names.join(',')}};`)(...keys.map((k) => deps[k]));
}

test('S3-1：未育成の個体がChapter 1へ出発＝育成開始（開始地点・0ターン・上限はChapter定義の値）', () => {
  const { P7, P8 } = load(); const S = raisingSave(P7, P8);
  assert.deepEqual(P8.canDepart(S, S.m), { ok: true, key: 1 });
  assert.equal(P8.canDepart(S, S.box[0]).reason, 'no_monster', '連れていない個体は出発できない');
  assert.equal(P8.depart(S, S.m).ok, true);
  const r = S.m.raise;
  assert.deepEqual([r.state, r.ch, r.node, r.turnsUsed, r.turnLimit], ['board', 1, 's', 0, P8.CHAPTER_RULES[1].turnLimit]);
  assert.equal(P8.canDepart(S, S.m).reason, 'not_at_farm', 'Chapter中は再出発できない');
});

test('S3-2：個体AのChapter進行が個体Bへ移らない（交換不可・データ上入れ替えても進行はA自身が保持）', () => {
  const { P7, P8 } = load(); const S = raisingSave(P7, P8);
  const A = S.m, B = S.box[0];
  P8.depart(S, A); A.raise.node = 'a'; A.raise.turnsUsed = 3;
  assert.equal(P8.canVisitTown(S), false, '育成中は街・牧場（交換・合体）へ行けない');
  assert.equal(B.raise.state, 'none'); assert.equal(B.raise.turnsUsed, 0); assert.equal(B.raise.node, null);
  const T = P8.normalizeV6(j({ ...S, m: B, box: [A] }));   // 仮にデータ上で入れ替えても
  assert.equal(T.m.uid, A.uid, '育成中のAが連れている個体に戻る');
  assert.deepEqual([T.m.raise.state, T.m.raise.node, T.m.raise.turnsUsed], ['board', 'a', 3]);
  assert.equal(T.box[0].uid, B.uid); assert.equal(T.box[0].raise.state, 'none', 'Bに進行は付かない');
});

test('S3-3：地図の無いChapterへは出発できない／途中データはChapter間ファームへ退避（ソフトロック救済）', () => {
  const { P7, P8 } = load(); const S = raisingSave(P7, P8);
  Object.assign(S.m.raise, { state: 'farm', ch: 2, log: [{ ch: 1 }] });
  assert.deepEqual(P8.canDepart(S, S.m), { ok: false, reason: 'no_map', key: 2 });
  Object.assign(S.m.raise, { state: 'board', ch: 2, node: null });
  assert.deepEqual(P8.ensureBoardPosition(S, S.m), { changed: true, rescued: true });
  assert.equal(S.m.raise.state, 'farm'); assert.equal(S.m.raise.ch, 2);
  Object.assign(S.m.raise, { state: 'board', ch: 1, node: null, turnsUsed: 0 });
  assert.deepEqual(P8.ensureBoardPosition(S, S.m), { changed: true }); assert.equal(S.m.raise.node, 's', '開始地点＝スタート');
});

test('S3-4：画面の復帰先と街への可否（未育成・Chapter中・Chapter間・修行中・育成完了）', () => {
  const { P7, P8 } = load(); const S = raisingSave(P7, P8);
  assert.equal(P8.resumeTarget(S), 'town'); assert.equal(P8.canVisitTown(S), true);
  P8.depart(S, S.m);
  assert.equal(P8.resumeTarget(S), 'board'); assert.equal(P8.canVisitTown(S), false);
  Object.assign(S.m.raise, { state: 'farm', ch: 2, log: [{ ch: 1 }] });
  assert.equal(P8.resumeTarget(S), 'farm'); assert.equal(P8.canVisitTown(S), false, 'Chapter間ファームからも街へ行けない');
  S.m.raise.trainRun = { kind: 'po', pos: 3 }; assert.equal(P8.resumeTarget(S), 'training');
  S.m.raise.trainRun = null; S.m.raise.state = 'done';
  assert.equal(P8.resumeTarget(S), 'town'); assert.equal(P8.canVisitTown(S), true, '育成完了後は街へ戻れる');
  assert.equal(P8.resumeTarget({ m: null, box: [] }), 'town');
});

test('S3-5：育成中は預け／受け取り／合体／市場／街などを「関数を直接呼んでも」拒否する（二重ガード）', async () => {
  const { P7, P8 } = load(); const S = raisingSave(P7, P8); S.g = 5000; P8.depart(S, S.m);
  for (const n of ['lobby', 'farm', 'market', 'mkd', 'mkgo', 'museum', 'musd', 'adopt', 'savescr', 'slotSave', 'slotLoad', 'imp', 'reset', 'dep', 'wd', 'selm']) {
    const l = HTML.split('\n').find((x) => x.startsWith(`function ${n}(`));
    assert.match(l, /^function \w+\([^)]*\)\{if\(p8Blocked\(\)\)return;/, `${n}() の先頭で拒否する`);
  }
  assert.match(HTML.slice(HTML.indexOf('async function fuse(){'), HTML.indexOf('\nfunction tog(k)')), /if\(p8Blocked\(\)\)return;/);
  const calls = [];
  const fuseSrc = HTML.slice(HTML.indexOf('async function fuse(){'), HTML.indexOf('\nfunction tog(k)'));
  const w = htmlEnv(['p8Blocked', 'dep', 'wd', 'selm', 'adopt'], {
    S, MMP8: P8, MMP7: P7, P8_LOAD: { locked: false }, sel: [0, 1], p8Resume: (m) => calls.push(m), p8LockScr: () => calls.push('lock'),
    farm: () => { throw new Error('牧場画面へ行ってはいけない'); }, lobby: () => { throw new Error('街へ行ってはいけない'); },
    save: () => { throw new Error('保存されてはいけない'); }, mk: () => { throw new Error('個体を作ってはいけない'); },
  }, fuseSrc + '\nvar _f=fuse;');
  const before = JSON.stringify(S);
  w.dep(); w.wd(0); w.selm(0); w.adopt(0, 'X');
  assert.equal(JSON.stringify(S), before, '連れている個体・預け個体・所持金など一切変わらない');
  assert.equal(calls.length, 4); assert.ok(calls.every((c) => /育成中は/.test(c)), '育成画面へ戻す');
});

test('S3-6：起動・再読み込みは街を経由せず育成状態へ復帰／中断はターンを消費しない', () => {
  const { P7, P8 } = load(); const S = raisingSave(P7, P8);
  assert.match(fnLine('function startGame('), /setTimeout\(\(\)=>p8Resume\(\),900\)/, 'タイトルから p8Resume へ');
  const sus = fnLine('function p8Suspend(');
  assert.match(sus, /save\(\);title\(\)/); assert.doesNotMatch(sus, /MMP8\.(roll|step|depart)/, '中断で進行を動かさない');
  const go = [];
  const w = htmlEnv(['p8Resume'], { S, MMP8: P8, $: () => null, P8_LOAD: { locked: false }, p8LockScr: () => go.push('lock'), trScr: () => go.push('training'), board: () => go.push('board'), hall: (t) => go.push('farm:' + t), lobby: () => go.push('town') });
  w.p8Resume(); P8.depart(S, S.m); S.m.raise.turnsUsed = 7; const snap = JSON.stringify(S.m.raise);
  w.p8Resume(); Object.assign(S.m.raise, { state: 'farm', ch: 2, log: [{ ch: 1 }] }); w.p8Resume();
  assert.deepEqual(go, ['town', 'board', 'farm:t']);
  const w2 = htmlEnv(['p8Resume'], { S, MMP8: P8, $: () => null, P8_LOAD: { locked: true, version: 7 }, p8LockScr: () => go.push('lock'), trScr() {}, board() {}, hall() {}, lobby() {} });
  w2.p8Resume(); assert.equal(go.at(-1), 'lock', '新しい版のセーブのときはロック画面');
  assert.ok(snap.includes('"turnsUsed":7'));
});

test('S3-7：Chapter間ファーム・Chapter中の画面に「街にもどる」を出さない', () => {
  const hallSrc = HTML.slice(HTML.indexOf('function _hall(tab,msg){'), HTML.indexOf('\nfunction after('));
  assert.match(hallSrc, /\$\{MMP8\.canVisitTown\(S\)\?'<button class="back" onclick="lobby\(\)">◀ 街にもどる<\/button>':""\}/);
  assert.match(hallSrc, /MMP7\.inChapter\(S\.m\)&&tab!="st"&&tab!="w"\)\{board\(msg\);return\}/, 'Chapter中はステータス・わざ以外はボードへ');
  const boardSrc = HTML.slice(HTML.indexOf('function board(msg){'), HTML.indexOf('\nfunction bPositionMon('));
  assert.doesNotMatch(boardSrc, /街にもどる|onclick="lobby\(\)"/);
});

// ---------------------------------------------------------
// Step 4：20ターン制（1ターン＝サイコロ1回）・途中状態の保存
// ---------------------------------------------------------
/** 一本道のテスト用マップ（n歩でゴール。途中マスの種類を指定できる） */
function line(n, type = 'normal') {
  const nodes = { s: { type: 'start', x: 0, y: 0 } }, conn = {}; let prev = 's';
  for (let i = 1; i < n; i++) { const id = 'n' + i; nodes[id] = { type, x: i, y: 0 }; conn[prev] = [id]; prev = id; }
  nodes.g = { type: 'tournament', x: n, y: 0 }; conn[prev] = ['g'];
  return { nodes, conn, start: 's', goal: 'g' };
}
function boardSave(P7, P8, track) {
  P7.registerChapterBoard(1, track);
  const S = P8.newSave(); S.m = P8.initIndividual(S, mon(P7, { name: 'A' })); P8.depart(S, S.m);
  return S;
}
/** そのターンの移動・分岐（先頭を選ぶ）・マス処理を最後まで進める */
function runTurn(P8, S, rnd = () => 0) {
  for (let g = 0; g < 60 && S.m.raise.pend; g++) {
    const st = S.m.raise.pend.stage;
    if (st === 'move') P8.step(S, S.m);
    else if (st === 'branch') P8.chooseBranch(S, S.m, S.m.raise.pend.opts[0]);
    else if (st === 'resolve') P8.resolveLanding(S, S.m, rnd);
    else if (st === 'battle') P8.skipBattleSquare(S, S.m);
  }
}
const between = (a, b) => { const i = HTML.indexOf(a), k = HTML.indexOf(b, i + a.length); if (i < 0 || k < 0) throw new Error('抽出失敗: ' + a); return HTML.slice(i, k); };

test('S4-1：1回振る＝1ターン。出目は移動前に確定・記録され、途中で保存・再読込しても残り移動のまま続く', () => {
  const { P7, P8 } = load(); const S = boardSave(P7, P8, line(70));
  const r = P8.roll(S, S.m, () => 0.99);
  assert.equal(r.value, 3); assert.equal(S.m.raise.turnsUsed, 1);
  assert.deepEqual(S.m.raise.pend, { roll: 3, left: 3, stage: 'move' });
  assert.equal(P8.roll(S, S.m).ok, false, '移動の途中では振れない');
  P8.step(S, S.m); assert.equal(S.m.raise.node, 'n1'); assert.equal(S.m.raise.pend.left, 2);
  const T = P8.migrateSave(j(S));   // 途中で保存 → 再読み込み
  assert.deepEqual(T.m.raise.pend, { roll: 3, left: 2, stage: 'move' }, '振り直しにならない');
  P8.step(T, T.m); P8.step(T, T.m);
  assert.equal(T.m.raise.node, 'n3'); assert.equal(T.m.raise.pend.stage, 'resolve');
  P8.resolveLanding(T, T.m);
  assert.equal(T.m.raise.pend, null); assert.equal(T.m.raise.turnsUsed, 1);
});

test('S4-2：20ターン目の移動とマス効果を実行してからChapter終了。ゴール未到達は大会なし・報酬なしで次Chapterへ（育成失敗ではない）', () => {
  const { P7, P8 } = load(); const S = boardSave(P7, P8, line(70, 'power'));
  const po0 = S.m.po, g0 = S.g;
  for (let t = 1; t <= 20; t++) { assert.equal(P8.roll(S, S.m, () => 0).ok, true, `${t}ターン目`); runTurn(P8, S, () => 0); }
  assert.equal(S.m.raise.turnsUsed, 20); assert.equal(S.m.raise.node, 'n20', '20ターン目の移動も行われる');
  assert.equal(S.m.po, po0 + 20 * 5, '20ターン目に止まったマスの効果も発生');
  assert.equal(P8.canRoll(S.m), false); assert.equal(P8.boardPhase(S.m), 'timeup');
  assert.equal(P8.declineTournament(S, S.m).ok, false, 'ゴールしていないので大会の選択肢自体がない');
  const e = P8.endChapter(S, S.m);
  assert.equal(e.ok, true); assert.equal(e.entry.reachedGoal, false); assert.equal(e.entry.tour, null);
  assert.equal(S.g, g0, '報酬なし');
  assert.deepEqual([S.m.raise.state, S.m.raise.ch], ['farm', 2]);
  assert.ok(P7.hasEndedChapter(S.m, 1), 'Chapter 1を終えた扱い（修行の解放条件）');
});

test('S4-3：早くゴールしたらボードは終了（残りターンは使わない）。大会に挑戦するか辞退するまでChapterは終わらない', () => {
  const { P7, P8 } = load(); const S = boardSave(P7, P8, line(3));
  P8.roll(S, S.m, () => 0.99); runTurn(P8, S);
  assert.equal(S.m.raise.node, 'g'); assert.equal(S.m.raise.goal, true); assert.equal(S.m.raise.turnsUsed, 1);
  assert.equal(P8.canRoll(S.m), false, 'ゴール後は振れない'); assert.equal(P8.boardPhase(S.m), 'goal');
  assert.equal(P8.endChapter(S, S.m).reason, 'tournament_pending');
  const e = P8.declineTournament(S, S.m);
  assert.equal(e.ok, true); assert.equal(e.entry.reachedGoal, true); assert.equal(e.entry.declined, true);
  assert.deepEqual([S.m.raise.state, S.m.raise.ch], ['farm', 2]);
});

test('S4-4：ターン上限は定数（DEFAULT_TURN_LIMIT）を変えるだけで変更でき、マップのノード数とは独立', () => {
  const src25 = P8SRC.replace('const DEFAULT_TURN_LIMIT = 20;', 'const DEFAULT_TURN_LIMIT = 25;');
  assert.notEqual(src25, P8SRC);
  const { P7, P8 } = load(src25); const S = boardSave(P7, P8, line(90));
  for (const no of [1, 2, 3, 4]) assert.equal(P8.CHAPTER_RULES[no].turnLimit, 25);
  assert.equal(S.m.raise.turnLimit, 25);
  for (let t = 0; t < 25; t++) { assert.equal(P8.roll(S, S.m, () => 0).ok, true); runTurn(P8, S); }
  assert.equal(P8.roll(S, S.m).ok, false); assert.equal(P8.boardPhase(S.m), 'timeup');
  const { P7: Q7, P8: Q8 } = load(); const U = boardSave(Q7, Q8, line(8));   // ノード数が違っても上限は同じ
  assert.equal(U.m.raise.turnLimit, 20);
});

test('S4-5：分岐待ち・マス処理の途中で中断・再読込しても、振り直し・イベントの引き直しは起きない', () => {
  const { P7, P8 } = load();
  const trk = { nodes: { s: { type: 'start' }, a: { type: 'normal' }, b1: { type: 'normal' }, b2: { type: 'event' }, c1: { type: 'normal' }, g: { type: 'tournament' } },
    conn: { s: ['a'], a: ['b1', 'c1'], b1: ['b2'], b2: ['g'], c1: ['g'] }, start: 's', goal: 'g' };
  const S = boardSave(P7, P8, trk);
  P8.roll(S, S.m, () => 0.99); P8.step(S, S.m); P8.step(S, S.m);
  assert.deepEqual(S.m.raise.pend, { roll: 3, left: 2, stage: 'branch', opts: ['b1', 'c1'] }, '分岐待ち（ランダムに進まない）');
  const T = P8.migrateSave(j(S));
  assert.deepEqual(T.m.raise.pend, { roll: 3, left: 2, stage: 'branch', opts: ['b1', 'c1'] });
  assert.equal(P8.chooseBranch(T, T.m, 'zz').ok, false, '選択肢以外は選べない');
  P8.chooseBranch(T, T.m, 'b1'); P8.step(T, T.m);
  assert.equal(T.m.raise.node, 'b2'); assert.equal(T.m.raise.pend.stage, 'resolve');
  const r = P8.resolveLanding(T, T.m, () => 0);   // イベント（草：ちから+6）
  assert.equal(r.fx.ev, 'herb'); assert.equal(T.m.po, 106);
  assert.equal(P8.resolveLanding(T, T.m, () => 0).ok, false, '同じマスの効果は二度発生しない');
  assert.equal(T.m.raise.turnsUsed, 1);
});

test('S4-6：バトルマス（練習試合）の選択待ちは保存され、途中終了した練習試合はもう一度選べる（報酬は出ない）', () => {
  const { P7, P8 } = load();
  const S = boardSave(P7, P8, { nodes: { s: { type: 'start' }, b: { type: 'battle' }, g: { type: 'tournament' } }, conn: { s: ['b'], b: ['g'] }, start: 's', goal: 'g' });
  S.g = 300; P8.roll(S, S.m, () => 0); P8.step(S, S.m);
  assert.equal(P8.resolveLanding(S, S.m).wait, true);
  const T = P8.migrateSave(j(S)); assert.equal(T.m.raise.pend.stage, 'battle');
  assert.equal(P8.beginBattle(T, T.m, { kind: 'practice', rank: P8.practiceRank(T.m) }).ok, true);
  T.g += 100; T.wins = 1;   // fight()が旧報酬を付けて保存した直後に中断（adv()前）
  const U = P8.migrateSave(j(T));
  assert.deepEqual(P8.finishBattle(U, U.m), { kind: 'practice', interrupted: true });
  assert.equal(U.g, 400, '途中終了扱いでは戻さない（旧fight()は終了時にしか報酬を付けないため、この状態は起こらない）');
  assert.equal(U.m.raise.pend.stage, 'battle', 'もう一度選べる');
  P8.beginBattle(U, U.m, { kind: 'practice', rank: 0 }); U.g += 100; U.wins = 2; P8.markBattleDone(U);
  const f = P8.finishBattle(U, U.m);
  assert.equal(f.won, true); assert.equal(U.g, 400); assert.equal(U.wins, 1); assert.equal(U.m.raise.pend, null);
});

test('S4-7：画面側：出目は演出の前に確定・保存、移動は1歩ごとに保存、残りターン表示、街へ戻る・旧腕試し大会への導線なし', () => {
  const rollSrc = between('async function bRoll(', '\nasync function p8Continue(');
  const i = rollSrc.indexOf('MMP8.roll(S,m);save();');
  assert.ok(i > 0 && i < rollSrc.indexOf('sfx(7)'), 'roll→save→サイコロ演出の順');
  assert.match(between('async function p8Continue(', '\nfunction bPickBranch('), /MMP8\.step\(S,m\);save\(\);/);
  assert.match(fnLine('function p8Resolve('), /MMP8\.resolveLanding\(S,m\);save\(\);/);
  const boardSrc = between('function board(msg){', '\nfunction bPositionMon(');
  // Phase 9：残りターンはボード上部のHUD（p9BoardHud）に表示する
  assert.match(boardSrc, /\$\{p9BoardHud\(m\)\}/); assert.match(between('function p9BoardHud(m){', '\nfunction board(msg){'), /p8TurnText\(m\)/);
  assert.match(fnLine('function p8TurnText('), /MMP8\.turnsLeft\(m\)/);
  assert.doesNotMatch(boardSrc, /街にもどる|lobby\(\)|dscr\('b'\)|腕試し/);
  assert.match(fnLine('function adv(){'), /^function adv\(\)\{MMP8\.markBattleDone\(S\)/, 'fight()終了時に戦闘完了の印');
});

// ---------------------------------------------------------
// Step 5：挑戦できるランク・優勝報酬（初回／再クリア）・下位ランクのクリア扱い
// ---------------------------------------------------------
test('S5-1：挑戦できるランク＝最高クリア＋2（S上限）。未クリアはE・D、Chapter 1はDまで', () => {
  const { P7, P8 } = load(); const m = mon(P7);
  assert.deepEqual(P8.eligibleRanks(m, 1), [0, 1]); assert.deepEqual(P8.eligibleRanks(m, 2), [0, 1]);
  m.prog.rankClr[0] = true;   // Eクリア
  assert.deepEqual(P8.eligibleRanks(m, 1), [0, 1], 'Chapter 1の上限はD'); assert.deepEqual(P8.eligibleRanks(m, 2), [0, 1, 2], 'Cまで');
  m.prog.rankClr = [true, true, false, false, false, false];
  assert.equal(P8.maxChallengeRank(m, 3), 3, 'DクリアでBまで');
  m.prog.rankClr = [true, true, true, true, false, false];
  assert.equal(P8.maxChallengeRank(m, 4), 5, 'BクリアでSまで');
  m.prog.rankClr = [true, true, true, true, true, true];
  assert.equal(P8.maxChallengeRank(m, 4), 5, 'S上限');
  assert.equal(P8.canChallenge(m, 2, 0), true, 'クリア済み・下位ランクにも再挑戦できる');
  assert.equal(P8.CHAPTER_RULES[1].rankCap, 1); for (const no of [2, 3, 4]) assert.equal(P8.CHAPTER_RULES[no].rankCap, null);
  const { P7: Q7, P8: Q8 } = load(P8SRC.replace('rankCap: RANK_D, tournament: true', 'rankCap: RANK_E, tournament: true'));
  assert.deepEqual(Q8.eligibleRanks(mon(Q7), 1), [0], 'Chapterごとの上限はデータで変更できる');
});

test('S5-2：初回優勝＝賞金・修行チケット・ステータスボーナス（異なる3能力）・実績。記録（勝利数・ブリーダーランク）は1回だけ', () => {
  const { P7, P8 } = load(); const S = P8.newSave(); S.m = P8.initIndividual(S, mon(P7)); S.g = 1000; S.wins = 5; S.br = 0;
  const before = { ...S.m };
  const r = P8.grantTournamentWin(S, S.m, 2, seq(0, 0, 0.5, 0.5, 0.99, 0.99));
  assert.equal(r.firstClear, true); assert.equal(r.prize, 350); assert.equal(r.tickets, 2);
  assert.equal(S.g, 1350); assert.equal(S.trainTix, 2);
  assert.equal(r.bonus.length, 3); assert.equal(new Set(r.bonus.map((b) => b.key)).size, 3, '異なる3能力');
  for (const b of r.bonus) { assert.ok(b.amount >= 4 && b.amount <= 7, 'Cは+4〜7'); assert.equal(S.m[b.key], before[b.key] + b.amount); }
  const others = ['li', 'po', 'in', 'hi', 'ev', 'de'].filter((k) => !r.bonus.some((b) => b.key === k));
  for (const k of others) assert.equal(S.m[k], before[k], '選ばれなかった能力は変わらない');
  assert.deepEqual(S.m.prog.rankClr, [true, true, true, false, false, false], '下位ランクもクリア扱い');
  assert.deepEqual(S.rankRec.cleared.slice(0, 3), [true, true, true]);
  assert.equal(S.wins, 6); assert.equal(S.br, 2); assert.equal(P8.rankLabel(S.m), 'C');
});

test('S5-3：再優勝はステータスボーナスのみ／飛ばした下位ランクの初回報酬は付与しない', () => {
  const { P7, P8 } = load(); const S = P8.newSave(); S.m = P8.initIndividual(S, mon(P7)); S.g = 0;
  P8.grantTournamentWin(S, S.m, 2, () => 0);           // いきなりC（E・Dは飛ばした）
  const g1 = S.g, t1 = S.trainTix;
  const re = P8.grantTournamentWin(S, S.m, 2, () => 0);  // Cを再優勝
  assert.equal(re.firstClear, false); assert.equal(S.g, g1); assert.equal(S.trainTix, t1); assert.equal(re.bonus.length, 3);
  const low = P8.grantTournamentWin(S, S.m, 1, () => 0); // 飛ばしたDで優勝
  assert.equal(low.firstClear, false, 'クリア扱い済みなので初回ではない');
  assert.equal(S.g, g1, 'Dの賞金は付与しない'); assert.equal(S.trainTix, t1, 'Dのチケットも付与しない');
  assert.equal(low.bonus.length, 3, 'ステータスボーナスは付く');
});

test('S5-4：報酬の値は定数で管理（賞金・チケット・ボーナス範囲E〜S）', () => {
  const { P7, P8 } = load();
  assert.deepEqual(P8.PRIZE, [100, 200, 350, 550, 800, 1200]);
  assert.deepEqual(P8.FIRST_CLEAR_TICKETS, [1, 1, 2, 2, 2, 2]);
  assert.deepEqual(P8.WIN_BONUS_RANGE, [[2, 4], [3, 5], [4, 7], [6, 9], [8, 12], [11, 16]]);
  assert.equal(P8.WIN_BONUS_COUNT, 3);
  for (let rank = 0; rank < 6; rank++) {
    const [lo, hi] = P8.WIN_BONUS_RANGE[rank];
    const S = P8.newSave(); S.m = P8.initIndividual(S, mon(P7));
    assert.ok(P8.grantTournamentWin(S, S.m, rank, () => 0).bonus.every((b) => b.amount === lo), `${rank}：最小`);
    assert.ok(P8.grantTournamentWin(S, S.m, rank, () => 0.999).bonus.every((b) => b.amount === hi), `${rank}：最大`);
  }
  const S = P8.newSave(); S.m = P8.initIndividual(S, mon(P7));
  assert.equal(P8.grantTournamentWin(S, S.m, 5, () => 0).bagUnlocked, true, 'Sランク初回優勝でバッグ拡張（既存仕様）');
});

test('S5-5：表示ランク＝その個体のクリア最高ランク（未クリアは「ー」）。fight()以外の表示はrankLabelを使う', () => {
  const { P7, P8 } = load(); const m = mon(P7, { rk: 3 });
  assert.equal(P8.rankLabel(m), 'ー'); m.prog.rankClr[1] = true; assert.equal(P8.rankLabel(m), 'D');
  const a = HTML.indexOf('async function fight('), b = HTML.indexOf('\n$("#snd").textContent', a);
  const outside = HTML.slice(0, a) + HTML.slice(b);
  assert.doesNotMatch(outside, /RN\[m\.rk\]|RN\[m\.rk\|\|0\]/, '旧ランク欄をそのまま表示しない');
  assert.match(outside, /MMP8\.rankLabel\(m\)/);
});

// ---------------------------------------------------------
// Step 6：公式ランク大会（総当たりリーグ）
// ---------------------------------------------------------
function goalSave(P7, P8, over = {}) {
  const S = boardSave(P7, P8, line(1)); Object.assign(S, over);
  P8.roll(S, S.m, () => 0); runTurn(P8, S); return S;
}
/** リーグの試合を1つ行う（fight()の旧報酬付与と終了の印を再現） */
function playLeague(P8, S, won) {
  const t = S.m.raise.tour; assert.equal(P8.beginBattle(S, S.m, { kind: 'league', rank: t.rank }).ok, true);
  if (won) { S.g += 999; S.wins = (S.wins || 0) + 1; S.br = 5; S.m.rk = 5; }
  P8.markBattleDone(S); return P8.finishBattle(S, S.m, () => 0);
}

test('S6-1：参加人数はE・D 6体（5試合）、C〜S 8体（7試合）。全員が全員と1回ずつ戦う日程', () => {
  const { LG } = load();
  assert.deepEqual(LG.LEAGUE_SIZE, [6, 6, 8, 8, 8, 8]);
  for (let rank = 0; rank < 6; rank++) {
    const lg = LG.createLeague(rank, 7 + rank, 'A'), n = lg.size;
    assert.equal(lg.entrants.length, n); assert.equal(lg.rounds.length, n - 1, 'プレイヤーの試合数＝参加者数−1');
    const seen = new Set();
    for (const rd of lg.rounds) {
      const ids = rd.flatMap((mt) => [mt.a, mt.b]); assert.equal(new Set(ids).size, n, '各ラウンドで全員1試合');
      for (const mt of rd) { const k = [mt.a, mt.b].sort().join('-'); assert.ok(!seen.has(k), '同じ組み合わせは1回'); seen.add(k); }
    }
    assert.equal(seen.size, n * (n - 1) / 2);
    assert.ok(lg.rounds.flat().filter((mt) => mt.a && mt.b).every((mt) => mt.winner != null), 'NPC同士は作成時に確定');
  }
});

test('S6-2：大会状態（参加者・勝敗・順位・残り試合）は保存され、中断・再開で再抽選されない／同じシードなら同じ大会', () => {
  const { P7, P8, LG } = load(); const S = goalSave(P7, P8);
  assert.equal(P8.startTournament(S, S.m, 1, 1234).ok, true);
  playLeague(P8, S, true); playLeague(P8, S, false);
  const T = P8.migrateSave(j(S));   // 中断 → 再読み込み
  assert.deepEqual(T.m.raise.tour, S.m.raise.tour, '参加者・勝敗・順位・残り試合が同じ');
  assert.deepEqual(LG.standings(T.m.raise.tour.league), LG.standings(S.m.raise.tour.league));
  assert.equal(P8.tourNext(T.m).round, 2, '次は第3試合');
  assert.deepEqual(LG.createLeague(3, 99, 'A'), LG.createLeague(3, 99, 'A'), '再現可能');
});

test('S6-3：最終1位だけがクリア。1位でなければ報酬なしでChapter終了（ランク実績も付かない）', () => {
  const { P7, P8, LG } = load();
  LG.setNpcMatchResolver((a, b) => a.id === 1 || (b.id !== 1 && a.id < b.id));   // NPC 1がNPC戦で全勝
  const S = goalSave(P7, P8, { g: 500 });
  P8.startTournament(S, S.m, 0, 5);
  LG.setNpcMatchResolver(null);
  let f; for (let i = 0; i < 5; i++) f = playLeague(P8, S, P8.tourNext(S.m).opp !== 1);   // NPC 1にだけ負ける（4勝1敗）
  assert.equal(f.settled, true); assert.equal(f.place, 2, '5勝のNPC 1が1位、4勝のプレイヤーは2位');
  assert.equal(f.won, false); assert.equal(f.reward, null);
  assert.deepEqual([S.g, S.trainTix, S.wins || 0], [500, 0, 0], '賞金・チケット・勝利数なし（個別の4勝分も残らない）');
  assert.deepEqual(S.m.prog.rankClr, [false, false, false, false, false, false]);
  assert.equal(P8.boardPhase(S.m), 'tour_done');
  const e = P8.endChapter(S, S.m);
  assert.equal(e.ok, true); assert.equal(e.entry.tour.place, 2); assert.equal(e.entry.tour.won, false); assert.equal(S.m.raise.state, 'farm');
});

test('S6-4：大会の試合が途中で終わっても参加権を失わず、同じ試合をやり直せる（大会状態は変わらない）', () => {
  const { P7, P8 } = load(); const S = goalSave(P7, P8, { g: 100 });
  P8.startTournament(S, S.m, 1, 77); playLeague(P8, S, true);
  const before = j(S.m.raise.tour);
  assert.equal(P8.beginBattle(S, S.m, { kind: 'league', rank: 1 }).ok, true);
  const U = P8.migrateSave(j(S));   // 試合中にアプリ終了（fight()の終了前）
  assert.deepEqual(P8.finishBattle(U, U.m), { kind: 'league', interrupted: true });
  assert.deepEqual(U.m.raise.tour, before, '勝敗も残り試合も変わらない');
  assert.equal(P8.tourNext(U.m).round, 1, '同じ第2試合をもう一度');
  assert.equal(P8.beginBattle(U, U.m, { kind: 'practice', rank: 1 }).ok, false, '大会中に練習試合は始められない');
});

test('S6-5：大会はゴール後のみ・各Chapter 1回・挑戦できるランクだけ・辞退したら参加できない', () => {
  const { P7, P8 } = load();
  const A = boardSave(P7, P8, line(5));
  assert.equal(P8.startTournament(A, A.m, 0).reason, 'not_at_goal');
  const S = goalSave(P7, P8);
  assert.equal(P8.startTournament(S, S.m, 2).reason, 'rank_locked', '未クリアはE・Dまで（Chapter 1はDまで）');
  assert.equal(P8.startTournament(S, S.m, 0).ok, true);
  assert.equal(P8.startTournament(S, S.m, 1).reason, 'already_entered');
  assert.equal(P8.declineTournament(S, S.m).ok, false, '参加後は辞退できない');
  const D = goalSave(P7, P8); P8.declineTournament(D, D.m);
  assert.equal(P8.startTournament(D, D.m, 0).reason, 'not_in_chapter');
});

test('S6-6：同じ勝ち数の順位は「その中での対戦成績→作成時の抽選値」で決まる（保存済みの値を使うので再抽選しない）', () => {
  const { LG } = load();
  const lg = LG.createLeague(0, 3, 'A');
  for (const rd of lg.rounds) for (const mt of rd) mt.winner = Math.min(mt.a, mt.b);   // 番号の若い方が勝つ
  lg.round = lg.rounds.length;
  assert.deepEqual(LG.standings(lg).map((t) => t.id), [0, 1, 2, 3, 4, 5]);
  const lg2 = LG.createLeague(0, 3, 'A');
  lg2.rounds[0][0].winner = lg2.rounds[0][0].a; lg2.round = 1;   // 1ラウンド目だけ
  const st = LG.standings(lg2), ones = st.filter((t) => t.w === 1), zeros = st.filter((t) => t.w === 0);
  assert.ok(st.indexOf(ones[0]) < st.indexOf(zeros[0]), '勝ち数が多い方が上');
  for (let i = 1; i < ones.length; i++) assert.ok(ones[i - 1].lot <= ones[i].lot, '同勝数・対戦なしは抽選値順');
  assert.deepEqual(LG.standings(lg2), LG.standings(j(lg2)));
});

test('S6-7：【暫定】NPCの生成・NPC同士の勝敗は差し替えられる（正式データ未確定）', () => {
  const { LG } = load();
  assert.equal(LG.PROVISIONAL, true);
  LG.setNpcProvider((rank, count) => Array.from({ length: count }, (_, i) => ({ name: `正式NPC${i}`, power: 1 })));
  const lg = LG.createLeague(2, 1, 'A');
  assert.deepEqual(lg.entrants.slice(1).map((e) => e.name), ['正式NPC0', '正式NPC1', '正式NPC2', '正式NPC3', '正式NPC4', '正式NPC5', '正式NPC6']);
  LG.setNpcProvider(null);
  assert.match(LG.createLeague(2, 1, 'A').entrants[1].name, /ブリーダー/);
});

test('S6-8：画面：ゴールで挑戦できるランクだけを表示し、参加は2度押し。大会画面に順位表・次の相手・試合開始', () => {
  const goal = fnLine('function p8GoalHtml(m)') + between('function p8GoalHtml(m)', '\nfunction p8TourStart(');
  assert.match(goal, /MMP8\.eligibleRanks\(m,r\.ch\)/); assert.match(goal, /辞退/);
  assert.match(fnLine('function p8TourStart('), /arm\(b,/);
  const scr = between('function p8TourScr(msg){', '\nfunction p9TourResult(');
  assert.match(scr, /MMP8L\.standings\(lg\)/); assert.match(scr, /次の相手/); assert.match(scr, /onclick="p9VsScr\(\)"/, 'Phase 9：試合はVS画面を経由して開始');
  assert.match(fnLine('function p9VsGo('), /p9arm\(b,[^)]*\)\)return;p8TourFight\(\)/);
  assert.match(fnLine('function p8TourFight('), /MMP8\.beginBattle\(S,m,\{kind:"league",rank:t\.rank\}\)[^;]*;save\(\);fight\(t\.rank\)/);
  assert.ok(HTML.indexOf('js/phase8/league.js') < HTML.indexOf('js/phase8/raising.js'), 'league.js を先に読み込む');
});

// ---------------------------------------------------------
// Step 7：育成リソースHUD・修行チケットマス・丈夫さ修行の解放条件
// ---------------------------------------------------------
test('S7-1：修行チケットマスで+1枚（バッグ枠外）。チケットはChapterをまたいで保持され、修行1回で1枚消費', () => {
  const { P7, P8 } = load(); const S = boardSave(P7, P8, line(3, 'ticket'));
  S.trainTix = 2; const bag = j(S.inv);
  P8.roll(S, S.m, () => 0); P8.step(S, S.m);
  const r = P8.resolveLanding(S, S.m);
  assert.deepEqual(r.fx, { kind: 'ticket', amount: 1 }); assert.equal(S.trainTix, 3);
  assert.deepEqual(S.inv, bag, 'バッグ・保管庫は変わらない');
  P8.roll(S, S.m, () => 0); runTurn(P8, S);
  assert.equal(S.trainTix, 4, '止まったマスごとに+1');
  P8.roll(S, S.m, () => 0); runTurn(P8, S); P8.declineTournament(S, S.m);
  assert.equal(S.trainTix, 4, 'Chapter終了後も保持'); assert.equal(S.m.raise.state, 'farm');
  const U = boardSave(P7, P8, line(4, 'ticket')); U.trainTix = 0;
  P8.roll(U, U.m, () => 0.99); runTurn(P8, U);
  assert.equal(U.trainTix, 1, '通過したマスでは増えない（止まったマスだけ）');
  assert.equal(P7.startTraining(S, S.m, 'po').ok, true); assert.equal(S.trainTix, 3, '修行1回で1枚');
  assert.equal(P8.TICKET_SQUARE_AMOUNT, 1);
});

test('S7-2：HUDは複数リソースに対応（今回は🎫修行チケット×数のみ）。ボード・大会・Chapter間ファームの上部に表示', () => {
  const { P8 } = load(); const S = P8.newSave(); S.trainTix = 3;
  assert.deepEqual(P8.resources(S), [{ id: 'trainTix', icon: '🎫', label: '修行チケット', value: 3 }]);
  P8.registerResource({ id: 'x', icon: '★', label: '将来のリソース', get: () => 9 });
  assert.equal(P8.resources(S).length, 2, '将来のリソースを追加できる');
  assert.match(fnLine('function p8Hud('), /MMP8\.resources\(S\)\.map/);
  assert.match(between('function board(msg){', '\nfunction bPositionMon('), /\$\{p9BoardHud\(m\)\}/, 'ボードのHUD（Phase 9で2段化）');
  assert.match(between('function p9BoardHud(m){', '\nfunction board(msg){'), /\$\{p8Hud\(`<span class="p9chip p9turn">/, 'HUDの2段目に残りターンと育成リソースを並べる');
  // Phase 9：大会画面のHUDは大会見出し（p9TourHead）に置く
  assert.match(between('function p8TourScr(msg){', '\nfunction p9TourResult('), /\$\{p9TourHead\(m,t\)\}/);
  assert.match(between('function p9TourHead(m,t){', '\nfunction p9Standings('), /\$\{p8Hud\(\)\}/);
  assert.match(between('function p8FarmPanel(){', '\n// ---- Phase 8：育成中の画面遷移'), /st=="farm"\?p8Hud\(\)/);
  assert.match(HTML, /const BTYPE_LABEL=\{ticket:"修行チケット",/); assert.match(HTML, /const BTYPE_ICON=\{ticket:"🎫",/);
});

test('S7-3：丈夫さ修行はCランク以上の大会クリアで解放（B条件は廃止）・2回制は維持', () => {
  const { P7, P8 } = load(); const S = P8.newSave(); S.trainTix = 9;
  S.m = P8.initIndividual(S, mon(P7)); Object.assign(S.m.raise, { state: 'farm', ch: 2, log: [{ ch: 1 }] });
  P7.recordRankClear(S, S.m, 1); assert.equal(P7.canStartTraining(S, S.m, 'de').reason, 'locked');
  P7.recordRankClear(S, S.m, 2); assert.deepEqual(P7.canStartTraining(S, S.m, 'de'), { ok: true });
  S.m.prog.train.de = 2; assert.equal(P7.canStartTraining(S, S.m, 'de').reason, 'max');
  assert.match(HTML, /locked:"🔒 Cランク以上の大会をクリアすると解放"/);
});

// ---------------------------------------------------------
// Step 8：育成放棄
// ---------------------------------------------------------
test('S8-1：育成放棄はChapter進行中・Chapter間ファームで可能（未育成・育成完了・修行中・戦闘中は不可）', () => {
  const { P7, P8 } = load(); const S = raisingSave(P7, P8);
  assert.equal(P8.canAbandon(S).reason, 'not_raising');
  P8.depart(S, S.m); assert.deepEqual(P8.canAbandon(S), { ok: true });
  Object.assign(S.m.raise, { state: 'farm', ch: 2, node: null, log: [{ ch: 1 }] }); assert.deepEqual(P8.canAbandon(S), { ok: true });
  S.m.raise.trainRun = { kind: 'po', pos: 2 }; assert.equal(P8.canAbandon(S).reason, 'training');
  S.m.raise.trainRun = null; S.m.raise.battle = { kind: 'practice' }; assert.equal(P8.canAbandon(S).reason, 'in_battle');
  S.m.raise.battle = null; S.m.raise.state = 'done'; assert.equal(P8.canAbandon(S).reason, 'not_raising');
});

test('S8-2：放棄すると育成中の個体と進行だけが削除され、所持金・チケット・バッグ・保管庫・育成数・預け個体は変わらない', () => {
  const { P7, P8 } = load(); const S = raisingSave(P7, P8);
  Object.assign(S, { g: 1234, trainTix: 5, cnt: 7, wins: 3, br: 2 }); S.inv.bag.push({ id: 'x' }); S.inv.vault.push({ id: 'y' });
  P8.depart(S, S.m); S.m.raise.turnsUsed = 9;
  const keep = j({ ...S, m: null });
  assert.equal(P8.abandon(S, 'm-違う').reason, 'uid_mismatch', '確認した個体と違えば何もしない');
  assert.ok(S.m);
  const r = P8.abandon(S, S.m.uid);
  assert.equal(r.ok, true); assert.equal(r.name, 'A');
  assert.equal(S.m, null); assert.deepEqual(j(S), keep);
  assert.equal(P8.canVisitTown(S), true); assert.equal(P8.resumeTarget(S), 'town');
});

test('S8-3：画面：ボード・大会・Chapter間ファームに育成放棄。2段階確認で、最後のボタンは待たないと押せない（1回の誤タップでは放棄されない）', () => {
  assert.match(fnLine('function p8BoardMenu('), /p8AbandonAsk\(\)/);
  assert.match(between('function p8FarmPanel(){', '\n// ---- Phase 8：育成中の画面遷移'), /p8AbandonAsk\(\)/);
  const ask = between('function p8AbandonAsk(){', '\nfunction p8AbandonAsk2(');
  assert.doesNotMatch(ask, /MMP8\.abandon\(/, '1段階目では放棄しない'); assert.match(ask, /やめない/);
  const ask2 = between('function p8AbandonAsk2(uid){', '\nfunction p8AbandonGo(');
  assert.match(ask2, /id="p8abgo" disabled/); assert.match(ask2, /setInterval/); assert.match(ask2, /m\.uid!==uid/);
  const go = fnLine('function p8AbandonGo(');
  assert.match(go, /if\(!b\|\|b\.disabled\)return;const r=MMP8\.abandon\(S,uid\);/); assert.match(go, /lobby\(/);
});

// ---------------------------------------------------------
// Step 9：Chapter 4終了後の最終Chapter判定・最終Chapter（土台）
// ---------------------------------------------------------
function ch4GoalSave(P7, P8, rankClr) {
  for (const no of [1, 2, 3, 4]) P7.registerChapterBoard(no, line(1));
  const S = P8.newSave(); S.m = P8.initIndividual(S, mon(P7, { name: 'A' })); S.m.prog.rankClr = rankClr;
  Object.assign(S.m.raise, { state: 'farm', ch: 4, log: [{ ch: 1 }, { ch: 2 }, { ch: 3 }] });
  P8.depart(S, S.m); P8.roll(S, S.m, () => 0); runTurn(P8, S);
  return S;
}
test('S9-1：Chapter 4終了時のクリア最高ランクがB以下なら育成完了、A・Sなら最終Chapterへ強制進行（選択不可）', () => {
  const { P7, P8 } = load();
  const B = ch4GoalSave(P7, P8, [true, true, true, true, false, false]);
  assert.equal(P8.declineTournament(B, B.m).next, 'done'); assert.equal(B.m.raise.state, 'done');
  for (const rc of [[true, true, true, true, true, false], [true, true, true, true, true, true]]) {
    const A = ch4GoalSave(P7, P8, rc);
    const e = P8.declineTournament(A, A.m);
    assert.equal(e.next, P8.FINAL); assert.deepEqual([A.m.raise.state, A.m.raise.ch], ['farm', P8.FINAL]);
    assert.equal(P8.nextChapterKey(A.m), P8.FINAL, '次に出発できるのは最終Chapterだけ（育成完了は選べない）');
    assert.equal(P8.canVisitTown(A), false, '最終Chapterが終わるまで育成中');
  }
  const T = ch4GoalSave(P7, P8, [true, true, true, true, false, false]);   // Chapter 4の大会でAを初優勝 → 最終Chapterへ
  P8.startTournament(T, T.m, 4, 11); let f; for (let i = 0; i < 7; i++) f = playLeague(P8, T, true);
  assert.equal(f.won, true); assert.equal(P8.endChapter(T, T.m).next, P8.FINAL, '大会の結果を反映したランクで判定');
});

test('S9-2：最終Chapter（マップ・名称・ボスは未確定）：マップ未登録なら出発できない。登録すればターン上限なし・ゴールで育成完了', () => {
  const { P7, P8 } = load(); const S = ch4GoalSave(P7, P8, [true, true, true, true, true, false]);
  P8.declineTournament(S, S.m);
  assert.deepEqual(P8.canDepart(S, S.m), { ok: false, reason: 'no_map', key: P8.FINAL }, '本番は最終Chapterのマップ未登録');
  P8.registerFinalBoard(line(40), { provisional: true, note: 'テスト用' });
  assert.equal(P8.depart(S, S.m).ok, true);
  assert.deepEqual([S.m.raise.state, S.m.raise.ch, S.m.raise.turnLimit], ['final', P8.FINAL, null]);
  assert.equal(P8.startTournament(S, S.m, 0).reason, 'no_tournament');
  for (let t = 0; t < 50 && !S.m.raise.goal; t++) { assert.equal(P8.roll(S, S.m, () => 0).ok, true, '20ターンを超えても進める（育成失敗なし）'); runTurn(P8, S); }
  assert.equal(S.m.raise.goal, true); assert.equal(S.m.raise.turnsUsed, 40, '出目1で40マス＝40ターン');
  const e = P8.endChapter(S, S.m);
  assert.equal(e.next, 'done'); assert.equal(S.m.raise.state, 'done'); assert.equal(S.m.raise.log.at(-1).ch, P8.FINAL);
  assert.equal(P8.canVisitTown(S), true, '育成完了後は街（牧場）へ');
  assert.equal(P8.canDepart(S, S.m).reason, 'finished'); assert.equal(P7.canStartTraining(S, S.m, 'po').reason, 'finished');
  assert.ok(S.m, '育成完了個体は牧場の個体として残る');
});

test('S9-3：画面：Chapter終了後、育成完了なら完了画面（牧場へ）、最終Chapterなら案内を出してChapter間ファームへ', () => {
  const l = fnLine('function p8AfterChapterEnd(');
  assert.match(l, /if\(r\.next=="done"\)return p8DoneScr\(\);/); assert.match(l, /r\.next==MMP8\.FINAL\?/);
  assert.match(fnLine('function p8DoneScr('), /farm\('','a'\)/);
  assert.match(fnLine('function p8ChLabel('), /MMP8\.FINAL\?"最終CHAPTER"/);
});

// ---------------------------------------------------------
// Step 10：旧仕様（寿命・暦・疲労・ストレス・旧腕試し大会）の無効化・非表示
// ---------------------------------------------------------
test('S10-1：adv()は暦・加齢を進めず、戦闘完了の印だけ／after()は寿命で個体を消さない', () => {
  const { P7, P8 } = load();
  const S = { y: 1000, mo: 12, wk: 4, m: { name: 'A', age: 29, span: 30, raise: { battle: { kind: 'practice', done: false } } } };
  const w = htmlEnv(['adv', 'after'], { S, MMP8: P8, hall: (x, t) => S.went = ['hall', t], lobby: () => { throw new Error('寿命で街へ戻してはいけない'); }, save() {}, sel: [] });
  w.adv(); w.adv();
  assert.deepEqual([S.y, S.mo, S.wk, S.m.age], [1000, 12, 4, 29], '暦・年齢は変わらない');
  assert.equal(S.m.raise.battle.done, true);
  S.m.age = 99; w.after('x');
  assert.ok(S.m, '寿命を超えても個体は消えない'); assert.deepEqual(S.went, ['hall', 'x']);
});

test('S10-2：fight()が内部で増やす疲労・ストレスは戦闘後に残さない（fight()本体は無変更）', () => {
  const { P7, P8 } = load();
  const S = boardSave(P7, P8, { nodes: { s: { type: 'start' }, b: { type: 'battle' }, g: { type: 'tournament' } }, conn: { s: ['b'], b: ['g'] }, start: 's', goal: 'g' });
  P8.roll(S, S.m, () => 0); P8.step(S, S.m); P8.resolveLanding(S, S.m);
  P8.beginBattle(S, S.m, { kind: 'practice', rank: 0 });
  S.m.st += 10; S.m.fa += 8; P8.markBattleDone(S);   // fight()の終了処理（負け）と同じ変化
  P8.finishBattle(S, S.m);
  assert.deepEqual([S.m.fa, S.m.st], [0, 0]);
});

test('S10-3：画面に寿命・暦・疲労・ストレスを出さない（街・牧場・ファーム・ステータス・セーブ一覧・コメント）', () => {
  const a = HTML.indexOf('async function fight('), b = HTML.indexOf('\n$("#snd").textContent', a);
  const srcs = {
    mcard: fnLine('const mcard='), stat: fnLine('const stat='), slab: fnLine('const slab='), bcomm: fnLine('function bcomm('),
    lobby: between('function lobby(msg,open){', '\nconst MKIMG='), farm: between('function farm(msg,tab){', '\nfunction dep('),
    dscr: between('function dscr(id,msg){', '\nfunction skd(k)'), hall: between('function _hall(tab,msg){', '\nfunction after('),
  };
  for (const [k, v] of Object.entries(srcs)) {
    assert.ok(v && v.length > 10, `${k} を取り出せる`);
    assert.doesNotMatch(v.replace(/\s\/\/ .*$/gm, ''), /寿命|疲労|ストレス|\$\{S\.y\}年|第\$\{S\.wk\}週/, `${k} に旧仕様の表示が無い`);
  }
  assert.ok(HTML.indexOf('寿命はリセット') < 0);
  assert.ok(a > 0 && b > a);
});

test('S10-4：旧「腕試し大会」へは到達できない（dscr("b")は直接呼んでもファームへ戻る）／VER更新', () => {
  assert.match(HTML, /function dscr\(id,msg\)\{if\(id=="b"\)return hall\("t"\);/);
  const boardAll = between('/* ===== Phase 8：育成ボード', '// ---- ファーム：育成ボードタブの中身').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(boardAll, /dscr\('b'\)|dscr\("b"\)|腕試し/);
  assert.match(HTML, /const VER="p8-raising";/);
});
