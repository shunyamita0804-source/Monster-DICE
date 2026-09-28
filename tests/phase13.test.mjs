// =========================================================
// Chapterボード 新表示方式（試作・Chapter 1「はじまりの草原」）のテスト
//  内部はノード式のまま（出目・1地点ずつの移動・分岐・停止地点の効果・セーブは既存ロジック）で、表示だけを変える。
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
const between = (a, b) => { const i = HTML.indexOf(a), k = HTML.indexOf(b, i + a.length); if (i < 0 || k < 0) throw new Error('抽出失敗: ' + a); return HTML.slice(i, k); };
function load() { const w = {}; for (const f of ['js/phase7/progression.js', 'js/phase8/league.js', 'js/phase8/raising.js', 'js/phase9/chapters.js', 'js/phase13/field.js']) new Function('window', rd(f))(w); return { P8: w.MMP8, C: w.MMP9C, F: w.MMP13F }; }

test('B1-1：Chapter 1の40ノードすべてをフィールド上に配置（位置は表示用データのみ）。区間は既存のつながりと一致', () => {
  const { C, F } = load(); const t = C.byNo(1).track, L = F.layout(1, t);
  assert.equal(Object.keys(t.nodes).length, 40); assert.deepEqual(Object.keys(L.pos).sort(), Object.keys(t.nodes).sort());
  const edges = new Set(); for (const [a, bs] of Object.entries(t.conn)) for (const b of bs) edges.add(`${a}>${b}`);
  assert.deepEqual(new Set(L.segs.map((s) => `${s.a}>${s.b}`)), edges, '表示上の並びはロジックのつながりと同じ');
  for (const [id, p] of Object.entries(L.pos)) { assert.ok(p.x > 0 && p.x < 1536 && p.y > 0 && p.y < 1024, id); assert.ok(p.d >= 0.34 && p.d <= 1, id); }
  assert.ok(L.pos.S.y > L.pos.J1.y && L.pos.J1.y > L.pos.J3.y && L.pos.J3.y > L.pos.J5.y && L.pos.J5.y > L.pos.G.y, '画面下（手前）から上（奥）へ進む');
  assert.ok(L.pos.S.d > L.pos.G.d, 'スタートは手前（大きく）、大会の門は奥');
  assert.ok(F.zoomAt(1, L.pos.G.d) > F.zoomAt(1, L.pos.S.d) && F.zoomAt(1, L.pos.G.d) <= 1.45, '奥へ進むほど少しだけ寄る（仮背景が荒れない範囲）');
  assert.equal(F.get(1).provisional, true, '背景は仮素材');
});

