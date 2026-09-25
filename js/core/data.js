// マスターデータの読み込み。相対パスで解決するので GitHub Pages のサブパスでも動く
export function resolvePath(path) {
  if (/^https?:\/\//.test(path)) return path;
  return new URL(path, document.baseURI).href;
}

export async function loadJSON(path) {
  let res;
  try {
    res = await fetch(resolvePath(path), { cache: 'no-cache' });
  } catch (err) {
    throw new Error(`${path} を読み込めませんでした（${err.message}）`);
  }
  if (!res.ok) throw new Error(`${path} を読み込めませんでした（HTTP ${res.status}）`);
  return res.json();
}
