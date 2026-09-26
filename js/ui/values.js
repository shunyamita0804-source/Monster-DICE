// 金貨・所持G／数値／能力紋章／能力ユニット／能力計器／能力盤
import { h, fmtNumber } from './dom.js';
import { icon } from './icons.js';
import { paramDef, getTheme } from '../core/theme.js';

export const coin = (className = '') => icon('icon.gold', className);

export function goldDisplay(value) {
  return h('div', { class: 'mm-gold' },
    coin(),
    h('span', { class: 'mm-gold__value mm-t-num' }, fmtNumber(value), h('span', { class: 'mm-gold__unit' }, 'G')));
}

/** 金貨＋価格（名札の2段目など） */
export function price(value) {
  return h('span', { class: 'mm-price', style: { display: 'inline-flex', alignItems: 'center', gap: '0.8rem', fontSize: '3.4rem', fontWeight: 800, color: 'var(--ink)' } },
    coin('mm-price__coin'), `${fmtNumber(value)} G`);
}

/** 数値：現在値が主役、最大値は小さく薄く */
export function numberDisplay(value, { max = null, size = '' } = {}) {
  return h('span', { class: `mm-num${size ? ` mm-num--${size}` : ''}` },
    h('span', { class: 'mm-num__value mm-t-num' }, fmtNumber(value)),
    max != null ? h('span', { class: 'mm-num__max' }, `/ ${fmtNumber(max)}`) : null);
}

export function delta(n) {
  const up = n >= 0;
  return h('span', { class: `mm-delta mm-delta--${up ? 'up' : 'down'}` }, `${up ? '+' : '−'}${Math.abs(n)}`);
}

/** 能力名：文字＋能力色の短い縦線（アイコンは使わない） */
export function paramBadge(key) {
  return h('span', { class: `mm-param p-${key}` }, paramDef(key).label);
}

// ---------- 能力計器 ----------
/**
 * 能力計器（ゲージ）。戻り値の要素に setValue(v) がある。
 * 値が増えた時は、塗りが伸びると同時に光が走る（.is-rising）。
 */
