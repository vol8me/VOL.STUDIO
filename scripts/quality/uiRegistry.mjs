import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import ts from 'typescript';

/**
 * UI yüzey kaydı: CORE UI alt yolunun (core/src/ui/index.ts) bütün sınıf ve
 * çalışma zamanı yardımcıları devtools/vol-showcase/src/catalog/registry.json
 * içinde tekil kayıt taşır. Kayıt yalnız koddan çıkarılamayan bilgiyi (tier,
 * sahip faz, anchor, durum arketipi, kanıt bağları) tutar; kaynak dosya,
 * tüketici ve tür yüzeyi AST'den hesaplanır ve kayıtla karşılaştırılır.
 *
 * Test kanıtı isim geçen metin değildir: bağlanan `it`/`test` bloğunun gövdesi
 * adı bir tanımlayıcı olarak kullanmalı ve en az bir `expect` çağrısı taşımalıdır.
 */
export const REGISTRY_SCHEMA = 'UiRegistryV1';
export const REGISTRY_PATH = 'devtools/vol-showcase/src/catalog/registry.json';
export const STATE_AXES = [
  'normal',
  'hover',
  'press',
  'focusVisible',
  'disabled',
  'loading',
  'error',
  'empty',
  'keyboard',
  'gamepad',
  'touch',
  'reducedMotion',
  'long30',
  'digits6',
];
const CONSUMERS = ['direct', 'indirect', 'catalog'];
const ANCHORS = ['A1', 'A2', 'A3', 'A4', 'A5'];

const posix = (path) => path.split(sep).join('/');

function createCoreProgram(root) {
  const coreRoot = resolve(root, 'core');
  const config = ts.readConfigFile(resolve(coreRoot, 'tsconfig.json'), ts.sys.readFile);
  if (config.error)
    throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, coreRoot);
  return { coreRoot, program: ts.createProgram(parsed.fileNames, parsed.options) };
}

/** `core/src/ui/index.ts` dışa aktarımları: sınıf, çalışma zamanı yardımcısı ve tür sayısı. */
export function uiSurface(root) {
  const { coreRoot, program } = createCoreProgram(root);
  const checker = program.getTypeChecker();
  const index = program.getSourceFile(resolve(coreRoot, 'src/ui/index.ts'));
  const module = index && checker.getSymbolAtLocation(index);
  if (!module) throw new Error('core/src/ui/index.ts modül sembolü çözümlenemedi.');
  const classes = [];
  const helpers = [];
  let types = 0;
  for (const symbol of checker.getExportsOfModule(module)) {
    const target = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
    const declaration = target.declarations?.[0];
    const file = declaration
      ? posix(relative(coreRoot, declaration.getSourceFile().fileName))
      : '?';
    const entry = { name: symbol.getName(), file };
    if (target.flags & ts.SymbolFlags.Class) classes.push(entry);
    else if (
      target.flags &
      (ts.SymbolFlags.Function | ts.SymbolFlags.Variable | ts.SymbolFlags.Enum)
    )
      helpers.push(entry);
    else types++;
  }
  const byName = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  return { classes: classes.sort(byName), helpers: helpers.sort(byName), types };
}

function sourceFiles(dir, pattern) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && pattern.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name));
}

function parse(file, text) {
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
}

function identifierSet(node) {
  const names = new Set();
  const visit = (child) => {
    if (ts.isIdentifier(child)) names.add(child.text);
    ts.forEachChild(child, visit);
  };
  visit(node);
  return names;
}

/** Tanımlayıcılar ve metin değerleri (yorum hariç): durum işareti aramasının evreni. */
function wordSet(node) {
  const words = new Set();
  const visit = (child) => {
    if (
      ts.isIdentifier(child) ||
      ts.isStringLiteralLike(child) ||
      ts.isTemplateHead(child) ||
      ts.isTemplateMiddle(child) ||
      ts.isTemplateTail(child)
    )
      words.add(child.text);
    ts.forEachChild(child, visit);
  };
  visit(node);
  return words;
}

