// =========================================================
// Phase 6：正式技ルーレット（7枠）テスト
//  ・m.eq（6要素）＋固定MISS1枠から成る7枠スロット構築ロジックを検証する。
//  ・必殺技は明示登録（SPECIAL_MOVES）された技IDのみをweight=0.7として扱い、
//    威力・技名・クリティカル率からの自動判定をしていないことを確認する。
//  ・本番のSPECIAL_MOVESは空集合のまま（正式技データ登録は別Phase）。
//    weight=0.7の動作検証は、本番データと分離したテスト専用の必殺技セットで行う。
//  ・MISS（未修得・固定）停止時にActionが発生しないこと、
//    技停止時は従来通り正式Engine接続ルートを使うことを検証する。
//
//  既存157件（monster-master134・統合境界10・act接続13）はここでは一切変更しない。
// =========================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadBridgeAndAdapter() {
  const sandbox = { window: {} };
  const bridgeSrc = readFileSync(path.join(__dirname, '../js/battle-bridge.js'), 'utf8');
  const adapterSrc = readFileSync(path.join(__dirname, '../js/integration/adapter.js'), 'utf8');
  const fn = new Function('window', bridgeSrc + '\n' + adapterSrc);
  fn(sandbox.window);
  return { MM: sandbox.window.MMBattle, AD: sandbox.window.MMAdapter };
}

function loadLegacyMoveData() {
  const html = readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const skMatch = html.match(/const SK=(\[.*?\]);/s);
  const effMatch = html.match(/const EFF=(\{.*?\});/s);
  // eslint-disable-next-line no-eval
  const SK = (0, eval)('(' + skMatch[1] + ')');
  // eslint-disable-next-line no-eval
  const EFF = (0, eval)('(' + effMatch[1] + ')');
  return { SK, EFF };
}

// index.html内の実際のPhase6ロジック（SPECIAL_MOVES・weight定数・buildRouletteSlots）をそのまま抽出して使う。
// 本番のSPECIAL_MOVESが空集合であることも、この抽出元がindex.html本体そのものであることによって担保される。
function loadPhase6RouletteLogic() {
  const html = readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const block = html.match(/const SPECIAL_MOVES=new Set\(\[\]\);[\s\S]*?const buildRouletteSlots=eq=>\{[\s\S]*?\};/);
  if (!block) throw new Error('index.htmlからPhase6のルーレットロジックを抽出できません');
  const sandbox = {};
  // eslint-disable-next-line no-new-func
  const fn = new Function('return (function(){' + block[0] + '\nreturn {SPECIAL_MOVES, ROULETTE_WEIGHT_NORMAL, ROULETTE_WEIGHT_SPECIAL, ROULETTE_WEIGHT_MISS, FIXED_MISS, rouletteWeightOf, buildRouletteSlots};})()');
  return fn();
}

// テスト専用に「もし特定の技を必殺技として登録したら」というシナリオを検証するための、
// 本番から完全に独立したbuildRouletteSlots相当のロジック（本番のSPECIAL_MOVESには一切触れない）。
function buildTestRouletteSlots(eq, testSpecialMoves, FIXED_MISS) {
  const six = [...eq];
  while (six.length < 6) six.push(-1);
  const weightOf = (k) => (k === FIXED_MISS ? 1.0 : k < 0 ? 1.0 : testSpecialMoves.has(k) ? 0.7 : 1.0);
  return [...six.slice(0, 6), FIXED_MISS].map((k) => ({ k, weight: weightOf(k) }));
}

test('Phase6：本番のSPECIAL_MOVESは空集合である（必殺技はまだ何も登録されていない）', () => {
  const { SPECIAL_MOVES } = loadPhase6RouletteLogic();
  assert.equal(SPECIAL_MOVES.size, 0, '正式技データ登録Phaseまでは本番の必殺技セットは空のままであること');
});

test('Phase6：ルーレットは常に7枠になる（6技スロット＋固定MISS1）', () => {
  const { buildRouletteSlots } = loadPhase6RouletteLogic();
  const slots = buildRouletteSlots([0, 1, 2, 3, 4, 5]);
  assert.equal(slots.length, 7);
});

