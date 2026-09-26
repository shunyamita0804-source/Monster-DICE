// =========================================================
// 開発用：基盤チェック画面
//  ゲームの画面ではありません（本番では使わない）。
//  レイアウト・Safe Area・状態遷移・牧場満杯チェック・セーブ・素材台帳を確認するための道具です。
// =========================================================
import { place, placeOnBg, getMetrics } from '../core/layout.js';
import { on } from '../core/bus.js';
import { getConfig } from '../core/config.js';
import { getState, setState, transact, createNewGame } from '../core/state.js';
import { canEnter, checkMode } from '../core/router.js';
import { entries, statusLabel, report, preload, referenceUrl } from '../core/assets.js';
import { listSlots, saveManual, load, deleteSlot, storageInfo } from '../core/save.js';
import { formatPlayTime } from '../core/playtime.js';
import { resolvePath } from '../core/data.js';
import { createIndividual } from '../systems/individual.js';
import { canStartRaising, startRaising, finishRaising, enterTown, enterMarket } from '../systems/flows.js';

// ---------- 小さな道具 ----------
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v != null) el.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c != null) el.append(c);
  return el;
}
const fmt = (n) => (Math.round(n * 10) / 10).toString();
const time = () => new Date().toLocaleTimeString('ja-JP', { hour12: false });

let dummyCount = 0;
function dummy(nickname, origin = 'market') {
  dummyCount += 1;
  return createIndividual(getConfig(), {
    speciesId: 'dev_dummy',
    nickname: nickname ?? `テスト${dummyCount}`,
    stats: { life: 100, power: 100, wisdom: 100, hit: 100, evasion: 100, toughness: 100 },
    origin,
  });
}

// 完成図（街）の建物ピンの位置。941×1672 の画像座標 → 基準座標
const TOWN_REF_SCALE = 1080 / 941;
const TOWN_PINS = [
  { label: '市場', x: 215, y: 505 },
  { label: '牧場', x: 580, y: 482 },
  { label: '博物館', x: 606, y: 838 },
  { label: '闘技場', x: 262, y: 955 },
].map((p) => ({ ...p, x: p.x * TOWN_REF_SCALE, y: p.y * TOWN_REF_SCALE }));

// ---------- 画面 ----------
export function register(registerScreen) {
  registerScreen({ id: 'dev.foundation', mode: 'ANY', mount });
  // モード判定の確認用（中身は無い）
  registerScreen({ id: 'dev.town-probe', mode: 'TOWN', mount: () => {} });
  registerScreen({ id: 'dev.farm-probe', mode: 'RAISING', mount: () => {} });
}

function ensureCss() {
  if (document.getElementById('dev-css')) return;
  document.head.append(h('link', { id: 'dev-css', rel: 'stylesheet', href: resolvePath('css/dev.css') }));
}

