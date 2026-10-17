import { afterEach, describe, expect, it } from 'vitest';
import { DataTable } from '../../../src/ui/data/DataTable';

/**
 * ARIA gerekçesi (UI-10.5): satırı odaklanan ve seçilen tablo etkileşimli bir veri ızgarasıdır (`role="grid"`);
 * yalnız okunan tablo yerel `table` semantiğinde kalır ve satırında seçim durumu taşımaz.
 */
interface Row {
  id: string;
  name: string;
}
const rows: Row[] = [
  { id: 'a', name: 'A' },
  { id: 'b', name: 'B' },
];
const columns = [{ key: 'name', header: 'Ad' }];

let table: DataTable<Row> | null = null;
afterEach(() => {
  table?.destroy();
  table = null;
  document.body.replaceChildren();
});

function mount(
  options: Partial<ConstructorParameters<typeof DataTable<Row>>[0]> = {},
): HTMLElement {
  table = new DataTable<Row>({ columns, rows, ...options });
  document.body.append(table.element);
  const element = table.element.querySelector<HTMLElement>('table');
  if (!element) throw new Error('tablo yok');
  return element;
}

describe('DataTable ARIA rolü', () => {
  it('seçilebilir tablo grid olur; çoklu seçimde aria-multiselectable bulunur, tekli seçimde yoktur', () => {
    const single = mount({ selectable: true });
    expect(single.getAttribute('role')).toBe('grid');
    expect(single.hasAttribute('aria-multiselectable')).toBe(false);
    table?.destroy();
    document.body.replaceChildren();

    const multi = mount({ multiSelect: true });
    expect(multi.getAttribute('role')).toBe('grid');
    expect(multi.getAttribute('aria-multiselectable')).toBe('true');
  });

  it('seçilemeyen tablo yerel table semantiğinde kalır ve satırlarda aria-selected taşımaz', () => {
    const plain = mount();
    expect(plain.hasAttribute('role')).toBe(false);
    expect(plain.hasAttribute('aria-multiselectable')).toBe(false);
    expect(plain.querySelectorAll('tr[aria-selected]')).toHaveLength(0);
  });

  it('ariaLabel tabloya ad verir; verilmezse ad yazılmaz', () => {
    expect(mount({ selectable: true, ariaLabel: 'Envanter' }).getAttribute('aria-label')).toBe(
      'Envanter',
    );
    table?.destroy();
    document.body.replaceChildren();
    expect(mount({ selectable: true }).hasAttribute('aria-label')).toBe(false);
  });

  it('başlık hücreleri sütun, satırlar satır, hücreler ızgara hücresi olarak kalır (yerel eşleme)', () => {
    const grid = mount({ selectable: true });
    expect(grid.querySelectorAll('thead th')).toHaveLength(1);
    expect(grid.querySelectorAll('tbody tr.vol-datatable__row')).toHaveLength(2);
    // Yerel th/tr/td, role=grid altında columnheader/row/gridcell olarak eşlenir; elle rol yazılmaz.
    expect(
      grid.querySelectorAll('[role="row"], [role="gridcell"], [role="columnheader"]'),
    ).toHaveLength(0);
  });
});