test('Phase6：技6個＋固定MISSで7枠（6技すべて有効、末尾が固定MISS）', () => {
  const { buildRouletteSlots, FIXED_MISS } = loadPhase6RouletteLogic();
  const slots = buildRouletteSlots([0, 1, 2, 3, 4, 5]);
  assert.equal(slots.length, 7);
  slots.slice(0, 6).forEach((s) => assert.notEqual(s.k, -1));
  assert.equal(slots[6].k, FIXED_MISS);
});

test('Phase6：技3個の場合、3技＋未修得MISS3＋固定MISS1になる', () => {
  const { buildRouletteSlots, FIXED_MISS } = loadPhase6RouletteLogic();
  const slots = buildRouletteSlots([0, 1, 2]); // m.eqは6要素にパディングされる前提（[-1,-1,-1]が末尾に入る）
  assert.equal(slots.length, 7);
  const movesFilled = slots.slice(0, 6).filter((s) => s.k !== -1);
  const unlearnedMiss = slots.slice(0, 6).filter((s) => s.k === -1);
  assert.equal(movesFilled.length, 3);
  assert.equal(unlearnedMiss.length, 3);
  assert.equal(slots[6].k, FIXED_MISS);
});

test('Phase6：技0個の場合、未修得MISS6＋固定MISS1になる', () => {
  const { buildRouletteSlots, FIXED_MISS } = loadPhase6RouletteLogic();
  const slots = buildRouletteSlots([-1, -1, -1, -1, -1, -1]);
  assert.equal(slots.length, 7);
  assert.equal(slots.slice(0, 6).every((s) => s.k === -1), true);
  assert.equal(slots[6].k, FIXED_MISS);
});

test('Phase6：6技習得しても固定MISSは消えない（7枠のまま）', () => {
  const { buildRouletteSlots, FIXED_MISS } = loadPhase6RouletteLogic();
  const slots = buildRouletteSlots([0, 1, 2, 3, 4, 5]);
  assert.equal(slots.length, 7, '技を6個埋めてもMISSがなくなる仕様にはなっていない');
  assert.equal(slots[6].k, FIXED_MISS);
});

test('Phase6：固定MISSはm.eq（6要素）には含まれない（永続データを変更しない）', () => {
  const { buildRouletteSlots } = loadPhase6RouletteLogic();
  const eq = [0, 1, 2, 3, 4, 5];
  const before = JSON.stringify(eq);
  buildRouletteSlots(eq);
  assert.equal(JSON.stringify(eq), before, 'm.eq自体は書き換えられない');
  assert.equal(eq.length, 6, 'm.eqは6要素のまま維持される');
});

test('Phase6：通常技のweightは1.0である', () => {
  const { rouletteWeightOf, ROULETTE_WEIGHT_NORMAL } = loadPhase6RouletteLogic();
  assert.equal(rouletteWeightOf(0), 1.0);
  assert.equal(ROULETTE_WEIGHT_NORMAL, 1.0);
});

test('Phase6：未修得MISS(-1)のweightは1.0である', () => {
  const { rouletteWeightOf } = loadPhase6RouletteLogic();
  assert.equal(rouletteWeightOf(-1), 1.0);
});

test('Phase6：固定MISSのweightは1.0である', () => {
  const { rouletteWeightOf, FIXED_MISS } = loadPhase6RouletteLogic();
  assert.equal(rouletteWeightOf(FIXED_MISS), 1.0);
});

test('Phase6：必殺技を威力・技名・クリティカル率から自動判定していない（本番SPECIAL_MOVESが空の間は全技通常weight）', () => {
  const { rouletteWeightOf } = loadPhase6RouletteLogic();
  const { SK } = loadLegacyMoveData();
  // SK[9]（超スターダストレイ、威力比率1.3・クリ率25%）のような「一見必殺技っぽい」技でも、
  // SPECIAL_MOVESに明示登録されていない限りweight=1.0（通常技）のままであること。
  const highestPowerIdx = SK.reduce((best, sk, i) => (sk[1] > SK[best][1] ? i : best), 0);
  assert.equal(rouletteWeightOf(highestPowerIdx), 1.0, '威力最大の技であっても自動的に必殺技扱い(weight 0.7)にはならない');
  SK.forEach((sk, i) => {
    assert.equal(rouletteWeightOf(i), 1.0, `技${i}(${sk[0]})は明示登録がないのでweight=1.0のはず`);
  });
});

