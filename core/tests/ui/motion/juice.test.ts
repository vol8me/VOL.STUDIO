import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  JUICE_FLASH_LIMIT,
  JUICE_KINDS,
  JUICE_SEQUENCE,
  playJuice,
  playJuiceSequence,
} from '../../../src/ui/motion/juice';

describe('playJuice', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    // Belge başına bütçe testler arasında paylaşılır: bekleyen zamanlayıcılar boşaltılmadan bırakılan hak sızar.
    vi.runAllTimers();
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  const make = (): HTMLElement => {
    const element = document.createElement('div');
    document.body.append(element);
    return element;
  };

  it('her tür kendi sınıfını ekler ve emniyet payı sonunda kaldırır', () => {
    for (const kind of JUICE_KINDS) {
      const element = make();
      playJuice(element, kind);
      expect(element.classList.contains(`vol-juice--${kind}`), kind).toBe(true);
      vi.advanceTimersByTime(1000);
      expect(element.classList.contains(`vol-juice--${kind}`), kind).toBe(false);
    }
  });

  it('animasyon bitince sınıf hemen kalkar; alt elemanın bitişi etkiyi bitirmez', () => {
    const element = make();
    const child = document.createElement('span');
    element.append(child);
    playJuice(element, 'pop');
    child.dispatchEvent(new Event('animationend', { bubbles: true }));
    expect(element.classList.contains('vol-juice--pop')).toBe(true);
    element.dispatchEvent(new Event('animationend'));
    expect(element.classList.contains('vol-juice--pop')).toBe(false);
  });

  it('yeni etki öncekini değiştirir; aynı etki yeniden başlar ve eski zamanlayıcı yenisini kesmez', () => {
    const element = make();
    playJuice(element, 'pop');
    playJuice(element, 'flash');
    expect(element.classList.contains('vol-juice--pop')).toBe(false);
    expect(element.classList.contains('vol-juice--flash')).toBe(true);
    vi.advanceTimersByTime(100);
    playJuice(element, 'flash');
    vi.advanceTimersByTime(150);
    // İlk çağrının zamanlayıcısı (140+100 ms) dolsa da ikinci etki hâlâ sürer.
    expect(element.classList.contains('vol-juice--flash')).toBe(true);
    vi.advanceTimersByTime(500);
    expect(element.classList.contains('vol-juice--flash')).toBe(false);
  });
});

