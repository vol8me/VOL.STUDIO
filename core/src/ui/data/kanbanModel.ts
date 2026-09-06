import type { KanbanCard, KanbanColumn } from './Kanban';

/**
 * Kanban'ın SAF taşıma kuralları — DOM'suz.
 *
 * Bir kartın nereye gidebileceği, WIP limitinin ne zaman uygulandığı, arama
 * filtresi açıkken görünen sıranın gerçek model sırasına nasıl çevrildiği: bunlar
 * veri kuralıdır, sunum değil. Bileşenin içinde dururken jsdom kurmadan
 * sınanamıyor ve sürükleme/klavye kod yollarının arkasına gizleniyorlardı.
 *
 * Buradaki hiçbir fonksiyon element, olay ya da tarayıcı API'si görmez; hepsi
 * girdi verisinden çıktı verisi üretir. Taşıma, dizileri YERİNDE değiştirir
 * çünkü çağıran aynı model nesnesini render etmeye devam eder.
 */

/** Bir kartın hangi sütunda ve kaçıncı sırada olduğu. */
export interface KanbanCardLocation {
  column: KanbanColumn;
  index: number;
}

/** Taşıma denemesinin sonucu — neden başarısız olduğu dahil. */
export type KanbanMoveResult =
  | { moved: true; toIndex: number }
  | { moved: false; reason: 'wip-limit' | 'missing-column' | 'missing-card' };

/** Kartı bütün sütunlarda arar. */
export function locateCard(
  columns: readonly KanbanColumn[],
  cardId: string,
): KanbanCardLocation | null {
  for (const column of columns) {
    const index = column.cards.findIndex((card) => card.id === cardId);
    if (index !== -1) return { column, index };
  }
  return null;
}

/** Sütun WIP limitine ulaştı mı? Limit verilmemişse asla dolmaz. */
export function isColumnFull(column: KanbanColumn): boolean {
  return column.wipLimit !== undefined && column.cards.length >= column.wipLimit;
}

/** Kart arama sorgusuyla eşleşiyor mu? Boş sorgu her kartla eşleşir. */
export function cardMatchesSearch(card: KanbanCard, query: string, locale: string): boolean {
  if (!query) return true;
  const haystack = [card.title, card.description ?? '', ...(card.tags ?? [])]
    .join(' ')
    .toLocaleLowerCase(locale);
  return haystack.includes(query);
}

/** Sorguya göre süzülmüş kartlar; sorgu boşsa dizinin KENDİSİ döner. */
export function visibleCards(
  column: KanbanColumn,
  query: string,
  locale: string,
): readonly KanbanCard[] {
  if (!query) return column.cards;
  return column.cards.filter((card) => cardMatchesSearch(card, query, locale));
}

/**
 * Görünür sıradaki bir konumu gerçek model index'ine çevirir.
 *
 * Arama filtresi etkinken ikisi AYRIŞIR: kullanıcı üçüncü görünür kartın
 * üstüne bırakır ama o kart modelde yedinci olabilir.
 */
export function modelIndexFromVisibleIndex(
  column: KanbanColumn,
  visibleIndex: number,
  query: string,
  locale: string,
): number {
  if (!query) return visibleIndex;
  const visible = visibleCards(column, query, locale);
  if (visibleIndex >= visible.length) return column.cards.length;
  return column.cards.indexOf(visible[visibleIndex]);
}

/**
 * Sürükleme sırasında hesaplanan hedef index'i taşıma sonrası sıraya düzeltir.
 *
 * `toIndex`, sürüklenen kart hâlâ dizide dururken hesaplandı. Aynı sütun içinde
 * kartı eski yerinden çıkarmak sonraki index'leri bir kaydırır; hedef eski
 * konumdan SONRAYSA index bir azaltılır.
 */
export function adjustIndexForSameColumn(
  toIndex: number,
  fromIndex: number,
  sameColumn: boolean,
): number {
  return sameColumn && toIndex > fromIndex ? toIndex - 1 : toIndex;
}

/**
 * Kartı taşır ve modeli YERİNDE günceller.
 *
 * WIP limiti yalnız FARKLI sütuna taşınırken uygulanır: aynı sütun içinde
 * yeniden sıralama kart sayısını artırmaz, dolayısıyla limiti aşamaz.
 */
export function moveCard(
  columns: readonly KanbanColumn[],
  cardId: string,
  fromColumnId: string,
  toColumnId: string,
  targetIndex: number,
): KanbanMoveResult {
  const fromColumn = columns.find((column) => column.id === fromColumnId);
  const toColumn = columns.find((column) => column.id === toColumnId);
  if (!fromColumn || !toColumn) return { moved: false, reason: 'missing-column' };

  if (toColumnId !== fromColumnId && isColumnFull(toColumn)) {
    return { moved: false, reason: 'wip-limit' };
  }

  const cardIndex = fromColumn.cards.findIndex((card) => card.id === cardId);
  if (cardIndex === -1) return { moved: false, reason: 'missing-card' };

  const [card] = fromColumn.cards.splice(cardIndex, 1);
  const clampedIndex = Math.max(0, Math.min(targetIndex, toColumn.cards.length));
  toColumn.cards.splice(clampedIndex, 0, card);

  return { moved: true, toIndex: clampedIndex };
}
