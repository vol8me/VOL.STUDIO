import { DisposableScope } from '@volstudio/core/lifecycle';
import { Text, watchTheme } from '@volstudio/core/ui';
import { i18n, i18next } from '@volstudio/core/i18n';
import { CONTRAST_PAIRS, evaluatePair, type ContrastPair } from './paletteContrast';
import { card, paletteGrid } from './shared';

interface PaletteGroup {
  titleKey: string;
  tokens: string[];
  /** 12 birimlik vol-palette-grid'de kart genişliği. Her satırın span toplamı 12. */
  span: 3 | 4 | 6;
}

const GROUPS: PaletteGroup[] = [
  // Satır 1: nötr temel tonlar — 6 + 6 = 12.
  {
    titleKey: 'volui:palette.surface',
    tokens: [
      '--vol-ui-bg',
      '--vol-ui-bg-subtle',
      '--vol-ui-surface-1',
      '--vol-ui-surface-2',
      '--vol-ui-surface-3',
      '--vol-ui-border-soft',
      '--vol-ui-border-strong',
    ],
    span: 6,
  },
  {
    titleKey: 'volui:palette.text',
    tokens: [
      '--vol-ui-text',
      '--vol-ui-text-secondary',
      '--vol-ui-text-muted',
      '--vol-ui-text-disabled',
      '--vol-ui-icon',
    ],
    span: 6,
  },
  // Satır 2: marka/aksan renk aileleri, yan yana — 4 + 4 + 4 = 12.
  {
    titleKey: 'volui:palette.brand',
    tokens: [
      '--vol-ui-brand-solid',
      '--vol-ui-brand-hover',
      '--vol-ui-brand-pressed',
      '--vol-ui-brand-subtle',
      '--vol-ui-brand-border',
      '--vol-ui-on-brand',
    ],
    span: 4,
  },
  {
    titleKey: 'volui:palette.support',
    tokens: [
      '--vol-ui-support-solid',
      '--vol-ui-support-hover',
      '--vol-ui-support-pressed',
      '--vol-ui-support-subtle',
      '--vol-ui-support-border',
      '--vol-ui-on-support',
    ],
    span: 4,
  },
  {
    titleKey: 'volui:palette.accent',
    tokens: [
      '--vol-ui-accent-solid',
      '--vol-ui-accent-hover',
      '--vol-ui-accent-pressed',
      '--vol-ui-accent-subtle',
      '--vol-ui-accent-border',
      '--vol-ui-on-accent',
    ],
    span: 4,
  },
  // Satır 3: dört semantik durum — 3 + 3 + 3 + 3 = 12.
  {
    titleKey: 'volui:palette.semanticSuccess',
    tokens: [
      '--vol-ui-success-solid',
      '--vol-ui-success-subtle',
      '--vol-ui-success-border',
      '--vol-ui-on-success',
    ],
    span: 3,
  },
  {
    titleKey: 'volui:palette.semanticWarning',
    tokens: [
      '--vol-ui-warning-solid',
      '--vol-ui-warning-subtle',
      '--vol-ui-warning-border',
      '--vol-ui-on-warning',
    ],
    span: 3,
  },
  {
    titleKey: 'volui:palette.semanticDanger',
    tokens: [
      '--vol-ui-danger-solid',
      '--vol-ui-danger-subtle',
      '--vol-ui-danger-border',
      '--vol-ui-on-danger',
    ],
    span: 3,
  },
  {
    titleKey: 'volui:palette.semanticInfo',
    tokens: [
      '--vol-ui-info-solid',
      '--vol-ui-info-subtle',
      '--vol-ui-info-border',
      '--vol-ui-on-info',
    ],
    span: 3,
  },
  // Satır 4: etkileşim durumları + overlay katmanları — 6 + 6 = 12.
  {
    titleKey: 'volui:palette.interaction',
    tokens: [
      '--vol-ui-hover-fill',
      '--vol-ui-pressed-fill',
      '--vol-ui-selected-fill',
      '--vol-ui-focus-ring',
      '--vol-ui-focus-halo',
      '--vol-ui-disabled-fill',
      '--vol-ui-disabled-border',
      '--vol-ui-disabled-text',
    ],
    span: 6,
  },
  {
    titleKey: 'volui:palette.overlay',
    tokens: [
      '--vol-ui-inverse-surface',
      '--vol-ui-inverse-text',
      '--vol-ui-overlay-panel',
      '--vol-ui-scrim',
      '--vol-ui-hairline-alpha',
      '--vol-ui-selection-glow',
    ],
    span: 6,
  },
];

