import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveBudget, remaining, remainingRatio, levelOf, isValidBudgetAmount,
} from '../src/domain/budget.js';

const budgets = [
  { month: '2026-08', amount: 30000 },
  { month: '2026-10', amount: 40000 },
];

test('resolveBudget: 明示設定を優先', () => {
  assert.deepEqual(resolveBudget(budgets, '2026-10'), { amount: 40000, source: 'explicit', from: '2026-10' });
});

test('resolveBudget: 未設定月は直近の過去月から引き継ぐ', () => {
  assert.deepEqual(resolveBudget(budgets, '2026-11'), { amount: 40000, source: 'inherited', from: '2026-10' });
  assert.deepEqual(resolveBudget(budgets, '2026-09'), { amount: 30000, source: 'inherited', from: '2026-08' });
});

test('resolveBudget: 未来の設定は過去月に影響しない / 引き継ぎ元なしは none', () => {
  assert.deepEqual(resolveBudget(budgets, '2026-07'), { amount: null, source: 'none', from: null });
  assert.deepEqual(resolveBudget([], '2026-11'), { amount: null, source: 'none', from: null });
});

test('resolveBudget: 配列の順序に依存しない', () => {
  const reversed = [...budgets].reverse();
  assert.equal(resolveBudget(reversed, '2026-12').from, '2026-10');
});

test('resolveBudget: 予算 0 の明示設定も有効', () => {
  const r = resolveBudget([{ month: '2026-11', amount: 0 }, { month: '2026-10', amount: 100 }], '2026-11');
  assert.equal(r.amount, 0);
  assert.equal(r.source, 'explicit');
});

test('remaining / remainingRatio', () => {
  assert.equal(remaining(30000, 12000), 18000);
  assert.equal(remaining(30000, 35000), -5000);
  assert.equal(remainingRatio(30000, 15000), 0.5);
  assert.equal(remainingRatio(0, 0), null);
});

test('levelOf: 境界値 (50% / 20% / 0 / 超過)', () => {
  assert.equal(levelOf(1000, 0), 'green');
  assert.equal(levelOf(1000, 499), 'green');
  assert.equal(levelOf(1000, 500), 'yellow'); // 残り 50% ちょうどは黄
  assert.equal(levelOf(1000, 799), 'yellow');
  assert.equal(levelOf(1000, 800), 'red'); // 残り 20% ちょうどは赤
  assert.equal(levelOf(1000, 1000), 'red'); // 残り 0
  assert.equal(levelOf(1000, 1001), 'red'); // 超過
});

test('levelOf: 予算未設定と予算 0', () => {
  assert.equal(levelOf(null, 500), 'none');
  assert.equal(levelOf(undefined, 0), 'none');
  assert.equal(levelOf(0, 0), 'green');
  assert.equal(levelOf(0, 1), 'red');
});

test('isValidBudgetAmount', () => {
  assert.equal(isValidBudgetAmount(0), true);
  assert.equal(isValidBudgetAmount(30000), true);
  assert.equal(isValidBudgetAmount(9_999_999), true);
  assert.equal(isValidBudgetAmount(10_000_000), false);
  assert.equal(isValidBudgetAmount(-1), false);
  assert.equal(isValidBudgetAmount(1.5), false);
  assert.equal(isValidBudgetAmount('100'), false);
});
