// アイコンは素材台帳の ID で呼ぶ。ファイルが無い時は「準備中」の彫り込み表示（絵文字は使わない）
import { assetUrl } from '../core/assets.js';
import { h } from './dom.js';

export function icon(id, className = '') {
  const url = assetUrl(id);
  if (!url) return h('span', { class: `mm-icon mm-pending ${className}`, title: id }, '準備中');
  return h('img', { class: `mm-icon ${className}`, src: url, alt: '', draggable: 'false' });
}

export const paramIcon = (key) => icon(`icon.param.${key}`);
export const categoryIcon = (cat) => icon(`icon.cat.${cat}`);
