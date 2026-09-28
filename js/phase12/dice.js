// =========================================================
// Phase 12：正式サイコロ（10コマのアニメーション）の対応表（window.MMP12D）
//  ・std    …通常用（出目1〜3）：Chapterの通常進行・修行ボード
//  ・branch …分岐ルート用（出目1〜6）：現在のゲームには1〜6を振る場面がまだ無いため、登録と再生の準備だけ（どこからも再生しない）
//  画像はユーザー提供の正式素材（緑背景）から緑の背景だけを除いた透過WebP（出どころは assets/dice/README.md）。
//  サイコロの出目はゲーム側（MMP8.roll／MMP7.rollDice）で先に決まる。ここは見せ方だけで、出目・進行には関わらない。
// =========================================================
(function (root) {
  'use strict';
  const fz = Object.freeze;
  const frames = (dir) => fz(Array.from({ length: 10 }, (_, i) => `./assets/dice/${dir}/${String(i + 1).padStart(2, '0')}.webp`));
  const SETS = fz({
    std: fz({ key: 'std', name: '通常用サイコロ', min: 1, max: 3, frames: frames('std'), w: 561, h: 449, frameMs: 70 }),
    branch: fz({ key: 'branch', name: '分岐ルート用サイコロ', min: 1, max: 6, frames: frames('branch'), w: 561, h: 449, frameMs: 70 }),
  });
  const set = (key) => SETS[key] || null;
  /** 待機中の見た目（最後のコマ＝着地して静止した姿） */
  const icon = (key) => { const s = set(key); return s ? s.frames[s.frames.length - 1] : null; };
  root.MMP12D = fz({ SETS, set, icon });
})(typeof window !== 'undefined' ? window : globalThis);
