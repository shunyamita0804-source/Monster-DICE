// =========================================================
// 共通NPC表示・共通会話（js/npc/npc.js）
//  文字送り（1文字ずつ・順番どおり）、タップ操作（表示中＝全文／全文後＝次／最後＝終了）、連打・古いタイマーへの耐性、
//  表情・表示の種類（closeup／fullbody）の切り替えと代わりの画像、既存NPC会話の変換（文章は変えない）、画面へ常設していないこと。
// =========================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const HTML = rd('index.html');
const load = () => { const w = {}; new Function('window', rd('js/npc/npc.js'))(w); return w.MMNPC; };
/** テスト用の時計（setTimeout の代わり）。cancelWorks=false で「止め損ねたタイマー」も再現できる */
function clock(cancelWorks = true) {
  let t = 0, id = 0; const q = new Map();
  return { now: () => t, schedule: (fn, ms) => { q.set(++id, { at: t + ms, fn }); return id; }, cancel: (k) => { if (cancelWorks) q.delete(k); }, active: () => q.size,
    run(ms) { const end = t + ms; for (;;) { let b = null; for (const e of q) if (e[1].at <= end && (!b || e[1].at < b[1].at)) b = e; if (!b) break; q.delete(b[0]); t = b[1].at; b[1].fn(); } t = end; } };
}
const png = (s) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="10" height="20"><text>${s}</text></svg>`)}`;   // テスト専用の仮画像（ゲームの素材ではない）

test('NT-1：文字送りは1文字ずつ・順番どおり（1文字約32ms・定数1か所）。全部表示したらタイマーは残らない', () => {
  const M = load(), c = clock(), ups = [];
  assert.ok(M.TYPE_MS >= 30 && M.TYPE_MS <= 35); assert.equal((rd('js/npc/npc.js').match(/const TYPE_MS = \d+;/g) || []).length, 1);
  const T = M.createTalk([{ name: 'フィナ', text: 'ファームへ行ってみましょう！' }], { ...c, onUpdate: (s) => ups.push(s.text) }).start();
  assert.equal(T.state().text, '');
  c.run(M.TYPE_MS); assert.equal(T.state().text, 'フ'); c.run(M.TYPE_MS * 3); assert.equal(T.state().text, 'ファーム');
  c.run(M.TYPE_MS * 40); const full = 'ファームへ行ってみましょう！';
  assert.equal(T.state().text, full); assert.equal(T.state().typing, false); assert.equal(c.active(), 0);
  ups.forEach((x, i) => { assert.ok(full.startsWith(x)); if (i) assert.ok(x.length - ups[i - 1].length <= 1, '1文字ずつ増える'); });
  assert.deepEqual(M.splitChars('か\u3099👩‍👩‍👧！'), ['か\u3099', '👩‍👩‍👧', '！'], '結合文字・絵文字も1文字として扱う');
});

test('NT-2：タップ：表示中＝全文表示／全文表示後＝次のセリフ／最後＝会話終了（終了は1回だけ・タイマーなし）', () => {
  const M = load(), c = clock(); let ends = 0;
  const T = M.createTalk(['一つ目のセリフです。', '二つ目。'], { ...c, onEnd: () => ends++ }).start();
  c.run(100); assert.equal(T.state().typing, true);
  assert.equal(T.tap(), 'full'); assert.equal(T.state().text, '一つ目のセリフです。'); assert.equal(c.active(), 0);
  c.run(100); assert.equal(T.tap(), 'next'); assert.equal(T.state().idx, 1); assert.equal(T.state().text, '');
  c.run(100); assert.equal(T.tap(), 'full'); c.run(100); assert.equal(T.tap(), 'end');
  assert.deepEqual([T.state().ended, ends, c.active()], [true, 1, 0]); c.run(100); assert.equal(T.tap(), 'ended'); assert.equal(ends, 1);
});

test('NT-3：連打しても、文章が混ざらず・二重に進まず・最後に正しく終わる（止め損ねたタイマーがあっても古い行の文字は入らない）', () => {
  for (const cancelWorks of [true, false]) {
    const M = load(), c = clock(cancelWorks), ups = []; let ends = 0;
    const lines = ['おはようございます！', '今日はファームで修行しましょう。', 'がんばってくださいね。'];
    const T = M.createTalk(lines, { ...c, onUpdate: (s) => ups.push([s.idx, s.text]), onEnd: () => ends++ }).start();
    const r = []; for (let k = 0; k < 200 && !T.state().ended; k++) { r.push(T.tap()); c.run(10); }
    c.run(2000);
    assert.equal(ends, 1); assert.ok(r.includes('ignored'), '1回のタップを二重に処理しない最短間隔');
    ups.forEach(([i, x], k) => { if (i >= 0) assert.ok(lines[i].startsWith(x), `${cancelWorks}:${i}「${x}」が混ざっていない`); if (k) assert.ok(i - ups[k - 1][0] <= 1, '1回で2行進まない'); });
    if (cancelWorks) assert.equal(c.active(), 0, '終了後にタイマーが残らない');
  }
});

