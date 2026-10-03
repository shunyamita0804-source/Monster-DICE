// =========================================================
// デザイン素材一括（mystic-monsters-design-pack-2026-10-03 part1〜3）の取り扱い（assets/design_pack_2026-10-03/README.md）
//  DP-01：置いた元ファイルは manifest の sha256 と一致（無加工）。参考専用・UI参考（02・03・04）はリポジトリに置かない
//  DP-02：宝箱 4種類（本体＋開封4）の派生 WebP（透過）。Chapter 1 は normal＝chest_01・special＝chest_04。rare は未決（絵を出さない）
//  DP-03：アイテム屋：正式背景・正式NPC（名前・セリフは出さない）。商品・売買の処理は変えない
//  DP-04：共通会話 UI の再構築・ライバルの「RIVAL」の一瞬・レアの後光（見た目だけ。出現率・バトルへの進み方は変えない）
//  DP-05：保存のみ：野生聖獣（再生器は準備・どこからも呼ばない）・合体（要確認）・報酬演出／エンブレム（透過元 PNG 待ち・割り当て保留）
// =========================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const sha = (p) => createHash('sha256').update(readFileSync(path.join(ROOT, p))).digest('hex');
const MAN = JSON.parse(rd('assets/design_pack_2026-10-03/manifest.json'));
const HTML = rd('index.html');
// manifest のファイル（グループ/名前）→ リポジトリの置き場
const PLACE = {
  '01_treasure_chests': 'assets/chests/original/',
  '05_fusion_effect_sequence': 'assets/fx/fusion/pack05_fusion_effect_sequence/',
  '06_encounter_tournament_chapter_ui_cont': 'assets/fx/fusion/pack06_encounter_tournament_chapter_ui_cont/',
  '07_wild_sacred_beast_encounter_sequence': 'assets/fx/sacred_beast/original/',
  '08_item_shop_npc': 'assets/shop/original/',
  '09_item_shop_background': 'assets/shop/original/',
  '10_tournament_reward_unlock_fx': 'assets/tournament/reward_unlock/original/',
  '11_tournament_rank_emblems_sheet': 'assets/tournament/rank_emblems/original/',
};

test('DP-01：正式素材の元ファイルは無加工（manifest の sha256 と一致）。参考専用・UI参考（02・03・04）はリポジトリに置かない', () => {
  assert.equal(MAN.length, 75);
  let n = 0;
  for (const e of MAN) {
    const dir = PLACE[e.group];
    if (!dir) { assert.ok(['02_npc_message_ui', '03_first_town_guide_fina', '04_encounter_tournament_chapter_ui'].includes(e.group), e.group); continue; }
    const p = dir + path.basename(e.pack_name);
    assert.ok(existsSync(path.join(ROOT, p)), p); assert.equal(sha(p), e.sha256, p); n++;
  }
  assert.equal(n, 52);
  const all = []; const walk = (d) => { for (const x of readdirSync(path.join(ROOT, d), { withFileTypes: true })) x.isDirectory() ? walk(path.join(d, x.name)) : all.push(x.name); };
  walk('assets');
  assert.ok(!all.some((f) => /^0[234]_(npc_message_ui|first_town_guide_fina|encounter_tournament_chapter_ui)_\d+\.jpeg$/.test(f)), '参考画像は置かない');
  assert.match(rd('assets/fx/fusion/README.md'), /食い違い（要確認）/);
});

