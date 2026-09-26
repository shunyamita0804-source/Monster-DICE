// =========================================================
// バトル計算コア（PHASE 2）
//  ・ダメージ・命中率・クリティカルの「純粋な計算式」だけを持つ。
//    実際のバトル進行（技ルーレット・アニメーション・記録更新など）へはまだ接続しない。
//  ・乱数は Phase 1 の firstActor.js と同じ考え方で、すべて外部から注入する
//    （rng() は [0, 1) を返す関数。省略時は Math.random）。
//  ・能力値の上限は 999 だが、将来のバフで実効値が 999 を超える場合があるため、
//    ここでは能力値の上限クランプを一切行わない（0以下・NaN・Infinity のみ不正として弾く）。
//  ・不正な入力（負数・NaN・Infinity・0以下の能力値・範囲外の確率値など）は、
//    js/systems/individual.js や js/systems/battle/checkpoint.js と同じ方針で例外を投げる。
//    無効な値を黙って正規化すると、999超えを許容する今回の要件と相性が悪く、
//    呼び出し側のバグに気づけなくなるため。
// =========================================================

const isPositiveFinite = (v) => Number.isFinite(v) && v > 0;
const isPercent = (v) => Number.isFinite(v) && v >= 0 && v <= 100;

// ---------- ダメージ ----------
export const CRITICAL_MULTIPLIER = 1.5;
export const DAMAGE_VARIANCE_MIN = 0.95; // -5%
export const DAMAGE_VARIANCE_MAX = 1.05; // +5%

/**
 * 基礎ダメージ（乱数・クリティカル適用前、丸めなし）。
 * 基礎ダメージ = 技威力 × (攻撃能力 ÷ 470) × [2 × 攻撃能力 ÷ (攻撃能力 + 丈夫さ)]
 * ちから技なら attackStat = power、かしこさ技なら attackStat = wisdom。defenseStat は常に toughness。
 * 能力値は999を超えて渡されても構わない（上限クランプはしない）。0以下・NaN・Infinity は例外。
 */
export function calculateBaseDamage({ movePower, attackStat, defenseStat }) {
  if (!isPositiveFinite(movePower)) throw new Error(`技威力が不正です：${movePower}`);
  if (!isPositiveFinite(attackStat)) throw new Error(`攻撃能力が不正です：${attackStat}`);
  if (!isPositiveFinite(defenseStat)) throw new Error(`丈夫さが不正です：${defenseStat}`);
  return movePower * (attackStat / 470) * ((2 * attackStat) / (attackStat + defenseStat));
}

/**
 * ダメージ乱数（95%〜105%）を適用する。丸めはしない。
 * @param {number} baseDamage - calculateBaseDamage() の結果
 * @param {() => number} rng - [0, 1) を返す乱数源。省略時は Math.random。
 */
export function applyDamageVariance(baseDamage, rng = Math.random) {
  if (!Number.isFinite(baseDamage) || baseDamage < 0) throw new Error(`基礎ダメージが不正です：${baseDamage}`);
  const r = rng();
  if (!(r >= 0 && r < 1)) throw new Error(`乱数は[0, 1)の範囲である必要があります：${r}`);
  const multiplier = DAMAGE_VARIANCE_MIN + r * (DAMAGE_VARIANCE_MAX - DAMAGE_VARIANCE_MIN);
  return baseDamage * multiplier;
}

/**
 * クリティカル発生判定。
 * @param {number} criticalRate - 技のクリティカル率（%、0〜100）。例：5 なら5%。
 * @param {() => number} rng - [0, 1) を返す乱数源。省略時は Math.random。
 */
export function rollCritical(criticalRate, rng = Math.random) {
  if (!isPercent(criticalRate)) throw new Error(`クリティカル率が不正です：${criticalRate}`);
  return rng() < criticalRate / 100;
}

/**
 * ダメージの最終処理：クリティカル倍率 → 四捨五入 → 最低1ダメージ保証。
 * 正式な処理順（基礎ダメージ→乱数→クリティカル→整数化→最低1保証）の後半3ステップをまとめたもの。
 * 整数化は既存コード（js/systems/individual.js の能力値丸め）に倣い Math.round を使用する。
 */
export function finalizeDamage(damage, isCritical) {
  if (!Number.isFinite(damage) || damage < 0) throw new Error(`ダメージが不正です：${damage}`);
  const withCritical = isCritical ? damage * CRITICAL_MULTIPLIER : damage;
  return Math.max(1, Math.round(withCritical));
}

// ---------- 命中・回避 ----------
export const HIT_RATE_MIN = 5;
export const HIT_RATE_MAX = 95;

/**
 * 実命中率（%）を計算する。
 * 実命中率 = 技固有命中率 + 30 × (命中 − 回避) ÷ (命中 + 回避)
 * 最終的に 5%〜95% へ丸め込む（clamp）。攻撃側は hit、防御側は evasion を使う。
 * 能力値の上限クランプはしない（0以下・NaN・Infinity のみ不正として弾く）。
 */
export function calculateHitRate({ moveAccuracy, hit, evasion }) {
  if (!isPercent(moveAccuracy)) throw new Error(`技固有命中率が不正です：${moveAccuracy}`);
  if (!isPositiveFinite(hit)) throw new Error(`命中が不正です：${hit}`);
  if (!isPositiveFinite(evasion)) throw new Error(`回避が不正です：${evasion}`);
  const raw = moveAccuracy + (30 * (hit - evasion)) / (hit + evasion);
  return Math.min(HIT_RATE_MAX, Math.max(HIT_RATE_MIN, raw));
}

/**
 * 命中判定。
 * @param {number} hitRate - calculateHitRate() の結果（%、5〜95）
 * @param {() => number} rng - [0, 1) を返す乱数源。省略時は Math.random。
 * @returns {boolean} true なら命中、false なら外れ（Miss）
 */
export function rollHit(hitRate, rng = Math.random) {
  if (!isPercent(hitRate)) throw new Error(`命中率が不正です：${hitRate}`);
  return rng() < hitRate / 100;
}
