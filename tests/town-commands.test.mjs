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
// 2026-10-03 品質向上：施設（市場・牧場・研究所・闘技場・聖獣士管理局）は街の背景の上の札（押せる）、下のバーはファーム・プロフィール・セーブ・ロード。
//  2026-10-04：アイテム屋は街の施設ではない（正式）＝ファームの屋台から。街の札から外した
const LABELS = ['市場', '牧場', '研究所', '闘技場', '聖獣士管理局', 'ファーム', 'プロフィール', 'セーブ・ロード'];
const CALLS = ['market()', 'farm()', 'museum()', 'townArena()', 'townGuild()', 'hall()', 'profileScr()', 'savescr()'];
const PINS = 5;

test('TW-1：街の背景は TOWN_BG の1か所だけで参照し、ファイルが存在する（2026-10-03：正式ミストリア mistria_main.webp。旧 town_main.jpg はファイルだけ残す）', () => {
  const bg = line('const TOWN_BG=');
  assert.equal(bg, 'const TOWN_BG="assets/town/mistria_main.webp",TOWN_IMG={w:768,h:1360,top:26};');
  assert.ok(existsSync(path.join(ROOT, 'assets/town/mistria_main.webp'))); assert.ok(existsSync(path.join(ROOT, 'assets/town/town_main.jpg')), '旧背景は消さない');
  assert.equal((HTML.match(/\$\{TOWN_BG\}/g) || []).length, 1, 'lobby() から1回だけ使う');
  assert.doesNotMatch(HTML, /MAPIMG/);
  assert.match(HTML, /\.tbg\{[^}]*top:calc\(var\(--tva\) - var\(--tih\) \* var\(--ts\)\)[^}]*background:var\(--town-bg\) center\/100% 100% no-repeat/, '下寄せ：画像の下端を街の枠（バーの上端）にそろえる');
  assert.match(HTML, /--tiw:768;--tih:1360;--ttop:26;--ts:max\(min\(max\(100cqw \/ var\(--tiw\),var\(--tva\) \/ var\(--tih\)\),\(var\(--tva\) - 4px\) \/ \(var\(--tih\) - var\(--ttop\)\)\),var\(--tva\) \/ var\(--tih\)\)/, '幅いっぱいが基本。闘技場の上端（y=26）が画面の上端で切れるときは縮める');
  assert.match(HTML, /\.tpin\{[^}]*top:calc\(var\(--tva\) - \(var\(--tih\) - var\(--y\)\) \* var\(--ts\)\)/, '施設の札も同じ下寄せの計算');
});

