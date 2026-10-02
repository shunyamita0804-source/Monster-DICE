// =========================================================
// 商用品質化・第1次（2026-10-02）：Audio Manager（js/audio/audio-manager.js）・Game Feel（js/feel/game-feel.js）・
//  会話の見せ方・フィナ／ダンの役割・システム通知・Chapter のイベント（config.story）・Chapter の演出の流れ
//  GF-01〜GF-09（Node で動かす。画面の確認は tests/qa-e2e-feel.test.mjs）
// =========================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadEngine, lcg } from './chapter-sim.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const HTML = rd('index.html');
const j = (o) => JSON.parse(JSON.stringify(o));

/** 音の部品を Node で読む（Audio・localStorage は差し替え可能な偽物） */
function loadAudio({ Audio, store } = {}) {
  const w = { localStorage: store || { d: {}, getItem(k) { return this.d[k] ?? null; }, setItem(k, v) { this.d[k] = String(v); } } };
  if (Audio) w.Audio = Audio;
  new Function('window', rd('js/audio/audio-manager.js'))(w);
  return w;
}
/** 再生の記録だけをする偽の HTMLAudioElement。reject＝play() を拒否（自動再生の制約） */
function fakeAudio(log, reject = false) {
  return class { constructor(src) { this.src = src || ''; this.volume = 1; this.loop = false; this.paused = true; log.push(this); }
    play() { this.paused = false; return reject ? Promise.reject(new Error('NotAllowedError')) : Promise.resolve(); }
    pause() { this.paused = true; } load() {} removeAttribute(k) { if (k === 'src') this.src = ''; } addEventListener() {} };
}

test('GF-01：Audio Manager：音源が無くてもゲームは止まらない（場面・SE は何もしないで false）。場面と SE の名前は決まった一覧', () => {
  const { MMAUDIO: A } = loadAudio();
  for (const s of ['TITLE', 'TOWN', 'FACILITY', 'CHAPTER_1', 'CHAPTER_2', 'CHAPTER_3', 'CHAPTER_4', 'BATTLE', 'TOURNAMENT', 'RESULT', 'SPECIAL']) assert.ok(A.SCENES.includes(s), s);
  for (const e of ['UI_CONFIRM', 'UI_CANCEL', 'UI_ERROR', 'UI_OPEN', 'DICE_THROW', 'DICE_ROLL', 'DICE_LAND', 'STEP', 'TILE_STOP', 'STAT_UP', 'GOLD_GET', 'CHEST_OPEN', 'EVENT', 'WILD_ALERT', 'BATTLE_START', 'VICTORY', 'CHAPTER_START', 'CHAPTER_CLEAR', 'TOURNAMENT_START', 'UNLOCK']) assert.ok(A.SE.includes(e), e);
  assert.doesNotThrow(() => { A.scene('TOWN'); A.scene('CHAPTER_1'); A.se('DICE_LAND'); A.stopBgm(); A.unlock(); });
  assert.equal(A.se('STAT_UP'), false, '音源が無い SE は鳴らさない');
  assert.equal(A.scene('NOPE'), false); assert.equal(A.se('NOPE'), false);
  const s = A.status(); assert.deepEqual([s.files.bgm, s.files.se], [[], []], '正式な音源は登録していない（勝手に仮の音を入れない）');
});

test('GF-02：Audio Manager：同じ場面は二重に鳴らさない。ファイルが無い場面は今の合成音（legacy）。ミュート中の SE は鳴らさない', () => {
  const { MMAUDIO: A } = loadAudio(), calls = [], se = [];
  let muted = false;
  A.attachLegacy({ bgm: (s) => calls.push(s), sfx: (n) => { se.push(n); return true; }, muted: () => muted, setMuted: (on) => { muted = on; } });
  assert.equal(A.scene('TOWN'), true); assert.equal(A.scene('TOWN'), false, '同じ場面は何もしない'); assert.deepEqual(calls, ['TOWN']);
  A.scene('CHAPTER_1'); assert.deepEqual(calls, ['TOWN', 'CHAPTER_1'], '街から Chapter へ入ると Chapter の場面へ切り替える');
  assert.equal(A.status().source, 'legacy');
  assert.equal(A.se('DICE_LAND'), true); muted = true; assert.equal(A.se('DICE_LAND'), false); assert.deepEqual(se, ['DICE_LAND']);
  A.setMuted(false); assert.equal(muted, false);
});

