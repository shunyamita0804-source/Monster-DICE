// =========================================================
// 牧場のモンスター売却のテスト
//  売却額：未育成50G／育成完了＝100G＋育成中に増えた6能力の合計（上限150G）＋その個体の最高到達公式ランク加算（E25〜S150G）、最大400G
//  能力上昇＝育成開始時と育成完了時の永続能力値の差（Chapter移行で取り直さない・素早さは含めない）。記録の無い旧セーブは0G。
//  育成中の個体がいるとき・最後の1体は売却できない。確定後は選んだ個体だけを外し、売却額を1回だけ加える。
// =========================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const HTML = rd('index.html');
const SRC = { p7: rd('js/phase7/progression.js'), lg: rd('js/phase8/league.js'), p8: rd('js/phase8/raising.js'), mo: rd('js/phase10/monsters.js') };
function load() { const w = {}; for (const k of ['p7', 'lg', 'p8', 'mo']) new Function('window', SRC[k])(w); return { P7: w.MMP7, P8: w.MMP8, M: w.MMP10M }; }
const j = (o) => JSON.parse(JSON.stringify(o));
const lineOf = (prefix) => HTML.split('\n').find((l) => l.startsWith(prefix));
const between = (a, b) => { const i = HTML.indexOf(a), k = HTML.indexOf(b, i + a.length); if (i < 0 || k < 0) throw new Error('抽出失敗: ' + a); return HTML.slice(i, k); };
const KS = ['li', 'po', 'in', 'hi', 'ev', 'de'];
const total = (m) => KS.reduce((a, k) => a + m[k], 0);
const owned = (S) => S.box.length + (S.m ? 1 : 0);
function mon(P7, P8, S, state = 'done', over = {}) {
  const m = P8.initIndividual(S, { sp: 0, name: 'ソラモ', age: 0, span: 30, h: 0, rk: 0, fa: 0, st: 0, last: null, li: 100, po: 100, in: 100, hi: 100, ev: 100, de: 100, sk: [0, 1, 2, 3], eq: [0, 1, 2, 3, -1, -1], ...over });
  P7.ensureProg(m); m.raise.state = state; return m;
}
/** 育成完了個体：gain（null＝育成開始時の記録なし＝旧セーブ）、rank（-1＝公式ランク未到達、0〜5＝E〜S） */
function doneMon(P7, P8, S, { gain = null, rank = -1, name = 'ソラモ' } = {}) {
  const m = mon(P7, P8, S, 'done', { name });
  if (gain !== null) { m.raise.startStats = { li: 100, po: 100, in: 100, hi: 100, ev: 100, de: 100 }; m.po = 100 + gain; m.raise.endStats = Object.fromEntries(KS.map((k) => [k, m[k]])); }
  m.prog.rankClr = [0, 1, 2, 3, 4, 5].map((i) => i <= rank);
  return m;
}
function line(n) {
  const nodes = { s: { type: 'start', x: 0, y: 0 } }, conn = {}; let prev = 's';
  for (let i = 1; i < n; i++) { const id = 'n' + i; nodes[id] = { type: 'normal', x: i, y: 0 }; conn[prev] = [id]; prev = id; }
  nodes.g = { type: 'tournament', x: n, y: 0 }; conn[prev] = ['g']; return { nodes, conn, start: 's', goal: 'g' };
}
function runTurn(P8, S) { for (let g = 0; g < 60 && S.m.raise.pend; g++) { const st = S.m.raise.pend.stage; if (st === 'move') P8.step(S, S.m); else if (st === 'resolve') P8.resolveLanding(S, S.m, () => 0); else if (st === 'battle') P8.skipBattleSquare(S, S.m); } }
function playLeague(P8, S, won) {
  const t = S.m.raise.tour; assert.equal(P8.beginBattle(S, S.m, { kind: 'league', rank: t.rank }).ok, true);
  if (won) { S.g += 999; S.wins = (S.wins || 0) + 1; S.br = 5; S.m.rk = 5; }
  P8.markBattleDone(S); return P8.finishBattle(S, S.m, () => 0);
}

