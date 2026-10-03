// =========================================================
// 第二段階（2026-10-04）：イベント基盤（MMEVT）・Chapter 1 のランダムイベント／2択／チュートリアル（config）・施設の NPC イベント（MMNPCE）・ライバル リュウ（MMRIVAL）
//  EV-01〜08。実物の MMP7・MMP8・MMCH を Node で動かす（画面は tests/qa-e2e-events.test.mjs）
// =========================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadEngine, lcg } from './chapter-sim.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const j = (o) => JSON.parse(JSON.stringify(o));
const HTML = rd('index.html');
function load() {
  const E = loadEngine();
  for (const f of ['js/chapter/events.js', 'js/npc/npc-events.js', 'js/phase8/rival.js']) new Function('window', rd(f))(E.w);
  return { ...E, EV: E.w.MMEVT, NE: E.w.MMNPCE, RV: E.w.MMRIVAL };
}
function mon(P7, P8, S, st = 100) { const m = P8.initIndividual(S, { sp: 0, name: 'テスト', age: 0, span: 30, h: 0, rk: 0, fa: 0, st: 0, last: null, li: st, po: st, in: st, hi: st, ev: st, de: st, sk: [0, 1, 2, 3], eq: [0, 1, 2, 3, -1, -1] }); P7.ensureProg(m); return m; }
function onCh1(seed = 7) { const E = load(); const { P7, P8 } = E; const S = P8.newSave(); S.m = mon(P7, P8, S); assert.equal(P8.depart(S, S.m, lcg(seed)).ok, true); return { ...E, S, m: S.m }; }
/** 指定の出来事（ev）のイベントマスに「止まった直後」の状態を作る */
function landOnEvent(E, ev) {
  const { CH, m } = E, g = CH.graphFor(m), A = m.raise.field.nodeAssignments, id = g.order.find((x) => A[x] && A[x].t === 'event' && !A[x].recovery);
  A[id] = { t: 'event', tier: 'normal', ev }; m.raise.node = id; m.raise.pend = { roll: 1, left: 0, stage: 'resolve' }; m.raise.turnsUsed = 3; return id;
}
const HANDLERS = ['fatigue', 'stat_random', 'stat_all', 'gold', 'gold_table', 'none', 'stat_tired'];

test('EV-01：Chapter 1 のイベント候補（eventPool）：形式が正しく（MMEVT.validatePool）、フィナの会話つきの短いランダムイベントが 12 種類以上・2択が 2 つ以上。効果は既存の仕組み（疲れ回復・能力 +5・少し疲れて能力・会話だけ）。大きな G・新アイテムは無い', () => {
  const { CH, EV } = load(), cfg = CH.getConfig(1), pool = cfg.eventPool;
  assert.deepEqual(EV.validatePool(pool), []);
  const withLines = pool.filter((e) => Array.isArray(e.lines) && e.lines.length >= 1), choice = pool.filter((e) => e.choices);
  assert.ok(withLines.length >= 12, `会話つき ${withLines.length}`); assert.ok(choice.length >= 2, `2択 ${choice.length}`);
  for (const e of withLines) { assert.ok(e.lines.length <= 4, `${e.id}：2〜4行まで`); for (const l of e.lines) assert.ok(l.text.length <= 48, `${e.id}：短い（${l.text.length}）`); }
  for (const e of pool) { if (e.handler) assert.ok(HANDLERS.includes(e.handler), `${e.id}：${e.handler}`); for (const c of e.choices || []) assert.ok(HANDLERS.includes(c.handler || 'none'), `${e.id}/${c.id}`); }
  for (const e of withLines) { const p = e.params || {}; if (e.handler === 'gold') assert.ok(p.amount <= 50, `${e.id}：G を大量に配らない`); if (['stat_random', 'stat_tired'].includes(e.handler)) assert.ok(p.amount <= 5, `${e.id}：+5 まで`); }
  for (const e of choice) for (const c of e.choices) assert.ok(c.label && c.lines && c.lines.length, `${e.id}/${c.id}：選んだあとの一言`);
  assert.ok(pool.some((e) => e.handler === 'none'), '会話だけの出来事（フレーバー）がある');
  assert.ok(pool.some((e) => e.handler === 'stat_tired'), '少し疲れて能力が上がる出来事がある');
});

