import { expect, test, type Page } from '@playwright/test';
import { installVirtualPad, pressButton } from './support/gamepad';
import { openShowcase, selectTab } from './support/determinism';

/**
 * Form kabul matrisi (UI-05.5): her form denetimi yalnız klavye, yalnız kol, dokunma ve altı haneli değerle
 * gerçek tarayıcıda sınanır. %30 uzun metin `pseudoLocale.spec.ts` (forms sekmesi dahil), durum matrisi ve
 * katman örtüşmesi `stateMatrix.spec.ts`/`focusVisible.spec.ts`, axe `accessibility.spec.ts` kapsamındadır.
 * Gerçek Steam Deck kolu ve ekran okuyucu insan/cihaz kabulüdür (F08/UI-13.4).
 */
const FORMS = '[role="tabpanel"][id$="-panel-forms"]';
const RING = '.vol-focusnav-current';
const PAD = {
  primary: 0,
  secondary: 1,
  dpadUp: 12,
  dpadDown: 13,
  dpadLeft: 14,
  dpadRight: 15,
} as const;
const PAD_DIRECTIONS = {
  up: PAD.dpadUp,
  down: PAD.dpadDown,
  left: PAD.dpadLeft,
  right: PAD.dpadRight,
} as const;

async function openForms(page: Page): Promise<void> {
  await openShowcase(page);
  await selectTab(page, 'forms');
}

const VIEWPORTS = [
  { name: '1280x800', width: 1280, height: 800 },
  { name: '360x740', width: 360, height: 740 },
  { name: '320x568', width: 320, height: 568 },
];

