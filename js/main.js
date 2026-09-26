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
import { applySkins } from './ui/skins.js';

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
  applySkins();
  initLayout(config);
  // iOS Safari で :active（押下の見た目）を効かせる
  document.addEventListener('touchstart', () => {}, { passive: true });
  initSave(createStorage(config.storagePrefix), config);

  // ステップ3：ゲーム画面はまだ無い。開発用の画面だけを開く。
  //   既定 …… UI部品集（dev.gallery）
  //   ?dev=foundation …… 基盤チェック
  // （ステップ4でタイトル画面からの起動に置き換える）
  setState(createNewGame(config), 'boot');
  startPlayClock();

  const [foundation, gallery] = await Promise.all([import('./dev/foundation.js'), import('./dev/gallery.js')]);
  foundation.register(registerScreen);
  gallery.register(registerScreen);
  const which = new URLSearchParams(location.search).get('dev');
  await go(which === 'foundation' ? 'dev.foundation' : 'dev.gallery');
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
