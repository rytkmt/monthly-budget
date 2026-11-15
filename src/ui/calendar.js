// カレンダー描画。DOM のみを扱い、ロジックは src/domain/ に任せる。
import { buildMonthGrid, intensityLevel } from '../domain/calendar.js';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// totals: { 'YYYY-MM-DD': 合計 } / ref: 濃淡の基準額 / selectedDate, today: 'YYYY-MM-DD' | null
export function renderCalendar(container, { month, totals, ref, selectedDate, today, onSelect }) {
  container.replaceChildren();
  const grid = el('div', 'cal-grid');
  grid.setAttribute('role', 'grid');

  WEEKDAYS.forEach((w, i) => {
    const head = el('div', `cal-head${i === 0 ? ' sun' : i === 6 ? ' sat' : ''}`, w);
    head.setAttribute('role', 'columnheader');
    grid.append(head);
  });

  for (const week of buildMonthGrid(month)) {
    week.forEach((date, i) => {
      if (date === null) {
        grid.append(el('div', 'cal-cell empty'));
        return;
      }
      const total = totals[date] ?? 0;
      const cell = el('button', 'cal-cell');
      cell.type = 'button';
      cell.dataset.date = date;
      cell.dataset.level = String(intensityLevel(total, ref));
      if (i === 0) cell.classList.add('sun');
      if (i === 6) cell.classList.add('sat');
      if (date === today) cell.classList.add('today');
      if (date === selectedDate) cell.classList.add('selected');
      cell.append(el('span', 'cal-day', String(Number(date.slice(8, 10)))));
      cell.append(el('span', 'cal-total', total > 0 ? total.toLocaleString('en-US') : ''));
      cell.setAttribute('aria-label', `${date}${total > 0 ? ` ${total}円` : ''}`);
      cell.addEventListener('click', () => onSelect(date));
      grid.append(cell);
    });
  }
  container.append(grid);
}
