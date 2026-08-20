import { describe, it, expect } from 'vitest';
import { RingBuffer } from '../../src/collections/RingBuffer';
import { Deck } from '../../src/collections/Deck';
import { SlotContainer } from '../../src/collections/SlotContainer';
import { createRandom } from '../../src/random/random';

describe('RingBuffer', () => {
  it('kapasite pozitif tam sayı olmalı', () => {
    expect(() => new RingBuffer<number>(0)).toThrow(/pozitif tam sayı/);
    expect(() => new RingBuffer<number>(2.5)).toThrow(/pozitif tam sayı/);
  });

  it('kapasiteye kadar biriktirir', () => {
    const buffer = new RingBuffer<number>(3);
    buffer.push(1);
    buffer.push(2);

    expect(buffer.size).toBe(2);
    expect(buffer.isFull).toBe(false);
    expect(buffer.toArray()).toEqual([1, 2]);
  });

  it('dolduğunda EN ESKİSİ düşer ve DÖNDÜRÜLÜR', () => {
    // Düşen öğeyi bilmek, kayan bir toplam tutan çağıran için şart; aksi
    // halde pencereden çıkanı bulmak için tüm tamponu gezmek gerekir.
    const buffer = new RingBuffer<number>(3);
    buffer.push(1);
    buffer.push(2);
    buffer.push(3);

    expect(buffer.push(4)).toBe(1);
    expect(buffer.toArray()).toEqual([2, 3, 4]);
  });

  it('dolmadan önce push undefined döner', () => {
    const buffer = new RingBuffer<number>(2);
    expect(buffer.push(1)).toBeUndefined();
  });

  it('first/last/at doğru öğeyi verir', () => {
    const buffer = new RingBuffer<string>(3);
    ['a', 'b', 'c', 'd'].forEach((v) => buffer.push(v));

    expect(buffer.first).toBe('b');
    expect(buffer.last).toBe('d');
    expect(buffer.at(1)).toBe('c');
    expect(buffer.at(-1)).toBeUndefined();
    expect(buffer.at(99)).toBeUndefined();
  });

  it('sarma sonrası iterasyon ESKİDEN YENİYE sıralıdır', () => {
    const buffer = new RingBuffer<number>(3);
    for (let i = 1; i <= 7; i++) buffer.push(i);

    expect([...buffer]).toEqual([5, 6, 7]);
  });

  it('clear tamponu boşaltır', () => {
    const buffer = new RingBuffer<number>(3);
    buffer.push(1);
    buffer.clear();

    expect(buffer.size).toBe(0);
    expect(buffer.toArray()).toEqual([]);
    expect(buffer.push(9)).toBeUndefined();
  });

  it('kapasite 1 ile her push öncekini düşürür', () => {
    const buffer = new RingBuffer<number>(1);
    buffer.push(1);
    expect(buffer.push(2)).toBe(1);
    expect(buffer.toArray()).toEqual([2]);
  });
});

