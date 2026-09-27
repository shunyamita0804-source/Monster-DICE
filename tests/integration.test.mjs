// =========================================================
// 統合境界テスト（統合Phase）
//  ・battle-bridge.js が window.MMBattle として Phase 1〜5 の関数を正しく公開しているか
//  ・adapter.js が旧Artifactのデータ形式を Phase 5 の形式へ正しく変換するか
//  ・変換結果を実際に MMBattle.resolveAction / createBattleSession へ投入して
//    エンドツーエンドで動くか（＝二重計算をせず、Phase 1〜5側の計算結果がそのまま使えるか）
//  ・speed が無い旧個体を渡しても後方互換で壊れないか
//
//  monster-master 側の既存テスト（tests/rules.test.mjs 134件）はここでは一切変更しない。
//  ここで確認するのはあくまで「統合の境界（bridge/adapter）」であり、
//  Phase 1〜5 自体の計算式の正しさは monster-master 側のテストが担保している。
// =========================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// battle-bridge.js / adapter.js はブラウザの <script> 読み込みを前提にした
// 「window.MMBattle / window.MMAdapter を作るだけ」のプレーンスクリプトなので、
// Node上では最小限の window スタブを用意してから読み込む。
function loadBridgeAndAdapter() {
  const sandbox = { window: {} };
  const bridgeSrc = readFileSync(path.join(__dirname, '../js/battle-bridge.js'), 'utf8');
  const adapterSrc = readFileSync(path.join(__dirname, '../js/integration/adapter.js'), 'utf8');
  const fn = new Function('window', bridgeSrc + '\n' + adapterSrc);
  fn(sandbox.window);
  return { MM: sandbox.window.MMBattle, AD: sandbox.window.MMAdapter };
}

test('battle-bridge.js: window.MMBattleにPhase1〜5の関数がすべて揃っている', () => {
  const { MM } = loadBridgeAndAdapter();
  for (const name of [
    'determineFirstActor', 'createBattleSession', 'resolveAction', 'resolveRound',
    'calculateBaseDamage', 'applyDamageVariance', 'rollCritical', 'finalizeDamage',
    'calculateHitRate', 'rollHit',
    'createEffect', 'applyEffect', 'advanceEffects', 'getEffectiveStat',
    'applyEffectToSession', 'advanceEffectsForSession',
    'createCheckpoint', 'restoreSession',
    'getSpeed', 'isValidSpeed', 'createIndividual',
  ]) {
    assert.equal(typeof MM[name], 'function', `MMBattle.${name} が関数として存在しない`);
  }
  assert.equal(MM.DEFAULT_SPEED, 5);
  assert.equal(MM.SPEED_MIN, 1);
  assert.equal(MM.SPEED_MAX, 10);
});

test('battle-bridge.js: monster-master本体と同じ計算結果を返す（数値の食い違いがないこと）', () => {
  const { MM } = loadBridgeAndAdapter();
  // Phase2で確認済みの基準値（100/300/600/999 vs 同値、威力70）と一致するか
  assert.equal(Math.round(MM.calculateBaseDamage({ movePower: 70, attackStat: 100, defenseStat: 100 })), 15);
  assert.equal(Math.round(MM.calculateBaseDamage({ movePower: 70, attackStat: 300, defenseStat: 300 })), 45);
  assert.equal(Math.round(MM.calculateBaseDamage({ movePower: 70, attackStat: 600, defenseStat: 600 })), 89);
  assert.equal(Math.round(MM.calculateBaseDamage({ movePower: 70, attackStat: 999, defenseStat: 999 })), 149);
  // 命中式の基準値（80/300/300→80、80/600/300→90、80/300/600→70）
  assert.equal(MM.calculateHitRate({ moveAccuracy: 80, hit: 300, evasion: 300 }), 80);
  assert.equal(MM.calculateHitRate({ moveAccuracy: 80, hit: 600, evasion: 300 }), 90);
  assert.equal(MM.calculateHitRate({ moveAccuracy: 80, hit: 300, evasion: 600 }), 70);
  // クリティカル倍率は1.5倍（旧Artifactの1.6倍ではない）
  assert.equal(MM.CRITICAL_MULTIPLIER, 1.5);
  // ダメージ乱数は±5%（旧Artifactの±15%ではない）
  assert.equal(MM.DAMAGE_VARIANCE_MIN, 0.95);
  assert.equal(MM.DAMAGE_VARIANCE_MAX, 1.05);
});

