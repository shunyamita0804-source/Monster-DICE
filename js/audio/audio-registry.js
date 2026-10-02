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
//  【暫定】2026-10-02 夜の選定。曲名・解析（長さ・ラウドネス・テンポ）で選んだもので、試聴での最終判断は明日（PGS 以外のパックの追加後に再選定）
// =========================================================
(function (root) {
  'use strict';
  const BGM_DIR = './assets/audio/bgm/', SE_DIR = './assets/audio/se/';
  const PGS = BGM_DIR + 'pgs_fantasy_rpg/';            // PGS Fantasy RPG Music Pack（JP Soundworks。CC BY 4.0）
  const UI = SE_DIR + 'interface_sfx_pack_1/';        // Interface SFX Pack 1（ObsydianX。CC0）
  const IV = SE_DIR + 'ivokard/';                     // Mix of SFX by Ivokard（CC0）

  const BGM_REGISTRY = {
    // ---- 開始画面・街・施設 ----
    TITLE:      { src: PGS + 'event_music_1.ogg', gain: 0.85 },        // 80秒・穏やか【暫定】
    TOWN:       { src: PGS + 'town_village_theme_1.ogg', gain: 1.2 },   // 64秒・ゆったり（元が静かなので少し上げる）
    MARKET:     { src: PGS + 'town_village_theme_2.ogg', gain: 0.9 },   // 61秒・にぎやか
    RANCH:      { src: PGS + 'town_village_theme_3.ogg', gain: 0.8 },   // 77秒・温かい
    LABORATORY: { src: PGS + 'event_music_2.ogg', gain: 0.65 },        // 103秒・ゆっくり・神秘的【暫定】
    FARM:       { src: PGS + 'event_music_3.ogg', gain: 1.0 },         // 65秒・静か（最初の1〜2秒はほぼ無音の立ち上がり）【暫定】
    // TRAINING：今夜の素材に合う曲が無い → 合成音（LEGACY_BGM）
    // ---- Chapter ----
    CHAPTER_1:  { src: PGS + 'dungeon_exploration_music_1.ogg', gain: 0.62 },   // 65秒・探索【暫定】
    // CHAPTER_2〜4：明日のパックで選定（今は合成音）
    // ---- バトル ----
    WILD_BATTLE:            { src: PGS + 'battle_music_1.ogg', gain: 0.58 },   // 104秒・147BPM
    RARE_WILD_BATTLE:       { fallback: 'WILD_BATTLE' },                       // 専用曲が届くまで野生と同じ
    RIVAL_BATTLE:           { fallback: 'WILD_BATTLE' },                       // 専用曲が届くまで野生と同じ
    TOURNAMENT_BATTLE_LOW:  { src: PGS + 'battle_music_2.ogg', gain: 0.57 },   // 92秒・178BPM（E〜C）
    TOURNAMENT_BATTLE_HIGH: { fallback: 'TOURNAMENT_BATTLE_LOW' },             // 上位（B〜S）の専用曲が届くまで共通
    // SPECIAL_BATTLE：入口が無い（旧「師匠との特訓」）→ 合成音
    // ---- 大会の受付・順位表・結果 ----
    TOURNAMENT_LOBBY_LOW:   { src: PGS + 'event_music_4.ogg', gain: 0.68 },   // 88秒・105BPM【暫定】
    TOURNAMENT_LOBBY_HIGH:  { fallback: 'TOURNAMENT_LOBBY_LOW' },
    RESULT:                 { fallback: 'TOURNAMENT_LOBBY_LOW' },             // 結果画面は受付の曲を続ける（専用曲は未選定）
  };

  const SE_REGISTRY = {
    // ---- UI（Interface SFX Pack 1。style 4 でそろえる）----
    UI_CONFIRM: { src: UI + 'confirm_style_4_002.ogg', gain: 0.75 },
    UI_CANCEL:  { src: UI + 'back_style_4_002.ogg', gain: 0.95 },
    UI_ERROR:   { src: UI + 'error_style_4_002.ogg', gain: 0.7 },
    UI_OPEN:    { src: UI + 'confirm_style_4_001.ogg', gain: 0.8 },
    UI_SELECT:  { src: UI + 'cursor_style_2.ogg', gain: 2.5 },      // 元が小さい（-26 LUFS）
    UI_TAB:     { src: UI + 'cursor_style_4.ogg', gain: 3.5 },      // 元が小さい（-29 LUFS）
    // ---- Chapter（Mix of SFX by Ivokard）----
    DICE_THROW: { src: IV + 'jump_2.ogg', gain: 1.2 },
    DICE_LAND:  { src: IV + 'bass_thud.ogg', gain: 1.0 },
    DICE_ROLL:  { src: IV + 'ping.ogg', gain: 6.0 },                // 出目が決まった（元が小さい -32 LUFS）
    STEP:       { src: IV + 'pluck_4.ogg', gain: 1.6 },             // 1マスごとの足音（控えめ）
    TILE_STOP:  { src: IV + 'pluck_5.ogg', gain: 2.0 },
    STAT_UP:    { src: IV + 'powerup.ogg', gain: 1.2 },
    GOLD_GET:   { src: IV + 'bell.ogg', gain: 7.0 },                // 元が小さい（-36 LUFS）
    CHEST_OPEN: { src: UI + 'confirm_style_6_001.ogg', gain: 0.85 },
    EVENT:      { src: IV + 'ping.ogg', gain: 5.0 },
    WILD_ALERT: { src: IV + 'bass_thud_electric.ogg', gain: 1.0 },
    // ---- バトル ----
    BATTLE_START:  { src: IV + 'hit_2.ogg', gain: 1.4 },
    BATTLE_ATTACK: { src: IV + 'attack_1.ogg', gain: 2.8 },
    BATTLE_HIT:    { src: IV + 'hit_1.ogg', gain: 3.3 },
    BATTLE_CRIT:   { src: IV + 'hit_2.ogg', gain: 1.4 },
    // BATTLE_MISS・BATTLE_BLOCK・BUFF・DEBUFF・HEAL・ROULETTE_TICK・BATTLE_INTRO・SWOOSH：合う素材が無い → 合成音
    // ---- 進行（Interface SFX Pack 1 の長めの決定音。ジングル代わり【暫定・要試聴】）----
    VICTORY:          { src: UI + 'confirm_style_6_004.ogg', gain: 0.8 },
    CHAPTER_START:    { src: UI + 'confirm_style_6_001.ogg', gain: 0.85 },
    CHAPTER_CLEAR:    { src: UI + 'confirm_style_6_004.ogg', gain: 0.8 },
    TOURNAMENT_START: { src: UI + 'confirm_style_1_001.ogg', gain: 0.65 },
    UNLOCK:           { src: UI + 'confirm_style_6_002.ogg', gain: 1.3 },
    REWARD:           { src: UI + 'confirm_style_6_002.ogg', gain: 1.3 },
  };

  root.MMAUDIO_REGISTRY = Object.freeze({ bgm: BGM_REGISTRY, se: SE_REGISTRY });
  try { if (root.MMAUDIO && typeof root.MMAUDIO.registerAll === 'function') root.MMAUDIO.registerAll(root.MMAUDIO_REGISTRY); } catch (e) { /* 登録に失敗してもゲームは止めない（合成音で動く） */ }
})(typeof window !== 'undefined' ? window : globalThis);
