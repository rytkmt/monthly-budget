import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatYen, formatMonthLabel } from '../src/domain/format.js';

test('formatYen', () => {
  assert.equal(formatYen(0), '¥0');
  assert.equal(formatYen(999), '¥999');
  assert.equal(formatYen(1234), '¥1,234');
  assert.equal(formatYen(9_999_999), '¥9,999,999');
  assert.equal(formatYen(-500), '-¥500');
  assert.equal(formatYen(-12345), '-¥12,345');
});

test('formatMonthLabel: 月の先頭ゼロを落とす', () => {
  assert.equal(formatMonthLabel('2026-11'), '2026年11月');
  assert.equal(formatMonthLabel('2026-01'), '2026年1月');
});
