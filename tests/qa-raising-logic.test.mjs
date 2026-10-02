// =========================================================
// QA：育成ロジック（Chapter 1〜4・修行・大会・育成完了）の回帰テスト
//  本番と同じ順で js/phase7/progression.js → js/phase8/league.js → js/phase8/raising.js → js/phase9/chapters.js を読み込み、
//  index.html と同じ方法で正式Chapter 1〜4を登録する（最終ルートのマップは本番と同じく未登録）。
//  画面は使わず、純粋ロジック（MMP7・MMP8・MMP8L・MMP9C）だけを確かめる。乱数はすべて引数で固定する。
//  CLAUDE.md とコードで書き方が違う箇所は、コードの動きを確かめてコメントで補足した。
// =========================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const rd = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const SRC = { p7: rd('js/phase7/progression.js'), lg: rd('js/phase8/league.js'), p8: rd('js/phase8/raising.js'), ch: rd('js/phase9/chapters.js'), p10: rd('js/phase10/monsters.js') };

/** 毎回まっさらなモジュールを読み込む（登録・差し替えがテスト間で混ざらない） */
function load() {
  const w = {};
  for (const k of ['p7', 'lg', 'p8', 'ch', 'p10']) new Function('window', SRC[k])(w);
  for (const c of w.MMP9C.CHAPTERS) w.MMP7.registerChapterBoard(c.no, c.track, { provisional: false });
  return { P7: w.MMP7, P8: w.MMP8, LG: w.MMP8L, C: w.MMP9C };
}
const j = (o) => JSON.parse(JSON.stringify(o));
/** 出目を固定するサイコロ用の乱数（n＝1〜3） */
const die = (n) => () => (n - 1) / 3 + 0.01;
/** 再現可能な乱数 */
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const SIX = ['li', 'po', 'in', 'hi', 'ev', 'de'];
const stats = (m) => Object.fromEntries(SIX.map((k) => [k, m[k]]));
/** 6能力＋所持金＋修行チケット */
const wallet = (S) => ({ ...stats(S.m), g: S.g, tix: S.trainTix });
const clr = (h) => [0, 1, 2, 3, 4, 5].map((i) => i <= h);   // h ランクまでクリア済み（-1＝未クリア）
function mon(P7, over = {}) {
  const m = { sp: 0, name: 'テスト', rk: 0, fa: 0, st: 0, li: 100, po: 100, in: 100, hi: 100, ev: 100, de: 100, sk: [0, 1, 2, 3], eq: [0, 1, 2, 3, -1, -1], ...over };
  P7.ensureProg(m); return m;
}
/** localStorage 互換の入れ物 */
function store(init = {}) {
  const d = new Map(Object.entries(init));
  return { getItem: (k) => (d.has(k) ? d.get(k) : null), setItem: (k, v) => { d.set(k, String(v)); }, removeItem: (k) => { d.delete(k); } };
}
/** 本番の読み込み口（キー mr4v6）で保存→再読込する */
function reload(P8, S) {
  const r = P8.loadFromStorage(store({ mr4v6: JSON.stringify(S) }));
  assert.equal(r.status, 'ok');
  return r.S;
}
/** 新しいセーブに1体を用意し、Chapter no へ出発させる（no>1 は前のChapterまでを終えたChapter間ファームから） */
function departTo(ctx, no, { h = -1, over = {} } = {}) {
  const { P7, P8 } = ctx;
  const S = P8.newSave(); S.m = P8.initIndividual(S, mon(P7, over));
  // 2026-10-01 夜：Chapter 3＝公式C・Chapter 4＝公式B 以上のクリアが出発の条件（MMP8.CHAPTER_RANK_GATE。条件そのものは QA-RL39〜40 で確かめる）。
  //  このヘルパーは大会・ボードの規則を見るためのもの：出発のときだけ条件を満たした実績にし、出発後に指定の実績（h）へ戻す
  S.m.prog.rankClr = clr(Math.max(h, (P8.CHAPTER_RANK_GATE || {})[no] ?? -1));
  if (no > 1) Object.assign(S.m.raise, { state: 'farm', ch: no, log: Array.from({ length: no - 1 }, (_, i) => ({ ch: i + 1 })) });
  assert.equal(P8.depart(S, S.m).ok, true);
  S.m.prog.rankClr = clr(h);
  return S;
}
/** 移動を最後まで進める（分岐では pick で選ぶ）。通ったノードを返す */
function move(P8, S, pick = (opts) => opts[0]) {
  const trail = [];
  for (let g = 0; g < 10 && S.m.raise.pend; g++) {
    const p = S.m.raise.pend;
    if (p.stage === 'move') { const r = P8.step(S, S.m); if (r.node) trail.push(r.node); }
    else if (p.stage === 'branch') { const id = pick(p.opts); assert.equal(P8.chooseBranch(S, S.m, id).ok, true); trail.push(id); }
    else break;
  }
  return trail;
}
/** ゴールへ1本道でつながるマスから、出目3でゴールへ入る（1ターン使う） */
function reachGoal(P8, S) {
  const trk = P8.boardOf(S.m);
  S.m.raise.node = Object.keys(trk.conn).find((k) => trk.conn[k].length === 1 && trk.conn[k][0] === trk.goal);
  assert.equal(P8.roll(S, S.m, die(3)).ok, true);
  move(P8, S);
  assert.equal(P8.resolveLanding(S, S.m, () => 0).goal, true);
}
/** 最後のターンを使い切る（スタート直後のマスで止まる。ゴールには届かない） */
function timeUp(P8, S) {
  const r = S.m.raise; Object.assign(r, { node: P8.boardOf(S.m).start, turnsUsed: r.turnLimit - 1 });
  assert.equal(P8.roll(S, S.m, die(1)).ok, true);
  move(P8, S);
  const x = P8.resolveLanding(S, S.m, () => 0);
  if (x.wait) assert.equal(P8.skipBattleSquare(S, S.m).timeUp, true); else assert.equal(x.timeUp, true);
}
/** 大会の1試合（fight() 相当：旧式の賞金・勝利数・ランク・疲労などを付けてから「最後まで終わった印」） */
function playMatch(P8, S, won, rnd = () => 0) {
  const t = S.m.raise.tour;
  assert.equal(P8.beginBattle(S, S.m, { kind: 'league', rank: t.rank }).ok, true);
  S.g += 777; if (won) S.wins = (S.wins || 0) + 1; S.br = 5; S.m.rk = 5; S.m.fa = 50; S.m.st = 50;
  P8.markBattleDone(S);
  return P8.finishBattle(S, S.m, rnd);
}
/** 大会を最後まで行う（wonOf(相手ID)で各試合の勝敗を決める）。最後の finishBattle の結果を返す */
function playLeague(P8, S, wonOf = () => true) { let f; while (P8.tourNext(S.m)) f = playMatch(P8, S, wonOf(P8.tourNext(S.m).opp)); return f; }
/** Chapter no を終えた直後のChapter間ファーム（ゴール→大会辞退で終える） */
function farmAfter(ctx, no, opt) { const S = departTo(ctx, no, opt); reachGoal(ctx.P8, S); assert.equal(ctx.P8.declineTournament(S, S.m).ok, true); return S; }