/** Dosya adı tanımlayıcı olarak kullanıyor mu (yorum ve metin sayılmaz). */
export function fileUsesIdentifier(file, text, name) {
  return usesIdentifier(parse(file, text), name);
}

function usesIdentifier(node, name) {
  return identifierSet(node).has(name);
}

/** VOL.TEST'in CORE'dan adlandırılmış olarak içe aktardığı sembollerden `names` kümesine girenler. */
export function volTestImports(root, names) {
  const base = resolve(root, 'games/vol-test/src');
  const used = new Set();
  let text = '';
  for (const file of sourceFiles(base, /\.tsx?$/)) {
    const source = readFileSync(file, 'utf8');
    text += `${source}\n`;
    for (const statement of parse(file, source).statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier))
        continue;
      if (!statement.moduleSpecifier.text.startsWith('@volstudio/core')) continue;
      const bindings = statement.importClause?.namedBindings;
      if (!bindings || !ts.isNamedImports(bindings)) continue;
      for (const element of bindings.elements) {
        const name = (element.propertyName ?? element.name).text;
        if (names.has(name)) used.add(name);
      }
    }
  }
  return { used, text };
}

function callTitle(call) {
  const [first, second] = call.arguments;
  if (!first || !(ts.isStringLiteralLike(first) || ts.isTemplateExpression(first))) return null;
  const title = ts.isStringLiteralLike(first) ? first.text : first.getText().slice(1, -1);
  return { title, body: second };
}

function isTestCallee(expression) {
  const base = ts.isPropertyAccessExpression(expression) ? expression.expression : expression;
  return ts.isIdentifier(base) && (base.text === 'it' || base.text === 'test');
}

