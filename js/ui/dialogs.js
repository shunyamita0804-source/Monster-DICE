// 会話ウィンドウ／確認ダイアログ／案内ダイアログ／画面に重ねて開く
import { h } from './dom.js';
import { panel, plate } from './frames.js';
import { button } from './buttons.js';
import { icon } from './icons.js';

/**
 * 会話。portraitUrl があれば立ち絵を窓の上に立たせ、無ければ名札だけ（空の枠は作らない）
 */
export function talk({ speaker, text, portraitUrl = null, portraitStyle = null, framed = false }) {
  const hasPortrait = !!portraitUrl;
  // framed … 背景付きの絵を丸い金枠に収める（背景透過の立ち絵は framed なしでそのまま立たせる）
  return h('div', { class: `mm-talk${hasPortrait ? ' has-portrait' : ''}` },
    hasPortrait ? h('div', { class: `mm-talk__portrait${framed ? ' is-framed' : ''}` }, portraitStyle
      ? h('div', { style: { width: '100%', height: '100%', backgroundRepeat: 'no-repeat', ...portraitStyle } })
      : h('img', { src: portraitUrl, alt: '' })) : null,
    speaker ? h('div', { class: 'mm-talk__name' }, plate(speaker)) : null,
    panel({ variant: 'paper' }, h('p', { class: 'mm-talk__text' }, text)),
    h('span', { class: 'mm-talk__next' }));
}

/** 確認（はい／いいえ） */
export function confirmDialog({ title = '確認', message, yesLabel = 'はい', noLabel = 'いいえ', onYes, onNo }) {
  return h('div', { class: 'mm-dialog mm-dialog--confirm', role: 'dialog' },
    panel({ variant: 'important' },
      h('div', { class: 'mm-dialog__title' }, title),
      h('p', { class: 'mm-dialog__message' }, message),
      h('div', { class: 'mm-dialog__actions' },
        button(noLabel, { onClick: onNo }),
        button(yesLabel, { variant: 'primary', onClick: onYes }))));  // 重要な決定＝金
}

/** 案内（牧場がいっぱい等）。ボタン1つ */
export function noticeDialog({ message, okLabel = 'OK', iconId = 'icon.notice', onOk }) {
  return h('div', { class: 'mm-dialog mm-dialog--notice', role: 'alertdialog' },
    panel({ variant: 'paper' },
      h('div', { class: 'mm-dialog__icon' }, icon(iconId)),
      h('p', { class: 'mm-dialog__message' }, message),
      h('div', { class: 'mm-dialog__actions' }, button(okLabel, { variant: 'primary', onClick: onOk }))));
}

/** 重ね表示層に開く。戻り値の close() で閉じる */
export function openModal(content) {
  const overlay = document.getElementById('layer-overlay');
  const modal = h('div', { class: 'mm-modal' }, content);
  overlay.append(modal);
  return { close: () => modal.remove(), element: modal };
}
