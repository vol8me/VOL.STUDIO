import { createHash } from 'node:crypto';
import { CURSOR_HOTSPOT, CURSOR_SIZE, cursorFiles } from './cursors.mjs';
import { FRAME_SLICE, frameFiles } from './frames.mjs';
import { ICON_NAMES, ICON_SIZES, STROKE_PX, iconSprite } from './icons.mjs';
import { GRAIN, textureFiles } from './textures.mjs';

/**
 * UI varlıklarının SAF üretimi: `(tokens, seed) → { path → içerik }`. Dosya
 * sistemine dokunmaz; CLI (`index.mjs`) yazar/denetler, testler aynı işlevi
 * çağırır. Aynı tohum ve aynı tokenlar her zaman aynı baytları ve aynı manifesti
 * verir (zaman damgası, makine yolu, sıralaması belirsiz yapı yok).
 */
export const UI_ASSET_SEED = 0x564f4c; // "VOL"
export const GENERATOR_VERSION = 1;

/** Çerçeve/imleç için gereken token anahtarları: eksik biri açık hata verir. */
const REQUIRED_TOKENS = [
  'uiBg',
  'uiText',
  'brandSolid',
  'panel',
  'plate',
  'well',
  'plateTopLight',
  'wellInnerShadow',
  'hairlineAlpha',
  'frameHairline',
  'frameCorner',
  'frameHeader',
  'frameDivider',
];

const sha256 = (text) => createHash('sha256').update(text).digest('hex');

/**
 * @param {{ tokens: Record<string, Record<string, string>>, seed?: number }} input
 *   `tokens`: tema adı → o temanın TÜM renk tokenları (varsayılan + geçersiz kılmalar).
 * @returns {Map<string, string>} yol (varlık köküne göreli) → içerik; `manifest.json` ve `SOURCES.md` dahil.
 */
export function buildUiAssets({ tokens, seed = UI_ASSET_SEED }) {
  const themes = Object.keys(tokens);
  if (!themes.includes('default')) throw new Error('ui-assets: default tema tokenları yok');
  const files = new Map();

  for (const size of ICON_SIZES) files.set(`icons/icons-${size}.svg`, iconSprite(size));
  for (const theme of themes) {
    for (const key of REQUIRED_TOKENS) {
      if (!/^#[0-9a-f]{6}([0-9a-f]{2})?$/.test(tokens[theme][key] ?? ''))
        throw new Error(`ui-assets: ${theme} teması ${key} tokenı eksik ya da geçersiz`);
    }
    for (const [path, content] of frameFiles(theme, tokens[theme])) files.set(path, content);
    for (const [path, content] of cursorFiles(theme, tokens[theme])) files.set(path, content);
  }
  for (const [path, content] of textureFiles(seed)) files.set(path, content);

  const sorted = [...files.keys()].sort();
  const entries = sorted.map((path) => ({
    path,
    bytes: Buffer.byteLength(files.get(path), 'utf8'),
    sha256: sha256(files.get(path)),
  }));
  const manifest = {
    schema: 'UiAssetsV1',
    generator: { name: 'core/scripts/ui-assets', version: GENERATOR_VERSION },
    seed,
    themes,
    icons: {
      names: ICON_NAMES,
      sizes: ICON_SIZES,
      grid: 24,
      color: 'currentColor',
      strokePx: STROKE_PX,
      sprite: 'icons/icons-<boyut>.svg#<ad>',
    },
    frames: {
      pieces: ['panel', 'plate', 'well', 'header', 'divider'],
      slice: FRAME_SLICE,
      path: 'frames/<tema>/<parça>.svg',
    },
    textures: {
      grain: { size: GRAIN.size, specks: GRAIN.count, seeded: true },
      scanlines: { seeded: false },
      dots: { seeded: false },
    },
    cursors: {
      size: CURSOR_SIZE,
      hotspot: CURSOR_HOTSPOT,
      names: ['arrow', 'pointer'],
      path: 'cursors/<tema>/<ad>.svg',
    },
    density: { unit: 'CSS px', note: 'vektör; 1x tasarım ölçüsü, 2x ve 3x ekranda keskin kalır' },
    fallbacks: {
      blur: {
        token: '--vol-ui-scrim',
        rule: 'bulanıklık yok ya da bütçe doluysa düz scrim kullanılır',
      },
      motion: 'varlıklar durağandır; azaltılmış harekette değişen bir şey yoktur',
    },
    files: entries,
    totalBytes: entries.reduce((sum, entry) => sum + entry.bytes, 0),
  };
  files.set('manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);
  files.set('SOURCES.md', sourcesDocument(manifest));
  return files;
}

function sourcesDocument(manifest) {
  return [
    '# UI varlıkları — kaynak kaydı',
    '',
    'Bu dizindeki dosyalar **üretilir**; elle düzenlenmez. Kaynak: `core/scripts/ui-assets/`',
    '(üretici) ve tema tokenları (`core/src/ui/colors.ts`, `core/src/ui/themes/`). Üretim',
    '`pnpm gen:ui-assets` ile yapılır, `--check` yazmadan sapmayı bildirir.',
    '',
    '- Köken: özgün üretim (üçüncü taraf varlık yok); proje lisansı geçerlidir.',
    `- Üretici: ${manifest.generator.name} v${manifest.generator.version}.`,
    `- Tohum: ${manifest.seed} (0x${manifest.seed.toString(16)}).`,
    `- Temalar: ${manifest.themes.join(', ')}.`,
    `- Dosya: ${manifest.files.length} dosya, ${manifest.totalBytes} bayt.`,
    '- Biçim: yalnız vektör SVG; raster ya da video yok.',
    '',
    '## Düzen',
    '',
    '- `icons/icons-16|24|32|48.svg`: tek renkli çizgi ikon spritelar (24 ızgara, `currentColor`).',
    '- `frames/<tema>/`: 9-dilimli panel/plate/well, başlık şeridi, ayraç.',
    '- `textures/`: durağan döşemeler (`grain` tohumlu).',
    '- `cursors/<tema>/`: ok ve vurgulu ok imleci (etkin nokta ok ucu).',
    '- `manifest.json`: dosya başına bayt ve sha256, ikon adları, dilim ve etkin nokta verisi.',
    '',
  ].join('\n');
}
