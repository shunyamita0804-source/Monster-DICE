// =========================================================
// 第二段階 PHASE E（2026-10-04）：能力UPの成長演出・疲れの増減・休憩の帯・宝箱の光（js/chapter/field-view.js と index.html の CSS。静的）
//  FE2-01〜04。画面は tests/qa-e2e-grow.test.mjs
// =========================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const HTML = rd('index.html'), FV = rd('js/chapter/field-view.js');

test('FE2-01：成長演出＝アイコン（正式マスUIの画像）→「ちから +5」→ ゲージ（999 を最大とした絶対の目盛り・正式色）→ 粒子。複数の能力は行を縦に並べる。枠は正式素材 statUp のまま', () => {
  assert.match(FV, /const gaugePct = \(v\) => Math\.round\(Math\.min\(999, Math\.max\(0, v \| 0\)\) \/ 999 \* 1000\) \/ 10;/);
  assert.match(FV, /const STAT_TILE = \{ li: 'stat_life', po: 'stat_power', in: 'stat_intelligence', hi: 'stat_accuracy', ev: 'stat_evasion', de: 'stat_toughness' \};/);
  assert.match(FV, /function growRows\(m, gains\)/); assert.match(FV, /async function growPlay\(d, gains\)/);
  assert.match(FV, /tileSpriteOf\(V\.cfg, STAT_TILE\[key\]\)/, 'アイコンは正式マスUI（新しい画像は作らない）');
  assert.match(FV, /await popup\(`<small>\$\{esc\(labOf\(fx\.key\)\)\}のマス<\/small>\$\{growRows\(m, gains\)\}`, `\$\{T\.c\} grow`, Math\.min\(holdOf\(3, 800\), 300\), T\.frame \? effectAsset\(T\.frame\) : null, \(d\) => growPlay\(d, gains\)\);/, '能力マス：枠（frame_stat_up）＋成長の行。余韻は最大 0.3秒（演出 約0.66秒＋余韻＋出入り＝約1.1秒）');
  assert.match(FV, /fx\.kind === 'multi' \? fx\.gains\.map\(\(x\) => \(\{ key: x\.key, amount: x\.amount \}\)\)/, '複数の能力は行ごと');
  assert.match(HTML, /\.chf-grow\+\.chf-grow\{margin-top:6px\}/, '重ねない（縦に並べる）');
});

test('FE2-02：6能力の正式色（ライフ黄・ちから赤・かしこさ緑・命中桃・回避水色・丈夫さ青）は index.html の STAT_COLOR と field-view の既定が同じ。ゲージ・数値・粒子は var(--c)。絵に filter はかけない', () => {
  const c = HTML.match(/const STAT_COLOR=\{([^}]*)\}/)[1], d = FV.match(/const STAT_COLOR_DEF = \{([^}]*)\}/)[1];
  const norm = (s) => s.replace(/\s|['"]/g, '').split(',').sort().join(',');
  assert.equal(norm(c), norm(d)); assert.match(c, /li:"#f2c94c"/); assert.match(c, /po:"#e5533c"/); assert.match(c, /in:"#4fbf6a"/); assert.match(c, /hi:"#f08cb4"/); assert.match(c, /ev:"#5cc8e8"/); assert.match(c, /de:"#4a74e0"/);
  assert.match(HTML, /\.chf-gauge i\{[^}]*background:var\(--c\)/); assert.match(HTML, /\.chf-grow-t \.cnt\{color:var\(--c\)\}/); assert.match(HTML, /\.chf-sparks i\{[^}]*background:var\(--c\)/);
  const css = HTML.slice(HTML.indexOf('PHASE E：能力UPの成長演出'), HTML.indexOf('@media (prefers-reduced-motion:reduce){.chf-grow-ic'));
  assert.doesNotMatch(css, /filter:/, '正式画像の色を変えない');
});

test('FE2-03：疲れの見せ方：増減（+5／−30）をチップの脇に短く浮かべ、チップの段階（lo／mid／hi）も合わせる。サイコロ（出目の疲れ）・休む・回復イベント・少し疲れる出来事で出る。大きな演出はしない', () => {
  assert.match(FV, /function fatFly\(delta\)/); assert.match(FV, /function fatLevel\(v\)/);
  assert.match(FV, /fatFly\(m\.raise\.pend \? m\.raise\.pend\.fatigueAdded \|\| 0 : 0\);/, 'サイコロのあと');
  assert.match(FV, /restVeil\(\); refreshHud\(m\); fatFly\(MMCH\.fatigue\(m\) - before\);/, '休む');
  assert.match(FV, /async function fatigueHud\(from, to\) \{[^\n]*fatFly\(to - from\); bump\(f\); await countUp\(b, from, to, 360\); fatLevel\(to\); \}/, '回復イベント');
  assert.match(FV, /else if \(fx\.fatigueAdded > 0 && f1 !== f0\) await fatigueHud\(f0, f1\);/, '少し疲れる出来事（stat_tired）');
  assert.match(HTML, /\.chf-fatfly\{[^}]*animation:chfFatFly \.9s/); assert.match(HTML, /\.chf-fatfly\.up\{/); assert.match(HTML, /\.chf-fatfly\.dn\{/);
});

test('FE2-04：マスごとの反応：能力＝成長演出、宝箱＝揺れて開く＋光の粒、イベント＝フィナの会話（lines）→ 結果、休憩＝青の帯＋疲れの回復、野生＝遭遇の演出（カットイン）、ライバル＝リュウの帯。視差効果を減らす設定では粒子・帯を出さない', () => {
  assert.match(FV, /chestSparks\(obj\);/); assert.match(FV, /function chestSparks\(obj\)/);
  assert.match(FV, /else if \(fx\.kind === 'fatigue'\) \{ monReact\('rest'\); restVeil\(\); \}/);
  assert.match(FV, /await eventLines\(fx\);/); assert.match(FV, /async function encounterShow\(BT, bt\)/);
  const ch1 = rd('js/chapter/configs/ch1a.js'); assert.match(ch1, /rival: \{[^\n]*name: 'リュウ'/); assert.match(ch1, /wild: \{[^\n]*cutin/);
  assert.match(HTML, /@media \(prefers-reduced-motion:reduce\)\{\.chf-grow-ic\{transition:none;opacity:1;transform:none\}\.chf-gauge i\{transition:none\}\.chf-sparks i,\.chf-csparks i,\.chf-fatfly,\.chf-restveil\{animation:none;display:none\}\}/);
  assert.match(FV, /function restVeil\(\) \{ const ui = \$\('#chf-ui'\); if \(!ui \|\| V\.calm\) return;/);
});
