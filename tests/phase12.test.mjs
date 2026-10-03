// =========================================================
// Phase 12 テスト：正式背景（Chapter間ファーム・修行場5種）
// =========================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const rd = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const HTML = rd('index.html');
const line = (prefix) => HTML.split('\n').find((l) => l.startsWith(prefix));
function load() { const w = {}; for (const f of ['js/phase7/progression.js', 'js/phase12/scenes.js']) new Function('window', rd(f))(w); return { P7: w.MMP7, SC: w.MMP12S }; }
const jpg = (p) => { const b = readFileSync(path.join(ROOT, p)); let i = 2; while (i < b.length) { if (b[i] !== 0xff) return null; const m = b[i + 1], len = b.readUInt16BE(i + 2); if (m >= 0xc0 && m <= 0xc2) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) }; i += 2 + len; } return null; };

test('G1-1：正式背景6点を assets/scenes/ に登録（Chapter間ファーム・修行場5種）。画像の大きさは元素材と同じ', () => {
  const { P7, SC } = load();
  const all = [['farm_interval', SC.FARM_INTERVAL], ...P7.TRAIN_KINDS.map((k) => [`train_${k}`, SC.training(k).image])];
  for (const [key, im] of all) {
    assert.equal(im.src, `./assets/scenes/${key}.jpg`); assert.ok(existsSync(path.join(ROOT, im.src)), key);
    assert.deepEqual(jpg(im.src), { w: im.w, h: im.h }, `${key}：登録の大きさと実ファイルが一致`); assert.ok(im.w >= 1815 && im.h === 866, '縮小していない');
  }
  assert.deepEqual(readdirSync(path.join(ROOT, 'assets/scenes')).sort(), ['README.md', 'farm_interval.jpg', 'market.jpg', 'train_de.jpg', 'train_ev.jpg', 'train_hi.jpg', 'train_in.jpg', 'train_po.jpg'], '市場の背景候補（market.jpg）を追加');
  const readme = rd('assets/scenes/README.md');
  for (const f of ['4211BD62', '157603E3', '01777B8B', '302655B8', 'F3539954', '88015E69']) assert.ok(readme.includes(f), f);
});

