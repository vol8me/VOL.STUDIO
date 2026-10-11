import { expect, test, type Page } from '@playwright/test';
import { key, loadAxeRecords, scan, scanCached } from './support/accessibility';
import { openShowcase, selectTab, SHOWCASE_TABS, type ShowcaseTab } from './support/determinism';

/**
 * Skin × yoğunluk matrisi (UI-07.4): 2 skin × 3 yoğunlukta her sekmede axe ihlali SIFIRDIR, görünür odak göstergesi vardır ve
 * örtülmez, odak halkası her yüzeyde ≥ 3:1'dir; skin geometriye dokunmaz (iki motorda kutular birebir aynı, Chromium'da yerleşim
 * kayması sıfır); yoğunluk yalnız boşluk ölçeğini değiştirir (font ve radyus sabit). Varsayılan skin + rahat yoğunluk
 * `accessibility.spec.ts`in kapsamındadır ve burada tekrarlanmaz.
 */
const SKINS = ['default', 'aurum'] as const;
const DENSITIES = ['compact', 'comfortable', 'spacious'] as const;
type Skin = (typeof SKINS)[number];
type Density = (typeof DENSITIES)[number];

const COMBOS = SKINS.flatMap((skin) => DENSITIES.map((density) => ({ skin, density }))).filter(
  ({ skin, density }) => !(skin === 'default' && density === 'comfortable'),
);

async function openWith(page: Page, skin: Skin, density: Density): Promise<void> {
  await page.addInitScript(
    ([theme, spacing]) => {
      localStorage.setItem('device.volui:theme', JSON.stringify(theme));
      localStorage.setItem('device.volui:density', JSON.stringify(spacing));
    },
    [skin, density],
  );
  await openShowcase(page);
  await expect(page.locator('html')).toHaveAttribute('data-vol-theme', skin);
  await expect(page.locator('html')).toHaveAttribute('data-vol-density', density);
}

const records = loadAxeRecords();
const knownIncomplete = (tab: ShowcaseTab): Set<string> =>
  new Set(records.incomplete.filter((record) => record.scope === `tab/${tab}`).map(key));

test.describe('axe: skin × yoğunluk', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'axe sonucu motordan bağımsızdır');
  test.describe.configure({ timeout: 180_000 });

  for (const { skin, density } of COMBOS) {
    test(`${skin} / ${density}: her sekmede ihlal yok, incomplete kayıtlı`, async ({ page }) => {
      await openWith(page, skin, density);
      const problems: string[] = [];
      for (const tab of SHOWCASE_TABS) {
        await selectTab(page, tab);
        const found = await scanCached(page);
        // Eşitlik bekçisi: her skin×yoğunluk profilinde standart Playwright
        // frame taramasıyla sonuçlar birebir aynı olmalı. Böylece optimizasyon
        // erişilebilirlik kapsamını sessizce daraltamaz.
        if (tab === 'buttons' || tab === 'forms') {
          expect(found, `${skin}/${density}/${tab} axe sonuç paritesi`).toEqual(await scan(page));
        }
        for (const violation of found.violations) problems.push(`${tab}: ihlal ${key(violation)}`);
        const known = knownIncomplete(tab);
        for (const item of found.incomplete) {
          // Hesaplanamayan kontrast kaydı `finalContrast.spec.ts`te piksel ölçümüyle iki skinde kapsanır; YENİ olan elle bakılmalı.
          if (!known.has(key(item))) problems.push(`${tab}: kayıtsız incomplete ${key(item)}`);
        }
      }
      expect(problems).toEqual([]);
    });
  }
});

/** WCAG göreli parlaklık ve oran; `rgb()`/`#hex` ayrıştırır (alfa varsa yüzey üstüne bindirilir). */
function parseColor(value: string): [number, number, number, number] {
  const text = value.trim();
  if (text.startsWith('#')) {
    const hex =
      text.length === 4 ? [...text.slice(1)].map((c) => c + c).join('') : text.slice(1, 7);
    const alpha = text.length === 9 ? parseInt(text.slice(7, 9), 16) / 255 : 1;
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
      alpha,
    ];
  }
  const match = /rgba?\(([^)]+)\)/.exec(text);
  if (!match) throw new Error(`renk ayrıştırılamadı: ${value}`);
  const parts = match[1]
    .split(/[\s,/]+/)
    .filter(Boolean)
    .map(Number);
  return [parts[0], parts[1], parts[2], parts[3] ?? 1];
}

