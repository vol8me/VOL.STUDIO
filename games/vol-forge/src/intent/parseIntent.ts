export interface VisualIntentModifiers {
  readonly size?: readonly [number, number];
  readonly color?: string;
  readonly finish?: 'pixel' | 'smooth';
}

const MIN_SIZE = 8;
const MAX_SIZE = 2048;

const COLORS: ReadonlyArray<{ terms: readonly string[]; value: string }> = [
  { terms: ['pembe', 'pink'], value: '#c96f91' },
  { terms: ['mor', 'purple', 'violet'], value: '#8b67c6' },
  { terms: ['mavi', 'blue'], value: '#477fa8' },
  { terms: ['turkuaz', 'cyan', 'aqua'], value: '#3f9a9a' },
  { terms: ['yeşil', 'yesil', 'green'], value: '#64824d' },
  { terms: ['kırmızı', 'kirmizi', 'red'], value: '#a84f58' },
  { terms: ['turuncu', 'orange'], value: '#b86b42' },
  { terms: ['sarı', 'sari', 'yellow', 'altın', 'altin', 'gold'], value: '#b89446' },
  { terms: ['gri', 'gray', 'grey'], value: '#69727c' },
];

/**
 * Serbest niyetin evrensel ve dürüstçe uygulanabilir küçük bölümünü çözer.
 * Nesne anlambilimi taklit edilmez; yalnızca boyut, ana renk ve bitiriş gibi
 * her `SpriteDoc`ta aynı anlama gelen kararlar okunur.
 */
export function parseVisualIntent(prompt: string): VisualIntentModifiers {
  const normalized = prompt.toLocaleLowerCase('tr-TR');
  const rectangle = /(?:^|\D)(\d{1,4})\s*[x×]\s*(\d{1,4})(?:\D|$)/.exec(normalized);
  const square = rectangle
    ? null
    : /(?:^|\D)(\d{2,4})(?:\s*(?:px|piksel))?(?:\D|$)/.exec(normalized);
  const color = COLORS.find(({ terms }) => terms.some((term) => hasWord(normalized, term)))?.value;

  let finish: VisualIntentModifiers['finish'];
  if (['pürüzsüz', 'puruzsuz', 'smooth'].some((term) => hasWord(normalized, term))) {
    finish = 'smooth';
  } else if (['piksel', 'pixel', 'keskin', 'crisp'].some((term) => hasWord(normalized, term))) {
    finish = 'pixel';
  }

  const width = Number(rectangle?.[1] ?? square?.[1]);
  const height = Number(rectangle?.[2] ?? square?.[1]);
  const size =
    Number.isInteger(width) &&
    Number.isInteger(height) &&
    width >= MIN_SIZE &&
    width <= MAX_SIZE &&
    height >= MIN_SIZE &&
    height <= MAX_SIZE
      ? ([width, height] as const)
      : undefined;
  return { size, color, finish };
}

function hasWord(source: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\p{L}])${escaped}([^\\p{L}]|$)`, 'iu').test(source);
}
