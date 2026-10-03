# 大会の報酬・解放演出／ランクエンブレム（2026-10-03・保存のみ）

ZIP mystic-monsters-design-pack-2026-10-03 の `10_tournament_reward_unlock_fx`（FORMAL_FX_ASSETS・4種）と `11_tournament_rank_emblems_sheet`（FORMAL_SHEET_ASSET・6種のシート）。

- `reward_unlock/original/`：元ファイル（JPEG・無加工）。透明の代わりに市松模様が焼き込まれている。
  - 透過化を試した（assets/battle/common と同じ手順）が、明るい背景・暗い背景のどちらでも、光の中に市松模様が残り、白い光の芯が抜ける＝品質が足りない。**採用せず、透過元 PNG 待ち**。
- `rank_emblems/original/`：元の6種シート（無加工）。
- `rank_emblems/slices/emblem_slot1〜6.jpeg`：シートからの切り出し（市松模様の背景ごと。番号はシート上の位置＝上段 左→右が 1〜3、下段 左→右が 4〜6）。
  - **E〜S への割り当ては保留**：今の仕様に対応の順が無い（見た目から決めない）。
  - 透過化は白い宝石（slot 5・6）と光（slot 6）で市松模様が残るため保留（透過元 PNG 待ち）。
