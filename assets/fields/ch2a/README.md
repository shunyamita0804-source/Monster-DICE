# Chapter 2「潮風の海岸」Pattern A の素材

参照は js/chapter/configs/ch2a.js だけ。目印（nodes/）・環境（env/）・サイコロ（dice/）・操作欄（ui/）は Chapter 1 の素材（../ch1a/）を共通で使う。

## 正式背景（2026-10-01 夜）

出どころ：ユーザー提供 mystic-monsters-ch2-official-assets.zip（正式構成 11枚。元の JPEG はユーザーが別に保管する。リポジトリには入れない）。
加工：元の JPEG（864×1536）を同じ大きさの WebP（品質86。Chapter 1 と同じ）へ再圧縮しただけ（切り抜き・色の加工・内容の変更なし）。1枚 約280〜470KB。
読み込みは今いる背景＋次の背景の先読み（field-view の preloadField）。

| 順 | キー | ファイル | 元ファイル | 表示名【暫定】 | 地形 | 備考 |
|---|---|---|---|---|---|---|
| 演出 | — | intro/ch2_intro_overview_v2.webp | intro/ch2_intro_overview.jpeg | — | — | 導入演出専用（背景の順には入れない）。会場 → 海上 → 海中 → スタート（下の海辺の街）へ |
| 1 | 01 | field/ch2_field_01.webp | field/ch2_field_01.jpeg | 海辺の遊歩道 | coast | スタート |
| 2 | 02 | field/ch2_field_02.webp | field/ch2_field_02.jpeg | 白砂の浜道 | coast | |
| 3 | 03 | field/ch2_field_03.webp | field/ch2_field_03.jpeg | 岬の古道 | coast | |
| 4 | 04 | field/ch2_field_04.webp | field/ch2_field_04.jpeg | 海上の大橋 | bridge | 強敵（真ん中 s4_4）【暫定】 |
| 5 | 05 | field/ch2_field_05.webp | field/ch2_field_05.jpeg | 珊瑚の遺跡 | coast | |
| 6 | 06 | field/ch2_field_06.webp | field/ch2_field_06.jpeg | 海底回廊の入口 | undersea | 海中（ガラスの回廊の床）。分かれ道 s6_2 → 左の回廊 A／右の回廊 B |
| 7 | 07 | field/ch2_field_07.webp | field/ch2_field_07.jpeg | 海底の回廊 | undersea | 海中（回廊の床）。A／B の続き → 奥の合流 m7_0 |
| 8 | 08 | field/ch2_field_08.webp | field/ch2_field_08.jpeg | 沈んだ神殿 | undersea | 海中（神殿の石畳） |
| 9 | 09 | field/ch2_field_09.webp | field/ch2_field_09.jpeg | 夕凪の海道 | bridge | 海上の長い道 |
| 10 | 10 | arena/ch2_arena_approach.webp | arena/ch2_arena_approach.jpeg | 大会会場への道 | coast | ライバル（強制停止）→ ゴール（会場の階段の手前）→ 公式大会 |

- 01 → 10 の順にだけ、各背景を1回ずつ通る（1本道・分岐なし・戻らない・飛ばさない・ランダムにしない）。
- マス数は config の NODES（2026-10-01 夜の再設計：01 8・02 8・03 6・04 9・05 7・08 7・09 8・会場前 5【暫定】）。06〜07 は分岐（共通3 → 左の回廊 A 3＋4／右の回廊 B 4＋5 → 合流1）。A 68歩・B 70歩。サイコロ 1〜3。
- 分岐は画像を加工せず、同じ道の上にノードを左右に置き分けている（ch2a.js の LANES）。
- 道の中央線と半幅は各画像を目視で読んだ [y, x, 半幅]（ch2a.js の BG）。海中の区間は描かれた回廊・通路の床の上だけ（水の中・柱の外は安全域に入れない）。

## 旧構成（ファイルだけ残す。参照しない）

- road/（10枚。mismon_chapter2_backgrounds.zip。768×1360・序盤3／中盤3／終盤3／会場前1）
- intro/ch2_intro_overview.webp（旧の俯瞰図）
