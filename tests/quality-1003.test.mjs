// =========================================================
// 2026-10-03 品質向上（アプリ品質への全面クオリティアップ）
//  QU-01 プロローグ A〜E（js/prologue/prologue.js）／QU-02 街の札・聖獣士管理局・アイテム屋／QU-03 立ち絵つきの一言（フィナ・ヴァルガス・ニック・エリオット）とフィナの全身
//  QU-04 研究所・アイテム屋・牧場の画面／QU-05 対戦前の画面を1つに・バトルの UI（Phase 6 に触れない）／QU-06 はじめから → タイトル／QU-07 正式名称「聖獣士」
// =========================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const HTML = rd('index.html');
const fnOf = (name) => { const i = HTML.indexOf(`function ${name}(`); return HTML.slice(i, HTML.indexOf('\nfunction ', i + 10)); };
function loadPro() { const w = { matchMedia: () => ({ matches: false }) }; new Function('window', rd('js/prologue/prologue.js'))(w); return w.MMPRO; }

test('QU-01：プロローグは A〜E の5枚（F は無い）。文字は画像に焼き込まず HTML の層。役割（A＝世界と百年前・B＝五年前の三人のレジェンドと聖獣の共闘・C＝現在・D＝ミストリアへ・E＝到着）。新しいゲームの名前登録の前に1回。背景5枚がそろうまで出さない', () => {
  const P = loadPro(), txt = (id) => P.SLIDES.find((s) => s.id === id).pages.flat().join('');
  assert.deepEqual(P.SLIDES.map((s) => s.id), ['A', 'B', 'C', 'D', 'E']);
  assert.match(txt('A'), /『聖獣』がいる。/); assert.match(txt('A'), /およそ百年前/); assert.match(txt('A'), /一人の英雄と、一体の聖獣。/); assert.match(txt('A'), /『聖獣士』という道/);
  assert.match(txt('B'), /五年前。/); assert.match(txt('B'), /三人の聖獣士と、それぞれの聖獣たち/); assert.match(txt('B'), /三人と三体は力を合わせ/); assert.match(txt('B'), /今も、『レジェンド』として/);
  assert.match(txt('C'), /三人のレジェンドの活躍から、五年。/); assert.match(txt('C'), /平和と繁栄を取り戻した/); assert.match(txt('C'), /ミストリアは/);
  assert.match(txt('D'), /あなたもまた、その一人だった。/);
  assert.match(txt('E'), /アステリア地方――大都市、ミストリア。/); assert.match(txt('E'), /ここから始まる。$/);
  assert.doesNotMatch(P.SLIDES.map((s) => s.pages.flat().join('')).join(''), /ブリーダー/);
  for (const id of ['c', 'd', 'e']) assert.ok(existsSync(path.join(ROOT, `assets/prologue/prologue_${id}.webp`)), id);
  assert.deepEqual([P.SLIDES[0].bg, P.SLIDES[1].bg], [null, null], 'A・B は受け取り待ち（null＝読みに行かない・プロローグは出さない）'); for (const s of P.SLIDES.slice(2)) assert.equal(s.bg, `./assets/prologue/prologue_${s.id.toLowerCase()}.webp`);
  assert.ok(P.T.tapGuard >= 400, '誤タップで何枚も飛ばない'); for (const s of P.SLIDES) for (const pg of s.pages) assert.ok(P.pageMs(pg) >= 4000 && P.pageMs(pg) <= 14000, `${s.id}：1ページ ${P.pageMs(pg)}ms（速すぎず長すぎず）`);
  const nm = fnOf('p11NameScr'); assert.match(nm, /if\(!finaFlags\(\)\.prologue&&window\.MMPRO&&!window\.MM_QA_NO_PROLOGUE&&!P11_PRO\.has\(S\)\)/); assert.match(nm, /MMPRO\.ready\(\)\.then\(ok=>ok\?MMPRO\.play\(\)/, '背景がそろったときだけ');
  assert.match(rd('tests/e2e/harness.mjs'), /MM_QA_NO_PROLOGUE = true/);
});

test('QU-02：街は正式ミストリア。施設は背景の上の押せる札（市場・牧場・研究所・闘技場・聖獣士管理局・アイテム屋）で下のバーと二重に出さない。聖獣士管理局は中を作らない（素材・仕様なし）。アイテム屋の戻るは街へ', () => {
  assert.ok(existsSync(path.join(ROOT, 'assets/town/mistria_main.webp')));
  assert.match(HTML, /function townGuild\(\)\{townLock\("聖獣士管理局は、まだ利用できません。"\)\}/);
  assert.match(fnOf('shopScr'), /if\(SHOP_FROM=="town"\)\{const b=\$\("#app \.dback"\);if\(b\)\{b\.textContent="◀ 街にもどる";b\.dataset\.nav="back";/);
  assert.match(rd('js/feel/game-feel.js'), /townShop: 'facility'/, '街の札からアイテム屋へも共通の画面の切り替え');
});

test('QU-03：立ち絵つきの一言（.nst）＝正式の半身（closeup）を大きく＋ネイビーの会話窓。街のフィナ（guide）・ヴァルガス（stern）・牧場のニック（smile）・研究所のエリオット（guide）。重要な会話（major）は同じ表情の全身（2026-10-03 の正式素材）', () => {
  assert.match(HTML, /function finaStandSrc\(\)\{const im=window\.MMNPC&&MMNPC\.imageOf\("fina","closeup","guide"\)/);
  for (const [k, v] of [['VARGAS_STAND', 'assets/npc/vargas/closeup/stern.webp'], ['NICK_STAND', 'assets/npc/nick/closeup/smile.webp'], ['ELLIOT_STAND', 'assets/npc/elliot/closeup/guide.webp']]) { assert.ok(HTML.includes(`${k}="${v}"`), k); assert.ok(existsSync(path.join(ROOT, v)), v); }
  assert.match(HTML, /\.mmtalk-fig\.closeup\{height:min\(52vh,470px\);height:min\(52dvh,470px\)\}/, '会話の半身を大きく');
  const N = rd('js/npc/npc.js'); assert.match(N, /if \(pres === 'major'\) lines = preferFullbody\(lines\);/);
  for (const e of ['normal', 'smile', 'happy', 'surprised', 'troubled', 'worried', 'serious', 'guide', 'wave', 'greet']) assert.ok(existsSync(path.join(ROOT, `assets/npc/fina/fullbody/${e}.webp`)), e);
  assert.match(HTML, /const FINA_PRES=\{raiseAgain:"compact",done:"major"\}/, '育成完了は重要な会話（全身）');
});

test('QU-04：研究所＝正式背景（assets/lab/lab_main.webp）・エリオットの半身・下に機能のカード（図鑑／特殊復元・合体は準備中＝システム表示だけ）。アイテム屋の店主は腰から上を大きく。牧場は選んでいる子を大きく', () => {
  assert.ok(existsSync(path.join(ROOT, 'assets/lab/lab_main.webp')));
  const mu = fnOf('museum'); assert.match(mu, /onclick="museum\('book'\)"><b>図鑑<\/b>/); assert.match(mu, /onclick="labLock\('特殊復元'\)"/); assert.match(mu, /onclick="labLock\('合体'\)"/);
  assert.doesNotMatch(HTML.split('\n').find((l) => l.startsWith('function labLock(')), /ELLIOT|エリオット|fuse\(|selm\(/, '準備中はシステム表示（合体の処理は呼ばない）');
  assert.match(HTML, /\.ds\.shop>\.shopnpc\{top:15%;bottom:auto;height:min\(112%,1000px\)/);
  assert.match(fnOf('farm'), /const rnFeat=\(rnView&&S\.box\.find\(v=>v\.uid===rnView\)\)\|\|S\.m\|\|S\.box\[0\]\|\|null;/);
});

test('QU-05：対戦前の画面を1つに：練習試合は BATTLE 画面（p9PreBattle）を出さず fight() の導入（対面＋VS）だけ。大会は順位表の「次の相手」に小さな能力比較＋対戦開始（2度押し）→ fight()。fight()・Phase 6 は変えない', () => {
  assert.match(fnOf('bBattleGo'), /^function bBattleGo\(\)\{const m=S\.m;if\(bBusy\|\|!m\)return;const rk=MMP8\.practiceRank\(m\);if\(!MMP8\.beginBattle\(S,m,\{kind:"practice",rank:rk\}\)\.ok\)return board\(\);save\(\);fight\(rk\)\}/);
  assert.doesNotMatch(HTML.replace(/function p9PreBattle\(/, ''), /p9PreBattle\(/, 'p9PreBattle はどこからも呼ばない（関数は残す）');
  assert.doesNotMatch(HTML.replace(/function p9VsScr\(/, ''), /p9VsScr\(\)/, 'VS 画面（p9VsScr）は流れから外した（関数は残す）');
  assert.match(fnOf('p8TourScr'), /\$\{p9Cmp\(m,o\)\}<button class="p9btn p9go" data-nsfx="1" onclick="p9VsGo\(this\)">⚔️ 対戦開始<\/button>/);
});

test('QU-06：セーブ・ロードの「最初からやり直す」（2度押し）→ タイトル画面（タイトルの曲と画面が一致）。押しただけではセーブを消さない＝タイトルで始めたときに従来の初期化。つづきからにもどれる', () => {
  assert.match(fnOf('reset'), /b\.textContent="もう一度押すと最初から";return\}sel=\[\];P_NEWGAME=true;title\(\)\}/);
  assert.doesNotMatch(fnOf('reset'), /p10NewSave|save\(\)|render\(\)/, '押しただけでは消さない');
  assert.match(fnOf('startGame'), /if\(P_NEWGAME\)\{P_NEWGAME=false;sel=\[\];S=p10NewSave\(\);save\(\)\}p8Resume\(\)/);
  assert.match(fnOf('title'), /onclick="P_NEWGAME=false;p8Resume\(\)">つづきからにもどる<\/button>/);
});

test('QU-07：正式名称「聖獣士」（旧「ブリーダー」）：名前登録の見出し・大会の参加者の肩書き。内部の変数名は変えない', () => {
  assert.match(HTML, /<b class="p11t">聖獣士登録<\/b>/); assert.doesNotMatch(HTML.replace(/\/\/[^\n]*/g, ''), /ブリーダー登録/);
  assert.match(rd('js/phase8/league.js'), /\$\{PROVISIONAL_NPC_TITLE\[rank\]\}聖獣士 \$\{name\}/);
});
