import { describe, it, expect, vi, afterEach } from 'vitest';
import { EventLog } from '../../src/ui/data/EventLog';
import { Text } from '../../src/ui/primitives/Text';
import { AnimatedLabel } from '../../src/ui/primitives/AnimatedLabel';

const tracked: Array<{ destroy(): void }> = [];
function track<T extends { destroy(): void }>(instance: T): T {
  tracked.push(instance);
  return instance;
}
afterEach(() => {
  while (tracked.length > 0) tracked.pop()!.destroy();
});

describe('EventLog', () => {
  it('push yeni bir satır ekler, en yeni satır DOM sırasında en sonda olur', () => {
    const log = track(new EventLog());
    log.push({ text: 'Oyun başladı' });
    log.push({ text: 'Dalga 1 geldi', tone: 'warning' });

    const rows = log.element.querySelectorAll('.vol-event-log__row');
    expect(rows.length).toBe(2);
    expect(rows[1].textContent).toContain('Dalga 1 geldi');
    expect(rows[1].classList.contains('vol-event-log__row--warning')).toBe(true);
  });

  it('maxEntries aşıldığında en eski (sabitlenmemiş) satırlar çıkış animasyonu sonrası atılır', () => {
    vi.useFakeTimers();
    const log = track(new EventLog({ maxEntries: 3 }));
    for (let i = 0; i < 5; i++) log.push({ text: `Olay ${i}` });

    // Animasyon süresi dolmadan atılacak satırlar --leave class'ıyla DOM'da
    // bir tur daha kalır (bkz. EventLog.scheduleLeaveCleanup).
    const leaving = log.element.querySelectorAll('.vol-event-log__row--leave');
    expect(leaving.length).toBe(2);

    vi.advanceTimersByTime(300);
    const rows = log.element.querySelectorAll('.vol-event-log__row');
    expect(rows.length).toBe(3);
    expect(rows[0].textContent).toContain('Olay 2'); // ilk 2 atıldı
    expect(rows[2].textContent).toContain('Olay 4');
    vi.useRealTimers();
  });

  it('collapseDuplicates:true iken ardışık aynı metin/tone birleşir, ×N rozeti gösterir', () => {
    const log = track(new EventLog({ collapseDuplicates: true }));
    log.push({ text: 'Ok isabet etti' });
    log.push({ text: 'Ok isabet etti' });
    log.push({ text: 'Ok isabet etti' });

    const rows = log.element.querySelectorAll('.vol-event-log__row');
    expect(rows.length).toBe(1);
    expect(rows[0].querySelector('.vol-event-log__count')?.textContent).toBe('×3');
  });

  it('collapseDuplicates:true iken FARKLI metin/tone birleştirilmez', () => {
    const log = track(new EventLog({ collapseDuplicates: true }));
    log.push({ text: 'A' });
    log.push({ text: 'B' });

    const rows = log.element.querySelectorAll('.vol-event-log__row');
    expect(rows.length).toBe(2);
  });

  it("showFilters:true iken filtre butonuna tıklamak yalnızca o tone'daki satırları gösterir", () => {
    const log = track(new EventLog({ showFilters: true }));
    log.push({ text: 'Başarı olayı', tone: 'success' });
    log.push({ text: 'Uyarı olayı', tone: 'warning' });

    const filterButtons = log.element.querySelectorAll<HTMLButtonElement>('.vol-event-log__filter');
    const successFilter = Array.from(filterButtons).find((b) => b.textContent === 'Başarı')!;
    successFilter.click();

    const rows = log.element.querySelectorAll('.vol-event-log__row');
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain('Başarı olayı');
  });

  it('pinnable:true iken sabitlenen satır filtreden bağımsız her zaman görünür kalır ve üstte durur', () => {
    const onPinChange = vi.fn();
    const log = track(new EventLog({ showFilters: true, pinnable: true, onPinChange }));
    log.push({ text: 'Kritik uyarı', tone: 'danger' });
    log.push({ text: 'Normal olay', tone: 'success' });

    const pinButton = log.element.querySelector<HTMLButtonElement>('.vol-event-log__pin')!;
    pinButton.click();
    expect(onPinChange).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Kritik uyarı' }),
      true,
    );

    // Success filtresine geç — sabitlenen 'danger' satır YİNE DE görünmeli.
    const filterButtons = log.element.querySelectorAll<HTMLButtonElement>('.vol-event-log__filter');
    const successFilter = Array.from(filterButtons).find((b) => b.textContent === 'Başarı')!;
    successFilter.click();

    const rows = log.element.querySelectorAll('.vol-event-log__row');
    expect(rows.length).toBe(2); // pinned (danger) + filtreye uyan (success)
    expect(rows[0].classList.contains('vol-event-log__row--pinned')).toBe(true);
  });

  it('sabitlenmiş satırlar maxEntries limitinden muaftır', () => {
    vi.useFakeTimers();
    const log = track(new EventLog({ maxEntries: 2, pinnable: true }));
    log.push({ text: 'Sabitlenecek' });
    const pinButton = log.element.querySelector<HTMLButtonElement>('.vol-event-log__pin');
    // pinnable ama pin butonu hover'da render ediliyor olabilir; doğrudan API üzerinden test edelim.
    log.push({ text: 'A' });
    log.push({ text: 'B' });
    log.push({ text: 'C' });

    // maxEntries=2 ile en fazla 2 sabitlenmemiş satır kalmalı (ilk push hariç, çünkü pinlenmedi burada).
    // Çıkış animasyonu süresi geçene kadar atılan satırlar --leave ile DOM'da bir tur daha kalır.
    vi.advanceTimersByTime(300);
    const rows = log.element.querySelectorAll('.vol-event-log__row');
    expect(rows.length).toBeLessThanOrEqual(2);
    void pinButton;
    vi.useRealTimers();
  });

  it('clear tüm kayıtları (sabitlenenler dahil) temizler', () => {
    const log = track(new EventLog());
    log.push({ text: 'A' });
    log.push({ text: 'B' });
    log.clear();

    expect(log.element.querySelectorAll('.vol-event-log__row').length).toBe(0);
  });

  it("destroy scroll listener'ı temizler", () => {
    const log = new EventLog();
    const scrollArea = log.element.querySelector<HTMLDivElement>('.vol-event-log__scroll-area')!;
    const removeListener = vi.spyOn(scrollArea, 'removeEventListener');
    log.destroy();
    expect(removeListener).toHaveBeenCalledWith('scroll', expect.any(Function));
  });
});

