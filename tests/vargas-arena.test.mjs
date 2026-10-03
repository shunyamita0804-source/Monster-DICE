// =========================================================
// 闘技場NPC「ヴァルガス」（闘技場の管理者。公式ランク大会の進行役セドリックとは別人物）
//  ・アップ画像のみ（closeup の6表情：normal・guide・stern・approval・surprised・respect）。小さい顔は立ち絵 normal から切り出した face.webp
//  ・闘技場はロック中のまま（開放条件・内容・報酬は未決）。街の闘技場ボタンを押すと、案内文（システム表示）はそのまま、その下にヴァルガスの一言
//  ・画面遷移・セーブ・バトルはしない。Phase 6 には触れない
//  実ブラウザのテストは QA_E2E=1 のときだけ実行する（tests/e2e/harness.mjs）。
// =========================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import * as H from './e2e/harness.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const EXPR = ['normal', 'guide', 'stern', 'approval', 'surprised', 'respect'];
function loadNpc() { const ctx = { console }; ctx.window = ctx; vm.createContext(ctx); vm.runInContext(readFileSync(path.join(ROOT, 'js/npc/npc.js'), 'utf8'), ctx); return ctx.MMNPC; }
const lineOf = (s) => HTML.split('\n').find((l) => l.startsWith(s));
const vargasTalk = () => { const i = HTML.indexOf('const VARGAS_TALK={'); return new Function(`return ${HTML.slice(i + 'const VARGAS_TALK='.length, HTML.indexOf('};', i) + 1)}`)(); };
/** 可逆WebP（VP8L）の見出しを読む：形式・幅・高さ・透過の有無（2026-09-30：透過PNGから画素を変えずに変換） */
const webp = (p) => { const b = readFileSync(path.join(ROOT, p)); const v = b.readUInt32LE(21); return { sig: b.subarray(8, 12).toString(), type: b.subarray(12, 16).toString() + (b[20] === 0x2f && (v >>> 28) & 1 ? '+alpha' : ''), w: (v & 0x3fff) + 1, h: ((v >>> 14) & 0x3fff) + 1 }; };

test('VAR-1：ヴァルガスは闘技場の管理者として、アップ画像（closeup）の6表情で登録。セドリック（大会の進行役）とは別', () => {
  const M = loadNpc(), v = M.get('vargas');
  assert.deepEqual([v.name, v.role, v.board, v.defaultView, v.defaultExpr], ['ヴァルガス', '闘技場の管理者', false, 'closeup', 'normal']);
  assert.deepEqual([...M.expressionsOf('vargas', 'closeup')], EXPR);
  assert.equal(M.imageOf('vargas', 'closeup', 'respect').src, 'assets/npc/vargas/closeup/respect.webp');
  assert.equal(M.get('cedric').role, '公式ランク大会の進行役', 'セドリックはそのまま（別人物）');
  assert.deepEqual(['dan', 'nick', 'karen', 'elliot', 'fina'].map((k) => M.get(k).name), ['ダン', 'ニック', 'カレン', 'エリオット', 'フィナ']);
});

test('VAR-2：素材は透過PNG（RGBA）。立ち絵6枚は 573×760、小さい顔は 256×256。README に元画像との対応・透明化の方法・表情名が仮であること', () => {
  for (const e of EXPR) { const i = webp(`assets/npc/vargas/closeup/${e}.webp`); assert.deepEqual([i.sig, i.type, i.w, i.h], ['WEBP', 'VP8L+alpha', 573, 760], e); }
  const f = webp('assets/npc/vargas/face.webp'); assert.deepEqual([f.sig, f.type, f.w, f.h], ['WEBP', 'VP8L+alpha', 256, 256]);
  const md = readFileSync(path.join(ROOT, 'assets/npc/vargas/README.md'), 'utf8');
  assert.match(md, /画像内容から決めた仮名・要確認/); assert.match(md, /市松模様/);
  for (const e of EXPR) assert.ok(md.includes(`closeup/${e}.webp`), e);
});

