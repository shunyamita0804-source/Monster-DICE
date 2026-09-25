// 解放条件の判定。市場・商人・機能解放のすべてがこの1つの形式を使う
//  { type: 'raisedCount', gte: 3 }
//  { type: 'flag', flag: 'arena.free.firstWin' }
//  { type: 'arenaTitles', gte: 1 }
//  { type: 'all', of: [...] } / { type: 'any', of: [...] }
export function evaluate(cond, state) {
  if (!cond) return true;
  switch (cond.type) {
    case 'all': return cond.of.every((c) => evaluate(c, state));
    case 'any': return cond.of.some((c) => evaluate(c, state));
    case 'flag': return !!state.flags[cond.flag];
    case 'raisedCount': return compare(state.records.raisedCount, cond);
    case 'arenaTitles': return compare(state.records.arena.titles, cond);
    default:
      console.warn('不明な解放条件', cond);
      return false;
  }
}

function compare(value, c) {
  if (c.gte != null && !(value >= c.gte)) return false;
  if (c.lte != null && !(value <= c.lte)) return false;
  if (c.eq != null && value !== c.eq) return false;
  return true;
}
