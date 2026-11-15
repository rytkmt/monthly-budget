// メニュー内の「過去データの削除」。
import { currentMonth, addMonths } from '../domain/month.js';
import { planDeletion, isDeletableMonth } from '../domain/backup.js';
import { formatMonthLabel } from '../domain/format.js';
import { exportAll, applyDeletion } from '../db.js';

const $ = (id) => document.getElementById(id);

function setMessage(text, isError = false) {
  const el = $('delete-msg');
  el.textContent = text;
  el.classList.toggle('error', isError);
}

export function initSettings({ onDataChanged }) {
  async function deleteOldData(event) {
    event.preventDefault();
    setMessage('');
    const month = $('del-month').value;
    if (!isDeletableMonth(month, currentMonth())) {
      setMessage('削除できるのは前月以前の月です', true);
      return;
    }
    const plan = planDeletion(await exportAll(), month);
    if (plan.counts.expenses === 0 && plan.counts.budgets === 0) {
      setMessage('削除対象のデータはありません');
      return;
    }
    const ok = window.confirm(
      `${formatMonthLabel(month)}以前のデータを削除します。\n`
      + `支出 ${plan.counts.expenses}件・予算 ${plan.counts.budgets}件（予算は直近の1件を残します）\n`
      + '元に戻せません。よろしいですか？',
    );
    if (!ok) return;
    await applyDeletion(plan);
    setMessage(`削除しました（支出${plan.counts.expenses}件・予算${plan.counts.budgets}件）`);
    await onDataChanged();
  }

  $('del-month').max = addMonths(currentMonth(), -1);
  $('delete-form').addEventListener('submit', (e) => {
    deleteOldData(e).catch((err) => setMessage(`処理に失敗しました: ${err.message}`, true));
  });
}