function mount(ctx) {
  ensureCss();
  const offs = [];
  const logBox = h('div', { class: 'dev-log' });
  const log = (msg, kind = '') => {
    logBox.prepend(h('div', { class: `dev-log-line ${kind}` }, `${time()}  ${msg}`));
  };

  // ===== 背景層：格子・描き足し帯・基準枠・タップ位置 =====
  const bgLayer = h('div', { class: 'dev-bg-grid' });
  const bleedTop = placeOnBg(h('div', { class: 'dev-bleed' }, '描き足し（切れてよい）'), { x: 0, y: -210, w: 1080, h: 210, centered: false });
  const bleedBottom = placeOnBg(h('div', { class: 'dev-bleed' }, '描き足し（切れてよい）'), { x: 0, y: 1920, w: 1080, h: 210, centered: false });
  const coreOnBg = placeOnBg(h('div', { class: 'dev-core-bg' }), { x: 0, y: 0, w: 1080, h: 1920, centered: false });
  const pinLayer = h('div');
  ctx.bg.append(bgLayer, bleedTop, bleedBottom, coreOnBg, pinLayer);

  function setBgTest(mode) {
    pinLayer.replaceChildren();
    const refUrl = referenceUrl('ref.town');
    if (mode === 'town' && refUrl) {
      // 完成図（9:16）を背景の基準枠部分に敷き、建物のピン位置にタップ領域を置く
      ctx.bg.style.background = `#0d0905 url("${refUrl}") center / 100% ${(1920 / 2340) * 100}% no-repeat`;
      bgLayer.hidden = true;
      for (const p of TOWN_PINS) {
        pinLayer.append(placeOnBg(h('div', { class: 'dev-pin' }, p.label), { x: p.x, y: p.y, w: 150, h: 150 }));
      }
    } else {
      ctx.bg.style.background = '';
      bgLayer.hidden = false;
      pinLayer.append(placeOnBg(h('div', { class: 'dev-pin' }, '背景上の点'), { x: 540, y: 960, w: 150, h: 150 }));
    }
  }
  setBgTest('grid');

  // ===== UI層：揃え方の見本 =====
  const core = h('div', { class: 'core-box dev-core-ui' }, h('span', {}, '基準枠 1080×1920'));
  const topSample = place(h('div', { class: 'dev-anchor top' }, '上揃え：日付・所持金バーの位置'), { anchor: 'top', left: 40, top: 16, w: 1000, h: 120 });
  const rightSample = place(h('div', { class: 'dev-anchor right' }, '右揃え：街の右コマンド'), { anchor: 'core', right: 14, top: 300, w: 250, h: 1080 });
  const bottomSample = place(h('div', { class: 'dev-anchor bottom' }, '下揃え：ファーム5コマンドの位置'), { anchor: 'bottom', left: 40, bottom: 16, w: 1000, h: 200 });
  const tapSample = place(h('button', { class: 'dev-tap tap', onclick: () => log('小さいボタンが押せました（タップ範囲44pt）', 'ok') }, '小'), { anchor: 'core', left: 80, top: 1500, w: 70, h: 70 });
  ctx.ui.append(core, topSample, rightSample, bottomSample, tapSample);

  // ===== 重ね表示層：Safe Area の帯・基準画像・開発パネル =====
  const safeBands = ['top', 'right', 'bottom', 'left'].map((side) => h('div', { class: `dev-safe dev-safe-${side}` }));
  const refImg = h('img', { class: 'dev-ref', alt: '', hidden: '' });
  const panel = buildPanel();
  ctx.overlay.append(...safeBands, refImg, panel.root);

  function drawSafe(m) {
    const [t, r, b, l] = safeBands;
    Object.assign(t.style, { left: '0', top: '0', width: '100%', height: `${m.safe.top}px` });
    Object.assign(b.style, { left: '0', bottom: '0', width: '100%', height: `${m.safe.bottom}px` });
    Object.assign(l.style, { left: '0', top: '0', height: '100%', width: `${m.safe.left}px` });
    Object.assign(r.style, { right: '0', top: '0', height: '100%', width: `${m.safe.right}px` });
    // パネルは安全領域の内側に置く
    panel.root.style.left = `${m.safe.left + 8}px`;
    panel.root.style.right = `${m.safe.right + 8}px`;
    panel.root.style.bottom = `${m.safe.bottom + 8}px`;
    panel.root.style.maxHeight = `${Math.max(160, (m.vh - m.safe.top - m.safe.bottom) * 0.58)}px`;
    positionRef();
  }

  // ===== パネル =====
  function buildPanel() {
    const tabs = [
      { id: 'layout', label: 'レイアウト', render: renderLayout },
      { id: 'state', label: '状態', render: renderState },
      { id: 'save', label: 'セーブ', render: renderSave },
      { id: 'assets', label: '素材台帳', render: renderAssets },
      { id: 'ref', label: '基準画像', render: renderRef },
    ];
    let active = 'layout';
    const body = h('div', { class: 'dev-body' });
    const tabBar = h('div', { class: 'dev-tabs' });
    const root = h('section', { class: 'dev-panel' });
    const toggle = h('button', { class: 'dev-toggle', onclick: () => root.classList.toggle('collapsed') }, '基盤チェック（開発用）');
    function select(id) {
      active = id;
      tabBar.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.id === id));
      body.replaceChildren();
      tabs.find((t) => t.id === id).render(body);
    }
    for (const t of tabs) tabBar.append(h('button', { 'data-id': t.id, onclick: () => select(t.id) }, t.label));
    root.append(toggle, tabBar, body, logBox);
    select(active);
    return { root, refresh: () => select(active), active: () => active };
  }

  // ----- レイアウト -----
  function renderLayout(body) {
    const m = getMetrics();
    const rows = [
      ['画面', `${fmt(m.vw)} × ${fmt(m.vh)} pt（縦横比 ${fmt(m.aspect * 9)}:9）`],
      ['Safe Area', `上${fmt(m.safe.top)} 右${fmt(m.safe.right)} 下${fmt(m.safe.bottom)} 左${fmt(m.safe.left)}`],
      ['UI倍率', `${m.scale.toFixed(4)}（基準100px → ${fmt(m.toPt(100))}pt）`],
      ['背景倍率', m.bgScale.toFixed(4)],
      ['UI枠', `${fmt(m.frame.w)} × ${fmt(m.frame.h)} pt`],
      ['基準より余った高さ', `${fmt(m.extraHeight)} pt（上揃えと下揃えの間に広がる）`],
      ['左右の補完表示', m.sideFill ? 'あり（横に広い画面）' : 'なし'],
      ['縦向き案内', m.rotateBlocked ? '表示中' : '非表示'],
    ];
    body.append(
      table(rows),
      h('div', { class: 'dev-row' },
        h('button', { onclick: () => setBgTest('grid') }, '背景：格子'),
        h('button', { onclick: () => setBgTest('town') }, '背景：街の完成図＋ピン'),
        h('button', { onclick: () => ctx.go('dev.gallery') }, 'UI部品集を開く')),
      h('p', { class: 'dev-note' }, '端末を切り替えても、ピンの円が建物のピンからずれないこと。赤い帯が Safe Area、黄の点線が基準枠です。'),
    );
  }

  // ----- 状態 -----
  function renderState(body) {
    const s = getState();
    const cfg = getConfig();
    const rows = [
      ['モード', s.mode === 'RAISING' ? 'RAISING（ファーム）' : 'TOWN（街）'],
      ['プレイヤー', s.player.name],
      ['所持金', `${s.player.gold} G`],
      ['育成中', s.active ? `${s.active.nickname}（${s.active.origin}）` : 'なし'],
      ['牧場', `${s.ranch.length} / ${cfg.rules.ranchMax} 体`],
      ['育成成功数', `${s.records.raisedCount}`],
      ['ノビトン解放', s.flags['market.nobiton'] ? '解放済み' : '未解放'],
      ['プレイ時間', formatPlayTime(s.playTimeSec)],
    ];
    const act = (label, fn, cls = '') => h('button', { class: cls, onclick: async () => {
      try { await fn(); } catch (err) { log(`${label}：${err.message}`, 'ng'); }
      panel.refresh();
    } }, label);
    const report = (label, r) => {
      if (r.ok) log(`${label}：OK${r.events?.length ? ` → ${r.events.map((e) => e.type).join(', ')}` : ''}${r.provisional ? '（仮処理）' : ''}`, 'ok');
      else log(`${label}：止まりました → ${r.message.replace('\n', ' ')}`, 'ng');
    };
    const devEdit = (label, fn) => act(label, () => {
      const r = transact((d) => { fn(d); return { ok: true }; }, 'dev');
      report(label, r);
    }, 'sub');

    body.append(
      table(rows),
      h('h4', {}, '育成を始める（判定 → 確定）'),
      h('div', { class: 'dev-row' },
        act('市場で購入（500G）', async () => {
          const opts = { source: 'market', goldCost: 500 };
          const chk = canStartRaising(opts);
          if (!chk.ok) return report('市場で購入', chk);
          report('市場で購入', await startRaising({ ...opts, individual: dummy('ソラ') }));
        }),
        act('合体（牧場の先頭2体）', async () => {
          const uids = getState().ranch.slice(0, 2).map((m) => m.uid);
          const opts = { source: 'fusion', consumeParentUids: uids };
          const chk = canStartRaising(opts);
          if (!chk.ok) return report('合体', chk);
          report('合体', await startRaising({ ...opts, individual: dummy('ガウ', 'fusion') }));
        }),
        act('特殊復元', async () => {
          const opts = { source: 'restoration' };
          const chk = canStartRaising(opts);
          if (!chk.ok) return report('特殊復元', chk);
          report('特殊復元', await startRaising({ ...opts, individual: dummy('フク', 'restoration') }));
        })),
      h('h4', {}, '育成を終える'),
      h('div', { class: 'dev-row' },
        act('育成成功', async () => report('育成成功', await finishRaising('success'))),
        act('育成失敗（仮）', async () => report('育成失敗', await finishRaising('fail')))),
      h('h4', {}, '画面に入った時の判定'),
      h('div', { class: 'dev-row' },
        act('街に入る', async () => {
          const mode = checkMode('TOWN');
          if (!mode.ok) return report('街に入る', mode);
          report('街に入る', await enterTown({ fromFacility: true }));
        }),
        act('市場に入る', async () => {
          const mode = checkMode('TOWN');
          if (!mode.ok) return report('市場に入る', mode);
          report('市場に入る', await enterMarket());
        }),
        act('街の画面へ移動を試す', () => report('街の画面へ移動', canEnter('dev.town-probe'))),
        act('ファーム画面へ移動を試す', () => report('ファーム画面へ移動', canEnter('dev.farm-probe')))),
      h('h4', {}, 'テスト用の値の変更'),
      h('div', { class: 'dev-row' },
        devEdit('所持金 120G', (d) => { d.player.gold = 120; }),
        devEdit('所持金 499G', (d) => { d.player.gold = 499; }),
        devEdit('所持金 500G', (d) => { d.player.gold = 500; }),
        devEdit('牧場 +1体', (d) => { if (d.ranch.length < cfg.rules.ranchMax) d.ranch.push(dummy()); }),
        devEdit('牧場を20体に', (d) => { while (d.ranch.length < cfg.rules.ranchMax) d.ranch.push(dummy()); }),
        devEdit('牧場を空に', (d) => { d.ranch = []; }),
        devEdit('育成成功数 +1', (d) => { d.records.raisedCount += 1; }),
        act('新規ゲーム', () => { setState(createNewGame(cfg), 'dev'); log('新規ゲームにしました', 'ok'); }, 'sub')),
    );
  }

  // ----- セーブ -----
  async function renderSave(body) {
    const info = storageInfo();
    body.append(h('p', { class: info.persistent ? 'dev-note' : 'dev-note ng' },
      info.persistent ? '保存先：端末内（localStorage）' : '保存先：メモリのみ（このブラウザでは保存できません。ページを閉じると消えます）'));
    const list = h('div', { class: 'dev-slots' }, '読み込み中…');
    body.append(list);
    const slots = await listSlots();
    list.replaceChildren();
    for (const slot of slots) {
      const s = slot.summary;
      const desc = slot.error ? `読み込めません：${slot.error}`
        : slot.empty ? '空き'
        : `${s.playerName}／${s.place}${s.activeName ? `（${s.activeName}）` : ''}／${s.calendar.year}年${s.calendar.month}月第${s.calendar.week}週／${s.gold}G／${formatPlayTime(s.playTimeSec)}`;
      const buttons = [];
      if (slot.slotId !== 'auto') {
        buttons.push(h('button', { onclick: async () => {
          await saveManual(slot.slotId, getState());
          log(`${slot.label} に保存しました`, 'ok');
          panel.refresh();
        } }, '保存'));
      }
      if (!slot.empty && !slot.error) {
        buttons.push(h('button', { onclick: async () => {
          try {
            const res = await load(slot.slotId);
            setState(res.state, 'load');
            log(`${slot.label} をロード → 再開場所：${res.resumeAt === 'farm' ? 'ファーム' : '街'}`, 'ok');
            if (res.resumeAt === 'town') log(`街に入る判定 → ${(await enterTown()).events.map((e) => e.type).join(', ') || '救済なし'}`, 'ok');
          } catch (err) { log(`ロードできません：${err.message}`, 'ng'); }
          panel.refresh();
        } }, 'ロード'));
        buttons.push(h('button', { class: 'sub', onclick: async () => {
          await deleteSlot(slot.slotId);
          log(`${slot.label} を削除しました`);
          panel.refresh();
        } }, '削除'));
      }
      list.append(h('div', { class: 'dev-slot' }, h('b', {}, slot.label), h('span', {}, desc), h('div', { class: 'dev-row' }, buttons)));
    }
  }

  // ----- 素材台帳 -----
  function renderAssets(body) {
    const r = report();
    body.append(
      h('p', { class: 'dev-note' }, ['official', 'provisional', 'missing', 'reference'].map((k) => `${statusLabel(k)} ${r.counts[k] ?? 0}`).join('　')),
      h('div', { class: 'dev-row' }, h('button', { onclick: async () => {
        const ids = entries().filter((e) => e.status !== 'missing').map((e) => e.id);
        const res = await preload(ids);
        const ng = res.filter((x) => !x.ok);
        log(ng.length ? `ファイルが見つからない素材：${ng.map((x) => x.id).join(', ')}` : `画像ファイル ${res.length} 件をすべて確認しました`, ng.length ? 'ng' : 'ok');
      } }, 'ファイルの存在を確認')),
    );
    for (const status of ['official', 'provisional', 'reference', 'missing']) {
      const list = entries().filter((e) => e.status === status);
      if (!list.length) continue;
      body.append(h('h4', {}, `${statusLabel(status)}（${list.length}）`));
      body.append(h('ul', { class: 'dev-assets' }, list.map((e) => h('li', {},
        h('b', {}, e.usage), h('small', {}, `${e.id}${e.note ? `　${e.note}` : ''}`)))));
    }
  }

  // ----- 基準画像 -----
  let refState = { id: '', fit: 'core', opacity: 0.5 };
  function positionRef() {
    const m = getMetrics();
    if (!refState.id) { refImg.hidden = true; return; }
    refImg.hidden = false;
    refImg.style.opacity = refState.opacity;
    if (refState.fit === 'core') {
      // 完成図（9:16）→ UIの基準枠に合わせる
      Object.assign(refImg.style, {
        left: `${m.frame.x}px`, top: `${m.frame.y + m.coreTop}px`,
        width: `${m.frame.w}px`, height: `${1920 * m.scale}px`, objectFit: 'fill',
      });
    } else {
      // スクリーンショット → 画面全体
      Object.assign(refImg.style, { left: '0', top: '0', width: '100%', height: '100%', objectFit: 'cover' });
    }
  }
  function renderRef(body) {
    const refs = entries().filter((e) => e.status === 'reference');
    const select = h('select', { onchange: (e) => {
      refState.id = e.target.value;
      const entry = refs.find((r) => r.id === refState.id);
      refState.fit = entry && /screenshot/.test(entry.path) ? 'screen' : 'core';
      refImg.src = refState.id ? referenceUrl(refState.id) : '';
      positionRef();
      panel.refresh();
    } }, h('option', { value: '' }, '重ねない'), refs.map((r) => {
      const o = h('option', { value: r.id }, r.usage);
      if (r.id === refState.id) o.selected = true;
      return o;
    }));
    const range = h('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(refState.opacity), oninput: (e) => {
      refState.opacity = Number(e.target.value);
      positionRef();
    } });
    body.append(
      h('div', { class: 'dev-row' }, select),
      h('label', { class: 'dev-row' }, '濃さ', range),
      h('div', { class: 'dev-row' },
        h('button', { class: refState.fit === 'core' ? 'on' : '', onclick: () => { refState.fit = 'core'; positionRef(); panel.refresh(); } }, '基準枠に合わせる'),
        h('button', { class: refState.fit === 'screen' ? 'on' : '', onclick: () => { refState.fit = 'screen'; positionRef(); panel.refresh(); } }, '画面全体に合わせる')),
      h('p', { class: 'dev-note' }, '街・市場の完成図は「基準枠に合わせる」、スマホのスクリーンショットは「画面全体に合わせる」で重ねます。'),
    );
  }

  function table(rows) {
    return h('table', { class: 'dev-table' }, rows.map(([k, v]) => h('tr', {}, h('th', {}, k), h('td', {}, v))));
  }

  // ===== 更新 =====
  offs.push(on('layout:change', (m) => { drawSafe(m); if (panel.active() === 'layout') panel.refresh(); }));
  offs.push(on('state:change', () => { if (panel.active() === 'state') panel.refresh(); }));
  offs.push(on('save:auto', (e) => log(e.ok ? 'オートセーブしました' : `オートセーブ失敗：${e.error}`, e.ok ? 'ok' : 'ng')));
  offs.push(on('router:blocked', (e) => log(`画面移動を止めました：${e.message}`, 'ng')));
  drawSafe(getMetrics());
  log('基盤チェックを開きました');

  return () => offs.forEach((off) => off());
}