for (const viewport of VIEWPORTS) {
  test(`altı haneli değerler kırpılmaz: adım girdisi, kaydırıcı ve aralık değeri @ ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await openForms(page);
    const card = page.locator('.vol-showcase-six-digits');
    await card.scrollIntoViewIfNeeded();

    const report = await card.evaluate((root) => {
      const bounds = (root.closest('.vol-showcase-card') ?? root).getBoundingClientRect();
      const clipped: string[] = [];
      const outside: string[] = [];
      for (const element of root.querySelectorAll<HTMLElement>('*')) {
        const rect = element.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        if (
          element.scrollWidth > element.clientWidth + 1 &&
          getComputedStyle(element).overflowX !== 'visible'
        ) {
          clipped.push(`${element.className}: ${element.scrollWidth}>${element.clientWidth}`);
        }
        if (rect.left < bounds.left - 1 || rect.right > bounds.right + 1) {
          outside.push(`${element.className}: ${Math.round(rect.left)}..${Math.round(rect.right)}`);
        }
      }
      const stepper = root.querySelector<HTMLInputElement>(
        'input[inputmode], input[type="text"], input[type="number"]',
      );
      return {
        clipped,
        outside,
        stepperValue: stepper?.value ?? null,
        stepperFits: stepper ? stepper.scrollWidth <= stepper.clientWidth + 1 : false,
        text: root.textContent ?? '',
      };
    });
    expect(report.stepperValue).toBe('999999');
    expect(report.stepperFits, 'adım girdisi 6 haneyi kırpmadan gösterir').toBe(true);
    expect(report.text).toContain('999999');
    expect(report.text).toContain('100000');
    expect(report.clipped, 'kırpılan öğe').toEqual([]);
    expect(report.outside, 'kartın dışına taşan öğe').toEqual([]);
  });
}

test('yalnız klavye: Tab ile bütün form denetimleri sırayla gezilir, her durak görünür ve odak göstergesi taşır', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openForms(page);
  // Odağı formlar panelinin hemen önüne al: seçili sekme düğmesinden sonraki ilk Tab panel içeriğine girer.
  await page.locator('.vol-tabs__tab[aria-selected="true"]').focus();

  const stops: { id: string; problem: string | null }[] = [];
  for (let step = 0; step < 140; step += 1) {
    await page.keyboard.press('Tab');
    const stop = await page.evaluate((panelSelector) => {
      const active = document.activeElement as HTMLElement | null;
      const panel = document.querySelector(panelSelector);
      if (!active || !panel?.contains(active)) return { inside: false, id: '', problem: null };
      active.scrollIntoView({ block: 'nearest' });
      const rect = active.getBoundingClientRect();
      const host = active.closest<HTMLElement>('label, .vol-slider, .vol-range-slider') ?? active;
      const hostRect = host.getBoundingClientRect();
      const hit = document.elementFromPoint(
        hostRect.left + hostRect.width / 2,
        hostRect.top + hostRect.height / 2,
      );
      const inViewport =
        hostRect.bottom > 0 &&
        hostRect.top < window.innerHeight &&
        hostRect.right > 0 &&
        hostRect.left < window.innerWidth;

      const candidates = [
        active,
        active.nextElementSibling,
        active.previousElementSibling,
        active.parentElement,
        host,
      ].filter((element): element is HTMLElement => element instanceof HTMLElement);
      const snapshot = () =>
        candidates.map((element) => {
          const style = getComputedStyle(element);
          return [
            style.outlineStyle,
            style.outlineWidth,
            style.outlineColor,
            style.boxShadow,
            style.borderColor,
            style.backgroundColor,
            style.transform,
          ].join('|');
        });
      const focused = snapshot();
      active.blur();
      const blurred = snapshot();
      active.focus({ preventScroll: true });
      const indicator = focused.some((value, index) => value !== blurred[index]);

      // Eğri düzenleyici noktaları klavye/AT vekilidir (`pointer-events: none`); işaretçi tuvale gider.
      const pointerTarget = getComputedStyle(active).pointerEvents !== 'none';
      let problem: string | null = null;
      if (!inViewport) problem = 'görünür pencere dışında';
      else if (pointerTarget && hit && !host.contains(hit) && !hit.contains(host))
        problem = `örtülü (${(hit as HTMLElement).className})`;
      else if (!indicator) problem = 'odak göstergesi yok';
      const id = `${active.tagName}.${active.className}|${active.getAttribute('aria-label') ?? active.textContent?.slice(0, 20)}|${Math.round(rect.top + window.scrollY)}`;
      return { inside: true, id, problem };
    }, FORMS);
    if (!stop.inside) {
      if (stops.length > 0) break;
      continue;
    }
    stops.push({ id: stop.id, problem: stop.problem });
  }

  const unique = new Set(stops.map((stop) => stop.id));
  expect(unique.size, 'gezilen benzersiz denetim').toBeGreaterThanOrEqual(30);
  expect(unique.size, 'Tab sırası tekrar etmeden ilerler (klavye tuzağı yok)').toBe(stops.length);
  expect(
    stops.filter((stop) => stop.problem).map((stop) => `${stop.id} → ${stop.problem}`),
  ).toEqual([]);
});

test('yalnız kol: D-pad ile her denetime ulaşılır ve geri dönülür; halka daima görünür bir denetimdedir', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await installVirtualPad(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await openForms(page);

  // Formlar panelindeki her etkin, görünür denetime numara verilir.
  const count = await page.evaluate((panelSelector) => {
    const panel = document.querySelector(panelSelector)!;
    const nodes = [
      ...panel.querySelectorAll<HTMLElement>(
        'button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])',
      ),
    ].filter((element) => {
      const rect = element.getBoundingClientRect();
      return (
        !element.matches(':disabled') &&
        !element.closest('[inert]') &&
        rect.width > 0 &&
        rect.height > 0
      );
    });
    nodes.forEach((element, index) => element.setAttribute('data-e2e-node', String(index)));
    return nodes.length;
  }, FORMS);
  expect(count, 'formlar panelindeki denetim sayısı').toBeGreaterThanOrEqual(30);

  // Her denetimden dört yönde de gerçek kol basışı: gerçek FocusNavController komşuyu seçer.
  const edges = new Map<number, Set<number>>();
  const problems: string[] = [];
  for (let node = 0; node < count; node += 1) {
    edges.set(node, new Set());
    for (const [direction, button] of Object.entries(PAD_DIRECTIONS)) {
      // Tek gidiş-dönüşte: denetime odaklan, kolla bas-bırak (iki rAF kenar döngüsü), inilen yeri oku.
      const landed = await page.evaluate(
        async ([index, buttonIndex]) => {
          const frame = (): Promise<void> =>
            new Promise((resolve) => requestAnimationFrame(() => resolve()));
          for (const ring of document.querySelectorAll('.vol-focusnav-current')) {
            ring.classList.remove('vol-focusnav-current');
          }
          document
            .querySelector<HTMLElement>(`[data-e2e-node="${index}"]`)!
            .focus({ preventScroll: true });
          const pad = window.__virtualPad;
          pad.timestamp += 1;
          pad.buttons[buttonIndex].pressed = true;
          await frame();
          await frame();
          pad.timestamp += 1;
          pad.buttons[buttonIndex].pressed = false;
          await frame();
          await frame();
          const active = document.activeElement as HTMLElement | null;
          const rect = active?.getBoundingClientRect();
          return {
            node: active?.getAttribute('data-e2e-node') ?? null,
            label: active ? `${active.tagName}.${active.className}` : '',
            ring: active?.classList.contains('vol-focusnav-current') ?? false,
            visible:
              !!rect &&
              rect.width > 0 &&
              rect.height > 0 &&
              rect.bottom > 0 &&
              rect.top < window.innerHeight &&
              rect.right > 0 &&
              rect.left < window.innerWidth,
          };
        },
        [node, button] as const,
      );
      if (landed.node === null) continue; // panel dışına çıkış (üst çubuk) ölü uç değildir
      const target = Number(landed.node);
      if (target === node) continue;
      edges.get(node)!.add(target);
      if (!landed.ring) problems.push(`${node} ${direction} → ${landed.label}: halka yok`);
      if (!landed.visible) problems.push(`${node} ${direction} → ${landed.label}: görünür değil`);
    }
  }
  expect(problems).toEqual([]);

  const reach = (from: number, adjacency: Map<number, Set<number>>): Set<number> => {
    const seen = new Set<number>([from]);
    const queue = [from];
    while (queue.length > 0) {
      for (const next of adjacency.get(queue.shift()!) ?? []) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    return seen;
  };
  const reverse = new Map<number, Set<number>>();
  for (const [from, targets] of edges) {
    for (const to of targets) reverse.set(to, (reverse.get(to) ?? new Set()).add(from));
  }
  const forward = reach(0, edges);
  const backward = reach(0, reverse);
  const label = async (indexes: number[]): Promise<string[]> =>
    page.evaluate(
      (list) =>
        list.map((index) => {
          const element = document.querySelector<HTMLElement>(`[data-e2e-node="${index}"]`)!;
          return `#${index} ${element.tagName}.${element.className}|${element.getAttribute('aria-label') ?? element.textContent?.slice(0, 16)}`;
        }),
      indexes,
    );
  const unreachable = [...edges.keys()].filter((node) => !forward.has(node));
  const noReturn = [...edges.keys()].filter((node) => !backward.has(node));
  expect(await label(unreachable), 'D-pad ile ulaşılamayan denetim').toEqual([]);
  expect(await label(noReturn), 'ilk denetime D-pad ile dönemeyen denetim (ölü uç)').toEqual([]);
});

