// セーブデータの形式が変わった時の移行処理
// 例：版数1 → 2 の移行を追加する場合
//   1: (record) => { record.data.newField = ...; record.version = 2; return record; }
export const MIGRATIONS = {};

export function migrate(record, currentVersion) {
  let r = record;
  if (!Number.isInteger(r.version)) throw new Error('セーブデータの版数がありません');
  if (r.version > currentVersion) throw new Error('このセーブデータは新しいバージョンのゲームで作られています');
  while (r.version < currentVersion) {
    const step = MIGRATIONS[r.version];
    if (!step) throw new Error(`版数${r.version}からの移行方法がありません`);
    r = step(r);
  }
  return r;
}
