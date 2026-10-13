import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildingParts } from './buildings';
import { fxParts } from './fx';
import { spiderParts } from './spider';
import { tankParts } from './tank';
import { worldParts } from './world';

/**
 * Sanat setinin bütün SVG kaynakları: dosya adı (uzantısız) → metin. `pnpm art` bunları
 * `src/art/kit/` içine yazar; ayrıca elle düzenlenmez, çünkü `tests/art/kit.test.ts` eşitliği sınar.
 */
export function buildKit(): Record<string, string> {
  return {
    ...spiderParts(),
    ...buildingParts(),
    ...tankParts(),
    ...worldParts(),
    ...fxParts(),
  };
}

const camel = (name: string): string =>
  name.replace(/-([a-z0-9])/g, (_match, letter: string) => letter.toUpperCase());

/** Prettier'ın yazacağı biçim: tanımlayıcı olan anahtar tırnaksızdır, böylece üretim biçim denetiminden geçer. */
const key = (name: string): string => (/^[A-Za-z_$][\w$]*$/.test(name) ? name : `'${name}'`);

const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const CATALOG_HEAD = `// Üretildi: \`pnpm art\` (scripts/art). Elle düzenlenmez; tests/art/kit.test.ts eşitliği sınar.`;

const CATALOG_TYPES = `export interface KitEntry {
  /** Vite'ın verdiği adres; SVG gömülmez (Phaser yükleyicisi \`data:\` adresini base64 sanır). */
  readonly url: string;
  /** SVG \`viewBox\` boyutu (tasarım birimi). */
  readonly width: number;
  readonly height: number;
}`;

/** Varlık kimliği birleşimi ve adresleri SVG dosyalarından türer: elle yazılan bir liste yoktur. */
export function kitCatalogSource(kit: Record<string, string>): string {
  const names = Object.keys(kit).sort(byCodeUnit);
  const imports = names.map((name) => `import ${camel(name)} from './${name}.svg';`).join('\n');
  const entries = names
    .map((name) => {
      const match = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(kit[name]);
      if (match === null) throw new Error(`${name}: viewBox yok`);
      return `  ${key(name)}: { url: ${camel(name)}, width: ${match[1]}, height: ${match[2]} },`;
    })
    .join('\n');
  return `${CATALOG_HEAD}\n${imports}\n\n${CATALOG_TYPES}\n\nexport const KIT = {\n${entries}\n} as const satisfies Record<string, KitEntry>;\n\nexport type AssetId = keyof typeof KIT;\n`;
}

export function writeKit(directory: string): number {
  mkdirSync(directory, { recursive: true });
  for (const name of readdirSync(directory))
    if (name.endsWith('.svg')) rmSync(join(directory, name));
  const kit = buildKit();
  for (const [name, text] of Object.entries(kit))
    writeFileSync(join(directory, `${name}.svg`), text);
  writeFileSync(join(directory, 'catalog.ts'), kitCatalogSource(kit));
  return Object.keys(kit).length;
}

if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const directory = join(import.meta.dirname, '../../src/art/kit');
  console.log(`${writeKit(directory)} SVG yazıldı: ${directory}`);
}
