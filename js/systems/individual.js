// 個体（育成中・牧場・図鑑の保存用ですべて共通の形）
export const PARAM_KEYS = Object.freeze(['life', 'power', 'wisdom', 'hit', 'evasion', 'toughness']);

// 素早さ：通常6能力とは別枠（六角形の能力分析図には含めない）。1〜10、10が最速・1が最遅。
// バトル開始時の先攻判定にのみ使う（js/systems/battle/）。ダメージ・命中・回避などには影響しない。
export const SPEED_MIN = 1;
export const SPEED_MAX = 10;
// 種族ごとの正式値（例：ソラモ5・ガウル7・ノビトン2）を持つマスターデータはまだ存在しないため、
// それが用意されるまでの暫定デフォルト。1〜10の中央付近（5）とし、同じデフォルト同士が対戦する
// ケースでも先攻判定が偏らないようにした。確定済み3体の平均（5,7,2→約4.7）にも近い。
export const DEFAULT_SPEED = 5;
export const isValidSpeed = (v) => Number.isInteger(v) && v >= SPEED_MIN && v <= SPEED_MAX;

/** 個体の素早さを読む。古いデータ等で speed フィールドが無い／不正な場合は DEFAULT_SPEED を返す（後方互換） */
export function getSpeed(individual) {
  return isValidSpeed(individual?.speed) ? individual.speed : DEFAULT_SPEED;
}

export function newUid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `ind-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createIndividual(config, {
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