test('SL-1：売却額の計算例（未育成50G／記録なし100G／ランク別加算／能力上昇は上限150G／最終売却額は最大400G・市場価格未満）', () => {
  const { P7, P8, M } = load(); const S = P8.newSave();
  const q = (o) => { const r = M.sellQuote(doneMon(P7, P8, S, o)); return [r.price, r.gain, r.rank]; };
  assert.deepEqual(M.sellQuote(mon(P7, P8, S, 'none')), { ok: true, kind: 'unraised', price: 50 }, '未育成は50G');
  assert.deepEqual(q({}), [100, 0, 0], '育成完了・育成開始時の記録なし（旧セーブ）・ランク未到達＝基本額だけ');
  [25, 50, 75, 100, 125, 150].forEach((b, r) => assert.deepEqual(q({ rank: r }), [100 + b, 0, b], `記録なし・ランク${'EDCBAS'[r]}`));
  assert.deepEqual(q({ gain: 60, rank: 2 }), [235, 60, 75], '能力+60・ランクC：100+60+75');
  assert.deepEqual(q({ gain: 200, rank: 3 }), [350, 150, 100], '能力+200は150Gまで・ランクB：100+150+100');
  assert.deepEqual(q({ gain: 150, rank: 4 }), [375, 150, 125], 'ランクA：100+150+125');
  assert.deepEqual(q({ gain: 300, rank: 5 }), [400, 150, 150], 'ランクS：100+150+150＝400（上限）');
  assert.deepEqual(q({ gain: 149, rank: 5 }), [399, 149, 150]);
  assert.deepEqual(q({ gain: -30, rank: 0 }), [125, 0, 25], '能力が下がった場合の上昇分は0G');
  assert.equal(M.sellQuote(doneMon(P7, P8, S, { gain: 0 })).gainKnown, true); assert.equal(M.sellQuote(doneMon(P7, P8, S, {})).gainKnown, false);
  for (let g = -50; g <= 400; g += 10) for (let r = -1; r <= 5; r++) { const p = q({ gain: g, rank: r })[0]; assert.ok(p <= 400 && p < M.ECONOMY.marketPrice, `${g}/${r}：${p}G`); }
  assert.deepEqual(M.SELL, { unraised: 50, base: 100, gainCap: 150, max: 400, rankBonus: [25, 50, 75, 100, 125, 150] });
});

test('SL-2：能力上昇は育成開始時→育成完了時の永続能力値の差（Chapter移行で取り直さない・素早さは含めない・大会の優勝ボーナスは含む）', () => {
  const { P7, P8, M } = load(); for (const no of [1, 2, 3, 4]) P7.registerChapterBoard(no, line(1));
  const S = P8.newSave(); S.m = mon(P7, P8, S, 'none', { li: 110, po: 90 });
  const start = { li: 110, po: 90, in: 100, hi: 100, ev: 100, de: 100 };
  assert.equal(P8.depart(S, S.m).ok, true); assert.deepEqual(S.m.raise.startStats, start, '育成開始（Chapter 1へ出発）時に記録');
  S.m.po += 20; S.m.speed = 9;   // Chapter中の永続的な変化（素早さは対象外）
  P8.roll(S, S.m, () => 0); runTurn(P8, S); P8.declineTournament(S, S.m);
  S.m.hi += 10;
  P8.depart(S, S.m); assert.deepEqual(S.m.raise.startStats, start, 'Chapter 2への出発では取り直さない');
  P8.roll(S, S.m, () => 0); runTurn(P8, S);
  const t0 = total(S.m); P8.startTournament(S, S.m, 0, 7); let f; for (let i = 0; i < 5; i++) f = playLeague(P8, S, true);
  assert.equal(f.won, true); const bonus = total(S.m) - t0; assert.ok(bonus > 0, `優勝ボーナス +${bonus}`);
  P8.endChapter(S, S.m);
  for (const ch of [3, 4]) { P8.depart(S, S.m); P8.roll(S, S.m, () => 0); runTurn(P8, S); P8.declineTournament(S, S.m); }
  assert.equal(S.m.raise.state, 'done'); assert.deepEqual(S.m.raise.startStats, start);
  assert.deepEqual(S.m.raise.endStats, Object.fromEntries(KS.map((k) => [k, S.m[k]])), '育成完了時に記録');
  const qq = M.sellQuote(S.m);
  assert.deepEqual([qq.gain, qq.rankIdx, qq.rank, qq.price], [Math.min(150, 30 + bonus), 0, 25, 100 + Math.min(150, 30 + bonus) + 25]);
  S.m.po += 50; assert.equal(M.sellQuote(S.m).price, qq.price, '育成完了後の変化は売却額に入れない（完了時の記録を使う）');
  const R = P8.migrateSave(j(S)); assert.deepEqual([R.m.raise.startStats, M.sellQuote(R.m).price], [start, qq.price], '記録は再読込後も残る（セーブversion 6の任意項目）'); assert.equal(R.v, 6);
});

