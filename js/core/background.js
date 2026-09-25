// 背景層に素材を敷く。素材が未完成なら何も敷かず、呼び出し側が「準備中」表示を判断する
import { assetUrl, asset } from './assets.js';

export function setBackground(assetId) {
  const stage = document.getElementById('bg-stage');
  const fill = document.getElementById('bg-fill');
  const url = assetId ? assetUrl(assetId) : null;
  const css = url ? `url("${url}")` : '';
  stage.style.backgroundImage = css;
  fill.style.backgroundImage = css;
  stage.dataset.asset = assetId ?? '';
  stage.dataset.available = url ? 'true' : 'false';
  return { available: !!url, entry: assetId ? asset(assetId) : null };
}

export function clearBackgroundLayer() {
  const stage = document.getElementById('bg-stage');
  stage.replaceChildren();
  stage.className = '';
  setBackground(null);
}
