// =========================================================
// 連続コマの演出（window.MMSEQ。2026-10-03）：正式の連番素材を画面いっぱいに順に重ねて見せるだけの再生器（見た目だけ。進行・判定・セーブには触れない）。
//  いまゲームから呼んでいる所は無い（素材の保存と、将来つなぐための準備）：
//   ・sacredBeast＝野生聖獣の遭遇（assets/fx/sacred_beast/。正式8コマ）。聖獣の出現条件・出現率・報酬・システムは未実装＝つなぐ所が無い
//   ・合体（assets/fx/fusion/）は研究所の合体UIが未実装、かつ素材パックのフォルダ分けに食い違いがある（README.md）＝ここには登録しない
//  使い方（将来）：await MMSEQ.play('sacredBeast')。タップで飛ばせる。視差を減らす設定では最後の1枚を短く見せるだけ
// =========================================================
(function (root) {
  'use strict';
  const SB = './assets/fx/sacred_beast/sacred_beast_encounter_0';
  const PRESETS = Object.freeze({
    // 8コマ（ZIP の 07_wild_sacred_beast_encounter_sequence の順）。1コマ約0.26秒・最後は少し長く
    sacredBeast: Object.freeze({ frames: Object.freeze([1, 2, 3, 4, 5, 6, 7, 8].map((i) => `${SB}${i}.webp`)), frameMs: 260, lastMs: 700, fadeMs: 120 }),
  });
  const calm = () => !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  let busy = false;
  /** 先読み（再生の前に呼ぶと、コマが抜けない） */
  function preload(name) {
    const P = PRESETS[name]; if (!P || typeof Image === 'undefined') return [];
    return P.frames.map((src) => { const im = new Image(); im.decoding = 'async'; im.src = src; return im; });
  }
  /** 再生（画面の一番上に重ね、終わったら必ず消す）。同時に2つは再生しない */
  async function play(name, opts = {}) {
    const P = PRESETS[name]; if (!P || busy || typeof document === 'undefined' || !document.body) return false;
    busy = true;
    const ov = document.createElement('div'); ov.className = 'mmseq'; ov.setAttribute('role', 'presentation');
    ov.style.cssText = 'position:fixed;inset:0;z-index:950;background:#000;overflow:hidden';
    const img = document.createElement('img'); img.alt = ''; img.draggable = false;
    img.style.cssText = `position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:opacity ${P.fadeMs}ms linear`;
    ov.appendChild(img); document.body.appendChild(ov);
    let skip = false; ov.addEventListener('click', () => { skip = true; });
    try {
      const fr = calm() ? [P.frames[P.frames.length - 1]] : P.frames;
      for (let i = 0; i < fr.length && !skip; i++) { img.src = fr[i]; await wait(i === fr.length - 1 ? (opts.lastMs || P.lastMs) : (opts.frameMs || P.frameMs)); }
      img.style.opacity = '0'; await wait(P.fadeMs);
    } finally { ov.remove(); busy = false; }
    return true;
  }
  root.MMSEQ = Object.freeze({ PRESETS, preload, play, isBusy: () => busy });
})(typeof window !== 'undefined' ? window : globalThis);
