// ルールの自動テスト：node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setConfig } from '../js/core/config.js';
import { createNewGame, setState, getState, validateState } from '../js/core/state.js';
import { checkCanStartRaising, commitStartRaising, commitFinishRaising } from '../js/systems/raising.js';
import { applyTownEntry, applyTriggerUnlocks } from '../js/systems/entry.js';
import { createIndividual, getSpeed, DEFAULT_SPEED, SPEED_MIN, SPEED_MAX } from '../js/systems/individual.js';
import { determineFirstActor } from '../js/systems/battle/firstActor.js';
import { createBattleSession } from '../js/systems/battle/session.js';
import { createCheckpoint, restoreSession } from '../js/systems/battle/checkpoint.js';
import {
  calculateBaseDamage, applyDamageVariance, rollCritical, finalizeDamage, CRITICAL_MULTIPLIER,
  calculateHitRate, rollHit, HIT_RATE_MIN, HIT_RATE_MAX,
} from '../js/systems/battle/combatMath.js';
import {
  EFFECT_SIZE_RATIO, createEffect, applyEffect, advanceEffects, getEffectiveStat,
  applyEffectToSession, advanceEffectsForSession,
} from '../js/systems/battle/effects.js';
import { resolveAction, resolveRound } from '../js/systems/battle/engine.js';
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

// =========================================================
// バトル基盤 PHASE 1（素早さ・先攻判定・バトルセッション・チェックポイント）
// =========================================================

// ---------- 素早さ（individual.js） ----------
test('素早さ：省略時は既定値、範囲外は作成できない', () => {
  const withDefault = ind();
  assert.equal(withDefault.speed, DEFAULT_SPEED);
  assert.ok(DEFAULT_SPEED >= SPEED_MIN && DEFAULT_SPEED <= SPEED_MAX);

  const custom = createIndividual(config, { speciesId: 'dev', nickname: 'ソラ', origin: 'market', stats: {}, speed: SPEED_MAX });
  assert.equal(custom.speed, SPEED_MAX);

  for (const bad of [0, SPEED_MAX + 1, 5.5, -1]) {
    assert.throws(() => createIndividual(config, { speciesId: 'dev', nickname: 'x', origin: 'market', stats: {}, speed: bad }));
  }
});

test('素早さ：speed フィールドが無い個体でも getSpeed は既定値を返す（後方互換）', () => {
  const oldShapeIndividual = { uid: 'old-1', speciesId: 'dev', stats: { life: 100 } }; // speed を持たない旧形式を模擬
  assert.equal(getSpeed(oldShapeIndividual), DEFAULT_SPEED);
  assert.equal(getSpeed({ speed: 3 }), 3);
  assert.equal(getSpeed({ speed: 0 }), DEFAULT_SPEED);   // 範囲外の値も既定値にフォールバック
  assert.equal(getSpeed(undefined), DEFAULT_SPEED);
});

// ---------- 先攻判定（battle/firstActor.js） ----------
test('先攻判定：差0は50/50の境界がちょうど0.5', () => {
  assert.equal(determineFirstActor(5, 5, () => 0), 'A');
  assert.equal(determineFirstActor(5, 5, () => 0.4999999), 'A');
  assert.equal(determineFirstActor(5, 5, () => 0.5), 'B');
  assert.equal(determineFirstActor(5, 5, () => 0.9999999), 'B');
});

test('先攻判定：差1〜9の確率テーブルが仕様どおり（境界値で検証）', () => {
  const table = [
    [1, 0.60], [2, 0.70], [3, 0.75], [4, 0.80],
    [5, 0.85], [6, 0.88], [7, 0.90], [8, 0.92], [9, 0.95],
  ];
  for (const [diff, prob] of table) {
    const speedA = SPEED_MIN + diff; // 速い側をAにする（例：diff=3 → A=4, B=1）
    const speedB = SPEED_MIN;
    assert.equal(determineFirstActor(speedA, speedB, () => prob - 0.0001), 'A', `diff${diff} 閾値未満はA`);
    assert.equal(determineFirstActor(speedA, speedB, () => prob), 'B', `diff${diff} 閾値ちょうどはB`);
  }
});

test('先攻判定：速い側／遅い側を入れ替えても、同じ乱数値で結果が正しく入れ替わる', () => {
  // 差2（確率0.70）。rng=0.5 は閾値未満なので「速い側」が先攻するはず
  assert.equal(determineFirstActor(7, 5, () => 0.5), 'A'); // Aが速い
  assert.equal(determineFirstActor(5, 7, () => 0.5), 'B'); // Bが速い（引数を入れ替え）
  // rng=0.9 は0.70以上なので「遅い側」が先攻するはず
  assert.equal(determineFirstActor(7, 5, () => 0.9), 'B');
  assert.equal(determineFirstActor(5, 7, () => 0.9), 'A');
});

test('先攻判定：素早さ1〜10の全範囲で例外なく動く（差の最大9を含む）', () => {
  assert.equal(determineFirstActor(SPEED_MAX, SPEED_MIN, () => 0), 'A');
  assert.equal(determineFirstActor(SPEED_MIN, SPEED_MAX, () => 0), 'B');
});

// ---------- バトルセッション（battle/session.js） ----------
function counterRng(value = 0.1) {
  const fn = () => value;
  fn.calls = 0;
  const wrapped = () => { wrapped.calls++; return value; };
  wrapped.calls = 0;
  return wrapped;
}

test('バトルセッション：先攻判定はバトル開始時に1回だけ行われ、結果が保存される', () => {
  const a = createIndividual(config, { speciesId: 'soramo', nickname: 'ソラ', origin: 'market', stats: { life: 300 }, speed: 8 });
  const b = createIndividual(config, { speciesId: 'gauru', nickname: 'ガウ', origin: 'market', stats: { life: 250 }, speed: 3 });
  const rng = counterRng(0.1); // 差5＝確率0.85。0.1 < 0.85 なので速い側（A）が先攻するはず
  const session = createBattleSession({ unitA: a, unitB: b, battleType: 'official', rng });

  assert.equal(rng.calls, 1, '乱数はバトル開始時に1回だけ引かれる');
  assert.equal(session.firstActor, 'A');
  assert.equal(session.participants.A.uid, a.uid);
  assert.equal(session.participants.B.uid, b.uid);
  assert.equal(session.participants.A.speed, 8);
  assert.equal(session.participants.A.maxLife, 300);
  assert.equal(session.currentLife.A, 300);
  assert.equal(session.currentLife.B, 250);
  assert.deepEqual(session.hitCount, { A: 0, B: 0 });
  assert.deepEqual(session.totalDamage, { A: 0, B: 0 });
  assert.equal(session.turn, 1);
  assert.equal(session.battleType, 'official');
});

test('バトルセッション：ターンが進んでも先攻／後攻は再抽選されない', () => {
  const a = ind('A個体'); const b = ind('B個体');
  const rng = counterRng(0.1);
  const session = createBattleSession({ unitA: a, unitB: b, battleType: 'arena', rng });
  const firstActorAtStart = session.firstActor;

  // ターン経過を模擬（PHASE1には advanceTurn 自体が無いため、値の書き換えのみで再抽選が起きないことを確認）
  session.turn = 2;
  session.turn = 3;
  assert.equal(session.firstActor, firstActorAtStart);
  assert.equal(rng.calls, 1, 'ターンが進んでも乱数が再び引かれていない');
});

test('バトルセッション：speed の無い旧形式データを渡しても例外にならず既定値が使われる', () => {
  const legacyUnit = { uid: 'legacy-1', speciesId: 'dev', variantId: null, nickname: 'むかしの個体', stats: { life: 120 } };
  const b = ind();
  const session = createBattleSession({ unitA: legacyUnit, unitB: b, battleType: 'official', rng: () => 0.1 });
  assert.equal(session.participants.A.speed, DEFAULT_SPEED);
});

// ---------- Battle Checkpoint（battle/checkpoint.js） ----------
test('Battle Checkpoint：生成できる', () => {
  const session = createBattleSession({ unitA: ind('A'), unitB: ind('B'), battleType: 'official', rng: () => 0.1 });
  const checkpoint = createCheckpoint(session);
  assert.equal(checkpoint.format, 'monster-master-battle-checkpoint');
  assert.equal(checkpoint.version, 1);
  assert.equal(typeof checkpoint.savedAt, 'string');
  assert.deepEqual(checkpoint.session, session);
});

test('Battle Checkpoint：復元でき、先攻／後攻や進行状況が保持される', () => {
  const session = createBattleSession({ unitA: ind('A'), unitB: ind('B'), battleType: 'official', rng: () => 0.1 });
  // ターンが進んだ状態を模擬してからチェックポイントを取る
  session.turn = 4;
  session.currentLife.A = 70;
  session.currentLife.B = 55;
  session.hitCount.A = 3;
  session.hitCount.B = 2;
  session.totalDamage.A = 230;
  session.totalDamage.B = 195;

  const checkpoint = createCheckpoint(session);
  const restored = restoreSession(checkpoint);

  assert.equal(restored.firstActor, session.firstActor, '復元後も先攻／後攻は変わらない');
  assert.equal(restored.turn, 4);
  assert.deepEqual(restored.currentLife, { A: 70, B: 55 });
  assert.deepEqual(restored.hitCount, { A: 3, B: 2 });
  assert.deepEqual(restored.totalDamage, { A: 230, B: 195 });
  assert.deepEqual(restored.participants, session.participants);
  assert.notEqual(restored, session, '復元結果は複製であり、元のセッションと同一参照ではない');
});

