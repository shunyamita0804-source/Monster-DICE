// =========================================================
// バフ・デバフ（PHASE 3）
//  ・Phase 1 の Battle Session が持つ buffs / debuffs の器に対して、
//    実際の付与・重複解決・ターン経過・実効能力値の計算を行う。
//  ・UP効果は buffs、DOWN効果は debuffs に保持する（呼び出し側の責務ではなく、
//    このファイルの接続関数が effect.direction を見て振り分ける）。
//  ・combatMath.js（Phase 2）は「実効能力値を受け取って計算するだけ」の数学層のまま維持し、
//    ここでは一切変更しない。正しい流れは：
//      基礎能力値 → (このファイルで実効能力値を計算) → combatMath.calculateBaseDamage など
//  ・実際の攻撃ターン進行・技ルーレット・固有スキル・record更新などへの接続はまだ行わない。
// =========================================================

// ---------- 効果の種類 ----------
// 表示文言（「攻撃力」「防御力」等）とは分離した内部カテゴリ名。
// 攻撃力＝power・wisdomの両方、防御力＝toughnessのみに作用する「バトル上の効果カテゴリ」であり、
// 恒久的な7番目・8番目の能力値ではない。
export const EFFECT_CATEGORIES = Object.freeze(['attack', 'defense', 'hit', 'evasion']);
export const EFFECT_DIRECTIONS = Object.freeze(['up', 'down']);
export const EFFECT_SIZES = Object.freeze(['small', 'medium', 'large']);

// 小=10%・中=20%・大=30%（数値は変更禁止）
export const EFFECT_SIZE_RATIO = Object.freeze({ small: 0.10, medium: 0.20, large: 0.30 });

// 効果カテゴリ → 実際に補正する能力値キー（life・speed は対象外）
const STAT_KEYS_BY_CATEGORY = Object.freeze({ attack: ['power', 'wisdom'], defense: ['toughness'], hit: ['hit'], evasion: ['evasion'] });
// 能力値キー → それを補正しうる効果カテゴリ（getEffectiveStat の入口で使う）
const CATEGORY_BY_STAT_KEY = Object.freeze({ power: 'attack', wisdom: 'attack', toughness: 'defense', hit: 'hit', evasion: 'evasion' });

const isPositiveFinite = (v) => Number.isFinite(v) && v > 0;
const isPositiveInt = (v) => Number.isInteger(v) && v >= 1;

/**
 * 効果（Effect）を1つ作る。表示用のテキスト・技ID・UI色などは持たせない（表示とロジックの分離）。
 * @param {object} opts
 * @param {'attack'|'defense'|'hit'|'evasion'} opts.category
 * @param {'up'|'down'} opts.direction
 * @param {'small'|'medium'|'large'} opts.size
 * @param {number} opts.remainingTurns - 残りターン（1以上の整数）
 * @param {number} opts.appliedTurn - 付与されたバトルターン（session.turn。1以上の整数）
 * @param {boolean} [opts.stackable=false] - 明示的に true の場合のみ同種効果と重複できる
 */
export function createEffect({ category, direction, size, remainingTurns, appliedTurn, stackable = false }) {
  if (!EFFECT_CATEGORIES.includes(category)) throw new Error(`効果カテゴリが不正です：${category}`);
  if (!EFFECT_DIRECTIONS.includes(direction)) throw new Error(`効果の方向が不正です：${direction}`);
  if (!EFFECT_SIZES.includes(size)) throw new Error(`効果の強度が不正です：${size}`);
  if (!isPositiveInt(remainingTurns)) throw new Error(`残りターンが不正です：${remainingTurns}`);
  if (!isPositiveInt(appliedTurn)) throw new Error(`付与ターンが不正です：${appliedTurn}`);
  if (typeof stackable !== 'boolean') throw new Error(`stackableはtrue/falseで指定してください：${stackable}`);
  return { category, direction, size, ratio: EFFECT_SIZE_RATIO[size], remainingTurns, appliedTurn, stackable };
}

/**
 * 1つの効果リスト（buffs か debuffs のどちらか片方。中身はすべて同じ direction）へ、
 * 新しい効果を重複ルールに従って追加する。リストは書き換えず、新しい配列を返す（純粋関数）。
 *
 * ルール：
 *  ・stackable な新効果は無条件に追加する（既存の同カテゴリ効果とは独立に共存する）。
 *  ・stackable でない新効果は、リスト内の「同カテゴリ・stackable=false」の効果とだけ競合する
 *    （stackable な既存効果とは競合しない＝別枠として扱う）。
 *    競合相手がいなければそのまま追加。いれば、
 *      新効果の方が強い（ratio大）→ 置き換える
 *      同じ強さ → 残りターンが長い方を残す
 *      新効果の方が弱い → 何もしない（既存を維持）
 */
