// ルールの自動テスト：node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setConfig } from '../js/core/config.js';
import { createNewGame, setState, getState, validateState } from '../js/core/state.js';
import { checkCanStartRaising, commitStartRaising, commitFinishRaising } from '../js/systems/raising.js';
import { applyTownEntry, applyTriggerUnlocks } from '../js/systems/entry.js';
import { createIndividual } from '../js/systems/individual.js';
import { MemoryAdapter } from '../js/core/storage.js';
import { initSave, saveManual, autosave, load, listSlots } from '../js/core/save.js';
import { startRaising, finishRaising, enterTown, enterMarket } from '../js/systems/flows.js';
import { computeMetrics } from '../js/core/layout.js';

const config = JSON.parse(readFileSync(new URL('../data/config.json', import.meta.url)));
const unlocks = JSON.parse(readFileSync(new URL('../data/unlocks.json', import.meta.url)));
setConfig(config, unlocks);
initSave(new MemoryAdapter(), config);

const ind = (name = 'テスト') => createIndividual(config, {
  speciesId: 'dev', nickname: name, origin: 'market',
  stats: { life: 100, power: 100, wisdom: 100, hit: 100, evasion: 100, toughness: 100 },
});
const game = () => createNewGame(config);
const fill = (s, n) => { while (s.ranch.length < n) s.ranch.push(ind()); return s; };

test('新規ゲーム：名前アルト・1000G・街・1000年4月第1週', () => {
  const s = game();
  assert.equal(s.player.name, 'アルト');
  assert.equal(s.player.gold, 1000);
  assert.equal(s.mode, 'TOWN');
  assert.deepEqual(s.player.calendar, { year: 1000, month: 4, week: 1 });
});

test('牧場満杯：19体なら市場購入できる／20体なら止まる', () => {
  assert.equal(checkCanStartRaising(fill(game(), 19), config, { source: 'market', goldCost: 500 }).ok, true);
  const r = checkCanStartRaising(fill(game(), 20), config, { source: 'market', goldCost: 500 });
  assert.equal(r.reason, 'RANCH_FULL');
  assert.equal(r.message, 'ぽかぽか牧場がいっぱいです。\n合体などで空きを作ってください');
});

test('牧場満杯：特殊復元も20体で止まる', () => {
  assert.equal(checkCanStartRaising(fill(game(), 20), config, { source: 'restoration' }).reason, 'RANCH_FULL');
});

test('牧場満杯：合体は20体でも開始でき、親2体が消える', () => {
  const s = fill(game(), 20);
  const uids = [s.ranch[0].uid, s.ranch[1].uid];
  const r = commitStartRaising(s, config, { source: 'fusion', consumeParentUids: uids, individual: ind('子') });
  assert.equal(r.ok, true);
  assert.equal(s.ranch.length, 18);
  assert.equal(s.mode, 'RAISING');
});

test('満杯チェックはゴールドより先。止まった時は何も減らない', () => {
  setState(fill(game(), 20));
  return startRaising({ source: 'market', goldCost: 500, individual: ind() }).then((r) => {
    assert.equal(r.reason, 'RANCH_FULL');
    assert.equal(getState().player.gold, 1000);
    assert.equal(getState().mode, 'TOWN');
  });
});

test('所持金不足では開始できない', () => {
  const s = game(); s.player.gold = 499;
  assert.equal(checkCanStartRaising(s, config, { source: 'market', goldCost: 500 }).reason, 'NOT_ENOUGH_GOLD');
});

test('育成中は新しい育成を開始できない', () => {
  const s = game();
  commitStartRaising(s, config, { source: 'market', goldCost: 500, individual: ind() });
  assert.equal(checkCanStartRaising(s, config, { source: 'market' }).reason, 'NOT_TOWN');
});

test('育成成功：牧場登録・図鑑登録・成功数+1・街へ', () => {
  const s = game();
  commitStartRaising(s, config, { source: 'market', goldCost: 500, individual: ind('ソラ') });
  const r = commitFinishRaising(s, config, 'success');
  assert.equal(r.ok, true);
  assert.equal(s.mode, 'TOWN');
  assert.equal(s.active, null);
  assert.equal(s.ranch.length, 1);
  assert.equal(s.records.raisedCount, 1);
  assert.equal(s.discovered.monsters.dev.successCount, 1);
});

test('同じ種類を2回育成しても図鑑は1件', () => {
  const s = game();
  for (let i = 0; i < 2; i++) {
    commitStartRaising(s, config, { source: 'market', individual: ind() });
    commitFinishRaising(s, config, 'success');
  }
  assert.equal(Object.keys(s.discovered.monsters).length, 1);
  assert.equal(s.discovered.monsters.dev.successCount, 2);
});

test('育成失敗は仮処理として分かれている', () => {
  const s = game();
  commitStartRaising(s, config, { source: 'market', individual: ind() });
  const r = commitFinishRaising(s, config, 'fail');
  assert.equal(r.provisional, true);
  assert.equal(s.ranch.length, 0);
  assert.equal(s.mode, 'TOWN');
});

test('救済：120→500、499→500、500はそのまま（加算ではなく補填）', () => {
  for (const [from, to, fired] of [[120, 500, true], [300, 500, true], [499, 500, true], [500, 500, false], [800, 800, false]]) {
    const s = game(); s.player.gold = from;
    const r = applyTownEntry(s, config);
    assert.equal(s.player.gold, to);
    assert.equal(r.events.length > 0, fired);
  }
});

test('救済は育成中には起きない', () => {
  const s = game();
  commitStartRaising(s, config, { source: 'market', goldCost: 800, individual: ind() });
  assert.equal(s.player.gold, 200);
  assert.equal(applyTownEntry(s, config).events.length, 0);
});

