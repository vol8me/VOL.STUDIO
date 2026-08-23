import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildButtonsTab } from '../../src/sections/buttonsTab';
import { buildTextTab } from '../../src/sections/textTab';
import { buildPanelsTab } from '../../src/sections/panelsTab';
import { buildHudTab } from '../../src/sections/hudTab';
import { buildCardsTab } from '../../src/sections/cardsTab';
import { buildFormsTab } from '../../src/sections/formsTab';
import { buildAdvancedTab } from '../../src/sections/advancedTab';
import { buildScrollTab } from '../../src/sections/scrollTab';
import { buildTouchTab } from '../../src/sections/touchTab';
import { buildLoadingTab } from '../../src/sections/loadingTab';

/**
 * Showcase'in İNTERAKTİF yüzeyi.
 *
 * `sections.test.ts` sekmelerin KURULDUĞUNU doğrular; bu dosya
 * KULLANILDIKLARINI doğrular. Ayrım önemli: showcase, CORE bileşenlerinin
 * görsel doğrulama yeridir ve bir demo callback'i fırlattığında sekme
 * sessizce yarım kalır — kurulum testi bunu göremez, çünkü hata ancak
 * tıklandığında oluşur.
 *
 * Ölçülen boşluk buydu: statement kapsamı %83 iken function kapsamı %53'tü,
 * yani builder'lar koşuluyor ama ürettikleri handler'lar hiç çağrılmıyordu.
 *
 * Yaklaşım bilinçli olarak KABA: her sekmedeki her interaktif elemana
 * dokunulur ve hiçbirinin fırlatmaması beklenir. Tek tek senaryo yazmak
 * yüzlerce testlik bir bakım yükü olurdu ve asıl riski — "bir handler
 * patlıyor" — daha iyi yakalamazdı.
 */

/** Etkileşim sırasında yakalanan hatalar; her test başında sıfırlanır. */
let captured: Array<{ where: string; error: unknown }>;

function record(where: string, fn: () => void): void {
  try {
    fn();
  } catch (error) {
    captured.push({ where, error });
  }
}

/** Bir elemana pointer basma/kaldırma dizisi gönderir. */
function pointerSequence(target: Element): void {
  const opts = { bubbles: true, cancelable: true, pointerId: 1, clientX: 40, clientY: 40 };
  target.dispatchEvent(new PointerEvent('pointerdown', opts));
  target.dispatchEvent(new PointerEvent('pointermove', { ...opts, clientX: 90, clientY: 70 }));
  target.dispatchEvent(new PointerEvent('pointerup', { ...opts, clientX: 90, clientY: 70 }));
}

/**
 * Sekmedeki her interaktif elemanı çalıştırır.
 *
 * Buton tıklamaları, form girdilerinin `input`/`change` olayları, klavye
 * etkinleştirmesi ve pointer jestleri ayrı ayrı denenir; hepsi `record` ile
 * sarılır ki ilk hata kalanları maskelemesin.
 */
