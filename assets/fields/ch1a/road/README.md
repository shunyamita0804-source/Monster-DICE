# Chapter 1「はじまりの草原」リアル巨大ボード方式の素材（2026-10-01）

出どころ：ユーザー提供 mystic-monsters-ch1-new-board-assets-UPDATED.zip（backgrounds／intro_overviews／dice／ui）。元の JPEG はユーザーが別に保管する（リポジトリには入れない）。
参照は js/chapter/configs/ch1a.js だけ（fieldScenes・intro・dice・deck）。

## 加工

- 背景（road/）・俯瞰図（../intro/）：元の JPEG（768×1360）を同じ大きさの WebP（品質86）へ再圧縮しただけ（切り抜き・色の加工なし）。
- サイコロ（../dice/dice_stop_1〜6.webp・dice_blank.webp）：元の JPEG（1536×1536。白または市松模様の背景）の外側から、明るく無彩色の画素をつながっている範囲だけ透明にし（本体の白い面は金の縁で囲まれているため残る）、縁の1画素だけ明るさに応じて半透明にして白い縁取りを消し、本体の大きさに切り詰めて 360px 幅の WebP（透過あり・品質86）へ。色は変えていない。
  - dice_stop_2 の側面（1の面）は、公式の紋章ではなく通常の目で描かれている（ZIP の README に記載の既知の不一致。上面＝出目だけを使う）。
- 操作欄（../ui/deck_start.webp・deck_stop.webp）：元の JPEG（1536×512。白背景）を同じ方法で透過化し、1100px 幅の WebP へ。START／STOP の2状態。押せる領域（center・tl・tr・bl・br）は config.deck.hit に画像に対する割合で書く。

## 背景（15枚）と旅の順

| 順 | ファイル | 場面 | ルート |
|---|---|---|---|
| 01 | 01_journey_road | 旅立ちの街道 | 共通 |
| 02 | 02_flower_meadow | 花の草原 | 共通 |
| 03 | 03_stream_road | 清流の道 | 共通 |
| 04 | 04_grassland_ruins | 草原の遺跡（最後の石板で分岐） | 共通 |
| 05A | 05a_windy_highland | 風の高原 | 橋 |
| 06A | 06a_bridge_approach | 大橋への道 | 橋 |
| 07A | 07a_ancient_bridge_entrance | 古代橋の入口 | 橋 |
| 08A | 08a_ancient_bridge_center | 古代橋の中央（強敵） | 橋 |
| 09A | 09a_bridge_exit | 橋の出口 | 橋 |
| 05B | 05b_forest_entrance | 森の入口 | 森 |
| 06B | 06b_sunlit_forest_road | 木漏れ日の道 | 森 |
| 07B | 07b_forest_stream | 森の小川 | 森 |
| 08B | 08b_deep_ancient_forest | 深い古代の森 | 森 |
| 09B | 09b_forest_exit | 森の出口 | 森 |
| 10 | 10_tournament_approach | 大会会場への道（ライバル＝強制停止・大会門） | 合流 |

- 1枚に輪の刻まれた石板が4つ（y≈0.84・0.60・0.47・0.38）。石板1つ＝1マス。同じ背景を「周回」として何度か通る（config の LAPS。【暫定】共通2周・橋1周・森2周・会場2周＝橋59／森79マス）。
- 旧13枚の旅（../journey/）・旧暫定の停止面（../dice/dice_stop_1〜3.svg）・回転用の旧サイコロ（../dice/dice_rolling.webp）はファイルを残すが参照しない。

## 俯瞰図（../intro/、演出専用）

| ファイル | 用途 |
|---|---|
| ch1_intro_overview_pattern1 | Pattern A（今の Chapter 1） |
| ch1_intro_overview_pattern2 | Pattern B（config が来たとき用） |
| ch1_intro_overview_pattern3 | Pattern C（更新版。Pattern 2 と似すぎないように差し替え済み） |

Chapter に入った瞬間に全画面で見せ、Chapter 名のあとスタート付近（config.intro.startFocus）へズーム／パンして 01 の実プレイ画面へつなぐ（js/chapter/intro.js）。プレイの背景の流用ではない。
