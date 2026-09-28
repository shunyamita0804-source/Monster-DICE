// =========================================================
// Phase 11：プレイヤー情報（window.MMP11P）
//  ・プレイヤー名はセーブ全体の項目 playerName（v6のまま追加。v7にはしない）
//  ・初期名は「アルト」。空欄・空白だけ・読めない値は「アルト」にする
//  ・新規ゲームでは playerNamePending=true にして、最初に名前を決める画面を出す（決めたら消える）
//  ・名前が無い旧セーブ（v4〜v6）は、読み込み時に「アルト」を補う（名前を決める画面は出さない。ほかのデータは変えない）
//  MMP8 のセーブ補正フックに登録し、新規セーブ作成時と、すべてのセーブ読み込み時に必ず通る。
// =========================================================
(function (root) {
  'use strict';
  const DEFAULT_NAME = 'アルト';
  const MAX_LEN = 8;   // 既存のモンスター名入力と同じ8文字まで（絵文字などは1文字として数える）
  /** 入力された名前を整える：制御文字を除き、前後の空白を取り、8文字まで。空なら「アルト」 */
  function sanitize(v) {
    const t = typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').trim() : '';
    return Array.from(t).slice(0, MAX_LEN).join('') || DEFAULT_NAME;
  }
  function normalizeSave(S, ctx) {
    if (ctx && ctx.isNew) { S.playerName = DEFAULT_NAME; S.playerNamePending = true; return S; }
    if (typeof S.playerName !== 'string' || !S.playerName.trim()) S.playerName = DEFAULT_NAME;   // 名前が無い旧セーブ
    return S;
  }
  /** 名前を決める（新規ゲームの名前入力画面から） */
  function confirmName(S, v) { S.playerName = sanitize(v); delete S.playerNamePending; return S.playerName; }
  if (root.MMP8 && typeof root.MMP8.addSaveNormalizer === 'function') root.MMP8.addSaveNormalizer(normalizeSave);
  root.MMP11P = Object.freeze({ DEFAULT_NAME, MAX_LEN, sanitize, normalizeSave, confirmName });
})(typeof window !== 'undefined' ? window : globalThis);
