import { currentMonth, addMonths, monthOf, toLocalDateString } from './domain/month.js';
import { resolveBudget, remaining, levelOf, isValidBudgetAmount } from './domain/budget.js';
import { sumExpenses, expensesOfDate, validateExpense } from './domain/expense.js';
import { dailyTotals } from './domain/calendar.js';
import { formatYen, formatMonthLabel } from './domain/format.js';
import {
  getBudgets, setBudget, listExpensesByMonth,
  addExpenseCarryBudget, updateExpense, deleteExpense, BudgetRequiredError,
} from './db.js';
import { renderCalendar } from './ui/calendar.js';

const LEDGER_ID = 'dining'; // 今回は外食のみ。帳簿の切り替えUIは作らない。
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

const $ = (id) => document.getElementById(id);

const state = {
  month: currentMonth(),
  budgets: [],
  expenses: [],
  selectedDate: toLocalDateString(new Date()), // 起動時は今日を選択
  editing: null, // 編集中の支出レコード
};

async function load() {
  const [budgets, expenses] = await Promise.all([
    getBudgets(LEDGER_ID),
    listExpensesByMonth(LEDGER_ID, state.month),
  ]);
  state.budgets = budgets;
  state.expenses = expenses;
}

// ---- 描画 ----

function renderBalance() {
  const resolved = resolveBudget(state.budgets, state.month);
  const spent = sumExpenses(state.expenses);
  const balance = $('balance');

  if (resolved.amount === null) {
    balance.dataset.level = 'none';
    $('balance-amount').textContent = '—';
    $('balance-detail').textContent = `使用 ${formatYen(spent)}`;
    $('budget-note').textContent = 'この月の予算が未設定です。予算を設定してください。';
    $('budget-edit').textContent = '予算を設定';
    return;
  }

  balance.dataset.level = levelOf(resolved.amount, spent);
  $('balance-amount').textContent = formatYen(remaining(resolved.amount, spent));
  $('balance-detail').textContent = `予算 ${formatYen(resolved.amount)} − 使用 ${formatYen(spent)}`;
  $('budget-note').textContent = resolved.source === 'inherited'
    ? `${formatMonthLabel(resolved.from)}の設定を引き継いで表示中（支出を追加すると保存されます）`
    : '';
  $('budget-edit').textContent = '予算を変更';
}

function renderCalendarSection() {
  const totals = dailyTotals(state.expenses);
  const resolved = resolveBudget(state.budgets, state.month);
  // 濃淡の基準額: 予算の 1/4（予算未設定なら月内の最大日合計）
  const maxDay = Math.max(0, ...Object.values(totals));
  const ref = resolved.amount > 0 ? resolved.amount / 4 : maxDay;
  const inMonth = state.selectedDate && monthOf(state.selectedDate) === state.month;
  renderCalendar($('calendar'), {
    month: state.month,
    totals,
    ref,
    selectedDate: inMonth ? state.selectedDate : null,
    today: toLocalDateString(new Date()),
    onSelect: (date) => selectDate(date),
  });
}

function formatDayTitle(date) {
  const [y, m, d] = date.split('-').map(Number);
  return `${m}月${d}日（${WEEKDAYS[new Date(y, m - 1, d).getDay()]}）`;
}

function renderDayPanel() {
  const date = state.selectedDate;
  const visible = Boolean(date) && monthOf(date) === state.month;
  $('day-panel').hidden = !visible;
  $('calendar-hint').hidden = visible;
  if (!visible) return;

  $('day-title').textContent = formatDayTitle(date);
  const list = $('expense-list');
  list.replaceChildren();
  const items = expensesOfDate(state.expenses, date);
  if (items.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty-msg';
    li.textContent = 'この日の支出はありません';
    list.append(li);
  }
  for (const e of items) list.append(expenseRow(e));
}

function expenseRow(e) {
  const li = document.createElement('li');
  const memo = document.createElement('span');
  memo.className = 'memo';
  memo.textContent = e.memo || '（内容なし）';
  const amount = document.createElement('span');
  amount.className = 'amount';
  amount.textContent = formatYen(e.amount);
  const edit = document.createElement('button');
  edit.type = 'button';
  edit.className = 'secondary';
  edit.textContent = '編集';
  edit.addEventListener('click', () => startEdit(e));
  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'secondary';
  del.textContent = '削除';
  del.addEventListener('click', () => removeExpense(e).catch(showFatal));
  li.append(memo, amount, edit, del);
  return li;
}

