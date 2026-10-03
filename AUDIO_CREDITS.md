# AUDIO_CREDITS — 音源の出どころ・ライセンス・クレジット

ミスティックモンスターズ（Mystic Monsters）で使っている BGM・SE の記録。素材を足したら、この表と `js/audio/audio-registry.js` を更新する。
ZIP の README・LICENSE の原文は、受け取った ZIP の中にある（リポジトリには採用した音源ファイルだけを置き、ZIP はそのまま入れない）。

## 使用中の素材（2026-10-02 夜・第1弾）

| 素材パック | 作者 | 配布元 | ライセンス | 商用利用 | クレジット | 置き場 |
|---|---|---|---|---|---|---|
| PGS Fantasy RPG Music Pack（BGM） | JP Soundworks（公開：Platonic Game Studio） | ZIP の README：https://www.youtube.com/c/JPSoundworks/ ・ https://store.steampowered.com/developer/platonicgamestudio | CC BY 4.0（https://creativecommons.org/licenses/by/4.0/）。README の原文：「You are free to use this for your Free and Commercial Projects … As long you credits JP SOUNDWORKS」「DO NOT REPOST OR SELL THIS MUSIC」 | 可（表記が条件） | **必須**：「Music by JP Soundworks (https://www.youtube.com/c/JPSoundworks/)」。「Pack Published by Platonic Game Studio」は任意 | assets/audio/bgm/pgs_fantasy_rpg/ |
| Interface SFX Pack 1（OGG 版・SE） | ObsydianX | https://obsydianx.itch.io/interface-sfx-pack-1（ZIP の Ogg/README.txt） | CC0 | 可 | 不要 | assets/audio/se/interface_sfx_pack_1/ |
| Free 25 Fantasy RPG Game Tracks Vol.3（BGM・Fx） | alkakrab（OGG の埋め込み情報 ARTIST=alkakrab・2023） | https://alkakrab.itch.io/free-25-fantasy-rpg-game-tracks | 配布ページに「Absolutely Free For Commercial use」（ユーザー確認 2026-10-03） | 可 | 必須ではない（出典はこの表に記録） | assets/audio/bgm/alkakrab_fantasy_rpg_vol3/・assets/audio/se/alkakrab_fantasy_rpg_vol3/ |
| High Quality 16-bit RPG Music（28曲） | HydroGene | https://hydrogene.itch.io/high-quality-16-bit-music | CC0 1.0（ユーザー確認 2026-10-03。商用可・クレジット不要・加工可） | 可 | 不要 | 今回は採用なし（受け取り・解析のみ） |
| Mix of SFX by Ivokard（SE） | Ivokard | ZIP の License.txt（SNS：https://www.youtube.com/@ivokard ほか） | CC0（Creative Commons Zero。「free to use in personal, educational and commercial projects」） | 可 | 不要 | assets/audio/se/ivokard/ |

### 正式なクレジット表記（ゲーム内のクレジット画面・配布ページに載せる文）

```
Music by JP Soundworks (https://www.youtube.com/c/JPSoundworks/)
Pack Published by Platonic Game Studio
Music: "Free 25 Fantasy RPG Game Tracks Vol.3" by alkakrab (https://alkakrab.itch.io/free-25-fantasy-rpg-game-tracks)
Sound effects: Interface SFX Pack 1 by ObsydianX (CC0), Mix of SFX by Ivokard (CC0)
```

CC0 の2つは表記不要だが、礼儀として載せる。

### 要確認（判断待ち）

- PGS Fantasy RPG Music Pack の README には CC BY 4.0 と並んで「DO NOT REPOST OR SELL THIS MUSIC」とある。このリポジトリは公開（GitHub Pages）なので、採用した OGG ファイルは誰でも取得できる状態になる。ゲームの素材として置くことは CC BY の範囲（表記つき）だが、「パックの再配布」と受け取られないよう、**ZIP 全体や未採用の曲は置かない**（今は採用した10曲だけ）。公開のままでよいかは仕様側の判断。

## 2026-10-03 第4弾の試遊で NG → 無音にした音（ファイルは外した。下の表の出どころ・ライセンスの記録は残す）

「NG の音を別の場面へ使い回さない」「似た音を判断で選ばない」「素材が無ければ無音」（ユーザー指示）。registry は `silent: true`（合成音にも落とさない）。

