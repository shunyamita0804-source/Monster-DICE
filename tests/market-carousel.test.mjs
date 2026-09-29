// =========================================================
// 市場カルーセル改修：左右の矢印（＋従来の横スワイプ・ドット・キー操作）で切り替える、端から端へ循環するループ型
//  中央の候補（P10_MK）だけを基準に、見た目の位置・名前・価格・購入確認・購入する種族を決める。切り替え中は操作・購入を受け付けない。
// =========================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const HTML = rd('index.html');
const between = (a, b) => { const i = HTML.indexOf(a), k = HTML.indexOf(b, i + a.length); if (i < 0 || k < 0) throw new Error('抽出失敗: ' + a); return HTML.slice(i, k); };
const lineOf = (p) => HTML.split('\n').find((l) => l.startsWith(p));
const fns = (P15MK) => new Function('P15MK', between('function p10Slot(', '\nconst p10Tf=') + '\nreturn { p10Slot, p10Pose };')(P15MK);

test('MC-1：端から端へ循環する（最後→最初・最初→最後）。どの候補が中央でも、各候補の位置は重ならない', () => {
  const { p10Slot } = fns(null), step = between('function p10Step(dir){', '\nfunction p10Go(');
  assert.match(step, /const from=P10_MK,to=\(\(from\+dir\)%n\+n\)%n/);
  const next = (from, dir, n) => ((from + dir) % n + n) % n;
  assert.deepEqual([next(2, 1, 3), next(0, -1, 3), next(1, 1, 3), next(1, -1, 3)], [0, 2, 2, 0], '3候補：最後→最初、最初→最後');
  for (const n of [2, 3, 4, 5]) for (let c = 0; c < n; c++) {
    const slots = Array.from({ length: n }, (_, i) => p10Slot(i, c, n));
    assert.equal(new Set(slots).size, n, `${n}候補・中央${c}：位置が重ならない ${slots}`); assert.equal(slots.indexOf(0), c, '中央は選択中の候補だけ');
  }
  assert.deepEqual([0, 1, 2].map((i) => p10Slot(i, 0, 3)), [0, 1, -1], 'ソラモが中央のとき：右にガウル、左にノビトン');
});

test('MC-2：中央100%・左右は約70%。背景に台座があれば左右は奥の台座の位置、無ければ横に並べる（px値は割合と台座から計算）', () => {
  const w = 270, a = fns({ dx: 120, dy: 40 }), b = fns(null);
  assert.deepEqual(a.p10Pose(0, w), { t: 0, ty: -0, s: 1, o: 1, z: 3 });
  assert.deepEqual(a.p10Pose(1, w), { t: 120, ty: -40, s: 0.7, o: 1, z: 2 }); assert.deepEqual(a.p10Pose(-1, w), { t: -120, ty: -40, s: 0.7, o: 1, z: 2 });
  assert.equal(b.p10Pose(1, w).t, 0.73 * w); assert.equal(b.p10Pose(-1, w).ty, -0);
  assert.equal(a.p10Pose(2, w).o, 0, '4候補以上のとき、3つ目以降は奥（見えない）');
});

