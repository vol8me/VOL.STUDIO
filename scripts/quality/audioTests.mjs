import { execFileSync } from './command.mjs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const BASE_TESTS = [
  'tests/synthesis/dspCorrectness.test.ts',
  'tests/synthesis/retro.test.ts',
  'tests/program/instrument.test.ts',
  'tests/music/delivery.test.ts',
  'tests/governance/publishPath.test.ts',
  'tests/protocol/context.test.ts',
  'tests/protocol/character.test.ts',
  'tests/governance/dirLayers.test.ts',
];
const PREFIX = 'devtools/audio-synth/';

/** @param {Array<{status:string,path:string}> | null} changes @returns {string[][]} */
export function audioTestPlan(changes) {
  if (changes === null) return [['run']];
  const related = new Set();
  for (const change of changes) {
    if (!change.path.startsWith(PREFIX) && !change.path.startsWith('core/src/')) continue;
    if (change.status === 'D') return [['run']];
    if (change.path.startsWith(PREFIX)) {
      const local = change.path.slice(PREFIX.length);
      if (!/^(src|tests)\/.*\.ts$/.test(local)) return [['run']];
      related.add(local);
    } else related.add(`../../${change.path}`);
  }
  const plan = [['run', ...BASE_TESTS]];
  if (related.size) plan.push(['related', '--run', '--passWithNoTests', ...[...related].sort()]);
  return plan;
}

function changedFiles() {
  const git = (/** @type {string[]} */ args) =>
    execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  try {
    let base;
    try {
      base = git(['rev-parse', '--verify', '@{upstream}']);
    } catch {
      base = git(['merge-base', 'HEAD', 'origin/dev']);
    }
    const paths = new Set([
      ...git(['diff', '--name-only', base, '--']).split('\n'),
      ...git(['ls-files', '--others', '--exclude-standard', '--', PREFIX, 'core/src']).split('\n'),
    ]);
    const deleted = new Set(
      git(['diff', '--name-only', '--diff-filter=D', base, '--']).split('\n'),
    );
    return [...paths]
      .filter(Boolean)
      .map((path) => ({ path, status: deleted.has(path) ? 'D' : 'M' }));
  } catch {
    return null;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const args of audioTestPlan(changedFiles())) {
    execFileSync('pnpm', ['--filter', '@volstudio/audio-synth', 'exec', 'vitest', ...args], {
      stdio: 'inherit',
    });
  }
}