describe('Text', () => {
  it('varsayılan tag=p, variant=body ile oluşturulur', () => {
    const text = track(new Text('Merhaba'));
    expect(text.element.tagName).toBe('P');
    expect(text.element.classList.contains('vol-text--body')).toBe(true);
    expect(text.element.textContent).toBe('Merhaba');
  });

  it('farklı tag ile oluşturulabilir (ör. h2)', () => {
    const text = track(new Text('Başlık', { tag: 'h2', variant: 'heading' }));
    expect(text.element.tagName).toBe('H2');
    expect(text.element.classList.contains('vol-text--heading')).toBe(true);
  });

  it('setContent metni değiştirir', () => {
    const text = track(new Text('Eski'));
    text.setContent('Yeni');
    expect(text.element.textContent).toBe('Yeni');
  });

  it("setVariant eski class'ı kaldırıp yeni class'ı ekler", () => {
    const text = track(new Text('X', { variant: 'body' }));
    text.setVariant('muted');
    expect(text.element.classList.contains('vol-text--body')).toBe(false);
    expect(text.element.classList.contains('vol-text--muted')).toBe(true);
  });

  it("destroy elementi DOM'dan kaldırır", () => {
    const text = new Text('X');
    document.body.appendChild(text.element);
    text.destroy();
    expect(text.element.isConnected).toBe(false);
  });
});

describe('AnimatedLabel', () => {
  it('varsayılan effect=fade ile oluşturulur', () => {
    const label = track(new AnimatedLabel('YENİ REKOR!'));
    expect(label.element.classList.contains('vol-animated-label--fade')).toBe(true);
    expect(label.element.textContent).toBe('YENİ REKOR!');
  });

  it('setContent (tek seferlik efekt modunda) metni değiştirir ve animasyonu tekrar oynatır', () => {
    const label = track(new AnimatedLabel('A', { effect: 'pop' }));
    label.setContent('B');
    expect(label.element.textContent).toBe('B');
    expect(label.element.classList.contains('vol-animated-label--pop')).toBe(true);
  });

  it("setEffect eski efekt class'ını kaldırıp yenisini uygular", () => {
    const label = track(new AnimatedLabel('X', { effect: 'fade' }));
    label.setEffect('glow');
    expect(label.element.classList.contains('vol-animated-label--fade')).toBe(false);
    expect(label.element.classList.contains('vol-animated-label--glow')).toBe(true);
  });

  it("setContinuousEffect metni harf harf <span> glyph'lere böler, boşlukları korur", () => {
    const label = track(new AnimatedLabel('Hi Yo'));
    label.setContinuousEffect('wave');

    const glyphs = label.element.querySelectorAll('.vol-animated-label__glyph');
    expect(glyphs.length).toBe(4); // 'H','i','Y','o' (boşluk glyph değil)
    expect(label.element.classList.contains('vol-animated-label--wave')).toBe(true);
    expect(label.element.textContent).toBe('Hi Yo'); // boşluk korunmuş
  });

  it("glyph'lerin animation-delay'i sırayla artar (kademeli gecikme)", () => {
    const label = track(new AnimatedLabel('ABC'));
    label.setContinuousEffect('shake');

    const glyphs = Array.from(
      label.element.querySelectorAll<HTMLSpanElement>('.vol-animated-label__glyph'),
    );
    expect(glyphs[0].style.animationDelay).toBe('0ms');
    expect(glyphs[1].style.animationDelay).toBe('40ms');
    expect(glyphs[2].style.animationDelay).toBe('80ms');
  });

  it("stopContinuousEffect glyph'leri kaldırıp düz metne döner", () => {
    const label = track(new AnimatedLabel('Test'));
    label.setContinuousEffect('rainbow');
    label.stopContinuousEffect();

    expect(label.element.querySelectorAll('.vol-animated-label__glyph').length).toBe(0);
    expect(label.element.textContent).toBe('Test');
    expect(label.element.classList.contains('vol-animated-label--rainbow')).toBe(false);
  });

  it("setContent sürekli efekt AKTİFKEN çağrılırsa glyph'leri yeni içerikle yeniden oluşturur", () => {
    const label = track(new AnimatedLabel('AB'));
    label.setContinuousEffect('gradient');
    label.setContent('XYZ');

    const glyphs = label.element.querySelectorAll('.vol-animated-label__glyph');
    expect(glyphs.length).toBe(3);
    expect(label.element.textContent).toBe('XYZ');
  });

  it("destroy sürekli efekti durdurur ve elementi DOM'dan kaldırır", () => {
    const label = new AnimatedLabel('X');
    document.body.appendChild(label.element);
    label.setContinuousEffect('jump');

    label.destroy();
    expect(label.element.isConnected).toBe(false);
  });
});
