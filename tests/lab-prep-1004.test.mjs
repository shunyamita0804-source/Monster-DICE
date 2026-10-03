// =========================================================
// 第二段階 PHASE C（2026-10-04）：研究所（図鑑・合体・配合表）と出発準備の刷新（静的）
//  LP-01〜06。画面は tests/qa-e2e-lab-prep.test.mjs
// =========================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const HTML = rd('index.html');
const CODE = HTML.slice(HTML.lastIndexOf('<script>'));
const fnOf = (name) => { const i = CODE.indexOf(`function ${name}(`); return CODE.slice(i, CODE.indexOf('\nfunction ', i + 10)); };
const line = (start) => CODE.split('\n').find((l) => l.startsWith(start));

test('LP-01：研究所の主要機能は図鑑・合体・配合表（特殊復元は主要メニューに無い・「研究・記録・復元」の旧テキストも無い）。入口＝エリオット＋下の3つのボタン', () => {
  const mu = fnOf('museum');
  assert.match(mu, /figure|labShell\("",/); assert.match(mu, /図鑑・合体・配合表/);
  assert.doesNotMatch(mu, /特殊復元|研究・記録・復元|labLock/);
  assert.doesNotMatch(CODE, /function labLock\(/, '旧 labLock は廃止');
  assert.doesNotMatch(CODE.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, ''), /特殊復元/, 'コードの中に特殊復元の UI 文字列は無い（コメントだけ）');
  const nav = fnOf('labNav'); assert.ok(nav.includes('[["book","図鑑"],["fuse","合体"],["table","配合表"]]') && nav.includes("onclick=\"museum('${k}')\""), '図鑑・合体・配合表の3つ');
  assert.match(nav, /data-se="\$\{cur==k\?"UI_TAB":"UI_SELECT"\}"/, '選んでいる機能のボタンはタブの音');
  assert.match(mu, /if\(tab=="book"\)return labBook\(\);if\(tab=="fuse"\)return labFuse\(\);if\(tab=="table"\)return labTable\(\);/);
});

test('LP-02：図鑑：2列のカード（No.・名前・正式画像 p10Img）＋ノビトンは近日公開（解放条件は従来どおり）。詳細＝正式画像・種族・説明・6能力のゲージ（999 を最大とした絶対の目盛り・正式色）＋成長適性・初期の技。旧い base64 のカードは出さない', () => {
  const bk = fnOf('labBook'), md = fnOf('musd');
  assert.match(bk, /SP\.map\(\(x,i\)=>`<button class="lbc" onclick="musd\(\$\{i\}\)">/); assert.match(bk, /p10Img\(i\)/); assert.match(bk, /No\.003<\/small><b class="lbnm">ノビトン<\/b>[\s\S]*近日公開/);
  assert.match(bk, /発見 \$\{n\} \/ \$\{tot\}/);
  assert.match(md, /p10Img\(i\)/); assert.doesNotMatch(md, /AS\[AK\[i\]|pcard/, '旧い base64 のプロフィールカードは出さない');
  assert.match(md, /Math\.round\(Math\.min\(999,base\[j\]\)\/999\*100\)/, 'ゲージは 999 を 100% とした絶対スケール');
  assert.match(md, /MMP10M\.growthOf\(m0,k\)/); assert.match(md, /SK\[k\]\[4\]\} \$\{SK\[k\]\[0\]\}/, '初期の技は既存の技表から');
  const sc = line('const STAT_COLOR=');
  assert.deepEqual(new Function(`${sc}\nreturn STAT_COLOR;`)(), { li: '#f2c94c', po: '#e5533c', in: '#4fbf6a', hi: '#f08cb4', ev: '#5cc8e8', de: '#4a74e0' }, '正式色：ライフ黄・ちから赤・かしこさ緑・命中桃・回避水色・丈夫さ青');
  assert.match(HTML, /\.lbgrid\{display:grid;grid-template-columns:1fr 1fr;/);
  assert.doesNotMatch(HTML.slice(HTML.indexOf('.lbc{'), HTML.indexOf('/* ===== 出発準備')), /filter:[^;}]*hue-rotate/, '正式画像の色を変えない');
});

test('LP-03：配合表は既存の規則だけ（子の種族＝MMP7.resolveFusionSpecies、能力 60%、名前、技の継承、200G）。データの無い組み合わせを作らない', () => {
  const tb = fnOf('labTable');
  assert.match(tb, /MMP7\.resolveFusionSpecies\(\{sp:a\},\{sp:b\}\)/); assert.match(tb, /SP\.map\(\(_,i\)=>i\)/, '図鑑に載る種族（市場の2種）だけ');
  for (const t of ['60%', '200G', '親1の前2文字＋親2の後ろ2文字', '合体専用の種族は未登録']) assert.ok(tb.includes(t), t);
  assert.doesNotMatch(tb, /ジオル|ノビトン/, '未登録の組み合わせを作らない');
});

test('LP-04：合体は研究所から（selm → museum("fuse")・牧場の内部画面 farm(\'\',\'c\') は研究所へ送る）。合体の処理 fuse()・名前 cname・費用 200G は変えない。研究所の合体 UI があるので MMP10M.setFusionAccess(() => true)', () => {
  assert.match(line('function selm('), /museum\("fuse"\)\}$/);
  assert.match(fnOf('farm'), /else return museum\("fuse"\);/); assert.doesNotMatch(fnOf('farm'), /sel\.map\(i=>all\[i\]\)|合体させる！/, '牧場に合体の画面は無い');
  const lf = fnOf('labFuse'); for (const t of ['onclick="selm(${i})"', 'onclick="fuse()"', 'cname(a,c)', '(a[k]+c[k])*.6', '<div class="fz"><div class="slot">', 'wpanel lbwp']) assert.ok(lf.includes(t), t);
  assert.match(fnOf('fuse'), /S\.g-=200;/); assert.match(fnOf('fuse'), /c\.name=cname\(a,b\);/);
  assert.match(CODE, /MMP10M\.setFusionAccess\(\(\)=>true\)/);
});

test('LP-05：出発準備：上＝育成中モンスター（正式画像 msv）と Chapter の札、中＝バッグの5スロット（空き＝空枠・タップで保管庫から選ぶ／所持＝タップで保管庫へ）、その下＝Chapter のカード（正式の俯瞰図）、下＝「出発する」（p7Depart）。処理は従来の関数のまま', () => {
  const pp = fnOf('prepScr');
  for (const t of ['msv(m)', 'MMP7.bagCap(S)', 'onclick="p7ToVault(${i})"', 'onclick="ppVault()"', 'onclick="p7ToBag(${i})"', 'onclick="p7Depart(this)"', '<b>出発する</b>', 'MMP8.canDepart(S,m)', 'pfixFinishNoFinal(this)', 'p8GateNote(nx,c.need)', 'class="dmsg ppmsg"']) assert.ok(pp.includes(t), t);
  assert.match(pp, /\(nx==MMP8\.FINAL&&!MMP8\.isPlayable\(MMP8\.FINAL\)\)\?`[^`]*最終ルートはまだ準備中です/, '最終ルート未登録の案内は従来どおり');
  assert.doesNotMatch(pp, /（空き）|p7Shell\(/, '旧い「1.（空き）」のリストと茶色のカードは廃止');
  const art = new Function(`${line('const PP_ART=')}\nreturn PP_ART;`)(); for (const f of Object.values(art)) assert.ok(existsSync(path.join(ROOT, f)), f);
  assert.match(HTML, /\.ppslots\{display:grid;grid-template-columns:repeat\(5,1fr\)/); assert.match(HTML, /\.pp\{position:relative;margin:-16px;height:100dvh;/); assert.match(HTML, /main:has\(>#app>\.pp\) h1\{display:none\}#app:has\(>\.pp\)\{overflow:hidden\}/);
  assert.match(fnOf('ppVault'), /d\.hidden=/);
});

test('LP-06：ファーム・街の導線は変えていない（ファームのコマンドは特訓・ステータス・技管理・アイテム、進行ボタンは prepScr）。アイテム屋はファームの屋台から（街の札は無い）', () => {
  assert.match(fnOf('fmScr'), /\["shopScr\(\)","item","アイテム","item"\]/); assert.match(fnOf('fmScr'), /on:"prepScr\(\)"/);
  assert.doesNotMatch(CODE, /function townShop\(/);
});
