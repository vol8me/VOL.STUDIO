import { expect, test, type Page } from '@playwright/test';
import { openShowcase } from './support/determinism';

/**
 * Katman hareketi ve `prefers-reduced-motion` (UI-09.1, UI-09.2).
 *
 * Katmanlar normalde kayarak/ölçeklenerek belirir; hareket azaltma tercihinde ofset kalkar ve sonsuz
 * "devam" oku durur. Ölçüm gerçek tarayıcıda, gerçek CSS'in hesaplanmış değeridir: her sınıf için
 * KAPALI (dinlenme) durumundaki öğe sınanır; ofset yoksa "azaltılmış" durumun kanıtı boş kalırdı, bu
 * yüzden normal tercihte ofsetin VAR olması da iddia edilir.
 */

/** Export → kapalı durumdaki öğenin sınıfı ve normal tercihte beklenen dikey/yatay ofset. */
const RESTING = {
  ToastManager: { selector: 'vol-toast', offset: 'y' },
  Tooltip: { selector: 'vol-tooltip', offset: 'y' },
  Popup: { selector: 'vol-popup', offset: 'y' },
  DialogueBox: { selector: 'vol-dialogue', offset: 'y' },
  RadialMenu: { selector: 'vol-radial-menu', offset: 'scale' },
  /** Modal yalnız solar: kapalı durumda ofset yoktur, geçiş yalnız `opacity`dir. */
  Modal: { selector: 'vol-modal', offset: 'none' },
} as const satisfies Record<string, { selector: string; offset: 'y' | 'scale' | 'none' }>;

interface Probe {
  /** CSS `transform` hesaplanmış değeri (matris). */
  readonly transform: string;
  readonly animationName: string;
  readonly transitionProperty: string;
}

/** Sınıfı taşıyan boş bir öğe oluşturur ve hesaplanmış stilini okur; öğeyi geri kaldırır. */
async function probe(page: Page, classes: string, parent = 'body'): Promise<Probe> {
  return page.evaluate(
    ([names, parentSelector]) => {
      const host = document.querySelector(parentSelector);
      if (!host) throw new Error(`üst öğe yok: ${parentSelector}`);
      const element = document.createElement('div');
      element.className = names;
      host.appendChild(element);
      const style = getComputedStyle(element);
      const result = {
        transform: style.transform,
        animationName: style.animationName,
        transitionProperty: style.transitionProperty,
      };
      element.remove();
      return result;
    },
    [classes, parent],
  );
}

/** `matrix(a, b, c, d, tx, ty)` → bileşenler; `none` birim matristir. */
function matrix(value: string): { a: number; d: number; tx: number; ty: number } {
  if (value === 'none') return { a: 1, d: 1, tx: 0, ty: 0 };
  const parts = value
    .replace(/^matrix\(|\)$/g, '')
    .split(',')
    .map(Number);
  return { a: parts[0] ?? 1, d: parts[3] ?? 1, tx: parts[4] ?? 0, ty: parts[5] ?? 0 };
}

type Rest = (typeof RESTING)[keyof typeof RESTING];

interface Resting {
  /** Kapalı durumda kayma/ölçek ofseti var mı (normal tercihte ölçümün bir şey ölçtüğünün kanıtı). */
  readonly offsets: boolean;
  /** Dikey ofset ve ölçek yok mu (yatay -%50 ortalama taşıyan kutu hariç yatay ofset de yok). */
  readonly still: boolean;
  /** Geçiş özelliği listesi. */
  readonly transition: string;
}

