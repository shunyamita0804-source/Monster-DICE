// 画面・システム間の通知（依存を増やさないための小さな仕組み）
const handlers = new Map();

export function on(type, fn) {
  if (!handlers.has(type)) handlers.set(type, new Set());
  handlers.get(type).add(fn);
  return () => handlers.get(type)?.delete(fn);
}

export function emit(type, payload) {
  handlers.get(type)?.forEach((fn) => {
    try { fn(payload); } catch (err) { console.error(`[bus] ${type}`, err); }
  });
}