/** Kaplama değişince kökteki token değerlerini yeniden okuyan satırlar; hex yazıları bayat kalmaz. */
type Refresh = () => void;

type TokenReader = (token: string) => string;

/** Her okuma çözümlenmiş stili yeniden alır: bazı ortamlarda (jsdom) `getComputedStyle` canlı değil anlık görüntüdür. */
const readRootToken: TokenReader = (token) =>
  getComputedStyle(document.documentElement).getPropertyValue(token).trim();

function buildSwatch(
  token: string,
  readToken: TokenReader,
  disposables: DisposableScope,
  refreshers: Refresh[],
): HTMLElement {
  const value = readToken(token);

  const swatch = document.createElement('div');
  swatch.className = 'vol-palette-swatch';

  // Renk, değeri kopyalamak yerine token'a bağlanır: kaplama değişince çip kendiliğinden döner.
  const chip = document.createElement('div');
  chip.className = 'vol-palette-swatch__chip';
  chip.style.background = `var(${token})`;
  swatch.appendChild(chip);

  const name = new Text(token.replace('--vol-ui-', ''), { variant: 'muted', tag: 'span' });
  name.element.classList.add('vol-palette-swatch__name');
  swatch.appendChild(name.element);

  const hex = new Text(value, { variant: 'muted', tag: 'span' });
  hex.element.classList.add('vol-palette-swatch__hex');
  swatch.appendChild(hex.element);

  disposables.addDestroyables(name, hex);
  refreshers.push(() => hex.setContent(readToken(token)));
  return swatch;
}

/**
 * ARIA gerekçesi: bir palet grubu SALT OKUNUR bir başvurudur; hücrelerinde etkileşim, düzenleme ya da ok tuşu
 * gezinmesi yoktur. `role="grid"` etkileşimli veri ızgarası içindir (hücre odağı, ok tuşları, satır/sütun başlıkları);
 * burada kullanmak ekran okuyucuya var olmayan bir klavye sözleşmesi vaat ederdi. Bu yüzden grup adlı bir LİSTEDİR
 * ("Yüzey, liste, 7 öğe"), her çip + ad + değer tek öğedir. Görsel ızgara yalnız CSS'tedir.
 */
function buildGroupGrid(
  group: PaletteGroup,
  title: string,
  readToken: TokenReader,
  disposables: DisposableScope,
  refreshers: Refresh[],
): HTMLElement {
  const grid = document.createElement('ul');
  grid.className = 'vol-palette-group__grid';
  // WebKit `list-style: none` listeyi okuyucudan düşürür; rol açıkça yazılır.
  grid.setAttribute('role', 'list');
  grid.setAttribute('aria-label', title);
  for (const token of group.tokens) {
    const item = document.createElement('li');
    item.className = 'vol-palette-group__item';
    item.appendChild(buildSwatch(token, readToken, disposables, refreshers));
    grid.appendChild(item);
  }
  return grid;
}

function pairName(token: string): string {
  return token.replace('--vol-ui-', '');
}

