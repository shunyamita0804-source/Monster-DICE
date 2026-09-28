// =========================================================
// Phase 10：正式モンスターマスター（window.MMP10M）
//  正式主要原種4体（ソラモ・ガウル・ノビトン・ジオル）の正式データを一か所で持つ。
//  ・通常6能力（ライフ・ちから・かしこさ・命中・回避・丈夫さ）は最大999
//  ・素早さは通常6能力とは別の正式ステータス：1〜10、数値が大きいほど速い（10が最速）
//  ・固有スキルは「データだけ」登録する（発動処理は後のバトル専用Phaseで実装。fight()・Battle Engineへは接続しない）
//  ・未確定の項目は null のまま持つ（推測で埋めない）。例：ジオルの英字表記、ソラモ・ガウル・ノビトンの性格
//  ・「正式データに登録されていること」と「市場で買えること」は別（市場の扱いは市場側で決める）
//  種族ID（0〜3）は既存セーブの m.sp と同じ番号。旧データの SP 配列（index.html）は現在の購入・生成処理が使う旧表で、
//  ソラモ・ガウルの初期能力はこのマスターと一致している（テストで確認）。
// =========================================================
(function (root) {
  'use strict';
  const STAT_KEYS = Object.freeze(['li', 'po', 'in', 'hi', 'ev', 'de']);
  const STAT_LABELS = Object.freeze({ li: 'ライフ', po: 'ちから', in: 'かしこさ', hi: '命中', ev: '回避', de: '丈夫さ' });
  const STAT_MAX = 999;
  const SPEED_MIN = 1, SPEED_MAX = 10;   // 大きいほど速い（1＝最も遅い、10＝最も速い）
  const isValidSpeed = (v) => Number.isInteger(v) && v >= SPEED_MIN && v <= SPEED_MAX;
  const fz = (o) => Object.freeze(o);

  // ---- 固有スキル（データのみ。implemented:false ＝ まだ発動しない） ----
  //  id は種族の文字ID（solamo 等）に基づく安定した内部ID。
  //  params は正式説明文にある数値だけを機械可読にしたもの。hiddenParams はプレイヤー向け表示に出さない値。
  const UNIQUE_SKILLS = fz({
    unique_solamo: fz({ id: 'unique_solamo', species: 0, speciesKey: 'solamo', name: '逆境のひと踏ん張り', implemented: false,
      desc: 'ライフが20％以下になると、次に与えるダメージが1度だけ1.25倍になる。',
      params: fz({ lifeRatioAtMost: 0.2, damageMultiplier: 1.25, uses: 1 }), hiddenParams: fz([]) }),
    unique_gauru: fz({ id: 'unique_gauru', species: 1, speciesKey: 'gauru', name: '紅翼の猛攻', implemented: false,
      desc: '戦闘開始から3ターンの間、ちからとかしこさがそれぞれ5％アップする。',
      params: fz({ turnsFromStart: 3, statUpRatio: 0.05, stats: fz(['po', 'in']) }), hiddenParams: fz([]) }),
    unique_nobiton: fz({ id: 'unique_nobiton', species: 2, speciesKey: 'nobiton', name: 'ふしぎな嗅覚', implemented: false,
      // 状態異常システムは未確定：発動条件の「状態異常」は定義されていない（仮の状態異常は作らない）
      desc: '相手が状態異常の間、自分のちから・かしこさ・丈夫さがそれぞれ5％アップする。',
      params: fz({ condition: 'opponent_has_status_ailment', statUpRatio: 0.05, stats: fz(['po', 'in', 'de']) }), hiddenParams: fz([]) }),
    unique_jiol: fz({ id: 'unique_jiol', species: 3, speciesKey: 'jiol', name: '大地の守り', implemented: false,
      desc: '致命的なダメージを受けた際、確率で1度だけライフ1で耐えることがある。',
      params: fz({ chance: 0.1, surviveAtLife: 1, uses: 1 }), hiddenParams: fz(['chance']) }),
  });

  // ---- 正式主要原種 ----
  //  tagline：市場などで使う短い紹介文。ソラモ・ガウルは既存ゲーム内の説明文、ノビトンは正式プロフィール資料の文。未提供は null。
  const SPECIES = fz([
    fz({ id: 0, key: 'solamo', name: 'ソラモ', en: 'SORAMO', kind: '獣種', personality: null, formerNames: fz([]),
      base: fz({ li: 100, po: 100, in: 100, hi: 100, ev: 100, de: 100 }), speed: 5, uniqueSkill: 'unique_solamo', tagline: 'バランス型',
      image: fz({ src: './assets/monsters/solamo.png', w: 720, h: 664 }), }),
    fz({ id: 1, key: 'gauru', name: 'ガウル', en: 'GAURU', kind: '鳥種', personality: null, formerNames: fz(['ハヤテ']),
      base: fz({ li: 80, po: 110, in: 110, hi: 90, ev: 90, de: 60 }), speed: 7, uniqueSkill: 'unique_gauru', tagline: '攻撃に特化したアタッカー',
      image: fz({ src: './assets/monsters/gauru.png', w: 720, h: 647 }), }),
    fz({ id: 2, key: 'nobiton', name: 'ノビトン', en: 'NOBITON', kind: '獣種', personality: null, formerNames: fz([]),
      base: fz({ li: 120, po: 80, in: 80, hi: 80, ev: 50, de: 100 }), speed: 2, uniqueSkill: 'unique_nobiton', tagline: 'のびる・たれる・くっつく。不思議な鼻（くち）を持つ、マイペースなモンスター。',
      image: fz({ src: './assets/monsters/nobiton.png', w: 720, h: 658 }),
      silhouette: fz({ src: './assets/monsters/nobiton_silhouette.png', w: 720, h: 658 }) }),
    // ジオル：英字表記は正式仕様に未記載のため null（推測で決めない）
    fz({ id: 3, key: 'jiol', name: 'ジオル', en: null, kind: '岩石種', personality: 'のんびり・おとなしい', formerNames: fz([]),
      base: fz({ li: 90, po: 120, in: 40, hi: 50, ev: 30, de: 150 }), speed: 1, uniqueSkill: 'unique_jiol', tagline: null,
      image: fz({ src: './assets/monsters/jiol.png', w: 720, h: 531 }), }),
  ]);
  // ---- 種族IDの役割（二重管理にしない：1つの種族レコードが両方を持つ） ----
  //  id（0〜3の番号）…既存互換用。セーブの m.sp・旧SP表・fight() などの既存コードは番号のまま使う（変更・削除しない）。
  //  key（solamo 等） …新規参照用。画像アセット・マスター参照・市場・将来の技／亜種／合体／図鑑はこちらを使う。
  //  個体データ（セーブ）には番号だけを保存し、文字IDは keyOf(m.sp) でその都度引く（保存しないので食い違いが起きない）。
  const byId = (sp) => SPECIES.find((s) => s.id === sp) || null;
  const byKey = (key) => SPECIES.find((s) => s.key === key) || null;
  const keyOf = (sp) => { const s = byId(sp); return s ? s.key : null; };
  const idOf = (key) => { const s = byKey(key); return s ? s.id : null; };
  const pick = (ref) => (typeof ref === 'string' ? byKey(ref) : byId(ref));
  /** 正式画像（番号でも文字IDでも引ける）。画面はここからだけ画像を取る */
  const imageOf = (ref) => { const s = pick(ref); return s ? s.image : null; };
  const silhouetteOf = (ref) => { const s = pick(ref); return (s && s.silhouette) || null; };
  const speedOf = (sp) => { const s = byId(sp); return s ? s.speed : null; };
  const baseOf = (sp) => { const s = byId(sp); return s ? { ...s.base } : null; };
  const skillOf = (sp) => { const s = byId(sp); return s ? UNIQUE_SKILLS[s.uniqueSkill] : null; };
  /** プレイヤー向けの固有スキル説明（内部専用の数値は出さない。説明文自体が内部数値を含まない） */
  const skillText = (sp) => { const k = skillOf(sp); return k ? { name: k.name, desc: k.desc } : null; };

  /**
   * 個体の素早さ（正式フィールド名 speed）を保証する：種族 → 正式マスター → speed → 個体。
   *  ・speed が無い／1〜10の整数でない個体だけ、その種族の正式値を入れる（既存の正しい値は変えない）
   *  ・正式マスターに無い種族は何もしない
   *  新しい個体の生成時とセーブ（v4〜v6）の読み込み時に、MMP8 の補正フックから呼ばれる。
   */
  function ensureSpeed(m) {
    if (!m || isValidSpeed(m.speed)) return m;
    const v = speedOf(m.sp);
    if (v != null) m.speed = v;
    return m;
  }
  if (root.MMP8 && typeof root.MMP8.addIndividualNormalizer === 'function') root.MMP8.addIndividualNormalizer(ensureSpeed);

  // ---- お金と市場（正式値。ゲームの購入処理・初期所持金への反映は市場Step〔Step 4〕で行う） ----
  const ECONOMY = fz({ initialGold: 300, marketPrice: 500 });
  //  市場に存在するモンスター（並び順＝カルーセルの順）。ジオルは市場に存在しない（入れない）。
  //  status：'sale'（販売中）／'waiting'（入荷待ち＝購入不可。ロック・未解放ではない）
  const MARKET_CATALOG = fz([
    fz({ key: 'solamo', status: 'sale', price: ECONOMY.marketPrice }),
    fz({ key: 'gauru', status: 'sale', price: ECONOMY.marketPrice }),
    fz({ key: 'nobiton', status: 'waiting' }),
  ]);

  // ---- 市場での購入（Phase 10 Step 4） ----
  const OWN_LIMIT = 8;   // 既存ルール：手持ち＋牧場で8体まで（旧購入処理と同じ値）
  const marketItem = (key) => MARKET_CATALOG.find((c) => c.key === key) || null;
  /**
   * 初回購入救済：手持ち0体・牧場0体・所持金が500G未満のときだけ、市場での購入操作の時点で所持金を500Gにする。
   *  「所持金500G未満ならいつでも補填」ではない（1体でも所有していれば補填しない）。ゲーム開始時や他の画面では起きない。
   *  1体以上所有しているときの行き詰まりは、下の継続用救済（continueRescueApplies）が別の条件で扱う。
   */
  const firstPurchaseRescueApplies = (S, owned) => owned === 0 && (S.g || 0) < ECONOMY.marketPrice;
  // ---- 継続用救済（初回救済とは別の独立した条件。市場価格・購入条件・合体料金は変えない） ----
  //  次の育成を続けられる個体（未育成・育成中）が手持ち・牧場に1体もおらず（＝全員が育成完了）、所持金が500G未満で、
  //  今の個体数と所持金では合体（200G）もできないときだけ、通常販売中の500Gのモンスターの購入を確定する時点で
  //  不足分を補い、所持金を500Gにして通常どおり購入する（購入後は0G）。
  //  補填は purchase()（購入の確定処理）の中だけで行い、確定前の所持金には加えない（アイテム購入・合体費用には使えない）。
  //  手持ち・牧場とも0体のときは初回救済の対象で、ここでは扱わない。所持上限（8体）の判定もこれまでどおり先に行う。
  const FUSION_COST = 200;   // 合体費用（index.html の fuse() と同じ値。判定の参照用で、合体料金はここでは決めない）
  const ownedMonsters = (S) => [S && S.m, ...(S && Array.isArray(S.box) ? S.box : [])].filter(Boolean);
  const raiseStateOf = (m) => { const P7 = root.MMP7; return P7 && typeof P7.raiseState === 'function' ? P7.raiseState(m) : ((m && m.raise && m.raise.state) || 'none'); };
  function continueRescueApplies(S, key, owned) {
    const c = marketItem(key);
    if (!S || !c || c.status !== 'sale' || c.price !== ECONOMY.marketPrice) return false;   // 通常販売中の500Gのモンスターだけ
    if ((S.g || 0) >= ECONOMY.marketPrice) return false;                                        // 500G以上なら通常どおり代金だけ
    const mons = ownedMonsters(S);
    if (!mons.length || owned !== mons.length) return false;                                     // 0体は初回救済の対象
    if (!mons.every((m) => raiseStateOf(m) === 'done')) return false;                            // 未育成・育成中の個体がいれば発動しない
    if (mons.length >= 2 && (S.g || 0) >= FUSION_COST) return false;                            // 今の所持金で合体できるなら発動しない
    return true;
  }
  /** 購入できるか：not_in_market（市場に無い：ジオルなど）/ waiting（入荷待ち）/ full（8体まで）/ no_money
   *  rescue＝初回救済（従来どおり）、continueRescue＝継続用救済（確定時に不足分を補填） */
  function canPurchase(S, key, owned) {
    const c = marketItem(key);
    if (!c) return { ok: false, reason: 'not_in_market' };
    if (c.status !== 'sale') return { ok: false, reason: 'waiting' };
    if (owned >= OWN_LIMIT) return { ok: false, reason: 'full' };
    const rescue = firstPurchaseRescueApplies(S, owned);
    if (!rescue && (S.g || 0) < c.price) {
      if (continueRescueApplies(S, key, owned)) return { ok: true, price: c.price, rescue: false, continueRescue: true };
      return { ok: false, reason: 'no_money' };
    }
    return { ok: true, price: c.price, rescue };
  }
  /** 代金の支払い（個体の生成は既存の個体生成処理で行う）。救済が発生したら、この確定処理の中でだけ所持金を500Gにしてから支払う */
  function purchase(S, key, owned) {
    const c = canPurchase(S, key, owned); if (!c.ok) return c;
    const before = S.g || 0;
    if (c.rescue || c.continueRescue) S.g = ECONOMY.marketPrice;
    S.g -= c.price;
    const r = { ok: true, key, price: c.price, rescued: c.rescue, before, after: S.g };
    if (c.continueRescue) Object.assign(r, { continueRescued: true, topUp: ECONOMY.marketPrice - before });
    return r;
  }

  // ---- モンスター売却（牧場） ----
  //  未育成＝50G。育成完了＝100G＋育成中に増えた6能力（ライフ・ちから・かしこさ・命中・回避・丈夫さ）の合計（上限150G）
  //  ＋その個体自身の最高到達公式ランクの加算（E25・D50・C75・B100・A125・S150G、未到達0G）。最終売却額は最大400G（市場価格500G未満）。
  //  能力上昇＝育成開始時（m.raise.startStats）と育成完了時（m.raise.endStats）の差（1回の育成全体。MMP8 が記録）。
  //  記録の無い旧セーブは推測せず0G（基本額とランク加算だけ）。育成中の個体がいるとき・最後の1体は売却できない。
  const SELL = fz({ unraised: 50, base: 100, gainCap: 150, max: 400, rankBonus: fz([25, 50, 75, 100, 125, 150]) });
  const SELL_STATS = fz(['li', 'po', 'in', 'hi', 'ev', 'de']);
  const statsOk = (x) => !!x && typeof x === 'object' && SELL_STATS.every((k) => Number.isFinite(x[k]));
  const statTotal = (x) => SELL_STATS.reduce((a, k) => a + x[k], 0);
  function topRankOf(m) { const rc = m && m.prog && Array.isArray(m.prog.rankClr) ? m.prog.rankClr : []; let h = -1; rc.forEach((v, i) => { if (v === true && i < SELL.rankBonus.length) h = i; }); return h; }
  /** 売却額（個体単体の見積もり）：{ok, kind:'unraised'|'done', price, base, gain（上限後）, gainRaw（上限前）, gainKnown, rankIdx, rank} / 育成中は raising */
  function sellQuote(m) {
    if (!m) return { ok: false, reason: 'not_found' };
    const st = raiseStateOf(m);
    if (st === 'none') return { ok: true, kind: 'unraised', price: SELL.unraised };
    if (st !== 'done') return { ok: false, reason: 'raising' };
    const r = m.raise || {}, known = statsOk(r.startStats) && statsOk(r.endStats);
    const gainRaw = known ? Math.max(0, statTotal(r.endStats) - statTotal(r.startStats)) : 0, gain = Math.min(SELL.gainCap, gainRaw);
    const rankIdx = topRankOf(m), rank = rankIdx >= 0 ? SELL.rankBonus[rankIdx] : 0;
    return { ok: true, kind: 'done', price: Math.min(SELL.max, SELL.base + gain + rank), base: SELL.base, gain, gainRaw, gainKnown: known, rankIdx, rank };
  }
  /** 売却できるか：raising（育成中の個体がいる）/ not_found / last（最後の1体） */
  function canSell(S, uid) {
    const mons = ownedMonsters(S);
    if (mons.some((x) => { const s = raiseStateOf(x); return s !== 'none' && s !== 'done'; })) return { ok: false, reason: 'raising' };
    const m = uid == null ? null : mons.find((x) => x.uid === uid);
    if (!m) return { ok: false, reason: 'not_found' };
    if (mons.length <= 1) return { ok: false, reason: 'last' };
    const q = sellQuote(m); if (!q.ok) return q;
    return { ...q, m };
  }
  /** 売却の確定：選んだ個体だけを手持ち・牧場から外し、売却額を1回だけ加える（同じ個体はもう見つからないので二重にならない） */
  function sell(S, uid) {
    const c = canSell(S, uid); if (!c.ok) return c;
    const before = S.g || 0, m = c.m;
    if (S.m === m) S.m = null; else { const j = S.box.indexOf(m); if (j < 0) return { ok: false, reason: 'not_found' }; S.box.splice(j, 1); }
    S.g = before + c.price;
    return { ok: true, uid, name: m.name, sp: m.sp, kind: c.kind, price: c.price, before, after: S.g };
  }

  // ---- ノビトンの入荷条件（正式：育成完了5回後） ----
  //  育成完了回数は MMP8.raiseDoneCount（育成完了1回につき1回だけ加算。購入・合体・再読込では増えない）。
  //  条件を満たしても販売（購入）は始めない：販売に必要な正式データ（技・入荷イベントなど）が未確定のため、
  //  MARKET_CATALOG の status は 'waiting'（購入不可）のまま。ここは条件の判定と表示用の値だけを返す。
  const NOBITON_STOCK_RAISES = 5;
  function nobitonStock(S) {
    const P8 = root.MMP8, done = P8 && typeof P8.raiseDoneCount === 'function' ? P8.raiseDoneCount(S) : 0;
    return { need: NOBITON_STOCK_RAISES, done, met: done >= NOBITON_STOCK_RAISES,
      fromStart: !!(P8 && typeof P8.raiseCountFromStart === 'function' && P8.raiseCountFromStart(S)) };
  }

  root.MMP10M = fz({ STAT_KEYS, STAT_LABELS, STAT_MAX, SPEED_MIN, SPEED_MAX, isValidSpeed, UNIQUE_SKILLS, SPECIES,
    byId, byKey, keyOf, idOf, imageOf, silhouetteOf, speedOf, baseOf, skillOf, skillText, ensureSpeed, ECONOMY, MARKET_CATALOG,
    OWN_LIMIT, marketItem, canPurchase, purchase, FUSION_COST, continueRescueApplies, SELL, sellQuote, canSell, sell, NOBITON_STOCK_RAISES, nobitonStock });
})(typeof window !== 'undefined' ? window : globalThis);
