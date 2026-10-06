#!/usr/bin/env node
/**
 * UI ilk referans kaydı (UI-00.5).
 *
 *   node scripts/quality/cli/ui-baseline.mjs record <etiket>
 *   node scripts/quality/cli/ui-baseline.mjs compare <önceki> <sonraki> [--strict]
 *   node scripts/quality/cli/ui-baseline.mjs list
 *
 * `record` vitrini ve VOL.TEST'i üretim olarak derler, iki motorda ekran ve
 * hareket özetlerini toplar, gönderilen baytları ölçer ve git dışı özel kayıt
 * alanına yazar. `compare` iki kaydı karşılaştırır; `--strict` kötüleşmede 1
 * döner. Bağlı olmayan ya da yerel ölçümü olmayan cihaz hücresi NOT-RUN yazılır.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { measureBundleBytes } from '../bundleSize.mjs';
import { execFileSync, spawnSync } from '../command.mjs';
import {
  BASELINE_DIR,
  BASELINE_SCHEMA,
  compareBaselines,
  countStatic,
  deviceCells,
  readPerfSummary,
  validateBaseline,
} from '../uiBaseline.mjs';

const root = process.cwd();
const [command, ...rest] = process.argv.slice(2);

function load(label) {
  const path = join(root, BASELINE_DIR, `${label}.json`);
  if (!existsSync(path)) {
    console.error(`kayıt yok: ${label}`);
    process.exit(2);
  }
  return JSON.parse(readFileSync(path, 'utf8'));
}

function run(args, options = {}) {
  const result = spawnSync('pnpm', args, { cwd: root, stdio: 'inherit', ...options });
  if (result.status !== 0) {
    console.error(`[ui-baseline] başarısız: pnpm ${args.join(' ')}`);
    process.exit(result.status ?? 1);
  }
}

function record(label) {
  const counts = countStatic(root);
  run(['--filter', './devtools/vol-showcase', 'build']);
  run(['--filter', './games/vol-test', 'build']);
  const bundles = {
    'devtools/vol-showcase': measureBundleBytes(join(root, 'devtools/vol-showcase/dist')),
    'games/vol-test': measureBundleBytes(join(root, 'games/vol-test/dist')),
  };

  const scratch = join(tmpdir(), `vol-ui-baseline-${process.pid}`);
  mkdirSync(scratch, { recursive: true });
  try {
    run(['exec', 'playwright', 'test', 'baseline.spec.ts'], {
      cwd: join(root, 'devtools/vol-showcase'),
      env: { ...process.env, UI_BASELINE_OUT: scratch },
    });
    const screens = {};
    const motion = {};
    for (const file of readdirSync(scratch).filter((name) => name.startsWith('screens-'))) {
      const data = JSON.parse(readFileSync(join(scratch, file), 'utf8'));
      screens[data.engine] = data.screens;
      motion[data.engine] = data.motion;
    }
    const revision = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
    }).trim();
    const dirty =
      execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim()
        .length > 0;

    const document = {
      schema: BASELINE_SCHEMA,
      label,
      gitRevision: revision,
      workingTreeDirty: dirty,
      host: { platform: process.platform, node: process.version },
      counts,
      bundles,
      screens,
      motion,
      perf: readPerfSummary(root),
      devices: deviceCells(),
    };
    const problems = validateBaseline(document);
    if (problems.length > 0) {
      for (const problem of problems) console.error(`  ✗ ${problem}`);
      process.exit(1);
    }
    mkdirSync(join(root, BASELINE_DIR), { recursive: true });
    const path = join(root, BASELINE_DIR, `${label}.json`);
    writeFileSync(path, `${JSON.stringify(document, null, 2)}\n`);
    console.log(`[ui-baseline] yazıldı: ${BASELINE_DIR}/${label}.json (git dışı)`);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

if (command === 'record' && rest[0]) {
  record(rest[0]);
} else if (command === 'compare' && rest.length >= 2) {
  const { changes, regressions } = compareBaselines(load(rest[0]), load(rest[1]));
  for (const line of changes) console.log(`  ~ ${line}`);
  for (const line of regressions) console.log(`  ✗ ${line}`);
  console.log(`[ui-baseline] ${changes.length} fark, ${regressions.length} kötüleşme`);
  process.exit(rest.includes('--strict') && regressions.length > 0 ? 1 : 0);
} else if (command === 'list') {
  const directory = join(root, BASELINE_DIR);
  const names = existsSync(directory)
    ? readdirSync(directory).filter((n) => n.endsWith('.json'))
    : [];
  for (const name of names) console.log(name.replace(/\.json$/, ''));
} else {
  console.error(
    'Kullanım: ui-baseline.mjs record <etiket> | compare <önceki> <sonraki> [--strict] | list',
  );
  process.exit(2);
}
