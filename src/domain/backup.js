import { isValidMonth, monthOf } from './month.js';
import { isValidBudgetAmount } from './budget.js';
import { isValidAmount, isValidDate, MEMO_MAX_LENGTH } from './expense.js';

export const BACKUP_APP = 'monthly-budget';
export const BACKUP_VERSION = 1;

// エクスポート用オブジェクト。exportedAt は ISO 文字列。
export function createBackup({ budgets, expenses }, now = new Date()) {
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    budgets: budgets.map((b) => ({ ledgerId: b.ledgerId, month: b.month, amount: b.amount })),
    expenses: expenses.map((e) => ({
      id: e.id, ledgerId: e.ledgerId, date: e.date, amount: e.amount, memo: e.memo,
    })),
  };
}

const isNonEmptyString = (v) => typeof v === 'string' && v.length > 0;

// インポート検証。1件でも不正なら全体を拒否する（部分取り込みしない）。
// 戻り値: { ok: true, data: { budgets, expenses } } | { ok: false, error }
export function parseBackup(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'バックアップの形式が正しくありません' };
  }
  if (input.app !== BACKUP_APP) return { ok: false, error: 'このアプリのバックアップではありません' };
  if (input.version !== BACKUP_VERSION) return { ok: false, error: `未対応のバージョンです: ${input.version}` };
  if (!Array.isArray(input.budgets) || !Array.isArray(input.expenses)) {
    return { ok: false, error: 'budgets / expenses が配列ではありません' };
  }

  const budgetKeys = new Set();
  const budgets = [];
  for (const [i, b] of input.budgets.entries()) {
    const ok = b && typeof b === 'object'
      && isNonEmptyString(b.ledgerId) && isValidMonth(b.month) && isValidBudgetAmount(b.amount);
    if (!ok) return { ok: false, error: `budgets[${i}] が不正です` };
    const key = `${b.ledgerId}|${b.month}`;
    if (budgetKeys.has(key)) return { ok: false, error: `budgets[${i}] が重複しています` };
    budgetKeys.add(key);
    budgets.push({ ledgerId: b.ledgerId, month: b.month, amount: b.amount });
  }

  const ids = new Set();
  const expenses = [];
  for (const [i, e] of input.expenses.entries()) {
    const ok = e && typeof e === 'object'
      && isNonEmptyString(e.id) && isNonEmptyString(e.ledgerId) && isValidDate(e.date)
      && isValidAmount(e.amount) && typeof e.memo === 'string' && [...e.memo].length <= MEMO_MAX_LENGTH;
    if (!ok) return { ok: false, error: `expenses[${i}] が不正です` };
    if (ids.has(e.id)) return { ok: false, error: `expenses[${i}] の id が重複しています` };
    ids.add(e.id);
    expenses.push({ id: e.id, ledgerId: e.ledgerId, date: e.date, amount: e.amount, memo: e.memo });
  }

  return { ok: true, data: { budgets, expenses } };
}

// 削除できるのは当月より前の月まで。
export function isDeletableMonth(upToMonth, currentMonthKey) {
  return isValidMonth(upToMonth) && upToMonth < currentMonthKey;
}

// 「upToMonth 以前を削除」の計画。副作用なし。
// - 支出: month <= upToMonth を全て削除
// - 予算: 帳簿ごとに month <= upToMonth のうち最新の1件を残し、他を削除（引き継ぎ元の保全）
export function planDeletion({ budgets, expenses }, upToMonth) {
  const expenseIds = expenses
    .filter((e) => monthOf(e.date) <= upToMonth)
    .map((e) => e.id);

  const latestByLedger = new Map();
  for (const b of budgets) {
    if (b.month > upToMonth) continue;
    const cur = latestByLedger.get(b.ledgerId);
    if (cur === undefined || b.month > cur) latestByLedger.set(b.ledgerId, b.month);
  }
  const budgetKeys = budgets
    .filter((b) => b.month <= upToMonth && b.month !== latestByLedger.get(b.ledgerId))
    .map((b) => ({ ledgerId: b.ledgerId, month: b.month }));

  return {
    expenseIds,
    budgetKeys,
    counts: { expenses: expenseIds.length, budgets: budgetKeys.length },
  };
}
