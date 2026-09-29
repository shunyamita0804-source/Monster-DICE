// =========================================================
// Phase 11 テスト：正式名称・プレイヤー名・ステータス画面
//  既存193件とは別ファイル。
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
const line = (prefix) => HTML.split('\n').find((l) => l.startsWith(prefix));
const between = (a, b) => { const i = HTML.indexOf(a), k = HTML.indexOf(b, i + a.length); if (i < 0 || k < 0) throw new Error('抽出失敗: ' + a); return HTML.slice(i, k); };

// ---------------------------------------------------------
// Step 1：正式名称
// ---------------------------------------------------------
test('N1-1：プレイヤーから見える文字のゲーム名は正式名称「ミスティックモンスターズ」', () => {
  assert.match(HTML, /<title>ミスティックモンスターズ<\/title>/);
  assert.match(HTML, /<h1>ミスティックモンスターズ<\/h1>/);
  assert.match(HTML, /nv\.share\(\{title:"ミスティックモンスターズ セーブコード"/);
  const visible = HTML.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(visible, /(?<!正式)モンスターマスター|Monster Master|MONSTER MASTER|Monster-DICE|ミスティックモンスター(?!ズ)|Mystic Monster(?!s)/, '画面の文字として旧名称が残っていない（「正式モンスターマスター」はデータ表の意味で別物）');
});

test('N1-2：互換性・保護のため旧名称を残す箇所（保護対象・セーブキー）は変えていない', () => {
  assert.match(rd('js/battle-bridge.js'), /モンスターマスターのバトルチェックポイントではありません/, 'Phase 6保護対象（battle-bridge.js）は無変更');
  assert.match(rd('js/systems/battle/checkpoint.js'), /モンスターマスターのバトルチェックポイントではありません/, 'Battle Engine は無変更');
  assert.match(rd('legacy/index.original.html'), /<title>モンスターマスター<\/title>/, 'legacy は無変更');
  assert.match(HTML, /const SAVE_KEY|MMP8\.SAVE_KEY/); assert.match(rd('js/phase8/raising.js'), /const SAVE_KEY = 'mr4v6';/, 'セーブキーは変えない');
});

// ---------------------------------------------------------
// Step 2：プレイヤー名
// ---------------------------------------------------------
const SRC = { p7: rd('js/phase7/progression.js'), lg: rd('js/phase8/league.js'), p8: rd('js/phase8/raising.js'), mo: rd('js/phase10/monsters.js'), pl: rd('js/phase11/player.js') };
function load() { const w = {}; for (const k of ['p7', 'lg', 'p8', 'mo', 'pl']) new Function('window', SRC[k])(w); return { P7: w.MMP7, P8: w.MMP8, M: w.MMP10M, PL: w.MMP11P }; }
const j = (o) => JSON.parse(JSON.stringify(o));
function store(init = {}) { const s = { ...init }; return { s, getItem: (k) => (k in s ? s[k] : null), setItem: (k, v) => { s[k] = String(v); } }; }
function mon(P7, over = {}) { const m = { sp: 0, name: 'テスト', age: 0, span: 30, h: 0, rk: 0, fa: 0, st: 0, last: null, li: 100, po: 100, in: 100, hi: 100, ev: 100, de: 100, sk: [0, 1, 2, 3], eq: [0, 1, 2, 3, -1, -1], ...over }; P7.ensureProg(m); return m; }

test('N2-1：名前の整え方：空欄・空白だけは「アルト」、日本語・絵文字もOK、8文字まで、制御文字は除く', () => {
  const { PL } = load();
  assert.equal(PL.DEFAULT_NAME, 'アルト'); assert.equal(PL.MAX_LEN, 8);
  assert.equal(PL.sanitize(''), 'アルト'); assert.equal(PL.sanitize('   '), 'アルト'); assert.equal(PL.sanitize(undefined), 'アルト');
  assert.equal(PL.sanitize(' ハルカ '), 'ハルカ'); assert.equal(PL.sanitize('あいうえおかきくけこ'), 'あいうえおかきく');
  assert.equal(PL.sanitize('🐉ドラゴン使いのリク'), '🐉ドラゴン使いの', '絵文字も1文字'); assert.equal(PL.sanitize('ア\nル\tト'), 'アルト');
});

test('N2-2：新規ゲームは「アルト」で始まり、最初に名前を決める。決めた名前は保存・読み込み後も維持（v6のまま）', () => {
  const { P8, PL } = load();
  const S = P8.newSave();
  assert.deepEqual([S.v, S.playerName, S.playerNamePending], [6, 'アルト', true]);
  assert.equal(PL.confirmName(S, 'ミナト'), 'ミナト'); assert.ok(!('playerNamePending' in S));
  const st = store({ mr4v6: JSON.stringify(S) }); const r = P8.loadFromStorage(st);
  assert.deepEqual([r.S.v, r.S.playerName, 'playerNamePending' in r.S], [6, 'ミナト', false]);
  const T = P8.newSave(); PL.confirmName(T, ''); assert.equal(T.playerName, 'アルト', '空欄で決めても進める（アルト）');
  const U = P8.newSave(); const u = P8.loadFromStorage(store({ mr4v6: JSON.stringify(U) })).S;
  assert.equal(u.playerNamePending, true, '名前を決める前に閉じた新規ゲームは、次回も名前を決める画面から');
});

test('N2-3：名前が無い旧v6セーブは読み込み時に「アルト」を補う（名前入力は出さない・ほかのデータは不変）', () => {
  const { P7, P8 } = load();
  const S = P8.newSave(); delete S.playerName; delete S.playerNamePending;
  S.g = 777; S.trainTix = 2; S.m = P8.initIndividual(S, mon(P7, { sp: 1, po: 321 })); Object.assign(S.m.raise, { state: 'board', ch: 1, node: 'a3', turnsUsed: 5, turnLimit: 20 });
  const old = j(S); const r = P8.loadFromStorage(store({ mr4v6: JSON.stringify(old) }));
  assert.deepEqual([r.status, r.S.v, r.S.playerName, 'playerNamePending' in r.S], ['ok', 6, 'アルト', false]);
  const T = j(r.S); delete T.playerName; assert.deepEqual(T, old, 'プレイヤー名以外は変えない');
  const named = P8.loadFromStorage(store({ mr4v6: JSON.stringify({ ...old, playerName: 'ソウタ' }) })).S;
  assert.equal(named.playerName, 'ソウタ', '既に名前があれば変えない');
  const v5 = P7.newSave(); v5.m = mon(P7); const m5 = P8.loadFromStorage(store({ mr4: JSON.stringify(v5) })).S;
  assert.deepEqual([m5.v, m5.playerName, 'playerNamePending' in m5], [6, 'アルト', false], '旧v5からの移行も同じ');
});

test('N2-4：画面：新規ゲームは街の前に名前入力（初期値アルト・8文字まで）。市場右上は実際のプレイヤー名（安全に表示）', () => {
  assert.match(line('function lobby(msg,open){'), /^function lobby\(msg,open\)\{if\(p8Blocked\(\)\)return;if\(S\.playerNamePending\)return p11NameScr\(msg\);/);
  const scr = between('function p11NameScr(msg){', '\nfunction p11NameGo(');
  assert.match(scr, /id="p11nm"/); assert.match(scr, /value="\$\{p11Esc\(S\.playerName\|\|d\)\}"/); assert.match(scr, /空欄のままなら「\$\{d\}」ではじまります/); assert.match(scr, /!event\.isComposing/, '日本語変換中のEnterでは確定しない');
  assert.match(line('function p11NameGo(){'), /MMP11P\.confirmName\(S,e\?e\.value:""\);save\(\);lobby\(/);
  assert.match(line('function p10Who(){'), /p11Esc\(S\.playerName\|\|MMP11P\.DEFAULT_NAME\)/);
  const esc = new Function(`${line('function p11Esc(t){')}\nreturn p11Esc;`)();
  assert.equal(esc('<b>"ア&ル\'ト"</b>'), '&lt;b&gt;&quot;ア&amp;ル&#39;ト&quot;&lt;/b&gt;');
  assert.ok(HTML.indexOf('js/phase11/player.js') > HTML.indexOf('js/phase8/raising.js'));
});

// ---------------------------------------------------------
// Step 3：ステータス画面（正式情報・素早さ）
// ---------------------------------------------------------
test('N3-1：ステータス画面は正式モンスターマスターから種族名・英字名・種類を表示（別ファイルに重複定義しない）', () => {
  const st = between('if(id=="st"){', '\n else if(id=="b")');
  assert.match(st, /sp0=MMP10M\.byId\(m\.sp\)/); assert.match(st, /\$\{p11SpLine\(m\)\}/); assert.match(st, /<span class="dtg">\$\{sp0\.kind\}<\/span>/);
  assert.match(line('function p11SpLine(m){'), /MMP10M\.byId\(m\.sp\)/); assert.match(line('function p11SpLine(m){'), /s\.en\?/, '英字名が未確定（ジオル）なら出さない');
  assert.doesNotMatch(st, /寿命|疲労|ストレス|年齢/, '旧仕様の項目は表示しない');
  for (const k of ['ライフ', 'ちから', 'かしこさ', '命中', '回避', '丈夫さ']) assert.ok(rd('js/phase10/monsters.js').includes(k));
  assert.ok(!existsSync(path.join(ROOT, 'js/phase11/monsters.js')), '正式情報を別ファイルへ二重定義していない');
});

test('N3-2：素早さは個体の値（1〜10）を10段階の目盛りで表示し、0〜999のゲージとは別扱い', () => {
  const { P7, P8, M } = load();
  const fn = new Function('MMP10M', `${line('function p11Speed(m){')}\n${HTML.split('\n')[HTML.split('\n').findIndex((l) => l.startsWith('function p11Speed(m){')) + 1]}\nreturn p11Speed;`)(M);
  const S = P8.newSave();
  for (const [sp, v] of [[0, 5], [1, 7], [2, 2], [3, 1]]) {
    const html = fn(P8.initIndividual(S, mon(P7, { sp })));
    assert.equal((html.match(/<i class="on"><\/i>/g) || []).length, v, `種族${sp}：${v}目盛り`);
    assert.equal((html.match(/<i class=/g) || []).length, 10); assert.match(html, new RegExp(`<b>${v}<small> / 10</small></b>`));
    assert.doesNotMatch(html, /999|eg"/, '能力ゲージ（/999）を使わない');
    assert.match(html, /数値が大きいほど速い（10が最速）/);
  }
  assert.match(fn({ sp: 1, speed: 9 }), /<b>9<small>/, '個体に保存された素早さを表示');
  assert.match(between('if(id=="st"){', '\n else if(id=="b")'), /\$\{p11Speed\(m\)\}/);
});

// ---------------------------------------------------------
// Phase 11.5 Step 1：正式フォント（本文＝Noto Sans JP／見出し＝Shippori Mincho）
// ---------------------------------------------------------
test('F1-1：既存のGoogle Fontsの読み込み1行を正式フォント2種へ差し替え（読み込み先は増やさない・同梱や@importなし）', () => {
  const links = HTML.match(/<link[^>]*fonts\.(googleapis|gstatic)[^>]*>/g);
  assert.deepEqual(links, ['<link rel="preconnect" href="https://fonts.googleapis.com">',
    '<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700;800;900&family=Shippori+Mincho:wght@600;700;800&display=swap" rel="stylesheet">']);
  assert.doesNotMatch(HTML, /M\+PLUS|M PLUS Rounded/); assert.doesNotMatch(HTML, /@font-face|@import/);
  assert.equal((HTML.match(/https?:\/\/[^"')\s]*font[^"')\s]*/g) || []).filter((u) => !u.startsWith('https://fonts.googleapis.com')).length, 0, 'ほかのフォント配信元を追加しない');
});

test('F1-2：本文・見出しは共通の変数で指定し、読み込めない時は端末の日本語フォントへ（fallback）', () => {
  assert.match(HTML, /:root\{--mm-font-body:"Noto Sans JP",[^;]*sans-serif;--mm-font-head:"Shippori Mincho",[^}]*serif\}/);
  assert.match(HTML, /\nbody\{font-family:var\(--mm-font-body\);/);
  const head = HTML.match(/\n(h1,h2,h3,[^{]+)\{font-family:var\(--mm-font-head\)\}/)[1];
  for (const sel of ['h1', '.dh', '.dtitle b', '.p9th .p9ttl b', '.p9plq .nm', '.p10ttl b', '.p11t']) assert.ok(head.split(',').includes(sel), sel);
  for (const sel of ['.p9plq .no', '.p9rk b', '.p9rank .p9em', '.p9next .p9vsl', '.vsx']) assert.match(HTML, new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{[^}]*font-family:var\\(--mm-font-head\\)'), sel);
  assert.match(HTML, /\.p9lose \.plc\{font-family:var\(--mm-font-body\)/, '順位の数字は本文フォント'); assert.match(HTML, /\.upn\{font:900 3\.4rem\/1 var\(--mm-font-body\)/, '能力上昇の数字は本文フォント');
  assert.equal((HTML.match(/font-family:(Georgia|"M PLUS)/g) || []).length, 0, 'font-family での Georgia／旧フォント指定は残っていない（残りは font 短縮指定の7か所＝F1-3）');
});

test('F1-3：Phase 6保護対象内（.bt）とバトル開始演出のGeorgiaは今回変更しない（バトル専用Phaseへ持ち越し）', () => {
  const g = (HTML.match(/\n[^\n{]*\{[^}]*Georgia[^}]*\}/g) || []).map((r) => r.trim().split('{')[0]);
  assert.deepEqual(g, ['.bt button.go', '.bt .tpl b', '.bt button.go .gtx', '.bt .dmg', '.bt button.go .gtx', '.rkl', '.ivs b']);
});

// ---------------------------------------------------------
// Phase 11.5 Step 2：街のプレイヤー名（市場と同じ playerName を参照）
// ---------------------------------------------------------
test('F2-1：街の「ブリーダー」欄はプレイヤー名を表示（新しい名前管理は作らず playerName を参照・ランク等は維持）', () => {
  // 街の再調整（2026-09-29）：街の上部のプレイヤー情報は撤去し、プレイヤー名・ランク・所持金はプロフィール（profileScr）に出す。下の欄（bprof）には出さない
  const bp = HTML.match(/const bprof=\(\)=>`[^\n]*/)[0].split('`;')[0];   // 画面に出す部分（後ろのコメントは除く）
  const top = HTML.split('\n').find((l) => l.startsWith('function profileScr(')) + HTML.split('\n').find((l) => l.startsWith('const PROFILE_ROWS='));
  assert.match(top, /<b class="p115pn">\$\{p11Esc\(S\.playerName\|\|MMP11P\.DEFAULT_NAME\)\}<\/b>/);
  assert.match(top, /\["最高到達ランク",\(\)=>\(S\.br\?\?-1\)>=0\?RN\[S\.br\]:"ー"\]/, 'ランク表示は維持（プロフィール）');
  assert.doesNotMatch(HTML, /function townTop\(|class="tplate tttl"|class="tplate tpinfo"/, '街の上部の「街」の札・プレイヤー情報は撤去');
  assert.doesNotMatch(bp, /p115pn|playerName|ランク|S\.g\b/, '下の欄に名前・ランク・所持金を重ねて出さない');
  assert.doesNotMatch(top + bp, /🧑‍🌾 ブリーダー/);
  const refs = HTML.split('\n').filter((l) => /S\.playerName(?!Pending)/.test(l));
  assert.equal(refs.length, 3, 'プレイヤー名の参照は3か所だけ（別の名前を持たない）');
  assert.equal(refs.filter((l) => l.includes('id="p11nm"') || l.includes('for="p11nm"')).length, 1, '名前入力'); assert.equal(refs.filter((l) => l.startsWith('function p10Who(){')).length, 1, '市場'); assert.equal(refs.filter((l) => l.startsWith('function profileScr(')).length, 1, 'プロフィール（プレイヤー情報）');
});

// ---------------------------------------------------------
// Phase 11.5 Step 3：古いバージョン表記の削除
// ---------------------------------------------------------
test('F3-1：タイトル画面から「ver p8-raising」を削除（新しい番号は作らない）', () => {
  const t = HTML.slice(HTML.indexOf('function title(){'), HTML.indexOf('\nfunction togh('));   // 開始画面の関数全体（複数行）
  assert.doesNotMatch(t, /ver \$\{VER\}|p8-raising/); assert.match(t, /"つづきからはじめます":"はじめてのプレイです"\}<\/small><\/p>/);
  assert.doesNotMatch(HTML.replace(/const VER="p8-raising"/, ''), /ver \$\{VER\}|>ver |バージョン\s*\d/, 'プレイヤー向けの画面に版の表記を出さない');
});
