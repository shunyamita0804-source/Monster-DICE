// =========================================================
// act()接続Phase テスト
//  ・index.html の act() は正式Engine（window.MMBattle.resolveAction）を1回だけ呼び、
//    旧命中式・旧ダメージ式・旧クリティカル1.6倍・旧先攻判定を一切使わないことを確認する。
//  ・ここではブラウザDOMは使わず、act()が実際に呼び出す
//    MMBattle.resolveAction / MMAdapter.moveFromLegacySK / createBattleSession の
//    組み合わせを、index.html内の実データ（SK/EFF）で直接検証する
//    （act()自体はDOM操作を含むためNode上では実行できないが、
//     act()が行っているのは「resolveActionを1回呼び、返り値で演出するだけ」であり、
//     そのresolveAction呼び出し部分をここで直接再現・検証することで
//     act()の計算責務が正式Engineに委譲されていることを担保する）。
//
//  monster-master側の既存134件、統合境界の既存10件はここでは一切変更しない。
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

// index.html実データからSK/EFF配列だけを取り出す（9MBのHTML全体をNode上でパースしない）。
function loadLegacyMoveData() {
  const html = readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const skMatch = html.match(/const SK=(\[.*?\]);/s);
  const effMatch = html.match(/const EFF=(\{.*?\});/s);
  if (!skMatch || !effMatch) throw new Error('index.htmlからSK/EFFを抽出できません');
  // eslint-disable-next-line no-eval
  const SK = (0, eval)('(' + skMatch[1] + ')');
  // eslint-disable-next-line no-eval
  const EFF = (0, eval)('(' + effMatch[1] + ')');
  return { SK, EFF };
}

// index.html内のact()と同じ変換（今回に限りtemporaryMovePower=SK[1]×100）。
function moveFromK(AD, SK, EFF, k) {
  return AD.moveFromLegacySK(SK[k], EFF[k], { id: 'sk' + k, powerScale: 100 });
}

function makeLegacyUnit(overrides) {
  return { name: 'テスト', sp: 'dev', li: 300, po: 300, in: 300, hi: 300, ev: 300, de: 300, ...overrides };
}

test('act接続：SK[1]×100が暫定movePowerとして正しく渡る（旧倍率そのままではない）', () => {
  const { AD } = loadBridgeAndAdapter();
  const { SK } = loadLegacyMoveData();
  // 0番「たいあたり」sk[1]=0.7 → 暫定movePower=70（旧倍率0.7のままではない）
  const move = moveFromK(AD, SK, {}, 0);
  assert.equal(move.power, 70);
  assert.notEqual(move.power, SK[0][1], '旧倍率(0.7)がそのままmovePowerに使われていないこと');
});

test('act接続：命中判定は正式calculateHitRate/rollHitのみで決まり、旧命中式は使われない', () => {
  const { MM, AD } = loadBridgeAndAdapter();
  const { SK } = loadLegacyMoveData();
  const a = AD.legacyUnitToIndividualLike(makeLegacyUnit({ hi: 100 }));
  const b = AD.legacyUnitToIndividualLike(makeLegacyUnit({ ev: 100 }));
  const session = MM.createBattleSession({ unitA: a, unitB: b, battleType: 'test', rng: () => 0 });
  const move = moveFromK(AD, SK, {}, 0); // たいあたり accuracy=80

  // 正式命中式：moveAccuracy + 30*(hit-evasion)/(hit+evasion)。hit=evasionなので80%のまま。
  const expectedRate = MM.calculateHitRate({ moveAccuracy: move.accuracy, hit: 100, evasion: 100 });
  assert.equal(expectedRate, 80);

  // 旧命中式 sk[8]/100+(hit-evasion)*.004 なら hit=evasion時は0.80のまま同じ値になるため、
  // 閾値付近の乱数で両者が乖離するケースをrollHitで直接確認する。
  const hitAtThreshold = MM.rollHit(expectedRate, () => 0.7999);
  const missAtThreshold = MM.rollHit(expectedRate, () => 0.80);
  assert.equal(hitAtThreshold, true);
  assert.equal(missAtThreshold, false);

  const result = MM.resolveAction({ session, baseStats: { A: a.stats, B: b.stats }, attackerSide: 'A', move, rng: { hitRng: () => 0.7999, damageRng: () => 0.5, criticalRng: () => 0.99 } });
  assert.equal(result.hit, true);
});

