// =========================================================
// QA（実ブラウザ）：サイコロの完全停止（2026-10-04 第二段階）
//  実機の試遊で「止まったように見えたあとも ドット・面・向きが微妙に変わる」→ LOCK の瞬間から、画像の src・class・CSS transform（位置・傾き）・
//  影・光の輪・子要素の数・動いているアニメーションのどれも変わらないことを、LOCK の 0／250／500／750ms 後（消えるまで）で比べる。
//  出目 1・2・3（通常）と、同じレンダラを 1〜6 面で使ったとき（分岐用）の 4〜6 も確かめる。
//  SE：主なコマンドで1回だけ（二重に鳴らない）・未開放は UI_ERROR・戻るは UI_CANCEL。
//  Playwright / Chromium が無い環境では省略（skip）する。
// =========================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import * as H from './e2e/harness.mjs';

const SKIP = H.skipReason();
let L = null;
test.before(async () => { if (!SKIP) L = await H.launch(); });
test.after(async () => { if (L) await L.close(); });
const OPEN = [];
const openPage = async (o) => { const p = await L.open(o); OPEN.push(p); return p; };
test.afterEach(async () => { for (const p of OPEN.splice(0)) await p.ctx.close().catch(() => {}); });
const T = (name, fn) => test(name, { skip: SKIP }, fn);

