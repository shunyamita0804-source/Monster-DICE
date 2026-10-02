# Chapter 1 Pattern A の正式マスUI（2026-10-02）

出どころ：ユーザー提供の ZIP `mystic-monsters-board-ui-assets-complete-2026-10-02.zip`（中の `mystic_monsters_board_ui_assets_2026-10-01/`。ASSET_MANIFEST.txt・MISSING_OR_PENDING.txt あり）。

## 加工（透過化）

受け取ったファイルはすべて JPEG（RGB）で、透明部分の代わりに市松模様（白 約254／灰 約221〜230、1マス 約11〜22px）が画像に焼き込まれていた（ZIP の README にも明記）。そのため次の手順で透過 WebP にした（色は変えていない）：

1. 画像の角の市松模様から、マスの大きさ・位置・2色を推定して背景を作り直す
2. 元の画像と背景の差から透明度を求める（差分マット）。メダル本体（つながった不透明な部分）は穴を埋めて不透明にする
3. メダルの外の発光は「色の差」だけで透明度を決める（市松は無彩色なので、境目の明るさのずれは残さない）。発光の色は背景を引いて元に戻す
4. 本体から離れた小さな点を消し、外側の余白を切り詰めて長辺 512px に縮小 → WebP（品質88・透過あり）

明るい背景・暗い背景の両方で、市松模様の残り・縁のにじみがないことを目で確認した。

## 使い方（js/chapter/configs/ch1a.js の tileUI.sprites・tileUI.chests）

| ファイル | 元ファイル | 用途（マス種別） |
|---|---|---|
| tile_stat_life.webp | 01_board_nodes/board_node_stat_life.jpeg | ライフの能力マス（stat_life） |
| tile_stat_power.webp | board_node_stat_power.jpeg | ちから（stat_power） |
| tile_stat_intelligence.webp | board_node_stat_intelligence.jpeg | かしこさ（stat_intelligence） |
| tile_stat_accuracy.webp | board_node_stat_accuracy.jpeg | 命中（stat_accuracy） |
| tile_stat_evasion.webp | board_node_stat_evasion.jpeg | 回避（stat_evasion） |
| tile_stat_toughness.webp | board_node_stat_toughness.jpeg | 丈夫さ（stat_toughness） |
| tile_wild_battle.webp | board_node_wild_battle.jpeg | 野生モンスターマス（wild。赤い爪） |
| tile_treasure.webp | board_node_treasure.jpeg | 宝（treasure） |
| tile_rest.webp | board_node_rest.jpeg | 休憩（rest＝疲れ回復のイベント） |
| tile_rival.webp | board_node_rival.jpeg | ライバル（rival） |
| tile_event.webp | board_node_event.jpeg | ？イベント（event） |
| tile_chapter_goal.webp | 05_goal_and_treasure/board_node_chapter_goal.jpeg | ゴール（goal＝大会会場の門前） |
| tile_rare_monster.webp | board_node_strong_enemy.jpeg | レアモンスターマス（rare。深紅。2026-10-02 に tile_strong_enemy.webp から改名。強敵マスは正式のマスではない） |
| chest_normal_closed.webp・chest_normal_open.webp | 05_goal_and_treasure/treasure_normal_closed／open.jpeg | 宝箱 normal（止まったとき現れて開く。tileUI.chests） |
| chest_rainbow_closed.webp・chest_rainbow_open.webp | treasure_rainbow_closed／open.jpeg | 宝箱 special（虹色）。rare は従来の表示（マスUIだけ）で、この素材を流用しない |

宝箱の4枚は長辺 384px。treasure_rainbow_closed は市松模様ではなく白地だったため、外周から白地をたどって切り抜いた。

## 分岐・合流・左右の門（2026-10-02 の60マス再設計で追加）

元：ZIP `mystic_monsters_board_ui_assets_2026-10-01_v2/02_branching/`（ブロンズ／アンティークゴールドの現行版）。上と同じ手順で市松模様を取り除いて透過 WebP（長辺 512px・品質88）にした。左右の門はアーチの内側（大きな穴）を透明のまま残した（本体の小さな穴だけ埋める）。

| ファイル | 元ファイル | 用途 |
|---|---|---|
| tile_branch.webp | board_node_branch.jpeg | 分かれ道のマス（05 の最後のマス p5_3） |
| tile_merge.webp | board_node_merge.jpeg | 合流のマス（10 の最初のマス p10_0） |
| branch_gate_left.webp | branch_gate_left.jpeg | 分かれ道の左の門（森の道）。config.tileUI.gates.gate_left |
| branch_gate_right.webp | branch_gate_right.jpeg | 分かれ道の右の門（大橋の道）。config.tileUI.gates.gate_right |

通常マスの専用素材は無いので、共通の台座（CSS。index.html の .chf-tile.ped）の石の面だけを置く。

## 使っていない ZIP の素材（このフォルダには入れていない。ユーザーの ZIP に元がある）

- 03_board_effects（宝箱取得・能力UPフレーム・大成功・残りターン警告・遭遇）：「実装方法・最終採用は未確定」の候補。大成功は今の仕様に無い
- 04_progression_gate_candidates（A／B）：正式採用が未決定