export function applyEffect(effects, newEffect) {
  if (!Array.isArray(effects)) throw new Error('効果リストが不正です');
  if (newEffect.stackable) return [...effects, newEffect];

  const rivalIndex = effects.findIndex((e) => e.category === newEffect.category && !e.stackable);
  if (rivalIndex === -1) return [...effects, newEffect];

  const rival = effects[rivalIndex];
  const shouldReplace = newEffect.ratio > rival.ratio
    || (newEffect.ratio === rival.ratio && newEffect.remainingTurns > rival.remainingTurns);
  if (!shouldReplace) return effects;

  const next = [...effects];
  next[rivalIndex] = newEffect;
  return next;
}

/**
 * ラウンド終了処理：付与された「そのターン」に受けた効果は減らさず、
 * それより前から続く効果だけ残りターンを1減らす。0になった効果は取り除く。
 * リストは書き換えず、新しい配列を返す（純粋関数）。
 * @param {Array} effects
 * @param {number} currentTurn - 今終わろうとしているバトルターン（session.turn）
 */
export function advanceEffects(effects, currentTurn) {
  if (!Array.isArray(effects)) throw new Error('効果リストが不正です');
  if (!isPositiveInt(currentTurn)) throw new Error(`ターン数が不正です：${currentTurn}`);
  return effects
    .map((e) => (e.appliedTurn === currentTurn ? e : { ...e, remainingTurns: e.remainingTurns - 1 }))
    .filter((e) => e.remainingTurns > 0);
}

/**
 * 実効能力値を計算する（バトル開始時の基礎能力値を基準にした「合計補正」方式。連続乗算はしない）。
 * 実効値 = baseStat × (1 + Σ買buffsのratio − Σdebuffsのratio)
 * 999を超える実効値もそのまま返す（clampしない）。ただし最終値が1未満なら1にする。
 * @param {object} opts
 * @param {number} opts.baseStat - バトル開始時の基礎能力値（正の有限数）
 * @param {'power'|'wisdom'|'toughness'|'hit'|'evasion'} opts.statKey - life・speed は対象外
 * @param {Array} [opts.buffs] - UP効果のリスト（他カテゴリの効果が混ざっていてもよい。内部で絞り込む）
 * @param {Array} [opts.debuffs] - DOWN効果のリスト
 */
export function getEffectiveStat({ baseStat, statKey, buffs = [], debuffs = [] }) {
  if (!isPositiveFinite(baseStat)) throw new Error(`基礎能力値が不正です：${baseStat}`);
  const category = CATEGORY_BY_STAT_KEY[statKey];
  if (!category) throw new Error(`対象外の能力値です（life・speedは対象外）：${statKey}`);
  if (!Array.isArray(buffs) || !Array.isArray(debuffs)) throw new Error('バフ／デバフのリストが不正です');

  const buffTotal = buffs.filter((e) => e.category === category).reduce((sum, e) => sum + e.ratio, 0);
  const debuffTotal = debuffs.filter((e) => e.category === category).reduce((sum, e) => sum + e.ratio, 0);
  const raw = baseStat * (1 + buffTotal - debuffTotal);
  // 恒久能力値の丸め（js/systems/individual.js）に倣い四捨五入。上限クランプはしない、下限のみ1。
  return Math.max(1, Math.round(raw));
}

// ---------- Battle Session への接続 ----------
// session.js 自体は変更しない。ここから session.buffs / session.debuffs を読み書きするだけ。

/**
 * 効果を Battle Session の該当側へ付与する（direction に応じて buffs / debuffs へ振り分ける）。
 * session を直接書き換える（Phase 1 のテストが session.turn を直接書き換えているのと同じ流儀）。
 * @param {object} session - createBattleSession() が返したセッション
 * @param {'A'|'B'} side
 * @param {object} effect - createEffect() で作った効果
 */
export function applyEffectToSession(session, side, effect) {
  const bucket = effect.direction === 'up' ? session.buffs : session.debuffs;
  bucket[side] = applyEffect(bucket[side], effect);
  return session;
}

/**
 * ラウンド終了処理を Battle Session の該当側（buffs・debuffs 両方）へ適用する。
 * @param {object} session
 * @param {'A'|'B'} side
 */
export function advanceEffectsForSession(session, side) {
  session.buffs[side] = advanceEffects(session.buffs[side], session.turn);
  session.debuffs[side] = advanceEffects(session.debuffs[side], session.turn);
  return session;
}

/** Battle Session 上のある個体・ある能力値の実効値を取得する。baseStats は個体の恒久能力値オブジェクト。 */
export function getEffectiveStatFromSession(session, side, statKey, baseStats) {
  return getEffectiveStat({ baseStat: baseStats[statKey], statKey, buffs: session.buffs[side], debuffs: session.debuffs[side] });
}
