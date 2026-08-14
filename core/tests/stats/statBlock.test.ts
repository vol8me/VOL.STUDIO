import { describe, it, expect } from 'vitest';
import { StatBlock, STAT_KEYS, type StatBaseValues } from '../../src/stats/StatBlock';

function makeBase(overrides: Partial<StatBaseValues> = {}): StatBaseValues {
  return { damage: 10, speed: 100, health: 50, fireRate: 200, ...overrides };
}

describe('StatBlock', () => {
  it('modifier yokken taban değeri döner', () => {
    const stats = new StatBlock(makeBase());
    for (const key of STAT_KEYS) {
      expect(stats.getValue(key)).toBe(stats.getBase(key));
    }
  });

  it('constructor taban objesini kopyalar — dışarıdaki mutasyon sızmaz', () => {
    const base = makeBase();
    const stats = new StatBlock(base);
    base.damage = 999;
    expect(stats.getValue('damage')).toBe(10);
  });

  it('add modifier taban değere eklenir', () => {
    const stats = new StatBlock(makeBase());
    stats.addModifier({ id: 'kart:sert-uç', stat: 'damage', type: 'add', value: 5 });
    expect(stats.getValue('damage')).toBe(15);
  });

  it('multiply modifier taban değerle çarpılır', () => {
    const stats = new StatBlock(makeBase());
    stats.addModifier({ id: 'kart:öfke', stat: 'damage', type: 'multiply', value: 1.3 });
    expect(stats.getValue('damage')).toBeCloseTo(13, 10);
  });

  it('önce tüm add, sonra tüm multiply uygulanır (ekleme sırasından bağımsız)', () => {
    const multiplyFirst = new StatBlock(makeBase());
    multiplyFirst.addModifier({ id: 'çarp', stat: 'damage', type: 'multiply', value: 2 });
    multiplyFirst.addModifier({ id: 'ekle', stat: 'damage', type: 'add', value: 10 });

    const addFirst = new StatBlock(makeBase());
    addFirst.addModifier({ id: 'ekle', stat: 'damage', type: 'add', value: 10 });
    addFirst.addModifier({ id: 'çarp', stat: 'damage', type: 'multiply', value: 2 });

    // (10 + 10) * 2 — çarpan hiçbir zaman yalnız tabana uygulanmaz
    expect(multiplyFirst.getValue('damage')).toBe(40);
    expect(addFirst.getValue('damage')).toBe(40);
  });

  it('birden fazla multiply birbiriyle çarpılır', () => {
    const stats = new StatBlock(makeBase());
    stats.addModifier({ id: 'a', stat: 'speed', type: 'multiply', value: 1.5 });
    stats.addModifier({ id: 'b', stat: 'speed', type: 'multiply', value: 2 });
    expect(stats.getValue('speed')).toBe(300);
  });

  it('modifier yalnızca kendi statını etkiler', () => {
    const stats = new StatBlock(makeBase());
    stats.addModifier({ id: 'a', stat: 'speed', type: 'add', value: 100 });
    expect(stats.getValue('speed')).toBe(200);
    expect(stats.getValue('damage')).toBe(10);
    expect(stats.getValue('health')).toBe(50);
  });

  it('koşullu modifier condition false iken devre dışı kalır', () => {
    const stats = new StatBlock(makeBase());
    let towerActive = false;
    stats.addModifier({
      id: 'kule-bedeli',
      stat: 'speed',
      type: 'multiply',
      value: 0.9,
      condition: () => towerActive,
    });

    expect(stats.getValue('speed')).toBe(100);
    towerActive = true;
    expect(stats.getValue('speed')).toBeCloseTo(90, 10);
    towerActive = false;
    expect(stats.getValue('speed')).toBe(100);
  });

  it('koşulsuz modifier kalıcıdır — her okumada uygulanır', () => {
    const stats = new StatBlock(makeBase());
    stats.addModifier({ id: 'kalıcı', stat: 'health', type: 'add', value: 25 });
    expect(stats.getValue('health')).toBe(75);
    expect(stats.getValue('health')).toBe(75);
  });

  it('fonksiyon değerli modifier her okumada yeniden hesaplanır', () => {
    const stats = new StatBlock(makeBase());
    let scale = 1;
    stats.addModifier({
      id: 'difficulty',
      stat: 'health',
      type: 'multiply',
      value: () => scale,
    });

    expect(stats.getValue('health')).toBe(50);
    scale = 2.5;
    expect(stats.getValue('health')).toBe(125);
  });

  it('removeModifier modifier’ı kaldırır ve değeri tabana döndürür', () => {
    const stats = new StatBlock(makeBase());
    stats.addModifier({ id: 'geçici', stat: 'damage', type: 'add', value: 40 });
    expect(stats.getValue('damage')).toBe(50);

    expect(stats.removeModifier('geçici')).toBe(1);
    expect(stats.getValue('damage')).toBe(10);
    expect(stats.hasModifier('geçici')).toBe(false);
  });

  it('removeModifier aynı kimliğin tüm statlardaki modifier’larını kaldırır', () => {
    const stats = new StatBlock(makeBase());
    stats.addModifier({ id: 'takas', stat: 'damage', type: 'multiply', value: 1.4 });
    stats.addModifier({ id: 'takas', stat: 'speed', type: 'multiply', value: 0.8 });

    expect(stats.removeModifier('takas')).toBe(2);
    expect(stats.getValue('damage')).toBe(10);
    expect(stats.getValue('speed')).toBe(100);
  });

  it('removeModifier bilinmeyen kimlikte 0 döner ve değerleri bozmaz', () => {
    const stats = new StatBlock(makeBase());
    stats.addModifier({ id: 'a', stat: 'damage', type: 'add', value: 5 });
    expect(stats.removeModifier('yok')).toBe(0);
    expect(stats.getValue('damage')).toBe(15);
  });

  it('aynı id + stat ikinci kez eklenirse üzerine yazar (yığılma olmaz)', () => {
    const stats = new StatBlock(makeBase());
    stats.addModifier({ id: 'difficulty', stat: 'speed', type: 'multiply', value: 1.2 });
    stats.addModifier({ id: 'difficulty', stat: 'speed', type: 'multiply', value: 1.5 });

    expect(stats.getModifiers().length).toBe(1);
    expect(stats.getValue('speed')).toBe(150);
  });

  it('aynı id farklı statlarda ayrı ayrı yaşar', () => {
    const stats = new StatBlock(makeBase());
    stats.addModifier({ id: 'takas', stat: 'damage', type: 'add', value: 5 });
    stats.addModifier({ id: 'takas', stat: 'speed', type: 'add', value: -20 });

    expect(stats.getModifiers().length).toBe(2);
    expect(stats.getValue('damage')).toBe(15);
    expect(stats.getValue('speed')).toBe(80);
  });

  it('setBase taban değeri değiştirir, modifier’lar korunur', () => {
    const stats = new StatBlock(makeBase());
    stats.addModifier({ id: 'a', stat: 'health', type: 'multiply', value: 2 });
    stats.setBase('health', 80);
    expect(stats.getBase('health')).toBe(80);
    expect(stats.getValue('health')).toBe(160);
  });

  it('clearModifiers hepsini siler, taban değerler kalır', () => {
    const stats = new StatBlock(makeBase());
    stats.addModifier({ id: 'a', stat: 'damage', type: 'add', value: 5 });
    stats.addModifier({ id: 'b', stat: 'speed', type: 'multiply', value: 2 });
    stats.clearModifiers();

    expect(stats.getModifiers().length).toBe(0);
    expect(stats.getValue('damage')).toBe(10);
    expect(stats.getValue('speed')).toBe(100);
  });

  it('fireRate cooldown semantiği: multiply < 1 saldırıyı hızlandırır', () => {
    const stats = new StatBlock(makeBase({ fireRate: 200 }));
    stats.addModifier({ id: 'kart:tetik', stat: 'fireRate', type: 'multiply', value: 0.8 });
    expect(stats.getValue('fireRate')).toBeLessThan(stats.getBase('fireRate'));
    expect(stats.getValue('fireRate')).toBeCloseTo(160, 10);
  });

  it('snapshot dört statın anlık sonucunu verir', () => {
    const stats = new StatBlock(makeBase());
    stats.addModifier({ id: 'a', stat: 'damage', type: 'add', value: 2 });
    expect(stats.snapshot()).toEqual({ damage: 12, speed: 100, health: 50, fireRate: 200 });
  });

  it('condition icerisinde aynı stat icin getValue cagrısı sonsuz döngü yapmaz', () => {
    const stats = new StatBlock(makeBase());
    stats.addModifier({
      id: 'ozyineleme',
      stat: 'damage',
      type: 'add',
      value: 5,
      condition: () => stats.getValue('damage') > 0,
    });

    // Döngüsel çağrı taban değer döndürdüğü için condition true kalır; taban 10 > 0.
    expect(stats.getValue('damage')).toBe(15);
  });

  it('condition farklı statlardan döngü oluştursa sonsuz döngü yapmaz', () => {
    const stats = new StatBlock(makeBase());
    stats.addModifier({
      id: 'döngü-a',
      stat: 'damage',
      type: 'add',
      value: 5,
      condition: () => stats.getValue('speed') > 0,
    });
    stats.addModifier({
      id: 'döngü-b',
      stat: 'speed',
      type: 'add',
      value: 0,
      condition: () => stats.getValue('damage') > 0,
    });

    // damage -> speed -> damage çevriminde speed hesaplanırken damage taban alınır.
    expect(stats.getValue('speed')).toBe(100);
    expect(stats.getValue('damage')).toBe(15);
  });
});
