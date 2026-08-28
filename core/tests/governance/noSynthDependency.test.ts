import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

const CORE_ROOT = join(import.meta.dirname, '../../');

const FORBIDDEN_PACKAGES = ['@volstudio/visual-synth', '@volstudio/audio-synth'] as const;
const SKIP_DIRS = new Set(['node_modules', 'dist', '.cache', 'test-results', 'coverage']);
const SCANNED_EXTENSIONS = new Set(['.ts', '.js', '.json', '.md']);
const SKIP_FILES = new Set(['tests/governance/noSynthDependency.test.ts']);

function walk(dir: string, visit: (relPath: string, code: string) => void): void {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const fullPath = join(dir, entry);
    const st = statSync(fullPath);
    if (st.isDirectory()) {
      walk(fullPath, visit);
    } else if (SCANNED_EXTENSIONS.has(extname(fullPath))) {
      const relPath = fullPath.replace(CORE_ROOT, '');
      if (SKIP_FILES.has(relPath)) continue;
      const code = readFileSync(fullPath, 'utf-8');
      visit(relPath, code);
    }
  }
}

describe('CORE devtools synth paketlerine bağımlı değil', () => {
  it('core içinde visual-synth/audio-synth package adı yok', () => {
    const violations: string[] = [];
    walk(CORE_ROOT, (relPath, code) => {
      for (const pkg of FORBIDDEN_PACKAGES) {
        if (code.includes(pkg)) {
          violations.push(`${relPath}: ${pkg}`);
        }
      }
    });
    expect(violations).toEqual([]);
  });

  it('core package.json synth paketlerine dependency vermiyor', () => {
    const pkg = JSON.parse(readFileSync(join(CORE_ROOT, 'package.json'), 'utf-8')) as {
      dependencies?: Record<string, unknown>;
      devDependencies?: Record<string, unknown>;
      peerDependencies?: Record<string, unknown>;
    };
    const allDeps = new Set([
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
      ...Object.keys(pkg.peerDependencies ?? {}),
    ]);
    const violations = FORBIDDEN_PACKAGES.filter((p) => allDeps.has(p));
    expect(violations).toEqual([]);
  });
});
