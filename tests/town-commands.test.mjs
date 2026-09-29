// =========================================================
// 街画面：背景＋施設コマンド（市場・牧場・研究所・闘技場・ファーム・プロフィール）
//  ・自由移動マップではなく、背景の上に建物ラベル、画面下に固定の施設コマンド（2段：市場・牧場・研究所・闘技場／ファーム・プロフィール）と、上の左右のお知らせ・設定。背景は assets/town/town_main.jpg を
//    TOWN_BG の1か所から参照し、ファイルを置き換えるだけで差し替えられる。敷き方は「下寄せ」（下端をバーの上端にそろえ、上＝空から切る）。
//  ・博物館は「研究所」に名前を変えた（中身は従来の図鑑のまま。新機能は作らない）。
//  ・闘技場は開放条件が未実装のため、ロック表示にして押すと「まだ利用できません」とだけ案内する（条件は決めない）。
//  ・ファームは連れているモンスターがいるときだけ（育成中は街そのものへ来られない＝従来どおり）。
//  実ブラウザのテストは QA_E2E=1 のときだけ実行する（tests/e2e/harness.mjs）。
// =========================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as H from './e2e/harness.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const line = (p) => HTML.split('\n').find((l) => l.startsWith(p));
const LABELS = ['市場', '牧場', '研究所', '闘技場', 'ファーム', 'プロフィール'];   // 下部コマンドバー（2026-09-29）で「ファームへ」→「ファーム」（行き先は同じ hall()）。再調整でプロフィールを追加
const CALLS = ['market()', 'farm()', 'museum()', 'townArena()', 'hall()', 'profileScr()'];

test('TW-1：街の背景は TOWN_BG の1か所だけで参照し、ファイルが存在する（旧マップの埋め込み画像 MAPIMG は使わない）', () => {
  const bg = line('const TOWN_BG=');
  assert.equal(bg, 'const TOWN_BG="assets/town/town_main.jpg";');
  assert.ok(existsSync(path.join(ROOT, 'assets/town/town_main.jpg')));
  assert.equal((HTML.match(/town_main\.jpg/g) || []).length, 2, '定義の1行とコメントの1か所だけ');
  assert.equal((HTML.match(/\$\{TOWN_BG\}/g) || []).length, 1, 'lobby() から1回だけ使う');
  assert.doesNotMatch(HTML, /MAPIMG/);
  assert.match(HTML, /\.tbg\{[^}]*top:calc\(var\(--tva\) - 2048 \* var\(--ts\)\)[^}]*background:var\(--town-bg\) center\/100% 100% no-repeat/, '下寄せ：画像の下端を街の枠（バーの上端）にそろえる');
  assert.match(HTML, /--ts:max\(min\(max\(100cqw \/ 1152,var\(--tva\) \/ 2048\),\(var\(--tva\) - 4px\) \/ 1808\),var\(--tva\) \/ 2048\)/, '幅いっぱいが基本。闘技場の上部（y=240）が画面の上端で切れるときは縮める');
  assert.match(HTML, /\.tlbl\{[^}]*top:calc\(var\(--tva\) - \(2048 - var\(--y\)\) \* var\(--ts\)\)/, '建物ラベルも同じ下寄せの計算');
});