test('Battle Checkpoint：壊れたチェックポイントは復元できない', () => {
  assert.throws(() => restoreSession(null));
  assert.throws(() => restoreSession({ format: 'other', version: 1, session: {} }));
  assert.throws(() => restoreSession({ format: 'monster-master-battle-checkpoint', version: 99, session: {} }));
  const session = createBattleSession({ unitA: ind('A'), unitB: ind('B'), battleType: 'official', rng: () => 0.1 });
  const okCheckpoint = createCheckpoint(session);
  const broken = { ...okCheckpoint, session: { ...okCheckpoint.session, firstActor: 'X' } };
  assert.throws(() => restoreSession(broken));
});

// =========================================================
// バトル計算コア PHASE 2（ダメージ・命中・クリティカル）
// =========================================================

// ---------- ダメージ基礎式（乱数なし） ----------
test('ダメージ基礎式：威力70・攻撃/丈夫さが同値（100/300/600/999）', () => {
  assert.equal(Math.round(calculateBaseDamage({ movePower: 70, attackStat: 100, defenseStat: 100 })), 15);
  assert.equal(Math.round(calculateBaseDamage({ movePower: 70, attackStat: 300, defenseStat: 300 })), 45);
  assert.equal(Math.round(calculateBaseDamage({ movePower: 70, attackStat: 600, defenseStat: 600 })), 89);
  assert.equal(Math.round(calculateBaseDamage({ movePower: 70, attackStat: 999, defenseStat: 999 })), 149);
});

test('ダメージ基礎式：攻撃特化と耐久特化で正しく差が出る', () => {
  const atkFavored = calculateBaseDamage({ movePower: 70, attackStat: 600, defenseStat: 300 });
  const defFavored = calculateBaseDamage({ movePower: 70, attackStat: 300, defenseStat: 600 });
  const even = calculateBaseDamage({ movePower: 70, attackStat: 300, defenseStat: 300 });
  assert.ok(atkFavored > even, '攻撃600 vs 丈夫さ300 は同値600より高いはず');
  assert.ok(defFavored < even, '攻撃300 vs 丈夫さ600 は同値300より低いはず');
  assert.equal(Math.round(atkFavored * 100) / 100, 119.15);
  assert.equal(Math.round(defFavored * 100) / 100, 29.79);
});

// ---------- ダメージ乱数（±5%） ----------
test('ダメージ乱数：下限（rng=0→約-5%）／中央（rng=0.5→0%）／上限直前（rng→1直前→約+5%）', () => {
  const base = 100;
  assert.equal(applyDamageVariance(base, () => 0), 95);
  assert.equal(applyDamageVariance(base, () => 0.5), 100);
  assert.ok(applyDamageVariance(base, () => 0.999999) > 104.999 && applyDamageVariance(base, () => 0.999999) < 105);
});

// ---------- 最低ダメージ保証・クリティカル ----------
test('最低ダメージ1が保証される', () => {
  const tiny = calculateBaseDamage({ movePower: 1, attackStat: 1, defenseStat: 999999 });
  assert.equal(finalizeDamage(tiny, false), 1);
});

test('クリティカル：最終ダメージ×1.5（丈夫さは通常どおり機能する）', () => {
  const base = calculateBaseDamage({ movePower: 70, attackStat: 300, defenseStat: 300 }); // ≒44.68
  const withVariance = applyDamageVariance(base, () => 0.5); // 乱数0%固定＝base同値
  const normal = finalizeDamage(withVariance, false);
  const critical = finalizeDamage(withVariance, true);
  assert.equal(normal, 45);
  assert.equal(critical, Math.round(withVariance * CRITICAL_MULTIPLIER));
  assert.equal(critical, 67); // 44.68... × 1.5 ≒ 67.02 → 67
  assert.ok(critical > normal * 1.4, 'クリティカルは通常よりおおよそ1.5倍高い');

  // 丈夫さ（防御）が高いほど、クリティカルでもダメージが下がることを確認＝防御無視ではない
  const highDefBase = calculateBaseDamage({ movePower: 70, attackStat: 300, defenseStat: 900 });
  const highDefCritical = finalizeDamage(applyDamageVariance(highDefBase, () => 0.5), true);
  assert.ok(highDefCritical < critical, '丈夫さが高い相手にはクリティカルでもダメージが小さいはず');
});

test('クリティカル判定：rngの境界（criticalRate=5 → 閾値0.05）', () => {
  assert.equal(rollCritical(5, () => 0.049999), true);
  assert.equal(rollCritical(5, () => 0.05), false);
  assert.equal(rollCritical(0, () => 0), false, '0%は絶対に発生しない');
});

// ---------- 命中率の計算 ----------
test('命中率：技命中80、命中300 vs 回避300 → 80%', () => {
  assert.equal(calculateHitRate({ moveAccuracy: 80, hit: 300, evasion: 300 }), 80);
});
test('命中率：技命中80、命中600 vs 回避300 → 90%', () => {
  assert.equal(calculateHitRate({ moveAccuracy: 80, hit: 600, evasion: 300 }), 90);
});
test('命中率：技命中80、命中300 vs 回避600 → 70%', () => {
  assert.equal(calculateHitRate({ moveAccuracy: 80, hit: 300, evasion: 600 }), 70);
});
test('命中率：命中と回避が同値なら、能力値の大きさに関わらず技固有命中率と一致', () => {
  for (const v of [100, 300, 600, 999]) {
    assert.equal(calculateHitRate({ moveAccuracy: 80, hit: v, evasion: v }), 80);
  }
});
test('命中率：最終値は5%を下回らない／95%を上回らない', () => {
  assert.equal(calculateHitRate({ moveAccuracy: 0, hit: 1, evasion: 999 }), HIT_RATE_MIN);
  assert.equal(calculateHitRate({ moveAccuracy: 100, hit: 999, evasion: 1 }), HIT_RATE_MAX);
});

// ---------- 命中判定 ----------
test('命中判定：rngの境界（命中率80 → 閾値0.80）', () => {
  assert.equal(rollHit(80, () => 0.799999), true);
  assert.equal(rollHit(80, () => 0.8), false);
});

// ---------- 999超えの実効能力値をclampしない ----------
test('999を超える実効能力値（バフ想定）を入力しても、勝手に999へ丸められない', () => {
  const clamped999 = calculateBaseDamage({ movePower: 70, attackStat: 999, defenseStat: 999 });
  const over999 = calculateBaseDamage({ movePower: 70, attackStat: 1170, defenseStat: 999 }); // power900+攻撃力大UP30%相当
  assert.notEqual(Math.round(over999), Math.round(clamped999));
  assert.ok(over999 > clamped999, '999超えの攻撃力はそのまま計算に反映されるはず');

  const overHit = calculateHitRate({ moveAccuracy: 50, hit: 1170, evasion: 300 });
  assert.ok(overHit > calculateHitRate({ moveAccuracy: 50, hit: 999, evasion: 300 }));
});

// ---------- 不正入力の検証 ----------
test('不正入力：ダメージ計算は0以下・NaN・Infinityを例外にする', () => {
  for (const bad of [0, -10, NaN, Infinity, -Infinity]) {
    assert.throws(() => calculateBaseDamage({ movePower: bad, attackStat: 100, defenseStat: 100 }));
    assert.throws(() => calculateBaseDamage({ movePower: 70, attackStat: bad, defenseStat: 100 }));
    assert.throws(() => calculateBaseDamage({ movePower: 70, attackStat: 100, defenseStat: bad }));
  }
});
test('不正入力：確率値（クリティカル率・命中率）は0〜100の範囲外を例外にする', () => {
  for (const bad of [-1, 101, NaN, Infinity]) {
    assert.throws(() => rollCritical(bad, () => 0));
    assert.throws(() => rollHit(bad, () => 0));
    assert.throws(() => calculateHitRate({ moveAccuracy: bad, hit: 100, evasion: 100 }));
  }
});
test('不正入力：乱数源が[0,1)の範囲外の値を返したら例外にする', () => {
  assert.throws(() => applyDamageVariance(100, () => 1));
  assert.throws(() => applyDamageVariance(100, () => -0.1));
});

// =========================================================
// バフ・デバフ PHASE 3
// =========================================================

// ---------- 1〜3：強度の数値 ----------
test('バフ・デバフ強度：小10%／中20%／大30%', () => {
  assert.equal(EFFECT_SIZE_RATIO.small, 0.10);
  assert.equal(EFFECT_SIZE_RATIO.medium, 0.20);
  assert.equal(EFFECT_SIZE_RATIO.large, 0.30);
});

