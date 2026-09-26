// =========================================================
// 見た目の素材（質感・装飾）を素材台帳から読み込み、CSS変数へ流し込む
//  ・仮素材でも正式素材でも、台帳の path が指すファイルを使う
//  ・正式の「部品画像」（パネル・ボタン等）が届いたら、台帳を official にするだけで
//    html に has-<部品> クラスが付き、css/ui/skins-official.css の画像表示に切り替わる
// =========================================================
import { assetUrl, asset } from '../core/assets.js';

const IMAGE_VARS = {
  '--tex-leather': 'ui.tex.leather',
  '--tex-iron': 'ui.tex.iron',
  '--tex-seal': 'ui.tex.seal',
  '--tex-wood-dark': 'ui.tex.wood_dark',
  '--tex-wood-light': 'ui.tex.wood_light',
  '--tex-parchment': 'ui.tex.parchment',
  '--orn-corner-tl': 'ui.orn.corner_tl',
  '--orn-corner-tr': 'ui.orn.corner_tr',
  '--orn-corner-bl': 'ui.orn.corner_bl',
  '--orn-corner-br': 'ui.orn.corner_br',
  '--plate-cap-l': 'ui.plate.cap_l',
  '--plate-cap-r': 'ui.plate.cap_r',
  '--sign-cap-l': 'ui.sign.cap_l',
  '--sign-cap-r': 'ui.sign.cap_r',
};

// 正式の部品画像（9分割で伸縮する1枚絵）。台帳に slice（切り分け位置）と width（枠の太さ, rem）を書く
const OFFICIAL_PARTS = [
  'ui.panel.wood', 'ui.panel.gold', 'ui.panel.parchment',
  'ui.button.normal', 'ui.button.pressed', 'ui.button.disabled',
];

export function applySkins() {
  const root = document.documentElement;
  for (const [cssVar, id] of Object.entries(IMAGE_VARS)) {
    const url = assetUrl(id);
    root.style.setProperty(cssVar, url ? `url("${url}")` : 'none');
  }
  for (const id of OFFICIAL_PARTS) {
    const e = asset(id);
    const key = id.replace(/\./g, '-');
    const url = e.status === 'official' ? assetUrl(id) : null;
    root.classList.toggle(`has-${key}`, !!url);
    if (url) {
      root.style.setProperty(`--img-${key}`, `url("${url}")`);
      root.style.setProperty(`--slice-${key}`, e.slice ?? '40%');
      root.style.setProperty(`--width-${key}`, `${e.width ?? 4}rem`);
    }
  }
}
