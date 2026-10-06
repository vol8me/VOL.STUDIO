import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import ts from 'typescript';

/**
 * KATALOG: CORE UI bileşenlerinin çoğunun bir üründe tüketicisi yoktur ve
 * bilinçli olarak bekletilir. Bekletilen bileşen iki kanıt taşır: vol-showcase
 * vitrininde gösterilir ve CORE testlerinde adıyla sınanır. İkisi yoksa
 * bileşen katalog değil kalıntıdır.
 *
 * Bileşen = CORE kökünden dışa açılan ve `core/src/ui/` altında bildirilen
 * sınıf. Kendi başına gösterilmeyen parça ya da görsel olmayan katman
 * `SHOWN_VIA`da gerekçesiyle durur; `via` verilmişse o ad vitrinde geçmelidir.
 */
export const SHOWN_VIA = {
  ToolButton: { via: 'Toolbar', reason: 'araç çubuğunun öğesi; çubukla birlikte çizilir' },
  Glyph: { via: 'createGlyph', reason: 'glif sunum denetleyicisi üzerinden üretilir' },
  UIRoot: {
    via: null,
    reason: 'görsel olmayan bağlama katmanı; vitrin kendi kökünü kurar',
  },
  ThemeController: {
    via: null,
    reason: "görsel olmayan tema/yoğunluk sahibi; vitrin üst bar seçicisi UI-07.4'te bağlanır",
  },
  MotionController: {
    via: null,
    reason: 'görsel olmayan hareket bütçesi sahibi; ilk tüketici UI-03.1 pilotudur',
  },
};

function sourceText(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(ts|mts)$/.test(entry.name))
    .map((entry) => readFileSync(join(entry.parentPath, entry.name), 'utf8'))
    .join('\n');
}

/** CORE kökünden dışa açılan UI bileşen sınıfları: `{ name, file }`. */
export function coreUiComponents(root) {
  const coreRoot = resolve(root, 'core');
  const config = ts.readConfigFile(resolve(coreRoot, 'tsconfig.json'), ts.sys.readFile);
  if (config.error)
    throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, coreRoot);
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  const checker = program.getTypeChecker();
  const index = program.getSourceFile(resolve(coreRoot, 'src/index.ts'));
  const module = index && checker.getSymbolAtLocation(index);
  if (!module) throw new Error('core/src/index.ts modül sembolü çözümlenemedi.');
  const components = [];
  for (const symbol of checker.getExportsOfModule(module)) {
    const target = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
    for (const declaration of target.declarations ?? []) {
      if (!ts.isClassDeclaration(declaration)) continue;
      const file = relative(coreRoot, declaration.getSourceFile().fileName).split('\\').join('/');
      if (file.startsWith('src/ui/')) components.push({ name: symbol.getName(), file });
    }
  }
  return components.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

const mentions = (text, name) => new RegExp(`\\b${name}\\b`).test(text);

export function validateCatalog({ components, showcaseText, testText, shownVia = SHOWN_VIA }) {
  const problems = [];
  const names = new Set(components.map((component) => component.name));
  for (const { name, file } of components) {
    if (!mentions(testText, name)) {
      problems.push(`${name} (${file}): CORE testlerinde adıyla sınanmıyor.`);
    }
    const exception = shownVia[name];
    if (exception) {
      if (exception.via !== null && !mentions(showcaseText, exception.via)) {
        problems.push(`${name}: vitrinde "${exception.via}" üzerinden gösterilmeli ama o da yok.`);
      }
      continue;
    }
    if (!mentions(showcaseText, name)) {
      problems.push(
        `${name} (${file}): vol-showcase vitrininde gösterilmiyor. Vitrine ekle ya da parça/katman ise SHOWN_VIA'ya gerekçesiyle yaz.`,
      );
    }
  }
  for (const name of Object.keys(shownVia)) {
    if (!names.has(name))
      problems.push(`SHOWN_VIA.${name}: böyle bir CORE UI bileşeni yok (ölü istisna).`);
  }
  return problems;
}

export function validateRepoCatalog(root) {
  return validateCatalog({
    components: coreUiComponents(root),
    showcaseText: sourceText(resolve(root, 'devtools/vol-showcase/src')),
    testText: sourceText(resolve(root, 'core/tests')),
  });
}