test('yalnız kol: A anahtarı ve bölümlü denetimi etkinleştirir, seçim açılır ve B kapatır', async ({
  page,
}) => {
  await installVirtualPad(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await openForms(page);

  /** Oyuncu gibi: hedefe doğru baskın eksende bas; takılırsa öbür eksene geç. */
  async function padTo(selector: string): Promise<void> {
    const scoped = `${FORMS} ${selector}`;
    await page.locator(scoped).first().scrollIntoViewIfNeeded();
    for (let step = 0; step < 80; step += 1) {
      const delta = await page.evaluate(
        ([target, ringSelector]) => {
          const wanted = document.querySelector(target);
          const ring = document.querySelector(ringSelector);
          if (!wanted) return null;
          if (ring && (ring === wanted || wanted.contains(ring))) {
            return { dx: 0, dy: 0, done: true };
          }
          const to = wanted.getBoundingClientRect();
          // Görünmez giriş (1×1 piksel) yerine kullanıcının gördüğü etiket kutusu ölçülür.
          const from = (ring?.closest('label') ?? ring)?.getBoundingClientRect();
          return {
            dx: to.x + to.width / 2 - (from ? from.x + from.width / 2 : 0),
            dy: to.y + to.height / 2 - (from ? from.y + from.height / 2 : 0),
            done: false,
          };
        },
        [scoped, RING],
      );
      if (!delta) break;
      if (delta.done) return;
      const vertical = Math.abs(delta.dy) >= Math.abs(delta.dx) || step % 4 === 3;
      await pressButton(
        page,
        vertical
          ? delta.dy >= 0
            ? PAD.dpadDown
            : PAD.dpadUp
          : delta.dx >= 0
            ? PAD.dpadRight
            : PAD.dpadLeft,
      );
    }
    const trail = await page.evaluate(() => {
      const ring = document.querySelector<HTMLElement>('.vol-focusnav-current');
      return ring
        ? `${ring.tagName}.${ring.className}|${ring.getAttribute('aria-label')}`
        : 'halka yok';
    });
    throw new Error(`kol ${selector} denetimine ulaşamadı; halka: ${trail}`);
  }

  // Anahtar (onay kutusu) A ile değişir.
  const checkbox = page
    .locator(`${FORMS} .vol-showcase-checkbox-group .vol-checkbox__input`)
    .nth(2);
  const before = await checkbox.isChecked();
  await padTo('.vol-showcase-checkbox-group .vol-checkbox:nth-child(3)');
  await pressButton(page, PAD.primary);
  expect(await checkbox.isChecked()).toBe(!before);

  // Select A ile açılır, B ile kapanır ve odak yerinde kalır.
  await padTo('.vol-select');
  await pressButton(page, PAD.primary);
  await expect(page.locator('.vol-select__listbox.vol-popup--visible')).toHaveCount(1);
  await pressButton(page, PAD.secondary);
  await expect(page.locator('.vol-select__listbox.vol-popup--visible')).toHaveCount(0);
});

test.describe('dokunma', () => {
  test.use({ hasTouch: true });

  test('parmakla: anahtar, bölümlü denetim, seçim, artır düğmesi ve kaydırıcı çalışır', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 393, height: 851 });
    await openForms(page);
    const tap = async (selector: string, position?: { x: number; y: number }): Promise<void> => {
      const target = page.locator(selector).first();
      await target.scrollIntoViewIfNeeded();
      const box = (await target.boundingBox())!;
      await page.touchscreen.tap(
        box.x + (position ? box.width * position.x : box.width / 2),
        box.y + (position ? box.height * position.y : box.height / 2),
      );
    };

    // Anahtar
    const checkbox = page
      .locator(`${FORMS} .vol-showcase-checkbox-group .vol-checkbox__input`)
      .nth(2);
    const before = await checkbox.isChecked();
    await tap(`${FORMS} .vol-showcase-checkbox-group .vol-checkbox:nth-child(3)`);
    expect(await checkbox.isChecked()).toBe(!before);

    // Bölümlü denetim: "Yüksek" seçeneğine dokun
    const high = page.locator(`${FORMS} .vol-segmented`).first().getByRole('radio').last();
    await high.scrollIntoViewIfNeeded();
    const highBox = (await high.boundingBox())!;
    await page.touchscreen.tap(highBox.x + highBox.width / 2, highBox.y + highBox.height / 2);
    await expect(high).toHaveAttribute('aria-checked', 'true');

    // Artır düğmesi (üretim miktarı 5 → 6)
    const stepper = page.locator(`${FORMS} .vol-stepper`).first();
    await stepper.scrollIntoViewIfNeeded();
    const input = stepper.locator('input');
    const start = Number(await input.inputValue());
    const plus = stepper.locator('button').last();
    const plusBox = (await plus.boundingBox())!;
    await page.touchscreen.tap(plusBox.x + plusBox.width / 2, plusBox.y + plusBox.height / 2);
    expect(Number(await input.inputValue())).toBe(start + 1);

    // Kaydırıcı: izin %80'ine dokun → değer yükselir
    const slider = page.locator(`${FORMS} .vol-slider--horizontal`).first();
    await slider.scrollIntoViewIfNeeded();
    const range = slider.locator('input[type="range"]');
    const track = (await slider.locator('.vol-slider__track').boundingBox())!;
    await page.touchscreen.tap(track.x + track.width * 0.2, track.y + track.height / 2);
    const low = Number(await range.inputValue());
    await page.touchscreen.tap(track.x + track.width * 0.8, track.y + track.height / 2);
    expect(Number(await range.inputValue())).toBeGreaterThan(low);

    // Seçim: dokunarak açılır, seçenek dokunarak seçilir
    await tap(`${FORMS} .vol-select`);
    const listbox = page.locator('.vol-select__listbox.vol-popup--visible');
    await expect(listbox).toHaveCount(1);
    const option = listbox.getByRole('option').last();
    const optionBox = (await option.boundingBox())!;
    await page.touchscreen.tap(
      optionBox.x + optionBox.width / 2,
      optionBox.y + optionBox.height / 2,
    );
    await expect(listbox).toHaveCount(0);
  });
});

test('Tab geçişinde sekme paneli dışı odak formlar sekmesine sızmaz: gizli panellerdeki denetime ulaşılmaz', async ({
  page,
}) => {
  await openForms(page);
  const leaked = await page.evaluate(() => {
    const hidden = [...document.querySelectorAll('[role="tabpanel"][aria-hidden="true"]')];
    return hidden.filter(
      (panel) =>
        panel.querySelector('button, input, select, textarea, [tabindex="0"]') &&
        !(panel as HTMLElement).inert,
    ).length;
  });
  expect(leaked).toBe(0);
});