/** Kapalı durumdaki öğeyi iki tercihte ölçer; testler sonucu kendi gövdelerinde iddia eder. */
async function restingStates(
  page: Page,
  spec: Rest,
): Promise<{ normal: Resting; reduced: Resting }> {
  await openShowcase(page);
  const measure = async (): Promise<Resting> => {
    const found = await probe(page, spec.selector);
    const m = matrix(found.transform);
    return {
      offsets: Math.abs(m.ty) > 0 || Math.abs(m.tx) > 0 || m.a !== 1 || m.d !== 1,
      // `DialogueBox` ortalamak için yatay -%50 taşır; yalnız dikey ofset ve ölçek kalkmalıdır.
      still:
        m.ty === 0 && m.a === 1 && m.d === 1 && (spec.selector === 'vol-dialogue' || m.tx === 0),
      transition: found.transitionProperty,
    };
  };
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const normal = await measure();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  return { normal, reduced: await measure() };
}

test('ToastManager: hareket azaltılmışta bildirim kayarak belirmez', async ({ page }) => {
  const { normal, reduced } = await restingStates(page, RESTING.ToastManager);
  expect(normal.offsets, 'normal tercihte kapalı bildirim ofsetli beklenir').toBe(true);
  expect(reduced.still).toBe(true);
});

test('Tooltip: hareket azaltılmışta balon kayarak belirmez', async ({ page }) => {
  const { normal, reduced } = await restingStates(page, RESTING.Tooltip);
  expect(normal.offsets, 'normal tercihte kapalı balon ofsetli beklenir').toBe(true);
  expect(reduced.still).toBe(true);
});

test('Popup: hareket azaltılmışta açılır katman kayarak belirmez', async ({ page }) => {
  const { normal, reduced } = await restingStates(page, RESTING.Popup);
  expect(normal.offsets, 'normal tercihte kapalı katman ofsetli beklenir').toBe(true);
  expect(reduced.still).toBe(true);
});

test('DialogueBox: hareket azaltılmışta kutu kayarak belirmez', async ({ page }) => {
  const { normal, reduced } = await restingStates(page, RESTING.DialogueBox);
  expect(normal.offsets, 'normal tercihte kapalı kutu ofsetli beklenir').toBe(true);
  expect(reduced.still).toBe(true);
});

test('RadialMenu: hareket azaltılmışta menü ölçeklenerek belirmez', async ({ page }) => {
  const { normal, reduced } = await restingStates(page, RESTING.RadialMenu);
  expect(normal.offsets, 'normal tercihte kapalı menü ölçekli beklenir').toBe(true);
  expect(reduced.still).toBe(true);
});

test('Modal: hareket azaltılmışta ve normalde yalnız solarak geçer, kayma yoktur', async ({
  page,
}) => {
  const { normal, reduced } = await restingStates(page, RESTING.Modal);
  for (const state of [normal, reduced]) {
    expect(state.offsets).toBe(false);
    expect(state.transition).toBe('opacity');
  }
});

test.describe('Sheet hareketi', () => {
  test('normal tercihte içerik yandan kayar, azaltılmışta kaymaz', async ({ page }) => {
    await openShowcase(page);
    // `.vol-sheet` içindeki içerik kabuğu: kapalı durumda 24px yatay ofsetle bekler.
    const markup = 'vol-modal vol-sheet';
    const content = async (): Promise<string> =>
      page.evaluate((classes) => {
        const sheet = document.createElement('div');
        sheet.className = classes;
        const inner = document.createElement('div');
        inner.className = 'vol-modal__content';
        sheet.appendChild(inner);
        document.body.appendChild(sheet);
        const value = getComputedStyle(inner).transform;
        sheet.remove();
        return value;
      }, markup);

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    expect(Math.abs(matrix(await content()).tx)).toBeGreaterThan(0);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(matrix(await content()).tx).toBe(0);
  });
});

test.describe('DialogueBox devam oku', () => {
  test('sonsuz zıplama yalnız normal tercihte döner', async ({ page }) => {
    await openShowcase(page);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const normal = await probe(page, 'vol-dialogue__continue vol-dialogue__continue--visible');
    expect(normal.animationName).toBe('vol-dialogue-bounce');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const reduced = await probe(page, 'vol-dialogue__continue vol-dialogue__continue--visible');
    expect(reduced.animationName).toBe('none');
  });
});
