// =========================================================
// Battle Checkpoint（PHASE 1：土台のみ）
//  ・「バトル途中でゲームを終了しても再開できる」ための保存単位。
//  ・保存するのはターン開始時点のスナップショットのみ。アニメーション途中・判定途中など
//    中途半端な状態は対象にしない（そのような状態を作る処理自体、このPHASEにはまだ無い）。
//  ・js/core/save.js のセーブレコード（{ format, version, data }）と同じ考え方で
//    { format, version, session } の形にラップする。将来 save.js から呼び出す際に
//    馴染む形にしているが、今回は save.js 側には一切手を入れていない。
// =========================================================

const FORMAT = 'monster-master-battle-checkpoint';
const VERSION = 1;

/** 現在のバトルセッションから、ターン開始時点のチェックポイントを作る */
export function createCheckpoint(session) {
  return {
    format: FORMAT,
    version: VERSION,
    savedAt: new Date().toISOString(),
    session: structuredClone(session),
  };
}

// チェックポイントから復元したセッションが最低限備えるべき形。
// このPHASEでは実行時チェックのみ行い、値の意味（勝敗判定など）には踏み込まない。
function validateCheckpoint(checkpoint) {
  if (!checkpoint || typeof checkpoint !== 'object') return 'チェックポイントがありません';
  if (checkpoint.format !== FORMAT) return 'モンスターマスターのバトルチェックポイントではありません';
  if (!Number.isInteger(checkpoint.version)) return 'チェックポイントの版数がありません';
  if (checkpoint.version > VERSION) return 'このチェックポイントは新しいバージョンのバトルシステムで作られています';
  const s = checkpoint.session;
  if (!s || typeof s !== 'object') return 'バトルセッションがありません';
  if (s.firstActor !== 'A' && s.firstActor !== 'B') return '先攻情報が不正です';
  if (!Number.isInteger(s.turn) || s.turn < 1) return 'ターン数が不正です';
  if (!s.participants?.A || !s.participants?.B) return '参加個体の情報がありません';
  if (!s.currentLife || !s.hitCount || !s.totalDamage) return 'ライフ／命中／ダメージの記録がありません';
  return null;
}

/**
 * チェックポイントからバトルセッションを復元する。
 * 壊れたチェックポイントは（save.js の load() 同様）例外を投げる。
 */
export function restoreSession(checkpoint) {
  const problem = validateCheckpoint(checkpoint);
  if (problem) throw new Error(`チェックポイントを復元できません：${problem}`);
  return structuredClone(checkpoint.session);
}