describe('Deck', () => {
  const cards = ['a', 'b', 'c', 'd', 'e'];

  it('tüm kartları TEKRARSIZ dağıtır', () => {
    const deck = new Deck(cards, createRandom(1));
    const drawn = deck.drawMany(5);

    expect(drawn).toHaveLength(5);
    expect(new Set(drawn)).toEqual(new Set(cards));
  });

  it('aynı tohum aynı sırayı verir (deterministik)', () => {
    const run = (): string[] => new Deck(cards, createRandom(42)).drawMany(5);
    expect(run()).toEqual(run());
  });

  it('farklı tohum farklı sıra verir', () => {
    const a = new Deck(cards, createRandom(1)).drawMany(5);
    const b = new Deck(cards, createRandom(2)).drawMany(5);
    expect(a).not.toEqual(b);
  });

  it('tükenince iskarta karılıp yeniden kullanılır', () => {
    const deck = new Deck(['x'], createRandom(1));
    const first = deck.draw();
    expect(deck.draw()).toBeUndefined();

    deck.discard(first!);
    expect(deck.draw()).toBe('x');
  });

  it('reshuffleFromDiscard:false ise tükenen deste undefined döner', () => {
    const deck = new Deck(['x'], createRandom(1), { reshuffleFromDiscard: false });
    deck.discard(deck.draw()!);

    expect(deck.draw()).toBeUndefined();
  });

  it('drawMany yeterli kart yoksa olabildiğince çok döner', () => {
    const deck = new Deck(['x', 'y'], createRandom(1), { reshuffleFromDiscard: false });
    expect(deck.drawMany(10)).toHaveLength(2);
    expect(deck.drawMany(0)).toEqual([]);
    expect(deck.drawMany(-5)).toEqual([]);
  });

  it('putOnTop bir sonraki çekişte gelir', () => {
    const deck = new Deck(cards, createRandom(1));
    deck.putOnTop('ÖZEL');
    expect(deck.draw()).toBe('ÖZEL');
  });

  it('putOnBottom en sonda gelir', () => {
    const deck = new Deck(['a', 'b'], createRandom(1));
    deck.putOnBottom('SON');
    expect(deck.drawMany(3).at(-1)).toBe('SON');
  });

  it('peek çekmeden bakar', () => {
    const deck = new Deck(cards, createRandom(3));
    const peeked = deck.peek();
    expect(deck.remaining).toBe(5);
    expect(deck.draw()).toBe(peeked);
  });

  it('reset iskartayı geri katıp yeniden karar', () => {
    const deck = new Deck(cards, createRandom(1));
    deck.drawMany(3).forEach((c) => deck.discard(c));
    expect(deck.discarded).toBe(3);

    deck.reset();
    expect(deck.remaining).toBe(5);
    expect(deck.discarded).toBe(0);
  });

  it('boş deste sorunsuz kurulur', () => {
    const deck = new Deck<string>([], createRandom(1));
    expect(deck.draw()).toBeUndefined();
    expect(deck.remaining).toBe(0);
  });

  it('karma DAĞILIMI düzgündür (sort hilesi değil)', () => {
    // `sort(() => rnd - 0.5)` yaygın ama yanlıştır: dağılım düzgün olmaz.
    const counts = new Map<string, number>();
    const random = createRandom(7);
    for (let i = 0; i < 3000; i++) {
      const top = new Deck(cards, random).draw()!;
      counts.set(top, (counts.get(top) ?? 0) + 1);
    }

    for (const card of cards) {
      const share = (counts.get(card) ?? 0) / 3000;
      expect(share).toBeGreaterThan(0.15); // beklenen 0.2
      expect(share).toBeLessThan(0.25);
    }
  });
});

