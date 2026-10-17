import { join } from 'node:path';
import { buildSync } from 'esbuild';

export function syncProbeMetrics(root, webDir) {
  buildSync({
    absWorkingDir: root,
    entryPoints: [join(root, 'devtools/deck/scripts/probe-metrics-entry.mjs')],
    outfile: join(webDir, 'vendor/frame-summary.js'),
    bundle: true,
    platform: 'browser',
    format: 'esm',
    target: 'es2022',
    treeShaking: true,
    legalComments: 'none',
  });
}