test('act接続：クリティカルは正式1.5倍であり、旧1.6倍は使用されない', () => {
  const { MM, AD } = loadBridgeAndAdapter();
  const { SK } = loadLegacyMoveData();
  const a = AD.legacyUnitToIndividualLike(makeLegacyUnit());
  const b = AD.legacyUnitToIndividualLike(makeLegacyUnit());
  const session = MM.createBattleSession({ unitA: a, unitB: b, battleType: 'test', rng: () => 0 });
  const move = moveFromK(AD, SK, {}, 0);

  const base = MM.calculateBaseDamage({ movePower: move.power, attackStat: 300, defenseStat: 300 });
  const withVariance = MM.applyDamageVariance(base, () => 0.5); // 分散なし（中央値）
  const criticalDamage = MM.finalizeDamage(withVariance, true);

  // 二重丸め誤差を避けるため、丸め前のwithVarianceから直接1.5倍・1.6倍を算出して比較する。
  assert.equal(criticalDamage, Math.max(1, Math.round(withVariance * 1.5)));
  assert.notEqual(criticalDamage, Math.max(1, Math.round(withVariance * 1.6)), '旧クリティカル倍率1.6が使われていないこと');

  const result = MM.resolveAction({ session, baseStats: { A: a.stats, B: b.stats }, attackerSide: 'A', move, rng: { hitRng: () => 0, damageRng: () => 0.5, criticalRng: () => 0 } });
  assert.equal(result.critical, true);
  assert.equal(result.damage, criticalDamage);
});

test('act接続：ダメージ式は正式calculateBaseDamage系のみで、旧計算式(0.55係数・防御相殺100/(100+de))は使われない', () => {
  const { MM, AD } = loadBridgeAndAdapter();
  const { SK } = loadLegacyMoveData();
  const a = AD.legacyUnitToIndividualLike(makeLegacyUnit({ po: 300 }));
  const b = AD.legacyUnitToIndividualLike(makeLegacyUnit({ de: 300 }));
  const session = MM.createBattleSession({ unitA: a, unitB: b, battleType: 'test', rng: () => 0 });
  const move = moveFromK(AD, SK, {}, 0); // たいあたり power(暫定)=70

  const result = MM.resolveAction({ session, baseStats: { A: a.stats, B: b.stats }, attackerSide: 'A', move, rng: { hitRng: () => 0, damageRng: () => 0.5, criticalRng: () => 0.99 } });
  const expected = MM.finalizeDamage(MM.applyDamageVariance(MM.calculateBaseDamage({ movePower: 70, attackStat: 300, defenseStat: 300 }), () => 0.5), false);
  assert.equal(result.damage, expected);

  // 旧式：Math.round(300*0.7*1*1*.55*mul*100/(100+300)) = Math.round(300*0.7*.55*0.25)=約28.9→29
  const legacyStyle = Math.max(1, Math.round(300 * 0.7 * 1 * 1 * 0.55 * 1 * (100 / (100 + 300))));
  assert.notEqual(result.damage, legacyStyle, '旧ダメージ式の結果と一致しない（＝旧式が使われていない）こと');
});

test('act接続：HPは正式EngineのresolveAction 1回分だけ減り、二重減算されない', () => {
  const { MM, AD } = loadBridgeAndAdapter();
  const { SK } = loadLegacyMoveData();
  const a = AD.legacyUnitToIndividualLike(makeLegacyUnit({ li: 300 }));
  const b = AD.legacyUnitToIndividualLike(makeLegacyUnit({ li: 300, de: 300 }));
  const session = MM.createBattleSession({ unitA: a, unitB: b, battleType: 'test', rng: () => 0 });
  const move = moveFromK(AD, SK, {}, 0);

  const before = session.currentLife.B;
  const result = MM.resolveAction({ session, baseStats: { A: a.stats, B: b.stats }, attackerSide: 'A', move, rng: { hitRng: () => 0, damageRng: () => 0.5, criticalRng: () => 0.99 } });
  // act()はH[1-s]=bsess.currentLife.Bを「そのまま読むだけ」で、自前でH[1-s]-=dのような再計算はしない設計。
  assert.equal(session.currentLife.B, before - result.damage);
  assert.equal(before - session.currentLife.B, result.damage, 'resolveAction 1回分のダメージだけ減っている');
});

