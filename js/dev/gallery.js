// =========================================================
// 開発用：UI部品集（ゲームの画面ではありません）
//  今後すべての画面で共通に使う部品を、実際のゲームと同じ倍率で並べて確認する。
//  背景には正式デザインの完成図（基準画像）を敷き、正式画面に混ぜた時の馴染みを見る。
// =========================================================
import { h } from '../ui/dom.js';
import { panel, plate, sign, tabs } from '../ui/frames.js';
import { button } from '../ui/buttons.js';
import { talk, confirmDialog, noticeDialog, openModal } from '../ui/dialogs.js';
import { coin, goldDisplay, price, numberDisplay, delta, paramBadge, abilityUnit, abilityDial } from '../ui/values.js';
import { lockBadge, lockedPlate, unknownText, sealed } from '../ui/markers.js';
import { listRow, itemRow, dexCell, monsterSlot } from '../ui/lists.js';
import { commandTile, moveSlots, moveCard, CATEGORY_LABEL } from '../ui/cards.js';
import { icon, categoryIcon } from '../ui/icons.js';
import { assetUrl, referenceUrl } from '../core/assets.js';
import { getConfig } from '../core/config.js';
import { paramKeys, paramDef } from '../core/theme.js';
import { resolvePath } from '../core/data.js';

// 正式画像の切り出し位置（元画像のpx）
const SORAMO = { id: 'monster.soramo.profile', img: { w: 1225, h: 1284 }, box: { x: 450, y: 10, w: 690, h: 735 } };
const GAURU = { id: 'monster.gauru.profile', img: { w: 1536, h: 1024 }, box: { x: 330, y: 0, w: 470, h: 560 } };
const GAURU_MOVES = {
  hikkaki: { x: 846, y: 52, w: 206, h: 84 },
  wind: { x: 846, y: 257, w: 206, h: 91 },
  seinaru: { x: 846, y: 850, w: 206, h: 114 },
};
const art = (m, box = m.box) => ({ url: assetUrl(m.id), img: m.img, box });

const START_VALUES = { life: 120, power: 150, wisdom: 95, hit: 180, evasion: 70, toughness: 230 };

const BACKGROUNDS = [
  { label: '背景：街', ref: 'ref.town' },
  { label: '背景：市場', ref: 'ref.market' },
  { label: '背景：木目', ref: null },
];

export function register(registerScreen) {
  registerScreen({ id: 'dev.gallery', mode: 'ANY', mount });
}

function ensureCss() {
  if (document.getElementById('gallery-css')) return;
  document.head.append(h('link', { id: 'gallery-css', rel: 'stylesheet', href: resolvePath('css/dev-gallery.css') }));
}

// 部品の番号と名前（ご指定の30項目の番号に対応）
const cap = (no, text) => h('div', { class: 'gx-cap' }, h('span', { class: 'gx-cap__no' }, String(no)), h('span', {}, text));
const section = (title, ...children) => h('section', { class: 'gx-section' }, h('div', { class: 'gx-section__title' }, plate(title)), children);
const item = (no, text, ...children) => h('div', { class: 'gx-item' }, cap(no, text), h('div', { class: 'gx-item__body' }, children));