test('TW-2：施設コマンドは 市場・牧場・研究所・闘技場・ファーム・プロフィール の6つ（この順番）。行き先は従来の画面。画面下のバー（.tbar）に並べ、右側の縦並び（.map.town の中）は廃止', () => {
  const src = line('const TOWN_CMDS=');
  const f = new Function(`${src}\nreturn TOWN_CMDS;`)();
  assert.deepEqual(f({}).map((c) => [c[0], c[3], c[4]]), LABELS.map((l, i) => [l, CALLS[i], i === 3 ? 'lock' : 'ok']));
  assert.equal(f(null)[4][4], 'dis', 'モンスターがいないときファームは押せない（従来どおり）');
  assert.equal(f(null)[5][4], 'ok', 'プロフィールはいつでも押せる');
  const lobby = HTML.slice(HTML.indexOf('function lobby('), HTML.indexOf('\n}', HTML.indexOf('function lobby(')));
  assert.match(lobby, /<\/div><nav class="tcmds tbar" aria-label="街の施設">\$\{TOWN_CMDS\(m\)\.map/, 'バーは街の枠の外（画面下に固定）');
  assert.doesNotMatch(HTML, /\.map\.town \.tcmds/, '右側の縦並びの指定は残さない');
  assert.match(HTML, /\.tbar\{position:fixed;[^}]*bottom:0;[^}]*grid-template-columns:repeat\(20,minmax\(0,1fr\)\);grid-template-rows:var\(--tbr1\) var\(--tbr2\)/, '2段：20列で 5・5・5・5／11・9');
  assert.match(lobby, /\$\{i==4\?" tsub tfarm":i==5\?" tsub tprof":""\}/);
  assert.match(HTML, /button\.hz\.tcmd\.tfarm\{grid-column:span 11\}button\.hz\.tcmd\.tprof\{grid-column:span 9\}/, 'ファーム 55%・プロフィール 45%');
  assert.doesNotMatch(lobby, /townTop|tttl|tpinfo/, '街の上部の「街」の札・プレイヤー情報は置かない');
  assert.doesNotMatch(HTML.match(/\n\.tbar\{[^}]*\}/)[0], /transform/, 'バーの位置に transform を使わない（#app>* の登場アニメが transform を上書きして、表示直後にボタンがずれ押し間違えるため）'); assert.doesNotMatch(lobby, /mupin|博物館|style="left:/, '旧マップのタップ領域・博物館ピンは使わない');
});

test('TW-6：コマンドは施設名だけ（補足は title に残す）。アイコンは .ti に独立し、画像ファイルのパスを書けば画像で表示できる', () => {
  const f = new Function(`${line('const townIcon=')}\nreturn townIcon;`)();
  assert.equal(f('🛒'), '🛒'); assert.equal(f('assets/town/icons/market.png'), '<img src="assets/town/icons/market.png" alt="">');
  assert.equal(f('#tic-market'), '<svg viewBox="0 0 32 32" aria-hidden="true"><use href="#tic-market"/></svg>', '正式：金色の線画アイコン（TOWN_SVG の #tic-*）');
  const lobby = HTML.slice(HTML.indexOf('function lobby('), HTML.indexOf('\n}', HTML.indexOf('function lobby(')));
  assert.match(lobby, /<span class="ti">\$\{townIcon\(c\[2\]\)\}<\/span><b>\$\{c\[0\]\}<\/b><\/button>/); assert.match(lobby, /title="\$\{c\[1\]\}"/);
});