test('EV-02：同じ Chapter で同じイベントを重複して割り当てない（engine の pickDistinct）。休憩（疲れ回復）も同じ。seed が同じなら同じ配置', () => {
  const { CH } = load(), cfg = CH.getConfig(1);
  for (let s = 1; s <= 200; s++) {
    const A = Object.values(CH.generateLayout(cfg, s).assign), ev = A.filter((a) => a.t === 'event' && !a.recovery).map((a) => a.ev), rec = A.filter((a) => a.recovery).map((a) => a.ev);
    assert.equal(new Set(ev).size, ev.length, `seed ${s}：イベントの重複 ${ev}`); assert.equal(new Set(rec).size, rec.length, `seed ${s}：休憩の重複 ${rec}`);
    assert.ok(ev.every((x) => cfg.eventPool.some((e) => e.id === x)), 'pool にある id');
  }
  assert.deepEqual(CH.generateLayout(cfg, 123), CH.generateLayout(cfg, 123));
  const seen = new Set(); for (let s = 1; s <= 300; s++) for (const a of Object.values(CH.generateLayout(cfg, s).assign)) if (a.t === 'event') seen.add(a.ev);
  assert.ok(seen.size >= 16, `300 回の配置で出たイベントの種類 ${seen.size}`);
});

test('EV-03：2択の出来事：止まった時点では何も起こさず・使った印も付けず・選択肢だけを返す（stage は resolve のまま＝セーブ・再読み込みでも同じ選択肢）。選ぶと選んだ効果だけ1回・ターンが終わる', () => {
  const E = onCh1(11), { P8, S, m, CH } = E, id = landOnEvent(E, 'old_grounds');
  m.raise.fatigue = 40;
  const r = P8.resolveLanding(S, m, lcg(1));
  assert.equal(r.ok, true); assert.equal(r.wait, true); assert.equal(r.choice, true); assert.equal(r.fx.kind, 'choice'); assert.equal(r.fx.ev, 'old_grounds');
  assert.deepEqual(r.fx.options.map((o) => o.id), ['train', 'rest']); assert.equal(r.fx.lines.length, 1);
  assert.equal(m.raise.pend.stage, 'resolve'); assert.equal(m.raise.pend.fx.kind, 'choice'); assert.ok(!m.raise.field.consumedEvents.includes(id), '使った印はまだ付かない');
  assert.equal(CH.fatigue(m), 40, '効果はまだ');
  // セーブ → 読み込み：同じ途中状態（pend は正しい形のまま残る）
  const S2 = P8.migrateSave(j(S)); assert.deepEqual(S2.m.raise.pend, m.raise.pend); assert.equal(P8.boardPhase(S2.m), 'resolve');
  const r2 = P8.resolveLanding(S2, S2.m, lcg(1)); assert.equal(r2.fx.kind, 'choice', '再読み込みでも同じ選択肢');
  // 無い選択肢は拒否、選んだら効果とターン終了
  assert.deepEqual(P8.resolveChoice(S, m, 'nope'), { ok: false });
  const c = P8.resolveChoice(S, m, 'rest', lcg(1));
  assert.equal(c.ok, true); assert.equal(c.fx.kind, 'fatigue'); assert.equal(c.fx.choice, 'rest'); assert.equal(c.fx.recovered, 8); assert.equal(CH.fatigue(m), 32);
  assert.equal(c.fx.lines[0].text, 'うん、今日は休もう。無理しないのも大事。'); assert.equal(m.raise.pend, null); assert.ok(m.raise.field.consumedEvents.includes(id));
  assert.deepEqual(P8.resolveChoice(S, m, 'rest'), { ok: false }, '二度は選べない');
  // 「少し鍛える」＝能力 +5・疲れ +6
  const E2 = onCh1(12), id2 = landOnEvent(E2, 'old_grounds'); E2.m.raise.fatigue = 10; E2.P8.resolveLanding(E2.S, E2.m, lcg(1));
  const before = j(E2.m), t = E2.P8.resolveChoice(E2.S, E2.m, 'train', lcg(3));
  assert.equal(t.fx.kind, 'stat'); assert.equal(t.fx.amount, 5); assert.equal(E2.m[t.fx.key], before[t.fx.key] + 5); assert.equal(t.fx.fatigueAdded, 6); assert.equal(E2.CH.fatigue(E2.m), 16); assert.ok(E2.m.raise.field.consumedEvents.includes(id2));
  // 選択肢の無い出来事は従来どおりその場で効果（会話の行つき）
  const E3 = onCh1(13), id3 = landOnEvent(E3, 'tailwind'); E3.m.raise.fatigue = 20; const r3 = E3.P8.resolveLanding(E3.S, E3.m, lcg(1));
  assert.equal(r3.fx.kind, 'fatigue'); assert.equal(r3.fx.recovered, 5); assert.equal(r3.fx.lines.length, 2); assert.equal(E3.m.raise.pend, null); assert.ok(E3.m.raise.field.consumedEvents.includes(id3));
  const E4 = onCh1(14); landOnEvent(E4, 'distant_cry'); const r4 = E4.P8.resolveLanding(E4.S, E4.m, lcg(1)); assert.equal(r4.fx.kind, 'flavor'); assert.equal(r4.fx.lines.length, 2);
});

