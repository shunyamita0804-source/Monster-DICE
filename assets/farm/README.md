# ファームの背景

| ファイル | 内容 |
|---|---|
| farm_main.jpg | ファーム画面の背景（**正式**。941×1672・JPEG 品質88、約0.54MB）。下の元データを、寸法はそのまま・見た目を変えずに圧縮したもの（色の加工・描き直しなし） |
| original/farm_main_official_941x1672.png | 正式背景の元データ（ユーザー提供・無加工、約3.1MB）。ゲームからは参照しない |

- 正式背景には、人物・モンスター・文字・旧ロゴ（旧ゲーム名）は描かれていない。ダン・育成中の個体・情報・コマンドはゲーム側で重ねる。
- 参照は index.html の `const FARM_BG="assets/farm/farm_main.jpg";` の1か所から。
  - ファーム画面（`fmScr()`。育成開始前・Chapter間・育成完了）の全面の背景（`cover`、横の位置 58%＝中央奥の家と右上の大木が入る）。
  - ファームの各画面（ステータス・技管理・特訓メニュー＝`dscr()`、出発準備・アイテム屋＝`p7Shell()`）のぼかし背景（`.dbg`）。
- 差し替え前の旧背景：
  - `assets/embedded/trimg2_farm_bg.jpg`（`TRIMG2`。旧ロゴ「モンスターマスター」「MONSTER MASTER」「トレーニング場」入り）。互換のため残しているが、表示には使わない。
  - `assets/scenes/farm_interval.jpg`（`MMP12S.FARM_INTERVAL`。Chapter間ファームの旧背景）。データは js/phase12/scenes.js に残しているが、表示には使わない。
