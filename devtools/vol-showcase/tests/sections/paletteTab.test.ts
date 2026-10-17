import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildPaletteTab } from '../../src/sections/paletteTab';
import {
  CONTRAST_PAIRS,
  contrastRatio,
  evaluatePair,
  parseHexColor,
} from '../../src/sections/paletteContrast';

describe('parseHexColor', () => {
  it('3, 4, 6 ve 8 haneli onaltılık renkleri çözer; alfa yalnız 4 ve 8 haneliden gelir', () => {
    expect(parseHexColor('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseHexColor('#0f08')).toMatchObject({ r: 0, g: 255, b: 0 });
    expect(parseHexColor('#0f08')?.a).toBeCloseTo(0x88 / 255, 5);
    expect(parseHexColor(' #b85518 ')).toEqual({ r: 0xb8, g: 0x55, b: 0x18, a: 1 });
    expect(parseHexColor('#ffffff80')?.a).toBeCloseTo(0x80 / 255, 5);
  });

  it('çözülemeyen biçimler null döner (sahte renk üretilmez)', () => {
    for (const value of ['', 'rgb(0, 0, 0)', 'var(--x)', '#12', '#12345', 'red', '#gggggg']) {
      expect(parseHexColor(value), value).toBeNull();
    }
  });
});

describe('contrastRatio', () => {
  it('bilinen WCAG değerleri: siyah/beyaz 21, aynı renk 1, #767676 ≥ 4,5 ve #777777 < 4,5 beyaz üstünde', () => {
    expect(contrastRatio('#000000', '#ffffff', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#336699', '#336699', '#000000')).toBeCloseTo(1, 5);
    expect(contrastRatio('#767676', '#ffffff', '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#777777', '#ffffff', '#ffffff')).toBeLessThan(4.5);
  });

  it('sıra önemsizdir (açık/koyu hangisi ön renk olursa)', () => {
    const a = contrastRatio('#e8eef5', '#0d1115', '#0d1115');
    const b = contrastRatio('#0d1115', '#e8eef5', '#0d1115');
    expect(a).toBeCloseTo(b ?? Number.NaN, 5);
  });

  it('saydam ön renk bulunduğu zeminin SON rengi üstünde ölçülür (%50 siyah / beyaz → #7f7f7f)', () => {
    // alfa 128/255: kanal round(255 × (1 − 0,502)) = 127 → #7f7f7f, beyaza oranı ≈ 4,00
    const ratio = contrastRatio('#00000080', '#ffffff', '#ffffff');
    expect(ratio).toBeCloseTo(4.0, 1);
  });

  it('saydam zemin önce sayfa tabanına bileşilir', () => {
    // %50 beyaz, siyah tabanda #808080 olur; üstündeki beyaz yazı ≈ 3,95
    const ratio = contrastRatio('#ffffff', '#ffffff80', '#000000');
    expect(ratio).toBeCloseTo(3.95, 2);
  });

  it('çözülemeyen değerde null döner', () => {
    expect(contrastRatio('rgb(0,0,0)', '#ffffff', '#ffffff')).toBeNull();
    expect(contrastRatio('#000000', '', '#ffffff')).toBeNull();
    expect(contrastRatio('#000000', '#ffffff', 'var(--bg)')).toBeNull();
  });
});

describe('CONTRAST_PAIRS', () => {
  it('metin çiftleri 4,5, metin dışı çiftler 3 ister; her çift benzersizdir', () => {
    const keys = CONTRAST_PAIRS.map((pair) => `${pair.foreground}|${pair.background}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const pair of CONTRAST_PAIRS) {
      const nonText = /icon|focus-ring|border/.test(pair.foreground);
      expect(pair.min, pair.foreground).toBe(nonText ? 3 : 4.5);
    }
  });

  it('evaluatePair eşiği kapsayıcı uygular ve token okuyucuyu kullanır', () => {
    const pair = { foreground: '--f', background: '--b', min: 4.5 } as const;
    const read =
      (map: Record<string, string>) =>
      (token: string): string =>
        map[token] ?? '';
    const pass = evaluatePair(
      pair,
      read({ '--f': '#000000', '--b': '#ffffff', '--vol-ui-bg': '#ffffff' }),
    );
    expect(pass.passes).toBe(true);
    const fail = evaluatePair(
      pair,
      read({ '--f': '#777777', '--b': '#ffffff', '--vol-ui-bg': '#ffffff' }),
    );
    expect(fail.passes).toBe(false);
    expect(fail.ratio).toBeLessThan(4.5);
    // Eşik KAPSAYICIDIR (WCAG: "en az 4,5:1"): oran tam eşitken çift geçer.
    const exact = { foreground: '--f', background: '--b', min: 21 } as unknown as typeof pair;
    expect(
      evaluatePair(exact, read({ '--f': '#000000', '--b': '#ffffff', '--vol-ui-bg': '#ffffff' }))
        .passes,
    ).toBe(true);
    const unknown = evaluatePair(pair, read({}));
    expect(unknown).toEqual({ ratio: null, passes: false });
  });
});

describe('Palet sekmesi', () => {
  const TOKENS: Record<string, string> = {
    '--vol-ui-bg': '#0d1115',
    '--vol-ui-surface-1': '#182028',
    '--vol-ui-surface-2': '#202a33',
    '--vol-ui-surface-3': '#28333d',
    '--vol-ui-text': '#e8eef5',
    '--vol-ui-text-secondary': '#b5c1cc',
    '--vol-ui-text-muted': '#96a4b0',
    '--vol-ui-icon': '#c8d2dc',
    '--vol-ui-focus-ring': '#ffd37a',
    '--vol-ui-border-strong': '#6f7f8d',
  };
  for (const family of ['brand', 'support', 'accent', 'success', 'warning', 'danger', 'info']) {
    TOKENS[`--vol-ui-${family}-solid`] = '#b85518';
    TOKENS[`--vol-ui-on-${family}`] = '#fff6f0';
  }

  const setTokens = (tokens: Record<string, string>): void => {
    for (const [name, value] of Object.entries(tokens)) {
      document.documentElement.style.setProperty(name, value);
    }
  };

  beforeEach(() => setTokens(TOKENS));
  afterEach(() => {
    document.body.replaceChildren();
    document.documentElement.removeAttribute('style');
  });

  const rows = (root: ParentNode): HTMLElement[] => [
    ...root.querySelectorAll<HTMLElement>('.vol-palette-contrast__row'),
  ];

  it('her token grubu adlı bir listedir (grid değil) ve çiplerin ad ile değeri aynı öğededir', () => {
    const tab = buildPaletteTab();
    document.body.appendChild(tab.element);
    const lists = [...tab.element.querySelectorAll<HTMLElement>('ul.vol-palette-group__grid')];
    expect(lists).toHaveLength(11);
    for (const list of lists) {
      expect(list.getAttribute('role')).toBe('list');
      expect(list.getAttribute('aria-label')).toBeTruthy();
      for (const item of list.children) {
        expect(item.tagName).toBe('LI');
        expect(item.querySelector('.vol-palette-swatch__name')?.textContent).toBeTruthy();
      }
    }
    expect(tab.element.querySelector('[role="grid"]')).toBeNull();
    tab.destroy();
  });

  it('karşıtlık çizelgesi gerçek tablodur: sütun başlıkları, satır başlıkları ve her çift için bir satır', () => {
    const tab = buildPaletteTab();
    document.body.appendChild(tab.element);
    const table = tab.element.querySelector('table.vol-palette-contrast');
    expect(table?.getAttribute('aria-label')).toBeTruthy();
    expect(
      [...(table?.querySelectorAll('thead th') ?? [])].map((th) => th.getAttribute('scope')),
    ).toEqual(['col', 'col', 'col', 'col']);
    const body = rows(tab.element);
    expect(body).toHaveLength(CONTRAST_PAIRS.length);
    for (const row of body) {
      expect(row.querySelector('th')?.getAttribute('scope')).toBe('row');
      // Örnek yalnız görsel: oran ve sonuç metin olarak vardır.
      expect(row.querySelector('.vol-palette-contrast__sample')?.getAttribute('aria-hidden')).toBe(
        'true',
      );
      expect(row.querySelector('.vol-palette-contrast__ratio')?.textContent).toMatch(
        /\d[.,]\d{2}:1/,
      );
    }
    tab.destroy();
  });

  it('geçen çiftler "pass", kalan çift yazıyla "fail" olur ve ölçülemeyen token sahte oran yazmaz', () => {
    setTokens({ '--vol-ui-text-muted': '#2a343d', '--vol-ui-icon': 'rgb(1, 2, 3)' });
    const tab = buildPaletteTab();
    document.body.appendChild(tab.element);
    const byPair = (foreground: string, background: string): HTMLElement => {
      const found = rows(tab.element).find(
        (row) => row.dataset.foreground === foreground && row.dataset.background === background,
      );
      if (!found) throw new Error(`satır yok: ${foreground} / ${background}`);
      return found;
    };

    expect(byPair('--vol-ui-text', '--vol-ui-bg').dataset.result).toBe('pass');
    const failing = byPair('--vol-ui-text-muted', '--vol-ui-bg');
    expect(failing.dataset.result).toBe('fail');
    expect(failing.querySelector('.vol-palette-contrast__result')?.textContent).toMatch(
      /^(Fail|Kalır) \(< 4[.,]5:1\)$/,
    );
    const unknown = byPair('--vol-ui-icon', '--vol-ui-bg');
    expect(unknown.dataset.result).toBe('unknown');
    expect(unknown.querySelector('.vol-palette-contrast__ratio')?.textContent).toBe('—');
    tab.destroy();
  });

  it('kaplama değişince oranlar yeni token değerlerinden yeniden yazılır', async () => {
    const tab = buildPaletteTab();
    document.body.appendChild(tab.element);
    const first = rows(tab.element).find((row) => row.dataset.foreground === '--vol-ui-text-muted');
    expect(first?.dataset.result).toBe('pass');

    setTokens({ '--vol-ui-text-muted': '#2a343d' });
    document.documentElement.setAttribute('data-vol-theme', 'aurum');
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    const after = rows(tab.element).filter(
      (row) => row.dataset.foreground === '--vol-ui-text-muted',
    );
    expect(after.length).toBeGreaterThan(0);
    expect(after.every((row) => row.dataset.result === 'fail')).toBe(true);
    tab.destroy();
    document.documentElement.removeAttribute('data-vol-theme');
  });
});
