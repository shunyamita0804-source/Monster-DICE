// =========================================================
// QA：静的ガード（ブラウザを使わない）
//  1) Phase 6 保護対象の拡張：legacy 原本・js/systems/ の各ファイル・技データ・素早さ分離処理・
//     バトルチェックポイント形式を固定し、CLAUDE.md に書かれたハッシュ先頭8桁とも照合する
//  2) index.html が読み込む <script src> は現在の17ファイルだけ（PHASE 1 の土台を誤って読み込まない）
//  3) 画面に出る旧名称（モンスターマスターなど）と、ガウルの旧名「ハヤテ」が出てよい場所
//  4) CLAUDE.md の確定仕様の数値と、コード上の定数・計算が一致すること
//  ※ index.html は base64 画像の非常に長い行を含むため、全文を出力しない。data: URI は短い印に置き換えてから調べる。
//  ※ 仕様の数値は「いまのコードにある値」だけを確認する（CLAUDE.md と違う箇所はコメントに記録する）。
// =========================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as CKPT from '../js/systems/battle/checkpoint.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const rdb = (p) => readFileSync(path.join(ROOT, p));
const sha = (t) => createHash('sha256').update(t).digest('hex');
const HTML = rd('index.html');
const CLAUDE_MD = rd('CLAUDE.md');

