// =========================================================
// 第二段階 PHASE D（2026-10-04）：公式大会の画面（ランク選択・大会進行・パラメーター比較・VS・BATTLE START → 実戦）とランクの解放・S クリアの導線（静的）
//  TN-01〜05。画面は tests/qa-e2e-tournament.test.mjs
// =========================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const HTML = rd('index.html');
const CODE = HTML.slice(HTML.lastIndexOf('<script>'));
const fnOf = (name) => { const i = CODE.indexOf(`function ${name}(`); return CODE.slice(i, CODE.indexOf('\nfunction ', i + 10)); };

test('TN-01：ランク選択（デザイン参考 01）は従来どおり：S→E の6段・参加可能／参加不可（鎖と錠）・フィナの見立て・「この大会に参加する」・辞退。E・D は最初から、クリアごとに1つ上（RANK_UNLOCK_STEP 1・RANK_FLOOR D）', () => {
  const rc = fnOf('p9ReceptionHtml'); assert.match(rc, /\[5,4,3,2,1,0\]\.map\(row\)/); assert.match(rc, /参加可能/); assert.match(rc, /参加不可/); assert.match(rc, /rcv-chain/); assert.match(rc, /p8TourDecline\(this\)/);
  const R = rd('js/phase8/raising.js'); assert.match(R, /const RANK_UNLOCK_STEP = 1;/); assert.match(R, /const RANK_FLOOR = RANK_D;/);
  assert.match(rd('js/phase8/league.js'), /const LEAGUE_SIZE = Object\.freeze\(\[6, 6, 8, 8, 8, 8\]\);/, 'E・D 6体（5試合）・C〜S 8体（7試合）');
});

test('TN-02：大会進行（デザイン参考 02）：CHAPTER・公式大会・第N戦、現在の成績（第N戦 勝利／敗北／次の試合／未定）、次の対戦相手（自分 VS 相手）、セドリックの一言、「対戦開始」→ パラメーター比較。順位表・対戦表は下に残す', () => {
  const t = fnOf('p8TourScr');
  for (const s of ['<h3>現在の成績</h3>', 'class="tp2r ${cls}"', '勝利', '敗北', '次の試合', '未定', '<h3>次の対戦相手</h3>', 'class="p9vsl">VS</span>', '？？？', 'onclick="p9CompareScr()">⚔️ 対戦開始</button>', '${p9Standings(lg,st,false)}${p9Matrix(lg)}', '第${pm.round+1}試合 / 全${lg.rounds.length}試合']) assert.ok(t.includes(s), s);
  assert.match(t, /i<cur\?\(won\?"win":"lose"\):i===cur\?"next":"todo"/, '終わった試合＝勝敗・今＝次の試合・あと＝未定');
  assert.doesNotMatch(t, /p9Cmp\(|p9VsGo/, '数字の比較・2度押しは大会進行には無い（パラメーター比較へ）');
});

test('TN-03：パラメーター比較（デザイン参考 03）：両者の正式画像・6能力のゲージ＝999 を最大とした絶対の目盛り・正式色。数字・戦力・勝率・有利は出さない。「対戦開始」（2度押し p9VsGo）→ fight()。「順位表にもどる」', () => {
  const c = fnOf('p9CompareScr');
  assert.match(c, /const pct=v=>Math\.round\(Math\.min\(999,Math\.max\(0,v\|0\)\)\/999\*100\);/);
  assert.match(c, /KS\.map\(k=>`<div class="pcg"><div class="pcb l" style="--c:\$\{STAT_COLOR\[k\]\}"><i style="width:\$\{pct\(m\[k\]\)\}%"><\/i><\/div><span class="pcl">\$\{LAB\[k\]\}<\/span><div class="pcb r" style="--c:\$\{STAT_COLOR\[k\]\}"><i style="width:\$\{pct\(o\[k\]\)\}%"><\/i><\/div><\/div>`\)/);
  assert.doesNotMatch(c, /\$\{m\[k\]\}|\$\{o\[k\]\}|戦力|勝率|有利/, '数字・戦力・勝率・有利を出さない');
  assert.match(c, /data-nsfx="1" onclick="p9VsGo\(this\)">⚔️ 対戦開始<\/button>/); assert.match(c, /onclick="board\(\)">順位表にもどる<\/button>/);
  assert.match(c, /p9Pt\(m,"me"\)/); assert.match(c, /p9Pt\(o\)/); assert.match(c, /BTB\[t\.rank\]\[0\]/, '背景は fight() と同じ大会の背景');
  assert.match(CODE, /function p9VsGo\(b\)\{if\(bBusy\|\|!p9arm\(b,"もう一度押すと試合開始"\)\)return;p8TourFight\(\)\}/, '2度押し → fight()（導入の VS → FIGHT!）');
  assert.match(HTML, /\.pcb i\{[^}]*background:var\(--c\)/); assert.match(HTML, /\.p9cmps\{position:relative;margin:-16px;height:100dvh;/);
});

test('TN-04：VS（デザイン参考 04）＝fight() の導入（CHALLENGER／YOUR MONSTER・VS・自動で FIGHT!）。fight()・intro()・.bt 系 CSS は変えず、色（金の VS・札）だけ', () => {
  assert.match(HTML, /\.ivs b\{[^}]*color:#ffe08a;/); assert.match(HTML, /\.inm small\{display:inline-block;padding:2px 10px;border-radius:4px;/);
  const intro = CODE.slice(CODE.indexOf('async function intro(pl){'), CODE.indexOf('\nasync function fight('));
  assert.match(intro, /CHALLENGER/); assert.match(intro, /YOUR MONSTER/); assert.match(intro, /setTimeout\(fin,3100\)/, '約3.1秒・タップで飛ばせる（変えていない）');
  assert.match(CODE, /ban\(lb,"#ffffff"\);await sleep\(1000\);ban\("FIGHT!","#ff5a3a"\);sfx\(3\);/, 'BATTLE START＝大会名の帯 → FIGHT!（fight() のまま）');
});

test('TN-05：S ランク制覇＝Chapter 5 の解放フラグ（S.npcFlags.chapter5）と「新たな道が開かれた」の表示だけ。Chapter 5 の画面・ボードは作らない', () => {
  assert.match(fnOf('p8AfterBattle'), /if\(f\.settled&&f\.won&&S\.m&&S\.m\.raise&&S\.m\.raise\.tour&&S\.m\.raise\.tour\.rank===5&&!finaFlags\(\)\.chapter5\)\{finaFlags\(\)\.chapter5=1;save\(\)\}/);
  assert.match(fnOf('p9TourResult'), /t\.rank===5\?`<div class="p9newroad"><b>S ランク制覇！<\/b><span>新たな道が開かれた…（Chapter 5 は準備中）<\/span><\/div>`:""/);
  assert.doesNotMatch(CODE, /chapter5Scr|function ch5|Chapter 5 へ出発/, 'Chapter 5 の画面は無い');
  assert.doesNotMatch(rd('js/phase8/raising.js'), /chapter5/, '解放の記録は画面側の任意項目だけ（セーブの形は変えない）');
});