// ---------- 4〜11：効果対象（攻撃力→power/wisdom、防御力→toughness、命中→hit、回避→evasion、life/speedは対象外） ----------
test('効果対象：攻撃力UPはpower・wisdomへ作用し、toughnessへは作用しない', () => {
  const buffs = [createEffect({ category: 'attack', direction: 'up', size: 'medium', remainingTurns: 2, appliedTurn: 1 })];
  assert.equal(getEffectiveStat({ baseStat: 300, statKey: 'power', buffs, debuffs: [] }), 360);
  assert.equal(getEffectiveStat({ baseStat: 300, statKey: 'wisdom', buffs, debuffs: [] }), 360);
  assert.equal(getEffectiveStat({ baseStat: 300, statKey: 'toughness', buffs, debuffs: [] }), 300, '攻撃力UPはtoughnessへ作用しない');
});
test('効果対象：防御力UPはtoughnessへ作用する', () => {
  const buffs = [createEffect({ category: 'defense', direction: 'up', size: 'medium', remainingTurns: 2, appliedTurn: 1 })];
  assert.equal(getEffectiveStat({ baseStat: 300, statKey: 'toughness', buffs, debuffs: [] }), 360);
  assert.equal(getEffectiveStat({ baseStat: 300, statKey: 'power', buffs, debuffs: [] }), 300, '防御力UPはpowerへ作用しない');
});
test('効果対象：命中UPはhitへ、回避UPはevasionへ作用する', () => {
  const hitBuff = [createEffect({ category: 'hit', direction: 'up', size: 'small', remainingTurns: 1, appliedTurn: 1 })];
  const evasionBuff = [createEffect({ category: 'evasion', direction: 'up', size: 'small', remainingTurns: 1, appliedTurn: 1 })];
  assert.equal(getEffectiveStat({ baseStat: 300, statKey: 'hit', buffs: hitBuff, debuffs: [] }), 330);
  assert.equal(getEffectiveStat({ baseStat: 300, statKey: 'evasion', buffs: evasionBuff, debuffs: [] }), 330);
});
test('効果対象：lifeとspeedは対象外statKeyとして拒否される', () => {
  assert.throws(() => getEffectiveStat({ baseStat: 300, statKey: 'life', buffs: [], debuffs: [] }));
  assert.throws(() => getEffectiveStat({ baseStat: 5, statKey: 'speed', buffs: [], debuffs: [] }));
});

// ---------- 12〜16：実効能力値の計算基準（合計補正・連続乗算禁止・上限なし・下限1） ----------
test('実効能力値：基礎600に+20%-10%で660（合計補正。連続乗算648にはならない）', () => {
  const buffs = [createEffect({ category: 'attack', direction: 'up', size: 'medium', remainingTurns: 2, appliedTurn: 1 })];
  const debuffs = [createEffect({ category: 'attack', direction: 'down', size: 'small', remainingTurns: 2, appliedTurn: 1 })];
  const effective = getEffectiveStat({ baseStat: 600, statKey: 'power', buffs, debuffs });
  assert.equal(effective, 660);
  assert.notEqual(effective, 648);
});
test('実効能力値：基礎900に大UP+30%で1170（999でclampされない）', () => {
  const buffs = [createEffect({ category: 'attack', direction: 'up', size: 'large', remainingTurns: 1, appliedTurn: 1 })];
  assert.equal(getEffectiveStat({ baseStat: 900, statKey: 'power', buffs, debuffs: [] }), 1170);
});
test('実効能力値：デバフで0未満になる場合は最低値1にclampされる', () => {
  const debuffs = [
    createEffect({ category: 'attack', direction: 'down', size: 'large', remainingTurns: 1, appliedTurn: 1, stackable: true }),
    createEffect({ category: 'attack', direction: 'down', size: 'large', remainingTurns: 1, appliedTurn: 1, stackable: true }),
    createEffect({ category: 'attack', direction: 'down', size: 'large', remainingTurns: 1, appliedTurn: 1, stackable: true }),
    createEffect({ category: 'attack', direction: 'down', size: 'large', remainingTurns: 1, appliedTurn: 1, stackable: true }),
  ]; // 合計-120%
  assert.equal(getEffectiveStat({ baseStat: 50, statKey: 'power', buffs: [], debuffs }), 1);
});

// ---------- 17〜19：重複不可時の置換ルール ----------
test('重複不可：弱い新効果は既存の強い効果を上書きしない', () => {
  const strong = createEffect({ category: 'attack', direction: 'up', size: 'large', remainingTurns: 3, appliedTurn: 1 });
  const weak = createEffect({ category: 'attack', direction: 'up', size: 'small', remainingTurns: 5, appliedTurn: 2 });
  const result = applyEffect([strong], weak);
  assert.deepEqual(result, [strong]);
});
test('重複不可：強い新効果は既存を置き換える', () => {
  const weak = createEffect({ category: 'attack', direction: 'up', size: 'small', remainingTurns: 2, appliedTurn: 1 });
  const strong = createEffect({ category: 'attack', direction: 'up', size: 'medium', remainingTurns: 1, appliedTurn: 2 });
  const result = applyEffect([weak], strong);
  assert.deepEqual(result, [strong]);
});
test('重複不可：同強度なら残りターンが長い方を残す', () => {
  const shortOne = createEffect({ category: 'attack', direction: 'up', size: 'medium', remainingTurns: 1, appliedTurn: 1 });
  const longOne = createEffect({ category: 'attack', direction: 'up', size: 'medium', remainingTurns: 3, appliedTurn: 2 });
  assert.deepEqual(applyEffect([shortOne], longOne), [longOne], '新しい方が長ければ置き換える');
  assert.deepEqual(applyEffect([longOne], shortOne), [longOne], '新しい方が短ければ既存を維持する');
});

// ---------- 20〜21：UPとDOWNの同時存在・相殺 ----------
test('UPとDOWNは別方向なので同時存在でき、実効値計算時に相殺される', () => {
  const buffs = [createEffect({ category: 'attack', direction: 'up', size: 'medium', remainingTurns: 2, appliedTurn: 1 })];
  const debuffs = [createEffect({ category: 'attack', direction: 'down', size: 'small', remainingTurns: 2, appliedTurn: 1 })];
  assert.equal(buffs.length, 1);
  assert.equal(debuffs.length, 1);
  assert.equal(getEffectiveStat({ baseStat: 600, statKey: 'power', buffs, debuffs }), 660);
});

// ---------- 22〜24：stackable ----------
test('stackable：デフォルトはfalse', () => {
  const e = createEffect({ category: 'hit', direction: 'up', size: 'small', remainingTurns: 1, appliedTurn: 1 });
  assert.equal(e.stackable, false);
});
test('stackable=trueなら同種効果を複数保持でき、合算される', () => {
  const e1 = createEffect({ category: 'hit', direction: 'up', size: 'small', remainingTurns: 2, appliedTurn: 1, stackable: true });
  const e2 = createEffect({ category: 'hit', direction: 'up', size: 'small', remainingTurns: 2, appliedTurn: 1, stackable: true });
  const list = applyEffect(applyEffect([], e1), e2);
  assert.equal(list.length, 2, '2つとも保持される（マージされない）');
  assert.equal(getEffectiveStat({ baseStat: 300, statKey: 'hit', buffs: list, debuffs: [] }), 360, '10%+10%=20%として合算される');
});

// ---------- stackable仕様の明確化（「通常効果枠」と「stackable=trueの追加効果枠」は別物） ----------
test('stackable仕様①：通常＋通常は従来通り1枠（強い方優先、同強度なら残りターン長い方）', () => {
  const weak = createEffect({ category: 'attack', direction: 'up', size: 'small', remainingTurns: 2, appliedTurn: 1 });
  const strong = createEffect({ category: 'attack', direction: 'up', size: 'medium', remainingTurns: 1, appliedTurn: 2 });
  assert.deepEqual(applyEffect([weak], strong), [strong], '強い方に置き換わる');
  assert.deepEqual(applyEffect([strong], weak), [strong], '弱い方は無視される');
});

test('stackable仕様②：通常効果が存在する状態でstackable効果を受けると共存する（通常枠は無傷）', () => {
  const normal = createEffect({ category: 'attack', direction: 'up', size: 'medium', remainingTurns: 2, appliedTurn: 1 });
  const stack = createEffect({ category: 'attack', direction: 'up', size: 'small', remainingTurns: 2, appliedTurn: 1, stackable: true });
  const list = applyEffect([normal], stack);
  assert.equal(list.length, 2);
  assert.ok(list.includes(normal), '通常効果はそのまま残る');
  assert.ok(list.includes(stack));
});

test('stackable仕様③：stackable効果が先に存在する状態で通常効果を受けても、stackableは維持され、通常枠が新規追加される', () => {
  const stack = createEffect({ category: 'attack', direction: 'up', size: 'small', remainingTurns: 2, appliedTurn: 1, stackable: true });
  const normal = createEffect({ category: 'attack', direction: 'up', size: 'small', remainingTurns: 2, appliedTurn: 2 });
  const list = applyEffect([stack], normal);
  assert.equal(list.length, 2, '既存の通常効果が無いので、通常枠が新しく1つ追加される');
  assert.ok(list.includes(stack), 'stackable効果は削除・置換されない');
  assert.ok(list.includes(normal));
});

test('stackable仕様④：stackableが存在していても、通常枠同士の強弱比較は維持される（弱い通常効果を受けても通常枠は変わらない）', () => {
  // ユーザー提示の例：中UP(通常)+20% と 小UP(stackable)+10% が共存 → 合計+30%
  let list = [];
  list = applyEffect(list, createEffect({ category: 'attack', direction: 'up', size: 'medium', remainingTurns: 2, appliedTurn: 1 }));
  list = applyEffect(list, createEffect({ category: 'attack', direction: 'up', size: 'small', remainingTurns: 2, appliedTurn: 1, stackable: true }));
  // さらに弱い通常（小UP+10%）を受けても、通常枠（中UP+20%）は中UPより弱いため置き換わらない
  const weakerNormal = createEffect({ category: 'attack', direction: 'up', size: 'small', remainingTurns: 5, appliedTurn: 2 });
  const after = applyEffect(list, weakerNormal);
  assert.equal(after.length, 2, '弱い通常効果は追加されず、既存の2枠のまま');
  assert.equal(after.find((e) => !e.stackable).size, 'medium', '通常枠は中UPのまま');
  assert.equal(getEffectiveStat({ baseStat: 1000, statKey: 'power', buffs: after, debuffs: [] }), 1300, '合計+30%を維持する');
});