// ---------------------------------------------------------
// Chapter 1〜4 のボード進行
// ---------------------------------------------------------
test('QA-RL1：正式Chapter 1〜4（meadow・coast・sky・volcano）が登録済みで、最終ルートは未登録。全Chapter 20ターン・大会あり、上限はChapter 1だけD', () => {
  const { P8, C } = load();
  assert.deepEqual(C.CHAPTERS.map((c) => [c.no, c.theme]), [[1, 'meadow'], [2, 'coast'], [3, 'sky'], [4, 'volcano']]);
  for (const no of [1, 2, 3, 4]) {
    assert.equal(P8.isPlayable(no), true, `Chapter ${no}`);
    assert.equal(P8.trackOf(no), C.byNo(no).track);
    assert.equal(P8.CHAPTER_RULES[no].turnLimit, 20);
    assert.equal(P8.CHAPTER_RULES[no].tournament, true);
    assert.equal(P8.CHAPTER_RULES[no].rankCap, no === 1 ? 1 : null, 'Chapter 1だけ挑戦上限D（ランク番号1）');
  }
  assert.equal(P8.isPlayable(P8.FINAL), false, '最終ルートのマップは未登録');
  // 本番（index.html と js/ 配下）でも最終ルートのマップを登録していない（このファイルの load() が本番と同じ条件であることの確認）
  const jsFiles = readdirSync(path.join(ROOT, 'js'), { recursive: true }).map(String).filter((f) => f.endsWith('.js') && !f.endsWith('raising.js'));
  assert.ok(jsFiles.length >= 5);
  for (const f of ['index.html', ...jsFiles.map((x) => 'js/' + x)]) assert.doesNotMatch(rd(f), /registerFinalBoard\s*\(/, f);
  assert.match(rd('index.html'), /MMP9C\.CHAPTERS\)\s*MMP7\.registerChapterBoard\(/, 'index.html は正式Chapter 1〜4を登録する');
  assert.equal(P8.CHAPTER_RULES[P8.FINAL].tournament, false);
  assert.equal(P8.FINAL_CHAPTER_MIN_RANK, 4, '最終ルートへ進む条件はAランク（番号4）以上');
});

test('QA-RL2：未育成→Chapter 1への出発＝育成開始（スタート地点・0ターン・上限20・startStats記録）。出発は連れている個体の1回だけ', () => {
  const { P7, P8 } = load();
  const S = P8.newSave(); S.m = P8.initIndividual(S, mon(P7));
  assert.equal(P8.nextChapterKey(S.m), 1);
  assert.equal(P8.resumeTarget(S), 'town');
  assert.deepEqual(P8.depart(S, S.m), { ok: true, key: 1 });
  const r = S.m.raise;
  assert.deepEqual({ state: r.state, ch: r.ch, node: r.node, turnsUsed: r.turnsUsed, turnLimit: r.turnLimit, pend: r.pend, goal: r.goal, tour: r.tour, battle: r.battle },
    { state: 'board', ch: 1, node: 'S', turnsUsed: 0, turnLimit: 20, pend: null, goal: false, tour: null, battle: null });
  assert.deepEqual(r.startStats, { li: 100, po: 100, in: 100, hi: 100, ev: 100, de: 100 });
  assert.equal(P8.resumeTarget(S), 'board');
  assert.equal(P8.canVisitTown(S), false, '育成中は街へ行けない');
  assert.equal(P8.nextChapterKey(S.m), null);
  assert.deepEqual(P8.depart(S, S.m), { ok: false, reason: 'not_at_farm' }, 'Chapter中に2回目の出発はできない');
  const B = P8.initIndividual(S, mon(P7, { name: 'B' }));
  assert.deepEqual(P8.depart(S, B), { ok: false, reason: 'no_monster' }, '連れていない個体は出発できない');
  assert.equal(B.raise.state, 'none');
  // Chapter 1 を終えてChapter 2へ出発しても、startStats は育成開始時のまま（Chapter移行では取り直さない）
  S.m.po = 180; timeUp(P8, S);
  assert.equal(P8.endChapter(S, S.m).ok, true);
  assert.deepEqual(P8.depart(S, S.m), { ok: true, key: 2 });
  assert.equal(S.m.raise.startStats.po, 100);
});

test('QA-RL3：サイコロは1〜3（境界値）。振ると出目を移動前に pend へ記録し、1ターンだけ使う。範囲外の乱数では何も変わらない', () => {
  const { P7 } = load();
  assert.deepEqual([0, 0.3333, 0.3334, 0.6666, 0.6667, 0.99999].map((x) => P7.rollDice(() => x)), [1, 1, 2, 2, 3, 3]);
  assert.deepEqual([P7.DICE_MIN, P7.DICE_MAX], [1, 3]);
  for (const no of [1, 2, 3, 4]) for (const n of [1, 2, 3]) {
    const ctx = load(); const S = departTo(ctx, no);
    assert.deepEqual(ctx.P8.roll(S, S.m, die(n)), { ok: true, value: n });
    assert.deepEqual(S.m.raise.pend, { roll: n, left: n, stage: 'move' });
    assert.equal(S.m.raise.node, 'S', '振っただけでは動かない');
    assert.equal(S.m.raise.turnsUsed, 1);
    assert.equal(ctx.P8.turnsLeft(S.m), 19);
    assert.deepEqual(ctx.P8.roll(S, S.m, die(n)), { ok: false }, '移動が終わるまで次は振れない');
    assert.equal(S.m.raise.turnsUsed, 1);
  }
  const ctx = load(); const S = departTo(ctx, 2);
  assert.throws(() => ctx.P8.roll(S, S.m, () => 1));
  assert.equal(S.m.raise.turnsUsed, 0, '乱数が範囲外なら例外になり、ターンは使わない');
  assert.equal(S.m.raise.pend, null);
});

test('QA-RL4：出目の数だけ1地点ずつ進む（全Chapter・出目3）。step 1回で1地点・残り移動が1ずつ減り、通過中は何も変わらない', () => {
  for (const no of [1, 2, 3, 4]) {
    const ctx = load(); const { P8 } = ctx; const S = departTo(ctx, no); const trk = P8.boardOf(S.m), r = S.m.raise;
    const w0 = wallet(S);
    P8.roll(S, S.m, die(3));
    const expect = []; let n = trk.start; for (let i = 0; i < 3; i++) { n = trk.conn[n][0]; expect.push(n); }
    const trail = [];
    for (let k = 1; k <= 3; k++) {
      const x = P8.step(S, S.m); trail.push(x.node);
      assert.equal(r.pend.left, 3 - k, `CH${no} ${k}歩目の残り移動`);
      assert.equal(r.pend.stage, k < 3 ? 'move' : 'resolve');
      assert.deepEqual(wallet(S), w0, `CH${no}：通過・到着の時点では効果なし`);
      assert.equal(r.turnsUsed, 1);
    }
    assert.deepEqual(trail, expect, `CH${no}：スタートから線に沿って3地点`);
    assert.deepEqual(P8.step(S, S.m), { stage: 'resolve' }, '移動を終えたら step では進まない');
    assert.equal(r.node, expect[2]);
    if (no === 1) assert.deepEqual(trail, ['p1', 'p2', 'p3'], 'Chapter 1：旅立ちの草原（ライフ→ちから→何も起きない）');
  }
});

test('QA-RL5：通過したマスでは効果が出ず、最後に止まったマスだけ効果が出る（能力マス・宝箱・修行チケットの具体例）', () => {
  // Chapter 1：ライフ(p1)・ちから(p2)を通過して「何も起きない」(p3)に止まる → 何も変わらない
  { const ctx = load(); const { P8 } = ctx; const S = departTo(ctx, 1); const w0 = wallet(S);
    P8.roll(S, S.m, die(3)); move(P8, S);
    const x = P8.resolveLanding(S, S.m, () => 0);
    assert.equal(x.fx.kind, 'none'); assert.deepEqual(wallet(S), w0); assert.equal(S.m.raise.pend, null); assert.equal(S.m.raise.turnsUsed, 1); }
  // Chapter 2：ライフ(a1)・何も起きない(a2)を通過して かしこさ(a3)に止まる → かしこさだけ上がる（成長適性：ソラモ C＝+5）
  { const ctx = load(); const { P8 } = ctx; const S = departTo(ctx, 2); const w0 = wallet(S);
    P8.roll(S, S.m, die(3)); assert.deepEqual(move(P8, S), ['a1', 'a2', 'a3']);
    const x = P8.resolveLanding(S, S.m, () => 0);
    assert.deepEqual(x.fx, { kind: 'stat', key: 'in', amount: 5 }); assert.deepEqual(wallet(S), { ...w0, in: w0.in + 5 }); }
  // Chapter 4：ちから(a1)を通過して ライフ(a2)に止まる → ライフだけ上がる
  { const ctx = load(); const { P8 } = ctx; const S = departTo(ctx, 4); const w0 = wallet(S);
    P8.roll(S, S.m, die(2)); assert.deepEqual(move(P8, S), ['a1', 'a2']);
    P8.resolveLanding(S, S.m, () => 0.99);
    assert.deepEqual(wallet(S), { ...w0, li: w0.li + 5 }, 'ソラモのライフ適性 C＝+5（2026-10-02：乱数に関係なく適性の値）'); }
  // Chapter 2：分岐Aで寄り道（砂浜の海岸線）を選び、宝箱(c1)・ちから(c2)を通過して修行チケット(c3)に止まる → チケット+1だけ
  { const ctx = load(); const { P8 } = ctx; const S = departTo(ctx, 2); S.m.raise.node = 'A'; const w0 = wallet(S);
    P8.roll(S, S.m, die(3)); assert.deepEqual(move(P8, S, () => 'c1'), ['c1', 'c2', 'c3']);
    assert.deepEqual(wallet(S), w0);
    assert.deepEqual(P8.resolveLanding(S, S.m, () => 0).fx, { kind: 'ticket', amount: 1 });
    assert.deepEqual(wallet(S), { ...w0, tix: w0.tix + 1 }); }
  // マス効果は1ターンに1回だけ（2回目の resolveLanding は何もしない）
  { const ctx = load(); const { P8 } = ctx; const S = departTo(ctx, 4);
    P8.roll(S, S.m, die(1)); move(P8, S); P8.resolveLanding(S, S.m, () => 0); const w1 = wallet(S);
    assert.deepEqual(P8.resolveLanding(S, S.m, () => 0), { ok: false }); assert.deepEqual(wallet(S), w1); }
});

test('QA-RL6：通しプレイの不変条件（全Chapter×25通り・固定乱数）：出目1〜3・1回＝1ターン・線に沿って1地点ずつ・効果は止まったマスの種類どおり1回・20ターン以内にゴールかターン切れ', () => {
  const FX_OF = { normal: ['none'], start: ['none'], tournament: ['none'], life: ['stat'], power: ['stat'], wisdom: ['stat'], hit: ['stat'], evasion: ['stat'], toughness: ['stat'],
    treasure: ['gold'], ticket: ['ticket'], event: ['stat', 'gold'], rare: ['multi', 'stat', 'gold'], battle: ['battle'] };
  const KEY_OF = { life: 'li', power: 'po', wisdom: 'in', hit: 'hi', evasion: 'ev', toughness: 'de' };
  const after = (b, fx) => { const e = { ...b }; if (fx.kind === 'stat') e[fx.key] += fx.amount; else if (fx.kind === 'gold') e.g += fx.amount;
    else if (fx.kind === 'ticket') e.tix += fx.amount; else if (fx.kind === 'multi') for (const x of fx.gains) e[x.key] += x.amount; return e; };
  let goals = 0, timeups = 0; const seen = new Set();
  for (const no of [1, 2, 3, 4]) for (let seed = 1; seed <= 25; seed++) {
    const ctx = load(); const { P8 } = ctx; const S = departTo(ctx, no); const trk = P8.boardOf(S.m), r = S.m.raise, rnd = rng(seed * 10 + no);
    // 奇数シードは寄り道を優先（ターン切れの場面も通す）、偶数シードは分岐をランダムに選ぶ
    const pick = (opts) => (seed % 2 ? opts.find((id) => trk.lanes[trk.nodes[id].lane].kind === 'detour') || opts[0] : opts[Math.floor(rnd() * opts.length)]);
    while (P8.canRoll(S.m)) {
      const before = wallet(S), t0 = r.turnsUsed; let node = r.node, hops = 0;
      const { value } = P8.roll(S, S.m, rnd); seen.add(value);
      assert.ok(value >= 1 && value <= 3);
      assert.equal(r.turnsUsed, t0 + 1, '1回振る＝1ターン');
      while (r.pend.stage === 'move' || r.pend.stage === 'branch') {
        if (r.pend.stage === 'move') P8.step(S, S.m); else P8.chooseBranch(S, S.m, pick(r.pend.opts));
        if (r.node !== node) { assert.ok(trk.conn[node].includes(r.node), `CH${no} ${node}→${r.node} は線でつながっている`); node = r.node; hops++; }
        assert.deepEqual(wallet(S), before, '通過中は効果なし');
      }
      assert.equal(r.turnsUsed, t0 + 1);
      assert.deepEqual([r.pend.stage, r.pend.left], ['resolve', 0]);
      if (r.node === trk.goal) assert.ok(hops >= 1 && hops <= value, 'ゴールに着いたら残り移動は消える'); else assert.equal(hops, value, '出目の数だけ進む');
      const type = trk.nodes[r.node].type, x = P8.resolveLanding(S, S.m, rnd);
      assert.ok(FX_OF[type].includes(x.fx.kind), `CH${no} ${r.node}(${type}) → ${x.fx.kind}`);
      if (KEY_OF[type]) { assert.equal(x.fx.key, KEY_OF[type]); assert.ok(x.fx.amount >= 5 && x.fx.amount <= 7, '【暫定】能力マス+5〜7'); }
      if (x.fx.kind === 'battle') { assert.equal(x.wait, true); assert.deepEqual(wallet(S), before); assert.equal(P8.skipBattleSquare(S, S.m).ok, true); }
      assert.equal(r.pend, null);
      assert.deepEqual(wallet(S), after(before, x.fx), '止まったマスの効果だけが1回入る');
    }
    assert.ok(r.turnsUsed <= 20);
    if (r.goal) { goals++; assert.equal(r.node, trk.goal); assert.equal(P8.boardPhase(S.m), 'goal'); }
    else { timeups++; assert.equal(r.turnsUsed, 20); assert.equal(P8.boardPhase(S.m), 'timeup'); }
  }
  assert.deepEqual([...seen].sort(), [1, 2, 3]);
  assert.ok(goals > 0 && timeups > 0, `ゴール${goals}回・ターン切れ${timeups}回の両方を通した`);
});

test('QA-RL7：分岐では自動で選ばず止まる。選べるのは線の先だけ（通常ルートが先頭）で、選ぶのも1歩として数える', () => {
  const ctx = load(); const { P8 } = ctx; const S = departTo(ctx, 1); const r = S.m.raise, trk = P8.boardOf(S.m);
  r.node = 'J1';
  P8.roll(S, S.m, die(1));
  assert.deepEqual(P8.step(S, S.m), { stage: 'branch', opts: ['q1', 'r1'] });
  assert.equal(r.node, 'J1', '分岐の手前で止まる（まだ動かない）');
  assert.equal(trk.lanes[trk.nodes.q1.lane].kind, 'main', '通常ルートが先頭');
  assert.deepEqual(P8.step(S, S.m), { stage: 'branch' }, '選ぶまで step では進まない');
  const before = j(r);
  for (const bad of ['J2', 'p1', 'x', null]) assert.deepEqual(P8.chooseBranch(S, S.m, bad), { ok: false });
  assert.deepEqual(j(r), before, '候補以外は選べず、状態も変わらない');
  const g0 = S.g;
  assert.deepEqual(P8.chooseBranch(S, S.m, 'r1'), { ok: true, stage: 'resolve', node: 'r1' });
  assert.equal(r.pend.left, 0); assert.equal('opts' in r.pend, false);
  assert.deepEqual(P8.resolveLanding(S, S.m, () => 0).fx, { kind: 'gold', ev: 'chest', amount: 50 }, '寄り道の宝箱（【暫定】50G）');
  assert.equal(S.g, g0 + 50); assert.equal(r.turnsUsed, 1);
  // 出目3で分岐を越える：選択1歩＋2歩
  const ctx2 = load(); const S2 = departTo(ctx2, 1); S2.m.raise.node = 'J1';
  ctx2.P8.roll(S2, S2.m, die(3));
  assert.deepEqual(move(ctx2.P8, S2, () => 'q1'), ['q1', 'q2', 'q3']);
  assert.equal(S2.m.raise.pend.stage, 'resolve');
  // 各Chapterの分岐はすべて「通常ルートが先頭」
  for (const no of [1, 2, 3, 4]) {
    const t = ctx.P8.trackOf(no);
    for (const [id, opts] of Object.entries(t.conn).filter(([, o]) => o.length > 1)) assert.equal(t.lanes[t.nodes[opts[0]].lane].kind, 'main', `CH${no} ${id}`);
  }
});

test('QA-RL8：ゴールに着いたら残りの移動は消える（全Chapter・ゴールの手前すべてから出目3）。ゴール後は振れず、ターンは1だけ使う', () => {
  for (const no of [1, 2, 3, 4]) {
    const trk = load().P8.trackOf(no);
    const preds = Object.keys(trk.conn).filter((k) => trk.conn[k].includes(trk.goal));
    assert.ok(preds.length >= 1);
    for (const pred of preds) for (const back of [0, 1]) {
      const ctx = load(); const { P8 } = ctx; const S = departTo(ctx, no); const r = S.m.raise;
      const from = back ? Object.keys(trk.conn).find((k) => trk.conn[k].length === 1 && trk.conn[k][0] === pred) : pred;
      if (!from) continue;
      Object.assign(r, { node: from, turnsUsed: 10 }); const w0 = wallet(S);
      P8.roll(S, S.m, die(3));
      const trail = move(P8, S);
      assert.deepEqual(trail, back ? [pred, 'G'] : ['G'], `CH${no} ${from}から`);
      assert.deepEqual([r.pend.stage, r.pend.left], ['resolve', 0], '残り移動は消える');
      const x = P8.resolveLanding(S, S.m, () => 0);
      assert.equal(x.goal, true); assert.equal(x.fx.kind, 'none');
      assert.deepEqual(wallet(S), w0, 'ゴールのマス自体に効果はない');
      assert.equal(r.turnsUsed, 11); assert.equal(r.goal, true); assert.equal(P8.boardPhase(S.m), 'goal');
      assert.equal(P8.canRoll(S.m), false); assert.deepEqual(P8.roll(S, S.m, die(1)), { ok: false }); assert.equal(r.turnsUsed, 11);
      assert.deepEqual(P8.canEndChapter(S.m), { ok: false, reason: 'tournament_pending' }, 'ゴール後は大会に挑戦するか辞退する');
    }
  }
});

test('QA-RL9：20ターン目でゴールできなければターン切れ（Chapter 1〜3）：振れない・大会なし・Chapter終了で次のChapter間ファームへ（ゴールできず）', () => {
  for (const no of [1, 2, 3]) {
    const ctx = load(); const { P8 } = ctx; const S = departTo(ctx, no); const r = S.m.raise;
    r.turnsUsed = 19;
    assert.equal(P8.canEndChapter(S.m).reason, 'turns_left', '残りターンがあるうちはChapterを終えられない');
    P8.roll(S, S.m, die(1));
    assert.deepEqual(P8.canEndChapter(S.m), { ok: false, reason: 'turn_in_progress' });
    move(P8, S);
    const x = P8.resolveLanding(S, S.m, () => 0);
    assert.equal(x.timeUp, true); assert.equal(x.goal, undefined);
    assert.equal(P8.boardPhase(S.m), 'timeup'); assert.equal(P8.turnsLeft(S.m), 0);
    assert.equal(P8.canRoll(S.m), false); assert.deepEqual(P8.roll(S, S.m, die(1)), { ok: false }); assert.equal(r.turnsUsed, 20);
    assert.equal(P8.startTournament(S, S.m, 0).reason, 'not_at_goal');
    assert.equal(P8.declineTournament(S, S.m).reason, 'cannot_decline');
    const g0 = S.g, t0 = S.trainTix;
    const e = P8.endChapter(S, S.m);
    assert.deepEqual(e, { ok: true, next: no + 1, entry: { ch: no, reachedGoal: false, turnsUsed: 20, turnLimit: 20, declined: false, tour: null } });
    assert.deepEqual({ state: r.state, ch: r.ch, node: r.node, turnsUsed: r.turnsUsed, turnLimit: r.turnLimit, pend: r.pend, goal: r.goal, tour: r.tour },
      { state: 'farm', ch: no + 1, node: null, turnsUsed: 0, turnLimit: null, pend: null, goal: false, tour: null });
    assert.deepEqual([S.g, S.trainTix], [g0, t0], 'ターン切れで所持金・チケットは減らない（育成失敗ではない）');
    assert.equal(P8.resumeTarget(S), 'farm'); assert.equal(P8.raiseDoneCount(S), 0);
    assert.deepEqual(P8.endChapter(S, S.m), { ok: false, reason: 'not_in_chapter' }, '同じChapterを二重に終えない');
    assert.equal(r.log.length, no);
  }
});

test('QA-RL10：20ターン目にゴールへ着いたらターン切れではなくゴール（大会に挑戦できる）', () => {
  const ctx = load(); const { P8 } = ctx; const S = departTo(ctx, 3); const r = S.m.raise;
  Object.assign(r, { node: 'l4', turnsUsed: 19 });
  P8.roll(S, S.m, die(2)); assert.deepEqual(move(P8, S), ['G']);
  const x = P8.resolveLanding(S, S.m);
  assert.equal(x.goal, true); assert.equal(x.timeUp, undefined);
  assert.equal(r.turnsUsed, 20); assert.equal(P8.boardPhase(S.m), 'goal');
  assert.deepEqual(P8.canStartTournament(S, S.m, 1), { ok: true });
  assert.deepEqual(P8.startTournament(S, S.m, 1, 11), { ok: true });
  assert.equal(P8.boardPhase(S.m), 'tour');
});

test('QA-RL11：最後のターンに練習試合マスで止まったとき：挑戦しなければターン切れ。挑戦中に途中終了したらやり直せ、終われば旧報酬を戻してターン切れ', () => {
  const setup = () => {
    const ctx = load(); const S = departTo(ctx, 2); Object.assign(S.m.raise, { node: 'C', turnsUsed: 19 });
    ctx.P8.roll(S, S.m, die(1));
    assert.deepEqual(ctx.P8.step(S, S.m).opts, ['e1', 'f1', 'h1']);
    ctx.P8.chooseBranch(S, S.m, 'f1');   // 近道「断崖の上」の1マス目＝練習試合
    const x = ctx.P8.resolveLanding(S, S.m);
    assert.deepEqual(x, { ok: true, fx: { kind: 'battle' }, wait: true });
    return { ...ctx, S };
  };
  { const { P8, S } = setup();
    assert.equal(P8.boardPhase(S.m), 'battle'); assert.deepEqual(P8.canEndChapter(S.m), { ok: false, reason: 'turn_in_progress' });
    assert.deepEqual(P8.skipBattleSquare(S, S.m), { ok: true, timeUp: true });
    assert.equal(P8.boardPhase(S.m), 'timeup');
    assert.equal(P8.startTournament(S, S.m, 0).reason, 'not_at_goal');
    const e = P8.endChapter(S, S.m); assert.equal(e.entry.reachedGoal, false); assert.equal(e.entry.tour, null);
    assert.deepEqual([S.m.raise.state, S.m.raise.ch], ['farm', 3]); }
  { const { P8, S } = setup(); const m = S.m; const snap0 = { g: S.g, wins: S.wins, rk: m.rk, fa: m.fa, st: m.st };
    assert.deepEqual(P8.beginBattle(S, m, { kind: 'practice' }), { ok: true });
    assert.deepEqual(P8.beginBattle(S, m, { kind: 'practice' }), { ok: false, reason: 'busy' });
    assert.deepEqual(P8.skipBattleSquare(S, m), { ok: false }, '戦闘中は見送れない');
    // 途中終了（fight() が最後まで終わらずに再読込）：結果なし・同じマスでもう一度選べる
    const T = reload(P8, S);
    assert.deepEqual(P8.finishBattle(T, T.m), { kind: 'practice', interrupted: true });
    assert.equal(T.m.raise.pend.stage, 'battle'); assert.equal(T.m.raise.turnsUsed, 20);
    assert.deepEqual(P8.beginBattle(T, T.m, { kind: 'practice' }), { ok: true });
    T.g += 500; T.wins = (T.wins || 0) + 1; T.m.rk = 3; T.m.fa = 40; T.m.st = 40;   // fight() が付ける旧報酬
    P8.markBattleDone(T);
    assert.deepEqual(P8.finishBattle(T, T.m), { kind: 'practice', won: true, matchWon: true, timeUp: true });
    assert.deepEqual({ g: T.g, wins: T.wins, rk: T.m.rk, fa: T.m.fa, st: T.m.st }, snap0, '練習試合の旧報酬は残らない');
    assert.equal(P8.boardPhase(T.m), 'timeup'); }
});

test('QA-RL12：途中の状態（出目・残り移動・分岐待ち・マス処理待ち・練習試合待ち）は保存され、再読込しても振り直さない', () => {
  // 移動の途中（出目3・1歩進んだところ）
  { const ctx = load(); const { P8 } = ctx; const S = departTo(ctx, 1);
    P8.roll(S, S.m, die(3)); P8.step(S, S.m);
    const T = reload(P8, S);
    assert.deepEqual(T.m.raise.pend, { roll: 3, left: 2, stage: 'move' });
    assert.deepEqual([T.m.raise.node, T.m.raise.turnsUsed], ['p1', 1]);
    assert.equal(P8.canRoll(T.m), false); assert.deepEqual(P8.roll(T, T.m, die(1)), { ok: false }); assert.equal(T.m.raise.turnsUsed, 1);
    assert.deepEqual(move(P8, T), ['p2', 'p3'], '保存した位置から残りの2地点だけ進む');
    assert.deepEqual(move(P8, S), ['p2', 'p3']);
    P8.resolveLanding(T, T.m, () => 0); P8.resolveLanding(S, S.m, () => 0);
    assert.deepEqual(wallet(T), wallet(S)); assert.equal(T.m.raise.turnsUsed, 1); }
  // 分岐待ち
  { const ctx = load(); const { P8 } = ctx; const S = departTo(ctx, 1); S.m.raise.node = 'J1';
    P8.roll(S, S.m, die(2)); P8.step(S, S.m);
    const T = reload(P8, S);
    assert.deepEqual(T.m.raise.pend, { roll: 2, left: 2, stage: 'branch', opts: ['q1', 'r1'] });
    assert.equal(reload(P8, T).m.raise.pend.stage, 'branch', 'もう一度再読込しても同じ');
    assert.deepEqual(move(P8, T, () => 'r1'), ['r1', 'r2']); }
  // マス処理待ち（移動は済み・効果はまだ）：効果は1回だけ
  { const ctx = load(); const { P8 } = ctx; const S = departTo(ctx, 2);
    P8.roll(S, S.m, die(3)); move(P8, S);
    const T = reload(P8, S); const w0 = wallet(T);
    assert.deepEqual(T.m.raise.pend, { roll: 3, left: 0, stage: 'resolve' });
    P8.resolveLanding(T, T.m, () => 0);
    assert.deepEqual(wallet(T), { ...w0, in: w0.in + 5 });
    const U = reload(P8, T);
    assert.deepEqual(P8.resolveLanding(U, U.m, () => 0), { ok: false }); assert.deepEqual(wallet(U), wallet(T)); }
  // 練習試合の選択待ち
  { const ctx = load(); const { P8 } = ctx; const S = departTo(ctx, 1); S.m.raise.node = 't2';
    P8.roll(S, S.m, die(1)); move(P8, S); assert.equal(P8.resolveLanding(S, S.m).wait, true);
    const T = reload(P8, S);
    assert.deepEqual(T.m.raise.pend, { roll: 1, left: 0, stage: 'battle', fx: { kind: 'battle' } });
    assert.deepEqual(P8.skipBattleSquare(T, T.m), { ok: true });
    assert.equal(T.m.raise.turnsUsed, 1); assert.equal(P8.canRoll(T.m), true); }
});

test('QA-RL13：Chapter間ファーム：Chapter 1〜3を終えると次のChapterのファームへ。そこから次のChapterへ1回だけ出発でき、位置・ターン・ゴール・大会は初期化', () => {
  const ctx = load(); const { P7, P8 } = ctx;
  const S = P8.newSave(); S.m = P8.initIndividual(S, mon(P7)); S.m.prog.rankClr = clr(3); P8.depart(S, S.m);   // Chapter 3・4 の条件（公式C・B大会クリア）を満たした個体（条件そのものは QA-RL39〜40）
  const r = S.m.raise;
  for (const no of [1, 2, 3]) {
    reachGoal(P8, S);
    const d = P8.declineTournament(S, S.m);
    assert.equal(d.ok, true); assert.equal(d.next, no + 1);
    assert.deepEqual(d.entry, { ch: no, reachedGoal: true, turnsUsed: 1, turnLimit: 20, declined: true, tour: null });
    assert.deepEqual([r.state, r.ch], ['farm', no + 1]);
    assert.equal(P8.nextChapterKey(S.m), no + 1);
    assert.equal(P7.hasEndedChapter(S.m, no), true);
    assert.equal(P8.resumeTarget(S), 'farm'); assert.equal(P8.canVisitTown(S), false);
    assert.deepEqual(P8.canDepart(S, S.m), { ok: true, key: no + 1 });
    const T = reload(P8, S);
    assert.deepEqual([T.m.raise.state, T.m.raise.ch], ['farm', no + 1], '再読込してもChapter間ファームのまま');
    assert.deepEqual(P8.depart(S, S.m), { ok: true, key: no + 1 });
    assert.deepEqual({ state: r.state, ch: r.ch, node: r.node, turnsUsed: r.turnsUsed, turnLimit: r.turnLimit, goal: r.goal, tour: r.tour },
      { state: 'board', ch: no + 1, node: 'S', turnsUsed: 0, turnLimit: 20, goal: false, tour: null });
    assert.deepEqual(P8.depart(S, S.m), { ok: false, reason: 'not_at_farm' });
  }
  assert.deepEqual(r.log.map((e) => e.ch), [1, 2, 3]);
  assert.equal(P8.raiseDoneCount(S), 0, 'Chapter 1〜3の終了では育成完了にならない');
});

test('QA-RL14：進行は個体ごと：別の個体とChapter進行・ランク実績・修行回数・記録を共有しない', () => {
  const ctx = load(); const { P7, P8 } = ctx;
  const S = farmAfter(ctx, 1, { h: 0 });   // 個体A：Chapter 1を終え、Eランクをクリア済み
  S.trainTix = 3;
  runTraining(P7, S, 'po');
  const A = S.m, aRaise = j(A.raise), aProg = j(A.prog);
  // 画面からは育成中に連れている個体を入れ替えられない。ここではデータ上で入れ替えて、進行・実績が個体に付いていることを確かめる
  const B = P8.initIndividual(S, mon(P7, { name: 'B' }));
  S.box.push(A); S.m = B;
  assert.equal(P8.nextChapterKey(B), 1, 'Bは未育成なのでChapter 1から');
  assert.deepEqual(P8.eligibleRanks(B, 1), [0, 1], 'BはAのランク実績を使えない');
  assert.equal(P7.canStartTraining(S, B, 'po').reason, 'before_ch1', 'Bは Chapter 1 を終えていない');
  assert.equal(B.prog.train.po, 0);
  assert.notEqual(A.raise, B.raise); assert.notEqual(A.prog, B.prog);
  // 読み込み時の補正：育成中の個体は連れている個体の1体だけにそろう（Aを連れた状態へ戻る）
  const T = P8.migrateSave(j(S));
  assert.equal(T.m.name, 'テスト'); assert.deepEqual(T.m.raise, aRaise); assert.deepEqual(T.m.prog, aProg);
  assert.equal(T.box[0].name, 'B'); assert.equal(T.box[0].raise.state, 'none');
  // Aを育成完了させてから、Bの育成を始める：Aの完了記録は変わらない
  const c = load(); const X = departTo(c, 4); reachGoal(c.P8, X); c.P8.declineTournament(X, X.m);
  const done = X.m; assert.equal(done.raise.state, 'done');
  const logLen = done.raise.log.length, doneJson = j(done);
  const Y = c.P8.initIndividual(X, mon(c.P7, { name: 'Y' })); X.box.push(done); X.m = Y;
  assert.deepEqual(c.P8.depart(X, Y), { ok: true, key: 1 });
  const U = reload(c.P8, X);
  assert.equal(U.m.raise.state, 'board'); assert.equal(U.m.raise.ch, 1); assert.equal(U.m.raise.log.length, 0);
  assert.deepEqual(U.box[0], doneJson, '育成完了した個体はそのまま');
  assert.equal(U.box[0].raise.log.length, logLen);
});

// ---------------------------------------------------------
// 修行（Chapter間ファームから修行チケットで挑戦・15マスの一本道）
// ---------------------------------------------------------
/** 修行を1回最後まで行う（出目3・乱数0） */
function runTraining(P7, S, kind) {
  assert.equal(P7.startTraining(S, S.m, kind).ok, true);
  for (let g = 0; g < 20; g++) if (P7.advanceTraining(S, S.m, 3, () => 0).goal) break;
  return P7.finishTraining(S, S.m, () => 0);
}

test('QA-RL15：修行はChapter 1を終えたChapter間ファームからだけ・修行チケットが必要（未育成・Chapter中・育成完了・不正な種類では始められない）', () => {
  const ctx = load(); const { P7, P8 } = ctx;
  const refuse = (S, m, kind, reason) => {
    const t0 = S.trainTix;
    assert.deepEqual(P7.canStartTraining(S, m, kind), { ok: false, reason }, `${kind}：${reason}`);
    assert.deepEqual(P7.startTraining(S, m, kind), { ok: false, reason });
    assert.equal(S.trainTix, t0, '断られたらチケットは減らない');
    assert.equal(P7.trainRunOf(m), null);
  };
  const N = P8.newSave(); N.m = P8.initIndividual(N, mon(P7)); N.trainTix = 5;
  refuse(N, N.m, 'po', 'before_ch1');                       // 未育成
  P8.depart(N, N.m); refuse(N, N.m, 'po', 'not_at_farm');   // Chapter 1 進行中
  refuse(N, null, 'po', 'no_monster');
  const S = farmAfter(ctx, 1); S.trainTix = 0;
  refuse(S, S.m, 'po', 'no_ticket');                         // チケット0枚
  S.trainTix = 1;
  for (const bad of ['li', 'sp', '', undefined]) refuse(S, S.m, bad, 'bad_kind');   // ライフ・素早さの修行は無い
  assert.deepEqual(P7.TRAIN_KINDS, ['po', 'in', 'hi', 'ev', 'de']);
  for (const k of ['po', 'in', 'hi', 'ev']) assert.deepEqual(P7.canStartTraining(S, S.m, k), { ok: true }, k);
  // ターン切れでChapter 1を終えた場合も修行できる（ゴールの有無は問わない）
  const ctx3 = load(); const V = departTo(ctx3, 1); timeUp(ctx3.P8, V); ctx3.P8.endChapter(V, V.m); V.trainTix = 1;
  assert.deepEqual(ctx3.P7.canStartTraining(V, V.m, 'po'), { ok: true });
  // 育成完了した個体は修行できない
  const ctx4 = load(); const D = departTo(ctx4, 4); reachGoal(ctx4.P8, D); ctx4.P8.declineTournament(D, D.m); D.trainTix = 3;
  assert.equal(D.m.raise.state, 'done');
  assert.deepEqual(ctx4.P7.canStartTraining(D, D.m, 'po'), { ok: false, reason: 'finished' });
});

test('QA-RL16：修行を始めた時にチケットを1枚だけ使う（進行中・ゴール・終了では使わない）。修行中は出発・育成放棄できず、復帰先は修行ボード', () => {
  const ctx = load(); const { P7, P8 } = ctx; const S = farmAfter(ctx, 2); S.trainTix = 3; S.m.prog.rankClr = clr(2);   // Chapter 3 の条件（公式C大会クリア）を満たした個体
  assert.deepEqual(P7.startTraining(S, S.m, 'hi'), { ok: true });
  assert.equal(S.trainTix, 2);
  assert.deepEqual(S.m.raise.trainRun, { kind: 'hi', pos: 0 });
  assert.deepEqual(P7.startTraining(S, S.m, 'po'), { ok: false, reason: 'in_progress' }, '修行中に別の修行は始められない');
  assert.equal(S.trainTix, 2);
  assert.deepEqual(P8.canDepart(S, S.m), { ok: false, reason: 'training' });
  assert.deepEqual(P8.canAbandon(S), { ok: false, reason: 'training' });
  assert.equal(P8.resumeTarget(S), 'training');
  const T = reload(P8, S);
  assert.equal(T.trainTix, 2, '再読込してもチケットは戻らない・二重に減らない');
  assert.deepEqual(T.m.raise.trainRun, { kind: 'hi', pos: 0 });
  for (let g = 0; g < 20; g++) if (P7.advanceTraining(S, S.m, 2, () => 0).goal) break;
  assert.equal(S.trainTix, 2);
  P7.finishTraining(S, S.m);
  assert.equal(S.trainTix, 2);
  assert.equal(P8.resumeTarget(S), 'farm');
  assert.deepEqual(P8.canDepart(S, S.m), { ok: true, key: 3 });
});

test('QA-RL17：修行ボードは15マスの一本道（1〜14マス目は定義どおり、15マス目がゴール）。出目は1〜3だけ受け付け、ゴールを越えない', () => {
  const ctx = load(); const { P7 } = ctx;
  // CLAUDE.md の「修行ボードは15マス」＝スタート地点（0）を含まない15マス（コードの TRAIN_LEN。15マス目がゴール）
  assert.equal(P7.TRAIN_LEN, 15);
  assert.deepEqual(Array.from({ length: 17 }, (_, i) => P7.trainSquare(i)),
    [null, 'n', 's', 'n', 'n', 'n', 'n', 's', 'n', 'n', 'n', 's', 'n', 'n', 'n', 'g', null]);
  const S = farmAfter(ctx, 1); S.trainTix = 1;
  assert.throws(() => P7.advanceTraining(S, S.m, 1), '修行中でなければ進めない');
  P7.startTraining(S, S.m, 'ev');
  for (const bad of [0, 4, 1.5, '2', -1]) assert.throws(() => P7.advanceTraining(S, S.m, bad), `出目 ${bad}`);
  assert.equal(S.m.raise.trainRun.pos, 0, '不正な出目では動かない');
  const seen = [];
  for (let i = 1; i <= 15; i++) { const x = P7.advanceTraining(S, S.m, 1, () => 0); assert.deepEqual([x.from, x.to], [i - 1, i]); seen.push(x.square); assert.equal(x.goal, i === 15); }
  assert.deepEqual(seen, [...P7.TRAIN_TEMPLATE, 'g'], '1マスずつ進むと全15マスを順に通る（一本道）');
  // ゴール手前（14マス目）から出目3でもゴール（15）で止まる
  const ctx2 = load(); const U = farmAfter(ctx2, 1); U.trainTix = 1; ctx2.P7.startTraining(U, U.m, 'po');
  U.m.raise.trainRun.pos = 14;
  assert.deepEqual(ctx2.P7.advanceTraining(U, U.m, 3, () => 0), { from: 14, to: 15, square: 'g', gain: null, lifeGain: null, goal: true });
});

test('QA-RL18：特訓の上昇は止まったマスだけ。専用能力マス（s）で特訓の能力 +2〜3 とライフ +2〜3 を同時に、n＝何も起きない（元ライフマスも n）。通過したマスは無効', () => {
  const ctx = load(); const { P7 } = ctx; const S = farmAfter(ctx, 3); S.trainTix = 1;
  assert.deepEqual(j(P7.TRAIN_GAIN), { stat: [2, 3], life: [2, 3] });
  assert.ok(!P7.TRAIN_TEMPLATE.includes('l'), '独立したライフマスは無い');
  P7.startTraining(S, S.m, 'po');
  const log = [];
  const g = (x) => x && [x.key, x.amount];
  for (const n of [2, 2, 3, 2, 2, 3, 1]) { const x = P7.advanceTraining(S, S.m, n, () => 0.99); log.push([x.to, x.square, g(x.gain), g(x.lifeGain)]); }
  assert.deepEqual(log, [[2, 's', ['po', 3], ['li', 3]], [4, 'n', null, null], [7, 's', ['po', 3], ['li', 3]], [9, 'n', null, null], [11, 's', ['po', 3], ['li', 3]], [14, 'n', null, null], [15, 'g', null, null]]);
  assert.deepEqual(stats(S.m), { li: 109, po: 109, in: 100, hi: 100, ev: 100, de: 100 }, '特訓の能力とライフ以外は上がらない');
  // 乱数0なら+2。s を通過して n に止まったら何も上がらない
  const ctx2 = load(); const U = farmAfter(ctx2, 1); U.trainTix = 1; ctx2.P7.startTraining(U, U.m, 'hi'); const s0 = stats(U.m);
  assert.deepEqual(ctx2.P7.advanceTraining(U, U.m, 3, () => 0), { from: 0, to: 3, square: 'n', gain: null, lifeGain: null, goal: false }, '2マス目(s)を通過して3マス目(n)');
  assert.deepEqual(stats(U.m), s0);
  const x4 = ctx2.P7.advanceTraining(U, U.m, 1, () => 0);
  assert.deepEqual([x4.square, x4.gain, x4.lifeGain], ['n', null, null], '元ライフマス（4マス目）ではライフが上がらない');
  const x7 = ctx2.P7.advanceTraining(U, U.m, 3, () => 0);
  assert.deepEqual([x7.gain, x7.lifeGain], [{ key: 'hi', amount: 2 }, { key: 'li', amount: 2 }], '4→7（s）：命中とライフが同時に');
  assert.equal(ctx2.P7.advanceTraining(U, U.m, 3, () => 0).gain, null, '7→10（n）');
  assert.deepEqual(stats(U.m), { ...s0, li: s0.li + 2, hi: s0.hi + 2 });
  // 上限999を超えない（実際に増えた分だけを返す）
  U.m.hi = 998; U.m.li = 999;
  const xc = ctx2.P7.advanceTraining(U, U.m, 1, () => 0.99);
  assert.deepEqual([xc.gain, xc.lifeGain], [{ key: 'hi', amount: 1 }, { key: 'li', amount: 0 }]);
  assert.deepEqual([U.m.hi, U.m.li], [999, 999]);
});

test('QA-RL19：修行のゴール：回数+1・修行状態を消してChapter間ファームへ（Chapterの進行は変わらない）。途中の状態は出目ごと保存される', () => {
  const ctx = load(); const { P7, P8 } = ctx; const S = farmAfter(ctx, 2); S.trainTix = 1;
  const before = j(S.m.raise);
  P7.startTraining(S, S.m, 'in');
  P7.advanceTraining(S, S.m, 3, () => 0);
  assert.throws(() => P7.finishTraining(S, S.m), 'ゴール前は終えられない');
  // index.html は出目を演出の前に trainRun.roll へ保存する。再読込しても出目・位置は残る（振り直しにならない）
  S.m.raise.trainRun.roll = 2;
  const T = reload(P8, S);
  assert.deepEqual(T.m.raise.trainRun, { kind: 'in', pos: 3, roll: 2 });
  assert.equal(P8.resumeTarget(T), 'training');
  delete T.m.raise.trainRun.roll;
  for (let g = 0; g < 20; g++) if (P7.advanceTraining(T, T.m, 3, () => 0).goal) break;
  // 種族ごとの修行技が未登録のため、覚える技は無い（CLAUDE.md：現在の修行は能力上昇だけ）
  assert.deepEqual(P7.finishTraining(T, T.m), { kind: 'in', learned: null, reason: 'unregistered' });
  assert.equal(T.m.prog.train.in, 1);
  assert.equal(T.m.raise.trainRun, null);
  assert.deepEqual(T.m.sk, [0, 1, 2, 3]);
  const { trainRun: _a, ...b1 } = T.m.raise; const { trainRun: _b, ...b0 } = before;
  assert.deepEqual(j(b1), b0, 'Chapter間ファームの状態（次のChapter・記録）は変わらない');
  assert.equal(P8.resumeTarget(T), 'farm');
  assert.throws(() => P7.finishTraining(T, T.m), '二重に終えられない');
  assert.equal(T.m.prog.train.in, 1);
});

test('QA-RL20：丈夫さの修行はCランク以上のクリアで解放（E・Dのクリアでは不可。上位ランクのクリアでも可）', () => {
  const { P7 } = load();
  assert.equal(P7.TOUGH_UNLOCK_RANK, 2);
  for (const [rc, ok] of [[clr(-1), false], [clr(0), false], [clr(1), false], [clr(2), true], [clr(5), true],
    [[false, false, false, true, false, false], true], [[false, false, false, false, false, true], true]]) {
    const ctx = load(); const S = farmAfter(ctx, 2); S.trainTix = 1; S.m.prog.rankClr = rc;
    assert.deepEqual(ctx.P7.canStartTraining(S, S.m, 'de'), ok ? { ok: true } : { ok: false, reason: 'locked' }, JSON.stringify(rc));
    for (const k of ['po', 'in', 'hi', 'ev']) assert.equal(ctx.P7.canStartTraining(S, S.m, k).ok, true, `${k} はランクに関係なく可`);
  }
  // 大会でCに優勝した記録（下位もクリア扱い）で解放される
  const ctx = load(); const S = farmAfter(ctx, 2); S.trainTix = 1;
  ctx.P7.recordRankClear(S, S.m, 2);
  assert.deepEqual(ctx.P7.canStartTraining(S, S.m, 'de'), { ok: true });
});

test('QA-RL21：種類ごとの修行回数の上限（ちから・かしこさ・命中・回避は各1回、丈夫さは2回・合計6回）。上限に達したら始められず、チケットも減らない', () => {
  const ctx = load(); const { P7 } = ctx; const S = farmAfter(ctx, 3, { h: 2 }); S.trainTix = 10;
  assert.deepEqual(j(P7.TRAIN_MAX), { po: 1, in: 1, hi: 1, ev: 1, de: 2 });
  for (const k of ['po', 'in', 'hi', 'ev', 'de', 'de']) runTraining(P7, S, k);
  assert.deepEqual(S.m.prog.train, { po: 1, in: 1, hi: 1, ev: 1, de: 2 });
  assert.equal(S.trainTix, 4, '6回で6枚');
  for (const k of P7.TRAIN_KINDS) {
    assert.deepEqual(P7.canStartTraining(S, S.m, k), { ok: false, reason: 'max' }, k);
    assert.deepEqual(P7.startTraining(S, S.m, k), { ok: false, reason: 'max' });
  }
  assert.equal(S.trainTix, 4);
  // 上限は次のChapter間ファームでも変わらない（回数は個体に残る）
  const T = reload(ctx.P8, S);
  assert.deepEqual(T.m.prog.train, { po: 1, in: 1, hi: 1, ev: 1, de: 2 });
  assert.equal(P7.canStartTraining(T, T.m, 'po').reason, 'max');
});

test('QA-RL22：修行回数は個体ごと（ある個体の回数上限は別の個体に影響しない）', () => {
  const ctx = load(); const { P7, P8 } = ctx;
  const S = farmAfter(ctx, 1); S.trainTix = 2;
  runTraining(P7, S, 'po');
  assert.equal(P7.canStartTraining(S, S.m, 'po').reason, 'max');
  const A = S.m;
  // 個体Bを別に育てて Chapter 1 を終えたところ（Aは育成完了して牧場にいる想定）
  Object.assign(A.raise, { state: 'done', ch: null });
  const B = P8.initIndividual(S, mon(P7, { name: 'B' })); S.box.push(A); S.m = B;
  P8.depart(S, B); reachGoal(P8, S); P8.declineTournament(S, B);
  assert.equal(B.prog.train.po, 0);
  assert.deepEqual(P7.canStartTraining(S, B, 'po'), { ok: true });
  runTraining(P7, S, 'po');
  assert.deepEqual([A.prog.train.po, B.prog.train.po], [1, 1]);
});

// ---------------------------------------------------------
// 公式大会（総当たりリーグ・挑戦ランク・初回優勝の賞金・ランク記録）
// ---------------------------------------------------------
const PRIZE = [100, 200, 350, 550, 800, 1200];
/** Chapter no のゴールにいる個体（クリア最高ランク h） */
function atGoal(no, h = -1) { const ctx = load(); const S = departTo(ctx, no, { h }); reachGoal(ctx.P8, S); return { ...ctx, S }; }

test('QA-RL23：挑戦できるランク＝その個体のクリア最高ランク＋1（Sまで）。D までは最初から選べる。Chapter 1はDまで（全組み合わせ）', () => {
  const { P7, P8 } = load();
  assert.equal(P8.RANK_LETTERS.join(''), 'EDCBAS');
  for (let h = -1; h <= 5; h++) for (const ch of [1, 2, 3, 4]) {
    const m = mon(P7); m.prog.rankClr = clr(h);
    let cap = Math.min(5, Math.max(1, h + 1)); if (ch === 1) cap = Math.min(cap, 1);
    assert.deepEqual(P8.eligibleRanks(m, ch), Array.from({ length: cap + 1 }, (_, i) => i), `h=${h} ch=${ch}`);
    assert.equal(P8.maxChallengeRank(m, ch), cap);
    for (let k = 0; k < 6; k++) assert.equal(P8.canChallenge(m, ch, k), k <= cap, `h=${h} ch=${ch} rank=${k}`);
  }
  const m = mon(P7);
  for (const bad of ['0', 1.5, -1, 6, null, undefined, NaN]) assert.equal(P8.canChallenge(m, 2, bad), false, String(bad));
  m.prog.rankClr = [false, false, false, true, false, false];   // 実績が飛び飛びでも「最高ランク」で決まる
  assert.deepEqual(P8.eligibleRanks(m, 2), [0, 1, 2, 3, 4], 'B だけ（飛び飛び）→ 最高 B＋1＝A');
});

test('QA-RL24：大会はゴール到達後だけ・各Chapterで1回・挑戦できるランクだけ（Chapter 1でCは不可）。大会中は辞退・Chapter終了・別ランクの試合はできない', () => {
  const ctx = load(); const { P8 } = ctx; const S = departTo(ctx, 1);
  assert.deepEqual(P8.canStartTournament(S, S.m, 0), { ok: false, reason: 'not_at_goal' });
  P8.roll(S, S.m, die(2));
  assert.deepEqual(P8.startTournament(S, S.m, 0), { ok: false, reason: 'not_at_goal' }, '移動中も不可');
  move(P8, S); P8.resolveLanding(S, S.m, () => 0);
  reachGoal(P8, S);
  assert.deepEqual(P8.startTournament(S, S.m, 2), { ok: false, reason: 'rank_locked' });
  S.m.prog.rankClr = clr(2);
  assert.deepEqual(P8.startTournament(S, S.m, 2), { ok: false, reason: 'rank_locked' }, 'Chapter 1はクリア実績があってもDまで');
  S.m.prog.rankClr = clr(-1);
  assert.equal(S.m.raise.tour, null);
  const B = ctx.P8.initIndividual(S, mon(ctx.P7, { name: 'B' }));
  assert.deepEqual(P8.startTournament(S, B, 0), { ok: false, reason: 'not_in_chapter' }, '連れていない個体は参加できない');
  assert.deepEqual(P8.startTournament(S, S.m, 1, 5), { ok: true });
  const t = S.m.raise.tour;
  assert.deepEqual([t.rank, t.status, t.result, t.league.size, t.league.round], [1, 'league', null, 6, 0]);
  assert.equal(P8.boardPhase(S.m), 'tour');
  assert.deepEqual(P8.startTournament(S, S.m, 0), { ok: false, reason: 'already_entered' }, '大会は各Chapterで1回');
  assert.deepEqual(P8.declineTournament(S, S.m), { ok: false, reason: 'cannot_decline' });
  assert.deepEqual(P8.canEndChapter(S.m), { ok: false, reason: 'tournament_in_progress' });
  assert.deepEqual(P8.beginBattle(S, S.m, { kind: 'league', rank: 0 }), { ok: false, reason: 'bad_kind' }, '大会と違うランクの試合は始まらない');
  assert.deepEqual(P8.beginBattle(S, S.m, { kind: 'league', rank: 1 }), { ok: true });
  assert.deepEqual(P8.beginBattle(S, S.m, { kind: 'league', rank: 1 }), { ok: false, reason: 'busy' });
  assert.equal(S.m.raise.battle.round, 0);
});

test('QA-RL25：参加数はE・D 6体（自分の試合5）、C〜S 8体（自分の試合7）。全員が全員と1回ずつ戦い、1ラウンドで全員が1試合', () => {
  const { LG } = load();
  assert.deepEqual([...LG.LEAGUE_SIZE], [6, 6, 8, 8, 8, 8]);
  for (let rank = 0; rank < 6; rank++) {
    const { P8, S } = atGoal(4, rank - 1);
    assert.deepEqual(P8.startTournament(S, S.m, rank, 100 + rank), { ok: true });
    const lg = S.m.raise.tour.league, n = rank < 2 ? 6 : 8;
    assert.equal(lg.size, n); assert.equal(lg.entrants.length, n);
    assert.deepEqual(lg.entrants.map((e) => e.id), Array.from({ length: n }, (_, i) => i));
    assert.deepEqual(lg.entrants.map((e) => e.player), [true, ...Array(n - 1).fill(false)]);
    assert.equal(lg.entrants[0].name, 'テスト', '自分の枠は個体の名前');
    assert.equal(lg.rounds.length, n - 1);
    const pairs = new Set();
    for (const rd of lg.rounds) {
      assert.equal(rd.length, n / 2);
      assert.deepEqual(rd.flatMap((mt) => [mt.a, mt.b]).sort((a, b) => a - b), Array.from({ length: n }, (_, i) => i), '1ラウンドで全員1試合');
      for (const mt of rd) {
        pairs.add([mt.a, mt.b].sort((a, b) => a - b).join('-'));
        if (mt.a !== 0 && mt.b !== 0) assert.ok(mt.winner === mt.a || mt.winner === mt.b, 'NPC同士の結果は作成時に確定');
        else assert.equal(mt.winner, null, '自分の試合はまだ');
      }
    }
    assert.equal(pairs.size, (n * (n - 1)) / 2, '全組み合わせを1回ずつ');
    const opps = [];
    while (P8.tourNext(S.m)) { const pm = P8.tourNext(S.m); assert.equal(pm.round, opps.length); opps.push(pm.opp); playMatch(P8, S, true); }
    assert.equal(opps.length, n - 1, `ランク${P8.RANK_LETTERS[rank]}：自分の試合数`);
    assert.deepEqual([...opps].sort((a, b) => a - b), Array.from({ length: n - 1 }, (_, i) => i + 1));
    assert.equal(S.m.raise.tour.status, 'settled');
  }
});

test('QA-RL26：初回優勝の賞金 E100／D200／C350／B550／A800／S1200G（修行チケットも）。途中の試合では賞金・勝利数・ランクは付かない', () => {
  const { P8 } = load();
  assert.deepEqual([...P8.PRIZE], PRIZE);
  // 修行チケットの枚数（E・D 1枚、C〜S 2枚）はコードの定義（CLAUDE.md には記載なし）
  assert.deepEqual([...P8.FIRST_CLEAR_TICKETS], [1, 1, 2, 2, 2, 2]);
  for (let rank = 0; rank < 6; rank++) {
    const { P8: Q, S } = atGoal(4, rank - 1);
    const g0 = S.g, t0 = S.trainTix, w0 = S.wins, m = S.m, s0 = stats(m);
    Q.startTournament(S, m, rank, 7);
    let f;
    while (Q.tourNext(m)) {
      f = playMatch(Q, S, true);
      if (Q.tourNext(m)) {
        assert.equal(f.won, true); assert.equal(f.settled, undefined);
        assert.deepEqual({ g: S.g, tix: S.trainTix, wins: S.wins, br: S.br, rk: m.rk, fa: m.fa, st: m.st }, { g: g0, tix: t0, wins: w0, br: undefined, rk: 0, fa: 0, st: 0 },
          '試合ごとの旧報酬（fight() の賞金など）は残らない');
        assert.deepEqual(m.prog.rankClr, clr(rank - 1));
      }
    }
    assert.deepEqual([f.settled, f.won, f.place], [true, true, 1]);
    assert.equal(f.reward.firstClear, true);
    assert.equal(f.reward.prize, PRIZE[rank]);
    assert.equal(S.g - g0, PRIZE[rank], `ランク${Q.RANK_LETTERS[rank]}の賞金`);
    assert.equal(S.trainTix - t0, Q.FIRST_CLEAR_TICKETS[rank]);
    assert.equal(S.wins, (w0 || 0) + 1, '勝利数は大会優勝1回で1');
    assert.equal(f.reward.bagUnlocked, rank === 5, 'Sランク初回優勝でバッグ6枠');
    // 優勝ボーナス（異なる3能力）。能力の変化はボーナスの分だけ
    assert.equal(new Set(f.reward.bonus.map((b) => b.key)).size, 3);
    const want = { ...s0 }; for (const b of f.reward.bonus) want[b.key] += b.amount;
    assert.deepEqual(stats(m), want);
    assert.deepEqual(S.m.raise.tour.result, { rank, place: 1, won: true, firstClear: true, reward: f.reward });
  }
});

test('QA-RL27：クリア済みランクで再び優勝しても賞金・修行チケットは出ない（初回優勝の賞金は個体ごと・ランクごとに1回）', () => {
  for (const rank of [0, 1]) {
    const { P8, S } = atGoal(2, 1);   // E・D クリア済み
    const g0 = S.g, t0 = S.trainTix, rc0 = [...S.m.prog.rankClr];
    P8.startTournament(S, S.m, rank, 3);
    const f = playLeague(P8, S);
    assert.deepEqual([f.won, f.place, f.reward.firstClear, f.reward.prize, f.reward.tickets], [true, 1, false, 0, 0]);
    // 再優勝でも優勝ボーナス（異なる3能力）は付く（コードの動き。CLAUDE.md は賞金だけを記載）
    assert.equal(f.reward.bonus.length, 3);
    assert.deepEqual([S.g, S.trainTix], [g0, t0]);
    assert.deepEqual(S.m.prog.rankClr, rc0);
    assert.equal(P8.endChapter(S, S.m).entry.tour.firstClear, false);
  }
  // 別の個体は、同じランクでも初回として賞金をもらえる（個体ごと）
  const { P8, S } = atGoal(2, -1); S.rankRec.cleared = [true, true, false, false, false, false];   // セーブ全体では E・D をクリア済み
  const g0 = S.g; P8.startTournament(S, S.m, 1, 3); const f = playLeague(P8, S);
  assert.equal(f.reward.firstClear, true); assert.equal(S.g - g0, 200);
});

test('QA-RL28：上位ランクの優勝で下位ランクもクリア扱いになるが、飛ばした下位ランクの賞金は出ない（あとで下位ランクに優勝しても出ない）', () => {
  const { P8, S } = atGoal(2, -1);   // 未クリア → D までは最初から選べる（E を飛ばして D に挑戦できる）
  const g0 = S.g, t0 = S.trainTix;
  P8.startTournament(S, S.m, 1, 9);
  const f = playLeague(P8, S);
  assert.equal(f.won, true);
  assert.equal(S.g - g0, 200, 'Dの賞金だけ（Eの100Gは出ない）');
  assert.equal(S.trainTix - t0, 1);
  assert.deepEqual(S.m.prog.rankClr, [true, true, false, false, false, false], 'E もクリア扱い');
  assert.deepEqual(S.rankRec.cleared, [true, true, false, false, false, false]);
  assert.equal(P8.endChapter(S, S.m).next, 3);
  assert.equal(P8.depart(S, S.m).reason, 'rank_gate', '2026-10-01 夜：D クリアだけでは Chapter 3（公式C大会クリアが条件）へ出発できない');
  { const keep = [...S.m.prog.rankClr]; S.m.prog.rankClr = clr(2); P8.depart(S, S.m); S.m.prog.rankClr = keep; }   // 賞金の規則を見るため、出発のときだけ条件を満たした実績にする
  reachGoal(P8, S);
  assert.deepEqual(P8.eligibleRanks(S.m, 3), [0, 1, 2], 'D クリアで C まで（＋1）');
  const g1 = S.g, t1 = S.trainTix;
  P8.startTournament(S, S.m, 0, 9);
  const f2 = playLeague(P8, S);
  assert.deepEqual([f2.won, f2.reward.firstClear, f2.reward.prize], [true, false, 0]);
  assert.deepEqual([S.g, S.trainTix], [g1, t1], '飛ばしたEに後から優勝しても賞金なし');
});

test('QA-RL29：ランク記録：優勝で個体のクリア実績・表示ランク・m.rk・セーブ全体の実績・Chapterの記録が更新される（1回だけ）', () => {
  const { P7, P8, S } = atGoal(2, 1);
  assert.equal(P8.rankLabel(S.m), 'D');
  const m = S.m, w0 = S.wins;
  const blank = P8.initIndividual(S, mon(P7, { name: 'B' }));
  assert.equal(P8.rankLabel(blank), 'ー', '未クリアは「ー」');
  P8.startTournament(S, m, 2, 21);
  playLeague(P8, S);
  assert.equal(P8.highestCleared(m), 2); assert.equal(P8.rankLabel(m), 'C');
  assert.equal(m.rk, 2, '個体のランク欄＝クリア最高ランク');
  assert.equal(S.br, 2);
  assert.equal(S.wins, (w0 || 0) + 1);
  assert.deepEqual(P8.canEndChapter(m), { ok: true });
  const e = P8.endChapter(S, m);
  assert.deepEqual(e.entry, { ch: 2, reachedGoal: true, turnsUsed: 1, turnLimit: 20, declined: false, tour: { rank: 2, place: 1, won: true, firstClear: true } });
  assert.deepEqual(m.raise.log.at(-1), e.entry);
  // 再読込しても実績・所持金は二重にならない
  const g1 = S.g, T = reload(P8, S);
  assert.equal(T.g, g1); assert.deepEqual(T.m.prog.rankClr, m.prog.rankClr); assert.equal(T.m.raise.log.length, 2);
});

test('QA-RL30：1位になれなければ報酬もランク実績も無い（全敗／1敗で2位）。記録の勝敗・順位表は試合どおり', () => {
  { const { P8, LG, S } = atGoal(2, -1); const g0 = S.g, t0 = S.trainTix, s0 = stats(S.m);
    P8.startTournament(S, S.m, 0, 4);
    const f = playLeague(P8, S, () => false);
    assert.equal(f.won, false); assert.ok(f.place > 1); assert.equal(f.reward, null);
    assert.deepEqual([S.g, S.trainTix], [g0, t0]); assert.deepEqual(stats(S.m), s0);
    assert.deepEqual(S.m.prog.rankClr, clr(-1));
    assert.equal(LG.standings(S.m.raise.tour.league).find((t) => t.player).w, 0);
    assert.deepEqual(P8.endChapter(S, S.m).entry.tour, { rank: 0, place: f.place, won: false, firstClear: false }); }
  // NPC同士の結果を固定：NPC 5 は全勝、ほかは番号の小さい方が勝つ。自分は1試合目（NPC 5）だけ負ける → 4勝1敗で2位
  { const { P8, LG, S } = atGoal(2, -1); const g0 = S.g;
    LG.setNpcMatchResolver((a, b) => a.id === 5 || (b.id !== 5 && a.id < b.id));
    P8.startTournament(S, S.m, 0, 5);
    LG.setNpcMatchResolver(null);
    const opps = []; let f;
    while (P8.tourNext(S.m)) { const o = P8.tourNext(S.m).opp; opps.push(o); f = playMatch(P8, S, o !== 5); }
    assert.deepEqual(opps, [5, 4, 3, 2, 1]);
    const lg = S.m.raise.tour.league;
    assert.deepEqual(opps.map((o) => LG.resultCell(lg, 0, o)), ['loss', 'win', 'win', 'win', 'win'], '最終試合の勝ちも記録どおり');
    const st = LG.standings(lg);
    assert.deepEqual([st[0].id, st[0].w, st[1].id, st[1].w], [5, 5, 0, 4]);
    assert.deepEqual([f.settled, f.won, f.place, f.reward], [true, false, 2, null]);
    assert.equal(S.g, g0); assert.deepEqual(S.m.prog.rankClr, clr(-1)); }
});

test('QA-RL31：試合が途中で終わったら（再読込）結果・賞金なしで同じ試合をやり直す。大会の進み・勝敗は変わらない', () => {
  const { P8, S } = atGoal(2, -1); S.g = 1000;
  P8.startTournament(S, S.m, 1, 3);
  playMatch(P8, S, true);
  const lg0 = j(S.m.raise.tour.league), opp = P8.tourNext(S.m).opp;
  assert.deepEqual(P8.beginBattle(S, S.m, { kind: 'league', rank: 1 }), { ok: true });
  const T = reload(P8, S);   // fight() の途中で閉じた（終わった印なし）
  assert.deepEqual(P8.finishBattle(T, T.m), { kind: 'league', interrupted: true });
  assert.equal(T.m.raise.battle, null);
  assert.deepEqual(T.m.raise.tour.league, lg0, '大会の進み・結果は変わらない');
  assert.equal(P8.tourNext(T.m).opp, opp, '同じ相手ともう一度');
  assert.equal(T.g, 1000);
  assert.equal(P8.finishBattle(T, T.m), null, '二重に処理しない');
  const f = playMatch(P8, T, false);
  assert.deepEqual([f.round, f.won], [1, false]);
  assert.equal(T.m.raise.tour.league.round, 2); assert.equal(T.g, 1000);
});

test('QA-RL32：大会の状態は保存され、再読込しても参加者・日程・NPC同士の結果・順位は変わらない（続きの結果も同じ）', () => {
  const { P8, LG, S } = atGoal(3, 1);
  P8.startTournament(S, S.m, 2, 12345);
  playMatch(P8, S, true); playMatch(P8, S, false); playMatch(P8, S, true);
  const T = reload(P8, S);
  assert.deepEqual(T.m.raise.tour, j(S.m.raise.tour));
  assert.deepEqual(LG.standings(T.m.raise.tour.league), LG.standings(S.m.raise.tour.league));
  const res = [true, false, true, true];
  let a, b, i = 0; while (P8.tourNext(S.m)) a = playMatch(P8, S, res[i++]);
  i = 0; while (P8.tourNext(T.m)) b = playMatch(P8, T, res[i++]);
  assert.deepEqual(j(T.m.raise.tour), j(S.m.raise.tour));
  assert.deepEqual([b.place, b.won], [a.place, a.won]);
});

test('QA-RL33：辞退：報酬なしでChapter終了（ゴールした記録は残る）。辞退・Chapter終了は1回だけで、辞退後は大会に出られない', () => {
  const { P8, S } = atGoal(2, 0);
  assert.equal(P8.canStartTournament(S, S.m, 0).ok, true);
  const w0 = wallet(S), rc0 = [...S.m.prog.rankClr];
  const d = P8.declineTournament(S, S.m);
  assert.deepEqual(d, { ok: true, next: 3, entry: { ch: 2, reachedGoal: true, turnsUsed: 1, turnLimit: 20, declined: true, tour: null } });
  assert.deepEqual(wallet(S), w0); assert.deepEqual(S.m.prog.rankClr, rc0);
  assert.deepEqual(P8.declineTournament(S, S.m), { ok: false, reason: 'not_in_chapter' });
  assert.deepEqual(P8.startTournament(S, S.m, 0), { ok: false, reason: 'not_in_chapter' });
  assert.deepEqual(P8.endChapter(S, S.m), { ok: false, reason: 'not_in_chapter' });
  assert.equal(S.m.raise.log.length, 2);
  // ゴール前は辞退できない
  const ctx = load(); const U = departTo(ctx, 2);
  assert.deepEqual(ctx.P8.declineTournament(U, U.m), { ok: false, reason: 'cannot_decline' });
  // 大会が終わった後は辞退ではなく、Chapter終了で記録する
  const V = atGoal(2, -1); V.P8.startTournament(V.S, V.S.m, 0, 1); playLeague(V.P8, V.S);
  assert.deepEqual(V.P8.declineTournament(V.S, V.S.m), { ok: false, reason: 'cannot_decline' });
  assert.equal(V.P8.boardPhase(V.S.m), 'tour_done');
  assert.equal(V.P8.endChapter(V.S, V.S.m).entry.declined, false);
});

test('QA-RL34：最後の試合の勝敗（matchWon）が大会全体の結果とは別に返る', () => {
  // A：最後の試合に勝ったが2位（NPC 5 に1敗）→ 試合は「勝ち」
  { const { P8, LG, S } = atGoal(2, -1);
    LG.setNpcMatchResolver((a, b) => a.id === 5 || (b.id !== 5 && a.id < b.id));
    P8.startTournament(S, S.m, 0, 5); LG.setNpcMatchResolver(null);
    const f = playLeague(P8, S, (o) => o !== 5);
    assert.deepEqual([f.settled, f.won, f.place], [true, false, 2]);
    assert.equal(f.matchWon, true); }
  // B：最後の試合（NPC 1）に負けたが、直接対決の成績で1位 → 試合は「負け」
  { const { P8, LG, S } = atGoal(2, -1);
    LG.setNpcMatchResolver((a, b) => a.id > b.id);
    P8.startTournament(S, S.m, 0, 5); LG.setNpcMatchResolver(null);
    const f = playLeague(P8, S, (o) => o !== 1);
    assert.deepEqual([f.settled, f.won, f.place], [true, true, 1]);
    assert.equal(f.matchWon, false); }
});

// ---------------------------------------------------------
// 育成完了（Chapter 4 の終了・最終ルートの代替処理・育成完了回数）
// ---------------------------------------------------------
/** 育成完了した個体の共通チェック */
function assertDone(P8, S, logLen = 4) {
  const r = S.m.raise;
  assert.deepEqual({ state: r.state, ch: r.ch, node: r.node, turnsUsed: r.turnsUsed, pend: r.pend, goal: r.goal, tour: r.tour, battle: r.battle },
    { state: 'done', ch: null, node: null, turnsUsed: 0, pend: null, goal: false, tour: null, battle: null });
  assert.deepEqual(r.endStats, stats(S.m), '完了時の能力値を記録（売却額用）');
  assert.equal(r.log.length, logLen);
  assert.equal(P8.resumeTarget(S), 'town'); assert.equal(P8.canVisitTown(S), true);
  assert.equal(P8.nextChapterKey(S.m), null);
  assert.deepEqual(P8.canDepart(S, S.m), { ok: false, reason: 'finished' });
  assert.deepEqual(P8.canAbandon(S), { ok: false, reason: 'not_raising' });
}

test('QA-RL35：Chapter 4終了時のクリア最高ランクがA未満なら育成完了（辞退・B優勝・A大会で2位以下・ターン切れのどれでも。育成失敗にはしない）', () => {
  const cases = [
    ['未クリアで辞退', () => { const c = atGoal(4, -1); return [c, c.P8.declineTournament(c.S, c.S.m)]; }],
    ['Bクリア済みで辞退', () => { const c = atGoal(4, 3); return [c, c.P8.declineTournament(c.S, c.S.m)]; }],
    ['Chapter 4でBに初優勝', () => { const c = atGoal(4, 2); c.P8.startTournament(c.S, c.S.m, 3, 2); assert.equal(playLeague(c.P8, c.S).won, true); assert.equal(c.P8.highestCleared(c.S.m), 3); return [c, c.P8.endChapter(c.S, c.S.m)]; }],
    ['Bクリア済みでA大会に全敗', () => { const c = atGoal(4, 3); c.P8.startTournament(c.S, c.S.m, 4, 2); assert.equal(playLeague(c.P8, c.S, () => false).won, false); return [c, c.P8.endChapter(c.S, c.S.m)]; }],
    ['ターン切れ（ゴールできず）', () => { const ctx = load(); const S = departTo(ctx, 4, { h: 3 }); timeUp(ctx.P8, S); const c = { ...ctx, S }; return [c, c.P8.endChapter(S, S.m)]; }],
  ];
  for (const [name, run] of cases) {
    const [c, res] = run();
    assert.equal(res.ok, true, name); assert.equal(res.next, 'done', name);
    assertDone(c.P8, c.S);
    assert.equal(c.S.m.raise.log.at(-1).ch, 4);
    assert.equal(c.P8.raiseDoneCount(c.S), 1, `${name}：育成完了回数+1`);
  }
});

test('QA-RL36：Chapter 4終了時にA以上なら最終ルートへ。マップ未登録のため出発できず、Chapter間ファームから代替処理で育成完了（1回だけ）', () => {
  for (const h of [4, 5]) {
    const { P7, P8, S } = atGoal(4, h);
    assert.deepEqual(P8.declineTournament(S, S.m).next, P8.FINAL);
    const r = S.m.raise;
    assert.deepEqual([r.state, r.ch], ['farm', 'final']);
    assert.equal(P8.nextChapterKey(S.m), 'final');
    assert.deepEqual(P8.canDepart(S, S.m), { ok: false, reason: 'no_map', key: 'final' });
    const before = j(r);
    assert.deepEqual(P8.depart(S, S.m), { ok: false, reason: 'no_map', key: 'final' });
    assert.deepEqual(j(r), before, '出発できず、状態も変わらない');
    assert.equal(P8.resumeTarget(S), 'farm'); assert.equal(P8.canVisitTown(S), false, '代替処理の前はまだ育成中');
    assert.equal(P8.raiseDoneCount(S), 0);
    // 修行中は代替処理できない（修行を終えれば可）
    S.trainTix = 1; assert.equal(P7.startTraining(S, S.m, 'po').ok, true);
    assert.deepEqual(P8.canFinishWithoutFinal(S, S.m), { ok: false, reason: 'training' });
    for (let g = 0; g < 20; g++) if (P7.advanceTraining(S, S.m, 3, () => 0).goal) break;
    P7.finishTraining(S, S.m);
    const other = P8.initIndividual(S, mon(P7, { name: 'B' }));
    assert.deepEqual(P8.canFinishWithoutFinal(S, other), { ok: false, reason: 'no_monster' });
    assert.deepEqual(P8.canFinishWithoutFinal(S, S.m), { ok: true });
    const T = reload(P8, S);
    assert.deepEqual([T.m.raise.state, T.m.raise.ch], ['farm', 'final'], '再読込しても最終ルート前のファーム');
    const f = P8.finishWithoutFinal(S, S.m);
    assert.deepEqual(f, { ok: true, next: 'done', entry: { ch: 'final', skipped: true, reason: 'final_unavailable' }, raiseDone: 1 });
    assertDone(P8, S, 5);
    assert.deepEqual(r.log.at(-1), { ch: 'final', skipped: true, reason: 'final_unavailable' });
    assert.deepEqual(r.log.slice(0, 4).map((e) => e.ch), [1, 2, 3, 4], 'Chapter 1〜4の記録はそのまま');
    assert.deepEqual(P8.finishWithoutFinal(S, S.m), { ok: false, reason: 'not_final_farm' }, '二重に完了しない');
    assert.equal(P8.raiseDoneCount(S), 1);
    assert.equal(reload(P8, S).raiseRec.done, 1);
  }
  // 最終ルート以外のChapter間ファームでは代替処理は使えない（次の Chapter の解放条件を満たしているとき。満たしていないときは QA-RL41）
  const ctx = load(); const S = farmAfter(ctx, 2); S.m.prog.rankClr = clr(2);
  assert.deepEqual(ctx.P8.canFinishWithoutFinal(S, S.m), { ok: false, reason: 'not_final_farm' });
});

test('QA-RL37：Chapter 4でAまたはSに初優勝した場合・以前にAをクリア済みでターン切れの場合も、最終ルート前のファームへ進む', () => {
  { const { P8, S } = atGoal(4, 3); const g0 = S.g;
    P8.startTournament(S, S.m, 4, 8); assert.equal(playLeague(P8, S).won, true);
    assert.equal(S.g - g0, 800);
    const e = P8.endChapter(S, S.m);
    assert.equal(e.next, 'final'); assert.deepEqual(e.entry.tour, { rank: 4, place: 1, won: true, firstClear: true });
    assert.deepEqual([S.m.raise.state, S.m.raise.ch], ['farm', 'final']); assert.equal(P8.raiseDoneCount(S), 0); }
  { const { P8, S } = atGoal(4, 4);
    P8.startTournament(S, S.m, 5, 8); assert.equal(playLeague(P8, S).won, true);
    assert.equal(P8.endChapter(S, S.m).next, 'final'); }
  { const ctx = load(); const S = departTo(ctx, 4, { h: 4 }); timeUp(ctx.P8, S);
    const e = ctx.P8.endChapter(S, S.m);
    assert.equal(e.next, 'final'); assert.equal(e.entry.reachedGoal, false);
    assert.deepEqual(ctx.P8.canFinishWithoutFinal(S, S.m), { ok: true }); }
});

test('QA-RL38：育成完了回数は育成完了1回につき1回だけ（購入・Chapter 1〜3の終了・再読込・二重操作・育成放棄では増えない）。記録の無い旧セーブは0回から', () => {
  const ctx = load(); const { P7, P8 } = ctx;
  let S = P8.newSave();
  assert.deepEqual(S.raiseRec, { done: 0, fromStart: true });
  S.m = P8.initIndividual(S, mon(P7));
  assert.equal(P8.raiseDoneCount(S), 0, '購入（個体の作成）では増えない');
  S.m.prog.rankClr = clr(3);   // Chapter 3・4 の条件を満たした個体（B クリア。A 未満なので Chapter 4 の終わりで育成完了）
  P8.depart(S, S.m);
  for (let no = 1; no <= 3; no++) { reachGoal(P8, S); P8.declineTournament(S, S.m); assert.equal(P8.raiseDoneCount(S), 0, `Chapter ${no} の終了`); P8.depart(S, S.m); }
  reachGoal(P8, S);
  assert.equal(P8.declineTournament(S, S.m).next, 'done');
  assert.equal(P8.raiseDoneCount(S), 1);
  S = reload(P8, S); S = reload(P8, S);
  assert.deepEqual(S.raiseRec, { done: 1, fromStart: true }, '再読込では増えない');
  assert.equal(P8.declineTournament(S, S.m).ok, false); assert.equal(P8.endChapter(S, S.m).ok, false);
  assert.equal(P8.finishWithoutFinal(S, S.m).ok, false); assert.equal(P8.depart(S, S.m).ok, false);
  assert.equal(P8.raiseDoneCount(S), 1, '完了済みの個体に二重操作しても増えない');
  // 2体目：育成放棄では増えない
  const A = S.m; const B = P8.initIndividual(S, mon(P7, { name: 'B' })); S.box.push(A); S.m = B;
  P8.depart(S, B); assert.deepEqual(P8.abandon(S, B.uid), { ok: true, name: 'B' });
  assert.equal(S.m, null); assert.equal(P8.raiseDoneCount(S), 1);
  // 3体目：A以上で最終ルートの代替処理から完了 → 2回
  const C = P8.initIndividual(S, mon(P7, { name: 'C' })); S.m = C; C.prog.rankClr = clr(4);
  Object.assign(C.raise, { state: 'farm', ch: 4, log: [{ ch: 1 }, { ch: 2 }, { ch: 3 }] });
  P8.depart(S, C); reachGoal(P8, S); P8.declineTournament(S, C);
  assert.equal(P8.raiseDoneCount(S), 1, '最終ルート前のファームではまだ完了していない');
  P8.finishWithoutFinal(S, C);
  assert.equal(P8.raiseDoneCount(S), 2);
  assert.equal(S.box.filter((x) => x.raise.state === 'done').length, 1);
  // 記録の無い旧セーブ（v6）：育成完了した個体がいても推測で数えず、0回から（fromStart:false）
  const old = j(S); delete old.raiseRec;
  const T = reload(P8, old);
  assert.deepEqual(T.raiseRec, { done: 0, fromStart: false });
  assert.equal(P8.raiseDoneCount(T), 0);
});

test('QA-RL39：育成完了は終点：完了した個体にはボード・大会・修行・出発・育成放棄・代替処理のどの操作も効かず、状態も育成完了回数も変わらない', () => {
  const { P7, P8, S } = atGoal(4, 4);
  P8.declineTournament(S, S.m); P8.finishWithoutFinal(S, S.m);
  S.trainTix = 5;
  const before = j(S);
  const ops = {
    depart: () => P8.depart(S, S.m), roll: () => P8.roll(S, S.m, die(1)), step: () => P8.step(S, S.m), branch: () => P8.chooseBranch(S, S.m, 'G'),
    resolve: () => P8.resolveLanding(S, S.m), skip: () => P8.skipBattleSquare(S, S.m), tour: () => P8.startTournament(S, S.m, 0),
    practice: () => P8.beginBattle(S, S.m, { kind: 'practice' }), league: () => P8.beginBattle(S, S.m, { kind: 'league', rank: 0 }),
    finishBattle: () => P8.finishBattle(S, S.m), decline: () => P8.declineTournament(S, S.m), end: () => P8.endChapter(S, S.m),
    noFinal: () => P8.finishWithoutFinal(S, S.m), train: () => P7.startTraining(S, S.m, 'po'), abandon: () => P8.abandon(S, S.m.uid),
    position: () => P8.ensureBoardPosition(S, S.m),
  };
  for (const [name, op] of Object.entries(ops)) {
    const r = op();
    assert.ok(r === null || r.ok === false || r.changed === false || r.stage === null, `${name}：${JSON.stringify(r)}`);
  }
  P8.markBattleDone(S);
  assert.deepEqual(j(S), before, '何も変わらない');
  assert.equal(P8.raiseDoneCount(S), 1);
  assertDone(P8, S, 5);
});

test('QA-RL40：新規開始から育成完了まで通し（正式マップ・通常ルート・固定乱数）：D→C→B→Aに優勝（挑戦上限は最高クリア＋1）、Chapter 4 で A をクリアして最終ルート、最終ルートは代替処理。賞金・チケット・記録が合う', () => {
  const ctx = load(); const { P7, P8 } = ctx; const rnd = rng(2026);
  const S = P8.newSave(); S.m = P8.initIndividual(S, mon(P7));
  const g0 = S.g, t0 = S.trainTix; let boardGold = 0, boardTix = 0;
  const plan = { 1: 1, 2: 2, 3: 3, 4: 4 };   // 各Chapterで挑戦するランク（null＝辞退）
  for (const no of [1, 2, 3, 4]) {
    assert.deepEqual(P8.depart(S, S.m), { ok: true, key: no });
    const trk = P8.boardOf(S.m);
    while (P8.canRoll(S.m)) {
      P8.roll(S, S.m, rnd); move(P8, S, (opts) => opts[0]);
      const x = P8.resolveLanding(S, S.m, rnd);
      if (x.fx.kind === 'gold') boardGold += x.fx.amount;
      if (x.fx.kind === 'ticket') boardTix += x.fx.amount;
      if (x.wait) P8.skipBattleSquare(S, S.m);
    }
    assert.equal(S.m.raise.goal, true, `Chapter ${no}：通常ルートでゴール（${S.m.raise.turnsUsed}ターン）`);
    assert.equal(S.m.raise.node, trk.goal);
    assert.deepEqual(P8.eligibleRanks(S.m, no).includes(plan[no] ?? 0), true);
    if (plan[no] == null) assert.equal(P8.declineTournament(S, S.m).next, 'final');
    else {
      P8.startTournament(S, S.m, plan[no], 40 + no);
      assert.equal(playLeague(P8, S, () => true).won, true);
      assert.equal(P8.endChapter(S, S.m).next, no < 4 ? no + 1 : 'final');
    }
    // 中断・再開しても続きから（街は経由しない）
    const T = reload(P8, S); assert.deepEqual(T.m.raise, j(S.m.raise));
  }
  assert.deepEqual(P8.finishWithoutFinal(S, S.m).raiseDone, 1);
  assertDone(P8, S, 5);
  assert.deepEqual(S.m.raise.log.map((e) => [e.ch, e.tour ? `${P8.RANK_LETTERS[e.tour.rank]}${e.tour.place}位` : e.declined ? '辞退' : e.skipped ? '未実施' : '']),
    [[1, 'D1位'], [2, 'C1位'], [3, 'B1位'], [4, 'A1位'], ['final', '未実施']]);
  assert.equal(S.g - g0, boardGold + 200 + 350 + 550 + 800, '賞金はD・C・B・Aの初回優勝分だけ（飛ばしたEは出ない）');
  assert.equal(S.trainTix - t0, boardTix + 1 + 2 + 2 + 2);
  assert.deepEqual(S.m.prog.rankClr, clr(4));
  assert.equal(P8.rankLabel(S.m), 'A');
});

// =========================================================
// Chapter の解放条件（2026-10-01 夜・正式）：Chapter 3＝公式Cランク大会クリア以上、Chapter 4＝公式Bランク大会クリア以上（その個体の大会クリア実績 m.prog.rankClr）
// =========================================================
test('QA-RL39：Chapter 3 の条件＝公式C大会クリア以上。C 未クリアは出発できず（rank_gate）、C・B・A・S クリアなら出発できる。Chapter 1・2 は条件なし', () => {
  const ctx = load(); const { P7, P8 } = ctx;
  assert.deepEqual([P8.chapterGate(mon(P7), 1).ok, P8.chapterGate(mon(P7), 2).ok], [true, true], 'Chapter 1・2 は条件なし');
  for (const h of [-1, 0, 1, 2, 3, 4, 5]) {
    const S = P8.newSave(); S.m = P8.initIndividual(S, mon(P7)); S.m.prog.rankClr = clr(h);
    Object.assign(S.m.raise, { state: 'farm', ch: 3, log: [{ ch: 1 }, { ch: 2 }] });
    const c = P8.canDepart(S, S.m);
    if (h >= 2) assert.deepEqual(c, { ok: true, key: 3 }, `クリア最高 ${h}`);
    else { assert.deepEqual(c, { ok: false, reason: 'rank_gate', key: 3, need: 2, have: h }, `クリア最高 ${h}`); assert.equal(P8.depart(S, S.m).ok, false); assert.equal(S.m.raise.state, 'farm', '出発しない'); }
  }
  // Chapter 2 を終えた時点（大会なし・辞退・D 優勝）でも Chapter3 の条件は同じ
  const S = P8.newSave(); S.m = P8.initIndividual(S, mon(P7)); S.m.prog.rankClr = clr(1); Object.assign(S.m.raise, { state: 'farm', ch: 2, log: [{ ch: 1 }] });
  P8.depart(S, S.m); reachGoal(P8, S); assert.equal(P8.declineTournament(S, S.m).next, 3); assert.equal(P8.canDepart(S, S.m).reason, 'rank_gate');
});

test('QA-RL40：Chapter 4 の条件＝公式B大会クリア以上。B 未クリア（C まで）は出発できず、B・A・S クリアなら出発できる', () => {
  const ctx = load(); const { P7, P8 } = ctx;
  for (const h of [-1, 1, 2, 3, 4, 5]) {
    const S = P8.newSave(); S.m = P8.initIndividual(S, mon(P7)); S.m.prog.rankClr = clr(h);
    Object.assign(S.m.raise, { state: 'farm', ch: 4, log: [{ ch: 1 }, { ch: 2 }, { ch: 3 }] });
    const c = P8.canDepart(S, S.m);
    if (h >= 3) assert.deepEqual(c, { ok: true, key: 4 }, `クリア最高 ${h}`);
    else assert.deepEqual(c, { ok: false, reason: 'rank_gate', key: 4, need: 3, have: h }, `クリア最高 ${h}`);
  }
});

test('QA-RL41：条件に届かないときは、その個体の今回の育成はここまで（育成完了。失敗ではない）：個体・能力・技・名前・所持金・バッグ・大会の実績・記録はそのまま、育成完了回数は1回だけ。牧場へ預けて売却・次の育成もできる', () => {
  const ctx = load(); const { P7, P8 } = ctx;
  const S = P8.newSave(); S.m = P8.initIndividual(S, mon(P7, { name: 'ソラ', po: 140, sk: [0, 1, 2, 3, 7], eq: [0, 1, 2, 3, 7, -1] })); S.m.prog.rankClr = clr(1); S.g = 777; S.trainTix = 2;
  Object.assign(S.m.raise, { state: 'farm', ch: 3, log: [{ ch: 1, reachedGoal: true }, { ch: 2, reachedGoal: false }], startStats: { li: 100, po: 100, in: 100, hi: 100, ev: 100, de: 100 } });
  const before = j(S.m);
  assert.deepEqual(P8.canFinishWithoutFinal(S, S.m), { ok: true, reason: 'rank_gate', key: 3, need: 2, have: 1 });
  const r = P8.finishWithoutFinal(S, S.m);
  assert.equal(r.ok, true); assert.equal(r.reason, 'rank_gate'); assert.deepEqual(r.entry, { ch: 3, skipped: true, reason: 'rank_gate', need: 2 });
  assert.equal(S.m.raise.state, 'done'); assert.equal(P8.raiseDoneCount(S), 1);
  for (const k of ['uid', 'name', 'sp', 'li', 'po', 'in', 'hi', 'ev', 'de', 'sk', 'eq']) assert.deepEqual(S.m[k], before[k], k);
  assert.deepEqual(S.m.prog.rankClr, before.prog.rankClr, '大会の実績はそのまま'); assert.deepEqual(S.m.raise.log.slice(0, 2), before.raise.log, 'Chapter の記録はそのまま');
  assert.deepEqual([S.g, S.trainTix], [777, 2], '所持金・チケットはそのまま'); assert.deepEqual(S.m.raise.endStats, { li: 100, po: 140, in: 100, hi: 100, ev: 100, de: 100 }, '売却額用の完了時の能力');
  assert.equal(P8.finishWithoutFinal(S, S.m).ok, false, '2回目はできない'); assert.equal(P8.raiseDoneCount(S), 1);
  const T = reload(P8, S); assert.deepEqual([T.m.raise.state, T.m.name, T.m.po, T.g], ['done', 'ソラ', 140, 777], '保存・再読込しても同じ');
  // 条件を満たしている個体は、この方法では終えられない（通常どおり出発する）
  const S2 = P8.newSave(); S2.m = P8.initIndividual(S2, mon(P7)); S2.m.prog.rankClr = clr(2); Object.assign(S2.m.raise, { state: 'farm', ch: 3, log: [{ ch: 1 }, { ch: 2 }] });
  assert.deepEqual(P8.canFinishWithoutFinal(S2, S2.m), { ok: false, reason: 'not_final_farm' });
});
