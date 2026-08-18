import { describe, it, expect } from 'vitest';
import { StatBlock } from '../../src/stats/StatBlock';

/**
 * Testin KENDİ stat sözlüğü — VOL.HELL'in kümesinden (`damage`/`speed`/
 * `health`/`fireRate`) BİLİNÇLİ olarak farklı seçildi.
 *
 * `StatBlock` hiçbir stat adı bilmez. Motoru oyunun sözlüğüyle test etmek bu
 * bağımsızlığı kanıtlamaz; tersine, motora sızmış gizli bir varsayımı
 * gizleyebilir. Yabancı bir sözlükle geçen testler mekanizmanın gerçekten
 * ada duyarsız olduğunu gösterir.
 *
 * `recovery`, ters bir stat'ı temsil eder (bekleme süresi; düşük değer = daha
 * sık aksiyon) — VOL.HELL'deki `fireRate`'in oynadığı rol.
 */
type TestStat = 'attack' | 'agility' | 'vitality' | 'recovery';

const TEST_STAT_KEYS: readonly TestStat[] = ['attack', 'agility', 'vitality', 'recovery'];

type TestBaseStats = Record<TestStat, number>;

function makeBase(overrides: Partial<TestBaseStats> = {}): TestBaseStats {
  return { attack: 10, agility: 100, vitality: 50, recovery: 200, ...overrides };
}

