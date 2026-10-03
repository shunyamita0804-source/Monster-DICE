# 野生聖獣の遭遇（正式8コマ・2026-10-03）

ZIP mystic-monsters-design-pack-2026-10-03 の `07_wild_sacred_beast_encounter_sequence`（FORMAL_SEQUENCE_ASSETS）。

- `original/`：元ファイル（JPEG 1536×864・無加工）。
- `sacred_beast_encounter_0N.webp`：派生（1280×720・品質80）。
- 再生器：js/fx/sequence.js の `MMSEQ.play('sacredBeast')`（画面いっぱいに 8コマを順に・タップで飛ばす・終わったら必ず消す）。
- **どこからも呼んでいない**：聖獣の出現条件・出現率・捕獲・報酬・システムが今のゲームに無い（画像から新しく作らない）。システムができたら、その遭遇の場面から MMSEQ.play を呼ぶだけ。