test('ノビトン：成功数2では解放されない／3で解放、2回目は起きない', () => {
  const s = game();
  s.records.raisedCount = 2;
  assert.equal(applyTriggerUnlocks(s, unlocks, 'marketEntry').events.length, 0);
  s.records.raisedCount = 3;
  assert.equal(applyTriggerUnlocks(s, unlocks, 'marketEntry').events[0].type, 'nobiton_unlock');
  assert.equal(s.flags['market.nobiton'], true);
  assert.equal(applyTriggerUnlocks(s, unlocks, 'marketEntry').events.length, 0);
});

test('セーブ：育成中に保存→ロードでファームから再開', async () => {
  setState(game());
  await startRaising({ source: 'market', goldCost: 500, individual: ind('ソラ') });
  await saveManual('slot2', getState());
  const res = await load('slot2');
  assert.equal(res.resumeAt, 'farm');
  assert.equal(res.state.active.nickname, 'ソラ');
});

test('セーブ：オートセーブはモード切替で書かれる', async () => {
  setState(game());
  await startRaising({ source: 'market', goldCost: 500, individual: ind() });
  assert.equal((await load('auto')).resumeAt, 'farm');
  await finishRaising('success');
  assert.equal((await load('auto')).resumeAt, 'town');
});

test('セーブ：手動はセーブ1〜3だけ。オート枠へは手動保存できない', async () => {
  await assert.rejects(() => saveManual('auto', game()));
  const slots = await listSlots();
  assert.deepEqual(slots.map((s) => s.slotId), ['slot1', 'slot2', 'slot3', 'auto']);
});

test('ロード直後でも街に入ると救済が起きる', async () => {
  const s = game(); s.player.gold = 120;
  await saveManual('slot1', s);
  setState((await load('slot1')).state);
  await enterTown();
  assert.equal(getState().player.gold, 500);
});

test('市場入場で解放されたらオートセーブされる', async () => {
  const s = game(); s.records.raisedCount = 3;
  setState(s);
  await enterMarket();
  assert.equal((await load('auto')).state.flags['market.nobiton'], true);
});

test('状態の約束：育成中なのに個体なしは不正', () => {
  const s = game(); s.mode = 'RAISING';
  assert.ok(validateState(s));
});

test('技：習得10・セット6・未習得はセット不可', () => {
  const moves = Array.from({ length: 11 }, (_, i) => `m${i}`);
  assert.throws(() => createIndividual(config, { speciesId: 'x', nickname: 'a', origin: 'market', learnedMoves: moves }));
  assert.throws(() => createIndividual(config, { speciesId: 'x', nickname: 'a', origin: 'market', learnedMoves: ['a'], equippedMoves: ['b'] }));
});

// ---------- レイアウト ----------
const devices = {
  'iPhone SE(3)':    { vw: 375, vh: 667, safe: { top: 20, right: 0, bottom: 0, left: 0 } },
  'iPhone 13 mini':  { vw: 375, vh: 812, safe: { top: 50, right: 0, bottom: 34, left: 0 } },
  'iPhone 16':       { vw: 393, vh: 852, safe: { top: 59, right: 0, bottom: 34, left: 0 } },
  'iPhone 16 ProMax':{ vw: 440, vh: 956, safe: { top: 62, right: 0, bottom: 34, left: 0 } },
  'Android 20:9':    { vw: 412, vh: 915, safe: { top: 24, right: 0, bottom: 16, left: 0 } },
  'iPad 11':         { vw: 834, vh: 1194, safe: { top: 24, right: 0, bottom: 20, left: 0 } },
};
for (const [name, d] of Object.entries(devices)) {
  test(`レイアウト：${name}`, () => {
    const m = computeMetrics(d.vw, d.vh, d.safe, config.design, config.layout);
    // 背景が画面の上下左右を覆う（iPad は左右をぼかしで補完）
    assert.ok(m.bg.y <= 0.01 && m.bg.y + m.bg.h >= d.vh - 0.01, '背景が上下を覆っていない');
    if (!m.sideFill) assert.ok(m.bg.x <= 0.01 && m.bg.x + m.bg.w >= d.vw - 0.01, '背景が左右を覆っていない');
    // UI枠は安全領域の内側
    assert.ok(m.frame.y >= d.safe.top - 0.01 && m.frame.y + m.frame.h <= d.vh - d.safe.bottom + 0.01);
    // 基準枠（1080×1920）はUI枠に収まる
    assert.ok(m.coreTop >= -0.01);
    // 背景の基準枠の中心 = UIの基準枠の中心
    const bgCoreCenter = m.bg.y + (m.bgBleed + 960) * m.bgScale;
    const uiCoreCenter = m.frame.y + m.coreTop + 960 * m.scale;
    assert.ok(Math.abs(bgCoreCenter - uiCoreCenter) < 0.5);
    // 背景の基準枠が上下とも切れていない（重要な要素が見える）
    // 背景の基準枠が切れるのは、上下それぞれ基準枠の高さの3%まで
    const coreH = 1920 * m.bgScale;
    const coreTopOnScreen = m.bg.y + m.bgBleed * m.bgScale;
    const tol = coreH * config.layout.coreCropTolerance + 0.5;
    assert.ok(-coreTopOnScreen <= tol, `基準枠の上が切れすぎ（${-coreTopOnScreen}pt）`);
    assert.ok(coreTopOnScreen + coreH - d.vh <= tol, `基準枠の下が切れすぎ（${coreTopOnScreen + coreH - d.vh}pt）`);
    // スマホでは左右のぼかし補完を出さない
    if (!name.startsWith('iPad')) assert.equal(m.sideFill, false, 'スマホで左右にすき間がある');
  });
}