test('VAR-3：一言は VARGAS_TALK.locked。短く重い口調（〜だ／〜来い）。開放条件を断言しない。軽い言い方・怒鳴り・古風すぎる武人語は使わない', () => {
  const T = vargasTalk();
  assert.deepEqual(T, { locked: ['ここは闘技場だ。今はまだ、その時ではない。', '準備が整ってから来い。', '挑む覚悟ができたら、また来い。'] });
  for (const s of T.locked) {
    assert.ok(s.length <= 24, `短く：${s}`);
    assert.doesNotMatch(s, /だぜ|ぜ！|！！|ランク|勝利|優勝|クリア|育成完了|レベル|条件|報酬|G$|でござる|拙者|なのだ|ですね|ましょう/, s);
  }
  assert.match(lineOf('const VARGAS_FACE='), /^const VARGAS_FACE="assets\/npc\/vargas\/face\.webp";/);
});

test('VAR-4：闘技場はロック表示のまま。押すと案内文（システム表示）と、ヴァルガスの一言だけ。画面遷移・セーブ・バトル・開放条件は無い。Phase 6 には入れない', () => {
  assert.match(lineOf('const TOWN_CMDS='), /\["闘技場","未開放","#tic-arena","townArena\(\)","lock",0,\[\d+,\d+\]\]/, '街の札（地図の上の闘技場）はロックのまま');
  assert.equal(lineOf('function townArena('), 'function townArena(){townLock("闘技場は、まだ利用できません。");vgSay()}', '案内文（townLock＝システム表示）とヴァルガスの一言を背景の上に出す（2026-09-30：街は1画面で固定）');
  const vg = lineOf('function vgSay(');
  assert.doesNotThrow(() => new Function(vg), 'vgSay は構文として正しい');
  assert.ok(vg.endsWith('</div></div>`);try{document.getElementById("vgsay").scrollIntoView({block:"nearest"})}catch(e){}}'), '出したら画面内へ（小さい画面で案内欄の下に隠れないように）');
  assert.ok(vg.includes('<div class="vgsay nst" id="vgsay" onclick="townMsgClose(this)"><img class="nstf" src="${VARGAS_STAND}" alt="" decoding="async"><div class="tx"><b>ヴァルガス</b>${VARGAS_TALK.locked[R(VARGAS_TALK.locked.length)]}</div></div>'), '2026-10-03：半身の立ち絵（正式 closeup）と会話窓');
  assert.ok(vg.includes('const o=document.getElementById("vgsay");if(o)o.remove();'), '押すたびに増えない');
  assert.doesNotMatch(vg, /save\(|lobby\(|fight\(|MMP8\.|S\./, '画面遷移・セーブ・バトル・状態の変更をしない');
  assert.equal((HTML.match(/vgSay\(/g) || []).length, 2, '定義＋闘技場のボタンの1か所だけ');
  const fight = HTML.slice(HTML.indexOf('async function fight('), HTML.indexOf('\n$("#snd").textContent'));
  assert.doesNotMatch(fight, /VARGAS|vgSay|ヴァルガス/, 'Phase 6（fight()）には入れない');
});

// ---------------------------------------------------------
// 実ブラウザ
// ---------------------------------------------------------
const SKIP = H.skipReason();
let L = null;
test.before(async () => { if (!SKIP) L = await H.launch(); });
test.after(async () => { if (L) await L.close(); });
const read = (pg) => pg.evaluate(() => {
  const v = [...document.querySelectorAll('.vgsay')].map((c) => { const i = c.querySelector('img');
    return { name: c.querySelector('b').textContent, src: i.getAttribute('src'), ok: i.complete && i.naturalWidth > 0, text: c.querySelector('.tx').textContent.replace(/^ヴァルガス/, '') }; });
  const m = document.querySelector('#msg');
  return { v, msg: m.textContent, msgFace: !!m.querySelector('img') || /ヴァルガス/.test(m.textContent), town: !!document.querySelector('.map.town'),
    lock: [...document.querySelectorAll('.tpin.lock')].map((b) => b.getAttribute('onclick')) };
});

test('VAR-B1：街：闘技場（ロック中）を押すと、案内文はシステム表示のまま、その下にヴァルガスの名前・顔・一言。街のまま・セーブは変わらない・何度押しても1つだけ', { skip: SKIP }, async () => {
  const p = await L.open(); const pg = p.page; const T = await pg.evaluate(() => VARGAS_TALK.locked);
  await H.newGame(pg, 'テスト');
  assert.equal(await pg.evaluate(() => document.querySelectorAll('.vgsay').length), 0, '押す前は出ない');
  const before = await H.storedSave(pg);
  for (let k = 0; k < 3; k++) {
    await pg.click('.hz[onclick="townArena()"]');
    await pg.waitForFunction(() => { const i = document.querySelector('.vgsay img'); return i && i.complete && i.naturalWidth > 0; });
    const r = await read(pg);
    assert.equal(r.v.length, 1, '一言は1つだけ（増えない）');
    assert.deepEqual([r.v[0].name, r.v[0].src, r.v[0].ok], ['ヴァルガス', 'assets/npc/vargas/closeup/stern.webp', true], '2026-10-03：半身の立ち絵（正式 closeup）');
    assert.ok(T.includes(r.v[0].text), r.v[0].text);
    assert.equal(r.msg, '闘技場は、まだ利用できません。'); assert.equal(r.msgFace, false, '案内文はシステム表示（顔・名前なし）');
    assert.equal(r.town, true, '街のまま'); assert.deepEqual(r.lock, ['townArena()', 'townGuild()'], 'ロック表示のまま（闘技場・聖獣士管理局）');
    if (k < 2) { await pg.click('#app>.tlow .vgsay .tx'); await pg.waitForFunction(() => !document.querySelector('#app>.tlow.on')); }   // 案内はタップで閉じる（下の札を押せるように）
  }
  assert.deepEqual(await H.storedSave(pg), before, 'セーブは変わらない');
  // ほかの施設へ行って戻ると消える（街を開き直したとき）
  await pg.evaluate(() => museum()); await pg.waitForSelector('.lab'); await pg.evaluate(() => lobby()); await pg.waitForSelector('.map.town');
  assert.equal(await pg.evaluate(() => document.querySelectorAll('.vgsay').length), 0);
  assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, [], '404なし');
  await p.ctx.close();
});

test('VAR-B2：4つの画面サイズで、ヴァルガスの吹き出しが画面に収まり（下のコマンドバーに隠れない）、横にはみ出さない', { skip: SKIP }, async () => {
  for (const size of Object.values(H.SIZES)) {
    const p = await L.open({ size }); const pg = p.page; const tag = size.join('×');
    await H.newGame(pg, 'テスト');
    await pg.click('.hz[onclick="townArena()"]');
    await pg.waitForFunction(() => { const i = document.querySelector('.vgsay img'); return i && i.complete && i.naturalWidth > 0; });
    const r = await pg.evaluate(() => { const b = document.querySelector('.vgsay').getBoundingClientRect(), bar = document.querySelector('.tbar').getBoundingClientRect(); return { inside: b.left >= -1 && b.right <= innerWidth + 1 && b.top >= 0 && b.bottom <= bar.top, sw: document.documentElement.scrollWidth, W: innerWidth }; });
    assert.ok(r.inside, `${tag}：吹き出しが画面内（下の施設コマンドバーの裏に隠れない）`); assert.ok(r.sw <= r.W + 1, `${tag}：横にはみ出さない（${r.sw}/${r.W}）`);
    assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
    await p.ctx.close();
  }
});
