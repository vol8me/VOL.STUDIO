import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function nodeRuntimeProblem(root, version = process.versions.node) {
  const pinned = readFileSync(join(root, '.node-version'), 'utf8').trim();
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  if (!/^\d+\.\d+\.\d+$/.test(pinned) || manifest.engines?.node !== pinned) {
    return 'Node: .node-version ile package.json engines.node aynı kesin sürüm olmalı.';
  }
  if (version.replace(/^v/, '') !== pinned) {
    return `Node: ${pinned} gerekir; çalışan sürüm ${version}. .node-version sürümünü etkinleştir.`;
  }
  return null;
}
