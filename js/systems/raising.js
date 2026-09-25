// =========================================================
// 育成の開始と終了（モードの切り替えはここでだけ行う）
//
//  開始の入口は3つだけ：market（市場購入）/ fusion（合体）/ restoration（特殊復元）
//  開始の判定式：牧場の登録数 − 消費される親の数 < 20
//  判定 → 名前設定 → 確定（消費・個体生成・RAISING）を分け、確定は1回の変更でまとめて行う
// =========================================================
import { MODES } from '../core/state.js';

export const SOURCES = Object.freeze(['market', 'fusion', 'restoration']);

const fail = (reason, message) => ({ ok: false, reason, message });

/** 開始できるかを調べるだけ（状態は変えない） */
export function checkCanStartRaising(state, config, { source, consumeParentUids = [], goldCost = 0, consumeItems = {} } = {}) {
  if (state.mode !== MODES.TOWN || state.active) return fail('NOT_TOWN', '育成中は新しい育成を開始できません');
  if (!SOURCES.includes(source)) return fail('BAD_SOURCE', `不明な入手経路：${source}`);

  const parents = new Set(consumeParentUids);
  if (parents.size !== consumeParentUids.length) return fail('DUPLICATE_PARENT', '同じモンスターを2回選んでいます');
  if (source === 'fusion' && parents.size !== 2) return fail('FUSION_NEEDS_TWO', '合体には2体が必要です');
  if (source !== 'fusion' && parents.size > 0) return fail('UNEXPECTED_PARENT', '合体以外では牧場のモンスターを消費しません');
  for (const uid of parents) {
    if (!state.ranch.some((m) => m.uid === uid)) return fail('PARENT_NOT_FOUND', '選んだモンスターが牧場にいません');
  }

  // 牧場満杯チェック（合体は親2体が消えるので、20体でも開始できる）
  if (state.ranch.length - parents.size >= config.rules.ranchMax) {
    return fail('RANCH_FULL', config.messages.ranchFull);
  }
  if (goldCost > state.player.gold) return fail('NOT_ENOUGH_GOLD', config.messages.notEnoughGold);
  for (const [itemId, n] of Object.entries(consumeItems)) {
    if ((state.inventory[itemId] ?? 0) < n) return fail('NOT_ENOUGH_ITEMS', '必要なアイテムが足りません');
  }
  return { ok: true };
}

/** 名前設定のあとに呼ぶ。消費と育成開始をまとめて確定する */
export function commitStartRaising(draft, config, { source, individual, consumeParentUids = [], goldCost = 0, consumeItems = {} }) {
  const check = checkCanStartRaising(draft, config, { source, consumeParentUids, goldCost, consumeItems });
  if (!check.ok) return check;
  if (!individual?.uid) return fail('NO_INDIVIDUAL', '育成するモンスターがいません');

  draft.player.gold -= goldCost;
  for (const [itemId, n] of Object.entries(consumeItems)) draft.inventory[itemId] -= n;
  draft.ranch = draft.ranch.filter((m) => !consumeParentUids.includes(m.uid));
  draft.active = { ...individual, origin: source };
  draft.mode = MODES.RAISING;
  return { ok: true, events: [{ type: 'raising_started', source, uid: individual.uid }] };
}

// ---------- 育成終了 ----------
// 成功と失敗で処理を分ける。失敗時の最終仕様は PHASE 2 で確定する。
const FINISH_HANDLERS = {
  success(draft, config) {
    const ind = draft.active;
    // 開始時に空きを確認し、育成中は牧場が変わらないので、ここで満杯になることはない
    if (draft.ranch.length >= config.rules.ranchMax) return fail('RANCH_FULL_INVARIANT', '牧場が満杯です（想定外）');
    draft.ranch.push(ind);
    registerDex(draft, ind);
    draft.records.raisedCount += 1;
    draft.active = null;
    draft.mode = MODES.TOWN;
    return { ok: true, events: [{ type: 'raising_success', uid: ind.uid, speciesId: ind.speciesId }] };
  },

  // 【仮処理】PHASE 2 で確定するまでの差し込み口。現在は登録せずに街へ戻るだけ（仕様ではない）
  fail(draft) {
    const ind = draft.active;
    draft.active = null;
    draft.mode = MODES.TOWN;
    return { ok: true, provisional: true, events: [{ type: 'raising_fail_provisional', uid: ind.uid }] };
  },
};

export function commitFinishRaising(draft, config, outcome) {
  if (draft.mode !== MODES.RAISING || !draft.active) return fail('NOT_RAISING', '育成中のモンスターがいません');
  const handler = FINISH_HANDLERS[outcome];
  if (!handler) return fail('UNKNOWN_OUTCOME', `不明な育成結果：${outcome}`);
  return handler(draft, config);
}

// 図鑑登録：同じ種類を何度育成しても番号は増えない。表示用に最新の個体を保存
// （「最新」と「最高」のどちらを見せるかは未確定。現在は最新）
function registerDex(draft, ind) {
  const prev = draft.discovered.monsters[ind.speciesId];
  draft.discovered.monsters[ind.speciesId] = {
    firstRegisteredAt: prev?.firstRegisteredAt ?? new Date().toISOString(),
    successCount: (prev?.successCount ?? 0) + 1,
    latest: {
      nickname: ind.nickname,
      variantId: ind.variantId,
      stats: { ...ind.stats },
      learnedMoves: [...ind.learnedMoves],
      rank: ind.rank,
      officialRecord: { ...ind.officialRecord },
      registeredAt: new Date().toISOString(),
    },
  };
}
