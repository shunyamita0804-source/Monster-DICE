// =========================================================
// レイアウト：基準座標1080×1920を端末に合わせて配置し直す
//
//  UI倍率 s   = min(安全領域の幅 / 1080, 安全領域の高さ / 1920)
//  UI枠       = 幅 1080*s、高さ = 安全領域の高さ（縦長端末では基準より高くなる）
//               上揃え・下揃えの要素は枠の上端・下端に付き、余った高さは間に広がる
//  基準枠     = UI枠の中央にある 1080×1920 の領域（--core-top）
//  背景倍率 sb = 背景（1080×2340）が画面の上下を必ず覆い、
//               基準枠の中心が UI の基準枠の中心と一致する最小の倍率
//  横に広い画面（iPad等）では背景の左右をぼかした同じ絵で埋める
// =========================================================
import { emit } from './bus.js';

let cfg = null;
let app = null;
let probe = null;
let metrics = null;
let raf = 0;

export function initLayout(config) {
  cfg = config;
  app = document.getElementById('app');
  probe = document.getElementById('safe-probe');

  // 確認用：パソコンのブラウザで Safe Area を疑似的に再現する
  //   例）?safe=59,0,34,0（上,右,下,左）… iPhone 16 相当
  const fake = new URLSearchParams(location.search).get('safe');
  if (fake) {
    const [t = 0, r = 0, b = 0, l = 0] = fake.split(',').map(Number);
    probe.style.padding = `${t}px ${r}px ${b}px ${l}px`;
  }

  const schedule = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(compute);
  };
  window.addEventListener('resize', schedule);
  window.addEventListener('orientationchange', () => setTimeout(schedule, 250));
  window.visualViewport?.addEventListener('resize', schedule);

  // iOS Safari のピンチ拡大を止める（user-scalable=no が効かないため）
  document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false });

  compute();
}

export function getMetrics() { return metrics; }

function readSafeArea() {
  const s = getComputedStyle(probe);
  const n = (v) => parseFloat(v) || 0;
  return { top: n(s.paddingTop), right: n(s.paddingRight), bottom: n(s.paddingBottom), left: n(s.paddingLeft) };
}

export function computeMetrics(vw, vh, safe, design = cfg.design, layout = cfg.layout) {
  const baseW = design.width;
  const baseH = design.height;
  const bgH = design.bgHeight;

  const usableW = Math.max(1, vw - safe.left - safe.right);
  const usableH = Math.max(1, vh - safe.top - safe.bottom);
  const s = Math.min(usableW / baseW, usableH / baseH);

  const frame = { w: baseW * s, h: usableH, x: safe.left + (usableW - baseW * s) / 2, y: safe.top };
  const coreTop = (frame.h - baseH * s) / 2;
  const cx = frame.x + frame.w / 2;
  const cy = frame.y + frame.h / 2;

  const half = bgH / 2;
  // 左右の小さなすき間（スマホ）は、背景を少し広げて埋める。
  //  ・広げてよいのは UI倍率の maxBgWidthStretch 倍まで（それ以上のすき間＝iPad等は、ぼかしで補完）
  //  ・背景の基準枠が上下で切れてよいのは、それぞれ基準枠の高さの coreCropTolerance まで
  const needW = vw / baseW;
  const nearest = Math.min(cy, vh - cy);
  const coreCap = nearest / ((baseH / 2) * (1 - 2 * layout.coreCropTolerance));
  const widthFill = needW <= s * layout.maxBgWidthStretch ? Math.min(needW, coreCap) : 0;
  const sb = Math.max(s, cy / half, (vh - cy) / half, widthFill);
  const bg = { w: baseW * sb, h: bgH * sb };
  bg.x = cx - bg.w / 2;
  bg.y = cy - bg.h / 2;

  const sideFill = bg.x > 0.5 || bg.x + bg.w < vw - 0.5;
  const landscape = vw > vh;

  return {
    vw, vh, safe, usableW, usableH,
    scale: s,
    bgScale: sb,
    frame,
    coreTop,
    extraHeight: usableH - baseH * s,   // 基準より縦に余った高さ（UIの上下の間に広がる）
    bg,
    bgBleed: (bgH - baseH) / 2,          // 背景の上下の描き足し（基準座標）
    sideFill,
    rotateBlocked: landscape && vh < layout.landscapeMaxHeight,
    aspect: vh / vw,
    // 見た目の寸法を基準座標で指定したとき、実寸で何ptになるか
    toPt: (n) => n * s,
  };
}

function compute() {
  const rect = app.getBoundingClientRect();
  metrics = computeMetrics(rect.width, rect.height, readSafeArea());

  const r = document.documentElement.style;
  r.setProperty('--u', `${metrics.scale}px`);
  r.setProperty('--bgu', `${metrics.bgScale}px`);
  r.setProperty('--frame-x', `${metrics.frame.x}px`);
  r.setProperty('--frame-y', `${metrics.frame.y}px`);
  r.setProperty('--frame-w', `${metrics.frame.w}px`);
  r.setProperty('--frame-h', `${metrics.frame.h}px`);
  r.setProperty('--core-top', `${metrics.coreTop}px`);
  r.setProperty('--bg-x', `${metrics.bg.x}px`);
  r.setProperty('--bg-y', `${metrics.bg.y}px`);

  app.classList.toggle('is-side-fill', metrics.sideFill);
  document.getElementById('rotate-notice').hidden = !metrics.rotateBlocked;

  emit('layout:change', metrics);
}

// ---------- 配置のための道具 ----------

// 基準座標の数値 → CSS の長さ
export const U = (n) => `calc(${n} * var(--u))`;
export const BGU = (n) => `calc(${n} * var(--bgu))`;

/**
 * UI層に要素を置く。数値はすべて基準座標（1080×1920）。
 * anchor:
 *   'top'    … UI枠の上端から（Dynamic Island の下）
 *   'bottom' … UI枠の下端から（ホームインジケータの上）
 *   'core'   … 基準枠（中央の1080×1920）の上端から。完成図と同じ位置関係を保つ
 */
export function place(el, { anchor = 'core', left, right, top, bottom, w, h } = {}) {
  const st = el.style;
  st.position = 'absolute';
  if (left != null) st.left = U(left);
  if (right != null) st.right = U(right);
  if (w != null) st.width = U(w);
  if (h != null) st.height = U(h);
  if (anchor === 'top') {
    st.top = U(top ?? 0);
  } else if (anchor === 'bottom') {
    st.bottom = U(bottom ?? 0);
  } else if (top != null) {
    st.top = `calc(var(--core-top) + ${top} * var(--u))`;
  } else if (bottom != null) {
    st.bottom = `calc(var(--core-top) + ${bottom} * var(--u))`;
  }
  return el;
}

/**
 * 背景層に要素を置く（建物のタップ位置など）。
 * x, y は完成図と同じ「基準枠の座標」で指定する。背景と同じ変換で動くのでずれない。
 */
export function placeOnBg(el, { x, y, w, h, centered = true } = {}) {
  const bleed = (cfg.design.bgHeight - cfg.design.height) / 2;
  const st = el.style;
  st.position = 'absolute';
  st.left = BGU(x);
  st.top = BGU(y + bleed);
  if (w != null) st.width = BGU(w);
  if (h != null) st.height = BGU(h);
  if (centered) st.transform = 'translate(-50%, -50%)';
  return el;
}
