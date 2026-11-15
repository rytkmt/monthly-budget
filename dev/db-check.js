// src/db.js のブラウザ内確認。`python3 -m http.server 8080` で配信し
// http://localhost:8080/dev/db-check.html を開く。結果は #out に PASS / FAIL で出る。
import * as db from '../src/db.js';

const out = document.getElementById('out');
const lines = [];
const log = (s) => lines.push(s);

function eq(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label}: expected ${e} but got ${a}`);
  log(`ok  ${label}`);
}

async function rejects(fn, label) {
  try { await fn(); } catch { log(`ok  ${label}`); return; }
  throw new Error(`${label}: expected rejection`);
}

async function run() {
  const name = `monthly-budget-check-${Date.now()}`;
  const d = await db.openDb(name);
  eq([...d.objectStoreNames].sort(), ['budgets', 'expenses', 'meta'], 'stores created');

  // ledgerId 必須
  await rejects(() => db.getBudgets('', d), 'ledgerId required (getBudgets)');
  await rejects(() => db.addExpense(undefined, { date: '2026-11-01', amount: 1, memo: '' }, d), 'ledgerId required (addExpense)');

  // budgets
  await db.setBudget('dining', '2026-10', 30000, d);
  await db.setBudget('dining', '2026-11', 40000, d);
  await db.setBudget('other', '2026-11', 999, d);
  await db.setBudget('dining', '2026-11', 45000, d); // 上書き
  eq(await db.getBudgets('dining', d), [
    { ledgerId: 'dining', month: '2026-10', amount: 30000 },
    { ledgerId: 'dining', month: '2026-11', amount: 45000 },
  ], 'getBudgets は帳簿で分離・月順');
  eq(await db.getBudget('dining', '2026-09', d), null, 'getBudget 未設定は null');
  eq((await db.getBudget('other', '2026-11', d)).amount, 999, 'other 帳簿は独立');

  // expenses
  const a = await db.addExpense('dining', { date: '2026-11-03', amount: 800, memo: 'ラーメン' }, d);
  const b = await db.addExpense('dining', { date: '2026-11-03', amount: 1200, memo: 'カフェ' }, d);
  await db.addExpense('dining', { date: '2026-11-30', amount: 500, memo: '月末' }, d);
  await db.addExpense('dining', { date: '2026-10-31', amount: 700, memo: '前月末' }, d);
  await db.addExpense('dining', { date: '2026-12-01', amount: 600, memo: '翌月初' }, d);
  const o = await db.addExpense('other', { date: '2026-11-03', amount: 111, memo: 'x' }, d);
  eq(typeof a.id === 'string' && a.id.length > 0 && a.id !== b.id, true, 'id が一意に採番される');
  eq((await db.listExpensesByMonth('dining', '2026-11', d)).map((e) => e.memo).sort(),
    ['カフェ', 'ラーメン', '月末'], '月境界を含め当月のみ・帳簿で分離');
  eq((await db.listAllExpenses('dining', d)).length, 5, 'listAllExpenses は帳簿内の全件');

  // update / delete
  const upd = await db.updateExpense('dining', a.id, { date: '2026-11-04', amount: 900, memo: '替え玉' }, d);
  eq([upd.date, upd.amount, upd.memo, upd.ledgerId], ['2026-11-04', 900, '替え玉', 'dining'], 'updateExpense');
  eq(await db.updateExpense('dining', o.id, { date: '2026-11-04', amount: 1, memo: '' }, d), null, '他帳簿の更新は無視');
  eq(await db.updateExpense('dining', 'nope', { date: '2026-11-04', amount: 1, memo: '' }, d), null, '存在しない id の更新は null');
  eq(await db.deleteExpense('dining', o.id, d), false, '他帳簿の削除は無視');
  eq(await db.deleteExpense('dining', b.id, d), true, 'deleteExpense');
  eq((await db.listExpensesByMonth('dining', '2026-11', d)).length, 2, '削除が反映');

  // meta
  eq(await db.getMeta('dining', 'lastBackupAt', d), null, 'meta 未設定は null');
  await db.setMeta('dining', 'lastBackupAt', '2026-11-16T00:00:00.000Z', d);
  eq(await db.getMeta('dining', 'lastBackupAt', d), '2026-11-16T00:00:00.000Z', 'meta 保存');

  // exportAll
  const snapshot = await db.exportAll(d);
  eq([snapshot.budgets.length, snapshot.expenses.length], [3, 5], 'exportAll は全帳簿');

  // replaceAll: 失敗時は既存データを変えない
  await rejects(() => db.replaceAll({
    budgets: [{ ledgerId: 'dining', month: '2030-01', amount: 1 }, { amount: 5 }], // 2件目はキー欠落で DataError
    expenses: [{ id: 'z', ledgerId: 'dining', date: '2030-01-01', amount: 1, memo: '' }],
  }, d), 'replaceAll 不正データで reject');
  eq(await db.exportAll(d), snapshot, 'replaceAll 失敗後も既存データ不変');

  // replaceAll: 成功
  await db.replaceAll({
    budgets: [{ ledgerId: 'dining', month: '2030-01', amount: 7 }],
    expenses: [{ id: 'z', ledgerId: 'dining', date: '2030-01-01', amount: 1, memo: 'n' }],
  }, d);
  eq(await db.exportAll(d), {
    budgets: [{ ledgerId: 'dining', month: '2030-01', amount: 7 }],
    expenses: [{ id: 'z', ledgerId: 'dining', date: '2030-01-01', amount: 1, memo: 'n' }],
  }, 'replaceAll 成功で全置換');

  // applyDeletion
  await db.replaceAll({
    budgets: [
      { ledgerId: 'dining', month: '2026-07', amount: 1 },
      { ledgerId: 'dining', month: '2026-08', amount: 2 },
    ],
    expenses: [
      { id: 'x1', ledgerId: 'dining', date: '2026-07-01', amount: 1, memo: '' },
      { id: 'x2', ledgerId: 'dining', date: '2026-09-01', amount: 1, memo: '' },
    ],
  }, d);
  await db.applyDeletion({ expenseIds: ['x1'], budgetKeys: [{ ledgerId: 'dining', month: '2026-07' }] }, d);
  eq(await db.exportAll(d), {
    budgets: [{ ledgerId: 'dining', month: '2026-08', amount: 2 }],
    expenses: [{ id: 'x2', ledgerId: 'dining', date: '2026-09-01', amount: 1, memo: '' }],
  }, 'applyDeletion');

  d.close();
  indexedDB.deleteDatabase(name);
}

try {
  await run();
  out.textContent = `PASS\n${lines.join('\n')}`;
} catch (err) {
  out.textContent = `FAIL: ${err.message}\n${lines.join('\n')}`;
}
// ヘッドレス実行時に結果を回収するための任意の送信（受け口がなければ無視される）
fetch('/__result', { method: 'POST', body: out.textContent }).catch(() => {});
