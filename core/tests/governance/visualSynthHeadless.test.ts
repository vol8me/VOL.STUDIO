import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * `core/src/visualSynth/` DOM tanımaz ve Node-only kod barrel'a girmez — D8.
 *
 * İki ayrı sızıntı biçimi var ve ikisi de sessizdir:
 *
 * 1. **DOM sızıntısı.** `Canvas`/`ImageData`/`document` kullanan bir yardımcı
 *    testlerde (jsdom) sorunsuz koşar ve yalnızca `tsx` ile asset üretilirken
 *    patlar — yani en geç fark edilen yerde.
 * 2. **Node sızıntısı.** `node:fs`/`node:zlib` barrel'a girerse tarayıcı
 *    paketi build sırasında kırılır. Ses tarafında `writer` alt-yolu bu
 *    yüzden ayrıdır; görsel tarafta karşılığı `visualSynth/encode/`dir.
 */
const DOM_GLOBALS = ['document', 'window', 'HTMLCanvasElement', 'ImageData', 'navigator'];

/** Node-only kodun yaşamasına izin verilen tek alt yol. */
const NODE_ONLY_PREFIX = 'encode/';

/**
 * Yorumları düşürür — bekçi KODU tarar, prosayı değil.
 *
 * D8'in kendi cümlesi ("`Canvas`, `ImageData`, `window` geçmez") kaynak
 * dosyanın başında yazılıdır ve düz tarama onu ihlal sayıyordu. Bir bekçinin
 * kendi yanlış pozitifi, koruduğu şeyden daha hızlı devre dışı bırakılır.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*$/gm, ' ');
}

function collect(root: string, dir: string, out: Array<[string, string]>): void {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collect(root, full, out);
      continue;
    }
    if (!entry.endsWith('.ts')) continue;
    out.push([
      relative(root, full).replace(/\\/g, '/'),
      stripComments(readFileSync(full, 'utf-8')),
    ]);
  }
}

describe('görsel çekirdek headless kalmalı (D8)', () => {
  const root = join(import.meta.dirname, '../../src/visualSynth');
  const files: Array<[string, string]> = [];
  collect(root, root, files);

  it('taranacak dosya bulunur', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it('hiçbir dosya DOM global(ler)ine dokunmaz', () => {
    const violations: string[] = [];
    for (const [path, source] of files) {
      for (const global of DOM_GLOBALS) {
        if (new RegExp(`\\b${global}\\b`).test(source)) violations.push(`${path}: ${global}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('node: importları yalnızca encode/ alt yolunda bulunur', () => {
    const violations = files
      .filter(([path, source]) => !path.startsWith(NODE_ONLY_PREFIX) && /from 'node:/.test(source))
      .map(([path]) => path);
    expect(violations).toEqual([]);
  });

  it('barrel Node-only alt yolu yeniden dışa açmaz', () => {
    const barrel = readFileSync(join(root, 'index.ts'), 'utf-8');
    expect(barrel).not.toMatch(/\.\/encode/);
  });
});