test('G1-2：修行場5種は修行の種類（po/in/hi/ev/de）と1対1・正式名と正式カラー。市場は今回提供された背景候補を登録（最終採用は未確定）', () => {
  const { P7, SC } = load();
  assert.deepEqual(Object.keys(SC.TRAINING), [...P7.TRAIN_KINDS]);
  assert.deepEqual(P7.TRAIN_KINDS.map((k) => SC.training(k).name), ['ちから特訓場', 'かしこさ特訓場', '命中特訓場', '回避特訓場', '丈夫さ特訓場']);
  for (const k of P7.TRAIN_KINDS) assert.match(SC.training(k).accent, /^#[0-9a-f]{6}$/);
  assert.equal(SC.MARKET_BG.src, './assets/scenes/market.jpg'); assert.equal(SC.MARKET_BG.candidate, true, '候補（最終採用は未確定）');
  assert.deepEqual(jpg(SC.MARKET_BG.src), { w: SC.MARKET_BG.w, h: SC.MARKET_BG.h }); assert.equal(SC.training('xx'), null);
  assert.ok(Object.isFrozen(SC.TRAINING) && Object.isFrozen(SC.TRAINING.po.image));
  assert.ok(HTML.indexOf('js/phase12/scenes.js') > HTML.indexOf('js/phase11/player.js'));
});

test('G2-1：ファームの背景は正式背景 FARM_BG（assets/farm/farm_main.jpg。ファーム画面・ファームの各画面のぼかし背景とも。旧ロゴ入りの TRIMG2 は表示に使わない）。旧ファーム画像（FARMIMG）は互換のため残し、街の「ぽかぽか牧場」は正式背景 RANCH_BG', () => {
  const f = HTML.slice(HTML.indexOf('function p9FarmScr('), HTML.indexOf('\n// ---- Phase 8：育成中の画面遷移'));
  assert.match(f, /<div class="fm fm2 fm-\$\{st\}\$\{st=="farm"\?" p9farm p15f":""\}" style="--fm-bg:url\(\$\{FARM_BG\}\)">/);
  assert.match(HTML, /const FARM_BG="assets\/farm\/farm_prep_main\.jpg";/); assert.ok(existsSync(path.join(ROOT, 'assets/farm/farm_prep_main.jpg')));   // 2026-10-03：冒険準備の拠点（正式参照画像）。旧背景 farm_main.jpg はファイルだけ残す assert.ok(existsSync(path.join(ROOT, 'assets/farm/README.md')));
  assert.equal((HTML.match(/<div class="dbg" style="background-image:url\(\$\{FARM_BG\}\)"><\/div>/g) || []).length, 2, 'ステータス・技管理・特訓メニュー（dscr）と出発準備・アイテム屋（p7Shell）のぼかし背景も正式背景');
  assert.doesNotMatch(HTML, /class="dbg" style="background-image:url\(\$\{TRIMG2\}\)"/, '旧ロゴ入りの旧背景をぼかし背景に使わない');
  assert.doesNotMatch(f, /FARMIMG/, 'Chapter間ファームでは旧画像を使わない');
  assert.match(HTML, /const FARMIMG="assets\/embedded\/farmimg_ranch\.jpg";/, '旧ファーム画像のデータは残す（外部化：assets/embedded/）'); assert.ok(existsSync(path.join(ROOT, 'assets/embedded/farmimg_ranch.jpg'))); assert.match(line('function farm(msg,tab){') + HTML.slice(HTML.indexOf('function farm(msg,tab){'), HTML.indexOf('function farm(msg,tab){') + 4000), /RANCH_BG/, '街の牧場は正式背景（assets/ranch/ranch_main.jpg）'); assert.match(HTML, /const RANCH_BG="assets\/ranch\/ranch_main\.jpg";/); assert.ok(existsSync(path.join(ROOT, 'assets/ranch/ranch_main.jpg')));
  for (const t of ['prepScr()', "hall('s')", "hall('st')", "hall('w')", 'shopScr()', 'p8Suspend()', 'p8AbandonAsk()']) assert.ok(f.includes(t), `コマンド（${t}）は変えない`);
  assert.doesNotMatch(f, /次のChapterへ<\/text>|アイテム屋<\/text>/, '背景に文字を焼き込まない（文字はUIとして表示）');
});

test('G3-1：修行メニューのカードは5種とも正式背景（旧道場画像BTB・BTDはfight()用にそのまま残す）', () => {
  const menu = HTML.slice(HTML.indexOf('function p7TrainMenu('), HTML.indexOf('\nfunction trStart('));
  assert.match(menu, /const T=MMP12S\.training\(k\);return `<button class="dcardb djc p12tc" style="--ac:\$\{T\.accent\}"/);
  assert.match(menu, /<img src="\$\{T\.image\.src\}" alt="\$\{T\.name\}" style="object-position:\$\{T\.image\.focus\}">/);
  assert.doesNotMatch(menu, /BTB|BTD/, 'メニューでは旧道場画像を使わない');
  assert.match(HTML, /const BTD=\{po:6,in:7,hi:8,ev:9,de:10\};/, '旧データは残す');
  assert.match(HTML, /\.dcardb\.p12tc img\{filter:none\}/, '正式背景を暗くするフィルターをかけない（文字側だけ影を重ねる）');
});

test('G3-2：修行ボードは修行の種類ごとの正式背景をはっきり表示（ぼかさない）。マス・メッセージ・サイコロの構造とIDは同じ', () => {
  const tr = HTML.slice(HTML.indexOf('function trScr(msg,done){'), HTML.indexOf('\nlet p7Busy=false;'));
  assert.match(tr, /const T=MMP12S\.training\(K\);/); assert.match(tr, /bgm\("train"\);p9Immersive\(true\);/, '上部の見出しを隠す（ほかのゲーム画面と同じ）');
  assert.match(line('function _hall(tab,msg){'), /^function _hall\(tab,msg\)\{p9Immersive\(false\);/, 'ファーム側へ戻れば見出しは元に戻る');
  assert.match(tr, /<div class="p12stage" role="img" aria-label="\$\{T\.name\}" style="background-image:url\(\$\{T\.image\.src\}\);background-position:\$\{T\.image\.focus\}">/);
  assert.doesNotMatch(tr, /TRIMG2|class="dbg"/, '修行ボードでは旧背景・ぼかし背景を使わない');
  for (const id of ['id="p7msg"', 'id="p7dice"', 'id="p7roll"', 'onclick="trRoll()"', 'class="p7tr"']) assert.ok(tr.includes(id), id);
  assert.match(tr, /\$\{LAB\[K\]\}特訓/); assert.match(tr, /15マス・ゴールで技を覚える/); assert.match(tr, /\$\{P7_SQ_ICON\[K\]\}=\$\{LAB\[K\]\}＋ライフ　・=何も起きない/); assert.doesNotMatch(tr, /💖=ライフ/, '独立したライフマスは無い');
  const css = HTML.match(/\n\.p12stage\{[^}]*\}/)[0]; assert.doesNotMatch(css, /filter|blur|brightness/);
  assert.match(HTML, /const TRIMG2="assets\/embedded\/trimg2_farm_bg\.jpg";/, '旧背景のデータは他の画面で使うため残す（外部化：assets/embedded/）'); assert.ok(existsSync(path.join(ROOT, 'assets/embedded/trimg2_farm_bg.jpg')));
});

// ---------------------------------------------------------
// 正式サイコロ（通常用1〜3・分岐ルート用1〜6）
// ---------------------------------------------------------
function loadDice() { const w = {}; for (const f of ['js/phase7/progression.js', 'js/phase8/league.js', 'js/phase8/raising.js', 'js/phase10/monsters.js', 'js/phase12/dice.js']) new Function('window', rd(f))(w); return { P7: w.MMP7, P8: w.MMP8, D: w.MMP12D }; }
const webp = (p) => { const b = readFileSync(path.join(ROOT, p)); return b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP'; };

test('D1-1：正式サイコロ20コマを登録（通常用1〜3と分岐ルート用1〜6を区別・各10コマ・対応表は1か所）', () => {
  const { D } = loadDice();
  assert.deepEqual(Object.keys(D.SETS), ['std', 'branch']);
  assert.deepEqual([D.set('std').min, D.set('std').max, D.set('branch').min, D.set('branch').max], [1, 3, 1, 6]);
  for (const k of ['std', 'branch']) {
    const s = D.set(k); assert.equal(s.frames.length, 10);
    s.frames.forEach((f, i) => { assert.equal(f, `./assets/dice/${k}/${String(i + 1).padStart(2, '0')}.webp`); assert.ok(existsSync(path.join(ROOT, f)) && webp(f), f); });
    assert.equal(D.icon(k), s.frames[9]);
  }
  assert.equal(D.set('x'), null); assert.ok(Object.isFrozen(D.SETS.std.frames));
  const readme = rd('assets/dice/README.md');
  for (const id of ['97EDB209', '6C2239C4', 'DAC4AA24', '5B2D16B9']) assert.ok(readme.includes(id), id);
  assert.ok(HTML.indexOf('js/phase12/dice.js') > HTML.indexOf('js/phase12/scenes.js'));
});

test('D1-2：通常用サイコロの出目範囲はゲームの進行ロジック（1〜3）と一致。サイコロのロジックは変えていない', () => {
  const { P7, P8, D } = loadDice();
  const src = rd('js/phase7/progression.js');
  assert.match(src, /DICE_MIN = 1/); assert.match(src, /DICE_MAX = 3/);
  const seen = new Set(); for (let i = 0; i < 200; i++) seen.add(P7.rollDice(() => (i % 100) / 100));
  assert.deepEqual([...seen].sort(), [D.set('std').min, 2, D.set('std').max]);
  assert.equal(typeof P8.roll, 'function');
});

test('D2-1：Chapter通常進行と修行ボードは正式1〜3サイコロで演出。順番は「出目決定→演出→移動」のまま（ロジックは無変更）', () => {
  const b = HTML.slice(HTML.indexOf('async function bRoll(){'), HTML.indexOf('\nasync function p8Continue('));
  const i1 = b.indexOf('const r=MMP8.roll(S,m);save();'), i2 = b.indexOf('await p12Dice.play("std",r.value)'), i3 = b.indexOf('p8Continue()');
  assert.ok(i1 > 0 && i1 < i2 && i2 < i3, '出目の決定・保存 → 演出 → 移動');
  const t = HTML.slice(HTML.indexOf('async function trRoll(){'), HTML.indexOf('async function trRoll(){') + 1200);
  const j1 = t.indexOf('n=MMP7.rollDice();run.roll=n;save()'), j2 = t.indexOf('await p12Dice.play("std",n)'), j3 = t.indexOf('MMP7.advanceTraining(S,S.m,n);delete run.roll;save();');
  assert.ok(j1 > 0 && j1 < j2 && j2 < j3, '修行：出目の決定・保存 → 演出 → 前進（出目を使い終えた記録と同時に保存）');
  assert.match(b, /if\(dice\)dice\.textContent=1\+R\(3\);/, '従来の簡易演出は再生できない時の予備として残す');
  assert.match(t, /\["⚀","⚁","⚂"\]\[R\(3\)\]/);
});

test('D2-2：演出の部品は見せ方だけ（出目を決めない）。分岐ルート用1〜6はどこからも再生しない（使用場面が無いため待機）', () => {
  const h = HTML.slice(HTML.indexOf('const p12Dice=(()=>{'), HTML.indexOf('async function bRoll(){'));
  assert.doesNotMatch(h, /Math\.random|R\(\d\)|rollDice|MMP8\.roll/, '部品の中で出目を決めない');
  assert.match(h, /value<s\.min\|\|value>s\.max\)return false/, '範囲外の出目は再生しない');
  assert.match(h, /prefers-reduced-motion/);
  assert.doesNotMatch(HTML.replace(h, ''), /p12Dice\.play\("branch"/); assert.equal((HTML.match(/p12Dice\.play\(/g) || []).length, 2, '再生するのは通常進行と修行の2か所だけ');
  assert.match(HTML, /<span class="dz" id="bdice"><img class="p12dicon" src="\$\{MMP12D\.icon\("std"\)\}" alt=""><\/span>/);
  assert.match(HTML, /<div class="bdice" id="p7dice"><img class="p12dicon" src="\$\{MMP12D\.icon\("std"\)\}" alt=""><\/div>/);
  assert.match(HTML, /\.p12dz\{position:fixed;[^}]*pointer-events:none/, '演出は画面操作を妨げない');
});

// ---------------------------------------------------------
// 修行サイコロの保存タイミング：出目を決めたら演出の前に保存し、再読み込み後も同じ出目で1回だけ進める
// ---------------------------------------------------------
const J = (o) => JSON.parse(JSON.stringify(o));
function trEnv(save0, { rollGuard = false, hook = null } = {}) {
  const w = {}; for (const f of ['js/phase7/progression.js', 'js/phase8/league.js', 'js/phase8/raising.js', 'js/phase10/monsters.js']) new Function('window', rd(f))(w);
  const P7 = w.MMP7, P8 = w.MMP8, S = P8.migrateSave(J(save0)), saves = [], screens = []; let rolls = 0;
  const M7 = { ...P7, rollDice: (...a) => { rolls++; if (rollGuard) throw new Error('振り直してはいけない'); return P7.rollDice(...a); } };
  const src = HTML.slice(HTML.indexOf('async function trRoll(){'), HTML.indexOf('\n// ---- 出発準備'));
  const trRoll = new Function('S', 'MMP7', '$', 'sfx', 'p12Dice', 'R', 'sleep', 'LAB', 'SK', 'save', 'trScr', `let p7Busy=false;\n${src}\nreturn trRoll;`)(
    S, M7, () => null, () => {}, { play: async (k, v) => { if (hook) hook(v, saves); return true; } }, () => 0, async () => {}, { po: 'ちから', li: 'ライフ' }, {},
    () => saves.push(JSON.stringify(S)), (m) => screens.push(m));
  return { P7, P8, S, trRoll, saves, screens, rolls: () => rolls };
}
function trainingSave(pos = 0, pending = null) {
  const w = {}; for (const f of ['js/phase7/progression.js', 'js/phase8/league.js', 'js/phase8/raising.js', 'js/phase10/monsters.js']) new Function('window', rd(f))(w);
  const P7 = w.MMP7, P8 = w.MMP8, S = P8.newSave(); const m = { sp: 0, name: 'テスト', age: 0, span: 30, h: 0, rk: 0, fa: 0, st: 0, last: null, li: 100, po: 100, in: 100, hi: 100, ev: 100, de: 100, sk: [0, 1, 2, 3], eq: [0, 1, 2, 3, -1, -1] };
  P7.ensureProg(m); S.m = P8.initIndividual(S, m); Object.assign(S.m.raise, { state: 'farm', ch: 2, log: [{ ch: 1 }] }); S.trainTix = 3;
  assert.equal(P7.startTraining(S, S.m, 'po').ok, true); S.m.raise.trainRun.pos = pos; if (pending != null) S.m.raise.trainRun.roll = pending; return J(S);
}

test('R1-1：通常時は1〜3の出目で従来どおり進み、出目は決めた直後（演出より前）に保存される', async () => {
  let atPlay = null;
  const E = trEnv(trainingSave(0), { hook: (v, saves) => { atPlay = { v, saved: JSON.parse(saves[saves.length - 1]) }; } });
  await E.trRoll();
  assert.ok([1, 2, 3].includes(atPlay.v)); assert.equal(E.rolls(), 1);
  assert.equal(atPlay.saved.m.raise.trainRun.roll, atPlay.v, '演出の時点で出目が保存済み');
  assert.equal(atPlay.saved.m.raise.trainRun.pos, 0, '演出の時点ではまだ進んでいない');
  assert.equal(E.S.m.raise.trainRun.pos, atPlay.v, '出目の数だけ進む'); assert.ok(!('roll' in E.S.m.raise.trainRun), '処理済みの出目は消える');
  assert.ok(!('roll' in JSON.parse(E.saves[E.saves.length - 1]).m.raise.trainRun), '処理済みの状態を保存');
});

test('R1-2：出目を保存した後（演出中）に再読み込み→別の出目を振らず、保存された出目で1回だけ進む。能力上昇は二重にならない', async () => {
  let snap = null;
  const A = trEnv(trainingSave(0), { hook: (v, saves) => { snap = saves[saves.length - 1]; throw new Error('ここで再読み込み（演出中）'); } });
  await assert.rejects(A.trRoll()); const v = JSON.parse(snap).m.raise.trainRun.roll;
  assert.ok([1, 2, 3].includes(v)); assert.equal(JSON.parse(snap).m.raise.trainRun.pos, 0);
  const B = trEnv(JSON.parse(snap), { rollGuard: true }); const before = { po: B.S.m.po, li: B.S.m.li, v: B.S.v };
  assert.equal(before.v, 6, 'セーブはv6のまま');
  await B.trRoll();
  assert.equal(B.rolls(), 0, '新しい出目は振らない'); assert.equal(B.S.m.raise.trainRun.pos, v, '保存された出目で進む');
  const sq = B.P7.trainSquare(v), gainKey = sq === 's' ? 'po' : sq === 'l' ? 'li' : null;
  const once = { po: B.S.m.po, li: B.S.m.li };
  if (gainKey) assert.ok(once[gainKey] > before[gainKey], '止まったマスの効果は1回'); else assert.deepEqual(once, { po: before.po, li: before.li });
  const C = trEnv(JSON.parse(B.saves[B.saves.length - 1]), { rollGuard: true });
  assert.deepEqual([C.S.m.po, C.S.m.li, C.S.m.raise.trainRun.pos], [once.po, once.li, v], '処理後に再読み込みしても二重に進まない・二重に上がらない');
  assert.ok(!('roll' in C.S.m.raise.trainRun)); assert.equal(C.S.v, 6);
});

test('R1-3：ゴール直前で出目を保存→再読み込み→同じ出目でゴール。技習得・修行クリアは1回だけ（二重にならない）', async () => {
  const s0 = trainingSave(13, 3);
  const B = trEnv(s0, { rollGuard: true }); B.P7.registerMoveset(0, { initial: [0, 1, 2, 3], po: [4], in: [5], hi: [6], ev: [7], de: [8, 9] });
  const cnt0 = B.S.m.prog.train.po, sk0 = B.S.m.sk.length;
  await B.trRoll();
  assert.equal(B.rolls(), 0); assert.equal(B.S.m.raise.trainRun, null, '修行クリア');
  assert.equal(B.S.m.prog.train.po, cnt0 + 1, '修行回数は1回だけ増える'); assert.equal(B.S.m.sk.length, sk0 + 1); assert.equal(B.S.m.sk.filter((x) => x === 4).length, 1, '技は1回だけ覚える');
  const C = trEnv(JSON.parse(B.saves[B.saves.length - 1]), { rollGuard: true }); C.P7.registerMoveset(0, { initial: [0, 1, 2, 3], po: [4], in: [5], hi: [6], ev: [7], de: [8, 9] });
  await C.trRoll();
  assert.deepEqual([C.S.m.raise.trainRun, C.S.m.prog.train.po, C.S.m.sk.length, C.rolls()], [null, cnt0 + 1, sk0 + 1, 0], '再読み込み後も二重にクリア・習得しない');
});

test('R1-4：出目を持たない現行の修行中セーブは従来どおり（読み込める・次に振ったときだけ出目を決める）。未処理の出目があれば画面を開いたら続きから', async () => {
  const s0 = trainingSave(5); assert.ok(!('roll' in s0.m.raise.trainRun));
  const E = trEnv(s0); assert.equal(E.S.v, 6); assert.equal(E.S.m.raise.trainRun.pos, 5);
  await E.trRoll(); assert.equal(E.rolls(), 1); assert.ok(E.S.m.raise.trainRun.pos > 5);
  const tr = HTML.slice(HTML.indexOf('function trScr(msg,done){'), HTML.indexOf('\nlet p7Busy=false;'));
  const a = tr.indexOf('if(run&&Number.isInteger(run.roll)){'), b = tr.indexOf('setTimeout(trRoll,400)', a);
  assert.ok(a > 0 && b > a, '未処理の出目があれば同じ出目で自動的に続きから');
  assert.equal(rd('js/phase7/progression.js').includes('run.roll'), false, '修行の進行ロジック（progression.js）は変えていない');
});

// ---------------------------------------------------------
// サイコロの結果表示の層（停止面の画像の差し込み口）：未登録なら数字の表示だけ・分岐用は進行に接続しない
// ---------------------------------------------------------
function diceWith(src) { const w = {}; new Function('window', src)(w); return w.MMP12D; }

test('V1-1：停止面の画像は通常用（1〜3）・分岐用（1〜6）とも登録欄があり、現在は未登録（どの出目も数字の表示で代用）', () => {
  const D = diceWith(rd('js/phase12/dice.js'));
  for (const k of ['std', 'branch']) { assert.deepEqual(D.SETS[k].faces, {}); assert.ok(Object.isFrozen(D.SETS[k].faces)); for (let v = 0; v <= 7; v++) assert.equal(D.face(k, v), null, `${k} ${v}`); }
  assert.equal(D.face('x', 1), null);
  const reg = rd('js/phase12/dice.js').replace("frameMs: 70, faces: fz({}) }),\n    branch", "frameMs: 70, faces: fz({ 1: 'A1', 2: 'A2', 3: 'A3', 4: 'A4' }) }),\n    branch")
    .replace("name: '分岐ルート用サイコロ', min: 1, max: 6, frames: frames('branch'), w: 561, h: 449, frameMs: 70, faces: fz({}) })", "name: '分岐ルート用サイコロ', min: 1, max: 6, frames: frames('branch'), w: 561, h: 449, frameMs: 70, faces: fz({ 1: 'B1', 6: 'B6', 7: 'B7' }) })");
  const R = diceWith(reg);
  assert.deepEqual([1, 2, 3, 4].map((v) => R.face('std', v)), ['A1', 'A2', 'A3', null], '登録しても通常用の範囲（1〜3）外は出さない');
  assert.deepEqual([1, 2, 6, 7, 1.5].map((v) => R.face('branch', v)), ['B1', null, 'B6', null, null], '分岐用は1〜6の範囲内で登録された出目だけ');
});

test('V1-2：結果表示の層は10コマの演出のあとだけ動き、画像が読み込めた時だけ停止面を出す（補助の数字は常に表示）。出目の決定・保存・移動の順番と分岐用の未接続は変わらない', () => {
  const h = HTML.slice(HTML.indexOf('const p12Dice=(()=>{'), HTML.indexOf('async function bRoll(){'));
  assert.match(h, /<img class="p12dzi"[^>]*><div class="p12dface" hidden><\/div><div class="p12dres" hidden>/, '演出の上に独立した結果表示の層');
  const iFrames = h.indexOf('for(const f of s.frames){img.src=f;await sleep(s.frameMs)}'), iRes = h.indexOf('await showResult(ov,k,value)'), iFade = h.indexOf('ov.classList.add("out")');
  assert.ok(iFrames > 0 && iFrames < iRes && iRes < iFade, '共通アニメーション → 結果表示 → 消える');
  const sr = h.slice(h.indexOf('async function showResult('), h.indexOf('async function play('));
  assert.match(sr, /MMP12D\.face\(k,value\)/); assert.match(sr, /if\(loaded\)\{lay\.appendChild\(im\);lay\.hidden=false;ov\.querySelector\("\.p12dzi"\)\.style\.visibility="hidden";ov\.dataset\.face="img"\}/, '読み込めた時だけ画像に切り替える');
  assert.match(sr, /if\(!ov\.dataset\.face\)ov\.dataset\.face="number";ov\.querySelector\("\.p12dres"\)\.hidden=false/, '未登録・読み込めない時は数字の表示（補助の数字は常に出す）');
  assert.doesNotMatch(h, /Math\.random|MMP8\.|MMP7\.|save\(\)/, '結果表示は出目・進行・保存に関わらない');
  const b = HTML.slice(HTML.indexOf('async function bRoll(){'), HTML.indexOf('\nasync function p8Continue('));
  assert.ok(b.indexOf('MMP8.roll(S,m);save();') < b.indexOf('p12Dice.play("std",r.value)') && b.indexOf('p12Dice.play') < b.indexOf('p8Continue()'), 'Chapter：出目決定・保存 → 演出（結果表示を含む）→ 移動');
  const t = HTML.slice(HTML.indexOf('async function trRoll(){'), HTML.indexOf('\n// ---- 出発準備'));
  assert.ok(t.indexOf('run.roll=n;save()') < t.indexOf('p12Dice.play("std",n)') && t.indexOf('p12Dice.play') < t.indexOf('MMP7.advanceTraining(S,S.m,n)'), '修行：出目決定・保存 → 演出 → 前進');
  assert.equal((HTML.match(/p12Dice\.play\(/g) || []).length, 2); assert.doesNotMatch(HTML, /p12Dice\.play\("branch"/, '分岐用サイコロは進行に接続しない');
});
