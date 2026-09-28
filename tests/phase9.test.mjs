// =========================================================
// Phase 9 テスト：正式Chapter 1〜4・公式大会UI・VS画面・Chapter間ファーム
//  既存147件（統合10・act接続13・Phase6 18・Phase7 56・Phase8 50）とは別ファイル。
// =========================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const rd = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const HTML = rd('index.html');
const SRC = { p7: rd('js/phase7/progression.js'), lg: rd('js/phase8/league.js'), p8: rd('js/phase8/raising.js'), ch: rd('js/phase9/chapters.js'),
  art: existsSync(path.join(ROOT, 'js/phase9/board-art.js')) ? rd('js/phase9/board-art.js') : '' };
/** 本番と同じ順で読み込み、index.html と同じ方法で正式Chapterを登録する */
function load({ register = true } = {}) {
  const w = {}; for (const k of ['p7', 'lg', 'p8', 'ch', 'art']) if (SRC[k]) new Function('window', SRC[k])(w);
  if (register) for (const c of w.MMP9C.CHAPTERS) w.MMP7.registerChapterBoard(c.no, c.track, { provisional: false });
  return { P7: w.MMP7, P8: w.MMP8, LG: w.MMP8L, C: w.MMP9C, ART: w.MMP9ART };
}
const j = (o) => JSON.parse(JSON.stringify(o));
const fnLine = (name) => HTML.split('\n').find((l) => l.startsWith(name));
const between = (a, b) => { const i = HTML.indexOf(a), k = HTML.indexOf(b, i + a.length); if (i < 0 || k < 0) throw new Error('抽出失敗: ' + a); return HTML.slice(i, k); };
function mon(P7, over = {}) {
  const m = { sp: 0, name: 'テスト', age: 0, span: 30, h: 0, rk: 0, fa: 0, st: 0, last: null, li: 100, po: 100, in: 100, hi: 100, ev: 100, de: 100, sk: [0, 1, 2, 3], eq: [0, 1, 2, 3, -1, -1], ...over };
  P7.ensureProg(m); return m;
}
/** 再現可能な乱数 */
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
/** 分岐で選ぶルート種別を決めて、ゴールまでのターン数を実際のエンジン（MMP8）で数える */
function playChapter(P7, P8, no, kind, rnd) {
  const S = P8.newSave(); S.m = P8.initIndividual(S, mon(P7));
  Object.assign(S.m.raise, no === 1 ? {} : { state: 'farm', ch: no, log: Array.from({ length: no - 1 }, (_, i) => ({ ch: i + 1 })) });
  assert.equal(P8.depart(S, S.m).ok, true);
  const trk = P8.boardOf(S.m);
  while (P8.canRoll(S.m)) {
    P8.roll(S, S.m, rnd);
    for (let g = 0; g < 50 && S.m.raise.pend; g++) {
      const p = S.m.raise.pend;
      if (p.stage === 'move') P8.step(S, S.m);
      else if (p.stage === 'branch') P8.chooseBranch(S, S.m, p.opts.find((id) => trk.lanes[trk.nodes[id].lane].kind === kind) || p.opts[0]);
      else if (p.stage === 'resolve') P8.resolveLanding(S, S.m, rnd);
      else if (p.stage === 'battle') P8.skipBattleSquare(S, S.m);
    }
  }
  return { S, turns: S.m.raise.turnsUsed, goal: S.m.raise.goal };
}
/** 最短手数（スタート→ゴールの最小マス数） */
function minSteps(t) { const d = { [t.start]: 0 }, q = [t.start]; while (q.length) { const n = q.shift(); for (const x of t.conn[n] || []) if (!(x in d)) { d[x] = d[n] + 1; q.push(x); } } return d[t.goal]; }

// ---------------------------------------------------------
// Step 1：正式Chapter 1〜4のマップ
// ---------------------------------------------------------
test('T1-1：Chapter 1〜4がすべて正式マップで登録され、名前はデータとして正しい', () => {
  const { P7, P8, C } = load();
  assert.deepEqual(P7.CHAPTER_DEFS.map((c) => c.name), ['はじまりの草原', '潮風の海岸', '天空の浮島', '灼熱の火山']);
  for (const no of [1, 2, 3, 4]) { assert.equal(P8.isPlayable(no), true, `Chapter ${no}`); assert.equal(P7.getChapterBoard(no).track, C.byNo(no).track); }
  assert.equal(P8.isPlayable(P8.FINAL), false, '最終ルートのマップは未確定のまま（登録しない）');
  assert.equal(C.byNo(4).goalLabel, '最終大会');
});