test('stackable仕様⑤：stackable＋stackableは複数保持され、それぞれ独立したremainingTurns/appliedTurnを持つ', () => {
  const s1 = createEffect({ category: 'attack', direction: 'up', size: 'small', remainingTurns: 1, appliedTurn: 1, stackable: true });
  const s2 = createEffect({ category: 'attack', direction: 'up', size: 'small', remainingTurns: 3, appliedTurn: 2, stackable: true });
  const list = applyEffect(applyEffect([], s1), s2);
  assert.equal(list.length, 2);
  assert.equal(list[0].remainingTurns, 1);
  assert.equal(list[1].remainingTurns, 3);
  assert.equal(list[0].appliedTurn, 1);
  assert.equal(list[1].appliedTurn, 2);
});

test('stackable仕様⑥：通常枠＋stackable枠が混在していても、remainingTurnsはそれぞれ独立に減少・解除される', () => {
  const normal = createEffect({ category: 'attack', direction: 'up', size: 'medium', remainingTurns: 1, appliedTurn: 1 });     // 先に切れる
  const stack = createEffect({ category: 'attack', direction: 'up', size: 'small', remainingTurns: 3, appliedTurn: 1, stackable: true }); // 長く残る
  let list = [normal, stack];
  list = advanceEffects(list, 2); // normal:1→0で消滅、stack:3→2
  assert.equal(list.length, 1);
  assert.equal(list[0].stackable, true);
  assert.equal(list[0].remainingTurns, 2);
});

test('stackable仕様⑦：Checkpoint往復後も通常枠とstackable枠の構造が完全に維持される', () => {
  const session = createBattleSession({ unitA: ind('A'), unitB: ind('B'), battleType: 'official', rng: () => 0.1 });
  applyEffectToSession(session, 'A', createEffect({ category: 'attack', direction: 'up', size: 'medium', remainingTurns: 2, appliedTurn: 1 }));
  applyEffectToSession(session, 'A', createEffect({ category: 'attack', direction: 'up', size: 'small', remainingTurns: 2, appliedTurn: 1, stackable: true }));
  const restored = restoreSession(createCheckpoint(session));
  assert.equal(restored.buffs.A.length, 2);
  assert.deepEqual(restored.buffs.A, session.buffs.A);
  const normalCount = restored.buffs.A.filter((e) => !e.stackable).length;
  const stackCount = restored.buffs.A.filter((e) => e.stackable).length;
  assert.equal(normalCount, 1);
  assert.equal(stackCount, 1);
  assert.equal(getEffectiveStat({ baseStat: 1000, statKey: 'power', buffs: restored.buffs.A, debuffs: [] }), 1300);
});

// ---------- 25〜28：効果ターンの減算 ----------
test('効果ターン：付与ラウンド終了時は減らない。以後2→1→0で解除', () => {
  const effect = createEffect({ category: 'attack', direction: 'up', size: 'small', remainingTurns: 2, appliedTurn: 5 });
  let list = [effect];
  list = advanceEffects(list, 5); // 付与されたのと同じターン＝減らない
  assert.equal(list[0].remainingTurns, 2);
  list = advanceEffects(list, 6); // 次のラウンド終了
  assert.equal(list[0].remainingTurns, 1);
  list = advanceEffects(list, 7); // さらに次のラウンド終了
  assert.equal(list.length, 0, '0になったら取り除かれる');
});
test('効果ターン：複数効果がそれぞれ独立に減算／解除される', () => {
  const a = createEffect({ category: 'attack', direction: 'up', size: 'small', remainingTurns: 1, appliedTurn: 1 });
  const b = createEffect({ category: 'defense', direction: 'up', size: 'small', remainingTurns: 3, appliedTurn: 1 });
  let list = [a, b];
  list = advanceEffects(list, 2); // a:1→0で消える, b:3→2
  assert.equal(list.length, 1);
  assert.equal(list[0].category, 'defense');
  assert.equal(list[0].remainingTurns, 2);
});

// ---------- 29：A/Bで状態が混ざらない ----------
test('Battle Session：A側とB側の効果は独立している', () => {
  const session = createBattleSession({ unitA: ind('A'), unitB: ind('B'), battleType: 'official', rng: () => 0.1 });
  applyEffectToSession(session, 'A', createEffect({ category: 'attack', direction: 'up', size: 'small', remainingTurns: 2, appliedTurn: 1 }));
  applyEffectToSession(session, 'B', createEffect({ category: 'defense', direction: 'down', size: 'large', remainingTurns: 1, appliedTurn: 1 }));
  assert.equal(session.buffs.A.length, 1);
  assert.equal(session.buffs.B.length, 0);
  assert.equal(session.debuffs.B.length, 1);
  assert.equal(session.debuffs.A.length, 0);
  advanceEffectsForSession(session, 'A');
  assert.equal(session.buffs.A[0].remainingTurns, 2, 'Aは付与ターンと同じなので減らない');
  assert.equal(session.debuffs.B.length, 1, 'B側はAのadvance呼び出しの影響を受けない');
});

// ---------- 30〜31：Checkpointとの互換性 ----------
test('Battle Checkpoint：効果情報（カテゴリ・方向・強度・残りターン・付与ターン・stackable）が完全保持される', () => {
  const session = createBattleSession({ unitA: ind('A'), unitB: ind('B'), battleType: 'official', rng: () => 0.1 });
  applyEffectToSession(session, 'A', createEffect({ category: 'attack', direction: 'up', size: 'medium', remainingTurns: 2, appliedTurn: 1 }));
  applyEffectToSession(session, 'A', createEffect({ category: 'hit', direction: 'up', size: 'small', remainingTurns: 1, appliedTurn: 1, stackable: true }));
  applyEffectToSession(session, 'B', createEffect({ category: 'defense', direction: 'down', size: 'large', remainingTurns: 3, appliedTurn: 1 }));

  const checkpoint = createCheckpoint(session);
  const restored = restoreSession(checkpoint);

  assert.deepEqual(restored.buffs, session.buffs);
  assert.deepEqual(restored.debuffs, session.debuffs);
  assert.equal(restored.buffs.A[0].category, 'attack');
  assert.equal(restored.buffs.A[0].direction, 'up');
  assert.equal(restored.buffs.A[0].size, 'medium');
  assert.equal(restored.buffs.A[0].remainingTurns, 2);
  assert.equal(restored.buffs.A[0].appliedTurn, 1);
  assert.equal(restored.buffs.A[1].stackable, true);
  assert.equal(restored.debuffs.B[0].remainingTurns, 3);
});
test('Battle Checkpoint：復元後のremainingTurnsが正しい（ターン経過後に保存したケース）', () => {
  const session = createBattleSession({ unitA: ind('A'), unitB: ind('B'), battleType: 'official', rng: () => 0.1 });
  applyEffectToSession(session, 'A', createEffect({ category: 'attack', direction: 'up', size: 'small', remainingTurns: 3, appliedTurn: 1 }));
  session.turn = 2;
  advanceEffectsForSession(session, 'A'); // 3→2
  const restored = restoreSession(createCheckpoint(session));
  assert.equal(restored.buffs.A[0].remainingTurns, 2);
});

// ---------- 32〜38：不正入力の検証 ----------
test('不正入力：createEffectは不正なカテゴリ／方向／強度／残りターン／付与ターンを拒否する', () => {
  const base = { category: 'attack', direction: 'up', size: 'small', remainingTurns: 1, appliedTurn: 1 };
  assert.throws(() => createEffect({ ...base, category: 'speed' }), 'カテゴリ不正');
  assert.throws(() => createEffect({ ...base, direction: 'sideways' }), '方向不正');
  assert.throws(() => createEffect({ ...base, size: 'extra-large' }), '強度不正');
  for (const bad of [0, -1, 1.5, NaN]) {
    assert.throws(() => createEffect({ ...base, remainingTurns: bad }), `remainingTurns不正:${bad}`);
    assert.throws(() => createEffect({ ...base, appliedTurn: bad }), `appliedTurn不正:${bad}`);
  }
});
test('不正入力：getEffectiveStatは不正なbaseStatと対象外statKeyを拒否する', () => {
  for (const bad of [0, -100, NaN, Infinity]) {
    assert.throws(() => getEffectiveStat({ baseStat: bad, statKey: 'power', buffs: [], debuffs: [] }));
  }
  assert.throws(() => getEffectiveStat({ baseStat: 300, statKey: 'unknown', buffs: [], debuffs: [] }));
});

// =========================================================
// バトル進行 PHASE 4（1ラウンド処理）
// =========================================================

// 乱数を完全固定するための小さなヘルパー（[0,1)の境界を踏まえて確実に片方へ倒す）
const ALWAYS_HIT = () => 0;            // hitRateは最低5%以上なので、0は必ず命中側
const ALWAYS_MISS = () => 0.999999;    // hitRateは最大95%なので、これは必ず外れる
const NO_VARIANCE = () => 0.5;         // ダメージ乱数を常に×1.00に固定
const ALWAYS_CRIT = () => 0;           // criticalRateが0より大きければ必ず発生
const NO_CRIT = () => 0.999999;        // 必ず非発生

