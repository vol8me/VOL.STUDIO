import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * `src/` alt dizinleri arasında çalışma zamanı import yönü. Karşılıklı import
 * eden dizin çifti katmansız bir yapının işaretidir; bugün var olan çiftler
 * aşağıda sayılıdır ve liste yalnız küçülebilir: yeni çift kapıyı düşürür,
 * çözülen çift listeden silinmek zorundadır.
 */
const SRC = resolve(import.meta.dirname, '../../src');
const SCRIPTS = resolve(import.meta.dirname, '../../scripts');

const KNOWN_CYCLES = new Set([
  'analysis<->family',
  'effects<->synthesis',
  'engine<->guard',
  'engine<->protocol',
  'family<->program',
  'family<->protocol',
  'music<->program',
  'music<->protocol',
  'program<->protocol',
  'protocol<->search',
]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts') ? [path] : [];
  });
}

const layerOf = (file: string): string => {
  const parts = relative(SRC, file).split(sep);
  return parts.length > 1 ? parts[0] : '(root)';
};

/** Tip-only olmayan göreli import/export hedefleri. */
function runtimeTargets(file: string): string[] {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest);
  const targets: string[] = [];
  for (const statement of source.statements) {
    let specifier: ts.Expression | undefined;
    if (ts.isImportDeclaration(statement)) {
      const clause = statement.importClause;
      const typeOnly =
        clause?.isTypeOnly === true ||
        (clause !== undefined &&
          clause.name === undefined &&
          clause.namedBindings !== undefined &&
          ts.isNamedImports(clause.namedBindings) &&
          clause.namedBindings.elements.length > 0 &&
          clause.namedBindings.elements.every((element) => element.isTypeOnly));
      if (!typeOnly) specifier = statement.moduleSpecifier;
    } else if (ts.isExportDeclaration(statement) && !statement.isTypeOnly) {
      specifier = statement.moduleSpecifier;
    }
    if (specifier && ts.isStringLiteral(specifier) && specifier.text.startsWith('.')) {
      targets.push(resolve(dirname(file), specifier.text));
    }
  }
  return targets;
}

function directoryCycles(): string[] {
  const edges = new Set<string>();
  for (const file of sourceFiles(SRC)) {
    const from = layerOf(file);
    for (const target of runtimeTargets(file)) {
      if (relative(SRC, target).startsWith('..')) continue;
      const to = layerOf(target);
      if (to !== from) edges.add(`${from}->${to}`);
    }
  }
  const cycles = new Set<string>();
  for (const edge of edges) {
    const [a, b] = edge.split('->');
    if (edges.has(`${b}->${a}`)) cycles.add(a < b ? `${a}<->${b}` : `${b}<->${a}`);
  }
  return [...cycles].sort();
}

describe('src dizin katmanları', () => {
  const cycles = directoryCycles();

  it('yeni karşılıklı dizin bağımlılığı eklenmez', () => {
    expect(cycles.filter((cycle) => !KNOWN_CYCLES.has(cycle))).toEqual([]);
  });

  it('çözülen çift listeden silinir', () => {
    expect([...KNOWN_CYCLES].filter((cycle) => !cycles.includes(cycle))).toEqual([]);
  });
});

describe('betik importları', () => {
  // Protokol barrel'ı paket dışa aktarımıdır; betik onu alırsa her komut
  // bütün protokol grafiğini yükler. Betikler modülü doğrudan alır.
  it("betikler protokol barrel'ını almaz", () => {
    const barrel = join(SRC, 'protocol');
    const offenders = sourceFiles(SCRIPTS).filter((file) =>
      runtimeTargets(file).some((target) => target === barrel || target === join(barrel, 'index')),
    );
    expect(offenders.map((file) => relative(SCRIPTS, file))).toEqual([]);
  });
});