test('T1-2：全Chapterが20ターン制・サイコロは1〜3', () => {
  const { P7, P8 } = load();
  for (const no of [1, 2, 3, 4]) { assert.equal(P8.CHAPTER_RULES[no].turnLimit, 20); const r = playChapter(P7, P8, no, 'main', rng(no)); assert.equal(r.S.m.raise.turnLimit, 20); }
  const seen = new Set(); const r = rng(9); for (let i = 0; i < 3000; i++) seen.add(P7.rollDice(r));
  assert.deepEqual([...seen].sort(), [1, 2, 3]);
});

test('T1-3：マップの形が正しい（全マスがスタートから到達でき、ゴールへ行ける。行き止まりなし・ID重複なし・画面内）', () => {
  const { C } = load();
  for (const c of C.CHAPTERS) {
    const t = c.track, ids = Object.keys(t.nodes);
    const reach = new Set([t.start]), q = [t.start]; while (q.length) for (const x of t.conn[q.shift()] || []) if (!reach.has(x)) { reach.add(x); q.push(x); }
    assert.equal(reach.size, ids.length, `CH${c.no}：到達できないマスがない`);
    for (const id of ids) {
      if (id !== t.goal) assert.ok((t.conn[id] || []).length > 0, `CH${c.no} ${id}：行き止まりなし`);
      for (const x of t.conn[id] || []) assert.ok(t.nodes[x], `CH${c.no} ${id}→${x}`);
      const n = t.nodes[id]; assert.ok(n.x >= 20 && n.x <= c.W - 20 && n.y >= 100 && n.y <= c.H - 20, `CH${c.no} ${id} 画面内`);
    }
    assert.equal(t.nodes[t.goal].type, 'tournament'); assert.equal(t.nodes[t.start].type, 'start');
  }
});

test('T1-4：正式マップは仮CH1より十分長く、分岐・合流・ルートの違いがある', () => {
  const { C } = load();
  const m = HTML.match(/const CH1=(\{.*?\});\n/s); const OLD = new Function(`return ${m[1]}`)();
  const oldMin = minSteps({ ...OLD, goal: OLD.goal || 'goal' });
  const forks = C.CHAPTERS.map((c) => Object.values(c.track.conn).filter((o) => o.length > 1).length);
  // Chapter 1 は正式地理（Map Pattern A「大橋と清流の草原」）で分岐3か所になった（旧：2か所）。ほかの条件はそのまま
  assert.deepEqual(forks, [3, 3, 4, 4], 'Chapter 1-Aは正式地理の3分岐。Chapter 2〜4は従来どおり');
  for (const c of C.CHAPTERS) {
    const t = c.track;
    assert.ok(minSteps(t) >= oldMin * 1.5, `CH${c.no}：最短${minSteps(t)}マス（仮CH1は${oldMin}）`);
    for (const [id, opts] of Object.entries(t.conn).filter(([, o]) => o.length > 1)) {
      const lanes = opts.map((x) => t.lanes[t.nodes[x].lane]);
      assert.equal(lanes[0].kind, 'main', `CH${c.no} ${id}：通常ルートが先頭`);
      assert.equal(new Set(lanes.map((l) => l.to)).size, 1, `CH${c.no} ${id}：分岐は同じ地点で再合流する`);
      assert.ok(lanes.every((l) => l.label), 'ルート名がある');
      assert.ok(lanes.some((l) => l.kind === 'detour') || lanes.some((l) => l.kind === 'short'));
    }
    const kinds = new Set(Object.values(t.lanes).map((l) => l.kind));
    assert.ok(kinds.has('detour'), `CH${c.no}：寄り道あり`); if (c.no >= 1) assert.ok(kinds.has('short'), `CH${c.no}：近道あり`);
  }
});

test('T1-5：ターン数のバランス（通常ルートは平均13〜16ターン・20ターン以内にほぼ到達、寄り道を重ねると18〜20ターン近くまで使う）', () => {
  const { P7, P8 } = load();
  for (const no of [1, 2, 3, 4]) {
    const run = (kind, seed) => { const r = rng(seed), xs = []; for (let i = 0; i < 400; i++) xs.push(playChapter(P7, P8, no, kind, r)); return xs; };
    const main = run('main', 100 + no), mean = main.reduce((a, x) => a + x.turns, 0) / main.length;
    assert.ok(mean >= 13 && mean <= 16, `CH${no} 通常ルート平均 ${mean.toFixed(2)}ターン`);
    assert.ok(main.filter((x) => x.goal).length / main.length >= 0.98, `CH${no} 通常ルートは20ターン以内にほぼゴール`);
    const det = run('detour', 200 + no), dmean = det.reduce((a, x) => a + (x.goal ? x.turns : 21), 0) / det.length;
    assert.ok(dmean >= 16 && dmean <= 20.5, `CH${no} 寄り道優先 平均 ${dmean.toFixed(2)}`);
    const sh = run('short', 300 + no), smean = sh.reduce((a, x) => a + x.turns, 0) / sh.length;
    assert.ok(smean < mean, `CH${no} 近道は通常より早い`);
  }
});