test('GF-03：Audio Manager：正式な BGM ファイルを登録した場面はファイルで鳴る（クロスフェード・二重再生なし）。自動再生を拒否されても止まらず、最初の操作で再開。音量は 0〜1 で保存', async () => {
  const log = [], { MMAUDIO: A, localStorage: st } = loadAudio({ Audio: fakeAudio(log) });
  A.registerBgm('TOWN', './bgm/town.ogg'); A.registerBgm('CHAPTER_1', './bgm/ch1.ogg');
  assert.throws(() => A.registerBgm('NOPE', 'x.ogg'));
  A.scene('TOWN'); A.scene('TOWN'); assert.equal(log.length, 1, '同じ場面は1本だけ'); assert.equal(log[0].src, './bgm/town.ogg'); assert.equal(log[0].loop, true);
  A.scene('CHAPTER_1'); assert.equal(log.length, 2); await new Promise((ok) => setTimeout(ok, 900));
  assert.ok(log[0].paused, '前の曲はフェードアウトして止まる'); assert.ok(!log[1].paused && log[1].volume > 0.5, `次の曲はフェードイン（${log[1].volume}）`);
  A.setVolume('bgm', 3); A.setVolume('se', -1); assert.deepEqual(A.status().volume, { bgm: 1, se: 0 }); assert.deepEqual(JSON.parse(st.getItem('mmaudio')), { bgm: 1, se: 0 });
  const log2 = [], { MMAUDIO: B } = loadAudio({ Audio: fakeAudio(log2, true) });
  B.registerBgm('TITLE', './bgm/title.ogg'); assert.doesNotThrow(() => B.scene('TITLE')); await new Promise((ok) => setTimeout(ok, 20));
  assert.ok(B.status().errors.some((e) => /bgm-play/.test(e)), '拒否は記録するだけ'); assert.doesNotThrow(() => B.unlock());
});

