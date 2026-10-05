import { buildListeningPackage, LISTENING_ROOT } from '../src/protocol/listening';
import { findRepoRoot } from './lib/args';

const started = performance.now();
const pkg = buildListeningPackage(findRepoRoot(process.cwd()));
process.stdout.write(
  `${JSON.stringify(
    {
      root: LISTENING_ROOT,
      page: `${LISTENING_ROOT}/index.html`,
      counts: pkg.counts,
      evidence: { wallMs: Number((performance.now() - started).toFixed(1)) },
    },
    null,
    2,
  )}\n`,
);