function exerciseAll(root: HTMLElement): void {
  for (const button of Array.from(root.querySelectorAll('button'))) {
    if (button.disabled) continue;
    record(`click:${button.className}`, () => button.click());
    record(`key:${button.className}`, () => {
      button.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      button.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true }));
    });
  }

  for (const input of Array.from(root.querySelectorAll('input'))) {
    record(`input:${input.type}`, () => {
      if (input.type === 'checkbox' || input.type === 'radio') {
        input.checked = !input.checked;
      } else if (input.type === 'range') {
        input.value = input.max || '50';
      } else {
        input.value = 'test';
      }
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  for (const select of Array.from(root.querySelectorAll('select'))) {
    record('select', () => {
      if (select.options.length > 1) select.selectedIndex = 1;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  for (const area of Array.from(root.querySelectorAll('textarea'))) {
    record('textarea', () => {
      area.value = 'test';
      area.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  // Jest alanları buton değildir; pointer dizisiyle sürülürler.
  const gestureSelectors = [
    '.vol-swipe-zone',
    '.vol-multitouch-zone',
    '.vol-joystick',
    '.vol-square-joystick',
    '.vol-dpad',
    '.vol-pinch-zoom',
    '.vol-pull-to-refresh',
    '.vol-swipeable-card-stack',
    '.vol-dual-axis-scroll',
  ];
  for (const selector of gestureSelectors) {
    for (const zone of Array.from(root.querySelectorAll(selector))) {
      record(`gesture:${selector}`, () => pointerSequence(zone));
    }
  }
}

/**
 * Açık kalan diyalogları CEVAPLAR.
 *
 * `showConfirm()` gibi demolar bir karar bekler ve söz (promise) ancak
 * kullanıcı yanıtlayınca çözülür. Cevaplamadan yok etmek, diyaloğu DOM'da
 * bırakır — bu bir sızıntı DEĞİL, doğru davranıştır. Gerçekçi akış diyaloğu
 * yanıtlamaktır; üstelik bu, yanıt yolundaki callback'leri de çalıştırır.
 */
async function dismissOpenDialogs(overlayRoot: HTMLElement): Promise<void> {
  for (let pass = 0; pass < 3; pass++) {
    const buttons = Array.from(overlayRoot.querySelectorAll('button')).filter((b) => !b.disabled);
    if (buttons.length === 0) break;
    for (const button of buttons) {
      record(`dismiss:${button.className}`, () => button.click());
    }
    // Söz zinciri mikro görevde çözülür; sahte zamanlayıcı onu beklemez.
    await Promise.resolve();
    await Promise.resolve();
  }
}

describe('showcase interaktif yüzeyi', () => {
  let uiRoot: HTMLDivElement;

  beforeEach(() => {
    captured = [];
    uiRoot = document.createElement('div');
    document.body.appendChild(uiRoot);
    // Demolar zamanlayıcı ve animasyon kullanıyor; gerçek zamanı beklemeden
    // ilerletebilmek için sahte zamanlayıcı.
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  const builders = [
    { name: 'buttons', build: () => buildButtonsTab(uiRoot) },
    { name: 'text', build: () => buildTextTab() },
    { name: 'panels', build: () => buildPanelsTab(uiRoot) },
    { name: 'hud', build: () => buildHudTab() },
    { name: 'cards', build: () => buildCardsTab(uiRoot) },
    { name: 'forms', build: () => buildFormsTab(uiRoot) },
    { name: 'advanced', build: () => buildAdvancedTab(uiRoot) },
    { name: 'scroll', build: () => buildScrollTab() },
    { name: 'touch', build: () => buildTouchTab() },
    { name: 'loading', build: () => buildLoadingTab() },
  ] as const;

  for (const { name, build } of builders) {
    it(`${name}: her interaktif eleman hatasız çalışır`, () => {
      const { element, destroy } = build();
      document.body.appendChild(element);

      exerciseAll(element);
      // Overlay'ler uiRoot'a asılıyor; onların içindeki kontroller de sürülür.
      exerciseAll(uiRoot);
      vi.advanceTimersByTime(2000);

      expect(
        captured.map((c) => `${c.where}: ${String(c.error)}`),
        `${name} sekmesinde handler hatası`,
      ).toEqual([]);

      destroy();
    });

    it(`${name}: etkileşimden SONRA destroy sızıntı bırakmaz`, async () => {
      // Bir demo etkileşimle overlay/zamanlayıcı açtıysa destroy onu da
      // toplamalı. Kurulum testi bunu göremez: sızıntı ancak kullanımdan
      // sonra doğar.
      const { element, destroy } = build();
      document.body.appendChild(element);

      exerciseAll(element);
      vi.advanceTimersByTime(2000);
      await dismissOpenDialogs(uiRoot);
      vi.advanceTimersByTime(2000);

      destroy();
      vi.advanceTimersByTime(2000);

      expect(uiRoot.children.length, `${name} destroy sonrası overlay bıraktı`).toBe(0);
    });
  }

  it('etkileşim iki kez tekrarlanabilir (idempotent handler)', () => {
    // Bir handler ikinci çağrıda patlıyorsa (ör. tek kullanımlık referans)
    // showcase gerçek kullanımda ilk tıklamadan sonra bozulurdu.
    const { element, destroy } = buildButtonsTab(uiRoot);
    document.body.appendChild(element);

    exerciseAll(element);
    exerciseAll(element);
    vi.advanceTimersByTime(2000);

    expect(captured.map((c) => `${c.where}: ${String(c.error)}`)).toEqual([]);
    destroy();
  });
});
