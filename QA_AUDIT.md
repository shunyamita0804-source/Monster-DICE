# QA監査レポート（全体QA・回帰テスト・技術負債監査・セーブ耐性強化）

> 注記（2026-09-29 追記）：このレポートの「修行」は旧名称。プレイヤー向けの正式名称は「特訓」に変わった（CLAUDE.md §3「特訓」）。記録のため本文は当時の表記のまま残す。

- 実施日：2026-09-28〜29
- 基準：GitHub main の最新 `ca98f90`（作業開始時 HEAD）
- 方法：
  - コードの読解と、Playwright＋Chromium による実ブラウザ操作（390×844 を中心に 375×667／360×800／430×932）を行った。
  - 10観点の監査を並行で行い、指摘の1件ごとに別の検証役が反証を試みた。
  - 反証できなかった指摘だけを「確認済み」とした。
- 方針：
  - 仕様・バランス・デザインを変えない技術的な不具合だけを直した。
  - 仕様判断が必要なもの・Phase 6 保護対象の中にあるものは、報告だけにした。
- 付録に全指摘の一覧（151件）がある。

## 0. 結果の要約

| 項目 | 結果 |
|---|---|
| 確認済みの指摘 | 146件（反証されて取り下げ 5件） |
| 重要度の内訳 | BLOCKER 0／HIGH 2／MEDIUM 16／LOW 82／INFO 46 |
| 今回修正 | 46件（うち一部保留を含む 5件）。HIGH 2件はどちらも修正済み |
| 仕様判断待ちで保留 | 47件 |
| Phase 6 のため報告のみ | 13件 |
| 未対応の改善候補 | 22件（死コード整理・性能など。下の 6・9・10） |
| テスト件数 | 413件 → 686件（+273件。実ブラウザテスト込み）。M3-3 以外すべて合格 |
| Phase 6 保護対象 | 無変更（fight()・battle-bridge.js・adapter.js・legacy・js/systems/battle のハッシュをテストで照合） |
| セーブ | version 6・キー mr4v6・checkpoint 形式は無変更 |

※ 重要度の内訳は、観点どうしで重なった同じ問題を別々に数えている（例：名前のHTML混入は3観点から出ている）。

## 1. 現在の主要機能一覧（実ブラウザで動作確認済み）

- 開始画面（正式画像＋透明な開始ボタン）→ 名前登録 → フィナの初回あいさつ（1度だけ）→ 街
- 市場
  - ループ型カルーセル（左右矢印・スワイプ・ドット・キー操作）
  - ソラモ／ガウル 500G、ノビトン入荷待ち（育成完了5回）。ジオルは出ない
  - 初回救済と継続用救済
- ぽかぽか牧場：預ける・受け取る・合体（200G）・売却（未育成50G／育成完了は計算式、2度押し）
- 育成
  - 出発準備（フィナの確認会話＋2度押し）→ Chapter 1〜4（20ターン・サイコロ1〜3・停止地点のみ効果）
  - Chapter間ファーム、修行（15マス）、公式大会（総当たりリーグ）
  - 育成完了（フィナの会話）
  - 最終ルートは代替処理（A以上で「育成を完了して街へ戻る」）
- 中断・再開（ボード・移動途中・分岐・大会途中・修行途中）、育成放棄
- セーブ
  - オートセーブ（mr4v6）、スロット3つ、セーブコード（書き出し・読み込み）
  - v4／v5 からの移行と、新しい版のセーブのロック
- 博物館、共通NPC会話（MMNPC：1文字ずつ表示・表情・立ち絵アニメ）

## 2. 今回追加したテスト

### 実行方法

```
node --test tests/*.test.mjs                                # ふだんのテスト（約6秒）。実ブラウザテストは省略（skip）
QA_E2E=1 node --test --test-concurrency=1 tests/*.test.mjs  # 実ブラウザテストも含めて全部（約15〜20分）
```

- 実ブラウザテストは Playwright と Chromium を使う。共通部品は `tests/e2e/harness.mjs`。
- 並列で実行すると、大きな index.html（監査時 約9MB、Stage 3 の後は約7.9MB）の読み込みが重なって時間の計測が不安定になる。そのため1ファイルずつ順番に実行する。

### 追加したファイル

| ファイル | 件数 | 内容 |
|---|---|---|
| tests/qa-static-guards.test.mjs | 34 | Phase 6 のハッシュ（legacy・js/systems/battle 全6ファイルを追加）、読み込むJSの一覧、旧名称、CLAUDE.md の数値とコードの一致 |
| tests/qa-raising-logic.test.mjs | 40 | Chapter 1〜4・修行・大会・育成完了の純粋ロジック |
| tests/qa-e2e-newgame-market*.test.mjs | 31 | 新規開始・名前登録・フィナ初回・市場カルーセル・購入・救済・未解放 |
| tests/qa-e2e-ranch-fusion*.test.mjs | 20 | 牧場・UID・預け入れ・上限・売却・合体 |
| tests/qa-e2e-raising*.test.mjs | 18 | 出発・ボード・再読み込みでの再抽選なし・中断再開・修行・大会・育成完了 |
| tests/qa-e2e-save*.test.mjs | 29 | v5移行・新しい版のロック・壊れたセーブ・再読み込みの一致・スロット・セーブコード |
| tests/qa-e2e-tech*.test.mjs | 14 | タイマー・リスナー・DOM の増加なし、NPC会話の後片付け、404なし、4サイズの横はみ出しなし |
| tests/qa-fix-g1〜g6.test.mjs | 74 | 今回の修正ごとの回帰テスト（修正前は失敗、修正後は合格） |
| 旧テストの調整 | 3 | 修正に合わせた変更（試合結果の matchWon・ハヤテ互換処理の場所） |


## 3. テスト済みの導線

- 新規ゲーム：開始画面、初回開始、名前登録（Enterキーを含む）、初回の街、フィナの初回あいさつ（再読み込み後も重複しない）
- 市場
  - ソラモ・ガウルの表示、ノビトンの未解放表示、ジオル非表示
  - 左右の矢印、最後→最初・最初→最後、スワイプ、ドット、切り替え中の連打
  - 中央の個体＝購入対象、500G購入、所持金不足、購入失敗後の状態、未解放は関数を直接呼んでも買えない、所持上限
- 牧場：購入個体、UIDの一意性、閲覧、預ける・受け取る、上限、売却（50G・計算式・ランク加算・上限）、売却後に UID が残らない
- 育成開始：フィナの会話、2度押し、街へ戻れない、出発時の状態保存（startStats）
- Chapter
  - サイコロ1〜3、1地点ずつの移動、停止地点だけ効果、20ターン制限、ゴール、ターン切れ
  - Chapter間ファーム、次のChapter、中断・再開、再開後に再抽選しない、個体ごとの進行
- 修行：チケット、15マスの一本道、+2〜3、終了、ファームへ戻る、チケット消費、丈夫さの解放条件、種類ごとの回数上限
- 大会
  - 挑戦できるランク（最高クリア＋2、未クリアは E・D）、参加数（6／8）、試合数
  - 中断・再開、初回賞金・再挑戦で賞金なし、飛び級、ランク記録
- 育成完了：Chapter 4 終了、A未満の通常完了、A以上の代替完了、フィナの会話、牧場で見られる、街へ戻れる
- 合体：ベース・相手の選択、誕生、牧場の個体数、不正な個体参照が起きない、新しい個体に異常な技が生まれない
- セーブ：上に書いた互換・破壊防止の各項目
- 操作耐性：2度押しの確認ボタンのダブルタップ、購入・売却・出発・大会開始・辞退・スロットのロードとセーブ・会話送り・メニュー
- 技術：画面を15周してもタイマー・リスナー・DOMが増えない、会話の後にタイマーが残らない、ローカルの404なし、JSエラーなし

## 4. 未テストの領域

