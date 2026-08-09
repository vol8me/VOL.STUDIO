import { describe, it, expect, vi, afterEach } from 'vitest';
import { Kanban, type KanbanCard } from '../../src/ui/data/Kanban';

function makeCards(prefix: string, count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}-${i}`,
    title: `${prefix.toUpperCase()} İş #${i + 1}`,
  }));
}

const originalElementFromPoint = document.elementFromPoint;
afterEach(() => {
  document.elementFromPoint = originalElementFromPoint;
});

/**
 * jsdom `getBoundingClientRect()`i hesaplamaz ve `elementFromPoint`i
 * desteklemez — Kanban'ın sürükleme mantığı ikisine de dayanır (hangi
 * sütunun/kartın üzerinde olunduğunu bulmak için). Kartlar sabit
 * `cardHeight` ile dikey dizilmiş, sütunlar `columnWidth` ile yatay
 * dizilmiş kabul edilir; `elementFromPoint` bu sabit geometriye göre en
 * yakın kart/sütunu döner.
 */
function mockBoardGeometry(
  kanban: Kanban,
  columnIds: string[],
  cardHeight = 60,
  columnWidth = 220,
): void {
  const columnRects = new Map<string, DOMRect>();
  columnIds.forEach((id, colIndex) => {
    const columnEl = kanban.element.querySelector<HTMLDivElement>(`[data-column-id="${id}"]`)!;
    const rect = {
      left: colIndex * columnWidth,
      right: colIndex * columnWidth + columnWidth,
      top: 0,
      bottom: 2000,
      width: columnWidth,
      height: 2000,
      x: colIndex * columnWidth,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect;
    columnRects.set(id, rect);
    vi.spyOn(columnEl, 'getBoundingClientRect').mockReturnValue(rect);
  });

  for (const id of columnIds) {
    const cardEls = Array.from(
      kanban.element.querySelectorAll<HTMLDivElement>(
        `[data-column-id="${id}"] .vol-kanban__card:not(.vol-kanban__card--ghost)`,
      ),
    );
    cardEls.forEach((cardEl, rowIndex) => {
      const columnRect = columnRects.get(id)!;
      vi.spyOn(cardEl, 'getBoundingClientRect').mockReturnValue({
        left: columnRect.left,
        right: columnRect.right,
        top: rowIndex * cardHeight,
        bottom: rowIndex * cardHeight + cardHeight,
        width: columnWidth,
        height: cardHeight,
        x: columnRect.left,
        y: rowIndex * cardHeight,
        toJSON: () => ({}),
      });
    });
  }

  document.elementFromPoint = (x: number, y: number): Element | null => {
    for (const id of columnIds) {
      const columnEl = kanban.element.querySelector<HTMLDivElement>(`[data-column-id="${id}"]`)!;
      const rect = columnRects.get(id)!;
      if (x >= rect.left && x < rect.right) {
        // Önce o sütundaki bir karta isabet edip etmediğine bak (daha spesifik hedef).
        const cardEls = Array.from(
          kanban.element.querySelectorAll<HTMLDivElement>(
            `[data-column-id="${id}"] .vol-kanban__card:not(.vol-kanban__card--ghost)`,
          ),
        );
        for (const cardEl of cardEls) {
          const cardRect = cardEl.getBoundingClientRect();
          if (y >= cardRect.top && y < cardRect.bottom) return cardEl;
        }
        return columnEl;
      }
    }
    return null;
  };
}

function pointerDown(el: HTMLElement, clientX: number, clientY: number): void {
  el.dispatchEvent(
    new PointerEvent('pointerdown', {
      pointerId: 1,
      clientX,
      clientY,
      bubbles: true,
      cancelable: true,
    }),
  );
}
function pointerMove(clientX: number, clientY: number): void {
  document.dispatchEvent(
    new PointerEvent('pointermove', {
      pointerId: 1,
      clientX,
      clientY,
      bubbles: true,
      cancelable: true,
    }),
  );
}
function pointerUp(clientX: number, clientY: number): void {
  document.dispatchEvent(
    new PointerEvent('pointerup', {
      pointerId: 1,
      clientX,
      clientY,
      bubbles: true,
      cancelable: true,
    }),
  );
}

describe('Kanban', () => {
  it('kartlar klavye ile kavranıp sütunlar arası taşınabilir', () => {
    const onCardMove = vi.fn();
    const kanban = new Kanban({
      columns: [
        { id: 'pending', title: 'Beklemede', cards: makeCards('p', 3) },
        { id: 'active', title: 'İşlemde', cards: [] },
      ],
      onCardMove,
    });

    const card = kanban.element.querySelector<HTMLDivElement>('[data-card-id="p-0"]');
    expect(card).not.toBeNull();

    // Kavra
    card!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    const cardAfterGrab = kanban.element.querySelector<HTMLDivElement>('[data-card-id="p-0"]');
    // Sağa taşı
    cardAfterGrab!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
    );

    expect(onCardMove).toHaveBeenCalledWith('p-0', 'pending', 'active', 0);

    // İptal - eski sütuna geri dön
    const cardAfterMove = kanban.element.querySelector<HTMLDivElement>('[data-card-id="p-0"]');
    cardAfterMove!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(onCardMove).toHaveBeenLastCalledWith('p-0', 'active', 'pending', 0);

    kanban.destroy();
  });

  it('kartlar ok tuşlarıyla aynı sütun içinde yeniden sıralanabilir', () => {
    const onCardMove = vi.fn();
    const kanban = new Kanban({
      columns: [{ id: 'pending', title: 'Beklemede', cards: makeCards('p', 3) }],
      onCardMove,
    });

    const card = kanban.element.querySelector<HTMLDivElement>('[data-card-id="p-0"]');
    card!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    const cardAfterGrab = kanban.element.querySelector<HTMLDivElement>('[data-card-id="p-0"]');
    cardAfterGrab!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

    expect(onCardMove).toHaveBeenCalledWith('p-0', 'pending', 'pending', 1);

    kanban.destroy();
  });

  it('pencereleme açıkken sütunlarda yalnızca görünür kartlar DOMda kalır', () => {
    const kanban = new Kanban({
      columns: [
        { id: 'q', title: 'Kuyruk', cards: makeCards('q', 300) },
        { id: 'a', title: 'İşlemde', cards: makeCards('a', 300) },
        { id: 's', title: 'Sevk', cards: makeCards('s', 300) },
      ],
      virtualizeCards: { cardHeight: 46, bodyHeight: 300, overscan: 3 },
    });

    const cards = kanban.element.querySelectorAll('.vol-kanban__card');
    expect(cards.length).toBeGreaterThan(0);
    // 3 sütun * (~7 görünür + 3 overscan) = ~30
    expect(cards.length).toBeLessThanOrEqual(45);

    kanban.destroy();
  });
});

