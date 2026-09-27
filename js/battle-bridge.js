// =========================================================
// Battle Bridge（統合Phase）
//  Phase 1〜5（js/systems/battle/*.js, js/systems/individual.js）を、
//  計算式・検証ロジックを一切書き換えずにそのまま連結したものです。
//  各ファイルは元のモジュール境界を保つため、個別のIIFEスコープに包んであります
//  （ファイルごとに同名の非公開ヘルパー関数がある場合の衝突を避けるためで、
//  公開されている関数・定数の中身は monster-master 側と完全に同一です）。
//
//  旧ゲーム本体（index.html内の巨大な単一スクリプト）より必ず「前」に
//  通常の <script src="..."> として読み込んでください。window.MMBattle 経由で
//  関数群を公開するだけで、旧ゲームのコードには一切手を加えません。
// =========================================================
(function () {
'use strict';
const __MM_TMP__ = {};

// ---- from systems/individual.js ----
(function () {

// 個体（育成中・牧場・図鑑の保存用ですべて共通の形）
const PARAM_KEYS = Object.freeze(['life', 'power', 'wisdom', 'hit', 'evasion', 'toughness']);

// 素早さ：通常6能力とは別枠（六角形の能力分析図には含めない）。1〜10、10が最速・1が最遅。
// バトル開始時の先攻判定にのみ使う（js/systems/battle/）。ダメージ・命中・回避などには影響しない。
const SPEED_MIN = 1;
const SPEED_MAX = 10;
// 種族ごとの正式値（例：ソラモ5・ガウル7・ノビトン2）を持つマスターデータはまだ存在しないため、
// それが用意されるまでの暫定デフォルト。1〜10の中央付近（5）とし、同じデフォルト同士が対戦する
// ケースでも先攻判定が偏らないようにした。確定済み3体の平均（5,7,2→約4.7）にも近い。
const DEFAULT_SPEED = 5;
const isValidSpeed = (v) => Number.isInteger(v) && v >= SPEED_MIN && v <= SPEED_MAX;

/** 個体の素早さを読む。古いデータ等で speed フィールドが無い／不正な場合は DEFAULT_SPEED を返す（後方互換） */
function getSpeed(individual) {
  return isValidSpeed(individual?.speed) ? individual.speed : DEFAULT_SPEED;
}

function newUid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `ind-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function createIndividual(config, {
  speciesId, variantId = null, nickname, stats, speed = DEFAULT_SPEED, learnedMoves = [], equippedMoves = [], origin, parents = null,
}) {
  const r = config.rules;
  if (!speciesId) throw new Error('種族がありません');
  if (!nickname || !nickname.trim()) throw new Error('個体名がありません');
  if (!isValidSpeed(speed)) throw new Error(`素早さは${SPEED_MIN}〜${SPEED_MAX}の整数で指定してください`);
  if (learnedMoves.length > r.maxLearnedMoves) throw new Error(`技は最大${r.maxLearnedMoves}個までです`);
  if (equippedMoves.length > r.maxEquippedMoves) throw new Error(`セットできる技は最大${r.maxEquippedMoves}個までです`);
  if (!equippedMoves.every((m) => learnedMoves.includes(m))) throw new Error('習得していない技はセットできません');
  const s = {};
  for (const k of PARAM_KEYS) s[k] = Math.max(0, Math.round(stats?.[k] ?? 0));
  return {
    uid: newUid(),
    speciesId,
    variantId,
    nickname: nickname.trim(),
    stats: s,
    speed,                                 // 1〜10（10が最速）。通常6能力とは別枠
    learnedMoves: [...learnedMoves],
    equippedMoves: [...equippedMoves],     // 並び順 = ルーレットの順
    rank: null,
    officialRecord: { win: 0, lose: 0 },
    arenaRecord: { win: 0, lose: 0, titles: 0 },
    raising: { weeks: 0 },                 // 育成進行情報（PHASE 2 で拡張）
    origin,                                // 'market' | 'fusion' | 'restoration'
    parents,                               // 合体時：{ base: {...}, partner: {...} }
    createdAt: new Date().toISOString(),
  };
}

__MM_TMP__.getSpeed = getSpeed;
__MM_TMP__.newUid = newUid;
__MM_TMP__.createIndividual = createIndividual;
__MM_TMP__.PARAM_KEYS = PARAM_KEYS;
__MM_TMP__.SPEED_MIN = SPEED_MIN;
__MM_TMP__.SPEED_MAX = SPEED_MAX;
__MM_TMP__.DEFAULT_SPEED = DEFAULT_SPEED;
__MM_TMP__.isValidSpeed = isValidSpeed;
})();

// ---- from systems/battle/firstActor.js ----
(function () {

// =========================================================
// バトル開始時の先攻判定（1回だけ）
//  ・素早さの差（0〜9）から「速い側が先攻する確率」を引く
//  ・乱数は外から注入する（rng() は [0, 1) を返す関数。既定は Math.random）
//  ・毎ターンの再判定はしない。呼び出し側が結果を保存し、以後は固定して使うこと。
// =========================================================

// 差ごとの「速い側が先攻する確率」。仕様どおりの表（差0〜9）。
const FIRST_ACTOR_PROBABILITY_BY_DIFF = Object.freeze([
  0.50, // 差0
  0.60, // 差1
  0.70, // 差2
  0.75, // 差3
  0.80, // 差4
  0.85, // 差5
  0.88, // 差6
  0.90, // 差7
  0.92, // 差8
  0.95, // 差9（素早さは1〜10なので、差の最大は9）
]);

/**
 * 素早さから先攻側を決める。
 * @param {number} speedA - 側Aの素早さ（1〜10）
 * @param {number} speedB - 側Bの素早さ（1〜10）
 * @param {() => number} rng - [0, 1) を返す乱数源。省略時は Math.random。
 * @returns {'A' | 'B'} 先攻する側
 */
function determineFirstActor(speedA, speedB, rng = Math.random) {
  const diff = Math.abs(speedA - speedB);
  const index = Math.min(diff, FIRST_ACTOR_PROBABILITY_BY_DIFF.length - 1);
  const probFasterFirst = FIRST_ACTOR_PROBABILITY_BY_DIFF[index];

  if (speedA === speedB) {
    // 差0＝50/50。どちらを「速い側」と呼んでも確率は対称なので、Aを基準に判定する。
    return rng() < probFasterFirst ? 'A' : 'B';
  }
  const faster = speedA > speedB ? 'A' : 'B';
  const slower = faster === 'A' ? 'B' : 'A';
  return rng() < probFasterFirst ? faster : slower;
}

__MM_TMP__.determineFirstActor = determineFirstActor;
})();

// ---- from systems/battle/combatMath.js ----
(function () {

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
const CRITICAL_MULTIPLIER = 1.5;
const DAMAGE_VARIANCE_MIN = 0.95; // -5%
const DAMAGE_VARIANCE_MAX = 1.05; // +5%

/**
 * 基礎ダメージ（乱数・クリティカル適用前、丸めなし）。
 * 基礎ダメージ = 技威力 × (攻撃能力 ÷ 470) × [2 × 攻撃能力 ÷ (攻撃能力 + 丈夫さ)]
 * ちから技なら attackStat = power、かしこさ技なら attackStat = wisdom。defenseStat は常に toughness。
 * 能力値は999を超えて渡されても構わない（上限クランプはしない）。0以下・NaN・Infinity は例外。
 */
function calculateBaseDamage({ movePower, attackStat, defenseStat }) {
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
function applyDamageVariance(baseDamage, rng = Math.random) {
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
function rollCritical(criticalRate, rng = Math.random) {
  if (!isPercent(criticalRate)) throw new Error(`クリティカル率が不正です：${criticalRate}`);
  return rng() < criticalRate / 100;
}

/**
 * ダメージの最終処理：クリティカル倍率 → 四捨五入 → 最低1ダメージ保証。
 * 正式な処理順（基礎ダメージ→乱数→クリティカル→整数化→最低1保証）の後半3ステップをまとめたもの。
 * 整数化は既存コード（js/systems/individual.js の能力値丸め）に倣い Math.round を使用する。
 */
function finalizeDamage(damage, isCritical) {
  if (!Number.isFinite(damage) || damage < 0) throw new Error(`ダメージが不正です：${damage}`);
  const withCritical = isCritical ? damage * CRITICAL_MULTIPLIER : damage;
  return Math.max(1, Math.round(withCritical));
}

// ---------- 命中・回避 ----------
const HIT_RATE_MIN = 5;
const HIT_RATE_MAX = 95;

/**
 * 実命中率（%）を計算する。
 * 実命中率 = 技固有命中率 + 30 × (命中 − 回避) ÷ (命中 + 回避)
 * 最終的に 5%〜95% へ丸め込む（clamp）。攻撃側は hit、防御側は evasion を使う。
 * 能力値の上限クランプはしない（0以下・NaN・Infinity のみ不正として弾く）。
 */
function calculateHitRate({ moveAccuracy, hit, evasion }) {
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
function rollHit(hitRate, rng = Math.random) {
  if (!isPercent(hitRate)) throw new Error(`命中率が不正です：${hitRate}`);
  return rng() < hitRate / 100;
}

__MM_TMP__.calculateBaseDamage = calculateBaseDamage;
__MM_TMP__.applyDamageVariance = applyDamageVariance;
__MM_TMP__.rollCritical = rollCritical;
__MM_TMP__.finalizeDamage = finalizeDamage;
__MM_TMP__.calculateHitRate = calculateHitRate;
__MM_TMP__.rollHit = rollHit;
__MM_TMP__.CRITICAL_MULTIPLIER = CRITICAL_MULTIPLIER;
__MM_TMP__.DAMAGE_VARIANCE_MIN = DAMAGE_VARIANCE_MIN;
__MM_TMP__.DAMAGE_VARIANCE_MAX = DAMAGE_VARIANCE_MAX;
__MM_TMP__.HIT_RATE_MIN = HIT_RATE_MIN;
__MM_TMP__.HIT_RATE_MAX = HIT_RATE_MAX;
})();

// ---- from systems/battle/effects.js ----
(function () {

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
const EFFECT_CATEGORIES = Object.freeze(['attack', 'defense', 'hit', 'evasion']);
const EFFECT_DIRECTIONS = Object.freeze(['up', 'down']);
const EFFECT_SIZES = Object.freeze(['small', 'medium', 'large']);

// 小=10%・中=20%・大=30%（数値は変更禁止）
const EFFECT_SIZE_RATIO = Object.freeze({ small: 0.10, medium: 0.20, large: 0.30 });

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
function createEffect({ category, direction, size, remainingTurns, appliedTurn, stackable = false }) {
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
function applyEffect(effects, newEffect) {
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
function advanceEffects(effects, currentTurn) {
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
function getEffectiveStat({ baseStat, statKey, buffs = [], debuffs = [] }) {
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
function applyEffectToSession(session, side, effect) {
  const bucket = effect.direction === 'up' ? session.buffs : session.debuffs;
  bucket[side] = applyEffect(bucket[side], effect);
  return session;
}

/**
 * ラウンド終了処理を Battle Session の該当側（buffs・debuffs 両方）へ適用する。
 * @param {object} session
 * @param {'A'|'B'} side
 */
function advanceEffectsForSession(session, side) {
  session.buffs[side] = advanceEffects(session.buffs[side], session.turn);
  session.debuffs[side] = advanceEffects(session.debuffs[side], session.turn);
  return session;
}

/** Battle Session 上のある個体・ある能力値の実効値を取得する。baseStats は個体の恒久能力値オブジェクト。 */
function getEffectiveStatFromSession(session, side, statKey, baseStats) {
  return getEffectiveStat({ baseStat: baseStats[statKey], statKey, buffs: session.buffs[side], debuffs: session.debuffs[side] });
}

__MM_TMP__.createEffect = createEffect;
__MM_TMP__.applyEffect = applyEffect;
__MM_TMP__.advanceEffects = advanceEffects;
__MM_TMP__.getEffectiveStat = getEffectiveStat;
__MM_TMP__.applyEffectToSession = applyEffectToSession;
__MM_TMP__.advanceEffectsForSession = advanceEffectsForSession;
__MM_TMP__.getEffectiveStatFromSession = getEffectiveStatFromSession;
__MM_TMP__.EFFECT_CATEGORIES = EFFECT_CATEGORIES;
__MM_TMP__.EFFECT_DIRECTIONS = EFFECT_DIRECTIONS;
__MM_TMP__.EFFECT_SIZES = EFFECT_SIZES;
__MM_TMP__.EFFECT_SIZE_RATIO = EFFECT_SIZE_RATIO;
})();

// ---- from systems/battle/session.js ----
(function () {
const getSpeed = __MM_TMP__.getSpeed;
const determineFirstActor = __MM_TMP__.determineFirstActor;
// =========================================================
// バトルセッション（PHASE 1：土台のみ）
//  ・恒久的な個体データ（js/systems/individual.js）とは分離する。
//    ここに保持するのは「参加個体を特定するための最小限のスナップショット」と、
//    バトル中だけ生きる値（現在ライフ・バフ／デバフの器・命中成功回数・累計与ダメージ・ターン）。
//  ・実際のダメージ計算・命中判定・バフ効果の適用・ルーレット・30ターン勝敗判定は、
//    このPHASEではまだ実装しない。ここでは「安全に持ち運べる箱」を用意するだけ。
//  ・先攻／後攻はバトル開始時に1回だけ決め、以後は battle session に固定値として持つ。
//    以後のターン処理（未実装）は、この firstActor を書き換えてはならない。
// =========================================================


function newBattleId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `battle-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** individual から、バトルセッションに持たせる最小限の参加者スナップショットを作る（個体データ本体は複製しない） */
function snapshotParticipant(individual) {
  return {
    uid: individual.uid,
    speciesId: individual.speciesId,
    variantId: individual.variantId,
    nickname: individual.nickname,
    speed: getSpeed(individual),
    maxLife: individual.stats.life,
  };
}

/**
 * バトルセッションを作る。先攻判定はここで1回だけ行う。
 * @param {object} opts
 * @param {object} opts.unitA - 参加個体A（js/systems/individual.js の個体データ）
 * @param {object} opts.unitB - 参加個体B
 * @param {string} opts.battleType - バトル種別を識別する文字列（例：'official' | 'arena'。
 *   正式な種別一覧はまだ確定していないため、ここでは検証せずそのまま保持する）
 * @param {() => number} [opts.rng] - 先攻判定用の乱数源（省略時は Math.random）
 */
function createBattleSession({ unitA, unitB, battleType, rng = Math.random }) {
  const a = snapshotParticipant(unitA);
  const b = snapshotParticipant(unitB);
  const firstActor = determineFirstActor(a.speed, b.speed, rng);

  return {
    battleId: newBattleId(),
    battleType,                     // 識別用の文字列のみ。判定・分岐はまだ実装しない
    createdAt: new Date().toISOString(),

    participants: { A: a, B: b },   // 個体データの複製ではなく、参加者を特定するための最小限の情報

    firstActor,                     // 'A' | 'B'。バトル開始時に1回だけ決定し、以後は不変
    turn: 1,                        // 1ターン＝先攻の行動→後攻の行動。実際の行動処理は未実装

    currentLife: { A: a.maxLife, B: b.maxLife },
    hitCount: { A: 0, B: 0 },       // 技を命中させた回数（将来の30ターン勝敗判定に使用）
    totalDamage: { A: 0, B: 0 },    // 累計与ダメージ（将来の30ターン勝敗判定に使用）

    // バフ／デバフの器のみ。実際の効果適用（能力値の増減）はまだ実装しない。
    // 将来ここに積む要素の想定形：{ target:'A'|'B', stat:'attack'|'defense'|'hit'|'evasion', size:'small'|'medium'|'large', turnsLeft:number, stackable:boolean }
    buffs: { A: [], B: [] },
    debuffs: { A: [], B: [] },
  };
}

__MM_TMP__.newBattleId = newBattleId;
__MM_TMP__.createBattleSession = createBattleSession;
})();

// ---- from systems/battle/checkpoint.js ----
(function () {

// =========================================================
// Battle Checkpoint（PHASE 1：土台のみ）
//  ・「バトル途中でゲームを終了しても再開できる」ための保存単位。
//  ・保存するのはターン開始時点のスナップショットのみ。アニメーション途中・判定途中など
//    中途半端な状態は対象にしない（そのような状態を作る処理自体、このPHASEにはまだ無い）。
//  ・js/core/save.js のセーブレコード（{ format, version, data }）と同じ考え方で
//    { format, version, session } の形にラップする。将来 save.js から呼び出す際に
//    馴染む形にしているが、今回は save.js 側には一切手を入れていない。
// =========================================================

const FORMAT = 'monster-master-battle-checkpoint';
const VERSION = 1;

/** 現在のバトルセッションから、ターン開始時点のチェックポイントを作る */
function createCheckpoint(session) {
  return {
    format: FORMAT,
    version: VERSION,
    savedAt: new Date().toISOString(),
    session: structuredClone(session),
  };
}

// チェックポイントから復元したセッションが最低限備えるべき形。
// このPHASEでは実行時チェックのみ行い、値の意味（勝敗判定など）には踏み込まない。
function validateCheckpoint(checkpoint) {
  if (!checkpoint || typeof checkpoint !== 'object') return 'チェックポイントがありません';
  if (checkpoint.format !== FORMAT) return 'モンスターマスターのバトルチェックポイントではありません';
  if (!Number.isInteger(checkpoint.version)) return 'チェックポイントの版数がありません';
  if (checkpoint.version > VERSION) return 'このチェックポイントは新しいバージョンのバトルシステムで作られています';
  const s = checkpoint.session;
  if (!s || typeof s !== 'object') return 'バトルセッションがありません';
  if (s.firstActor !== 'A' && s.firstActor !== 'B') return '先攻情報が不正です';
  if (!Number.isInteger(s.turn) || s.turn < 1) return 'ターン数が不正です';
  if (!s.participants?.A || !s.participants?.B) return '参加個体の情報がありません';
  if (!s.currentLife || !s.hitCount || !s.totalDamage) return 'ライフ／命中／ダメージの記録がありません';
  return null;
}

/**
 * チェックポイントからバトルセッションを復元する。
 * 壊れたチェックポイントは（save.js の load() 同様）例外を投げる。
 */
function restoreSession(checkpoint) {
  const problem = validateCheckpoint(checkpoint);
  if (problem) throw new Error(`チェックポイントを復元できません：${problem}`);
  return structuredClone(checkpoint.session);
}

__MM_TMP__.createCheckpoint = createCheckpoint;
__MM_TMP__.restoreSession = restoreSession;
})();

// ---- from systems/battle/engine.js ----
(function () {
const calculateBaseDamage = __MM_TMP__.calculateBaseDamage;
const applyDamageVariance = __MM_TMP__.applyDamageVariance;
const rollCritical = __MM_TMP__.rollCritical;
const finalizeDamage = __MM_TMP__.finalizeDamage;
const calculateHitRate = __MM_TMP__.calculateHitRate;
const rollHit = __MM_TMP__.rollHit;
const getEffectiveStat = __MM_TMP__.getEffectiveStat;
const createEffect = __MM_TMP__.createEffect;
const applyEffectToSession = __MM_TMP__.applyEffectToSession;
const advanceEffectsForSession = __MM_TMP__.advanceEffectsForSession;
// =========================================================
// 1ラウンドのバトル進行処理（PHASE 4）
//  ・「先攻の1行動 → (生存なら)後攻の1行動 → (両者生存なら)ラウンド終了処理」までをまとめる。
//  ・ダメージ・命中・クリティカルの計算式は js/systems/battle/combatMath.js を、
//    実効能力値・バフデバフ処理は js/systems/battle/effects.js をそのまま呼び出す。
//    ここに計算式を重複実装しない。
//  ・技ルーレットは実装しない。このラウンドで使う技（Move）は呼び出し側が渡す。
//  ・非攻撃技（ダメージを与えずバフ／デバフだけの技）は今回対象外。power > 0 の攻撃技のみ扱う。
// =========================================================


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
function resolveAction({ session, baseStats, attackerSide, move, rng }) {
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
function resolveRound(session, moves, { baseStats, rng = {} }) {
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

__MM_TMP__.resolveAction = resolveAction;
__MM_TMP__.resolveRound = resolveRound;
})();


window.MMBattle = Object.freeze({
  getSpeed: __MM_TMP__.getSpeed,
  newUid: __MM_TMP__.newUid,
  createIndividual: __MM_TMP__.createIndividual,
  PARAM_KEYS: __MM_TMP__.PARAM_KEYS,
  SPEED_MIN: __MM_TMP__.SPEED_MIN,
  SPEED_MAX: __MM_TMP__.SPEED_MAX,
  DEFAULT_SPEED: __MM_TMP__.DEFAULT_SPEED,
  isValidSpeed: __MM_TMP__.isValidSpeed,
  determineFirstActor: __MM_TMP__.determineFirstActor,
  calculateBaseDamage: __MM_TMP__.calculateBaseDamage,
  applyDamageVariance: __MM_TMP__.applyDamageVariance,
  rollCritical: __MM_TMP__.rollCritical,
  finalizeDamage: __MM_TMP__.finalizeDamage,
  calculateHitRate: __MM_TMP__.calculateHitRate,
  rollHit: __MM_TMP__.rollHit,
  CRITICAL_MULTIPLIER: __MM_TMP__.CRITICAL_MULTIPLIER,
  DAMAGE_VARIANCE_MIN: __MM_TMP__.DAMAGE_VARIANCE_MIN,
  DAMAGE_VARIANCE_MAX: __MM_TMP__.DAMAGE_VARIANCE_MAX,
  HIT_RATE_MIN: __MM_TMP__.HIT_RATE_MIN,
  HIT_RATE_MAX: __MM_TMP__.HIT_RATE_MAX,
  createEffect: __MM_TMP__.createEffect,
  applyEffect: __MM_TMP__.applyEffect,
  advanceEffects: __MM_TMP__.advanceEffects,
  getEffectiveStat: __MM_TMP__.getEffectiveStat,
  applyEffectToSession: __MM_TMP__.applyEffectToSession,
  advanceEffectsForSession: __MM_TMP__.advanceEffectsForSession,
  getEffectiveStatFromSession: __MM_TMP__.getEffectiveStatFromSession,
  EFFECT_CATEGORIES: __MM_TMP__.EFFECT_CATEGORIES,
  EFFECT_DIRECTIONS: __MM_TMP__.EFFECT_DIRECTIONS,
  EFFECT_SIZES: __MM_TMP__.EFFECT_SIZES,
  EFFECT_SIZE_RATIO: __MM_TMP__.EFFECT_SIZE_RATIO,
  newBattleId: __MM_TMP__.newBattleId,
  createBattleSession: __MM_TMP__.createBattleSession,
  createCheckpoint: __MM_TMP__.createCheckpoint,
  restoreSession: __MM_TMP__.restoreSession,
  resolveAction: __MM_TMP__.resolveAction,
  resolveRound: __MM_TMP__.resolveRound
});
})();
