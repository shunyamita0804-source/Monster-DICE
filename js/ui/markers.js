// ロック／未発見（封印）／素材準備中
import { h } from './dom.js';
import { icon } from './icons.js';
import { plate } from './frames.js';

export const lockBadge = ({ small = false } = {}) => h('span', { class: `mm-lock${small ? ' mm-lock--sm' : ''}` }, icon('icon.lock'));
export const unknownText = (text = '？？？') => h('span', { class: 'mm-unknown-text' }, text);
export const unknownMark = () => h('span', { class: 'mm-unknown-mark' }, '？');
export const pending = (text = '画像準備中') => h('span', { class: 'mm-pending' }, text);

/** 未発見／ロックの表示。kind: 'unknown'（まだ記録されていない）| 'locked'（条件未達成） */
export const sealed = (children, kind = 'unknown') => h('div', { class: `mm-sealed${kind === 'locked' ? ' mm-sealed--locked' : ''}` }, children);

/** 市場などの「？？？＋鍵」の名札 */
export function lockedPlate() {
  const p = plate('？？？', { sub: lockBadge({ small: true }), className: 'mm-plate--inline' });
  p.querySelector('.mm-plate__text').classList.add('mm-unknown-text');
  return p;
}
