// =========================================================
// Audio Registry（2026-10-02）：正式な BGM・SE の対応表。ここだけを変えれば曲・SE を差し替えられる（画面やイベントのコードにファイル名は無い）
//  BGM_REGISTRY：場面（MMAUDIO.SCENES）→ { src, gain, loop, fallback }
//    src      ：ファイル（文字列）。配列なら先頭から順に、そのブラウザで再生できる形式を選ぶ（例：['….ogg', '….m4a']）
//    gain     ：素材ごとの音量の補正（1＝そのまま。素材の元音量の差をここで合わせる。ファイルは加工しない）
//    loop     ：既定 true
//    fallback ：この場面に曲が無いとき、代わりに使う場面（例：RARE_WILD_BATTLE は WILD_BATTLE の曲）。専用の曲が届いたら src を書く
//    登録の無い場面は index.html の合成音（LEGACY_BGM）で鳴る
//  SE_REGISTRY：出来事（MMAUDIO.SE）→ { src, gain }。登録の無い出来事は合成音（index.html の LEGACY_SE。表に無いものは鳴らない）
//  ファイルの置き場：assets/audio/bgm/<素材パック>/、assets/audio/se/<素材パック>/（出どころ・ライセンスは AUDIO_CREDITS.md）
//  音量の目安：BGM は約 -18 LUFS、SE は約 -16 LUFS に gain でそろえる（ピークが 0 dBFS を超えないよう上限あり）
//  【暫定】2026-10-02 夜の選定 → 2026-10-03 に iPhone の試遊の結果で見直し（NG は silent）→ 同日 第3弾（alkakrab Vol.3 を採用。HydroGene 16-bit は今回は不採用）。曲名・解析で選んだもので、最終判断は試聴。PGS の曲は暫定の試遊用（新しく採用しない）
// =========================================================
(function (root) {
  'use strict';
  const BGM_DIR = './assets/audio/bgm/', SE_DIR = './assets/audio/se/';
  const PGS = BGM_DIR + 'pgs_fantasy_rpg/';            // PGS Fantasy RPG Music Pack（JP Soundworks。CC BY 4.0）
  const UI = SE_DIR + 'interface_sfx_pack_1/';        // Interface SFX Pack 1（ObsydianX。CC0）
  const IV = SE_DIR + 'ivokard/';                     // Mix of SFX by Ivokard（CC0）
  const AK = BGM_DIR + 'alkakrab_fantasy_rpg_vol3/';  // alkakrab「Free 25 Fantasy RPG Game Tracks Vol.3」（商用利用可・クレジット任意。AUDIO_CREDITS.md）
  const AKSE = SE_DIR + 'alkakrab_fantasy_rpg_vol3/'; // 同じパックの Fx（短い効果音）

  // 書き方：{ src, gain, loopStart, loopEnd, loopXfade } ＝ファイルで鳴らす（loopEnd を書くと、曲の終わりのフェードアウトの前で loopStart へクロスフェードで戻る。秒）／{ fallback: '場面' } ＝ほかの場面の曲を使う／{ silent: true } ＝鳴らさない（合成音にも落とさない。試遊で「合わない」となった音の一時的な置き場）／行が無い ＝合成音
  //  【2026-10-03 実機試遊（iPhone）の結果】で NG になった音は silent にした（追加の音源パックで選び直す。行の横の「待ち」）
  const BGM_REGISTRY = {
    // ---- 開始画面・街・施設 ----
    TITLE:      { src: PGS + 'event_music_1.ogg', gain: 0.85 },        // 開始画面は最初のタップまで音を出せない（ブラウザの制約）→ 名前登録の画面まで続ける【暫定】
    TOWN:       { silent: true },                                     // 2026-10-03 第4弾の試遊で NG → 無音（代わりの音は選ばない）。旧：alkakrab「Tranquil Radiance」（AUDIO_CREDITS.md に記録）
    MARKET:     { src: PGS + 'town_village_theme_2.ogg', gain: 0.9 },   // 試遊で OK（変更しない）
    RANCH:      { src: PGS + 'town_village_theme_3.ogg', gain: 0.8 },   // 77秒・温かい【暫定】
    LABORATORY: { src: PGS + 'event_music_2.ogg', gain: 0.65 },        // 103秒・ゆっくり・神秘的【暫定】
    FARM:       { silent: true },                                     // 2026-10-03 第4弾の試遊で NG → 無音（代わりの音は選ばない）。旧：alkakrab「Lost River」（AUDIO_CREDITS.md に記録）
    // TRAINING：合う曲が無い → 合成音（LEGACY_BGM）
    // ---- Chapter ----
    CHAPTER_1:  { silent: true },                                     // 待ち：Dungeon-Exploration Music 1 は試遊で NG。第3弾の候補 alkakrab「Epic Quest」「Forest of Mysteries」は解析で戦闘曲と同じくらい忙しい（40ターン聞くには強すぎる）ため見送り
    // CHAPTER_2〜4：追加パックで選定（今は合成音）
    // ---- 大会：受付（到着・ランク選択）→ 順位表 → 対戦相手の発表・能力比較 → 実戦 ----
    //  受付・順位表・結果の曲（PGS Event Music 4）は 2026-10-03 第4弾の試遊で NG → 無音（代わりの音は選ばない）
    TOURNAMENT_ENTRY:       { silent: true },   // 大会会場への到着・受付・ランク選択
    TOURNAMENT_LOBBY_LOW:   { silent: true },   // 順位表（E〜C）
    TOURNAMENT_LOBBY_HIGH:  { silent: true },   // 順位表（B〜S）
    TOURNAMENT_MATCHUP:     { silent: true },   // 対戦相手の発表・能力比較（1枚の画面）
    RESULT:                 { silent: true },   // 大会の結果
    // ---- 実戦（「FIGHT!」の開始音のあとで始まる）----
    WILD_BATTLE:            { src: PGS + 'battle_music_1.ogg', gain: 0.58 },   // 104秒・147BPM【暫定】
    RARE_WILD_BATTLE:       { fallback: 'WILD_BATTLE' },                       // 専用曲が届くまで野生と同じ
    RIVAL_BATTLE:           { src: AK + 'action_2_battle_of_the_skies.ogg', gain: 0.74, loopStart: 0, loopEnd: 110, loopXfade: 0.2 },   // 第3弾試遊候補：alkakrab「Battle of the Skies」117秒・140BPM。110秒の終わりの一撃のあとの余韻の前で頭へ
    TOURNAMENT_BATTLE_LOW:  { src: PGS + 'battle_music_2.ogg', gain: 0.57 },   // 大会 E〜C。92秒・178BPM【暫定】
    TOURNAMENT_BATTLE_HIGH: { src: AK + 'action_1_clash_of_arcane_titans.ogg', gain: 0.71, loopStart: 0, loopEnd: 86.3, loopXfade: 0.2 },   // 第3弾試遊候補（大会 B〜S）：alkakrab「Clash of Arcane Titans」89秒・150BPM。86秒の終わりのあとの余韻の前で頭へ
    SPECIAL_BATTLE:         { fallback: 'TOURNAMENT_BATTLE_HIGH' },            // 入口が無い（旧「師匠との特訓」）。将来の特殊戦は上位の曲を仮に使う
  };

  const SE_REGISTRY = {
    // ---- UI（Interface SFX Pack 1）----
    TITLE_START: { silent: true },   // 開始画面の「タップしてはじめる」：2026-10-03 第4弾の試遊で NG → 無音（代わりの音は選ばない）（合成のファンファーレにも落とさない）
    UI_CONFIRM:  { silent: true },   // ボタン全般・街のコマンド（通常のコマンドのタップ）：2026-10-03 第4弾の試遊で NG → 無音（代わりの音は選ばない）
    UI_CANCEL:   { src: UI + 'back_style_4_002.ogg', gain: 0.95 },
    UI_ERROR:    { src: UI + 'error_style_4_002.ogg', gain: 0.7 },
    UI_OPEN:     { src: UI + 'confirm_style_4_001.ogg', gain: 0.8 },
    UI_SELECT:   { src: UI + 'cursor_style_2.ogg', gain: 2.5 },        // 元が小さい（-26 LUFS）
    UI_TAB:      { src: UI + 'cursor_style_4.ogg', gain: 3.5 },        // 元が小さい（-29 LUFS）
    // ---- Chapter ----
    CHAPTER_START: { src: AKSE + 'fx_2.ogg', gain: 3.0 },              // 第3弾試遊候補：alkakrab Fx 2（2秒・低くふくらんで消える音）。元が小さい（-28 LUFS）
    DICE_THROW: { silent: true },                                     // 待ち：jump_2 は試遊で NG（投げる音＝振る・転がる音を追加パックから）
    DICE_LAND:  { silent: true },   // サイコロが地面に最初に触れた：2026-10-03 第4弾の試遊で NG → 無音（代わりの音は選ばない）
    DICE_ROLL:  { silent: true },   // 出目の面を見せ始めた（停止のあと）：2026-10-03 第4弾の試遊で NG → 無音（代わりの音は選ばない）
    DICE_STOP:  { silent: true },   // サイコロが見た目の上で完全に止まったフレーム（dice-renderer の dice.stop）。停止の音を将来入れるならここ（今は無音）
    STEP:       { silent: true },                                     // 待ち：1マスごとの足音（pluck_4）は試遊で NG。耳障りでない短い低い足音を追加パックから（止まるマスでは鳴らさない）
    TILE_STOP:  { silent: true },   // 通常マスに止まった：2026-10-03 第4弾の試遊で NG → 無音（代わりの音は選ばない）（マスの光る演出は残す）
    STAT_UP:    { src: UI + 'confirm_style_3_004.ogg', gain: 0.47 },  // 能力UP：1秒ほどの明るい決定音（旧 powerup は NG）【要試聴】
    GOLD_GET:   { src: IV + 'bell.ogg', gain: 7.0 },                  // 元が小さい（-36 LUFS）
    CHEST_OPEN: { src: UI + 'confirm_style_6_001.ogg', gain: 0.85 },
    EVENT:      { src: IV + 'ping.ogg', gain: 5.0 },
    WILD_ALERT: { src: AKSE + 'fx_3.ogg', gain: 5.0, maxMs: 2000, fadeMs: 700 },   // 第3弾試遊候補：alkakrab Fx 3（低い一撃。元は8秒の余韻 → 再生を2秒にして最後の0.7秒で下げる。ファイルは変えない）
    TOURNAMENT_ARRIVAL: { silent: true },   // 大会会場への到着：2026-10-03 第4弾の試遊で NG → 無音（代わりの音は選ばない）（ほかの Fx を使い回さない）
    // ---- 大会・バトル ----
    MATCHUP:       { silent: true },   // 対戦相手の発表（大会の対戦前の画面）：2026-10-03 第4弾の試遊で NG → 無音（代わりの音は選ばない）。旧：alkakrab Fx 1
    BATTLE_START:  { src: IV + 'bass_thud_electric.ogg', gain: 1.5 }, // 実戦の開始（「FIGHT!」）→ 0.45秒後に戦闘の BGM【要試聴】
    ROULETTE_STOP: { src: UI + 'confirm_style_2_004.ogg', gain: 0.45 },  // 技ルーレットの STOP（旧：攻撃の音 attack_1 が鳴っていた）【要試聴】
    BATTLE_ATTACK: { src: IV + 'attack_1.ogg', gain: 2.8 },
    BATTLE_HIT:    { src: IV + 'hit_1.ogg', gain: 3.3 },
    BATTLE_CRIT:   { src: IV + 'hit_2.ogg', gain: 1.4 },
    // BATTLE_MISS・BATTLE_BLOCK・BUFF・DEBUFF・HEAL・ROULETTE_TICK・BATTLE_INTRO・SWOOSH：合う素材が無い → 合成音
    // ---- 進行 ----
    VICTORY:          { src: UI + 'confirm_style_6_004.ogg', gain: 0.8 },
    CHAPTER_CLEAR:    { src: UI + 'confirm_style_6_004.ogg', gain: 0.8 },
    TOURNAMENT_START: { src: UI + 'confirm_style_1_001.ogg', gain: 0.65 },
    UNLOCK:           { src: UI + 'confirm_style_6_002.ogg', gain: 1.3 },
    REWARD:           { src: UI + 'confirm_style_6_002.ogg', gain: 1.3 },
  };

  root.MMAUDIO_REGISTRY = Object.freeze({ bgm: BGM_REGISTRY, se: SE_REGISTRY });
  try { if (root.MMAUDIO && typeof root.MMAUDIO.registerAll === 'function') root.MMAUDIO.registerAll(root.MMAUDIO_REGISTRY); } catch (e) { /* 登録に失敗してもゲームは止めない（合成音で動く） */ }
})(typeof window !== 'undefined' ? window : globalThis);
