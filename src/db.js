// IndexedDB データ層。全 API が ledgerId を必須にする（今回の帳簿は 'dining' のみ）。
// ロジック（検証・削除計画・予算解決）は src/domain/ 側。ここは永続化のみを担う。

import { resolveBudget } from './domain/budget.js';

export const DB_NAME = 'monthly-budget';
export const DB_VERSION = 1;

const BUDGETS = 'budgets';
const EXPENSES = 'expenses';
const META = 'meta';

let dbPromise = null;

export function openDb(name = DB_NAME) {
  if (name === DB_NAME && dbPromise) return dbPromise;
  const promise = new Promise((resolve, reject) => {
    const req = indexedDB.open(name, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore(BUDGETS, { keyPath: ['ledgerId', 'month'] });
      const expenses = db.createObjectStore(EXPENSES, { keyPath: 'id' });
      expenses.createIndex('ledger_date', ['ledgerId', 'date']);
      db.createObjectStore(META, { keyPath: ['ledgerId', 'key'] });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB is blocked'));
  });
  if (name === DB_NAME) dbPromise = promise;
  return promise;
}

function requireLedger(ledgerId) {
  if (typeof ledgerId !== 'string' || ledgerId === '') throw new Error('ledgerId is required');
}

const wrap = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

// トランザクション完了（commit）を待つ。abort / error は reject。
const done = (tx) => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = () => reject(tx.error);
  tx.onabort = () => reject(tx.error ?? new Error('transaction aborted'));
});

// ---- budgets ----

export async function getBudgets(ledgerId, db) {
  requireLedger(ledgerId);
  const d = db ?? await openDb();
  const range = IDBKeyRange.bound([ledgerId, ''], [ledgerId, '\uffff']);
  const rows = await wrap(d.transaction(BUDGETS).objectStore(BUDGETS).getAll(range));
  return rows.sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));
}

export async function getBudget(ledgerId, month, db) {
  requireLedger(ledgerId);
  const d = db ?? await openDb();
  return (await wrap(d.transaction(BUDGETS).objectStore(BUDGETS).get([ledgerId, month]))) ?? null;
}

export async function setBudget(ledgerId, month, amount, db) {
  requireLedger(ledgerId);
  const d = db ?? await openDb();
  const tx = d.transaction(BUDGETS, 'readwrite');
  tx.objectStore(BUDGETS).put({ ledgerId, month, amount });
  await done(tx);
}

// ---- expenses ----

// month: 'YYYY-MM'。date は 'YYYY-MM-DD' なので '-01'〜'-31' の範囲で月全体に当たる。
export async function listExpensesByMonth(ledgerId, month, db) {
  requireLedger(ledgerId);
  const d = db ?? await openDb();
  const range = IDBKeyRange.bound([ledgerId, `${month}-01`], [ledgerId, `${month}-31`]);
  const index = d.transaction(EXPENSES).objectStore(EXPENSES).index('ledger_date');
  return wrap(index.getAll(range));
}

export async function listAllExpenses(ledgerId, db) {
  requireLedger(ledgerId);
  const d = db ?? await openDb();
  const range = IDBKeyRange.bound([ledgerId, ''], [ledgerId, '\uffff']);
  return wrap(d.transaction(EXPENSES).objectStore(EXPENSES).index('ledger_date').getAll(range));
}

// 同日の支出が登録順に並ぶよう、主キーを時刻順の接頭辞つきにする（索引の同値は主キー順になる）。
const newId = () => `${Date.now().toString(36).padStart(9, '0')}-${crypto.randomUUID()}`;

export async function addExpense(ledgerId, { date, amount, memo }, db) {
  requireLedger(ledgerId);
  const d = db ?? await openDb();
  const record = { id: newId(), ledgerId, date, amount, memo };
  const tx = d.transaction(EXPENSES, 'readwrite');
  tx.objectStore(EXPENSES).add(record);
  await done(tx);
  return record;
}

export class BudgetRequiredError extends Error {
  constructor(month) {
    super(`budget is not set for ${month}`);
    this.name = 'BudgetRequiredError';
    this.month = month;
  }
}