- 実機の iOS Safari（ダブルタップの拡大、ホーム画面追加、7日間でのストレージ削除）。Chromium のタッチ操作での確認まで
- バトル本体（Phase 6）の勝敗の流れ。大会はバトルを通さず、状態を直接作って確認した
- 最終ルートの正式マップ（未登録のため）
- 複数タブで同時に遊んだ場合（報告のみ。7章の「複数タブ」）
- 音声（BGM・効果音）の中身

## 5. 発見した旧仕様（分類：A＝未使用で削除可／B＝互換のため残す／C＝今も実行され正式仕様と衝突）

| 分類 | 内容 | 扱い |
|---|---|---|
| C | 牧場「預ける」の説明「預けている間、モンスターは年をとりません。」（寿命は廃止済み） | 保留：文言の判断が必要 |
| C | 牧場・ファームの埋め込み背景画像に旧ロゴ「モンスターマスター / MONSTER MASTER」 | 保留：素材待ち（CLAUDE.md §5 のとおり） |
| C | 合体した個体を hue-rotate などのCSSフィルターで色変えして表示 | 保留：合体時の色の扱いは未決 |
| C | 街のマスコット（正式 solamo.png）に contrast／saturate フィルター | 保留：見た目が変わるため判断待ち |
| C | 博物館の旧スプライト・旧プロフィール（性格文・旧技一覧・旧能力色） | 保留 |
| C | バトルエラー時のボタン「ファームにもどる」が、実際には Chapter ボードへ戻る | 保留：文言の判断 |
| C | 修行画面「ゴールで技を覚える」の文言（今の修行は能力上昇だけ） | 保留 |
| C（Phase 6） | fight() がソラモの対戦相手をランクで hue-rotate する／勝利演出の賞金が旧表（C 300／B 500） | 報告のみ |
| B | v4／v5 の移行、旧キー mr4、個体の age／span／fa／st、セーブ全体の y／mo／wk、チェックポイント形式名 `monster-master-battle-checkpoint` | 残す（互換） |
| B | ハヤテ→ガウルの互換処理 | 残す。今回、ガウル（sp 1）だけを対象にし、スロット・セーブコードの読み込みにも適用 |
| A | 旧トレーニング・休養・暦・大会UI（train・rest・cal・nextTour）、旧スターター選択（start・pick）、pasture、msave、旧技トグル（tog・togh・wset・skLock・skLock2）、person・npc・stat・ss・leg・bState・bNext・p8RewardText・farmAnim、dscr／_hall の到達しない分岐 | 未削除（下の6） |
| A | 使われていない埋め込み画像 約0.73MB（MKIMG・TRIMG・STL・RESTI・TITLEIMG） | 削除済み（2026-09-29 の Stage 3。未使用を再確認し、目印にしていたテストも更新。下の 14） |
| — | 読み込まれていない PHASE 1 の土台（js/main.js・js/core・js/ui・js/dev・js/systems の非バトル分・css/・data/・docs/・README.md） | main にだけあるファイルのため残す。README・docs/decisions.md・package.json の説明は現状と食い違う |

### 名称監査

- 画面に出る文字（HTML／JS）には、旧名称（モンスターマスター・Monster Master・Monster-DICE）は残っていない。テストで固定した。
- 残っているのは埋め込み背景画像の中の旧ロゴだけ（素材待ち）。
- ハヤテが残るのは次の3か所だけで、テストで固定した。
  - 互換処理 legacyFix
  - 正式データの旧名記録（formerNames）
  - 大会の暫定NPC名の一覧

## 6. 死コード候補（今回は削除していない）

- 上の表の A の関数群は、監査で「参照0」を確認した。
- 今回は区切りのよいところで作業を終えたため、削除（予定していた修正グループ G7）は実行していない。
- 削除するときの注意：
  - テストの一部が関数名を抽出の目印にしている。
  - fight() まわりのバトル演出の関数（sweep・drawBar・stageIntro・claws〜ballfx・旧横ルーレット）は Phase 6 のため対象外。
- 使われていないCSSクラスは約110個ある（旧市場・旧街・旧トレーニングのUI）。誤検出の恐れがあるため、報告だけにした。
- tests/phase7.test.mjs に、削除済みのコード（bResolve など）を参照する未使用の補助関数がある。

## 7. セーブのリスク

| 重要度 | 内容 | 状態 |
|---|---|---|
| MEDIUM | 解析はできるが中身の壊れたセーブで起動処理が例外 → 毎回真っ白で起動不能 | 修正：読めないセーブと同じ扱い（原文を退避して新規） |
| MEDIUM | 育成中の個体の pend／trainRun／battle が壊れていると、開始画面で止まる | 修正：読み込み時に、不正な途中状態だけを安全な値（null）へ |
| MEDIUM | 大会データ（raise.tour）が壊れていると、開始画面で止まる | 保留：大会をどこからやり直させるかは仕様判断 |
| LOW | S.m や box の要素が数値・文字列だと起動不能、null 要素で「受け取る」などが落ちる | 修正：不正な要素だけを除く |
| LOW | fx1 の旧技ID移行が、配列でない sk／eq で例外 | 修正 |
| LOW | 所持金が文字列や NaN のとき、足し算が文字列連結になり、無料で買える | 修正：数値の文字列は数値へ、不正値と負の値は 0 へ |
| LOW | スロット・セーブコードの読み込みで、失敗しても先にオートセーブを上書きしていた | 修正：検証が済んでから上書き |
| LOW | Chapter 番号（raise.ch）が範囲外だと、Chapter間ファームで出発できない | 保留：仕様判断 |
| LOW | 読めないセーブは、知らせずに新しいゲームになる。退避は localStorage の中だけ | 保留：通知や復元の方法は仕様判断 |
| LOW | 保存に失敗しても知らせない（容量不足・プライベートモード） | 保留 |
| LOW | 「最初からやり直す」の2度押しが時間で解除されない | 保留（最短間隔の保護は追加済み。下の8） |
| MEDIUM | 複数タブで遊ぶと後から保存した方が勝ち、古いタブが育成の進行を消す | 保留：仕様判断 |
| INFO | iOS Safari は、7日間使わないとスクリプトが書いたストレージを消すことがある | 報告のみ |

確認して問題がなかったこと（テストで固定）：
- 新しい版のセーブは読み込まず、上書きもしない
- v5 を移行するとき、元のデータを残す
- 中断→再開で状態が一致し、サイコロも再抽選されない
- 大会の途中状態を保つ
- Chapter の進行が別の個体に混ざらない
- 売却した UID がどこにも残らない
- 育成放棄の後に育成中の状態が残らない
- 正式な中断地点以外に、勝手なオートセーブはない（どの操作も即時に保存される）

## 8. 操作が競合するリスク

| 重要度 | 内容 | 状態 |
|---|---|---|
| HIGH | 「▶ セーブ・ロード」を素早く3回押すと、次の画面の「最初からやり直す」が確定してセーブが消える | 修正：表示後0.35秒と、2度押しの間の0.4秒を保護 |
| MEDIUM | 2度押しの確認（arm）がダブルタップ1回で確定：スロットのロード・セーブ、牧場の売却、大会の辞退、育成完了 | 修正：2回目の押下は0.4秒以上あとだけ有効。3秒の自動取り消しはそのまま |
| MEDIUM | フィナの出発会話をタップで送った次のタップで、確認を読む間もなく出発する | 修正（同上） |
| MEDIUM | 「🥋修行」や修行ゴールの「◀ ファームへ戻る」のダブルタップで、意図しない修行が始まりチケットが減る | 修正：修行の選択画面は表示後0.35秒の押下を無視 |
| LOW | 市場の「購入する」のダブルタップで、確認シートを飛ばして購入 | 修正（同上） |
| LOW | 大会ランクの選択・対戦開始（p9arm）のダブルタップ | 修正（0.4秒） |
| LOW | ボードの☰をダブルタップすると、開いてすぐ閉じる | 修正 |
| LOW | 育成放棄の3秒の待ちが、前回の interval の残りで短くなる | 修正 |
| LOW | ボードの自動処理タイマー（0.35秒）が、画面を離れた後にボードを描き直す | 修正（処理は次にボードを開いたときに1回だけ） |
| LOW | 取り消し後の出発ボタンが小見出し（small）を失う | 修正 |
| LOW | マウスでカルーセルの外まで引っぱって離すと、次の矢印が逆向きに動く | 修正 |
| LOW | 会話を開いた入力（Enterキー・2回目のタップ）で、1行目の文字送りが飛ぶ | 修正（npc.js） |
| LOW | 合体は取り返しがつかない操作なのに1回押しで確定する | 保留：仕様判断 |
| LOW | バトルの「🏳 降参」がダブルタップで確定する | 報告のみ（Phase 6） |

