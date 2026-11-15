import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMonthGrid, dailyTotals, intensityLevel } from '../src/domain/calendar.js';

const flat = (weeks) => weeks.flat().filter(Boolean);

test('buildMonthGrid: 2026-11 は日曜始まり（11/1 が日曜）で 5 週', () => {
  const weeks = buildMonthGrid('2026-11');
  assert.equal(weeks.length, 5);
  assert.equal(weeks[0][0], '2026-11-01');
  assert.equal(weeks[4][1], '2026-11-30');
  assert.deepEqual(weeks[4].slice(2), [null, null, null, null, null]);
  assert.equal(flat(weeks).length, 30);
});

test('buildMonthGrid: 月初が各曜日でも先頭の埋め草数が正しい', () => {
  // 2026-02-01 日, 2026-06-01 月, 2026-09-01 火, 2026-04-01 水, 2026-10-01 木, 2026-05-01 金, 2026-08-01 土
  const cases = { '2026-02': 0, '2026-06': 1, '2026-09': 2, '2026-04': 3, '2026-10': 4, '2026-05': 5, '2026-08': 6 };
  for (const [month, lead] of Object.entries(cases)) {
    const first = buildMonthGrid(month)[0];
    assert.equal(first.findIndex((c) => c !== null), lead, month);
    assert.equal(first[lead], `${month}-01`);
  }
});

test('buildMonthGrid: 全週 7 マス、日数が月の日数と一致（うるう年含む）', () => {
  for (const [month, days] of [['2024-02', 29], ['2026-02', 28], ['2026-12', 31], ['2026-04', 30]]) {
    const weeks = buildMonthGrid(month);
    assert.ok(weeks.every((w) => w.length === 7), month);
    assert.equal(flat(weeks).length, days, month);
  }
});

test('buildMonthGrid: 2 月 28 日で月初が日曜なら 4 週ちょうど', () => {
  assert.equal(buildMonthGrid('2026-02').length, 4);
});

test('buildMonthGrid: 6 週になる月（2026-08 は土曜始まりの 31 日）', () => {
  assert.equal(buildMonthGrid('2026-08').length, 6);
});

test('dailyTotals: 同日複数件を合算', () => {
  const totals = dailyTotals([
    { date: '2026-11-03', amount: 800 },
    { date: '2026-11-03', amount: 1200 },
    { date: '2026-11-05', amount: 500 },
  ]);
  assert.deepEqual(totals, { '2026-11-03': 2000, '2026-11-05': 500 });
  assert.deepEqual(dailyTotals([]), {});
});

test('intensityLevel: 境界値', () => {
  assert.equal(intensityLevel(0, 1000), 0);
  assert.equal(intensityLevel(250, 1000), 1);
  assert.equal(intensityLevel(251, 1000), 2);
  assert.equal(intensityLevel(500, 1000), 2);
  assert.equal(intensityLevel(501, 1000), 3);
  assert.equal(intensityLevel(1000, 1000), 3);
  assert.equal(intensityLevel(1001, 1000), 4);
});

test('intensityLevel: 基準額なしでも支出があれば最大レベル', () => {
  assert.equal(intensityLevel(100, 0), 4);
  assert.equal(intensityLevel(100, null), 4);
  assert.equal(intensityLevel(0, 0), 0);
});
