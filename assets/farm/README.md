# ファームの背景

| ファイル | 内容 |
|---|---|
| farm_prep_main.jpg | **正式（2026-10-03）**：冒険準備の拠点としてのファーム（ZIP mismon_claude_assets_2026-10-03 の farm_reference/farm_adventure_prep_reference.jpg）。寸法そのまま（864×1536）・見た目を変えずに JPEG 品質86 で再圧縮（約0.44MB。色の加工・描き直しなし） |
| original/farm_adventure_prep_reference_864x1536.jpg | 上の元データ（ユーザー提供・無加工、約0.81MB）。ゲームからは参照しない |
| farm_main.jpg | ファーム画面の背景（**正式**。941×1672・JPEG 品質88、約0.54MB）。下の元データを、寸法はそのまま・見た目を変えずに圧縮したもの（色の加工・描き直しなし） |
| original/farm_main_official_941x1672.png | 正式背景の元データ（ユーザー提供・無加工、約3.1MB）。ゲームからは参照しない |

- 正式背景には、人物・モンスター・文字・旧ロゴ（旧ゲーム名）は描かれていない。ダン・育成中の個体・情報・コマンドはゲーム側で重ねる。
- 参照は index.html の `const FARM_BG="assets/farm/farm_prep_main.jpg";` の1か所から（2026-10-03。それまでは farm_main.jpg）。
  - ファーム画面は、この絵を画面の幅いっぱい・上寄せの「地図」（.fmmap）にし、絵の光る目印の上にコマンドを立てる：訓練場（左上）＝特訓、屋台（右上）＝アイテム、牛舎（右下）＝ステータス、石柱（左下）＝技管理、上の門＝進行ボタン、下の小道の上＝街へ戻る／中断（目印の位置は index.html の FM_SPOT）。左上の「Farm」の札と右上の太陽は絵に描かれたもの（機能は無い）。
  - farm_main.jpg（下）は旧正式背景。ファイルだけ残す。
  - ファーム画面（`fmScr()`。育成開始前・Chapter間・育成完了）の全面の背景（`cover`、横の位置 58%＝中央奥の家と右上の大木が入る）。
  - ファームの各画面（ステータス・技管理・特訓メニュー＝`dscr()`、出発準備・アイテム屋＝`p7Shell()`）のぼかし背景（`.dbg`）。
- 差し替え前の旧背景：
  - `assets/embedded/trimg2_farm_bg.jpg`（`TRIMG2`。旧ロゴ「モンスターマスター」「MONSTER MASTER」「トレーニング場」入り）。互換のため残しているが、表示には使わない。
  - `assets/scenes/farm_interval.jpg`（`MMP12S.FARM_INTERVAL`。Chapter間ファームの旧背景）。データは js/phase12/scenes.js に残しているが、表示には使わない。