async function start(pg) {
  await H.newGame(pg, 'テスト');
  await pg.evaluate(() => { const m = mk(0); m.name = 'ソラ'; MMP7.ensureProg(m); S.m = m; save(); MMP8.depart(S, m, () => 0.37); save(); board(); });
  await pg.waitForSelector('#chf .chf-bg');
  await pg.waitForTimeout(600);
  if (await pg.$('.chf-fina')) await pg.waitForFunction(() => !document.querySelector('.chf-fina'), null, { timeout: 8000 });
  await pg.waitForFunction(() => !bBusy && !MMCHD.isLocked(), null, { timeout: 20000 });
  await pg.waitForTimeout(250);
  // 10コマの先読みが終わるまで（終わっていないと従来の見せ方になる）
  await pg.evaluate(() => Promise.all(MMCH.getConfig(1).dice.throwFrames.concat(Object.values(MMCH.getConfig(1).dice.resultSprites)).map((s) => new Promise((ok) => { const i = new Image(); i.onload = i.onerror = () => ok(); i.src = s; }))));
}
/** LOCK の瞬間から、サイコロの見た目に関わる値を記録しつづける（rAF ごと） */
const watch = (pg) => pg.evaluate(() => {
  window.__lock = { samples: [], t0: null, gone: null };
  const snap = () => {
    const ov = document.querySelector('.chdz'); if (!ov) return null;
    const mv = ov.querySelector('.chdz-mv'), img = ov.querySelector('.chdz-img'), sh = ov.querySelector('.chdz-sh');
    const cs = (e) => e ? getComputedStyle(e) : null;
    const anims = ov.getAnimations ? ov.getAnimations({ subtree: true }).filter((a) => a.playState === 'running' && a.effect && (!Number.isFinite(a.effect.getComputedTiming().endTime) || a.currentTime < a.effect.getComputedTiming().endTime)).map((a) => (a.effect.target && a.effect.target.className) || '?') : [];
    return { phase: ov.dataset.phase, src: img && img.getAttribute('src'), cls: img && img.className, mv: cs(mv) && cs(mv).transform, rot: cs(img) && cs(img).transform, op: cs(img) && cs(img).opacity,
      sh: cs(sh) && cs(sh).transform + '|' + cs(sh).opacity, kids: mv ? mv.children.length : 0, glow: [...ov.querySelectorAll('.chdz-glow')].map((g) => cs(g).opacity + '|' + cs(g).transform).join(','), out: ov.classList.contains('out'), running: anims };
  };
  const tick = () => {
    const s = snap();
    if (!s) { if (window.__lock.t0 != null && window.__lock.gone == null) window.__lock.gone = performance.now(); if (window.__lock.gone == null) requestAnimationFrame(tick); return; }
    if (s.phase === 'lock' || (window.__lock.t0 != null)) { if (window.__lock.t0 == null) window.__lock.t0 = performance.now(); window.__lock.samples.push({ t: performance.now() - window.__lock.t0, ...s }); }   // LOCK のあと play() は phase を result にするが、見た目は LOCK のまま
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
function assertStill(samples, label) {
  assert.ok(samples.length >= 8, `${label}：LOCK のあと十分なフレームを見た（${samples.length}）`);
  const first = samples[0], keys = ['src', 'cls', 'mv', 'rot', 'sh', 'kids', 'glow'];
  const steady = samples.filter((s) => !s.out);   // 消え始め（.out＝全体のフェードアウト）より前
  assert.ok(steady.length >= 6, `${label}：消える前の静止フレーム ${steady.length}`);
  for (const s of steady) for (const k of keys) assert.equal(String(s[k]), String(first[k]), `${label}：LOCK の ${Math.round(s.t)}ms 後に ${k} が変わった（${first[k]} → ${s[k]}）`);
  for (const s of steady) assert.deepEqual(s.running, [], `${label}：LOCK のあとに動いているアニメーション（${Math.round(s.t)}ms）：${s.running}`);
  assert.equal(first.op, '1'); assert.equal(first.phase, 'lock'); assert.ok(steady.every((x) => x.phase === 'lock' || x.phase === 'result'));
  const last = steady[steady.length - 1]; assert.ok(last.t >= 700, `${label}：少なくとも 0.7秒は静止したまま見せる（${Math.round(last.t)}ms）`);
}

for (const v of [1, 2, 3]) {
  T(`DL-B1（出目 ${v}）：LOCK の瞬間から消えるまで、画像・class・位置・傾き・影・光の輪・子要素のどれも変わらず、動いているアニメーションも無い。出目の面は ${v}`, async () => {
    const p = await openPage(); const pg = p.page;
    await start(pg);
    await watch(pg);
    await pg.evaluate((v) => { window.__mr = Math.random; Math.random = () => ({ 1: 0.1, 2: 0.5, 3: 0.9 }[v]); }, v);
    await pg.click('#brollbtn');
    await pg.evaluate(() => { Math.random = window.__mr; });
    await pg.waitForFunction(() => window.__lock.gone != null, null, { timeout: 20000 });
    const r = await pg.evaluate(() => window.__lock);
    assertStill(r.samples, `出目 ${v}`);
    assert.equal(r.samples[0].src, `./assets/fields/ch1a/dice/dice_stop_${v}.webp`, '出目の面');
    assert.match(r.samples[0].rot, /^matrix\(1, 0, 0, 1, 0, 0\)$|^none$/, '傾き 0°');
    assert.equal(await pg.evaluate(() => S.m.raise.pend ? S.m.raise.pend.roll : null) ?? v, v);
    assert.deepEqual(p.errors, []);
  });
}

T('DL-B2（1〜6 面）：同じレンダラを 6 面で使っても（分岐用）、4〜6 の出目で LOCK のあと何も変わらない。終わったら 3 面に戻る', async () => {
  const p = await openPage(); const pg = p.page;
  await start(pg);
  for (const v of [4, 5, 6]) {
    await watch(pg);
    await pg.evaluate(() => { MMCHD.configure({ sides: 6 }); MMCHD.preload(); });
    await pg.waitForFunction(() => MMCHD.missingSprites().length === 0, null, { timeout: 10000 }); await pg.waitForTimeout(900);   // configure は先読みを作り直す＝そろうまで待つ（そろっていないと従来の見せ方になる）
    await pg.evaluate((v) => { const b = document.querySelector('#brollbtn').getBoundingClientRect(); const host = document.querySelector('#chfw'), hr = host.getBoundingClientRect(); window.__pl = MMCHD.play(v, { host, from: { x: b.left + b.width / 2 - hr.left, y: b.top + b.height / 2 - hr.top } }); }, v);
    await pg.waitForFunction(() => window.__lock.gone != null, null, { timeout: 20000 });
    await pg.evaluate(() => window.__pl);
    const r = await pg.evaluate(() => window.__lock);
    assertStill(r.samples, `出目 ${v}（6面）`);
    assert.equal(r.samples[0].src, `./assets/fields/ch1a/dice/dice_stop_${v}.webp`);
  }
  await pg.evaluate(() => MMCHD.configure({ sides: 3 }));
  assert.deepEqual(p.errors, []);
});

T('DL-B3：SE 監査：街の施設の札・下のバー・ファームのコマンド・戻るは1操作＝1回（二重に鳴らない）。未開放は UI_ERROR だけ、戻るは UI_CANCEL だけ、通常のコマンドは UI_SELECT だけ', async () => {
  const p = await openPage({ navDelay: true }); const pg = p.page;
  await H.newGame(pg, 'テスト');
  await pg.evaluate(() => { const m = mk(0); MMP7.ensureProg(m); S.m = m; save(); lobby(); });
  await pg.waitForSelector('.tpin[onclick="market()"]');
  const arm = () => pg.evaluate(() => { window.__seAt = MMAUDIO.seLog().length; });
  const got = () => pg.evaluate(() => { const l = MMAUDIO.seLog(), r = l.slice(window.__seAt); window.__seAt = l.length; return r; });
  const tap = async (sel) => { const b = await pg.$(sel); const r = await b.boundingBox(); await pg.mouse.click(r.x + r.width / 2, r.y + r.height / 2); await pg.waitForTimeout(700); };
  await arm();
  await tap('.tpin[onclick="townArena()"]'); assert.deepEqual(await got(), ['UI_ERROR'], '闘技場（未開放）＝UI_ERROR だけ');
  await pg.evaluate(() => townMsgClose(document.querySelector('.tlow'))); await pg.waitForTimeout(200); await got();
  await tap('.tpin[onclick="townGuild()"]'); assert.deepEqual(await got(), ['UI_ERROR'], '聖獣士管理局（未開放）＝UI_ERROR だけ');
  await pg.evaluate(() => townMsgClose(document.querySelector('.tlow'))); await pg.waitForTimeout(200); await got();
  await tap('.tpin[onclick="market()"]'); await pg.waitForSelector('.p10mk'); assert.deepEqual(await got(), ['UI_SELECT'], '市場へ＝UI_SELECT を1回');
  await tap('.p10mk .p10back'); await pg.waitForSelector('.tpin[onclick="farm()"]'); assert.deepEqual(await got(), ['UI_CANCEL'], '街へ戻る＝UI_CANCEL を1回');
  await tap('.tbar button[onclick="hall()"]'); await pg.waitForSelector('.fm .fmgo'); assert.deepEqual(await got(), ['UI_SELECT'], 'ファームへ＝UI_SELECT を1回');
  await tap('.fm .fmb[data-spot="status"]'); await pg.waitForSelector('.ds'); assert.deepEqual(await got(), ['UI_SELECT'], 'ステータス＝1回');
  await tap('.ds .dback'); await pg.waitForSelector('.fm .fmgo'); assert.deepEqual(await got(), ['UI_CANCEL'], 'ファームへ戻る＝UI_CANCEL');
  await tap('.fm .fmb[data-spot="item"]'); await pg.waitForSelector('.ds.shop'); assert.deepEqual(await got(), ['UI_SELECT'], 'アイテム屋（ファームの屋台）＝1回');
  await tap('.ds .dback'); await pg.waitForSelector('.fm .fmgo'); assert.deepEqual(await got(), ['UI_CANCEL']);
  await tap('.fm .fmrd'); await pg.waitForSelector('.tpin[onclick="farm()"]'); assert.deepEqual(await got(), ['UI_CANCEL'], '街へ戻る（ファーム）＝UI_CANCEL');
  await tap('.tpin[onclick="farm()"]'); await pg.waitForSelector('.rn'); assert.deepEqual(await got(), ['UI_SELECT'], '牧場へ＝1回');
  await tap('.rn .ftile[onclick*="\'b\'"]'); assert.deepEqual(await got(), ['UI_TAB'], '牧場のタブ＝UI_TAB だけ');
  await tap('.rn button.back'); await pg.waitForSelector('.tpin[onclick="museum()"]'); assert.deepEqual(await got(), ['UI_CANCEL']);
  await tap('.tpin[onclick="museum()"]'); await pg.waitForSelector('.lab'); assert.deepEqual(await got(), ['UI_SELECT'], '研究所へ＝1回');
  assert.deepEqual(p.errors, []);
});
