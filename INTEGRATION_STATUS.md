# ミスティックモンスターズ 統合版 - 現在の状態（統合Phase完了時点）

## ディレクトリ構成
```
mystic-monster-integrated/
├── index.html                      … 統合版の本体（旧Artifact + bridge/adapter読み込み追加のみ）
├── legacy/
│   └── index.original.html         … 旧Artifactの無変更バックアップ（照合用）
├── js/
│   ├── battle-bridge.js            … Phase1〜5を計算式そのままに結合し window.MMBattle として公開
│   ├── integration/
│   │   └── adapter.js              … 旧データ形式 ⇄ Phase5形式の変換のみ（計算は一切しない）
│   └── systems/                    … monster-master からの無変更コピー（参照用）
│       ├── individual.js
│       └── battle/
│           ├── firstActor.js
│           ├── combatMath.js
│           ├── effects.js
│           ├── session.js
│           ├── checkpoint.js
│           └── engine.js
└── tests/
    └── integration.test.mjs        … 統合境界のテスト（10件、全通過）
```

## 現在どこまでPhase1〜5の正式engineへ接続されているか

**接続済み（window.MMBattle / window.MMAdapter として利用可能）**
- Phase1〜5の全関数が`battle-bridge.js`経由でブラウザ上に読み込まれ、動作することを確認済み
- `adapter.js`が、旧個体データ（li/po/in/hi/ev/de）⇄ Phase5のstats形、旧技データ（SK配列+EFFエントリ）⇄ Phase5のMove形を変換できることを確認済み
- 変換したデータを実際に`MM.createBattleSession`・`MM.resolveAction`へ投入し、正しい結果が返ることをNode.js上のテスト（10件）とブラウザ上の手動確認の両方で確認済み

**まだ接続されていない（旧act()がそのまま動いている）**
- 実際のバトル画面（`fight`関数内の`act(s,k)`）は、**今回一切変更していません**。現在プレイして実際にダメージが出る・命中判定される処理は、すべて旧Artifactの独自ロジック（±15%乱数、クリティカル1.6倍、独自命中式`sk[8]/100+(hit-evasion)*0.004`、回避力ベースの先攻判定）のままです。
- `battle-bridge.js`と`adapter.js`は、ブラウザに読み込まれてはいますが、**`act()`関数からは一度も呼ばれていません**。つまり今この統合版でバトルを実際にプレイしても、Phase1〜5の正式計算式は使われず、旧計算式のままです。

## 次のPhase（Phase 6 or 別途指定）でやること
`act(s,k)`内の以下の部分を、`window.MMAdapter`で変換したデータを`window.MMBattle.resolveAction`に渡す形へ置き換える：
- 命中判定：`Math.random()>Math.min(.99,Math.max(.15,sk[8]/100+...))` の部分
- ダメージ計算：`Math.max(1,Math.round((sk[7]=="p"?A.po:A.in)*sk[1]*...))` の部分
- クリティカル：`Math.random()<sk[9]`（1.6倍）の部分
- Effect適用：`applyEf(s,k)` の部分
- 先攻判定：`side=p.ev>=e.ev?0:1` の部分（Battle Session作成時にMM.createBattleSessionへ一本化）

置き換え後も、`pop()`・`sfx()`・`ban()`・`say()`などの演出・SE呼び出しはそのまま維持し、`resolveAction`の返り値（`hit/critical/damage/ko/effectsApplied`）を使って呼び出すだけにする。

## 未解決の技術的課題（要ゲームデザイン判断）
- 旧SKの威力比率（0〜1.3）→ Phase5のmovePower（絶対値、60〜80程度で運用実績）への変換係数（`powerScale`）が未決定。`adapter.js`の`moveFromLegacySK`は`powerScale`を渡さない限り比率のまま返す設計にしてある。
- 先攻判定の説明文で「1が最速」と記載された指示があったが、Phase1〜6の一貫した仕様（10が最速）と矛盾するため、既存の`firstActor.js`（10が最速）を変更せずそのまま維持した。要確認。
