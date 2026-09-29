// =========================================================
// Phase 12：正式背景（Chapter間ファーム・修行場5種）の対応表（window.MMP12S）
//  画面は背景画像をここからだけ取る（画面側で独自に画像を決めない）。背景は描画のたびに選ぶだけで、セーブには保存しない。
//  ・画像は正式素材（ユーザー提供のPNG）を、同じ大きさのまま高画質JPEGにしたもの（出どころは assets/scenes/README.md）
//  ・背景内の像・標的・障害物などは背景演出。クリックできる仕掛けにはしない
//  ・accent は各修行場の正式カラー（ちから＝橙〜赤、かしこさ＝緑、命中＝ピンク、回避＝青、丈夫さ＝紫）をUIの縁取り等に使うための値
//  ・focus は 390×844 の画面で見せたい位置（CSS background-position／object-position の値）。画像自体は切り抜かない
//    修行場は各施設の象徴（ちから＝巨大像、かしこさ＝天球儀、命中＝標的、回避＝吊り橋と塔、丈夫さ＝巨大な守護者）の側
//  ・市場：今回提供された背景候補（台座付き）を MARKET_BG に登録（最終採用は未確定）
// =========================================================
(function (root) {
  'use strict';
  const fz = Object.freeze;
  const img = (key, w, h, focus) => fz({ src: `./assets/scenes/${key}.jpg`, w, h, focus });
  const FARM_INTERVAL = img('farm_interval', 1816, 866, '20% 50%');   // 390×844では横の約45%だけが見えるため、牧場の建物・牧草地・大きな木の側を見せる位置
  const TRAINING = fz({
    po: fz({ kind: 'po', name: 'ちから特訓場', theme: '石造りの筋力特訓施設', accent: '#d9531e', image: img('train_po', 1816, 866, '62% 35%') }),
    in: fz({ kind: 'in', name: 'かしこさ特訓場', theme: '書庫・魔導研究施設', accent: '#2f9e57', image: img('train_in', 1816, 866, '30% 40%') }),
    hi: fz({ kind: 'hi', name: '命中特訓場', theme: '精密射撃・標的訓練施設', accent: '#d9668f', image: img('train_hi', 1815, 866, '45% 40%') }),
    ev: fz({ kind: 'ev', name: '回避特訓場', theme: '立体障害物・機動訓練施設', accent: '#2f7fd6', image: img('train_ev', 1816, 866, '55% 35%') }),
    de: fz({ kind: 'de', name: '丈夫さ特訓場', theme: '耐久・防御・重装訓練施設', accent: '#7d4fc9', image: img('train_de', 1816, 866, '70% 35%') }),
  });
  // 市場の背景候補（3つの台座付き。今回提供された候補で、最終採用かは未確定）。台座は背景に描かれているため、CSSの台座は重ねない。
  //  pedestals：台座の天面の中心（画像の画素）。center＝手前中央（選択中）、left・right＝奥の左右（前後のモンスター）
  const MARKET_BG = fz({ src: './assets/scenes/market.jpg', w: 941, h: 1672, candidate: true,
    pedestals: fz({ center: fz([482, 1100]), left: fz([200, 960]), right: fz([748, 960]) }) });
  const training = (kind) => TRAINING[kind] || null;
  root.MMP12S = fz({ FARM_INTERVAL, TRAINING, MARKET_BG, training });
})(typeof window !== 'undefined' ? window : globalThis);