## 9. パフォーマンスの懸念

| 重要度 | 内容 |
|---|---|
| MEDIUM | index.html は 9.47MB（gzip で 7.0MB）で、そのうち 9.1MB が base64 画像。開始画面は全部を読み込むまで表示されない。約0.73〜0.81MB は使われていない画像 |
| LOW | 街とぽかぽか牧場で、歩くモンスターのアニメが `left` を動かしており、待機中も毎フレーム再レイアウトしている（見た目を変えずに transform へ置き換えるのが候補） |
| LOW | モーダル表示中に背景がスクロールする（スクロールのロックがない） |
| LOW | 同じ画面に同じ id の SVG グラデーションが重複（p10cg など） |
| INFO | 市場を開くと同期レイアウトが約6回、リサイズのたびに2回ある（実害は小さい） |
| INFO | フィナの画像（約0.5MB／枚）は、行が始まってから読み込む。回線が遅いと一瞬空白になる。MMNPC.preload は用意済み |

- 画面を15周しても、タイマー・イベントリスナー・DOMは増えない。テストで固定した。

## 10. 今後の修正の推奨（優先順）

1. **HIGH 相当・仕様判断**
   - 名前の入力に使える文字を決める（今回は表示時に文字として出すよう直した。fight() の中だけは Phase 6 のため未対応）
   - 大会データが壊れたときの戻し方を決める
2. **死コードの整理**（G7 相当。上の 5・6 の A）。index.html の軽量化の第一歩
3. **使われていない埋め込み画像（約0.73MB）の削除と、背景画像の外部ファイル化**。起動時間の短縮が最大の効果（未使用画像の削除は 2026-09-29 の Stage 3 で実施済み＝下の 14。外部化の残りは未着手）
4. 保存失敗・読めないセーブの通知（仕様判断のあと）
5. 旧仕様の文言（年をとらない・ファームにもどる・技を覚える）の整理
6. 牧場・ファーム背景の旧ロゴの差し替え（素材が届いたら）
7. 文書の整理
   - README.md、docs/decisions.md、package.json の name、INTEGRATION_STATUS.md、assets/scenes/README.md は、今の状態と食い違う
   - KNOWN_ISSUES.md のフィナの節も古い

## 11. 仕様決定待ちで触らなかったもの

- 正式技データ・ジオルの入手方法・3択イベント・修行チケット地点・市場の正式背景・ロゴ・状態異常・最終ルート・未確定の報酬・合体の計算式と色（依頼どおり）
- 大会データ（raise.tour）が壊れたときの扱い、raise.ch が範囲外のときの扱い
- 「最初からやり直す」の2度押しの有効期限、合体の確認方法
- 読めないセーブ・保存失敗の通知、複数タブの扱い
- 旧仕様の文言、博物館の旧データ、公式画像へのフィルター（街のマスコット・合体個体）
- リナ（市場NPC）が今は画面に出ていない件（CLAUDE.md には市場のNPCと書かれている）
- 大会の順位表で、試合前から順位が並ぶ表示、NPC名が狭い画面で省略される件
- 市場の「購入する」が 390×844 で1画面目に入らない件（レイアウト変更になるため）
- ガウルに「ハヤテ」と名付けた場合も、読み込み時に「ガウル」へ直る（旧セーブと区別できないため、従来どおり）
- 能力の色：画面ごとに3通りの配色があり、CLAUDE.md（ライフ＝黄・命中＝ピンク）とも一致しない

## 12. Phase 6 で発見したが触らなかった問題（報告のみ）

- fight() が、正式画像に contrast／saturate フィルター、ランクに応じた hue-rotate、A／S の合体風の重ね表示をかけている
- 試合勝利の演出が旧賞金表 PZ（C 300G／B 500G）と「ランクアップ」を表示し、タップするまで残る（KNOWN_ISSUES の「一瞬」より長い）
- fight() が、表に無い技IDで例外になる（rescue() の画面で受け止めている）
- rescue() の画面は「結果は記録されない」と出るが、実際には記録される
- 能力の実効値が0だとバトルエンジンが例外になる
- 素早さ（1〜10）がバトルで使われず、両者とも5扱い（先攻は五分五分）
- TIME UP でライフが同じときはプレイヤーの負け（引き分けの定義がない）
- 大会の VS 画面の対戦相手と、実際のバトルの相手の種族が違うことがある
- バトル画面の相手HPカードが、幅390以下で右にはみ出す
- 「🏳 降参」がダブルタップで確定する
- fight() の中では、モンスター名をHTMLとして出している（名前のHTML混入の残り）
- adapter.js・bridge のコメントが古い

## 13. 最終確認の結果

- 自動テスト（ふだんの実行）：676件（合格 542・skip 133・失敗 1＝既知の M3-3）。skip は実ブラウザテストで、QA_E2E=1 のときに実行する
- 実ブラウザテスト（QA_E2E=1、順番に実行）：結果は下の「実行記録」を参照
- 390×844 の実ブラウザ：主要画面の横はみ出しなし、JSエラー0件、ローカルの404なし
- 375×667・360×800・430×932：横はみ出しなし、主要ボタンに届く
- 致命的ではない崩れ：
  - 大会の順位表で NPC 名の省略
  - 技管理の並べ替えボタンがクリ率の列に重なる
  - 修行のサイコロボタンが画面外へ戻る件は修正済み
- Phase 6：ハッシュのテストで無変更を確認
- セーブ v6・mr4v6：無変更。テストで固定した

### 実行記録

- `node --test tests/*.test.mjs`：tests 676／pass 542／skipped 133／fail 1（M3-3）
- `QA_E2E=1 node --test --test-concurrency=1 tests/*.test.mjs`：tests 686／pass 677／todo 6／fail 3
  - 失敗は M3-3 と、QA-BY3・QA-TL1 の2件だった。
  - この2件は、購入シートの0.35秒ガードを入れる前に書いたテストが、開いた直後に押していたため。テストに待ちを足した。
  - 2ファイルを再実行して 26件合格（todo 1）。
  - 所要は約11分。
- 並列に実行すると、ページの読み込みの時間切れで QA-G3-B9／B10 が落ちることがあった。そのため実ブラウザテストは順番に実行する形にした（ハーネスの待ち時間も延長）。
- テスト作成時に todo（既知の不具合の記録）にしていた6件は、今回の修正で直ったので通常のテストに戻し、合格を確認した（4ファイル47件を再実行して全件合格）。

## 14. Stage 3（安全軽量化・テスト正常化、2026-09-29）

- 基準：main `502a3ed`（作業開始時 HEAD）。指示された範囲（テストの期待値の更新・MS-B6 の安定化・未使用の埋め込み画像の削除・文書の事実の更新）だけを行った。
- ゲームの動き・仕様・デザイン・セーブ（version 6・キー mr4v6・checkpoint 形式）・Phase 6 保護対象・legacy/ は変えていない。

### 街の画面変更に追いついていなかったテスト3件（テスト側の期待値を更新）

