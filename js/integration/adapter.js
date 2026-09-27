// =========================================================
// 統合アダプター（統合Phase）
//  旧Artifact側のデータ形式 ⇄ Phase 1〜5（window.MMBattle）のデータ形式を変換する。
//
//  重要：このファイルは「変換（形の詰め替え）」だけを行う。
//  ダメージ・命中・クリティカル・Effectの再計算は一切行わない（二重計算禁止）。
//  実際の計算は必ず window.MMBattle 側（Phase 1〜5）で1回だけ行うこと。
//
//  今回のPhase（統合Phase）では、このアダプターはまだ旧ゲーム本体の act()/fight() へ
//  配線していない。旧ゲームのコードは今回一切変更していないため、このファイルを
//  読み込むだけでは旧ゲームの動作に何の影響もない。次のPhaseで安全に接続するための
//  「境界」として用意するものです。
// =========================================================
(function () {
  'use strict';

  // ---------- 旧個体（p / e。li,po,in,hi,ev,de の6値を持つオブジェクト）→ Phase5の stats 形 ----------
  // 旧データには speed が存在しないため、MMBattle.getSpeed() の後方互換（DEFAULT_SPEED）に委ねる。
  // 旧データへ無理に同じ speed を書き込むことはしない（将来、正式モンスターマスターから
  // species ごとの speed を引けるようにする拡張余地を残すため）。
  function legacyUnitToStats(u) {
    if (!u || typeof u !== 'object') throw new Error('旧個体データが不正です');
    return {
      life: u.li,
      power: u.po,
      wisdom: u.in,
      hit: u.hi,
      evasion: u.ev,
      toughness: u.de,
    };
  }

  /**
   * 旧個体データから、Battle Session 生成に必要な最小限の「個体」形（uid/speciesId/nickname/stats/speed）を作る。
   * speed は旧データに存在しないため、明示的に持っていればそれを使い、無ければ渡さない
   * （window.MMBattle.getSpeed() 側の後方互換で DEFAULT_SPEED にフォールバックする）。
   */
  function legacyUnitToIndividualLike(u, fallbackId) {
    const stats = legacyUnitToStats(u);
    const out = {
      uid: u.uid || fallbackId || u.name || 'legacy-unit',
      speciesId: u.sp,
      variantId: u.variantId ?? null,
      nickname: u.name,
      stats,
    };
    if (typeof u.speed === 'number') out.speed = u.speed; // 将来、旧データにspeedが足された場合はそのまま使う
    return out;
  }

  // ---------- 旧技データ（SK配列の1要素 + EFFエントリ）→ Phase5 の Move 形 ----------
  // 旧 SK タプルの並び： [名前, 威力比率(0〜1.3), ?, 色, 絵文字, 分類記号, 説明文, "p"|"i", 命中率(0-100), クリティカル率(0-1)]
  // 旧 EFF エントリの形： { tg: 0|1(0=自分,1=相手), st: 'atk'|'de'|'hi'|'ev', lv: 符号付き整数(絶対値1/2/3=小/中/大), t: 残りターン }
  //
  // 対応表（構造は1:1で確定できる）：
  //   st  'atk'->'attack'  'de'->'defense'  'hi'->'hit'  'ev'->'evasion'
  //   tg  0->'self'  1->'opponent'
  //   lvの符号  正->'up'  負->'down'
  //   lvの絶対値  1->'small'  2->'medium'  3->'large'   （旧 DLV=["","小","中","大"] と一致）
  //   sk[7] 'p'->'power'  'i'->'wisdom'
  //   sk[8] そのまま accuracy（0-100）
  //   sk[9] ×100 して critical（0-100）
  //
  // 【未決定・このアダプターでは変換しない値】
  //   sk[1]（威力比率 0〜1.3）→ Phase5 の movePower（絶対値。既存テストでは60〜80程度を使用）
  //   への変換係数は、ゲームバランスに関わる設計判断であり、今回のアダプターでは
  //   勝手に決めていません。呼び出し側が明示的に scale を渡さない限り、
  //   moveFromLegacySK() は power を変換せず、そのまま「比率」を返します
  //   （movePowerとして直接使うと威力の桁が合わない可能性が高いことに注意）。
  const LEGACY_STAT_KEY = Object.freeze({ atk: 'attack', de: 'defense', hi: 'hit', ev: 'evasion' });
  const LEGACY_SIZE_BY_MAGNITUDE = Object.freeze({ 1: 'small', 2: 'medium', 3: 'large' });

  function legacyEffectToTemplate(e) {
    const category = LEGACY_STAT_KEY[e.st];
    if (!category) throw new Error(`未知の旧効果キーです：${e.st}`);
    const size = LEGACY_SIZE_BY_MAGNITUDE[Math.abs(e.lv)];
    if (!size) throw new Error(`未知の旧効果強度です：${e.lv}`);
    return {
      target: e.tg === 1 ? 'opponent' : 'self',
      category,
      direction: e.lv < 0 ? 'down' : 'up',
      size,
      remainingTurns: e.t,
    };
  }

  /**
   * 旧SKタプル＋対応するEFFエントリ配列から、Phase5のMove形（の「構造」）を作る。
   * @param {Array} skEntry - SK[k]
   * @param {Array} [effEntries] - EFF[k]（無ければ空扱い）
   * @param {object} [opts]
   * @param {string} [opts.id] - 技ID（省略時はSK内の名前を使う）
   * @param {number} [opts.powerScale] - sk[1]（威力比率）に掛けてmovePowerを作る係数。
   *   省略時はpowerをそのまま比率のまま返す（=呼び出し側が桁を把握して使うこと）。
   *   この係数の正式な値は未決定（ゲームバランス上の判断が必要なため、このアダプターでは決めていない）。
   */
  function moveFromLegacySK(skEntry, effEntries, opts) {
    if (!Array.isArray(skEntry)) throw new Error('SKエントリが不正です');
    const [name, powerRatio, , , , , , typeChar, accuracy, criticalRatio] = skEntry;
    const o = opts || {};
    const effects = (effEntries || []).map(legacyEffectToTemplate);
    const power = typeof o.powerScale === 'number' ? powerRatio * o.powerScale : powerRatio;
    const move = {
      id: o.id || name,
      accuracy,
      power,
      effects,
    };
    if (power > 0) {
      move.type = typeChar === 'p' ? 'power' : 'wisdom';
      move.critical = criticalRatio * 100;
    }
    return move;
  }

  window.MMAdapter = Object.freeze({
    legacyUnitToStats,
    legacyUnitToIndividualLike,
    legacyEffectToTemplate,
    moveFromLegacySK,
    LEGACY_STAT_KEY,
    LEGACY_SIZE_BY_MAGNITUDE,
  });
})();
