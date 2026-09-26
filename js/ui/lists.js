// リストの行／所持アイテム行／アイテム図鑑マス／モンスター選択枠
import { h, cropStyle } from './dom.js';
import { icon } from './icons.js';
import { pending, lockBadge, unknownText, unknownMark, sealed } from './markers.js';

export const chevron = () => h('span', { class: 'mm-chevron' });

export function listRow({ slot = null, title, sub = '', end = null, state = '', onClick } = {}) {
  return h('div', { class: `mm-row${state ? ` is-${state}` : ''}`, role: 'button', onclick: onClick },
    h('div', { class: 'mm-row__slot' }, slot ?? pending()),
    h('div', { class: 'mm-row__main' },
      h('div', { class: 'mm-row__title' }, title),
      sub ? h('div', { class: 'mm-row__sub' }, sub) : null),
    h('div', { class: 'mm-row__end' }, end, chevron()));
}

export function itemRow({ name, count, description, iconId = null }) {
  return h('div', { class: 'mm-row mm-row--item' },
    h('div', { class: 'mm-row__slot' }, iconId ? icon(iconId) : pending()),
    h('div', { class: 'mm-row__main' },
      h('div', { class: 'mm-row__title' }, name),
      h('div', { class: 'mm-row__sub' }, description)),
    h('div', { class: 'mm-row__end' }, h('span', { class: 'mm-count' }, h('small', {}, '×'), String(count))));
}

export function dexCell({ no, name = '', iconId = null, unknown = false }) {
  const num = `No.${String(no).padStart(3, '0')}`;
  if (unknown) {
    return h('div', { class: 'mm-dex is-unknown' },
      sealed([h('span', { class: 'mm-dex__no' }, num), unknownMark(), unknownText()]));
  }
  return h('div', { class: 'mm-dex' },
    h('span', { class: 'mm-dex__no' }, num),
    h('div', { class: 'mm-row__slot' }, iconId ? icon(iconId) : pending()),
    h('span', { class: 'mm-dex__name' }, name));
}

/**
 * モンスター選択枠。state: '' | 'selected' | 'locked' | 'unknown'
 * art: { url, img:{w,h}, box:{x,y,w,h} } … 正式画像の切り出し
 */
export function monsterSlot({ name, art = null, state = '', tag = null, onClick } = {}) {
  const frame = { w: 32, h: 38 };
  const hidden = state === 'locked' || state === 'unknown';
  return h('div', { class: `mm-mslot${state ? ` is-${state}` : ''}`, role: 'button', onclick: onClick },
    tag ? h('span', { class: 'mm-mslot__tag' }, tag) : null,
    h('div', { class: 'mm-mslot__window' },
      hidden
        ? sealed(state === 'locked' ? [lockBadge()] : [unknownMark()], state)
        : art ? h('div', { class: 'mm-mslot__art', style: cropStyle(art.url, art.img, art.box, frame) }) : null),
    h('div', { class: 'mm-mslot__name' }, hidden ? '？？？' : name));
}
