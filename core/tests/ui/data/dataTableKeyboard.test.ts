import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataTable } from '../../../src/ui/data/DataTable';

/**
 * Seçilebilir DataTable klavye/kol erişimi: tek `tabindex=0` satırı (roving), ok/Home/End ile gezinme,
 * Enter/Space ile seçim, `aria-selected`, yeniden çizimde odak korunur, pencerelemede satır sırası AT'ye bildirilir.
 */
interface Row {
  id: string;
  name: string;
}
const rows = (n: number): Row[] =>
  Array.from({ length: n }, (_, i) => ({ id: `r${i}`, name: `Satır ${i}` }));
const columns = [{ key: 'name', header: 'Ad', sortable: false }];

let table: DataTable<Row> | null = null;
afterEach(() => {
  table?.destroy();
  table = null;
  document.body.replaceChildren();
});

function mount(
  options: Partial<ConstructorParameters<typeof DataTable<Row>>[0]> = {},
): HTMLElement {
  table = new DataTable<Row>({ columns, rows: rows(5), selectable: true, ...options });
  document.body.append(table.element);
  return table.element;
}

const bodyRows = (root: HTMLElement): HTMLTableRowElement[] => [
  ...root.querySelectorAll<HTMLTableRowElement>('tr.vol-datatable__row'),
];
const key = (target: Element, k: string): void => {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
};

describe('seçilebilir tablo', () => {
  it('tek satır tabindex=0 alır; tüm satırlarda aria-selected bulunur', () => {
    const root = mount();
    const list = bodyRows(root);
    expect(list.filter((tr) => tr.tabIndex === 0)).toHaveLength(1);
    expect(list[0].tabIndex).toBe(0);
    expect(list.every((tr) => tr.getAttribute('aria-selected') === 'false')).toBe(true);
  });

  it('ok tuşları, Home ve End odağı taşır', () => {
    const root = mount();
    const list = bodyRows(root);
    list[0].focus();
    key(list[0], 'ArrowDown');
    expect(document.activeElement).toBe(bodyRows(root)[1]);
    key(document.activeElement as Element, 'End');
    expect(document.activeElement).toBe(bodyRows(root)[4]);
    key(document.activeElement as Element, 'ArrowDown');
    expect(document.activeElement).toBe(bodyRows(root)[4]);
    key(document.activeElement as Element, 'Home');
    expect(document.activeElement).toBe(bodyRows(root)[0]);
    expect(bodyRows(root).filter((tr) => tr.tabIndex === 0)).toHaveLength(1);
  });

  it('Enter ve Space satırı seçer; yeniden çizimde odak aynı satırda kalır', () => {
    const onSelectionChange = vi.fn();
    const root = mount({ onSelectionChange });
    bodyRows(root)[2].focus();
    key(bodyRows(root)[2], 'Enter');
    expect(onSelectionChange).toHaveBeenLastCalledWith(['r2']);
    const after = bodyRows(root)[2];
    expect(after.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(after);
    key(after, ' ');
    expect(onSelectionChange).toHaveBeenCalledTimes(2);
  });

  it('çoklu seçimde Space seçimi açıp kapatır; onay kutusu görsel işarettir', () => {
    const root = mount({ multiSelect: true });
    const first = bodyRows(root)[0];
    expect(first.querySelector('.vol-datatable__checkbox')?.getAttribute('aria-hidden')).toBe(
      'true',
    );
    first.focus();
    key(first, ' ');
    expect(bodyRows(root)[0].getAttribute('aria-selected')).toBe('true');
    key(bodyRows(root)[0], ' ');
    expect(bodyRows(root)[0].getAttribute('aria-selected')).toBe('false');
  });

  it('seçilebilir olmayan tabloda satırlar odaklanmaz ve aria-selected yoktur', () => {
    const root = mount({ selectable: false });
    const list = bodyRows(root);
    expect(list.every((tr) => !tr.hasAttribute('tabindex'))).toBe(true);
    expect(list.every((tr) => !tr.hasAttribute('aria-selected'))).toBe(true);
  });
});

describe('pencereleme', () => {
  it('satır sayısı ve gerçek sıra AT’ye bildirilir; End son satırı görünür kılar ve odaklar', () => {
    const root = mount({ rows: rows(500), virtualize: { rowHeight: 32, height: 160 } });
    const tableEl = root.querySelector('table')!;
    expect(tableEl.getAttribute('aria-rowcount')).toBe('501');
    expect(root.querySelector('thead tr')?.getAttribute('aria-rowindex')).toBe('1');
    expect(bodyRows(root)[0].getAttribute('aria-rowindex')).toBe('2');

    bodyRows(root)[0].focus();
    key(bodyRows(root)[0], 'End');
    const last = root.querySelector<HTMLElement>('tr[data-key="r499"]');
    expect(last).not.toBeNull();
    expect(document.activeElement).toBe(last);
    expect(last?.getAttribute('aria-rowindex')).toBe('501');
  });
});