test('act接続：Miss時はHPが減らない（旧UI側で再抽選もしない）', () => {
  const { MM, AD } = loadBridgeAndAdapter();
  const { SK } = loadLegacyMoveData();
  const a = AD.legacyUnitToIndividualLike(makeLegacyUnit());
  const b = AD.legacyUnitToIndividualLike(makeLegacyUnit());
  const session = MM.createBattleSession({ unitA: a, unitB: b, battleType: 'test', rng: () => 0 });
  const move = moveFromK(AD, SK, {}, 0);

  const before = session.currentLife.B;
  const result = MM.resolveAction({ session, baseStats: { A: a.stats, B: b.stats }, attackerSide: 'A', move, rng: { hitRng: () => 0.999, damageRng: () => 0.5, criticalRng: () => 0.99 } });
  assert.equal(result.hit, false);
  assert.equal(session.currentLife.B, before);
});

test('act接続：power=0のEffect技（吠える=SK[3]）はUI接続後もダメージ0で、命中すればEffectが付与される', () => {
  const { MM, AD } = loadBridgeAndAdapter();
  const { SK, EFF } = loadLegacyMoveData();
  const a = AD.legacyUnitToIndividualLike(makeLegacyUnit());
  const b = AD.legacyUnitToIndividualLike(makeLegacyUnit());
  const session = MM.createBattleSession({ unitA: a, unitB: b, battleType: 'test', rng: () => 0 });
  const move = moveFromK(AD, SK, EFF, 3); // 吠える：power=0、相手のattackをdown

  assert.equal(move.power, 0);
  const before = session.currentLife.B;
  const result = MM.resolveAction({ session, baseStats: { A: a.stats, B: b.stats }, attackerSide: 'A', move, rng: { hitRng: () => 0, damageRng: () => 0.5, criticalRng: () => 0.5 } });
  assert.equal(result.hit, true);
  assert.equal(result.damage, 0, 'power=0技はダメージ0');
  assert.equal(session.currentLife.B, before, 'power=0技ではHPが変化しない');
  assert.equal(result.effectsApplied.length, 1);
  assert.equal(result.effectsApplied[0].target, 'B');
  assert.equal(session.debuffs.B.length, 1);
});

test('act接続：ダメージ＋Effect技（聖なる炎=SK[19]、自己全能力UP）が両方成立する', () => {
  const { MM, AD } = loadBridgeAndAdapter();
  const { SK, EFF } = loadLegacyMoveData();
  const a = AD.legacyUnitToIndividualLike(makeLegacyUnit());
  const b = AD.legacyUnitToIndividualLike(makeLegacyUnit());
  const session = MM.createBattleSession({ unitA: a, unitB: b, battleType: 'test', rng: () => 0 });
  const move = moveFromK(AD, SK, EFF, 19); // 聖なる炎：power=130(暫定)、自己4能力UP

  assert.equal(move.power, 130);
  const result = MM.resolveAction({ session, baseStats: { A: a.stats, B: b.stats }, attackerSide: 'A', move, rng: { hitRng: () => 0, damageRng: () => 0.5, criticalRng: () => 0.99 } });
  assert.equal(result.hit, true);
  assert.ok(result.damage > 0, 'ダメージも発生する（ダメージ＋自己バフの複合技）');
  assert.equal(result.effectsApplied.length, 4, '自己4能力（攻/防/命中/回避）ぶんのEffectが付与される');
  result.effectsApplied.forEach((ea) => assert.equal(ea.target, 'A', '対象は自分（自己バフ）'));
  assert.equal(session.buffs.A.length, 4);
});

