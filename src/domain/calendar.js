import { daysInMonth } from './month.js';

// 日曜始まりの週グリッド。各セルは 'YYYY-MM-DD'、月外の埋め草は null。
export function buildMonthGrid(month) {
  const year = Number(month.slice(0, 4));
  const mon = Number(month.slice(5, 7));
  const lead = new Date(Date.UTC(year, mon - 1, 1)).getUTCDay(); // 0=日
  const total = daysInMonth(month);

  const cells = Array(lead).fill(null);
  for (let d = 1; d <= total; d += 1) {
    cells.push(`${month}-${String(d).padStart(2, '0')}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

// 支出配列 -> { 'YYYY-MM-DD': 合計 }
export function dailyTotals(expenses) {
  const totals = {};
  for (const e of expenses) totals[e.date] = (totals[e.date] ?? 0) + e.amount;
  return totals;
}

// 日別合計の濃淡レベル 0〜4。ref は「この額で最も濃い手前」の基準額。
// 0: 支出なし / 1: ref の25%以下 / 2: 50%以下 / 3: 100%以下 / 4: 超過
export function intensityLevel(total, ref) {
  if (!(total > 0)) return 0;
  if (!(ref > 0)) return 4;
  const ratio = total / ref;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 1) return 3;
  return 4;
}
