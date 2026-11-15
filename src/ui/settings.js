// 設定領域: JSON バックアップの書き出し・読み込み、前月以前のデータ削除。
import { currentMonth, addMonths } from '../domain/month.js';
import { createBackup, parseBackup, planDeletion, isDeletableMonth } from '../domain/backup.js';
import { formatMonthLabel } from '../domain/format.js';
import { exportAll, replaceAll, applyDeletion, getMeta, setMeta } from '../db.js';

const META_LAST_BACKUP = 'lastBackupAt';
const $ = (id) => document.getElementById(id);

function pad(n) { return String(n).padStart(2, '0'); }

function backupFileName(now) {
  return `monthly-budget-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}.json`;
}

function formatDateTime(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function setMessage(id, text, isError = false) {
  const el = $(id);
  el.textContent = text;
  el.classList.toggle('error', isError);
}

// 共有シート（iOS の「ファイルに保存」）を優先し、使えなければダウンロードにフォールバックする。
// 戻り値: 書き出しを完了したら true、ユーザーが共有をキャンセルしたら false。
async function deliverFile(file) {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return true;
    } catch (err) {
      if (err.name === 'AbortError') return false;
      // NotAllowedError 等（ユーザー操作の有効期限切れなど）はダウンロードにフォールバック
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}

export function initSettings({ ledgerId, onDataChanged }) {
  async function refreshLastBackup() {
    const at = await getMeta(ledgerId, META_LAST_BACKUP);
    $('last-backup').textContent = at ? `最終バックアップ: ${formatDateTime(at)}` : '最終バックアップ: まだありません';
  }

  async function exportBackup() {
    setMessage('backup-msg', '');
    const now = new Date();
    const backup = createBackup(await exportAll(), now);
    const file = new File([JSON.stringify(backup, null, 2)], backupFileName(now), { type: 'application/json' });
    const delivered = await deliverFile(file);
    if (!delivered) return;
    await setMeta(ledgerId, META_LAST_BACKUP, now.toISOString());
    await refreshLastBackup();
    setMessage('backup-msg', `支出${backup.expenses.length}件・予算${backup.budgets.length}件を書き出しました`);
  }

  async function importBackup(file) {
    setMessage('backup-msg', '');
    let json;
    try {
      json = JSON.parse(await file.text());
    } catch {
      setMessage('backup-msg', 'JSON として読み込めませんでした', true);
      return;
    }
    const result = parseBackup(json);
    if (!result.ok) {
      setMessage('backup-msg', `読み込めません: ${result.error}`, true);
      return;
    }
    const { budgets, expenses } = result.data;
    const ok = window.confirm(
      `現在のデータをすべて置き換えます。\n取り込み: 支出${expenses.length}件・予算${budgets.length}件\nよろしいですか？`,
    );
    if (!ok) return;
    await replaceAll(result.data);
    setMessage('backup-msg', `取り込みました（支出${expenses.length}件・予算${budgets.length}件）`);
    await onDataChanged();
  }

  async function deleteOldData(event) {
    event.preventDefault();
    setMessage('delete-msg', '');
    const month = $('del-month').value;
    if (!isDeletableMonth(month, currentMonth())) {
      setMessage('delete-msg', '削除できるのは前月以前の月です', true);
      return;
    }
    const plan = planDeletion(await exportAll(), month);
    if (plan.counts.expenses === 0 && plan.counts.budgets === 0) {
      setMessage('delete-msg', '削除対象のデータはありません');
      return;
    }
    const ok = window.confirm(
      `${formatMonthLabel(month)}以前のデータを削除します。\n`
      + `支出 ${plan.counts.expenses}件・予算 ${plan.counts.budgets}件（予算は直近の1件を残します）\n`
      + '元に戻せません。先にバックアップを書き出しましたか？',
    );
    if (!ok) return;
    await applyDeletion(plan);
    setMessage('delete-msg', `削除しました（支出${plan.counts.expenses}件・予算${plan.counts.budgets}件）`);
    await onDataChanged();
  }

  const guard = (fn) => (...args) => fn(...args).catch((err) => setMessage('backup-msg', `処理に失敗しました: ${err.message}`, true));

  $('del-month').max = addMonths(currentMonth(), -1);
  $('export-btn').addEventListener('click', guard(exportBackup));
  $('import-file').addEventListener('change', (e) => {
    const [file] = e.target.files;
    e.target.value = ''; // 同じファイルを続けて選べるようにする
    if (file) guard(importBackup)(file);
  });
  $('delete-form').addEventListener('submit', guard(deleteOldData));

  return { refreshLastBackup };
}
