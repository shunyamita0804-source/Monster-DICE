// =========================================================
// Phase 7：育成進行の基盤（window.MMP7）
//  ・セーブv5（v4→v5マイグレーション）
//  ・Chapter登録／ファーム帰還状態
//  ・修行（15マス一本道ボード）／修行チケット
//  ・種族ごとの10技（初期4・ちから1・かしこさ1・命中1・回避1・丈夫さ2）登録構造
//  ・ランククリア実績（Bランク→丈夫さ修行解放、Sランク初回→バッグ6枠）
//  ・通常合体の技継承（初期4＋親の追加技から1つ）
//  ・バッグ／保管庫／アイテム屋の基盤
//
//  このファイルは「状態の計算・検証」だけを行う純粋ロジック層です。
//  画面描画・SE・Battle Engineには一切触れません（Phase 6部分は無変更）。
//
//  【未確定のため、ここでは値を決めていないもの】
//   ・正式Chapterマップ（registerChapterBoard で後から登録）
//   ・正式10技（registerMoveset で後から登録。本番は未登録）
//   ・アイテム一覧／価格（registerItem / setShopCatalog で後から登録。本番は空）
//   ・保管庫容量（vaultCap = null ＝未設定）
//   ・修行チケットの入手方法（本番では配布しない。初期値0）
//   ・バッグ満杯時の処理（setBagFullHandler で後から差し込む。本番は未設定）
//   ・合体専用種（addFusionSpeciesResolver で後から登録。本番は未登録）
// =========================================================
(function (root) {
  'use strict';

  const SAVE_VERSION = 5;

  // ---------- ランク ----------
  const RANK_COUNT = 6;          // E, D, C, B, A, S（index.html の RN と同じ並び）
  const RANK_B = 3;
  const RANK_S = 5;

  // ---------- バッグ ----------
  const BAG_BASE_CAP = 5;
  const BAG_UNLOCKED_CAP = 6;    // Sランク初回クリアで永久解放。これ以上は増えない

  // ---------- 修行 ----------
  const TRAIN_KINDS = Object.freeze(['po', 'in', 'hi', 'ev', 'de']);
  const TRAIN_LEN = 15;          // 15マス（スタート地点0は含まない。15マス目がゴール）
  const TOUGH_MAX_CLEARS = 2;
  // 1個体あたりの修行クリア上限（ちから・かしこさ・命中・回避は各1回、丈夫さは必殺技2つのため2回。合計6回）
  const TRAIN_MAX = Object.freeze({ po: 1, in: 1, hi: 1, ev: 1, de: TOUGH_MAX_CLEARS });
  const DICE_MIN = 1;
  const DICE_MAX = 3;
  // 1〜14マス目の種類（15マス目はゴール）。n=何も起きない / s=対応能力の小上昇 / l=ライフの小上昇
  // ※暫定値（通常マス多め）。正式な配置が決まったらここを差し替える。
  const TRAIN_TEMPLATE = Object.freeze(['n', 's', 'n', 'l', 'n', 'n', 's', 'n', 'l', 'n', 's', 'n', 'n', 'l']);
  // ※暫定値（通常Chapterの能力マス +5〜7 より控えめ）。
  const TRAIN_GAIN = Object.freeze({ stat: Object.freeze([2, 3]), life: Object.freeze([2, 3]) });
  const STAT_MAX = 999;

  // ---------- 技（種族ごとの10枠） ----------
  const MOVESET_SLOTS = Object.freeze({ initial: 4, po: 1, in: 1, hi: 1, ev: 1, de: 2 });

  // ---------- Chapter ----------
  const CHAPTER_DEFS = Object.freeze([
    Object.freeze({ no: 1, name: 'はじまりの草原' }),
    Object.freeze({ no: 2, name: '海岸地方' }),
    Object.freeze({ no: 3, name: '空のエリア' }),
    Object.freeze({ no: 4, name: '火山地方' }),
  ]);
  const CHAPTER_COUNT = CHAPTER_DEFS.length;
  // 通常Chapterにターン制限はない（約30マス規模のボード、止まったマスだけ効果発生）。
  // ここにターン上限のフィールドは意図的に持たせない。

  const STATUS_FARM = 'farm';    // Chapter外（ファームで準備中）
  const STATUS_BOARD = 'board';  // Chapter進行中

  // =========================================================
  // 内部レジストリ（本番はすべて空。後のPhaseで登録する）
  // =========================================================
  const chapterBoards = {};      // no -> { track, provisional, note }
  const movesets = {};           // speciesId -> 10枠
  const itemDefs = {};           // itemId -> { id, name, price, sellPrice }
  let shopCatalog = [];          // itemId[]
  const fusionSpeciesResolvers = [];
  let legacyHooks = { initialMoves: () => [], specialMoves: () => [] };

  const clone = (o) => JSON.parse(JSON.stringify(o));
  const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);

  // =========================================================
  // 旧データ参照フック（index.html の SP / DJP を渡す）
  // =========================================================
  function configureLegacy(hooks) {
    legacyHooks = { ...legacyHooks, ...(hooks || {}) };
  }

  // =========================================================
  // 個体の進行データ（m.prog）
  // =========================================================
  function newProg() {
    return {
      rankClr: Array(RANK_COUNT).fill(false),                 // この個体のランク大会クリア実績
      train: { po: 0, in: 0, hi: 0, ev: 0, de: 0 },           // 修行ごとのクリア回数
      learnSrc: {},                                           // 技ID -> 'init' | 'po' | 'in' | 'hi' | 'ev' | 'de' | 'inherit'
    };
  }
  function ensureProg(m) {
    if (!m) return m;
    if (!isObj(m.prog)) m.prog = newProg();
    const p = m.prog;
    if (!Array.isArray(p.rankClr)) p.rankClr = Array(RANK_COUNT).fill(false);
    while (p.rankClr.length < RANK_COUNT) p.rankClr.push(false);
    if (!isObj(p.train)) p.train = {};
    for (const k of TRAIN_KINDS) if (!Number.isInteger(p.train[k]) || p.train[k] < 0) p.train[k] = 0;
    if (!isObj(p.learnSrc)) p.learnSrc = {};
    return m;
  }
  /** 新規個体用：初期技の出自を記録した prog を付ける */
  function initProgForNew(m) {
    m.prog = newProg();
    for (const k of m.sk || []) m.prog.learnSrc[k] = 'init';
    return m;
  }

  // =========================================================
  // セーブ v5
  // =========================================================
  function defaultV5Fields() {
    return {
      chap: { status: STATUS_FARM, clearedMax: 0, cleared: [] },
      inv: { bag: [], bagCapUnlocked: false, vault: [], vaultCap: null },
      trainTix: 0,
      trainRun: null,
      rankRec: { cleared: Array(RANK_COUNT).fill(false) },
    };
  }

  function newSave() {
    return { v: SAVE_VERSION, y: 1000, mo: 4, wk: 1, g: 1000, box: [], m: null, ...defaultV5Fields() };
  }

  function monstersOf(S) {
    return [S.m, ...(Array.isArray(S.box) ? S.box : [])].filter(Boolean);
  }

  /** v5 の欠けたフィールドを補う（既存の値は変更しない） */
  function normalizeV5(S) {
    const d = defaultV5Fields();
    if (!isObj(S.chap)) S.chap = d.chap;
    if (S.chap.status !== STATUS_FARM && S.chap.status !== STATUS_BOARD) S.chap.status = STATUS_FARM;
    if (!Number.isInteger(S.chap.clearedMax) || S.chap.clearedMax < 0) S.chap.clearedMax = 0;
    if (!Array.isArray(S.chap.cleared)) S.chap.cleared = [];
    if (!isObj(S.inv)) S.inv = d.inv;
    if (!Array.isArray(S.inv.bag)) S.inv.bag = [];
    if (!Array.isArray(S.inv.vault)) S.inv.vault = [];
    if (typeof S.inv.bagCapUnlocked !== 'boolean') S.inv.bagCapUnlocked = false;
    if (!('vaultCap' in S.inv) || !(S.inv.vaultCap === null || (Number.isInteger(S.inv.vaultCap) && S.inv.vaultCap >= 0))) S.inv.vaultCap = null;
    if (!Number.isInteger(S.trainTix) || S.trainTix < 0) S.trainTix = 0;
    if (S.trainRun !== null && !(isObj(S.trainRun) && TRAIN_KINDS.includes(S.trainRun.kind))) S.trainRun = null;
    if (!isObj(S.rankRec) || !Array.isArray(S.rankRec.cleared)) S.rankRec = d.rankRec;
    while (S.rankRec.cleared.length < RANK_COUNT) S.rankRec.cleared.push(false);
    if (!Array.isArray(S.box)) S.box = [];
    monstersOf(S).forEach(ensureProg);
    return S;
  }

  /**
   * セーブデータを v5 に変換する。元のオブジェクトは変更しない（新しいオブジェクトを返す）。
   * v4 → v5：既存フィールドはそのまま保持し、新規フィールドを追加する。
   * 読めないデータ・未知のバージョンは null。
   */
  function migrateSave(raw) {
    if (!isObj(raw)) return null;
    if (raw.v !== 4 && raw.v !== 5) return null;
    if ('box' in raw && !Array.isArray(raw.box)) return null;
    const S = clone(raw);
    if (!Array.isArray(S.box)) S.box = [];

    if (S.v === 4) {
      const d = defaultV5Fields();
      // --- Chapter：旧 S.board.ch は「現在のChapter番号」。ch-1 章までクリア済みとみなす ---
      const bd = isObj(S.board) ? S.board : null;
      const ch = bd && Number.isInteger(bd.ch) && bd.ch >= 1 ? bd.ch : 1;
      const clearedMax = Math.min(CHAPTER_COUNT, ch - 1);
      // 旧版はChapterクリア後にスタート地点("s")へ戻るだけだった。スタート地点以外にいれば進行中とみなす。
      const inProgress = !!(bd && bd.node && bd.node !== 's');
      d.chap = {
        status: inProgress ? STATUS_BOARD : STATUS_FARM,
        clearedMax,
        cleared: Array.from({ length: clearedMax }, (_, i) => i + 1),
      };
      // --- ランク実績（セーブ全体）：旧 S.br は「勝ったことのある最高ランク」 ---
      const br = Number.isInteger(S.br) ? S.br : -1;
      d.rankRec.cleared = Array.from({ length: RANK_COUNT }, (_, i) => i <= br);
      // --- バッグ6枠：旧セーブでSランク大会に勝っていれば解放済みとする ---
      d.inv.bagCapUnlocked = br >= RANK_S;
      Object.assign(S, d);
      // --- 個体：旧 rk は「勝ってランクアップした回数」。rk未満のランクはクリア済みとみなす ---
      monstersOf(S).forEach((m) => {
        m.prog = newProg();
        const rk = Number.isInteger(m.rk) ? m.rk : 0;
        for (let i = 0; i < Math.min(rk, RANK_COUNT); i++) m.prog.rankClr[i] = true;
      });
      S.migratedFrom = 4;
      S.v = SAVE_VERSION;
    }
    return normalizeV5(S);
  }

  // =========================================================
  // Chapter
  // =========================================================
  function getChapterDef(no) { return CHAPTER_DEFS.find((c) => c.no === no) || null; }
  function registerChapterBoard(no, track, meta) {
    if (!getChapterDef(no)) throw new Error(`存在しないChapterです：${no}`);
    if (!isObj(track) || !isObj(track.nodes) || !isObj(track.conn) || !track.start || !track.nodes[track.start]) throw new Error('ボードデータが不正です');
    chapterBoards[no] = { track, provisional: !!(meta && meta.provisional), note: (meta && meta.note) || '' };
  }
  function getChapterBoard(no) { return chapterBoards[no] || null; }
  function isChapterPlayable(no) { return !!chapterBoards[no]; }
  function chapterStatus(S) { return S.chap.status; }
  /** 次に出発するChapter番号（全Chapterクリア済みなら null） */
  function nextChapterNo(S) {
    const n = S.chap.clearedMax + 1;
    return n <= CHAPTER_COUNT ? n : null;
  }
  function canDepart(S, no) {
    if (S.chap.status !== STATUS_FARM) return { ok: false, reason: 'not_at_farm' };
    if (S.trainRun) return { ok: false, reason: 'training' };
    if (no !== nextChapterNo(S)) return { ok: false, reason: 'not_next' };
    if (!isChapterPlayable(no)) return { ok: false, reason: 'no_map' };
    return { ok: true };
  }
  function departChapter(S, no) {
    const c = canDepart(S, no);
    if (!c.ok) return c;
    const b = getChapterBoard(no);
    S.board = { ch: no, node: b.track.start, done: false };
    S.chap.status = STATUS_BOARD;
    return { ok: true };
  }
  /** Chapter章末大会に勝利：ファームへ帰還状態にする（次Chapterへは直行しない） */
  function clearChapter(S, no) {
    if (!S.chap.cleared.includes(no)) S.chap.cleared.push(no);
    S.chap.clearedMax = Math.max(S.chap.clearedMax, no);
    S.chap.status = STATUS_FARM;
    const nx = nextChapterNo(S);
    S.board = { ch: nx || no, node: null, done: false };
    return { next: nx };
  }
  /** 「何も起きないマス」判定 */
  const NOTHING_SQUARE = 'normal';
  function isNothingSquare(type) { return type === NOTHING_SQUARE; }

  // =========================================================
  // 技（種族ごとの10枠）
  // =========================================================
  function registerMoveset(speciesId, def) {
    if (!isObj(def)) throw new Error('技データが不正です');
    const all = [];
    for (const [slot, n] of Object.entries(MOVESET_SLOTS)) {
      const a = def[slot];
      if (!Array.isArray(a) || a.length !== n) throw new Error(`${slot} は ${n} 個の技IDが必要です`);
      for (const id of a) {
        if (!(Number.isInteger(id) || (typeof id === 'string' && id))) throw new Error(`技IDが不正です：${id}`);
        all.push(id);
      }
    }
    if (new Set(all).size !== all.length) throw new Error('同じ技IDが複数の枠に登録されています');
    const frozen = {};
    for (const slot of Object.keys(MOVESET_SLOTS)) frozen[slot] = Object.freeze([...def[slot]]);
    movesets[speciesId] = Object.freeze(frozen);
  }
  function getMoveset(speciesId) { return movesets[speciesId] || null; }

  // =========================================================
  // ランククリア実績
  // =========================================================
  function hasClearedRank(m, rank) { ensureProg(m); return !!m.prog.rankClr[rank]; }
  /** ランク大会に勝利したときに呼ぶ。Sランク初回ならバッグを6枠へ永久拡張する */
  function recordRankClear(S, m, rank) {
    if (!Number.isInteger(rank) || rank < 0 || rank >= RANK_COUNT) throw new Error(`ランクが不正です：${rank}`);
    if (m) { ensureProg(m); m.prog.rankClr[rank] = true; }
    S.rankRec.cleared[rank] = true;
    let bagUnlocked = false;
    if (rank === RANK_S && !S.inv.bagCapUnlocked) { S.inv.bagCapUnlocked = true; bagUnlocked = true; }
    return { bagUnlocked };
  }

  // =========================================================
  // 修行
  // =========================================================
  function rollDice(rng = Math.random) {
    const r = rng();
    if (!(r >= 0 && r < 1)) throw new Error(`乱数は[0, 1)の範囲である必要があります：${r}`);
    return DICE_MIN + Math.floor(r * (DICE_MAX - DICE_MIN + 1));
  }
  /** 1〜15マス目の種類。15マス目は 'g'（ゴール） */
  function trainSquare(pos) {
    if (pos === TRAIN_LEN) return 'g';
    if (pos >= 1 && pos < TRAIN_LEN) return TRAIN_TEMPLATE[pos - 1];
    return null;
  }
  function canStartTraining(S, m, kind) {
    if (!TRAIN_KINDS.includes(kind)) return { ok: false, reason: 'bad_kind' };
    if (!m) return { ok: false, reason: 'no_monster' };
    if (S.chap.status !== STATUS_FARM) return { ok: false, reason: 'not_at_farm' };
    if (S.trainRun) return { ok: false, reason: 'in_progress' };
    // 修行はChapter 1をクリアしてファームへ帰還して以降に解禁
    if (!(S.chap.clearedMax >= 1)) return { ok: false, reason: 'before_ch1' };
    ensureProg(m);
    if (kind === 'de' && !hasClearedRank(m, RANK_B)) return { ok: false, reason: 'locked' };
    if (m.prog.train[kind] >= TRAIN_MAX[kind]) return { ok: false, reason: 'max' };
    if (S.trainTix < 1) return { ok: false, reason: 'no_ticket' };
    return { ok: true };
  }
  function startTraining(S, m, kind) {
    const c = canStartTraining(S, m, kind);
    if (!c.ok) return c;
    S.trainTix -= 1;
    S.trainRun = { kind, pos: 0 };
    return { ok: true };
  }
  /** サイコロの出目ぶん進み、止まったマスの効果だけを適用する */
  function advanceTraining(S, m, steps, rng = Math.random) {
    const run = S.trainRun;
    if (!run) throw new Error('修行中ではありません');
    if (!Number.isInteger(steps) || steps < DICE_MIN || steps > DICE_MAX) throw new Error(`出目が不正です：${steps}`);
    const from = run.pos;
    const to = Math.min(TRAIN_LEN, from + steps);
    run.pos = to;
    const sq = trainSquare(to);
    let gain = null;
    if (sq === 's' || sq === 'l') {
      const key = sq === 'l' ? 'li' : run.kind;
      const [lo, hi] = sq === 'l' ? TRAIN_GAIN.life : TRAIN_GAIN.stat;
      const amount = lo + Math.floor(rng() * (hi - lo + 1));
      const before = m[key];
      m[key] = Math.min(STAT_MAX, m[key] + amount);
      gain = { key, amount: m[key] - before };
    }
    return { from, to, square: sq, gain, goal: to === TRAIN_LEN };
  }
  /** ゴール到達時：技習得（固定対応・重複なし）とクリア回数の記録 */
  function finishTraining(S, m, rng = Math.random) {
    const run = S.trainRun;
    if (!run || run.pos !== TRAIN_LEN) throw new Error('まだゴールしていません');
    ensureProg(m);
    const kind = run.kind;
    const ms = getMoveset(m.sp);
    let learned = null;
    let reason = null;
    if (!ms) {
      reason = 'unregistered';
    } else {
      const pool = ms[kind].filter((id) => !(m.sk || []).includes(id));
      if (pool.length === 0) reason = 'already';
      else {
        learned = kind === 'de' ? pool[Math.floor(rng() * pool.length)] : pool[0];
        m.sk = [...(m.sk || []), learned];
        m.prog.learnSrc[learned] = kind;
        // 旧修行と同じく、空き枠（未修得MISS）があれば自動でセットする
        if (Array.isArray(m.eq)) { const z = m.eq.indexOf(-1); if (z >= 0) m.eq[z] = learned; }
      }
    }
    m.prog.train[kind] += 1;
    S.trainRun = null;
    return { kind, learned, reason };
  }

  // =========================================================
  // 合体（通常合体の技継承）
  // =========================================================
  function addFusionSpeciesResolver(fn) { if (typeof fn === 'function') fusionSpeciesResolvers.push(fn); }
  /** 子の種族を決める拡張ポイント。合体専用種は未登録のため、現状は親1の種族（従来どおり） */
  function resolveFusionSpecies(a, b) {
    for (const fn of fusionSpeciesResolvers) {
      const r = fn(a, b);
      if (r && r.sp != null) return { sp: r.sp, special: true };
    }
    return { sp: a.sp, special: false };
  }
  function initialSetOf(m) {
    const s = new Set();
    const ms = getMoveset(m.sp);
    if (ms) ms.initial.forEach((k) => s.add(k));
    (legacyHooks.initialMoves(m) || []).forEach((k) => s.add(k));
    const src = (m.prog && m.prog.learnSrc) || {};
    Object.keys(src).forEach((k) => { if (src[k] === 'init') s.add(isNaN(+k) ? k : +k); });
    return s;
  }
  function specialSetOf(m) {
    const s = new Set();
    const ms = getMoveset(m.sp);
    if (ms) ms.de.forEach((k) => s.add(k));
    (legacyHooks.specialMoves(m) || []).forEach((k) => s.add(k));
    const src = (m.prog && m.prog.learnSrc) || {};
    Object.keys(src).forEach((k) => { if (src[k] === 'de') s.add(isNaN(+k) ? k : +k); });
    return s;
  }
  /** 継承候補：両親が実際に持つ技のうち、親自身の初期技・必殺技・子の初期技を除いたもの */
  function fusionInheritCandidates(a, b, childInitial) {
    const out = [];
    for (const p of [a, b]) {
      const ini = initialSetOf(p);
      const spc = specialSetOf(p);
      for (const k of p.sk || []) {
        if (ini.has(k) || spc.has(k) || (childInitial || []).includes(k) || out.includes(k)) continue;
        out.push(k);
      }
    }
    return out;
  }
  function pickFusionInherit(a, b, childInitial, rng = Math.random) {
    const c = fusionInheritCandidates(a, b, childInitial);
    return c.length ? c[Math.floor(rng() * c.length)] : null;
  }

  // =========================================================
  // バッグ／保管庫／アイテム屋
  // =========================================================
  function bagCap(S) { return S.inv.bagCapUnlocked ? BAG_UNLOCKED_CAP : BAG_BASE_CAP; }
  function bagFree(S) { return Math.max(0, bagCap(S) - S.inv.bag.length); }
  function vaultHasRoom(S) { return S.inv.vaultCap === null || S.inv.vault.length < S.inv.vaultCap; }
  /** 保管庫にアクセスできるのはファーム滞在中（Chapter外・修行中でない）だけ */
  function canAccessVault(S) { return S.chap.status === STATUS_FARM && !S.trainRun; }
  const mkItem = (id) => ({ id });

  // ---- バッグ満杯時の扱い：【未確定】 ----
  // 満杯のバッグへアイテムを取得しようとしたときの正式な処理（取得不可／入れ替え／捨てる／保管庫へ送る 等）は
  // まだ決まっていない。ここでは処理を固定せず、将来 setBagFullHandler() で差し込めるようにしておく。
  // ハンドラ未設定の間は「方針未決定」であることを返すだけで、状態は変更しない（正式仕様ではない）。
  let bagFullHandler = null;
  function setBagFullHandler(fn) { bagFullHandler = typeof fn === 'function' ? fn : null; }
  /**
   * バッグへ1個入れる（1枠1個・スタック不可・容量は bagCap）。空きがあれば入れる。
   * 満杯時は bagFullHandler に委ねる（未設定なら reason:'full', policy:'undecided' を返すのみ）。
   */
  function bagAdd(S, itemId) {
    if (bagFree(S) >= 1) { S.inv.bag.push(mkItem(itemId)); return { ok: true }; }
    if (bagFullHandler) return bagFullHandler(S, mkItem(itemId));
    return { ok: false, reason: 'full', policy: 'undecided' };
  }
  function moveVaultToBag(S, vaultIndex) {
    if (!canAccessVault(S)) return { ok: false, reason: 'vault_locked' };
    if (!(vaultIndex >= 0 && vaultIndex < S.inv.vault.length)) return { ok: false, reason: 'bad_index' };
    if (bagFree(S) < 1) return { ok: false, reason: 'full' };
    const [it] = S.inv.vault.splice(vaultIndex, 1);
    S.inv.bag.push(it);
    return { ok: true };
  }
  function moveBagToVault(S, bagIndex) {
    if (!canAccessVault(S)) return { ok: false, reason: 'vault_locked' };
    if (!(bagIndex >= 0 && bagIndex < S.inv.bag.length)) return { ok: false, reason: 'bad_index' };
    if (!vaultHasRoom(S)) return { ok: false, reason: 'vault_full' };
    const [it] = S.inv.bag.splice(bagIndex, 1);
    S.inv.vault.push(it);
    return { ok: true };
  }

  function registerItem(def) {
    if (!isObj(def) || typeof def.id !== 'string' || !def.id) throw new Error('アイテムIDが不正です');
    itemDefs[def.id] = Object.freeze({ id: def.id, name: def.name || def.id, price: def.price ?? null, sellPrice: def.sellPrice ?? null });
  }
  function getItemDef(id) { return itemDefs[id] || null; }
  function setShopCatalog(ids) { shopCatalog = Array.isArray(ids) ? [...ids] : []; }
  function getShopCatalog() { return shopCatalog.filter((id) => itemDefs[id]); }
  /** 購入品は保管庫へ入る（アイテム屋はバッグを直接操作しない） */
  function shopBuy(S, itemId) {
    if (!canAccessVault(S)) return { ok: false, reason: 'not_at_farm' };
    const d = itemDefs[itemId];
    if (!d || !shopCatalog.includes(itemId)) return { ok: false, reason: 'not_sold' };
    if (!Number.isInteger(d.price) || d.price < 0) return { ok: false, reason: 'no_price' };
    if ((S.g || 0) < d.price) return { ok: false, reason: 'no_money' };
    if (!vaultHasRoom(S)) return { ok: false, reason: 'vault_full' };
    S.g -= d.price;
    S.inv.vault.push(mkItem(itemId));
    return { ok: true };
  }
  function shopSell(S, vaultIndex) {
    if (!canAccessVault(S)) return { ok: false, reason: 'not_at_farm' };
    const it = S.inv.vault[vaultIndex];
    if (!it) return { ok: false, reason: 'bad_index' };
    const d = itemDefs[it.id];
    if (!d || !Number.isInteger(d.sellPrice) || d.sellPrice < 0) return { ok: false, reason: 'no_price' };
    S.inv.vault.splice(vaultIndex, 1);
    S.g = (S.g || 0) + d.sellPrice;
    return { ok: true };
  }

  root.MMP7 = Object.freeze({
    SAVE_VERSION, RANK_B, RANK_S, RANK_COUNT, BAG_BASE_CAP, BAG_UNLOCKED_CAP,
    TRAIN_KINDS, TRAIN_LEN, TRAIN_TEMPLATE, TRAIN_GAIN, TOUGH_MAX_CLEARS, TRAIN_MAX, DICE_MIN, DICE_MAX,
    MOVESET_SLOTS, CHAPTER_DEFS, CHAPTER_COUNT, STATUS_FARM, STATUS_BOARD, NOTHING_SQUARE,
    configureLegacy, newProg, ensureProg, initProgForNew,
    newSave, migrateSave, normalizeV5,
    getChapterDef, registerChapterBoard, getChapterBoard, isChapterPlayable, chapterStatus,
    nextChapterNo, canDepart, departChapter, clearChapter, isNothingSquare,
    registerMoveset, getMoveset,
    hasClearedRank, recordRankClear,
    rollDice, trainSquare, canStartTraining, startTraining, advanceTraining, finishTraining,
    addFusionSpeciesResolver, resolveFusionSpecies, fusionInheritCandidates, pickFusionInherit,
    bagCap, bagFree, vaultHasRoom, canAccessVault, bagAdd, setBagFullHandler, moveVaultToBag, moveBagToVault,
    registerItem, getItemDef, setShopCatalog, getShopCatalog, shopBuy, shopSell,
  });
})(typeof window !== 'undefined' ? window : globalThis);
