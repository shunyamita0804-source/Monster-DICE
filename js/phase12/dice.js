// =========================================================
// Phase 12：正式サイコロ（10コマのアニメーション）の対応表（window.MMP12D）
//  ・std    …通常用（出目1〜3）：Chapterの通常進行・修行ボード
//  ・branch …分岐ルート用（出目1〜6）：現在のゲームには1〜6を振る場面がまだ無いため、登録と再生の準備だけ（どこからも再生しない）
//  画像はユーザー提供の正式素材（緑背景）から緑の背景だけを除いた透過WebP（出どころは assets/dice/README.md）。
//  サイコロの出目はゲーム側（MMP8.roll／MMP7.rollDice）で先に決まる。ここは見せ方だけで、出目・進行には関わらない。
//  faces：出目が見える「停止面」の画像の登録欄（出目 → 画像のパス）。現在はどちらも未登録（空）。
//    素材が届いたら、通常用は std.faces に 1〜3、分岐用は branch.faces に 1〜6 を書き足すだけで、10コマの演出のあとに表示される。
//    未登録・範囲外の出目・読み込めない画像のときは、従来どおり数字の表示だけで動く（ファイル名・置き場所はまだ決めていない）。
// =========================================================
(function (root) {
  'use strict';
  const fz = Object.freeze;
  const frames = (dir) => fz(Array.from({ length: 10 }, (_, i) => `./assets/dice/${dir}/${String(i + 1).padStart(2, '0')}.webp`));
  const SETS = fz({
    std: fz({ key: 'std', name: '通常用サイコロ', min: 1, max: 3, frames: frames('std'), w: 561, h: 449, frameMs: 70, faces: fz({}) }),
    branch: fz({ key: 'branch', name: '分岐ルート用サイコロ', min: 1, max: 6, frames: frames('branch'), w: 561, h: 449, frameMs: 70, faces: fz({}) }),
  });
  const set = (key) => SETS[key] || null;
  /** 待機中の見た目（最後のコマ＝着地して静止した姿） */
  const icon = (key) => { const s = set(key); return s ? s.frames[s.frames.length - 1] : null; };
  /** 停止面の画像（登録済みで、出目がそのサイコロの範囲内のときだけ。それ以外は null＝数字の表示で代用） */
  const face = (key, value) => { const s = set(key); if (!s || !Number.isInteger(value) || value < s.min || value > s.max) return null; const src = s.faces && s.faces[value]; return typeof src === 'string' && src ? src : null; };
  root.MMP12D = fz({ SETS, set, icon, face });
})(typeof window !== 'undefined' ? window : globalThis);