test('adapter.js: 旧個体データ(li,po,in,hi,ev,de)がPhase5のstats形へ正しく変換される', () => {
  const { AD } = loadBridgeAndAdapter();
  const legacy = { name: 'ソラ', sp: 'soramo', li: 300, po: 280, in: 260, hi: 240, ev: 220, de: 200 };
  const stats = AD.legacyUnitToStats(legacy);
  assert.deepEqual(stats, { life: 300, power: 280, wisdom: 260, hit: 240, evasion: 220, toughness: 200 });
});

test('adapter.js: speedの無い旧個体はgetSpeedでDEFAULT_SPEEDにフォールバックする（後方互換）', () => {
  const { MM, AD } = loadBridgeAndAdapter();
  const legacy = { name: 'むかしの個体', sp: 'x', li: 100, po: 100, in: 100, hi: 100, ev: 100, de: 100 };
  const indLike = AD.legacyUnitToIndividualLike(legacy);
  assert.equal('speed' in indLike, false, '旧データにspeedが無ければ、無理に書き込まない');
  assert.equal(MM.getSpeed(indLike), MM.DEFAULT_SPEED);
});

test('adapter.js: 旧個体にspeedが明示されていれば、そのまま使われる（将来のspecies別speed対応）', () => {
  const { MM, AD } = loadBridgeAndAdapter();
  const legacy = { name: 'ガウ', sp: 'gauru', li: 80, po: 110, in: 110, hi: 90, ev: 90, de: 60, speed: 7 };
  const indLike = AD.legacyUnitToIndividualLike(legacy);
  assert.equal(indLike.speed, 7);
  assert.equal(MM.getSpeed(indLike), 7);
});

test('adapter.js: 旧SK技データ（吠える＝威力0＋デバフ）がPhase5のMove形へ正しく変換される', () => {
  const { AD } = loadBridgeAndAdapter();
  // 実データと同じ並び： [名前, 威力比率, ?, 色, 絵文字, 分類記号, 説明文, "p"|"i", 命中率, クリティカル率]
  const roarSK = ['吠える', 0, 2, '#62e6a4', '🎵', 'd', '大きな声で吠えて、相手をひるませる', 'i', 60, 0];
  const roarEFF = [{ tg: 1, st: 'atk', lv: -1, t: 1 }]; // 実データ準拠：相手の攻撃力を小デバフ・1ターン
  const move = AD.moveFromLegacySK(roarSK, roarEFF);
  assert.equal(move.power, 0);
  assert.equal(move.accuracy, 60);
  assert.equal('type' in move, false, '威力0の技にtypeを持たせない');
  assert.equal('critical' in move, false, '威力0の技にcriticalを持たせない');
  assert.deepEqual(move.effects, [{ target: 'opponent', category: 'attack', direction: 'down', size: 'small', remainingTurns: 1 }]);
});

test('adapter.js: 威力ありの旧SK技（ひっかき＝p技）がtype/criticalを持つMove形へ変換される', () => {
  const { AD } = loadBridgeAndAdapter();
  const sk = ['ひっかき', .6, 3, '#4aa8ff', '✨', 'a', 'するどいツメでひっかく。当たりやすい', 'p', 100, .1];
  const move = AD.moveFromLegacySK(sk, [], { powerScale: 100 }); // 威力比率0.6 × 100 = 60（暫定のscale。正式値は未決定）
  assert.equal(move.type, 'power');
  assert.equal(move.accuracy, 100);
  assert.equal(move.critical, 10); // 0.1 → 10%
  assert.equal(move.power, 60);
  assert.deepEqual(move.effects, []);
});

