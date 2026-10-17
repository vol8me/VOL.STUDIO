import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { i18next } from '../../../src/i18n/I18n';
import { getBackHandlerCount } from '../../../src/platform/backNavigation';
import { Button } from '../../../src/ui/primitives/Button';
import { startGuidedTour, type TourStep } from '../../../src/ui/overlays/GuidedTour';

const t = (key: string, options?: Record<string, unknown>): string =>
  (i18next as unknown as { t(key: string, options?: Record<string, unknown>): string }).t(
    key,
    options,
  );

beforeEach(() => {
  // jsdom yerleşim üretmez: bağlı ve `data-hidden` olmayan öğe "görünür" sayılır.
  vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(function (this: Element) {
    return (this.isConnected && !this.hasAttribute('data-hidden')
      ? [{} as DOMRect]
      : []) as unknown as DOMRectList;
  });
});

afterEach(() => {
  for (let guard = 0; guard < 20 && getBackHandlerCount() > 0; guard += 1) {
    window.dispatchEvent(new Event('vol:androidback'));
  }
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

function targets(count: number): HTMLButtonElement[] {
  return Array.from({ length: count }, (_, index) => {
    const element = document.createElement('button');
    element.textContent = `Hedef ${index + 1}`;
    document.body.appendChild(element);
    return element;
  });
}

const stepsFor = (elements: HTMLElement[]): TourStep[] =>
  elements.map((target, index) => ({
    target,
    title: `Adım başlığı ${index + 1}`,
    body: `Açıklama ${index + 1}`,
  }));

const popup = (): HTMLElement | null => document.querySelector<HTMLElement>('.vol-tour');
const label = (text: string): HTMLButtonElement => {
  const found = [...popup()!.querySelectorAll<HTMLButtonElement>('button')].find(
    (candidate) => candidate.textContent?.trim() === text,
  );
  if (!found) throw new Error(`Düğme yok: ${text}`);
  return found;
};
const NEXT = () => t('core:dialog.tour.next');
const BACK = () => t('core:dialog.tour.back');
const SKIP = () => t('core:dialog.tour.skip');
const DONE = () => t('core:dialog.tour.done');

describe('GuidedTour: açılış', () => {
  it('boş tur kurulamaz', () => {
    expect(() => startGuidedTour({ steps: [] })).toThrow(RangeError);
  });

  it('ilk adımı gösterir: ad/açıklama bağlı, sayaç, hedef işareti, odak İleri düğmesinde, engelleyici değil', () => {
    const elements = targets(3);
    const onStep = vi.fn();
    startGuidedTour({ steps: stepsFor(elements), onStep });
    const box = popup()!;
    expect(box.classList.contains('vol-popup--visible')).toBe(true);
    expect(box.getAttribute('role')).toBe('dialog');
    expect(box.hasAttribute('aria-modal')).toBe(false);
    expect(document.getElementById(box.getAttribute('aria-labelledby')!)?.textContent).toBe(
      'Adım başlığı 1',
    );
    expect(document.getElementById(box.getAttribute('aria-describedby')!)?.textContent).toBe(
      'Açıklama 1',
    );
    expect(box.querySelector('.vol-tour__counter')?.textContent).toBe(
      t('core:dialog.tour.step', { current: 1, total: 3 }),
    );
    expect(elements[0].classList.contains('vol-tour-target')).toBe(true);
    expect(elements[1].classList.contains('vol-tour-target')).toBe(false);
    expect(document.activeElement).toBe(label(NEXT()));
    expect(onStep).toHaveBeenCalledWith(0, 3);
    // Engelleyici değil: scrim yok, gövde kilitlenmez, geri tuşu açık adımı kapatır.
    expect(document.querySelector('.vol-modal')).toBeNull();
    expect(document.body.classList.contains('vol-modal__body-locked')).toBe(false);
  });

  it('metinler düz metindir', () => {
    const [element] = targets(1);
    startGuidedTour({
      steps: [{ target: element, title: '<img src=x onerror=alert(1)>', body: '<b>kalın</b>' }],
    });
    expect(popup()!.querySelector('img, b')).toBeNull();
    expect(popup()!.querySelector('.vol-tour__title')?.textContent).toBe(
      '<img src=x onerror=alert(1)>',
    );
  });
});

describe('GuidedTour: gezinme', () => {
  it('İleri/Geri adımları sırayla gezdirir; son adımda Bitti vardır ve tur completed olur', async () => {
    const elements = targets(3);
    const opener = document.createElement('input');
    document.body.appendChild(opener);
    opener.focus();
    const tour = startGuidedTour({ steps: stepsFor(elements) });

    expect(() => label(BACK())).toThrow();
    label(NEXT()).click();
    expect(popup()!.querySelector('.vol-tour__title')?.textContent).toBe('Adım başlığı 2');
    expect(elements[0].classList.contains('vol-tour-target')).toBe(false);
    expect(elements[1].classList.contains('vol-tour-target')).toBe(true);
    expect(document.querySelectorAll('.vol-tour')).toHaveLength(1);

    label(BACK()).click();
    expect(popup()!.querySelector('.vol-tour__title')?.textContent).toBe('Adım başlığı 1');
    label(NEXT()).click();
    label(NEXT()).click();
    expect(popup()!.querySelector('.vol-tour__title')?.textContent).toBe('Adım başlığı 3');
    expect(() => label(NEXT())).toThrow();
    label(DONE()).click();

    await expect(tour.result).resolves.toBe('completed');
    expect(popup()).toBeNull();
    expect(elements.some((el) => el.classList.contains('vol-tour-target'))).toBe(false);
    expect(getBackHandlerCount()).toBe(0);
    expect(document.activeElement).toBe(opener);
  });

  it('tek adımlı tur doğrudan Bitti gösterir', async () => {
    const tour = startGuidedTour({ steps: stepsFor(targets(1)) });
    expect(() => label(NEXT())).toThrow();
    label(DONE()).click();
    await expect(tour.result).resolves.toBe('completed');
  });
});

describe('GuidedTour: atlama ve iptal', () => {
  it('Atla, Escape ve skip() turu skipped bitirir ve her şeyi temizler', async () => {
    const skipButton = startGuidedTour({ steps: stepsFor(targets(2)) });
    label(SKIP()).click();
    await expect(skipButton.result).resolves.toBe('skipped');

    document.body.innerHTML = '';
    const viaEscape = startGuidedTour({ steps: stepsFor(targets(2)) });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await expect(viaEscape.result).resolves.toBe('skipped');

    document.body.innerHTML = '';
    const viaHandle = startGuidedTour({ steps: stepsFor(targets(2)) });
    viaHandle.skip();
    viaHandle.skip();
    await expect(viaHandle.result).resolves.toBe('skipped');
    expect(popup()).toBeNull();
    expect(getBackHandlerCount()).toBe(0);
  });

  it('Android geri turu atlar', async () => {
    const tour = startGuidedTour({ steps: stepsFor(targets(2)) });
    window.dispatchEvent(new Event('vol:androidback'));
    await expect(tour.result).resolves.toBe('skipped');
  });

  it('sinyal turu skipped bitirir; önceden iptal edilmişse hiç açılmaz', async () => {
    const controller = new AbortController();
    const tour = startGuidedTour({ steps: stepsFor(targets(2)), signal: controller.signal });
    controller.abort();
    await expect(tour.result).resolves.toBe('skipped');
    expect(popup()).toBeNull();

    const pre = startGuidedTour({ steps: stepsFor(targets(1)), signal: AbortSignal.abort() });
    await expect(pre.result).resolves.toBe('skipped');
    expect(popup()).toBeNull();
    expect(getBackHandlerCount()).toBe(0);
  });

  it('tur bir Button tıklamasının içinde başlarsa (düğme geçici disabled) odak o düğmeye döner', async () => {
    const [target] = targets(1);
    let tour!: ReturnType<typeof startGuidedTour>;
    // Gerçek tetikleyici: tıklama sürerken Button disabled olur ve tarayıcı odağı gövdeye düşürür.
    const trigger = new Button('Turu başlat', {
      onClick: () => {
        // jsdom, `disabled` olan düğmenin odağını düşürmez; tarayıcının yaptığı (odak gövdeye düşer) elle benzetilir.
        Object.defineProperty(document, 'activeElement', {
          configurable: true,
          get: () => document.body,
        });
        try {
          tour = startGuidedTour({ steps: stepsFor([target]) });
        } finally {
          Reflect.deleteProperty(document, 'activeElement');
        }
      },
    });
    document.body.appendChild(trigger.element);
    trigger.element.focus();
    trigger.element.click();
    label(DONE()).click();
    await expect(tour.result).resolves.toBe('completed');
    expect(document.activeElement).toBe(trigger.element);
  });

  it('odak başka yere verildiyse tur bitince odak çalınmaz', async () => {
    const elements = targets(2);
    const opener = document.createElement('input');
    const other = document.createElement('input');
    document.body.append(opener, other);
    opener.focus();
    const tour = startGuidedTour({ steps: stepsFor(elements) });
    other.focus();
    tour.skip();
    await tour.result;
    expect(document.activeElement).toBe(other);
  });
});

describe('GuidedTour: hedefi olmayan adımlar', () => {
  it('görünmeyen ve çözülemeyen adımlar atlanır; sayaç özgün sırayı korur', async () => {
    const elements = targets(4);
    elements[1].setAttribute('data-hidden', '');
    const steps: TourStep[] = stepsFor(elements);
    steps[2] = { ...steps[2], target: () => null };
    const tour = startGuidedTour({ steps });
    expect(popup()!.querySelector('.vol-tour__title')?.textContent).toBe('Adım başlığı 1');
    label(NEXT()).click();
    expect(popup()!.querySelector('.vol-tour__title')?.textContent).toBe('Adım başlığı 4');
    expect(popup()!.querySelector('.vol-tour__counter')?.textContent).toBe(
      t('core:dialog.tour.step', { current: 4, total: 4 }),
    );
    // Önceki gösterilebilir adım 1'dir (2 ve 3 atlanır).
    label(BACK()).click();
    expect(popup()!.querySelector('.vol-tour__title')?.textContent).toBe('Adım başlığı 1');
    tour.skip();
    await tour.result;
  });

  it('ilk adımın hedefi yoksa tur ilk gösterilebilir adımdan başlar', () => {
    const elements = targets(2);
    elements[0].setAttribute('data-hidden', '');
    startGuidedTour({ steps: stepsFor(elements) });
    expect(popup()!.querySelector('.vol-tour__title')?.textContent).toBe('Adım başlığı 2');
    expect(() => label(BACK())).toThrow();
  });

  it('hiçbir adım gösterilemezse tur skipped biter ve açık katman bırakmaz', async () => {
    const elements = targets(2);
    for (const element of elements) element.setAttribute('data-hidden', '');
    const tour = startGuidedTour({ steps: stepsFor(elements) });
    await expect(tour.result).resolves.toBe('skipped');
    expect(popup()).toBeNull();
    expect(getBackHandlerCount()).toBe(0);
  });

  it('adım sürerken hedef kaybolursa kutu sonraki adıma geçer; sonrası kalmadıysa tur completed biter', async () => {
    const elements = targets(3);
    const tour = startGuidedTour({ steps: stepsFor(elements) });
    elements[0].setAttribute('data-hidden', '');
    // Popup'ın kendi gözlemcisi hedefin kaybolmasında kapanır (jsdom'da gözlemci yok): aynı kapanış yolu.
    window.dispatchEvent(new Event('vol:androidback'));
    expect(popup()!.querySelector('.vol-tour__title')?.textContent).toBe('Adım başlığı 2');

    elements[1].remove();
    elements[2].setAttribute('data-hidden', '');
    window.dispatchEvent(new Event('vol:androidback'));
    await expect(tour.result).resolves.toBe('completed');
    expect(popup()).toBeNull();
    expect(getBackHandlerCount()).toBe(0);
  });
});