| テスト | 旧い期待 | 新しい期待 |
|---|---|---|
| QA-RL7（tests/qa-e2e-raising-late.test.mjs） | 街のコマンド（.hz）が5つで、すべて押せる | 街の6コマンド（市場・牧場・研究所・闘技場・ファーム・プロフィール）の行き先と、すべて押せること |
| QA-G1-B1（tests/qa-fix-g1.test.mjs） | 街の画面に「🪙 450G」 | プロフィール画面の所持金が「450G」（所持金は街ではなくプロフィールに出す） |
| QA-G6-B2（tests/qa-fix-g6.test.mjs） | `#app .map .hz[onclick="farm()"]`・`hall()`（コマンドが街の枠の中） | `#app .tbar .hz[...]`（コマンドは画面下のバー） |

### MS-B6（市場・430×932）の安定化

- 原因：市場を開いた直後は、画面の登場アニメ（#app>* の scr：12px 下から0.3秒）と案内欄のアニメが動いている。測る時点によって scrollHeight が 944（画面の高さ932より12px大きい）になり、固定の待ち（300ms・350ms）では足りないことがあった。
- 修正（テストだけ）：固定の待ちをやめ、「終わりのあるアニメが動いていない」かつ「市場の枠の位置・高さと scrollHeight が2フレーム続けて同じ」になってから測る（settled()。最大10秒）。合格条件（縦スクロールなし・横はみ出しなし・案内欄と詳細シートが画面内）は変えていない。
- 結果：MS-B6（4サイズ）を10回連続で実行し、40件すべて合格（430×932 も10回とも合格、1回16〜17秒）。全件の実ブラウザテスト2周の中でも合格。

### 未使用の埋め込み画像の削除

- 削除：MKIMG（1件）・TITLEIMG（1件）・TRIMG（1件）・STL（6件）・RESTI（1件）＝ data URI 10件。同じ行にあった TABS（使用中。assets/embedded/tabs_*.jpg のパス5つ）は残した。TITLEIMG に触れたコメントは「削除済み」に直した。
- 削除前の確認：直接の参照・onclick などのインライン処理・window／globalThis・文字列からの組み立て・eval／Function・テンプレート・CSS・読み込む JS 13本・セーブの移行／互換処理（legacyFix・addSaveNormalizer）・テスト・ツールを調べ、実行時の参照は0件。5定数 × 2観点（コード・テスト）の10件の反証確認でも、実行時の使用は見つからなかった。
- 削除後の確認：インラインのスクリプトの構文（node の vm.Script で OK）、未定義の参照なし（5つの名前はコメント1か所だけ）、起動・画面遷移・画像の404なし（下のテスト）。
- 元のデータは legacy/index.original.html に残る（変更していない）。
- 目印・確認に使っていたテストの更新：phase8 S10-3・qa-fix-g6 QA-G6-4（lobby() を切り出す終わりの目印を、次の行「// ---- Phase 11：プレイヤー名」へ）、phase13 P15-1（TITLEIMG のデータが残ることの確認 → 削除済みの確認）、qa-static-guards QA-N6（5つの定義が無いことも確認）、qa-e2e-tech QA-TD3（埋め込み画像の上限 197件 → 176件）。

| 実測 | 削除前 | 削除後 | 差 |
|---|---|---|---|
| index.html | 8,598,656 バイト（8.20 MiB）・2,646行 | 7,874,018 バイト（7.51 MiB）・2,644行 | −724,638 バイト（−8.4%） |
| index.html（gzip -9） | 6,314,705 バイト | 5,764,002 バイト | −550,703 バイト |
| 埋め込み画像（data:image/） | 186件 | 176件 | −10件 |
| base64 の本文 | 8,178,176 文字 | 7,453,796 文字 | −724,380 文字（画像としては 543,274 バイト） |
| 作業ツリー（.git を除く） | 88,799,334 バイト | 88,088,631 バイト | -710,703 バイト（index.html 以外にテスト・文書の更新を含む） |

- 内訳（base64 の文字数／画像のバイト数）：MKIMG 163,264／122,447、TITLEIMG 275,056／206,290、TRIMG 205,332／153,998、STL（6件）71,268／53,444、RESTI 9,460／7,095。
- base64 の巨大な行は 1883〜2129 行目付近の7行（1行最大 2,604,069 バイト）。

### テストの結果

- ふだんの実行（`node --test tests/*.test.mjs`）：3回とも 763件（合格589・skip 174・失敗0）、約7秒。テストごとの結果も3回同じ。
- 実ブラウザテスト全件（QA_E2E=1、46ファイルを1つずつ）：
  - 1周目：773件（合格773・失敗0・skip 0）、28分52秒
  - 2周目：773件（合格772・失敗1・skip 0）、25分20秒。失敗は QA-G3-B9 の1件で、下の「この環境での実ブラウザテストの注意」のとおり今回の変更によるものではない（削除前の HEAD でも落ちる。単独では5回とも合格）
  - 上の3件（QA-RL7・QA-G1-B1・QA-G6-B2）は2周とも合格
- 街の押し間違いの修正のテスト：TW-2・TW-B5 を3回ずつ実行し、すべて合格。QA-TL1（街→市場→牧場→研究所→セーブを15周してもタイマー・リスナー・DOM が増えない）も合格
- 主要画面（4サイズ：390×844／375×667／360×800／430×932）：開始画面・名前登録・街・市場（詳細・購入確認）・闘技場のロック・牧場（4タブ）・研究所（一覧・詳細）・プロフィール・お知らせ・設定・セーブ・ファーム・出発準備・育成開始の選択肢・Chapter 1 ボード・Chapter間ファーム・特訓メニュー・特訓ボード・大会（ランク選択・順位表・VS・バトル開始・負け・優勝）・育成完了の38画面 × 4サイズ＝152画面。JSエラー（pageerror・console.error）0、ローカルの 4xx／5xx・読み込み失敗0、画像の読み込み失敗0、横はみ出し0、手順の失敗0。監査時の同じ計測（横幅・はみ出し・文字切れ・隠れたボタン・小さいボタンの数）と差なし
- Phase 6：fight() d46e27f6・battle-bridge.js bff08e0f・adapter.js f99617ac・legacy 90eeba79、ルーレット・SK・EFF・素早さ分離処理・.bt 系 CSS のハッシュも一致。保護対象のファイルの差分は0。

### この環境での実ブラウザテストの注意（記録）

- このコンテナ（4コア）では、1つのテストファイルが同時に開くページごとに BGM（Web Audio の残響 ConvolverNode と音声出力のスレッド）が CPU を使い、後半のテストほど遅くなる（例：qa-fix-g3 は監査時の約1分に対して約3〜5分）。
- 【2026-09-30 に解消。KNOWN_ISSUES.md の Stage 3。テストが終わるたびにページを閉じ、選択肢が出た瞬間に会話の時計を止めるようにした。以後、全実ブラウザテスト 2周とも 773/773】この負荷の下では QA-G3-B9（連打の0.4秒判定を見るテスト）が落ちることがある。削除前の index.html（HEAD）でも同じように落ちることを確かめた（qa-fix-g3 のファイル全体の実行で、削除前 3回中3回・削除後 5回中3回 QA-G3-B9 が失敗。QA-G3-B9 だけを単独で実行すると5回とも合格）。原因は、選択肢が出てからテストが会話の時計を止めるまでに0.35秒以上たつと、次のタップが（仕様どおり）連打ではない押下として受け付けられること。名前入力欄の5秒待ちが時間切れになることもある。今回の変更によるものではない。ページを閉じる・音を出さない・選択肢が出た瞬間に時計を止めるなどの対策は Stage 3 の対象外のため、行っていない。

### Stage 3 の対象外として残したもの

