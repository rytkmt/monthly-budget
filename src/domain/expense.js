import { monthOf } from './month.js';

export const MEMO_MAX_LENGTH = 20;
export const AMOUNT_MAX = 9_999_999;

// 実在する 'YYYY-MM-DD' か（2026-02-30 などを弾く）
export function isValidDate(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function isValidAmount(amount) {
  return Number.isInteger(amount) && amount >= 1 && amount <= AMOUNT_MAX;
}

// 入力検証。内容(memo)は任意で、前後空白を除いて最大20字（サロゲートペアも1字）。
// 戻り値: { ok: true, value } | { ok: false, errors: { date?, amount?, memo? } }
export function validateExpense({ date, amount, memo = '' }) {
  const errors = {};
  if (!isValidDate(date)) errors.date = '日付が正しくありません';
  if (!isValidAmount(amount)) errors.amount = `金額は1〜${AMOUNT_MAX}の整数で入力してください`;
  const trimmed = typeof memo === 'string' ? memo.trim() : null;
  if (trimmed === null) errors.memo = '内容が正しくありません';
  else if ([...trimmed].length > MEMO_MAX_LENGTH) errors.memo = `内容は${MEMO_MAX_LENGTH}字以内で入力してください`;

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { date, amount, memo: trimmed } };
}

export function sumExpenses(expenses) {
  return expenses.reduce((sum, e) => sum + e.amount, 0);
}

export function expensesOfMonth(expenses, month) {
  return expenses.filter((e) => monthOf(e.date) === month);
}

export function expensesOfDate(expenses, date) {
  return expenses.filter((e) => e.date === date);
}