test('EV-04：チュートリアル（config.story の scope "save"）：止まったマスの種類ごとに1回（能力・イベント・休憩・宝箱・野生・ライバル・分かれ道・ゴール）。見た記録は S.npcFlags.story（セーブ単位）で、個体や Chapter が変わっても二度出ない。記録が渡されないときは出さない', () => {
  const E = onCh1(21), { CH, m } = E, cfg = CH.getConfig(1), tut = cfg.story.filter((e) => e.scope === 'save');
  assert.deepEqual(tut.map((e) => e.id).sort(), ['tut_branch', 'tut_event', 'tut_goal', 'tut_rest', 'tut_rival', 'tut_stat', 'tut_treasure', 'tut_wild']);
  for (const e of tut) { assert.equal(e.presentation, 'talk'); assert.ok(e.lines.length >= 2 && e.lines.length <= 3, e.id); assert.ok(e.priority >= 50, e.id); }
  const flags = {};
  const at = (trigger, ctx) => CH.storyEvents(m, trigger, { ...ctx, flags })[0];
  assert.equal(at('land', { fx: { kind: 'chstat', key: 'po', amount: 5 } }).id, 'tut_stat');
  CH.markStory(m, 'tut_stat', flags); assert.deepEqual(flags.story, ['tut_stat']); assert.notEqual((at('land', { fx: { kind: 'chstat' } }) || {}).id, 'tut_stat', '二度出ない');
  assert.ok(!(m.raise.field.storySeen || []).includes('tut_stat'), 'チュートリアルは個体の記録には入れない');
  assert.equal(at('land', { fx: { kind: 'fatigue', ev: 'tailwind', recovered: 5 } }).id, 'tut_event', '疲れ回復でも休憩マスでなければイベント');
  assert.equal(at('land', { fx: { kind: 'fatigue', ev: 'shade', recovered: 10 } }).id, 'tut_rest', '休憩マス（recovery のイベント）');
  assert.equal(at('land', { fx: { kind: 'flavor', ev: 'distant_cry' } }).id, 'tut_event');
  assert.equal(at('land', { fx: { kind: 'treasure', tier: 'normal' } }).id, 'tut_treasure');
  assert.equal(at('land', { fx: { kind: 'battle', battleType: 'wild' } }).id, 'tut_wild'); assert.equal(at('land', { fx: { kind: 'battle', battleType: 'rival' } }).id, 'tut_rival');
  assert.equal(at('branch', {}).id, 'tut_branch'); assert.equal(at('land', { fx: { kind: 'none' }, goal: true }).id, 'tut_goal');
  assert.equal(at('land', { fx: { kind: 'none' } }), undefined, '通常マスでは何も出ない');
  assert.notEqual((CH.storyEvents(m, 'land', { fx: { kind: 'chstat' } })[0] || {}).id, 'tut_stat', '記録（flags）が無い呼び方ではチュートリアルを出さない');
  // 旧い story（個体の Chapter ごと）はそのまま
  const E2 = onCh1(22); E2.m.raise.node = 'p1_1'; assert.equal(E2.CH.storyEvents(E2.m, 'start', { flags: {} })[0].id, 'ch1_start'); E2.CH.markStory(E2.m, 'ch1_start', {}); assert.deepEqual(E2.m.raise.field.storySeen, ['ch1_start']);
});