// 支出を追加する。その月に予算が未保存で引き継ぎ元があれば、同一トランザクションで実効予算を保存する。
// 引き継ぎ元もなければ何も書かず BudgetRequiredError を投げる。
// 戻り値: { record, carried }（carried: 予算を引き継いで保存したか）
export async function addExpenseCarryBudget(ledgerId, { date, amount, memo }, db) {
  requireLedger(ledgerId);
  const d = db ?? await openDb();
  const month = date.slice(0, 7);
  const tx = d.transaction([BUDGETS, EXPENSES], 'readwrite');
  const completion = done(tx);
  completion.catch(() => {}); // abort 時の未処理 rejection を避ける（呼び出し側の await では reject される）
  const bs = tx.objectStore(BUDGETS);
  const range = IDBKeyRange.bound([ledgerId, ''], [ledgerId, '\uffff']);
  const budgets = await wrap(bs.getAll(range));
  const resolved = resolveBudget(budgets, month);
  if (resolved.amount === null) {
    tx.abort();
    throw new BudgetRequiredError(month);
  }
  const carried = resolved.source === 'inherited';
  if (carried) bs.put({ ledgerId, month, amount: resolved.amount });
  const record = { id: newId(), ledgerId, date, amount, memo };
  tx.objectStore(EXPENSES).add(record);
  await completion;
  return { record, carried };
}

// 他帳簿のレコードは更新しない。対象がなければ null。
export async function updateExpense(ledgerId, id, { date, amount, memo }, db) {
  requireLedger(ledgerId);
  const d = db ?? await openDb();
  const tx = d.transaction(EXPENSES, 'readwrite');
  const store = tx.objectStore(EXPENSES);
  const current = await wrap(store.get(id));
  if (!current || current.ledgerId !== ledgerId) {
    await done(tx);
    return null;
  }
  const next = { ...current, date, amount, memo };
  store.put(next);
  await done(tx);
  return next;
}

export async function deleteExpense(ledgerId, id, db) {
  requireLedger(ledgerId);
  const d = db ?? await openDb();
  const tx = d.transaction(EXPENSES, 'readwrite');
  const store = tx.objectStore(EXPENSES);
  const current = await wrap(store.get(id));
  const exists = Boolean(current) && current.ledgerId === ledgerId;
  if (exists) store.delete(id);
  await done(tx);
  return exists;
}

// ---- meta（最終バックアップ日など） ----

export async function getMeta(ledgerId, key, db) {
  requireLedger(ledgerId);
  const d = db ?? await openDb();
  const row = await wrap(d.transaction(META).objectStore(META).get([ledgerId, key]));
  return row ? row.value : null;
}

export async function setMeta(ledgerId, key, value, db) {
  requireLedger(ledgerId);
  const d = db ?? await openDb();
  const tx = d.transaction(META, 'readwrite');
  tx.objectStore(META).put({ ledgerId, key, value });
  await done(tx);
}

// ---- バックアップ・削除（全帳簿が対象） ----

export async function exportAll(db) {
  const d = db ?? await openDb();
  const tx = d.transaction([BUDGETS, EXPENSES]);
  const [budgets, expenses] = await Promise.all([
    wrap(tx.objectStore(BUDGETS).getAll()),
    wrap(tx.objectStore(EXPENSES).getAll()),
  ]);
  return { budgets, expenses };
}

// 全置換。1 トランザクションで clear → put するため、途中で失敗したら全体が abort され既存データは変わらない。
// 呼び出し側で parseBackup による検証を済ませておくこと。
export async function replaceAll({ budgets, expenses }, db) {
  const d = db ?? await openDb();
  const tx = d.transaction([BUDGETS, EXPENSES], 'readwrite');
  const completion = done(tx);
  try {
    const bs = tx.objectStore(BUDGETS);
    const es = tx.objectStore(EXPENSES);
    bs.clear();
    es.clear();
    for (const b of budgets) bs.put(b);
    for (const e of expenses) es.put(e);
  } catch (err) {
    tx.abort();
    await completion.catch(() => {});
    throw err;
  }
  await completion;
}

// planDeletion の結果を適用する。
export async function applyDeletion({ expenseIds, budgetKeys }, db) {
  const d = db ?? await openDb();
  const tx = d.transaction([BUDGETS, EXPENSES], 'readwrite');
  const es = tx.objectStore(EXPENSES);
  const bs = tx.objectStore(BUDGETS);
  for (const id of expenseIds) es.delete(id);
  for (const { ledgerId, month } of budgetKeys) bs.delete([ledgerId, month]);
  await done(tx);
}
