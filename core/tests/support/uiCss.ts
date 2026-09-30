import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/** CORE UI stil kökü; stiller bileşen gruplarının yanında durur. */
export const UI_CSS_DIR = resolve(import.meta.dirname, '../../src/ui');

/** `ui` altındaki her stil dosyası, `ui`ye göreli yolla (`overlays/overlays.css`). */
export function uiCssFiles(): Map<string, string> {
  const files = new Map<string, string>();
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.css')) {
        files.set(relative(UI_CSS_DIR, path).split('\\').join('/'), readFileSync(path, 'utf-8'));
      }
    }
  };
  walk(UI_CSS_DIR);
  return files;
}

export function readUiCss(path: string): string {
  return readFileSync(join(UI_CSS_DIR, path), 'utf-8');
}

/** Bütün UI stil sayfası tek metin; kuralın hangi grupta durduğu önemli değilse. */
export function allUiCss(): string {
  return [...uiCssFiles().values()].join('\n');
}