test('SL-3：ランク加算はその個体自身の記録だけを使う（プレイヤー全体のランク・他の個体の記録は使わない）', () => {
  const { P7, P8, M } = load(); const S = P8.newSave();
  S.br = 5; S.rankRec.cleared = [true, true, true, true, true, true];
  const a = doneMon(P7, P8, S, { gain: 0 }), b = doneMon(P7, P8, S, { gain: 0, rank: 5 });
  S.m = a; S.box = [b];
  assert.deepEqual([M.sellQuote(a).rank, M.sellQuote(b).rank], [0, 150]);
});

test('SL-4：売却できる条件：育成中の個体がいれば売却に進めない／最後の1体は売れない／手持ち・牧場のどちらの個体も売れる', () => {
  const { P7, P8, M } = load();
  for (const st of ['board', 'farm', 'final']) {
    const S = P8.newSave(); S.m = mon(P7, P8, S, st); S.box = [doneMon(P7, P8, S, {}), doneMon(P7, P8, S, {})];
    assert.deepEqual(M.canSell(S, S.box[0].uid), { ok: false, reason: 'raising' }, `${st}：別の個体も売れない`);
    assert.deepEqual(M.sell(S, S.box[0].uid), { ok: false, reason: 'raising' }); assert.equal(owned(S), 3);
  }
  const S1 = P8.newSave(); S1.m = doneMon(P7, P8, S1, {}); S1.g = 0;
  assert.deepEqual(M.canSell(S1, S1.m.uid), { ok: false, reason: 'last' }, '最後の1体は売れない');
  const S0 = P8.newSave(); S0.box = [doneMon(P7, P8, S0, {})];
  assert.equal(M.canSell(S0, S0.box[0].uid).reason, 'last', '手持ちがいなくても牧場の最後の1体は売れない');
  const S2 = P8.newSave(); S2.m = doneMon(P7, P8, S2, {}); S2.box = [mon(P7, P8, S2, 'none')];
  assert.deepEqual(M.canSell(S2, 'nai').reason, 'not_found'); assert.equal(M.canSell(S2, null).reason, 'not_found');
  assert.equal(M.canSell(S2, S2.m.uid).price, 100); assert.equal(M.canSell(S2, S2.box[0].uid).price, 50);
});

test('SL-5：確定後は選んだ個体だけを外して売却額を1回だけ加える。二度目・再読込で二重にならない。育成完了回数・他の個体の記録は変えない', () => {
  const { P7, P8, M } = load(); let S = P8.newSave(); S.g = 150; S.wins = 4; S.br = 3; S.raiseRec.done = 5;
  const a = doneMon(P7, P8, S, { gain: 60, rank: 2, name: 'A' }), b = doneMon(P7, P8, S, { rank: 3, name: 'B' }), c = mon(P7, P8, S, 'none', { name: 'C' });
  S.m = a; S.box = [b, c];
  const keep = j({ rankRec: S.rankRec, raiseRec: S.raiseRec, b: b.prog, c: c.prog, bRaise: b.raise });
  const r = M.sell(S, a.uid);   // 手持ちの個体
  assert.deepEqual(r, { ok: true, uid: a.uid, name: 'A', sp: 0, kind: 'done', price: 235, before: 150, after: 385 });
  assert.deepEqual([S.m, S.box.map((x) => x.name), S.g], [null, ['B', 'C'], 385], '手持ちが空になるだけで、他の個体は動かさない');
  assert.deepEqual(M.sell(S, a.uid), { ok: false, reason: 'not_found' }, '同じ個体の二度目の売却はできない'); assert.equal(S.g, 385);
  S = P8.migrateSave(j(S)); assert.deepEqual(M.sell(S, a.uid).reason, 'not_found', '再読込後も二重にならない'); assert.equal(S.g, 385);
  assert.deepEqual(M.sell(S, S.box[1].uid).after, 435, '牧場の未育成個体は50G');
  assert.deepEqual([S.box.map((x) => x.name), S.g], [['B'], 435]);
  assert.deepEqual(j({ rankRec: S.rankRec, raiseRec: S.raiseRec, b: S.box[0].prog, c: keep.c, bRaise: S.box[0].raise }), keep, '育成完了回数（ノビトン条件）・大会記録は変わらない');
  assert.deepEqual([S.wins, S.br], [4, 3]);
  assert.equal(M.sell(S, S.box[0].uid).reason, 'last');
});