test('EV-05：施設の NPC イベント（MMNPCE）：初回訪問は5施設（市場・牧場・研究所・闘技場・ファーム）でフィナ ↔ NPC。カレンは「〜わよ」「〜だわ」を使わない。再訪は進行状態に合う一言が優先、ふつうの一言は確率、直前と同じ文は避ける', () => {
  const { NE } = load();
  assert.deepEqual(NE.FACILITIES, ['market', 'ranch', 'lab', 'arena', 'farm']);
  for (const f of NE.FACILITIES) { const L = NE.first(f); assert.ok(L.length >= 2 && L.length <= 4, f); assert.ok(L.some((l) => l.npc === 'fina') && L.some((l) => l.npc !== 'fina'), `${f}：フィナと NPC`); for (const l of L) assert.ok(l.expression && l.text && l.side, `${f}：行の形`); }
  assert.deepEqual(NE.first('market').map((l) => l.npc), ['fina', 'karen', 'fina', 'karen']); assert.deepEqual(NE.first('farm').map((l) => l.npc), ['dan', 'fina']);
  const karen = [...NE.first('market').filter((l) => l.npc === 'karen').map((l) => l.text), ...NE.REVISIT.market.lines.map((l) => l.text)];
  for (const t of karen) assert.doesNotMatch(t, /わよ|だわ/, t);
  assert.ok(!NE.first('lab').some((l) => /特殊復元/.test(l.text)), '特殊復元を説明しない');
  // 再訪：条件の一言が優先（確率に関係なく出る）
  assert.equal(NE.revisit('market', { hasMon: false }, () => 0.99).id, 'm_none');
  assert.equal(NE.revisit('market', { hasMon: true, full: true }, () => 0.99).id, 'm_full');
  assert.equal(NE.revisit('market', { hasMon: true, gold: 1000 }, () => 0.99), null, 'ふつうの一言は確率（0.6）で出ない');
  assert.ok(['m_again', 'm_new', 'm_which'].includes(NE.revisit('market', { hasMon: true, gold: 1000 }, () => 0.1).id));
  for (let i = 0; i < 30; i++) { const r = NE.revisit('market', { hasMon: true, gold: 1000, last: 'm_again' }, lcg(i)); if (r) assert.notEqual(r.id, 'm_again', '直前と同じ一言は避ける'); }
  assert.equal(NE.revisit('farm', { fatigue: 80, state: 'farm' }, () => 0.5).id, 'f_tired'); assert.equal(NE.revisit('farm', { gateBlocked: true }, () => 0.5).id, 'f_gate');
  assert.equal(NE.revisit('ranch', { box: 0 }, () => 0.5).id, 'r_empty'); assert.equal(NE.revisit('lab', { canFuse: true }, () => 0.5).id, 'l_fuse');
  assert.ok(NE.revisit('arena', {}, () => 0.5), 'ヴァルガスは必ず一言'); for (const l of NE.REVISIT.arena.lines) assert.doesNotMatch(l.text, /ランク[A-Z]?.*(で|なら|すれば)開放|条件/, '開放条件を断言しない');
  assert.equal(NE.revisit('nowhere', {}), null);
});

test('EV-06：Chapter の帰還イベント（ダン＋フィナ）：Chapter 1〜4 で文面が違う。結果（優勝・敗退・間に合わなかった）で1行足し、次の Chapter があれば噂を1回だけ添える（固有名詞は作らない）', () => {
  const { NE } = load();
  const firsts = [1, 2, 3, 4].map((c) => NE.returnEvent(c, {}).lines[0].text); assert.equal(new Set(firsts).size, 4, '同じ文章を使い回さない');
  for (const c of [1, 2, 3, 4]) { const L = NE.returnEvent(c, {}).lines; assert.equal(L.length, 3); assert.deepEqual(L.map((l) => l.npc), ['fina', 'dan', 'fina']); }
  assert.equal(NE.returnEvent(5, {}), null);
  assert.match(NE.returnEvent(1, { won: true, reachedGoal: true }).lines[2].text, /大会でも勝って/);
  assert.match(NE.returnEvent(1, { placed: 3, reachedGoal: true }).lines[2].text, /惜しかった/);
  assert.match(NE.returnEvent(1, { reachedGoal: false }).lines[2].text, /間に合わなかった/);
  assert.equal(NE.returnEvent(1, { declined: true, placed: null, reachedGoal: true }).lines.length, 3, '辞退は何も足さない');
  const r = NE.returnEvent(1, { rumor: true, nextName: '潮風の海岸' }); assert.equal(r.rumor, true); assert.equal(r.lines.length, 6); assert.match(r.lines[3].text, /「潮風の海岸」/); assert.match(r.lines[4].text, /珍しいモンスターを見た者がいるらしい/);
  assert.equal(NE.returnEvent(1, { rumor: false, nextName: '潮風の海岸' }).rumor, false); assert.equal(NE.returnEvent(1, { rumor: true, nextName: null }).lines.length, 3, '次が無ければ噂なし');
});