test('DP-02：宝箱 4種類の派生（透過 WebP・同じ種類は同じ大きさ）。Chapter 1：normal＝chest_01・special＝chest_04（開封4枚）。rare は未決＝宝箱の絵を出さない。報酬は変えない', () => {
  for (const n of ['01', '02', '03', '04']) {
    const sizes = new Set();
    for (const k of ['base', 'anim_01', 'anim_02', 'anim_03', 'anim_04']) {
      const b = readFileSync(path.join(ROOT, `assets/chests/chest_${n}_${k}.webp`));
      assert.equal(b.toString('ascii', 8, 12), 'WEBP'); assert.ok(b.includes(Buffer.from('ALPH')) || b.includes(Buffer.from('VP8L')), `chest_${n}_${k} は透過`);
      assert.ok(b.length < 140000, `chest_${n}_${k} は軽い`);
      const ext = b.indexOf(Buffer.from('VP8X')); sizes.add(ext > 0 ? b.readUIntLE(ext + 12, 3) + 'x' + b.readUIntLE(ext + 15, 3) : '?');
    }
    assert.equal(sizes.size, 1, `chest_${n} の5枚は同じ範囲で切り出す（開くときにずれない）`);
  }
  const CF = rd('js/chapter/configs/ch1a.js');
  assert.match(CF, /normal: \{ closed: 'chest_01_base', open: 'chest_01_anim_04', frames: \['chest_01_anim_01', 'chest_01_anim_02', 'chest_01_anim_03', 'chest_01_anim_04'\]/);
  assert.match(CF, /special: \{ closed: 'chest_04_base', open: 'chest_04_anim_04', frames: \['chest_04_anim_01', 'chest_04_anim_02', 'chest_04_anim_03', 'chest_04_anim_04'\]/);
  assert.doesNotMatch(CF, /rare: \{ closed:/, 'rare は未決');
  assert.match(CF, /treasurePool: \{ tierWeights: \{ normal: 70, rare: 25, special: 5 \}, contents: \{ handler: 'gold_table', params: \{ table: \[\{ w: 4, gold: 50 \}, \{ w: 1, gold: 150 \}\] \} \} \}/, '確率・報酬は変えていない');
});

test('DP-03：アイテム屋：正式背景（ぼかさない）と正式NPC の立ち姿。名前・セリフは出さない（未確定）。商品・売買の処理は従来どおり', () => {
  assert.match(HTML, /const SHOP_BG="assets\/shop\/shop_bg\.webp",SHOP_NPC="assets\/shop\/shop_npc\.webp";/);
  for (const f of ['assets/shop/shop_bg.webp', 'assets/shop/shop_npc.webp']) assert.ok(existsSync(path.join(ROOT, f)), f);
  const shop = HTML.slice(HTML.indexOf('function shopScr('), HTML.indexOf('\n', HTML.indexOf('$("#app").innerHTML=p7Shell("🛒"')));
  assert.match(shop, /MMP7\.getShopCatalog\(\)/); assert.match(shop, /p7Buy\('\$\{id\}'\)/); assert.match(shop, /p7Sell\(\$\{i\}\)/);
  assert.match(shop, /,msg,null,SHOP_LOOK\);/);
  const look = HTML.slice(HTML.indexOf('const SHOP_LOOK='), HTML.indexOf('function shopScr('));
  assert.doesNotMatch(look, /MMNPC|<b>|name/, 'NPC の名前・会話は出さない');
  assert.match(HTML, /\.ds\.shop>\.shopbg\{[^}]*background-size:cover/);
});

test('DP-04：共通会話 UI（ネイビー・アイボリー・細い罫線・小さな金の角飾り）。ライバルは「RIVAL／ライバルが現れた」を1秒未満、レアは後光・金のリムライト・光の粒・「★ レア」。見た目だけ', () => {
  const CF = rd('js/chapter/configs/ch1a.js'), FV = rd('js/chapter/field-view.js');
  assert.match(CF, /sting: \{ title: 'RIVAL', sub: 'ライバルが現れた', ms: 880 \}/);
  assert.match(CF, /aura: true, badge: '★ レア'/);
  assert.match(FV, /const S1 = BT\.sting \|\| \{\}, ms = Math\.max\(400, Math\.min\(980, S1\.ms \|\| 880\)\);/, '1秒未満');
  assert.match(FV, /if \(BT\.sting\) return stingShow\(ui, BT, bt\);/);
  // レアの出現率（配置のときの 10%）・ライバルの強制停止は変えない
  assert.match(CF, /rareBattleRate: 0\.1/);
  assert.match(HTML, /\.chf-sting\{[^}]*position:absolute;inset:0;/); assert.match(HTML, /\.chf-enc-badge\{/);
  assert.doesNotMatch(FV, /fight\s*\(/, 'Chapter の画面から fight() を呼ばない（従来どおりバトルの案内から）');
});

test('DP-05：保存のみの素材：野生聖獣の再生器は準備だけ（どこからも呼ばない）・合体は要確認・報酬演出とエンブレムは透過元 PNG 待ち／割り当て保留（コードから参照しない）', () => {
  const SQ = rd('js/fx/sequence.js');
  assert.match(SQ, /sacredBeast: Object\.freeze\(\{ frames: Object\.freeze\(\[1, 2, 3, 4, 5, 6, 7, 8\]/);
  for (let i = 1; i <= 8; i++) assert.ok(existsSync(path.join(ROOT, `assets/fx/sacred_beast/sacred_beast_encounter_0${i}.webp`)));
  assert.doesNotMatch(SQ, /fusion\w*:/, '合体はフォルダ分けの食い違いが解けるまで登録しない');
  const code = [HTML, rd('js/chapter/field-view.js'), rd('js/chapter/configs/ch1a.js'), rd('js/chapter/configs/ch2a.js')].join('\n');
  assert.doesNotMatch(code, /MMSEQ\.play/, 'どこからも呼ばない（聖獣のシステムが無い）');
  assert.doesNotMatch(code, /reward_unlock|rank_emblems|assets\/fx\/fusion/, '報酬演出・エンブレム・合体は参照しない');
  for (let i = 1; i <= 6; i++) assert.ok(existsSync(path.join(ROOT, `assets/tournament/rank_emblems/slices/emblem_slot${i}.jpeg`)));
  assert.match(rd('assets/tournament/README.md'), /E〜S への割り当ては保留/);
});