function fixedRng({ hit = ALWAYS_HIT, damage = NO_VARIANCE, critical = NO_CRIT } = {}) {
  return { hitRng: hit, damageRng: damage, criticalRng: critical };
}

const scratch = (over = {}) => ({ id: 'scratch', type: 'power', power: 70, accuracy: 80, critical: 5, effects: [], ...over });

function statsOf({ life = 300, power = 300, wisdom = 300, hit = 300, evasion = 300, toughness = 300 } = {}) {
  return { life, power, wisdom, hit, evasion, toughness };
}

/** firstActor を明示的に 'A' または 'B' に固定した Battle Session を作る（同speedで50/50、境界rngで決め打つ） */
function sessionWithFirstActor(first, { statsA = statsOf(), statsB = statsOf() } = {}) {
  const a = createIndividual(config, { speciesId: 'devA', nickname: 'A', origin: 'market', stats: statsA, speed: 5 });
  const b = createIndividual(config, { speciesId: 'devB', nickname: 'B', origin: 'market', stats: statsB, speed: 5 });
  const session = createBattleSession({ unitA: a, unitB: b, battleType: 'official', rng: first === 'A' ? () => 0 : () => 0.99 });
  assert.equal(session.firstActor, first); // 前提が崩れていないことの自己チェック
  return { session, baseStats: { A: a.stats, B: b.stats } };
}

// ---------- 1〜3・35：先攻/後攻の順序と再抽選禁止 ----------
test('1ラウンド：firstActor=Aなら A→B の順で行動する', () => {
  const { session, baseStats } = sessionWithFirstActor('A');
  const result = resolveRound(session, { A: scratch(), B: scratch() }, { baseStats, rng: fixedRng() });
  assert.deepEqual(result.actions.map((a) => a.actor), ['A', 'B']);
});
test('1ラウンド：firstActor=Bなら B→A の順で行動する', () => {
  const { session, baseStats } = sessionWithFirstActor('B');
  const result = resolveRound(session, { A: scratch(), B: scratch() }, { baseStats, rng: fixedRng() });
  assert.deepEqual(result.actions.map((a) => a.actor), ['B', 'A']);
});
test('1ラウンド：複数ラウンド処理してもfirstActorは再抽選されない（session.firstActorは不変）', () => {
  const { session, baseStats } = sessionWithFirstActor('A');
  const before = session.firstActor;
  resolveRound(session, { A: scratch(), B: scratch() }, { baseStats, rng: fixedRng() });
  resolveRound(session, { A: scratch(), B: scratch() }, { baseStats, rng: fixedRng() });
  assert.equal(session.firstActor, before);
});

// ---------- 4〜8：攻撃能力・防御能力・命中回避の接続 ----------
test('1ラウンド：power技は攻撃側の実効powerを使う（wisdomを変えても結果が変わらない）', () => {
  const { session: s1, baseStats: b1 } = sessionWithFirstActor('A', { statsA: statsOf({ power: 600, wisdom: 100 }) });
  const { session: s2, baseStats: b2 } = sessionWithFirstActor('A', { statsA: statsOf({ power: 600, wisdom: 900 }) });
  const r1 = resolveRound(s1, { A: scratch(), B: scratch() }, { baseStats: b1, rng: fixedRng() });
  const r2 = resolveRound(s2, { A: scratch(), B: scratch() }, { baseStats: b2, rng: fixedRng() });
  assert.equal(r1.actions[0].damage, r2.actions[0].damage, 'wisdomの差はpower技のダメージに影響しない');
});
test('1ラウンド：wisdom技は攻撃側の実効wisdomを使う', () => {
  const { session, baseStats } = sessionWithFirstActor('A', { statsA: statsOf({ power: 100, wisdom: 600 }) });
  const result = resolveRound(session, { A: scratch({ type: 'wisdom' }), B: scratch() }, { baseStats, rng: fixedRng() });
  const expected = finalizeDamage(applyDamageVariance(calculateBaseDamage({ movePower: 70, attackStat: 600, defenseStat: 300 }), NO_VARIANCE), false);
  assert.equal(result.actions[0].damage, expected);
});
test('1ラウンド：防御側は実効toughnessを使う', () => {
  const { session, baseStats } = sessionWithFirstActor('A', { statsB: statsOf({ toughness: 900 }) });
  const result = resolveRound(session, { A: scratch(), B: scratch() }, { baseStats, rng: fixedRng() });
  const expected = finalizeDamage(applyDamageVariance(calculateBaseDamage({ movePower: 70, attackStat: 300, defenseStat: 900 }), NO_VARIANCE), false);
  assert.equal(result.actions[0].damage, expected);
});
test('1ラウンド：命中率は実効hit・実効evasionからcalculateHitRateと同じ値になる（combatMathを再利用）', () => {
  const { session, baseStats } = sessionWithFirstActor('A', { statsA: statsOf({ hit: 600 }), statsB: statsOf({ evasion: 300 }) });
  const result = resolveRound(session, { A: scratch(), B: scratch() }, { baseStats, rng: fixedRng() });
  assert.equal(result.actions[0].hitRate, calculateHitRate({ moveAccuracy: 80, hit: 600, evasion: 300 }));
});
test('1ラウンド：回避側の実効evasionが高いほど命中率が下がる', () => {
  const { session, baseStats } = sessionWithFirstActor('A', { statsB: statsOf({ evasion: 600 }) });
  const result = resolveRound(session, { A: scratch(), B: scratch() }, { baseStats, rng: fixedRng() });
  assert.equal(result.actions[0].hitRate, calculateHitRate({ moveAccuracy: 80, hit: 300, evasion: 600 }));
});

// ---------- 9〜12：Miss ----------
test('1ラウンド：Missならdamage=0・hitCount/totalDamage増加なし・追加効果なし', () => {
  const { session, baseStats } = sessionWithFirstActor('A');
  const move = scratch({ effects: [{ target: 'self', category: 'attack', direction: 'up', size: 'small', remainingTurns: 2 }] });
  const result = resolveRound(session, { A: move, B: scratch() }, { baseStats, rng: fixedRng({ hit: ALWAYS_MISS }) });
  const a = result.actions[0];
  assert.equal(a.hit, false);
  assert.equal(a.damage, 0);
  assert.deepEqual(a.effectsApplied, []);
  assert.equal(session.hitCount.A, 0);
  assert.equal(session.totalDamage.A, 0);
  assert.equal(session.buffs.A.length, 0, 'Missなので自己バフも付与されない');
});

// ---------- 13〜14：命中時の記録 ----------
test('1ラウンド：命中したらhitCount+1、totalDamageが加算される', () => {
  const { session, baseStats } = sessionWithFirstActor('A');
  resolveRound(session, { A: scratch(), B: scratch() }, { baseStats, rng: fixedRng() });
  assert.equal(session.hitCount.A, 1);
  assert.equal(session.hitCount.B, 1);
  assert.ok(session.totalDamage.A > 0);
  assert.ok(session.totalDamage.B > 0);
});

// ---------- 15・34：クリティカル ----------
test('1ラウンド：クリティカルはPhase2仕様どおり1.5倍。hitCountは+1のみ', () => {
  const { session: sNormal, baseStats: bNormal } = sessionWithFirstActor('A');
  const { session: sCrit, baseStats: bCrit } = sessionWithFirstActor('A');
  const normal = resolveRound(sNormal, { A: scratch(), B: scratch() }, { baseStats: bNormal, rng: fixedRng({ critical: NO_CRIT }) });
  const crit = resolveRound(sCrit, { A: scratch(), B: scratch() }, { baseStats: bCrit, rng: fixedRng({ critical: ALWAYS_CRIT }) });
  assert.equal(normal.actions[0].critical, false);
  assert.equal(crit.actions[0].critical, true);
  // 丸めは「クリティカル適用後」に1回だけ行われる（Phase2 finalizeDamage）。
  // round(x)*1.5 と round(x*1.5) は丸め誤差で一致しないことがあるため、丸め前の値から直接期待値を出す。
  const withVariance = applyDamageVariance(calculateBaseDamage({ movePower: 70, attackStat: 300, defenseStat: 300 }), NO_VARIANCE);
  assert.equal(normal.actions[0].damage, finalizeDamage(withVariance, false));
  assert.equal(crit.actions[0].damage, finalizeDamage(withVariance, true));
  assert.ok(crit.actions[0].damage > normal.actions[0].damage * 1.4, 'クリティカルはおおよそ1.5倍高い');
  assert.equal(sCrit.hitCount.A, 1, 'クリティカルでもhitCountは+1のみ');
});

// ---------- 16〜18：currentLife・オーバーキル ----------
test('1ラウンド：currentLifeが正しく減り、0未満にはならない。オーバーキル時totalDamageは実際に減った分だけ', () => {
  const { session, baseStats } = sessionWithFirstActor('A', { statsB: statsOf({ life: 5 }) });
  const result = resolveRound(session, { A: scratch({ power: 999 }), B: scratch() }, { baseStats, rng: fixedRng() });
  assert.equal(result.actions[0].damage > 5, true, '計算上のダメージは5を超える');
  assert.equal(session.currentLife.B, 0, '0未満にはならない');
  assert.equal(session.totalDamage.A, 5, 'totalDamageは実際に減った5のみ（計算上のダメージそのものではない）');
});

