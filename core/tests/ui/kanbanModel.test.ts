import { describe, expect, it } from 'vitest';
import type { KanbanColumn } from '../../src/ui/data/Kanban';
import {
  adjustIndexForSameColumn,
  cardMatchesSearch,
  isColumnFull,
  locateCard,
  modelIndexFromVisibleIndex,
  moveCard,
  visibleCards,
} from '../../src/ui/data/kanbanModel';

/**
 * Taşıma kuralları DOM'suz sınanır.
 *
 * Bu kurallar bileşenin içindeyken yalnız jsdom kurup sürükleme ya da klavye
 * kod yolunu taklit ederek sınanabiliyordu; bir WIP reddi ile bir eksik sütun
 * arasındaki fark, iki katman ötesinden bakılıyordu.
 */
function board(): KanbanColumn[] {
  return [
    {
      id: 'todo',
      title: 'Yapılacak',
      cards: [
        { id: 'a', title: 'Alfa', tags: ['acil'] },
        { id: 'b', title: 'Beta', description: 'ikinci kart' },
        { id: 'c', title: 'Gama' },
      ],
    },
    { id: 'doing', title: 'Yapılıyor', wipLimit: 2, cards: [{ id: 'd', title: 'Delta' }] },
    { id: 'done', title: 'Bitti', cards: [] },
  ];
}

describe('kanban modeli', () => {
  it('kartı sütunu ve sırasıyla bulur', () => {
    expect(locateCard(board(), 'b')).toMatchObject({ index: 1 });
    expect(locateCard(board(), 'b')?.column.id).toBe('todo');
    expect(locateCard(board(), 'yok')).toBeNull();
  });

  it('WIP limiti yalnız limit VERİLMİŞSE uygulanır', () => {
    const columns = board();
    expect(isColumnFull(columns[0]), 'limitsiz sütun dolmaz').toBe(false);
    expect(isColumnFull(columns[1]), '1/2 doldurulmamış').toBe(false);
    columns[1].cards.push({ id: 'x', title: 'X' });
    expect(isColumnFull(columns[1]), '2/2 dolu').toBe(true);
  });

  it('AYNI sütun içinde yeniden sıralama WIP limitini uygulamaz', () => {
    /*
     * Kart sayısı değişmediği için limit aşılamaz. Bu ayrımı kaçırmak, dolu bir
     * sütunun içinde kart sırasını değiştirmeyi imkânsız kılardı.
     */
    const columns = board();
    columns[1].cards.push({ id: 'e', title: 'Epsilon' }); // doing artık 2/2 DOLU
    const result = moveCard(columns, 'd', 'doing', 'doing', 1);

    expect(result).toEqual({ moved: true, toIndex: 1 });
    expect(columns[1].cards.map((card) => card.id)).toEqual(['e', 'd']);
  });

  it('FARKLI sütuna taşımada WIP limiti reddeder ve modeli BOZMAZ', () => {
    const columns = board();
    columns[1].cards.push({ id: 'e', title: 'Epsilon' }); // doing 2/2
    const before = columns.map((column) => column.cards.map((card) => card.id));

    expect(moveCard(columns, 'a', 'todo', 'doing', 0)).toEqual({
      moved: false,
      reason: 'wip-limit',
    });
    expect(columns.map((column) => column.cards.map((card) => card.id))).toEqual(before);
  });

  it('eksik sütun ve eksik kart AYRI gerekçelerle reddedilir', () => {
    expect(moveCard(board(), 'a', 'todo', 'yok', 0)).toEqual({
      moved: false,
      reason: 'missing-column',
    });
    expect(moveCard(board(), 'yok', 'todo', 'done', 0)).toEqual({
      moved: false,
      reason: 'missing-card',
    });
  });

  it('hedef index sütun sınırlarına KELEPÇELENİR', () => {
    const columns = board();
    expect(moveCard(columns, 'a', 'todo', 'done', 999)).toEqual({ moved: true, toIndex: 0 });
    expect(columns[2].cards.map((card) => card.id)).toEqual(['a']);
  });

  it('aynı sütunda AŞAĞI taşırken index bir azalır', () => {
    /*
     * Hedef, sürüklenen kart hâlâ dizideyken hesaplanır. Kart çıkarılınca
     * sonraki index'ler kayar; düzeltilmezse kart hedefin bir gerisine düşer.
     */
    expect(adjustIndexForSameColumn(2, 0, true), 'aşağı: düzeltilir').toBe(1);
    expect(adjustIndexForSameColumn(0, 2, true), 'yukarı: düzeltilmez').toBe(0);
    expect(adjustIndexForSameColumn(2, 0, false), 'farklı sütun: düzeltilmez').toBe(2);
  });

  it('arama başlık, açıklama ve etiketleri kapsar', () => {
    const [todo] = board();
    expect(cardMatchesSearch(todo.cards[0], 'acil', 'tr'), 'etiket').toBe(true);
    expect(cardMatchesSearch(todo.cards[1], 'ikinci', 'tr'), 'açıklama').toBe(true);
    expect(cardMatchesSearch(todo.cards[2], 'gama', 'tr'), 'başlık (küçük harf)').toBe(true);
    expect(cardMatchesSearch(todo.cards[2], 'zeta', 'tr')).toBe(false);
    expect(cardMatchesSearch(todo.cards[2], '', 'tr'), 'boş sorgu her kartla eşleşir').toBe(true);
  });

  it('görünür index, filtre etkinken MODEL indexine çevrilir', () => {
    /*
     * Kullanıcı gördüğü sıraya bırakır ama model sırası farklıdır. Çeviri
     * atlanırsa kart, filtrelenmiş bir kartın yerine düşer.
     */
    const [todo] = board();
    expect(visibleCards(todo, 'gama', 'tr').map((card) => card.id)).toEqual(['c']);
    expect(modelIndexFromVisibleIndex(todo, 0, 'gama', 'tr'), 'ilk görünür = model 2').toBe(2);
    expect(modelIndexFromVisibleIndex(todo, 1, 'gama', 'tr'), 'sonun ötesi = dizi sonu').toBe(3);
    expect(modelIndexFromVisibleIndex(todo, 1, '', 'tr'), 'filtresizken birebir').toBe(1);
  });
});
