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
  assert.deepEqual(L('raiseFirst'), [['normal', 'このモンスターで育成を始めますか？'], ['serious', '育成を始めると、途中で街へ戻ることはできません。'], ['smile', '準備ができたら、出発しましょう！']]);
  assert.deepEqual(L('raiseAgain'), [['normal', 'このモンスターで育成を始めますか？']], '2回目以降は簡潔な確認');
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

test('FA-3：育成開始：1回目の押下でフィナの会話（初回は説明つき・2回目以降は簡潔）→ 終わると従来の2度押し確認 → もう一度押すと出発。押さなければ取り消し', async () => {
  const mk = () => { const S = { m: { raise: { state: 'none' } } }, log = [], timers = [], clk = { t: 1000 };
    let res; const run = new Function('S', 'window', 'document', 'setTimeout', 'performance', 'save', 'finaTalk', 'MMP7', 'MMP8', 'board', 'prepScr', 'lobby', 'P7_ERR', 'p8ChLabel', `${fnSrc('finaFlags')}\n${fnSrc('tapAt')}\n${fnSrc('tapSoon')}\n${fnSrc('arm')}\n${fnSrc('p7Depart')}\nreturn p7Depart;`)(
      S, { MMNPC: {} }, { body: { contains: () => true } }, (fn) => timers.push(fn), { now: () => clk.t }, () => log.push('save'), (k) => { log.push('talk:' + k); return new Promise((r) => { res = r; }); },
      { raiseState: (m) => m.raise.state }, { depart: () => { log.push('depart'); S.m.raise.state = 'board'; return { ok: true, key: 1 }; } }, (m) => log.push('board'), () => log.push('prep'), () => log.push('lobby'), {}, () => 'CHAPTER 1');
    return { S, log, timers, run, clk, done: () => res() }; };
  const t = mk(), b = { dataset: {}, textContent: 'CHAPTER 1へ出発（育成開始）' };
  t.run(b); assert.deepEqual(t.log, ['save', 'talk:raiseFirst'], '初回：説明つきの会話。まだ出発しない'); assert.equal(t.S.npcFlags.raiseIntro, 1);
  t.run(b); assert.deepEqual(t.log, ['save', 'talk:raiseFirst'], '会話中の二度押しは無視');
  t.done(); await new Promise((r) => setTimeout(r, 0));
  assert.equal(b.dataset.a, '1'); assert.match(b.textContent, /もう一度押すと育成開始（完了か放棄まで街へ戻れません）/, '会話のあと、従来の確認（2度押し）');
  t.clk.t += 600;   // QA G3：確認状態になってから0.4秒未満の押下では確定しない（連打対策）。少し待ってからもう一度押す
  t.run(b); assert.deepEqual(t.log.slice(-3), ['depart', 'save', 'board'], 'もう一度押すと従来どおり出発');
  const u = mk(); u.S.npcFlags = { raiseIntro: 1 }; const c = { dataset: {}, textContent: '出発' };
  u.run(c); assert.deepEqual(u.log, ['talk:raiseAgain'], '2回目以降は簡潔な確認'); u.done(); await new Promise((r) => setTimeout(r, 0));
  u.timers.forEach((f) => f()); assert.equal(c.dataset.a, '', '3秒押さなければ従来どおり取り消し'); assert.ok(!u.log.includes('depart'));
  const v = mk(); v.S.m.raise.state = 'farm'; v.run({ dataset: {} }); assert.deepEqual(v.log, ['depart', 'save', 'board'], 'Chapter 2以降への出発（育成中）は会話なし・従来どおり');
});

test('FA-4：育成完了画面の表示の最後で会話（完了の処理・保存は従来のまま）。完了画面は完了のときだけ表示され、常設の画面には置かない', () => {
  assert.match(fnSrc('p8DoneScr'), /try\{window\.scrollTo\(0,0\)\}catch\(e\)\{\}finaTalk\("done"\)\}$/);
  const calls = [...HTML.matchAll(/p8DoneScr\(/g)].length; assert.equal(calls, 3, '定義＋育成完了（Chapter 4終了）＋最終ルート未登録時の完了だけ');
  assert.doesNotMatch(fnSrc('p8DoneScr'), /save\(\)|MMP8\.(depart|endChapter|declineTournament|finishWithoutFinal|closeChapter)/, '完了画面では保存・進行の処理をしない（従来どおり）');
});
