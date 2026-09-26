// ファームのコマンドタイル／技のセット6枠／技カード
import { h, cropStyle } from './dom.js';
import { icon } from './icons.js';
import { pending } from './markers.js';

/** 操作プレート。iconId は素材台帳のID（正式アイコンは台帳の差し替えだけで入る）
 *  ソケットの色味は iconId 末尾（board/training/status/moves/items）から決める。 */
export function commandTile(label, { iconId, state = '', onClick } = {}) {
  const kind = iconId?.split('.').pop() ?? '';
  return h('button', { class: `mm-cmd${state ? ` is-${state}` : ''}`, type: 'button', onclick: (e) => state !== 'disabled' && onClick?.(e) },
    h('span', { class: `mm-cmd__socket mm-cmd__socket--${kind}` }, icon(iconId)),
    h('span', { class: 'mm-cmd__label' }, label),
    h('span', { class: 'mm-cmd__chevron' }));
}

export const CATEGORY_LABEL = { power: 'ちから', wisdom: 'かしこさ', support: '補助' };

/** slots: 長さ6。技 { name, cat } または null（空き） */
export function moveSlots(slots) {
  return h('div', { class: 'mm-slots' }, slots.map((m, i) => (m
    ? h('div', { class: `mm-slot cat-${m.cat}` },
      h('span', { class: 'mm-slot__no' }, String(i + 1)),
      h('div', { class: 'mm-slot__main' }, h('div', { class: 'mm-slot__name' }, m.name), h('div', { class: 'mm-slot__cat' }, CATEGORY_LABEL[m.cat])),
      h('span', { class: 'mm-grip', title: '並べ替え' }))
    : h('div', { class: 'mm-slot is-empty' },
      h('span', { class: 'mm-slot__no' }, String(i + 1)),
      h('div', { class: 'mm-slot__cat', style: { color: 'var(--mm-muted)' } }, '空き'),
      h('span', {})))));
}

/** 技カード。art: { url, img, box } … 技イラスト（無ければ「準備中」） */
export function moveCard({ name, cat, description = '', power, accuracy, critical, effect = '', art = null }) {
  const frame = { w: 30, h: 17 };
  return h('div', { class: `mm-move cat-${cat}` },
    h('div', { class: 'mm-move__art' }, art?.url ? h('div', { style: cropStyle(art.url, art.img, art.box, frame) }) : pending()),
    h('div', { class: 'mm-move__main' },
      h('div', { class: 'mm-move__top' },
        h('span', { class: 'mm-move__name' }, name),
        h('span', { class: 'mm-badge' }, CATEGORY_LABEL[cat])),
      description ? h('div', { class: 'mm-move__desc' }, description) : null,
      h('div', { class: 'mm-stats' },
        stat('威力', power), stat('命中', accuracy), stat('クリティカル率', `${critical}%`)),
      effect ? h('div', { class: 'mm-move__effect' }, effect) : null));
}

const stat = (k, v) => h('span', { class: 'mm-stat' }, h('span', { class: 'mm-stat__k' }, k), h('span', { class: 'mm-stat__v' }, String(v)));
