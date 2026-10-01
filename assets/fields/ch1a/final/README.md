# Chapter 1「はじまりの草原」Pattern A の正式背景（2026-10-02）

出どころ：ユーザー提供の ZIP `mismon_ch1_patternA_final_assets.zip`（README.txt：01〜14 がフィールド、15 が到着イベント専用、ランク選択画面の参考画像）。

## 加工

- 元の JPEG（762×1536）を同じ大きさの WebP（品質86）へ変換しただけ（切り抜き・色の変更なし）。
- `tournament_rank_select_reference.jpg`（大会のランク選択画面の参考画像）はデザインの参考にしただけで、ゲームには入れていない（画面は HTML/CSS で作った）。

## 使い方（js/chapter/configs/ch1a.js の BACKGROUNDS・arrival）

| ファイル | 表示名【暫定】 | マス数 | 備考 |
|---|---|---|---|
| field/ch1_bg_01.webp | 旅立ちの小道 | 5 | スタート w1_0 |
| field/ch1_bg_02.webp | 木漏れ日の森道 | 5 | |
| field/ch1_bg_03.webp | 清流の石橋 | 5 | |
| field/ch1_bg_04.webp | 遺跡の門 | 5 | |
| field/ch1_bg_05.webp | 滝の見える道 | 3 | |
| field/ch1_bg_06.webp | 大樹の森 | 3 | |
| field/ch1_bg_07.webp | 深い森の小道 | 3 | |
| field/ch1_bg_08.webp | 水道橋の見える道 | 4 | |
| field/ch1_bg_09.webp | 天空の大橋 | 6 | 強敵 w9_3 |
| field/ch1_bg_10.webp | 風の丘 | 5 | |
| field/ch1_bg_11.webp | 古塔の遺跡 | 5 | |
| field/ch1_bg_12.webp | 遺跡の高台 | 4 | |
| field/ch1_bg_13.webp | 城へ続く道 | 4 | |
| field/ch1_bg_14.webp | 大会会場の門前 | 3 | ライバル w14_0（強制停止）・ゴール w14_2 |
| event/ch1_bg_15_event.webp | 公式大会会場・正門前 | なし | 到着イベント専用（マス・サイコロなし） |

合計 60 マス（59歩）。マスUIの正式素材は未着（config.tileUI。今は位置確認専用の仮表示）。マス数は、各画像の「使う範囲」（手前 y 0.87 〜 道が細くなりすぎる手前）の道の長さ（奥行き補正込み）に比例して配分した。
