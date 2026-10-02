# AUDIO_CREDITS — 音源の出どころ・ライセンス・クレジット

ミスティックモンスターズ（Mystic Monsters）で使っている BGM・SE の記録。素材を足したら、この表と `js/audio/audio-registry.js` を更新する。
ZIP の README・LICENSE の原文は、受け取った ZIP の中にある（リポジトリには採用した音源ファイルだけを置き、ZIP はそのまま入れない）。

## 使用中の素材（2026-10-02 夜・第1弾）

| 素材パック | 作者 | 配布元 | ライセンス | 商用利用 | クレジット | 置き場 |
|---|---|---|---|---|---|---|
| PGS Fantasy RPG Music Pack（BGM） | JP Soundworks（公開：Platonic Game Studio） | ZIP の README：https://www.youtube.com/c/JPSoundworks/ ・ https://store.steampowered.com/developer/platonicgamestudio | CC BY 4.0（https://creativecommons.org/licenses/by/4.0/）。README の原文：「You are free to use this for your Free and Commercial Projects … As long you credits JP SOUNDWORKS」「DO NOT REPOST OR SELL THIS MUSIC」 | 可（表記が条件） | **必須**：「Music by JP Soundworks (https://www.youtube.com/c/JPSoundworks/)」。「Pack Published by Platonic Game Studio」は任意 | assets/audio/bgm/pgs_fantasy_rpg/ |
| Interface SFX Pack 1（OGG 版・SE） | ObsydianX | https://obsydianx.itch.io/interface-sfx-pack-1（ZIP の Ogg/README.txt） | CC0 | 可 | 不要 | assets/audio/se/interface_sfx_pack_1/ |
| Mix of SFX by Ivokard（SE） | Ivokard | ZIP の License.txt（SNS：https://www.youtube.com/@ivokard ほか） | CC0（Creative Commons Zero。「free to use in personal, educational and commercial projects」） | 可 | 不要 | assets/audio/se/ivokard/ |

### 正式なクレジット表記（ゲーム内のクレジット画面・配布ページに載せる文）

```
Music by JP Soundworks (https://www.youtube.com/c/JPSoundworks/)
Pack Published by Platonic Game Studio
Sound effects: Interface SFX Pack 1 by ObsydianX (CC0), Mix of SFX by Ivokard (CC0)
```

CC0 の2つは表記不要だが、礼儀として載せる。

### 要確認（判断待ち）

- PGS Fantasy RPG Music Pack の README には CC BY 4.0 と並んで「DO NOT REPOST OR SELL THIS MUSIC」とある。このリポジトリは公開（GitHub Pages）なので、採用した OGG ファイルは誰でも取得できる状態になる。ゲームの素材として置くことは CC BY の範囲（表記つき）だが、「パックの再配布」と受け取られないよう、**ZIP 全体や未採用の曲は置かない**（今は採用した10曲だけ）。公開のままでよいかは仕様側の判断。

## 使用したファイル

### BGM（PGS Fantasy RPG Music Pack → assets/audio/bgm/pgs_fantasy_rpg/）

| ZIP の元ファイル | リポジトリのファイル | 場面（registry） | 長さ | 元の音量（LUFS） | gain |
|---|---|---|---:|---:|---:|
| Event Music 1.ogg | event_music_1.ogg | TITLE | 80秒 | -16.4 | 0.85 |
| Town-Village Theme 1.ogg | town_village_theme_1.ogg | TOWN | 64秒 | -20.0 | 1.2 |
| Town-Village Theme 2.ogg | town_village_theme_2.ogg | MARKET | 61秒 | -16.9 | 0.9 |
| Town-Village Theme 3.ogg | town_village_theme_3.ogg | RANCH | 77秒 | -16.1 | 0.8 |
| Event Music 2.ogg | event_music_2.ogg | LABORATORY | 103秒 | -14.3 | 0.65 |
| Event Music 3.ogg | event_music_3.ogg | FARM | 65秒 | -19.6 | 1.0 |
| Dungeon-Exploration Music 1.ogg | dungeon_exploration_music_1.ogg | CHAPTER_1 | 65秒 | -13.8 | 0.62 |
| Battle Music 1.ogg | battle_music_1.ogg | WILD_BATTLE（RARE_WILD_BATTLE・RIVAL_BATTLE は fallback で同じ曲） | 104秒 | -13.1 | 0.58 |
| Battle Music 2.ogg | battle_music_2.ogg | TOURNAMENT_BATTLE_LOW（HIGH は fallback で同じ曲） | 92秒 | -13.3 | 0.57 |
| Event Music 4.ogg | event_music_4.ogg | TOURNAMENT_LOBBY_LOW（HIGH・RESULT は fallback で同じ曲） | 88秒 | -14.6 | 0.68 |

使っていない：Album.jpg（ジャケット画像）。11曲中10曲を採用（1曲＝1場面。使い回しは fallback として registry に明記）。

### SE（Interface SFX Pack 1 → assets/audio/se/interface_sfx_pack_1/）

| ファイル | 出来事 |
|---|---|
| confirm_style_4_002.ogg | UI_CONFIRM |
| confirm_style_4_001.ogg | UI_OPEN |
| back_style_4_002.ogg | UI_CANCEL |
| error_style_4_002.ogg | UI_ERROR |
| cursor_style_2.ogg | UI_SELECT |
| cursor_style_4.ogg | UI_TAB |
| confirm_style_6_001.ogg | CHEST_OPEN・CHAPTER_START |
| confirm_style_6_004.ogg | VICTORY・CHAPTER_CLEAR |
| confirm_style_6_002.ogg | UNLOCK・REWARD |
| confirm_style_1_001.ogg | TOURNAMENT_START |

222ファイル中10を採用。ほかは置いていない。

### SE（Mix of SFX by Ivokard → assets/audio/se/ivokard/）

| ファイル | 出来事 |
|---|---|
| jump_2.ogg | DICE_THROW |
| bass_thud.ogg | DICE_LAND |
| ping.ogg | DICE_ROLL・EVENT |
| pluck_4.ogg | STEP |
| pluck_5.ogg | TILE_STOP |
| powerup.ogg | STAT_UP |
| bell.ogg | GOLD_GET |
| bass_thud_electric.ogg | WILD_ALERT |
| hit_2.ogg | BATTLE_START・BATTLE_CRIT |
| attack_1.ogg | BATTLE_ATTACK |
| hit_1.ogg | BATTLE_HIT |

21ファイル中11を採用。ほかは置いていない。

## 受け取ったが今回は使っていない素材

| 素材 | 理由 |
|---|---|
| RPG Essentials Free（48ファイル・WAV のみ） | WAV は入れない・変換しない方針。ZIP の中にライセンスの記載が無い（表紙の Cover.png だけ）ため、配布元の利用条件を確かめるまで採用しない。候補は AUDIT の完了報告の「明日以降の候補」 |
| 28 High Quality 16-bit RPG Music、Fantasy RPG Music Pack Vol.3 | 明日追加（未受領） |
