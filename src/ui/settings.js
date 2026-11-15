// メニュー内: JSON バックアップの書き出し・読み込み、前月以前のデータ削除。
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

function downloadFile(file) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function initSettings({ ledgerId, onDataChanged }) {
  // 書き出す内容は先に作っておく。iOS の共有シート（navigator.share）は、ボタンを押した操作の中で
  // 同期的に呼ばないと拒否される。クリック後に IndexedDB を読む（await する）と有効期限が切れる。
  let prepared = null; // { backup, file }

  async function prepareExport() {
    const now = new Date();
    const backup = createBackup(await exportAll(), now);
    const file = new File([JSON.stringify(backup, null, 2)], backupFileName(now), { type: 'application/json' });
    prepared = { backup, file };
  }

  async function refreshLastBackup() {
    const at = await getMeta(ledgerId, META_LAST_BACKUP);
    $('last-backup').textContent = at ? `最終バックアップ: ${formatDateTime(at)}` : '最終バックアップ: まだありません';
  }

  async function markBackedUp(backup, how) {
    await setMeta(ledgerId, META_LAST_BACKUP, new Date().toISOString());
    await refreshLastBackup();
    setMessage('backup-msg', `${how}（支出${backup.expenses.length}件・予算${backup.budgets.length}件）`);
  }

  function showFailure(err) {
    setMessage('backup-msg', `書き出しに失敗しました: ${err.message}`, true);
  }

  // クリックの中で同期的に呼ばれる（先頭に await を置かない）
  function exportBackup() {
    setMessage('backup-msg', '');
    if (!prepared) {
      // 準備が間に合っていない場合のみ。共有シートは使えない可能性があるのでダウンロードにする
      prepareExport()
        .then(() => {
          downloadFile(prepared.file);
          return markBackedUp(prepared.backup, 'ダウンロードしました。ファイル App を確認してください');
        })
        .catch(showFailure);
      return;
    }
    const { backup, file } = prepared;
    if (navigator.canShare?.({ files: [file] })) {
      navigator.share({ files: [file] })
        .then(() => markBackedUp(backup, '書き出しました'))
        .catch((err) => {
          if (err.name === 'AbortError') {
            setMessage('backup-msg', '書き出しをキャンセルしました');
            return undefined;
          }
          // 共有が使えなかった場合はダウンロードで代替する
          downloadFile(file);
          return markBackedUp(backup, 'ダウンロードしました。ファイル App を確認してください');
        })
        .catch(showFailure);
      return;
    }
    downloadFile(file);
    markBackedUp(backup, 'ダウンロードしました。ファイル App を確認してください').catch(showFailure);
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
    await prepareExport();
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
    await prepareExport();
  }

  const guard = (fn, messageId) => (...args) => fn(...args).catch(
    (err) => setMessage(messageId, `処理に失敗しました: ${err.message}`, true),
  );

  $('del-month').max = addMonths(currentMonth(), -1);
  $('export-btn').addEventListener('click', exportBackup);
  $('import-file').addEventListener('change', (e) => {
    const [file] = e.target.files;
    e.target.value = ''; // 同じファイルを続けて選べるようにする
    if (file) guard(importBackup, 'backup-msg')(file);
  });
  $('delete-form').addEventListener('submit', guard(deleteOldData, 'delete-msg'));

  return { refreshLastBackup, prepareExport };
}