test('TW-3：闘技場は開放条件を新設せず、押しても案内を出すだけ（画面遷移・セーブをしない）。案内文はシステム表示のまま、ヴァルガスの一言（vgSay）を添える', () => {
  const fn = line('function townArena(');
  assert.equal(fn, 'function townArena(){const e=$("#msg");if(e)e.textContent="闘技場は、まだ利用できません。";vgSay()} // ロック表示のまま（開放条件・内容は未決）。案内文はシステム表示、ヴァルガスは一言だけ');
  assert.doesNotMatch(line('function vgSay('), /save\(|lobby\(|innerHTML=|fight\(|MMP8\./, 'ヴァルガスの一言は、画面遷移・セーブ・バトルをしない');
});

test('TW-4：博物館は研究所へ（表示名・戻るボタン・育成中の案内）。中身の図鑑はそのまま', () => {
  const vis = HTML.replace(/data:[a-z/+]+;base64,[A-Za-z0-9+/=]+/g, '').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  assert.doesNotMatch(vis, /博物館/, '画面に出る文字に「博物館」は残さない（コメントの旧名の記録は除く）');
  assert.match(HTML, /<b>モンスター研究所<\/b>/); assert.match(HTML, /◀ 研究所にもどる/);
  assert.match(HTML, /育成中は、街・牧場・市場・研究所へは行けません。/);
  assert.match(HTML, /class="mgc" onclick="musd\(\$\{i\}\)"/, '図鑑（一覧→詳細）は従来どおり');
});

test('TW-5：廃止済みの寿命にもとづく「預けている間、モンスターは年をとりません。」は出さない', () => {
  assert.doesNotMatch(HTML, /年をとりません/);
});

// ---------------- 実ブラウザ ----------------
const SKIP = H.skipReason();
let L;
test.before(async () => { if (!SKIP) L = await H.launch(); });
test.after(async () => { if (L) await L.close(); });

async function town(p, name = 'テスト', gold) {
  await H.newGame(p.page, name);
  if (gold != null) await p.page.evaluate((g) => { S.g = g; save(); lobby(); }, gold);
  await p.page.waitForSelector('.tbar .tcmd');
}
const cmds = (pg) => pg.evaluate(() => [...document.querySelectorAll('.tbar .tcmd')].map((b) => ({
  label: b.querySelector('b').textContent, call: b.getAttribute('onclick'), disabled: b.disabled, lock: b.classList.contains('lock') })));
const toTown = async (pg) => { await pg.locator('button', { hasText: '街にもどる' }).first().click(); await pg.waitForSelector('.tbar .tcmd'); };

test('TW-B1：新規開始後の街：背景画像を読み込み、5つのコマンドが見える。ファームはモンスターがいないので押せない', { skip: SKIP }, async () => {
  const p = await L.open(); const pg = p.page;
  await town(p);
  assert.deepEqual((await cmds(pg)).map((c) => [c.label, c.call, c.disabled, c.lock]),
    [['市場', 'market()', false, false], ['牧場', 'farm()', false, false], ['研究所', 'museum()', false, false], ['闘技場', 'townArena()', false, true], ['ファーム', 'hall()', true, false], ['プロフィール', 'profileScr()', false, false]]);
  assert.equal(await pg.evaluate(() => document.querySelectorAll('.tttl, .tpinfo, .tplate').length), 0, '上部の「街」の札・プレイヤー情報は無い');
  const bg = await pg.evaluate(() => getComputedStyle(document.querySelector('.map.town .tbg')).backgroundImage);
  assert.match(bg, /assets\/town\/town_main\.jpg/);
  await pg.waitForFunction(() => performance.getEntriesByType('resource').some((r) => r.name.endsWith('town_main.jpg')));
  assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
});

test('TW-B2：各コマンドの遷移と「街にもどる」：市場・牧場・研究所（一覧→詳細→研究所→街）・闘技場（案内だけ）・ファーム', { skip: SKIP }, async () => {
  const p = await L.open(); const pg = p.page;
  await town(p, 'テスト', 1000);
  // 市場（カルーセル）→ 戻る
  await pg.click('.hz[onclick="market()"]'); await pg.waitForSelector('#p10car');
  await pg.click('.p10back'); await pg.waitForSelector('.tbar .tcmd');
  // 牧場 → 戻る
  await pg.click('.hz[onclick="farm()"]'); await pg.waitForSelector('#app .ftiles'); await toTown(pg);
  // 研究所 → 詳細 → 研究所 → 街
  await pg.click('.hz[onclick="museum()"]'); await pg.waitForSelector('.mgrid');
  assert.match(await H.text(pg), /モンスター研究所/);
  await pg.click('.mgc[onclick="musd(0)"]'); await pg.waitForSelector('.mk2 .pcard');
  assert.match(await H.text(pg), /◀ 研究所/);
  await pg.click('.mk2 .dback.wide'); await pg.waitForSelector('.mgrid'); await toTown(pg);
  // 闘技場：未開放の案内だけ（街のまま・セーブは変わらない）
  const before = await H.storedSave(pg);
  await pg.click('.hz[onclick="townArena()"]');
  assert.equal(await pg.evaluate(() => document.querySelector('#msg').textContent), '闘技場は、まだ利用できません。');
  assert.ok(await pg.evaluate(() => !!document.querySelector('.map.town')));
  assert.deepEqual(await H.storedSave(pg), before);
  // モンスターを連れているとファーム（育成前の出発準備の入口）へ行ける
  await pg.click('.hz[onclick="market()"]'); await H.marketDetail(pg); await pg.waitForSelector('.p10buy:not([disabled])'); await pg.waitForFunction(() => !P10_ANIM);
  await pg.waitForTimeout(500); await H.marketDetail(pg); await pg.click('.p10buy'); await pg.waitForSelector('#p10ov .p10ok'); await pg.waitForTimeout(600);
  await pg.click('#p10ov .p10ok'); await pg.waitForSelector('.tbar .tcmd');
  assert.equal((await cmds(pg))[4].disabled, false);
  await pg.click('.hz[onclick="hall()"]'); await pg.waitForSelector('#app button[onclick="prepScr()"]');
  assert.equal((await H.getS(pg)).m.raise.state, 'none', 'ファームへ行っただけでは育成は始まらない');
  await pg.evaluate(() => lobby()); await pg.waitForSelector('.tbar .tcmd');
  // プロフィール → 街
  const s0 = await H.storedSave(pg);
  await pg.click('.hz[onclick="profileScr()"]'); await pg.waitForSelector('.pfds');
  const pf = await pg.evaluate(() => ({ t: document.querySelector('.pfds .tplate').innerText.replace(/\s+/g, ' '), bar: document.querySelectorAll('.tbar').length }));
  assert.match(pf.t, /^プレイヤー テスト 所持金 500 ?G 最高到達ランク ー 獲得トロフィー 準備中$/, '暫定の器：名前・所持金・最高到達ランク・獲得トロフィー（枠だけ）');
  assert.equal(pf.bar, 0, 'プロフィールでは街のコマンドバーを出さない');
  assert.deepEqual(await H.storedSave(pg), s0, 'プロフィールを開いてもセーブは変わらない');
  await toTown(pg);
  assert.equal((await cmds(pg)).length, 6, '街へ戻ると6つのコマンド');
  assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
});

test('TW-B3：再読み込み→開始でも街はコマンド式で表示される（セーブ v6・mr4v6 のまま）', { skip: SKIP }, async () => {
  const p = await L.open(); const pg = p.page;
  await town(p, 'テスト', 1000);
  const s1 = await H.storedSave(pg);
  await pg.reload(); await pg.waitForFunction(() => typeof S === 'object');
  await pg.click('[onclick*="startGame"]'); await pg.waitForSelector('.tbar .tcmd');
  assert.equal((await cmds(pg)).length, 6);
  const s2 = await H.storedSave(pg);
  assert.equal(s2.v, 6); assert.deepEqual(s2, s1);
  assert.deepEqual(p.errors, []);
});

for (const [k, size] of Object.entries(H.SIZES)) {
  test(`TW-B4（${size.join('×')}）：横はみ出しなし。コマンドは画面下に2段（1段目4等分・2段目ファーム55%／プロフィール45%）・押せる大きさで、施設名・アイコンが切れず、他の要素に隠れていない。背景は下寄せで、市場はバーの裏に隠れず、闘技場の上部は画面の上で切れない`, { skip: SKIP }, async () => {
    const p = await L.open({ size }); const pg = p.page;
    await town(p);
    await pg.evaluate(async () => { await document.fonts.ready; });
    const r = await pg.evaluate(() => {
      const R = (e) => { const x = e.getBoundingClientRect(); return { l: x.left, t: x.top, r: x.right, b: x.bottom, w: x.width, h: x.height }; };
      const map = R(document.querySelector('.map.town')), bar = R(document.querySelector('.tbar')), bg = R(document.querySelector('.tbg'));
      const ts = bg.h / 2048, top = 0;
      return { sw: document.documentElement.scrollWidth, iw: innerWidth, map, bar, bg, arenaTop: bg.t + 240 * ts, plates: top,
        lbl: [...document.querySelectorAll('.tlbl')].map((e) => [e.textContent, R(e)]),
        b: [...document.querySelectorAll('.tbar .tcmd')].map((b) => { const x = R(b); const hit = document.elementFromPoint(x.l + x.w / 2, x.t + x.h / 2);
          const rg = document.createRange(); rg.selectNodeContents(b.querySelector('b')); const t = rg.getBoundingClientRect(), ic = b.querySelector('.ti').getBoundingClientRect();
          return { ...x, hit: b.contains(hit), clip: t.left < x.l + 2 || t.right > x.r - 2 || t.bottom > x.b - 1 || (b.classList.contains('tsub') && t.left < ic.right), iclip: ic.left < x.l || ic.right > x.r || ic.top < x.t || ic.bottom > x.b, fs: parseFloat(getComputedStyle(b.querySelector('b')).fontSize) }; }) };
    });
    assert.ok(r.sw <= r.iw + 1, `横はみ出し ${r.sw} > ${r.iw}`);
    assert.ok(Math.abs(r.bar.b - size[1]) <= 1 && r.bar.l <= 0.5 && Math.abs(r.bar.r - size[0]) <= 1, 'バーは画面の下端・幅いっぱい');
    assert.ok(Math.abs(r.map.b - r.bar.t) <= 1, '街の枠の下端＝バーの上端');
    assert.ok(Math.abs(r.bg.b - r.bar.t) <= 1, `背景は下寄せ：画像の下端（市場）がバーの上端にそろい、裏に隠れない（${r.bg.b}/${r.bar.t}）`);
    assert.ok(r.bg.t <= 0.5, '背景の上に隙間を作らない（切るのは上側）');
    assert.ok(r.arenaTop >= 0, `闘技場の上部（画像の y=240）が画面の上で切れない（${Math.round(r.arenaTop)}）`);
    const gap = size[1] <= 720 ? 24 : 4;
    assert.ok(r.bg.l <= gap && r.bg.r >= r.iw - gap, `左右の濃紺の余白は ${gap}px 以下（低い画面だけ、闘技場の上部を残すために出る）`);
    const rd = await pg.evaluate(() => [...document.querySelectorAll('.map.town .tround')].map((e) => { const x = e.getBoundingClientRect(); return [e.getAttribute('aria-label'), x.left, x.top, x.width, x.height, e.getAttribute('onclick'), e.contains(document.elementFromPoint(x.left + x.width / 2, x.top + x.height / 2))]; }));
    assert.deepEqual(rd.map((x) => [x[0], x[5], x[6]]), [['お知らせ', 'newsScr()', true], ['設定', 'confScr()', true]], '上の左にお知らせ・右に設定（押せる）');
    assert.ok(rd[0][1] <= 12 && rd[1][1] + rd[1][3] >= r.iw - 12 && rd.every((x) => x[3] >= 44 && x[4] >= 44 && x[2] >= 0 && x[2] + x[4] <= 60), '左右の端・上の端で、押せる大きさ（44px以上）');
    assert.equal(await pg.evaluate(() => getComputedStyle(document.querySelector('#snd')).display), 'none', '街では右上の音のボタンを隠す（設定の中で切り替える）');
    for (const [name, x] of r.lbl) assert.ok(x.l >= 0 && x.r <= r.iw && x.t >= 0 && x.b <= r.bar.t, `建物ラベル「${name}」は画面内で、バーより上`);
    assert.equal(r.b.length, 6);
    const row1 = r.b.slice(0, 4), row2 = r.b.slice(4), H1 = size[1] <= 720 ? 68 : 84, H2 = size[1] <= 720 ? 48 : 58;
    assert.equal(new Set(row1.map((b) => Math.round(b.t))).size, 1, '1段目は横一列'); assert.equal(new Set(row2.map((b) => Math.round(b.t))).size, 1, '2段目は横一列');
    assert.ok(row2[0].t > row1[0].b, '2段目は1段目の下');
    for (const row of [row1, row2]) for (let i = 1; i < row.length; i++) assert.ok(row[i].l > row[i - 1].r, '左から 市場・牧場・研究所・闘技場／ファーム・プロフィール');
    for (const b of row1) { assert.ok(b.w >= size[0] * 0.21 && b.w <= size[0] / 4, `1段目は4等分（${b.w}）`); assert.equal(Math.round(b.h), H1, `1段目の高さ ${H1}px`); }
    for (const b of row2) assert.equal(Math.round(b.h), H2, `2段目の高さ ${H2}px`);
    const ratio = row2[0].w / (row2[0].w + row2[1].w); assert.ok(ratio > 0.53 && ratio < 0.57, `ファーム：プロフィール＝55：45（${ratio}）`);
    for (const b of r.b) {
      assert.ok(b.l >= 0 && b.r <= r.iw && b.t >= r.bar.t && b.b <= size[1], '最初の画面の中（バーの中）');
      assert.ok(b.w >= 80 && b.h >= 48, `押しやすい大きさ（${b.w}×${b.h}。6個横一列のときは約61×82）`);
      assert.ok(b.fs >= 15, `施設名の文字は15px以上（${b.fs}）`);
      assert.ok(!b.iclip, 'アイコンが切れていない');
      assert.ok(b.hit, '他の要素に隠れていない');
      assert.ok(!b.clip, '施設名が切れていない');
    }
    // 下へスクロールしてもバーは画面下に出たまま。いちばん下の要素（セーブ・ロード）はバーの裏に隠れない
    const s = await pg.evaluate(() => { scrollTo(0, 1e6); const bar = document.querySelector('.tbar').getBoundingClientRect(), sv = document.querySelector('.svb').getBoundingClientRect(); return { bar: [bar.top, bar.bottom], sv: sv.bottom, y: scrollY }; });
    assert.ok(s.y > 0 && Math.abs(s.bar[1] - size[1]) <= 1 && s.sv <= s.bar[0], `スクロールしてもバーは画面下・セーブ・ロードは隠れない（${JSON.stringify(s)}）`);
    assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
  });
}

test('TW-B5：施設から街へ戻った直後（登場アニメの間）も、コマンドの横位置はずれない。すぐ押しても押した施設へ行く（64b2faf の押し間違いの再発防止）', { skip: SKIP }, async () => {
  const p = await L.open(); const pg = p.page;
  await town(p, 'テスト', 1000);
  const want = await pg.evaluate(() => [...document.querySelectorAll('.tbar .tcmd')].map((b) => Math.round(b.getBoundingClientRect().left)));
  for (let k = 0; k < 3; k++) {
    await pg.evaluate(() => museum()); await pg.waitForSelector('.mgrid');
    // 街を開いた直後から0.45秒間、毎フレーム位置を測る
    const xs = await pg.evaluate(() => new Promise((res) => { lobby(); const out = [], t0 = performance.now();
      const f = () => { out.push([...document.querySelectorAll('.tbar .tcmd')].map((b) => Math.round(b.getBoundingClientRect().left))); if (performance.now() - t0 < 450) requestAnimationFrame(f); else res(out); }; f(); }));
    assert.ok(xs.length >= 3);
    for (const x of xs) assert.deepEqual(x, want, '登場アニメの間も横位置は同じ');
  }
  // 戻った直後にすぐ牧場を押す → 牧場（研究所など別の施設にならない）
  await pg.evaluate(() => museum()); await pg.waitForSelector('.mgrid');
  await pg.evaluate(() => lobby()); await pg.mouse.click(...(await pg.evaluate(() => { const b = document.querySelector('.hz[onclick="farm()"]').getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; })));
  await pg.waitForSelector('#app .ftiles');
  assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
});

test('TW-B6：お知らせ（準備中の画面）・設定（BGM・効果音のオン／オフ＝既存の sndToggle）。街と設定では右上の音のボタンを隠し、ほかの画面ではこれまでどおり出る。セーブは変わらない', { skip: SKIP }, async () => {
  const p = await L.open(); const pg = p.page;
  await town(p, 'テスト', 1000);
  const s0 = await H.storedSave(pg);
  const snd = () => pg.evaluate(() => ({ disp: getComputedStyle(document.querySelector('#snd')).display, on: AU.on, icon: document.querySelector('#snd').textContent, ls: localStorage.getItem('mr4a') }));
  await pg.click('.tround.tnews'); await pg.waitForSelector('.tnewsscr');
  assert.match(await H.text(pg), /お知らせ[\s\S]*お知らせは準備中です。/);
  await pg.click('.dtop .dback'); await pg.waitForSelector('.tbar .tcmd');
  await pg.click('.tround.tconf'); await pg.waitForSelector('.tset');
  assert.equal((await snd()).disp, 'none', '設定の中に同じ切り替えがあるので、右上の音のボタンは隠す');
  const on0 = (await snd()).on;
  await pg.click('.tset .tsnd');
  let s = await snd();
  assert.deepEqual([s.on, s.icon, s.ls], [!on0, !on0 ? '🔊' : '🔇', !on0 ? '1' : '0'], '既存の音の切り替え（AU.on・右上のボタンの表示・mr4a）');
  assert.equal(await pg.evaluate(() => document.querySelector('.tset .tsnd').textContent), !on0 ? '🔊 オン' : '🔇 オフ');
  await pg.click('.tset .tsnd'); s = await snd(); assert.equal(s.on, on0, 'もう一度押すと元に戻る');
  await pg.click('.dtop .dback'); await pg.waitForSelector('.tbar .tcmd');
  assert.equal((await snd()).disp, 'none');
  await pg.click('.hz[onclick="museum()"]'); await pg.waitForSelector('.mgrid');
  assert.notEqual((await snd()).disp, 'none', 'ほかの画面では右上の音のボタンがこれまでどおり出る');
  await pg.evaluate(() => lobby()); await pg.waitForSelector('.tbar .tcmd');
  const s1 = await H.storedSave(pg); assert.deepEqual(s1, s0, 'お知らせ・設定を開いてもセーブは変わらない');
  assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
});
