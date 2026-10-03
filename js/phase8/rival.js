// =========================================================
// ライバル「リュウ」`MMRIVAL`（2026-10-04 第二段階）
//  ・正式名＝リュウ。各 Chapter に登場する同一人物で、Chapter が進むごとに強くなる。相棒モンスターは未確定（新しいモンスターは作らない＝バトルの相手の姿は従来どおり fight() が決める）
//  ・強さ：固定の弱い敵ではなく「今育てているモンスターの能力に近い」。fight()（Phase 6・変更禁止）は相手の能力をランクの表（MMP8L.PROVISIONAL_OPPONENT_STAT＝E 70〜S 300）から作るため、
//    ここでは「プレイヤーの6能力の平均 × factor」に最も近いランクを選ぶ（6段階に丸められる）。Chapter ごとの下限・上限（floor／ceil）で「リュウも成長する」を表す。
//    値はすべて CONFIG の1か所（あとから調整しやすいように）。細かい個性差（能力ごとの偏り）は fight() の相手の作りを変えないと出せない＝未決（報告）
// =========================================================
(function (root) {
  'use strict';
  const fz = Object.freeze;
  const CONFIG = {
    name: 'リュウ', title: 'ライバル', partner: null,   // partner：相棒モンスターの species（未確定＝null。決まったら登録するだけ）
    strength: {
      factor: 1.0,                                   // プレイヤーの平均能力に対する倍率（1.0＝同じくらい）
      bias: 0,                                       // 平均に足す固定値（＋なら少し強め）
      floorByChapter: { 1: 0, 2: 1, 3: 2, 4: 3 },    // Chapter ごとの下限ランク（0＝E … 5＝S）＝旅を重ねるほど弱くならない
      ceilByChapter: { 1: 3, 2: 4, 3: 5, 4: 5 },     // Chapter ごとの上限ランク
    },
  };
  const KEYS = fz(['li', 'po', 'in', 'hi', 'ev', 'de']);
  const table = () => (root.MMP8L && root.MMP8L.PROVISIONAL_OPPONENT_STAT) || [70, 90, 120, 160, 220, 300];
  /** 今の個体に対するリュウの強さ＝ランクの番号（0〜5）。cfg を渡すと一時的に別の設定で計算できる（テスト用） */
  function rankFor(m, cfg = CONFIG) {
    const T = table(), S1 = cfg.strength || {}, avg = KEYS.reduce((a, k) => a + ((m && m[k]) | 0), 0) / KEYS.length;
    const target = avg * (Number.isFinite(S1.factor) ? S1.factor : 1) + (S1.bias | 0);
    let best = 0; for (let i = 1; i < T.length; i++) if (Math.abs(T[i] - target) < Math.abs(T[best] - target)) best = i;
    const ch = m && m.raise ? m.raise.ch : 1, lo = (S1.floorByChapter || {})[ch], hi = (S1.ceilByChapter || {})[ch];
    if (Number.isInteger(lo)) best = Math.max(best, lo);
    if (Number.isInteger(hi)) best = Math.min(best, hi);
    return Math.max(0, Math.min(T.length - 1, best));
  }
  /** 表示用：リュウの相棒の能力の目安（ランクの表の値。fight() が作る相手と同じ） */
  function statsFor(m, cfg = CONFIG) { const v = table()[rankFor(m, cfg)]; return Object.fromEntries(KEYS.map((k) => [k, v])); }
  root.MMRIVAL = fz({ CONFIG, KEYS, rankFor, statsFor, tableOf: table });
})(typeof window !== 'undefined' ? window : globalThis);