export function meter(key, value, { max = 999 } = {}) {
  const fill = h('div', { class: 'mm-meter__fill' });
  const shine = h('div', { class: 'mm-meter__shine' });
  const bar = h('div', { class: `mm-meter p-${key}` }, h('div', { class: 'mm-meter__well' }, fill, shine, h('div', { class: 'mm-meter__ticks' })));
  const wrap = h('div', { class: 'mm-meter-wrap' }, bar);
  let current = value;
  const apply = (v) => {
    const pct = `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
    fill.style.setProperty('--fill', pct);
    shine.style.setProperty('--fill', pct);
  };
  wrap.setValue = (v) => {
    const rising = v > current;
    current = v;
    apply(v);
    if (rising) {
      bar.classList.remove('is-rising');
      void bar.offsetWidth;                  // アニメーションをやり直す
      bar.classList.add('is-rising');
    }
  };
  apply(value);
  return wrap;
}

/**
 * 能力値：能力名（＋能力色の縦線）／現在値（大）／最大値（小）／ゲージ。
 * 戻り値の要素に setValue(v) がある。
 */
export function abilityUnit(key, value, { max = 999 } = {}) {
  const valueEl = h('span', { class: 'mm-ability__value' }, fmtNumber(value));
  const m = meter(key, value, { max });
  const unit = h('div', { class: `mm-ability p-${key}` },
    h('span', { class: 'mm-ability__name' }, paramDef(key).label),
    h('span', { class: 'mm-ability__num' }, valueEl, h('span', { class: 'mm-ability__max' }, `/ ${fmtNumber(max)}`)),
    m);
  unit.setValue = (v) => { valueEl.textContent = fmtNumber(v); m.setValue(v); };
  return unit;
}
/** 旧名（互換） */
export const gauge = abilityUnit;

// ---------- 能力分析図（レーダーチャート） ----------
/**
 * 能力値 → 図の上の位置（0〜1）への変換。200を超えた値の扱いは未確定なので、
 * ここに方式を足して abilityChart(values, { scale }) で切り替える。
 */
export const DIAL_SCALES = {
  /** 現行：外側の線＝outer。超えた分は外側の線で止める */
  clamp: (outer = 200) => (v) => Math.max(0, Math.min(v, outer)) / outer,
};

const SVGNS = 'http://www.w3.org/2000/svg';
function s(tag, attrs = {}, ...children) {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  for (const c of children.flat()) if (c != null) el.append(c);
  return el;
}

/**
 * 紙の上に整理された能力分析図。細い格子と軸、半透明の能力の形、
 * 6方向に「能力名／値」と能力色の短い線。
 * 並び：ライフ→ちから→かしこさ→命中→回避→丈夫さ（時計回り）
 */
export function abilityChart(values, { outer = 200, scale = DIAL_SCALES.clamp(outer) } = {}) {
  const keys = getTheme().params.map((p) => p.key);
  const CX = 500, CY = 430, R = 260;
  const pt = (i, r) => { const a = (-90 + i * 60) * Math.PI / 180; return [CX + r * Math.cos(a), CY + r * Math.sin(a)]; };
  const hex = (r) => keys.map((_, i) => pt(i, r).join(',')).join(' ');
  const computePts = (vals) => keys.map((k, i) => pt(i, R * scale(vals[k] ?? 0)).join(',')).join(' ');
  const pts = computePts(values);
  const RIM = '#93a6c9';     // 外周：上品な青灰色
  const GRID = '#8a7a63';   // 内部の補助線：淡い焦げ茶
  const uid = `ac${Math.random().toString(36).slice(2, 8)}`;

  // 実際の能力値で再描画するための要素参照（見た目・色・レイアウトはそのまま。points と数値だけを差し替える）
  const clipPoly = s('polygon', { points: pts });
  const edgePoly = s('polygon', { points: pts, fill: 'none', stroke: '#0e2358', 'stroke-opacity': .3, 'stroke-width': 6, 'stroke-linejoin': 'round' });
  const fillPoly = s('polygon', { points: pts, fill: `url(#${uid}fill)`, stroke: `url(#${uid}stroke)`, 'stroke-width': 3.2, 'stroke-linejoin': 'round', filter: `url(#${uid}glow)` });
  const highlightPoly = s('polygon', { points: pts, fill: 'none', stroke: '#eef5ff', 'stroke-opacity': .45, 'stroke-width': 1, 'stroke-linejoin': 'round' });
  const valueTexts = keys.map((k, i) => {
    const [x, y] = pt(i, R + 92);
    return s('text', { x, y: y + 32, 'text-anchor': 'middle', 'font-size': 44, 'font-weight': 800, fill: '#2f2013' }, String(values[k] ?? 0));
  });

  const svg = s('svg', { class: 'mm-chart', viewBox: '0 0 1000 880', role: 'img', 'aria-label': '能力のバランス' },
    s('defs', {},
      // サファイアのような深い青。中心〜上部でわずかに明るくなる、面全体の自然な濃淡（丸い光ではない）
      s('linearGradient', { id: `${uid}fill`, x1: .2, y1: 0, x2: .75, y2: 1 },
        s('stop', { offset: 0, 'stop-color': '#6fa3ee', 'stop-opacity': .62 }),
        s('stop', { offset: .38, 'stop-color': '#3f74d6', 'stop-opacity': .68 }),
        s('stop', { offset: .72, 'stop-color': '#1f4bab', 'stop-opacity': .74 }),
        s('stop', { offset: 1, 'stop-color': '#102c72', 'stop-opacity': .72 })),
      // 上部にだけ落ちる、ごく薄いガラスの光沢帯（面全体にかけた自然な艶）
      s('linearGradient', { id: `${uid}sheen`, x1: 0, y1: 0, x2: 0, y2: 1 },
        s('stop', { offset: 0, 'stop-color': '#ffffff', 'stop-opacity': .38 }),
        s('stop', { offset: .28, 'stop-color': '#ffffff', 'stop-opacity': .08 }),
        s('stop', { offset: .5, 'stop-color': '#ffffff', 'stop-opacity': 0 })),
      s('clipPath', { id: `${uid}clip` }, clipPoly),
      // 外周の縁：青灰色〜濃紺のグラデーション
      s('linearGradient', { id: `${uid}stroke`, x1: 0, y1: 0, x2: 0, y2: 1 },
        s('stop', { offset: 0, 'stop-color': '#a8bde2' }),
        s('stop', { offset: .5, 'stop-color': '#3a5fa8' }),
        s('stop', { offset: 1, 'stop-color': '#132858' })),
      s('filter', { id: `${uid}glow`, x: '-30%', y: '-30%', width: '160%', height: '160%' },
        s('feGaussianBlur', { stdDeviation: 4, result: 'b' }),
        s('feMerge', {}, s('feMergeNode', { in: 'b' }), s('feMergeNode', { in: 'SourceGraphic' }))),
      s('filter', { id: `${uid}shadow`, x: '-20%', y: '-20%', width: '140%', height: '140%' },
        s('feDropShadow', { dx: 0, dy: 3, stdDeviation: 5, 'flood-color': '#3b2c1f', 'flood-opacity': .18 }))),
    s('g', { filter: `url(#${uid}shadow)` },
      // 外周（少し存在感のある二重線で、金属的な上品さを出す）
      s('polygon', { points: hex(R), fill: 'rgba(255, 253, 247, .55)', stroke: RIM, 'stroke-opacity': .75, 'stroke-width': 3 }),
      s('polygon', { points: hex(R * .985), fill: 'none', stroke: '#ffffff', 'stroke-opacity': .5, 'stroke-width': 1 }),
      // 内部の補助線（細く淡く）
      [0.25, 0.5, 0.75].map((f) => s('polygon', { points: hex(R * f), fill: 'none', stroke: GRID, 'stroke-opacity': .11, 'stroke-width': 1.1 })),
      keys.map((_, i) => s('line', { x1: CX, y1: CY, x2: pt(i, R)[0], y2: pt(i, R)[1], stroke: GRID, 'stroke-opacity': .13, 'stroke-width': 1.1 })),
      // 深く上質なサファイアブルーの能力の形（透明なガラスを紙の上に重ねた質感）
      edgePoly,
      fillPoly,
      // 面全体にかかる、上部が淡く光るガラスの光沢（クリップして形なりに）
      s('rect', { x: CX - R, y: CY - R, width: R * 2, height: R * 2, fill: `url(#${uid}sheen)`, 'clip-path': `url(#${uid}clip)` }),
      // エッジ付近の繊細な反射
      highlightPoly),
    keys.map((k, i) => {
      const [x, y] = pt(i, R + 92);
      const def = paramDef(k);
      return s('g', {},
        s('text', { x, y: y - 14, 'text-anchor': 'middle', 'font-size': 32, 'font-weight': 600, fill: '#6b5a46' }, def.label),
        valueTexts[i]);
    }),
    s('text', { x: CX, y: 866, 'text-anchor': 'middle', 'font-size': 26, fill: '#8d7a66' }, `外側の線 = ${outer}`));

  // 実際の能力値が変わった時に、形状と数値を更新する（デザイン・配色・配置は変えない）
  svg.update = (newValues) => {
    const newPts = computePts(newValues);
    clipPoly.setAttribute('points', newPts);
    edgePoly.setAttribute('points', newPts);
    fillPoly.setAttribute('points', newPts);
    highlightPoly.setAttribute('points', newPts);
    keys.forEach((k, i) => { valueTexts[i].textContent = String(newValues[k] ?? 0); });
  };
  return svg;
}
/** 旧名（互換） */
export const abilityDial = abilityChart;
export const radar = abilityChart;
