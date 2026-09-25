// =========================================================
// 画面の切り替え
//  各画面は所属するモードを宣言する：'TOWN' / 'RAISING' / 'ANY'
//  モードが合わない画面へは移動できない。
//  → 育成中（RAISING）に街や街の施設へ移る遷移は、仕組みとして存在しない。
// =========================================================
import { getState } from './state.js';
import { emit } from './bus.js';
import { clearBackgroundLayer } from './background.js';

const screens = new Map();
let current = null;

export function registerScreen(def) {
  if (!def.id || !def.mode || typeof def.mount !== 'function') throw new Error('画面の定義が不完全です');
  screens.set(def.id, def);
}

export function currentScreen() { return current?.def.id ?? null; }

/** 移動できるかだけを調べる（画面は変わらない） */
export function canEnter(screenId) {
  const def = screens.get(screenId);
  if (!def) return { ok: false, reason: 'UNKNOWN_SCREEN', message: `画面「${screenId}」は未登録です` };
  return checkMode(def.mode);
}

export function checkMode(mode) {
  const state = getState();
  if (mode === 'ANY') return { ok: true };
  if (!state) return { ok: false, reason: 'NO_GAME', message: 'ゲームが始まっていません' };
  if (mode !== state.mode) {
    return {
      ok: false,
      reason: 'MODE_MISMATCH',
      message: state.mode === 'RAISING' ? '育成中は街へ戻れません' : '育成中のモンスターがいません',
    };
  }
  return { ok: true };
}

export async function go(screenId, params = {}) {
  const check = canEnter(screenId);
  if (!check.ok) {
    emit('router:blocked', { screenId, ...check });
    return check;
  }
  const def = screens.get(screenId);
  if (current?.cleanup) await current.cleanup();

  const ui = document.getElementById('ui-frame');
  const overlay = document.getElementById('layer-overlay');
  ui.replaceChildren();
  overlay.replaceChildren();
  clearBackgroundLayer();

  const ctx = {
    ui,
    bg: document.getElementById('bg-stage'),
    overlay,
    params,
    go,
  };
  const cleanup = await def.mount(ctx);
  current = { def, cleanup: typeof cleanup === 'function' ? cleanup : null };
  emit('router:change', { screenId, params });
  return { ok: true };
}
