// =========================================================
// Chapterフィールドの画面（Chapterフィールドエンジン js/chapter/engine.js の見せ方）
//  「すごろくの駒が動く画面」ではなく「育てているモンスターと一緒にフィールドを旅する画面」にする。
//  ・ノード・線・番号・通常の地点は見せない（?chdebug=1 のときだけ点と道筋を出す）。内部は node 式のまま。
//  ・カメラ：モンスターを画面の中央より少し下に置き、進む向きの先を多く見せる（三人称の「一緒に先を見ている」構図）。
//    移動が始まると少し遅れて追いかけ（followDelay）、進行方向へ先読み（lookAhead）、移動中は少し引き（zoom.move）、着いたら軽く寄る（zoom.stop）。
//    停止地点（石碑・宝箱・イベント）に着いたときだけ、その物のほうへ少し寄る（focus）。分岐では少し引いて2つの道を見せる。
//  ・視差：遠景（背景の上の帯）・奥の環境素材・道（背景＋停止地点＋モンスター）・手前の草や岩を、少しずつ違う速さで動かす（config.parallax）。
//  ・歩き：道の曲線（MMCH.routeBetween）に沿って歩く。出目が決まると約0.1秒の構え → 加速 → 地点ごとに距離・地形で速さが変わる → 最後の20〜30%で減速 → 着地。
//    見た目（上下動・前傾・向き・影）は monsterAnimator（既定は CSS のクラス）。正式な歩行アニメが届いたら registerMonsterAnimator で差し替えるだけ。
//  ・停止地点：モンスターは道の上の点（node.mx/my）に止まり、目印（石碑・宝箱・木陰など）は道の脇（landmarkPos）に置く。二つの位置は別。
//    能力＝道端の古代石碑（普段は光らず、止まった時だけ0.6秒光る）、イベント＝内容に応じた自然物（config.eventPool[].asset）、宝箱＝草むらの脇、
//    バトル＝目印を置かない（着いた時に草むらが揺れて現れる）。ライバルは config.battleTypes.rival.figure（asset key）で立ち姿を置ける（今は素材なし）。
//  ・背景の切り替え：フィールドの端まで歩く → カメラが前へ → 短い暗転 → 次のフィールドの入口の少し手前から歩いて入る（向きを保つ）。
//  ・下の操作欄（command deck）：中央の START（1タップでサイコロを振る）、4コマンド（アイテム・休む・技設定・ステータス）。
//    サイコロは START を押すまで画面に出さない（2026-10-01）。START → 出目・ターン・疲れを確定して保存 → サイコロが出現して回り、自動で減速して停止面 → 移動 → 消える → START が押せる。
//    STOP の操作は廃止（MMCHD の manualStop は使わない）。START は演出・移動・停止処理が終わるまで押せない（busy ＋ disabled）。
//  ・道の安全域：モンスターの x は常に背景ごとの道の中央線の安全域（fieldScenes[].road → MMCH.clampToRoad）に収める（setMonPos。歩きの途中も同じ）。
//  重ね順（.chf-cam の中）：遠景の帯（far）→ 背景 → 奥の環境（back）→ 道（背景の上の物・モンスター：足元の y で前後）→ 手前の環境（front）→ 効果（fx）。UI は .chf-ui。
//  進行（出目・移動・分岐・停止地点・休む・疲れ・セーブ）は MMP8／MMCH。ここは描画と演出と、ボタンからの呼び出しだけ。
//  index.html の board() から、エンジンが担当する Chapter のときだけ chfBoard() が呼ばれる。
// =========================================================
(function (root) {
  'use strict';
  const STEP_MS = 260;              // 1地点ぶんの移動の基準（距離・地形で 200〜350ms に変わる）
  const FACING = 'left';            // 正式モンスター画像の向き（右へ進むときだけ左右反転）
  // 既定の見せ方（config.motion／config.camera／config.parallax で上書きできる。Chapter・Pattern ごとの座標の特別扱いは書かない）
  const DEF = {
    motion: { stepMs: 430, minMs: 320, maxMs: 620, baseLen: 150, windupMs: 100, landMs: 170, enterMs: 300, fadeMs: 320,
      terrain: { grass: { speed: 1 }, slope: { speed: 0.86 }, bridge: { speed: 1, fixed: true }, forest: { speed: 0.9 }, highland: { speed: 0.92 } } },
    camera: { anchorY: 0.64, lookAhead: 0.11, followDelay: 110, followTau: 150, settleTau: 240, zoomTau: 240, focusMix: 0.38,
      zoom: { idle: 1, move: 0.98, stop: 1.02, branch: 0.93, focus: 1.03 } },
    parallax: { far: 0.94, back: 0.97, road: 1, front: 1.14, canopy: 0.6 },
  };
  const V = { key: null, field: null, cfg: null, g: null, sc: null, cam: { x: 0, y: 0, z: 1, S: 1, tx: 0, ty: 0 }, tgt: { x: 0, y: 0, z: 1 }, par0: null, raf: 0, last: 0, hold: 0,
    moving: false, intro: false, facing: 1, look: [0, -1], focus: null, skip: null, pre: new Set(), monPos: null, calm: false, animator: null, seedTuft: 1 };
  const $ = (s) => document.querySelector(s);
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const debug = () => { try { return /(^|[?&])chdebug=1(&|$)/.test(root.location.search); } catch (e) { return false; } };
  const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const calmMode = () => !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  // index.html の let／const（S・save・msv・LAB）は window のプロパティにならないため、名前で直接読む
  const gS = () => { try { return S; } catch (e) { return undefined; } };
  const doSave = () => { try { save(); } catch (e) {} };
  // 歩行スプライトの種族は全コマを重ねて置き、見せるコマだけ切り替える（src を差し替えない＝再読み込み・ちらつきなし。停止の絵が先頭）
  const monHtml = (m) => { const sp = spriteSetOf(m); if (sp) { const I = sp.idle || 0, ord = [I, ...sp.frames.map((_, i) => i).filter((i) => i !== I)]; return `<span class="chf-spr" data-f="${I + 1}" style="--sprh:${sp.h || 0.9}">${ord.map((i) => `<img src="${esc(sp.frames[i])}" data-i="${i}" class="${i === I ? 'on' : ''}" alt="" draggable="false" decoding="async">`).join('')}</span>`; } try { return msv(m); } catch (e) { return ''; } };
  /** 歩行スプライト（config.monsterSprites[種族キー].walk＝{ frames:[…], fps, idle, h, noFlip }）。無い種族は従来の画像＋CSS の上下動 */
  function spriteSetOf(m) {
    const cfg = V.cfg || (root.MMCH && m ? MMCH.configFor(m) : null), P = root.MMP10M, key = P && m ? P.keyOf(m.sp) : null;
    const set = cfg && cfg.monsterSprites && key ? cfg.monsterSprites[key] : null;
    return set && set.walk && Array.isArray(set.walk.frames) && set.walk.frames.length ? set.walk : null;
  }
  const labOf = (k) => { try { return LAB[k] || k; } catch (e) { return k; } };

  /** エンジンが担当する Chapter の進行中か */
  function chfActive(m) { return !!(root.MMCH && m && m.raise && P7().inChapter(m) && MMCH.DRIVER.handles(m.raise.ch) && MMCH.fieldOf(m)); }
  const P7 = () => root.MMP7, P8 = () => root.MMP8;
  const asset = (cfg, k) => (cfg.assets && cfg.assets[k]) || '';
  const sceneOf = (cfg, id) => cfg.fieldScenes.find((s) => s.id === id);
  /** 演出の素材（config.effects[key] → config.assets[その値]）。無ければ null＝今までどおりの表示 */
  const effectAsset = (key) => { const c = V.cfg; if (!c || !key) return null; const k = (c.effects || {})[key] || key; return (c.assets || {})[k] || null; };
  const MO = () => ({ ...DEF.motion, ...((V.cfg && V.cfg.motion) || {}), terrain: { ...DEF.motion.terrain, ...(((V.cfg && V.cfg.motion) || {}).terrain || {}) } });
  // カメラ：既定 ← config.camera（Pattern 全体）← fieldScenes[].camera（背景ごとの上書き）
  const CA = () => { const c = (V.cfg && V.cfg.camera) || {}, s = (V.sc && V.sc.camera) || {}; return { ...DEF.camera, ...c, ...s, zoom: { ...DEF.camera.zoom, ...(c.zoom || {}), ...(s.zoom || {}) } }; };
  const PX = () => ({ ...DEF.parallax, ...((V.cfg && V.cfg.parallax) || {}) });
  const monH = () => ((V.cfg && V.cfg.monster && V.cfg.monster.h) || 176);

  // ---------------------------------------------------------
  // 停止地点の見た目（配置の割り当てから）。目印の位置は道の脇（モンスターの止まる位置とは別）
  // ---------------------------------------------------------
  function lookOf(cfg, a) {
    const L = cfg.nodeLook || {};
    if (!a) return null;
    if (cfg.tileUI && cfg.tileUI.replacesLandmarks && ['stat', 'event', 'treasure'].includes(a.t)) {   // マスUIが種別を示す：同じ意味の旧目印は出さない
      const ch = a.t === 'treasure' && (cfg.tileUI.chests || {})[a.tier || 'normal'];   // 宝箱の正式素材（tier ごと。無い tier は出さない）
      return ch ? { ...L.treasure, w: ch.w || (L.treasure || {}).w, key: ch.closed, openKey: ch.open, cls: `tr tr-${a.tier || 'normal'} chest` } : null;
    }
    if (a.t === 'stat') return { ...L.stat, key: `stat_${a.k}`, cls: `st st-${a.k}` };
    if (a.t === 'event') {
      const e = (cfg.eventPool || []).find((x) => x.id === a.ev), tier = a.tier || 'normal';
      const nat = e && e.asset ? { ...(L.eventNature || L.event), key: e.asset, ...(e.look || {}) } : { ...L.event, key: `event_${tier}`, ...((e && e.look) || {}) };   // 内容に応じた自然物（無ければ tier の目印を小さく）
      return { ...nat, cls: `ev ev-${tier}${e && e.asset ? ' nat' : ''}` };
    }
    if (a.t === 'treasure') return { ...L.treasure, key: `treasure_${a.tier || 'normal'}`, cls: `tr tr-${a.tier || 'normal'}` };
    if (a.t === 'battle') {
      const bt = (cfg.battleTypes || {})[a.bt || 'wild'] || {};
      if (bt.figure && asset(cfg, bt.figure)) return { ...(L.figure || L.battle), key: bt.figure, cls: `fig fig-${a.bt}` };   // ライバル本人など（素材が届いたら config だけ）
      if (cfg.battleMarkers) return { ...L.battle, key: bt.asset || `battle_${a.bt || 'wild'}`, cls: `bt-${a.bt || 'wild'}` };   // 旧：石碑を常設（既定では出さない）
      return null;   // バトルは目印を置かない（着いた時に草むらが揺れて現れる）
    }
    return null;
  }
  /** 道の向き（曲線の接線。無ければ前後のノード） */
  function tangentAt(g, sc, id) {
    const n = g.nodes[id], c = g.curves[n.path];
    let a = n, b = n;
    if (c) { const i = c.s.findIndex((s) => s >= n.s); const p0 = c.pts[Math.max(0, i - 1)], p1 = c.pts[Math.min(c.pts.length - 1, i + 1)]; a = { x: p0[0], y: p0[1] }; b = { x: p1[0], y: p1[1] }; }
    else { const prev = Object.keys(g.conn).find((k) => (g.conn[k] || []).includes(id)), next = (g.conn[id] || [])[0]; a = prev ? g.nodes[prev] : n; b = next ? g.nodes[next] : n; }
    let tx = (b.x - a.x) * sc.w, ty = (b.y - a.y) * sc.h; const len = Math.hypot(tx, ty) || 1; return [tx / len, ty / len];
  }
  /** 道の脇の位置：道の向きに直角な方向へ（奥行きで縮める）。道が横向き（橋の上など）なら手前／奥へずらす */
  function sideOffset(g, sc, id, side, gap) {
    const n = g.nodes[id], [tx, ty] = tangentAt(g, sc, id);
    let nx = -ty, ny = tx * 0.45;   // 直角方向（上下は奥行きのため浅く）
    let k = Math.hypot(nx, ny) || 1; nx /= k; ny /= k;
    // 道が横へ曲がる所（急なカーブ）でも目印は道の横へ（真上・真下に置くとモンスターと重なる）。まっすぐな道（|nx|≒1）は変わらない
    if (Math.abs(nx) < 0.9) { nx = (nx < 0 ? -1 : 1) * 0.9; ny = Math.sign(ny || 1) * Math.sqrt(1 - 0.81); }
    return { dx: nx * side * gap * n.d, dy: ny * side * gap * n.d * 0.6 };
  }
  /** 目印の足元の位置（背景の画素）と大きさ。node.lm（config.nodeOverrides）があればそれを優先 */
  function landmarkPos(cfg, g, sc, id, look) {
    const n = g.nodes[id], o = n.lm || {}, P = (cfg.paths || []).find((p) => p.id === n.path) || {}, PL = P.landmark || {};   // 道ごとの置き方（橋の上では欄干ぎわ＝gapScale を小さく）
    const side = look.side === 0 ? 0 : PL.fixedSide ? PL.fixedSide : (PL.side || n.side || 1) * (look.side || 1),   // fixedSide：その道の物はいつもその側（分岐の左右の道＝外側。もう一方の道へはみ出さない）
      off = side ? sideOffset(g, sc, id, side, (look.gap || 96) * (PL.gapScale || 1)) : { dx: 0, dy: 0 };
    const x = o.x != null ? o.x * sc.w : n.x * sc.w + off.dx, y = o.y != null ? o.y * sc.h : n.y * sc.h + off.dy;
    const d = (o.depth != null ? o.depth : n.d) * (o.scale || 1);
    return { x, y, d, side, opacity: o.opacity != null ? o.opacity : (look.opacity != null ? look.opacity : 1), anchor: o.anchor || look.anchor || 'foot' };
  }

  // ---------------------------------------------------------
  // フィールド（背景1枚ぶん）の DOM
  // ---------------------------------------------------------
  const rnd01 = () => { V.seedTuft = (V.seedTuft * 1664525 + 1013904223) >>> 0; return V.seedTuft / 4294967296; };
  /** 足元を隠す草（手前の草の帯から一部を切り出す。config.assets.grass_front） */
  function tuftHtml(cfg, w) {
    const src = asset(cfg, (cfg.nodeLook && cfg.nodeLook.tuft) || 'grass_front'); if (!src) return '';
    return `<i class="chf-tuft" style="width:${(w * 1.15).toFixed(0)}px;background-image:url(${src});background-position:${(-rnd01() * 700).toFixed(0)}px 100%"></i>`;
  }
  function envHtml(cfg, sc, L, i) {
    const w = L.w, src = asset(cfg, L.asset), front = L.layer === 'front';
    const z = front ? 6000 + i : Math.round(L.y * sc.h), sink = L.sink || 0;   // 高さは画像の縦横比（CSS の aspect は img に任せる）
    const hz = L.haze || 0, filt = hz ? `filter:saturate(${(1 - 0.32 * hz).toFixed(3)}) contrast(${(1 - 0.22 * hz).toFixed(3)}) brightness(${(1 + 0.06 * hz).toFixed(3)}) blur(${(hz * 1.1).toFixed(2)}px);` : '';
    const sh = L.shadow ? `<i class="chf-esh" style="--o:${L.shadow}"></i>` : '';
    return `<div class="chf-env${front ? ' fr' : ''}" data-asset="${esc(L.asset)}" style="left:${(L.x * sc.w).toFixed(1)}px;top:${(L.y * sc.h).toFixed(1)}px;width:${w}px;z-index:${z};--sink:${sink}">${sh}<img src="${src}" alt="" draggable="false" decoding="async" style="${filt}${L.flip ? 'transform:scaleX(-1);' : ''}${L.opacity != null ? `opacity:${L.opacity};` : ''}"></div>`;
  }
  /** 手前を横切る草・岩（config.foreground[field]）：道の少し手前に置き、モンスターが通るとき一瞬手前を横切る */
  function fgHtml(cfg, sc, F, i) {
    const src = asset(cfg, F.asset); if (!src) return '';
    const w = F.w || 220, h = F.h || Math.round(w * 0.34), y = F.y * sc.h;
    return `<i class="chf-fg" data-asset="${esc(F.asset)}" style="left:${(F.x * sc.w).toFixed(1)}px;top:${y.toFixed(1)}px;width:${w}px;height:${h}px;z-index:${Math.round(y) + 2};background-image:url(${src});background-position:${(-(F.slice || 0) * 700).toFixed(0)}px 100%;${F.flip ? 'transform:translate(-50%,-100%) scaleX(-1);' : ''}${F.opacity != null ? `opacity:${F.opacity};` : ''}"></i>`;
  }
  function nodeObjHtml(cfg, g, sc, m, id) {
    const f = MMCH.fieldOf(m), n = g.nodes[id], a = f.nodeAssignments[id] || (['strong', 'rival'].includes(n.kind) ? { t: 'battle', bt: n.kind } : null), look = lookOf(cfg, a);
    if (!look) return '';
    const P = landmarkPos(cfg, g, sc, id, look), d = P.d;
    const used = (a.t === 'event' && f.consumedEvents.includes(id)) || (a.t === 'treasure' && f.openedTreasures.includes(id)) || (a.t === 'stat' && f.clearedStats.includes(id));
    const w = look.w ? look.w * d : 0, size = look.w ? `width:${w.toFixed(1)}px;` : `height:${(look.h * d).toFixed(1)}px;`;
    const far = clamp((1 - n.d) * 1.1, 0, 0.7);   // 遠景ほど淡く小さく（透明度だけ。色は変えない）
    const vis = ((cfg.landmarkVisibility || {})[a.t] || 'always') === 'arrive' && !used;   // 着いたときに初めて現れる目印
    return `<div class="chf-obj ${look.cls}${used ? ' used' : ''}${vis ? ' hid' : ''}" data-id="${id}" data-t="${a.t}" data-side="${P.side}" style="left:${P.x.toFixed(1)}px;top:${P.y.toFixed(1)}px;z-index:${Math.round(P.y)};--sink:${look.sink || 0};--d:${d};opacity:${(P.opacity * (1 - far * 0.35)).toFixed(2)}"><i class="chf-osh"></i><i class="chf-glow"></i><img src="${asset(cfg, used && look.openKey ? look.openKey : look.key)}"${look.openKey ? ` data-open="${esc(asset(cfg, look.openKey) || '')}"` : ''} alt="" draggable="false" decoding="async" style="${size}">${look.tuft === false ? '' : tuftHtml(cfg, w || (look.h * d) * 0.7)}</div>`;
  }
  // ---------------------------------------------------------
  // マスUI（config.tileUI）：各マスの座標（ノードの止まる位置 mx・my）に、マス種別ごとの表示素材を地面に置く。
  //  正式素材は未着：sprites に種類ごとの画像を書けば差し替わる（座標はそのまま。探す順＝種別名 → まとめた種類 → normal）。
  //  素材が無い種類は、位置確認専用の仮表示（点線の楕円と「仮 #通し番号」。正式デザインではない）。tileUI が無い config は何も出さない
  // ---------------------------------------------------------
  const TILE_GROUP = { stat_life: 'stat', stat_power: 'stat', stat_intelligence: 'stat', stat_accuracy: 'stat', stat_evasion: 'stat', stat_toughness: 'stat', rest: 'event', wild: 'battle', rare: 'battle', strong: 'battle', rival: 'battle' };
  function tileKeyOf(m, id) { const a = MMCH.typeAt(m, id); return MMCH.nodeTypeName(a); }
  function tileSpriteOf(cfg, key) { const T = (cfg && cfg.tileUI && cfg.tileUI.sprites) || {}; return T[key] || T[TILE_GROUP[key]] || T.normal || null; }
  function tilesHtml(cfg, g, sc, m, ids) {
    const T = cfg.tileUI; if (!T) return '';
    const W0 = (T.size && T.size.w) || 170, flat = (T.size && T.size.flat) || 0.34, dp = (T.size && T.size.depthPow) != null ? T.size.depthPow : 1;   // 大きさ＝基準の幅 × 奥行き^depthPow（1 未満で奥のマスが小さくなりすぎない）
    return ids.map((id) => {
      const n = g.nodes[id], key = tileKeyOf(m, id), src = tileSpriteOf(cfg, key), w = W0 * Math.pow(n.d, dp), h = w * flat, no = g.order.indexOf(id) + 1;
      const box = `left:${(n.mx * sc.w).toFixed(1)}px;top:${(n.my * sc.h).toFixed(1)}px;width:${w.toFixed(1)}px;height:${h.toFixed(1)}px;--d:${n.d}`;
      if (src) return `<i class="chf-tile" data-id="${id}" data-type="${key}" style="${box}"><img src="${esc(src)}" alt="" draggable="false" decoding="async"></i>`;   // 使ったマス（能力・イベント・宝箱）は chfBoard で .used（少し暗く）
      return T.placeholder === false && !debug() ? '' : `<i class="chf-tile ph" data-id="${id}" data-type="${key}" style="${box}" title="仮表示（位置確認用）"><b>仮 #${no}</b></i>`;
    }).join('');
  }
  /** 分岐の道（config.branches[].options の id）どうしが同じ分かれ道か */
  function sameBranchGroup(cfg, a, b) { return (cfg.branches || []).some((B) => B.options.some((o) => o.id === a) && B.options.some((o) => o.id === b)); }
  /** 分岐の道の上の物を隠すか：その分かれ道でまだ道を選んでいない間は、どちらの道の物も隠す（選ぶ前に両方の道の全体を見せない） */
  function branchHidden(cfg, n, fb) { return !!(n && n.branch && !(fb && sameBranchGroup(cfg, n.branch, fb))); }
  function sceneHtml(m, fieldId) {
    const cfg = MMCH.configFor(m), g = MMCH.graphFor(m), sc = sceneOf(cfg, fieldId), PXk = PX();
    const env = (cfg.landmarks[fieldId] || []), back = env.filter((L) => L.layer !== 'front' && (L.haze || 0) >= 0.15), road = env.filter((L) => L.layer !== 'front' && (L.haze || 0) < 0.15), front = env.filter((L) => L.layer === 'front');
    const ids = g.order.filter((id) => g.nodes[id].field === fieldId), fb = MMCH.fieldOf(m).branch;
    // 分岐の道の物：選ぶ前はどちらの道も出さない（.brhide。選んだ道だけ chfPick で現れる）。選んだ後は、選ばなかった道の物を出さない
    const objs = ids.filter((id) => !(fb && g.nodes[id].branch && sameBranchGroup(cfg, g.nodes[id].branch, fb) && g.nodes[id].branch !== fb)).map((id) => { const h = nodeObjHtml(cfg, g, sc, m, id); return branchHidden(cfg, g.nodes[id], fb) ? h.replace('class="chf-obj ', 'class="chf-obj brhide ') : h; }).join('');
    const fg = ((cfg.foreground || {})[fieldId] || []).map((F, i) => fgHtml(cfg, sc, F, i)).join('');
    const dbg = debug() ? ids.map((id) => { const n = g.nodes[id]; return `<i class="chf-dbg k-${n.kind}" style="left:${n.x * sc.w}px;top:${n.y * sc.h}px"><b>${id}</b></i>`; }).join('') + debugRoutes(g, sc, ids) : '';
    const farBand = sc.farBand ? `<div class="chf-pg chf-far" data-k="${sc.farBand.k != null ? sc.farBand.k : PXk.far}"><img class="chf-farimg" src="${sc.bg}" alt="" draggable="false" style="--to:${((sc.farBand.to || 0.34) * 100).toFixed(1)}%"></div>` : '';
    return `<div class="chf-cam" id="chfcam" style="width:${sc.w}px;height:${sc.h}px">${farBand}<img class="chf-bg" src="${sc.bg}" alt="${esc(sc.name)}" draggable="false">
      <div class="chf-pg chf-back" data-k="${PXk.back}">${back.map((L, i) => envHtml(cfg, sc, L, i)).join('')}</div>
      <div class="chf-pg chf-road" data-k="${PXk.road}">${tilesHtml(cfg, g, sc, m, ids)}${road.map((L, i) => envHtml(cfg, sc, L, i)).join('')}${objs}${fg}${dbg}
        <div class="chf-mon${spriteSetOf(m) ? ' spr' : ''}" id="bmonw" style="--mh:${monH()}px"><i class="chf-msh"></i><div class="chf-flip"><div class="chf-lean"><div class="chf-bob"><div class="mon">${monHtml(m)}</div></div></div></div></div></div>
      <div class="chf-pg chf-front" data-k="${PXk.front}">${front.map((L, i) => envHtml(cfg, sc, L, i)).join('')}</div>
      <div class="chf-fx" id="chffx"></div></div>`;
  }
  function debugRoutes(g, sc, ids) {
    const segs = [];
    for (const id of ids) for (const to of (g.conn[id] || [])) { const r = MMCH.routeBetween(g, id, to); if (r.length) segs.push(`<polyline points="${r.map((p) => `${(p[0] * sc.w).toFixed(1)},${(p[1] * sc.h).toFixed(1)}`).join(' ')}"/>`); }
    return `<svg class="chf-dbgsvg" width="${sc.w}" height="${sc.h}" viewBox="0 0 ${sc.w} ${sc.h}">${segs.join('')}</svg>`;
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
  function buildScene(m, fieldId, keepVeil) {
    const fv = $('#chf'); if (!fv) return;
    V.field = fieldId; V.sc = sceneOf(V.cfg, fieldId); V.seedTuft = (MMCH.fieldOf(m).layoutSeed + fieldId * 97) >>> 0;
    SPR.set = spriteSetOf(m); SPR.frame = -1;   // 歩行スプライト（種族ごと。無ければ従来の画像）
    fv.querySelectorAll(keepVeil ? '.chf-cam,.chf-canopy' : '.chf-cam,.chf-canopy,.chf-veil').forEach((e) => e.remove());   // 前のフィールドの DOM は捨てる（画像を積み上げない）。背景の切り替え中（keepVeil）は暗転を残し、新しい背景の上で明けていく（以前は暗転ごと消えて、真っ暗から新しい背景へ一瞬で切り替わっていた）
    fv.insertAdjacentHTML('afterbegin', sceneHtml(m, fieldId) + overlayHtml(V.cfg, m));
    V.par0 = null; V.focus = null;
    for (const f of MMCH.nextFields(V.g, fieldId)) preloadField(V.cfg, f);   // 次に入る背景（つながりの先。背景IDの連番は前提にしない）
  }

  // ---------------------------------------------------------
  // カメラ（rAF で滑らかに追従。モンスターに固定せず、少し遅れて・少し先を見る）
  // ---------------------------------------------------------
  function zoomAt(sc, d) { const c = sc.depth, dmin = c[c.length - 1][1], t = clamp((d - dmin) / (1 - dmin), 0, 1); return sc.zoom.far + (sc.zoom.near - sc.zoom.far) * t; }
  function viewport() { const fv = $('#chf'); return fv ? { W: fv.clientWidth, H: fv.clientHeight } : { W: 390, H: 680 }; }
  /** 注視点（背景の画素）：モンスターの体の中心 ＋ 進む向きの先読み ＋ 停止地点の物のほうへの寄り */
  function focusPoint(px, py, d) {
    const C = CA(), { W } = viewport(), S0 = V.cam.S || 1, mh = monH() * d;
    let fx = px, fy = py - mh * 0.45;
    const la = (C.lookAhead * W) / S0;   // 先読み（画面幅の一定割合を背景の画素へ）
    fx += V.look[0] * la; fy += V.look[1] * la * 0.8;
    if (V.focus) { fx += (V.focus.x - fx) * V.focus.mix; fy += (V.focus.y - fy) * V.focus.mix; }
    return [fx, fy];
  }
  function camApply() {
    const cam = $('#chfcam'); if (!cam || !V.sc) return;
    const { W, H } = viewport(), sc = V.sc, C = CA(), base = Math.max(W / sc.w, H / sc.h), d = V.monPos ? V.monPos.d : 1;
    const S = base * zoomAt(sc, d) * V.cam.z;
    let tx = W / 2 - V.cam.x * S, ty = H * C.anchorY - V.cam.y * S;
    tx = sc.w * S <= W ? (W - sc.w * S) / 2 : clamp(tx, W - sc.w * S, 0);
    ty = sc.h * S <= H ? (H - sc.h * S) / 2 : clamp(ty, H - sc.h * S, 0);
    V.cam.S = S; V.cam.tx = tx; V.cam.ty = ty;
    cam.style.transform = `translate3d(${tx.toFixed(2)}px,${ty.toFixed(2)}px,0) scale(${S.toFixed(4)})`;
    // 視差：グループごとに少し違う速さ（フィールドに入った時のカメラ位置からの差で動かす）
    if (!V.par0) V.par0 = { tx, ty };
    const dx = (tx - V.par0.tx) / S, dy = (ty - V.par0.ty) / S;
    cam.querySelectorAll('.chf-pg').forEach((pg) => { const k = parseFloat(pg.dataset.k); if (!Number.isFinite(k) || k === 1) return; pg.style.transform = `translate3d(${(dx * (k - 1)).toFixed(2)}px,${(dy * (k - 1)).toFixed(2)}px,0)`; });
    const cp = $('#chf .chf-canopy'); if (cp) { const k = PX().canopy; cp.style.transform = `translate3d(${(dx * (k - 1) * S * 0.5).toFixed(2)}px,${(dy * (k - 1) * S * 0.5).toFixed(2)}px,0)`; }
  }
  function camTick(now) {
    V.raf = 0;
    const dt = Math.min(64, now - (V.last || now)); V.last = now;
    const C = CA(), tau = V.moving ? C.followTau : C.settleTau, k = 1 - Math.exp(-dt / tau), kz = 1 - Math.exp(-dt / C.zoomTau);
    if (now >= V.hold) { V.cam.x += (V.tgt.x - V.cam.x) * k; V.cam.y += (V.tgt.y - V.cam.y) * k; }
    V.cam.z += (V.tgt.z - V.cam.z) * kz;
    camApply();
    const done = Math.abs(V.tgt.x - V.cam.x) < 0.15 && Math.abs(V.tgt.y - V.cam.y) < 0.15 && Math.abs(V.tgt.z - V.cam.z) < 0.0005 && !V.moving;
    if (done) { V.cam.x = V.tgt.x; V.cam.y = V.tgt.y; V.cam.z = V.tgt.z; camApply(); V.last = 0; }
    else V.raf = requestAnimationFrame(camTick);
  }
  function camKick() { if (!V.raf && $('#chfcam')) { V.last = 0; V.raf = requestAnimationFrame(camTick); } }
  /** 注視点を更新（instant：その場で合わせる＝再読み込み・背景の切り替え・視差効果を減らす設定） */
  function camTarget(px, py, d, instant) {
    const [fx, fy] = focusPoint(px, py, d);
    V.tgt.x = fx; V.tgt.y = fy;
    if (instant || V.calm) { V.cam.x = fx; V.cam.y = fy; V.cam.z = V.tgt.z; V.hold = 0; if (V.raf) { cancelAnimationFrame(V.raf); V.raf = 0; } camApply(); }
    else camKick();
  }
  function camZoom(kind) { V.tgt.z = CA().zoom[kind] != null ? CA().zoom[kind] : 1; if (!V.calm) camKick(); else { V.cam.z = V.tgt.z; camApply(); } }
  /** 停止地点の物のほうへ少し寄る（mix＝寄せる割合）。null で戻す */
  function camFocus(obj, mix, zoom) {
    if (obj && obj.x != null) { V.focus = { x: obj.x, y: obj.y, mix: mix != null ? mix : CA().focusMix }; if (zoom) V.tgt.z = zoom; }
    else { V.focus = null; V.tgt.z = CA().zoom.idle; }
    if (V.monPos) camTarget(V.monPos.x, V.monPos.y, V.monPos.d, false);
  }

  // ---------------------------------------------------------
  // モンスター（位置・向き・歩きの見た目）
  // ---------------------------------------------------------
  /** 歩きの見た目の差し込み口。正式な歩行アニメ（idle／walk／run のスプライト）が届いたら registerMonsterAnimator({ set(el, state, info) }) で差し替える。移動・カメラの処理は変えない */
  const DEFAULT_ANIMATOR = {
    id: 'css',
    /** state：idle／ready／walk／land／rest。info：{ speed（0〜1）, dir:[dx,dy], calm } */
    set(el, state, info) {
      if (!el) return;
      el.classList.remove('rest', 'ready', 'walk', 'land');
      if (state !== 'idle') el.classList.add(state);
      if (state === 'walk') el.style.setProperty('--spd', String(clamp((info && info.speed) || 1, 0.6, 1.4)));
    },
  };
  /**
   * 歩行スプライトの再生（config.monsterSprites。その場歩行の絵を順に切り替えるだけ。フィールド上の位置は moveAlong が動かす）。
   *  walk の間だけ frames を 01→…→末尾→01 とループ（fps × 歩く速さ。歩き出し・止まる前の減速では少しゆっくり）。それ以外（idle／ready／land／rest）は止めて idle の絵（既定 01）
   */
  const SPR = { raf: 0, phase: 0, last: 0, speed: 1, frame: -1, set: null };
  function sprShow(i) {
    const box = $('#bmonw .chf-spr'); if (!box || !SPR.set) return;
    if (box.dataset.f === String(i + 1)) { SPR.frame = i; return; }
    const next = box.querySelector(`img[data-i="${i}"]`); if (!next || !next.complete) return;   // 読み込み前のコマには切り替えない（ちらつきを防ぐ）
    const cur = box.querySelector('img.on'); if (cur) cur.classList.remove('on');
    next.classList.add('on'); box.dataset.f = String(i + 1); SPR.frame = i;
  }
  function sprTick(now) {
    const set = SPR.set; if (!set) { SPR.raf = 0; return; }
    const dt = Math.min(100, now - (SPR.last || now)); SPR.last = now;
    SPR.phase += (dt / 1000) * (set.fps || 12) * (0.55 + 0.45 * clamp(SPR.speed, 0, 1));
    sprShow(Math.floor(SPR.phase) % set.frames.length);
    SPR.raf = requestAnimationFrame(sprTick);
  }
  function sprStop() { if (SPR.raf) cancelAnimationFrame(SPR.raf); SPR.raf = 0; SPR.phase = 0; SPR.last = 0; if (SPR.set) sprShow(SPR.set.idle || 0); }
  const SPRITE_ANIMATOR = {
    id: 'sprite',
    set(el, state, info) {
      DEFAULT_ANIMATOR.set(el, state, info);   // 影・構え・着地の CSS はそのまま（上下動は絵に任せる＝.spr では止める）
      if (!el || !el.querySelector('.chf-spr')) { sprStop(); return; }
      if (state === 'walk' && !(info && info.calm)) {
        SPR.speed = (info && info.speed != null) ? info.speed : 1;
        if (!SPR.raf) { SPR.last = 0; SPR.raf = requestAnimationFrame(sprTick); }
      } else if (SPR.raf || SPR.frame !== (SPR.set.idle || 0)) sprStop();
    },
  };
  function registerMonsterAnimator(a) { if (!a || typeof a.set !== 'function') throw new Error('MMCHV：animator は set(el, state, info) を持つこと'); V.animator = a; }
  const anim = (state, info) => (V.animator || (SPR.set ? SPRITE_ANIMATOR : DEFAULT_ANIMATOR)).set($('#bmonw'), state, info);
  const monW = () => ((V.cfg && V.cfg.monster && V.cfg.monster.w) || monH() * 0.8);
  /** 道の安全域に収めた x（背景の画素）。体の半幅ぶん内側（fieldScenes[].road が無い背景はそのまま） */
  function roadX(x, y, d) { if (!V.sc || !V.sc.road || !MMCH.clampToRoad) return x; return MMCH.clampToRoad(V.sc, x / V.sc.w, y / V.sc.h, (monW() * d * 0.5) / V.sc.w).x * V.sc.w; }
  function setMonPos(x, y, d) {
    const w = $('#bmonw'); if (!w) return;
    x = roadX(x, y, d);
    V.monPos = { x, y, d };
    w.style.left = `${x.toFixed(1)}px`; w.style.top = `${y.toFixed(1)}px`; w.style.zIndex = String(Math.round(y) + 1);
    w.style.setProperty('--d', d.toFixed(3));
  }
  function depthAtY(y) { return MMCH.depthOf(V.sc, y / V.sc.h); }
  function face(dx) {
    if (Math.abs(dx) < 3) return;
    const right = dx > 0, flip = FACING === 'left' ? right : !right, fl = $('#bmonw .chf-flip');
    if (fl) fl.classList.toggle('r', SPR.set && SPR.set.noFlip ? false : flip);   // 後ろ姿の歩行スプライトは左右反転しない（尻尾の位置が入れ替わるため）
    V.facing = right ? 1 : -1;
  }
  function lean(deg) { if (SPR.set && SPR.set.noFlip) deg = 0; const l = $('#bmonw .chf-lean'); if (l) l.style.setProperty('--lean', `${deg.toFixed(2)}deg`); }
  /** 今いる地点に置く（再読み込み・戻ってきたとき）。向きは次の地点のほう */
  function placeMon(id, instant) {
    const n = V.g && V.g.nodes[id]; if (!n || !$('#bmonw')) return;
    const x = n.mx * V.sc.w, y = n.my * V.sc.h;
    setMonPos(x, y, n.d); $('#bmonw').dataset.node = id;
    const nx = (V.g.conn[id] || []).map((k) => V.g.nodes[k]).find((q) => q && q.field === n.field);
    if (nx) { const dx = (nx.mx - n.mx) * V.sc.w, dy = (nx.my - n.my) * V.sc.h, L = Math.hypot(dx, dy) || 1; V.look = [dx / L, dy / L]; face(dx); }
    lean(0); anim('idle');
    camTarget(x, y, n.d, instant);
  }
  /** 点列（背景の画素）に沿って歩く。ms：かかる時間、prof：速度の形（[加速の割合, 減速の割合]） */
  function moveAlong(pts, ms, prof) {
    return new Promise((ok) => {
      const seg = [0]; for (let i = 1; i < pts.length; i++) seg.push(seg[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      const total = seg[seg.length - 1] || 1, [a, b] = prof, vmax = 1 / (1 - a / 2 - b / 2);
      const f = (t) => (t < a ? vmax * t * t / (2 * a) : t < 1 - b ? vmax * (a / 2 + (t - a)) : 1 - vmax * (1 - t) * (1 - t) / (2 * b));
      const vel = (t) => (t < a ? vmax * t / a : t < 1 - b ? vmax : vmax * (1 - t) / b);
      const t0 = performance.now(); let raf = 0;
      const at = (s) => { for (let i = 1; i < pts.length; i++) if (s <= seg[i]) { const r = (seg[i] - seg[i - 1]) ? (s - seg[i - 1]) / (seg[i] - seg[i - 1]) : 0; return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * r, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * r, i]; } const e = pts[pts.length - 1]; return [e[0], e[1], pts.length - 1]; };
      const frame = (now) => {
        const t = clamp((now - t0) / ms, 0, 1), s = f(t) * total, [x, y, i] = at(s), prev = V.monPos || { x, y };
        const dx = x - prev.x, dy = y - prev.y;
        setMonPos(x, y, depthAtY(y));
        if (Math.hypot(dx, dy) > 0.5) { const L = Math.hypot(dx, dy); V.look = [dx / L, dy / L]; face(dx); }
        lean(V.calm ? 0 : 4 * vel(t) / vmax);   // 速いほど少し前傾
        anim('walk', { speed: vel(t) / vmax, dir: V.look, calm: V.calm });
        if (!V.calm) camTarget(x, y, V.monPos.d, false);
        if (t < 1) raf = requestAnimationFrame(frame); else { if (V.calm) camTarget(x, y, V.monPos.d, true); ok(); }
      };
      raf = requestAnimationFrame(frame);
    });
  }
  /** 1地点ぶんの時間：画面上の距離と地形で 200〜350ms（config.motion） */
  function stepDuration(pts, toId) {
    const M = MO(), n = V.g.nodes[toId], T = M.terrain[n.terrain] || M.terrain.grass, S = V.cam.S || 1;
    let len = 0; for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const rel = T.fixed ? 1 : Math.pow(clamp((len * S) / M.baseLen, 0.55, 1.8), 0.6);
    return clamp(M.stepMs * rel / (T.speed || 1), M.minMs, M.maxMs) * (V.calm ? 0.5 : 1);
  }
  /**
   * 1地点ぶん歩く（first：この出目の最初の一歩＝構えてから加速、last：最後の一歩＝減速して着地）。
   * 別のフィールドへ入るときは switchField（端まで歩く → 暗転 → 入口の手前から歩いて入る）
   */
  async function walkTo(m, id, first, last) {
    const n = V.g.nodes[id]; if (!n) return;
    const w = $('#bmonw'), cur = w && w.dataset.node;
    if (first && V.pickLean) { await wait(V.pickLean); V.pickLean = 0; V.focus = null; }   // 分岐で選んだ道のほうへ寄ってから（寄りを解いて歩き出す。選んだ道が次の背景でも同じ）
    if (n.field !== V.field) {
      await switchField(m, n.field, id, cur);
      if (last) { V.moving = false; lean(0); anim('land'); camZoom('stop'); await wait(V.calm ? 20 : MO().landMs); anim('idle'); }   // 背景をまたいで止まるときも歩きを止めて停止の姿勢へ
      return;
    }
    const route = MMCH.routeBetween(V.g, cur, id).map((p) => [p[0] * V.sc.w, p[1] * V.sc.h]);
    const pts = route.length >= 2 ? route : [[V.monPos.x, V.monPos.y], [n.mx * V.sc.w, n.my * V.sc.h]];
    const M = MO(), C = CA();
    if (first) {   // 構え：進む向きを見て、少し溜めてから歩き出す。カメラは少し引き、少し遅れて追いかける
      const dx = pts[pts.length - 1][0] - pts[0][0]; face(dx);
      anim('ready'); camZoom('move'); V.moving = true;
      await wait(V.calm ? 20 : M.windupMs);
      V.hold = performance.now() + (V.calm ? 0 : C.followDelay);   // 歩き出してから少し遅れて追いかける
    }
    await moveAlong(pts, stepDuration(pts, id), [first ? 0.3 : 0.05, last ? 0.3 : 0.05]);
    if (w) w.dataset.node = id;
    if (last) {   // 着地：小さな上下動のあと、目的地点へ軽く寄る
      V.moving = false; lean(0); anim('land'); camZoom('stop');
      await wait(V.calm ? 20 : M.landMs);
      anim('idle'); setTimeout(() => { if (V.tgt.z === CA().zoom.stop && !V.focus) camZoom('idle'); }, 700);
    }
    const ov = $('#chf .chf-canopy'), f = MMCH.fieldOf(m);
    if (!ov && f && f.branch && (V.cfg.branchOverlays || {})[f.branch] && V.cfg.branchOverlays[f.branch].field === V.field) { const fv = $('#chf'); if (fv) fv.insertAdjacentHTML('beforeend', overlayHtml(V.cfg, m)); }
    const nx = (V.g.conn[id] || []).map((k) => V.g.nodes[k]).find((x) => x && x.field !== V.field); if (nx) preloadField(V.cfg, nx.field);
  }
  async function switchField(m, fieldId, id, fromId) {
    const fv = $('#chf'); if (!fv) return;
    const M = MO(), ms = (V.cfg.backgroundTransition || {}).ms || 700, half = V.calm ? 40 : ms * 0.42;
    // 1) 今のフィールドの端から、そのまま進む向きへ少し歩き続ける。カメラも前へ・少し寄る
    const from = V.g.nodes[fromId], out = V.look, ext = 70 * (from ? from.d : 1);
    fv.insertAdjacentHTML('beforeend', '<div class="chf-veil"></div>'); const veil = fv.querySelector('.chf-veil'); void veil.offsetWidth;
    V.tgt.z = CA().zoom.focus; V.moving = true;
    const p0 = [V.monPos.x, V.monPos.y], p1 = [p0[0] + out[0] * ext, p0[1] + out[1] * ext];
    veil.classList.add('on');
    await moveAlong([p0, p1], V.calm ? 40 : M.fadeMs, [0.05, 0.4]);
    await wait(half * 0.3);
    // 2) 次のフィールド：入口の少し手前（進む向きの後ろ）に置き、カメラはその場で合わせる
    buildScene(m, fieldId, true);
    const n = V.g.nodes[id], nx = (V.g.conn[id] || []).map((k) => V.g.nodes[k]).find((q) => q && q.field === fieldId);
    let dir = [0, -1]; if (nx) { const dx = (nx.mx - n.mx) * V.sc.w, dy = (nx.my - n.my) * V.sc.h, L = Math.hypot(dx, dy) || 1; dir = [dx / L, dy / L]; }
    V.look = dir; face(dir[0]);
    const ex = n.mx * V.sc.w, ey = n.my * V.sc.h, back = 64 * n.d, sx = ex - dir[0] * back, sy = ey - dir[1] * back;
    V.cam.z = CA().zoom.move; V.tgt.z = CA().zoom.idle;
    setMonPos(sx, sy, n.d); camTarget(sx, sy, n.d, true);
    const veil2 = fv.querySelector('.chf-veil'); if (veil2) { veil2.classList.add('on'); void veil2.offsetWidth; veil2.classList.remove('on'); setTimeout(() => veil2.remove(), V.calm ? 60 : ms * 0.6); }
    // 3) 入口へ歩いて入る（向きはそのまま）
    await moveAlong([[sx, sy], [ex, ey]], V.calm ? 40 : M.enterMs, [0.05, 0.3]);
    const w = $('#bmonw'); if (w) w.dataset.node = id;
    V.moving = false;
    const fd = $('#chfd'); if (fd) fd.textContent = V.sc.name;
  }

  // ---------------------------------------------------------
  // HUD・下の操作欄（command deck）
  // ---------------------------------------------------------
  function hudHtml(m) {
    const r = m.raise, cfg = V.cfg, fat = MMCH.fatigue(m), lv = fat >= 80 ? 'hi' : fat >= 50 ? 'mid' : 'lo';
    return `<header class="chh"><div class="chh-l"><small>Chapter <b>${cfg.chapterId}</b> / ${P7().CHAPTER_COUNT}</small><b class="chh-nm">${esc(cfg.title)}</b><span class="chh-fd" id="chfd">${esc(V.sc ? V.sc.name : '')}</span></div>
      <div class="chh-r"><div class="chh-turn">Turn <b id="chturn">${Math.min(r.turnsUsed + (P8().boardPhase(m) === 'roll' ? 1 : 0), r.turnLimit)}</b><small> / ${r.turnLimit}</small></div>
      <div class="chh-fat f-${lv}" id="chfat"><span>疲れ</span><b>${fat}</b><i style="--f:${fat}%"></i></div>
      <div class="chh-gold" id="chgold"><span>所持金</span><b>${(gS() && gS().g) | 0}</b><small>G</small></div></div>
      <button class="p9mbtn chh-menu" onclick="p9Menu()" aria-label="メニュー">☰</button></header>`;
  }
  function refreshHud(m) { const h = $('#chf-ui .chh'); if (h) h.outerHTML = hudHtml(m); }
  const ICON = {
    item: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 9h10l1.2 10.5a1 1 0 0 1-1 1.1H6.8a1 1 0 0 1-1-1.1Z"/><path d="M9 9V7a3 3 0 0 1 6 0v2"/><path d="M12 12v5"/></svg>',
    rest: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 16h16"/><path d="M6 16V9a2 2 0 0 1 2-2h5"/><path d="M13 7h3a3 3 0 0 1 3 3v6"/><path d="M5 20v-4M19 20v-4"/></svg>',
    skill: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19l9-9"/><path d="M13 5l6 6-3 3-6-6z"/><path d="M4 20l2-2"/><path d="M15 3l1.5 1.5M19.5 8L21 9.5"/></svg>',
    status: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19h16"/><path d="M7 16v-5M12 16V6M17 16v-8"/></svg>',
  };
  // 4コマンド（放射状）：左上＝アイテム、右上＝休む、左下＝技設定（既存の技管理 hall('w')）、右下＝ステータス（既存の hall('st')）。新しい画面は作らない
  const CMDS = [
    { k: 'item', cls: 'chitem', pos: 'tl', on: 'chfItems()', label: 'アイテム' },
    { k: 'rest', cls: 'chrest', pos: 'tr', on: 'chfRest()', label: '休む' },
    { k: 'skill', cls: 'chskill', pos: 'bl', on: 'chfOpen(\'w\')', label: '技設定' },
    { k: 'status', cls: 'chstatus', pos: 'br', on: 'chfOpen(\'st\')', label: 'ステータス' },
  ];
  const DIST = { 1: 'すぐ先まで進む', 2: '少し先まで進む', 3: 'ずっと先まで進む' };
  /**
   * 下の操作欄。中央は START（1タップでサイコロを振る）。サイコロは START を押すまで出さない（出現〜停止面〜移動の間、START は押せない）。
   *  config.deck（START の正式画像と押せる領域）があれば画像の操作欄、無ければ CSS の操作欄（Pattern・Chapter ごとに config だけで変えられる）
   */
  function deckHtml(m, ph, msg) {
    const r = m.raise, cfg = V.cfg;
    const canRoll = P8().canRoll(m), canRest = P8().canRest(m), tired = ph === 'roll' && !canRoll && MMCH.fatigue(m) >= 100, R = MMCH.rulesOf(cfg).fatigueRules;
    let def = '';
    if (ph === 'roll') def = r.turnsUsed === 0 ? `<b>${esc(cfg.title)}</b>　旅のはじまり。START でサイコロを振ろう。` : tired ? '疲れがたまって動けない…休もう。' : 'START でサイコロを振る。休むこともできる。';
    else if (ph === 'move' || ph === 'resolve') def = '移動中…';
    else if (ph === 'branch') def = `分かれ道だ。どちらへ進む？（のこり${r.pend.left}）`;
    else if (ph === 'battle') { const fx = r.pend.fx || {}, bt = (cfg.battleTypes || {})[fx.battleType || 'wild'] || { label: 'モンスター' }; def = `${esc(bt.label)}が現れた！`; }
    else if (ph === 'goal') def = '大会会場に着いた！'; else if (ph === 'timeup') def = `${r.turnLimit}ターンを使い切った…`;
    const rollOn = ph === 'roll' && canRoll, idle = ph === 'roll';
    const D = cfg.deck;
    if (D && D.start) {
      // 画像の操作欄：画像は飾り、押せる領域は透明なボタン（文字は読み上げ・テスト用に残し、見た目は画像）。サイコロの絵は置かない（START を押したときだけ MMCHD が出す）
      const H = D.hit || {}, box = (k) => { const h = H[k] || {}; return `style="left:${(h.x * 100).toFixed(1)}%;top:${(h.y * 100).toFixed(1)}%;width:${(h.w * 100).toFixed(1)}%;height:${(h.h * 100).toFixed(1)}%"`; };
      const center = ph === 'roll'
        ? `<div class="chstopw chstopw-img${rollOn ? ' on' : ''}" ${box('center')}><button class="chstop chstop-img" id="brollbtn" onclick="chfRoll()"${canRoll ? '' : ' disabled'} aria-label="START（サイコロを振る）"><b>START</b></button></div>`
        : `<div class="chstopw chstopw-img" ${box('center')}><button class="chstop chstop-img wait" disabled aria-label="移動中"><b>${ph === 'move' || ph === 'resolve' ? r.pend.roll : '…'}</b></button></div>`;
      const wing = (c) => { const on = c.k === 'rest' ? canRest : idle; return `<button class="chwing chwing-img ${c.cls} chw-${c.pos}${c.k === 'rest' && tired ? ' must' : ''}" ${box(c.pos)} onclick="${c.on}"${on ? '' : ' disabled'}><b>${c.label}</b>${c.k === 'rest' ? `<small>疲れ −${R.rest}</small>` : ''}</button>`; };
      const ctl = `<div class="chcmd chcmd-img" style="--deckar:${D.aspect || 3.116}"><img class="chdeck-bg" src="${esc(D.start)}" alt="" draggable="false">${CMDS.map(wing).join('')}${center}</div>`;
      return `<div class="chdeck chdeck-img" id="chdock"><p class="chmsg" id="bmsg">${msg || def}</p>${ctl}</div>`;
    }
    const center = ph === 'roll'
      ? `<div class="chstopw${rollOn ? ' on' : ''}"><button class="chstop" id="brollbtn" onclick="chfRoll()"${canRoll ? '' : ' disabled'} aria-label="START（サイコロを振る）"><span class="chstop-rim"></span><span class="chstop-dome"></span><b>START</b></button><small class="chstop-cap">サイコロを振る</small></div>`
      : `<div class="chstopw"><button class="chstop wait" disabled aria-label="移動中"><span class="chstop-rim"></span><span class="chstop-dome"></span><b>${ph === 'move' || ph === 'resolve' ? r.pend.roll : '…'}</b></button></div>`;
    const wing = (c) => { const on = c.k === 'rest' ? canRest : idle; return `<button class="chwing ${c.cls} chw-${c.pos}${c.k === 'rest' && tired ? ' must' : ''}" onclick="${c.on}"${on ? '' : ' disabled'}>${ICON[c.k]}<b>${c.label}</b>${c.k === 'rest' ? `<small>疲れ −${R.rest}</small>` : ''}</button>`; };
    const ctl = `<div class="chcmd">${CMDS.filter((c) => c.pos[0] === 't').map(wing).join('')}${center}${CMDS.filter((c) => c.pos[0] === 'b').map(wing).join('')}</div>`;
    return `<div class="chdeck" id="chdock"><p class="chmsg" id="bmsg">${msg || def}</p>${ctl}</div>`;
  }
  /** 操作欄だけを描き直す（START ↔ 移動中） */
  function refreshDeck(m, msg) { const d = $('#chdock'); if (d) d.outerHTML = deckHtml(m, P8().boardPhase(m), msg); }
  function sheetHtml(m, ph) {
    const r = m.raise, cfg = V.cfg;
    if (ph === 'branch') {
      const br = (cfg.branches || []).find((b) => b.at === r.node) || { options: [] };
      return `<div class="chsheet chbr"><h3>分かれ道</h3>${r.pend.opts.map((id) => { const o = br.options.find((x) => x.to === id) || { label: 'この先へ', desc: '' };
        return `<button class="chroute k-${esc(o.id || '')}" onclick="chfPick('${id}')"><b>${esc(o.label)}</b><small>${esc(o.desc)}</small></button>`; }).join('')}</div>`;
    }
    if (ph === 'battle') {
      const fx = r.pend.fx || {}, bt = (cfg.battleTypes || {})[fx.battleType || 'wild'] || { label: 'モンスター' };
      return `<div class="chsheet chbat"><h3>${esc(bt.label)}</h3><p class="p9s">バトルの後は疲れ +${MMCH.rulesOf(cfg).fatigueRules.battle}。賞金・ランクアップはありません。</p><button class="p9btn" onclick="bBattleGo()">バトルする</button><button class="p9btn2" onclick="bBattleSkip()">やめておく</button></div>`;
    }
    if (ph === 'goal') return `<div class="chsheet chgoal">${root.p8GoalHtml ? root.p8GoalHtml(m) : ''}</div>`;
    if (ph === 'timeup') return `<div class="chsheet"><h3>⌛ ターン終了</h3><p class="p9s">ゴールできなかったため、このChapterの公式大会には参加できません。Chapterは終了し、次のChapterへ進めます（育成失敗ではありません）。</p><button class="p9btn" onclick="p8EndChapter()">Chapterを終えてファームへ</button></div>`;
    return '';
  }

  // ---------------------------------------------------------
  // 画面（board() から）
  // ---------------------------------------------------------
  function chfBoard(msg) {
    const m = gS() && gS().m; if (!chfActive(m)) return false;
    const r = m.raise, ph = P8().boardPhase(m), f = MMCH.fieldOf(m);
    V.cfg = MMCH.configFor(m); V.g = MMCH.graphFor(m); V.calm = calmMode();
    const node = V.g.nodes[r.node] || V.g.nodes[V.g.start], key = `${m.uid}:${f.chapterId}:${f.patternId}:${f.layoutSeed}`;
    if (root.MMCHD) { if (V.diceCfg !== (V.cfg.dice || V.cfg)) { MMCHD.configure({ ...(V.cfg.dice || {}), sides: MMCH.rulesOf(V.cfg).diceSides }); V.diceCfg = V.cfg.dice || V.cfg; } MMCHD.preload(); }   // 面の数は rules.diceSides（停止面が無い出目は数字で出す）
    const app = $('#app'), same = V.key === key && V.field === node.field && $('#chf');
    unscroll();   // 前の画面（ステータス・技管理・出発準備など）で残ったスクロール量を消す（HUD・操作欄は画面の固定位置に出す）
    if (!same) {
      V.key = key; V.field = null; V.moving = false; V.focus = null; V.tgt.z = 1; V.cam.z = 1;
      app.innerHTML = `<div class="chfw" id="chfw"><div class="chf" id="chf"></div><div class="chf-ui" id="chf-ui"></div></div>`;
      buildScene(m, node.field);
      placeMon(r.node, true);
      anim('rest');
    } else { const w = $('#bmonw'); if (w && w.dataset.node !== r.node) placeMon(r.node, true); }
    // 停止地点の状態（開けた宝箱・使ったイベント）を反映
    document.querySelectorAll('#chf .chf-obj,#chf .chf-tile').forEach((e) => { const id = e.dataset.id; e.classList.toggle('used', f.consumedEvents.includes(id) || f.openedTreasures.includes(id) || f.clearedStats.includes(id)); });
    // ゴールに着いたあと：config.arrival があれば到着イベント（専用の背景・フィナの会話）→ 大会受付。マス・サイコロ・操作欄は出さない
    if (ph === 'goal' && V.cfg.arrival) { chfArrive(m, same); return true; }
    $('#chfw').classList.remove('arrive'); { const o = $('#chfarr'); if (o) o.remove(); }
    $('#chf-ui').innerHTML = hudHtml(m) + sheetHtml(m, ph) + deckHtml(m, ph, msg);
    if (ph === 'branch') branchCamera(m); else if (V.focus && ph === 'roll') camFocus(null);
    // Chapter に入った直後（出発してまだ何もしていない）：旅路全体の俯瞰図 → スタート地点へ寄る演出（js/chapter/intro.js）。
    //  「初回」の判定（2026-10-01）＝育成個体 × Chapter ごとに1回：この Chapter の配置 m.raise.field（出発のたびに作り直され、Chapter の終了・育成放棄で消える）に
    //  introSeen を記録する（演出を始める前に保存）。同じ育成の再読み込み・再開では出さず、新しい育成個体（育成放棄のあとの別の個体を含む）や次の Chapter では出す。
    //  sessionStorage などセーブの外の記録では判定しない（タブが閉じられると消え、新旧の個体の区別も保証できないため）
    if (!same && ph === 'roll' && r.turnsUsed === 0 && r.node === V.g.start && root.MMCHI && V.cfg.intro && !f.introSeen && !root.MM_QA_NO_INTRO) chfIntro(m, key);   // MM_QA_NO_INTRO：自動テスト専用（tests/e2e/harness.mjs）
    if (ph === 'roll' && !V.intro) turnWarning(m);
    // 再開した移動・停止地点の処理は少し後で。その間に別の画面へ移ったら何もしない（次にフィールドを開いたとき1回だけ処理する）
    if (ph === 'move') setTimeout(() => { if (onField()) chfContinue(); }, 300); else if (ph === 'resolve') setTimeout(() => { if (onField()) chfResolve(); }, 300);
    return true;
  }
  /**
   * 残りターンの警告（config.effects.turnWarning＝{ asset, at:[残りターン…] }）。短く出して消える（約1.3秒・操作は止めない）。
   *  出すターンは at に書いた残りターンだけ（空なら出さない＝正式な発火ターンは未決）。同じターンに二度は出さない
   */
  function turnWarning(m) {
    const W = (V.cfg.effects || {}).turnWarning, t = MMCH.turnInfo(m); if (!W || !Array.isArray(W.at) || !W.at.length || !t || t.limit == null) return;
    const key = `${m.raise.ch}:${t.used}`; if (!W.at.includes(t.left) || V.warned === key) return; V.warned = key;
    const src = effectAsset(W.asset), ui = $('#chf-ui'); if (!ui || !src) return;
    ui.insertAdjacentHTML('beforeend', `<div class="chf-twarn" style="background-image:url(${esc(src)})"><b>残り ${t.left} ターン</b></div>`);
    const el = ui.querySelector('.chf-twarn:last-child'); setTimeout(() => el && el.remove(), V.calm ? 900 : 1400);
  }
  async function chfIntro(m, key) {
    if (busyGet() || V.intro) return;   // 二重に始めない
    const f = MMCH.fieldOf(m); if (!f) return;
    f.introSeen = true; doSave();   // 先に「見た」を保存（演出の途中で再読み込みしても二度出ない）。この個体のこの Chapter の配置と一緒に消える
    const w = $('#chfw'); V.intro = true; busySet(true); lockUi(true);
    if (w) w.classList.add('chf-intro');   // イントロ中は UI・ソラモ・マスを出さない
    let res = null;
    try { res = await MMCHI.play(V.cfg, { key, host: w, chapterId: V.cfg.chapterId, title: V.cfg.title, patternId: f.patternId, calm: V.calm }); }
    catch (e) {}
    finally {
      // FIELD 1 の正式な開始状態：ソラモ・マス・UI を出す（飛ばしたときも同じ。途中の状態では止まらない）
      const w2 = $('#chfw'); if (w2) { w2.classList.add('chf-uiin'); w2.classList.remove('chf-intro'); setTimeout(() => w2.classList.remove('chf-uiin'), 420); }
      if (res && res.skipped) await wait(350);   // 飛ばしたタップが下の START に届かないよう少し待ってから操作できる
      V.intro = false; busySet(false);
    }
    if (onField() && chfActive(m) && P8().boardPhase(m) === 'roll') refreshDeck(m);
  }
  // ---------------------------------------------------------
  // 大会会場への到着（config.arrival）：最後のマス（ゴール）に着いたら、通常のフィールド進行を終える。
  //  到着イベント専用の背景（マスもサイコロも無い）へクロスフェード → フィナの短い会話（この個体のこの Chapter で1回＝m.raise.field.arrivalSeen）
  //  → 大会受付（index.html の p9ReceptionHtml：ランク選択 → 参加 → 開始演出 → セドリックの進行）。再読み込みでは会話を見たなら受付から
  // ---------------------------------------------------------
  function arrivalLines(A) {
    const S = gS() || {}, nm = root.MMP11P ? MMP11P.sanitize(S.playerName) : (S.playerName || 'アルト');
    return (A.talk || []).map((l) => ({ ...l, text: String(l.text || '').split('{name}').join(nm) }));
  }
  function receptionHtml(m) { return `<div class="chrcv" id="chrcv">${root.p9ReceptionHtml ? root.p9ReceptionHtml(m) : (root.p8GoalHtml ? root.p8GoalHtml(m) : '')}</div>`; }
  async function chfArrive(m, fromField) {
    const A = V.cfg.arrival, f = MMCH.fieldOf(m), w = $('#chfw'), ui = $('#chf-ui'); if (!w || !ui) return;
    if (busyGet() && $('#chfarr')) return;   // 演出・会話の途中で呼ばれた：続きはそのまま
    let ov = $('#chfarr');
    if (!ov) { w.insertAdjacentHTML('beforeend', `<div class="chf-arrive" id="chfarr" style="--fade:${V.calm ? 0 : (A.fadeMs || 900)}ms"><img class="chf-arrive-bg" src="${esc(A.bg)}" alt="" draggable="false"><div class="chf-arrive-name"><small>CHAPTER ${esc(V.cfg.chapterId)}　到着</small><b>${esc(A.name || '')}</b></div></div>`); ov = $('#chfarr'); }
    ui.innerHTML = '';   // HUD・操作欄（START・4コマンド）・マスの UI を消す
    w.classList.add('arrive');
    if (f.arrivalSeen) { ov.classList.add('now', 'on'); ui.innerHTML = receptionHtml(m); return; }
    busySet(true);
    try {
      if (fromField && !V.calm) await wait(500);   // ゴールに着いた姿を少し見せてから
      if (!fromField) ov.classList.add('now');
      ov.classList.add('on');
      await wait(V.calm || !fromField ? 0 : (A.fadeMs || 900) + 200);
      if (!$('#chfarr')) return;
      if (root.MMNPC && !root.MM_QA_NO_ARRIVAL && (A.talk || []).length) await MMNPC.talk(arrivalLines(A));
      f.arrivalSeen = true; doSave();
    } finally { busySet(false); }
    const u2 = $('#chf-ui'); if ($('#chfarr') && u2 && chfActive(m) && P8().boardPhase(m) === 'goal') u2.innerHTML = receptionHtml(m);
  }
  /** 分岐：少し引いて、2つの道の入口が視界に入るようにする */
  /** 分かれ道：それぞれの道の入口（最初の1地点）だけに小さな光の印と道の名前を出す（その先の地点は出さない。画像は使わない） */
  function branchHints(m, ns) {
    const fx = $('#chffx'); if (!fx) return; fx.querySelectorAll('.chf-brhint').forEach((e) => e.remove());
    const br = (V.cfg.branches || []).find((b) => b.at === m.raise.node) || { options: [] };
    for (const n of ns) { const o = br.options.find((x) => x.to === n.id) || {}; fx.insertAdjacentHTML('beforeend', `<i class="chf-brhint" data-id="${esc(n.id)}" style="left:${(n.mx * V.sc.w).toFixed(1)}px;top:${(n.my * V.sc.h).toFixed(1)}px;--d:${n.d}"><b>${esc(o.label || '')}</b></i>`); }
  }
  function branchCamera(m) {
    const r = m.raise, opts = (r.pend && r.pend.opts) || [], ns = opts.map((id) => V.g.nodes[id]).filter((n) => n && n.field === V.field);
    if (!V.monPos) return;
    if (ns.length) { const cx = ns.reduce((s, n) => s + n.mx, 0) / ns.length * V.sc.w, cy = ns.reduce((s, n) => s + n.my, 0) / ns.length * V.sc.h; camFocus({ x: cx, y: cy }, 0.5, CA().zoom.branch); branchHints(m, ns); }
    else camFocus({ x: V.monPos.x + V.look[0] * 160 * V.monPos.d, y: V.monPos.y + V.look[1] * 160 * V.monPos.d }, 0.5, CA().zoom.branch);   // 道の先が別の背景：進む向きの先を見せて少し引く
  }
  const onField = () => !!$('#chf') && !!$('#bmonw');
  /**
   * HUD と操作欄を常に画面の固定位置に出すため、フィールドの器（.chfw）を囲む #app・main・ページのスクロール量を 0 に戻す。
   *  原因（2026-10-01）：#app は縦スクロールできる器で、前の画面でスクロールした量（ステータス・技管理・出発準備の下の方を見ていた）や、
   *  画面の登場アニメ（translateY 12px）の 0.3秒の間に #app がはみ出して受け付けたスクロール量が、フィールドを描いた後も残ることがあった。
   *  .chfw は #app の中の position:relative なので、その量だけ HUD（上）が画面の外へ押し上げられていた。CSS でも #app:has(>.chfw) を overflow:hidden にし、登場アニメは不透明度だけにしている
   */
  function unscroll() { try { for (const e of [$('#app'), document.querySelector('main'), document.scrollingElement, document.body]) if (e && e.scrollTop) e.scrollTop = 0; if (root.scrollX || root.scrollY) root.scrollTo(0, 0); } catch (e) {} }
  function setMsg(t) { const b = $('#bmsg'); if (b) b.innerHTML = t; }
  /** 出目の小さな表示（HUD の下・右上）：サイコロの停止面が主で、文字は補助。短く出て自然に消える */
  function rollToast(v, fat) {
    const ui = $('#chf-ui'); if (!ui) return; const old = ui.querySelector('.chroll'); if (old) old.remove();
    const d = document.createElement('div'); d.className = 'chroll'; d.setAttribute('aria-live', 'polite'); d.innerHTML = `<small>出目</small><b>${v}</b><span>${DIST[v] || ''}</span><em>疲れ +${fat}</em>`; ui.appendChild(d);
    setTimeout(() => { d.classList.add('out'); setTimeout(() => d.remove(), 300); }, V.calm ? 900 : 1500);
  }
  /** 技設定・ステータス（既存のファーム画面 hall('w')／hall('st')。Chapter中でも開ける従来どおりの画面。移動中は開かない） */
  function chfOpen(id) { const m = gS() && gS().m; if (!chfActive(m) || busyGet() || P8().boardPhase(m) !== 'roll') return; try { hall(id); } catch (e) {} }
  function lockUi(on, except) { document.querySelectorAll('#chf-ui button').forEach((b) => { if (on && !(except && b.matches(except))) b.disabled = true; }); }

  /**
   * START（1タップ）：出目・ターン消費・疲れを確定して保存（演出の前。中断・再読み込みで振り直せない）→ サイコロが START の位置から出現して回り、
   *  自動で減速して停止面（dice_stop_N）→ 少し見せて消える → 1地点ずつ移動 → 停止処理 → START に戻る。
   *  演出・移動・停止処理の間は busy（bBusy＋MMCHD.isLocked）で、START も4コマンドも受け付けない（連打しても1ターンしか進まない）
   */
  async function chfRoll() {
    const m = gS() && gS().m; if (!chfActive(m) || busyGet() || !P8().canRoll(m)) return;
    busySet(true); lockUi(true);
    try {
      const r = P8().roll(gS(), m); doSave();
      refreshHud(m); if (root.sfx) root.sfx(7);
      const host = $('#chfw') || $('#chf-ui') || document.body, hr = host.getBoundingClientRect(), bt = $('#brollbtn');
      const from = bt ? (() => { const b = bt.getBoundingClientRect(); return { x: b.left + b.width / 2 - hr.left, y: b.top + b.height / 2 - hr.top }; })() : null;   // START の位置から出現する
      const fv = $('#chf'), fr = fv ? fv.getBoundingClientRect() : hr;
      refreshDeck(m, 'サイコロを振った…'); lockUi(true);
      if (root.MMCHD) await MMCHD.play(r.value, { host, from, land: { x: fr.left + fr.width / 2 - hr.left, y: fr.top + fr.height * 0.44 - hr.top } });   // 着地はモンスターの頭より上（モンスターを隠さない）。自動停止
      rollToast(r.value, m.raise.pend ? m.raise.pend.fatigueAdded || 0 : 0); refreshDeck(m, ''); lockUi(true);
    } finally { busySet(false); }
    chfContinue();
  }
  async function chfContinue() {
    const m = gS() && gS().m; if (!chfActive(m) || busyGet() || !m.raise.pend) return;
    busySet(true);
    try {
      let first = true;
      while (m.raise.pend && m.raise.pend.stage === 'move') {
        if (!$('#bmonw')) break;
        const s = P8().step(gS(), m); doSave();
        const last = !(m.raise.pend && m.raise.pend.stage === 'move');
        if (s.node) await walkTo(m, s.node, first, last);
        first = false;
      }
      if (V.moving) { V.moving = false; anim('idle'); }
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
    const sh = $('#chf-ui .chbr'); if (sh) sh.remove(); document.querySelectorAll('#chf .chf-brhint').forEach((e) => e.remove());
    const fb = MMCH.fieldOf(m).branch || V.g.nodes[id].branch;   // 選んだ道（f.branch は最初の1歩で記録される）
    document.querySelectorAll('#chf .chf-obj').forEach((e) => { const n = V.g.nodes[e.dataset.id]; if (!n || !n.branch || !sameBranchGroup(V.cfg, n.branch, fb)) return; if (n.branch === fb) e.classList.remove('brhide'); else e.classList.add('gone'); });
    const n = V.g.nodes[id];   // 選んだ道のほうへ少し寄ってから歩き出す（別の背景へ続く道なら、進む向きの先へ）
    if (n && n.field === V.field) camFocus({ x: n.mx * V.sc.w, y: n.my * V.sc.h }, 0.45, CA().zoom.idle);
    else if (V.monPos) camFocus({ x: V.monPos.x + V.look[0] * 140 * V.monPos.d, y: V.monPos.y + V.look[1] * 140 * V.monPos.d }, 0.4, CA().zoom.idle);
    V.pickLean = V.calm ? 0 : 160;   // 寄る時間（歩き出す前に walkTo が待ち、そのあと寄りを解く）
    chfContinue();
  }
  async function chfRest() {
    const m = gS() && gS().m; if (!chfActive(m) || busyGet() || !P8().canRest(m)) return;
    busySet(true); lockUi(true);
    let res;
    try {
      const before = MMCH.fatigue(m); res = P8().rest(gS(), m); doSave();
      const w = $('#bmonw'); if (w) { w.insertAdjacentHTML('beforeend', '<i class="chf-zz">Z<small>z</small></i>'); anim('rest'); w.classList.add('resting'); }
      refreshHud(m); setMsg(`ひと休みした。　疲れ −${before - MMCH.fatigue(m)}`);
      await wait(900);
      if (w) { w.classList.remove('resting'); const z = w.querySelector('.chf-zz'); if (z) z.remove(); }
    } finally { busySet(false); }
    if (onField()) chfBoard(`ひと休みした。疲れ ${MMCH.fatigue(m)}` + (res && res.timeUp ? '　ターンを使い切った…' : ''));
  }
  // ---- 停止地点の結果（短く。タップで早送り） ----
  function popup(html, cls, ms, frame) {
    const ui = $('#chf-ui'); if (!ui) return wait(0);
    const d = document.createElement('div'); d.className = `chpop ${cls || ''}${frame ? ' framed' : ''}`; d.innerHTML = html; ui.appendChild(d);
    if (frame) d.style.backgroundImage = `url(${frame})`;   // 演出の枠（画像に文字は入れない。能力名・数値は HTML）
    return new Promise((ok) => { let done = false; const end = () => { if (done) return; done = true; d.classList.add('out'); setTimeout(() => { d.remove(); ok(); }, 160); };
      V.skip = end; setTimeout(end, ms); d.addEventListener('click', end); });
  }
  function fxText(fx) {
    const L = (k) => labOf(k);
    if (fx.kind === 'chstat') return { h: `<small>${L(fx.key)}のマス</small><b>${L(fx.key)} +${fx.amount}</b>`, c: 'ok stat', frame: 'statUp', t: `${L(fx.key)} +${fx.amount}` };   // 能力マス：成長適性の値だけ上がる（失敗・大成功なし）
    if (fx.kind === 'treasure') { const tl = { normal: '宝箱', rare: '珍しい宝箱', special: '特別な宝箱' }[fx.tier] || '宝箱', gain = fx.reward && fx.reward.kind === 'gold' ? `+${fx.reward.amount}G` : ''; return { h: `<small>道端で${tl}を見つけた！</small><b>${gain || '…'}</b>`, c: `tr tr-${fx.tier}`, t: `${tl}を開けた！ ${gain}` }; }
    if (fx.ev) {
      let eff = '';
      if (fx.kind === 'fatigue') eff = `疲れ −${fx.recovered}`; else if (fx.kind === 'stat') eff = `${L(fx.key)} ${fx.amount >= 0 ? '+' : '−'}${Math.abs(fx.amount)}`;
      else if (fx.kind === 'multi') eff = fx.gains.map((x) => `${L(x.key)}+${x.amount}`).join(' '); else if (fx.kind === 'gold') eff = `+${fx.amount}G`;
      return { h: `<small>${esc(fx.text)}</small><b>${eff}</b>`, c: `ev ev-${fx.tier || 'normal'}`, t: `${fx.text} ${eff}` };
    }
    return null;
  }
  const objPoint = (obj) => obj ? { x: parseFloat(obj.style.left), y: parseFloat(obj.style.top) } : null;
  /** バトル地点：草むらが揺れて、旅の途中で出会う（目印は常設しない） */
  async function encounter(m, bt) {
    const fx = $('#chffx'), w = $('#bmonw'); if (!fx || !w || !V.monPos) return;
    const d = V.monPos.d, side = V.facing >= 0 ? 1 : -1, x = V.monPos.x + side * 92 * d, y = V.monPos.y + 10 * d, src = asset(V.cfg, (V.cfg.nodeLook && V.cfg.nodeLook.tuft) || 'grass_front');
    fx.insertAdjacentHTML('beforeend', `<i class="chf-rustle" style="left:${x.toFixed(1)}px;top:${y.toFixed(1)}px;width:${(190 * d).toFixed(0)}px;height:${(72 * d).toFixed(0)}px;background-image:url(${src});background-position:${(-rnd01() * 700).toFixed(0)}px 100%"></i><i class="chf-alert" style="left:${V.monPos.x.toFixed(1)}px;top:${(V.monPos.y - monH() * d * 1.02).toFixed(1)}px;--d:${d}">！</i>`);
    V.moving = false; camFocus({ x, y }, 0.3, CA().zoom.focus);
    if (root.sfx) root.sfx(2);
    const cut = effectAsset(((V.cfg.battleTypes || {})[bt] || {}).cutin);   // 野生バトル突入のカットイン（config.battleTypes.wild.cutin。レア・ライバルには付けない）
    if (cut && !V.calm) { const ui = $('#chf-ui'); if (ui) { ui.insertAdjacentHTML('beforeend', `<div class="chf-cutin"><img src="${esc(cut)}" alt="" draggable="false"></div>`); const c = ui.querySelector('.chf-cutin:last-child'); setTimeout(() => c && c.remove(), 700); } }
    await wait(V.calm ? 120 : 640);
    fx.querySelectorAll('.chf-rustle,.chf-alert').forEach((e) => e.remove());
  }
  async function chfResolve() {
    const m = gS() && gS().m; if (!chfActive(m) || busyGet() || !onField() || !m.raise.pend || m.raise.pend.stage !== 'resolve') return;
    busySet(true);
    let tail = '';
    try {
      const id = m.raise.node, r = P8().resolveLanding(gS(), m); doSave();
      const fx = r.fx || {}, T = fxText(fx), obj = $(`#chf .chf-obj[data-id="${id}"]`), tile = $(`#chf .chf-tile[data-id="${id}"]`);
      if (tile && fx.kind !== 'none') { tile.classList.remove('hit'); void tile.offsetWidth; tile.classList.add('hit'); }   // 止まったマスが光る（素材の色は変えない）
      refreshHud(m);
      if (fx.kind === 'chstat' || (fx.ev && fx.kind !== 'none') || fx.kind === 'treasure') {
        if (root.sfx) root.sfx(3);
        const P = objPoint(obj);
        if (P) camFocus(P, fx.kind === 'treasure' ? 0.45 : 0.36, CA().zoom.focus);   // 物のほうへ少し寄る（大きくズームしない）
        if (obj && obj.classList.contains('hid')) { obj.classList.remove('hid'); await wait(V.calm ? 0 : 240); }   // 道端の物が現れる（発見）
        if (obj) { obj.classList.add('hit'); if (fx.kind === 'treasure') { await wait(V.calm ? 0 : 180); const im = obj.querySelector('img[data-open]'); if (im && im.dataset.open) im.src = im.dataset.open; obj.classList.add('open'); } }   // 正式の宝箱は開いた絵へ
        setMsg(T ? T.t : '');
        await popup(T ? T.h : '', T ? T.c : '', fx.kind === 'chstat' ? 850 : 1300, T && T.frame ? effectAsset(T.frame) : null);
        if (obj) { obj.classList.remove('hit'); obj.classList.add('used'); }
        camFocus(null);
        tail = T ? T.t : '';
      } else if (fx.kind === 'battle') await encounter(m, fx.battleType);
      if (r.goal) tail = `${tail}　大会会場に着いた！`.trim(); else if (r.timeUp) tail = `${tail}　ターンを使い切った…`.trim();
      await showReaction(m, fx);
    } finally { busySet(false); }
    if (onField()) chfBoard(tail || undefined);
  }
  // ---- 同行者（フィナ）のリアクションの差し込み口：停止地点の結果 → MMCH.companionReaction（config.companion.reactions）→ 登録した描画（既定は何も出さない。会話UIは未決） ----
  //  既定の描画：フィナの小さな吹き出し（.chf-fina：顔・名前・一言。約1.6秒で消える。config.companion.reactions に本文があるときだけ出る＝本文は未決）
  const FINA_FACE = './assets/npc/fina/closeup/';
  async function finaBubble(rx) {
    const ui = $('#chf-ui'); if (!ui || !rx || !rx.text) return;
    const old = ui.querySelector('.chf-fina'); if (old) old.remove();
    const d = document.createElement('div'); d.className = 'chf-fina'; d.setAttribute('aria-live', 'polite');
    d.innerHTML = `<img src="${FINA_FACE}${esc(rx.expression || 'normal')}.webp" alt=""><div><b>フィナ</b><span>${esc(rx.text)}</span></div>`;
    ui.appendChild(d);
    await wait(V.calm ? 900 : 1600); d.classList.add('out'); await wait(220); d.remove();
  }
  let reactionRenderer = (rx) => finaBubble(rx);
  function registerReactionRenderer(fn) { reactionRenderer = typeof fn === 'function' ? fn : null; }
  async function showReaction(m, fx) {
    if (!reactionRenderer) return;
    try { const rx = MMCH.companionReaction(m, fx); if (rx) await reactionRenderer(rx, { m, fx, calm: V.calm }); } catch (e) {}
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
  root.addEventListener && root.addEventListener('resize', () => { const m = gS() && gS().m; if ($('#chf') && chfActive(m) && V.monPos && !V.moving) { V.par0 = null; camTarget(V.monPos.x, V.monPos.y, V.monPos.d, true); } });

  Object.assign(root, { chfActive, chfBoard, chfRoll, chfRest, chfPick, chfContinue, chfResolve, chfItems, chfItemsClose, chfItemUse, chfOpen });
  root.MMCHV = Object.freeze({ STEP_MS, FACING, DEFAULTS: DEF,
    state: () => ({ field: V.field, cam: { ...V.cam }, target: { ...V.tgt }, key: V.key, moving: V.moving, look: [...V.look], focus: V.focus ? { ...V.focus } : null, monster: V.monPos ? { ...V.monPos } : null, animator: (V.animator || DEFAULT_ANIMATOR).id }),
    lookOf, sideOffset, landmarkPos: (id) => { const n = V.g && V.g.nodes[id]; if (!n) return null; const m = gS() && gS().m, a = MMCH.fieldOf(m).nodeAssignments[id] || (['strong', 'rival'].includes(n.kind) ? { t: 'battle', bt: n.kind } : null), look = lookOf(V.cfg, a); return look ? landmarkPos(V.cfg, V.g, V.sc, id, look) : null; },
    zoomAt, registerMonsterAnimator, registerReactionRenderer, focusPoint, tileKeyOf, tileSpriteOf, roadX: (x, y, d) => roadX(x, y, d != null ? d : depthAtY(y)), stepDuration: (from, to) => { const r = MMCH.routeBetween(V.g, from, to).map((p) => [p[0] * V.sc.w, p[1] * V.sc.h]); return stepDuration(r, to); } });
})(typeof window !== 'undefined' ? window : globalThis);
