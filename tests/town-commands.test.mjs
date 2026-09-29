// =========================================================
// 街画面：背景＋施設コマンド（市場・牧場・研究所・闘技場・ファーム）
//  ・自由移動マップではなく、背景の上に施設コマンドを並べる。背景は assets/town/town_main.jpg（仮の正式候補）を
//    TOWN_BG の1か所から参照し、ファイルを置き換えるだけで差し替えられる（寸法に依存しない：cover・上寄せ）。
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
const LABELS = ['市場', '牧場', '研究所', '闘技場', 'ファーム'];
const CALLS = ['market()', 'farm()', 'museum()', 'townArena()', 'hall()'];

test('TW-1：街の背景は TOWN_BG の1か所だけで参照し、ファイルが存在する（旧マップの埋め込み画像 MAPIMG は使わない）', () => {
  const bg = line('const TOWN_BG=');
  assert.equal(bg, 'const TOWN_BG="assets/town/town_main.jpg";');
  assert.ok(existsSync(path.join(ROOT, 'assets/town/town_main.jpg')));
  assert.equal((HTML.match(/town_main\.jpg/g) || []).length, 2, '定義の1行とコメントの1か所だけ');
  assert.equal((HTML.match(/\$\{TOWN_BG\}/g) || []).length, 1, 'lobby() から1回だけ使う');
  assert.doesNotMatch(HTML, /MAPIMG/);
  assert.match(HTML, /\.map\.town\{[^}]*var\(--town-bg\) var\(--town-pos,center top\)\/cover/, '寸法に依存しない敷き方（cover・位置は変数で差し替え可）');
});