test('SL-6：8体とも育成完了・200G未満（購入は上限、合体は資金不足）→ 1体売却すれば、合体または継続用救済で次の育成へ進める', () => {
  const { P7, P8, M } = load();
  for (let g0 = 0; g0 < 200; g0 += 10) {
    const S = P8.newSave(); S.g = g0; const ms = Array.from({ length: 8 }, (_, i) => doneMon(P7, P8, S, { name: 'M' + i })); S.m = ms[0]; S.box = ms.slice(1);
    assert.deepEqual(M.canPurchase(S, 'solamo', 8), { ok: false, reason: 'full' }); assert.ok(!(owned(S) >= 2 && S.g >= M.FUSION_COST));
    const r = M.sell(S, S.box[0].uid); assert.equal(r.price, 100, '最も安い育成完了個体（記録なし・ランクなし）でも100G');
    const canMerge = owned(S) >= 2 && S.g >= M.FUSION_COST, buy = M.canPurchase(S, 'solamo', owned(S));
    assert.ok(canMerge !== !!buy.ok, `${g0}G→${S.g}G：合体か購入のどちらか一方で次へ進める（${canMerge ? '合体' : '継続用救済'}）`);
    if (!canMerge) { assert.equal(buy.continueRescue, true); assert.equal(M.purchase(S, 'solamo', 7).after, 0); }
  }
});

test('SL-7：継続用救済と売却を繰り返しても所持金は増え続けない（未育成は50G・救済は500Gまでの補填のみ）。最大400Gは市場価格500G未満', () => {
  const { P7, P8, M } = load(); const S = P8.newSave(); S.g = 0; S.m = doneMon(P7, P8, S, {});
  for (let k = 0; k < 5; k++) {
    const p = M.purchase(S, 'solamo', 1); assert.equal(p.continueRescued, true); S.box.push(mon(P7, P8, S, 'none'));
    const r = M.sell(S, S.box[0].uid); assert.equal(r.price, 50); assert.equal(S.g, 50, '救済で0G→売却で50G→次の救済で0G');
  }
});

test('SL-8：画面：牧場に「モンスターを売る」→ 一覧（売却額）→ 確認（名前・種族・売却額）→ 2度押しで確定。育成中は画面に進めない', () => {
  const farm = between('function farm(msg,tab){', '\nfunction dep(');
  assert.match(farm, /^function farm\(msg,tab\)\{if\(p8Blocked\(\)\)return;/, '育成中は牧場（売却画面）へ進めない');
  assert.match(farm, /else if\(ft=="d"\)b=pfSellPanel\(all\);/); assert.match(farm, /onclick="farm\('','d'\)">💰 モンスターを売る<\/button>/);
  const panel = lineOf('function pfSellPanel(all){') + between('function pfSellPanel(all){', '\nfunction pfSellPick(');
  assert.match(panel, /売却の確認<\/b>.*\$\{x\.name\}<\/b><br><small>種族：\$\{sp\}/); assert.match(panel, /売却額：<b>\$\{c\.price\}G<\/b>/);
  assert.match(panel, /<button \$\{own>=2&&q\[i\]\.ok\?"":"disabled"\} onclick="pfSellPick\(\$\{i\}\)">売る<\/button>/, '最後の1体・育成中は押せない');
  const go = lineOf('function pfSellGo(b){');
  assert.match(go, /^function pfSellGo\(b\)\{if\(p8Blocked\(\)\|\|!pfSellUid\)return;const c=MMP10M\.canSell\(S,pfSellUid\);/);
  assert.match(go, /if\(!arm\(b,`もう一度押すと売却（\$\{c\.price\}G）`\)\)return;const r=MMP10M\.sell\(S,pfSellUid\);pfSellUid=null;/, '1回目は表示が変わるだけ（個体・所持金は変えない）');
  assert.match(go, /sel=\[\];save\(\);farm\(/, '合体の選択を解除して保存');
  assert.match(lineOf('function pfSellPick(i){'), /^function pfSellPick\(i\)\{if\(p8Blocked\(\)\)return;/);
});

test('SL-9：既存の所持上限・合体料金・初回購入救済・継続用救済・市場価格は変えない', () => {
  const { P7, P8, M } = load();
  assert.equal(M.OWN_LIMIT, 8); assert.equal(M.FUSION_COST, 200); assert.deepEqual(M.ECONOMY, { initialGold: 300, marketPrice: 500 });
  assert.match(between('async function fuse(){', '\nfunction tog('), /if\(S\.g<200\)return;S\.g-=200;/);
  assert.deepEqual(M.purchase({ g: 300 }, 'solamo', 0), { ok: true, key: 'solamo', price: 500, rescued: true, before: 300, after: 0 });
  const S = P8.newSave(); S.g = 450; S.m = doneMon(P7, P8, S, {});
  assert.deepEqual(M.canPurchase(S, 'solamo', 1), { ok: true, price: 500, rescue: false, continueRescue: true });
  assert.deepEqual(M.MARKET_CATALOG.map((c) => [c.key, c.status, c.price ?? null]), [['solamo', 'sale', 500], ['gauru', 'sale', 500], ['nobiton', 'waiting', null]]);
});