function luminance([r, g, b]: readonly number[]): number {
  const lin = (channel: number): number => {
    const v = channel / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: readonly number[], b: readonly number[]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

test.describe('odak göstergesi', () => {
  for (const skin of SKINS) {
    test(`${skin}: odak halkası her ana yüzeyde ≥ 3:1`, async ({ page }) => {
      await openWith(page, skin, 'comfortable');
      const tokens = await page.evaluate(() => {
        const style = getComputedStyle(document.documentElement);
        const read = (name: string): string => style.getPropertyValue(name).trim();
        return {
          ring: read('--vol-ui-focus-ring'),
          surfaces: ['--vol-ui-bg', '--vol-ui-surface-1', '--vol-ui-surface-2'].map(read),
        };
      });
      for (const surface of tokens.surfaces) {
        const base = parseColor(surface);
        const ring = parseColor(tokens.ring);
        // Yarı saydam halka yüzeyin üstüne bindirilir.
        const flat = ring.slice(0, 3).map((c, i) => c * ring[3] + base[i] * (1 - ring[3]));
        expect(contrast(flat, base), `${skin}: ${tokens.ring} / ${surface}`).toBeGreaterThanOrEqual(
          3,
        );
      }
    });
  }

  for (const { skin, density } of COMBOS) {
    test(`${skin} / ${density}: Tab ile gezilen denetimin göstergesi vardır ve örtülmez`, async ({
      page,
    }) => {
      await openWith(page, skin, density);
      const problems: string[] = [];
      for (const tab of ['buttons', 'forms', 'theme'] as const) {
        await selectTab(page, tab);
        // Sekme listesinden içeriğe geç: panelin ilk denetimine odak, sonra Tab ile gez.
        await page.locator('.vol-tabs__panels button, .vol-tabs__panels input').first().focus();
        for (let step = 0; step < 8; step += 1) {
          const problem = await page.evaluate(() => {
            const active = document.activeElement as HTMLElement | null;
            if (!active || active === document.body) return 'odak yok';
            // Görsel olarak gizli onay/radyo girişinde (1 px, kırpık) gösterge kardeş iz/noktadadır (`input:focus-visible ~ iz`).
            const hidden = active.matches('input[type="checkbox"], input[type="radio"]');
            const target =
              (hidden &&
                active.parentElement?.querySelector<HTMLElement>(
                  '[class*="__track"], [class*="__dot"]',
                )) ||
              active;
            const style = getComputedStyle(target);
            const outlined =
              style.outlineStyle !== 'none' &&
              parseFloat(style.outlineWidth) >= 2 &&
              style.outlineColor !== 'rgba(0, 0, 0, 0)';
            const shadowed = style.boxShadow !== 'none';
            const textField = active.matches('input, textarea, [role="textbox"]') && !hidden;
            const name = `${target.tagName.toLowerCase()}.${String(target.className).slice(0, 40)}`;
            if (!outlined && !shadowed && !textField) return `gösterge yok: ${name}`;
            const rect = target.getBoundingClientRect();
            const top = document.elementFromPoint(
              rect.left + rect.width / 2,
              rect.top + rect.height / 2,
            );
            if (!top) return `görünür alan dışında: ${name}`;
            if (top !== target && !target.contains(top) && !top.contains(target)) {
              return `örtülü (${top.tagName.toLowerCase()}.${String(top.className).slice(0, 40)}): ${name}`;
            }
            return null;
          });
          if (problem) problems.push(`${tab}#${step}: ${problem}`);
          await page.keyboard.press('Tab');
        }
      }
      expect(problems).toEqual([]);
    });
  }
});

interface Box {
  readonly path: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly font: string;
  readonly radius: string;
}

/** Etkin sekme panelindeki görünür öğelerin kutuları (sıralı, kimlikleri DOM sırası) ve font/radyus değerleri. */
const collect = (page: Page): Promise<Box[]> =>
  page.evaluate(() => {
    const panel = document.querySelector('[role="tabpanel"]:not([aria-hidden="true"])');
    if (!panel) return [];
    return [...panel.querySelectorAll<HTMLElement>('*')]
      .map((element, index) => ({ element, index }))
      .filter(({ element }) => {
        const r = element.getBoundingClientRect();
        // Kayan segment vurgusu SEÇİMİ izler (skin seçici de bir seçimdir): geometri değil durumdur.
        return (
          r.width > 0 &&
          r.height > 0 &&
          !element.closest('canvas, svg') &&
          !element.matches('.vol-segmented__thumb')
        );
      })
      .map(({ element, index }) => {
        const r = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          path: `${index}:${element.tagName.toLowerCase()}`,
          x: Math.round(r.left * 2) / 2,
          y: Math.round(r.top * 2) / 2,
          w: Math.round(r.width * 2) / 2,
          h: Math.round(r.height * 2) / 2,
          font: `${style.fontSize}/${style.fontFamily}`,
          radius: style.borderRadius,
        };
      });
  });

const settle = (page: Page): Promise<void> =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );

