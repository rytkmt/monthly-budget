// 月キーは 'YYYY-MM' の文字列。文字列比較がそのまま時系列順になる。

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function isValidMonth(month) {
  return typeof month === 'string' && MONTH_RE.test(month);
}

function parse(month) {
  const m = MONTH_RE.exec(month);
  if (!m) throw new Error(`invalid month: ${month}`);
  return { year: Number(m[1]), mon: Number(m[2]) };
}

function format(year, mon) {
  return `${String(year).padStart(4, '0')}-${String(mon).padStart(2, '0')}`;
}

// 'YYYY-MM-DD' -> 'YYYY-MM'
export function monthOf(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(date)) {
    throw new Error(`invalid date: ${date}`);
  }
  return date.slice(0, 7);
}

export function addMonths(month, n) {
  const { year, mon } = parse(month);
  const index = year * 12 + (mon - 1) + n;
  return format(Math.floor(index / 12), (index % 12) + 1);
}

export function daysInMonth(month) {
  const { year, mon } = parse(month);
  return new Date(Date.UTC(year, mon, 0)).getUTCDate();
}

export function compareMonth(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

// Date -> 端末ローカルの 'YYYY-MM-DD'
export function toLocalDateString(d) {
  const y = String(d.getFullYear()).padStart(4, '0');
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function currentMonth(now = new Date()) {
  return monthOf(toLocalDateString(now));
}
