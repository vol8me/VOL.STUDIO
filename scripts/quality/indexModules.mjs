import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { workingTreeFiles } from './gitFiles.mjs';
import { excludingFrozenPaths, loadRepoLifecycle } from './workspaceLifecycle.mjs';

/**
 * `src/**\/index.ts` YALNIZ yeniden dışa aktarım ve tip içerir.
 *
 * Paketlerin kapsam yapılandırması bu dosyaları toptan dışlar (`coverage.exclude`):
 * "çalıştırılabilir satırı olmayan dosya ölçüme girmez" kuralı ancak dosyada gerçekten
 * çalıştırılabilir satır yoksa doğrudur. İçine bir işlev ya da sabit konan `index.ts`
 * kapsam ölçümünün dışında kalır ve eşik hiçbir zaman onu sınamaz.
 *
 * İzin verilenler: import, yeniden dışa aktarım (`export … from`, `export { … }`), tip
 * takma adı/arayüz, `declare` bildirimleri ve bir tanımlayıcıyı `export default` etmek.
 */

/**
 * Bir `index.ts` metnindeki çalıştırılabilir ifadeler.
 * @param {string} file Yalnız iletide görünür.
 * @param {string} text
 * @returns {{ line: number, kind: string }[]}
 */
export function executableStatements(file, text) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const found = [];
  for (const node of source.statements) {
    if (isReExportOrType(node)) continue;
    const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
    found.push({ line: line + 1, kind: ts.SyntaxKind[node.kind] });
  }
  return found;
}

function isReExportOrType(node) {
  if (
    ts.isImportDeclaration(node) ||
    ts.isImportEqualsDeclaration(node) ||
    ts.isExportDeclaration(node) ||
    ts.isTypeAliasDeclaration(node) ||
    ts.isInterfaceDeclaration(node)
  ) {
    return true;
  }
  if (ts.isExportAssignment(node)) return ts.isIdentifier(node.expression);
  return (ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Ambient) !== 0;
}

/** @returns {string[]} sorun listesi; boşsa her `index.ts` yalnız yeniden dışa aktarır. */
export function validateIndexModules(root, lifecycle = loadRepoLifecycle(root)) {
  const files = excludingFrozenPaths(workingTreeFiles(root, ['*.ts']), lifecycle).filter((file) =>
    /(^|\/)src\/(?:.+\/)?index\.ts$/.test(file),
  );
  const problems = [];
  for (const file of files) {
    for (const { line, kind } of executableStatements(
      file,
      readFileSync(join(root, file), 'utf8'),
    )) {
      problems.push(
        `${file}:${line}: index.ts yalnız yeniden dışa aktarım ve tip içerebilir (${kind}); ` +
          'kapsam ölçümü bu dosyaları dışladığı için mantık sınanmaz — ayrı dosyaya taşıyın.',
      );
    }
  }
  return problems;
}