test('T1-6：マスの種類：各Chapterに何も起きないマス・修行チケット・宝箱・練習試合・イベント・6能力マスがある（旧仕様のマスは無い）', () => {
  const { C, P8 } = load();
  for (const c of C.CHAPTERS) {
    const cnt = {}; for (const n of Object.values(c.track.nodes)) cnt[n.type] = (cnt[n.type] || 0) + 1;
    for (const t of ['normal', 'ticket', 'treasure', 'battle', 'event', 'life', 'power', 'wisdom', 'hit', 'evasion', 'toughness']) assert.ok(cnt[t] >= 1, `CH${c.no}：${t}`);
    assert.ok(cnt.ticket >= 2, `CH${c.no}：修行チケットマス2か所以上`);
    assert.ok(!cnt.rest && !cnt.train, `CH${c.no}：旧「休息」「修行」マスは置かない`);
    for (const t of Object.keys(cnt)) assert.ok(P8.SQUARE_TYPES.includes(t), `${t} の効果が定義済み`);
  }
});

test('T1-7：ライフマス・宝箱マスの効果（暫定値）／修行チケットマス+1', () => {
  const { P7, P8 } = load();
  const trk = { nodes: { S: { type: 'start' }, x: { type: 'life' }, y: { type: 'treasure' }, z: { type: 'ticket' }, G: { type: 'tournament' } }, conn: { S: ['x'], x: ['y'], y: ['z'], z: ['G'] }, start: 'S', goal: 'G' };
  P7.registerChapterBoard(1, trk);
  const S = P8.newSave(); S.g = 0; S.m = P8.initIndividual(S, mon(P7)); P8.depart(S, S.m);
  const step1 = (rnd) => { P8.roll(S, S.m, () => 0); P8.step(S, S.m); return P8.resolveLanding(S, S.m, rnd); };
  const a = step1(() => 0); assert.equal(a.fx.key, 'li'); assert.equal(S.m.li, 105);
  const b = step1(() => 0); assert.deepEqual(b.fx, { kind: 'gold', ev: 'chest', amount: 50 }); assert.equal(S.g, 50);
  const c = step1(() => 0); assert.deepEqual(c.fx, { kind: 'ticket', amount: 1 });
  assert.match(P8SRC_CHEST(), /【暫定】/);
});
const P8SRC_CHEST = () => SRC.p8.slice(SRC.p8.indexOf('Phase 9：正式Chapterマップ用のマス'), SRC.p8.indexOf('SQUARE_TYPES'));

test('T1-8：通常ルートでゴールすると、その章の公式大会（ランク選択）へ進める', () => {
  const { P7, P8 } = load();
  for (const no of [1, 2, 3, 4]) {
    const r = playChapter(P7, P8, no, 'main', () => 0.99);   // 出目3
    assert.equal(r.goal, true); assert.equal(P8.boardPhase(r.S.m), 'goal');
    assert.equal(P8.canStartTournament(r.S, r.S.m, 0).ok, true, `CH${no}`);
  }
});

test('T1-9：旧仮マップ（旧CH1）途中のv6セーブは同じChapterの開始地点・0ターンから／大会中なら大会を続ける', () => {
  const { P7, P8 } = load();
  const S = P8.newSave(); S.m = P8.initIndividual(S, mon(P7));
  Object.assign(S.m.raise, { state: 'board', ch: 1, node: 'm7', turnsUsed: 9, turnLimit: 20, pend: { roll: 2, left: 1, stage: 'move' } });
  const T = P8.migrateSave(j(S));
  assert.deepEqual(P8.ensureBoardPosition(T, T.m), { changed: true });
  assert.deepEqual([T.m.raise.node, T.m.raise.turnsUsed, T.m.raise.pend], ['S', 0, null]);
  Object.assign(S.m.raise, { node: 'goal', turnsUsed: 11, pend: null, goal: true, tour: { rank: 1, status: 'league', league: { round: 2 }, result: null } });
  const U = P8.migrateSave(j(S)); P8.ensureBoardPosition(U, U.m);
  assert.deepEqual([U.m.raise.node, U.m.raise.goal, U.m.raise.turnsUsed, U.m.raise.tour.league.round], ['G', true, 11, 2], '大会は失わない');
});

