// =========================================================
// フィナの通常ゲームへの登場（正式に指定された3か所）：共通会話 MMNPC を使う
//  ① 名前登録の直後に1度だけのあいさつ（先に表示済みを保存→再読込しても二度出ない）
//  ② 育成開始（未育成→Chapter 1）の確認：1回目の押下でフィナの会話（初回だけ説明つき）→ 終わったら従来の2度押し確認
//  ③ 育成完了画面で会話（育成完了の処理・個体の保存は変えない）
// =========================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const fnSrc = (name) => { const i = HTML.indexOf(`function ${name}(`); if (i < 0) throw new Error(name); const k = HTML.indexOf('\nfunction ', i + 10), k2 = HTML.indexOf('\nconst ', i + 10), k3 = HTML.indexOf('\n//', i + 10); return HTML.slice(i, Math.min(...[k, k2, k3].filter((x) => x > 0))); };
const FT = new Function(`${HTML.slice(HTML.indexOf('const FINA_TALK='), HTML.indexOf('\nfunction finaFlags('))}\nreturn FINA_TALK;`)();
const L = (k) => FT[k].map((x) => [x.expression, x.text]);

test('FA-1：会話の文章と表情は指定どおり（あいさつ・育成開始〔初回／2回目以降〕・育成完了）', () => {
  assert.deepEqual(L('intro'), [['smile', 'はじめまして。私はフィナです！'], ['normal', 'これからあなたのモンスター育成をお手伝いしますね。'], ['guide', 'まずは市場へ行って、一緒に育てるモンスターを迎えてみましょう！']]);
  assert.deepEqual(L('raiseFirst'), [['serious', '育成を始めると、途中で街には戻れないから気をつけてね。'], ['normal', 'この子の育成を始める？']], '初回は説明のあと確認');
  assert.deepEqual(L('raiseAgain'), [['normal', 'この子の育成を始める？']], '2回目以降は確認だけ');
  const CH = [{ id: 'start', label: '始める' }, { id: 'cancel', label: 'まだやめておく' }];
  for (const k of ['raiseFirst', 'raiseAgain']) { const a = FT[k]; assert.deepEqual(a[a.length - 1].choices, CH, `${k}：最後の行（確認）に選択肢「始める／まだやめておく」`); assert.ok(a.slice(0, -1).every((l) => !l.choices)); }
  assert.deepEqual(L('done'), [['happy', 'お疲れさまでした！　育成完了です！'], ['smile', 'ここまで育ててきた時間が、この子の力になっていますね。'], ['guide', '育て終わったモンスターは、牧場でいつでも確認できますよ。']]);
  for (const k of Object.keys(FT)) assert.equal(FT[k][0].npc, 'fina');
});

test('FA-2：名前登録の直後に1度だけあいさつ。表示前に「表示済み」を保存するので、再読込しても二度出ない', () => {
  const S = { playerNamePending: true }, log = [];
  const run = new Function('S', 'save', 'lobby', 'finaTalk', '$', 'MMP11P', 'p11Esc', `${fnSrc('finaFlags')}\n${fnSrc('finaIntro')}\n${fnSrc('p11NameGo')}\nreturn p11NameGo;`)(
    S, () => log.push(['save', JSON.stringify(S.npcFlags || null)]), (m) => log.push(['lobby', m]), (k) => { log.push(['talk', k]); return Promise.resolve(); },
    () => ({ value: 'アルト' }), { confirmName: (s, v) => { s.playerNamePending = false; s.playerName = v; return v; } }, (t) => t);
  run();
  assert.deepEqual(log.map((x) => x[0]), ['save', 'lobby', 'save', 'talk']); assert.equal(log[2][1], '{"finaIntro":1}', '会話を出す前に表示済みを保存');
  assert.equal(log[3][1], 'intro'); run(); assert.equal(log.filter((x) => x[0] === 'talk').length, 1, '2回目は出ない');
  assert.equal((HTML.match(/finaIntro\(\)/g) || []).length, 2, '呼び出しは名前登録の確定（p11NameGo）だけ（＋定義）');
});