test('GF-04：index.html の音：画面の bgm("…") は場面へ読み替え、Chapter は Chapter ごとの場面（CHAPTER_N）。ファイルの無い SE は今の合成音へ（無いものは鳴らさない）。fight()（Phase 6）は変えていない', () => {
  assert.match(HTML, /function bgm\(sc\)\{MMAUDIO\.scene\(BGM_SCENE\[sc\]\|\|"TOWN"\)\}/);
  assert.match(HTML, /MMAUDIO\.scene\("CHAPTER_"\+Math\.max\(1,Math\.min\(4,r\.ch\|0\)\)\);return chfBoard\(msg\)/, 'Chapter に入ると街の BGM のままにしない');
  assert.match(HTML, /MMAUDIO\.attachLegacy\(\{bgm:sc=>bgmLegacy\(LEGACY_BGM\[sc\]\|\|"town"\)/);
  const S = new Function(HTML.match(/const LEGACY_SE=\{[^}]*\};/)[0] + 'return LEGACY_SE;')();
  for (const k of ['STEP', 'TILE_STOP', 'CHAPTER_START', 'CHAPTER_CLEAR', 'TOURNAMENT_START']) assert.equal(S[k], undefined, `${k} は正式な音源が届くまで鳴らさない`);
  assert.doesNotMatch(HTML, /new Audio\(|\.mp3|\.ogg|\.wav/, '仮の音源ファイルを置いていない');
});

/** Game Feel を Node で読む（document なし＝入力の層は付かない） */
function loadFeel() { const w = {}; new Function('window', rd('js/audio/audio-manager.js'))(w); new Function('window', rd('js/feel/game-feel.js'))(w); return w; }
test('GF-05：Game Feel：出来事の重さ（LEVEL 0〜5）ごとに間と余韻を変える（全部同じ長さにしない）。出来事は SE とハプティクス（将来のネイティブ）へ。画面を移るボタンを onclick で見分ける', () => {
  const w = loadFeel(), F = w.MMFEEL, A = w.MMAUDIO, se = [];
  A.attachLegacy({ bgm() {}, sfx: (n) => { se.push(n); return true; }, muted: () => false });
  assert.deepEqual(Object.values(F.LEVEL), [0, 1, 2, 3, 4, 5]);
  assert.ok(F.hold(3) > F.hold(1) && F.hold(5) > F.hold(3), '報酬・大事な出来事ほど余韻が長い'); assert.equal(F.hold(0), 0, '軽い UI 操作は待たない');
  assert.ok(F.MOTION.press.scale >= 0.96 && F.MOTION.press.scale <= 0.985 && F.MOTION.press.ms <= 180, '押下はごく小さく短い');
  assert.ok(F.MOTION.nav.ms >= 80 && F.MOTION.nav.ms <= 160, '押してから移るまで 0.08〜0.16秒（遅く感じない）');
  const hp = []; F.registerHaptics((k, n) => hp.push([k, n]));
  F.emit('dice.land'); F.emit('stat.up'); F.emit('ui.confirm');
  assert.deepEqual(se, ['DICE_LAND', 'STAT_UP', 'UI_CONFIRM']); assert.deepEqual(hp, [['medium', 'dice.land'], ['success', 'stat.up']], 'ハプティクスは重要な出来事だけ（Web では登録しない限り何もしない）');
  assert.deepEqual(F.log(), ['dice.land', 'stat.up', 'ui.confirm']); assert.equal(F.emit('nope'), null);
  const el = (oc, ds = {}) => ({ disabled: false, dataset: ds, getAttribute: (k) => (k === 'onclick' ? oc : null) });
  assert.equal(F.navKind(el('market()')), 'facility'); assert.equal(F.navKind(el('lobby()')), 'back'); assert.equal(F.navKind(el("hall('st')")), 'facility');
  assert.equal(F.navKind(el('farm()')), 'facility'); assert.equal(F.navKind(el("farm('','a')")), null, '牧場の中のタブは画面の移動ではない');
  assert.equal(F.navKind(el('chfRoll()')), null, 'サイコロ・決定などその場の操作は待たせない'); assert.equal(F.navKind(el('x()', { nav: 'special' })), 'special');
});

test('GF-06：会話の見せ方の分類：MMNPC.talk の presentation（compact／standard／major）と kind。短い一言は小さな窓（背景を隠さない）。フィナの話は kind:fina、カレンは kind:npc、到着は重要イベント', () => {
  const NPC = rd('js/npc/npc.js');
  assert.match(NPC, /const pres = \['compact', 'major'\]\.includes\(opts\.presentation\) \? opts\.presentation : 'standard';/);
  assert.match(NPC, /ov\.dataset\.pres = pres; if \(opts\.kind\) ov\.dataset\.kind = String\(opts\.kind\);/);
  assert.match(HTML, /\.mmtalk\.mmtalk-compact\{background:linear-gradient\(rgba\(4,10,32,0\) 60%/, 'compact は暗幕をほぼ掛けない');
  assert.match(HTML, /\.mmtalk\.mmtalk-compact \.mmtalk-fig\.closeup\{height:min\(26vh,210px\)\}/);
  assert.match(HTML, /karenSay\(\[\{npc:"karen",expression:"smile",text:KAREN_AGAIN\[[^\]]*\]\}\],\{presentation:"compact"\}\)/, '2回目以降のカレンの一言は小さな窓');
  assert.match(HTML, /const FINA_PRES=\{raiseAgain:"compact",done:"major"\};/);
  assert.match(rd('js/chapter/field-view.js'), /if \(root\.MMNPC && !root\.MM_QA_NO_ARRIVAL && \(A\.talk \|\| \[\]\)\.length\) await MMNPC\.talk\(arrivalLines\(A\), \{ kind: 'event', presentation: 'major' \}\)/);
});

test('GF-07：フィナ／ダン／システム通知の役割：ダンはファームで送り出す側（Chapter に同行しない）。処理結果（「育成を放棄しました」など）は顔・名前の無いシステム通知（モンスターが話しているように見せない）', () => {
  const hl = HTML.slice(HTML.indexOf(' handoff:'), HTML.indexOf('\n', HTML.indexOf(' handoff:'))), D = { handoff: JSON.parse(hl.slice(hl.indexOf('['), hl.lastIndexOf('}],') + 2).replace(/([{,])(\w+):/g, '$1"$2":')) };
  assert.deepEqual(D.handoff.map((l) => [l.npc, l.text]), [['fina', 'ダン、この子と一緒に行ってくるね！'], ['dan', 'ああ。準備はできてるな。気をつけて行ってこい。']]);
  for (const l of D.handoff) assert.doesNotMatch(l.text, /任せて|お願い|一緒に行こう|ついて/, 'ダンが同行・預かるように読める言葉は使わない');
  const lobby = HTML.slice(HTML.indexOf('function lobby(msg,open){'), HTML.indexOf('\nfunction ', HTML.indexOf('function lobby(msg,open){') + 10));
  assert.match(lobby, /\?" fina":" sys"\}/); assert.match(lobby, /`<i class="dsys" aria-hidden="true"><\/i>`/); assert.doesNotMatch(lobby, /<div class="mon dm">\$\{svg\(0,0\)\}<\/div>/, 'システム通知にモンスターの絵を付けない');
  assert.match(HTML, /lobby\(`\$\{p11Esc\(r\.name\)\}の育成を放棄しました。`\)/, '育成放棄は lobby のシステム通知');
});

test('GF-08：Chapter のイベント（config.story）：データ駆動（本文は config だけ）。条件＝背景（通った背景を含む）・道・結果・種族・疲れ・確率。見たら「この個体のこの Chapter で1回」（storySeen）。セーブ・読み込みで残る', () => {
  const E = loadEngine(), { CH, P7, P8 } = E, cfg = CH.getConfig(1);
  assert.ok(Array.isArray(cfg.story) && cfg.story.length >= 10, `Chapter 1 のイベント ${cfg.story.length}`);
  for (const e of cfg.story) { assert.ok(e.id && ['start', 'land'].includes(e.trigger) && e.lines.length >= 1, e.id); for (const k of Object.keys(e.when || {})) assert.ok(CH.STORY_CONDS.includes(k), `${e.id}：${k}`); for (const l of e.lines) assert.ok(l.text.length <= 40, `${e.id}：短い一言`); }
  assert.equal(new Set(cfg.story.map((e) => e.id)).size, cfg.story.length);
  const code = rd('js/chapter/engine.js').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n'); for (const e of cfg.story) assert.ok(!code.includes(e.lines[0].text), 'エンジンに本文を書かない');
  const S = P8.newSave(); S.m = P8.initIndividual(S, { sp: 1, name: 'ガル', age: 0, span: 30, h: 0, rk: 0, fa: 0, st: 0, last: null, li: 80, po: 110, in: 110, hi: 90, ev: 90, de: 60, sk: [0, 1, 2, 3], eq: [0, 1, 2, 3, -1, -1] }); P7.ensureProg(S.m); P8.depart(S, S.m, lcg(3)); const m = S.m;
  assert.deepEqual(CH.storyEvents(m, 'start').map((e) => e.id), ['ch1_start']);
  CH.markStory(m, 'ch1_start'); assert.deepEqual(CH.storyEvents(m, 'start'), [], '1回だけ'); assert.deepEqual(m.raise.field.storySeen, ['ch1_start']);
  m.raise.node = 'p5_1'; assert.deepEqual(CH.storyEvents(m, 'land').map((e) => e.id), ['ch1_fork_near'], '分かれ道の近く');
  m.raise.node = 'p4_4'; assert.deepEqual(CH.storyEvents(m, 'land', { visitedFields: [4] }).map((e) => e.id), [], '今いる背景と今回通った背景だけ'); assert.deepEqual(CH.storyEvents(m, 'land', { visitedFields: [4, 5] }).map((e) => e.id), ['ch1_fork_near'], '今回の移動で 05 を通った');
  m.raise.node = 'p9_2'; m.raise.field.branch = 'bridge'; assert.deepEqual(CH.storyEvents(m, 'land', { species: 'gauru' }).map((e) => e.id).slice(0, 2), ['ch1_bridge_gauru', 'ch1_bridge'], '種族の一言が優先');
  assert.deepEqual(CH.storyEvents(m, 'land', { species: 'solamo' }).map((e) => e.id)[0], 'ch1_bridge');
  m.raise.node = 'p3_2'; m.raise.field.branch = null; assert.deepEqual(CH.storyEvents(m, 'land', { fx: { kind: 'battle', battleType: 'wild' } }).map((e) => e.id), ['ch1_first_wild']);
  m.raise.fatigue = 85; assert.ok(CH.storyEvents(m, 'land').some((e) => e.id === 'ch1_tired'));
  m.raise.node = 'p2_0'; m.raise.fatigue = 0; assert.deepEqual(CH.storyEvents(m, 'land', { fx: { kind: 'stat', tier: 'special' } }).map((e) => e.id), ['ch1_special_event']);
  const S2 = P8.migrateSave(j(S)); assert.deepEqual(S2.m.raise.field.storySeen, ['ch1_start'], 'セーブ・読み込みで残る'); assert.equal(CH.validField(S2.m.raise.field), true);
  assert.equal(CH.storyEvents(m, 'land', { chance: 1 }).length >= 0, true);
});

test('GF-09：Chapter の演出の流れ（field-view・サイコロ）：能力UP＝間→マス→モンスターの反応→枠と数値のカウントアップ→余韻、宝箱＝現れる→揺れて開く→報酬→所持金へ、野生＝静止→予兆→カットイン。通常マスは最小限。長さは MMFEEL の LEVEL の値', () => {
  const FV = rd('js/chapter/field-view.js'), DR = rd('js/chapter/dice-renderer.js');
  const res = FV.slice(FV.indexOf('  async function chfResolve() {'), FV.indexOf('  // ---- 同行者（フィナ）のリアクションの差し込み口'));
  const order = (src, ws) => { let i = -1; for (const w of ws) { const k = src.indexOf(w, i + 1); assert.ok(k > i, `${w} の順`); i = k; } };
  const stat = res.slice(res.indexOf("if (fx.kind === 'chstat')"), res.indexOf("} else if (fx.kind === 'treasure')"));
  order(stat, ['beatOf(3)', "tile.classList.add('hit')", "monReact('up')", "feel('stat.up'", 'holdOf(3', 'countUp(']);
  const chest = res.slice(res.indexOf("} else if (fx.kind === 'treasure')"), res.indexOf("} else if (fx.ev && fx.kind !== 'none')"));
  order(chest, ['beatOf(3)', "classList.remove('hid')", "classList.add('shake')", "feel('chest.open'", 'goldToHud(g0, g1']);
  assert.match(FV, /async function goldToHud\(from, to, srcEl\)/); assert.match(FV, /feel\('gold\.get'\); bump\(g\); await countUp\(b, from, to, 420\);/);
  const enc = FV.slice(FV.indexOf('  async function encounter(m, bt) {'), FV.indexOf('  /** 通常マス（LEVEL 1）'));
  order(enc, ['await wait(beatOf(4))', 'chf-rustle', 'chf-alert', "feel('wild.alert'", 'chf-cutin']);
  assert.match(res, /else touchTile\(tile\);/, '通常マスは足元が軽く光るだけ');
  assert.match(res, /await storyAt\(m, 'land', \{ fx \}\);/);
  assert.match(DR, /feel\('dice\.throw'\); landT = setTimeout\(\(\) => \{ ov\.classList\.add\('landed'\); feel\('dice\.land'\); \}, T \* 0\.6\);/);
  assert.match(DR, /stop\.classList\.add\('on', 'pop'\)/, '出目の面が弾む＝出目が分かる間');
  assert.doesNotMatch(res, /await wait\(1000\)|await wait\(1500\)/, '意味のない長い待ちを入れない');
});