// ---------- 19〜22・32〜33・35〜36：KO ----------
test('1ラウンド：先攻がKOしたら後攻は行動しない（actions.length===1）。winnerは先攻。turn/Effectは進まない', () => {
  const { session, baseStats } = sessionWithFirstActor('A', { statsB: statsOf({ life: 1 }) });
  applyEffectToSession(session, 'A', createEffect({ category: 'attack', direction: 'up', size: 'small', remainingTurns: 2, appliedTurn: session.turn }));
  const turnBefore = session.turn;
  const result = resolveRound(session, { A: scratch(), B: scratch() }, { baseStats, rng: fixedRng() });
  assert.equal(result.ko, true);
  assert.equal(result.winner, 'A');
  assert.equal(result.actions.length, 1);
  assert.equal(session.turn, turnBefore, 'KO時はturnが進まない');
  assert.equal(session.buffs.A[0].remainingTurns, 2, 'KO時はEffectの残りターンも減らない');
  assert.equal(session.firstActor, 'A', 'KO時もfirstActorは変わらない');
});
test('1ラウンド：後攻がKOした場合actions.length===2、winnerは後攻', () => {
  const { session, baseStats } = sessionWithFirstActor('A', { statsA: statsOf({ life: 1 }) });
  const result = resolveRound(session, { A: scratch(), B: scratch() }, { baseStats, rng: fixedRng() });
  assert.equal(result.ko, true);
  assert.equal(result.winner, 'B');
  assert.equal(result.actions.length, 2);
});
test('1ラウンド：KOした技では追加効果を付与しない', () => {
  const { session, baseStats } = sessionWithFirstActor('A', { statsB: statsOf({ life: 1 }) });
  const move = scratch({ effects: [{ target: 'opponent', category: 'defense', direction: 'down', size: 'small', remainingTurns: 2 }] });
  const result = resolveRound(session, { A: move, B: scratch() }, { baseStats, rng: fixedRng() });
  assert.equal(result.actions[0].ko, true);
  assert.deepEqual(result.actions[0].effectsApplied, []);
  assert.equal(session.debuffs.B.length, 0);
});

// ---------- 24〜30：追加効果 ----------
test('1ラウンド：命中＋非KOなら追加効果が付与され、target=selfは使用者へ入る', () => {
  const { session, baseStats } = sessionWithFirstActor('A');
  const move = scratch({ effects: [{ target: 'self', category: 'attack', direction: 'up', size: 'small', remainingTurns: 2 }] });
  const result = resolveRound(session, { A: move, B: scratch() }, { baseStats, rng: fixedRng() });
  assert.equal(result.actions[0].effectsApplied.length, 1);
  assert.equal(result.actions[0].effectsApplied[0].target, 'A');
  assert.equal(session.buffs.A.length, 1);
  assert.equal(session.buffs.B.length, 0);
});
test('1ラウンド：target=opponentは相手へ入る', () => {
  const { session, baseStats } = sessionWithFirstActor('A');
  const move = scratch({ effects: [{ target: 'opponent', category: 'defense', direction: 'down', size: 'medium', remainingTurns: 3 }] });
  resolveRound(session, { A: move, B: scratch() }, { baseStats, rng: fixedRng() });
  assert.equal(session.debuffs.B.length, 1);
  assert.equal(session.debuffs.A.length, 0);
});
test('1ラウンド：付与されたEffectのappliedTurnは現在のsession.turn。付与ラウンド終了時は減らない', () => {
  const { session, baseStats } = sessionWithFirstActor('A');
  const move = scratch({ effects: [{ target: 'self', category: 'hit', direction: 'up', size: 'small', remainingTurns: 2 }] });
  const turnAtApply = session.turn;
  resolveRound(session, { A: move, B: scratch() }, { baseStats, rng: fixedRng() }); // 両者生存→ラウンド終了処理まで走る
  assert.equal(session.buffs.A[0].appliedTurn, turnAtApply);
  assert.equal(session.buffs.A[0].remainingTurns, 2, '付与されたのと同じラウンドの終了処理では減らない');
});
test('1ラウンド：古いEffectはラウンド終了時に1減り、0になると解除される', () => {
  const { session, baseStats } = sessionWithFirstActor('A');
  applyEffectToSession(session, 'A', createEffect({ category: 'attack', direction: 'up', size: 'small', remainingTurns: 1, appliedTurn: session.turn }));
  session.turn += 1; // 「前のラウンドで付与された」状態を作るため、既存のセッションを次のラウンドへ進める
  resolveRound(session, { A: scratch(), B: scratch() }, { baseStats, rng: fixedRng() });
  assert.equal(session.buffs.A.length, 0, 'remainingTurns 1→0で解除される');
});

// ---------- 31：通常ラウンド終了後のturn更新 ----------
test('1ラウンド：両者生存の通常終了後、session.turnが+1される', () => {
  const { session, baseStats } = sessionWithFirstActor('A');
  const before = session.turn;
  const result = resolveRound(session, { A: scratch(), B: scratch() }, { baseStats, rng: fixedRng() });
  assert.equal(session.turn, before + 1);
  assert.equal(result.turn, before, 'ラウンド結果のturnは処理したラウンド番号');
});

// ---------- 36：恒久スナップショット保護 ----------
test('1ラウンド：participantsの恒久スナップショット（uid/speciesId/speed/maxLife）は変更されない', () => {
  const { session, baseStats } = sessionWithFirstActor('A');
  const before = structuredClone(session.participants);
  resolveRound(session, { A: scratch(), B: scratch() }, { baseStats, rng: fixedRng() });
  assert.deepEqual(session.participants, before);
});

// ---------- 37〜39：A/Bの独立性 ----------
test('1ラウンド：currentLife/hitCount/totalDamageはA/Bで混ざらない', () => {
  const { session, baseStats } = sessionWithFirstActor('A', { statsB: statsOf({ evasion: 999 }) }); // Bは回避が高くAの攻撃が当たりにくい
  resolveRound(session, { A: scratch(), B: scratch() }, { baseStats, rng: fixedRng({ hit: () => 0.5 }) });
  // 少なくとも構造としてA/Bが独立していることを確認（値が相互汚染していない）
  assert.notEqual(session.currentLife.A, undefined);
  assert.notEqual(session.currentLife.B, undefined);
  assert.equal(typeof session.hitCount.A, 'number');
  assert.equal(typeof session.hitCount.B, 'number');
  assert.equal(session.totalDamage.A >= 0 && session.totalDamage.B >= 0, true);
});

// ---------- 40〜44：不正な技入力 ----------
test('不正入力：不正なmove.type／power／accuracy／critical／effectsを拒否する', () => {
  const { session, baseStats } = sessionWithFirstActor('A');
  const run = (move) => resolveRound(session, { A: move, B: scratch() }, { baseStats, rng: fixedRng() });
  assert.throws(() => run(scratch({ type: 'toughness' })));
  assert.throws(() => run(scratch({ power: 0 })));
  assert.throws(() => run(scratch({ power: -10 })));
  assert.throws(() => run(scratch({ accuracy: 101 })));
  assert.throws(() => run(scratch({ accuracy: -1 })));
  assert.throws(() => run(scratch({ critical: 101 })));
  assert.throws(() => run(scratch({ effects: 'not-an-array' })));
  assert.throws(() => run(scratch({ effects: [{ target: 'someone', category: 'attack', direction: 'up', size: 'small', remainingTurns: 1 }] })));
});

// ---------- 45：乱数注入による決定論的な再現性 ----------
test('1ラウンド：同じrngを使えば毎回まったく同じ結果になる', () => {
  const { session: s1, baseStats: b1 } = sessionWithFirstActor('A');
  const { session: s2, baseStats: b2 } = sessionWithFirstActor('A');
  const rng = fixedRng({ critical: ALWAYS_CRIT });
  const r1 = resolveRound(s1, { A: scratch(), B: scratch() }, { baseStats: b1, rng });
  const r2 = resolveRound(s2, { A: scratch(), B: scratch() }, { baseStats: b2, rng });
  assert.deepEqual(r1.actions, r2.actions);
});

// =========================================================
// バトル進行 PHASE 5（power=0のEffect技／ダメージ+Effect技）
// =========================================================

const roar = (over = {}) => ({ id: 'roar', power: 0, accuracy: 85, effects: [{ target: 'opponent', category: 'attack', direction: 'down', size: 'small', remainingTurns: 2 }], ...over });
const downerMist = (over = {}) => ({
  id: 'downer_mist', type: 'wisdom', power: 60, accuracy: 90, critical: 5,
  effects: [
    { target: 'opponent', category: 'attack', direction: 'down', size: 'medium', remainingTurns: 2 },
    { target: 'opponent', category: 'defense', direction: 'down', size: 'medium', remainingTurns: 2 },
  ],
  ...over,
});
// damageRng／criticalRngが呼ばれたら失敗させる（power=0技がこれらを一切消費しないことの検証用）
const forbidden = () => { throw new Error('消費されてはいけない乱数が呼ばれた'); };