// ---------------------------------------------------------
// Step 2：ボードの絵とボード画面
// ---------------------------------------------------------
test('T2-1：各Chapterの地図はベクター描画（画像を貼らない）。全マスがタップできる要素として描かれ、IDはChapterごとに重複しない', () => {
  const { C, ART } = load();
  const ids = new Map();
  for (const c of C.CHAPTERS) {
    const svg = ART.render(c);
    assert.doesNotMatch(svg, /<image|data:image|\.png|\.jpe?g/i, `CH${c.no}：画像を貼っていない`);
    const nodes = [...svg.matchAll(/class="p9n[^"]*" data-id="([^"]+)"/g)].map((x) => x[1]);
    assert.deepEqual(nodes.sort(), Object.keys(c.track.nodes).sort(), `CH${c.no}：全マスを描く`);
    assert.ok(svg.includes(`>${c.goalLabel}</text>`), '会場の看板');
    assert.ok(svg.includes('>START</text>'));
    for (const [, id] of svg.matchAll(/ id="([^"]+)"/g)) { assert.ok(!ids.has(id) || ids.get(id) === c.no, `id「${id}」がChapter間で重複しない`); ids.set(id, c.no); }
  }
});

test('T2-2：ボードのHUD：Chapter番号・Chapter名（折り返さない）・現在ランク・残りターン・修行チケット（絵）・メニューを表示', () => {
  const hud = between('function p9BoardHud(m){', '\nfunction board(msg){');
  assert.match(hud, /Chapter <b>\$\{r\.ch\}<\/b> \/ \$\{MMP7\.CHAPTER_COUNT\}/); assert.match(hud, /MMP8\.chapterName\(r\.ch\)/);
  assert.match(hud, /MMP8\.rankLabel\(m\)/); assert.match(hud, /p8TurnText\(m\)/); assert.match(hud, /\$\{p8Hud\(/); assert.match(hud, /onclick="p9Menu\(\)"/);
  assert.match(HTML, /\.p9plq \.nm\{[^}]*white-space:nowrap/, 'Chapter名は1行で表示');
  assert.match(fnLine('function p8Hud('), /MMP9ART\.ticketIcon\(/, '修行チケットは絵文字ではなくチケットの絵');
  assert.match(fnLine('function p8BoardMenu('), /ステータス[\s\S]*わざ[\s\S]*マスの説明[\s\S]*中断[\s\S]*育成放棄/);
});

test('T2-3：分岐：ルート種別（通常ルート・近道・寄り道）・ルート名・合流までのマス数・この先のマスを表示し、地図のマスをタップしても選べる', () => {
  const br = between('function p9BranchHtml(m){', '\nfunction p9Tap(e){');
  for (const w of ['通常ルート', '近道', '寄り道', 'ln.label', '合流まで', 'MMP9ART.iconSvg(t.nodes[s].type', "bPickBranch('${id}')"]) assert.ok(br.includes(w), w);
  assert.match(between('function p9Tap(e){', '\nfunction bPositionMon('), /if\(MMP8\.boardPhase\(m\)=="branch"&&r\.pend\.opts\.includes\(id\)\)return bPickBranch\(id\);/);
  const bd = between('function board(msg){', '\nfunction p9BranchHtml(');
  assert.match(bd, /ph=="branch"&&r\.pend\.opts\.includes\(id\)\)g\.classList\.add\("opt"\)/, '選べるマスを光らせる');
  assert.match(bd, /サイコロを振る[\s\S]*1・2・3のみ/);
});

test('T2-4：ゴール：挑戦できるランクだけをカードで表示（2度押しで参加）・辞退も選べる', () => {
  const g = between('function p8GoalHtml(m){', '\nfunction p9arm(');
  assert.match(g, /MMP8\.eligibleRanks\(m,r\.ch\)/); assert.match(g, /MMP8L\.LEAGUE_SIZE\[k\]/); assert.match(g, /初回優勝/); assert.match(g, /クリア済み/); assert.match(g, /辞退/);
  assert.match(fnLine('function p8TourStart('), /p9arm\(b,/);
});

// ---------------------------------------------------------
// Step 3：公式大会（大会掲示板・VS画面・結果）
// ---------------------------------------------------------
const FIGHT = (() => { const a = HTML.indexOf('async function fight('); return HTML.slice(a, HTML.indexOf('\n$("#snd").textContent', a)); })();
/** その章のゴールまで進め、指定ランクの大会を始める（挑戦可能にするため下位ランクをクリア済みにする） */
function tourSave(P7, P8, rank, ch = 4, seed = 7) {
  const r = playChapter(P7, P8, ch, 'main', () => 0.99), S = r.S;
  for (let i = 0; i <= rank - 2; i++) S.m.prog.rankClr[i] = true;
  assert.equal(P8.startTournament(S, S.m, rank, seed).ok, true, `ランク${rank}`);
  return S;
}
function playLeague(P8, S, won) { P8.beginBattle(S, S.m, { kind: 'league', rank: S.m.raise.tour.rank }); if (won) { S.g += 999; S.wins = (S.wins || 0) + 1; } P8.markBattleDone(S); return P8.finishBattle(S, S.m, () => 0); }

test('T3-1：E・Dは6体（自分の試合5）、C・B・A・Sは8体（自分の試合7）。順位表・対戦表の行数も同じ', () => {
  const { P7, P8, LG } = load();
  for (let rank = 0; rank < 6; rank++) {
    const S = tourSave(P7, P8, rank), lg = S.m.raise.tour.league, n = rank < 2 ? 6 : 8;
    assert.equal(lg.entrants.length, n); assert.equal(lg.rounds.length, n - 1, `ランク${rank}：自分の試合数`);
    assert.equal(LG.standings(lg).length, n);
    assert.equal(lg.entrants.filter((e) => e.player).length, 1, 'プレイヤー自身を含む');
  }
});

test('T3-2：大会参加者は【暫定】データ。能力値は fight() が実際に作る対戦相手と同じ値、種族は既存の正式種族のみ', () => {
  const { LG } = load();
  const rv = JSON.parse(FIGHT.match(/RV=(\[[^\]]*\])/)[1]);
  assert.deepEqual([...LG.PROVISIONAL_OPPONENT_STAT], rv, 'fight()内部のRVと同じ値');
  LG.setSpeciesCount(2);
  for (let rank = 0; rank < 6; rank++) {
    const lg = LG.createLeague(rank, 40 + rank, 'A');
    for (const e of lg.entrants.filter((x) => !x.player)) {
      const v = LG.entrantView(lg, e.id);
      assert.equal(v.provisional, true); assert.ok([0, 1].includes(v.sp), '既存種族（ソラモ・ガウル）だけ');
      assert.deepEqual(Object.keys(v.stats), ['li', 'po', 'in', 'hi', 'ev', 'de']); assert.ok(Object.values(v.stats).every((x) => x === rv[rank]));
    }
  }
  assert.match(HTML, /MMP8L\.setSpeciesCount\(SP\.length\);/);
  assert.doesNotMatch(FIGHT, /entrantView|MMP8L/, 'fight()は変更していない（一致はバトルPhaseで行う）');
});

test('T3-3：参加者データは後から正式データへ差し替えられる（画面は entrantView だけを見る）', () => {
  const { LG } = load();
  LG.setNpcProvider((rank, count) => Array.from({ length: count }, (_, i) => ({ name: `正式${i}`, sp: 1, stats: { li: 500 + i, po: 1, in: 2, hi: 3, ev: 4, de: 5 }, provisional: false, power: 9 })));
  const lg = LG.createLeague(2, 1, 'A'), v = LG.entrantView(lg, 3);
  assert.deepEqual([v.name, v.sp, v.stats.li, v.provisional], ['正式2', 1, 502, false]);
  LG.setNpcProvider(null);
  const npc = between('function p9Npc(lg,id){', '\nconst p9Short');
  assert.match(npc, /MMP8L\.entrantView\(lg,id\)/, '画面側の参照口は1か所');
  const old = { rank: 1, size: 6, entrants: [{ id: 0, player: true, name: 'A' }, { id: 1, player: false, name: '旧NPC', power: 5 }], rounds: [], round: 0 };
  assert.deepEqual(LG.entrantView(old, 1).stats, { li: 90, po: 90, in: 90, hi: 90, ev: 90, de: 90 }, 'Phase 8で始めた大会データも表示できる');
});

test('T3-4：対戦表：勝ち○・負け×・次の試合◎・未対戦・自分自身を区別。同じラウンドのNPC戦は自分の試合が終わるまで出さない', () => {
  const { P7, P8, LG } = load(); const S = tourSave(P7, P8, 1, 2), lg = S.m.raise.tour.league;
  const opp0 = P8.tourNext(S.m).opp, other = lg.rounds[0].find((mt) => mt.a !== 0 && mt.b !== 0);
  assert.equal(LG.resultCell(lg, 0, 0), 'self'); assert.equal(LG.resultCell(lg, 0, opp0), 'next');
  assert.equal(LG.resultCell(lg, other.a, other.b), 'pending', '結果は確定済みでもまだ見せない');
  playLeague(P8, S, true);
  assert.equal(LG.resultCell(lg, 0, opp0), 'win'); assert.equal(LG.resultCell(lg, opp0, 0), 'loss');
  assert.ok(['win', 'loss'].includes(LG.resultCell(lg, other.a, other.b)), '自分の試合後に公開');
  assert.equal(LG.resultCell(lg, 0, P8.tourNext(S.m).opp), 'next');
  const mx = between('function p9Matrix(lg){', '\nfunction p8TourScr(');
  for (const w of ['○', '×', '◎', '勝ち', '負け', '次の試合', '未対戦', 'class="stk"', 'MMP8L.resultCell(lg,e.id,o.id)']) assert.ok(mx.includes(w), w);
  assert.match(HTML, /\.p9mx \.stk\{position:sticky;left:0/, '8体大会でも参加者列を固定して横スクロール');
});

test('T3-5：大会の途中保存・再開：参加者（種族・能力）・勝敗・順位・残り試合がそのまま（再抽選なし）', () => {
  const { P7, P8, LG } = load(); const S = tourSave(P7, P8, 3, 4, 99);
  playLeague(P8, S, true); playLeague(P8, S, false);
  const T = P8.migrateSave(j(S));
  assert.deepEqual(T.m.raise.tour, S.m.raise.tour);
  assert.deepEqual(LG.standings(T.m.raise.tour.league), LG.standings(S.m.raise.tour.league));
  assert.deepEqual(LG.entrantView(T.m.raise.tour.league, 5), LG.entrantView(S.m.raise.tour.league, 5));
});

test('T3-6：初回優勝＝賞金・修行チケット・ステータスボーナス／クリア済みランクの再優勝＝ステータスボーナスのみ（報酬の値はPhase 8のまま）', () => {
  const { P7, P8 } = load();
  const A = tourSave(P7, P8, 0, 1); A.g = 0; A.trainTix = 0; let f; for (let i = 0; i < 5; i++) f = playLeague(P8, A, true);   // ボードで拾った修行チケットと大会の報酬を分けて数える（B・Cと同じ）
  assert.equal(f.won, true); assert.deepEqual([f.reward.firstClear, f.reward.prize, f.reward.tickets, f.reward.bonus.length], [true, 100, 1, 3]);
  assert.deepEqual([A.g, A.trainTix], [100, 1]);
  const B = tourSave(P7, P8, 1, 2); B.m.prog.rankClr[1] = true; B.g = 0; B.trainTix = 0; for (let i = 0; i < 5; i++) f = playLeague(P8, B, true);
  assert.deepEqual([f.reward.firstClear, f.reward.prize, f.reward.tickets, f.reward.bonus.length], [false, 0, 0, 3]);
  assert.deepEqual([B.g, B.trainTix], [0, 0]);
  const C = tourSave(P7, P8, 2, 3); C.g = 0; for (let i = 0; i < 7; i++) f = playLeague(P8, C, true);
  assert.deepEqual([f.reward.prize, f.reward.tickets], [350, 2], 'C以上は初回チケット2枚');
  const res = between('function p9TourResult(msg){', '\nfunction p8RewardText(');
  for (const w of ['優勝！', '初回優勝の報酬', '再優勝の報酬', '賞金', '修行チケット', 'ステータスボーナス', '報酬はありません', 'p9Standings(lg,st,true)', 'p8EndChapter()']) assert.ok(res.includes(w), w);
});

test('T3-7：VS画面：左に自分・右に相手・中央にVS、正式6能力を数値とゲージで比較。対戦開始は2度押し', () => {
  assert.deepEqual(between('const P9_STAT=', ';\nconst P9_TROPHY').match(/"(ライフ|ちから|かしこさ|命中|回避|丈夫さ)"/g).map((x) => x.replace(/"/g, '')), ['ライフ', 'ちから', 'かしこさ', '命中', '回避', '丈夫さ']);
  const vs = between('function p9VsScr(){', '\nfunction p9VsGo(');
  for (const w of ['p9Pt(m,"l me")', 'p9Pt(o,"l")', 'class="vsx">VS<', 'P9_STAT.map', 'class="p9bar l"', 'class="p9bar r"', '${a>b?"hi":""}', '${b>a?"hi":""}', 'p9VsGo(this)', '対戦開始', '【暫定】']) assert.ok(vs.includes(w), w);
  assert.doesNotMatch(vs, /有利|不利/, '「高い方が有利」とは書かない');
  assert.match(fnLine('function p9VsGo('), /p9arm\(b,"もう一度押すと試合開始"\)\)return;p8TourFight\(\)/);
});

// ---------------------------------------------------------
// Step 4：Chapter間ファーム
// ---------------------------------------------------------
test('T4-1：Chapter間ファームは専用画面（未育成・育成完了のファームは従来のまま）', () => {
  const hall = between('function _hall(tab,msg){', '\nfunction after(');
  assert.match(hall, /if\(S\.m&&MMP7\.raiseState\(S\.m\)=="farm"&&\(tab\|\|ht\)=="t"\)\{ht="t";return p9FarmScr\(msg\)\}/);
  assert.match(hall, /b=p8FarmPanel\(\)/, '未育成・育成完了は従来のファーム');
});

test('T4-2：ファームのコマンド：次のChapterへ・修行・ステータス・わざ・アイテム屋・中断・育成放棄（街へ戻るコマンドは無い）', () => {
  const f = between('function p9FarmScr(msg){', '\n// ---- Phase 8：育成中の画面遷移');
  for (const [label, call] of [['次のChapterへ', 'prepScr()'], ['修行', "hall('s')"], ['ステータス', "hall('st')"], ['わざ', "hall('w')"], ['アイテム屋', 'shopScr()'], ['中断', 'p8Suspend()'], ['育成放棄', 'p8AbandonAsk()']]) {
    assert.ok(f.includes(`"${label}"`) && f.includes(`"${call}"`), label);
  }
  assert.doesNotMatch(f, /街にもどる|lobby\(|market\(|farm\(/);
});

test('T4-3：モンスターが主役（大きな正式モンスター画像）。コマンド列の方が場所を取らない', () => {
  const f = between('function p9FarmScr(msg){', '\n// ---- Phase 8：育成中の画面遷移');
  assert.match(f, /<div class="p9hero"><div class="mon p9bob">\$\{msv\(m\)\}<\/div>/);
  const w = (sel) => +HTML.match(new RegExp(sel.replace(/[.]/g, '\\.') + '\\{[^}]*width:(\\d+)px'))[1];
  assert.ok(w('.p9hero .mon') > w('.p9cmd') * 1.5, 'モンスター画像の幅 > コマンド列の幅×1.5');
  assert.match(f, /\$\{p8Hud\(/, '修行チケットなどのHUD'); assert.match(f, /MMP8\.rankLabel\(m\)/);
  assert.match(f, /c\?c\.desc:""/, '次のChapterの説明'); assert.match(f, /前回の結果/);
});

// ---------------------------------------------------------
// Step 5：Chapter 1〜4 を最後まで（正式マップ・実エンジンでの通し）
// ---------------------------------------------------------
/** 今いるChapterを通常ルートで最後まで進める（出目3固定） */
function runBoard(P8, S, kind = 'main') {
  const trk = P8.boardOf(S.m);
  while (P8.canRoll(S.m)) {
    P8.roll(S, S.m, () => 0.99);
    for (let g = 0; g < 50 && S.m.raise.pend; g++) {
      const p = S.m.raise.pend;
      if (p.stage === 'move') P8.step(S, S.m);
      else if (p.stage === 'branch') P8.chooseBranch(S, S.m, p.opts.find((id) => trk.lanes[trk.nodes[id].lane].kind === kind) || p.opts[0]);
      else if (p.stage === 'resolve') P8.resolveLanding(S, S.m, () => 0.5);
      else if (p.stage === 'battle') P8.skipBattleSquare(S, S.m);
    }
  }
}
function winLeague(P8, S, rank) {
  assert.equal(P8.startTournament(S, S.m, rank, 3).ok, true, `ランク${rank}に挑戦できる`);
  let f; while (P8.tourNext(S.m)) f = playLeague(P8, S, true);
  assert.equal(f.won, true); return P8.endChapter(S, S.m);
}

test('T5-1：Chapter 1→2→3→4を正式マップで通し、Chapter 4終了時にAランク以上なら最終ルートへ強制進行', () => {
  const { P7, P8 } = load(); const S = P8.newSave(); S.m = P8.initIndividual(S, mon(P7, { name: '通し' }));
  const plan = [[1, 1], [2, 3], [3, 4], [4, 5]];   // [Chapter, 挑戦ランク]：D→B→A→S（最高クリア＋2の範囲内）
  for (const [ch, rank] of plan) {
    assert.equal(P8.depart(S, S.m).ok, true, `Chapter ${ch} へ出発`); assert.equal(S.m.raise.ch, ch);
    runBoard(P8, S); assert.equal(S.m.raise.goal, true, `Chapter ${ch}：20ターン以内にゴール`); assert.ok(S.m.raise.turnsUsed <= 20);
    assert.equal(P8.canVisitTown(S), false, 'Chapter中は街へ戻れない');
    const e = winLeague(P8, S, rank);
    if (ch < 4) { assert.deepEqual([e.next, S.m.raise.state, S.m.raise.ch], [ch + 1, 'farm', ch + 1]); assert.equal(P8.canVisitTown(S), false, 'Chapter間ファームからも街へ戻れない'); }
    else { assert.equal(e.next, P8.FINAL, 'Aランク以上→最終ルート（選択肢なし）'); assert.deepEqual([S.m.raise.state, S.m.raise.ch], ['farm', P8.FINAL]); }
  }
  assert.equal(P8.rankLabel(S.m), 'S');
  assert.equal(P8.canDepart(S, S.m).reason, 'no_map', '最終ルートの中身（マップ・ボス・ストーリー・報酬）は未確定のまま');
  assert.equal(S.m.raise.log.length, 4);
});

test('T5-2：Chapter 4終了時にAランク未満なら育成完了（どのランクでも育成失敗にはしない）', () => {
  const { P7, P8 } = load();
  for (const best of [-1, 0, 2, 3]) {   // 未クリア・E・C・B
    const S = P8.newSave(); S.m = P8.initIndividual(S, mon(P7));
    S.m.prog.rankClr = [0, 1, 2, 3, 4, 5].map((i) => i <= best);
    Object.assign(S.m.raise, { state: 'farm', ch: 4, log: [{ ch: 1 }, { ch: 2 }, { ch: 3 }] });
    P8.depart(S, S.m); runBoard(P8, S);
    const e = P8.declineTournament(S, S.m);
    assert.equal(e.next, 'done', `最高${best}`); assert.equal(S.m.raise.state, 'done'); assert.ok(S.m, '個体は消えない');
    assert.equal(P8.canVisitTown(S), true, '育成完了後は街へ');
  }
});

test('T5-3：正式マップの分岐待ち・マス効果の途中で中断→再開しても同じ状態（振り直し・引き直しなし）', () => {
  const { P7, P8 } = load();
  const S = P8.newSave(); S.m = P8.initIndividual(S, mon(P7)); Object.assign(S.m.raise, { state: 'farm', ch: 2, log: [{ ch: 1 }] }); P8.depart(S, S.m);
  S.m.raise.node = 'a4'; P8.roll(S, S.m, () => 0.99); P8.step(S, S.m); P8.step(S, S.m);
  assert.equal(S.m.raise.pend.stage, 'branch'); const saved = j(S.m.raise);
  const T = P8.migrateSave(j(S)); P8.ensureBoardPosition(T, T.m);
  assert.deepEqual(T.m.raise, saved, '分岐待ちのまま・ターンも同じ');
  P8.chooseBranch(T, T.m, T.m.raise.pend.opts[1]);
  while (T.m.raise.pend && T.m.raise.pend.stage === 'move') P8.step(T, T.m);
  const U = P8.migrateSave(j(T));
  assert.deepEqual(U.m.raise.pend, T.m.raise.pend, 'マス効果の処理待ちも保存される');
  assert.equal(U.m.raise.turnsUsed, saved.turnsUsed);
});

test('T5-4：新しい画面（ボード・大会・VS・結果・ファーム）に街へ戻る導線が無い／中断・育成放棄へ行ける', () => {
  const src = between('function p9Ch(ch){', '\nasync function bRoll(){') + between('function p9TourHead(m,t){', '\nfunction p8RewardText(') + between('function p9VsScr(){', '\n// 育成リソースHUD') + between('function p9FarmScr(msg){', '\n// ---- Phase 8：育成中の画面遷移');
  assert.doesNotMatch(src.replace(/\/\/.*$/gm, ''), /街にもどる|lobby\(|market\(|museum\(|savescr\(/);
  assert.match(fnLine('function p8BoardMenu('), /p8Suspend\(\)/); assert.match(fnLine('function p8BoardMenu('), /p8AbandonAsk\(\)/);
  assert.match(between('function p9TourHead(m,t){', '\nfunction p9Standings('), /onclick="p9Menu\(\)"/, '大会中もメニュー（中断・育成放棄）へ行ける');
});
