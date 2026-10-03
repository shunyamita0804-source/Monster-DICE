// =========================================================
// バトル共通演出の正式素材（js/battle/fx.js・assets/battle/common/。2026-10-03）
//  BFX-01：30枚の元ファイルを保存（バイト単位の無加工・名前だけ番号つき）・ゲームで使うのは対応表の11枚だけ
//  BFX-02：対応（ダメージ表示 → #6／#7／#9、efBurst の lv → #15〜#20、決着の帯 → #28／#29）
//  BFX-03：見え方（モンスターの効果の層・時間が来たら消える・同じ場所で重ならない）
//  BFX-04：Phase 6 保護対象（fight()・.bt 系 CSS）に触れない。呼び出しは efBurst（fight() の外）の1行だけ
// =========================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const HTML = rd('index.html');
const DIR = 'assets/battle/common/';

/** 最小の偽 DOM（#f0／#f1／#bt と appendChild・insertBefore・remove・querySelector(':scope > .x')） */
function fakeDom() {
  const mk = (tag, id) => {
    const el = { tagName: tag, id: id || '', children: [], parentNode: null, style: {}, dataset: {}, className: '', clientWidth: 150,
      get firstChild() { return el.children[0] || null; },
      appendChild(c) { c.parentNode = el; el.children.push(c); return c; },
      insertBefore(c, ref) { c.parentNode = el; const i = ref ? el.children.indexOf(ref) : -1; if (i < 0) el.children.push(c); else el.children.splice(i, 0, c); return c; },
      remove() { if (el.parentNode) el.parentNode.children = el.parentNode.children.filter((x) => x !== el); el.parentNode = null; },
      querySelector(sel) { const cls = sel.replace(':scope > .', ''); return el.children.find((c) => c.className === cls) || null; } };
    return el;
  };
  const mw0 = mk('DIV', 'm0'), mw1 = mk('DIV', 'm1'), f0 = mk('DIV', 'f0'), f1 = mk('DIV', 'f1'), bt = mk('DIV', 'bt');
  mw0.appendChild(f0); mw1.appendChild(f1);
  const ids = { f0, f1, bt };
  const document = { body: mk('BODY'), getElementById: (id) => ids[id] || null, createElement: (t) => mk(t.toUpperCase()) };
  return { document, f0, f1, bt };
}
function load() {
  const D = fakeDom(), timers = [];
  const w = { matchMedia: () => ({ matches: false }), addEventListener() {} };
  const fn = new Function('window', 'document', 'setTimeout', 'MutationObserver', 'Image', rd('js/battle/fx.js'));
  fn(w, D.document, (f, ms) => { timers.push([ms, f]); return timers.length; }, undefined, undefined);
  return { B: w.MMBFX, D, timers };
}

