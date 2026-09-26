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
export function determineFirstActor(speedA, speedB, rng = Math.random) {
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
