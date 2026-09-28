import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

export function syncProbeMetrics(root, webDir) {
  const source = readFileSync(join(root, 'core/src/time/frameSummary.ts'), 'utf8');
  const result = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      removeComments: true,
    },
  });
  const directory = join(webDir, 'vendor');
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'frame-summary.js'), result.outputText);
}
