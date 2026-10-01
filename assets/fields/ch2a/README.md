# Chapter 2「潮風の海岸」Pattern A「海岸地方」の素材（2026-10-01）

出どころ：ユーザー提供 mismon_chapter2_backgrounds.zip（実プレイ背景10枚）と、別途提供の全体俯瞰図（intro/ch2_intro_overview.webp。導入演出専用）。元の画像はユーザーが別に保管する（リポジトリには入れない）。
参照は js/chapter/configs/ch2a.js だけ。目印（nodes/）・環境（env/）・サイコロ（dice/）・操作欄（ui/）は Chapter 1 の素材（../ch1a/）を共通で使う。

## 加工

- road/：元の JPEG（768×1360）を同じ大きさの WebP（品質86。Chapter 1 と同じ）へ再圧縮しただけ（切り抜き・色の加工なし）。1枚 約320〜370KB、10枚で約3.4MB。
- 読み込みは今いる背景＋次の背景の先読み（field-view の preloadField）。10枚を同時には読み込まない。

## 背景（10枚）と段階

| 段階 | キー | ファイル | 表示名【暫定】 | 地形 |
|---|---|---|---|---|
| 序盤 | e1 | ch2_01_early_a | 白浜の海岸道 | coast |
| 序盤 | e2 | ch2_02_early_b | 岩礁の海辺 | coast |
| 序盤 | e3 | ch2_03_early_c | 海風の丘 | coast |
| 中盤 | m1 | ch2_04_middle_a | 海上の石橋 | bridge |
| 中盤 | m2 | ch2_05_middle_b | 離島への道 | coast |
| 中盤 | m3 | ch2_06_middle_c | 遺跡の海岸 | coast |
| 終盤 | l1 | ch2_07_late_a | 白亜の門 | coast |
| 終盤 | l2 | ch2_08_late_b | 岬の大橋（強敵） | bridge |
| 終盤 | l3 | ch2_09_late_c | 高台の道 | coast |
| 会場前 | z1 | ch2_10_arena_approach | 大会会場への道（ライバル＝強制停止・ゴール） | coast |

- 段階の順（序盤 → 中盤 → 終盤 → 会場前）にだけ進む。各段階の3枚は景観のバリエーションで、同じ順で1回ずつ通る（戻らない・飛ばさない・ランダムに並べ替えない）。
- 1枚の中のマス数は config の NODES（序盤 7・中盤 7・終盤 7・会場前 6【暫定】＝68歩）。マスは各背景の道の中央線（ch2a.js の BG）の上に奥行きで等間隔。道の幅のモデルと安全域は Chapter 1 と同じ（消失点 0.245・safe 0.7。石橋の上は 0.6）。
- 俯瞰図（intro/ch2_intro_overview.webp）：Chapter開始の演出専用（元の PNG 941×1672 を WebP 品質86 へ（約380KB））。プレイの背景10枚とは別素材で、背景の順（STAGES）には入れない。会場（右上）を見せてからスタート付近（左下の大橋）へズーム／パンし、序盤a へつなぐ。