| 外した素材（パック・元ファイル） | 使っていた所 |
|---|---|
| alkakrab Vol.3「Ambient 4.ogg（Tranquil Radiance）」 | TOWN（街） |
| alkakrab Vol.3「Ambient 3.ogg（Lost River）」 | FARM（旧ファーム） |
| PGS「Event Music 4.ogg」 | 大会の受付・順位表・結果（TOURNAMENT_ENTRY・LOBBY_LOW／HIGH・RESULT） |
| alkakrab Vol.3「Fx 1.ogg」 | MATCHUP（対戦相手の発表＝大会の対戦前の画面） |
| Interface SFX Pack 1「confirm_style_1_004.ogg」 | TITLE_START（開始画面のタップ） |
| Interface SFX Pack 1「confirm_style_5_001.ogg」 | UI_CONFIRM（通常のコマンドのタップ） |
| Ivokard「pluck_3.ogg」 | DICE_LAND（サイコロの着地） |
| Ivokard「ping.ogg」の DICE_ROLL への割り当て | DICE_ROLL（出目＝サイコロの停止の音。ping は EVENT ではそのまま） |
| Ivokard「pluck_5.ogg」 | TILE_STOP（通常マスに止まった） |

ほかに無音のまま：DICE_THROW（サイコロを振る）・DICE_STOP（サイコロが完全に止まったフレームの差し込み口）・STEP・TOURNAMENT_ARRIVAL（大会会場への到着）・TOURNAMENT_MATCHUP（BGM）・CHAPTER_1（BGM）。大会開始の演出の合成音（風切り音）も鳴らさない。OK のまま：CHAPTER_START（alkakrab Fx 2）・MARKET ほか。

## 使用したファイル（2026-10-03 の iPhone 試遊の結果で見直し）

### BGM（PGS Fantasy RPG Music Pack → assets/audio/bgm/pgs_fantasy_rpg/）

PGS の曲は「暫定の試遊用」。新しく採用しない（公開リポジトリから直接取得できるため。正式リリース前に再配布条件のはっきりした素材への置き換えを検討）。

| ZIP の元ファイル | リポジトリのファイル | 場面（registry） | 長さ | 元の音量（LUFS） | gain |
|---|---|---|---:|---:|---:|
| Event Music 1.ogg | event_music_1.ogg | TITLE（名前登録の画面まで） | 80秒 | -16.4 | 0.85 |
| Town-Village Theme 2.ogg | town_village_theme_2.ogg | MARKET（試遊で OK） | 61秒 | -16.9 | 0.9 |
| Town-Village Theme 3.ogg | town_village_theme_3.ogg | RANCH | 77秒 | -16.1 | 0.8 |
| Event Music 2.ogg | event_music_2.ogg | LABORATORY | 103秒 | -14.3 | 0.65 |
| Battle Music 1.ogg | battle_music_1.ogg | WILD_BATTLE（RARE_WILD_BATTLE は fallback で同じ曲。RIVAL_BATTLE は第3弾で alkakrab へ） | 104秒 | -13.1 | 0.58 |
| Battle Music 2.ogg | battle_music_2.ogg | TOURNAMENT_BATTLE_LOW（HIGH は第3弾で alkakrab へ） | 92秒 | -13.3 | 0.57 |
| Event Music 4.ogg | （外した）event_music_4.ogg | 旧 TOURNAMENT_LOBBY_LOW（受付・順位表・結果）→ 2026-10-03 第4弾で NG・無音 | 88秒 | -14.6 | 0.68 |

外した曲（2026-10-03 の試遊で NG。ファイルも削除）：Town-Village Theme 1（TOWN）、Event Music 3（FARM）、Dungeon-Exploration Music 1（CHAPTER_1）。第3弾で TOWN・FARM は alkakrab へ。CHAPTER_1 はまだ無音（registry の silent）。

### SE（Interface SFX Pack 1 → assets/audio/se/interface_sfx_pack_1/）

| ファイル | 出来事 |
|---|---|
| （外した）confirm_style_1_004.ogg | 旧 TITLE_START（開始画面のタップ）→ 第4弾で NG・無音 |
| （外した）confirm_style_5_001.ogg | 旧 UI_CONFIRM（ボタン全般・街のコマンド）→ 第4弾で NG・無音 |
| confirm_style_4_001.ogg | UI_OPEN |
| back_style_4_002.ogg | UI_CANCEL |
| error_style_4_002.ogg | UI_ERROR |
| cursor_style_2.ogg | UI_SELECT |
| cursor_style_4.ogg | UI_TAB |
| confirm_style_3_004.ogg | STAT_UP |
| confirm_style_2_004.ogg | ROULETTE_STOP（技ルーレットの STOP） |
| confirm_style_6_001.ogg | CHEST_OPEN |
| confirm_style_6_004.ogg | VICTORY・CHAPTER_CLEAR |
| confirm_style_6_002.ogg | UNLOCK・REWARD |
| confirm_style_1_001.ogg | TOURNAMENT_START |

外した（試遊で NG）：confirm_style_4_002（旧 UI_CONFIRM）。

### SE（Mix of SFX by Ivokard → assets/audio/se/ivokard/）

