import type { Attribution } from '@volstudio/core/ui';

/**
 * Vitrinin kredi ekranındaki üçüncü taraf varlıklar. Kaynak, depodaki varlık kayıtlarıdır
 * (`core/public/assets/<küme>/SOURCES.md`, `icons/CREDITS.md`, `fonts/OFL-<ad>.txt`, kök `NOTICE`); `tests/credits.test.ts`
 * her satırı o kayıtlarla karşılaştırır, böylece ekran kayıttan ayrışamaz.
 */
export interface CreditEntry extends Omit<Attribution, 'note'> {
  /** Çevrilmiş not türü: `cc0` atıf istemez, `icons` özgün ikon notu, `font` OFL notu. */
  readonly note?: 'cc0' | 'icons' | 'font';
}

export const CREDIT_ENTRIES: readonly CreditEntry[] = [
  {
    name: 'Phosphor Icons',
    version: '2.1.1',
    author: 'Phosphor Icons',
    license: 'MIT',
    source: 'https://phosphoricons.com',
    note: 'icons',
  },
  {
    name: 'Kenney Input Prompts',
    version: '1.5',
    author: 'Kenney',
    license: 'CC0 1.0',
    source: 'https://kenney.nl/assets/input-prompts',
    note: 'cc0',
  },
  {
    name: 'Kenney Cursor Pack',
    version: '1.1',
    author: 'Kenney',
    license: 'CC0 1.0',
    source: 'https://kenney.nl/assets/cursor-pack',
    note: 'cc0',
  },
  {
    name: 'Kenney Crosshair Pack',
    author: 'Kenney',
    license: 'CC0 1.0',
    source: 'https://kenney.nl/assets/crosshair-pack',
    note: 'cc0',
  },
  {
    name: 'Jura',
    author: 'The Jura Project Authors',
    license: 'SIL OFL 1.1',
    source: 'https://github.com/ossobuffo/jura',
    note: 'font',
  },
  {
    name: 'Exo 2',
    author: 'The Exo 2 Project Authors',
    license: 'SIL OFL 1.1',
    source: 'https://github.com/googlefonts/Exo-2.0',
    note: 'font',
  },
];
