import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { cx } from './cx.js';
import { sortRows, nextSort } from './tableSort.js';
import { useIsMobile } from '../../hooks/useIsMobile.js';
import { useT } from '../../context/LanguageContext';
import Button from './Button.jsx';

// Tabela z sortowaniem po kliknięciu nagłówka, przyklejonym nagłówkiem
// (style .data-table) i — na telefonie — wierszami zamienionymi w karty,
// bo 7 kolumn na 390 px dawało przewijanie w bok.
//
// Kolumna: {
//   key, header, align: 'left' | 'right',
//   value?: row => wartość do sortowania (domyślnie row[key]),
//   render?: row => zawartość komórki (domyślnie value),
//   sortable?, firstDir?: 'asc' | 'desc',
//   mobile?: 'title' | 'aside' | 'hide'  — na karcie: tytuł po lewej,
//            wartość po prawej, reszta w siatce „etykieta: wartość"
// }
// pageSize — pokazuj tyle wierszy (po sortowaniu) i przycisk „Pokaż kolejne";
//            przy setkach transakcji cała lista na raz mieliła telefon.

const valueOf = (col, row) => (col.value ? col.value(row) : row[col.key]);
const cellOf = (col, row) => (col.render ? col.render(row) : valueOf(col, row));

export default function Table({ columns, rows, rowKey, onRowClick, defaultSort = null, empty, pageSize, className }) {
  const t = useT();
  const isMobile = useIsMobile();
  const [sort, setSort] = useState(defaultSort);
  const [shown, setShown] = useState(pageSize ?? Infinity);
  // Nowe dane (np. inny filtr) → znowu od pierwszej strony.
  const [prevRows, setPrevRows] = useState(rows);
  if (rows !== prevRows) { setPrevRows(rows); setShown(pageSize ?? Infinity); }

  const sorted = useMemo(() => {
    const col = sort && columns.find(c => c.key === sort.key);
    return col ? sortRows(rows, r => valueOf(col, r), sort.dir) : rows;
  }, [rows, columns, sort]);

  if (rows.length === 0 && empty) return empty;

  const visible = sorted.slice(0, shown);
  const left = sorted.length - visible.length;
  const more = left > 0 && (
    <div className="border-t border-line p-2 text-center">
      <Button size="sm" variant="ghost" onClick={() => setShown(s => s + pageSize)}>
        {t('show_more').replace('{n}', Math.min(pageSize, left)).replace('{left}', left)}
      </Button>
    </div>
  );

  const rowProps = row => onRowClick ? {
    onClick: () => onRowClick(row),
    onKeyDown: e => { if (e.key === 'Enter') onRowClick(row); },
    tabIndex: 0,
  } : {};

  if (isMobile) {
    const title = columns.find(c => c.mobile === 'title') ?? columns[0];
    const aside = columns.find(c => c.mobile === 'aside');
    const rest = columns.filter(c => c !== title && c !== aside && c.mobile !== 'hide');
    return (
      <>
      <ul className={cx('divide-y divide-line', className)}>
        {visible.map(row => (
          <li
            key={rowKey(row)}
            className={cx('px-4 py-3', onRowClick && 'cursor-pointer active:bg-panel-hover')}
            {...rowProps(row)}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 font-semibold text-fg">{cellOf(title, row)}</div>
              {aside && <div className="shrink-0 text-right font-semibold text-fg">{cellOf(aside, row)}</div>}
            </div>
            {rest.length > 0 && (
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-small">
                {rest.map(col => (
                  <div key={col.key} className="flex min-w-0 justify-between gap-2">
                    <dt className="text-faint">{col.header}</dt>
                    <dd className="truncate text-right text-fg">{cellOf(col, row)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </li>
        ))}
      </ul>
      {more}
      </>
    );
  }

  return (
    <div className={cx('overflow-x-auto', className)}>
      <table className="data-table">
        <thead>
          <tr>
            {columns.map(col => {
              const active = sort?.key === col.key;
              const Arrow = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
              return (
                <th
                  key={col.key}
                  className={col.align === 'right' ? 'right' : undefined}
                  aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                >
                  {col.sortable ? (
                    <button
                      type="button"
                      onClick={() => setSort(s => nextSort(s, col.key, col.firstDir))}
                      className={cx('group inline-flex items-center gap-1 uppercase hover:text-fg', active && 'text-fg', col.align === 'right' && 'flex-row-reverse')}
                    >
                      {col.header}
                      <Arrow size={12} aria-hidden className={cx(!active && 'opacity-0 group-hover:opacity-60')} />
                    </button>
                  ) : col.header}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {visible.map(row => (
            <tr key={rowKey(row)} {...rowProps(row)} style={onRowClick ? undefined : { cursor: 'default' }}>
              {columns.map(col => (
                <td key={col.key} className={col.align === 'right' ? 'right' : undefined}>{cellOf(col, row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {more}
    </div>
  );
}