function mount(ctx) {
  ensureCss();
  let bgIndex = 0;

  // ---------- 背景 ----------
  const dim = h('div', { class: 'gx-dim' });
  function applyBg() {
    const b = BACKGROUNDS[bgIndex];
    const url = b.ref ? referenceUrl(b.ref) : null;
    ctx.bg.style.background = url
      ? `#140c06 url("${url}") center / 100% ${(1920 / 2340) * 100}% no-repeat`
      : 'var(--tex-wood-dark) center / var(--tex-size) repeat, #2c180b';
    bgBtn.querySelector('.mm-btn__label').textContent = b.label;
  }
  ctx.bg.append(dim);

  // ---------- 見出し（上揃え） ----------
  const bgBtn = button('背景：街', { size: 'sm', onClick: () => { bgIndex = (bgIndex + 1) % BACKGROUNDS.length; applyBg(); } });
  const header = h('header', { class: 'gx-header' },
    sign('UI部品集'),
    h('div', { class: 'gx-header__tools' },
      bgBtn,
      button('基盤チェック', { size: 'sm', onClick: () => ctx.go('dev.foundation') })));
  applyBg();

  // ---------- 本文（縦スクロール） ----------
  const values = { ...START_VALUES };
  const cfg = getConfig();

  const units = {};
  let chart;
  const content = h('div', { class: 'gx-content' },
    h('p', { class: 'gx-lead mm-t-outline-thin' }, '開発用の確認画面です。実際のゲームと同じ倍率で表示しています。明るいアイボリーの紙を基調に、金は選択中と重要な決定だけに使います。'),

    section('装飾の段階',
      item('–', '静か（通常情報）→ 操作できる → 選択中 → 重要な決定',
        h('div', { class: 'gx-ladder' },
          panel({ variant: 'paper' }, h('div', { class: 'mm-t-body' }, '通常情報：アイボリーの紙に細い焦げ茶の線')),
          h('div', { class: 'gx-row gx-row--center' },
            button('操作できる'),
            button('選択中', { state: 'selected' })),
          h('div', { class: 'gx-row gx-row--center' }, button('重要な決定', { variant: 'primary' }))))),

    section('パネル',
      item(1, '通常パネル（アイボリーの紙＋細い焦げ茶の線。装飾なし）',
        panel({ variant: 'paper' },
          h('div', { class: 'gx-panel-demo' },
            h('div', { class: 'mm-t-heading gx-panel-title' }, 'ぽかぽか牧場'),
            h('div', { class: 'mm-t-body' }, '育成に成功したモンスターが暮らしています。')))),
      item(1, '通常パネル（半透明：背景を透かす）',
        panel({ variant: 'paper', translucent: true },
          h('div', { class: 'gx-panel-demo' },
            h('div', { class: 'mm-t-heading gx-panel-title' }, '街の施設'),
            h('div', { class: 'mm-t-body' }, '背景の絵を活かしたい場所に使います。')))),
      item(1, '一段沈んだパネル（システム・ステータス系）',
        panel({ variant: 'soft' },
          h('div', { class: 'gx-panel-demo' },
            h('div', { class: 'mm-t-heading gx-panel-title' }, 'セーブ'),
            h('div', { class: 'mm-t-body' }, '四隅の鋲と鉄の縁で、仕組みの画面だと分かります。')))),
      item(2, '金装飾付きパネル（重要な確認だけ）',
        panel({ variant: 'important' },
          h('div', { class: 'gx-panel-demo' },
            h('div', { class: 'mm-t-heading gx-panel-title' }, '重要な確認'),
            h('div', { class: 'mm-t-body' }, '金の縁・象嵌線・角飾りは、ここにだけ使います。')))),
      item(3, '読む情報用パネル（説明・プロフィール・会話。紙はより白く）',
        panel({ variant: 'paper' },
          h('div', { class: 'gx-panel-demo' },
            h('div', { class: 'mm-t-heading gx-panel-title' }, 'プロフィール'),
            h('div', { class: 'mm-t-body gx-body-ink' }, '白に近いアイボリー。技イラストや立ち絵が主役になるよう控えめにします。')))),
      item(1, '木枠（大型看板・施設名など見せ場だけ）',
        h('div', { class: 'gx-row gx-row--center' }, sign('闘技場')))),

    section('ボタン',
      h('div', { class: 'gx-grid2' },
        item(4, '通常', button('市場へ行く')),
        item(5, '押下（沈み込む）', button('市場へ行く', { state: 'pressed' })),
        item(7, '選択中', button('市場へ行く', { state: 'selected' })),
        item(6, '無効', button('市場へ行く', { state: 'disabled' }))),
      item(4, '重要な決定（金のエナメル）／特別な枠（青のエナメル）',
        h('div', { class: 'gx-row gx-row--center' },
          button('購入する', { variant: 'primary' }),
          button('ファーム', { variant: 'special' })),
        h('div', { class: 'gx-row gx-row--center' },
          button('タップしてはじめる', { variant: 'primary', size: 'lg' }))),
      item(8, '小型サブボタン（通常／押下／選択中／無効）',
        h('div', { class: 'gx-row gx-row--center' },
          button('もどる', { size: 'sm' }),
          button('もどる', { size: 'sm', state: 'pressed' }),
          button('並べ替え', { size: 'sm', state: 'selected' }),
          button('くわしく', { size: 'sm', state: 'disabled' })))),

    section('名札・看板',
      item(9, '名札（アイボリーの紙＋細い焦げ茶と真鍮）',
        h('div', { class: 'gx-row gx-row--center' },
          plate('ソラモ'),
          plate('ガウル', { sub: price(500) }))),
      item(10, '見出し看板（木＋金文字）',
        h('div', { class: 'gx-row gx-row--center' }, sign('市場'), sign('博物館')))),

    section('タブ',
      item('11・12', '通常タブ／選択中タブ（押すと切り替わります）',
        h('div', {},
          tabs(['所持アイテム', 'アイテム図鑑']),
          panel({ variant: 'paper' }, h('div', { class: 'mm-t-body gx-tab-body' }, '選択中のタブだけ金の縁と宝石が付き、下のパネルとつながります。'))))),

    section('ダイアログ',
      item(13, '会話ウィンドウ（絵あり：背景付きの絵は丸枠に収める。背景透過の立ち絵は枠なしで立たせる）',
        talk({ framed: true, speaker: 'ソラモ', text: 'どこに行こう？\n気になる場所をタップしてみよう！', portraitUrl: assetUrl(SORAMO.id), portraitStyle: portraitCrop() })),
      item(13, '会話ウィンドウ（立ち絵なし：名札だけ。空の枠は出さない）',
        talk({ speaker: 'アルトの母', text: 'あら、お金が心細いのね。\n少しだけど、これを持っていきなさい。' })),
      item(14, '確認ダイアログ（重要：金）',
        confirmDialog({ title: '購入の確認', message: 'ソラモを 500G で購入しますか？' }),
        h('div', { class: 'gx-row gx-row--center' }, button('画面に重ねて開く', { size: 'sm', onClick: () => openDemo('confirm') }))),
      item(15, '案内ダイアログ（明るい紙）',
        noticeDialog({ message: cfg.messages.ranchFull }),
        h('div', { class: 'gx-row gx-row--center' }, button('画面に重ねて開く', { size: 'sm', onClick: () => openDemo('notice') })))),

    section('金貨・数値',
      item(16, '金貨アイコン（刻印は固有の紋章へ差し替えられる）',
        h('div', { class: 'gx-row gx-row--center gx-coins' }, coin('gx-coin-lg'), coin('gx-coin-md'), coin())),
      item(17, '金貨＋所持G（桁が変わっても崩れない）',
        h('div', { class: 'gx-stack' }, [500, 1000, 9999, 99999].map((v) => goldDisplay(v)))),
      item(18, '数値表示（現在値が主役、最大値は小さく）',
        panel({ variant: 'soft' }, h('div', { class: 'gx-row gx-row--center gx-row--baseline' }, numberDisplay(120, { max: 999 }), delta(12), delta(-5))))),

    section('能力',
      item(19, 'パラメーター表示6種（能力名の文字＋能力色の細い線。アイコンは使わない）',
        h('div', { class: 'gx-grid3' }, paramKeys().map((k) => paramBadge(k)))),
      item(20, 'パラメーターゲージ6種（0〜999。能力名は焦げ茶、太く艶やかな能力色で塗る）',
        panel({ variant: 'soft' },
          h('div', { class: 'mm-abilities' }, paramKeys().map((k) => (units[k] = abilityUnit(k, values[k]))))),
        h('div', { class: 'gx-row gx-row--center' },
          button('能力を上げてみる', { size: 'sm', onClick: () => {
            paramKeys().forEach((k) => { values[k] = Math.min(999, values[k] + 60 + Math.round(Math.random() * 90)); units[k].setValue(values[k]); });
            chart.update(values);
          } }),
          button('元に戻す', { size: 'sm', onClick: () => {
            Object.assign(values, START_VALUES);
            paramKeys().forEach((k) => units[k].setValue(values[k]));
            chart.update(values);
          } }))),
      item(21, '能力値ゲージ／能力分析図（パラメーターゲージと同じ実際の能力値から描画。上のボタンで値を変えると、この図もあわせて更新される）',
        panel({ variant: 'soft', className: 'mm-chart-frame' }, h('div', { class: 'gx-radar' }, (chart = abilityDial(values)))))),

    section('ロック・未発見',
      item(22, 'ロック表示（金の南京錠。条件未達成であることを示す）',
        h('div', { class: 'gx-row gx-row--center' }, lockBadge(), lockBadge({ small: true }), lockedPlate())),
      item(23, '未発見（まだ記録されていない生物：淡い図鑑紋様とやわらかな霧。正式デザインが無い時は姿を作らない）',
        h('div', { class: 'gx-row gx-row--center' },
          h('div', { class: 'gx-sealed-plate' }, sealed([unknownText()])))),
      item('22・23', 'ロックと未発見の見分け（同じ枠でも色調と中身が異なる）',
        h('div', { class: 'gx-row gx-row--center' },
          monsterSlot({ state: 'locked' }),
          monsterSlot({ state: 'unknown' })))),

    section('リスト',
      item(24, 'スクロール可能リストの1行（通常／選択中／押下／画像なし）',
        panel({ variant: 'paper' },
          h('div', { class: 'mm-list scroll-area' },
            listRow({ slot: slotArt(SORAMO), title: 'ソラ', sub: 'ソラモ／ランク －', end: numberDisplay(1, { size: 'sm' }) }),
            listRow({ slot: slotArt(GAURU), title: 'ガウ', sub: 'ガウル／ランク －', state: 'selected' }),
            listRow({ slot: slotArt(SORAMO), title: 'モコ', sub: 'ソラモ／ランク －', state: 'pressed' }),
            listRow({ title: 'ノビ', sub: '画像が無い時は「画像準備中」' }),
            listRow({ slot: slotArt(GAURU), title: 'ハヤテ', sub: 'ガウル／ランク －' }))))),

    section('モンスター選択',
      item(25, 'モンスター選択（モンスター画像が主役。名前は絵の下の余白に）',
        h('div', { class: 'gx-mslots' },
          monsterSlot({ name: 'ソラモ', art: art(SORAMO) }),
          monsterSlot({ name: 'ガウル', art: art(GAURU), state: 'selected', tag: 'ベース' }),
          monsterSlot({ state: 'locked' }),
          monsterSlot({ state: 'unknown' })))),

    section('ファーム',
      item(26, 'ファーム5コマンド（横長プレート。テキストが主役、アイコンは識別補助）',
        h('div', { class: 'gx-tiles' },
          commandTile('ボード', { iconId: 'icon.farm.board' }),
          commandTile('修行', { iconId: 'icon.farm.training' }),
          commandTile('ステータス', { iconId: 'icon.farm.status', state: 'selected' }),
          commandTile('技管理', { iconId: 'icon.farm.moves' }),
          commandTile('アイテム', { iconId: 'icon.farm.items' }))),
      item(26, 'コマンドの状態（通常／押下／選択中＝少し浮く・金の細線／無効）',
        h('div', { class: 'gx-tiles gx-tiles--row' },
          commandTile('修行', { iconId: 'icon.farm.training' }),
          commandTile('修行', { iconId: 'icon.farm.training', state: 'pressed' }),
          commandTile('修行', { iconId: 'icon.farm.training', state: 'selected' }),
          commandTile('修行', { iconId: 'icon.farm.training', state: 'disabled' })))),

    section('技',
      item(27, '技管理のセット用6枠（番号は小さな補助メダル）',
        panel({ variant: 'paper' },
          moveSlots([
            { name: 'ひっかき', cat: 'power' },
            { name: 'ウィンド', cat: 'wisdom' },
            { name: 'ドリルアタック', cat: 'power' },
            { name: 'ファイアボール', cat: 'wisdom' },
            null, null,
          ]))),
      item(28, '技カード（構成は維持。紙を白に近いアイボリーに）',
        h('div', { class: 'gx-stack' },
          moveCard({ name: 'ひっかき', cat: 'power', description: 'するどいツメでひっかく。', power: 70, accuracy: 80, critical: 5, art: art(GAURU, GAURU_MOVES.hikkaki) }),
          moveCard({ name: 'ウィンド', cat: 'wisdom', description: '風をまとい、相手に風の力をぶつける。', power: 60, accuracy: 90, critical: 5, art: art(GAURU, GAURU_MOVES.wind) }),
          moveCard({ name: '聖なる炎', cat: 'wisdom', power: 130, accuracy: 100, critical: 15, effect: '自分の全パラメーター（小）アップ　1ターン', art: art(GAURU, GAURU_MOVES.seinaru) }))),
      item(28, '技の分類（ちから＝赤〜オレンジ／かしこさ＝緑／補助＝かしこさ系）',
        h('div', { class: 'gx-row gx-row--center' },
          ['power', 'wisdom', 'support'].map((c) => h('span', { class: `mm-badge cat-${c}`, style: { marginLeft: 0 } }, categoryIcon(c), CATEGORY_LABEL[c]))))),

    section('アイテム',
      item(29, '所持アイテムのリスト行（アイボリーの紙。名前・説明は見本）',
        panel({ variant: 'paper' },
          h('div', { class: 'mm-list' },
            itemRow({ name: 'げんきの実', count: 3, description: '育成中のモンスターのライフが少し上がる。' }),
            itemRow({ name: 'ちからの種', count: 12, description: '育成中のモンスターのちからが少し上がる。' })))),
      item(30, 'アイテム図鑑（入手済み＝明るい紙／未発見＝一段沈んだ紙と封印の紋）',
        panel({ variant: 'paper' },
          h('div', { class: 'mm-dex-grid' },
            dexCell({ no: 1, name: 'げんきの実' }),
            dexCell({ no: 2, name: 'ちからの種' }),
            dexCell({ no: 3, unknown: true }),
            dexCell({ no: 4, unknown: true }))))),

    h('p', { class: 'gx-foot mm-t-outline-thin' }, 'ここまでが共通UI部品です。'),
  );

  const scroller = h('div', { class: 'gx-scroll scroll-area' }, content);
  ctx.ui.append(header, scroller);

  function openDemo(kind) {
    let m;
    const close = () => m.close();
    m = openModal(kind === 'confirm'
      ? confirmDialog({ title: '購入の確認', message: 'ソラモを 500G で購入しますか？', onYes: close, onNo: close })
      : noticeDialog({ message: cfg.messages.ranchFull, onOk: close }));
  }
}

const paramDefLabel = (k) => paramDef(k).label;

// 行のアイコン枠に入れるモンスターの顔
function slotArt(m) {
  const frame = { w: 10.4, h: 10.4 };
  const face = m === SORAMO ? { x: 560, y: 80, w: 460, h: 460 } : { x: 520, y: 60, w: 300, h: 300 };
  return h('div', { style: { width: '100%', height: '100%', backgroundRepeat: 'no-repeat', ...cropStyleFor(m, face, frame) } });
}
function portraitCrop() {
  return cropStyleFor(SORAMO, { x: 470, y: 30, w: 640, h: 640 }, { w: 26, h: 26 });
}
function cropStyleFor(m, box, frame) {
  const url = assetUrl(m.id);
  const scale = Math.max(frame.w / box.w, frame.h / box.h);
  return {
    backgroundImage: url ? `url("${url}")` : 'none',
    backgroundSize: `${m.img.w * scale}rem ${m.img.h * scale}rem`,
    backgroundPosition: `${-box.x * scale + (frame.w - box.w * scale) / 2}rem ${-box.y * scale + (frame.h - box.h * scale) / 2}rem`,
  };
}
