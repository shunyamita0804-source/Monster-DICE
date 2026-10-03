// =========================================================
// Phase 8：育成進行システム（window.MMP8）
//  「育成を開始した1体のモンスター」に、育成開始から育成完了までの進行を完全に紐づける。
//   ・セーブv6（v4→v5→v6の段階移行・原文退避・自分より新しい版のセーブは読まない／上書きしない）
//   ・個体uid／個体の育成状態（m.raise）
//   ・Chapter進行（20ターン制・移動途中／分岐待ち／マス効果の途中保存）
//   ・公式ランク大会（挑戦可能ランク・総当たりリーグ・優勝報酬）／育成放棄／最終Chapter判定
//   ・戦闘前状態の保存と、旧fight()が付ける報酬の正規化（fight()本体・Battle Engineは無変更）
//  画面描画・SE・Battle Engineには一切触れない純粋ロジック層。
//  【暫定】と書いたものは正式データ未確定のための仮実装（差し替え口を用意）。
// =========================================================
(function (root) {
  'use strict';
  const P7 = root.MMP7;
  if (!P7) throw new Error('MMP8：先に js/phase7/progression.js を読み込んでください');
  const API = {};
  const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const RAISE = P7.RAISE;
  const monstersOf = (S) => [S.m, ...(Array.isArray(S.box) ? S.box : [])].filter(Boolean);
  // Phase 10：個体の補正フック。後から読み込むモジュール（正式モンスターマスターなど）が登録し、
  // 新しい個体の生成時（initIndividual）とセーブの読み込み時（normalizeV6）の両方で必ず呼ばれる。
  const INDIVIDUAL_NORMALIZERS = [];
  function addIndividualNormalizer(fn) { if (typeof fn === 'function' && !INDIVIDUAL_NORMALIZERS.includes(fn)) INDIVIDUAL_NORMALIZERS.push(fn); }
  const runNormalizers = (m) => { for (const fn of INDIVIDUAL_NORMALIZERS) fn(m); return m; };
  // Phase 11：セーブ全体の補正フック（プレイヤー名など）。新規セーブ作成時（isNew:true）とセーブ読み込み時（isNew:false）に呼ばれる。
  const SAVE_NORMALIZERS = [];
  function addSaveNormalizer(fn) { if (typeof fn === 'function' && !SAVE_NORMALIZERS.includes(fn)) SAVE_NORMALIZERS.push(fn); }
  const runSaveNormalizers = (S, isNew) => { for (const fn of SAVE_NORMALIZERS) fn(S, { isNew }); return S; };

  // =========================================================
  // Chapter定義（ターン上限・挑戦ランク上限はここだけで管理する）
  // =========================================================
  const DEFAULT_TURN_LIMIT = 20;   // 通常Chapterの基本ターン数（1ターン＝サイコロ1回）。25/30へ変える場合はここを変えるだけ。2026-10-04：正式仕様は Chapter 1〜4 とも 30 で、Chapter 1 は config（ch1a.js rules.turnLimit 30）。旧ボードの Chapter 3・4（20）と Chapter 2（40）は未調整＝ユーザー判断（CLAUDE.md §5）
  const FINAL = 'final';           // 最終Chapter（旧称：裏ボスChapter）
  const LAST_NORMAL_CHAPTER = 4;
  const RANK_LETTERS = Object.freeze(['E', 'D', 'C', 'B', 'A', 'S']);
  const RANK_E = 0, RANK_D = 1, RANK_C = 2, RANK_B = 3, RANK_A = 4, RANK_S = 5;
  const CHAPTER_RULES = Object.freeze({
    1: Object.freeze({ turnLimit: DEFAULT_TURN_LIMIT, rankCap: RANK_D, tournament: true }),   // Chapter 1だけ挑戦上限D
    2: Object.freeze({ turnLimit: DEFAULT_TURN_LIMIT, rankCap: null, tournament: true }),
    3: Object.freeze({ turnLimit: DEFAULT_TURN_LIMIT, rankCap: null, tournament: true }),
    4: Object.freeze({ turnLimit: DEFAULT_TURN_LIMIT, rankCap: null, tournament: true }),
    // 最終Chapter：正式マップ・名称・ボス・ターン数は未確定。ターン上限なし（null）で、
    // ゴール到達で育成完了へ進む「土台」だけを持つ。
    [FINAL]: Object.freeze({ turnLimit: null, rankCap: null, tournament: false }),
  });
  const FINAL_CHAPTER_MIN_RANK = RANK_A;   // Chapter 4終了時にA以上をクリア済みなら最終Chapterへ強制進行
  // Chapter へ入る条件（2026-10-01 夜・正式）：その個体が公式ランク大会をクリアした実績（m.prog.rankClr＝highestCleared）。
  //  Chapter 1・2 は条件なし、Chapter 3＝公式Cランク大会クリア以上、Chapter 4＝公式Bランク大会クリア以上。
  //  足りなければ Chapter間ファームから先へは出発できず、その個体の今回の育成はここまで（finishWithoutFinal で育成完了。失敗ではない）
  const CHAPTER_RANK_GATE = Object.freeze({ 3: RANK_C, 4: RANK_B });
  /** Chapter key へ入る条件を満たすか：{ ok, need（必要なランクの番号。条件なしは null）, have（クリア済みの最高ランク） } */
  function chapterGate(m, key) { const need = CHAPTER_RANK_GATE[key]; const have = highestCleared(m); return need == null ? { ok: true, need: null, have } : { ok: have >= need, need, have }; }
  function chapterRule(key) { return CHAPTER_RULES[key] || null; }
  function chapterName(key) { if (key === FINAL) return '最終Chapter'; const d = P7.getChapterDef(key); return d ? d.name : ''; }
  function highestCleared(m) { if (!m) return -1; P7.ensureProg(m); let h = -1; m.prog.rankClr.forEach((v, i) => { if (v) h = i; }); return h; }
  /** 個体の表示ランク＝その個体がクリアした最高ランク（未クリアは「ー」） */
  function rankLabel(m) { const h = highestCleared(m); return h >= 0 ? RANK_LETTERS[h] : 'ー'; }
  Object.assign(API, { DEFAULT_TURN_LIMIT, FINAL, LAST_NORMAL_CHAPTER, RANK_LETTERS, CHAPTER_RULES, FINAL_CHAPTER_MIN_RANK, CHAPTER_RANK_GATE,
    chapterGate, chapterRule, chapterName, highestCleared, rankLabel });

  // =========================================================
  // 個体の育成状態（m.raise）と uid
  // =========================================================
  function newRaise() {
    return {
      state: RAISE.NONE,   // none=未育成 / board=Chapter進行中 / farm=Chapter間ファーム / final=最終Chapter進行中 / done=育成完了
      ch: null,            // board・final：進行中のChapter、farm：次に出発するChapter（1〜4 または 'final'）
      node: null,          // Chapter内の現在位置（null＝そのChapterの開始地点）
      turnsUsed: 0,        // このChapterで使ったターン
      turnLimit: null,     // 出発時に確定したターン上限（null＝上限なし）
      pend: null,          // 1ターンの途中状態（出目・残り移動・分岐待ち・マス処理）
      goal: false,         // このChapterのゴールに到達したか
      tour: null,          // 公式ランク大会の状態
      battle: null,        // 戦闘前状態（fight()前後の正規化用）
      trainRun: null,      // 修行中の状態
      log: [],             // 終えたChapterごとの結果
      fatigue: 0,          // 疲れ（0〜100。Chapterフィールドエンジン：js/chapter/engine.js）。Chapterをまたいで持ち越す（次のChapterの開始時に −50）
      field: null,         // Chapterフィールドエンジンの配置（Pattern・シード・候補ノードの割り当て・開けた宝箱など）。エンジンを使うChapterの進行中だけ
    };
  }
  const RAISE_STATES = Object.values(RAISE);
  function ensureRaise(m) {
    if (!m) return m;
    if (!isObj(m.raise)) m.raise = newRaise();
    const r = m.raise, d = newRaise();
    for (const k of Object.keys(d)) if (!(k in r)) r[k] = d[k];
    if (!Array.isArray(r.log)) r.log = [];
    if (!RAISE_STATES.includes(r.state)) Object.assign(r, newRaise(), { log: r.log });
    if (!Number.isInteger(r.turnsUsed) || r.turnsUsed < 0) r.turnsUsed = 0;
    return m;
  }
  function resetRaise(m) { const log = m.raise && Array.isArray(m.raise.log) ? m.raise.log : []; m.raise = Object.assign(newRaise(), { log }); }
  // ---- 読み込み時だけの補正（壊れた・手で書き換えられたセーブ対策）：今のコードが作らない形の途中状態だけを、
  //      既存の「中断」と同じ安全な状態（null）へ戻す。正しい値（ゲームが保存した形）は一切変えない。
  const PEND_STAGES = Object.freeze(['move', 'branch', 'resolve', 'battle']);   // roll/step/chooseBranch/resolveLanding が作る段階
  const validPend = (p) => isObj(p) && PEND_STAGES.includes(p.stage)
    && ((p.stage !== 'move' && p.stage !== 'branch') || Number.isInteger(p.left)) && (p.stage !== 'branch' || Array.isArray(p.opts));
  const validTrainRun = (t) => isObj(t) && P7.TRAIN_KINDS.includes(t.kind) && Number.isInteger(t.pos) && t.pos >= 0 && t.pos <= P7.TRAIN_LEN;
  const validBattle = (b) => isObj(b) && isObj(b.snap) && (b.kind === 'practice' || Object.prototype.hasOwnProperty.call(BATTLE_KINDS, b.kind));
  function sanitizeLoadedRaise(m) {
    const r = m.raise;
    if (!Number.isFinite(r.fatigue) || r.fatigue < 0 || r.fatigue > 100) r.fatigue = Number.isFinite(r.fatigue) ? Math.max(0, Math.min(100, Math.round(r.fatigue))) : 0;
    if (r.field != null && !isObj(r.field)) r.field = null;
    if (DRIVER && DRIVER.sanitize) DRIVER.sanitize(m);                          // エンジンの配置の検査（壊れた配置は null＝開始地点から作り直す）
    if (!r.log.every(isObj)) r.log = r.log.filter(isObj);                     // 記録の壊れた要素（null・数値など）は外す
    if (r.pend !== null && !validPend(r.pend)) r.pend = null;                   // 出目のターンは消費済みのまま（振り直しにはならない。ensureBoardPositionと同じ）
    if (r.trainRun !== null && !validTrainRun(r.trainRun)) r.trainRun = null;   // v5の読み込み（MMP7.normalizeV5）と同じく、読めない修行は取り消す
    if (r.battle !== null && !validBattle(r.battle)) r.battle = null;           // 戦闘の途中終了と同じ（結果なし・同じ戦闘をもう一度選べる）
    return m;
  }

  let uidSeq = 0;
  const genUid = (rnd) => 'm-' + Date.now().toString(36) + '-' + Math.floor(rnd() * 0x7fffffff).toString(36) + '-' + (++uidSeq).toString(36);
  /** セーブ内で重複しないuidを作る */
  function uniqueUid(S, self, rnd = Math.random) {
    const used = new Set(monstersOf(S).filter((x) => x !== self).map((x) => x.uid).filter(Boolean));
    let id; do { id = genUid(rnd); } while (used.has(id));
    return id;
  }
  /** uidが無い・重複している個体にだけ新しいuidを付ける（既存のuidは変えない） */
  function ensureUids(S) {
    const seen = new Set();
    for (const x of monstersOf(S)) {
      if (typeof x.uid !== 'string' || !x.uid || seen.has(x.uid)) x.uid = uniqueUid(S, x);
      seen.add(x.uid);
    }
  }
  /** 新しい個体（市場・合体など）に uid と「未育成」の状態を付ける */
  function initIndividual(S, m) { m.uid = uniqueUid(S, m); m.raise = newRaise(); return runNormalizers(m); }
  Object.assign(API, { addIndividualNormalizer, addSaveNormalizer, RAISE, newRaise, ensureRaise, initIndividual, uniqueUid, ensureUids,
    raiseState: P7.raiseState, isRaising: P7.isRaising, inChapter: P7.inChapter });

  // =========================================================
  // セーブv6
  // =========================================================
  const SAVE_VERSION = 6;
  // v6以降の本セーブのキー。旧キー mr4 は旧版（Phase 7.1以前）が読み書きするキーなので、v6は一切書き込まない。
  // → 旧版のゲームを開いてもv6のデータは上書きされない。版の新旧は v で判定する（v7以降も同じキー）。
  const SAVE_KEY = 'mr4v6';
  const LEGACY_KEY = 'mr4';
  const BACKUP_V4 = 'mr4_v4backup', BACKUP_V5 = 'mr4_v5backup', BACKUP_BAD = 'mr4_unreadable_backup';

  function newSave() {
    const S = P7.newSave();            // 所持金・バッグ・チケット等の初期値はv5と同じ
    delete S.chap; delete S.trainRun;  // Chapter進行・修行状態はセーブ全体では持たない（個体側）
    S.raiseRec = { done: 0, fromStart: true };   // 育成完了回数（新規セーブは最初から記録する）
    S.v = SAVE_VERSION;
    return runSaveNormalizers(S, true);
  }
  /** 個体ではない値（数値・文字列・真偽値・配列など）を「連れている個体」と牧場から外す（壊れたセーブ対策。正しいセーブは変わらない） */
  const hasBadMonsters = (S) => (S.m != null && !isObj(S.m)) || (Array.isArray(S.box) && !S.box.every(isObj));
  function dropBadMonsters(S) {
    if (S.m != null && !isObj(S.m)) S.m = null;
    if (Array.isArray(S.box) && !S.box.every(isObj)) S.box = S.box.filter(isObj);
    return S;
  }
  /** v6の欠けた値を補う（既存の値は変えない）。育成中の個体は常に「連れている個体（S.m）」の1体だけにそろえる */
  function normalizeV6(S) {
    if (!Array.isArray(S.box)) S.box = [];
    dropBadMonsters(S);
    delete S.chap; delete S.board; delete S.trainRun;
    if (!isObj(S.inv)) S.inv = { bag: [], bagCapUnlocked: false, vault: [], vaultCap: null };
    if (!Array.isArray(S.inv.bag)) S.inv.bag = [];
    if (!Array.isArray(S.inv.vault)) S.inv.vault = [];
    if (!S.inv.bag.every(isObj)) S.inv.bag = S.inv.bag.filter(isObj);         // アイテムは { id } の形だけ（null・数値などの壊れた要素は外す）
    if (!S.inv.vault.every(isObj)) S.inv.vault = S.inv.vault.filter(isObj);
    if (typeof S.inv.bagCapUnlocked !== 'boolean') S.inv.bagCapUnlocked = false;
    if (!('vaultCap' in S.inv) || !(S.inv.vaultCap === null || (Number.isInteger(S.inv.vaultCap) && S.inv.vaultCap >= 0))) S.inv.vaultCap = null;
    if (!Number.isInteger(S.trainTix) || S.trainTix < 0) S.trainTix = 0;
    // 所持金：数字だけの文字列は数値へ。数値でない（無い・NaN・文字・配列など）・負の値は0（0以上の数値はそのまま）
    if (typeof S.g === 'string' && S.g.trim() !== '' && Number.isFinite(+S.g)) S.g = +S.g;
    if (!Number.isFinite(S.g) || S.g < 0) S.g = 0;
    if (!isObj(S.rankRec) || !Array.isArray(S.rankRec.cleared)) S.rankRec = { cleared: Array(P7.RANK_COUNT).fill(false) };
    while (S.rankRec.cleared.length < P7.RANK_COUNT) S.rankRec.cleared.push(false);
    normalizeRaiseRec(S);   // 育成完了回数：記録が無い旧セーブは推測せず0回から（fromStart:false）
    ensureUids(S);
    monstersOf(S).forEach((x) => { P7.ensureProg(x); ensureRaise(x); sanitizeLoadedRaise(x); runNormalizers(x); });
    const boxRaising = S.box.filter((x) => P7.isRaising(x));
    if (boxRaising.length) {
      if (!(S.m && P7.isRaising(S.m))) { const t = boxRaising[0]; S.box = S.box.filter((x) => x !== t); if (S.m) S.box.push(S.m); S.m = t; }
      S.box.forEach((x) => { if (P7.isRaising(x)) resetRaise(x); });
    }
    S.v = SAVE_VERSION;
    return runSaveNormalizers(S, false);
  }
  const isNewerSave = (raw) => isObj(raw) && typeof raw.v === 'number' && raw.v > SAVE_VERSION;
  /**
   * セーブをv6にする（元のオブジェクトは変更しない）。v4 → v5（Phase 7.1の救済込み：MMP7.migrateSave）→ v6 の段階移行。
   * 読めないデータ・未知の版・自分より新しい版は null（新しい版かどうかは isNewerSave で判定）。
   */
  function migrateSave(raw) {
    if (!isObj(raw)) return null;
    if (raw.v === SAVE_VERSION) return ('box' in raw && !Array.isArray(raw.box)) ? null : normalizeV6(clone(raw));
    const S = P7.migrateSave(hasBadMonsters(raw) ? dropBadMonsters({ ...raw }) : raw);   // v4/v5 → 正規化済みv5（コピー）。それ以外は null（元のオブジェクトは変えない）
    if (!S) return null;
    const chap = isObj(S.chap) ? S.chap : null, board = isObj(S.board) ? S.board : null, run = isObj(S.trainRun) ? S.trainRun : null;
    delete S.chap; delete S.board; delete S.trainRun;
    ensureUids(S);
    monstersOf(S).forEach((x) => { x.raise = newRaise(); });   // 預け個体にはChapter進行を割り当てない（未育成の牧場個体のまま）
    const m = S.m;
    if (m && chap) {   // 旧セーブの進行は「現在連れている個体」に紐づける（連れていなければ進行は引き継がない）
      const r = m.raise, cleared = Math.max(0, Math.min(LAST_NORMAL_CHAPTER, chap.clearedMax | 0));
      for (let ch = 1; ch <= cleared; ch++) r.log.push({ ch, legacy: true });   // 旧版で終えたChapter（ゴール・大会の詳細は旧版に無い）
      if (chap.status === 'board') {
        // 旧セーブのChapter途中：新仕様の途中状態が無いため、そのChapterの開始地点・使用0ターンから再開する
        let ch = board && Number.isInteger(board.ch) ? board.ch : cleared + 1;
        ch = Math.max(1, Math.min(LAST_NORMAL_CHAPTER, ch));
        Object.assign(r, { state: RAISE.BOARD, ch, node: null, turnsUsed: 0, turnLimit: chapterRule(ch).turnLimit });
      } else if (cleared >= LAST_NORMAL_CHAPTER) {
        if (highestCleared(m) >= FINAL_CHAPTER_MIN_RANK) Object.assign(r, { state: RAISE.FARM, ch: FINAL });
        else Object.assign(r, { state: RAISE.DONE, ch: null });
      } else if (cleared >= 1) {
        Object.assign(r, { state: RAISE.FARM, ch: cleared + 1 });
      }
      if (run && r.state === RAISE.FARM) r.trainRun = { kind: run.kind, pos: run.pos };
    }
    S.migratedFrom = raw.v;
    return normalizeV6(S);
  }
  /**
   * 起動時の読み込み（storage は localStorage 互換）。
   *  新キー → 無ければ旧キー の順に読む。旧キーから移行した場合は原文を版ごとの退避キーへ（既存の退避は上書きしない）。
   *  自分より新しい版のセーブは読み込まず、何も書き込まない（locked）。壊れたデータは原文を退避してから新規扱い。
   */
  function loadFromStorage(st) {
    const out = { S: null, status: 'new', locked: false, version: null, from: null };
    if (!st) return out;
    const get = (k) => { try { return st.getItem(k); } catch (e) { return null; } };
    const set = (k, v) => { try { st.setItem(k, v); return true; } catch (e) { return false; } };
    let text = get(SAVE_KEY), key = SAVE_KEY;
    if (text == null) { text = get(LEGACY_KEY); key = LEGACY_KEY; }
    if (text == null) return out;
    let raw; try { raw = JSON.parse(text); } catch (e) { raw = undefined; }
    if (isNewerSave(raw)) { out.status = 'locked'; out.locked = true; out.version = raw.v; return out; }
    // 形は読めても中身が壊れていて変換中に失敗したデータも、読めないデータと同じ扱い（原文を退避して新規。起動を止めない）
    let S = null; try { S = migrateSave(raw); } catch (e) { S = null; }
    if (!S) {
      const bk = get(BACKUP_BAD) == null ? BACKUP_BAD : BACKUP_BAD + '_' + Date.now();
      set(bk, text); out.status = 'unreadable'; out.backup = bk; return out;
    }
    out.from = raw.v;
    if (key === LEGACY_KEY) {
      if (raw.v === 4 && get(BACKUP_V4) == null) set(BACKUP_V4, text);
      if (raw.v === 5 && get(BACKUP_V5) == null) set(BACKUP_V5, text);
      set(SAVE_KEY, JSON.stringify(S));
      out.status = 'migrated';
    } else out.status = 'ok';
    out.S = S;
    return out;
  }
  Object.assign(API, { SAVE_VERSION, SAVE_KEY, LEGACY_KEY, BACKUP_V4, BACKUP_V5, BACKUP_BAD,
    newSave, normalizeV6, isNewerSave, migrateSave, loadFromStorage });

  // =========================================================
  // Chapterボードの登録・出発・位置／育成中の画面遷移（Step 3）
  // =========================================================
  let finalBoard = null;   // 最終Chapterのマップ（正式マップ未制作のため、本番では未登録）
  // ---- Chapterフィールドエンジン（js/chapter/engine.js）の差し込み口 ----
  //  エンジンが担当する Chapter だけ、マップ（Pattern ごと）・ターン上限・疲れ・休む・停止地点の効果をエンジンに任せる。
  //  担当しない Chapter（エンジン未登録・Node のテストなど）は、これまでどおり registerChapterBoard のマップと SQUARE_EFFECTS で動く。
  let DRIVER = null;
  function registerChapterDriver(d) { if (d && typeof d.handles !== 'function') throw new Error('Chapterドライバーが不正です'); DRIVER = d || null; }
  const driverFor = (key) => (DRIVER && DRIVER.handles(key) ? DRIVER : null);
  const validTrack = (t) => isObj(t) && isObj(t.nodes) && isObj(t.conn) && !!t.start && !!t.nodes[t.start];
  function registerFinalBoard(track, meta) {
    if (!validTrack(track)) throw new Error('ボードデータが不正です');
    finalBoard = { track, provisional: !!(meta && meta.provisional), note: (meta && meta.note) || '' };
  }
  /** Chapterのマップ（1〜4は MMP7.registerChapterBoard の登録、'final' は registerFinalBoard の登録） */
  function trackOf(key) { if (key === FINAL) return finalBoard ? finalBoard.track : null; const d = driverFor(key); if (d) return d.trackFor(null, key); const b = P7.getChapterBoard(key); return b ? b.track : null; }
  function boardOf(m) { if (!m || !isObj(m.raise)) return null; const d = driverFor(m.raise.ch); return d ? d.trackFor(m, m.raise.ch) : trackOf(m.raise.ch); }
  const isPlayable = (key) => !!trackOf(key);
  /** 次に出発するChapter（未育成ならChapter 1、Chapter間ファームなら記録済みの次Chapter。それ以外は null） */
  function nextChapterKey(m) { const st = P7.raiseState(m); return st === RAISE.NONE ? 1 : st === RAISE.FARM ? m.raise.ch : null; }
  function canDepart(S, m) {
    if (!m || m !== S.m) return { ok: false, reason: 'no_monster' };
    ensureRaise(m);
    const st = m.raise.state;
    if (st === RAISE.DONE) return { ok: false, reason: 'finished' };
    if (st === RAISE.BOARD || st === RAISE.FINAL) return { ok: false, reason: 'not_at_farm' };
    if (P7.trainRunOf(m)) return { ok: false, reason: 'training' };
    const key = nextChapterKey(m);
    if (!chapterRule(key)) return { ok: false, reason: 'finished' };
    { const gt = chapterGate(m, key); if (!gt.ok) return { ok: false, reason: 'rank_gate', key, need: gt.need, have: gt.have }; }   // 公式ランク大会のクリア実績が足りない
    if (!isPlayable(key)) return { ok: false, reason: 'no_map', key };
    return { ok: true, key };
  }
  /** 出発（未育成の個体はここで育成開始）。ターン上限は出発時のChapter定義の値で確定する */
  function depart(S, m, rnd = Math.random) {
    const c = canDepart(S, m); if (!c.ok) return c;
    const fresh = m.raise.state === RAISE.NONE;   // 新しい育成の開始（未育成→Chapter 1）
    const drv = driverFor(c.key);
    Object.assign(m.raise, { state: c.key === FINAL ? RAISE.FINAL : RAISE.BOARD, ch: c.key, node: null, turnsUsed: 0,
      turnLimit: drv ? drv.turnLimit(c.key) : chapterRule(c.key).turnLimit, pend: null, goal: false, tour: null, battle: null });
    if (drv) drv.onDepart(S, m, c.key, rnd, fresh);                                          // Pattern の選択・配置の確定・疲れの繰り越し
    else { if (DRIVER && DRIVER.onDepartOther) DRIVER.onDepartOther(S, m, c.key, fresh); else m.raise.fatigue = 0; }
    m.raise.node = boardOf(m).start;
    if (fresh) m.raise.startStats = statSnap(m);   // 売却額用：育成開始時の永続能力値（Chapter移行では取り直さない）
    return { ok: true, key: c.key };
  }
  /** ボードを開くときの補正：開始地点（node=null）をスタートへ。地図の無いChapterならChapter間ファームへ退避（7.1の救済と同じ考え方） */
  function ensureBoardPosition(S, m) {
    if (!m || !P7.inChapter(m)) return { changed: false };
    const r = m.raise, drv = driverFor(r.ch);
    if (drv) { const e = drv.ensure(S, m); if (e.changed) return { changed: true }; }        // エンジンの配置が無い・壊れている（旧セーブなど）→ 開始地点から
    const trk = boardOf(m);
    if (!trk) { Object.assign(r, { state: RAISE.FARM, node: null, turnsUsed: 0, turnLimit: null, pend: null, goal: false, tour: null, battle: null }); return { changed: true, rescued: true }; }
    if (r.node == null || !trk.nodes[r.node]) {
      // 公式大会の途中（旧仮マップのゴールで大会中）なら、大会はそのまま続ける（ゴール地点に置く）
      if (r.tour) { Object.assign(r, { node: trk.goal || trk.start, pend: null, goal: true }); return { changed: true }; }
      // それ以外（旧仮マップの途中・移行直後など）は、同じChapterの開始地点・使用0ターンから
      Object.assign(r, { node: trk.start, turnsUsed: 0, pend: null, goal: false }); return { changed: true };
    }
    return { changed: false };
  }
  /** 街（街・牧場・市場・博物館・セーブ画面）へ行けるか：育成開始から育成完了までは不可（交換・合体も不可） */
  const canVisitTown = (S) => !(S && S.m && P7.isRaising(S.m));
  /** 起動・中断からの復帰先：training（修行ボード）/ board（Chapter）/ farm（Chapter間ファーム）/ town（街） */
  function resumeTarget(S) {
    const m = S && S.m;
    if (!m) return 'town';
    if (P7.trainRunOf(m)) return 'training';
    if (P7.inChapter(m)) return 'board';
    return P7.raiseState(m) === RAISE.FARM ? 'farm' : 'town';
  }
  Object.assign(API, { registerFinalBoard, trackOf, boardOf, isPlayable, nextChapterKey, canDepart, depart, ensureBoardPosition, canVisitTown, resumeTarget });

  // =========================================================
  // 20ターン制のChapter進行（1ターン＝サイコロ1回）とマス効果（Step 4）
  //  出目・残り移動・分岐待ち・マス処理は m.raise.pend に置き、演出より前に確定する。
  //  → 中断・アプリ終了・再読み込みでも、サイコロの振り直し・イベントの引き直しは起きない。
  // =========================================================
  const STAT_MAX = 999;
  const isGoalNode = (trk, id) => !!trk && id != null && (id === trk.goal || !((trk.conn[id] || []).length));
  function turnsLeft(m) { const r = m.raise; return r.turnLimit == null ? Infinity : Math.max(0, r.turnLimit - r.turnsUsed); }
  /** ボードの局面：roll / move / branch / resolve / battle / goal / timeup / tour / tour_done */
  function boardPhase(m) {
    const r = m.raise;
    if (r.tour) return r.tour.status === 'settled' ? 'tour_done' : 'tour';
    if (r.pend) return r.pend.stage;
    if (r.goal) return 'goal';
    return turnsLeft(m) === 0 ? 'timeup' : 'roll';
  }
  function canRoll(m) {
    if (!m || !P7.inChapter(m)) return false;
    const r = m.raise;
    const d = driverFor(r.ch);
    return !r.pend && !r.goal && !r.tour && !r.battle && r.node != null && turnsLeft(m) > 0 && (!d || d.canRoll(m));   // エンジン：疲れ100ならサイコロ不可
  }
  /** サイコロの面の数：エンジンの Chapter は config（rules.diceSides）、それ以外（旧ボード）は従来の 1〜3 */
  function diceSides(m) { const d = m && isObj(m.raise) ? driverFor(m.raise.ch) : null; const n = d && d.diceSides ? d.diceSides(m) : 0; return Number.isInteger(n) && n >= 1 ? n : P7.DICE_MAX - P7.DICE_MIN + 1; }
  /** サイコロを振る＝1ターン消費。出目（1〜面の数）はここで確定して pend に記録する */
  function roll(S, m, rnd = Math.random) {
    if (!canRoll(m)) return { ok: false };
    const value = P7.rollDie(diceSides(m), rnd), r = m.raise;
    r.turnsUsed += 1;
    r.pend = { roll: value, left: value, stage: 'move' };
    const d = driverFor(r.ch); if (d) Object.assign(r.pend, d.onRoll(S, m, value));   // エンジン：出目が決まった時点で疲れを加算（停止地点では加算後の疲れで判定）
    return { ok: true, value };
  }
  /** 休む（エンジンの Chapter だけ）：1ターン消費・移動なし・疲れ −30。サイコロと同じく、ターンの途中・ゴール後・大会中・戦闘中は不可 */
  function canRest(m) {
    if (!m || !P7.inChapter(m)) return false;
    const r = m.raise, d = driverFor(r.ch);
    return !!d && d.canRest(m) && !r.pend && !r.goal && !r.tour && !r.battle && r.node != null && turnsLeft(m) > 0;
  }
  function rest(S, m) {
    if (!canRest(m)) return { ok: false };
    const r = m.raise; r.turnsUsed += 1;
    const out = { ok: true, ...driverFor(r.ch).onRest(S, m) };
    if (turnsLeft(m) !== 0) return out;
    const d = driverFor(r.ch), x = d.onTurnsExhausted ? d.onTurnsExhausted(S, m) : null;   // 最後のターンを休んで終えたときも同じ規則（'tournament' なら大会へ）
    if (x && x.toGoal) { r.goal = true; return { ...out, timeUp: true, goal: true }; }
    return { ...out, timeUp: true };
  }
  /** 通過専用の地点（エンジンの Chapter の config で決まる。止まれない＝出目に数えない）。旧ボードには無い */
  const isWaypoint = (m, id) => { const d = m && isObj(m.raise) ? driverFor(m.raise.ch) : null; return !!(d && d.isWaypoint && d.isWaypoint(m, id)); };
  /** 強制停止のマス（マップの node.stop）：出目が残っていてもここで止まり、残りの移動は消える（ライバル・強敵などの必須イベント。マス側の設定だけで決まる） */
  const isStopNode = (trk, id) => !!(trk && id != null && trk.nodes[id] && trk.nodes[id].stop === true);
  /** 1マス進んだあと：止まる（残り0・ゴール・強制停止）なら resolve へ、通過なら onPass（通過したマスは効果を出さない） */
  function afterMove(S, m, trk, from) {
    const r = m.raise, p = r.pend, d = driverFor(r.ch);
    if (d && d.onStep) d.onStep(S, m);
    if (p.left <= 0 || isGoalNode(trk, r.node) || isStopNode(trk, r.node)) { p.left = 0; p.stage = 'resolve'; }   // ゴール・強制停止に着いたら残り移動は消える
    else { p.stage = 'move'; if (d && d.onPass) d.onPass(S, m, r.node, from); }
  }
  /** 1マスだけ進める（演出用に1歩ずつ保存できる）。分岐に来たら branch、止まる位置に来たら resolve */
  function step(S, m) {
    const r = m && m.raise, p = r && r.pend, trk = boardOf(m);
    if (!p || p.stage !== 'move' || !trk) return { stage: p ? p.stage : null };
    const opts = trk.conn[r.node] || [];
    if (p.left <= 0 || !opts.length) { p.left = 0; p.stage = 'resolve'; return { stage: 'resolve' }; }
    if (opts.length > 1) { p.stage = 'branch'; p.opts = [...opts]; return { stage: 'branch', opts: p.opts }; }
    const from = r.node; r.node = opts[0]; if (!isWaypoint(m, r.node)) p.left -= 1;   // 通過専用の地点（ドライバの isWaypoint）は出目に数えない
    afterMove(S, m, trk, from);
    return { stage: p.stage, node: r.node };
  }
  /** 分岐の選択（プレイヤーが選ぶ。ランダムには決めない） */
  function chooseBranch(S, m, id) {
    const r = m && m.raise, p = r && r.pend, trk = boardOf(m);
    if (!p || p.stage !== 'branch' || !Array.isArray(p.opts) || !p.opts.includes(id)) return { ok: false };
    const from = r.node; r.node = id; if (!isWaypoint(m, id)) p.left -= 1; delete p.opts;
    afterMove(S, m, trk, from);
    return { ok: true, stage: p.stage, node: id };
  }

  // ---- マス効果（マスの種類ごと。将来の正式マップのマスは registerSquareEffect で追加できる） ----
  // 【暫定】能力マス・イベントの値は旧CH1（Phase 7.1の暫定マップ）由来。正式マップ制作時に見直す。
  // 疲労・ストレス（Phase 8で廃止）に作用していたイベント・休息マスは、新しい育成では効果なし。
  // 能力マスの上昇量（2026-10-02 正式）：そのモンスターの成長適性 A〜E（js/phase10/monsters.js の growthGain＝表は GROWTH_GAIN の1か所）。ランダム幅なし
  const growthGain = (m, key) => { const P = root.MMP10M; if (!P || !P.growthGain) throw new Error('MMP8：成長適性（js/phase10/monsters.js）が読み込まれていません'); return P.growthGain(m, key); };
  const STAT_SQUARE_KEY = Object.freeze({ power: 'po', wisdom: 'in', hit: 'hi', evasion: 'ev', toughness: 'de' });
  const FIVE = Object.freeze(['po', 'in', 'hi', 'ev', 'de']);
  const pickOf = (arr, rnd) => arr[Math.floor(rnd() * arr.length)];
  const addStat = (m, k, n) => { const b = m[k]; m[k] = Math.max(0, Math.min(STAT_MAX, m[k] + n)); return m[k] - b; };
  const PROVISIONAL_EVENTS = Object.freeze([
    { id: 'herb', run: (S, m, rnd) => { const key = pickOf(FIVE, rnd); return { kind: 'stat', ev: 'herb', key, amount: addStat(m, key, 6) }; } },
    { id: 'trip', run: (S, m, rnd) => { const key = pickOf(FIVE, rnd); return { kind: 'stat', ev: 'trip', key, amount: addStat(m, key, -4) }; } },
    { id: 'treasure', run: (S) => { S.g = (S.g || 0) + 50; return { kind: 'gold', ev: 'treasure', amount: 50 }; } },
  ]);
  const PROVISIONAL_RARE_EVENTS = Object.freeze([
    { id: 'spring', run: (S, m) => ({ kind: 'multi', ev: 'spring', gains: FIVE.map((key) => ({ key, amount: addStat(m, key, 8) })) }) },
    { id: 'sage', run: (S, m, rnd) => { const key = pickOf(FIVE, rnd); return { kind: 'stat', ev: 'sage', key, amount: addStat(m, key, 20) }; } },
    { id: 'charm', run: (S) => { S.g = (S.g || 0) + 150; return { kind: 'gold', ev: 'charm', amount: 150 }; } },
  ]);
  const noEffect = (note) => () => ({ kind: 'none', note });
  const statSquare = (type) => (S, m, rnd) => {
    const key = STAT_SQUARE_KEY[type];
    return { kind: 'stat', key, amount: addStat(m, key, growthGain(m, key)) };
  };
  const SQUARE_EFFECTS = {
    normal: noEffect('normal'),        // 何も起きないマス
    start: noEffect('normal'),
    tournament: noEffect('goal'),      // ゴール（公式大会はゴール到達として扱う）
    train: noEffect('old_train'),      // 旧「修行マス」：修行はChapter間ファームで行う（Phase 7で師匠バトルへの入口は切断済み）
    rest: noEffect('rest'),            // 旧「休息マス」：疲労・ストレス廃止のため効果なし
    power: statSquare('power'), wisdom: statSquare('wisdom'), hit: statSquare('hit'), evasion: statSquare('evasion'), toughness: statSquare('toughness'),
    event: (S, m, rnd) => pickOf(PROVISIONAL_EVENTS, rnd).run(S, m, rnd),
    rare: (S, m, rnd) => pickOf(PROVISIONAL_RARE_EVENTS, rnd).run(S, m, rnd),
    battle: () => ({ kind: 'battle' }),   // 練習試合（挑戦するかはプレイヤーが選ぶ）
  };
  function registerSquareEffect(type, fn) { if (typeof type !== 'string' || typeof fn !== 'function') throw new Error('マス効果の登録が不正です'); SQUARE_EFFECTS[type] = fn; }
  /** 止まったマスの効果を1回だけ適用し、ターンを終える（バトルマスはプレイヤーの選択待ちにする） */
  function resolveLanding(S, m, rnd = Math.random) {
    const r = m && m.raise, p = r && r.pend;
    if (!p || p.stage !== 'resolve') return { ok: false };
    const nd = ((boardOf(m) || {}).nodes || {})[r.node] || {}, d = driverFor(r.ch);
    const fx = (d && d.resolve(S, m, r.node, rnd)) || (SQUARE_EFFECTS[nd.type] || SQUARE_EFFECTS.normal)(S, m, rnd);   // エンジン：配置で決まった種類（能力・イベント・宝箱・バトル）
    p.fx = fx;
    if (fx.kind === 'battle') { p.stage = 'battle'; return { ok: true, fx, wait: true }; }
    if (fx.kind === 'choice') return { ok: true, fx, wait: true, choice: true };   // 2026-10-04：選択肢のある出来事＝プレイヤーが選ぶまで待つ（stage は 'resolve' のまま＝再読み込みでも同じ選択肢が出る）
    return { ok: true, fx, ...finishTurn(S, m) };
  }
  /** 選択肢のある出来事で選んだあと（エンジンの Chapter だけ）：選んだ効果を適用してターンを終える */
  function resolveChoice(S, m, optId, rnd = Math.random) {
    const r = m && m.raise, p = r && r.pend, d = r && driverFor(r.ch);
    if (!p || p.stage !== 'resolve' || !isObj(p.fx) || p.fx.kind !== 'choice' || !d || !d.resolveChoice) return { ok: false };
    const fx = d.resolveChoice(S, m, optId, rnd); if (!fx) return { ok: false };
    p.fx = fx;
    return { ok: true, fx, ...finishTurn(S, m) };
  }
  function finishTurn(S, m) {
    const r = m.raise; r.pend = null;
    if (isGoalNode(boardOf(m), r.node)) { r.goal = true; return { goal: true }; }
    if (turnsLeft(m) !== 0) return {};
    // 最後のターンの停止処理まで終えてから：エンジンの Chapter は onTurnsExhausted で「そのまま大会へ（ゴール扱い）」にできる（既定・旧ボードは従来どおり timeup）
    const d = driverFor(r.ch), x = d && d.onTurnsExhausted ? d.onTurnsExhausted(S, m) : null;
    if (x && x.toGoal) { r.goal = true; return { goal: true, timeUp: true }; }
    return { timeUp: true };
  }
  function skipBattleSquare(S, m) {
    const r = m && m.raise;
    if (!r || !r.pend || r.pend.stage !== 'battle' || r.battle) return { ok: false };
    return { ok: true, ...finishTurn(S, m) };
  }

  // ---- Chapterの終了（ゴール後の大会終了・辞退、またはターン切れ）→ Chapter間ファーム ----
  function canEndChapter(m) {
    if (!m || !P7.inChapter(m)) return { ok: false, reason: 'not_in_chapter' };
    const r = m.raise, rule = chapterRule(r.ch);
    if (r.pend || r.battle) return { ok: false, reason: 'turn_in_progress' };
    if (r.tour) return r.tour.status === 'settled' ? { ok: true } : { ok: false, reason: 'tournament_in_progress' };
    if (r.goal) return rule && rule.tournament ? { ok: false, reason: 'tournament_pending' } : { ok: true };
    return turnsLeft(m) === 0 ? { ok: true } : { ok: false, reason: 'turns_left' };
  }
  /**
   * Chapter終了後の行き先（Step 9）
   *  Chapter 1〜3 → 次のChapterの前のChapter間ファーム
   *  Chapter 4   → その時点のクリア最高ランクがA以上なら最終Chapterへ強制進行（選択不可）、B以下なら育成完了
   *  最終Chapter → 育成完了（最終Chapterに育成失敗は無い）
   */
  function nextAfterChapter(m, key) {
    if (key === FINAL) return { state: RAISE.DONE, ch: null, next: 'done' };
    if (key >= LAST_NORMAL_CHAPTER) {
      return highestCleared(m) >= FINAL_CHAPTER_MIN_RANK ? { state: RAISE.FARM, ch: FINAL, next: FINAL } : { state: RAISE.DONE, ch: null, next: 'done' };
    }
    return { state: RAISE.FARM, ch: key + 1, next: key + 1 };
  }
  function closeChapter(S, m, extra) {
    const r = m.raise, key = r.ch, res = r.tour && r.tour.result;
    const entry = { ch: key, reachedGoal: !!r.goal, turnsUsed: r.turnsUsed, turnLimit: r.turnLimit, declined: !!extra.declined,
      tour: res ? { rank: res.rank, place: res.place, won: res.won, firstClear: res.firstClear } : null };
    r.log.push(entry);
    const nx = nextAfterChapter(m, key);
    { const d = driverFor(key); if (d && d.onClose) d.onClose(S, m); }   // 配置はChapterごと（疲れは持ち越す）
    Object.assign(r, { state: nx.state, ch: nx.ch, node: null, turnsUsed: 0, turnLimit: null, pend: null, goal: false, tour: null, battle: null });
    if (nx.state === RAISE.DONE) { r.endStats = statSnap(m); recordRaiseDone(S); }   // 育成完了1回につき1回だけ（売却額用に完了時の能力値も記録）
    return { ok: true, next: nx.next, entry };
  }
  function endChapter(S, m) { const c = canEndChapter(m); return c.ok ? closeChapter(S, m, {}) : c; }
  /** ゴール到達後に公式大会へ参加しない（報酬なしでChapter終了） */
  function declineTournament(S, m) {
    if (!m || !P7.inChapter(m)) return { ok: false, reason: 'not_in_chapter' };
    const r = m.raise;
    if (!r.goal || r.tour || r.pend || r.battle || !chapterRule(r.ch).tournament) return { ok: false, reason: 'cannot_decline' };
    return closeChapter(S, m, { declined: true });
  }

  // =========================================================
  // 戦闘前状態の保存と、旧fight()報酬の正規化（練習試合。Step 6で大会を追加）
  //  fight()（Phase 6保護対象）は終了時に旧式の賞金・勝利数・ブリーダーランク・ランクアップを付けてすぐ save() する。
  //  fight()は変えず、開始前の状態を保存しておき、終了後（または途中終了からの再開時）にこの値へ戻す。
  // =========================================================
  const BATTLE_KINDS = {};   // 練習試合以外の戦闘種別（大会はStep 6で登録）
  function beginBattle(S, m, info) {
    if (!m || m !== S.m || !P7.inChapter(m)) return { ok: false, reason: 'not_in_chapter' };
    const r = m.raise;
    if (r.battle) return { ok: false, reason: 'busy' };
    const b = { kind: info.kind, rank: info.rank, done: false, snap: { g: S.g, wins: S.wins, br: S.br, rk: m.rk, fa: m.fa, st: m.st } };
    if (info.kind === 'practice') { if (!(r.pend && r.pend.stage === 'battle')) return { ok: false, reason: 'no_battle_square' }; }
    else if (!BATTLE_KINDS[info.kind] || !BATTLE_KINDS[info.kind].begin(S, m, b)) return { ok: false, reason: 'bad_kind' };
    r.battle = b;
    return { ok: true };
  }
  /** fight()の終了時（index.html の adv() から）に呼ぶ：戦闘が最後まで終わった印 */
  function markBattleDone(S) { const m = S && S.m; if (m && isObj(m.raise) && m.raise.battle) m.raise.battle.done = true; }
  const restore = (o, k, v) => { if (v === undefined) delete o[k]; else o[k] = v; };
  function finishBattle(S, m, rnd = Math.random) {
    const r = m && isObj(m.raise) ? m.raise : null, b = r && r.battle;
    if (!b) return null;
    r.battle = null;
    if (!b.done) return { kind: b.kind, interrupted: true };   // 途中終了：結果なし（同じ戦闘をもう一度行える）
    const won = (S.wins || 0) > (b.snap.wins || 0);
    // 旧fight()が付けた賞金・勝利数・ブリーダーランク・ランクアップは取り消す（正式な報酬は大会全体の結果で1回だけ）
    restore(S, 'g', b.snap.g); restore(S, 'wins', b.snap.wins); restore(S, 'br', b.snap.br); restore(m, 'rk', b.snap.rk);
    // 廃止した疲労・ストレスをfight()が内部で増やしても、残さない（fight()本体は無変更のまま外側で無効化）
    restore(m, 'fa', b.snap.fa); restore(m, 'st', b.snap.st);
    const out = { kind: b.kind, won };
    if (b.kind === 'practice') {
      const d = driverFor(r.ch); if (d && d.onBattleFinished) Object.assign(out, d.onBattleFinished(S, m, b));   // エンジン：ボード上のバトルの後は疲れ +5（公式大会では増やさない）
      if (r.pend && r.pend.stage === 'battle') Object.assign(out, finishTurn(S, m));
    }
    else if (BATTLE_KINDS[b.kind]) Object.assign(out, BATTLE_KINDS[b.kind].finish(S, m, b, won, rnd));
    out.matchWon = won;   // この試合そのものの勝敗（大会の決着時は out.won が大会全体の結果＝1位かどうかに置き換わるため、別に返す）
    return out;
  }
  /** 【暫定】練習試合の相手の強さ＝個体の表示ランク（未クリアはE）。旧仕様の「現在ランク」に相当 */
  const practiceRank = (m) => Math.max(RANK_E, highestCleared(m));
  Object.assign(API, { registerChapterDriver, canRest, rest, turnsLeft, boardPhase, canRoll, diceSides, roll, step, chooseBranch, registerSquareEffect, resolveLanding, resolveChoice, skipBattleSquare,
    canEndChapter, endChapter, declineTournament, beginBattle, markBattleDone, finishBattle, practiceRank });

  // =========================================================
  // 公式ランク大会：挑戦できるランクと優勝報酬（Step 5）
  //  挑戦上限＝その個体のクリア最高ランク＋1（Sまで。2026-10-01 正式仕様。旧：＋2）。ただし D までは常に選べる（未クリア・E クリアでも D まで）。Chapterごとの上限はCHAPTER_RULES.rankCap（Chapter 1 は D）。
  //  クリア済みランク・下位ランクへの再挑戦も可。報酬は「大会で最終1位」のときに1大会1回だけ。
  // =========================================================
  const RANK_UNLOCK_STEP = 1;
  const RANK_FLOOR = RANK_D;   // 最初から選べる上限（Chapter 1 の時点で D まで）
  const PRIZE = Object.freeze([100, 200, 350, 550, 800, 1200]);                                    // 初回優勝の賞金（E〜S）
  const FIRST_CLEAR_TICKETS = Object.freeze([1, 1, 2, 2, 2, 2]);                                 // 初回優勝の修行チケット（E〜S）
  const WIN_BONUS_RANGE = Object.freeze([[2, 4], [3, 5], [4, 7], [6, 9], [8, 12], [11, 16]].map(Object.freeze)); // 優勝ボーナス（1能力あたり、E〜S）
  const WIN_BONUS_COUNT = 3;                                                                     // 6能力から異なる3能力
  const BONUS_STATS = Object.freeze(['li', 'po', 'in', 'hi', 'ev', 'de']);
  function maxChallengeRank(m, key) {
    let cap = Math.min(RANK_S, Math.max(RANK_FLOOR, highestCleared(m) + RANK_UNLOCK_STEP));
    const rule = chapterRule(key);
    if (rule && rule.rankCap != null) cap = Math.min(cap, rule.rankCap);
    return cap;
  }
  /** そのChapterで挑戦できるランク（E〜上限。クリア済み・下位ランクも含む） */
  function eligibleRanks(m, key) { const cap = maxChallengeRank(m, key); return RANK_LETTERS.map((_, i) => i).filter((i) => i <= cap); }
  const canChallenge = (m, key, rank) => Number.isInteger(rank) && eligibleRanks(m, key).includes(rank);
  /**
   * 大会で最終1位になったときの正式報酬（大会の決着時に1回だけ呼ばれる）。
   *  初回優勝：賞金・修行チケット・ステータスボーナス・実績。再優勝：ステータスボーナスのみ。
   *  上位ランクの優勝で下位ランクもクリア扱いになるが、飛ばした下位ランクの初回報酬は付与しない。
   */
  function grantTournamentWin(S, m, rank, rnd = Math.random) {
    P7.ensureProg(m);
    const firstClear = !m.prog.rankClr[rank];
    const reward = { rank, firstClear, prize: 0, tickets: 0, bonus: [], bagUnlocked: false };
    if (firstClear) {
      reward.prize = PRIZE[rank]; reward.tickets = FIRST_CLEAR_TICKETS[rank];
      S.g = (S.g || 0) + reward.prize;
      S.trainTix = (S.trainTix || 0) + reward.tickets;
      reward.bagUnlocked = P7.recordRankClear(S, m, rank).bagUnlocked;   // 実績（下位ランクもクリア扱い）
    }
    const pool = [...BONUS_STATS], [lo, hi] = WIN_BONUS_RANGE[rank];
    for (let i = 0; i < WIN_BONUS_COUNT; i++) {
      const key = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
      reward.bonus.push({ key, amount: addStat(m, key, lo + Math.floor(rnd() * (hi - lo + 1))) });
    }
    // 旧来の記録（大会勝利数・ブリーダーランク・個体のランク欄）は「大会優勝1回」として1回だけ更新（個別試合では増やさない）
    S.wins = (S.wins || 0) + 1;
    S.br = Math.max(S.br == null ? -1 : S.br, rank);
    m.rk = Math.max(m.rk || 0, highestCleared(m));
    return reward;
  }
  Object.assign(API, { PRIZE, FIRST_CLEAR_TICKETS, WIN_BONUS_RANGE, WIN_BONUS_COUNT, maxChallengeRank, eligibleRanks, canChallenge, grantTournamentWin });

  // =========================================================
  // 公式ランク大会：総当たりリーグの進行と決着（Step 6。計算は js/phase8/league.js）
  //  大会状態（参加者・勝敗・順位・残り試合）は m.raise.tour に保存し、中断・再開で再抽選しない。
  //  個別試合では報酬を付けず（旧fight()の報酬は finishBattle で戻す）、最終1位のときだけ決着時に1回付与する。
  // =========================================================
  const LG = () => { const x = root.MMP8L; if (!x) throw new Error('MMP8：先に js/phase8/league.js を読み込んでください'); return x; };
  function canStartTournament(S, m, rank) {
    if (!m || m !== S.m || !P7.inChapter(m)) return { ok: false, reason: 'not_in_chapter' };
    const r = m.raise, rule = chapterRule(r.ch);
    if (!rule || !rule.tournament) return { ok: false, reason: 'no_tournament' };
    if (r.tour) return { ok: false, reason: 'already_entered' };   // 各Chapterで大会は1回だけ
    if (!r.goal || r.pend || r.battle) return { ok: false, reason: 'not_at_goal' };
    if (!canChallenge(m, r.ch, rank)) return { ok: false, reason: 'rank_locked' };
    return { ok: true };
  }
  function startTournament(S, m, rank, seed = Math.floor(Math.random() * 0x7fffffff)) {
    const c = canStartTournament(S, m, rank); if (!c.ok) return c;
    m.raise.tour = { rank, status: 'league', league: LG().createLeague(rank, seed, m.name), result: null };
    return { ok: true };
  }
  /** 大会で次に行う自分の試合（無ければ null） */
  function tourNext(m) { const t = m && isObj(m.raise) && m.raise.tour; return t && t.status === 'league' ? LG().playerMatch(t.league) : null; }
  /** リーグ終了時の決着（1大会1回だけ）：最終1位のときだけ正式報酬 */
  function settleTournament(S, m, rnd = Math.random) {
    const t = m.raise.tour;
    if (!t || t.status !== 'league' || !LG().isFinished(t.league)) return {};
    const place = LG().playerPlace(t.league), won = place === 1;
    const reward = won ? grantTournamentWin(S, m, t.rank, rnd) : null;
    t.status = 'settled';
    t.result = { rank: t.rank, place, won, firstClear: !!(reward && reward.firstClear), reward };
    return { settled: true, place, won, reward };
  }
  BATTLE_KINDS.league = {
    begin(S, m, b) { const t = m.raise.tour, pm = tourNext(m); if (!pm || b.rank !== t.rank) return false; b.round = pm.round; return true; },
    finish(S, m, b, won, rnd) {
      const t = m.raise.tour;
      if (!t || t.status !== 'league' || t.league.round !== b.round) return {};
      LG().recordPlayerResult(t.league, won);
      const out = { round: b.round };
      if (LG().isFinished(t.league)) Object.assign(out, settleTournament(S, m, rnd));
      return out;
    },
  };
  Object.assign(API, { canStartTournament, startTournament, tourNext });

  // =========================================================
  // 育成リソース（HUD）と修行チケットマス（Step 7）
  //  修行チケットはバッグ枠外の育成リソース（セーブ全体で所持、Chapterをまたいで保持、修行1回で1枚消費）。
  //  HUDは複数リソースを並べられる形にしておき、今回は修行チケットだけを表示する。
  // =========================================================
  const RESOURCES = [{ id: 'trainTix', icon: '🎫', label: '特訓チケット', get: (S) => S.trainTix || 0 }];
  function registerResource(def) {
    if (!def || typeof def.id !== 'string' || typeof def.get !== 'function') throw new Error('育成リソースの登録が不正です');
    const i = RESOURCES.findIndex((x) => x.id === def.id); if (i >= 0) RESOURCES.splice(i, 1, def); else RESOURCES.push(def);
  }
  const resources = (S) => RESOURCES.map((x) => ({ id: x.id, icon: x.icon, label: x.label, value: x.get(S) }));
  const TICKET_SQUARE_AMOUNT = 1;   // 修行チケットマス：止まると+1枚
  SQUARE_EFFECTS.ticket = (S) => { S.trainTix = (S.trainTix || 0) + TICKET_SQUARE_AMOUNT; return { kind: 'ticket', amount: TICKET_SQUARE_AMOUNT }; };
  Object.assign(API, { TICKET_SQUARE_AMOUNT, registerResource, resources });

  // =========================================================
  // 育成放棄（Step 8）
  //  Chapter進行中・Chapter間ファームのどちらでも可（修行中・戦闘中は不可）。確認画面は index.html 側で2段階。
  //  育成中の個体とその進行を削除して街へ戻る。所持金・修行チケット・バッグ・保管庫・育成数などは特別な処理をしない。
  // =========================================================
  function canAbandon(S) {
    const m = S && S.m;
    if (!m || !P7.isRaising(m)) return { ok: false, reason: 'not_raising' };
    if (P7.trainRunOf(m)) return { ok: false, reason: 'training' };
    if (m.raise.battle) return { ok: false, reason: 'in_battle' };
    return { ok: true };
  }
  /** uid は確認画面を出した個体。違う個体に対しては何もしない */
  function abandon(S, uid) {
    const c = canAbandon(S); if (!c.ok) return c;
    if (uid !== S.m.uid) return { ok: false, reason: 'uid_mismatch' };
    const name = S.m.name; S.m = null;
    return { ok: true, name };
  }
  Object.assign(API, { canAbandon, abandon });

  // =========================================================
  // Phase 9：正式Chapterマップ用のマス（ライフ・宝箱）
  //  能力マスの上昇量は成長適性（2026-10-02 正式。A+7〜E+3）。
  //  宝箱は【暫定】で所持金のみ（正式アイテムが未確定のため）：旧イベント「お宝発見」+50G／「幸運のお守り」+150G と同じ値。
  // =========================================================
  const PROVISIONAL_CHEST = Object.freeze([{ w: 4, gold: 50 }, { w: 1, gold: 150 }]);
  SQUARE_EFFECTS.life = (S, m, rnd) => {
    return { kind: 'stat', key: 'li', amount: addStat(m, 'li', growthGain(m, 'li')) };
  };
  SQUARE_EFFECTS.treasure = (S, m, rnd) => {
    const tot = PROVISIONAL_CHEST.reduce((a, x) => a + x.w, 0); let t = rnd() * tot, pick = PROVISIONAL_CHEST[0];
    for (const x of PROVISIONAL_CHEST) { if (t < x.w) { pick = x; break; } t -= x.w; }
    S.g = (S.g || 0) + pick.gold;
    return { kind: 'gold', ev: 'chest', amount: pick.gold };
  };
  Object.assign(API, { SQUARE_TYPES: Object.freeze(Object.keys(SQUARE_EFFECTS)) });

  // =========================================================
  // 通し試遊の修正（進行上の問題）
  //  1) 育成完了回数：個体が育成完了（done）になった時だけ、1回につき1回加算する（購入・合体・再読込では加算しない）。
  //     セーブ全体の S.raiseRec = { done, fromStart }（セーブversion・保存キーは変えない）。
  //     この版より前のセーブには記録が無く、合体・育成放棄で消えた個体の分は復元できないため推測で埋めない：
  //     0回から数え始め、fromStart:false（記録開始より前の育成完了は含まない）で区別する。
  //  2) 最終ルートのマップが未登録のときだけ：Chapter間ファーム（次＝最終ルート）から育成を完了して街へ戻れる（代替処理）。
  //     最終ルートの内容・ルールは作らない。マップが登録済みなら代替処理は使えず、通常どおり最終ルートへ出発する。
  //     大会結果・賞金・育成記録（log）はそのまま残し、log には「最終ルート未実施」の記録を1件だけ足す。
  // =========================================================
  function normalizeRaiseRec(S) {
    const x = S.raiseRec;
    if (!isObj(x) || !Number.isInteger(x.done) || x.done < 0) S.raiseRec = { done: 0, fromStart: false };
    else if (typeof x.fromStart !== 'boolean') x.fromStart = false;
    return S.raiseRec;
  }
  /** 育成完了回数（ノビトンの入荷条件などに使う。S.cnt＝購入・合体の回数とは別） */
  function raiseDoneCount(S) { const x = S && S.raiseRec; return isObj(x) && Number.isInteger(x.done) && x.done >= 0 ? x.done : 0; }
  /** 育成完了回数を最初から記録しているセーブか（false＝この版より前の育成完了は含まない） */
  const raiseCountFromStart = (S) => !!(S && isObj(S.raiseRec) && S.raiseRec.fromStart === true);
  /** 育成完了の記録（状態が done へ変わる処理＝closeChapter・finishWithoutFinal からだけ呼ぶ） */
  function recordRaiseDone(S) { normalizeRaiseRec(S); S.raiseRec.done += 1; return S.raiseRec.done; }
  function canFinishWithoutFinal(S, m) {
    if (!S || !m || m !== S.m) return { ok: false, reason: 'no_monster' };
    ensureRaise(m);
    const r = m.raise;
    if (r.state !== RAISE.FARM) return { ok: false, reason: 'not_final_farm' };
    if (P7.trainRunOf(m)) return { ok: false, reason: 'training' };
    // 次の Chapter の解放条件（公式ランク大会のクリア実績）に届かない：ここで育成完了（2026-10-01 夜）
    if (r.ch !== FINAL) { const gt = chapterGate(m, r.ch); return gt.ok ? { ok: false, reason: 'not_final_farm' } : { ok: true, reason: 'rank_gate', key: r.ch, need: gt.need, have: gt.have }; }
    if (isPlayable(FINAL)) return { ok: false, reason: 'final_available' };   // 登録済みなら代替処理は使わない
    return { ok: true };
  }
  /** Chapter間ファームから育成を完了する（最終ルートが未登録のとき／次の Chapter の解放条件に届かないとき）。個体・能力・技・所持金・大会の記録はそのまま */
  function finishWithoutFinal(S, m) {
    const c = canFinishWithoutFinal(S, m); if (!c.ok) return c;
    const r = m.raise, entry = c.reason === 'rank_gate' ? { ch: c.key, skipped: true, reason: 'rank_gate', need: c.need } : { ch: FINAL, skipped: true, reason: 'final_unavailable' };
    r.log.push(entry);
    Object.assign(r, { state: RAISE.DONE, ch: null, node: null, turnsUsed: 0, turnLimit: null, pend: null, goal: false, tour: null, battle: null });
    r.endStats = statSnap(m);
    return { ok: true, next: 'done', ...(c.reason ? { reason: c.reason } : {}), entry, raiseDone: recordRaiseDone(S) };
  }
  Object.assign(API, { raiseDoneCount, raiseCountFromStart, canFinishWithoutFinal, finishWithoutFinal });

  // ---- 牧場のモンスター売却用：育成開始時（m.raise.startStats）・育成完了時（m.raise.endStats）の永続能力値 ----
  //  対象はライフ・ちから・かしこさ・命中・回避・丈夫さ（素早さは含めない）。どちらも任意項目（セーブversionは6のまま）。
  //  記録は「未育成→Chapter 1へ出発」と「育成完了」の時だけ。大会の一時効果は個体の能力値に入らないため含まれない。
  const STAT_SNAP_KEYS = Object.freeze(['li', 'po', 'in', 'hi', 'ev', 'de']);
  function statSnap(m) { const o = {}; for (const k of STAT_SNAP_KEYS) o[k] = Number.isFinite(m[k]) ? m[k] : 0; return o; }
  Object.assign(API, { STAT_SNAP_KEYS });

  // @@P8_SECTIONS_END@@
  root.MMP8 = Object.freeze(API);
})(typeof window !== 'undefined' ? window : globalThis);
