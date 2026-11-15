import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidMonth, monthOf, addMonths, daysInMonth, compareMonth, toLocalDateString, currentMonth,
} from '../src/domain/month.js';

test('isValidMonth', () => {
  assert.equal(isValidMonth('2026-11'), true);
  assert.equal(isValidMonth('2026-13'), false);
  assert.equal(isValidMonth('2026-00'), false);
  assert.equal(isValidMonth('2026-1'), false);
  assert.equal(isValidMonth(202611), false);
});

test('monthOf', () => {
  assert.equal(monthOf('2026-11-16'), '2026-11');
  assert.throws(() => monthOf('2026/11/16'));
  assert.throws(() => monthOf(null));
});

test('addMonths: 年またぎ', () => {
  assert.equal(addMonths('2026-11', 1), '2026-12');
  assert.equal(addMonths('2026-12', 1), '2027-01');
  assert.equal(addMonths('2026-01', -1), '2025-12');
  assert.equal(addMonths('2026-05', 0), '2026-05');
  assert.equal(addMonths('2026-05', -17), '2024-12');
  assert.equal(addMonths('2026-05', 24), '2028-05');
});

test('daysInMonth: うるう年を含む', () => {
  assert.equal(daysInMonth('2026-01'), 31);
  assert.equal(daysInMonth('2026-04'), 30);
  assert.equal(daysInMonth('2026-02'), 28);
  assert.equal(daysInMonth('2024-02'), 29);
  assert.equal(daysInMonth('2100-02'), 28);
  assert.equal(daysInMonth('2000-02'), 29);
});

test('compareMonth', () => {
  assert.equal(compareMonth('2026-01', '2026-02'), -1);
  assert.equal(compareMonth('2026-02', '2026-02'), 0);
  assert.equal(compareMonth('2027-01', '2026-12'), 1);
});

test('toLocalDateString / currentMonth はローカル時刻で決まる', () => {
  const d = new Date(2026, 0, 5, 23, 59); // ローカル 2026-01-05
  assert.equal(toLocalDateString(d), '2026-01-05');
  assert.equal(currentMonth(d), '2026-01');
});
