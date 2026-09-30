# Chapter 1「はじまりの草原」の旅の背景（13枚）

出どころ：ユーザー提供 mystic-monsters-chapter1-backgrounds-13.zip（ch1_bg_01〜13.jpeg。01〜03 は 768×1360、04〜13 は 864×1536）。
Chromium の canvas で同じ大きさの WebP（品質 0.86）へ変換しただけ（切り抜き・色の加工なし）。元の JPEG はユーザーが別に保管する（リポジトリには入れない）。
参照は js/chapter/configs/ch1a.js の fieldScenes だけ。

## 旅の順（画像の内容から決めた並び）

| 順 | ファイル | 元 | 場面 |
|---|---|---|---|
| 1 | ch1_01_grassland_start | ch1_bg_01 | 旅立ちの草原（左に木・右に小川・遠くに大橋と街） |
| 2 | ch1_02_grassland_bridge_view | ch1_bg_04 | 大橋の見える草原（右手の木・遠くの大橋） |
| 3 | ch1_03_stream_side | ch1_bg_05 | 清流のほとり（左に岩と流れ） |
| 4 | ch1_04_small_stone_bridge | ch1_bg_02 | 小さな石橋（左に滝と小さなアーチ橋） |
| 5 | ch1_05_fork_hill | ch1_bg_11 | 分かれ道の丘（ここで大橋ルート／森の小道に分岐） |
| 6 | ch1_06_bridge_village | ch1_bg_06 | 橋のたもとの集落（大橋ルート） |
| 7 | ch1_07_bridge_approach | ch1_bg_12 | 大橋を望む道（大橋ルート） |
| 8 | ch1_08_great_bridge | ch1_bg_07 | 大橋（大橋ルート。強敵の地点） |
| 9 | ch1_09_old_pillars | ch1_bg_08 | 古い石柱の道（森の小道） |
| 10 | ch1_10_forest_path | ch1_bg_09 | 森の小道（森の小道） |
| 11 | ch1_11_forest_exit | ch1_bg_13 | 森の出口（森の小道） |
| 12 | ch1_12_hill_to_arena | ch1_bg_03 | 大会へ続く丘（合流。丘の上に遺跡風の建物） |
| 13 | ch1_13_highland_arena | ch1_bg_10 | 大会会場の高原（遠くに大会会場の城。ライバル・大会門） |

- 旧背景（bg_01〜03.webp：3枚構成の旅）は互換のため残すが、config からは参照しない。
- 道は各画像に描かれた土の道をそのまま使う（paths[].pts で折れ線を指定し、エンジンが曲線化）。丸いマス・線・レールは描かない。