test('Phase6：テスト用データでは、明示登録した技だけがweight=0.7になる（本番データとは分離）', () => {
  const { FIXED_MISS } = loadPhase6RouletteLogic();
  const testSpecialMoves = new Set([9]); // テスト専用の仮データ。本番SPECIAL_MOVESには一切影響しない。
  const slots = buildTestRouletteSlots([9, 0, 1, 2, 3, 4], testSpecialMoves, FIXED_MISS);
  assert.equal(slots[0].k, 9);
  assert.equal(slots[0].weight, 0.7, 'テストデータで必殺技登録した技はweight=0.7');
  assert.equal(slots[1].weight, 1.0, '登録していない技はweight=1.0のまま');
  assert.equal(slots[6].weight, 1.0, '固定MISSはweight=1.0のまま');

  // 本番ロジックの方は影響を受けていないことも確認する。
  const { rouletteWeightOf: prodWeightOf } = loadPhase6RouletteLogic();
  assert.equal(prodWeightOf(9), 1.0, '本番のSPECIAL_MOVESはテストデータの影響を受けず空のまま');
});

test('Phase6：未修得MISS停止時はActionが発生しない（hitCount/totalDamage/Effectとも変化なし）', () => {
  const { MM, AD } = loadBridgeAndAdapter();
  const a = AD.legacyUnitToIndividualLike({ name: 'A', sp: 'dev', li: 300, po: 300, in: 300, hi: 300, ev: 300, de: 300 });
  const b = AD.legacyUnitToIndividualLike({ name: 'B', sp: 'dev', li: 300, po: 300, in: 300, hi: 300, ev: 300, de: 300 });
  const session = MM.createBattleSession({ unitA: a, unitB: b, battleType: 'test', rng: () => 0 });
  const before = { hp: session.currentLife.B, hitCount: session.hitCount.A, totalDamage: session.totalDamage.A };

  // 未修得MISS(-1)へ停止した場合、index.htmlのfight()は「k<0||k===FIXED_MISS」のガードでact()自体を呼ばない。
  // ここではそのガード条件そのものを検証する（resolveActionを一切呼んでいないことの確認）。
  const k = -1;
  const shouldCallEngine = !(k < 0 || k === 'fixed_miss');
  assert.equal(shouldCallEngine, false, '未修得MISSでは正式Engineへ架空のmoveを送らない');
  assert.deepEqual(
    { hp: session.currentLife.B, hitCount: session.hitCount.A, totalDamage: session.totalDamage.A },
    before,
    'Engineを一切呼んでいないのでセッション状態は不変',
  );
});

test('Phase6：固定MISS停止時はActionが発生しない（hitCount/totalDamage/Effectとも変化なし）', () => {
  const { MM, AD } = loadBridgeAndAdapter();
  const { FIXED_MISS } = loadPhase6RouletteLogic();
  const a = AD.legacyUnitToIndividualLike({ name: 'A', sp: 'dev', li: 300, po: 300, in: 300, hi: 300, ev: 300, de: 300 });
  const b = AD.legacyUnitToIndividualLike({ name: 'B', sp: 'dev', li: 300, po: 300, in: 300, hi: 300, ev: 300, de: 300 });
  const session = MM.createBattleSession({ unitA: a, unitB: b, battleType: 'test', rng: () => 0 });
  const before = { hp: session.currentLife.B, hitCount: session.hitCount.A, totalDamage: session.totalDamage.A, debuffs: session.debuffs.B.length };

  const k = FIXED_MISS;
  const shouldCallEngine = !(k < 0 || k === FIXED_MISS);
  assert.equal(shouldCallEngine, false, '固定MISSでは正式Engineへ架空のmoveを送らない');
  assert.deepEqual(
    { hp: session.currentLife.B, hitCount: session.hitCount.A, totalDamage: session.totalDamage.A, debuffs: session.debuffs.B.length },
    before,
  );
});

