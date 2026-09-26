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
import { getSpeed } from '../individual.js';
import { determineFirstActor } from './firstActor.js';

export function newBattleId() {
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
export function createBattleSession({ unitA, unitB, battleType, rng = Math.random }) {
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