describe('Kanban - pointer sürükleme', () => {
  it('bir kart pointer ile başka bir sütuna sürüklenip bırakılabilir', () => {
    const onCardMove = vi.fn();
    const kanban = new Kanban({
      columns: [
        { id: 'pending', title: 'Beklemede', cards: makeCards('p', 2) },
        { id: 'active', title: 'İşlemde', cards: [] },
      ],
      onCardMove,
    });
    mockBoardGeometry(kanban, ['pending', 'active']);

    const card = kanban.element.querySelector<HTMLDivElement>('[data-card-id="p-0"]')!;
    pointerDown(card, 100, 30);
    pointerMove(300, 30); // "active" sütununa taşı
    pointerUp(300, 30);

    expect(onCardMove).toHaveBeenCalledWith('p-0', 'pending', 'active', 0);
    kanban.destroy();
  });

  it('DRAG_START_THRESHOLD altındaki hareket sürükleme sayılmaz, onCardClick tetiklenir', () => {
    const onCardMove = vi.fn();
    const onCardClick = vi.fn();
    const kanban = new Kanban({
      columns: [{ id: 'pending', title: 'Beklemede', cards: makeCards('p', 1) }],
      onCardMove,
      onCardClick,
    });
    mockBoardGeometry(kanban, ['pending']);

    const card = kanban.element.querySelector<HTMLDivElement>('[data-card-id="p-0"]')!;
    pointerDown(card, 100, 30);
    pointerMove(102, 30); // eşik (6px) altı
    pointerUp(102, 30);

    expect(onCardMove).not.toHaveBeenCalled();
    expect(onCardClick).toHaveBeenCalledTimes(1);
    expect((onCardClick.mock.calls[0][0] as KanbanCard).id).toBe('p-0');
    kanban.destroy();
  });

  it('WIP limiti dolu bir sütuna bırakma reddedilir ve onWipLimitExceeded çağrılır', () => {
    const onCardMove = vi.fn();
    const onWipLimitExceeded = vi.fn();
    const kanban = new Kanban({
      columns: [
        { id: 'pending', title: 'Beklemede', cards: makeCards('p', 1) },
        { id: 'active', title: 'İşlemde', cards: makeCards('a', 2), wipLimit: 2 },
      ],
      onCardMove,
      onWipLimitExceeded,
    });
    mockBoardGeometry(kanban, ['pending', 'active']);

    const card = kanban.element.querySelector<HTMLDivElement>('[data-card-id="p-0"]')!;
    pointerDown(card, 100, 30);
    pointerMove(300, 30);
    pointerUp(300, 30);

    expect(onCardMove).not.toHaveBeenCalled();
    expect(onWipLimitExceeded).toHaveBeenCalledWith('active', 'p-0');
    kanban.destroy();
  });

  it('aynı sütun içinde kart iki kart arasına bırakılınca doğru sırayı alır', () => {
    const onCardMove = vi.fn();
    const kanban = new Kanban({
      columns: [{ id: 'pending', title: 'Beklemede', cards: makeCards('p', 3) }], // p-0, p-1, p-2
      onCardMove,
    });
    mockBoardGeometry(kanban, ['pending']);

    // p-0'ı p-1 ile p-2 arasına (satır 2'nin altına) taşı.
    const card = kanban.element.querySelector<HTMLDivElement>('[data-card-id="p-0"]')!;
    pointerDown(card, 100, 30); // p-0 satırı (0-60 arası, merkezi 30)
    pointerMove(100, 130); // p-2 satırının (120-180) üst yarısı -> hedef index 2
    pointerUp(100, 130);

    expect(onCardMove).toHaveBeenCalledWith('p-0', 'pending', 'pending', 1);
    kanban.destroy();
  });

  it('destroy document pointer listenerlarını temizler', () => {
    const kanban = new Kanban({
      columns: [{ id: 'pending', title: 'Beklemede', cards: makeCards('p', 1) }],
    });
    const removeListener = vi.spyOn(document, 'removeEventListener');

    kanban.destroy();

    expect(removeListener).toHaveBeenCalledWith('pointermove', expect.any(Function));
    expect(removeListener).toHaveBeenCalledWith('pointerup', expect.any(Function));
    expect(removeListener).toHaveBeenCalledWith('pointercancel', expect.any(Function));
  });
});

