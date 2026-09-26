// ボタン。state: 'pressed' | 'selected' | 'disabled'（見本表示や操作状態の固定に使う）
import { h } from './dom.js';
import { icon as makeIcon } from './icons.js';

export function button(label, { variant = 'wood', size = '', state = '', icon = null, onClick, className = '' } = {}) {
  const cls = ['mm-btn', `mm-btn--${variant}`, size && `mm-btn--${size}`, state && `is-${state}`, className].filter(Boolean).join(' ');
  return h('button', {
    class: cls,
    type: 'button',
    disabled: state === 'disabled',
    onclick: (e) => { if (state !== 'disabled') onClick?.(e); },
  },
  h('span', { class: 'mm-btn__gem' }),
  icon ? makeIcon(icon, 'mm-btn__icon') : null,
  h('span', { class: 'mm-btn__label' }, label));
}
