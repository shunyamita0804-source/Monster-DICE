// パネル・名札・看板・タブ
import { h } from './dom.js';

/** 金文字（縁取り付き） */
export const goldText = (text, className = '') => h('span', { class: `mm-t-gold ${className}`, 'data-text': text }, h('span', {}, text));


/** パネル。variant: 'paper'（通常）| 'soft'（一段沈んだ面）| 'important'（重要な確認）| 'wood'（看板用）
 *  旧名 leather / iron / parchment / gold も受け付ける（見た目は paper / soft / important） */
export function panel({ variant = 'paper', translucent = false, ornaments = variant === 'important' || variant === 'gold', className = '', bodyClass = '' } = {}, ...children) {
  return h('div', { class: `mm-panel mm-panel--${variant}${translucent ? ' is-translucent' : ''} ${className}` },
    ornaments ? ['tl', 'tr', 'bl', 'br'].map((c) => h('span', { class: `mm-orn mm-orn--${c}` })) : null,
    h('div', { class: `mm-panel__body ${bodyClass}` }, children));
}

/** 名札（革＋真鍮）。sub に要素（金貨＋価格など）を渡すと2段。gold=true で金文字（ダイアログの題など） */
export function plate(text, { sub = null, tall = !!sub, gold = false, className = '' } = {}) {
  return h('div', { class: `mm-plate${tall ? ' mm-plate--tall' : ''}${gold ? ' mm-plate--gold' : ''} ${className}` },
    gold ? goldText(text) : h('span', { class: 'mm-plate__text' }, text), sub);
}

/** 見出し看板（金文字） */
export function sign(text, { className = '' } = {}) {
  return h('div', { class: `mm-sign ${className}` }, goldText(text));
}

/** タブ。onChange(index) で選択が変わる */
export function tabs(labels, { active = 0, onChange } = {}) {
  const bar = h('div', { class: 'mm-tabs', role: 'tablist' });
  labels.forEach((label, i) => {
    bar.append(h('button', {
      class: `mm-tab${i === active ? ' is-active' : ''}`,
      role: 'tab',
      onclick: () => {
        bar.querySelectorAll('.mm-tab').forEach((t, j) => t.classList.toggle('is-active', j === i));
        onChange?.(i);
      },
    }, label));
  });
  return bar;
}