test('MC-3：切り替え中は次の操作・購入を受け付けず、中央の表示・情報欄・購入する種族を同じ候補（P10_MK）から作る', () => {
  const step = between('function p10Step(dir){', '\nfunction p10Go(');
  assert.match(step, /^function p10Step\(dir\)\{const car=\$\("#p10car"\);if\(!car\|\|P10_ANIM\|\|\$\("#p10ov"\)\)return false;/, '演出中・購入確認中は受け付けない');
  assert.match(step, /P10_ANIM=true;const bb=\$\("#p10info \.p10buy"\);if\(bb\)bb\.disabled=true;P10_MK=to;p10Place\(\);/, '番号と最終位置を先に確定し、購入ボタンは演出中押せない');
  assert.match(step, /const done=\(\)=>\{if\(tok!==P10_TOK\|\|!P10_ANIM\)return;P10_ANIM=false;/, '終了処理は1回だけ（古い演出の終了で新しい演出を止めない）');
  assert.match(step, /p10Place\(\);p10Info\(\);/, '終了後に中央の候補で情報欄（名前・価格・購入ボタン）を作り直す');
  assert.match(lineOf('function p10Go(i,instant){'), /\{const car=\$\("#p10car"\),n=MMP10M\.MARKET_CATALOG\.length;if\(!car\|\|!\(i>=0&&i<n\)\)return;/);
  assert.match(between('function p10Go(i,instant){', '\nfunction p10Swipe('), /if\(P10_ANIM\|\|\(P10_SW&&P10_SW\.moved\)\)return;/);
  const ask = lineOf('function p10BuyAsk(){');
  assert.match(ask, /^function p10BuyAsk\(\)\{if\(P10_ANIM\)return;const c=MMP10M\.MARKET_CATALOG\[P10_MK\];if\(!c\|\|!p10CenterIs\(c\.key\)\)return p10Info\(\);const s=MMP10M\.byKey\(c\.key\)/);
  assert.match(between('function p10BuyAsk(){', '\nfunction p10Close('), /onclick="mkgo\(\$\{s\.id\}\);p10Close\(\)">連れて帰る（\$\{c\.price\}G）/, '確認画面の種族・価格は同じ候補から');
  assert.match(lineOf('function p10CenterIs(key){'), /on\.dataset\.key===key&&!!bb&&bb\.dataset\.key===key/, '中央の個体と情報欄の購入ボタンが同じ種族のときだけ');
  assert.match(between('function p10Slide(c,i){', '\nlet P15MK'), /<div class="p10sl\$\{w\?" wait":""\}" data-i="\$\{i\}" data-key="\$\{c\.key\}" onclick="p10Tap\(\$\{i\}\)">/);
  assert.match(between('function p10Info(){', '\nfunction p10BuyAsk('), /<button class="p10buy" data-key="\$\{c\.key\}" \$\{chk\.ok\?"":"disabled"\} onclick="p10BuyAsk\(\)">/);
});

test('MC-4：左右の矢印はカルーセルの内側・モンスターより手前に置き、市場の商品・価格は変えない。画像の色は変えない', () => {
  const mk = between('function market(msg,focus){', '\nfunction p10Slide(');
  assert.match(mk, /cat\.map\(\(c,i\)=>p10Slide\(c,i\)\)\.join\(""\)\}<button class="p10arw prev"[^>]*onclick="p10Step\(-1\)">[\s\S]*<button class="p10arw next"[^>]*onclick="p10Step\(1\)">[\s\S]*<\/button><\/div>/);
  assert.match(mk, /P10_ANIM=false;P10_TGT=null;P10_SW=null;p15MkFit\(\);p10Swipe\(\$\("#p10car"\)\);/); assert.doesNotMatch(mk, /addEventListener\("scroll"/);
  const arw = HTML.match(/\n\.p10arw\{([^}]*)\}/)[1];
  assert.match(arw, /position:absolute;top:40%;z-index:6;/); assert.match(arw, /width:44px;height:44px/, '押しやすい大きさ');
  assert.match(HTML, /\.p10arw\.prev\{left:6px\}\.p10arw\.next\{right:6px\}/, '画面の内側'); assert.match(HTML, /\.p10sl\.on\{z-index:3\}/, '矢印（6）は中央の個体（3）より手前');
  assert.doesNotMatch(HTML.match(/\n\.p10arw\{[\s\S]*?\.p10arw svg\{[^}]*\}/)[0] + HTML.match(/\n\.p10car\{[^}]*\}/)[0] + HTML.match(/\n\.p10sl\{[^}]*\}/)[0], /filter|hue-rotate/);
  const w = {}; new Function('window', rd('js/phase10/monsters.js'))(w);
  assert.deepEqual(w.MMP10M.MARKET_CATALOG.map((c) => [c.key, c.status, c.price ?? null]), [['solamo', 'sale', 500], ['gauru', 'sale', 500], ['nobiton', 'waiting', null]], 'ジオルは出さない・ノビトンは入荷待ちのまま');
  assert.match(HTML, /if\(e\.key=="ArrowRight"\)p10Step\(1\);else if\(e\.key=="ArrowLeft"\)p10Step\(-1\)/, 'キー操作も同じ循環・同じ受付制御');
});
