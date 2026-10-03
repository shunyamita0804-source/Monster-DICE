// =========================================================
// プロローグ A〜E（2026-10-03 品質向上。window.MMPRO）：新しいゲームの最初に1回（名前登録＝聖獣士登録の前）。
//  背景を大きく → 短いナレーションが画面の下から1行ずつ浮かび上がる → 読み終わる少し前から次の背景へクロスフェード → E のあと本編のミストリアへ。
//  文字は画像に焼き込まない（HTML の別の層）。タップ：表示中の文章をすぐ全部出す → もう一度で次へ（0.45秒未満の連打は無視＝誤タップで何枚も飛ばない）。
//  「スキップ」は2度押し。背景の画像が5枚そろうまでは出さない（ready()＝false。A・B は正式画像の受け取り待ち＝assets/prologue/ に置けば出る）。
//  役割（2026-10-03 ユーザー確認）：A＝世界と聖獣・約百年前の第一次大災厄と英雄・聖獣士の制度／B＝五年前の第二次魔物災害に、三人のレジェンドとそれぞれの聖獣が共に立ち向かう
//   （三人＋三体はすべて味方。いまも存命）／C＝五年後の現在・平和と繁栄・ミストリアの全盛／D＝各地から聖獣士がミストリアへ・主人公もその一人／E＝ミストリアに到着
// =========================================================
(function (root) {
  'use strict';
  const fz = Object.freeze, P = './assets/prologue/';
  const SLIDES = fz([
    fz({ id: 'A', bg: P + 'prologue_a.webp', pages: fz([
      fz(['この世界には、', '人と共に生きる不思議な生命――', '『聖獣』がいる。', '', '人々は彼らと暮らし、', '時にその力を借りながら、', '長い歴史を歩んできた。']),
      fz(['今から、およそ百年前――。', '', '大陸全土を覆う、', 'かつてない災厄が起きた。', '', 'その脅威に立ち向かったのは、', '一人の英雄と、一体の聖獣。', '長い戦いの末、', '災厄は退けられた。']),
      fz(['この出来事を境に、', '聖獣と共に戦う者たちの制度は整えられ、', 'やがて『聖獣士』という道が', '広く知られるようになった。', '', 'その仕組みは、いまの', '聖獣士管理局へと受け継がれている。']),
    ]) }),
    fz({ id: 'B', bg: P + 'prologue_b.webp', pages: fz([
      fz(['それから時は流れ――', '五年前。', '', '再び、', '大きな魔物災害が人々を襲った。']),
      fz(['その危機に立ち向かったのは、', 'ミストリアを拠点とする', '三人の聖獣士と、', 'それぞれの聖獣たちだった。', '', '三人と三体は力を合わせ、', '災厄を退けた。']),
      fz(['彼らは今も、', '『レジェンド』として', '多くの聖獣士たちの', '憧れであり続けている。']),
    ]) }),
    fz({ id: 'C', bg: P + 'prologue_c.webp', pages: fz([
      fz(['三人のレジェンドの活躍から、五年。', '', '災害は収まり、', '世界は再び平和と繁栄を取り戻した。', '', 'なかでもミストリアは、', '聖獣士たちが集う街として', 'かつてない賑わいを見せていた。']),
    ]) }),
    fz({ id: 'D', bg: P + 'prologue_d.webp', pages: fz([
      fz(['各地から、', '新たな出会いと強さを求めて', '多くの聖獣士がこの街を目指す。', '', 'そして――', '', 'あなたもまた、', 'その一人だった。']),
    ]) }),
    fz({ id: 'E', bg: P + 'prologue_e.webp', pages: fz([
      fz(['アステリア地方――', '大都市、ミストリア。', '', 'ここには、', '聖獣を育てるための施設と、', '腕を競うための舞台が集まっている。']),
      fz(['正式な聖獣士として', '新たな一歩を踏み出すため、', '', 'あなたは今、', 'この街へやってきた。', '', 'あなたと聖獣たちの物語は――', 'ここから始まる。']),
    ]) }),
  ]);
  /** 時間（ms）：1行が浮かび上がる間隔（文字数で少し伸ばす）・読み終わってからの余韻・背景のクロスフェード・最後の余韻とフェードアウト */
  const T = fz({ lineBase: 520, perChar: 42, emptyLine: 260, hold: 1700, cross: 1200, startHold: 700, endHold: 1600, fadeOut: 900, tapGuard: 450 });
  const calm = () => !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  let readyMemo = null, busy = false;
  function lineDelay(t) { return t ? T.lineBase + t.length * T.perChar : T.emptyLine; }
  /** 1ページの読む時間の目安（自動で進む時刻） */
  function pageMs(lines) { return lines.reduce((a, t) => a + lineDelay(t), 0) + T.hold; }
  /** 背景の画像がそろっているか（読み込めるかを確かめる。1回だけ） */
  function ready() {
    if (readyMemo) return readyMemo;
    if (typeof Image === 'undefined') return (readyMemo = Promise.resolve(false));
    readyMemo = Promise.all(SLIDES.map((s) => new Promise((ok) => { const im = new Image(); im.onload = () => ok(im.naturalWidth > 0); im.onerror = () => ok(false); im.src = s.bg; }))).then((a) => a.every(Boolean));
    return readyMemo;
  }
  /**
   * 再生する。終わったら（スキップを含む）resolve。opts.onEnd は不要（Promise で待つ）。同時に2つは再生しない
   */
  async function play(opts = {}) {
    if (busy || typeof document === 'undefined' || !document.body) return false;
    busy = true;
    const ov = document.createElement('div'); ov.className = 'mmpro'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', 'プロローグ');
    ov.innerHTML = '<div class="mmpro-bg a"></div><div class="mmpro-bg b"></div><div class="mmpro-shade"></div><div class="mmpro-nar" aria-live="polite"></div><button class="mmpro-skip" type="button">スキップ</button><div class="mmpro-hint">タップで先へ</div><div class="mmpro-veil"></div>';
    document.body.appendChild(ov);
    const bgs = [ov.querySelector('.mmpro-bg.a'), ov.querySelector('.mmpro-bg.b')], nar = ov.querySelector('.mmpro-nar'), skip = ov.querySelector('.mmpro-skip');
    let front = 0, last = 0, wake = null, quit = false, fullNow = false;
    const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const sleep = (ms) => new Promise((r) => { const t = setTimeout(() => { wake = null; r('time'); }, ms); wake = () => { clearTimeout(t); wake = null; r('tap'); }; });
    ov.addEventListener('click', (e) => {
      if (e.target === skip) return;
      const t = now(); if (t - last < T.tapGuard) return; last = t;
      if (wake) wake();
    });
    skip.addEventListener('click', (e) => {
      e.stopPropagation(); const t = now(); if (t - last < 300) return; last = t;
      if (skip.dataset.arm !== '1') { skip.dataset.arm = '1'; skip.textContent = 'もう一度でスキップ'; setTimeout(() => { if (skip.isConnected) { skip.dataset.arm = ''; skip.textContent = 'スキップ'; } }, 3000); return; }
      quit = true; if (wake) wake();
    });
    const showBg = async (src, first) => {
      const nx = bgs[1 - front]; nx.style.backgroundImage = `url(${src})`;
      if (first || calm()) { nx.classList.add('on'); bgs[front].classList.remove('on'); front = 1 - front; return; }
      nx.classList.add('on'); bgs[front].classList.remove('on'); front = 1 - front;
    };
    const showPage = async (lines) => {
      nar.innerHTML = lines.map((t) => `<p class="${t ? '' : 'sp'}">${t ? t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]) : '&nbsp;'}</p>`).join('');
      nar.classList.remove('out'); const ps = [...nar.querySelectorAll('p')];
      fullNow = calm();
      for (let i = 0; i < ps.length && !quit; i++) {
        if (fullNow) { ps.slice(i).forEach((p) => p.classList.add('on')); break; }
        ps[i].classList.add('on');
        const r = await sleep(lineDelay(lines[i])); if (r === 'tap') { fullNow = true; ps.forEach((p) => p.classList.add('on')); break; }
      }
      if (quit) return;
      await sleep(fullNow ? 60000 : T.hold);   // 全部出たら：タップで次へ（自動でも少しの余韻で次へ）
    };
    try {
      for (let si = 0; si < SLIDES.length && !quit; si++) {
        const sl = SLIDES[si]; await showBg(sl.bg, si === 0);
        if (si === 0) await sleep(calm() ? 0 : T.startHold);
        for (let pi = 0; pi < sl.pages.length && !quit; pi++) {
          await showPage(sl.pages[pi]);
          if (quit) break;
          nar.classList.add('out'); await wait(calm() ? 0 : 380);
        }
      }
      if (!quit) await sleep(calm() ? 0 : T.endHold);
      ov.classList.add('end'); await wait(calm() ? 0 : T.fadeOut);
    } finally { ov.remove(); busy = false; }
    return true;
  }
  root.MMPRO = fz({ SLIDES, T, play, ready, pageMs, isBusy: () => busy });
})(typeof window !== 'undefined' ? window : globalThis);
