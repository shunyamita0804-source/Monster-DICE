// =========================================================
// Phase 10 テスト：正式モンスターデータ・素早さ・正式画像・市場UI
//  既存174件（統合10・act接続13・Phase6 18・Phase7 56・Phase8 50・Phase9 27）とは別ファイル。
// =========================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import * as FS from 'node:fs';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { determineFirstActor } from '../js/systems/battle/firstActor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const rd = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const HTML = rd('index.html');
const SRC = { p7: rd('js/phase7/progression.js'), lg: rd('js/phase8/league.js'), p8: rd('js/phase8/raising.js'), mo: rd('js/phase10/monsters.js') };
function load() { const w = {}; for (const k of ['p7', 'lg', 'p8', 'mo']) new Function('window', SRC[k])(w); return { P7: w.MMP7, P8: w.MMP8, M: w.MMP10M }; }
const FIGHT = (() => { const a = HTML.indexOf('async function fight('); return HTML.slice(a, HTML.indexOf('\n$("#snd").textContent', a)); })();

// ---------------------------------------------------------
// Step 1：正式モンスターマスター
// ---------------------------------------------------------
test('M1-1：正式4原種の名前・英字・種類・初期能力・素早さ（未確定の項目は null）', () => {
  const { M } = load();
  const row = (id) => { const s = M.byId(id); return [s.name, s.en, s.kind, M.STAT_KEYS.map((k) => s.base[k]), s.speed]; };
  assert.deepEqual(row(0), ['ソラモ', 'SORAMO', '獣種', [100, 100, 100, 100, 100, 100], 5]);
  assert.deepEqual(row(1), ['ガウル', 'GAURU', '鳥種', [80, 110, 110, 90, 90, 60], 7]);
  assert.deepEqual(row(2), ['ノビトン', 'NOBITON', '獣種', [120, 80, 80, 80, 50, 100], 2]);
  assert.deepEqual(row(3), ['ジオル', null, '岩石種', [90, 120, 40, 50, 30, 150], 1], 'ジオルの英字表記は未確定のため null');
  assert.equal(M.byId(3).personality, 'のんびり・おとなしい');
  assert.deepEqual(M.byId(1).formerNames, ['ハヤテ']);
  assert.equal(M.SPECIES.length, 4); assert.equal(M.STAT_MAX, 999);
  assert.ok(Object.isFrozen(M.SPECIES) && Object.isFrozen(M.byId(1).base), '正式データは書き換えられない');
});

test('M1-2：素早さは1〜10の整数で、数値が大きいほど速い（Phase 6の先攻判定と同じ向き）', () => {
  const { M } = load();
  assert.deepEqual([M.SPEED_MIN, M.SPEED_MAX], [1, 10]);
  for (const s of M.SPECIES) assert.ok(M.isValidSpeed(s.speed), s.name);
  assert.equal(M.isValidSpeed(0), false); assert.equal(M.isValidSpeed(11), false); assert.equal(M.isValidSpeed(5.5), false);
  let fast = 0; const r = (() => { let i = 0; return () => (i++ % 100) / 100; })();
  for (let i = 0; i < 1000; i++) if (determineFirstActor(M.speedOf(1), M.speedOf(3), r) === 'A') fast++;
  assert.equal(fast, 880, 'ガウル（7）とジオル（1）＝差6：速い側（数値が大きい側）が88%で先攻（Phase 6の表）');
  let rev = 0; for (let i = 0; i < 1000; i++) if (determineFirstActor(M.speedOf(3), M.speedOf(1), r) === 'B') rev++;
  assert.equal(rev, 880, '左右を入れ替えても、数値が大きい側が先攻しやすい');
});

