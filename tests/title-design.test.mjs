// =========================================================
// デザイン改修1：開始画面の正式画像
//  正式開始画面画像をそのまま（縦横比を保ち、切り抜き・色変更なし）表示し、画像に描かれた「タップしてはじめる」の位置に
//  透明な開始ボタンを重ねる。開始処理（startGame→p8Resume）・初回／つづき表示・セーブは変えない。
// =========================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const HTML = rd('index.html');
const between = (a, b) => { const i = HTML.indexOf(a), k = HTML.indexOf(b, i + a.length); if (i < 0 || k < 0) throw new Error('抽出失敗: ' + a); return HTML.slice(i, k); };
/** JPEG の幅・高さ（SOFマーカー）を読む */
function jpegSize(buf) { let i = 2; while (i < buf.length) { if (buf[i] !== 0xFF) { i++; continue; } const mk = buf[i + 1], len = buf.readUInt16BE(i + 2); if (mk >= 0xC0 && mk <= 0xCF && ![0xC4, 0xC8, 0xCC].includes(mk)) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) }; i += 2 + len; } return null; }

test('TD-1：開始画面は正式開始画面画像（assets/title/title_main.jpg・1152×2048）を使い、旧タイトル・HTMLのタイトル文字を重ねない', () => {
  const t = between('function title(){', '\nfunction togh(');
  assert.match(HTML, /const MMTITLE=\{src:"assets\/title\/title_main\.jpg",w:1152,h:2048\};/);
  const f = path.join(ROOT, 'assets/title/title_main.jpg'); assert.ok(existsSync(f));
  const buf = readFileSync(f); assert.deepEqual(jpegSize(buf), { w: 1152, h: 2048 });
  const sha = createHash('sha256').update(buf).digest('hex').slice(0, 16);
  assert.match(rd('assets/title/README.md'), new RegExp(`\\| ${sha} \\| 1152×2048 \\|`), 'README に記録した元画像のハッシュと一致（加工していない）');
  assert.match(t, /<img class="mmtimg" src="\$\{MMTITLE\.src\}" width="\$\{MMTITLE\.w\}" height="\$\{MMTITLE\.h\}" alt="ミスティックモンスターズ MYSTIC MONSTERS">/);
  assert.doesNotMatch(t, /p15logo|TITLEIMG|モンスターマスター|MONSTER MASTER|FARM_INTERVAL/i);
});

test('TD-2：開始ボタンは画像に描かれたボタンの位置（x230〜925・y1730〜1900）に重ねた透明なボタン。処理は従来どおり startGame → p8Resume', () => {
  const t = between('function title(){', '\nfunction togh(');
  assert.match(t, /<button class="p15start" data-nsfx="1" onclick="startGame\(this\)">タップしてはじめる<\/button><\/div><p class="tcap"><small>\$\{S\.m\|\|S\.box\.length\?"つづきからはじめます":"はじめてのプレイです"\}<\/small><\/p><\/div>`\}$/);
  const css = HTML.match(/\.tpage\.mmt \.p15start\{([^}]*)\}/)[1];
  const pct = (k) => parseFloat(css.match(new RegExp(`(?:^|;)${k}:([\\d.]+)%`))[1]);
  assert.ok(Math.abs(pct('left') - 230 / 1152 * 100) < 0.01 && Math.abs(pct('top') - 1730 / 2048 * 100) < 0.01, '左上');
  assert.ok(Math.abs(pct('width') - 695 / 1152 * 100) < 0.01 && Math.abs(pct('height') - 170 / 2048 * 100) < 0.01, '大きさ');
  assert.match(css, /background:transparent;/); assert.match(css, /color:transparent;font-size:0;animation:none/, '文字・枠を描かず、画像のボタンと二重にしない');
  assert.match(lineOfStart('function startGame('), /setTimeout\(\(\)=>p8Resume\(\),900\)/, '開始処理は変えない');
});
const lineOfStart = (p) => HTML.split('\n').find((l) => l.startsWith(p));

test('TD-3：画像は縦横比のまま全体を表示（切り抜き・伸縮なし）し、開始画面の画像に filter（色の変更）をかけない', () => {
  const rules = HTML.match(/\n\.mmtscr\{[\s\S]*?\n\.mmtscr \.tcap\{[^}]*\}/)[0];
  assert.match(rules, /\.tpage\.mmt\{[^}]*aspect-ratio:1152\/2048/); assert.match(rules, /\.tpage\.mmt \.mmtimg\{display:block;width:100%;height:100%;object-fit:contain\}/);
  assert.match(rules, /width:min\(100vw,calc\(\(100dvh - env\(safe-area-inset-top,0px\) - env\(safe-area-inset-bottom,0px\) - 30px\) \* 1152 \/ 2048\)\)/, '画面の幅と高さの小さい方に合わせる');
  assert.doesNotMatch(rules, /filter|hue-rotate|object-fit:cover|background-size:cover/, '色の変更・切り抜きをしない');
});
