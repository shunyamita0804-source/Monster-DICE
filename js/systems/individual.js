// 個体（育成中・牧場・図鑑の保存用ですべて共通の形）
export const PARAM_KEYS = Object.freeze(['life', 'power', 'wisdom', 'hit', 'evasion', 'toughness']);

export function newUid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `ind-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createIndividual(config, {
  speciesId, variantId = null, nickname, stats, learnedMoves = [], equippedMoves = [], origin, parents = null,
}) {
  const r = config.rules;
  if (!speciesId) throw new Error('種族がありません');
  if (!nickname || !nickname.trim()) throw new Error('個体名がありません');
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
