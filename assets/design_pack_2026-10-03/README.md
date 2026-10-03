# デザイン素材一括（mystic-monsters-design-pack-2026-10-03 part1〜3）の取り扱い

3分割の ZIP（1セット・75枚）。`PACK_README.md`・`manifest.json` は ZIP の原文（無加工）。全75枚の sha256 は manifest と一致（2026-10-03 確認）。
リポジトリには **正式素材の元ファイル（無加工）とゲーム用の派生ファイル**だけを置いた。参考専用・UI参考の画像（02・03・04）はリポジトリに入れていない（ユーザーの手元の ZIP が原本）。

| グループ（manifest の分類） | 中身（実ファイルを目で確認） | 置き場 | 扱い |
|---|---|---|---|
| 01_treasure_chests（FORMAL_DIRECT_ASSETS・20） | 宝箱4種類 × 本体1＋開封4 | assets/chests/（README.md） | **採用**：normal＝chest_01・special＝chest_04（Chapter 1 の宝箱）。4種類はすべて正式素材で、それぞれ別のランク・別の用途（正式の対応表はユーザーから後日）＝chest_02・03 は保存のみ（統合しない）。管理表は ASSET_TABLE.md／asset_table.csv |
| 02_npc_message_ui（UI_REFERENCE・4） | 会話ウィンドウ・名前札・送りマークの見本 | （置かない） | **UI として再構築**：共通会話 MMNPC の CSS（index.html の「共通NPC会話」）をネイビー・アイボリー・細い罫線・小さな金の角飾りへ。画像・文章・キャラは使わない |
| 03_first_town_guide_fina（REFERENCE_ONLY・9） | 参考のフィナ・参考の街 | （置かない） | 参考のみ。正式フィナ・正式の街は変えていない。初回の街案内そのものは仕様が無いため作っていない |
| 04_encounter_tournament_chapter_ui（UI_REFERENCE・10） | ライバル・野生・レア・MATCH UP・能力UP・アイテム獲得・RIVAL・大会進行 | （置かない） | 一部を再構築：RIVAL の一瞬（A1）・レアの後光と「★ レア」。ほかは要確認（下） |
| 05_fusion_effect_sequence（FORMAL_SEQUENCE_ASSETS・10） | **01〜07 は大会・Chapter の UI 参考の絵**（MATCH UP・BATTLE START・会話・アイテム獲得）、**08〜10 だけが研究所の合体装置の絵** | assets/fx/fusion/pack05_fusion_effect_sequence/ | 保存のみ（要確認：フォルダ分けの食い違い。研究所の合体UIも未実装） |
| 06_encounter_tournament_chapter_ui_cont（UI_REFERENCE・7） | **研究所の合体装置が光る7枚**（合体の連続コマに見える） | assets/fx/fusion/pack06_encounter_tournament_chapter_ui_cont/ | 保存のみ（要確認。05 の 08〜10 と合わせて10枚と思われるが、順番・組み合わせは推測しない） |
| 07_wild_sacred_beast_encounter_sequence（FORMAL_SEQUENCE_ASSETS・8） | 森の遺跡に光が集まる8コマ | assets/fx/sacred_beast/ | 保存＋再生器の準備（js/fx/sequence.js の MMSEQ.PRESETS.sacredBeast）。聖獣のシステムが無いため、どこからも呼ばない |
| 08_item_shop_npc（FORMAL_ASSET・1） | アイテム屋のNPC（全身） | assets/shop/ | **採用**：アイテム屋の画面に立ち姿（名前は未確定＝名前・セリフは出さない） |
| 09_item_shop_background（FORMAL_ASSET・1） | アイテム屋の店内 | assets/shop/ | **採用**：アイテム屋の画面の背景 |
| 10_tournament_reward_unlock_fx（FORMAL_FX_ASSETS・4） | 光の門・光の柱・宝の山・光の鳳凰（市松模様が JPEG に焼き込み） | assets/tournament/reward_unlock/original/ | 保存のみ：透過化を試したが、光の中に市松模様が残り白い芯が欠ける＝**透過元 PNG 待ち** |
| 11_tournament_rank_emblems_sheet（FORMAL_SHEET_ASSET・1） | エンブレム6種（市松模様が焼き込み） | assets/tournament/rank_emblems/ | 保存＋6つに切り出し（slices/emblem_slot1〜6＝シート上の位置。左上→右、下段 左→右）。**どれが E〜S かは仕様に無い＝割り当ては保留**。透過化は白い宝石と光で市松模様が残るため保留 |