describe('juice bütçesi ve flaş sınırı', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    // Belge başına bütçe testler arasında paylaşılır: bekleyen zamanlayıcılar boşaltılmadan bırakılan hak sızar.
    vi.runAllTimers();
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  const make = (area = [10, 10]): HTMLElement => {
    const element = document.createElement('div');
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
      width: area[0],
      height: area[1],
    } as DOMRect);
    document.body.append(element);
    return element;
  };
  const playing = (element: HTMLElement): boolean =>
    JUICE_KINDS.some((kind) => element.classList.contains(`vol-juice--${kind}`));

  it('aynı anda en çok üç grup oynar; dördüncüsü bütçe dolu olduğundan oynamaz', () => {
    const elements = Array.from({ length: 4 }, () => make());
    for (const element of elements) playJuice(element, 'shake');
    expect(elements.map(playing)).toEqual([true, true, true, false]);
    vi.advanceTimersByTime(1000);
    playJuice(elements[3], 'shake');
    expect(playing(elements[3])).toBe(true);
  });

  it('bütçe doluyken kullanıcı eylemi dekoru keser, dekor kullanıcıyı kesemez', () => {
    const decor = [make(), make(), make()];
    for (const element of decor) playJuice(element, 'enter');
    const user = make();
    playJuice(user, 'shake');
    expect(playing(user)).toBe(true);
    expect(decor.filter(playing)).toHaveLength(2);

    const late = make();
    playJuice(late, 'enter');
    expect(playing(late)).toBe(false);
  });

  it('bırakılan grup hakkı hemen geri döner (etki bitince ya da yeniden başlayınca)', () => {
    const [a, b, c, d] = [make(), make(), make(), make()];
    for (const element of [a, b, c]) playJuice(element, 'shake');
    a.dispatchEvent(new Event('animationend'));
    playJuice(d, 'shake');
    expect(playing(d)).toBe(true);
    // Aynı öğede yeniden başlatma hak ÇOĞALTMAZ: üç öğe hâlâ üç hak kullanır.
    playJuice(b, 'shake');
    playJuice(b, 'shake');
    expect(playing(b)).toBe(true);
    expect([c, d].every(playing)).toBe(true);
  });

  it('flaş saniyede en çok üç kez başlar; saniye dolunca yeniden izin verilir', () => {
    const elements = Array.from({ length: 5 }, () => make());
    const flashed: boolean[] = [];
    for (const element of elements) {
      playJuice(element, 'flash');
      flashed.push(element.classList.contains('vol-juice--flash'));
      vi.advanceTimersByTime(200);
    }
    expect(flashed).toEqual([true, true, true, false, false]);
    vi.advanceTimersByTime(1000);
    playJuice(elements[0], 'flash');
    expect(elements[0].classList.contains('vol-juice--flash')).toBe(true);
  });

  it('reddedilen flaş sarsıntı ve patlama haklarını tüketmez', () => {
    const target = make();
    for (let i = 0; i < 6; i++) {
      playJuice(target, 'flash');
      vi.advanceTimersByTime(50);
    }
    playJuice(target, 'shake');
    expect(target.classList.contains('vol-juice--shake')).toBe(true);
  });

  it('341×256 CSS px alanı aşan öğede flaş uygulanmaz, diğer etkiler uygulanır', () => {
    const big = make([JUICE_FLASH_LIMIT.maxAreaPx / 100 + 1, 100]);
    playJuice(big, 'flash');
    expect(big.classList.contains('vol-juice--flash')).toBe(false);
    playJuice(big, 'pop');
    expect(big.classList.contains('vol-juice--pop')).toBe(true);
    const edge = make([341, 256]);
    playJuice(edge, 'flash');
    expect(edge.classList.contains('vol-juice--flash')).toBe(true);
  });
});

describe('playJuiceSequence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    // Belge başına bütçe testler arasında paylaşılır: bekleyen zamanlayıcılar boşaltılmadan bırakılan hak sızar.
    vi.runAllTimers();
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  const parts = (count: number): HTMLElement[] =>
    Array.from({ length: count }, () => {
      const element = document.createElement('div');
      document.body.append(element);
      return element;
    });

  it('öğeler basamak başına 40 ms gecikmeyle girer; temizlikte gecikme kalkar', () => {
    const items = parts(3);
    playJuiceSequence(items, 'enter');
    expect(items.map((item) => item.style.animationDelay)).toEqual(['', '40ms', '80ms']);
    expect(items.every((item) => item.classList.contains('vol-juice--enter'))).toBe(true);
    vi.advanceTimersByTime(2000);
    expect(items.some((item) => item.classList.contains('vol-juice--enter'))).toBe(false);
    expect(items.map((item) => item.style.animationDelay)).toEqual(['', '', '']);
  });

  it('gecikme en çok altı basamakta durur: uzun dizi toplam beklemeyi büyütmez', () => {
    const items = parts(12);
    playJuiceSequence(items, 'enter');
    expect(items[11].style.animationDelay).toBe(`${JUICE_SEQUENCE.maxSteps * 40}ms`);
    expect(items[6].style.animationDelay).toBe(`${JUICE_SEQUENCE.maxSteps * 40}ms`);
  });

  it('bütün dizi tek grup hakkı kullanır: dizi bütçeyi doldurmaz', () => {
    const items = parts(10);
    playJuiceSequence(items, 'enter');
    const other = parts(1)[0];
    playJuice(other, 'shake');
    expect(other.classList.contains('vol-juice--shake')).toBe(true);
    // Tüm öğeler bitmeden hak dönmez: iki grup daha sığar, dördüncü dekor olmadığı için kullanıcı eylemi keser.
    expect(items.every((item) => item.classList.contains('vol-juice--enter'))).toBe(true);
  });

  it('boş dizi hiçbir şey yapmaz; hak alınmaz', () => {
    expect(() => playJuiceSequence([], 'enter')).not.toThrow();
    const items = parts(3);
    for (const item of items) playJuice(item, 'shake');
    expect(items.every((item) => item.classList.contains('vol-juice--shake'))).toBe(true);
  });
});
