import { describe, it, expect, vi } from 'vitest';
import { DataTable } from '../../src/ui/data/DataTable';

interface Row {
  id: string;
  name: string;
  level: number;
}

function makeRows(count: number): Row[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `row-${i}`,
    name: `İsim ${i}`,
    level: count - i,
  }));
}

describe('DataTable', () => {
  it('sütun başlıklarına scope="col" ve varsayılan aria-sort="none" ekler', () => {
    const table = new DataTable<Row>({
      columns: [
        { key: 'id', header: 'ID' },
        { key: 'name', header: 'İsim' },
      ],
      rows: makeRows(3),
    });

    const headers = Array.from(table.element.querySelectorAll('th'));
    expect(headers).toHaveLength(2);
    for (const th of headers) {
      expect(th.scope).toBe('col');
      expect(th.getAttribute('aria-sort')).toBe('none');
    }

    table.destroy();
  });

  it('üç aşamalı sıralama döngüsüne sahiptir: asc → desc → none', () => {
    const table = new DataTable<Row>({
      columns: [
        { key: 'level', header: 'Seviye', sortValue: (row) => row.level },
        { key: 'name', header: 'İsim' },
      ],
      rows: makeRows(3),
    });

    const levelHeader = table.element.querySelector<HTMLTableCellElement>('th');
    const button = levelHeader?.querySelector('button');
    expect(button).not.toBeNull();

    button!.click();
    expect(levelHeader!.getAttribute('aria-sort')).toBe('ascending');

    button!.click();
    expect(levelHeader!.getAttribute('aria-sort')).toBe('descending');

    button!.click();
    expect(levelHeader!.getAttribute('aria-sort')).toBe('none');

    table.destroy();
  });

  it('pencereleme açıkken DOMda yalnızca görünür + overscan satırları tutar', () => {
    const table = new DataTable<Row>({
      columns: [
        { key: 'id', header: 'ID' },
        { key: 'name', header: 'İsim' },
      ],
      rows: makeRows(100),
      virtualize: { rowHeight: 20, height: 100, overscan: 2 },
    });

    const visibleRows = table.element.querySelectorAll('.vol-datatable__row');
    const spacerRows = table.element.querySelectorAll('.vol-datatable__spacer');

    expect(visibleRows.length).toBeGreaterThan(0);
    expect(visibleRows.length).toBeLessThanOrEqual(12); // ~5 görünür + 2 overscan
    expect(spacerRows.length).toBeGreaterThan(0);

    table.destroy();
  });

  it('setRows sonrası seçim önbelleği temizlenir ve kaydırma sınırlandırılır', () => {
    const table = new DataTable<Row>({
      columns: [{ key: 'id', header: 'ID' }],
      rows: makeRows(100),
      virtualize: { rowHeight: 20, height: 100 },
    });

    table.element.scrollTop = 2000;
    table.setRows(makeRows(10));

    expect(table.element.scrollTop).toBeLessThanOrEqual(200);
    expect(table.getSelectedKeys()).toHaveLength(0);

    table.destroy();
  });

  it('tek seçimli satır seçimini doğru yönetir', () => {
    const onSelectionChange = vi.fn();
    const table = new DataTable<Row>({
      columns: [{ key: 'id', header: 'ID' }],
      rows: makeRows(3),
      selectable: true,
      onSelectionChange,
    });

    const row = table.element.querySelector('.vol-datatable__row');
    row?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(table.getSelectedKeys()).toHaveLength(1);
    expect(onSelectionChange).toHaveBeenCalledTimes(1);

    table.destroy();
  });
});
