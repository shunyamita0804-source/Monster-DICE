# モンスターマスター

王道JRPG風のモンスター育成ゲーム。HTML / CSS / JavaScript の通常のWebプロジェクトです。
GitHub Pages で動作確認し、将来は Capacitor で iOS / Android アプリにします。

現在：**PHASE 1 ステップ1（土台）**
土台・状態管理・レスポンシブ・Safe Area・セーブ・素材台帳まで。ゲーム画面はまだありません。
起動すると開発用の「基盤チェック」画面が開きます。

## 動かし方

ES モジュールと JSON を読み込むため、`index.html` を直接開いても動きません。

**パソコン**
```
python3 -m http.server 8000
```
ブラウザで `http://localhost:8000/` を開きます。

**iPhone 実機**
パソコンと同じ Wi-Fi で `http://<パソコンのIPアドレス>:8000/` を開きます。

**GitHub Pages**
1. このフォルダの中身をリポジトリに push
2. Settings → Pages → Branch を `main` / `(root)` にして保存
3. `https://<ユーザー名>.github.io/<リポジトリ名>/` を開く

**パソコンで Safe Area を再現する**
`?safe=上,右,下,左` を付けます。例：`?safe=59,0,34,0`（iPhone 16 相当）
ブラウザの開発者ツールで端末サイズを切り替えて確認できます。

**ルールの自動テスト**（Node.js 20以上）
```
npm test
```

## フォルダ

```
index.html
css/        base.css（3層の器・Safe Area）／ ui.css（操作の共通ルール）／ dev.css（開発用）
js/
  main.js   起動
  core/     layout（倍率・Safe Area・背景）state（状態）save（手動3＋オート1）storage（保存先）
            assets（素材台帳）background router（画面切替とモード判定）theme config data bus playtime migrations
  systems/  raising（育成の開始・終了）entry（街・市場に入った時の判定）conditions（解放条件）
            individual（個体）flows（画面から呼ぶ入口＋オートセーブ）
  dev/      基盤チェック画面（開発用）
data/       config / theme（パラメーター6色）/ unlocks（解放条件）/ assets（素材台帳）
assets/     素材（reference/ は完成図。ゲーム画面には出さない）
docs/       確定仕様
tests/      ルールの自動テスト
```

## 基盤チェック画面の見方

- **レイアウト**：倍率・Safe Area・余った高さ。「背景：街の完成図＋ピン」で、端末を変えても円が建物のピンからずれないこと
- **状態**：育成の開始と終了、牧場満杯、救済、ノビトン解放、育成中に街へ移動できないこと
- **セーブ**：手動3枠＋オート。育成中に保存してロードするとファームから再開
- **素材台帳**：正式 / 仮 / 未作成 / 基準画像 の一覧
- **基準画像**：完成図を半透明で重ねる

## 素材の置き方

1. ファイルを `assets/` の該当フォルダに置く
2. `data/assets.json` の該当項目の `path` を合わせ、`status` を `official` にする

コードの修正は不要です。

**背景の仕様**
- サイズは 1080×2340
- 重要な要素は中央の 1080×1920 に収める。上下の各210pxは切れてもよい描き足し部分