- raise.tour（大会データ）が壊れたセーブの自動修復、牧場・ファームの旧ロゴ、TABS[2] の「修行」の画像、特訓の文言、牧場の待機中の再レイアウト、画像の圧縮、assets/reference・NPC素材、死コード・CSS の一括削除、NPC の吹き出しの統一、モンスター表示の統一、Git 履歴の書き換え、Phase 6 の画像の外部化、legacy の削除、研究所の画像（AS.mkt・soL・soR・gaL・gaR）

## 付録：全指摘の一覧

- 観点：legacy-naming＝旧仕様・名称、save-corruption＝壊れたセーブ、save-integrity＝セーブ破壊防止、input-races＝連打、npc-market＝会話・市場、tech-dom＝タイマー・DOM、images-responsive＝画像・画面サイズ、flow-early／flow-late＝導線、spec-phase6＝仕様との一致・Phase 6
- 内容の欄は、監査時の記述（英語）のまま載せている。

| 重要度 | 状態 | 観点 | ID | 内容 |
|---|---|---|---|---|
| HIGH | 修正済み | input-races | reset-triple-tap-wipe | Tapping 「▶ セーブ・ロード」 3 times fast confirms 「最初からやり直す」 on the next screen and wipes the save (the armed state never expires either) |
| HIGH | 修正（一部保留） | npc-market | monster-name-html-injection | Monster name typed in the market purchase dialog is inserted as raw HTML; `<!--` hides the town's monster card and セーブ・ロード button and persists in the save |
| MEDIUM | 修正（一部保留） | legacy-naming | hayate-rename-any-species | Boot rename turns ANY monster named 「ハヤテ」 into 「ガウル」 (user nicknames overwritten; a ソラモ ends up named ガウル) |
| MEDIUM | 保留（仕様判断） | legacy-naming | old-logo-backgrounds | Old game name 「モンスターマスター / MONSTER MASTER」 is visible in the ranch and farm background images |
| MEDIUM | 報告のみ（Phase 6） | legacy-naming | battle-opponent-hue | (Phase 6) fight() recolors ソラモ opponents with hue-rotate and filters every monster image in battle |
| MEDIUM | 修正済み | save-corruption | resume-brick-invalid-raise-substate | Bad raise.pend, trainRun or battle on the raising monster leaves the game stuck on the title screen (after reload too); pend.stage unknown soft-locks the board |
| MEDIUM | 保留（仕様判断） | save-corruption | resume-brick-invalid-tour | A malformed raise.tour (no league, unknown status, settled with no result, non-object) freezes the title screen permanently |
| MEDIUM | 修正済み | save-integrity | malformed-save-boot-brick | Parseable-but-malformed save makes loadFromStorage throw → game never boots (blank screen, no backup, persists across reloads) |
| MEDIUM | 保留（仕様判断） | save-integrity | multi-tab-last-writer-wins | Two tabs of the game overwrite each other's save; a stale tab silently erases raising progress and bypasses the 'no town while raising' lock |
| MEDIUM | 修正済み | input-races | arm-dbltap-slot-load-overwrite | Double-tapping スロットの「ロード」 (arm 2-press) loads at once and overwrites the current autosave; double-tapping 「セーブ」 overwrites a slot |
| MEDIUM | 修正済み | input-races | arm-dbltap-sell | Ranch sale 「売却する（xG）」 (spec: 確定は2度押し) is confirmed by a single double-tap |
| MEDIUM | 修正済み | input-races | arm-dbltap-decline-tournament | Double-tapping 「大会に参加しない（辞退）」 forfeits the chapter's tournament and ends the Chapter immediately |
| MEDIUM | 修正済み | input-races | fina-depart-rapid-tap-confirms | Raise start (未育成→Chapter 1): tapping through Fina's talk confirms the departure on the very next tap; the 2-press confirm is visible for under about 100ms (touch) |
| MEDIUM | 保留（仕様判断） | tech-dom | inline-base64-boot | index.html is 9.4 MB, of which 9.1 MB is inline base64 (7.0 MB gzipped). The title screen cannot render until the whole inline script has downloaded and parsed, and about 810 KB of that data is never used. |
| MEDIUM | 修正済み | images-responsive | train-roll-button-offscreen-after-roll | Training board scrolls to top after every roll; the roll button is off-screen on heights of 750px or less (iPhone SE, and iPhone Safari with toolbar) |
| MEDIUM | 修正済み | flow-early | monster-name-html-injection-softlock | Monster names are rendered into innerHTML without escaping. A name such as `<!--` hides every command on the Chapter間ファーム, and the lock survives reload |
| MEDIUM | 修正済み | flow-late | last-match-won-overwritten | Last league match result message shows the tournament result instead of the match result (勝ち/負け inverted in 2 of 4 cases) |
| MEDIUM | 修正済み | flow-late | ghost-tap-starts-training | Double-tap on 🥋修行 (farm) or 「◀ ファームへ戻る」 (training goal) starts an unintended training and consumes a ticket + the per-kind training slot |
| LOW | 保留（仕様判断） | legacy-naming | ranch-aging-text | Ranch 「預ける」 tab still says monsters don't age while deposited (lifespan was removed) |
| LOW | 保留（仕様判断） | legacy-naming | fusion-hue-rotate | Fused monsters are drawn with CSS hue-rotate/contrast/saturate on the official image, plus an old 2-image overlay and old naming |
| LOW | 保留（仕様判断） | legacy-naming | museum-old-art-and-data | Museum shows old sprite art and old profile cards with unconfirmed personality, the old stat colour scheme and an old move list |
| LOW | 未対応（候補） | legacy-naming | lobby-dialog-filter | Town dialog icon draws the official solamo.png through svg(), adding contrast/saturate/hue-rotate filters |
| LOW | 修正済み | legacy-naming | hayate-rename-not-on-slot-import | ハヤテ→ガウル rename (and the S.fx1 move fix) are not applied when loading a slot or save code |
| LOW | 保留（仕様判断） | legacy-naming | rescue-label-farm | Battle-error rescue button says 「ファームにもどる」 but always returns to the Chapter board |
| LOW | 報告のみ（Phase 6） | legacy-naming | old-prize-in-battle-win-text | (Phase 6) Match-win text uses the old prize table PZ; C/B amounts don't even match the official prizes |
| LOW | 未対応（候補） | legacy-naming | dead-old-hall-dscr-branches | Unreachable old farm UI branches: calendar tournament (大会は3・6・9・12月の第4週), 師匠 training, old status and skill lists |
| LOW | 未対応（候補） | legacy-naming | dead-functions-nonbattle | Non-battle functions and constants with zero callers (old training/rest/calendar, starter pick, old skill toggles, old NPC bubble, manual save) |
| LOW | 報告のみ（Phase 6） | legacy-naming | dead-battle-presentation | Dead battle-presentation code and data outside the fight() hash (old horizontal roulette, unused FX, stageIntro) |
| LOW | 保留（仕様判断） | legacy-naming | dead-embedded-images-weight | About 0.73 MB of unused base64 images are downloaded on every launch (7.7% of index.html) |
| LOW | 保留（仕様判断） | legacy-naming | rina-npc-not-shown | リナ (the market NPC in CLAUDE.md) and the Dan portrait are no longer shown anywhere at runtime |
| LOW | 保留（仕様判断） | legacy-naming | docs-foundation-conflicts | README / docs/decisions.md / package.json describe the unloaded PHASE 1 foundation and conflict with CLAUDE.md |
| LOW | 修正済み | save-corruption | boot-brick-primitive-monster | A save whose S.m or a box element is a non-null primitive kills the whole game at boot: blank page on every reload, no backup |
| LOW | 修正済み | save-corruption | boot-brick-fx1-migration | The old fx1 skill-ID migration at top level throws on a non-array sk or eq, aborting the whole game script |
| LOW | 修正済み | save-corruption | import-slotload-not-atomic | Loading a save code (imp) or a save slot (slotLoad) overwrites the autosave before the first screen renders; a failure then shows 'invalid code' but the bad save is already persisted |
| LOW | 修正済み | save-corruption | gold-type-not-normalized | S.g is never normalized: a string gold concatenates on income, and a non-numeric one allows free purchases and fusion |
| LOW | 保留（仕様判断） | save-corruption | invalid-chapter-softlock | An out-of-range or string raise.ch soft-locks the Chapter間ファーム (between-chapter farm): departing is disabled and 育成放棄 (abandon) is the only way out |
| LOW | 修正済み | save-corruption | fuse-charges-before-mk-throws | fuse() takes 200G and S.cnt+1 before mk() throws for species missing from the old SP table (sp 2 nobiton / 3 jiol); nothing is fused and the loss is saved later |
| LOW | 修正済み | save-corruption | skill-tab-crash-unknown-species-or-move | The わざ / 技管理 tab crashes for species without an old skill table (nobiton, jiol, unknown), an unknown s2, unknown or string eq IDs, or a missing sk |
| LOW | 修正（一部保留） | save-corruption | null-elements-not-filtered | The normalizer keeps null or bad elements in box, inv.bag, inv.vault and raise.log, which crashes the 受け取る tab, prep, shop and completion screens |
| LOW | 修正（一部保留） | save-corruption | monster-name-html-injection | Monster names are put into innerHTML without escaping, so a save code or slot can inject HTML and run script |
| LOW | 保留（仕様判断） | save-corruption | unreadable-silent-new-game | An unreadable save silently becomes a new game (caption 'はじめてのプレイです', no notice and no restore path); the backup exists only in localStorage |
| LOW | 保留（仕様判断） | save-corruption | autosave-silent-failure | Autosave failures are silent: when storage is full, a purchase shows success but is rolled back on reload |
| LOW | 保留（仕様判断） | save-corruption | normalizer-value-gaps-exploits | Out-of-range values the normalizer accepts give exploits or wrong labels, not crashes |
| LOW | 保留（仕様判断） | save-integrity | imp-single-press-overwrite | imp() replaces the current save with one tap (no confirmation, no backup); newer-version code gets a misleading message |
| LOW | 保留（仕様判断） | save-integrity | reset-arm-never-expires | '最初からやり直す' stays armed forever after the first press (no timeout), and the wipe has no backup |
| LOW | 修正済み | save-integrity | resolve-timer-after-leave | board() schedules p8Resolve 350 ms later without a screen check; leaving the board in that window (中断/ステータス/技) applies the landing and re-renders the board over the title/status screen |
| LOW | 修正済み | save-integrity | stale-fuse-selection-after-abandon | p8AbandonGo (and reset) do not clear the fusion selection `sel`; stale indices remain after the monster list shrinks and can block fusion |
| LOW | 保留（仕様判断） | save-integrity | unreadable-save-silent-replace | Unreadable save is backed up but replaced at boot with a fresh save without any notice; no in-game recovery |
| LOW | 保留（仕様判断） | save-integrity | silent-save-failure | save() swallows write errors (quota/private mode); the save screen still says '進行は自動でも保存されています' |
| LOW | 未対応（候補） | save-integrity | dead-code-save-writers | Unused old functions write the save without the current guards: pick() replaces a raising S.m, msave() ignores the version lock |
| LOW | 修正済み | input-races | market-buy-dbltap-skips-confirm | Double-tapping the market 「購入する」 buys immediately: the 2nd tap hits 「連れて帰る」 on the freshly opened confirm sheet |
| LOW | 修正（一部保留） | input-races | p9arm-dbltap-tour-start | p9arm confirmations (ランク○大会 start, 対戦開始) are confirmed by a double-tap on touch; the armed rank card also collapses and moves |
| LOW | 修正済み | input-races | arm-dbltap-finish-nofinal | 「育成を完了して街へ戻る」 (arm) completes raising on a double-tap (count stays correct) |
| LOW | 修正済み | input-races | arm-restore-flattens-markup | arm() restores the label with textContent, so the depart button loses its <small> sub-label after the 3s reset |
| LOW | 修正済み | input-races | menu-dbltap-closes | Double-tapping the board ☰ opens the menu and immediately closes it (the 2nd tap hits the overlay backdrop) |
| LOW | 修正済み | input-races | abandon-countdown-interval-leak | The 育成放棄 final-confirm countdown interval is never cleared; reopening within about 1s makes the button usable in about 2.2s instead of 3s |
| LOW | 修正済み | input-races | board-resolve-timer-after-leave | The board's 350ms auto-resolve timer still fires after leaving the board: ☰→中断 inside that window puts the board back over the title |
| LOW | 報告のみ（Phase 6） | input-races | phase6-surrender-dbltap | Battle 「🏳 降参」 (inside fight(), Phase 6 protected) surrenders on a double-tap |
| LOW | 修正済み | npc-market | talk-opening-input-skips-typing | The input that opens a Fina talk also counts as the first talk tap, so line 1's typing is skipped (Enter/完了 on the name field, or a fast double tap) |
| LOW | 修正済み | npc-market | arm-flattens-depart-label | After Fina's depart talk, the automatic 2-press arm restores the button with textContent, so after 3 s the <small> sub-label is merged into the main text |
| LOW | 未対応（候補） | npc-market | fina-images-not-preloaded | Fina portraits (~0.5 MB each) are downloaded only when a line starts; on slow networks she appears blank for seconds and goes blank between expressions |
| LOW | 修正済み | npc-market | stale-swipe-origin-mouse | Market: a mouse drag that ends outside #p10car leaves the swipe start point set, so the next arrow click also counts as a swipe (PREV moves to NEXT) |
| LOW | 保留（仕様判断） | npc-market | market-buy-below-fold | Market: the purchase button is below the first screen on every target phone size (the player must scroll past the stats to buy) |
| LOW | 修正済み | npc-market | anim-only-npc-fig-hidden | MMNPC: for an animation line of an NPC that has no still images, the portrait is hidden after the first typed character (latent; Fina has stills) |
| LOW | 未対応（候補） | tech-dom | town-per-frame-layout | The town (lobby) and ぽかぽか牧場 (farm) screens run a layout on every frame while idle, from the walking-monster keyframes that animate `left`. The map-button glow also repaints every frame by animating box-shadow. |
| LOW | 修正済み | tech-dom | abandon-countdown-stale-interval | The 3-second wait on the 育成放棄 final button can be shortened: the countdown interval from a closed dialog keeps running and also drives the button of a newly reopened dialog. |
| LOW | 未対応（候補） | tech-dom | duplicate-svg-ids | Some inline SVG icons repeat the same gradient id on one screen (p10cg in the market, ic-<type>-22 in branch previews, tkg in the ticket icon). |
| LOW | 未対応（候補） | tech-dom | modal-no-scroll-lock | The modal overlays do not lock page scroll, so on tall pages (Chapter 2-4 map) the page scrolls underneath the menu, the abandon dialog and the Fina talk. |
| LOW | 保留（仕様判断） | tech-dom | reset-arm-never-expires | The two-press confirmation on 最初からやり直す (full save reset) stays armed until the screen re-renders; other two-press buttons (arm()) disarm after 3 s. |
| LOW | 修正済み | tech-dom | trroll-fallback-comment | When the dice animation cannot play, the training roll never shows the actual result or does the 250 ms pause, because that code sits inside a comment on index.html:2338. |
| LOW | 保留（仕様判断） | images-responsive | tour-standings-name-truncation | Tournament standings (and VS name tag) cut NPC names to '<title>ブリーダー …' at 360/375 widths, hiding the only distinguishing part |
| LOW | 未対応（候補） | images-responsive | town-mascot-color-filter | Town (lobby) mascot shows the official solamo.png with a contrast/saturate CSS filter, against the rule that official images must not be recolored |
| LOW | 未対応（候補） | images-responsive | npc-avatar-distortion | Kou avatar on Chapter間ファーム and the training header icon are stretched (no object-fit), unlike the same images elsewhere |
| LOW | 保留（仕様判断） | images-responsive | moves-editor-reorder-covers-crit | 技管理 (move set) rows: ▲▼ reorder buttons sit over the クリ率 column, hiding crit values at 390 and 375 |
| LOW | 報告のみ（Phase 6） | images-responsive | battle-hp-card-cut-right | Battle screen: opponent HP card and portrait extend past the right edge at widths of 390 or less (Phase 6 UI) |
| LOW | 未対応（候補） | images-responsive | harness-http-cache-disabled-flaky-bad | e2e harness: ctx.route plus a no-store server disables image caching, so dice frame requests are aborted and appear in p.bad under load (test artifact, not a game bug) |
| LOW | 保留（仕様判断） | flow-early | market-buy-button-below-fold | Market: the 購入する button is below the fold at the reference size 390×844 (also 375×667 and 360×800) |
| LOW | 保留（仕様判断） | flow-early | fusion-child-hue-filter | Every fused child is drawn through the old SVG path with a hue-rotate filter and a second-species overlay, so the official image colour changes |
| LOW | 保留（仕様判断） | flow-early | fusion-child-skill-list-s2 | A fused child's 技管理 lists both species' moves (4 / 20), and locked moves say 「…の修行で覚える」 although the current training teaches no moves |
| LOW | 修正済み | flow-early | fuse-charges-before-validating | fuse() deducts 200G (and increments S.cnt) before it checks that two valid parents exist, so a short or stale `sel` throws after charging |
| LOW | 修正済み | flow-early | stale-fusion-selection | The fusion selection `sel` (index-based) is not cleared by 育成放棄 or 最初からやり直す, so the 合体 tab can pre-select different monsters |
| LOW | 修正済み | flow-early | dep-null-guard | dep() has no check for a carried monster: with S.m null it pushes null into S.box, saves, and the 受け取る tab then crashes on every render (null persists after reload) |
| LOW | 修正済み | flow-early | enter-skips-fina-first-line | Confirming the player name with Enter (or the iPhone keyboard's 完了 key) also skips the typewriter on Fina's first intro line |
| LOW | 修正済み | flow-early | cname-surrogate-split | The fused-child name (cname) can split emoji surrogate pairs and produce a broken character |
| LOW | 保留（仕様判断） | flow-early | town-msg-no-carried | When the only carried monster is deposited or sold, the town says 「モンスターがいません。まずは市場で選ぼう。」 although monsters are waiting in the ranch |
| LOW | 修正済み | flow-early | lobby-keeps-scroll | lobby() does not reset the scroll position, so after fusing from a scrolled ranch page the town opens part-way down with the title bar off-screen |
| LOW | 修正済み | flow-late | trroll-commented-code | trRoll: dice-result display and 250ms pause are accidentally inside a // comment |
| LOW | 保留（仕様判断） | flow-late | train-goal-back-label | Training goal button 「◀ ファームへ戻る」 goes to the 修行 menu, not the farm |
| LOW | 保留（仕様判断） | flow-late | standings-before-first-match | Tournament standings list places 1..N (by hidden lottery) before any match is played |
| LOW | 保留（仕様判断） | spec-phase6 | rescue-overlay-says-not-recorded-but-records | Battle error overlay (rescue) fires on any unhandled rejection, says the result is not recorded, but the battle keeps running and the result IS recorded |
| LOW | 修正済み | spec-phase6 | npm-test-runs-only-foundation-rules | package.json `npm test` runs only tests/rules.test.mjs (134 foundation tests, all pass), not the 413-test suite CLAUDE.md requires; package name is the old 'monster-master' |
| LOW | 保留（仕様判断） | spec-phase6 | foundation-tree-conflicting-spec | Unloaded PHASE 1 foundation tree (js/main.js, js/core, js/ui, js/dev, js/systems/{conditions,entry,flows,raising,individual}.js, data/*.json, docs/*.md, css/*) encodes rules that contradict CLAUDE.md, and 134 of the 413 passing tests guard it |
| LOW | 保留（仕様判断） | spec-phase6 | stat-colors-three-schemes | Stat colors in the live game do not match CLAUDE.md (ライフ黄・命中ピンク) and differ between screens |
| LOW | 報告のみ（Phase 6） | spec-phase6 | battle-official-images-css-filtered | In battle, official monster images are drawn with CSS filters (contrast/saturate for everyone, hue-rotate by rank for opponents, a fused-look overlay at A/S), against CLAUDE.md's no-filter rule |
| LOW | 保留（仕様判断） | spec-phase6 | legacy-sprites-in-battle-and-museum | Museum and battle win/lose poses and attack frames use embedded legacy base64 sprites instead of assets/monsters; the museum card also shows a personality the master data treats as undecided |
| LOW | 報告のみ（Phase 6） | spec-phase6 | win-text-legacy-prize-persistent | The old in-fight WIN text stays on screen until the player taps (not '一瞬'), announces a rank-up, and shows the old PZ amounts (C 300G / B 500G) instead of the official 350G / 550G |
| LOW | 修正済み | spec-phase6 | legacy-and-engine-hash-not-tested | CLAUDE.md says the protection hashes are checked in tests/phase7.test.mjs, but the legacy hash (90eeba79) and js/systems/battle/* are not hashed by any test |
| LOW | 未対応（候補） | spec-phase6 | claude-md-systems-row | CLAUDE.md §2 lists js/systems/ as the battle engine, but the folder mixes foundation modules, js/systems/battle/* is not loaded, and several important files are missing from the table |
| LOW | 未対応（候補） | spec-phase6 | known-issues-stale | KNOWN_ISSUES.md contains outdated and self-contradicting statements |
| LOW | 未対応（候補） | spec-phase6 | readme-stale | README.md describes the PHASE 1 foundation app (no game screens, dev gallery, ?dev=foundation, ES modules, npm test) |
| INFO | 対応不要 | legacy-naming | foundation-tree-unreferenced | Foundation tree (js/main.js, js/core, js/ui, js/dev, non-battle js/systems, css/, data/, docs/) is never loaded by the live game |
| INFO | 対応不要 | legacy-naming | legacy-compat-kept | Compatibility-only leftovers that must stay: legacy monster/save fields, old board data, v4/v5 migration, checkpoint format name |
| INFO | 対応不要 | legacy-naming | master-wording-comments | Comments use 「正式モンスターマスター」 (master data), which reads like the old game name |
| INFO | 保留（仕様判断） | legacy-naming | stale-known-issues-integration | KNOWN_ISSUES.md Fina section and INTEGRATION_STATUS.md are out of date (and use the old name) |
| INFO | 未対応（候補） | legacy-naming | dead-css-candidates | About 110 CSS classes in index.html have no occurrence in live markup/JS (old market, old town, old training UI) |
| INFO | 未対応（候補） | legacy-naming | dead-test-helper-bresolve | tests/phase7.test.mjs has a dead helper that references removed code (bResolve / TYPE_LABEL_TO_KEY) |
| INFO | 対応不要 | save-corruption | normalizer-silent-progress-reset | By design, the normalizer silently resets progress for an unknown raise.state and for extra raising monsters in the box |
| INFO | 報告のみ（Phase 6） | save-corruption | phase6-fight-unknown-move | fight() crashes on unknown move IDs in eq; the existing rescue() overlay catches it (Phase 6 protected, report only) |
| INFO | 保留（仕様判断） | save-integrity | title-caption-misleading | Title caption says 'はじめてのプレイです' for a newer-version (locked) save, an unreadable save, and a continuing player with 0 monsters |
| INFO | 対応不要 | save-integrity | autosave-everywhere | No screen outside the official suspend point holds unsaved state: every state change saves immediately, and a reload resumes at the resume target |
| INFO | 報告のみ（Phase 6） | save-integrity | fight-end-inflated-save-window | On the fight result screen the stored save temporarily holds the old fight() rewards (gold, wins, br, rk, fa, st) until もどる or board() calls finishBattle |
| INFO | 対応不要 | save-integrity | mid-battle-reload-retry | Reloading before a battle ends lets the player retry the same league or practice match (allowed by the spec) |
| INFO | 保留（仕様判断） | save-integrity | ios-storage-eviction | Progress lives only in localStorage; iOS Safari's 7-day eviction of script-written storage can erase it for players who stop playing for a while |
| INFO | 対応不要 | input-races | info-ios-dbltap-unverified | Real iOS Safari double-tap delivery not verified |
| INFO | 保留（仕様判断） | npc-market | rina-not-displayed | リナ (listed in CLAUDE.md as the market NPC) has not been shown anywhere since the Phase 10 market rewrite; NP.m / NPI.m are data only and the npc() helper has no callers |
| INFO | 保留（仕様判断） | npc-market | nobiton-sale-latent-money-loss | Latent: if Nobiton is put on sale by only flipping MARKET_CATALOG, adopt() takes the money and then mk(2) throws (the legacy SP table has only species 0 and 1) |
| INFO | 対応不要 | tech-dom | market-forced-layouts | Opening the market forces about 6 synchronous layouts. Every window resize event forces 2 more, with no throttling. |
| INFO | 未対応（候補） | tech-dom | dsh-sheet-not-cleared | The move-detail sheet (#dsh) is removed only by _hall(). Any other navigation leaves it on screen (z-index 30, above the title). The current UI has no path to trigger this. |
| INFO | 対応不要 | tech-dom | dead-timer-code | Two old animation loops are never called: farmAnim() and sweep()/drawBar(). |
| INFO | 対応不要 | tech-dom | unlock-every-input | The audio unlock runs on every tap and key press for the whole session, creating 1-sample AudioBuffers each time; the cost is negligible. |
| INFO | 保留（仕様判断） | images-responsive | unused-asset-files | Asset files not used by the live game (4 unreferenced anywhere, 38 used only by the foundation tree, about 8.5MB registered but never displayed); no byte duplicates |
| INFO | 保留（仕様判断） | images-responsive | index-html-weight-dead-base64 | index.html is 9.47MB (7.0MB gzip), 9.10MB of it base64 images, including about 724KB of never-referenced embedded images; first load on slow networks is long |
| INFO | 保留（仕様判断） | images-responsive | fusion-hue-filter-info | Fused monsters are drawn with a hue-rotate/contrast/saturate filter on the official PNG (open item: fusion color handling) |
| INFO | 対応不要 | images-responsive | old-name-in-embedded-backgrounds | Ranch and farm-hall embedded backgrounds still show the old logo 'モンスターマスター MONSTER MASTER' (known, awaiting material) |
| INFO | 対応不要 | images-responsive | vs-vs-battle-species-mismatch-info | VS screen opponent image and the battle opponent species can differ (provisional, documented in code) |
| INFO | 保留（仕様判断） | flow-early | fusion-single-tap | Fusion is irreversible (both parents deleted, 200G charged) but runs on a single tap, while selling needs two presses |
| INFO | 保留（仕様判断） | flow-early | mk-nobiton-latent-crash | Latent: mk() cannot create ノビトン or ジオル (SP has only 2 entries), and adopt() charges before calling mk() |
| INFO | 対応不要 | flow-early | rename-not-implemented | There is no rename for owned monsters; names are set only in the purchase sheet (#mnm). Fused children get cname() |
| INFO | 対応不要 | flow-early | raise-intro-flag-before-talk | The first-raise explanation is marked as shown before the talk starts, so a reload during it means the 3-line 「途中で街へ戻れない」 explanation is never shown again |
| INFO | 保留（仕様判断） | flow-late | train-ui-promises-moves | Training UI says moves are learned at the goal, while the spec says training is currently stat-only |
| INFO | 対応不要 | flow-late | tour-rewards-undocumented | Tournament first-win tickets, per-win stat bonus and S-rank bag unlock are implemented and shown but not in CLAUDE.md |
| INFO | 保留（仕様判断） | flow-late | no-suspend-on-training-board | Training board has no 中断/menu button (suspend only by closing the app) |
| INFO | 未対応（候補） | flow-late | battle-square-fxtext | Landing on a practice-battle square sets #bmsg to 「何も起きなかった。」, hidden only by CSS :has() |
| INFO | 対応不要 | flow-late | late-flow-ui-test-gaps | Late-flow UI glue is untested: after-battle message, training return path, done→ranch→town, ghost clicks; e2e harness has no test consumer |
| INFO | 保留（仕様判断） | flow-late | resume-after-finished-battle-no-verdict | Resuming after closing the app on fight()'s result screen settles the match silently (no 勝ち/負け message) |
| INFO | 保留（仕様判断） | spec-phase6 | fused-child-hue-rotated | Fused monsters are shown with a hue-rotate filter on every screen (farm, market and so on) through msv()→svg() |
| INFO | 未対応（候補） | spec-phase6 | integration-status-stale | INTEGRATION_STATUS.md describes the pre-Phase-6 state (act() not connected), and uses the old name and directory |
| INFO | 未対応（候補） | spec-phase6 | scenes-readme-dice-stale | assets/scenes/README.md says the official dice are not yet registered, but they are registered and used |
| INFO | 報告のみ（Phase 6） | spec-phase6 | protected-files-stale-comments | Comments in protected files are stale: adapter.js says it is not wired to act()/fight(), and the bridge session comments talk about a 30-turn decision |
| INFO | 対応不要 | spec-phase6 | battle-ignores-speed | Species speed (1-10) is not used in battle: both sides use DEFAULT_SPEED 5, so the first move is 50/50 |
| INFO | 報告のみ（Phase 6） | spec-phase6 | timeup-tie-is-loss | At TIME UP, equal remaining life counts as a player loss, but CLAUDE.md does not define ties |
| INFO | 報告のみ（Phase 6） | spec-phase6 | vs-screen-vs-battle-opponent | The league VS screen shows the entrant's name and species, but the actual battle opponent is a random species named 'ランク○の対戦相手' |
| INFO | 未対応（候補） | spec-phase6 | item-sell-partly-implemented | CLAUDE.md says item selling is not implemented, but the shop has a working sell UI and MMP7.shopSell (it just has no sellable items) |
| INFO | 報告のみ（Phase 6） | spec-phase6 | engine-throws-on-zero-stat | The battle engine throws when an effective stat base is 0 (hit/evasion/toughness/power/wisdom), which would abort the battle through rescue() |
| INFO | 未対応（候補） | spec-phase6 | save-keys-undocumented | CLAUDE.md's save section omits the other localStorage keys the game reads and writes (slots, audio, backups) and the v4 migration |
| INFO | 対応不要 | spec-phase6 | base-newsave-1000g | MMP7/MMP8 newSave() still default to 1000G; only index.html's p10NewSave overrides this to 300G |
| — | 反証済み（問題なし） | legacy-naming | league-npc-hayate | Provisional tournament opponent name list includes 「ハヤテ」 (the former name of ガウル) |
| — | 反証済み（問題なし） | input-races | latent-reentrancy-fuse-name-mkgo | fuse(), p11NameGo() and mkgo() rely only on the synchronous re-render; a same-tick second call charges twice, resets the name or double-buys |
| — | 反証済み（問題なし） | npc-market | ios-double-tap-zoom-unguarded | The talk overlay and market arrows do not set touch-action: manipulation; iOS double-tap zoom during quick taps is possible but unverified |
| — | 反証済み（問題なし） | tech-dom | roulette-scrollintoview | While the move roulette spins, every 85 ms tick calls scrollIntoView, which forces a layout. Measured at about 6% main-thread use on desktop; protected Phase 6 code, report only. |
| — | 反証済み（問題なし） | spec-phase6 | ch4-final-tournament-label | Chapter 4 is labelled '最終大会' (final tournament) although it is a normal rank tournament and the final route comes after it |
