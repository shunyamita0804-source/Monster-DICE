# フィナ（主要案内NPC）の正式素材

> 2026-09-30：ゲームで使う画像を、画素を1つも変えずに**可逆WebP（.webp、透過あり）**へ変換しました（透過PNGより約39%小さい。見た目は同じ）。下の説明の「透過PNG」は変換前の形式、表の容量（KB）がある場合は変換前の値です。

ユーザー提供の正式画像から、背景（描き込まれた市松模様・緑背景）だけを透明にした透過PNG（RGBA）です。背景除去はユーザーの承認を受けて行いました。
- 絵柄（顔・髪・服・色・位置）は変えていません。背景を透明にした時点（縮小前）で、縁から4px以上内側の画素が元画像と完全に同じであることを検査しています（縁の半透明部分と、緑背景の縁の緑かぶりだけを調整）。
- 切り抜きはしていません。CSSの filter などで色を変えずに使います。
- 容量を軽くするため、20枚とも会話での表示の最大高さ（380px、`.mmtalk-fig.closeup`）の2倍、高さ760pxに縦横比を保って縮小し、見た目を変えない範囲で圧縮しました（ファイル名・形式は元のまま。元の大きさの画像はユーザーが別に保管）。下の表の「大きさ」「容量」は縮小後のものです。
- 全身（fullbody）の画像はJPEGのため、ユーザーの指示で使っていません（正式な全身素材は未着）。開始画面の一枚絵の中のフィナは切り抜いていません。
- 表情名とアニメーションの並び順は、元のファイル名が残っていなかったため、絵の内容から決めて報告しています（変更はこのファイルと js/npc/npc.js の登録だけで行えます）。

| 素材 | 元の画像 | 大きさ | 容量 |
|---|---|---|---|
| animations/wave/wave_01.webp | file_1790600381737.png | 573×760 | 498KB |
| animations/wave/wave_02.webp | file_1790600386163.png | 573×760 | 485KB |
| animations/wave/wave_03.webp | file_1790600388068.png | 573×760 | 483KB |
| animations/wave/wave_04.webp | file_1790600390261.png | 573×760 | 486KB |
| animations/wave/wave_05.webp | file_1790600392120.png | 573×760 | 467KB |
| animations/wave/wave_06.webp | file_1790600393782.png | 573×760 | 489KB |
| animations/wave_blink/wave_blink_01.webp | file_1790591229750.jpeg | 573×760 | 503KB |
| animations/wave_blink/wave_blink_02.webp | file_1790591232302.jpeg | 573×760 | 488KB |
| animations/wave_blink/wave_blink_03.webp | file_1790591234214.jpeg | 573×760 | 491KB |
| animations/wave_blink/wave_blink_04.webp | file_1790591238287.jpeg | 573×760 | 497KB |
| animations/wave_blink/wave_blink_05.webp | file_1790591236233.jpeg | 573×760 | 499KB |
| animations/wave_blink/wave_blink_06.webp | file_1790591240739.jpeg | 573×760 | 492KB |
| closeup/guide.webp | file_1790600379607.png | 573×760 | 508KB |
| closeup/happy.webp | file_1790600365161.png | 573×760 | 522KB |
| closeup/normal.webp | file_1790600326489.png | 573×760 | 521KB |
| closeup/serious.webp | file_1790600376129.png | 573×760 | 553KB |
| closeup/smile.webp | file_1790600356093.png | 573×760 | 520KB |
| closeup/surprised.webp | file_1790600367003.png | 573×760 | 535KB |
| closeup/troubled.webp | file_1790600368837.png | 573×760 | 472KB |
| closeup/worried.webp | file_1790600371712.png | 573×760 | 501KB |


## 2026-10-03 品質向上の補足パック（mm_quality_up_supplement_2026-10-03）

### 全身（fullbody）10枚＝新しく使う正式素材

ユーザーの指示（「全身通常・全身案内・全身手振り…を使用」）で、これまで使っていなかった全身の JPEG を使う。JPEG に描き込まれた市松模様（255／236 の灰色）を取り除いて透過 WebP にした（絵柄は変えない・縁を1画素詰めて白い縁取りを残さない・高さ 1100px に縮小・WebP 品質 90）。元の JPEG はリポジトリに置かない（ユーザーが保管。下の sha256 で照合できる）。表情名は絵の内容から決めた（要確認）。

| 素材 | 元の画像 | 大きさ | 容量 | 元画像の sha256 |
|---|---|---|---|---|
| fullbody/smile.webp | file_1790595338976.jpeg | 284×1100 | 80KB | 0081e0c68ac07421… |
| fullbody/happy.webp | file_1790595345213.jpeg | 399×1100 | 85KB | 7b7007814b448e7e… |
| fullbody/surprised.webp | file_1790595349623.jpeg | 337×1100 | 82KB | c3be61d23f5fc15d… |
| fullbody/troubled.webp | file_1790595353645.jpeg | 300×1100 | 77KB | e3e65529c8be88c0… |
| fullbody/worried.webp | file_1790595356011.jpeg | 316×1100 | 83KB | c24e2901829bf516… |
| fullbody/serious.webp | file_1790595367394.jpeg | 370×1100 | 88KB | cd8629115bc7700e… |
| fullbody/guide.webp | file_1790595369365.jpeg | 492×1100 | 85KB | f1ad9188b690631e… |
| fullbody/normal.webp | file_1790595383494.jpeg | 312×1100 | 81KB | 17b3fb49c52a998e… |
| fullbody/wave.webp | file_1790595388528.jpeg | 373×1100 | 81KB | dabbb77cd23ab880… |
| fullbody/greet.webp | file_1790595390593.jpeg | 362×1100 | 79KB | 5f60ed33ce447492… |

### 半身（halfbody_closeup）16枚＝すでにゲームにある絵と同じ

16枚とも、上の表の既存素材と同じ絵（同じ元ファイル名。0〜5 は緑背景の wave_blink、6〜15 は市松模様の closeup・wave）。新しく取り込んだ画像は無い。

| 元の画像 | 今のゲームの素材 |
|---|---|
| file_1790591229750.jpeg | animations/wave_blink/wave_blink_01 |
| file_1790591232302.jpeg | wave_blink_02 |
| file_1790591234214.jpeg | wave_blink_03 |
| file_1790591236233.jpeg | wave_blink_05 |
| file_1790591238287.jpeg | wave_blink_04 |
| file_1790591240739.jpeg | wave_blink_06 |
| file_1790600049162.jpeg | closeup/normal |
| file_1790600326489(1).jpeg | closeup/normal（同じ絵の再送） |
| file_1790600356093.jpeg | closeup/smile |
| file_1790600365161.jpeg | closeup/happy |
| file_1790600367003.jpeg | closeup/surprised |
| file_1790600368837.jpeg | closeup/troubled |
| file_1790600371712.jpeg | closeup/worried |
| file_1790600376129.jpeg | closeup/serious |
| file_1790600379607.jpeg | closeup/guide |
| file_1790600381737.jpeg | animations/wave/wave_01 |