// ---------- 1〜3：Phase4攻撃技の回帰確認 ----------
test('Phase5回帰：既存Phase4の攻撃技（power/wisdom）は従来通り動く', () => {
  const { session: s1, baseStats: b1 } = sessionWithFirstActor('A');
  const r1 = resolveRound(s1, { A: scratch(), B: scratch() }, { baseStats: b1, rng: fixedRng() });
  assert.equal(r1.actions[0].hit, true);
  assert.ok(r1.actions[0].damage > 0);

  const { session: s2, baseStats: b2 } = sessionWithFirstActor('A');
  const r2 = resolveRound(s2, { A: scratch({ type: 'wisdom' }), B: scratch() }, { baseStats: b2, rng: fixedRng() });
  assert.ok(r2.actions[0].damage > 0);
});

// ---------- 4〜10：power=0のバリデーション ----------
test('バリデーション：power=0を正式に受理し、typeなし・criticalなしでも通る', () => {
  const { session, baseStats } = sessionWithFirstActor('A');
  const move = { id: 'roar', power: 0, accuracy: 85, effects: [{ target: 'opponent', category: 'attack', direction: 'down', size: 'small', remainingTurns: 2 }] };
  assert.doesNotThrow(() => resolveRound(session, { A: move, B: scratch() }, { baseStats, rng: fixedRng() }));
});
test('バリデーション：power=0かつeffects=[]は拒否する', () => {
  const { session, baseStats } = sessionWithFirstActor('A');
  const move = { id: 'nothing', power: 0, accuracy: 85, effects: [] };
  assert.throws(() => resolveRound(session, { A: move, B: scratch() }, { baseStats, rng: fixedRng() }));
});
test('バリデーション：power<0・不正accuracy・不正Effectを拒否する', () => {
  const { session, baseStats } = sessionWithFirstActor('A');
  const run = (move) => resolveRound(session, { A: move, B: scratch() }, { baseStats, rng: fixedRng() });
  assert.throws(() => run(roar({ power: -1 })));
  assert.throws(() => run(roar({ accuracy: 101 })));
  assert.throws(() => run(roar({ effects: [{ target: 'opponent', category: 'unknown', direction: 'down', size: 'small', remainingTurns: 2 }] })));
});

// ---------- 11〜15：命中判定の共通化 ----------
test('命中：power=0技もPhase2のcalculateHitRateをそのまま使い、命中判定は1回のみ', () => {
  const { session, baseStats } = sessionWithFirstActor('A', { statsA: statsOf({ hit: 600 }), statsB: statsOf({ evasion: 300 }) });
  const result = resolveRound(session, { A: roar(), B: scratch() }, { baseStats, rng: fixedRng() });
  assert.equal(result.actions[0].hitRate, calculateHitRate({ moveAccuracy: 85, hit: 600, evasion: 300 }));
});
test('命中：複数Effectがあってもhitrngは1回しか消費されない（呼び出し回数で検証）', () => {
  const { session, baseStats } = sessionWithFirstActor('A');
  let calls = 0;
  const hitRng = () => { calls++; return 0; };
  resolveAction({ session, baseStats, attackerSide: 'A', move: downerMist(), rng: { hitRng, damageRng: NO_VARIANCE, criticalRng: NO_CRIT } });
  assert.equal(calls, 1, '2Effectを持つ技でも命中判定は1回のみのはず');
});

// ---------- 16〜26：power=0技の挙動 ----------
test('power=0技：命中するとEffectが付与され、damage=0／currentLife不変／critical=false／KOしない', () => {
  const { session, baseStats } = sessionWithFirstActor('A');
  const before = session.currentLife.B;
  const result = resolveRound(session, { A: roar(), B: scratch({ effects: [] }) }, { baseStats, rng: fixedRng() });
  const a = result.actions[0];
  assert.equal(a.hit, true);
  assert.equal(a.damage, 0);
  assert.equal(a.critical, false);
  assert.equal(a.targetLifeBefore, a.targetLifeAfter);
  assert.equal(session.currentLife.B, before, 'currentLifeは不変');
  assert.equal(a.ko, false);
  assert.equal(a.effectsApplied.length, 1);
  assert.equal(session.debuffs.B.length, 1);
});
test('power=0技：Missすると追加効果は付与されない', () => {
  const { session, baseStats } = sessionWithFirstActor('A');
  const result = resolveRound(session, { A: roar(), B: scratch() }, { baseStats, rng: fixedRng({ hit: ALWAYS_MISS }) });
  assert.equal(result.actions[0].hit, false);
  assert.deepEqual(result.actions[0].effectsApplied, []);
  assert.equal(session.debuffs.B.length, 0);
});
test('power=0技：damageRng／criticalRngを一切消費しない', () => {
  const { session, baseStats } = sessionWithFirstActor('A');
  assert.doesNotThrow(() => resolveAction({ session, baseStats, attackerSide: 'A', move: roar(), rng: { hitRng: ALWAYS_HIT, damageRng: forbidden, criticalRng: forbidden } }));
});
test('power=0技：命中でhitCount+1、MissでhitCount+0、totalDamageは増加しない', () => {
  const { session: sHit, baseStats: bHit } = sessionWithFirstActor('A');
  resolveRound(sHit, { A: roar(), B: scratch({ effects: [] }) }, { baseStats: bHit, rng: fixedRng() });
  assert.equal(sHit.hitCount.A, 1);
  assert.equal(sHit.totalDamage.A, 0);

  const { session: sMiss, baseStats: bMiss } = sessionWithFirstActor('A');
  resolveRound(sMiss, { A: roar(), B: scratch() }, { baseStats: bMiss, rng: fixedRng({ hit: ALWAYS_MISS }) });
  assert.equal(sMiss.hitCount.A, 0);
});

// ---------- 27〜41：吠える／ダウナーミスト相当技の確認 ----------
test('吠える相当：power=0のデバフ技として正常に動く', () => {
  const { session, baseStats } = sessionWithFirstActor('A');
  const result = resolveRound(session, { A: roar(), B: scratch({ effects: [] }) }, { baseStats, rng: fixedRng() });
  assert.equal(result.actions[0].effectsApplied[0].effect.category, 'attack');
  assert.equal(result.actions[0].effectsApplied[0].effect.direction, 'down');
});

test('ダウナーミスト相当：威力60・wisdom技として正しくダメージを与える', () => {
  const { session, baseStats } = sessionWithFirstActor('A');
  const result = resolveRound(session, { A: downerMist(), B: scratch() }, { baseStats, rng: fixedRng() });
  const expected = finalizeDamage(applyDamageVariance(calculateBaseDamage({ movePower: 60, attackStat: 300, defenseStat: 300 }), NO_VARIANCE), false);
  assert.equal(result.actions[0].damage, expected);
});
test('ダウナーミスト相当：命中時に2デバフが両方付与され、appliedTurn一致・remainingTurns=2', () => {
  const { session, baseStats } = sessionWithFirstActor('A');
  const turnAtApply = session.turn;
  resolveRound(session, { A: downerMist(), B: scratch() }, { baseStats, rng: fixedRng() });
  assert.equal(session.debuffs.B.length, 2);
  assert.equal(session.debuffs.B[0].appliedTurn, turnAtApply);
  assert.equal(session.debuffs.B[1].appliedTurn, turnAtApply);
  assert.equal(session.debuffs.B[0].remainingTurns, 2, '付与ラウンド終了時には減らない');
  assert.equal(session.debuffs.B[1].remainingTurns, 2);
});
test('ダウナーミスト相当：Miss時はダメージ0・2デバフとも付与なし', () => {
  const { session, baseStats } = sessionWithFirstActor('A');
  const result = resolveRound(session, { A: downerMist(), B: scratch() }, { baseStats, rng: fixedRng({ hit: ALWAYS_MISS }) });
  assert.equal(result.actions[0].damage, 0);
  assert.deepEqual(result.actions[0].effectsApplied, []);
  assert.equal(session.debuffs.B.length, 0);
});
test('ダウナーミスト相当：hitCountは命中時+1のみ（Effectが2つでも+2にならない）、totalDamageはダメージ分のみ', () => {
  const { session, baseStats } = sessionWithFirstActor('A');
  const result = resolveRound(session, { A: downerMist(), B: scratch() }, { baseStats, rng: fixedRng() });
  assert.equal(session.hitCount.A, 1);
  assert.equal(session.totalDamage.A, result.actions[0].damage);
});
test('ダウナーミスト相当：2デバフのremainingTurnsが2→(付与ラウンドは減らず)→1→0で解除される', () => {
  const { session, baseStats } = sessionWithFirstActor('A');
  // このラウンドでダウナーミスト命中→2デバフ付与→両者生存なのでラウンド終了処理まで走る（付与ラウンドなので減らないはず）
  resolveRound(session, { A: downerMist(), B: scratch({ effects: [] }) }, { baseStats, rng: fixedRng() });
  assert.equal(session.debuffs.B[0].remainingTurns, 2, '付与ラウンド終了時は減らない');
  resolveRound(session, { A: scratch({ effects: [] }), B: scratch({ effects: [] }) }, { baseStats, rng: fixedRng() });
  assert.equal(session.debuffs.B[0].remainingTurns, 1, '次のラウンド終了で2→1');
  resolveRound(session, { A: scratch({ effects: [] }), B: scratch({ effects: [] }) }, { baseStats, rng: fixedRng() });
  assert.equal(session.debuffs.B.length, 0, 'さらに次で1→0で解除される');
});

