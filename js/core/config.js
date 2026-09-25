// 起動時に読み込んだ設定を、どこからでも参照できるようにする
let config = null;
let unlocks = [];

export function setConfig(c, u = []) { config = c; unlocks = u; }
export function getConfig() {
  if (!config) throw new Error('設定がまだ読み込まれていません');
  return config;
}
export function getUnlocks() { return unlocks; }
