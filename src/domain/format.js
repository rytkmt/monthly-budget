// 表示用フォーマット（純粋関数）

// 1234 -> '¥1,234' / -500 -> '-¥500'
export function formatYen(n) {
  const abs = Math.abs(n).toLocaleString('en-US');
  return `${n < 0 ? '-' : ''}¥${abs}`;
}

// '2026-11' -> '2026年11月'
export function formatMonthLabel(month) {
  return `${month.slice(0, 4)}年${Number(month.slice(5, 7))}月`;
}