describe('StatBlock', () => {
  it('modifier yokken taban değeri döner', () => {
    const stats = new StatBlock(makeBase());
    for (const key of TEST_STAT_KEYS) {
      expect(stats.getValue(key)).toBe(stats.getBase(key));
    }
  });

  it('constructor taban objesini kopyalar — dışarıdaki mutasyon sızmaz', () => {
    const base = makeBase();
    const stats = new StatBlock(base);
    base.attack = 999;
    expect(stats.getValue('attack')).toBe(10);
  });

  it('add modifier taban değere eklenir', () => {
    const stats = new StatBlock(makeBase());
    stats.addModifier({ id: 'kart:sert-uç', stat: 'attack', type: 'add', value: 5 });
    expect(stats.getValue('attack')).toBe(15);
  });

  it('multiply modifier taban değerle çarpılır', () => {
    const stats = new StatBlock(makeBase());
    stats.addModifier({ id: 'kart:öfke', stat: 'attack', type: 'multiply', value: 1.3 });
    expect(stats.getValue('attack')).toBeCloseTo(13, 10);
  });

  it('önce tüm add, sonra tüm multiply uygulanır (ekleme sırasından bağımsız)', () => {
    const multiplyFirst = new StatBlock(makeBase());
    multiplyFirst.addModifier({ id: 'çarp', stat: 'attack', type: 'multiply', value: 2 });
    multiplyFirst.addModifier({ id: 'ekle', stat: 'attack', type: 'add', value: 10 });

    const addFirst = new StatBlock(makeBase());
    addFirst.addModifier({ id: 'ekle', stat: 'attack', type: 'add', value: 10 });
    addFirst.addModifier({ id: 'çarp', stat: 'attack', type: 'multiply', value: 2 });

    // (10 + 10) * 2 — çarpan hiçbir zaman yalnız tabana uygulanmaz
    expect(multiplyFirst.getValue('attack')).toBe(40);
    expect(addFirst.getValue('attack')).toBe(40);
  });

  it('birden fazla multiply birbiriyle çarpılır', () => {
    const stats = new StatBlock(makeBase());
    stats.addModifier({ id: 'a', stat: 'agility', type: 'multiply', value: 1.5 });
    stats.addModifier({ id: 'b', stat: 'agility', type: 'multiply', value: 2 });
    expect(stats.getValue('agility')).toBe(300);
  });

  it('modifier yalnızca kendi statını etkiler', () => {
    const stats = new StatBlock(makeBase());
    stats.addModifier({ id: 'a', stat: 'agility', type: 'add', value: 100 });
    expect(stats.getValue('agility')).toBe(200);
    expect(stats.getValue('attack')).toBe(10);
    expect(stats.getValue('vitality')).toBe(50);
  });

  it('koşullu modifier condition false iken devre dışı kalır', () => {
    const stats = new StatBlock(makeBase());
    let towerActive = false;
    stats.addModifier({
      id: 'kule-bedeli',
      stat: 'agility',
      type: 'multiply',
      value: 0.9,
      condition: () => towerActive,
    });

    expect(stats.getValue('agility')).toBe(100);
    towerActive = true;
    expect(stats.getValue('agility')).toBeCloseTo(90, 10);
    towerActive = false;
    expect(stats.getValue('agility')).toBe(100);
  });

  it('koşulsuz modifier kalıcıdır — her okumada uygulanır', () => {
    const stats = new StatBlock(makeBase());
    stats.addModifier({ id: 'kalıcı', stat: 'vitality', type: 'add', value: 25 });
    expect(stats.getValue('vitality')).toBe(75);
    expect(stats.getValue('vitality')).toBe(75);
  });

  it('fonksiyon değerli modifier her okumada yeniden hesaplanır', () => {
    const stats = new StatBlock(makeBase());
    let scale = 1;
    stats.addModifier({
      id: 'difficulty',
      stat: 'vitality',
      type: 'multiply',
      value: () => scale,
    });

    expect(stats.getValue('vitality')).toBe(50);
    scale = 2.5;
    expect(stats.getValue('vitality')).toBe(125);
  });

  it('removeModifier modifier’ı kaldırır ve değeri tabana döndürür', () => {
    const stats = new StatBlock(makeBase());
    stats.addModifier({ id: 'geçici', stat: 'attack', type: 'add', value: 40 });
    expect(stats.getValue('attack')).toBe(50);

    expect(stats.removeModifier('geçici')).toBe(1);
    expect(stats.getValue('attack')).toBe(10);
    expect(stats.hasModifier('geçici')).toBe(false);
  });

  it('removeModifier aynı kimliğin tüm statlardaki modifier’larını kaldırır', () => {
    const stats = new StatBlock(makeBase());
    stats.addModifier({ id: 'takas', stat: 'attack', type: 'multiply', value: 1.4 });
    stats.addModifier({ id: 'takas', stat: 'agility', type: 'multiply', value: 0.8 });

    expect(stats.removeModifier('takas')).toBe(2);
    expect(stats.getValue('attack')).toBe(10);
    expect(stats.getValue('agility')).toBe(100);
  });

  it('removeModifier bilinmeyen kimlikte 0 döner ve değerleri bozmaz', () => {
    const stats = new StatBlock(makeBase());
    stats.addModifier({ id: 'a', stat: 'attack', type: 'add', value: 5 });
    expect(stats.removeModifier('yok')).toBe(0);
    expect(stats.getValue('attack')).toBe(15);
  });

  it('aynı id + stat ikinci kez eklenirse üzerine yazar (yığılma olmaz)', () => {
    const stats = new StatBlock(makeBase());
    stats.addModifier({ id: 'difficulty', stat: 'agility', type: 'multiply', value: 1.2 });
    stats.addModifier({ id: 'difficulty', stat: 'agility', type: 'multiply', value: 1.5 });

    expect(stats.getModifiers().length).toBe(1);
    expect(stats.getValue('agility')).toBe(150);
  });

  it('aynı id farklı statlarda ayrı ayrı yaşar', () => {
    const stats = new StatBlock(makeBase());
    stats.addModifier({ id: 'takas', stat: 'attack', type: 'add', value: 5 });
    stats.addModifier({ id: 'takas', stat: 'agility', type: 'add', value: -20 });

    expect(stats.getModifiers().length).toBe(2);
    expect(stats.getValue('attack')).toBe(15);
    expect(stats.getValue('agility')).toBe(80);
  });

  it('setBase taban değeri değiştirir, modifier’lar korunur', () => {
    const stats = new StatBlock(makeBase());
    stats.addModifier({ id: 'a', stat: 'vitality', type: 'multiply', value: 2 });
    stats.setBase('vitality', 80);
    expect(stats.getBase('vitality')).toBe(80);
    expect(stats.getValue('vitality')).toBe(160);
  });

  it('clearModifiers hepsini siler, taban değerler kalır', () => {
    const stats = new StatBlock(makeBase());
    stats.addModifier({ id: 'a', stat: 'attack', type: 'add', value: 5 });
    stats.addModifier({ id: 'b', stat: 'agility', type: 'multiply', value: 2 });
    stats.clearModifiers();

    expect(stats.getModifiers().length).toBe(0);
    expect(stats.getValue('attack')).toBe(10);
    expect(stats.getValue('agility')).toBe(100);
  });

  it('ters stat (cooldown) semantiği: multiply < 1 değeri düşürür', () => {
    const stats = new StatBlock(makeBase({ recovery: 200 }));
    stats.addModifier({ id: 'kart:tetik', stat: 'recovery', type: 'multiply', value: 0.8 });
    expect(stats.getValue('recovery')).toBeLessThan(stats.getBase('recovery'));
    expect(stats.getValue('recovery')).toBeCloseTo(160, 10);
  });

  it('snapshot dört statın anlık sonucunu verir', () => {
    const stats = new StatBlock(makeBase());
    stats.addModifier({ id: 'a', stat: 'attack', type: 'add', value: 2 });
    expect(stats.snapshot()).toEqual({ attack: 12, agility: 100, vitality: 50, recovery: 200 });
  });

  it('condition icerisinde aynı stat icin getValue cagrısı sonsuz döngü yapmaz', () => {
    const stats = new StatBlock(makeBase());
    stats.addModifier({
      id: 'ozyineleme',
      stat: 'attack',
      type: 'add',
      value: 5,
      condition: () => stats.getValue('attack') > 0,
    });

    // Döngüsel çağrı taban değer döndürdüğü için condition true kalır; taban 10 > 0.
    expect(stats.getValue('attack')).toBe(15);
  });

  it('condition farklı statlardan döngü oluştursa sonsuz döngü yapmaz', () => {
    const stats = new StatBlock(makeBase());
    stats.addModifier({
      id: 'döngü-a',
      stat: 'attack',
      type: 'add',
      value: 5,
      condition: () => stats.getValue('agility') > 0,
    });
    stats.addModifier({
      id: 'döngü-b',
      stat: 'agility',
      type: 'add',
      value: 0,
      condition: () => stats.getValue('attack') > 0,
    });

    // attack -> agility -> attack çevriminde agility hesaplanırken attack taban alınır.
    expect(stats.getValue('agility')).toBe(100);
    expect(stats.getValue('attack')).toBe(15);
  });
});
