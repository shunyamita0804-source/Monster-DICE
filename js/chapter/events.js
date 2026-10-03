// =========================================================
// Chapter のイベント基盤 `MMEVT`（2026-10-04 第二段階）
//  ・イベントのデータ形式（EVENT_FIELDS）と検査（validate）：イベントは config のデータ（巨大な if を増やさない）
//      - 停止マスのランダムイベント＝config.eventPool：{ id, tier, weight, handler, params, text, lines, choices, recovery }
//        lines＝フィナの会話（{ expression, text }…。止まったマスの吹き出しで順に出す）、choices＝2択（{ id, label, desc, handler, params, text, lines }。選んでから効果）
//      - 節目・条件・チュートリアル＝config.story：{ id, trigger('start'|'land'|'branch'), when, lines, presentation, once, priority, scope('chapter'|'save') }
//        scope 'save'＝このセーブで1回（S.npcFlags.story）。既定はこの個体のこの Chapter で1回（m.raise.field.storySeen）
//      - 施設の初回・再訪・帰還＝js/npc/npc-events.js（MMNPCE）
//  ・イベントキュー run(fn)：フィナの会話・能力の演出・遭遇・画面の切り替えが重ならないよう、1つずつ順に実行する（画面側が使う）
//  ・自動テスト（MM_QA_NO_STORY）：会話を出さず、選択肢は最初の候補を選ぶ（結果の処理・セーブは同じ）
//  セーブ v6（mr4v6）の形は変えない。見た記録は既存の任意項目（S.npcFlags・m.raise.field.storySeen）の中
// =========================================================
(function (root) {
  'use strict';
  const fz = Object.freeze;
  const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
  const EVENT_FIELDS = fz(['id', 'trigger', 'when', 'once', 'weight', 'chapter', 'route', 'lines', 'handler', 'params', 'choices', 'scope', 'priority', 'presentation', 'tier', 'text', 'recovery']);

  // ---- 直列のキュー ----
  let chain = Promise.resolve(), running = 0;
  /** fn（Promise を返してよい）を、前の仕事が終わってから順に実行する。戻り値＝fn の結果の Promise */
  function run(fn) {
    const job = chain.then(() => { running++; return fn(); }).finally(() => { running--; });
    chain = job.then(() => {}, () => {});
    return job;
  }
  const busy = () => running > 0;
  /** キューに積まれている仕事がすべて終わるまで待つ */
  const idle = () => chain;

  // ---- 検査（テスト・開発用） ----
  function validateEvent(e) {
    const errs = [];
    if (!isObj(e)) return ['イベントがオブジェクトではない'];
    if (typeof e.id !== 'string' || !e.id) errs.push('id が無い');
    for (const k of Object.keys(e)) if (!EVENT_FIELDS.includes(k) && !['look', 'asset'].includes(k)) errs.push(`${e.id}：未知の項目 ${k}`);
    if (Array.isArray(e.lines)) for (const l of e.lines) if (!isObj(l) || typeof l.text !== 'string' || !l.text) errs.push(`${e.id}：lines の行が不正`);
    if (e.choices != null) {
      if (!Array.isArray(e.choices) || e.choices.length < 2 || e.choices.length > 3) errs.push(`${e.id}：choices は2〜3択`);
      else for (const c of e.choices) { if (!isObj(c) || typeof c.id !== 'string' || typeof c.label !== 'string') errs.push(`${e.id}：choices の形が不正`); }
    }
    return errs;
  }
  function validatePool(pool) { const ids = new Set(), errs = []; for (const e of pool || []) { errs.push(...validateEvent(e)); if (e && ids.has(e.id)) errs.push(`${e.id}：id が重複`); if (e) ids.add(e.id); } return errs; }

  // ---- 会話の行をそろえる（フィナの吹き出し・共通会話の両方で使える形） ----
  const lineOf = (l, npc = 'fina') => (typeof l === 'string' ? { npc, expression: 'normal', text: l } : { npc: l.npc || l.speaker || npc, expression: l.expression || 'normal', text: String(l.text || '') });
  /** 選択肢を共通会話（MMNPC）の行にする：lines の最後の行（無ければ text）に choices を付ける */
  function choiceLines(fx, npc = 'fina') {
    const L = (fx.lines || []).map((l) => lineOf(l, npc));
    const last = L.length ? L[L.length - 1] : { npc, expression: 'guide', text: fx.text || 'どうする？' };
    if (!L.length) L.push(last);
    L[L.length - 1] = { ...last, choices: (fx.options || []).map((o) => ({ id: o.id, label: o.desc ? `${o.label}　${o.desc}` : o.label })) };
    return L;
  }
  /** 自動テスト用：会話を出さずに選ぶ選択肢（既定＝最初の候補。root.MM_QA_CHOICE に id を入れるとそれを選ぶ） */
  function autoChoice(fx) { const o = fx.options || []; if (!o.length) return null; const want = root.MM_QA_CHOICE; return (want && o.some((x) => x.id === want)) ? want : o[0].id; }

  root.MMEVT = fz({ EVENT_FIELDS, run, busy, idle, validateEvent, validatePool, lineOf, choiceLines, autoChoice });
})(typeof window !== 'undefined' ? window : globalThis);