test('B1-2：試作は Chapter 1 の1マップだけ。ほかのChapterは従来の地図表示', () => {
  const { C, F } = load();
  assert.deepEqual(Object.keys(F.FIELDS), ['1']); for (const no of [2, 3, 4]) { assert.equal(F.has(no), false); assert.equal(F.layout(no, C.byNo(no).track), null); }
  const b = between('function board(msg){', '\nfunction bPositionMon(');
  assert.match(b, /const fld=p13Html\(m\);/); assert.match(b, /\$\{fld\|\|`<div class="p9mapw" id="p9mapw" onclick="p9Tap\(event\)">\$\{p9Art\(r\.ch\)\}/);
  assert.ok(existsSync(path.join(ROOT, 'assets/fields/ch1_meadow.jpg'))); assert.equal(F.get(1).image.src, './assets/fields/ch1_meadow.jpg');
  assert.match(rd('assets/fields/README.md'), /8AB6F8B0-ED04-439F-93E8-AD9DB69D1F56/);
});

test('B1-3：表示だけの変更（出目・移動・分岐・停止地点の効果・セーブの処理は既存のまま、表示部品からは呼ばない）', () => {
  const p13 = between('// ---- Chapterボード 新表示方式（試作', '// ---- Phase 12：正式サイコロの演出').replace(/\/\/[^\n]*/g, '');   // 説明コメントは除いて判定
  assert.doesNotMatch(p13, /MMP8\.(roll|step|chooseBranch|resolveLanding|beginBattle)|save\(\)|Math\.random/, '表示部品の中で進行を動かさない');
  assert.match(between('async function p8Continue(', '\nfunction bPickBranch('), /const s=MMP8\.step\(S,m\);save\(\);if\(s\.node\)\{const nd=bNode\(s\.node\);if\(nd\)bPositionMon\(nd\);await sleep\(\$\("#p13fd"\)\?P13_STEP:260\)\}/, '1地点ずつ移動（見せ時間だけ新表示で長め）');
  const br = between('async function bRoll(){', '\nasync function p8Continue(');
  assert.ok(br.indexOf('MMP8.roll(S,m);save();') < br.indexOf('p12Dice.play("std",r.value)') && br.indexOf('p12Dice.play') < br.indexOf('p8Continue()'), 'サイコロ：出目決定・保存 → 演出 → 移動（演出は差し替え可能なまま）');
  assert.doesNotMatch(HTML, /p12Dice\.play\("branch"/, '分岐用1〜6サイコロは使い始めない');
  assert.match(HTML, /function bPositionMon\(n,instant\)\{if\(\$\("#p13fd"\)&&p13Place\(n,instant\)\)return;/); assert.match(HTML, /function p9Cam\(instant\)\{if\(\$\("#p13fd"\)\)return;/);
});

test('B1-4：停止地点は大きな丸マスではなく地形になじむ目印。能力地点は正式カラー（ライフ黄・ちから赤橙・かしこさ緑・命中ピンク・回避水色・丈夫さ紫）', () => {
  const p13 = between('// ---- Chapterボード 新表示方式（試作', '// ---- Phase 12：正式サイコロの演出');
  const col = JSON.parse(p13.match(/const P13C=(\{[^}]+\})/)[1].replace(/(\w+):/g, '"$1":'));
  assert.deepEqual(Object.keys(col), ['life', 'power', 'wisdom', 'hit', 'evasion', 'toughness']);
  for (const [t, words] of [['event', '石碑'], ['treasure', '宝箱'], ['battle', '練習試合の立て札'], ['ticket', '祠'], ['tournament', '門']]) assert.match(p13, new RegExp(`if\\(t=="${t}"\\)`), `${t}（${words}）`);
  assert.match(p13, /練習試合の立て札（既存の「練習試合」マス）/, 'バトル地点は既存の練習試合マス（ノラモン戦へ読み替えない）');
  assert.doesNotMatch(p13, /<circle[^>]*r="(2\d|[3-9]\d)"/, '大きな丸を描かない');
  assert.match(p13, /statpick/, '能力選択イベントは表示の枠組みだけ用意（配置はしない）');
  const { C } = load(); for (const no of [1, 2, 3, 4]) assert.ok(!Object.values(C.byNo(no).track.nodes).some((n) => n.type === 'statpick'));
  assert.match(HTML, /\.p13tok\.walk \.mon\{animation:p13bob/, '歩行は正式素材が無いため移動の補間＋上下の揺れの仮表示');
});

// ---------------------------------------------------------
// Chapter 1-A「大橋と清流の草原」：正式地理（分岐3か所）・進行・保存
// ---------------------------------------------------------
const j = (o) => JSON.parse(JSON.stringify(o));
function mon(w) { const m = { sp: 0, name: 'テスト', age: 0, span: 30, h: 0, rk: 0, fa: 0, st: 0, last: null, li: 100, po: 100, in: 100, hi: 100, ev: 100, de: 100, sk: [0, 1, 2, 3], eq: [0, 1, 2, 3, -1, -1] }; w.MMP7.ensureProg(m); return m; }
function fresh() { const w = {}; for (const f of ['js/phase7/progression.js', 'js/phase8/league.js', 'js/phase8/raising.js', 'js/phase9/chapters.js']) new Function('window', rd(f))(w); for (const c of w.MMP9C.CHAPTERS) w.MMP7.registerChapterBoard(c.no, c.track, { provisional: false }); const S = w.MMP8.newSave(); S.m = w.MMP8.initIndividual(S, mon(w)); w.MMP8.depart(S, S.m); return { w, P8: w.MMP8, S }; }
const dice = (v) => () => ({ 1: 0.05, 2: 0.5, 3: 0.95 })[v];

test('A1-1：正式地理の順番（旅立ちの草原→第一分岐→清流地帯→第二分岐→森の入口→第三分岐→大会前の高原→門）。3か所で分岐し、すべて再合流', () => {
  const { C } = load(); const t = C.byNo(1).track;
  const forks = Object.entries(t.conn).filter(([, o]) => o.length > 1).map(([id, o]) => [id, o.map((x) => { const l = t.lanes[t.nodes[x].lane]; return [l.label, l.kind, l.to]; })]);
  assert.deepEqual(forks, [
    ['J1', [['草原の本道', 'main', 'J2'], ['花畑の遠回り', 'detour', 'J2']]],
    ['J3', [['石造りの大橋', 'main', 'J4'], ['川沿いの迂回路', 'detour', 'J4']]],
    ['J5', [['木漏れ日の林道', 'main', 'J6'], ['見晴らしの岩丘', 'short', 'J6']]],
  ]);
  const seq = (from) => { const l = Object.values(t.lanes).find((x) => x.from === from); return [l.label, l.to]; };
  assert.deepEqual([seq('S'), seq('J2'), seq('J4'), seq('J6')], [['旅立ちの草原', 'J1'], ['清流地帯', 'J3'], ['森の入口', 'J5'], ['大会前の高原', 'G']]);
  const cnt = {}; for (const n of Object.values(t.nodes)) cnt[n.type] = (cnt[n.type] || 0) + 1;
  assert.deepEqual(cnt, { start: 1, normal: 9, life: 4, treasure: 3, event: 4, tournament: 1, power: 4, wisdom: 4, hit: 2, evasion: 2, toughness: 2, battle: 2, ticket: 2 }, 'マスの種類ごとの数は旧Chapter 1と同じ（効果の新設・削除なし）');
  assert.ok(!Object.values(t.nodes).some((n) => ['statpick', 'rare'].includes(n.type)), '能力選択イベント・レアルートは配置しない');
  const old = ['A', 'B', 'C', 'D', ...'abcdefg'.split('').flatMap((l) => [1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => l + i))];
  assert.deepEqual(Object.keys(t.nodes).filter((id) => old.includes(id)), [], '旧Chapter 1のノードIDと重ならない（旧セーブが別の場所から続かない）');
});

test('A1-2：出目の数だけ1地点ずつ進み、通過地点は効果なし・停止地点の効果は1回だけ', () => {
  const { P8, S } = fresh(); const m = S.m, t = P8.boardOf(m);
  P8.roll(S, m, dice(3)); assert.equal(m.raise.pend.roll, 3);
  const before = { li: m.li, po: m.po, in: m.in }, path = [];
  while (m.raise.pend && m.raise.pend.stage === 'move') { const s = P8.step(S, m); path.push(s.node); }
  assert.deepEqual(path, ['p1', 'p2', 'p3'], '瞬間移動せず順番に');
  assert.deepEqual([t.nodes.p1.type, t.nodes.p2.type, t.nodes.p3.type], ['life', 'power', 'normal']);
  assert.deepEqual({ li: m.li, po: m.po, in: m.in }, before, '通過したライフ・ちからの地点は効果なし');
  assert.equal(m.raise.pend.stage, 'resolve'); P8.resolveLanding(S, m, () => 0.5); assert.equal(m.raise.pend, null);
  assert.deepEqual({ li: m.li, po: m.po, in: m.in }, before, '停止地点（通常）は何も起きない');
  P8.roll(S, m, dice(1)); P8.step(S, m); assert.equal(m.raise.node, 'p4'); const w0 = m.in;
  P8.resolveLanding(S, m, () => 0.5); const w1 = m.in; assert.ok(w1 > w0, '停止したかしこさ地点の効果');
  assert.deepEqual(P8.resolveLanding(S, m, () => 0.5), { ok: false }); assert.equal(m.in, w1, 'もう一度呼んでも二重には適用されない');
  assert.equal(m.raise.turnLimit, 20); assert.equal(m.raise.turnsUsed, 2);
});

test('A1-3：移動中・分岐待ち・停止地点処理待ちで保存→再開しても同じ状態（振り直し・二重適用なし）。セーブはv6・ターン上限20', () => {
  const { P8, S } = fresh(); const m = S.m;
  P8.roll(S, m, dice(3)); P8.step(S, m);                              // 移動中
  let T = P8.migrateSave(j(S)); P8.ensureBoardPosition(T, T.m);
  assert.deepEqual(T.m.raise, m.raise, '移動中のまま（出目・残り・ターン同じ）'); assert.equal(T.v, 6);
  while (T.m.raise.pend && T.m.raise.pend.stage === 'move') P8.step(T, T.m); P8.resolveLanding(T, T.m, () => 0.5);
  P8.roll(T, T.m, dice(3)); while (T.m.raise.pend && T.m.raise.pend.stage === 'move') P8.step(T, T.m);   // p3→p4→J1、残り1で分かれ道の選択待ち
  assert.deepEqual(T.m.raise.pend, { roll: 3, left: 1, stage: 'branch', opts: ['q1', 'r1'] });
  const saved = j(T.m.raise); const U = P8.migrateSave(j(T)); P8.ensureBoardPosition(U, U.m);
  assert.deepEqual(U.m.raise, saved, '分岐待ちのまま');
  P8.chooseBranch(U, U.m, 'r1'); P8.step(U, U.m); assert.equal(U.m.raise.node, 'r1', '選んだ花畑の遠回りへ残り1地点');
  const snap = { li: U.m.li, stage: U.m.raise.pend.stage };
  const V = P8.migrateSave(j(U)); P8.ensureBoardPosition(V, V.m);
  assert.deepEqual([V.m.raise.pend.stage, V.m.li], ['resolve', snap.li], '停止地点処理待ちのまま（効果はまだ）');
  P8.resolveLanding(V, V.m, () => 0.5); assert.equal(V.m.raise.pend, null);
  const X = P8.migrateSave(j(V)); P8.ensureBoardPosition(X, X.m); assert.equal(X.m.raise.pend, null, '再開しても二重に処理しない');
  assert.equal(X.m.raise.turnLimit, 20); assert.equal(X.v, 6);
});

test('A1-4：旧Chapter 1の途中（旧ノードID）で保存されたv6セーブは、同じChapterの開始地点・0ターンから（別の場所から続かない）／大会中は大会を続ける', () => {
  const { P8, S } = fresh(); const m = S.m;
  Object.assign(m.raise, { node: 'c3', turnsUsed: 7, pend: { roll: 3, left: 2, stage: 'branch', opts: ['b1', 'c1'] } });
  const T = P8.migrateSave(j(S)); const fx = P8.ensureBoardPosition(T, T.m);
  assert.deepEqual([fx.changed, T.m.raise.node, T.m.raise.turnsUsed, T.m.raise.pend, T.m.raise.ch, T.v], [true, 'S', 0, null, 1, 6]);
  const L = fresh(); Object.assign(L.S.m.raise, { node: 'G', goal: true, tour: { rank: 0 } });
  const U = L.P8.migrateSave(j(L.S)); L.P8.ensureBoardPosition(U, U.m); assert.equal(U.m.raise.node, 'G', 'ゴール（大会中）はそのまま');
});

test('A1-5：画面にはノード同士をつなぐ線・番号を出さない。分かれ道は選べるルートの目印だけを強調', () => {
  const p13 = between('// ---- Chapterボード 新表示方式（試作', '// ---- Phase 12：正式サイコロの演出');
  assert.doesNotMatch(p13, /<path class="p13sg"|<svg class="p13tr"|<line|stroke-dasharray/, '道筋の線を描かない');
  assert.doesNotMatch(p13, /\$\{i\+1\}|data-no=|>\$\{idx\}</, '番号を表示しない');
  assert.match(p13, /function p13Mark\(ph,opts\)\{if\(!P13\|\|ph!="branch"\|\|!opts\)return;/); assert.match(p13, /classList\.add\("optln"\)/);
  assert.doesNotMatch(HTML, /\.p13sg\{|\.p13tr\{/, '線のスタイルも残さない');
});

// ---------------------------------------------------------
// 試遊で見つかった4点の修正（開始画面・市場・Chapter 1の目印・ファームのコマンド）
// ---------------------------------------------------------
test('P15-1：開始画面は旧画像（TITLEIMG）を使わず、正式名称（ミスティックモンスターズ／Mystic Monsters）と開始ボタンを背景と分けたHTMLで表示', () => {
  const t = between('function title(){', '\nfunction togh(');
  assert.doesNotMatch(t, /TITLEIMG|モンスターマスター|MONSTER MASTER/i, '旧画像・旧名称を使わない');
  // デザイン改修1で、正式開始画面画像（タイトル・開始ボタンの絵を含む）に置き換え。HTMLのタイトル文字は重ねない（詳細は title-design.test.mjs）
  assert.doesNotMatch(t, /p15logo|FARM_INTERVAL/, 'HTMLのタイトル文字・仮背景は使わない');
  assert.match(t, /<button class="p15start" data-nsfx="1" onclick="startGame\(this\)">タップしてはじめる<\/button>/, '開始ボタンは画像ではなくボタン（画像のボタン位置に重ねる）');
  assert.match(HTML, /const TITLEIMG="data:image/, '旧画像のデータ自体は削除しない（開始画面から外すだけ）');
  assert.match(rd('js/phase8/raising.js'), /const SAVE_KEY = 'mr4v6';/, 'セーブのキーは変えない');
});

test('P15-2：市場は背景候補（台座付き）を使い、CSSの台座を重ねない。中央と左右（約70%）の足元を台座に合わせる。価格・購入条件などは変えない', () => {
  const mk = between('function market(msg,focus){', '\nfunction mkd(');
  assert.match(mk, /const MB=window\.MMP12S&&MMP12S\.MARKET_BG;/); assert.match(mk, /<div class="p15mkbg" style="background-image:url\(\$\{MB\.src\}\)"><\/div>`:P10_SCENE/, '背景候補が無ければ従来の描画背景');
  assert.match(mk, /\$\{MB\?"":`<div class="p10sign">/, '背景の看板と描いた看板を二重にしない');
  assert.match(HTML, /\.p15img \.p10ped\{display:none\}/, '背景の台座とCSSの台座を二重にしない');
  assert.match(mk, /1-\.3\*k/, '左右は中央の約70%'); assert.match(mk, /dx=P15MK\?P15MK\.dx:\.73\*w,dy=P15MK\?P15MK\.dy:0;/, '左右は奥の台座の位置へ（市場カルーセル改修後）');
  assert.match(mk, /MMP10M\.canPurchase\(S,c\.key,owned\)/, '購入条件は従来の判定のまま');
  const { SC } = (() => { const w = {}; new Function('window', rd('js/phase12/scenes.js'))(w); return { SC: w.MMP12S }; })();
  assert.deepEqual(SC.MARKET_BG.pedestals, { center: [482, 1100], left: [200, 960], right: [748, 960] });
});

test('P15-3：Chapter 1の目印は輪を使わず小さな地面の紋章・魔法石。タップ判定は見た目と別の透明な層。遠景でもモンスターが小さくなりすぎない', () => {
  const p13 = between('// ---- Chapterボード 新表示方式（試作', '// ---- Phase 12：正式サイコロの演出');
  const ability = p13.slice(p13.indexOf('if(P13C[t])'), p13.indexOf('if(t=="event")'));
  assert.doesNotMatch(ability, /<ellipse[^>]*fill="none"/, '能力地点に輪（リング）を描かない');
  assert.match(p13, /<i class="p13hit"><\/i><\/div>/); assert.match(HTML, /\.p13n svg\{pointer-events:none\}/);
  const { F } = load(); assert.ok(F.depth(1, 100) >= 0.46 && F.get(1).monSize === 160, '奥でも手前の約半分以上');
  const { C } = load(); assert.equal(Object.keys(C.byNo(1).track.nodes).length, 40, 'ノード数・構造は変えない');
});

test('P15-4：育成開始前のファームのタブも枠のあるボタン（ボード・修行・ステータス・技管理）。表示名だけの変更で遷移先は同じ', () => {
  const h = between('function _hall(tab,msg){', '\nfunction after(');
  assert.match(h, /\[\["t","🎲","ボード"\],\["s","🥋","修行"\],\["st","📊","ステータス"\],\["w","⚔️","技管理"\]\]/);
  assert.match(h, /onclick="hall\('\$\{id\}'\)"><span class="p15ic">/);
});
