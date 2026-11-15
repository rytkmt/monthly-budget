// 予算ドメイン。budgets は 1 帳簿分の [{ month, amount }] 配列。

export const WARN_RATIO = 0.5; // 残り 50% 以下で黄
export const DANGER_RATIO = 0.2; // 残り 20% 以下で赤

// 実効予算を解決する。
// - その月に明示設定があればそれ (source: 'explicit')
// - なければ直近の過去設定月の金額を引き継ぐ (source: 'inherited', from: 元の月)
// - どちらもなければ amount: null (source: 'none')
export function resolveBudget(budgets, month) {
  const explicit = budgets.find((b) => b.month === month);
  if (explicit) return { amount: explicit.amount, source: 'explicit', from: month };

  let latest = null;
  for (const b of budgets) {
    if (b.month < month && (latest === null || b.month > latest.month)) latest = b;
  }
  if (latest) return { amount: latest.amount, source: 'inherited', from: latest.month };
  return { amount: null, source: 'none', from: null };
}

export function remaining(budget, spent) {
  return budget - spent;
}

// 残金 / 予算。予算が 0 以下のときは null（比率が定義できない）。
export function remainingRatio(budget, spent) {
  if (!(budget > 0)) return null;
  return (budget - spent) / budget;
}

// 'none'（予算未設定） | 'green' | 'yellow' | 'red'
export function levelOf(budget, spent) {
  if (budget === null || budget === undefined) return 'none';
  if (spent > budget) return 'red';
  const ratio = remainingRatio(budget, spent);
  if (ratio === null) return spent > 0 ? 'red' : 'green';
  if (ratio <= DANGER_RATIO) return 'red';
  if (ratio <= WARN_RATIO) return 'yellow';
  return 'green';
}

// 予算額の検証: 0 以上の整数（上限 9,999,999）
export function isValidBudgetAmount(amount) {
  return Number.isInteger(amount) && amount >= 0 && amount <= 9_999_999;
}