test('TW-2：施設は街の背景の上の札（押せる。下のバーと二重に出さない）＝市場・牧場・研究所・闘技場・聖獣士管理局（アイテム屋は街に無い＝2026-10-04）。下のバーはファーム・プロフィール・セーブ・ロード（1段）。行き先は従来の画面', () => {
  const src = line('const TOWN_CMDS=');
  const f = new Function(`${src}\nreturn TOWN_CMDS;`)();
  assert.deepEqual(f({}).map((c) => [c[0], c[3], c[4]]), LABELS.map((l, i) => [l, CALLS[i], [3, 4].includes(i) ? 'lock' : 'ok']));
  assert.deepEqual(f({}).map((c) => !!c[6]), LABELS.map((l, i) => i < PINS), '5つの施設は地図の上の札（7番目に背景の画素の位置）');
  assert.equal(f(null)[5][4], 'dis', 'モンスターがいないときファームは押せない（従来どおり）');
  assert.equal(f(null)[6][4], 'ok'); assert.equal(f(null)[7][4], 'ok'); assert.equal(f({})[7][5], 'セーブ<br>ロード', 'セーブ・ロードは2行');
  const lobby = HTML.slice(HTML.indexOf('function lobby('), HTML.indexOf('\n}', HTML.indexOf('function lobby(')));
  assert.match(lobby, /\$\{townPins\(m\)\.map\(c=>`<button class="hz tpin /, '施設は背景の上の札（ボタン）');
  assert.match(lobby, /<\/div><nav class="tcmds tbar" aria-label="街のコマンド">\$\{townBar\(m\)\.map/, 'バーは街の枠の外（画面下に固定）');
  assert.doesNotMatch(lobby, /tlbl|TOWN_LABELS/, '押せない建物ラベルと施設コマンドの二重表示はやめた');
  assert.match(HTML, /\.tbar\{position:fixed;[^}]*bottom:0;[^}]*grid-template-columns:repeat\(40,minmax\(0,1fr\)\);grid-template-rows:var\(--tbr2\);/, '1段：40列');
  assert.match(HTML, /button\.hz\.tcmd\.tfarm\{grid-column:span 22\}/); assert.match(HTML, /\.tbar button\.hz\.tcmd\.tprof,\.tbar button\.hz\.tcmd\.tsave\{grid-column:span 9;/, 'ファーム 55%・プロフィール 22.5%・セーブ・ロード 22.5%');
  assert.match(lobby, /\$\{i==0\?" tsub tfarm":i==1\?" tsub tprof":" tsub tsave svb"\}/);
  assert.doesNotMatch(lobby, /townTop|tttl|tpinfo/, '街の上部の「街」の札・プレイヤー情報は置かない');
  assert.doesNotMatch(HTML.match(/\n\.tbar\{[^}]*\}/)[0], /transform/, 'バーの位置に transform を使わない'); assert.doesNotMatch(lobby, /mupin|博物館/, '旧マップのタップ領域・博物館ピンは使わない');
  assert.match(HTML, /function townGuild\(\)\{townLock\("聖獣士管理局は、まだ利用できません。"\)\}/, '聖獣士管理局は街の上の存在だけ（中は素材・仕様が無いので作らない）');
  assert.doesNotMatch(HTML, /function townShop\(|SHOP_FROM=/, '2026-10-04：街の独立したアイテム屋は無い（ファームの屋台 shopScr だけ）');
});

test('TW-6：コマンドは施設名だけ（補足は title に残す）。アイコンは .ti に独立し、画像ファイルのパスを書けば画像で表示できる', () => {
  const f = new Function(`${line('const townIcon=')}\nreturn townIcon;`)();
  assert.equal(f('🛒'), '🛒'); assert.equal(f('assets/town/icons/market.png'), '<img src="assets/town/icons/market.png" alt="">');
  assert.equal(f('#tic-market'), '<svg viewBox="0 0 32 32" aria-hidden="true"><use href="#tic-market"/></svg>', '正式：金色の線画アイコン（TOWN_SVG の #tic-*）');
  const lobby = HTML.slice(HTML.indexOf('function lobby('), HTML.indexOf('\n}', HTML.indexOf('function lobby(')));
  assert.match(lobby, /<span class="ti">\$\{townIcon\(c\[2\]\)\}<\/span><b>\$\{c\[5\]\|\|c\[0\]\}<\/b><\/button>/, '表示名（2行など）があればそれ、無ければ施設名'); assert.match(lobby, /title="\$\{c\[1\]\}"/);
});

test('TW-3：闘技場は開放条件を新設せず、押しても案内を出すだけ（画面遷移・セーブをしない）。案内文はシステム表示のまま、ヴァルガスの一言（vgSay）を添える', () => {
  assert.match(line('function townArena('), /^function townArena\(\)\{townLock\("闘技場は、まだ利用できません。"\);if\(!npcFirst\("arena"\)\)vgSay\(\)\}/);
  assert.match(line('function townLock('), /^function townLock\(t\)\{const e=\$\("#msg"\);if\(e\)e\.textContent=t;const w=\$\("#app>\.tlow"\);if\(w\)\{w\.classList\.add\("on"\);/);
  assert.doesNotMatch(line('function townLock(') + line('function vgSay('), /save\(|lobby\(|innerHTML=|fight\(|MMP8\./, '案内とヴァルガスの一言は、画面遷移・セーブ・バトルをしない');
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
// 2026-10-03：施設は背景の上の札（.tpin）＋下のバー（.tbar .tcmd）
const cmds = (pg) => pg.evaluate(() => [...document.querySelectorAll('.map.town .tpin, .tbar .tcmd')].map((b) => ({
  label: (b.querySelector('b') || b.querySelector('span')).textContent, call: b.getAttribute('onclick'), disabled: b.disabled, lock: b.classList.contains('lock') })));
const toTown = async (pg) => { await pg.locator('button', { hasText: '街にもどる' }).first().click(); await pg.waitForSelector('.tbar .tcmd'); };

test('TW-B1：新規開始後の街：正式ミストリアの背景を読み込み、6つの施設の札と下のバー（ファーム・プロフィール・セーブ・ロード）が見える。ファームとアイテム屋はモンスターがいないので押せない', { skip: SKIP }, async () => {
  const p = await L.open(); const pg = p.page;
  await town(p);
  assert.deepEqual((await cmds(pg)).map((c) => [c.label, c.call, c.disabled, c.lock]),
    [['市場', 'market()', false, false], ['牧場', 'farm()', false, false], ['研究所', 'museum()', false, false], ['闘技場', 'townArena()', false, true], ['聖獣士管理局', 'townGuild()', false, true], ['アイテム屋', 'townShop()', true, false], ['ファーム', 'hall()', true, false], ['プロフィール', 'profileScr()', false, false], ['セーブロード', 'savescr()', false, false]]);
  assert.equal(await pg.evaluate(() => document.querySelectorAll('.tttl, .tpinfo, .tplate, .tlbl').length), 0, '上部の「街」の札・プレイヤー情報・押せない建物ラベルは無い');
  const bg = await pg.evaluate(() => getComputedStyle(document.querySelector('.map.town .tbg')).backgroundImage);
  assert.match(bg, /assets\/town\/mistria_main\.webp/);
  await pg.waitForFunction(() => performance.getEntriesByType('resource').some((r) => r.name.endsWith('mistria_main.webp')));
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
  await pg.click('.hz[onclick="museum()"]'); await pg.waitForSelector('.lab .labnpc');
  assert.match(await H.text(pg), /モンスター研究所/);
  await pg.click('.labc[onclick="museum(\'book\')"]'); await pg.waitForSelector('.mgrid');
  await pg.click('.mgc[onclick="musd(0)"]'); await pg.waitForSelector('.mk2 .pcard');
  assert.match(await H.text(pg), /◀ 図鑑/);
  await pg.click('.mk2 .dback.wide'); await pg.waitForSelector('.mgrid'); await pg.click('.dtop .dback'); await pg.waitForSelector('.lab .labnpc'); await toTown(pg);
  // 聖獣士管理局：準備中の案内だけ（中は作らない）
  const b0 = await H.storedSave(pg); await pg.click('.hz[onclick="townGuild()"]');
  assert.equal(await pg.evaluate(() => document.querySelector('#msg').textContent), '聖獣士管理局は、まだ利用できません。'); assert.deepEqual(await H.storedSave(pg), b0);
  // 闘技場：未開放の案内だけ（街のまま・セーブは変わらない）
  const before = await H.storedSave(pg);
  await pg.click('.hz[onclick="townArena()"]');
  assert.equal(await pg.evaluate(() => document.querySelector('#msg').textContent), '闘技場は、まだ利用できません。');
  assert.ok(await pg.evaluate(() => !!document.querySelector('.map.town')));
  assert.deepEqual(await H.storedSave(pg), before);
  // 案内（闘技場の通知・ヴァルガスの一言）はタップで閉じる（下の施設の札を押せるように）
  await pg.click('#app>.tlow .dlg'); await pg.waitForFunction(() => !document.querySelector('#app>.tlow.on'));
  // モンスターを連れているとファーム（育成前の出発準備の入口）へ行ける
  await pg.click('.hz[onclick="market()"]'); await H.marketDetail(pg); await pg.waitForSelector('.p10buy:not([disabled])'); await pg.waitForFunction(() => !P10_ANIM);
  await pg.waitForTimeout(500); await H.marketDetail(pg); await pg.click('.p10buy'); await pg.waitForSelector('#p10ov .p10ok'); await pg.waitForTimeout(600);
  await pg.click('#p10ov .p10ok'); await pg.waitForSelector('.tbar .tcmd');
  assert.equal((await cmds(pg))[6].disabled, false); assert.equal((await cmds(pg))[5].disabled, false, 'モンスターがいればアイテム屋へ行ける');
  await pg.click('.hz[onclick="townShop()"]'); await pg.waitForSelector('.ds.shop'); assert.equal(await pg.evaluate(() => document.querySelector('.ds.shop .dback').textContent), '◀ 街にもどる'); await toTown(pg);
  await pg.click('.hz[onclick="hall()"]'); await pg.waitForSelector('#app button[onclick="prepScr()"]');
  assert.equal((await H.getS(pg)).m.raise.state, 'none', 'ファームへ行っただけでは育成は始まらない');
  await pg.evaluate(() => lobby()); await pg.waitForSelector('.tbar .tcmd');
  // プロフィール → 街
  const s0 = await H.storedSave(pg);
  await pg.click('.hz[onclick="profileScr()"]'); await pg.waitForSelector('.pfds');
  const pf = await pg.evaluate(() => ({ t: document.querySelector('.pfds .tplate').innerText.replace(/\s+/g, ' '), bar: document.querySelectorAll('.tbar').length }));
  assert.match(pf.t, /^プレイヤー テスト 所持金 500 ?G 最高到達ランク ー 育成完了 0 ?回 大会の勝利 0 ?勝 獲得トロフィー 準備中$/, '暫定の器：名前・所持金・最高到達ランク・育成完了・大会の勝利（2026-09-30 に街の下の欄から移した）・獲得トロフィー（枠だけ）');
  assert.equal(pf.bar, 0, 'プロフィールでは街のコマンドバーを出さない');
  assert.deepEqual(await H.storedSave(pg), s0, 'プロフィールを開いてもセーブは変わらない');
  await toTown(pg);
  assert.equal((await cmds(pg)).length, 9, '街へ戻ると施設の札6つ＋バーの3つ');
  assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
});

test('TW-B3：再読み込み→開始でも街はコマンド式で表示される（セーブ v6・mr4v6 のまま）', { skip: SKIP }, async () => {
  const p = await L.open(); const pg = p.page;
  await town(p, 'テスト', 1000);
  const s1 = await H.storedSave(pg);
  await pg.reload(); await pg.waitForFunction(() => typeof S === 'object');
  await pg.click('[onclick*="startGame"]'); await pg.waitForSelector('.tbar .tcmd');
  assert.equal((await cmds(pg)).length, 9);
  const s2 = await H.storedSave(pg);
  assert.equal(s2.v, 6); assert.deepEqual(s2, s1);
  assert.deepEqual(p.errors, []);
});

for (const [k, size] of Object.entries(H.SIZES)) {
  test(`TW-B4（${size.join('×')}）：横はみ出しなし。施設の札は背景の上で画面の中・押せる大きさ（高さ40px以上）・重ならない・他の要素に隠れていない。下のバーは1段（ファーム55%／プロフィール22.5%／セーブ・ロード22.5%）。背景は下寄せで闘技場の上が切れない。街はスクロールしない`, { skip: SKIP }, async () => {
    const p = await L.open({ size }); const pg = p.page;
    await town(p);
    await pg.evaluate(async () => { await document.fonts.ready; document.querySelector('#app>.tlow').classList.remove('on'); });
    const r = await pg.evaluate(() => {
      const R = (e) => { const x = e.getBoundingClientRect(); return { l: x.left, t: x.top, r: x.right, b: x.bottom, w: x.width, h: x.height }; };
      const map = R(document.querySelector('.map.town')), bar = R(document.querySelector('.tbar')), bg = R(document.querySelector('.tbg'));
      const ts = bg.h / 1360;
      return { sw: document.documentElement.scrollWidth, iw: innerWidth, map, bar, bg, arenaTop: bg.t + 26 * ts,
        pins: [...document.querySelectorAll('.map.town .tpin')].map((b) => { const x = R(b); const hit = document.elementFromPoint(x.l + x.w / 2, x.t + x.h / 2); return { name: b.textContent, ...x, hit: b.contains(hit), fs: parseFloat(getComputedStyle(b.querySelector('span')).fontSize) }; }),
        b: [...document.querySelectorAll('.tbar .tcmd')].map((b) => { const x = R(b); const hit = document.elementFromPoint(x.l + x.w / 2, x.t + x.h / 2); return { ...x, hit: b.contains(hit) }; }) };
    });
    assert.ok(r.sw <= r.iw + 1, `横はみ出し ${r.sw} > ${r.iw}`);
    assert.ok(Math.abs(r.bar.b - size[1]) <= 1 && r.bar.l <= 0.5 && Math.abs(r.bar.r - size[0]) <= 1, 'バーは画面の下端・幅いっぱい');
    assert.ok(Math.abs(r.map.b - r.bar.t) <= 1, '街の枠の下端＝バーの上端'); assert.ok(Math.abs(r.bg.b - r.bar.t) <= 1, '背景は下寄せ');
    assert.ok(r.bg.t <= 0.5, '背景の上に隙間を作らない'); assert.ok(r.arenaTop >= 0, `闘技場の上が画面の上で切れない（${Math.round(r.arenaTop)}）`);
    assert.equal(r.pins.length, 6);
    for (const x of r.pins) { assert.ok(x.l >= 0 && x.r <= r.iw && x.t >= 0 && x.b <= r.bar.t, `札「${x.name}」は画面内・バーより上`); assert.ok(x.h >= 44 && x.w >= 72, `札「${x.name}」は押せる大きさ（押せる範囲 ${x.w}×${x.h}）`); assert.ok(x.fs >= 13, '文字は13px以上'); assert.ok(x.hit, `札「${x.name}」は他の要素に隠れていない`); }
    for (let a = 0; a < r.pins.length; a++) for (let b = a + 1; b < r.pins.length; b++) { const A = r.pins[a], B = r.pins[b]; assert.ok(A.r <= B.l || B.r <= A.l || A.b <= B.t || B.b <= A.t, `札が重ならない（${A.name}／${B.name}）`); }
    assert.equal(r.b.length, 3); assert.equal(new Set(r.b.map((b) => Math.round(b.t))).size, 1, 'バーは1段');
    for (let i = 1; i < 3; i++) assert.ok(r.b[i].l > r.b[i - 1].r, '左から ファーム・プロフィール・セーブ・ロード');
    const all = r.b[0].w + r.b[1].w + r.b[2].w, ratio = r.b[0].w / all; assert.ok(ratio > 0.53 && ratio < 0.57 && Math.abs(r.b[1].w - r.b[2].w) <= 1, `ファーム 55%（${ratio}）`);
    for (const b of r.b) { assert.ok(b.h >= 48 && b.w >= 70, `押しやすい大きさ（${b.w}×${b.h}）`); assert.ok(b.hit, '他の要素に隠れていない'); }
    const rd = await pg.evaluate(() => [...document.querySelectorAll('.map.town .tround')].map((e) => { const x = e.getBoundingClientRect(); return [e.getAttribute('aria-label'), x.width, x.height, e.getAttribute('onclick')]; }));
    assert.deepEqual(rd.map((x) => [x[0], x[3]]), [['お知らせ', 'newsScr()'], ['設定', 'confScr()']]); assert.ok(rd.every((x) => x[1] >= 44 && x[2] >= 44));
    const s = await pg.evaluate(() => { scrollTo(0, 1e6); const a = document.getElementById('app'); return { y: a.scrollTop, page: scrollY }; });
    assert.deepEqual(s, { y: 0, page: 0 }, '街はスクロールしない');
    assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
  });
}

test('TW-B5：施設から街へ戻った直後（登場アニメの間）も、コマンドの横位置はずれない。すぐ押しても押した施設へ行く（64b2faf の押し間違いの再発防止）', { skip: SKIP }, async () => {
  const p = await L.open(); const pg = p.page;
  await town(p, 'テスト', 1000);
  const want = await pg.evaluate(() => [...document.querySelectorAll('.tbar .tcmd, .map.town .tpin')].map((b) => Math.round(b.getBoundingClientRect().left)));
  for (let k = 0; k < 3; k++) {
    await pg.evaluate(() => museum()); await pg.waitForSelector('.lab');
    // 街を開いた直後から0.45秒間、毎フレーム位置を測る
    const xs = await pg.evaluate(() => new Promise((res) => { lobby(); const out = [], t0 = performance.now();
      const f = () => { out.push([...document.querySelectorAll('.tbar .tcmd, .map.town .tpin')].map((b) => Math.round(b.getBoundingClientRect().left))); if (performance.now() - t0 < 450) requestAnimationFrame(f); else res(out); }; f(); }));
    assert.ok(xs.length >= 3);
    for (const x of xs) assert.deepEqual(x, want, '登場アニメの間も横位置は同じ');
  }
  // 戻った直後にすぐ牧場を押す → 牧場（研究所など別の施設にならない）
  await pg.evaluate(() => museum()); await pg.waitForSelector('.lab');
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
  await pg.click('.hz[onclick="museum()"]'); await pg.waitForSelector('.lab');
  assert.notEqual((await snd()).disp, 'none', 'ほかの画面では右上の音のボタンがこれまでどおり出る');
  await pg.evaluate(() => lobby()); await pg.waitForSelector('.tbar .tcmd');
  const s1 = await H.storedSave(pg); assert.deepEqual(s1, s0, 'お知らせ・設定を開いてもセーブは変わらない');
  assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
});
