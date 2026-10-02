# assets/audio — 正式な音源の置き場

- `bgm/<素材パック>/…ogg`：BGM。`se/<素材パック>/…ogg`：SE。ファイル名は英小文字・数字・`_`（元の名前から空白と記号を置き換えた）。
- どの場面・出来事で鳴るかは **js/audio/audio-registry.js**（BGM_REGISTRY／SE_REGISTRY）だけが決める。ゲームのコードにファイル名は無い。
- 出どころ・作者・ライセンス・クレジット・元ファイル名は **AUDIO_CREDITS.md**。
- 置くのは registry から参照するファイルだけ（tests/audio-manager.test.mjs の AUDIO-15 が、参照の無いファイル・同じ曲の別形式・ZIP／WAV を見つける）。
- 形式は OGG（Vorbis）。再生できないブラウザでは Audio Manager が canPlayType で判断して合成音へ落とす。別形式を足すときは registry の `src` を配列にする（例：`['….ogg', '….m4a']`）。同じ曲を複数の形式で置くのはそのときだけ。
- 元の音源は加工しない（EQ・ピッチ・速度・リバーブ・音圧）。音量の差は registry の `gain` で合わせる。SE の末尾の無音は読み込み時にメモリ上で切る（ファイルは変えない）。

## 明日、曲を足す・替えるとき

1. 新しいパックの OGG を `bgm/<パック名>/` に置く（採用する曲だけ）。
2. `js/audio/audio-registry.js` の BGM_REGISTRY で、場面の `src` をそのファイルにする（`gain` は AUDIO_CREDITS.md の表の LUFS を見て、目安 -18 LUFS になるように）。
3. AUDIO_CREDITS.md に作者・ライセンス・元ファイル名を足す。
4. `node --test tests/audio-manager.test.mjs tests/game-feel.test.mjs` → `node --test tests/*.test.mjs` → `QA_E2E=1 node --test tests/qa-e2e-feel.test.mjs`。
5. 使わなくなった曲のファイルは消してよい（registry から参照が無くなると AUDIO-15 が知らせる）。