/** Bir test dosyasındaki `it`/`test` blokları (`.each`, `.skip` dahil): `{ title, body }`. */
export function testBlocks(file, text) {
  const blocks = [];
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const eachFactory = ts.isCallExpression(callee) && isTestCallee(callee.expression);
      if (isTestCallee(callee) || eachFactory) {
        const found = callTitle(node);
        if (found && found.body) blocks.push(found);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(parse(file, text));
  return blocks;
}

function hasAssertion(node) {
  let found = false;
  const visit = (child) => {
    if (found) return;
    if (
      ts.isCallExpression(child) &&
      ts.isIdentifier(child.expression) &&
      (child.expression.text === 'expect' || child.expression.text === 'assert')
    ) {
      found = true;
      return;
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
}

const HELPER_DEPTH = 4;

/** Dosyadaki adlandırılmış yardımcı işlevler (bildirim ya da ok işlevi) ve gövdelerinden `collect` ile toplananlar. */
function helperIdentifiers(sourceFile, collect = identifierSet) {
  const helpers = new Map();
  const visit = (node) => {
    if (ts.isFunctionDeclaration(node) && node.name && node.body) {
      helpers.set(node.name.text, collect(node.body));
    } else if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
    ) {
      helpers.set(node.name.text, collect(node.initializer.body));
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return helpers;
}

function expandThroughHelpers(names, helpers) {
  const reached = new Set(names);
  let frontier = [...names];
  for (let depth = 0; depth < HELPER_DEPTH && frontier.length > 0; depth++) {
    const next = [];
    for (const name of frontier) {
      for (const used of helpers.get(name) ?? []) {
        if (!reached.has(used)) {
          reached.add(used);
          next.push(used);
        }
      }
    }
    frontier = next;
  }
  return reached;
}

/**
 * Test dosyasının blokları: başlık, kullanılan tanımlayıcılar (`names`), tanımlayıcı ve metin değerleri (`words`,
 * yorum hariç) ve doğrulama çağrısı var mı. Blok adı doğrudan ya da dosyadaki adlandırılmış yardımcı işlevler
 * (örn. `mountSheet`) üzerinden kullanabilir.
 */
export function analyzeTests(file, text) {
  const sourceFile = parse(file, text);
  const helperNames = helperIdentifiers(sourceFile);
  const helperWords = helperIdentifiers(sourceFile, wordSet);
  return testBlocks(file, text).map((block) => ({
    title: block.title,
    names: expandThroughHelpers(identifierSet(block.body), helperNames),
    words: expandThroughHelpers(wordSet(block.body), helperWords),
    asserts: hasAssertion(block.body),
  }));
}

/** `'ok'`, ya da neden geçerli olmadığı: `'title' | 'name' | 'assert'`. */
export function evidenceStatus(facts, title, name) {
  const matches = facts.filter((block) => block.title === title);
  if (matches.length === 0) return 'title';
  const named = matches.filter((block) => block.names.has(name));
  if (named.length === 0) return 'name';
  return named.some((block) => block.asserts) ? 'ok' : 'assert';
}

/**
 * Bir durumu sınayan testin kodunda (yorum hariç) görünmesi gereken işaret. İşaret kanıt değildir, ama durumu hiç
 * anmayan bir testin o duruma bağlanmasını engeller: `hover` bağlı bir test işaretçi girişini, `disabled` bağlı
 * test devre dışı durumu kodunda taşımalıdır. `normal` işaretsizdir: doğrulama taşıyan her test varsayılan davranışı
 * sınar. Bağı kuran kişi gövdeyi yine okur; bu yalnız bağın sessizce yanlış durumu göstermesini engeller.
 */
export const STATE_MARKERS = {
  normal: null,
  hover: /hover|pointerenter|pointerover|mouseenter|mouseover/i,
  press: /pointerdown|mousedown|pointerup|touchstart|\bclick\b|press/i,
  focusVisible: /focus/i,
  disabled: /disabled/i,
  loading: /loading|busy/i,
  error: /error|invalid|alert|hata/i,
  empty: /empty|\bboş\b/i,
  keyboard: /keydown|keyup|keyboardevent|keyboard|klavye|\benter\b|\bspace\b|arrow|escape|\btab\b/i,
  gamepad: /gamepad|focusnav|d-?pad|pollpad|padlike|volarrows|dispatcharrow/i,
  touch: /touch|pointercancel|pointertype|coarse|swipe|pinch/i,
  reducedMotion: /reduced|prefersreducedmotion|matchmedia/i,
  long30: /%30|uzun|\blong|uzat|overflow|ellipsis|truncat|wrap|clamp|taşma/i,
  digits6: /999999|999 999|\b\d{6}\b|altı hane|6 hane|digits/i,
};

/** `'ok'` ya da neden geçerli olmadığı: `'title' | 'name' | 'assert' | 'marker'`. */
export function stateEvidenceStatus(facts, title, name, state) {
  const status = evidenceStatus(facts, title, name);
  if (status !== 'ok') return status;
  const marker = STATE_MARKERS[state];
  if (!marker) return 'ok';
  const candidates = facts.filter(
    (block) => block.title === title && block.names.has(name) && block.asserts,
  );
  return candidates.some((block) => [...block.words].some((word) => marker.test(word)))
    ? 'ok'
    : 'marker';
}

/**
 * Uygulanabilir durumların kanıt bağı: arketip + `extraStates` kümesinden bağlı (`states`), fixture ile sınanan
 * (`fixtures`: stateFixtures belgesi) ve kalanlar. Kalan kanıtsız demek değildir: bağlanmamıştır.
 *
 * @param {{ archetypes?: Record<string, { applicable?: string[] }>, entries?: Array<Record<string, any>> }} registry
 * @param {{
 *   phases?: string[],
 *   tier?: number,
 *   fixtures?: { fixtures?: Array<{ export: string, states?: string[] }> } | null,
 * }} [options]
 */
export function stateCoverage(registry, { phases, tier, fixtures } = {}) {
  const fixtureStates = new Map();
  for (const fixture of fixtures?.fixtures ?? []) {
    const set = fixtureStates.get(fixture.export) ?? new Set();
    for (const state of fixture.states ?? []) set.add(state);
    fixtureStates.set(fixture.export, set);
  }
  const rows = [];
  for (const entry of registry.entries ?? []) {
    if (phases && !phases.includes(entry.phase)) continue;
    if (tier !== undefined && entry.tier !== tier) continue;
    const applicable = [
      ...new Set([
        ...(registry.archetypes?.[entry.archetype]?.applicable ?? []),
        ...(entry.extraStates ?? []),
      ]),
    ];
    const bound = applicable.filter((state) => (entry.states?.[state] ?? []).length > 0);
    const fixtured = applicable.filter(
      (state) => !bound.includes(state) && fixtureStates.get(entry.export)?.has(state),
    );
    const open = applicable.filter((state) => !bound.includes(state) && !fixtured.includes(state));
    rows.push({
      export: entry.export,
      phase: entry.phase,
      tier: entry.tier,
      applicable: applicable.length,
      bound,
      fixtured,
      open,
    });
  }
  return rows;
}

/** `name` için gerçek doğrulama taşıyan testler: yeni export kaydederken aday listesi. */
export function suggestEvidence(root, name, limit = 3) {
  const found = [];
  for (const file of sourceFiles(resolve(root, 'core/tests/ui'), /\.test\.ts$/).sort()) {
    for (const block of analyzeTests(file, readFileSync(file, 'utf8'))) {
      if (block.names.has(name) && block.asserts) {
        found.push({ file: posix(relative(root, file)), title: block.title });
        if (found.length >= limit) return found;
      }
    }
  }
  return found;
}

/** docs/ui/TODO.md içindeki açık (işaretlenmemiş) görev kimlikleri. */
function readOpenTasks(read) {
  const text = read('docs/ui/TODO.md') ?? '';
  return new Set([...text.matchAll(/^- \[ \] \*\*(UI-\d\d\.\d) /gm)].map((match) => match[1]));
}

function validateArchetypes(registry, problems) {
  const archetypes = registry.archetypes ?? {};
  if (Object.keys(archetypes).length === 0) problems.push('UI registry: archetypes boş.');
  for (const [name, archetype] of Object.entries(archetypes)) {
    const applicable = archetype.applicable ?? [];
    const na = Object.keys(archetype.na ?? {});
    for (const state of [...applicable, ...na]) {
      if (!STATE_AXES.includes(state))
        problems.push(`UI registry: arketip ${name}: bilinmeyen durum "${state}".`);
    }
    for (const state of STATE_AXES) {
      const inApplicable = applicable.includes(state);
      const inNa = na.includes(state);
      if (inApplicable === inNa)
        problems.push(
          `UI registry: arketip ${name}: "${state}" ya uygulanabilir ya da gerekçeli N/A olmalı.`,
        );
    }
    for (const [state, reason] of Object.entries(archetype.na ?? {})) {
      if (typeof reason !== 'string' || reason.trim() === '')
        problems.push(`UI registry: arketip ${name}: "${state}" N/A gerekçesi boş.`);
    }
  }
}

/**
 * @param {object} input
 * @param {object} input.registry kayıt belgesi
 * @param {{classes: object[], helpers: object[]}} input.surface AST yüzeyi
 * @param {{used: Set<string>, text: string}} input.usage VOL.TEST kullanımı
 * @param {(path: string) => string | null} input.read repo göreli dosya metni (yoksa null)
 * @param {string} input.showcaseText vitrin kaynaklarının birleşik metni (`via` kontrolü)
 * @param {string} [input.showcaseDir] vitrin kaynak dizini
 */
export function validateUiRegistry({ registry, surface, usage, read, showcaseText, showcaseDir }) {
  const problems = [];
  if (registry?.schema !== REGISTRY_SCHEMA)
    return [`UI registry: schema ${REGISTRY_SCHEMA} olmalı.`];
  validateArchetypes(registry, problems);

  /** @type {Map<string, string>} */
  const expected = new Map();
  for (const e of surface.classes) expected.set(e.name, 'class');
  for (const e of surface.helpers) expected.set(e.name, 'helper');
  const seen = new Set();
  const factsByFile = new Map();
  const factsOf = (file, text) => {
    if (!factsByFile.has(file)) factsByFile.set(file, analyzeTests(file, text));
    return factsByFile.get(file);
  };
  for (const entry of registry.entries ?? []) {
    const id = entry.export;
    if (seen.has(id)) problems.push(`UI registry: ${id} birden fazla kayıtlı.`);
    seen.add(id);
    if (!expected.has(id)) {
      problems.push(`UI registry: ${id} CORE UI yüzeyinde yok (ölü kayıt).`);
      continue;
    }
    if (entry.kind !== expected.get(id))
      problems.push(`UI registry: ${id}: kind ${entry.kind}, yüzeyde ${expected.get(id)}.`);
    if (![1, 2].includes(entry.tier)) problems.push(`UI registry: ${id}: tier 1 ya da 2 olmalı.`);
    if (!/^UI-\d\d$/.test(entry.phase ?? ''))
      problems.push(`UI registry: ${id}: phase UI-NN biçiminde olmalı.`);
    if (entry.kind === 'class' && !ANCHORS.includes(entry.anchor))
      problems.push(`UI registry: ${id}: anchor ${ANCHORS.join('/')} olmalı.`);
    if (!registry.archetypes?.[entry.archetype])
      problems.push(`UI registry: ${id}: bilinmeyen arketip "${entry.archetype}".`);
    for (const state of entry.extraStates ?? []) {
      if (!STATE_AXES.includes(state))
        problems.push(`UI registry: ${id}: extraStates bilinmeyen durum "${state}".`);
    }
    if (!CONSUMERS.includes(entry.consumer))
      problems.push(`UI registry: ${id}: consumer ${CONSUMERS.join('/')} olmalı.`);
    const imported = usage.used.has(id);
    if (entry.consumer === 'direct' && !imported)
      problems.push(`UI registry: ${id}: consumer direct ama VOL.TEST CORE'dan içe aktarmıyor.`);
    if (entry.consumer !== 'direct' && imported)
      problems.push(`UI registry: ${id}: VOL.TEST içe aktarıyor, consumer direct olmalı.`);
    if (entry.consumer === 'indirect') {
      const via = entry.via;
      if (!via || !new RegExp(`\\b${via}\\b`).test(usage.text))
        problems.push(`UI registry: ${id}: indirect için VOL.TEST'te geçen "via" gerekir.`);
    }

    const showcase = entry.showcase ?? [];
    const shownVia = entry.shownVia;
    if (showcase.length === 0 && !shownVia?.reason)
      problems.push(`UI registry: ${id}: vitrin dosyası ya da gerekçeli shownVia gerekir.`);
    if (shownVia?.via && !usesIdentifier(parse('showcase.ts', showcaseText ?? ''), shownVia.via))
      problems.push(`UI registry: ${id}: shownVia.via "${shownVia.via}" vitrinde kullanılmıyor.`);
    for (const file of showcase) {
      const text = read(`${showcaseDir ?? 'devtools/vol-showcase/src'}/${file}`);
      if (text === null) problems.push(`UI registry: ${id}: vitrin dosyası yok: ${file}.`);
      else if (!usesIdentifier(parse(file, text), id))
        problems.push(`UI registry: ${id}: ${file} adı tanımlayıcı olarak kullanmıyor.`);
    }

    const tests = entry.tests ?? [];
    const gap = entry.gap;
    if (tests.length === 0 && !gap)
      problems.push(
        `UI registry: ${id}: test kanıtı yok. Kanıt ekle ya da sahip görevli gap yaz ` +
          `(aday: node scripts/quality/cli/ui-registry.mjs --suggest ${id}).`,
      );
    if (tests.length > 0 && gap)
      problems.push(`UI registry: ${id}: test kanıtı var; bayat gap kaydı silinmeli.`);
    if (gap) {
      const open = readOpenTasks(read);
      if (!/^UI-\d\d\.\d$/.test(gap.task ?? '') || !open.has(gap.task))
        problems.push(`UI registry: ${id}: gap.task açık bir UI görevi olmalı (${gap.task}).`);
      if (typeof gap.reason !== 'string' || gap.reason.trim() === '')
        problems.push(`UI registry: ${id}: gap.reason boş.`);
    }
    for (const { file, title } of tests) {
      const text = read(file);
      if (text === null) {
        problems.push(`UI registry: ${id}: test dosyası yok: ${file}.`);
        continue;
      }
      const status = evidenceStatus(factsOf(file, text), title, id);
      if (status === 'title')
        problems.push(`UI registry: ${id}: "${title}" başlıklı test ${file} içinde yok.`);
      else if (status === 'name')
        problems.push(`UI registry: ${id}: "${title}" testi adı tanımlayıcı olarak kullanmıyor.`);
      else if (status === 'assert')
        problems.push(`UI registry: ${id}: "${title}" testi hiçbir expect çağrısı taşımıyor.`);
    }
    const applicable = new Set([
      ...(registry.archetypes?.[entry.archetype]?.applicable ?? []),
      ...(entry.extraStates ?? []),
    ]);
    for (const [state, evidence] of Object.entries(entry.states ?? {})) {
      const at = `UI registry: ${id}: states.${state}`;
      if (!STATE_AXES.includes(state)) {
        problems.push(`UI registry: ${id}: states bilinmeyen durum "${state}".`);
        continue;
      }
      if (!applicable.has(state)) {
        problems.push(`${at} uygulanabilir değil (gerekçeli N/A): bağlanamaz.`);
        continue;
      }
      if (!Array.isArray(evidence) || evidence.length === 0) {
        problems.push(`${at} boş; kanıt ekle ya da durumu sil.`);
        continue;
      }
      for (const { file, title } of evidence) {
        const text = read(file);
        if (text === null) {
          problems.push(`${at}: test dosyası yok: ${file}.`);
          continue;
        }
        const status = stateEvidenceStatus(factsOf(file, text), title, id, state);
        if (status === 'title')
          problems.push(`${at}: "${title}" başlıklı test ${file} içinde yok.`);
        else if (status === 'name')
          problems.push(`${at}: "${title}" testi adı tanımlayıcı olarak kullanmıyor.`);
        else if (status === 'assert')
          problems.push(`${at}: "${title}" testi hiçbir expect çağrısı taşımıyor.`);
        else if (status === 'marker')
          problems.push(
            `${at}: "${title}" testinin kodunda ${state} durumunun işareti yok ` +
              `(${STATE_MARKERS[state]}); durumu sınayan başka bir test bağla.`,
          );
      }
    }
  }
  for (const [name, kind] of expected) {
    if (!seen.has(name))
      problems.push(
        `UI registry: ${name} (${kind}) kayıtsız. ${REGISTRY_PATH} içine ekle; test adayı için ` +
          `node scripts/quality/cli/ui-registry.mjs --suggest ${name}`,
      );
  }
  return problems;
}

export function validateRepoUiRegistry(root) {
  const file = resolve(root, REGISTRY_PATH);
  if (!existsSync(file)) return [`UI registry: ${REGISTRY_PATH} yok.`];
  const registry = JSON.parse(readFileSync(file, 'utf8'));
  const surface = uiSurface(root);
  const names = new Set([...surface.classes, ...surface.helpers].map((e) => e.name));
  const showcaseText = sourceFiles(resolve(root, 'devtools/vol-showcase/src'), /\.tsx?$/)
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n');
  return validateUiRegistry({
    registry,
    surface,
    usage: volTestImports(root, names),
    showcaseText,
    read: (path) => {
      const full = resolve(root, path);
      return existsSync(full) ? readFileSync(full, 'utf8') : null;
    },
  });
}