test('M1-3：固有スキルは4体すべてにデータだけ登録（未実装フラグ・ジオルの確率は内部データで説明文に出さない）', () => {
  const { M } = load();
  const exp = [['unique_solamo', '逆境のひと踏ん張り'], ['unique_gauru', '紅翼の猛攻'], ['unique_nobiton', 'ふしぎな嗅覚'], ['unique_jiol', '大地の守り']];   // Phase 10 Step 3：種族の文字IDに基づくIDへ（未保存・未使用の段階で変更）
  M.SPECIES.forEach((s, i) => { const k = M.skillOf(s.id); assert.deepEqual([k.id, k.name, k.species, k.implemented], [...exp[i], s.id, false]); assert.ok(k.desc.length > 10); });
  assert.equal(M.skillOf(3).params.chance, 0.1); assert.deepEqual(M.skillOf(3).hiddenParams, ['chance']);
  assert.doesNotMatch(M.skillText(3).desc, /10|％|%/, 'プレイヤー向け説明に具体的な確率を出さない');
  assert.match(M.skillOf(0).desc, /20％.*1\.25倍/); assert.match(M.skillOf(1).desc, /3ターン.*5％/); assert.match(M.skillOf(2).desc, /状態異常/);
});

test('M1-4：固有スキルはまだバトルへ接続されていない（fight()・Battle Engine・adapter から参照しない）', () => {
  assert.doesNotMatch(FIGHT, /MMP10M|unique_|uniqueSkill/);
  for (const f of ['js/battle-bridge.js', 'js/integration/adapter.js', 'js/systems/battle/engine.js', 'js/systems/battle/session.js', 'js/systems/battle/combatMath.js', 'js/systems/battle/effects.js']) {
    assert.doesNotMatch(rd(f), /MMP10M|unique_(solamo|gauru|nobiton|jiol)|uniqueSkill|逆境|紅翼|嗅覚|大地の守り/, f);
  }
  assert.doesNotMatch(SRC.mo, /状態異常(システム)?\s*=|STATUS_AILMENTS|ailments\s*:/, '仮の状態異常システムを作らない');
});

test('M1-5：旧データ（SP）のソラモ・ガウル初期能力は正式マスターと一致／旧名ハヤテ→ガウルの移行は維持', () => {
  const { M } = load();
  const sp = new Function(`${HTML.match(/const SP=\[.*?\];\n/s)[0]}return SP;`)();
  assert.equal(sp.length, 2, '購入・生成に使う旧表は2種のまま（ノビトン・ジオルを勝手に追加しない）');
  sp.forEach((row, i) => { assert.equal(row[0], M.byId(i).name); assert.deepEqual(row[2], M.STAT_KEYS.map((k) => M.byId(i).base[k])); });
  assert.match(HTML, /if\(x\.name=="ハヤテ"\)x\.name="ガウル"/);
  assert.ok(HTML.indexOf('js/phase10/monsters.js') > HTML.indexOf('js/phase8/raising.js'));
});

// ---------------------------------------------------------
// Step 2：素早さを正式な個体データとして保存（現在のバトルには反映しない）
// ---------------------------------------------------------
const j = (o) => JSON.parse(JSON.stringify(o));
function mon(P7, over = {}) {
  const m = { sp: 0, name: 'テスト', age: 0, span: 30, h: 0, rk: 0, fa: 0, st: 0, last: null, li: 100, po: 100, in: 100, hi: 100, ev: 100, de: 100, sk: [0, 1, 2, 3], eq: [0, 1, 2, 3, -1, -1], ...over };
  P7.ensureProg(m); return m;
}
function store(init = {}) { const s = { ...init }; return { s, getItem: (k) => (k in s ? s[k] : null), setItem: (k, v) => { s[k] = String(v); } }; }
const noSpeed = (S) => { const T = j(S); for (const x of [T.m, ...(T.box || [])].filter(Boolean)) delete x.speed; return T; };

test('M2-1：新しい個体は生成時に正式マスターから素早さを受け取る（ソラモ5・ガウル7・ノビトン2・ジオル1、1〜10）', () => {
  const { P7, P8, M } = load(); const S = P8.newSave();
  const got = [0, 1, 2, 3].map((sp) => P8.initIndividual(S, mon(P7, { sp })).speed);
  assert.deepEqual(got, [5, 7, 2, 1]);
  for (const v of got) assert.ok(M.isValidSpeed(v));
  assert.match(HTML.match(/function mk\(sp\)\{[^\n]*/)[0], /MMP8\.initIndividual\(S,m\);return m\}/, '市場・合体の個体生成は initIndividual を通る');
});