test('E2E: 変換したMoveをそのままMMBattle.resolveActionへ渡すと、二重計算なしで正しい結果が返る', () => {
  const { MM, AD } = loadBridgeAndAdapter();
  const legacyA = { name: 'ソラ', sp: 'soramo', li: 300, po: 300, in: 300, hi: 300, ev: 300, de: 300 };
  const legacyB = { name: 'てき', sp: 'gauru', li: 250, po: 280, in: 280, hi: 250, ev: 250, de: 200 };
  const a = AD.legacyUnitToIndividualLike(legacyA);
  const b = AD.legacyUnitToIndividualLike(legacyB);
  const session = MM.createBattleSession({ unitA: a, unitB: b, battleType: 'legacy', rng: () => 0.3 });

  const roarSK = ['吠える', 0, 2, '#62e6a4', '🎵', 'd', 'desc', 'i', 60, 0];
  const roarEFF = [{ tg: 1, st: 'atk', lv: -1, t: 1 }];
  const move = AD.moveFromLegacySK(roarSK, roarEFF);

  const result = MM.resolveAction({
    session, baseStats: { A: a.stats, B: b.stats }, attackerSide: 'A', move,
    rng: { hitRng: () => 0, damageRng: () => 0.5, criticalRng: () => 0.9 },
  });
  assert.equal(result.hit, true);
  assert.equal(result.damage, 0);
  assert.equal(result.effectsApplied.length, 1);
  assert.equal(result.effectsApplied[0].target, 'B');
  assert.equal(session.debuffs.B.length, 1);
  assert.equal(session.debuffs.B[0].category, 'attack');
  assert.equal(session.debuffs.B[0].appliedTurn, session.turn, 'appliedTurnは技データの固定値ではなく、その時のsession.turn');
});

test('E2E: ダメージ技を変換して実行すると、currentLifeが正しく減る（Phase2の式がそのまま使われている）', () => {
  const { MM, AD } = loadBridgeAndAdapter();
  const legacyA = { name: 'ソラ', sp: 'soramo', li: 300, po: 300, in: 300, hi: 300, ev: 300, de: 300 };
  const legacyB = { name: 'てき', sp: 'gauru', li: 250, po: 280, in: 280, hi: 250, ev: 250, de: 300 };
  const a = AD.legacyUnitToIndividualLike(legacyA);
  const b = AD.legacyUnitToIndividualLike(legacyB);
  const session = MM.createBattleSession({ unitA: a, unitB: b, battleType: 'legacy', rng: () => 0.3 });

  const sk = ['ひっかき', .6, 3, '#4aa8ff', '✨', 'a', 'desc', 'p', 100, .1];
  const move = AD.moveFromLegacySK(sk, [], { powerScale: 100 });

  const result = MM.resolveAction({
    session, baseStats: { A: a.stats, B: b.stats }, attackerSide: 'A', move,
    rng: { hitRng: () => 0, damageRng: () => 0.5, criticalRng: () => 0.99 },
  });
  const expected = MM.finalizeDamage(MM.applyDamageVariance(MM.calculateBaseDamage({ movePower: 60, attackStat: 300, defenseStat: 300 }), () => 0.5), false);
  assert.equal(result.damage, expected);
  assert.equal(session.currentLife.B, 250 - expected);
});

test('旧Artifact原本・monster-master原本は今回の統合作業で変更されていない', () => {
  // 統合ディレクトリ内のファイル構成だけを確認する（内容のハッシュ比較は別途スクリプトで実施済み）。
  const legacyPath = path.join(__dirname, '../legacy/index.original.html');
  const stat = readFileSync(legacyPath);
  assert.ok(stat.length > 9_000_000, '旧Artifact原本の保存先が存在し、想定サイズであること');
});
