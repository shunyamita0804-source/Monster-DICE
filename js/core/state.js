// =========================================================
// ゲーム状態
//  ・状態の変更は transact() でだけ行う（失敗したら何も変わらない）
//  ・モードは TOWN / RAISING の2つだけ
// =========================================================
import { emit } from './bus.js';

export const MODES = Object.freeze({ TOWN: 'TOWN', RAISING: 'RAISING' });

let state = null;

export function getState() { return state; }

export function setState(next, reason = 'set') {
  const problem = validateState(next);
  if (problem) throw new Error(`状態が不正です：${problem}`);
  state = next;
  emit('state:change', { state, reason });
}

/**
 * 状態を安全に変更する。
 * fn(draft) が { ok: false } を返したら変更を捨てて、その結果を返す。
 */
export function transact(fn, reason = 'update') {
  const draft = structuredClone(state);
  const result = fn(draft) ?? { ok: true };
  if (result.ok === false) return result;
  setState(draft, reason);
  return result;
}

// プレイ時間は毎秒増えるので、通知を出さずに加算する
export function addPlayTime(seconds) {
  if (state) state.playTimeSec += seconds;
}

export function createNewGame(config, playerName) {
  const r = config.rules;
  const name = (playerName ?? '').trim() || r.defaultPlayerName;
  return {
    player: {
      name,
      gold: r.initialGold,
      calendar: { year: config.calendar.year, month: config.calendar.month, week: config.calendar.week },
    },
    mode: MODES.TOWN,
    active: null,                 // 育成中の個体（RAISING の時だけ入る）
    ranch: [],                    // 育成成功した個体（最大20）
    inventory: {},                // { itemId: 個数 }
    discovered: {
      monsters: {},               // 図鑑：{ speciesId: { successCount, latest } }
      items: {},                  // アイテム図鑑：{ itemId: 初入手日時 }（所持0でも残る）
      recipes: {},                // 合体レシピ：{ recipeId: 発見日時 }
    },
    flags: {},                    // 永久フラグ（解放・初回イベントなど）
    records: {
      raisedCount: 0,             // 育成成功数
      official: { win: 0, lose: 0 },
      arena: { win: 0, lose: 0, titles: 0 },
      highestRank: null,          // 歴代最高ランク
    },
    playTimeSec: 0,
    createdAt: new Date().toISOString(),
  };
}

// ロードや変更のたびに、絶対に守るべき約束を確認する
export function validateState(s) {
  if (!s || typeof s !== 'object') return 'データがありません';
  if (!s.player || typeof s.player.name !== 'string') return 'プレイヤー情報がありません';
  if (!Number.isFinite(s.player.gold) || s.player.gold < 0) return '所持金が不正です';
  if (!Object.values(MODES).includes(s.mode)) return `不明なモード：${s.mode}`;
  if (s.mode === MODES.RAISING && !s.active) return '育成中なのに育成個体がいません';
  if (s.mode === MODES.TOWN && s.active) return '街にいるのに育成個体がいます';
  if (!Array.isArray(s.ranch)) return '牧場データが不正です';
  return null;
}