test('M2-2：v6セーブ（素早さなし）を読み込むと種族の正式値で補完し、それ以外は何も変えない（セーブはv6のまま）', () => {
  const { P7, P8 } = load(); const S = P8.newSave();
  S.g = 4321; S.trainTix = 3; S.wins = 2; S.br = 1; S.inv.bag.push({ id: 'x' });
  S.m = P8.initIndividual(S, mon(P7, { sp: 1, name: 'ガウル', li: 222, po: 333, sk: [10, 11, 12, 13, 14], eq: [10, 11, 12, 13, 14, -1] }));
  S.m.prog.rankClr = [true, true, false, false, false, false]; S.m.prog.train.po = 1;
  Object.assign(S.m.raise, { state: 'board', ch: 2, node: 'a3', turnsUsed: 7, turnLimit: 20, log: [{ ch: 1, reachedGoal: true, turnsUsed: 14 }],
    tour: null, pend: { roll: 2, left: 1, stage: 'move' } });
  S.box = [P8.initIndividual(S, mon(P7, { sp: 0, name: 'ソラモ' }))];
  const old = noSpeed(S);                         // 旧版のv6セーブ（speed欄が無い）
  const st = store({ mr4v6: JSON.stringify(old) });
  const r = P8.loadFromStorage(st);
  assert.equal(r.status, 'ok'); assert.equal(r.S.v, 6, 'v7へは上げない');
  assert.equal(r.S.m.speed, 7, 'ガウル→7（旧既定値5のまま残らない）'); assert.equal(r.S.box[0].speed, 5, 'ソラモ→5');
  assert.deepEqual(noSpeed(r.S), old, '通常6能力・Chapter進行・大会実績・修行・技・セット技・育成状態・所持金などは不変');
});

test('M2-3：v5・v4からの移行でも素早さが入る／既に正しい値を持つ個体は変えない／不正な値だけ直す', () => {
  const { P7, P8 } = load();
  const v5 = P7.newSave(); v5.m = mon(P7, { sp: 1 }); v5.box = [mon(P7, { sp: 0 })];
  const S = P8.migrateSave(j(v5));
  assert.deepEqual([S.m.speed, S.box[0].speed], [7, 5]);
  const T = P8.normalizeV6(j({ ...S, m: { ...S.m, speed: 9 }, box: [{ ...S.box[0], speed: 0 }] }));
  assert.equal(T.m.speed, 9, '1〜10の正しい値は保持（将来の成長などに備える）');
  assert.equal(T.box[0].speed, 5, '範囲外は種族の正式値へ');
});

test('M2-4：素早さを保存しても、現在のPhase 6バトル（fight()→adapter.js→先攻判定）には渡らない', () => {
  const { P7, P8 } = load();
  const src = HTML.slice(HTML.indexOf('const P8_FIGHT=fight;'), HTML.indexOf('\nconst P8_AFTER=after;'));
  const S = P8.newSave(); S.m = P8.initIndividual(S, mon(P7, { sp: 1 })); S.m.raise.battle = { kind: 'practice', done: false };
  let copied = null;
  const origFight = () => { copied = { ...S.m }; return Promise.resolve('ok'); };   // fight() と同じく開始直後に同期的に写し取る
  const wrap = new Function('S', 'fight', `${src}\nreturn fight;`)(S, origFight);
  const ret = wrap(0);
  assert.ok(copied && !('speed' in copied), 'バトルへ渡る写しには speed が無い（先攻判定は従来どおり既定値）');
  assert.equal(S.m.speed, 7, '呼び出し直後に個体の speed は元どおり');
  assert.match(JSON.stringify(S), /"speed":7/, '保存データには常に speed がある');
  assert.ok(ret instanceof Promise);
  const S2 = P8.newSave(); S2.m = P8.initIndividual(S2, mon(P7, { sp: 1 })); S2.m.raise.battle = { kind: 'practice', done: false };
  const w2 = new Function('S', 'fight', `${src}\nreturn fight;`)(S2, () => { throw new Error('戦闘エラー'); });
  assert.throws(() => w2(0)); assert.equal(S2.m.speed, 7, '途中で例外が出ても speed は戻る');
  assert.equal((HTML.match(/delete m\.speed/g) || []).length, 1, 'バトル用に speed を外すのはこの1か所だけ');
  assert.match(rd('js/integration/adapter.js'), /if \(typeof u\.speed === 'number'\) out\.speed = u\.speed;/, 'adapter.js は無変更（speed があれば渡す作りのまま）');
  const a = HTML.indexOf('async function fight('), F = HTML.slice(a, HTML.indexOf('\n$("#snd").textContent', a));
  assert.ok(F.indexOf('const p={...m0') < F.indexOf('await '), 'fight() は最初の await より前に個体を写し取る（この前提で分離できる）');
  assert.doesNotMatch(F, /speed/, 'fight() 自身は speed を読まない');
});

