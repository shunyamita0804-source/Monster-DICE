// =========================================================
// 街画面：背景＋施設コマンド（市場・牧場・研究所・闘技場・ファーム・プロフィール）
//  ・自由移動マップではなく、背景の上に建物ラベル、画面下に固定の施設コマンドバー（横一列に5つ）。背景は assets/town/town_main.jpg を
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
  assert.match(HTML, /\.tbar\{position:fixed;[^}]*bottom:0;[^}]*grid-template-columns:repeat\(6,minmax\(0,1fr\)\)/);
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
  test(`TW-B4（${size.join('×')}）：横はみ出しなし。6つのコマンドは画面下のバーに横一列・同じ幅（約1/6）・押せる大きさで、施設名・アイコンが切れず、他の要素に隠れていない。背景は下寄せで、市場はバーの裏に隠れず、闘技場の上部は画面の上で切れない`, { skip: SKIP }, async () => {
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
          return { ...x, hit: b.contains(hit), clip: t.left < x.l + 2 || t.right > x.r - 2 || t.bottom > x.b - 1, iclip: ic.left < x.l || ic.right > x.r || ic.top < x.t || ic.bottom > x.b, fs: parseFloat(getComputedStyle(b.querySelector('b')).fontSize) }; }) };
    });
    assert.ok(r.sw <= r.iw + 1, `横はみ出し ${r.sw} > ${r.iw}`);
    assert.ok(Math.abs(r.bar.b - size[1]) <= 1 && r.bar.l <= 0.5 && Math.abs(r.bar.r - size[0]) <= 1, 'バーは画面の下端・幅いっぱい');
    assert.ok(Math.abs(r.map.b - r.bar.t) <= 1, '街の枠の下端＝バーの上端');
    assert.ok(Math.abs(r.bg.b - r.bar.t) <= 1, `背景は下寄せ：画像の下端（市場）がバーの上端にそろい、裏に隠れない（${r.bg.b}/${r.bar.t}）`);
    assert.ok(r.bg.t <= 0.5, '背景の上に隙間を作らない（切るのは上側）');
    assert.ok(r.arenaTop >= 0, `闘技場の上部（画像の y=240）が画面の上で切れない（${Math.round(r.arenaTop)}）`);
    assert.ok(r.bg.l <= 4 && r.bg.r >= r.iw - 4, '左右の余白は出してもごく細い（4px以下）');
    for (const [name, x] of r.lbl) assert.ok(x.l >= 0 && x.r <= r.iw && x.t >= 0 && x.b <= r.bar.t, `建物ラベル「${name}」は画面内で、バーより上`);
    const ys = new Set(r.b.map((b) => Math.round(b.t)));
    assert.equal(ys.size, 1, '横一列');
    assert.equal(r.b.length, 6);
    for (let i = 1; i < 6; i++) assert.ok(r.b[i].l > r.b[i - 1].r, '左から 市場・牧場・研究所・闘技場・ファーム・プロフィール');
    for (const b of r.b) {
      assert.ok(b.l >= 0 && b.r <= r.iw && b.t >= r.bar.t && b.b <= size[1], '最初の画面の中（バーの中）');
      assert.ok(b.w >= size[0] * 0.15 && b.w <= size[0] / 6 + 1, `幅は画面の約1/6（${b.w}）`);
      assert.equal(Math.round(b.h), size[1] <= 720 ? 70 : 82, '高さ：通常82px、高さの低い画面は70px（旧58px／50pxより大きく）');
      assert.ok(b.fs >= 12, `施設名の文字は12px以上（${b.fs}）`);
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
