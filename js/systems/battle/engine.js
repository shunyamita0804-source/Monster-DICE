// =========================================================
// 1ラウンドのバトル進行処理（PHASE 4）
//  ・「先攻の1行動 → (生存なら)後攻の1行動 → (両者生存なら)ラウンド終了処理」までをまとめる。
//  ・ダメージ・命中・クリティカルの計算式は js/systems/battle/combatMath.js を、
//    実効能力値・バフデバフ処理は js/systems/battle/effects.js をそのまま呼び出す。
//    ここに計算式を重複実装しない。
//  ・技ルーレットは実装しない。このラウンドで使う技（Move）は呼び出し側が渡す。
//  ・非攻撃技（ダメージを与えずバフ／デバフだけの技）は今回対象外。power > 0 の攻撃技のみ扱う。
// =========================================================
import {
  calculateBaseDamage, applyDamageVariance, rollCritical, finalizeDamage,
  calculateHitRate, rollHit,
} from './combatMath.js';
import { getEffectiveStat, createEffect, applyEffectToSession, advanceEffectsForSession } from './effects.js';

const isPercent = (v) => Number.isFinite(v) && v >= 0 && v <= 100;
const otherSide = (side) => (side === 'A' ? 'B' : 'A');

/**
 * 技（Move）の最低限の形を検証する。moves.json 等の正式マスターデータはまだ無いため、都度検証する。
 * power >= 0 を正式に許可する（PHASE 5）。
 *   power > 0  … ダメージあり。type（power/wisdom）・critical が必須（PHASE 4と同じ）。
 *   power === 0 … ダメージなし。type・critical は不要。ただし何も起こらない技を防ぐため effects が最低1つ必要。
 */
function validateMove(move) {
  if (!move || typeof move.id !== 'string' || !move.id.trim()) throw new Error(`技IDが不正です：${move?.id}`);
  if (!(Number.isFinite(move.power) && move.power >= 0)) throw new Error(`技威力が不正です：${move.power}`);
  if (!isPercent(move.accuracy)) throw new Error(`技命中率が不正です：${move.accuracy}`);
  if (!Array.isArray(move.effects)) throw new Error('技の追加効果（effects）は配列で指定してください');

  if (move.power > 0) {
    if (move.type !== 'power' && move.type !== 'wisdom') throw new Error(`技の分類が不正です（power/wisdomのみ）：${move.type}`);
    if (!isPercent(move.critical)) throw new Error(`技クリティカル率が不正です：${move.critical}`);
  } else if (move.effects.length === 0) {
    // 威力0かつ追加効果なしは「何も起こらない技」になるため不正とする
    throw new Error('威力0の技には少なくとも1つの追加効果が必要です');
  }

  move.effects.forEach(validateEffectTemplate);
}

/**
 * 技が持つ追加効果の「テンプレート」を検証する。
 * appliedTurn はここでは持たせない（付与時の session.turn を使うため）。
 * category/direction/size/remainingTurns/stackable の妥当性は、
 * Phase 3 の createEffect() の検証をそのまま再利用する（ダミーの appliedTurn を1つ与えて検証するだけで、
 * 実際に付与するわけではない）。
 */
function validateEffectTemplate(tpl) {
  if (tpl.target !== 'self' && tpl.target !== 'opponent') throw new Error(`追加効果の対象が不正です（self/opponentのみ）：${tpl?.target}`);
  createEffect({ category: tpl.category, direction: tpl.direction, size: tpl.size, remainingTurns: tpl.remainingTurns, appliedTurn: 1, stackable: tpl.stackable ?? false });
}

/** 攻撃側・防御側それぞれの実効能力値をまとめて取得する（Phase 3 の getEffectiveStat をそのまま利用） */
function effective(session, side, statKey, baseStats) {
  return getEffectiveStat({ baseStat: baseStats[side][statKey], statKey, buffs: session.buffs[side], debuffs: session.debuffs[side] });
}

/**
 * 1回の攻撃行動を処理する（正式処理順どおり）。session（currentLife/hitCount/totalDamage/buffs/debuffs）を更新する。
 * @returns 行動結果：{actor, target, moveId, hit, critical, hitRate, damage, targetLifeBefore, targetLifeAfter, ko, effectsApplied}
 */
