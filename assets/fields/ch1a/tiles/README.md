# Chapter 1 Pattern A の正式マスUI（2026-10-02）

出どころ：ユーザー提供の ZIP `mystic-monsters-board-ui-assets-complete-2026-10-02.zip`（中の `mystic_monsters_board_ui_assets_2026-10-01/`。ASSET_MANIFEST.txt・MISSING_OR_PENDING.txt あり）。

## 加工（透過化）

受け取ったファイルはすべて JPEG（RGB）で、透明部分の代わりに市松模様（白 約254／灰 約221〜230、1マス 約11〜22px）が画像に焼き込まれていた（ZIP の README にも明記）。そのため次の手順で透過 WebP にした（色は変えていない）：

1. 画像の角の市松模様から、マスの大きさ・位置・2色を推定して背景を作り直す
2. 元の画像と背景の差から透明度を求める（差分マット）。メダル本体（つながった不透明な部分）は穴を埋めて不透明にする
3. メダルの外の発光は「色の差」だけで透明度を決める（市松は無彩色なので、境目の明るさのずれは残さない）。発光の色は背景を引いて元に戻す
4. 本体から離れた小さな点を消し、外側の余白を切り詰めて長辺 512px に縮小 → WebP（品質88・透過あり）

明るい背景・暗い背景の両方で、市松模様の残り・縁のにじみがないことを目で確認した。

## 使い方（js/chapter/configs/ch1a.js の tileUI.sprites・assets.rare_wild）

| ファイル | 元ファイル | 用途（マス種別） |
|---|---|---|
| tile_stat_life.webp | 01_board_nodes/board_node_stat_life.jpeg | ライフの能力マス（stat_life） |
| tile_stat_power.webp | board_node_stat_power.jpeg | ちから（stat_power） |
| tile_stat_intelligence.webp | board_node_stat_intelligence.jpeg | かしこさ（stat_intelligence） |
| tile_stat_accuracy.webp | board_node_stat_accuracy.jpeg | 命中（stat_accuracy） |
| tile_stat_evasion.webp | board_node_stat_evasion.jpeg | 回避（stat_evasion） |
| tile_stat_toughness.webp | board_node_stat_toughness.jpeg | 丈夫さ（stat_toughness） |
| tile_wild_battle.webp | board_node_wild_battle.jpeg | 野生（wild）。強敵（strong）も今はこの素材【要確認】 |
| tile_treasure.webp | board_node_treasure.jpeg | 宝（treasure） |
| tile_rest.webp | board_node_rest.jpeg | 休憩（rest＝疲れ回復のイベント） |
| tile_rival.webp | board_node_rival.jpeg | ライバル（rival） |
| tile_event.webp | board_node_event.jpeg | ？イベント（event） |
| tile_chapter_goal.webp | 05_goal_and_treasure/board_node_chapter_goal.jpeg | ゴール（goal＝大会会場の門前） |
| tile_strong_enemy.webp | board_node_strong_enemy.jpeg | レア野生（10%）の素材として登録だけ（assets.rare_wild。盤面には出さない）【要確認：ZIP の目録では「強敵マス」】 |

## 使っていない ZIP の素材（このフォルダには入れていない。ユーザーの ZIP に元がある）

- 02_branching（分岐・合流・左右ゲート）：Chapter 1 は1本道のため
- 03_board_effects（宝箱取得・能力UPフレーム・大成功・残りターン警告・遭遇）：「実装方法・最終採用は未確定」の候補。大成功は今の仕様に無い
- 04_progression_gate_candidates（A／B）：正式採用が未決定
- 05_goal_and_treasure の宝箱4枚（通常／虹色 × 閉／開）：今の宝箱の段階（normal・rare・special の3段階）と明確に対応しないため