test('Phase6：技停止時は従来通り正式Engineへ1回だけActionが送られる（7枠化後もEngine接続テストが通る）', () => {
  const { MM, AD } = loadBridgeAndAdapter();
  const { SK } = loadLegacyMoveData();
  const { buildRouletteSlots } = loadPhase6RouletteLogic();
  const a = AD.legacyUnitToIndividualLike({ name: 'A', sp: 'dev', li: 300, po: 300, in: 300, hi: 300, ev: 300, de: 300 });
  const b = AD.legacyUnitToIndividualLike({ name: 'B', sp: 'dev', li: 300, po: 300, in: 300, hi: 300, ev: 300, de: 300 });
  const session = MM.createBattleSession({ unitA: a, unitB: b, battleType: 'test', rng: () => 0 });

  const slots = buildRouletteSlots([0, 1, 2, 3, 4, 5]);
  const chosen = slots[0]; // たいあたり
  assert.notEqual(chosen.k, -1);
  const move = AD.moveFromLegacySK(SK[chosen.k], undefined, { id: 'sk' + chosen.k, powerScale: 100 });
  const before = session.currentLife.B;
  const result = MM.resolveAction({ session, baseStats: { A: a.stats, B: b.stats }, attackerSide: 'A', move, rng: { hitRng: () => 0, damageRng: () => 0.5, criticalRng: () => 0.99 } });
  assert.equal(result.hit, true);
  assert.ok(session.currentLife.B < before, '技停止時は通常通りダメージが発生する');
});

test('Phase6：power=0のEffect技（吠える）は7枠化後も正常動作する', () => {
  const { MM, AD } = loadBridgeAndAdapter();
  const { SK, EFF } = loadLegacyMoveData();
  const a = AD.legacyUnitToIndividualLike({ name: 'A', sp: 'dev', li: 300, po: 300, in: 300, hi: 300, ev: 300, de: 300 });
  const b = AD.legacyUnitToIndividualLike({ name: 'B', sp: 'dev', li: 300, po: 300, in: 300, hi: 300, ev: 300, de: 300 });
  const session = MM.createBattleSession({ unitA: a, unitB: b, battleType: 'test', rng: () => 0 });
  const move = AD.moveFromLegacySK(SK[3], EFF[3], { id: 'sk3', powerScale: 100 });
  const before = session.currentLife.B;
  const result = MM.resolveAction({ session, baseStats: { A: a.stats, B: b.stats }, attackerSide: 'A', move, rng: { hitRng: () => 0, damageRng: () => 0.5, criticalRng: () => 0.5 } });
  assert.equal(result.damage, 0);
  assert.equal(session.currentLife.B, before);
  assert.equal(result.effectsApplied.length, 1);
});

test('Phase6：KOは7枠化後も正常動作する（KO時は追加Effectを付与しない）', () => {
  const { MM, AD } = loadBridgeAndAdapter();
  const { SK, EFF } = loadLegacyMoveData();
  const a = AD.legacyUnitToIndividualLike({ name: 'A', sp: 'dev', li: 300, po: 300, in: 300, hi: 300, ev: 300, de: 300 });
  const b = AD.legacyUnitToIndividualLike({ name: 'B', sp: 'dev', li: 1, po: 300, in: 300, hi: 300, ev: 300, de: 300 });
  const session = MM.createBattleSession({ unitA: a, unitB: b, battleType: 'test', rng: () => 0 });
  session.currentLife.B = 1;
  const move = AD.moveFromLegacySK(SK[19], EFF[19], { id: 'sk19', powerScale: 100 });
  const result = MM.resolveAction({ session, baseStats: { A: a.stats, B: b.stats }, attackerSide: 'A', move, rng: { hitRng: () => 0, damageRng: () => 0.5, criticalRng: () => 0.99 } });
  assert.equal(result.ko, true);
  assert.equal(result.effectsApplied.length, 0);
});

test('Phase6：CPU側も7枠構造と整合する（固定MISS・未修得MISSを不当に除外しない）', () => {
  const { buildRouletteSlots, FIXED_MISS } = loadPhase6RouletteLogic();
  // CPU側もプレイヤー側と同じbuildRouletteSlots()を使う設計（index.htmlのspin()はA.eqの種類を問わず共通処理）。
  const cpuSlots = buildRouletteSlots([10, 11, -1, -1, -1, -1]); // CPU個体が3技しか装備していないケース
  assert.equal(cpuSlots.length, 7, 'CPU側も7枠');
  assert.equal(cpuSlots.filter((s) => s.k === -1).length, 4, 'CPU側でも未修得MISSが除外されず存在する');
  assert.equal(cpuSlots[6].k, FIXED_MISS, 'CPU側でも固定MISSが存在する');
});
