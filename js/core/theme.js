// data/theme.json を唯一の色の定義として CSS 変数に流し込む
let theme = null;

export function applyTheme(t) {
  theme = t;
  const root = document.documentElement.style;
  for (const p of t.params) {
    root.setProperty(`--param-${p.key}`, p.color);
    root.setProperty(`--param-${p.key}-dark`, p.dark);
  }
  for (const [name, value] of Object.entries(t.palette)) root.setProperty(`--${name}`, value);
  if (t.fonts?.main) root.setProperty('--font-main', t.fonts.main);
}

export function getTheme() { return theme; }
export function paramKeys() { return theme.params.map((p) => p.key); }
export function paramDef(key) { return theme.params.find((p) => p.key === key) ?? null; }