describe('Kanban - drop indicator', () => {
  it('sürükleme sırasında hedef sütunda dropIndicator DOMa eklenir, bırakınca kaldırılır', () => {
    const kanban = new Kanban({
      columns: [
        { id: 'pending', title: 'Beklemede', cards: makeCards('p', 2) },
        { id: 'active', title: 'İşlemde', cards: [] },
      ],
    });
    mockBoardGeometry(kanban, ['pending', 'active']);

    const card = kanban.element.querySelector<HTMLDivElement>('[data-card-id="p-0"]')!;
    pointerDown(card, 100, 30);
    pointerMove(300, 30);

    const indicator = kanban.element.querySelector('.vol-kanban__drop-indicator');
    expect(indicator).not.toBeNull();
    // indicator hedef sütunun gövdesi içinde olmalı (pencereleme kapalıyken
    // viewport = column-body'nin kendisidir, bkz. Kanban.buildColumn).
    const activeBody = kanban.element.querySelector(
      '[data-column-id="active"] .vol-kanban__column-body',
    );
    expect(activeBody?.contains(indicator)).toBe(true);

    pointerUp(300, 30);
    expect(kanban.element.querySelector('.vol-kanban__drop-indicator')).toBeNull();

    kanban.destroy();
  });

  it('WIP limiti dolu sütun üzerindeyken dropIndicator gösterilmez', () => {
    const kanban = new Kanban({
      columns: [
        { id: 'pending', title: 'Beklemede', cards: makeCards('p', 1) },
        { id: 'active', title: 'İşlemde', cards: makeCards('a', 2), wipLimit: 2 },
      ],
    });
    mockBoardGeometry(kanban, ['pending', 'active']);

    const card = kanban.element.querySelector<HTMLDivElement>('[data-card-id="p-0"]')!;
    pointerDown(card, 100, 30);
    pointerMove(300, 30);

    expect(kanban.element.querySelector('.vol-kanban__drop-indicator')).toBeNull();

    pointerUp(300, 30);
    kanban.destroy();
  });
});

describe('Kanban - son taşınan kart vurgusu (flash)', () => {
  it('applyMove sonrası kartın yeni DOM elementi --just-moved class alır ve süre sonunda kaybolur', () => {
    vi.useFakeTimers();
    const kanban = new Kanban({
      columns: [
        { id: 'pending', title: 'Beklemede', cards: makeCards('p', 1) },
        { id: 'active', title: 'İşlemde', cards: [] },
      ],
    });

    const card = kanban.element.querySelector<HTMLDivElement>('[data-card-id="p-0"]')!;
    card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    kanban.element
      .querySelector<HTMLDivElement>('[data-card-id="p-0"]')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

    // rerenderColumn kartı BAŞTAN oluşturur — eski referans değil, YENİ elementi sorgula.
    const movedCard = kanban.element.querySelector<HTMLDivElement>('[data-card-id="p-0"]')!;
    expect(movedCard.classList.contains('vol-kanban__card--just-moved')).toBe(true);

    vi.advanceTimersByTime(1700);
    expect(movedCard.classList.contains('vol-kanban__card--just-moved')).toBe(false);

    kanban.destroy();
    vi.useRealTimers();
  });

  it('destroy bekleyen highlight zamanlayıcısını temizler (hata fırlatmaz)', () => {
    vi.useFakeTimers();
    const kanban = new Kanban({
      columns: [
        { id: 'pending', title: 'Beklemede', cards: makeCards('p', 1) },
        { id: 'active', title: 'İşlemde', cards: [] },
      ],
    });

    const card = kanban.element.querySelector<HTMLDivElement>('[data-card-id="p-0"]')!;
    card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    kanban.element
      .querySelector<HTMLDivElement>('[data-card-id="p-0"]')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

    expect(() => kanban.destroy()).not.toThrow();
    vi.useRealTimers();
  });
});
