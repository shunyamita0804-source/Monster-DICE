// =========================================================
// 画面に入った時の判定
//  街：TOWNモードで街に入った時点で500G未満なら、500Gになるよう補填（ロード直後も対象）
//  市場など：data/unlocks.json の trigger ごとに解放を判定
// =========================================================
import { MODES } from '../core/state.js';
import { evaluate } from './conditions.js';

export function applyTownEntry(draft, config) {
  const events = [];
  if (draft.mode !== MODES.TOWN) return { ok: true, events };
  const { rescueThreshold, rescueTarget } = config.rules;
  if (draft.player.gold < rescueThreshold) {
    const from = draft.player.gold;
    draft.player.gold = rescueTarget;          // 加算ではなく補填
    events.push({ type: 'mother_rescue', from, to: rescueTarget });
  }
  return { ok: true, events };
}

export function applyTriggerUnlocks(draft, unlocks, trigger) {
  const events = [];
  for (const u of unlocks) {
    if (u.trigger !== trigger || draft.flags[u.flag]) continue;
    if (evaluate(u.condition, draft)) {
      draft.flags[u.flag] = true;                // 永久フラグ
      events.push({ type: u.event, flag: u.flag, unlockId: u.id });
    }
  }
  return { ok: true, events };
}
