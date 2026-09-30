// =========================================================
// 共通NPC表示・共通会話（MMNPC）
//  ・NPCの登録（名前・表示の種類 view ごとの表情 expression 画像）と、画像の取り出し（無い表情でも止まらない）
//  ・会話：NPC画像・名前・本文を表示し、本文は1文字ずつ表示（タイプライター）。
//    表示中にタップ＝全文表示／全文表示後にタップ＝次のセリフ／最後のセリフ＝会話終了。
//  画像とセリフは分けて持つ（同じ表情で別のセリフを使える）。行ごとに npc・view・expression・name・side を指定でき、省略すると前の行を引き継ぐ。
//  NPC同士の会話：行ごとに npc を切り替えると、名前・立ち絵・表情がその話者に切り替わる。side（'left'／'right'）で立ち絵と名前の左右を指定できる
//  （省略時はその話者が前に使った側、はじめてなら left）。2人の同時表示は今後の拡張（今は話している1人だけを出す）。
//  選択肢：行に choices（[{ id, label }]）を書くと、全文表示のあとに選択肢を出し、選ぶまで次へ進まない（本文のタップでは進まない）。
//  選んだ id の続き（talk の opts.branches[id] の行）があれば同じ会話ウィンドウで続け、無ければ会話を終える。talk の Promise は選んだ id で解決する（選ばずに終われば null）。
//  重要な意思決定は「フィナがプレイヤーへ確認 → プレイヤーが選択肢で回答 → フィナが NPC との会話を続ける」の形で使う。
//  この仕組みは画面に何も常設しない。呼ばれたときだけ会話ウィンドウを出し、終わったら消す（セーブにも保存しない）。
// =========================================================
(function (root) {
  'use strict';

  /** 文字送りの速さ（1文字あたりのミリ秒）。変更はここ1か所だけ */
  const TYPE_MS = 32;
  /** 1回のタップが二重に処理されないための最短間隔（ミリ秒） */
  const MIN_TAP_MS = 80;
  /** 会話を開いた直後、タップ・キーを受け付けない時間（ミリ秒）。会話を開いた入力（名前欄の Enter／完了、ダブルタップの2打目）を1回目のタップとして扱わない（画面の会話 talk で使う） */
  const OPEN_GUARD_MS = 200;
  /** 選択肢を出してから、押下を受け付けない時間（ミリ秒）。全文表示のタップ・ダブルタップの2打目で選択肢を確定させない（取り返しのつかない選択のため） */
  const CHOICE_GUARD_MS = 350;
  /** 選択肢の押下は、直前のタップ（本文のタップ・無視した押下も含む）から、この時間あいていないと受け付けない（ミリ秒）。会話を送る連打のリズムのまま選択肢を確定させない（2度押しの確認と同じ0.4秒） */
  const CHOICE_GAP_MS = 400;

  // ---------------------------------------------------------
  // NPCの登録
  // ---------------------------------------------------------
  const REG = new Map();
  /**
   * NPCを登録する。def = { name, role, defaultView, defaultExpr, views: { closeup: { normal: src, ... }, fullbody: {...} }, board }
   *  views の画像は、正式素材として存在するものだけを入れる（無い表情を作らない）。
   */
  function register(id, def) {
    if (typeof id !== 'string' || !id || !def || typeof def.name !== 'string') throw new Error('NPCの登録内容が不正です：' + id);
    const views = {}, anims = {};
    for (const [v, ex] of Object.entries(def.views || {})) { views[v] = {}; for (const [e, src] of Object.entries(ex || {})) if (typeof src === 'string' && src) views[v][e] = src; }
    // アニメーション：{ 表示の種類: { 名前: { frames: [画像…], fps, loop } } }。届いたフレームだけを、届いた枚数のまま登録する
    for (const [v, ax] of Object.entries(def.anims || {})) { anims[v] = {}; for (const [a, d] of Object.entries(ax || {})) { const fr = (d && Array.isArray(d.frames) ? d.frames : []).filter((x) => typeof x === 'string' && x); if (fr.length) anims[v][a] = Object.freeze({ frames: Object.freeze(fr), fps: d.fps > 0 ? d.fps : 8, loop: d.loop !== false }); } }
    REG.set(id, Object.freeze({ id, name: def.name, role: def.role || '', board: !!def.board, defaultView: def.defaultView || 'closeup', defaultExpr: def.defaultExpr || 'normal', views, anims }));
    return REG.get(id);
  }
  const get = (id) => REG.get(id) || null;
  const list = () => [...REG.keys()];
  const expressionsOf = (id, view) => { const n = get(id); return n && n.views[view] ? Object.keys(n.views[view]) : []; };
  const animationsOf = (id, view) => { const n = get(id); return n && n.anims[view] ? Object.keys(n.anims[view]) : []; };
  /** アニメーションを取り出す（指定の表示の種類になければ基本の種類から）。無ければ null（静止画で表示を続ける） */
  function animOf(id, view, name) { const n = get(id); if (!n || !name) return null; const v = view || n.defaultView;
    const a = (n.anims[v] && n.anims[v][name]) || (n.anims[n.defaultView] && n.anims[n.defaultView][name]); return a ? { name, frames: a.frames, fps: a.fps, loop: a.loop } : null; }
  /** 登録済みの画像（表情・アニメーション）を先に読み込む */
  function preload(id) { const n = get(id); if (!n || typeof Image === 'undefined') return Promise.resolve([]);
    const src = [...Object.values(n.views).flatMap((x) => Object.values(x)), ...Object.values(n.anims).flatMap((x) => Object.values(x).flatMap((a) => a.frames))];
    return Promise.all(src.map((s) => new Promise((ok) => { const i = new Image(); i.onload = () => ok({ src: s, ok: true, w: i.naturalWidth }); i.onerror = () => ok({ src: s, ok: false }); i.src = s; }))); }

  /**
   * 表示する画像を決める。存在しない表情・表示の種類を指定しても止まらず、次の順で代わりを探す：
   *  指定の種類×指定の表情 → 指定の種類×基本の表情 → 基本の種類×指定の表情 → 基本の種類×基本の表情 → 登録済みの最初の画像 → なし（null）
   */
  function imageOf(id, view, expr) {
    const n = get(id); if (!n) return null;
    const v = view || n.defaultView, e = expr || n.defaultExpr, V = n.views;
    const tries = [[v, e], [v, n.defaultExpr], [n.defaultView, e], [n.defaultView, n.defaultExpr]];
    for (const [a, b] of tries) if (V[a] && V[a][b]) return { src: V[a][b], view: a, expr: b, fallback: !(a === v && b === e) };
    for (const a of Object.keys(V)) for (const b of Object.keys(V[a])) return { src: V[a][b], view: a, expr: b, fallback: true };
    return null;
  }

  // ---------------------------------------------------------
  // 会話の進行（画面に依存しない部分。テストでは時計を差し替えて動かせる）
  // ---------------------------------------------------------
  /** 1文字ずつに分ける（日本語・結合文字・絵文字を1文字として扱う） */
  function splitChars(text) {
    const s = String(text == null ? '' : text);
    try { if (typeof Intl !== 'undefined' && Intl.Segmenter) return [...new Intl.Segmenter('ja', { granularity: 'grapheme' }).segment(s)].map((x) => x.segment); } catch (e) { /* 古い環境は下へ */ }
    return Array.from(s);
  }
  /** 行の指定を解決する（省略した npc・view・expression は前の行を引き継ぐ） */
  function resolveLines(lines) {
    let npc = null, view = null, expr = null; const sideOf = {};
    return (Array.isArray(lines) ? lines : [lines]).filter(Boolean).map((l) => {
      if (typeof l === 'string') l = { text: l };
      if (l.npc !== undefined) { if (l.npc !== npc) { view = null; expr = null; } npc = l.npc; }
      const n = get(npc);
      view = l.view || view || (n ? n.defaultView : null); expr = l.expression || l.expr || expr || (n ? n.defaultExpr : null);
      const img = npc ? imageOf(npc, view, expr) : null, anim = l.anim && npc ? animOf(npc, view, l.anim) : null;   // アニメーションは行ごとの指定（引き継がない）
      const side = l.side === 'right' || l.side === 'left' ? l.side : sideOf[npc] || 'left'; sideOf[npc] = side;   // 話者ごとに左右を覚える
      const choices = Array.isArray(l.choices) ? l.choices.filter((c) => c && typeof c.id === 'string' && c.id && typeof c.label === 'string').map((c) => ({ id: c.id, label: c.label })) : [];
      return { npc, view, expr, side, name: l.name != null ? String(l.name) : (n ? n.name : ''), text: String(l.text == null ? '' : l.text), img, anim, choices: choices.length ? choices : null };
    });
  }
  /**
   * 会話の進行役を作る。opts = { schedule(fn, ms), cancel(id), now(), onUpdate(snapshot), onEnd(choice), openGuardMs, branches: { 選択肢のid: [続きの行…] } }
   *  文字送りのタイマーは常に1つだけ。新しい行へ移る・全文表示・終了のときは必ず前のタイマーを止め、番号（token）の古いタイマーは何もしない。
   *  openGuardMs：start() からこの時間（now() で測る）のタップは無視する（省略時は0＝無視しない）。
   */
  function createTalk(lines, opts = {}) {
    let L = resolveLines(lines); const branches = opts.branches && typeof opts.branches === 'object' ? opts.branches : {};
    const schedule = opts.schedule || ((fn, ms) => setTimeout(fn, ms)), cancel = opts.cancel || ((id) => clearTimeout(id));
    const now = opts.now || (() => Date.now()), typeMs = Number.isFinite(opts.typeMs) ? opts.typeMs : TYPE_MS, guardMs = opts.openGuardMs > 0 ? opts.openGuardMs : 0;
    const st = { idx: -1, chars: [], shown: 0, typing: false, ended: false, timer: null, token: 0, lastTap: -1e9, openedAt: -1e9, fullAt: -1e9, choice: null, lastInput: -1e9 };
    const waiting = () => !st.ended && !st.typing && !!(L[st.idx] && L[st.idx].choices);   // 全文表示のあと、選択肢を選ぶのを待っている
    const stop = () => { if (st.timer != null) { cancel(st.timer); st.timer = null; } };
    const snap = () => { const l = L[st.idx] || {}; return { idx: st.idx, total: L.length, npc: l.npc || null, side: l.side || 'left', name: l.name || '', view: l.img ? l.img.view : l.view || null, expr: l.img ? l.img.expr : l.expr || null,
      img: l.img ? l.img.src : null, fallback: !!(l.img && l.img.fallback), anim: l.anim ? l.anim.name : null, frames: l.anim ? l.anim.frames : null, fps: l.anim ? l.anim.fps : 0, loop: l.anim ? l.anim.loop : false, text: st.chars.slice(0, st.shown).join(''), full: l.text || '', typing: st.typing, ended: st.ended, timer: st.timer != null,
      choices: waiting() ? l.choices.map((c) => ({ ...c })) : null, choice: st.choice }; };
    const emit = () => { if (opts.onUpdate) opts.onUpdate(snap()); };
    function tick(tok) {
      if (tok !== st.token || st.ended) return;   // 前の行・終了後のタイマーは何もしない
      st.timer = null; st.shown = Math.min(st.chars.length, st.shown + 1);
      if (st.shown >= st.chars.length) { st.typing = false; st.fullAt = now(); } else st.timer = schedule(() => tick(tok), typeMs);
      emit();
    }
    function show(i) {
      stop(); st.token++; st.idx = i; st.chars = splitChars(L[i].text); st.shown = 0; st.typing = st.chars.length > 0; if (!st.typing) st.fullAt = now();
      const tok = st.token; if (st.typing) st.timer = schedule(() => tick(tok), typeMs);
      emit();
    }
    function end() { if (st.ended) return; stop(); st.token++; st.ended = true; st.typing = false; emit(); if (opts.onEnd) opts.onEnd(st.choice); }
    function tap() {
      if (st.ended) return 'ended';
      const t = now(); st.lastInput = t; if (t >= st.openedAt && t - st.openedAt < guardMs) return 'ignored';   // 開いた直後：会話を開いた入力の続き（連打の間隔の記録にも入れない。時計が戻っても止まらない）
      if (t - st.lastTap < MIN_TAP_MS) return 'ignored'; st.lastTap = t;
      if (st.typing) { stop(); st.token++; st.shown = st.chars.length; st.typing = false; st.fullAt = t; emit(); return 'full'; }   // 表示中：全文表示
      if (waiting()) return 'choice';   // 選択肢を待っている：本文のタップでは進まない
      if (st.idx < L.length - 1) { show(st.idx + 1); return 'next'; }   // 全文表示後：次のセリフ
      end(); return 'end';   // 最後のセリフ：会話終了
    }
    /** 選択肢を選ぶ。続き（branches[id]）があれば同じ会話で続け、無ければ会話を終える */
    function choose(id) {
      if (st.ended) return 'ended';
      if (!waiting()) return 'ignored';
      const t = now(), gap = t - st.lastInput; st.lastInput = t;
      if (t - st.fullAt < CHOICE_GUARD_MS || gap < CHOICE_GAP_MS) return 'ignored';   // 選択肢が出た直後・連打のリズムの押下は確定させない（手を止めてから押す）
      if (!L[st.idx].choices.some((c) => c.id === id)) return 'ignored';
      st.choice = id; const more = resolveLines(branches[id] || []);
      L = L.slice(0, st.idx + 1).concat(more); api.lines = L;
      if (more.length) { show(st.idx + 1); return 'next'; }
      end(); return 'end';
    }
    function start() { st.openedAt = now(); if (!L.length) { end(); return api; } show(0); return api; }
    const api = { start, tap, choose, end, state: snap, lines: L };
    return api;
  }

  // ---------------------------------------------------------
  // 会話ウィンドウ（画面）
  // ---------------------------------------------------------
  let CUR = null;   // いま開いている会話（同時に1つだけ）
  const ANIM = { timer: null, key: '', name: '', frame: 0 };   // 会話中の立ち絵アニメーション（同時に1つだけ）
  function stopAnim() { if (ANIM.timer != null) { clearInterval(ANIM.timer); ANIM.timer = null; } ANIM.key = ''; ANIM.name = ''; ANIM.frame = 0; }
  function h(tag, cls) { const e = document.createElement(tag); if (cls) e.className = cls; return e; }
  /**
   * 会話を表示する。lines = [{ npc:'fina', view:'closeup', expression:'smile', text:'…' }, …]（name で名前を上書き可）。
   *  会話が終わると解決する Promise を返す（選択肢があれば選んだ id、無ければ null）。opts.branches＝選択肢ごとの続きの行。すでに会話中なら、前の会話をきちんと終わらせてから始める。
   */
  function talk(lines, opts = {}) {
    if (typeof document === 'undefined') return Promise.resolve();
    close();
    return new Promise((resolve) => {
      const ov = h('div', 'mmtalk'), stage = h('div', 'mmtalk-stage'), fig = h('div', 'mmtalk-fig'), img = h('img'), win = h('div', 'mmtalk-win'), nm = h('div', 'mmtalk-name'), tx = h('p', 'mmtalk-text'), nx = h('span', 'mmtalk-next'), ch = h('div', 'mmtalk-choices');
      ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); img.alt = ''; img.draggable = false; nx.textContent = '▼'; nx.setAttribute('aria-hidden', 'true');
      ch.hidden = true; ch.setAttribute('role', 'group'); let chKey = '';
      fig.appendChild(img); win.append(nm, tx, ch, nx); stage.append(fig, win); ov.appendChild(stage); document.body.appendChild(ov);
      const onKey = (e) => { if (e.key === 'Enter' || e.key === ' ') { if (e.target && e.target.closest && e.target.closest('.mmtalk-choices')) return;   // 選択肢のボタン上ではボタンの操作に任せる
        e.preventDefault(); c.tap(); } };
      let keyT = null;   // keydown を受け付け始めるタイマー（会話を開いたキー操作そのものは会話に届けない）
      const c = createTalk(lines, {
        openGuardMs: OPEN_GUARD_MS,   // ダブルタップの2打目（会話を開いたタップの続き）などで、1行目の文字送りを飛ばさない
        onUpdate(s) {
          if (s.ended) return;
          ov.dataset.npc = s.npc || ''; stage.dataset.side = s.side || 'left'; fig.className = 'mmtalk-fig ' + (s.view || 'closeup'); fig.hidden = !(s.img || s.frames);   // アニメーションだけのNPCでも立ち絵を隠さない
          const key = s.frames ? `${s.idx}:${s.anim}` : '';
          if (key !== ANIM.key) { stopAnim(); if (s.frames) { ANIM.key = key; ANIM.name = s.anim; s.frames.forEach((f) => { const p = new Image(); p.src = f; });
            img.src = s.frames[0]; fig.hidden = false; const fr = s.frames, loop = s.loop;
            ANIM.timer = setInterval(() => { if (ANIM.key !== key) return; if (ANIM.frame >= fr.length - 1 && !loop) { clearInterval(ANIM.timer); ANIM.timer = null; return; } ANIM.frame = (ANIM.frame + 1) % fr.length; img.src = fr[ANIM.frame]; }, Math.round(1000 / s.fps)); } }
          if (!s.frames && s.img && img.getAttribute('src') !== s.img) img.src = s.img;
          img.alt = s.name ? `${s.name}（${s.expr || ''}）` : '';
          nm.textContent = s.name; nm.hidden = !s.name; tx.textContent = s.text; win.setAttribute('aria-label', (s.name ? s.name + '：' : '') + s.full); nx.hidden = s.typing || !!s.choices;
          const k = s.choices ? s.idx + ':' + s.choices.map((x) => x.id).join(',') : '';   // 選択肢は全文表示のあとだけ（▼の代わり）
          if (k !== chKey) { chKey = k; ch.textContent = ''; ch.hidden = !s.choices;
            if (s.choices) for (const x of s.choices) { const bt = h('button', 'mmtalk-choice'); bt.type = 'button'; bt.textContent = x.label; bt.dataset.choice = x.id;
              bt.addEventListener('click', (e) => { e.stopPropagation(); c.choose(x.id); }); ch.appendChild(bt); } }
        },
        onEnd(choice) { stopAnim(); clearTimeout(keyT); document.removeEventListener('keydown', onKey); if (ov.animate && ov.classList && !ov.__instant) { ov.classList.add('mmtalk-out'); const a = ov.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: 'ease-in', fill: 'forwards' }); const done = () => { ov.remove(); resolve(choice == null ? null : choice); }; a.finished.then(done, done); } else { ov.remove(); resolve(choice == null ? null : choice); } if (CUR && CUR.c === c) CUR = null; },   // 退場：短くフェード（急に消さない）。Promise はフェードが終わって DOM を消してから解決する（次の画面が会話の上に出ない・会話の要素が残らない）。220ms 後に DOM から外す
        branches: opts.branches,
      });
      ov.addEventListener('click', (e) => { e.stopPropagation(); c.tap(); });
      keyT = setTimeout(() => { keyT = null; document.addEventListener('keydown', onKey); }, 0);   // 名前欄の Enter で開いたとき、その同じ keydown が document へ伝わって1行目を飛ばさないよう、次のタスクから受け付ける
      CUR = { c, ov };
      c.start();
    });
  }
  /** 開いている会話を終わらせる（タイマーも止める） */
  function close() { if (CUR) { const x = CUR; CUR = null; if (x.ov) x.ov.__instant = true; x.c.end(); } }   // 途中で閉じる（次の会話を開く・画面を切り替える）ときはフェードせず即座に消す（ウィンドウを2つ重ねない）
  const state = () => (CUR ? CUR.c.state() : null);
  const animState = () => ({ running: ANIM.timer != null, name: ANIM.name, frame: ANIM.frame });
  /** 既存NPC会話（index.html の NP 形式：{ n: 名前, t: [セリフ…] }）を、文章を変えずに共通会話の行へ変換する */
  const fromLegacy = (entry, idx) => (entry && Array.isArray(entry.t) ? (idx || entry.t.map((_, i) => i)).filter((i) => typeof entry.t[i] === 'string').map((i) => ({ name: entry.n, text: entry.t[i] })) : []);

  // ---------------------------------------------------------
  // 登録済みNPC
  // ---------------------------------------------------------
  // フィナ：主要な案内役（Chapterボードには置かない）。正式素材（上半身の透過PNG）を assets/npc/fina/ に置いている（README.md に元画像との対応）。
  //  全身（fullbody）は正式素材が未着のため空。fullbody を指定しても上半身（closeup）で代わりに表示する。
  const FINA = 'assets/npc/fina/', FE = ['normal', 'smile', 'happy', 'surprised', 'troubled', 'worried', 'serious', 'guide'], fr = (a) => [1, 2, 3, 4, 5, 6].map((i) => `${FINA}animations/${a}/${a}_0${i}.webp`);
  register('fina', { name: 'フィナ', role: '案内役', board: false, defaultView: 'closeup', defaultExpr: 'normal',
    views: { closeup: Object.fromEntries(FE.map((e) => [e, `${FINA}closeup/${e}.webp`])), fullbody: {} },
    anims: { closeup: { wave: { frames: fr('wave'), fps: 8, loop: true }, wave_blink: { frames: fr('wave_blink'), fps: 6, loop: true } } } });

  // カレン：市場担当（アップ画像のみで運用。全身は使わない）。正式素材（背景を透明にした透過PNG）を assets/npc/karen/closeup/ に置いている（README.md に元画像との対応）
  const KAREN = 'assets/npc/karen/closeup/', KE = ['normal', 'smile', 'guide', 'troubled', 'happy', 'serious'];
  register('karen', { name: 'カレン', role: '市場担当', board: false, defaultView: 'closeup', defaultExpr: 'normal',
    views: { closeup: Object.fromEntries(KE.map((e) => [e, `${KAREN}${e}.webp`])) } });

  // ダン：ファーム担当（旧「コウ」の表示を置き換え。アップ画像のみで運用）。正式素材（透過PNG）を assets/npc/dan/closeup/ に置いている（README.md に元画像との対応）
  const DAN = 'assets/npc/dan/closeup/', DE = ['normal', 'smile', 'guide', 'serious', 'troubled', 'happy'];
  register('dan', { name: 'ダン', role: 'ファーム担当', board: false, defaultView: 'closeup', defaultExpr: 'normal',
    views: { closeup: Object.fromEntries(DE.map((e) => [e, `${DAN}${e}.webp`])) } });

  // ニック：牧場の管理者（アップ画像のみで運用）。正式素材（描き込まれた市松模様の背景を透明にした透過PNG）を assets/npc/nick/closeup/ に置いている（README.md に元画像との対応）
  const NICK = 'assets/npc/nick/closeup/', NE = ['normal', 'smile', 'guide', 'troubled', 'happy', 'serious'];
  register('nick', { name: 'ニック', role: '牧場の管理者', board: false, defaultView: 'closeup', defaultExpr: 'normal',
    views: { closeup: Object.fromEntries(NE.map((e) => [e, `${NICK}${e}.webp`])) } });

  // セドリック：公式ランク大会の進行役（アップ画像のみで運用）。正式素材（描き込まれた市松模様の背景を透明にした透過PNG）を assets/npc/cedric/closeup/ に置いている（README.md に元画像との対応）
  const CEDRIC = 'assets/npc/cedric/closeup/', CE = ['normal', 'smile', 'guide', 'happy', 'surprised', 'serious'];
  register('cedric', { name: 'セドリック', role: '公式ランク大会の進行役', board: false, defaultView: 'closeup', defaultExpr: 'normal',
    views: { closeup: Object.fromEntries(CE.map((e) => [e, `${CEDRIC}${e}.webp`])) } });

  // エリオット：研究所の案内・研究・解析を担当する研究者（アップ画像のみで運用）。正式素材（背景の無地の灰色を透明にした透過PNG）を assets/npc/elliot/closeup/ に置いている（README.md に元画像との対応）
  const ELLIOT = 'assets/npc/elliot/closeup/', EE = ['normal', 'smile', 'guide', 'thinking', 'curious', 'serious'];
  register('elliot', { name: 'エリオット', role: '研究所の研究者', board: false, defaultView: 'closeup', defaultExpr: 'normal',
    views: { closeup: Object.fromEntries(EE.map((e) => [e, `${ELLIOT}${e}.webp`])) } });

  // ヴァルガス：闘技場の管理者（アップ画像のみで運用）。正式素材（描き込まれた市松模様の背景を透明にした透過PNG）を assets/npc/vargas/closeup/ に置いている（README.md に元画像との対応）
  const VARGAS = 'assets/npc/vargas/closeup/', VE = ['normal', 'guide', 'stern', 'approval', 'surprised', 'respect'];
  register('vargas', { name: 'ヴァルガス', role: '闘技場の管理者', board: false, defaultView: 'closeup', defaultExpr: 'normal',
    views: { closeup: Object.fromEntries(VE.map((e) => [e, `${VARGAS}${e}.webp`])) } });

  // ゲンシン：特訓の指導役（5種類すべての特訓を担当。アップ画像のみで運用）。正式素材（描き込まれた市松模様の背景を透明にした透過PNG）を assets/npc/genshin/closeup/ に置いている（README.md に元画像との対応）
  const GENSHIN = 'assets/npc/genshin/closeup/', GE = ['normal', 'smile', 'guide', 'serious', 'strict', 'praise'];
  register('genshin', { name: 'ゲンシン', role: '特訓の指導役', board: false, defaultView: 'closeup', defaultExpr: 'normal',
    views: { closeup: Object.fromEntries(GE.map((e) => [e, `${GENSHIN}${e}.webp`])) } });

  root.MMNPC = Object.freeze({ TYPE_MS, MIN_TAP_MS, register, get, list, expressionsOf, animationsOf, imageOf, animOf, preload, splitChars, resolveLines, createTalk, talk, close, state, animState, fromLegacy });
})(typeof window !== 'undefined' ? window : globalThis);
