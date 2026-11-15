import { currentMonth, addMonths } from './domain/month.js';
import { resolveBudget, remaining, levelOf, isValidBudgetAmount } from './domain/budget.js';
import { sumExpenses } from './domain/expense.js';
import { formatYen, formatMonthLabel } from './domain/format.js';
import { getBudgets, setBudget, listExpensesByMonth } from './db.js';

const LEDGER_ID = 'dining'; // 今回は外食のみ。帳簿の切り替えUIは作らない。

const $ = (id) => document.getElementById(id);

const state = {
  month: currentMonth(),
  budgets: [],
  expenses: [],
};

async function load() {
  const [budgets, expenses] = await Promise.all([
    getBudgets(LEDGER_ID),
    listExpensesByMonth(LEDGER_ID, state.month),
  ]);
  state.budgets = budgets;
  state.expenses = expenses;
}

function render() {
  const { month } = state;
  $('month-label').textContent = formatMonthLabel(month);
  $('this-month').hidden = month === currentMonth();

  const resolved = resolveBudget(state.budgets, month);
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

async function go(month) {
  state.month = month;
  closeBudgetForm();
  await load();
  render();
}

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

function showFatal(err) {
  const el = $('fatal');
  el.textContent = `データの読み込みに失敗しました: ${err.message}`;
  el.hidden = false;
}

async function main() {
  $('prev-month').addEventListener('click', () => go(addMonths(state.month, -1)).catch(showFatal));
  $('next-month').addEventListener('click', () => go(addMonths(state.month, 1)).catch(showFatal));
  $('this-month').addEventListener('click', () => go(currentMonth()).catch(showFatal));
  $('budget-edit').addEventListener('click', openBudgetForm);
  $('budget-cancel').addEventListener('click', closeBudgetForm);
  $('budget-form').addEventListener('submit', (e) => submitBudget(e).catch(showFatal));

  await load();
  render();
}

main().catch(showFatal);
