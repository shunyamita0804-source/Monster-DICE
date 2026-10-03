# アイテム屋（正式素材・2026-10-03）

ZIP mystic-monsters-design-pack-2026-10-03 の `08_item_shop_npc`（アイテム屋のNPC・FORMAL_ASSET）と `09_item_shop_background`（店内の背景・FORMAL_ASSET）。

- `original/`：元ファイル（JPEG・無加工）。
- `shop_bg.webp`：背景（864×1536 のまま WebP 品質84。絵は変えていない）。
- `shop_npc.webp`：NPC の立ち姿（明るい灰色の無地の背景を透明化・高さ960px・品質88）。縁の画素は背景の色を混ぜた分を引いて戻した。絵の描き込みの白い縁取りは絵のまま。
- 画面：index.html の shopScr（p7Shell の o＝SHOP_LOOK）。背景はぼかさず上下だけ暗く、NPC は一覧の後ろの右に立つ。商品・価格・売買・保管庫の処理は変えていない。
- **NPC の名前は未確定**（今のゲームの仕様に名前が無い）：名前・セリフ・会話は出さない。名前が決まったら NPC 表示（MMNPC）と吹き出しを足す。