// ---------- 42〜46：ダメージ＋Effect技（バフ／デバフ／混在） ----------
test('ダメージ＋selfバフ：命中→ダメージ→使用者へバフが正しく付与される', () => {
  const { session, baseStats } = sessionWithFirstActor('A');
  const move = scratch({ effects: [{ target: 'self', category: 'attack', direction: 'up', size: 'small', remainingTurns: 2 }] });
  const result = resolveRound(session, { A: move, B: scratch({ effects: [] }) }, { baseStats, rng: fixedRng() });
  assert.ok(result.actions[0].damage > 0);
  assert.equal(session.buffs.A.length, 1);
  assert.equal(session.buffs.B.length, 0);
});
test('ダメージ＋opponentデバフ：命中→ダメージ→相手へデバフが正しく付与される', () => {
  const { session, baseStats } = sessionWithFirstActor('A');
  const move = scratch({ effects: [{ target: 'opponent', category: 'evasion', direction: 'down', size: 'medium', remainingTurns: 2 }] });
  resolveRound(session, { A: move, B: scratch({ effects: [] }) }, { baseStats, rng: fixedRng() });
  assert.equal(session.debuffs.B.length, 1);
  assert.equal(session.debuffs.A.length, 0);
});
test('ダメージ＋self/opponent混在Effect：両方正しく付与され、命中判定は1回', () => {
  const { session, baseStats } = sessionWithFirstActor('A');
  const move = scratch({
    effects: [
      { target: 'self', category: 'attack', direction: 'up', size: 'small', remainingTurns: 2 },
      { target: 'opponent', category: 'defense', direction: 'down', size: 'small', remainingTurns: 2 },
    ],
  });
  let hitCalls = 0;
  const result = resolveAction({ session, baseStats, attackerSide: 'A', move, rng: { hitRng: () => { hitCalls++; return 0; }, damageRng: NO_VARIANCE, criticalRng: NO_CRIT } });
  assert.equal(hitCalls, 1);
  assert.equal(result.effectsApplied.length, 2);
  assert.equal(session.buffs.A.length, 1);
  assert.equal(session.debuffs.B.length, 1);
});
test('ダメージ技Miss時はEffectなし', () => {
  const { session, baseStats } = sessionWithFirstActor('A');
  const move = scratch({ effects: [{ target: 'self', category: 'attack', direction: 'up', size: 'small', remainingTurns: 2 }] });
  resolveRound(session, { A: move, B: scratch({ effects: [] }) }, { baseStats, rng: fixedRng({ hit: ALWAYS_MISS }) });
  assert.equal(session.buffs.A.length, 0);
});

// ---------- 47〜49：KO時はEffectなし（self/opponentどちらも） ----------
test('ダメージでKOした場合、self/opponentどちらのEffectも付与されない', () => {
  const { session, baseStats } = sessionWithFirstActor('A', { statsB: statsOf({ life: 1 }) });
  const move = scratch({
    effects: [
      { target: 'self', category: 'attack', direction: 'up', size: 'small', remainingTurns: 2 },
      { target: 'opponent', category: 'defense', direction: 'down', size: 'small', remainingTurns: 2 },
    ],
  });
  const result = resolveRound(session, { A: move, B: scratch() }, { baseStats, rng: fixedRng() });
  assert.equal(result.actions[0].ko, true);
  assert.deepEqual(result.actions[0].effectsApplied, []);
  assert.equal(session.buffs.A.length, 0);
  assert.equal(session.debuffs.B.length, 0);
});

// ---------- 50〜53：後攻行動とEffect即時反映 ----------
test('先攻power=0技の後も、後攻は通常通り行動する', () => {
  const { session, baseStats } = sessionWithFirstActor('A');
  const result = resolveRound(session, { A: roar(), B: scratch() }, { baseStats, rng: fixedRng() });
  assert.equal(result.actions.length, 2);
  assert.equal(result.actions[1].actor, 'B');
});
test('先攻デバフが同ラウンドの後攻攻撃ダメージへ即時反映される', () => {
  const { session, baseStats } = sessionWithFirstActor('A'); // A先攻・B後攻
  const move = scratch({ effects: [{ target: 'opponent', category: 'attack', direction: 'down', size: 'medium', remainingTurns: 2 }] }); // B のpower/wisdomを-20%
  const result = resolveRound(session, { A: move, B: scratch() }, { baseStats, rng: fixedRng() });
  const withDebuff = finalizeDamage(applyDamageVariance(calculateBaseDamage({ movePower: 70, attackStat: 240, defenseStat: 300 }), NO_VARIANCE), false);
  assert.equal(result.actions[1].damage, withDebuff, '後攻Bの攻撃力は既に-20%が反映されているはず');
});
test('先攻self攻撃バフが同ラウンドの後攻の被ダメージ計算（＝先攻の攻撃力として）へ即時反映される', () => {
  // 確認内容：先攻が自己バフを得た直後に、その値が使われるのは「次に先攻のpower/wisdomを参照する瞬間」。
  // 1ラウンド内では先攻は1回しか攻撃しないため、ここでは「2ラウンド目の先攻攻撃」に反映されることで即時性を確認する。
  const { session, baseStats } = sessionWithFirstActor('A');
  const selfBuffMove = scratch({ effects: [{ target: 'self', category: 'attack', direction: 'up', size: 'large', remainingTurns: 3 }] });
  resolveRound(session, { A: selfBuffMove, B: scratch({ effects: [] }) }, { baseStats, rng: fixedRng() });
  const result2 = resolveRound(session, { A: scratch(), B: scratch({ effects: [] }) }, { baseStats, rng: fixedRng() });
  const buffed = finalizeDamage(applyDamageVariance(calculateBaseDamage({ movePower: 70, attackStat: 390, defenseStat: 300 }), NO_VARIANCE), false); // 300*1.3=390
  assert.equal(result2.actions[0].damage, buffed);
});
test('先攻self防御バフが同ラウンドの後攻から受けるダメージへ即時反映される', () => {
  const { session, baseStats } = sessionWithFirstActor('A');
  const selfDefBuff = scratch({ effects: [{ target: 'self', category: 'defense', direction: 'up', size: 'large', remainingTurns: 2 }] });
  const result = resolveRound(session, { A: selfDefBuff, B: scratch() }, { baseStats, rng: fixedRng() });
  const buffedDefense = finalizeDamage(applyDamageVariance(calculateBaseDamage({ movePower: 70, attackStat: 300, defenseStat: 390 }), NO_VARIANCE), false); // Aのtoughness 300*1.3=390
  assert.equal(result.actions[1].damage, buffedDefense, '後攻Bのダメージ計算では、既に上昇したAのtoughnessが使われるはず');
});

// ---------- 54〜56：Effectターン処理（回帰） ----------
test('Effectターン：新規Effectは付与ラウンド終了時に減らず、既存の古いEffectは通常通り減る。通常終了後turn+1', () => {
  const { session, baseStats } = sessionWithFirstActor('A');
  applyEffectToSession(session, 'B', createEffect({ category: 'evasion', direction: 'down', size: 'small', remainingTurns: 1, appliedTurn: session.turn }));
  session.turn += 1; // 前ラウンドで付与された状態を作る
  const turnBefore = session.turn;
  const move = scratch({ effects: [{ target: 'self', category: 'attack', direction: 'up', size: 'small', remainingTurns: 2 }] });
  resolveRound(session, { A: move, B: scratch({ effects: [] }) }, { baseStats, rng: fixedRng() });
  assert.equal(session.buffs.A[0].remainingTurns, 2, '新規Effectは付与ラウンド終了時には減らない');
  assert.equal(session.debuffs.B.length, 0, '古いEffect(remainingTurns=1)はこのラウンド終了で解除される');
  assert.equal(session.turn, turnBefore + 1);
});

// ---------- 57〜60：Phase4の結果が変化していないこと（回帰） ----------
test('回帰：Phase4のダメージ／クリティカル／KO／追加Effectの結果は変化していない', () => {
  const { session, baseStats } = sessionWithFirstActor('A', { statsB: statsOf({ life: 1 }) });
  const move = scratch({ effects: [{ target: 'self', category: 'hit', direction: 'up', size: 'small', remainingTurns: 2 }] });
  const result = resolveRound(session, { A: move, B: scratch() }, { baseStats, rng: fixedRng({ critical: ALWAYS_CRIT }) });
  assert.equal(result.actions[0].critical, true);
  assert.equal(result.actions[0].ko, true);
  assert.equal(result.actions.length, 1);
  assert.deepEqual(result.actions[0].effectsApplied, [], 'KOなのでPhase4同様Effectは付与されない');
});

// ---------- 61〜65：既存関数の再利用（コード監査＋間接テスト） ----------
test('再利用：命中率はcalculateHitRate、ダメージ関数群・Effect関数群はengine.jsへ重複実装されていない', () => {
  // 直接の重複実装有無はコード監査で確認済み（import元がcombatMath.js/effects.jsのみで、
  // 独自の実効値計算・ダメージ計算・命中計算・重複解決ロジックをengine.js内に持っていない）。
  // ここでは間接的に、resolveActionの結果がPhase2/3の関数を直接呼んだ場合と完全一致することを確認する。
  const { session, baseStats } = sessionWithFirstActor('A');
  const result = resolveRound(session, { A: downerMist(), B: scratch({ effects: [] }) }, { baseStats, rng: fixedRng() });
  assert.equal(result.actions[0].hitRate, calculateHitRate({ moveAccuracy: 90, hit: 300, evasion: 300 }));
  assert.equal(result.actions[0].damage, finalizeDamage(applyDamageVariance(calculateBaseDamage({ movePower: 60, attackStat: 300, defenseStat: 300 }), NO_VARIANCE), false));
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