| ファイル | 出来事 |
|---|---|
| （外した）pluck_3.ogg | 旧 DICE_LAND → 第4弾で NG・無音 |
| ping.ogg | EVENT（旧 DICE_ROLL は第4弾で NG・無音） |
| （外した）pluck_5.ogg | 旧 TILE_STOP → 第4弾で NG・無音 |
| bell.ogg | GOLD_GET |
| bass_thud_electric.ogg | BATTLE_START（実戦の開始「FIGHT!」） |
| attack_1.ogg | BATTLE_ATTACK |
| hit_1.ogg | BATTLE_HIT |
| hit_2.ogg | BATTLE_CRIT |

外した（試遊で NG）：jump_2（DICE_THROW）・pluck_4（STEP）・powerup（STAT_UP）。第3弾で外した：bass_thud（MATCHUP は alkakrab Fx 1 へ）。まだ無音（silent）：DICE_THROW・STEP・TOURNAMENT_ARRIVAL（第3弾のパックにも合う音が無い）。

### BGM・Fx（alkakrab「Free 25 Fantasy RPG Game Tracks Vol.3」→ assets/audio/bgm|se/alkakrab_fantasy_rpg_vol3/）【2026-10-03 第3弾試遊候補】

受け取ったもの：OGG 版を4つの ZIP（Fantasy_RPG_Music_Pack・2・3・4）に分けたもの＝1つのパック（元の配布物には MP3／WAV もある。容量のため OGG だけを受け取った）。採用したファイルだけを置き、名前は「元の番号_曲名」の英小文字にした（中身はバイト単位で同一・無加工）。

| ZIP の元ファイル（曲名＝埋め込み情報） | リポジトリのファイル | 使う所 | 長さ | 元の音量（LUFS） | gain | ループ |
|---|---|---|---:|---:|---:|---|
| Ambient 4.ogg「Tranquil Radiance」 | （外した）bgm/…/ambient_4_tranquil_radiance.ogg | 旧 TOWN（街）→ 第4弾で NG・無音 | 129秒 | -16.3 | 0.8 | 0〜119秒・3秒のクロスフェード（119秒からの最後のフェードは使わない） |
| Ambient 3.ogg「Lost River」 | （外した）bgm/…/ambient_3_lost_river.ogg | 旧 FARM（旧ファーム）→ 第4弾で NG・無音 | 111秒 | -16.6 | 0.85 | 0〜105秒・3秒 |
| Action 2.ogg「Battle of the Skies」 | bgm/…/action_2_battle_of_the_skies.ogg | RIVAL_BATTLE（ライバル戦） | 117秒 | -15.2 | 0.74 | 0〜110秒・0.2秒（終わりの一撃のあとの余韻は使わない） |
| Action 1.ogg「Clash of Arcane Titans」 | bgm/…/action_1_clash_of_arcane_titans.ogg | TOURNAMENT_BATTLE_HIGH（大会 B〜S）・SPECIAL_BATTLE（fallback） | 89秒 | -14.8 | 0.71 | 0〜86.3秒・0.2秒 |
| Fx 2.ogg | se/…/fx_2.ogg | CHAPTER_START（Chapter 開始・スタート地点へのズームのあと） | 2秒 | -27.7 | 3.0 | — |
| Fx 3.ogg | se/…/fx_3.ogg | WILD_ALERT（野生モンスターの遭遇） | 8秒 → 再生は2秒（最後の0.7秒で下げる） | -32.3 | 5.0 | — |
| Fx 1.ogg | （外した）se/…/fx_1.ogg | 旧 MATCHUP（対戦相手の発表）→ 第4弾で NG・無音 | 7秒 → 再生は2.6秒（最後の0.9秒で下げる） | -31.2 | 4.5 | — |

使っていない：Action 3「Stealthy Infiltration」（潜入の曲）、Action 4「Forest of Mysteries」・Action 5「Epic Quest」（Chapter 1 の候補だったが、解析で戦闘曲と同じくらい忙しい＝40ターン聞くには強すぎるため見送り）、Ambient 1・2・5〜10、Ambience 1〜5、Dark 1〜5（とても小さい・暗い環境音）。

### High Quality 16-bit RPG Music（HydroGene・CC0）

受け取ったもの：OGG 版を5つの ZIP（ogg1〜ogg5）に分けたもの＝1つのパック（28曲。戦闘曲・魔王城は intro／loop／full に分かれている）。今回は採用なし：左右の広がりがとても狭く残響の少ないくっきりした音（SFC 風）で、街・主要施設・Chapter には「チープ・ゲーム感」の試遊結果に近い恐れがあるため、今回は alkakrab を優先した。今後の候補（要試聴）：大会の受付 Royal Castle、Chapter 2〜4 の Unknown Island・Traveling the Sky・Volcanic Crater、戦闘の intro＋loop の組み合わせ。

## 受け取ったが今回は使っていない素材

| 素材 | 理由 |
|---|---|
| RPG Essentials Free（48ファイル・WAV のみ） | WAV は入れない・変換しない方針。ZIP の中にライセンスの記載が無い（表紙の Cover.png だけ）ため、配布元の利用条件を確かめるまで採用しない。候補は AUDIT の完了報告の「明日以降の候補」 |