function render() {
  $('month-label').textContent = formatMonthLabel(state.month);
  $('this-month').hidden = state.month === currentMonth();
  renderBalance();
  renderCalendarSection();
  renderDayPanel();
}

// ---- 月・日の移動 ----

async function go(month) {
  state.month = month;
  state.selectedDate = month === currentMonth() ? toLocalDateString(new Date()) : null;
  closeBudgetForm();
  resetExpenseForm();
  await load();
  render();
}

function selectDate(date) {
  state.selectedDate = date;
  resetExpenseForm();
  render();
}

// ---- 予算 ----

function openBudgetForm() {
  const resolved = resolveBudget(state.budgets, state.month);
  $('budget-input').value = resolved.amount ?? '';
  $('budget-error').textContent = '';
  $('budget-form').hidden = false;
  $('budget-edit').hidden = true;
  $('budget-input').focus();
}

function closeBudgetForm() {
  $('budget-form').hidden = true;
  $('budget-edit').hidden = false;
}

async function submitBudget(event) {
  event.preventDefault();
  const raw = $('budget-input').value.trim();
  const amount = raw === '' ? NaN : Number(raw);
  if (!isValidBudgetAmount(amount)) {
    $('budget-error').textContent = '予算は0〜9,999,999の整数で入力してください';
    return;
  }
  await setBudget(LEDGER_ID, state.month, amount);
  closeBudgetForm();
  await load();
  render();
}

// ---- 支出の追加・編集・削除 ----

function resetExpenseForm() {
  state.editing = null;
  $('exp-date').value = state.selectedDate ?? '';
  $('exp-amount').value = '';
  $('exp-memo').value = '';
  $('exp-error').textContent = '';
  $('form-title').textContent = '支出を追加';
  $('exp-submit').textContent = '追加';
  $('exp-cancel').hidden = true;
}

function startEdit(expense) {
  state.editing = expense;
  $('exp-date').value = expense.date;
  $('exp-amount').value = String(expense.amount);
  $('exp-memo').value = expense.memo;
  $('exp-error').textContent = '';
  $('form-title').textContent = '支出を編集';
  $('exp-submit').textContent = '更新';
  $('exp-cancel').hidden = false;
  $('exp-amount').focus();
}

async function submitExpense(event) {
  event.preventDefault();
  const rawAmount = $('exp-amount').value.trim();
  const result = validateExpense({
    date: $('exp-date').value,
    amount: rawAmount === '' ? NaN : Number(rawAmount),
    memo: $('exp-memo').value,
  });
  if (!result.ok) {
    $('exp-error').textContent = Object.values(result.errors).join(' / ');
    return;
  }
  const input = result.value;

  try {
    if (state.editing) {
      await updateExpense(LEDGER_ID, state.editing.id, input);
    } else {
      await addExpenseCarryBudget(LEDGER_ID, input);
    }
  } catch (err) {
    if (err instanceof BudgetRequiredError) {
      // 予算の引き継ぎ元がない月: 先に予算入力へ誘導する（支出は保存していない）
      await go(err.month);
      openBudgetForm();
      $('budget-error').textContent = '先にこの月の予算を設定してから、支出を追加してください';
      return;
    }
    throw err;
  }

  state.month = monthOf(input.date);
  state.selectedDate = input.date;
  resetExpenseForm();
  await load();
  render();
}

async function removeExpense(expense) {
  const label = `${expense.memo || '内容なし'} ${formatYen(expense.amount)}`;
  if (!window.confirm(`削除しますか？\n${label}`)) return;
  await deleteExpense(LEDGER_ID, expense.id);
  if (state.editing?.id === expense.id) resetExpenseForm();
  await load();
  render();
}

// ---- 起動 ----

function showFatal(err) {
  const el = $('fatal');
  el.textContent = `処理に失敗しました: ${err.message}`;
  el.hidden = false;
}

async function main() {
  $('prev-month').addEventListener('click', () => go(addMonths(state.month, -1)).catch(showFatal));
  $('next-month').addEventListener('click', () => go(addMonths(state.month, 1)).catch(showFatal));
  $('this-month').addEventListener('click', () => go(currentMonth()).catch(showFatal));
  $('budget-edit').addEventListener('click', openBudgetForm);
  $('budget-cancel').addEventListener('click', closeBudgetForm);
  $('budget-form').addEventListener('submit', (e) => submitBudget(e).catch(showFatal));
  $('expense-form').addEventListener('submit', (e) => submitExpense(e).catch(showFatal));
  $('exp-cancel').addEventListener('click', resetExpenseForm);

  resetExpenseForm();
  await load();
  render();
}

main().catch(showFatal);