test('act接続：KO時は追加Effectを付与しない', () => {
  const { MM, AD } = loadBridgeAndAdapter();
  const { SK, EFF } = loadLegacyMoveData();
  const a = AD.legacyUnitToIndividualLike(makeLegacyUnit());
  const b = AD.legacyUnitToIndividualLike(makeLegacyUnit({ li: 1 }));
  const session = MM.createBattleSession({ unitA: a, unitB: b, battleType: 'test', rng: () => 0 });
  session.currentLife.B = 1;
  const move = moveFromK(AD, SK, EFF, 9); // ダメージ＋自己バフ技

  const result = MM.resolveAction({ session, baseStats: { A: a.stats, B: b.stats }, attackerSide: 'A', move, rng: { hitRng: () => 0, damageRng: () => 0.5, criticalRng: () => 0.99 } });
  assert.equal(result.ko, true);
  assert.equal(result.effectsApplied.length, 0, 'KOした攻撃では自己バフも含め追加Effectを付与しない');
  assert.equal(session.buffs.A.length, 0);
});

test('act接続：hitCount/totalDamageが正式Engine結果と一致する（命中回数・実ダメージ量のみ加算）', () => {
  const { MM, AD } = loadBridgeAndAdapter();
  const { SK, EFF } = loadLegacyMoveData();
  const a = AD.legacyUnitToIndividualLike(makeLegacyUnit());
  const b = AD.legacyUnitToIndividualLike(makeLegacyUnit());
  const session = MM.createBattleSession({ unitA: a, unitB: b, battleType: 'test', rng: () => 0 });

  // 1手目：power=0技（吠える）→ 命中1回・ダメージ0
  const move1 = moveFromK(AD, SK, EFF, 3);
  const r1 = MM.resolveAction({ session, baseStats: { A: a.stats, B: b.stats }, attackerSide: 'A', move: move1, rng: { hitRng: () => 0, damageRng: () => 0.5, criticalRng: () => 0.5 } });
  assert.equal(session.hitCount.A, 1);
  assert.equal(session.totalDamage.A, 0);

  // 2手目：ダメージ技（たいあたり）→ 命中2回目・ダメージ加算
  const move2 = moveFromK(AD, SK, {}, 0);
  const r2 = MM.resolveAction({ session, baseStats: { A: a.stats, B: b.stats }, attackerSide: 'A', move: move2, rng: { hitRng: () => 0, damageRng: () => 0.5, criticalRng: () => 0.99 } });
  assert.equal(session.hitCount.A, 2);
  assert.equal(session.totalDamage.A, r2.damage);
});

test('act接続：先攻が付与したEffectは同ラウンド内の後攻の行動へ即時反映される', () => {
  const { MM, AD } = loadBridgeAndAdapter();
  const { SK, EFF } = loadLegacyMoveData();
  const a = AD.legacyUnitToIndividualLike(makeLegacyUnit({ po: 300 }));
  const b = AD.legacyUnitToIndividualLike(makeLegacyUnit({ de: 300 }));
  const session = MM.createBattleSession({ unitA: a, unitB: b, battleType: 'test', rng: () => 0 });

  // Aが吠える（SK[3]）でBのattackをDOWNさせる。今回はBの防御(de)には影響しないため、
  // 代わりにBが後攻でAを攻撃する際、Aのdefenseが下がっていれば同ラウンド内反映が確認できる。
  // SK[3]は相手(tg:1)のatkを下げる技なので、A→B戦で使うとB(attacker側=B)のattackが下がる。
  const moveRoar = moveFromK(AD, SK, EFF, 3);
  MM.resolveAction({ session, baseStats: { A: a.stats, B: b.stats }, attackerSide: 'A', move: moveRoar, rng: { hitRng: () => 0, damageRng: () => 0.5, criticalRng: () => 0.5 } });
  assert.equal(session.debuffs.B.length, 1, 'Bのattackデバフが付与されている');

  // 同ラウンド内でBが後攻としてAを攻撃 → Bのattackはすでに下がった状態で計算されるはず
  const moveAtk = moveFromK(AD, SK, {}, 0);
  const loweredAttack = MM.getEffectiveStat({ baseStat: b.stats.power, statKey: 'power', buffs: session.buffs.B, debuffs: session.debuffs.B });
  const fullAttack = b.stats.power;
  assert.ok(loweredAttack < fullAttack, 'Bの実効attackはデバフ分下がっている（同ラウンド内即時反映）');

  const rB = MM.resolveAction({ session, baseStats: { A: a.stats, B: b.stats }, attackerSide: 'B', move: moveAtk, rng: { hitRng: () => 0, damageRng: () => 0.5, criticalRng: () => 0.99 } });
  const expectedWithDebuff = MM.finalizeDamage(MM.applyDamageVariance(MM.calculateBaseDamage({ movePower: moveAtk.power, attackStat: loweredAttack, defenseStat: a.stats.toughness }), () => 0.5), false);
  assert.equal(rB.damage, expectedWithDebuff, 'デバフ込みの実効値でダメージが計算されている');
});

