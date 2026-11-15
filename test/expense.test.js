import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidDate, isValidAmount, validateExpense, sumExpenses, expensesOfMonth, expensesOfDate,
} from '../src/domain/expense.js';

test('isValidDate: 実在しない日付を弾く', () => {
  assert.equal(isValidDate('2026-11-16'), true);
  assert.equal(isValidDate('2024-02-29'), true);
  assert.equal(isValidDate('2026-02-29'), false);
  assert.equal(isValidDate('2026-02-30'), false);
  assert.equal(isValidDate('2026-13-01'), false);
  assert.equal(isValidDate('2026-11-1'), false);
  assert.equal(isValidDate(null), false);
});

test('isValidAmount: 境界値', () => {
  assert.equal(isValidAmount(1), true);
  assert.equal(isValidAmount(9_999_999), true);
  assert.equal(isValidAmount(0), false);
  assert.equal(isValidAmount(-100), false);
  assert.equal(isValidAmount(10_000_000), false);
  assert.equal(isValidAmount(100.5), false);
  assert.equal(isValidAmount('100'), false);
  assert.equal(isValidAmount(NaN), false);
});

test('validateExpense: 正常系は memo を trim して返す', () => {
  const r = validateExpense({ date: '2026-11-16', amount: 980, memo: '  ラーメン ' });
  assert.deepEqual(r, { ok: true, value: { date: '2026-11-16', amount: 980, memo: 'ラーメン' } });
});

test('validateExpense: memo は省略・空でもよい', () => {
  assert.equal(validateExpense({ date: '2026-11-16', amount: 100 }).ok, true);
  assert.equal(validateExpense({ date: '2026-11-16', amount: 100, memo: '   ' }).value.memo, '');
});

test('validateExpense: memo 20字ちょうどは可、21字は不可', () => {
  const ok = validateExpense({ date: '2026-11-16', amount: 100, memo: 'あ'.repeat(20) });
  assert.equal(ok.ok, true);
  const ng = validateExpense({ date: '2026-11-16', amount: 100, memo: 'あ'.repeat(21) });
  assert.equal(ng.ok, false);
  assert.ok(ng.errors.memo);
});

test('validateExpense: サロゲートペアを1字と数える', () => {
  const r = validateExpense({ date: '2026-11-16', amount: 100, memo: '🍣'.repeat(20) });
  assert.equal(r.ok, true);
});

test('validateExpense: 複数エラーを同時に返す', () => {
  const r = validateExpense({ date: '2026-02-30', amount: 0, memo: 123 });
  assert.equal(r.ok, false);
  assert.deepEqual(Object.keys(r.errors).sort(), ['amount', 'date', 'memo']);
});

test('sumExpenses / expensesOfMonth / expensesOfDate', () => {
  const list = [
    { id: 'a', date: '2026-10-31', amount: 100 },
    { id: 'b', date: '2026-11-01', amount: 200 },
    { id: 'c', date: '2026-11-01', amount: 300 },
    { id: 'd', date: '2026-12-01', amount: 400 },
  ];
  assert.equal(sumExpenses(list), 1000);
  assert.equal(sumExpenses([]), 0);
  assert.deepEqual(expensesOfMonth(list, '2026-11').map((e) => e.id), ['b', 'c']);
  assert.deepEqual(expensesOfDate(list, '2026-11-01').map((e) => e.id), ['b', 'c']);
  assert.deepEqual(expensesOfDate(list, '2026-11-02'), []);
});