/** P7-31 と同じ抽出方法（開始目印から終了目印の直前まで） */
function cut(src, a, b) {
  const i = src.indexOf(a); if (i < 0) throw new Error('抽出開始位置がありません：' + a);
  const k = src.indexOf(b, i + a.length); if (k < 0) throw new Error('抽出終了位置がありません：' + b);
  return src.slice(i, k);
}
/** 行頭が prefix の行（1行だけであること） */
function lineOf(src, prefix) {
  const ls = src.split('\n').filter((l) => l.startsWith(prefix));
  if (ls.length !== 1) throw new Error(`行が1つではありません（${ls.length}）：${prefix}`);
  return ls[0];
}
/** base64 の data: URI を短い印に置き換える（旧来の画像データを検索対象から外す） */
const NODATA = HTML.replace(/data:[a-z]+\/[a-z0-9+.-]+;base64,[A-Za-z0-9+/=]+/gi, 'data:B64');
/** HTML コメント・/* *\/ コメント・// 行コメントを外す（"https://" のように直前が : の // は残す） */
const stripComments = (s) => s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[\s;{}(),])\/\/[^\n]*/gm, '$1');
const CODE = stripComments(NODATA);
/** idx の位置を含むトップレベル関数の名前（行頭の function / async function 宣言のうち直前のもの） */
function enclosingFn(src, idx) {
  const re = /\n(?:async )?function ([\w$]+)\(/g; let name = null, m;
  while ((m = re.exec(src)) && m.index < idx) name = m[1];
  return name;
}
/** トップレベル関数 name（async も可）の宣言から、次のトップレベル関数の直前まで */
function fnBody(src, name) {
  const m = new RegExp(`\\n(?:async )?function ${name}\\(`).exec(src); if (!m) throw new Error('関数がありません：' + name);
  const re = /\n(?:async )?function [\w$]+\(/g; re.lastIndex = m.index + 1; const n = re.exec(src);
  return src.slice(m.index, n ? n.index : src.length);
}
/** 識別子 name の「呼び出し」位置の一覧（宣言 function name( は除く）→ [{fn, arg}] */
function callSites(src, name) {
  const re = new RegExp(`(?<![\\w$.])${name}\\(([^)]*)\\)`, 'g'); const out = []; let m;
  while ((m = re.exec(src))) { if (/function\s+$/.test(src.slice(Math.max(0, m.index - 12), m.index))) continue; out.push({ fn: enclosingFn(src, m.index), arg: m[1] }); }
  return out;
}

/** 読み込み対象の正式モジュールを Node 上で読み込む（テストごとにまっさら） */
function load() {
  const w = {};
  for (const f of ['js/phase7/progression.js', 'js/phase8/league.js', 'js/phase8/raising.js', 'js/phase10/monsters.js', 'js/phase9/chapters.js', 'js/npc/npc.js']) new Function('window', rd(f))(w);
  return { P7: w.MMP7, P8: w.MMP8, L: w.MMP8L, M: w.MMP10M, C: w.MMP9C, N: w.MMNPC };
}
/** 旧来の個体生成 mk() を実物のまま取り出して動かす */
function loadMk(P7, P8, S) {
  const src = [lineOf(HTML, 'const SP='), lineOf(HTML, 'const KS='), lineOf(HTML, 'function mk(')].join('\n');
  return new Function('MMP7', 'MMP8', 'S', `${src}\nreturn { mk, SP, KS };`)(P7, P8, S);
}
/** 個体（育成状態つき）。売却・大会の判定に使う */
function mon(P7, P8, S, state = 'none', over = {}) {
  const m = P8.initIndividual(S, { sp: 0, name: 'ソラモ', age: 0, span: 30, h: 0, rk: 0, fa: 0, st: 0, last: null, li: 100, po: 100, in: 100, hi: 100, ev: 100, de: 100, sk: [0, 1, 2, 3], eq: [0, 1, 2, 3, -1, -1], ...over });
  P7.ensureProg(m); m.raise.state = state; return m;
}

// 読み込むスクリプト（この順番で18本）。PHASE 1 の土台（js/main.js・js/core・js/ui・js/dev・js/systems・css/）は含めない
const SCRIPTS = [
  'js/battle-bridge.js', 'js/integration/adapter.js', 'js/phase7/progression.js', 'js/phase8/league.js', 'js/phase8/raising.js',
  'js/phase10/monsters.js', 'js/phase11/player.js', 'js/phase12/scenes.js', 'js/phase12/dice.js', 'js/phase13/field.js',
  'js/phase9/chapters.js', 'js/phase9/board-art.js', 'js/npc/npc.js',
  'js/chapter/engine.js', 'js/chapter/configs/ch1a.js', 'js/chapter/configs/ch2a.js', 'js/chapter/dice-renderer.js', 'js/chapter/field-view.js', 'js/chapter/intro.js',   // 2026-09-30：Chapterフィールドエンジン
  'js/battle/fit.js',   // 2026-09-30：バトル画面の表示だけの補正（fight()・.bt 系 CSS は変えない）
];
// 旧名称（大文字小文字・区切りの違いも含む）。正式名称「ミスティックモンスターズ／MYSTIC MONSTERS」は含まない
const OLD_NAME = /モンスターマスター|monster[\s_-]?master|monster[\s_-]?dice|ミスティックモンスター(?!ズ)|mystic[\s_-]?monster(?!s)/gi;

// =========================================================
// 1) Phase 6 保護対象の拡張
// =========================================================
test('QA-G1：legacy/index.original.html は原本のまま（sha256 全桁一致）で、legacy/ にはこの1ファイルだけ', () => {
  // CLAUDE.md は「照合は tests/phase7.test.mjs で行う」と書くが、phase7 のテストは legacy を照合していない
  // （integration.test.mjs はサイズだけ確認）。ここで全桁を固定する。
  assert.deepEqual(readdirSync(path.join(ROOT, 'legacy')), ['index.original.html']);
  assert.equal(sha(rdb('legacy/index.original.html')), '90eeba79b42bdf219faf9194e1a612ce09aee1142333ff20cc6e969e20c4e191');
});

test('QA-G2：Battle Engine（js/systems/battle/*.js）は6ファイルのまま、各ファイルが Phase 6 時点とバイト単位で同一', () => {
  const PIN = {
    'checkpoint.js': '5b7b687c6c8beade889c94d0920bb9a70e00dfffc7fba464b46a6362d555c715',
    'combatMath.js': 'ff345850450cc7042e9fb9c430651a3814e413b9308d35621654e026cf6d2915',
    'effects.js': '39bb753edc6f85c6e2b3c642dc7996db3ea044628c408c260d0d02997b249909',
    'engine.js': '41e44e97a79cbc4de6853a1117480667ce16803828c1be5767e0515a4d01eb71',
    'firstActor.js': '69b62c182ac31eda5241ca98c4ea1d1cf59c46ef716f69f0eee72a3e7ec23679',
    'session.js': '97c8004dadd033a7776c9571a2a4e4bf928a928a227e2642b3066a91bf4ccafc',
  };
  assert.deepEqual(readdirSync(path.join(ROOT, 'js/systems/battle')).sort(), Object.keys(PIN).sort());
  for (const [f, h] of Object.entries(PIN)) assert.equal(sha(rdb('js/systems/battle/' + f)), h, f);
});

test('QA-G3：js/systems/ 直下（CLAUDE.md で Phase 6 保護対象とされるバトルエンジン一式）も無変更', () => {
  const PIN = {
    'conditions.js': '331d65147eb05a21d6fbe2701e98402ccd95b8f0fe30fc4a96abddd3eb6a2fd7',
    'entry.js': '6dc6b5da36021f4b5d7839d556d347b1429443e7ae73d6b96e2f93bc01c5e5e7',
    'flows.js': 'af545f550b5ea18c1a901efadbaf28ceb13bddbfcba69c2b72a94fa243ef7675',
    'individual.js': '007f1827df09a4bcabd610f43f02a44fffcc4ecfe103af9cb7580a171c1b3f8f',
    'raising.js': 'bee545ff016eb1cf283001200c4aa76429f6773a9c540504574d652f9d237429',
  };
  const files = readdirSync(path.join(ROOT, 'js/systems')).filter((f) => statSync(path.join(ROOT, 'js/systems', f)).isFile()).sort();
  assert.deepEqual(files, Object.keys(PIN).sort());
  for (const [f, h] of Object.entries(PIN)) assert.equal(sha(rdb('js/systems/' + f)), h, f);
});

test('QA-G4：CLAUDE.md に書かれたハッシュ（fight()・battle-bridge.js・adapter.js・legacy）の先頭8桁が実物と一致', () => {
  const line = CLAUDE_MD.split('\n').find((l) => l.includes('ハッシュ：') && l.includes('fight()'));
  assert.ok(line, 'CLAUDE.md にハッシュの行がある');
  const doc = {
    fight: line.match(/fight\(\)\s*([0-9a-f]{8})/)[1], bridge: line.match(/battle-bridge\.js\s*([0-9a-f]{8})/)[1],
    adapter: line.match(/adapter\.js\s*([0-9a-f]{8})/)[1], legacy: line.match(/legacy\s*([0-9a-f]{8})/)[1],
  };
  assert.deepEqual(doc, { fight: 'd46e27f6', bridge: 'bff08e0f', adapter: 'f99617ac', legacy: '90eeba79' });
  const real = {
    fight: sha(cut(HTML, 'async function fight(', '\n$("#snd").textContent')),   // P7-31 と同じ抽出方法
    bridge: sha(rdb('js/battle-bridge.js')), adapter: sha(rdb('js/integration/adapter.js')), legacy: sha(rdb('legacy/index.original.html')),
  };
  for (const k of Object.keys(doc)) assert.ok(real[k].startsWith(doc[k]), `${k}: ${real[k].slice(0, 8)} ≠ ${doc[k]}`);
  assert.equal((HTML.match(/\nasync function fight\(/g) || []).length, 1, 'fight() の本体は1つだけ');
});

test('QA-G5：battle-bridge.js は js/systems/battle/*.js・individual.js の関数を1字1句そのまま持つ（28関数）', () => {
  // 行頭の function 宣言から、対応する閉じ括弧までを取り出す（export は外す）
  function fns(src) {
    const out = {}; const re = /(?:^|\n)\s*(?:export\s+)?function\s+(\w+)\s*\(/g; let m;
    while ((m = re.exec(src))) {
      const s = src.indexOf('function', m.index); const i = src.indexOf('{', s); let d = 0, j = i;
      for (; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}') { d--; if (!d) break; } }
      out[m[1]] = src.slice(s, j + 1);
    }
    return out;
  }
  const B = fns(rd('js/battle-bridge.js'));
  const files = [...readdirSync(path.join(ROOT, 'js/systems/battle')).map((f) => 'js/systems/battle/' + f), 'js/systems/individual.js'];
  let same = 0; const bad = [];
  for (const f of files) for (const [k, v] of Object.entries(fns(rd(f)))) { if (B[k] === v) same++; else bad.push(`${f}:${k}`); }
  assert.deepEqual(bad, [], '食い違い・ブリッジに無い関数');
  assert.equal(same, 28);
});

test('QA-G6：バトル技データ（SK・EFF）と素早さ分離処理（p10LegacyBattle）の行が変わっていない（Phase 6 保護対象）', () => {
  // 正式技データは技制作チャットからの同期待ち。同期されるまで旧来の技表を変えない（値は引き継ぎ後の現物で固定）
  assert.equal(sha(lineOf(HTML, 'const SK=')), 'ba121d45c89ad76a67150b65278f0771c01f120be7beb8c1cdbf748ef5a43767', '旧来の技表 SK');
  assert.equal(sha(lineOf(HTML, 'const EFF=')), 'f40de8720c9c0bb4d34241c39fb226bf7c6499633042bf4b6547a406623fdc6c', '技の追加効果 EFF');
  assert.equal(sha(lineOf(HTML, 'function p10LegacyBattle(')), '30c1c3112b45a31a73d95c4bfdb94bf80d0fdc4cae7c76dc2626e66c30e9e6e8', '素早さ分離処理');
  // fight() の外側のラッパーは、素早さ分離処理を通して元の fight() を呼ぶ
  assert.match(lineOf(HTML, 'fight=function('), /return p10LegacyBattle\(m,\(\)=>P8_FIGHT\(i,teach\)\)/);
});

test('QA-G7：素早さ分離処理は実行中だけ speed を外し、例外でも必ず戻す（speed が無い個体には作らない）', () => {
  const p10LegacyBattle = new Function(`${lineOf(HTML, 'function p10LegacyBattle(')}\nreturn p10LegacyBattle;`)();
  const m = { sp: 1, speed: 7 }; let seen = 'unset';
  assert.equal(p10LegacyBattle(m, () => { seen = 'speed' in m; return 'ok'; }), 'ok');
  assert.equal(seen, false, '実行中は speed が無い（Phase 6 バトルへ渡さない）');
  assert.equal(m.speed, 7, '終了後は元の値に戻る');
  assert.throws(() => p10LegacyBattle(m, () => { throw new Error('x'); }));
  assert.equal(m.speed, 7, '例外でも戻す');
  const n = { sp: 0 }; p10LegacyBattle(n, () => {}); assert.equal('speed' in n, false, 'speed の無い個体に speed を作らない');
});

test('QA-G8：バトルチェックポイント形式（monster-master-battle-checkpoint・version 1）はエンジンとブリッジで同一', () => {
  const w = {}; new Function('window', rd('js/battle-bridge.js'))(w); const MM = w.MMBattle;
  const session = { firstActor: 'A', turn: 1, participants: { A: { id: 'a' }, B: { id: 'b' } }, currentLife: { A: 10, B: 10 }, hitCount: { A: 0, B: 0 }, totalDamage: { A: 0, B: 0 } };
  for (const [name, api] of [['engine', CKPT], ['bridge', MM]]) {
    const c = api.createCheckpoint(session);
    assert.deepEqual(Object.keys(c), ['format', 'version', 'savedAt', 'session'], name);
    assert.equal(c.format, 'monster-master-battle-checkpoint', name);
    assert.equal(c.version, 1, name);
    assert.deepEqual(api.restoreSession(c), session, name);
    assert.throws(() => api.restoreSession({ ...c, format: 'mystic-monsters-battle-checkpoint' }), /バトルチェックポイントではありません/, name);
  }
});

test('QA-G9：fight() の規定ラウンドは15、対戦相手の能力値 RV は大会の暫定値（MMP8L）と同じ E70〜S300', () => {
  const { L } = load();
  const f = cut(HTML, 'async function fight(', '\n$("#snd").textContent');
  assert.equal((f.match(/const MAXR=(\d+);/) || [])[1], '15');
  const rv = JSON.parse(f.match(/const RV=(\[[\d,]+\])/)[1]);
  assert.deepEqual(rv, [70, 90, 120, 160, 220, 300]);
  assert.deepEqual([...L.PROVISIONAL_OPPONENT_STAT], rv, '大会の表示と実際の試合の相手は同じ値');
});

test('QA-G10：ルーレットは技6枠＋固定MISS1枠。新しく生まれる個体は4技＋空き2枠（ソラモ・ガウルとも）', () => {
  const rl = HTML.match(/const SPECIAL_MOVES=new Set\(\[\]\);[\s\S]*?const buildRouletteSlots=eq=>\{[\s\S]*?\};/)[0];   // P7-31 と同じ範囲
  const { buildRouletteSlots, FIXED_MISS } = new Function(`${rl}\nreturn { buildRouletteSlots, FIXED_MISS };`)();
  const slots = buildRouletteSlots([0, 1, 2, 3, -1, -1]);
  assert.deepEqual(slots.map((s) => s.k), [0, 1, 2, 3, -1, -1, FIXED_MISS]);
  assert.equal(FIXED_MISS, 'fixed_miss');
  assert.equal(buildRouletteSlots([5]).length, 7, '短い eq でも7枠');
  const { P7, P8 } = load(); const S = P8.newSave(); const { mk } = loadMk(P7, P8, S);
  const a = mk(0), b = mk(1);
  assert.deepEqual(a.eq, [0, 1, 2, 3, -1, -1]); assert.deepEqual(a.sk, [0, 1, 2, 3]);
  assert.deepEqual(b.eq, [10, 11, 12, 13, -1, -1]); assert.deepEqual(b.sk, [10, 11, 12, 13]);
  assert.ok(a.eq !== a.sk, 'eq は sk の写し');
});

// =========================================================
// 2) 読み込むスクリプト・head
// =========================================================
test('QA-S1：index.html の <script src> は18ファイルをこの順番で読み込む（重複なし・全ファイル実在・module なし）', () => {
  const tags = [...HTML.matchAll(/<script\b[^>]*\bsrc="([^"]*)"[^>]*>/g)].map((m) => m[1]);
  assert.deepEqual(tags, SCRIPTS.map((f) => './' + f));
  for (const f of SCRIPTS) assert.ok(existsSync(path.join(ROOT, f)), f);
  assert.doesNotMatch(NODATA, /<script\b[^>]*type="module"/, 'ES module として読み込まない');
  // 本体のインラインスクリプトは、18本すべての後に置かれている（MMP 系を使うため）
  const lastSrc = CODE.lastIndexOf('<script src="./js/battle/fit.js"></script>');
  const inline = [...CODE.matchAll(/<script>/g)].map((m) => m.index);
  assert.ok(inline.length >= 1 && inline.every((i) => i > lastSrc));
});

test('QA-S2：PHASE 1 の土台（js/main.js・js/core・js/ui・js/dev・js/systems・css/）を読み込まない。読み込む18本は import・export・fetch を使わない', () => {
  const tags = [...NODATA.matchAll(/<script\b[^>]*\bsrc="([^"]*)"/g)].map((m) => m[1]);
  for (const s of tags) assert.doesNotMatch(s, /js\/(main\.js|core\/|ui\/|dev\/|systems\/)|css\//, s);
  const links = [...NODATA.matchAll(/<link\b[^>]*>/g)].map((m) => m[0]);
  for (const l of links.filter((x) => /rel="stylesheet"/.test(x))) assert.match(l, /href="https:\/\/fonts\.googleapis\.com\//, 'スタイルシートは Google Fonts だけ');
  assert.doesNotMatch(CODE, /\bimport\s*\(|\bfetch\s*\(/, '本体スクリプトも import()・fetch() を使わない');
  for (const f of SCRIPTS) assert.doesNotMatch(stripComments(rd(f)), /^\s*(import|export)\s|\bimport\s*\(|\bfetch\s*\(/m, f);
});

test('QA-S3：head のホーム画面アイコン2行が Google Fonts の stylesheet 行の直後にあり、アイコンのファイルが実在する', () => {
  const head = HTML.slice(0, HTML.indexOf('<style>')).split('\n');
  const i = head.findIndex((l) => l.includes('fonts.googleapis.com/css2') && l.includes('rel="stylesheet"'));
  assert.ok(i > 0, 'Google Fonts の stylesheet 行がある');
  assert.match(head[i], /family=Noto\+Sans\+JP/); assert.match(head[i], /family=Shippori\+Mincho/);
  assert.equal(head[i + 1], '<link rel="apple-touch-icon" sizes="180x180" href="./apple-touch-icon-v2.PNG?v=soramo-20260928">');
  assert.equal(head[i + 2], '<link rel="icon" type="image/png" sizes="32x32" href="./favicon.png?v=soramo-20260928">');
  for (const f of ['apple-touch-icon-v2.PNG', 'favicon.png']) assert.ok(existsSync(path.join(ROOT, f)) && statSync(path.join(ROOT, f)).size > 0, f);
});

// =========================================================
// 3) 旧名称
// =========================================================
test('QA-N1：index.html（base64画像とコメントを除く）に旧名称（モンスターマスター・Monster Master・Monster-DICE・ミスティックモンスター）が無い', () => {
  // N1-1 より厳しく：「正式モンスターマスター」の例外も設けず、大文字小文字・区切りの違いも拾う（コメントの中の記述は対象外）
  assert.deepEqual(CODE.match(OLD_NAME), null);
  assert.ok(CODE.length > NODATA.length * 0.8, 'コメント除去で本文が消えていない（除去の仕方の確認）');
  assert.match(HTML, /<title>ミスティックモンスターズ<\/title>/);
  assert.match(NODATA, /alt="ミスティックモンスターズ MYSTIC MONSTERS"/, '開始画面の画像の代替テキストは正式名称');
});

test('QA-N2：読み込む17本のJS（コメントを除く）に旧名称が無い。例外は Phase 6 保護対象 battle-bridge.js のチェックポイント形式名と検証メッセージだけ', () => {
  for (const f of SCRIPTS) {
    const hits = stripComments(rd(f)).match(OLD_NAME) || [];
    if (f === 'js/battle-bridge.js') assert.deepEqual(hits, ['monster-master', 'モンスターマスター'], f);
    else assert.deepEqual(hits, [], f);
  }
  const b = stripComments(rd('js/battle-bridge.js'));
  assert.match(b, /const FORMAT = 'monster-master-battle-checkpoint';/);
  assert.match(b, /return 'モンスターマスターのバトルチェックポイントではありません';/);
});

test('QA-N3：「ハヤテ」はガウルの旧名の互換処理（legacyFix）・正式データの旧名記録・大会の暫定NPC名の3か所だけ', () => {
  const htmlLines = NODATA.split('\n').filter((l) => l.includes('ハヤテ') && !/^\s*\/\//.test(l));
  assert.equal(htmlLines.length, 1, 'index.html の旧名はセーブ互換の legacyFix の1行だけ');
  assert.match(htmlLines[0], /^function legacyFix\(d\)\{/); assert.match(htmlLines[0], /if\(x\.sp!=1\)return;if\(x\.name=="ハヤテ"\)x\.name="ガウル"/, 'ガウル（sp 1）だけを改名する');
  for (const f of SCRIPTS) {
    const ls = rd(f).split('\n').filter((l) => l.includes('ハヤテ'));
    if (f === 'js/phase10/monsters.js') { assert.equal(ls.length, 1); assert.match(ls[0], /key: 'gauru', name: 'ガウル'.*formerNames: fz\(\['ハヤテ'\]\)/); }
    else if (f === 'js/phase8/league.js') { assert.equal(ls.length, 1); assert.match(ls[0], /const PROVISIONAL_NPC_NAMES = /); }
    else assert.deepEqual(ls, [], f);
  }
});

const legacyFixFn = () => new Function(NODATA.split('\n').find((l) => l.startsWith('function legacyFix(d){')) + ';return legacyFix;')();

test('QA-N4：互換処理 legacyFix：ガウルの「ハヤテ」は「ガウル」に直し、ほかの名前・空きは変えない。正式データの旧名はガウルだけ', () => {
  const { M } = load(); const fix = legacyFixFn();
  const S = { m: { sp: 1, name: 'ハヤテ' }, box: [{ sp: 1, name: 'ハヤテ２' }, { sp: 0, name: 'ソラモ' }, null, { sp: 1, name: 'ガウル' }] };
  fix(S);
  assert.equal(S.m.name, 'ガウル');
  assert.deepEqual(S.box.map((x) => x && x.name), ['ハヤテ２', 'ソラモ', null, 'ガウル']);
  fix({ m: null });   // 手持ち無し・box 無しでも落ちない
  assert.deepEqual([M.byId(1).name, M.byId(1).key, [...M.byId(1).formerNames]], ['ガウル', 'gauru', ['ハヤテ']]);
  for (const sp of [0, 2, 3]) assert.deepEqual([...M.byId(sp).formerNames], [], `sp ${sp}`);
});

test('QA-N4b：ソラモに「ハヤテ」と名付けても、起動時にガウルへ改名しない（以前は種族を見ずに改名していた）', () => {
  const S = { m: { sp: 0, name: 'ハヤテ' }, box: [] };
  legacyFixFn()(S);
  assert.equal(S.m.name, 'ハヤテ');
});

test('QA-N5：大会の暫定NPC名は、現在の種族名（ソラモ・ガウル・ノビトン・ジオル）と同じにならず、1大会の中で重複しない', () => {
  const { L, M } = load();
  const species = new Set(M.SPECIES.map((s) => s.name));
  for (let rank = 0; rank <= 5; rank++) for (let seed = 1; seed <= 300; seed++) {
    const lg = L.createLeague(rank, seed, 'テスト');
    assert.equal(lg.entrants.length, L.LEAGUE_SIZE[rank]);
    const names = lg.entrants.filter((e) => !e.player).map((e) => e.name);
    for (const n of names) { assert.match(n, /ブリーダー /); assert.ok(!species.has(n.split('ブリーダー ')[1]), `${rank}/${seed}: ${n}`); }
    assert.equal(new Set(names).size, names.length, `${rank}/${seed}`);
  }
});

test('QA-N6：旧ロゴ入りの埋め込み画像を新しい画面へ広げない（未使用だった MKIMG・TRIMG・STL・RESTI・TITLEIMG は削除済み、FARMIMG は farm、TRIMG2 は dscr・_hall・p7Shell だけ）', () => {
  // CLAUDE.md §5「旧名称が残る背景画像の差し替え：素材待ち」。差し替えまでの間、使う場所を増やさない。
  const uses = (id) => { const re = new RegExp(`(?<![\\w$.])${id}(?![\\w$])(?!\\s*=[^=])`, 'g'); const out = []; let m; while ((m = re.exec(CODE))) out.push(enclosingFn(CODE, m.index)); return out; };
  for (const id of ['MKIMG', 'TRIMG', 'STL', 'RESTI', 'TITLEIMG']) assert.deepEqual(uses(id), [], id);
  // 未使用だった5件は 2026-09-29 の Stage 3（安全軽量化）で削除した。定義も戻さない（使う場所が無いまま容量だけ増えるため）
  for (const id of ['MKIMG', 'TRIMG', 'STL', 'RESTI', 'TITLEIMG']) assert.doesNotMatch(CODE, new RegExp(`(?<![\\w$.])${id}\\s*=[^=]`), id + ' の定義は削除済み');
  for (const fn of uses('FARMIMG')) assert.equal(fn, 'farm');
  for (const fn of uses('TRIMG2')) assert.ok(['dscr', '_hall', 'p7Shell'].includes(fn), `TRIMG2 in ${fn}`);
  // 開始画面は正式画像だけ（旧 TITLEIMG は使わない）
  const t = CODE.match(/const MMTITLE=\{src:"([^"]+)",w:(\d+),h:(\d+)\};/);
  assert.deepEqual(t.slice(1), ['assets/title/title_main.jpg', '1152', '2048']);
  assert.ok(existsSync(path.join(ROOT, t[1])));
});

// =========================================================
// 4) CLAUDE.md の確定仕様とコードの一致
// =========================================================
test('QA-C1：原種4体の種族ID・番号・名前・種族・6能力・素早さ（CLAUDE.md の表）と正式画像', () => {
  const { M } = load();
  const TABLE = [
    ['solamo', 0, 'ソラモ', '獣種', [100, 100, 100, 100, 100, 100], 5],
    ['gauru', 1, 'ガウル', '鳥種', [80, 110, 110, 90, 90, 60], 7],
    ['nobiton', 2, 'ノビトン', '獣種', [120, 80, 80, 80, 50, 100], 2],
    ['jiol', 3, 'ジオル', '岩石種', [90, 120, 40, 50, 30, 150], 1],
  ];
  assert.deepEqual([...M.STAT_KEYS], ['li', 'po', 'in', 'hi', 'ev', 'de']);
  assert.deepEqual({ ...M.STAT_LABELS }, { li: 'ライフ', po: 'ちから', in: 'かしこさ', hi: '命中', ev: '回避', de: '丈夫さ' });
  assert.equal(M.SPECIES.length, 4);
  M.SPECIES.forEach((s, i) => {
    const [key, id, name, kind, stats, speed] = TABLE[i];
    assert.deepEqual([s.key, s.id, s.name, s.kind, M.STAT_KEYS.map((k) => s.base[k]), s.speed], [key, id, name, kind, stats, speed], key);
    assert.equal(s.image.src, `./assets/monsters/${key}.png`); assert.ok(existsSync(path.join(ROOT, s.image.src)), s.image.src);
  });
  assert.deepEqual([M.SPEED_MIN, M.SPEED_MAX, M.isValidSpeed(0), M.isValidSpeed(11), M.isValidSpeed(10)], [1, 10, false, false, true]);
  // 旧来の個体生成（mk）で生まれる個体の能力・素早さも表と同じ
  const { P7, P8 } = load(); const S = P8.newSave(); const { mk, SP } = loadMk(P7, P8, S);
  assert.equal(SP.length, 2, '旧表で生成できるのはソラモ・ガウルだけ（ノビトン・ジオルは市場に出ていない）');
  for (const sp of [0, 1]) { const m = mk(sp); assert.deepEqual([m.name, M.STAT_KEYS.map((k) => m[k]), m.speed], [TABLE[sp][2], TABLE[sp][4], TABLE[sp][5]], `mk(${sp})`); }
});

test('QA-C2：新規ゲームの所持金は300G（p10NewSave）、セーブは version 6', () => {
  const { P8, M } = load();
  assert.deepEqual({ ...M.ECONOMY }, { initialGold: 300, marketPrice: 500 });
  const p10NewSave = new Function('MMP8', 'MMP10M', `${lineOf(HTML, 'function p10NewSave(')}\nreturn p10NewSave;`)(P8, M);
  const S = p10NewSave();
  assert.deepEqual([S.g, S.v, S.m, S.box.length], [300, 6, null, 0]);
  // MMP8.newSave() の所持金は旧来の既定値のままなので、index.html で新しいセーブを作るのは必ず p10NewSave を通す
  const raw = [...CODE.matchAll(/MMP[78]\.newSave\(/g)].map((m) => enclosingFn(CODE, m.index));
  assert.deepEqual(raw, ['p10NewSave'], 'MMP8/MMP7.newSave を直接呼ぶのは p10NewSave の中だけ');
  assert.ok(callSites(CODE, 'p10NewSave').length >= 1, '新規セーブ（起動時・最初から）は p10NewSave で作る');
});

test('QA-C3：市場：ソラモ・ガウルは500G、ノビトンは入荷待ち（価格なし・購入不可）、ジオルは市場に出さない', () => {
  const { P8, M } = load();
  assert.deepEqual(M.MARKET_CATALOG.map((c) => ({ ...c })), [{ key: 'solamo', status: 'sale', price: 500 }, { key: 'gauru', status: 'sale', price: 500 }, { key: 'nobiton', status: 'waiting' }]);
  assert.equal(M.marketItem('jiol'), null);
  const S = { ...P8.newSave(), g: 5000 };
  assert.deepEqual(M.canPurchase(S, 'jiol', 1), { ok: false, reason: 'not_in_market' });
  assert.deepEqual(M.canPurchase(S, 'nobiton', 1), { ok: false, reason: 'waiting' });
  for (const key of ['solamo', 'gauru']) { const T = { ...P8.newSave(), g: 500 }; assert.deepEqual(M.purchase(T, key, 1), { ok: true, key, price: 500, rescued: false, before: 500, after: 0 }); }
  // 初回購入救済：0体・500G未満 → 500Gに補填して購入（購入後0G）
  const F = { ...P8.newSave(), g: 300 }; const r = M.purchase(F, 'solamo', 0);
  assert.deepEqual([r.ok, r.rescued, r.before, r.after, F.g], [true, true, 300, 0, 0]);
});

test('QA-C4：所持上限は手持ち＋牧場で8体（市場の購入判定）、牧場は7体まで（預ける処理）', () => {
  const { P8, M } = load();
  assert.equal(M.OWN_LIMIT, 8);
  const S = { ...P8.newSave(), g: 5000 };
  assert.equal(M.canPurchase(S, 'solamo', 7).ok, true);
  assert.deepEqual(M.canPurchase(S, 'solamo', 8), { ok: false, reason: 'full' });
  assert.match(fnBody(CODE, 'dep'), /if\(S\.box\.length>=7\)return farm\("牧場がいっぱいです。","a"\)/);
  // 購入の確定（adopt）に渡す「所持数」は手持ち＋牧場
  assert.match(fnBody(CODE, 'adopt'), /MMP10M\.purchase\(S,MMP10M\.keyOf\(i\),S\.box\.length\+\(S\.m\?1:0\)\)/);
});

test('QA-C5：合体費用は200G（fuse() の支払いと、継続用救済の判定に使う MMP10M.FUSION_COST が同じ値）', () => {
  const { M } = load();
  assert.equal(M.FUSION_COST, 200);
  const fuse = fnBody(CODE, 'fuse');
  assert.match(fuse, /if\(S\.g<200\)return;/); assert.match(fuse, /S\.g-=200;/);
  assert.equal((fuse.match(/S\.g-=/g) || []).length, 1, '合体の支払いは1回だけ');
});

test('QA-C6：ノビトンの入荷条件は育成完了5回（4回は未達・5回で達成）。達成しても販売は始めない', () => {
  const { P8, M } = load();
  assert.equal(M.NOBITON_STOCK_RAISES, 5);
  const S = P8.newSave();
  S.raiseRec = { done: 4, fromStart: true }; assert.deepEqual(M.nobitonStock(S), { need: 5, done: 4, met: false, fromStart: true });
  S.raiseRec = { done: 5, fromStart: true }; assert.deepEqual(M.nobitonStock(S), { need: 5, done: 5, met: true, fromStart: true });
  S.g = 5000; assert.deepEqual(M.canPurchase(S, 'nobiton', 1), { ok: false, reason: 'waiting' }, '条件を満たしても購入不可のまま');
  const old = P8.newSave(); delete old.raiseRec; assert.deepEqual(M.nobitonStock(old), { need: 5, done: 0, met: false, fromStart: false }, '記録のない旧セーブは0回から');
});

test('QA-C7：売却額：未育成50G、育成完了は100G＋能力上昇（上限150G）＋ランク加算（E25〜S150G）で最大400G', () => {
  const { P7, P8, M } = load();
  assert.deepEqual(JSON.parse(JSON.stringify(M.SELL)), { unraised: 50, base: 100, gainCap: 150, max: 400, rankBonus: [25, 50, 75, 100, 125, 150] });
  const S = P8.newSave();
  const KS = ['li', 'po', 'in', 'hi', 'ev', 'de'];
  const done = (gain, rank) => {
    const m = mon(P7, P8, S, 'done');
    if (gain != null) { m.raise.startStats = Object.fromEntries(KS.map((k) => [k, 100])); m.raise.endStats = { ...m.raise.startStats, po: 100 + gain }; }
    m.prog.rankClr = [0, 1, 2, 3, 4, 5].map((i) => i <= rank); return M.sellQuote(m).price;
  };
  assert.equal(M.sellQuote(mon(P7, P8, S, 'none')).price, 50);
  assert.equal(done(null, -1), 100, '記録なし・ランク未到達');
  assert.equal(done(10, 0), 135, '100＋10＋E25');
  assert.equal(done(149, -1), 249); assert.equal(done(200, -1), 250, '上昇は150Gまで');
  assert.deepEqual([0, 1, 2, 3, 4, 5].map((r) => done(0, r)), [125, 150, 175, 200, 225, 250]);
  assert.equal(done(150, 5), 400); assert.equal(done(999, 5), 400, '最大400G');
  assert.deepEqual(M.sellQuote(mon(P7, P8, S, 'board')), { ok: false, reason: 'raising' });
});

test('QA-C8：大会：賞金 E100〜S1200、参加数 E・D 6体／C〜S 8体、挑戦上限は最高クリア＋1（未クリアはDまで・Chapter 1はD）、最終ルートはA以上', () => {
  const { P7, P8, L } = load();
  assert.deepEqual([...P8.RANK_LETTERS], ['E', 'D', 'C', 'B', 'A', 'S']);
  assert.deepEqual([...P8.PRIZE], [100, 200, 350, 550, 800, 1200]);
  // 参考：index.html の旧 fight() が使う旧賞金表 PZ は [100,200,300,500,800,1200]（C・B が異なる）。
  //  旧 fight() の加算は MMP8.finishBattle で取り消され、勝利画面の旧表示「賞金○G」は CLAUDE.md §5 の既知課題。
  assert.deepEqual([...L.LEAGUE_SIZE], [6, 6, 8, 8, 8, 8]);
  assert.deepEqual([...L.PROVISIONAL_OPPONENT_STAT], [70, 90, 120, 160, 220, 300]);
  const S = P8.newSave(); const m = mon(P7, P8, S, 'board');
  assert.deepEqual([1, 2, 3, 4].map((ch) => P8.maxChallengeRank(m, ch)), [1, 1, 1, 1], '未クリアは E・D まで');
  m.prog.rankClr = [true, true, true, false, false, false];   // C までクリア
  assert.deepEqual([1, 2, 3, 4].map((ch) => P8.maxChallengeRank(m, ch)), [1, 3, 3, 3], 'C＋1＝B、Chapter 1 は D まで');
  m.prog.rankClr = [true, true, true, true, true, false];     // A までクリア
  assert.deepEqual([2, 3, 4].map((ch) => P8.maxChallengeRank(m, ch)), [5, 5, 5], 'S が上限');
  assert.equal(P8.CHAPTER_RULES[1].rankCap, 1);
  assert.equal(P8.FINAL_CHAPTER_MIN_RANK, 4, '最終ルートは A 以上');
});

test('QA-C9：育成ボード：通常Chapterは20ターン、サイコロは1〜3、Chapter 1〜4 のテーマは meadow・coast・sky・volcano', () => {
  const { P7, P8, C } = load();
  assert.equal(P8.DEFAULT_TURN_LIMIT, 20);
  for (const ch of [1, 2, 3, 4]) assert.equal(P8.CHAPTER_RULES[ch].turnLimit, 20, `Chapter ${ch}`);
  assert.deepEqual([P7.DICE_MIN, P7.DICE_MAX], [1, 3]);
  const seen = new Set(); for (let i = 0; i < 300; i++) seen.add(P7.rollDice(() => i / 300));
  assert.deepEqual([...seen].sort(), [1, 2, 3]);
  assert.equal(P7.rollDice(() => 0.999999), 3);
  assert.deepEqual(C.CHAPTERS.map((c) => [c.no, c.theme]), [[1, 'meadow'], [2, 'coast'], [3, 'sky'], [4, 'volcano']]);
  // ボードのサイコロ：エンジンの Chapter は config の面の数（rules.diceSides）、旧ボード（Chapter 2〜4）は従来の 1〜3（MMP7.DICE_MAX）
  assert.match(rd('js/phase8/raising.js'), /const value = P7\.rollDie\(diceSides\(m\), rnd\)/, 'ボードのサイコロは MMP7.rollDie（面の数はドライバ／既定 1〜3）');
  const w = {}; for (const f of ['js/phase7/progression.js', 'js/phase8/league.js', 'js/phase8/raising.js']) new Function('window', rd(f))(w);
  assert.equal(w.MMP8.diceSides({ raise: { ch: 2 } }), 3, 'エンジンが担当しない Chapter は 1〜3');
  assert.deepEqual([0, 0.5, 0.999].map((x) => w.MMP7.rollDie(6, () => x)), [1, 4, 6]);
});

test('QA-C10：修行：5種類・15マス・能力上昇 +2〜3・丈夫さはCランククリアで解放・回数上限は progression.js の定義', () => {
  const { P7 } = load();
  assert.deepEqual([...P7.TRAIN_KINDS], ['po', 'in', 'hi', 'ev', 'de']);
  assert.equal(P7.TRAIN_LEN, 15);
  assert.equal(P7.trainSquare(15), 'g', '15マス目がゴール');
  assert.ok(Array.from({ length: 14 }, (_, i) => P7.trainSquare(i + 1)).every((x) => x !== 'g'), 'ゴールより前にゴールは無い');
  // TRAIN_GAIN はコード上「暫定値」のコメントつきだが、値は CLAUDE.md の +2〜3 と一致
  assert.deepEqual(JSON.parse(JSON.stringify(P7.TRAIN_GAIN)), { stat: [2, 3], life: [2, 3] });
  assert.equal(P7.TOUGH_UNLOCK_RANK, 2, 'C ランク');
  assert.deepEqual({ ...P7.TRAIN_MAX }, { po: 1, in: 1, hi: 1, ev: 1, de: 2 });
});

test('QA-C11：共通会話の文字送りは TYPE_MS＝32ms（npc.js の1か所で管理）', () => {
  const { N } = load();
  assert.equal(N.TYPE_MS, 32);
  const src = rd('js/npc/npc.js');
  assert.equal((src.match(/const TYPE_MS = 32;/g) || []).length, 1);
  assert.doesNotMatch(CODE, /typeMs\s*:/, 'index.html から文字送りの速さを上書きしない');
});

test('QA-C12：セーブは version 6・キー mr4v6（旧キー mr4 には書かない）。コード中の mr4v* はすべて mr4v6', () => {
  const { P8 } = load();
  assert.deepEqual([P8.SAVE_VERSION, P8.SAVE_KEY, P8.LEGACY_KEY], [6, 'mr4v6', 'mr4']);
  assert.equal(P8.newSave().v, 6);
  assert.match(fnBody(CODE, 'save'), /localStorage\.setItem\(MMP8\.SAVE_KEY,JSON\.stringify\(S\)\)/);
  const keys = [...NODATA.matchAll(/mr4v\d+/g), ...SCRIPTS.flatMap((f) => [...rd(f).matchAll(/mr4v\d+/g)])].map((m) => m[0]);
  assert.ok(keys.length >= 2); assert.deepEqual([...new Set(keys)], ['mr4v6']);
  assert.doesNotMatch(CODE, /setItem\(\s*["']mr4["']/, '本体は旧キー mr4 へ書かない');
  // v6 のセーブを書いて読み直すと、そのまま v6 で読める（移行扱いにならない）
  const s = {}; const st = { getItem: (k) => (k in s ? s[k] : null), setItem: (k, v) => { s[k] = String(v); } };
  st.setItem('mr4v6', JSON.stringify({ ...P8.newSave(), g: 4321 }));
  const r = P8.loadFromStorage(st);
  assert.deepEqual([r.S.v, r.S.g, 'mr4' in s], [6, 4321, false]);
});

test('QA-C13：市場カルーセル：切り替えは約0.3秒（P10_MS＝300）、左右の個体は約70%（1−0.3）', () => {
  assert.match(lineOf(HTML, 'const P10_MS='), /^const P10_MS=300;/);
  assert.match(lineOf(HTML, 'function p10Pose('), /sc=1-\.3\*k/);
});

test('QA-C14：フィナの登場は指定の3か所だけ（名前登録の直後・育成開始・育成完了）で、Chapterボードには置かない', () => {
  const calls = callSites(CODE, 'finaTalk').map((c) => `${c.fn}:${c.arg}`).sort();
  assert.deepEqual(calls, ['finaIntro:"intro"', 'p7Depart:first?"raiseFirst":"raiseAgain",{start:DAN_TALK.handoff}', 'p8DoneScr:"done"']);
  assert.deepEqual(callSites(CODE, 'finaIntro').map((c) => c.fn), ['p11NameGo'], 'あいさつは名前登録の確定からだけ');
  assert.deepEqual(callSites(CODE, 'MMNPC\\.talk').map((c) => c.fn).sort(), ['finaTalk', 'karenSay'], '共通会話を開くのは finaTalk と市場のカレン（karenSay）だけ');
  assert.deepEqual(callSites(CODE, 'karenTalk').map((c) => c.fn).sort(), ['adopt', 'karenIntro'], 'カレンの会話ウィンドウは市場の入店と購入成功だけ（切り替え・ボタンは案内欄の一言）');
  const ft = cut(CODE, 'const FINA_TALK={', '};');
  assert.deepEqual(Object.keys(new Function(`return ${ft.slice('const FINA_TALK='.length)}}`)()), ['intro', 'raiseFirst', 'raiseAgain', 'done']);
  const finaAt = [...CODE.matchAll(/npc:\s*"fina"/g)].map((m) => m.index), s0 = CODE.indexOf('const FINA_TALK={');
  const d0 = CODE.indexOf('const DAN_TALK={'), dh = cut(CODE, 'const DAN_TALK={', '\n farm:');
  assert.ok(finaAt.length === 5 && finaAt.filter((i) => i > s0 && i < s0 + ft.length).length === 4 && finaAt.filter((i) => i > d0 && i < d0 + dh.length).length === 1,
    'フィナのセリフは FINA_TALK と、フィナ ↔ ダンの掛け合い（DAN_TALK.handoff）の中だけ');
  // Chapterボードの描画（board・分岐・HUD・フィールド・地図）と、ボード用モジュールにNPCを置かない
  for (const fn of ['board', 'p9BranchHtml', 'p9BoardHud', 'p13Html', 'p9Art']) {
    assert.doesNotMatch(fnBody(CODE, fn), /MMNPC|finaTalk|finaIntro|FINA_TALK|npc:\s*"|フィナ|assets\/npc\//, fn);
  }
  for (const f of ['js/phase9/chapters.js', 'js/phase9/board-art.js', 'js/phase13/field.js']) assert.doesNotMatch(rd(f), /MMNPC|["']fina["']|フィナ|assets\/npc\//, f);
});