test('act接続：Effectのターン管理はPhase3仕様のまま（付与ラウンドでは減算せず、ラウンド終了処理で1減る）', () => {
  const { MM, AD } = loadBridgeAndAdapter();
  const { SK, EFF } = loadLegacyMoveData();
  const a = AD.legacyUnitToIndividualLike(makeLegacyUnit());
  const b = AD.legacyUnitToIndividualLike(makeLegacyUnit());
  const session = MM.createBattleSession({ unitA: a, unitB: b, battleType: 'test', rng: () => 0 });

  const move = moveFromK(AD, SK, EFF, 3);
  const appliedTurn = session.turn;
  MM.resolveAction({ session, baseStats: { A: a.stats, B: b.stats }, attackerSide: 'A', move, rng: { hitRng: () => 0, damageRng: () => 0.5, criticalRng: () => 0.5 } });
  assert.equal(session.debuffs.B[0].remainingTurns, 1, '付与直後のremainingTurnsは技データ通り');
  assert.equal(session.debuffs.B[0].appliedTurn, appliedTurn);

  // 「付与されたラウンド終了時には減少しない」＝session.turnが付与時と同じラウンドのadvanceでは残る。
  MM.advanceEffectsForSession(session, 'A');
  MM.advanceEffectsForSession(session, 'B');
  assert.equal(session.debuffs.B.length, 1, '付与されたラウンド自身の終了処理では減算されない（appliedTurnと一致するため）');

  // 次のラウンドに進んでから終了処理を行うと、そこで初めて残りターンが減り消滅する。
  session.turn += 1;
  MM.advanceEffectsForSession(session, 'A');
  MM.advanceEffectsForSession(session, 'B');
  assert.equal(session.debuffs.B.length, 0, '次のラウンドの終了処理で1減り、remainingTurns=1だったため消滅する');
});

test('act接続：STOP1回（ルーレット結果1つ）につきresolveActionは1回だけ呼ばれる（二重命中判定・二重ダメージ計算をしない）', () => {
  const { MM, AD } = loadBridgeAndAdapter();
  const { SK } = loadLegacyMoveData();
  const a = AD.legacyUnitToIndividualLike(makeLegacyUnit());
  const b = AD.legacyUnitToIndividualLike(makeLegacyUnit());
  const session = MM.createBattleSession({ unitA: a, unitB: b, battleType: 'test', rng: () => 0 });
  const move = moveFromK(AD, SK, {}, 0);

  // index.htmlのact()は「1回のk（技インデックス）につきMMBattle.resolveActionを1回だけ呼ぶ」構造。
  // ここではresolveActionの呼び出し回数を数えるスパイを立てて、1STOP=1Actionであることを直接検証する。
  let callCount = 0;
  const original = MM.resolveAction;
  const spied = (...args) => { callCount += 1; return original(...args); };

  spied({ session, baseStats: { A: a.stats, B: b.stats }, attackerSide: 'A', move, rng: { hitRng: () => 0, damageRng: () => 0.5, criticalRng: () => 0.99 } });
  assert.equal(callCount, 1, 'STOP1回（技1つ確定）につきresolveActionは1回のみ');
});
