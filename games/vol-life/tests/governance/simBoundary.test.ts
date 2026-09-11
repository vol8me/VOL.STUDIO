import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `runtime/sim` sınırı (DESIGN.md §12): simülasyon Phaser'sız ve sunumsuz koşar.
 * Sınır delinirse headless ölçüm ve kapsam ikisi birden imkânsızlaşır; hata
 * ancak Node'da çalıştırılmak istendiğinde, geç ve dolaylı görünür.
 */
const SIM_ROOT = resolve(import.meta.dirname, '../../src/runtime/sim');

const FORBIDDEN: ReadonlyArray<{ readonly pattern: RegExp; readonly reason: string }> = [
  { pattern: /^phaser(\/|$)/, reason: 'Phaser' },
  {
    pattern: /^@volstudio\/core$/,
    reason: "kök CORE barrel'ı Phaser'a bağlı modülleri ihraç eder; alt yol kullanılır",
  },
  { pattern: /^@volstudio\/tauri-v2(\/|$)/, reason: 'native kabuk' },
  { pattern: /^@\/(runtime\/(scene|ui|render)|app)(\/|$)/, reason: 'sunum ya da uygulama katmanı' },
  { pattern: /^\.\.\/(scene|ui|render)(\/|$)/, reason: 'sunum katmanı' },
];

const SPECIFIER =
  /\b(?:import|export)\s[^'"]*?\bfrom\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)|\bimport\s+['"]([^'"]+)['"]/g;

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function findForbiddenImports(source: string): string[] {
  const problems: string[] = [];
  for (const match of stripComments(source).matchAll(SPECIFIER)) {
    const specifier = match[1] ?? match[2] ?? match[3];
    const rule = FORBIDDEN.find(({ pattern }) => pattern.test(specifier));
    if (rule) problems.push(`${specifier} (${rule.reason})`);
  }
  return problems;
}

function simSources(dir: string = SIM_ROOT): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return simSources(path);
    return /\.(ts|mts)$/.test(entry.name) ? [path] : [];
  });
}

describe('runtime/sim import sınırı', () => {
  it('gerçek sim ağacında yasak import yoktur', () => {
    const files = simSources();
    expect(files.length, 'tarama boş bir ağaçta anlamsızdır').toBeGreaterThan(0);

    const problems = files.flatMap((file) =>
      findForbiddenImports(readFileSync(file, 'utf8')).map(
        (problem) => `${relative(SIM_ROOT, file)}: ${problem}`,
      ),
    );
    expect(problems).toEqual([]);
  });

  it('bilerek bozulmuş importların her biçimi yakalanır', () => {
    const broken = [
      "import Phaser from 'phaser';",
      "import type { Scene } from 'phaser';",
      "import { createRandom } from '@volstudio/core';",
      "import type { LifeHud } from '@/runtime/ui/LifeHud';",
      "import { createSaveManager } from '@/app/storage';",
      "export { LifeScene } from '../scene/LifeScene';",
      "const renderer = await import('../render/particles');",
      "import '@volstudio/tauri-v2';",
    ];
    for (const source of broken) {
      expect(findForbiddenImports(source), source).toHaveLength(1);
    }
  });

  it('CORE alt yolları, kardeş sim modülleri ve yorumdaki örnekler serbesttir', () => {
    const allowed = [
      "import { clamp } from '@volstudio/core/math';",
      "import { createSimRandom } from './rng';",
      "import type { SimRandom } from '@/runtime/sim/rng';",
      "// import Phaser from 'phaser';",
      "/* export { LifeScene } from '../scene/LifeScene'; */",
    ].join('\n');
    expect(findForbiddenImports(allowed)).toEqual([]);
  });
});
