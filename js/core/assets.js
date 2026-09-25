// =========================================================
// 素材台帳
//  状態：official（正式）/ provisional（仮）/ missing（未作成）/ reference（基準画像）
//  画面は素材をIDで呼ぶだけ。ファイルを置き換えれば正式素材に変わる。
//  基準画像はゲーム画面には出さない（開発時の重ね合わせ専用）。
// =========================================================
import { resolvePath } from './data.js';

let ledger = { statuses: {}, entries: [] };
let byId = new Map();
const broken = new Set();

export function setLedger(data) {
  ledger = data;
  byId = new Map(data.entries.map((e) => [e.id, e]));
}

export function asset(id) {
  return byId.get(id) ?? { id, status: 'missing', usage: '（台帳に未登録）', path: null, note: '' };
}

/** ゲーム画面で使える素材なら URL、使えなければ null */
export function assetUrl(id) {
  const e = asset(id);
  if (!e.path || broken.has(id)) return null;
  if (e.status !== 'official' && e.status !== 'provisional') return null;
  return resolvePath(e.path);
}

/** 開発用：基準画像の URL */
export function referenceUrl(id) {
  const e = asset(id);
  return e.status === 'reference' && e.path ? resolvePath(e.path) : null;
}

export function isAvailable(id) { return assetUrl(id) != null; }

export function entries() { return ledger.entries; }
export function statusLabel(status) { return ledger.statuses[status] ?? status; }

export function report() {
  const counts = {};
  for (const e of ledger.entries) counts[e.status] = (counts[e.status] ?? 0) + 1;
  return { counts, broken: [...broken] };
}

/** 画像を先読みする。ファイルが見つからない素材は「壊れている」として記録し、使わない */
export async function preload(ids) {
  const targets = ids.map(asset).filter((e) => e.path && /\.(png|jpe?g|webp|gif|svg)$/i.test(e.path));
  const results = await Promise.all(targets.map((e) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ id: e.id, ok: true, width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => { broken.add(e.id); resolve({ id: e.id, ok: false }); };
    img.src = resolvePath(e.path);
  })));
  return results;
}