test.describe('geometri', () => {
  test.describe.configure({ timeout: 180_000 });

  test('skin değişince hiçbir kutu, font ya da radyus değişmez (her sekme)', async ({ page }) => {
    await openWith(page, 'default', 'comfortable');
    const before = new Map<ShowcaseTab, Box[]>();
    for (const tab of SHOWCASE_TABS) {
      await selectTab(page, tab);
      before.set(tab, await collect(page));
    }
    await page.locator('.vol-showcase-skin-button').click();
    await expect(page.locator('html')).toHaveAttribute('data-vol-theme', 'aurum');
    await settle(page);
    const problems: string[] = [];
    for (const tab of SHOWCASE_TABS) {
      await selectTab(page, tab);
      const after = await collect(page);
      const reference = before.get(tab) ?? [];
      if (after.length !== reference.length) {
        problems.push(`${tab}: kutu sayısı ${reference.length} → ${after.length}`);
        continue;
      }
      reference.forEach((box, index) => {
        const next = after[index];
        if (JSON.stringify(box) !== JSON.stringify(next) && problems.length < 20) {
          problems.push(`${tab}: ${box.path} ${JSON.stringify(box)} → ${JSON.stringify(next)}`);
        }
      });
    }
    expect(problems).toEqual([]);
  });

  test('yoğunluk yalnız boşluk ölçeğini değiştirir: font ve radyus sabit (her sekme)', async ({
    page,
  }) => {
    await openWith(page, 'default', 'comfortable');
    const before = new Map<ShowcaseTab, Box[]>();
    for (const tab of SHOWCASE_TABS) {
      await selectTab(page, tab);
      before.set(tab, await collect(page));
    }
    // Yoğunluk seçicisi Tema sekmesindedir (üst çubukta yoktur).
    await selectTab(page, 'theme');
    await page.locator('.vol-theme-lab__global .vol-select').click();
    await page.getByRole('option', { name: 'Compact', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-vol-density', 'compact');
    await settle(page);
    const problems: string[] = [];
    let moved = 0;
    for (const tab of SHOWCASE_TABS) {
      await selectTab(page, tab);
      const after = await collect(page);
      const reference = before.get(tab) ?? [];
      if (after.length !== reference.length) {
        problems.push(`${tab}: kutu sayısı ${reference.length} → ${after.length}`);
        continue;
      }
      reference.forEach((box, index) => {
        const next = after[index];
        if (box.y !== next.y || box.x !== next.x) moved += 1;
        if ((box.font !== next.font || box.radius !== next.radius) && problems.length < 20) {
          problems.push(
            `${tab}: ${box.path} ${box.font}/${box.radius} → ${next.font}/${next.radius}`,
          );
        }
      });
    }
    expect(problems).toEqual([]);
    // Sınama boş geçmesin: yoğunluk gerçekten boşluğu (konumları) değiştirmiştir.
    expect(moved).toBeGreaterThan(100);
  });
});

test.describe('yerleşim kayması', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'layout-shift yalnız Chromium');

  for (const tab of ['buttons', 'forms', 'theme', 'hud', 'cards'] as const) {
    test(`skin değişimi ${tab} sekmesinde yerleşim kayması üretmez`, async ({ page }) => {
      await openWith(page, 'default', 'comfortable');
      await selectTab(page, tab);
      await settle(page);
      await page.evaluate(() => {
        const w = window as unknown as { shifts: string[] };
        w.shifts = [];
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const shift = entry as unknown as {
              value: number;
              sources: { node: Element | null }[];
            };
            const names = shift.sources.map((source) => {
              const node = source.node as HTMLElement | null;
              return node
                ? `${node.tagName.toLowerCase()}.${String(node.className).slice(0, 40)}`
                : '?';
            });
            w.shifts.push(`${shift.value}: ${names.join(', ')}`);
          }
        }).observe({ type: 'layout-shift', buffered: false });
      });
      await page.locator('.vol-showcase-skin-button').click();
      await expect(page.locator('html')).toHaveAttribute('data-vol-theme', 'aurum');
      await settle(page);
      await page.waitForTimeout(150);
      const shifts = await page.evaluate(() => (window as unknown as { shifts: string[] }).shifts);
      // Ölçülen: yalnız bir ::before sözde öğesinde ~6e-7 (piksel altı yuvarlama); gerçek kutu kayması yok. Bütçe "iyi" eşiğinin (0,1)
      // binde biridir: bundan büyük her kayma gerçek bir yerleşim değişimidir.
      const total = shifts.reduce((sum, entry) => sum + Number(entry.split(':')[0]), 0);
      expect(total, `tema geçişi yerleşimi kaydırmaz: ${shifts.join(' | ')}`).toBeLessThan(0.0001);
    });
  }
});
