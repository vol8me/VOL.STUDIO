#!/usr/bin/env node
/**
 * Kapıları sabitlenmiş Node ile koşturur. Yanlış sürüm testleri başka bir raporlayıcı
 * biçimiyle ve zamanlamayla koşturup kodla ilgisiz, yanıltıcı hatalar verir; bu yüzden
 * ilk adımda açık bir mesajla durur. Tek kaynak `nodeRuntimeProblem`dir (`doctor` da onu kullanır).
 */

import { resolve } from 'node:path';
import { nodeRuntimeProblem } from '../nodeRuntime.mjs';

const rootFlag = process.argv.indexOf('--root');
const root =
  rootFlag >= 0 ? resolve(process.argv[rootFlag + 1]) : resolve(import.meta.dirname, '../../..');
const problem = nodeRuntimeProblem(root);
if (problem) {
  console.error(problem);
  process.exit(1);
}
console.log(`Node ${process.versions.node}: .node-version ile aynı.`);