test('BFX-01：30枚の元ファイルを original/ に保存（バイト単位で同一・番号つきの名前）。ゲームで使うのは対応表の11枚（透過 WebP）だけ', () => {
  const orig = readdirSync(path.join(ROOT, DIR, 'original')).sort();
  assert.equal(orig.length, 30);
  assert.deepEqual(orig.map((f) => f.slice(0, 4)), Array.from({ length: 30 }, (_, i) => `bc${String(i + 1).padStart(2, '0')}`), '#1〜#30 の番号つき');
  for (const f of orig) { assert.match(f, /^bc\d{2}_\d{13}\.jpeg$/); const b = readFileSync(path.join(ROOT, DIR, 'original', f)); assert.equal(b[0], 0xff); assert.equal(b[1], 0xd8, `${f} は JPEG のまま（無加工）`); }
  const used = readdirSync(path.join(ROOT, DIR)).filter((f) => f.endsWith('.webp')).sort();
  assert.deepEqual(used, ['bc06_hit.webp', 'bc07_critical.webp', 'bc09_miss.webp', 'bc15_stat_up_s.webp', 'bc16_stat_up_m.webp', 'bc17_stat_up_l.webp', 'bc18_stat_down_s.webp', 'bc19_stat_down_m.webp', 'bc20_stat_down_l.webp', 'bc28_victory.webp', 'bc29_defeat.webp']);
  for (const f of used) { const b = readFileSync(path.join(ROOT, DIR, f)); assert.equal(b.toString('ascii', 8, 12), 'WEBP'); assert.ok(b.includes(Buffer.from('ALPH')) || b.includes(Buffer.from('VP8L')), `${f} は透過あり`); assert.ok(statSync(path.join(ROOT, DIR, f)).size < 260000, `${f} は軽い`); }
  const R = rd(DIR + 'README.md'); assert.match(R, /\| #8 \|[^\n]*クリティカル第二候補[^\n]*未使用/); assert.match(R, /\| #29 \|[^\n]*敗北/);
});

test('BFX-02：対応：ダメージ表示（span.dmg／.crt／.ms）→ #6／#7／#9、能力アップ／ダウン lv ±1〜3 → #15〜#17／#18〜#20、決着の帯 WIN!／LOSE → #28／#29。素材はすべて実在', () => {
  const { B } = load();
  for (const f of Object.values(B.FX)) assert.ok(existsSync(path.join(ROOT, f.src)), f.src);
  assert.deepEqual(Object.fromEntries(Object.entries(B.FX).map(([k, v]) => [k, v.src.match(/bc(\d\d)/)[1]])), { hit: '06', critical: '07', miss: '09', up1: '15', up2: '16', up3: '17', down1: '18', down2: '19', down3: '20', victory: '28', defeat: '29' });
  assert.deepEqual([1, 2, 3, -1, -2, -3].map(B.statKind), ['up1', 'up2', 'up3', 'down1', 'down2', 'down3']);
  // index.html の lvOf（fight() が efBurst に渡す lv）と同じ段階
  assert.match(HTML, /const lvOf=ef=>\(ef\.direction=="down"\?-1:1\)\*\(ef\.size=="large"\?3:ef\.size=="medium"\?2:1\);/);
  const src = rd('js/battle/fx.js');
  assert.match(src, /cl\.contains\('ms'\) \? 'miss' : cl\.contains\('crt'\) \? 'critical' : 'hit'/);
  assert.match(src, /if \(t === 'WIN!'\) showEnd\('victory'\); else if \(t === 'LOSE'\) showEnd\('defeat'\);/);
  assert.doesNotMatch(src, /bc0[1-5]_|bc08|bc1[0-4]_|bc2[1-7]_|bc30/, '保留の素材を使わない');
});

test('BFX-03：モンスターの効果の層（#f0／#f1）の一番下に入れ、時間が来たら必ず消す。同じモンスターの前の演出は消してから出す（重ならない）。決着は #bt に1つだけ', () => {
  const { B, D, timers } = load();
  assert.equal(B.show('hit', 1), true); assert.equal(D.f1.children.length, 1); assert.equal(D.f1.children[0].className, 'mbfx');
  B.show('critical', 1); assert.equal(D.f1.children.length, 1, '重ならない'); assert.equal(D.f1.children[0].dataset.kind, 'critical');
  D.f1.appendChild({ className: 'dmg', parentNode: null }); B.stat(1, -3); assert.equal(D.f1.children[0].dataset.kind, 'down3', '数字より下（先頭）');
  B.show('miss', 0); assert.equal(D.f0.children.length, 1);
  B.showEnd('victory'); B.showEnd('defeat'); assert.equal(D.bt.children.filter((c) => c.className === 'mbfx-end').length, 1);
  for (const [ms, f] of timers) { assert.ok(ms <= 1900, `長すぎない（${ms}ms）`); f(); }
  assert.equal(D.f1.children.filter((c) => c.className === 'mbfx').length, 0, 'DOM を残さない'); assert.equal(D.f0.children.length, 0); assert.equal(D.bt.children.length, 0);
  assert.equal(B.show('hit', 2), false, '#f2 は無い＝何もしない'); assert.deepEqual(B.log().map((x) => x.kind), ['hit', 'critical', 'down3', 'miss', 'victory', 'defeat']);
});

test('BFX-04：Phase 6 保護対象に触れない：呼び出しは efBurst（fight() の外の補助関数）の1行だけ。CSS は .bt で始まらない別のクラス。読み込みは fit.js のあと', () => {
  const fightStart = HTML.indexOf('async function fight('), efb = HTML.indexOf('function efBurst(');
  assert.ok(efb > 0 && efb < fightStart, 'efBurst は fight() の外');
  assert.equal((HTML.match(/MMBFX/g) || []).length, 2, 'index.html の呼び出しは efBurst の1か所（window.MMBFX と MMBFX.stat）');
  assert.match(HTML, /sfx\(e\.lv<0\?10:11\);if\(window\.MMBFX\)MMBFX\.stat\(w,e\.lv\)\}/);
  assert.ok(HTML.slice(fightStart, HTML.indexOf('\n$("#snd").textContent', fightStart)).indexOf('MMBFX') < 0, 'fight() の中には書かない');
  for (const l of HTML.split('\n').filter((x) => /mbfx/.test(x) && /^\./.test(x))) assert.doesNotMatch(l, /^\.bt|\.bt |#rl|#go|\.rl|\.rw/, l);
  assert.ok(HTML.indexOf('<script src="./js/battle/fx.js"></script>') > HTML.indexOf('<script src="./js/battle/fit.js"></script>'));
  const src = rd('js/battle/fx.js').replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n'); assert.doesNotMatch(src, /\bfight\s*\(|MMBattle|sfx\(|S\.m\b|save\(/, 'バトルの処理・セーブ・音に触れない（見た目だけ）');
});