// ---------------------------------------------------------
// Step 3：種族の文字ID・正式画像アセット・市場データ（正式値）
// ---------------------------------------------------------
const pngInfo = (p) => { const b = readFileSync(path.join(ROOT, p)); return { sig: b.slice(1, 4).toString(), w: b.readUInt32BE(16), h: b.readUInt32BE(20), colorType: b[25] }; };
const OLD_IMG_FINGERPRINTS = ["MQKBJI5jioUSnoN57IEf6rnpk3pmclybRtVsWr+aWq2Okk47e9kSUaRloVXo", "tfjcIghOwAFeBCuCR5EDHfHk6sAYzkv4cArUAmdSEBFRiDLaSOZ8NtppPjCT", "UgiEQYhTZ+dx5KzFXe/8GYRRA5968POYP3cO27bP4p53vAuzs7uwNPcizj37"];   // 旧 IMG（旧ソラモ・旧ガウル・前肢が余分な旧ノビトン）の base64 の一部

test('M3-1：種族の文字ID（solamo・gauru・nobiton・jiol）と既存の番号ID（0〜3）の対応。セーブには番号だけを保存する', () => {
  const { P7, P8, M } = load();
  assert.deepEqual(M.SPECIES.map((s) => [s.id, s.key]), [[0, 'solamo'], [1, 'gauru'], [2, 'nobiton'], [3, 'jiol']]);
  for (const s of M.SPECIES) { assert.equal(M.idOf(s.key), s.id); assert.equal(M.keyOf(s.id), s.key); assert.equal(M.byKey(s.key), M.byId(s.id)); assert.equal(M.imageOf(s.key), M.imageOf(s.id)); }
  assert.equal(M.idOf('hayate'), null); assert.equal(M.keyOf(9), null);
  const S = P8.newSave(); S.m = P8.initIndividual(S, mon(P7, { sp: 1 }));
  assert.equal(S.m.sp, 1); assert.ok(!('key' in S.m) && !('speciesKey' in S.m), '個体データに文字IDは保存しない（番号が既存互換の保存形式）');
  const T = P8.migrateSave(j(S)); assert.equal(M.keyOf(T.m.sp), 'gauru', '既存セーブの番号から文字IDを引ける');
  assert.deepEqual(Object.keys(M.UNIQUE_SKILLS), ['unique_solamo', 'unique_gauru', 'unique_nobiton', 'unique_jiol']);
});

