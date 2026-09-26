// 要素を組み立てる小さな道具（全部品共通）
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') {
      for (const [prop, val] of Object.entries(v)) {
        if (prop.startsWith('--')) el.style.setProperty(prop, val);
        else el.style[prop] = val;
      }
    }
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) if (c != null && c !== false) el.append(c);
  return el;
}

export const fmtNumber = (n) => new Intl.NumberFormat('ja-JP').format(n);

/**
 * 画像の一部を枠いっぱいに表示する（はみ出す分は切る）。単位は rem。
 * box … 元画像上の切り出し範囲（px）。img … 元画像の大きさ（px）
 */
export function cropStyle(url, img, box, frame) {
  const scale = Math.max(frame.w / box.w, frame.h / box.h);
  const x = -box.x * scale + (frame.w - box.w * scale) / 2;
  const y = -box.y * scale + (frame.h - box.h * scale) / 2;
  return {
    backgroundImage: url ? `url("${url}")` : 'none',
    backgroundSize: `${img.w * scale}rem ${img.h * scale}rem`,
    backgroundPosition: `${x}rem ${y}rem`,
  };
}
