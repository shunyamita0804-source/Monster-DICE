// =========================================================
// Chapterフィールドの画面（Chapterフィールドエンジン js/chapter/engine.js の見せ方）
//  「背景に丸いマスを並べたすごろく」にはしない：ノード・つながり・番号は見せず（?chdebug=1 のときだけ点で表示）、
//  背景の道の上をモンスターが1地点ずつ歩き、停止地点（能力の石板・イベントの塔・宝箱・バトルの石碑）は世界の中の物として置く。
//  重ね順：背景 → 環境（奥：y で前後）→ 停止地点・モンスター（y で前後）→ 環境（手前：草・岩）→ 画面の飾り（森の木の葉）→ UI
//  1画面に出すのは今いるフィールド（背景1枚）の素材だけ。次のフィールドの画像は近づいたら先読みし、切り替えたら前の DOM は捨てる。
//  進行（出目・移動・分岐・停止地点・休む・疲れ・セーブ）は MMP8／MMCH。ここは描画と演出と、ボタンからの呼び出しだけ。
//  index.html の board() から、エンジンが担当する Chapter のときだけ chfBoard() が呼ばれる。
// =========================================================
(function (root) {
  'use strict';
  const STEP_MS = 240;              // 1地点ぶんの移動（0.18〜0.30秒）
  const FACING = 'left';            // 正式モンスター画像の向き（右へ進むときだけ左右反転）
  const V = { key: null, field: null, cfg: null, g: null, sc: null, cam: { S: 1, tx: 0, ty: 0 }, facing: 1, skip: null, pre: new Set() };
  const $ = (s) => document.querySelector(s);
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const debug = () => { try { return /(^|[?&])chdebug=1(&|$)/.test(root.location.search); } catch (e) { return false; } };
  const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
  // index.html の let／const（S・save・msv・LAB）は window のプロパティにならないため、名前で直接読む
  const gS = () => { try { return S; } catch (e) { return undefined; } };
  const doSave = () => { try { save(); } catch (e) {} };
  const monHtml = (m) => { try { return msv(m); } catch (e) { return ''; } };
  const labOf = (k) => { try { return LAB[k] || k; } catch (e) { return k; } };

  /** エンジンが担当する Chapter の進行中か */
  function chfActive(m) { return !!(root.MMCH && m && m.raise && P7().inChapter(m) && MMCH.DRIVER.handles(m.raise.ch) && MMCH.fieldOf(m)); }
  const P7 = () => root.MMP7, P8 = () => root.MMP8;
  const asset = (cfg, k) => (cfg.assets && cfg.assets[k]) || '';
  const sceneOf = (cfg, id) => cfg.fieldScenes.find((s) => s.id === id);

  // ---------------------------------------------------------
  // 停止地点の見た目（配置の割り当てから。能力は足元の石板、それ以外は道の脇）
  // ---------------------------------------------------------
  function lookOf(cfg, a) {
    const L = cfg.nodeLook || {};
    if (!a) return null;
    if (a.t === 'stat') return { ...L.stat, key: `stat_${a.k}`, cls: `st st-${a.k}` };
    if (a.t === 'event') return { ...L.event, key: `event_${a.tier || 'normal'}`, cls: `ev ev-${a.tier || 'normal'}` };
    if (a.t === 'treasure') return { ...L.treasure, key: `treasure_${a.tier || 'normal'}`, cls: `tr tr-${a.tier || 'normal'}` };
    if (a.t === 'battle') { const bt = (cfg.battleTypes || {})[a.bt || 'wild'] || {}; return { ...L.battle, key: bt.asset || `battle_${a.bt || 'wild'}`, cls: `bt-${a.bt || 'wild'}` }; }
    return null;
  }
  /** 道の脇の位置：道の向きに直角な方向へ（奥行きで縮める）。道が横向き（大橋の上など）なら手前／奥へずらす */
  function sideOffset(g, sc, id, side, gap) {
    const n = g.nodes[id], prev = Object.keys(g.conn).find((k) => (g.conn[k] || []).includes(id)), next = (g.conn[id] || [])[0];
    const a = prev ? g.nodes[prev] : n, b = next ? g.nodes[next] : n;
    let tx = (b.x - a.x) * sc.w, ty = (b.y - a.y) * sc.h; const len = Math.hypot(tx, ty) || 1; tx /= len; ty /= len;
    let nx = -ty, ny = tx * 0.45;   // 直角方向（上下は奥行きのため浅く）
    const k = Math.hypot(nx, ny) || 1; nx /= k; ny /= k;
    return { dx: nx * side * gap * n.d, dy: ny * side * gap * n.d * 0.6 };
  }

  // ---------------------------------------------------------
  // フィールド（背景1枚ぶん）の DOM
  // ---------------------------------------------------------
  function envHtml(cfg, sc, L, i) {
    const w = L.w, src = asset(cfg, L.asset), front = L.layer === 'front';
    const z = front ? 6000 + i : Math.round(L.y * sc.h), sink = L.sink || 0, h = 0;   // 高さは画像の縦横比（CSS の aspect は img に任せる）
    const hz = L.haze || 0, filt = hz ? `filter:saturate(${(1 - 0.32 * hz).toFixed(3)}) contrast(${(1 - 0.22 * hz).toFixed(3)}) brightness(${(1 + 0.06 * hz).toFixed(3)}) blur(${(hz * 1.1).toFixed(2)}px);` : '';
    const sh = L.shadow ? `<i class="chf-esh" style="--o:${L.shadow}"></i>` : '';
    return `<div class="chf-env${front ? ' fr' : ''}" data-asset="${esc(L.asset)}" style="left:${(L.x * sc.w).toFixed(1)}px;top:${(L.y * sc.h).toFixed(1)}px;width:${w}px;z-index:${z};--sink:${sink}">${sh}<img src="${src}" alt="" draggable="false" decoding="async" style="${filt}${L.flip ? 'transform:scaleX(-1);' : ''}${L.opacity != null ? `opacity:${L.opacity};` : ''}"></div>`;
  }
  function nodeObjHtml(cfg, g, sc, m, id) {
    const f = MMCH.fieldOf(m), a = f.nodeAssignments[id] || (['strong', 'rival'].includes(g.nodes[id].kind) ? { t: 'battle', bt: g.nodes[id].kind } : null), look = lookOf(cfg, a);
    if (!look) return '';
    const n = g.nodes[id], side = look.side === 0 ? 0 : (n.side || 1) * (look.side || 1), off = side ? sideOffset(g, sc, id, side, look.gap || 70) : { dx: 0, dy: 0 };
    const x = n.x * sc.w + off.dx, y = n.y * sc.h + off.dy - (side ? 2 : 0), d = n.d;
    const used = (a.t === 'event' && f.consumedEvents.includes(id)) || (a.t === 'treasure' && f.openedTreasures.includes(id)) || (a.t === 'stat' && f.clearedStats.includes(id));
    const size = look.w ? `width:${(look.w * d).toFixed(1)}px;` : `height:${(look.h * d).toFixed(1)}px;`;
    const z = a.t === 'stat' ? 2 : Math.round(y);
    return `<div class="chf-obj ${look.cls}${used ? ' used' : ''}" data-id="${id}" data-t="${a.t}" style="left:${x.toFixed(1)}px;top:${y.toFixed(1)}px;z-index:${z};--sink:${look.sink || 0};--d:${d}"><i class="chf-osh"></i><img src="${asset(cfg, look.key)}" alt="" draggable="false" decoding="async" style="${size}"></div>`;
  }
  function sceneHtml(m, fieldId) {
    const cfg = MMCH.configFor(m), g = MMCH.graphFor(m), sc = sceneOf(cfg, fieldId);
    const env = (cfg.landmarks[fieldId] || []).map((L, i) => envHtml(cfg, sc, L, i)).join('');
    const ids = g.order.filter((id) => g.nodes[id].field === fieldId), fb = MMCH.fieldOf(m).branch;
    const objs = ids.filter((id) => !(fb && g.nodes[id].branch && g.nodes[id].branch !== fb)).map((id) => nodeObjHtml(cfg, g, sc, m, id)).join('');   // 分岐を選んだ後は、選ばなかった道の物は出さない
    const dbg = debug() ? ids.map((id) => { const n = g.nodes[id]; return `<i class="chf-dbg k-${n.kind}" style="left:${n.x * sc.w}px;top:${n.y * sc.h}px"><b>${id}</b></i>`; }).join('') : '';
    const mh = (cfg.monster && cfg.monster.h) || 176;
    return `<div class="chf-cam" id="chfcam" style="width:${sc.w}px;height:${sc.h}px"><img class="chf-bg" src="${sc.bg}" alt="${esc(sc.name)}" draggable="false">${env}${objs}${dbg}
      <div class="chf-mon" id="bmonw" style="--mh:${mh}px"><i class="chf-msh"></i><div class="chf-flip"><div class="chf-bob"><div class="mon">${monHtml(m)}</div></div></div></div></div>`;
  }
  function overlayHtml(cfg, m) {
    const f = MMCH.fieldOf(m), o = f && f.branch && (cfg.branchOverlays || {})[f.branch];
    return o && o.field === V.field ? `<div class="chf-canopy" style="background-image:url(${asset(cfg, o.asset)});opacity:${o.opacity || 1}"></div>` : '';
  }
  /** 次のフィールドの画像を先読み（1回だけ） */
  function preloadField(cfg, fieldId) {
    const sc = sceneOf(cfg, fieldId); if (!sc || V.pre.has(`${cfg.chapterId}:${cfg.patternId}:${fieldId}`)) return;
    V.pre.add(`${cfg.chapterId}:${cfg.patternId}:${fieldId}`);
    [sc.bg, ...(cfg.landmarks[fieldId] || []).map((L) => asset(cfg, L.asset))].forEach((src) => { const im = new Image(); im.decoding = 'async'; im.src = src; });
  }

  // ---------------------------------------------------------
  // カメラ・モンスター
  // ---------------------------------------------------------
  function zoomAt(sc, d) { const c = sc.depth, dmin = c[c.length - 1][1], t = Math.max(0, Math.min(1, (d - dmin) / (1 - dmin))); return sc.zoom.far + (sc.zoom.near - sc.zoom.far) * t; }
  function camTo(n, instant) {
    const fv = $('#chf'), cam = $('#chfcam'); if (!fv || !cam || !V.sc) return;
    const W = fv.clientWidth, H = fv.clientHeight, sc = V.sc, base = Math.max(W / sc.w, H / sc.h), S = base * zoomAt(sc, n.d);
    const mh = ((V.cfg.monster && V.cfg.monster.h) || 176) * n.d, x = n.x * sc.w, y = n.y * sc.h - mh * 0.45;
    const tx = Math.min(0, Math.max(W - sc.w * S, W / 2 - x * S)), ty = Math.min(0, Math.max(H - sc.h * S, H * 0.56 - y * S));
    V.cam = { S, tx, ty };
    cam.style.transition = instant ? 'none' : `transform ${STEP_MS + 260}ms cubic-bezier(.33,0,.2,1)`;
    cam.style.transform = `translate(${tx.toFixed(1)}px,${ty.toFixed(1)}px) scale(${S.toFixed(4)})`;
    if (instant) { void cam.offsetWidth; cam.style.transition = ''; }
  }
  function placeMon(id, instant) {
    const w = $('#bmonw'), n = V.g && V.g.nodes[id]; if (!w || !n) return;
    const x = n.x * V.sc.w, y = n.y * V.sc.h;
    if (instant) w.style.transition = 'none';
    w.style.left = `${x.toFixed(1)}px`; w.style.top = `${y.toFixed(1)}px`; w.style.zIndex = String(Math.round(y) + 1);
    w.style.setProperty('--d', n.d); w.dataset.node = id;
    if (instant) { void w.offsetWidth; w.style.transition = ''; }
    camTo(n, instant);
  }
  function face(dx) {
    if (Math.abs(dx) < 4) return;
    const right = dx > 0, flip = FACING === 'left' ? right : !right, fl = $('#bmonw .chf-flip');
    if (fl) fl.classList.toggle('r', flip);
  }
  /** 1地点ぶん歩く（別のフィールドへ入るときは、前へ進む向きのフェードで切り替える） */
  async function walkTo(m, id) {
    const n = V.g.nodes[id]; if (!n) return;
    if (n.field !== V.field) { await switchField(m, n.field, id); return; }
    const w = $('#bmonw'), cur = V.g.nodes[w && w.dataset.node]; if (cur) face((n.x - cur.x) * V.sc.w);
    if (w) { w.classList.add('walk'); }
    placeMon(id, false);
    await wait(STEP_MS + 20);
    if (w) w.classList.remove('walk');
    const ov = $('#chf .chf-canopy'), f = MMCH.fieldOf(m);
    if (!ov && f && f.branch && (V.cfg.branchOverlays || {})[f.branch] && V.cfg.branchOverlays[f.branch].field === V.field) { const fv = $('#chf'); if (fv) { fv.insertAdjacentHTML('beforeend', overlayHtml(V.cfg, m)); } }
    const nx = (V.g.conn[id] || []).map((k) => V.g.nodes[k]).find((x) => x && x.field !== V.field); if (nx) preloadField(V.cfg, nx.field);
  }
  async function switchField(m, fieldId, id) {
    const fv = $('#chf'); if (!fv) return;
    const ms = (V.cfg.backgroundTransition || {}).ms || 700;
    fv.classList.add('chf-out'); await wait(ms * 0.48);
    buildScene(m, fieldId); placeMon(id, true);
    fv.classList.remove('chf-out'); fv.classList.add('chf-in'); void fv.offsetWidth; fv.classList.add('chf-in2');
    await wait(ms * 0.52); fv.classList.remove('chf-in', 'chf-in2');
  }
  function buildScene(m, fieldId) {
    const fv = $('#chf'); if (!fv) return;
    V.field = fieldId; V.sc = sceneOf(V.cfg, fieldId);
    fv.querySelectorAll('.chf-cam,.chf-canopy').forEach((e) => e.remove());   // 前のフィールドの DOM は捨てる（画像を積み上げない）
    fv.insertAdjacentHTML('afterbegin', sceneHtml(m, fieldId) + overlayHtml(V.cfg, m));
    const g = V.g, nx = g.order.find((k) => g.nodes[k].field === fieldId + 1); if (nx) preloadField(V.cfg, fieldId + 1);
  }

  // ---------------------------------------------------------
  // HUD・下の操作欄
  // ---------------------------------------------------------
  function hudHtml(m) {
    const r = m.raise, cfg = V.cfg, fat = MMCH.fatigue(m), lv = fat >= 80 ? 'hi' : fat >= 50 ? 'mid' : 'lo';
    return `<header class="chh"><div class="chh-l"><small>Chapter <b>${cfg.chapterId}</b> / ${P7().CHAPTER_COUNT}</small><b class="chh-nm">${esc(cfg.title)}</b><span class="chh-fd" id="chfd">${esc(V.sc ? V.sc.name : '')}</span></div>
      <div class="chh-r"><div class="chh-turn">Turn <b id="chturn">${Math.min(r.turnsUsed + (P8().boardPhase(m) === 'roll' ? 1 : 0), r.turnLimit)}</b><small> / ${r.turnLimit}</small></div>
      <div class="chh-fat f-${lv}" id="chfat"><span>疲れ</span><b>${fat}</b><i style="--f:${fat}%"></i></div></div>
      <button class="p9mbtn chh-menu" onclick="p9Menu()" aria-label="メニュー">☰</button></header>`;
  }
  function refreshHud(m) { const h = $('#chf-ui .chh'); if (h) h.outerHTML = hudHtml(m); }
  function dockHtml(m, ph, msg) {
    const r = m.raise, cfg = V.cfg; let ctl = '', def = '', sheet = '';
    const canRoll = P8().canRoll(m), canRest = P8().canRest(m), tired = ph === 'roll' && !canRoll && MMCH.fatigue(m) >= 100;
    if (ph === 'roll') {
      def = r.turnsUsed === 0 ? `<b>${esc(cfg.title)}</b>　旅のはじまり。サイコロで進む距離が決まる。` : tired ? '疲れがたまって動けない…休もう。' : 'サイコロを振るか、休むかを選ぼう。';
      ctl = `<div class="chbtns"><button class="chb chitem" onclick="chfItems()">アイテム</button><button class="chb chrest${tired ? ' must' : ''}" onclick="chfRest()"${canRest ? '' : ' disabled'}>休む<small>疲れ −${MMCH.rulesOf(cfg).fatigueRules.rest}</small></button>
        <button class="chdice" id="brollbtn" onclick="chfRoll()"${canRoll ? '' : ' disabled'} aria-label="サイコロを振る"><img src="${esc(root.MMCHD ? MMCHD.configure().rollingSprite : '')}" alt=""><span>サイコロ</span></button></div>`;
    } else if (ph === 'move' || ph === 'resolve') { def = '移動中…'; ctl = `<div class="chbtns"><button class="chdice" disabled><span>${r.pend.roll}</span></button></div>`; }
    else if (ph === 'branch') {
      def = `分かれ道だ。どちらへ進む？（のこり${r.pend.left}）`;
      const br = (cfg.branches || []).find((b) => b.at === r.node) || { options: [] };
      sheet = `<div class="chsheet chbr"><h3>分かれ道</h3>${r.pend.opts.map((id) => { const o = br.options.find((x) => x.to === id) || { label: 'この先へ', desc: '' };
        return `<button class="chroute k-${esc(o.id || '')}" onclick="chfPick('${id}')"><b>${esc(o.label)}</b><small>${esc(o.desc)}</small></button>`; }).join('')}</div>`;
    } else if (ph === 'battle') {
      const fx = r.pend.fx || {}, bt = (cfg.battleTypes || {})[fx.battleType || 'wild'] || { label: 'モンスター' };
      def = `${esc(bt.label)}が現れた！`;
      sheet = `<div class="chsheet chbat"><h3>${esc(bt.label)}</h3><p class="p9s">バトルの後は疲れ +${MMCH.rulesOf(cfg).fatigueRules.battle}。賞金・ランクアップはありません。</p><button class="p9btn" onclick="bBattleGo()">バトルする</button><button class="p9btn2" onclick="bBattleSkip()">やめておく</button></div>`;
    } else if (ph === 'goal') { def = '大会門に着いた！'; sheet = `<div class="chsheet chgoal">${root.p8GoalHtml ? root.p8GoalHtml(m) : ''}</div>`; }
    else if (ph === 'timeup') { def = `${r.turnLimit}ターンを使い切った…`; sheet = `<div class="chsheet"><h3>⌛ ターン終了</h3><p class="p9s">ゴールできなかったため、このChapterの公式大会には参加できません。Chapterは終了し、次のChapterへ進めます（育成失敗ではありません）。</p><button class="p9btn" onclick="p8EndChapter()">Chapterを終えてファームへ</button></div>`; }
    return `<div class="chdock" id="chdock">${sheet}<p class="chmsg" id="bmsg">${msg || def}</p>${ctl}</div>`;
  }

  // ---------------------------------------------------------
  // 画面（board() から）
  // ---------------------------------------------------------
  function chfBoard(msg) {
    const m = gS() && gS().m; if (!chfActive(m)) return false;
    const r = m.raise, ph = P8().boardPhase(m), f = MMCH.fieldOf(m);
    V.cfg = MMCH.configFor(m); V.g = MMCH.graphFor(m);
    const node = V.g.nodes[r.node] || V.g.nodes[V.g.start], key = `${m.uid}:${f.chapterId}:${f.patternId}:${f.layoutSeed}`;
    if (root.MMCHD) MMCHD.preload();
    const app = $('#app'), same = V.key === key && V.field === node.field && $('#chf');
    if (!same) {
      V.key = key; V.field = null;
      app.innerHTML = `<div class="chfw"><div class="chf" id="chf"></div><div class="chf-ui" id="chf-ui"></div></div>`;
      buildScene(m, node.field);
      placeMon(r.node, true);
      const w = $('#bmonw'); if (w) w.classList.add('rest');
    } else { const w = $('#bmonw'); if (w && w.dataset.node !== r.node) placeMon(r.node, true); }
    // 停止地点の状態（開けた宝箱・使ったイベント）を反映
    document.querySelectorAll('#chf .chf-obj').forEach((e) => { const id = e.dataset.id; e.classList.toggle('used', f.consumedEvents.includes(id) || f.openedTreasures.includes(id) || f.clearedStats.includes(id)); });
    $('#chf-ui').innerHTML = hudHtml(m) + dockHtml(m, ph, msg);
    // 再開した移動・停止地点の処理は少し後で。その間に別の画面へ移ったら何もしない（次にフィールドを開いたとき1回だけ処理する）
    if (ph === 'move') setTimeout(() => { if (onField()) chfContinue(); }, 300); else if (ph === 'resolve') setTimeout(() => { if (onField()) chfResolve(); }, 300);
    return true;
  }
  const onField = () => !!$('#chf') && !!$('#bmonw');
  function setMsg(t) { const b = $('#bmsg'); if (b) b.innerHTML = t; }
  function lockUi(on) { document.querySelectorAll('#chf-ui button').forEach((b) => { if (on) b.disabled = true; }); }
  const busy = () => root.bBusy || (root.MMCHD && MMCHD.isLocked());

  async function chfRoll() {
    const m = gS() && gS().m; if (!chfActive(m) || busyGet() || !P8().canRoll(m)) return;
    busySet(true); lockUi(true);
    try {
      const r = P8().roll(gS(), m); doSave();   // 出目・ターン消費・疲れは演出の前に確定・保存（中断・再読み込みで振り直せない）
      refreshHud(m); if (root.sfx) root.sfx(7);
      await MMCHD.play(r.value, { host: $('#chf-ui') || document.body });
      setMsg(`${r.value}マス進む。　<small>疲れ +${m.raise.pend ? m.raise.pend.fatigueAdded || 0 : 0}</small>`);
    } finally { busySet(false); }
    chfContinue();
  }
  async function chfContinue() {
    const m = gS() && gS().m; if (!chfActive(m) || busyGet() || !m.raise.pend) return;
    busySet(true);
    try {
      while (m.raise.pend && m.raise.pend.stage === 'move') {
        if (!$('#bmonw')) break;
        const s = P8().step(gS(), m); doSave();
        if (s.node) await walkTo(m, s.node);
      }
    } finally { busySet(false); }
    if (!onField()) return;   // 移動の途中で別の画面へ移った：続きは次にフィールドを開いたとき
    const st = m.raise.pend && m.raise.pend.stage;
    if (st === 'branch') return chfBoard();
    if (st === 'resolve') return chfResolve();
    return chfBoard();
  }
  function chfPick(id) {
    const m = gS() && gS().m; if (!chfActive(m) || busyGet()) return;
    const r = P8().chooseBranch(gS(), m, id); if (!r.ok) return chfBoard(); doSave();
    const sh = $('#chf-ui .chbr'); if (sh) sh.remove();
    const fb = MMCH.fieldOf(m).branch; document.querySelectorAll('#chf .chf-obj').forEach((e) => { const n = V.g.nodes[e.dataset.id]; if (n && n.branch && n.branch !== fb) e.classList.add('gone'); });
    chfContinue();
  }
  async function chfRest() {
    const m = gS() && gS().m; if (!chfActive(m) || busyGet() || !P8().canRest(m)) return;
    busySet(true); lockUi(true);
    let res;
    try {
      const before = MMCH.fatigue(m); res = P8().rest(gS(), m); doSave();
      const w = $('#bmonw'); if (w) { w.insertAdjacentHTML('beforeend', '<i class="chf-zz">Z<small>z</small></i>'); w.classList.add('resting'); }
      refreshHud(m); setMsg(`ひと休みした。　疲れ −${before - MMCH.fatigue(m)}`);
      await wait(900);
      if (w) { w.classList.remove('resting'); const z = w.querySelector('.chf-zz'); if (z) z.remove(); }
    } finally { busySet(false); }
    if (onField()) chfBoard(`ひと休みした。疲れ ${MMCH.fatigue(m)}` + (res && res.timeUp ? '　ターンを使い切った…' : ''));
  }
  // ---- 停止地点の結果（短く。タップで早送り） ----
  function popup(html, cls, ms) {
    const ui = $('#chf-ui'); if (!ui) return wait(0);
    const d = document.createElement('div'); d.className = `chpop ${cls || ''}`; d.innerHTML = html; ui.appendChild(d);
    return new Promise((ok) => { let done = false; const end = () => { if (done) return; done = true; d.classList.add('out'); setTimeout(() => { d.remove(); ok(); }, 160); };
      V.skip = end; setTimeout(end, ms); d.addEventListener('click', end); });
  }
  function fxText(fx, cfg) {
    const L = (k) => labOf(k);
    if (fx.kind === 'chstat') return fx.outcome === 'fail' ? { h: `<small>失敗…</small><b>能力は上がらなかった</b>`, c: 'fail', t: '失敗… 能力は上がらなかった' }
      : fx.outcome === 'great' ? { h: `<small>大成功！</small><b>${L(fx.key)} +${fx.amount}</b>`, c: 'great', t: `大成功！ ${L(fx.key)} +${fx.amount}` } : { h: `<b>${L(fx.key)} +${fx.amount}</b>`, c: 'ok', t: `${L(fx.key)} +${fx.amount}` };
    if (fx.kind === 'treasure') { const tl = { normal: '宝箱', rare: '珍しい宝箱', special: '特別な宝箱' }[fx.tier] || '宝箱', gain = fx.reward && fx.reward.kind === 'gold' ? `+${fx.reward.amount}G` : ''; return { h: `<small>${tl}を開けた！</small><b>${gain || '…'}</b>`, c: `tr tr-${fx.tier}`, t: `${tl}を開けた！ ${gain}` }; }
    if (fx.ev) {
      let eff = '';
      if (fx.kind === 'fatigue') eff = `疲れ −${fx.recovered}`; else if (fx.kind === 'stat') eff = `${L(fx.key)} ${fx.amount >= 0 ? '+' : '−'}${Math.abs(fx.amount)}`;
      else if (fx.kind === 'multi') eff = fx.gains.map((x) => `${L(x.key)}+${x.amount}`).join(' '); else if (fx.kind === 'gold') eff = `+${fx.amount}G`;
      return { h: `<small>${esc(fx.text)}</small><b>${eff}</b>`, c: `ev ev-${fx.tier || 'normal'}`, t: `${fx.text} ${eff}` };
    }
    return null;
  }
  async function chfResolve() {
    const m = gS() && gS().m; if (!chfActive(m) || busyGet() || !onField() || !m.raise.pend || m.raise.pend.stage !== 'resolve') return;
    busySet(true);
    let tail = '';
    try {
      const id = m.raise.node, r = P8().resolveLanding(gS(), m); doSave();
      const fx = r.fx || {}, T = fxText(fx, V.cfg), obj = $(`#chf .chf-obj[data-id="${id}"]`);
      refreshHud(m);
      if (fx.kind === 'chstat' || (fx.ev && fx.kind !== 'none') || fx.kind === 'treasure') {
        if (root.sfx && (fx.kind !== 'chstat' || fx.outcome !== 'fail')) root.sfx(3);
        if (obj) { obj.classList.add('hit'); if (fx.kind === 'treasure') obj.classList.add('open'); }
        setMsg(T ? T.t : '');
        await popup(T ? T.h : '', T ? T.c : '', fx.kind === 'chstat' ? (fx.outcome === 'ok' ? 850 : 1150) : 1300);
        if (obj) { obj.classList.remove('hit'); obj.classList.add('used'); }
        tail = T ? T.t : '';
      }
      if (r.goal) tail = `${tail}　大会門に着いた！`.trim(); else if (r.timeUp) tail = `${tail}　ターンを使い切った…`.trim();
    } finally { busySet(false); }
    if (onField()) chfBoard(tail || undefined);
  }
  // ---- アイテム（疲れ回復）：サイコロを振る前だけ。正式な回復アイテムが登録されていなければ、使えるものは無い ----
  function chfItems() {
    const m = gS() && gS().m; if (!chfActive(m) || busyGet() || P8().boardPhase(m) !== 'roll') return;
    const bag = (gS().inv && gS().inv.bag) || [], list = bag.map((it, i) => ({ it, i, eff: MMCH.fatigueItemEffect(it.id) })).filter((x) => x.eff);
    const ui = $('#chf-ui'); if (!ui) return; chfItemsClose();
    const nm = (id) => (root.p7ItemName ? root.p7ItemName({ id }) : id);
    ui.insertAdjacentHTML('beforeend', `<div class="chsheet chitems" id="chitems"><h3>アイテム</h3>${list.length ? list.map((x) => `<button class="p9btn2" onclick="chfItemUse(${x.i})">${esc(nm(x.it.id))}<small>${x.eff.full ? '疲れ 全回復' : `疲れ −${x.eff.amount}`}</small></button>`).join('') : '<p class="p9s">疲れを回復できるアイテムを持っていません。</p>'}<button class="p9btn2" onclick="chfItemsClose()">閉じる</button></div>`);
  }
  function chfItemsClose() { const d = $('#chitems'); if (d) d.remove(); }
  function chfItemUse(i) { const m = gS() && gS().m; if (!chfActive(m) || busyGet()) return; const r = MMCH.useFatigueItem(gS(), m, i); if (!r.ok) return chfItemsClose(); doSave(); chfBoard(`疲れ −${r.recovered}`); }
  // bBusy は index.html の let（別のスクリプトからも同じ名前で読み書きできる）
  function busyGet() { try { return !!bBusy || !!(root.MMCHD && MMCHD.isLocked()); } catch (e) { return !!(root.MMCHD && MMCHD.isLocked()); } }
  function busySet(v) { try { bBusy = v; } catch (e) {} }
  root.addEventListener && root.addEventListener('resize', () => { const m = gS() && gS().m; if ($('#chf') && chfActive(m)) { const w = $('#bmonw'); if (w && w.dataset.node) placeMon(w.dataset.node, true); } });

  Object.assign(root, { chfActive, chfBoard, chfRoll, chfRest, chfPick, chfContinue, chfResolve, chfItems, chfItemsClose, chfItemUse });
  root.MMCHV = Object.freeze({ STEP_MS, FACING, state: () => ({ field: V.field, cam: { ...V.cam }, key: V.key }), lookOf, sideOffset, zoomAt });
})(typeof window !== 'undefined' ? window : globalThis);