test('M3-2：4原種の正式画像は assets/monsters/<文字ID>.png（透過PNG）で、画面は正式マスターから画像を取る', () => {
  const { M } = load();
  for (const s of M.SPECIES) {
    assert.equal(s.image.src, `./assets/monsters/${s.key}.png`);
    assert.ok(existsSync(path.join(ROOT, s.image.src)), s.key);
    const i = pngInfo(s.image.src); assert.equal(i.sig, 'PNG'); assert.equal(i.colorType, 6, `${s.key}：透過（RGBA）`); assert.deepEqual([i.w, i.h], [s.image.w, s.image.h]);
  }
  const sil = M.silhouetteOf('nobiton'); assert.deepEqual([sil.src, pngInfo(sil.src).colorType], ['./assets/monsters/nobiton_silhouette.png', 6]);
  for (const k of ['solamo', 'gauru', 'jiol']) assert.equal(M.silhouetteOf(k), null);
  assert.match(HTML, /const IMG=MMP10M\.SPECIES\.map\(s=>s\.image\.src\);/, '画像の対応表は正式マスターから作る');
  const readme = rd('assets/monsters/README.md');
  for (const f of ['04AF002A', 'B5CDD0D8', 'BD621188', '983DE6AE']) assert.ok(readme.includes(f), `出どころの記録：${f}`);
});

test('M3-3：旧画像（前肢が余分な旧ノビトンなど）はどこからも参照しない', () => {
  const imgDef = HTML.match(/const IMG=[^\n]*/)[0];
  assert.doesNotMatch(imgDef, /data:image/, '画像の埋め込みデータを使わない');
  for (const fp of OLD_IMG_FINGERPRINTS) assert.ok(!HTML.includes(fp), '旧画像のデータが残っていない');
  assert.deepEqual(FS.readdirSync(path.join(ROOT, 'assets/monsters')).sort(), ['README.md', 'gauru.png', 'jiol.png', 'nobiton.png', 'nobiton_silhouette.png', 'solamo.png']);
});

test('M3-4：市場データ（正式値）：ソラモ・ガウルは500Gで販売、ノビトンは入荷待ち（ロックではない）、ジオルは市場に存在しない／初期所持金300G', () => {
  const { M } = load();
  assert.deepEqual(M.MARKET_CATALOG.map((c) => [c.key, c.status, c.price ?? null]), [['solamo', 'sale', 500], ['gauru', 'sale', 500], ['nobiton', 'waiting', null]]);
  assert.ok(!M.MARKET_CATALOG.some((c) => c.key === 'jiol'), 'ジオルはカルーセル・シルエット・入荷待ちのどれにも出さない');
  for (const c of M.MARKET_CATALOG) assert.ok(!('lock' in c) && !('locked' in c) && !/lock/.test(c.status), 'ロック扱いの項目を持たない');
  assert.deepEqual(M.ECONOMY, { initialGold: 300, marketPrice: 500 });
  assert.ok(M.byKey('jiol'), 'ジオルは正式マスターには登録済み');
});

