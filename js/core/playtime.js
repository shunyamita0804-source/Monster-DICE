// 画面が表示されている間だけプレイ時間を数える
import { addPlayTime } from './state.js';

let timer = 0;
let last = 0;

export function startPlayClock() {
  last = performance.now();
  clearInterval(timer);
  timer = setInterval(() => {
    const now = performance.now();
    if (!document.hidden) addPlayTime((now - last) / 1000);
    last = now;
  }, 1000);
  document.addEventListener('visibilitychange', () => { last = performance.now(); });
}

export function formatPlayTime(sec) {
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}時間${String(m).padStart(2, '0')}分`;
}