test('EV-07：ライバル リュウ（MMRIVAL）：名前は正式に「リュウ」・相棒は未確定（null）。強さ＝今の個体の平均能力に最も近いランク（fight() の表 E 70〜S 300）を Chapter ごとの下限・上限で挟む。値は CONFIG の1か所', () => {
  const E = onCh1(31), { RV, P7, P8, S } = E;
  assert.equal(RV.CONFIG.name, 'リュウ'); assert.equal(RV.CONFIG.partner, null);
  const at = (st, ch) => { const m = mon(P7, P8, S, st); m.raise = { ...m.raise, ch }; return RV.rankFor(m); };
  assert.equal(at(100, 1), 1, '100 → 90（D）'); assert.equal(at(70, 1), 0); assert.equal(at(140, 1), 2); assert.equal(at(300, 1), 3, 'Chapter 1 の上限 B'); assert.equal(at(50, 3), 2, 'Chapter 3 の下限 C'); assert.equal(at(300, 4), 5);
  assert.equal(RV.rankFor(mon(P7, P8, S, 100), { strength: { factor: 1.5 } }), 3, '倍率を変えれば変わる（150 → 160＝B。下限・上限の無い設定）');
  assert.deepEqual(RV.statsFor(mon(P7, P8, S, 100)), { li: 90, po: 90, in: 90, hi: 90, ev: 90, de: 90 });
  for (let st = 0; st <= 999; st += 37) for (let c = 1; c <= 4; c++) { const r = at(st, c); assert.ok(r >= 0 && r <= 5); }
  const cfg = E.CH.getConfig(1).battleTypes.rival; assert.equal(cfg.name, 'リュウ'); assert.match(cfg.encounter, /リュウ/); assert.match(cfg.note, /同じくらいの強さ/);
  assert.match(HTML, /rk=bt=="rival"&&window\.MMRIVAL\?MMRIVAL\.rankFor\(m\):MMP8\.practiceRank\(m\)/, 'ライバルのマスのバトルだけ MMRIVAL の強さ');
});

test('EV-08：つなぎ（静的）：index.html は events.js・npc-events.js・rival.js を読み込み、施設の入口で npcFirst（市場・牧場・研究所・闘技場・ファーム）とファームの帰還 farmReturn を呼ぶ。画面側は 2択（choiceTalk）と出来事の会話（eventLines）を持つ。見た記録はセーブ v6 の任意項目（npcFlags・raise.evSeen）', () => {
  for (const f of ['./js/chapter/events.js', './js/npc/npc-events.js', './js/phase8/rival.js']) assert.ok(HTML.includes(`<script src="${f}"></script>`), f);
  assert.match(HTML, /function karenIntro\(\)\{const f=finaFlags\(\);if\(npcFirst\("market"/); assert.match(HTML, /if\(tab!=="book"\)setTimeout\(\(\)=>npcFirst\("lab"\),0\)/);
  assert.match(HTML, /function townArena\(\)\{townLock\("闘技場は、まだ利用できません。"\);if\(!npcFirst\("arena"\)\)vgSay\(\)\}/);
  assert.match(HTML, /if\(st=="none"\)npcFirst\("farm"\);else if\(st=="farm"\)farmReturn\(m\)/); assert.match(HTML, /npcLine\("ranch",NICK_TALK\.ranch\)/);
  assert.match(HTML, /function npcFirst\(fac,after\)\{if\(window\.MM_QA_NO_NPC\|\|!window\.MMNPCE\|\|!window\.MMNPC\)return false;/, '自動テストでは出さない');
  assert.match(HTML, /F\[fac\]=1;if\(fac=="market"\)finaFlags\(\)\.karenIntro=1;save\(\);/, '先に「表示済み」を保存');
  assert.match(HTML, /seen\.push\(key\);if\(ev\.rumor\)seen\.push\("rumor"\);save\(\);MMNPC\.talk\(ev\.lines,\{kind:"event",presentation:"major"\}\)/, '帰還は重要な会話（major）');
  const FV = rd('js/chapter/field-view.js'); assert.match(FV, /async function choiceTalk\(fx\)/); assert.match(FV, /async function eventLines\(fx\)/); assert.match(FV, /if \(fx\.kind === 'choice'\) \{/); assert.match(FV, /storyAt\(m, 'branch'\)/);
  assert.match(rd('tests/e2e/harness.mjs'), /window\.MM_QA_NO_NPC = true/);
  assert.match(rd('js/phase8/raising.js'), /if \(fx\.kind === 'choice'\) return \{ ok: true, fx, wait: true, choice: true \};/);
  { const k = HTML.lastIndexOf('<script>'), body = HTML.slice(k + 8, HTML.indexOf('</script>', k)); assert.doesNotThrow(() => new Function(body), 'index.html の本体のインラインスクリプトは構文エラーなし（行の途中の // コメントがコードを飲み込んでいない）'); }
  const E = load(); assert.equal(typeof E.P8.resolveChoice, 'function'); assert.equal(typeof E.CH.resolveChoice, 'function'); assert.ok(E.EV.EVENT_FIELDS.includes('saveFlag') || E.EV.EVENT_FIELDS.includes('scope'));
});
