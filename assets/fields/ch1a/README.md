# Chapter 1「はじまりの草原」Pattern A「大橋と清流の草原」の素材

出どころ：ユーザー提供の4つのZIP（mystic-monsters-ch1-A-part1-core／part2-nodes／part3-landmarks-nature-roads／part4-landmarks-ruins-terrain）。
参照は js/chapter/configs/ch1a.js の `assets`・`landmarks`・`branchOverlays` だけ（コードの中にパスを散らさない）。

## 加工

- 背景（bg_01〜03）：元の JPEG（864×1536）を同じ大きさの WebP（品質86）へ。元データは original/ に無加工で保存。
- 重ねる素材（nodes/・env/・dice/）：
  1. 透明部分の外側から、白・灰色の残り（縁のにじみ・市松模様の残り）を最大数px はがす
  2. 本体から離れた小さな点（点線の残りなど）を消す
  3. 縁を1pxだけぼかす（白い縁取りを出さない）
  4. 本体の大きさに切り詰め、表示サイズに合わせて縮小（長辺 300〜1100px）→ WebP（品質84・透過あり）
- 色は変えていない（CSS の filter で色を変えることもしない。遠景のかすみは透明度と明るさ／ぼかしだけ）。

## 使った素材と置き場所

| ファイル | 元 | 使い方 |
|---|---|---|
| bg_01.webp | 01_backgrounds/ch1_patternA_bg_01_start.jpeg | FIELD 1 旅立ちの草原 |
| bg_02.webp | 01_backgrounds/ch1_patternA_bg_02_bridge.jpeg | FIELD 2 大橋と清流（分岐） |
| bg_03.webp | 01_backgrounds/ch1_patternA_bg_03_goal.jpeg | FIELD 3 大会へ続く高原（ゴール） |
| dice/dice_rolling.webp | 02_dice/dice_stop_1_emblem.png | サイコロ回転中の本体（1枚を動かす） |
| nodes/stat_*.webp（6） | 03_nodes/stats/ | 能力マス（ライフ・ちから・かしこさ・命中・回避・丈夫さ） |
| nodes/event_normal・rare・special | 03_nodes/event/（special は event_deluxe） | イベント（normal／rare／special） |
| nodes/treasure_normal・rare・special | 03_nodes/treasure/（special は treasure_deluxe） | 宝箱（normal／rare／special） |
| nodes/battle_wild・battle_rival | 03_nodes/battle/ | バトル（wild・strong は battle_wild、rival は battle_rival）。ZIP の2枚はバイト単位で同じ画像（要確認：rival 用の別の絵が届いたら差し替えるだけ） |
| env/flower_path | 04_landmarks/nature | FIELD 1 の奥（道の脇の花） |
| env/rock_strip_b | 04_landmarks/terrain | FIELD 1 の手前の岩 |
| env/forest_path_b | 04_landmarks/nature | FIELD 2 の奥（森の小道の入口） |
| env/rock_strip_long | 04_landmarks/terrain | FIELD 2・3 の手前の岩 |
| env/ancient_tree_large | 04_landmarks/nature | FIELD 3 の奥の大木 |
| env/ancient_pillar | 04_landmarks/ruins | FIELD 3 の道の脇の石柱（2本） |
| env/grass_flower_border | 04_landmarks/nature | 各FIELD の最前面の草（モンスターの足元より手前） |
| env/leaf_canopy_frame | 04_landmarks/nature | 森の小道を選んだときだけ FIELD 2 の上に重ねる葉 |

## 使わなかった素材（理由）

| 素材 | 理由 |
|---|---|
| dice_blank | 出目の無い面。停止画像（dice_stop_1〜3）が揃うまで使い道がない |
| arena_gate_road | 大会の門は bg_03 に描かれている（二重になる） |
| ancient_bridge | 大橋は bg_02 に描かれている |
| mystic_pond | 市松模様が絵に焼き込まれていて、きれいに抜けない |
| small_shrine・ruin_entrance_a／b・stone_stele | 点線や別の場面の背景が残っている／草原に置くと遺跡・ダンジョン風になり背景と合わない |
| waterfall_tall・waterfall_hidden_cave_a／b・rock_water_pool | 滝・洞窟は草原の背景に無い地形で、置くと浮く |
| elevated_stone_stairs・stone_stairs_tunnel・cliff_plateau・rock_crevice | 斜め上から見た（アイソメ風）視点で、背景の遠近と合わない |
| ancient_tree_hollow・forest_path_a・glowing_tree_small | 同じ役の素材（ancient_tree_large・forest_path_b）を使った。数を増やすと画面が散らかる |
