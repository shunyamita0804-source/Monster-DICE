// =========================================================
// 画面から呼ぶ入口。状態の変更とオートセーブをまとめて行う
// オートセーブ：モード切替時・購入時・週が進んだ時・施設から街に戻った時
// =========================================================
import { getConfig, getUnlocks } from '../core/config.js';
import { getState, transact } from '../core/state.js';
import { autosave } from '../core/save.js';
import { emit } from '../core/bus.js';
import { checkCanStartRaising, commitStartRaising, commitFinishRaising } from './raising.js';
import { applyTownEntry, applyTriggerUnlocks } from './entry.js';

async function safeAutosave() {
  try {
    await autosave(getState());
    emit('save:auto', { ok: true });
  } catch (err) {
    console.error(err);
    emit('save:auto', { ok: false, error: err.message });
  }
}

export function canStartRaising(opts) {
  return checkCanStartRaising(getState(), getConfig(), opts);
}

export async function startRaising(opts) {
  const result = transact((d) => commitStartRaising(d, getConfig(), opts), 'startRaising');
  if (result.ok) await safeAutosave();
  return result;
}

export async function finishRaising(outcome) {
  const result = transact((d) => commitFinishRaising(d, getConfig(), outcome), 'finishRaising');
  if (result.ok) await safeAutosave();
  return result;
}

/** 街画面を開く時に必ず呼ぶ。fromFacility=true なら施設から戻った扱いでオートセーブ */
export async function enterTown({ fromFacility = false } = {}) {
  const result = transact((d) => applyTownEntry(d, getConfig()), 'enterTown');
  if (result.events.length || fromFacility) await safeAutosave();
  return result;
}

export async function enterMarket() {
  const result = transact((d) => applyTriggerUnlocks(d, getUnlocks(), 'marketEntry'), 'enterMarket');
  if (result.events.length) await safeAutosave();   // 解放は永久フラグなのですぐ保存
  return result;
}