test('M3-5：正式画像は色相変更・フィルターなしで表示（通常個体・大会参加者）。fight() 内の既存処理は無変更', () => {
  const p10 = HTML.match(/function p10Img\(ref\)\{[^\n]*/)[0];
  assert.doesNotMatch(p10, /filter|hue-rotate/);
  assert.match(HTML, /const msv=m=>\(m&&m\.s2==null&&!m\.h&&MMP10M\.byId\(m\.sp\)\)\?p10Img\(m\.sp\):svg\(m\.sp,m\.h,m\.s2\);/);
  assert.match(HTML, /\.p10im\{[^}]*object-fit:contain/); assert.doesNotMatch(HTML.match(/\.p10im\{[^}]*\}/)[0], /filter/);
  const npc = HTML.match(/function p9Npc\(lg,id\)\{[^\n]*/)[0];
  assert.doesNotMatch(npc, /rank\*60|lg\.rank\s*\*/, 'ランクごとにソラモなどの色を変えない'); assert.match(npc, /h:0/);
  assert.match(FIGHT, /svg\(pl\[s\]\.sp,pl\[s\]\.h,pl\[s\]\.s2/, 'fight() は従来の描画経路のまま（色相変更はバトルPhaseの既知差分）');
});

// ---------------------------------------------------------
// Step 4：市場（カルーセル）・初回購入救済・初期所持金・ファームの正式静止画
// ---------------------------------------------------------
const line = (prefix) => HTML.split('\n').find((l) => l.startsWith(prefix));
const between = (a, b) => { const i = HTML.indexOf(a), k = HTML.indexOf(b, i + a.length); if (i < 0 || k < 0) throw new Error('抽出失敗: ' + a); return HTML.slice(i, k); };

test('M4-1：新規ゲームの初期所持金は300G（既存セーブの所持金は変えない）', () => {
  const { P8, M } = load();
  const p10NewSave = new Function('MMP8', 'MMP10M', `${line('function p10NewSave(')}\nreturn p10NewSave;`)(P8, M);
  assert.equal(p10NewSave().g, 300); assert.equal(p10NewSave().v, 6);
  assert.match(HTML, /let S=P8_LOAD\.S\|\|p10NewSave\(\),sel=\[\],ht="t";/); assert.match(HTML, /S=p10NewSave\(\);save\(\);render\(\)/, 'はじめから（リセット）も300G');
  const st = store({ mr4v6: JSON.stringify({ ...P8.newSave(), g: 4321 }) });
  assert.equal(P8.loadFromStorage(st).S.g, 4321, '既存セーブの所持金はそのまま');
});

test('M4-2：価格500G・初回購入救済（手持ち0・牧場0・500G未満・市場での購入時だけ所持金を500Gへ）', () => {
  const { M } = load();
  let S = { g: 300 }; assert.deepEqual(M.purchase(S, 'solamo', 0), { ok: true, key: 'solamo', price: 500, rescued: true, before: 300, after: 0 }); assert.equal(S.g, 0);
  S = { g: 0 }; assert.deepEqual([M.purchase(S, 'gauru', 0).rescued, S.g], [true, 0]);
  S = { g: 300 }; assert.deepEqual(M.purchase(S, 'gauru', 1), { ok: false, reason: 'no_money' }); assert.equal(S.g, 300, '1体でも所有していれば補填しない');
  S = { g: 800 }; assert.deepEqual([M.purchase(S, 'solamo', 0).rescued, S.g], [false, 300], '500G以上なら補填しない');
  S = { g: 499 }; assert.deepEqual(M.purchase(S, 'solamo', 2), { ok: false, reason: 'no_money' });
  assert.deepEqual(M.purchase({ g: 9999 }, 'nobiton', 0), { ok: false, reason: 'waiting' }, 'ノビトンは入荷待ちで買えない（救済も起きない）');
  S = { g: 100 }; M.purchase(S, 'nobiton', 0); assert.equal(S.g, 100);
  assert.deepEqual(M.purchase({ g: 9999 }, 'jiol', 0), { ok: false, reason: 'not_in_market' }, 'ジオルは市場に存在しない');
  assert.deepEqual(M.purchase({ g: 9999 }, 'solamo', 8), { ok: false, reason: 'full' });
  assert.doesNotMatch(HTML, /S\.g\s*=\s*(500\b|MMP10M\.ECONOMY)|S\.g\+=500\b/, 'ゲーム側で勝手に500Gを補填する処理はない（救済は MMP10M.purchase の中だけ）');
});

test('M4-3：購入は既存の個体生成処理で行い、種族・正式初期能力・素早さ・所持金が正しく入る（救済時も同じ処理）', () => {
  const { P7, P8, M } = load(); const S = P8.newSave(); S.g = 300;
  const log = []; const mkReal = (i) => { const b = M.baseOf(i); return P8.initIndividual(S, mon(P7, { sp: i, name: M.byId(i).name, ...b })); };
  const adopt = new Function('S', 'MMP10M', 'P10_WHY', 'mk', 'save', 'lobby', 'market', 'p8Blocked', 'sel', `${line('function p11Esc(t){')}\n${line('function adopt(i,nm){')}\nreturn adopt;`)(
    S, M, { no_money: 'お金が足りません。' }, mkReal, () => log.push('save'), (m) => log.push(['lobby', m]), (m, k) => log.push(['market', m, k]), () => false, []);
  adopt(1, 'ガウル');
  assert.deepEqual([S.g, S.m.sp, S.m.speed, S.m.li, S.m.de, S.cnt], [0, 1, 7, 80, 60, 1]);
  assert.match(log.find((x) => x[0] === 'lobby')[1], /500Gまで補填/);
  adopt(0, 'ソラモ');
  assert.deepEqual([S.g, S.box.length], [0, 0], '2体目（0G・1体所有）は救済されず買えない');
  assert.deepEqual(log.at(-1), ['market', 'お金が足りません。', 'solamo']);
  assert.ok(log.includes('save'));
});

test('M4-4：市場画面は正式データから作るカルーセル（左右の矢印・横スワイプ・端から端へ循環／中央100%・左右約70%・ドット連動・ジオルなし・鍵なし）', () => {
  const mk = between('function market(msg,focus){', '\nfunction mkd(');
  assert.match(mk, /const cat=MMP10M\.MARKET_CATALOG/); assert.match(mk, /cat\.map\(\(c,i\)=>p10Slide\(c,i\)\)/);
  assert.doesNotMatch(mk, /jiol|ジオル|🔒|ロック|未解放|近日|MKH|AS\.mkt|sprH/, 'ジオル・鍵・旧ホットスポット・旧アニメを使わない');
  assert.match(mk, /MMP10M\.silhouetteOf\(c\.key\)\.src/); assert.match(mk, /p10Img\(c\.key\)/); assert.match(mk, /入荷待ち/);
  assert.match(mk, /1-\.3\*k/, '左右は約70%'); assert.match(mk, /p10dot/); assert.match(mk, /\$\{p10Who\(\)\}/);
  // Phase 11で改訂：「ブリーダー」の仮表示 → 実際のプレイヤー名（HTMLとして安全に表示）＋ブリーダーランク
  assert.match(line('function p10Who(){'), /<b>\$\{p11Esc\(S\.playerName\|\|MMP11P\.DEFAULT_NAME\)\}<\/b><small>ランク \$\{br\}<\/small>/); assert.match(line('function p10Who(){'), /RN\[S\.br\]/);
  assert.match(mk, /<button class="p10buy" disabled>入荷待ち<\/button>/, '入荷待ちは購入ボタンが使えない');
  const css = between('/* ===== Phase 10：市場', '</style></head>');
  // 市場カルーセル改修：横スクロール（scroll-snap）から、左右の矢印・スワイプで切り替えるループ型へ（詳細は market-carousel.test.mjs）
  assert.match(css, /\.p10car\{[^}]*touch-action:pan-y/, '横方向の操作はカルーセルが受け取り、縦のスクロールはページのまま');
  assert.match(css, /\.p10sl\{position:absolute;left:50%;top:0;width:var\(--sw\);margin-left:calc\(var\(--sw\) \/ -2\)/, '候補は中央に重ねて置き、位置は計算で決める');
  assert.match(mk, /<button class="p10arw prev" aria-label="前のモンスター" onclick="p10Step\(-1\)">/); assert.match(mk, /<button class="p10arw next" aria-label="次のモンスター" onclick="p10Step\(1\)">/);
  assert.match(css, /\.p10mk\{[^}]*overflow:hidden/, 'ページ全体を横にはみ出させない');
  assert.doesNotMatch(css, /hue-rotate|saturate|grayscale|sepia/, '正式画像の色を変えない');
});

test('M4-5：旧・詳細画面は新しい市場へ統合／名前入力は確定前に読む／ファームは正式静止画（バトル側の旧アニメは無変更）', () => {
  assert.match(line('function mkd(i,step){'), /^function mkd\(i,step\)\{if\(p8Blocked\(\)\)return;market\(null,MMP10M\.keyOf\(i\)\|\|0\)\}/);
  assert.match(HTML, /onclick="mkgo\(\$\{s\.id\}\);p10Close\(\)"/, '名前を読んでから閉じる');
  const hall = between('function _hall(tab,msg){', '\nfunction after(');
  assert.doesNotMatch(hall, /SPX\[m\.sp\]\?/, 'ファームで旧アニメーション素材を使わない');
  assert.match(FIGHT, /SPX\[sp\]&&poseSeq/, 'fight() 内の勝敗ポーズは変更していない');
  assert.match(HTML, /async function stageIntro\(pl\)\{[^\n]*SPX\[sp\]/, 'バトル開始演出も変更していない');
});