export function resolveAction({ session, baseStats, attackerSide, move, rng }) {
  const defenderSide = otherSide(attackerSide);

  // 2〜5：命中判定
  const attackerHit = effective(session, attackerSide, 'hit', baseStats);
  const defenderEvasion = effective(session, defenderSide, 'evasion', baseStats);
  const hitRate = calculateHitRate({ moveAccuracy: move.accuracy, hit: attackerHit, evasion: defenderEvasion });
  const isHit = rollHit(hitRate, rng.hitRng);
  const targetLifeBefore = session.currentLife[defenderSide];

  if (!isHit) {
    // 6：Missならダメージ0・追加効果なし・hitCount/totalDamage加算なしで行動終了
    return {
      actor: attackerSide, target: defenderSide, moveId: move.id,
      hit: false, critical: false, hitRate, damage: 0,
      targetLifeBefore, targetLifeAfter: targetLifeBefore, ko: false, effectsApplied: [],
    };
  }

  // 命中：ダメージ計算は power > 0 の技だけ行う。power === 0 の技では
  // calculateBaseDamage/applyDamageVariance/rollCritical/finalizeDamage を一切呼ばず、
  // damageRng・criticalRng も消費しない（damage=0, critical=false, currentLife不変, KOしない）。
  let damage = 0;
  let isCritical = false;
  let targetLifeAfter = targetLifeBefore;
  if (move.power > 0) {
    // 7〜14：ダメージ計算（攻撃能力は技の type で power/wisdom を選ぶ。防御は常に toughness）
    const attackStat = effective(session, attackerSide, move.type, baseStats);
    const defenseStat = effective(session, defenderSide, 'toughness', baseStats);
    const base = calculateBaseDamage({ movePower: move.power, attackStat, defenseStat });
    const withVariance = applyDamageVariance(base, rng.damageRng);
    isCritical = rollCritical(move.critical, rng.criticalRng);
    damage = finalizeDamage(withVariance, isCritical);

    // 15〜16：currentLife更新（最低0）
    targetLifeAfter = Math.max(0, targetLifeBefore - damage);
    session.currentLife[defenderSide] = targetLifeAfter;
  }
  const actualDamage = targetLifeBefore - targetLifeAfter; // power===0なら常に0。オーバーキル分もtotalDamageに含めない

  // 17〜18：命中した技につき記録更新（ダメージの有無によらず、命中1回につき+1）
  session.hitCount[attackerSide] += 1;
  session.totalDamage[attackerSide] += actualDamage;

  // 19：KO判定（power===0の技は仕様上KOしない）
  const ko = move.power > 0 && targetLifeAfter <= 0;

  // 20：相手が生存している場合のみ追加効果を付与（Miss・KOのいずれでも付与しない）
  const effectsApplied = [];
  if (!ko) {
    for (const tpl of move.effects) {
      const targetSide = tpl.target === 'self' ? attackerSide : defenderSide;
      const effect = createEffect({
        category: tpl.category, direction: tpl.direction, size: tpl.size,
        remainingTurns: tpl.remainingTurns, appliedTurn: session.turn, stackable: tpl.stackable ?? false,
      });
      applyEffectToSession(session, targetSide, effect);
      effectsApplied.push({ target: targetSide, effect });
    }
  }

  return { actor: attackerSide, target: defenderSide, moveId: move.id, hit: true, critical: isCritical, hitRate, damage, targetLifeBefore, targetLifeAfter, ko, effectsApplied };
}

/**
 * 1ラウンド（先攻の行動→(生存なら)後攻の行動→(両者生存なら)ラウンド終了処理）を処理する。
 * session（Battle Session）を直接更新する。firstActor・participants の恒久スナップショットは変更しない。
 *
 * @param {object} session - createBattleSession() が返したセッション
 * @param {object} moves - { A: Move, B: Move }。このラウンドで使う技（ルーレットの結果は呼び出し側の責務）
 * @param {object} opts
 * @param {object} opts.baseStats - { A: individualA.stats, B: individualB.stats }（恒久の6能力）
 * @param {object} [opts.rng] - { hitRng, damageRng, criticalRng }。省略時はそれぞれ Math.random
 * @returns ラウンド結果：{turn, firstActor, actions, ko, winner}
 */
export function resolveRound(session, moves, { baseStats, rng = {} }) {
  validateMove(moves.A);
  validateMove(moves.B);
  const rngs = { hitRng: rng.hitRng ?? Math.random, damageRng: rng.damageRng ?? Math.random, criticalRng: rng.criticalRng ?? Math.random };

  const roundTurn = session.turn; // 結果に載せるラウンド番号（このラウンド開始時点の値。KO時も加算しないので一致し続ける）
  const first = session.firstActor;
  const second = otherSide(first);

  const actions = [];
  const firstResult = resolveAction({ session, baseStats, attackerSide: first, move: moves[first], rng: rngs });
  actions.push(firstResult);
  if (firstResult.ko) {
    // KO時：ラウンド終了処理（Effect減算・turn加算）は行わない。後攻は行動しない。
    return { turn: roundTurn, firstActor: session.firstActor, actions, ko: true, winner: first };
  }

  const secondResult = resolveAction({ session, baseStats, attackerSide: second, move: moves[second], rng: rngs });
  actions.push(secondResult);
  if (secondResult.ko) {
    return { turn: roundTurn, firstActor: session.firstActor, actions, ko: true, winner: second };
  }

  // 両者生存：ラウンド終了処理（A→Bの順でadvance、その後 turn+1）
  advanceEffectsForSession(session, 'A');
  advanceEffectsForSession(session, 'B');
  session.turn += 1;

  return { turn: roundTurn, firstActor: session.firstActor, actions, ko: false, winner: null };
}
