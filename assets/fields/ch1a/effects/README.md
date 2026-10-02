# Chapter の演出素材（2026-10-02）

出どころ：ユーザー提供の ZIP `mystic-monsters-board-ui-assets-2026-10-01-v2.zip` の `03_board_effects/`。受け取ったファイルは JPEG（市松模様が焼き込み・透過なし）なので、市松模様を推定して取り除き、透過 WebP にした（tiles/README.md と同じ方法。色・形は変えていない）。

| ファイル | 元ファイル | 使い方 |
|---|---|---|
| effect_battle_encounter.webp | effect_battle_encounter.jpeg | 野生バトル突入のカットイン（野生のマスに止まったとき約0.6秒。レア・ライバルには出さない。config.battleTypes.wild.cutin）。X 字の形なので、つながった形を全部残す方法で処理した。明るい背景の上ではリングの周りにごく薄い残りが見えることがある |
| frame_stat_up.webp | frame_stat_up.jpeg | 能力マスの結果の枠（config.effects.statUp）。能力名・数値は HTML で重ねる（画像に文字は入れない） |
| ui_turn_warning.webp | ui_turn_warning.jpeg | 残りターンの警告（config.effects.turnWarning）。出す残りターン（at）は未決＝空＝出さない |

使っていない素材（ZIP にあるがここに入れていないもの）は KNOWN_ISSUES.md の「ボードUI v2・歩行素材（2026-10-02）」。
