# Chapter 1「はじまりの草原」新しい正式背景（2026-10-01）

出どころ：ユーザー提供 mystic-monsters-ch1-new-backgrounds.zip（ch1_field_01〜10.jpg と ch1_intro_overview.jpg、各 864×1536）。元の JPEG はユーザーが別に保管する（リポジトリには入れない）。
加工：同じ大きさの WebP（品質86）へ再圧縮しただけ（切り抜き・色の加工なし）。11枚で 10.2MB → 5.5MB。俯瞰図は ../intro/ch1_intro_overview.webp（導入演出専用。背景の順には入れない）。
参照は js/chapter/configs/ch1a.js だけ。読み込みは今の背景＋次の背景の先読み（field-view の preloadField）。

| 順 | ファイル | 表示名【暫定】 | 地形 | 骨格 |
|---|---|---|---|---|
| 01 | ch1_field_01 | 旅立ちの草原 | grass | スタート f1_0 |
| 02 | ch1_field_02 | 花の丘 | grass | |
| 03 | ch1_field_03 | 森と清流 | forest | |
| 04 | ch1_field_04 | 渓谷の小道 | forest | |
| 05 | ch1_field_05 | 森の遺跡 | forest | |
| 06 | ch1_field_06 | 天空の大橋 | bridge | 強敵 f6_3 |
| 07 | ch1_field_07 | 風の高原 | highland | |
| 08 | ch1_field_08 | 古代遺跡の道（S字） | highland | |
| 09 | ch1_field_09 | 大会地方 | highland | |
| 10 | ch1_field_10 | 大会会場 | highland | ライバル f10_3（強制停止）・ゴール f10_5 |