/** Bir çiftin satırı: ad, örnek (gerçek renkler), canlı oran ve yazıyla sonuç (renk tek taşıyıcı değildir). */
function buildContrastRow(
  pair: ContrastPair,
  readToken: TokenReader,
  disposables: DisposableScope,
  refreshers: Refresh[],
): HTMLTableRowElement {
  const row = document.createElement('tr');
  row.className = 'vol-palette-contrast__row';
  row.dataset.foreground = pair.foreground;
  row.dataset.background = pair.background;

  const name = document.createElement('th');
  name.scope = 'row';
  const nameText = new Text(
    i18next.t('volui:palette.pairOn', {
      foreground: pairName(pair.foreground),
      background: pairName(pair.background),
    }),
    { variant: 'muted', tag: 'span' },
  );
  nameText.element.classList.add('vol-palette-contrast__name');
  name.appendChild(nameText.element);

  // Örnek yalnız görseldir; oran ve sonuç aynı bilgiyi metin olarak taşır.
  const sample = document.createElement('td');
  const sampleBox = document.createElement('span');
  sampleBox.className = 'vol-palette-contrast__sample';
  sampleBox.setAttribute('aria-hidden', 'true');
  sampleBox.style.color = `var(${pair.foreground})`;
  sampleBox.style.background = `var(${pair.background})`;
  sampleBox.textContent = i18next.t('volui:palette.sample');
  sample.appendChild(sampleBox);

  const ratioCell = document.createElement('td');
  const ratioText = new Text('', { variant: 'muted', tag: 'span' });
  ratioText.element.classList.add('vol-palette-contrast__ratio');
  ratioCell.appendChild(ratioText.element);

  const resultCell = document.createElement('td');
  const resultText = new Text('', { variant: 'muted', tag: 'span' });
  resultText.element.classList.add('vol-palette-contrast__result');
  resultCell.appendChild(resultText.element);

  row.append(name, sample, ratioCell, resultCell);
  disposables.addDestroyables(nameText, ratioText, resultText);

  const locale = i18next.language || undefined;
  const format = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const minText = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(pair.min);
  refreshers.push(() => {
    const { ratio, passes } = evaluatePair(pair, readToken);
    row.dataset.ratio = ratio === null ? '' : String(ratio);
    row.dataset.result = ratio === null ? 'unknown' : passes ? 'pass' : 'fail';
    ratioText.setContent(ratio === null ? '—' : `${format.format(ratio)}:1`);
    // Anahtarlar düz metin: çeviri yüzeyi denetimi şablonlu anahtar adlarını göremez.
    resultText.setContent(
      ratio === null
        ? i18next.t('volui:palette.unknown')
        : passes
          ? i18next.t('volui:palette.pass', { min: minText })
          : i18next.t('volui:palette.fail', { min: minText }),
    );
  });
  return row;
}

/**
 * Karşıtlık çizelgesi: gerçek tablo (sütun ve satır başlıkları). Veri iki boyutlu ve karşılaştırmalıdır; salt okunur
 * olduğundan `role="grid"` değil yerel `<table>` semantiğidir.
 */
function buildContrastTable(
  readToken: TokenReader,
  disposables: DisposableScope,
  refreshers: Refresh[],
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-palette-contrast-wrap';

  const note = new Text(i18next.t('volui:palette.contrastNote'), { variant: 'muted' });
  disposables.addDestroyables(note);
  wrap.appendChild(note.element);

  const table = document.createElement('table');
  table.className = 'vol-palette-contrast';
  table.setAttribute('aria-label', i18next.t('volui:palette.contrast'));
  const headRow = table.createTHead().insertRow();
  for (const label of [
    i18next.t('volui:palette.colPair'),
    i18next.t('volui:palette.colSample'),
    i18next.t('volui:palette.colRatio'),
    i18next.t('volui:palette.colResult'),
  ]) {
    const header = document.createElement('th');
    header.scope = 'col';
    header.textContent = label;
    headRow.appendChild(header);
  }
  const body = table.createTBody();
  for (const pair of CONTRAST_PAIRS) {
    body.appendChild(buildContrastRow(pair, readToken, disposables, refreshers));
  }
  wrap.appendChild(table);
  return wrap;
}

export function buildPaletteTab(): { element: HTMLElement; destroy: () => void } {
  const container = document.createElement('div');
  container.className = 'vol-showcase-section';
  const disposables = new DisposableScope();

  const refreshers: Refresh[] = [];
  const cards = GROUPS.map((group) => {
    const title = i18n.tDynamic(group.titleKey);
    return card(title, buildGroupGrid(group, title, readRootToken, disposables, refreshers), {
      span: group.span,
    });
  });
  cards.push(
    card(
      i18next.t('volui:palette.contrast'),
      buildContrastTable(readRootToken, disposables, refreshers),
      { spanAll: true },
    ),
  );
  // Karşıtlık satırları boş doğar: ilk değerler çözümlenmiş token'lardan yazılır.
  for (const refresh of refreshers) refresh();

  container.appendChild(paletteGrid(cards));
  disposables.add(
    watchTheme(container, () => {
      for (const refresh of refreshers) refresh();
    }),
  );

  return {
    element: container,
    destroy: () => disposables.dispose(),
  };
}
