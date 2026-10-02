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
//  【暫定】2026-10-02 夜の選定 → 2026-10-03 に iPhone の試遊の結果で見直し（NG は silent）。曲名・解析で選んだもので、最終判断は試聴。PGS の曲は暫定の試遊用（新しく採用しない）
// =========================================================
(function (root) {
  'use strict';
  const BGM_DIR = './assets/audio/bgm/', SE_DIR = './assets/audio/se/';
  const PGS = BGM_DIR + 'pgs_fantasy_rpg/';            // PGS Fantasy RPG Music Pack（JP Soundworks。CC BY 4.0）
  const UI = SE_DIR + 'interface_sfx_pack_1/';        // Interface SFX Pack 1（ObsydianX。CC0）
  const IV = SE_DIR + 'ivokard/';                     // Mix of SFX by Ivokard（CC0）

  // 書き方：{ src, gain } ＝ファイルで鳴らす／{ fallback: '場面' } ＝ほかの場面の曲を使う／{ silent: true } ＝鳴らさない（合成音にも落とさない。試遊で「合わない」となった音の一時的な置き場）／行が無い ＝合成音
  //  【2026-10-03 実機試遊（iPhone）の結果】で NG になった音は silent にした（追加の音源パックで選び直す。行の横の「待ち」）
  const BGM_REGISTRY = {
    // ---- 開始画面・街・施設 ----
    TITLE:      { src: PGS + 'event_music_1.ogg', gain: 0.85 },        // 開始画面は最初のタップまで音を出せない（ブラウザの制約）→ 名前登録の画面まで続ける【暫定】
    TOWN:       { silent: true },                                     // 待ち：Town-Village Theme 1 は試遊で NG（チープ・ゲーム感が強い）。落ち着いた王道ファンタジーの拠点の曲を追加パックから
    MARKET:     { src: PGS + 'town_village_theme_2.ogg', gain: 0.9 },   // 試遊で OK（変更しない）
    RANCH:      { src: PGS + 'town_village_theme_3.ogg', gain: 0.8 },   // 77秒・温かい【暫定】
    LABORATORY: { src: PGS + 'event_music_2.ogg', gain: 0.65 },        // 103秒・ゆっくり・神秘的【暫定】
    FARM:       { silent: true },                                     // 待ち：Event Music 3 は試遊で NG。仮の「冒険準備の拠点」の曲を追加パックから（ファームは後で再設計）
    // TRAINING：合う曲が無い → 合成音（LEGACY_BGM）
    // ---- Chapter ----
    CHAPTER_1:  { silent: true },                                     // 待ち：Dungeon-Exploration Music 1 は試遊で NG。草原の冒険の始まり（開放感・自然・明るさ）の曲を追加パックから
    // CHAPTER_2〜4：追加パックで選定（今は合成音）
    // ---- 大会：受付（到着・ランク選択）→ 順位表 → 対戦相手の発表・能力比較 → 実戦 ----
    TOURNAMENT_ENTRY:       { fallback: 'TOURNAMENT_LOBBY_LOW' },             // 大会会場への到着・受付・ランク選択（専用曲が届くまで順位表と同じ曲）
    TOURNAMENT_LOBBY_LOW:   { src: PGS + 'event_music_4.ogg', gain: 0.68 },   // 順位表（E〜C）。88秒・105BPM【暫定】
    TOURNAMENT_LOBBY_HIGH:  { fallback: 'TOURNAMENT_LOBBY_LOW' },
    TOURNAMENT_MATCHUP:     { silent: true },                                 // 対戦相手の発表（VS）・能力比較：BGM を止めて緊張感（発表の音 MATCHUP だけ）。専用曲を使うならここ
    RESULT:                 { fallback: 'TOURNAMENT_LOBBY_LOW' },             // 結果画面は受付の曲（専用曲は未選定）
    // ---- 実戦（「FIGHT!」の開始音のあとで始まる）----
    WILD_BATTLE:            { src: PGS + 'battle_music_1.ogg', gain: 0.58 },   // 104秒・147BPM【暫定】
    RARE_WILD_BATTLE:       { fallback: 'WILD_BATTLE' },                       // 専用曲が届くまで野生と同じ
    RIVAL_BATTLE:           { fallback: 'WILD_BATTLE' },                       // 専用曲が届くまで野生と同じ
    TOURNAMENT_BATTLE_LOW:  { src: PGS + 'battle_music_2.ogg', gain: 0.57 },   // 大会 E〜C。92秒・178BPM【暫定】
    TOURNAMENT_BATTLE_HIGH: { fallback: 'TOURNAMENT_BATTLE_LOW' },             // 上位（B〜S）の専用曲が届くまで共通
    // SPECIAL_BATTLE：入口が無い（旧「師匠との特訓」）→ 合成音
  };

  const SE_REGISTRY = {
    // ---- UI（Interface SFX Pack 1）----
    TITLE_START: { src: UI + 'confirm_style_1_004.ogg', gain: 0.5 },   // 開始画面の「タップしてはじめる」（これ1つだけ鳴る。旧：合成音のファンファーレ）【要試聴】
    UI_CONFIRM:  { src: UI + 'confirm_style_5_001.ogg', gain: 0.68 },  // ボタン全般・街のコマンド：短く控えめ（0.57秒・style 5 で一番低く柔らかい音）【要試聴】
    UI_CANCEL:   { src: UI + 'back_style_4_002.ogg', gain: 0.95 },
    UI_ERROR:    { src: UI + 'error_style_4_002.ogg', gain: 0.7 },
    UI_OPEN:     { src: UI + 'confirm_style_4_001.ogg', gain: 0.8 },
    UI_SELECT:   { src: UI + 'cursor_style_2.ogg', gain: 2.5 },        // 元が小さい（-26 LUFS）
    UI_TAB:      { src: UI + 'cursor_style_4.ogg', gain: 3.5 },        // 元が小さい（-29 LUFS）
    // ---- Chapter ----
    CHAPTER_START: { silent: true },                                  // 待ち：スタート地点へズームしたあとの音（confirm_style_6_001）は試遊で NG
    DICE_THROW: { silent: true },                                     // 待ち：jump_2 は試遊で NG（投げる音＝振る・転がる音を追加パックから）
    DICE_LAND:  { src: IV + 'pluck_3.ogg', gain: 3.1 },               // 着地：0.14秒・低い短い音（投げる音と役割を分ける。旧 bass_thud）【要試聴】
    DICE_ROLL:  { src: IV + 'ping.ogg', gain: 6.0 },                  // 出目が決まった（元が小さい -32 LUFS）
    STEP:       { silent: true },                                     // 待ち：1マスごとの足音（pluck_4）は試遊で NG。耳障りでない短い低い足音を追加パックから（止まるマスでは鳴らさない）
    TILE_STOP:  { src: IV + 'pluck_5.ogg', gain: 2.0 },               // 通常マスに止まった
    STAT_UP:    { src: UI + 'confirm_style_3_004.ogg', gain: 0.47 },  // 能力UP：1秒ほどの明るい決定音（旧 powerup は NG）【要試聴】
    GOLD_GET:   { src: IV + 'bell.ogg', gain: 7.0 },                  // 元が小さい（-36 LUFS）
    CHEST_OPEN: { src: UI + 'confirm_style_6_001.ogg', gain: 0.85 },
    EVENT:      { src: IV + 'ping.ogg', gain: 5.0 },
    WILD_ALERT: { silent: true },                                     // 待ち：モンスターマスの遭遇の音（bass_thud_electric）は試遊で NG
    TOURNAMENT_ARRIVAL: { silent: true },                             // 待ち：大会会場へ着いた音（旧 confirm_style_6_004）は試遊で NG。短いファンファーレを追加パックから
    // ---- 大会・バトル ----
    MATCHUP:       { src: IV + 'bass_thud.ogg', gain: 1.3 },          // 対戦相手の発表（VS の画面）：低い一撃（緊張感）。能力比較の画面では鳴らさない【要試聴】
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
