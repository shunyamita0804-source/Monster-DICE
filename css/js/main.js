// =========================================================
// 起動
// =========================================================
import { loadJSON } from './core/data.js';
import { setConfig } from './core/config.js';
import { applyTheme } from './core/theme.js';
import { setLedger } from './core/assets.js';
import { initLayout } from './core/layout.js';
import { createStorage } from './core/storage.js';
import { initSave } from './core/save.js';
import { setState, createNewGame } from './core/state.js';
import { startPlayClock } from './core/playtime.js';
import { registerScreen, go } from './core/router.js';

async function boot() {
  const [config, theme, ledger, unlocks] = await Promise.all([
    loadJSON('data/config.json'),
    loadJSON('data/theme.json'),
    loadJSON('data/assets.json'),
    loadJSON('data/unlocks.json'),
  ]);
  setConfig(config, unlocks);
  applyTheme(theme);
  setLedger(ledger);
  initLayout(config);
  initSave(createStorage(config.storagePrefix), config);

  // ステップ1：ゲーム画面はまだ無い。
  // 基盤を確認するため、新規ゲームの状態を作って開発用の「基盤チェック」画面を開く。
  // （ステップ4でタイトル画面からの起動に置き換える）
  setState(createNewGame(config), 'boot');
  startPlayClock();

  const dev = await import('./dev/foundation.js');
  dev.register(registerScreen);
  await go('dev.foundation');
}

boot().catch((err) => {
  console.error(err);
  const box = document.getElementById('boot-error');
  const hint = location.protocol === 'file:'
    ? '\n\nファイルを直接開くと動きません。README の手順でローカルサーバーから開いてください。'
    : '';
  box.textContent = `起動できませんでした\n${err.message}${hint}`;
  box.hidden = false;
});