describe('SlotContainer', () => {
  it('boyut pozitif tam sayı olmalı', () => {
    expect(() => new SlotContainer<string>({ size: 0 })).toThrow(/pozitif tam sayı/);
  });

  it('varsayılan olarak YIĞINLAMA KAPALIDIR', () => {
    // Yığınlanamayan bir öğeyi üst üste bindirmek sessizce kopya üretirdi.
    const bag = new SlotContainer<string>({ size: 3 });
    expect(bag.add('kılıç', 3)).toBe(0);

    expect(bag.usedSlots).toBe(3);
    expect(bag.get(0)).toEqual({ item: 'kılıç', count: 1 });
  });

  it('maxStack ile yığınlar', () => {
    const bag = new SlotContainer<string>({ size: 3, maxStack: () => 10 });
    expect(bag.add('taş', 25)).toBe(0);

    expect(bag.usedSlots).toBe(3);
    expect(bag.countOf('taş')).toBe(25);
  });

  it('add KISMİ ekleme yapar ve sığmayanı döner', () => {
    // "Hiçbiri sığmadı" demek, 60'ını alabilecek oyuncuya hiçbirini
    // vermemek olurdu.
    const bag = new SlotContainer<string>({ size: 1, maxStack: () => 10 });
    expect(bag.add('taş', 25)).toBe(15);
    expect(bag.countOf('taş')).toBe(10);
  });

  it('add önce MEVCUT yığını doldurur, sonra yeni slot açar', () => {
    const bag = new SlotContainer<string>({ size: 3, maxStack: () => 10 });
    bag.add('taş', 5);
    bag.add('taş', 3);

    expect(bag.usedSlots).toBe(1);
    expect(bag.get(0)).toEqual({ item: 'taş', count: 8 });
  });

  it('sıfır/negatif adet eklemek etkisizdir', () => {
    const bag = new SlotContainer<string>({ size: 2 });
    expect(bag.add('x', 0)).toBe(0);
    expect(bag.add('x', -3)).toBe(0);
    expect(bag.usedSlots).toBe(0);
  });

  it('remove kısmen çıkarır ve boşalan slotu temizler', () => {
    const bag = new SlotContainer<string>({ size: 3, maxStack: () => 10 });
    bag.add('taş', 15);

    expect(bag.remove('taş', 12)).toBe(12); // çıkarılan adet
    expect(bag.countOf('taş')).toBe(3); // kalan
    expect(bag.usedSlots).toBe(1);
  });

  it('remove olmayan öğede 0 döner', () => {
    const bag = new SlotContainer<string>({ size: 2 });
    expect(bag.remove('yok', 5)).toBe(0);
  });

  it('swap iki slotu takas eder', () => {
    const bag = new SlotContainer<string>({ size: 2 });
    bag.add('a');
    bag.add('b');

    expect(bag.swap(0, 1)).toBe(true);
    expect(bag.get(0)?.item).toBe('b');
    expect(bag.get(1)?.item).toBe('a');
  });

  it('AYNI yığınlanabilir öğede swap TAKAS değil BİRLEŞTİRME yapar', () => {
    // İki yarım yığını üst üste bırakmak, kullanıcı beklentisiyle toplamaktır.
    const bag = new SlotContainer<string>({ size: 2, maxStack: () => 10 });
    bag.add('taş', 3);
    bag.get(0);
    bag.swap(0, 1); // boşa taşı
    bag.add('taş', 4);

    bag.swap(1, 0);
    expect(bag.usedSlots).toBe(1);
    expect(bag.countOf('taş')).toBe(7);
  });

  it('yığın dolu ise swap gerçekten takas eder', () => {
    const bag = new SlotContainer<string>({ size: 2, maxStack: () => 2 });
    bag.add('taş', 4); // iki slot dolu (2+2)

    expect(bag.swap(0, 1)).toBe(true);
    expect(bag.countOf('taş')).toBe(4);
  });

  it('geçersiz indekste swap false döner', () => {
    const bag = new SlotContainer<string>({ size: 2 });
    expect(bag.swap(0, 9)).toBe(false);
    expect(bag.swap(-1, 0)).toBe(false);
  });

  it('isSameItem ile özel eşitlik kullanılır', () => {
    interface Item {
      id: string;
    }
    const bag = new SlotContainer<Item>({
      size: 2,
      isSameItem: (a, b) => a.id === b.id,
      maxStack: () => 10,
    });

    bag.add({ id: 'taş' }, 3);
    bag.add({ id: 'taş' }, 2); // farklı nesne, aynı id

    expect(bag.usedSlots).toBe(1);
    expect(bag.countOf({ id: 'taş' })).toBe(5);
  });

  it('get ve entries KOPYA döner (dışarıdan mutasyon sızmaz)', () => {
    const bag = new SlotContainer<string>({ size: 2, maxStack: () => 10 });
    bag.add('taş', 5);

    const slot = bag.get(0)!;
    slot.count = 999;
    expect(bag.countOf('taş')).toBe(5);

    const entries = bag.entries();
    entries[0].slot.count = 999;
    expect(bag.countOf('taş')).toBe(5);
  });

  it('clearSlot içeriği döner ve slotu boşaltır', () => {
    const bag = new SlotContainer<string>({ size: 2 });
    bag.add('a');

    expect(bag.clearSlot(0)).toEqual({ item: 'a', count: 1 });
    expect(bag.usedSlots).toBe(0);
    expect(bag.clearSlot(0)).toBeNull();
  });

  it('isFull ve clear', () => {
    const bag = new SlotContainer<string>({ size: 2 });
    bag.add('a');
    bag.add('b');
    expect(bag.isFull).toBe(true);

    bag.clear();
    expect(bag.usedSlots).toBe(0);
  });
});
