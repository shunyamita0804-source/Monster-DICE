// =========================================================
// 保存先
//  すべて非同期（await）で扱う。アプリ化の時は、同じ get/set/remove を持つ
//  ネイティブの保存先（例：Capacitor Preferences）に差し替えるだけでよい。
// =========================================================

class LocalStorageAdapter {
  constructor(prefix) { this.prefix = prefix; this.kind = 'localStorage'; this.persistent = true; }
  async get(key) { return localStorage.getItem(this.prefix + key); }
  async set(key, value) { localStorage.setItem(this.prefix + key, value); }
  async remove(key) { localStorage.removeItem(this.prefix + key); }
}

// プライベートブラウズ等で保存できない時の退避先（ページを閉じると消える）
class MemoryAdapter {
  constructor() { this.map = new Map(); this.kind = 'memory'; this.persistent = false; }
  async get(key) { return this.map.has(key) ? this.map.get(key) : null; }
  async set(key, value) { this.map.set(key, value); }
  async remove(key) { this.map.delete(key); }
}

export function createStorage(prefix) {
  try {
    const probe = `${prefix}__probe`;
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return new LocalStorageAdapter(prefix);
  } catch {
    return new MemoryAdapter();
  }
}

export { MemoryAdapter };
