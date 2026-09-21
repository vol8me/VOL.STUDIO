import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import ts from 'typescript';

export const CORE_TYPE_SURFACE_SHA256 =
  '466990d36b1eb890a5dddfee5a8190edcdf524239dfdc6aa3346df09cb179cf2';

export function corePublicTypeNames(root) {
  const coreRoot = resolve(root, 'core');
  const configPath = resolve(coreRoot, 'tsconfig.json');
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, coreRoot);
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  const index = program.getSourceFile(resolve(coreRoot, 'src/index.ts'));
  if (!index) throw new Error('core/src/index.ts TypeScript programında bulunamadı.');
  const checker = program.getTypeChecker();
  const module = checker.getSymbolAtLocation(index);
  if (!module) throw new Error('CORE index modül sembolü çözümlenemedi.');
  return checker
    .getExportsOfModule(module)
    .map((symbol) => symbol.getName())
    .sort();
}

export function validateCoreTypeSurface(root, expected = CORE_TYPE_SURFACE_SHA256) {
  const names = corePublicTypeNames(root);
  const actual = createHash('sha256').update(names.join('\0')).digest('hex');
  return actual === expected
    ? []
    : [
        `CORE type-level public yüzeyi değişti (${names.length} sembol, sha256=${actual}). ` +
          'Runtime listesi type-only exportları göremez; değişikliği inceleyip kaydı bilinçli yenile.',
      ];
}