test('NT-4：表情・表示の種類（closeup／fullbody）を行ごとに切り替え、省略は前の行を引き継ぐ。存在しない表情・NPCでも止まらない', () => {
  const M = load(), c = clock();
  M.register('t', { name: 'テスト', defaultView: 'closeup', defaultExpr: 'normal', views: { closeup: { normal: png('c-n'), smile: png('c-s'), serious: png('c-x') }, fullbody: { normal: png('f-n') } } });
  const T = M.createTalk([{ npc: 't', text: 'a' }, { expression: 'smile', text: 'b' }, { expression: 'serious', text: 'c' }, { view: 'fullbody', text: 'd' }, { view: 'closeup', expression: 'angry', text: 'e' }, { npc: 'nope', text: 'f' }], { ...c }).start();
  const seen = []; for (let i = 0; i < 6; i++) { c.run(200); const s = T.state(); assert.equal(s.idx, i); seen.push([s.view, s.expr, s.fallback, s.name, !!s.img]); T.tap(); }
  assert.deepEqual(seen, [['closeup', 'normal', false, 'テスト', true], ['closeup', 'smile', false, 'テスト', true], ['closeup', 'serious', false, 'テスト', true],
    ['fullbody', 'normal', true, 'テスト', true], ['closeup', 'normal', true, 'テスト', true], [null, null, false, '', false]]);
  assert.equal(M.imageOf('nope'), null); assert.equal(M.imageOf('t', 'side', 'cry').expr, 'normal');
  assert.throws(() => M.register('', {}), /不正/);
});

test('NT-5：フィナは案内役として登録（Chapterボードには置かない）。上半身の8表情と、6コマのアニメーション2種。全身は未着のため上半身で代わりに表示', () => {
  const M = load(), f = M.get('fina');
  assert.deepEqual([f.name, f.role, f.board, f.defaultView, f.defaultExpr], ['フィナ', '案内役', false, 'closeup', 'normal']);
  assert.deepEqual(M.expressionsOf('fina', 'closeup'), ['normal', 'smile', 'happy', 'surprised', 'troubled', 'worried', 'serious', 'guide']);
  assert.deepEqual(M.expressionsOf('fina', 'fullbody'), []); assert.deepEqual(M.animationsOf('fina', 'closeup'), ['wave', 'wave_blink']);
  const fb = M.imageOf('fina', 'fullbody', 'happy'); assert.deepEqual([fb.view, fb.expr, fb.fallback, fb.src], ['closeup', 'happy', true, 'assets/npc/fina/closeup/happy.png']);
  for (const a of ['wave', 'wave_blink']) { const x = M.animOf('fina', 'closeup', a); assert.equal(x.frames.length, 6); assert.ok(x.loop); x.frames.forEach((s, i) => assert.equal(s, `assets/npc/fina/animations/${a}/${a}_0${i + 1}.png`)); }
  assert.equal(M.animOf('fina', 'closeup', 'dance'), null, '存在しないアニメーションは静止画のまま');
  // 素材：すべて透過PNG（RGBA）で、四隅は透明
  const all = [...Object.values(f.views.closeup), ...Object.values(f.anims.closeup).flatMap((a) => a.frames)];
  assert.equal(all.length, 20);
  for (const src of all) {
    const buf = readFileSync(path.join(ROOT, src));
    assert.equal(buf.subarray(1, 4).toString(), 'PNG', src); assert.equal(buf[25], 6, `${src}：カラータイプ6（RGBA）`);
  }
  assert.match(rd('assets/npc/fina/README.md'), /背景（描き込まれた市松模様・緑背景）だけを透明にした透過PNG/);
  const c = clock(), T = M.createTalk([{ npc: 'fina', expression: 'happy', text: 'a' }, { anim: 'wave', text: 'b' }, { text: 'c' }], c).start();
  assert.deepEqual([T.state().img, T.state().anim], ['assets/npc/fina/closeup/happy.png', null]); c.run(100); T.tap(); c.run(100);
  const s2 = T.state(); assert.deepEqual([s2.idx, s2.anim, s2.frames.length, s2.fps], [1, 'wave', 6, 8]);
  T.tap(); c.run(100); assert.deepEqual([T.state().idx, T.state().anim], [2, null], 'アニメーションは行ごとの指定（次の行へは引き継がない）');
});

test('NT-6：既存NPC会話（NP）は文章を変えずに共通会話へ変換できる。index.html の画面には会話を常設していない', () => {
  const M = load(), line = HTML.split('\n').find((l) => l.startsWith('const NP='));
  const NP = new Function(`${line}\nreturn NP;`)(), before = JSON.stringify(NP);
  const L = M.fromLegacy(NP.b, [0, 1]); assert.deepEqual(L, [{ name: 'コウ', text: NP.b.t[0] }, { name: 'コウ', text: NP.b.t[1] }]);
  assert.equal(M.fromLegacy(NP.f).length, NP.f.t.length); assert.equal(JSON.stringify(NP), before, '既存の会話データは変えない');
  assert.equal((HTML.match(/<script src="\.\/js\/npc\/npc\.js"><\/script>/g) || []).length, 1);
  assert.deepEqual(HTML.match(/MMNPC\.[a-zA-Z]+/g), ['MMNPC.talk'], '画面からは finaTalk の1か所だけで呼ぶ（正式に指定された場所だけ：fina-appear.test.mjs）');
  for (const f of ['function market(', 'function farm(', 'function _hall(', 'function board(', 'function museum(']) { const i = HTML.indexOf(f); if (i >= 0) assert.doesNotMatch(HTML.slice(i, HTML.indexOf('\nfunction ', i + 10)), /finaTalk|MMNPC/, `${f} には置かない`); }
  const css = HTML.slice(HTML.indexOf('/* ===== 共通NPC会話（MMNPC'), HTML.indexOf('</style></head>'));
  assert.doesNotMatch(css, /filter|hue-rotate/, '立ち絵の色を変えない'); assert.match(css, /font-family:"Noto Sans JP"/); assert.match(css, /font-family:"Shippori Mincho"/);
});