const HANDOFF = [{ npc: 'fina', text: 'x' }, { npc: 'dan', text: 'y' }];
test('FA-3：育成開始：押すとフィナの確認（初回は説明つき・2回目以降は1行）と選択肢。「始める」のときだけ同じ会話でフィナ→ダン → 従来の出発処理。「まだやめておく」・選ばずに閉じたときは何もしない（2度押しは求めない）', async () => {
  const mk = () => { const S = { m: { raise: { state: 'none' } } }, log = [], timers = [], clk = { t: 1000 };
    let res; const run = new Function('S', 'window', 'document', 'setTimeout', 'performance', 'save', 'finaTalk', 'MMP7', 'MMP8', 'board', 'prepScr', 'lobby', 'P7_ERR', 'p8ChLabel', 'DAN_TALK', `${fnSrc('finaFlags')}\n${fnSrc('tapAt')}\n${fnSrc('tapSoon')}\n${fnSrc('arm')}\n${fnSrc('p7Depart')}\nreturn p7Depart;`)(
      S, { MMNPC: {} }, { body: { contains: () => true } }, (fn) => timers.push(fn), { now: () => clk.t }, () => log.push('save'),
      (k, br) => { log.push('talk:' + k); assert.deepEqual(Object.keys(br), ['start']); assert.equal(br.start, HANDOFF, '「始める」の続きはフィナ→ダンの掛け合い'); return new Promise((r) => { res = r; }); },
      { raiseState: (m) => m.raise.state }, { depart: () => { log.push('depart'); S.m.raise.state = 'board'; return { ok: true, key: 1 }; } }, (m) => log.push('board'), () => log.push('prep'), () => log.push('lobby'), {}, () => 'CHAPTER 1', { handoff: HANDOFF });
    return { S, log, timers, run, clk, done: (v) => res(v) }; };
  const flush = () => new Promise((r) => setTimeout(r, 0));
  // 初回：説明つきの確認 →「まだやめておく」：何もしない（確認状態にもしない）
  const t = mk(), b = { dataset: {}, textContent: 'CHAPTER 1へ出発（育成開始）' };
  t.run(b); assert.deepEqual(t.log, ['save', 'talk:raiseFirst'], '初回：説明つきの確認。まだ出発しない'); assert.equal(t.S.npcFlags.raiseIntro, 1);
  t.run(b); assert.deepEqual(t.log, ['save', 'talk:raiseFirst'], '会話中の二度押しは無視');
  t.done('cancel'); await flush();
  assert.deepEqual(t.log, ['save', 'talk:raiseFirst'], '「まだやめておく」では何も始めない');
  assert.equal(b.dataset.a, undefined, '2度押しの確認状態にしない'); assert.equal(b.textContent, 'CHAPTER 1へ出発（育成開始）'); assert.equal(t.timers.length, 0);
  // 2回目以降：1行の確認 →「始める」→ 会話のあと従来の出発処理（depart・save・board）
  t.run(b); assert.deepEqual(t.log.slice(-1), ['talk:raiseAgain'], '2回目以降は1行の確認');
  t.done('start'); await flush();
  assert.deepEqual(t.log.slice(-3), ['depart', 'save', 'board'], '「始める」のあと従来どおり出発（2度押しは求めない）');
  // 選ばずに閉じた（null）：何もしない
  const u = mk(); u.S.npcFlags = { raiseIntro: 1 }; const c = { dataset: {}, textContent: '出発' };
  u.run(c); u.done(null); await flush(); assert.deepEqual(u.log, ['talk:raiseAgain']); assert.ok(!u.log.includes('depart'));
  // 会話中に状態が変わっていたら（すでに出発済みなど）出発し直さない
  const w = mk(); w.S.npcFlags = { raiseIntro: 1 }; w.run({ dataset: {} }); w.S.m.raise.state = 'board'; w.done('start'); await flush(); assert.ok(!w.log.includes('depart'));
  const v = mk(); v.S.m.raise.state = 'farm'; v.run({ dataset: {} }); assert.deepEqual(v.log, ['depart', 'save', 'board'], 'Chapter 2以降への出発（育成中）は会話なし・従来どおり');
});


test('FA-4：育成完了画面の表示の最後で会話（完了の処理・保存は従来のまま）。完了画面は完了のときだけ表示され、常設の画面には置かない', () => {
  assert.match(fnSrc('p8DoneScr'), /try\{window\.scrollTo\(0,0\)\}catch\(e\)\{\}finaTalk\("done"\)\}$/);
  const calls = [...HTML.matchAll(/p8DoneScr\(/g)].length; assert.equal(calls, 3, '定義＋育成完了（Chapter 4終了）＋最終ルート未登録時の完了だけ');
  assert.doesNotMatch(fnSrc('p8DoneScr'), /save\(\)|MMP8\.(depart|endChapter|declineTournament|finishWithoutFinal|closeChapter)/, '完了画面では保存・進行の処理をしない（従来どおり）');
});