test('TW-2：施設コマンドは 市場・牧場・研究所・闘技場・ファーム の5つ（この順番）。行き先は従来の画面', () => {
  const src = line('const TOWN_CMDS=');
  const f = new Function(`${src}\nreturn TOWN_CMDS;`)();
  assert.deepEqual(f({}).map((c) => [c[0], c[3], c[4]]), LABELS.map((l, i) => [l, CALLS[i], i === 3 ? 'lock' : 'ok']));
  assert.equal(f(null)[4][4], 'dis', 'モンスターがいないときファームは押せない（従来どおり）');
  const lobby = HTML.slice(HTML.indexOf('function lobby('), HTML.indexOf('\n}', HTML.indexOf('function lobby(')));
  assert.match(lobby, /TOWN_CMDS\(m\)\.map/); assert.doesNotMatch(lobby, /mupin|博物館|style="left:/, '旧マップのタップ領域・博物館ピンは使わない');
});

test('TW-6：コマンドは施設名だけ（補足は title に残す）。アイコンは .ti に独立し、画像ファイルのパスを書けば画像で表示できる', () => {
  const f = new Function(`${line('const townIcon=')}\nreturn townIcon;`)();
  assert.equal(f('🛒'), '🛒'); assert.equal(f('assets/town/icons/market.png'), '<img src="assets/town/icons/market.png" alt="">');
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
  await p.page.waitForSelector('.map.town .tcmd');
}
const cmds = (pg) => pg.evaluate(() => [...document.querySelectorAll('.map.town .tcmd')].map((b) => ({
  label: b.querySelector('b').textContent, call: b.getAttribute('onclick'), disabled: b.disabled, lock: b.classList.contains('lock') })));
const toTown = async (pg) => { await pg.locator('button', { hasText: '街にもどる' }).first().click(); await pg.waitForSelector('.map.town .tcmd'); };

test('TW-B1：新規開始後の街：背景画像を読み込み、5つのコマンドが見える。ファームはモンスターがいないので押せない', { skip: SKIP }, async () => {
  const p = await L.open(); const pg = p.page;
  await town(p);
  assert.deepEqual((await cmds(pg)).map((c) => [c.label, c.call, c.disabled, c.lock]),
    [['市場', 'market()', false, false], ['牧場', 'farm()', false, false], ['研究所', 'museum()', false, false], ['闘技場', 'townArena()', false, true], ['ファーム', 'hall()', true, false]]);
  const bg = await pg.evaluate(() => getComputedStyle(document.querySelector('.map.town')).backgroundImage);
  assert.match(bg, /assets\/town\/town_main\.jpg/);
  await pg.waitForFunction(() => performance.getEntriesByType('resource').some((r) => r.name.endsWith('town_main.jpg')));
  assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
});

test('TW-B2：各コマンドの遷移と「街にもどる」：市場・牧場・研究所（一覧→詳細→研究所→街）・闘技場（案内だけ）・ファーム', { skip: SKIP }, async () => {
  const p = await L.open(); const pg = p.page;
  await town(p, 'テスト', 1000);
  // 市場（カルーセル）→ 戻る
  await pg.click('.hz[onclick="market()"]'); await pg.waitForSelector('#p10car');
  await pg.click('.p10back'); await pg.waitForSelector('.map.town .tcmd');
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
  await pg.click('#p10ov .p10ok'); await pg.waitForSelector('.map.town .tcmd');
  assert.equal((await cmds(pg))[4].disabled, false);
  await pg.click('.hz[onclick="hall()"]'); await pg.waitForSelector('#app button[onclick="prepScr()"]');
  assert.equal((await H.getS(pg)).m.raise.state, 'none', 'ファームへ行っただけでは育成は始まらない');
  await pg.evaluate(() => lobby()); await pg.waitForSelector('.map.town .tcmd');
  assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
});

test('TW-B3：再読み込み→開始でも街はコマンド式で表示される（セーブ v6・mr4v6 のまま）', { skip: SKIP }, async () => {
  const p = await L.open(); const pg = p.page;
  await town(p, 'テスト', 1000);
  const s1 = await H.storedSave(pg);
  await pg.reload(); await pg.waitForFunction(() => typeof S === 'object');
  await pg.click('[onclick*="startGame"]'); await pg.waitForSelector('.map.town .tcmd');
  assert.equal((await cmds(pg)).length, 5);
  const s2 = await H.storedSave(pg);
  assert.equal(s2.v, 6); assert.deepEqual(s2, s1);
  assert.deepEqual(p.errors, []);
});

for (const [k, size] of Object.entries(H.SIZES)) {
  test(`TW-B4（${size.join('×')}）：横はみ出しなし。5つのコマンドは街の枠と画面の中にあり、押せる大きさで、他の要素に隠れていない`, { skip: SKIP }, async () => {
    const p = await L.open({ size }); const pg = p.page;
    await town(p);
    const r = await pg.evaluate(() => {
      const map = document.querySelector('.map.town').getBoundingClientRect();
      return { sw: document.documentElement.scrollWidth, iw: innerWidth, map: [map.left, map.top, map.right, map.bottom],
        b: [...document.querySelectorAll('.map.town .tcmd')].map((b) => { const x = b.getBoundingClientRect(); const hit = document.elementFromPoint(x.left + x.width / 2, x.top + x.height / 2);
          return { l: x.left, t: x.top, r: x.right, b: x.bottom, w: x.width, h: x.height, hit: b.contains(hit), clip: b.scrollWidth > b.clientWidth }; }) };
    });
    assert.ok(r.sw <= r.iw + 1, `横はみ出し ${r.sw} > ${r.iw}`);
    for (const b of r.b) {
      assert.ok(b.l >= r.map[0] && b.r <= r.map[2] && b.t >= r.map[1] && b.b <= r.map[3], '街の枠の中');
      assert.ok(b.r <= r.iw && b.b <= size[1], '最初の画面の中');
      assert.ok(b.h >= 44 && b.w >= 100, `押しやすい大きさ（${b.w}×${b.h}）`);
      assert.ok(b.hit, '他の要素に隠れていない');
      assert.ok(!b.clip, '施設名が切れていない');
      assert.ok(b.w <= 120, `背景を隠しすぎない幅（${b.w}px）`);
    }
    assert.deepEqual(p.errors, []); assert.deepEqual(p.bad, []);
  });
}
