#!/usr/bin/env node
/**
 * `contract` aşamasının bağımsız takımları. `just contract` hepsini art arda, kapı
 * koşucusu (`gatePlan.mjs`) eşzamanlı ve takım başına ayrı makbuzla koşar; ikisi de
 * komutu buradan alır, bu yüzden komut tek yerde tanımlıdır.
 *
 *   node scripts/quality/contractSuites.mjs [takım...]   # varsayılan: hepsi
 */
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from './command.mjs';
import { checkScriptCoverage, scriptCoverageFile } from './scriptCoverage.mjs';

/** Bekçilerin kendi testleri; `node --test` kalıpları kendisi açar. */
const NODE_TEST_PATTERNS = [
  'scripts/quality/tests/*.test.mjs',
  'scripts/linux/tests/*.test.mjs',
  'scripts/android/tests/*.test.mjs',
  'devtools/deck/tests/*.test.mjs',
];

/**
 * Testler geçici depolarda git koşar; kancanın GIT_* ortamı onları gerçek depoya
 * yönlendirmesin diye `clearGitEnvironment` ile silinir.
 */
/** LCOV, depo köküne göredir; `scriptCoverage.mjs` aynı yolu okur. */
const LCOV_RELATIVE = 'node_modules/.cache/vol-quality/scripts-coverage/lcov.info';

export const CONTRACT_SUITES = {
  'node-test': {
    command: process.execPath,
    // TAP stdout'a (kapı sayımı oradan okur), LCOV dosyaya gider; kapsam yalnız `scripts/` altıdır.
    args: [
      '--test',
      '--experimental-test-coverage',
      '--test-coverage-include=scripts/**/*.mjs',
      '--test-coverage-exclude=scripts/**/tests/**',
      '--test-reporter=tap',
      '--test-reporter-destination=stdout',
      '--test-reporter=lcov',
      `--test-reporter-destination=${LCOV_RELATIVE}`,
      ...NODE_TEST_PATTERNS,
    ],
    clearGitEnvironment: true,
    /** Koşudan önce LCOV dizini var olmalı; Node dizini kendisi açmaz. */
    prepare: (root) => mkdirSync(dirname(scriptCoverageFile(root)), { recursive: true }),
    /** Koşu yeşilse betik kapsamı eşiklerle karşılaştırılır. @returns {string[]} sorunlar */
    verify: (root) => checkScriptCoverage(root),
  },
  cli: { command: 'pnpm', args: ['run', 'contract'] },
};

const GIT_ENVIRONMENT = [
  'GIT_DIR',
  'GIT_INDEX_FILE',
  'GIT_WORK_TREE',
  'GIT_COMMON_DIR',
  'GIT_PREFIX',
];

export function suiteEnvironment(suite, base = process.env) {
  if (!suite.clearGitEnvironment) return base;
  return Object.fromEntries(Object.entries(base).filter(([key]) => !GIT_ENVIRONMENT.includes(key)));
}

/** Takımları sırayla koşar; ilk düşende durur. @returns {number} çıkış kodu */
export function runSuites(names, root = process.cwd()) {
  for (const name of names) {
    const suite = CONTRACT_SUITES[name];
    if (!suite) {
      console.error(
        `Bilinmeyen contract takımı: ${name}. Seçenekler: ${Object.keys(CONTRACT_SUITES).join(', ')}`,
      );
      return 2;
    }
    suite.prepare?.(root);
    const result = spawnSync(suite.command, suite.args, {
      cwd: root,
      env: suiteEnvironment(suite),
      stdio: 'inherit',
    });
    if (result.error) throw result.error;
    if (result.status !== 0) return result.status ?? 1;
    const problems = suite.verify?.(root) ?? [];
    if (problems.length > 0) {
      console.error(
        `##quality:${JSON.stringify({ kind: 'script-coverage', count: problems.length })}`,
      );
      for (const problem of problems) console.error(`  ✗ ${problem}`);
      return 1;
    }
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const requested = process.argv.slice(2);
  process.exitCode = runSuites(requested.length > 0 ? requested : Object.keys(CONTRACT_SUITES));
}
