import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createBackup, parseBackup, planDeletion, isDeletableMonth, BACKUP_APP, BACKUP_VERSION,
} from '../src/domain/backup.js';

const budgets = [
  { ledgerId: 'dining', month: '2026-07', amount: 20000 },
  { ledgerId: 'dining', month: '2026-08', amount: 25000 },
  { ledgerId: 'dining', month: '2026-10', amount: 30000 },
  { ledgerId: 'other', month: '2026-06', amount: 5000 },
];
const expenses = [
  { id: 'e1', ledgerId: 'dining', date: '2026-07-10', amount: 1000, memo: 'a' },
  { id: 'e2', ledgerId: 'dining', date: '2026-08-31', amount: 2000, memo: 'b' },
  { id: 'e3', ledgerId: 'dining', date: '2026-09-01', amount: 3000, memo: 'c' },
  { id: 'e4', ledgerId: 'dining', date: '2026-10-05', amount: 4000, memo: '' },
];

test('createBackup → parseBackup で同一内容に戻る', () => {
  const backup = createBackup({ budgets, expenses }, new Date('2026-11-16T00:00:00Z'));
  assert.equal(backup.app, BACKUP_APP);
  assert.equal(backup.version, BACKUP_VERSION);
  assert.equal(backup.exportedAt, '2026-11-16T00:00:00.000Z');
  const r = parseBackup(JSON.parse(JSON.stringify(backup)));
  assert.equal(r.ok, true);
  assert.deepEqual(r.data, { budgets, expenses });
});

test('createBackup: 余計なプロパティを含めない', () => {
  const backup = createBackup({
    budgets: [{ ledgerId: 'dining', month: '2026-07', amount: 1, extra: 'x' }],
    expenses: [{ id: 'e', ledgerId: 'dining', date: '2026-07-01', amount: 1, memo: '', extra: 'x' }],
  });
  assert.deepEqual(Object.keys(backup.budgets[0]), ['ledgerId', 'month', 'amount']);
  assert.deepEqual(Object.keys(backup.expenses[0]), ['id', 'ledgerId', 'date', 'amount', 'memo']);
});

const valid = () => createBackup({ budgets, expenses });

test('parseBackup: 形式不正を拒否', () => {
  for (const bad of [null, undefined, 'x', 1, [], {}]) {
    assert.equal(parseBackup(bad).ok, false);
  }
});

test('parseBackup: app / version 違いを拒否', () => {
  assert.equal(parseBackup({ ...valid(), app: 'other' }).ok, false);
  assert.equal(parseBackup({ ...valid(), version: 2 }).ok, false);
});

test('parseBackup: 配列でない budgets / expenses を拒否', () => {
  assert.equal(parseBackup({ ...valid(), budgets: {} }).ok, false);
  assert.equal(parseBackup({ ...valid(), expenses: null }).ok, false);
});

test('parseBackup: 不正レコードが1件でもあれば全体拒否', () => {
  const cases = [
    (b) => { b.budgets[0].month = '2026-13'; },
    (b) => { b.budgets[0].amount = -1; },
    (b) => { b.budgets[0].ledgerId = ''; },
    (b) => { b.budgets.push({ ...b.budgets[0] }); }, // キー重複
    (b) => { b.expenses[0].date = '2026-02-30'; },
    (b) => { b.expenses[0].amount = 0; },
    (b) => { b.expenses[0].memo = 'あ'.repeat(21); },
    (b) => { b.expenses[0].memo = null; },
    (b) => { b.expenses[0].id = ''; },
    (b) => { b.expenses[1].id = b.expenses[0].id; }, // id 重複
    (b) => { b.expenses[0] = null; },
  ];
  for (const [i, mutate] of cases.entries()) {
    const b = valid();
    mutate(b);
    const r = parseBackup(b);
    assert.equal(r.ok, false, `case ${i}`);
    assert.ok(r.error, `case ${i}`);
  }
});

test('parseBackup: 空データは有効', () => {
  const r = parseBackup(createBackup({ budgets: [], expenses: [] }));
  assert.equal(r.ok, true);
  assert.deepEqual(r.data, { budgets: [], expenses: [] });
});

test('isDeletableMonth: 当月より前のみ', () => {
  assert.equal(isDeletableMonth('2026-10', '2026-11'), true);
  assert.equal(isDeletableMonth('2026-11', '2026-11'), false);
  assert.equal(isDeletableMonth('2026-12', '2026-11'), false);
  assert.equal(isDeletableMonth('bad', '2026-11'), false);
});

test('planDeletion: 指定年月を含む以前の支出を削除し、予算は帳簿ごとに最新1件を残す', () => {
  const plan = planDeletion({ budgets, expenses }, '2026-08');
  assert.deepEqual(plan.expenseIds, ['e1', 'e2']);
  // dining: 07 と 08 のうち最新の 08 を残して 07 を削除。other: 06 のみなので残す。10 は対象外。
  assert.deepEqual(plan.budgetKeys, [{ ledgerId: 'dining', month: '2026-07' }]);
  assert.deepEqual(plan.counts, { expenses: 2, budgets: 1 });
});

test('planDeletion: 対象より後に予算があっても、以前の最新1件は残す', () => {
  const plan = planDeletion({ budgets, expenses }, '2026-09');
  assert.deepEqual(plan.budgetKeys, [
    { ledgerId: 'dining', month: '2026-07' },
  ]);
  assert.deepEqual(plan.expenseIds, ['e1', 'e2', 'e3']);
});

test('planDeletion: 対象なしなら空', () => {
  const plan = planDeletion({ budgets, expenses }, '2026-01');
  assert.deepEqual(plan.expenseIds, []);
  assert.deepEqual(plan.budgetKeys, []);
  assert.deepEqual(plan.counts, { expenses: 0, budgets: 0 });
});

test('planDeletion: 入力を変更しない', () => {
  const snapshot = JSON.stringify({ budgets, expenses });
  planDeletion({ budgets, expenses }, '2026-10');
  assert.equal(JSON.stringify({ budgets, expenses }), snapshot);
});
