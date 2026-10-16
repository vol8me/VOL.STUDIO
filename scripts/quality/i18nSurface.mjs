/**
 * Çeviri yüzeyi bekçisi (UI-07.1): anahtarlar, kullanım ve görünen metin tek AST taramasından.
 *
 * Neden AST: metin araması anahtar adını yorumda bulup "kullanılıyor" sayar ve `Lv.${level}`
 * gibi görünen metni görmez. Yalnız gerçek dizge/şablon sabitleri kanıttır; test dosyaları
 * kanıt DEĞİLDİR (yalnız testte geçen anahtar üründe ölüdür).
 *
 * Kurallar (hepsi bir sorun metni üretir; boş liste temiz yüzeydir):
 * 1. TR/EN parite: iki dilin yaprak anahtar kümesi aynı olmalı.
 * 2. Adlandırma: anahtar parçaları camelCase (`dir_up` yerine `directions.up`).
 * 3. Ölü anahtar: hiçbir dizge sabiti (`anahtar` ya da `ad:anahtar`) ya da bildirilmiş dinamik
 *    aile anahtarı üretmiyor. Aile ÖNEK/SONEKLE bildirilir, gerekçesi zorunludur, onu üreten
 *    şablon gerçekten kodda olmalıdır ve en az bir anahtara denk gelmelidir.
 * 4. Eksik anahtar: `ad:anahtar` biçimli bir sabit kataloğda yoksa görünür sorundur
 *    (düz `t('anahtar')` çağrılarını derleyici tip kontrolüyle yakalar).
 * 5. Modül düzeyi çeviri: `i18next.t`/`i18n.tDynamic` içe aktarma anında çağrılırsa dil
 *    değişimi ve başlatma sırası bozulur; yalnız işlev gövdesinde çağrılabilir.
 * 6. Kodlanmış görünen metin: bir DOM yuvasına (textContent, aria-label, title, placeholder…)
 *    ya da UI seçeneğine (label, title…) yazılan harfli dizge. İstisna `TEXT_ALLOW`dadır ve
 *    gerekçelidir; artık bulunmayan istisna bayat sayılıp reddedilir.
 * 7. Çoğul (UI-07.2): sayıya bağlı cümle `anahtar_one`/`anahtar_other` kullanır (kategoriler
 *    `Intl.PluralRules`tan). Grup tek anahtar sayılır, her dil kendi kategorilerini taşır,
 *    kullanılmayan kategori ölü sayılır, `xOne`/`xMany` gibi elle çoğul çifti reddedilir.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { workingTreeFiles } from './gitFiles.mjs';
import { excludingFrozenPaths, loadRepoLifecycle } from './workspaceLifecycle.mjs';

/** Çeviri katalogları: ad alanı, katalog dizini ve görünen metin taranan kaynak dizinleri. */
export const I18N_CATALOGS = [
  { ns: 'core', dir: 'core/src/i18n', uiDirs: ['core/src/ui'] },
  { ns: 'volui', dir: 'devtools/vol-showcase/src/i18n', uiDirs: ['devtools/vol-showcase/src'] },
  { ns: 'voltest', dir: 'games/vol-test/src/i18n', uiDirs: ['games/vol-test/src'] },
];

/**
 * Çalışma zamanında şablonla kurulan anahtar aileleri. Bir aile bütün ad alanını değil
 * önek+sonek biçimini kapsar; üreten şablon silinirse aile bayatlar ve reddedilir.
 */
export const DYNAMIC_FAMILIES = [
  { ns: 'volui', prefix: 'tabs.', suffix: '', reason: 'sekme etiketi sekme kimliğinden türer' },
  {
    ns: 'volui',
    prefix: 'tabDescriptions.',
    suffix: '',
    reason: 'sayfa alt başlığı sekme kimliğinden türer',
  },
  {
    ns: 'volui',
    prefix: 'cards.',
    suffix: '.title',
    reason: 'kart başlığı kart kimliğinden türer',
  },
  {
    ns: 'volui',
    prefix: 'cards.',
    suffix: '.desc',
    reason: 'kart açıklaması kart kimliğinden türer',
  },
  {
    ns: 'volui',
    prefix: 'cards.rarity.',
    suffix: '',
    reason: 'nadirlik etiketi nadirlik kimliğinden türer',
  },
  { ns: 'volui', prefix: 'cards.type.', suffix: '', reason: 'kart türü etiketi türden türer' },
  {
    ns: 'volui',
    prefix: 'touch.directions.',
    suffix: '',
    reason: 'yön etiketi kaydırma yönünden türer',
  },
  {
    ns: 'volui',
    prefix: 'ses.status.states.',
    suffix: '',
    reason: 'kit durum etiketi kit durumundan türer',
  },
  {
    ns: 'volui',
    prefix: 'ses.components.outcome.',
    suffix: '',
    reason: 'sonuç düğmesi etiketi sonuç türünden türer',
  },
  {
    ns: 'volui',
    prefix: 'kimlik.categories.',
    suffix: '',
    reason: 'ikon galerisi kart başlığı kategori kimliğinden türer',
  },
  {
    ns: 'volui',
    prefix: 'ses.channels.',
    suffix: '',
    reason: 'kanal kaydırıcı etiketi kanal adından türer',
  },
  {
    ns: 'voltest',
    prefix: 'controls.',
    suffix: '',
    reason: 'kontrol ipucu etiketi eylem adından türer',
  },
  {
    ns: 'voltest',
    prefix: 'hud.skill.',
    suffix: '',
    reason: 'durum çubuğu yetenek etiketi araç yeteneğinden türer',
  },
  {
    ns: 'voltest',
    prefix: 'touch.',
    suffix: '',
    reason: 'dokunmatik düğme etiketi eylem adından türer',
  },
  {
    ns: 'voltest',
    prefix: 'pause.scenarioMode.',
    suffix: '',
    reason: 'senaryo modu etiketi moddan türer',
  },
  {
    ns: 'voltest',
    prefix: 'pause.displayMode.',
    suffix: '',
    reason: 'görüntü modu etiketi moddan türer',
  },
];

/**
 * Dizge sabiti olmadan, JSON sözlüğünden doğrudan okunan anahtarlar. Kanıt dosyası anahtar
 * yolunu gerçekten içermelidir; içermiyorsa girdi bayattır.
 */
export const INDIRECT_KEYS = [
  {
    ns: 'voltest',
    key: 'app.fatal',
    file: 'games/vol-test/src/main.ts',
    reason: 'başlatma hatası başlığı i18next hazır olmadan sözlükten doğrudan okunur',
  },
];

/**
 * Kalıcı, gerekçeli kodlanmış metin: çevrilemeyen teknik ad ya da özel isim. Bir görev
 * kapatılırken düzeltilecek metin buraya yazılmaz; düzeltilir.
 */
export const TEXT_ALLOW = [
  {
    file: 'core/src/ui/cursors/cursorImage.ts',
    text: 'text',
    reason: 'CSS cursor anahtar sözcüğü (metin imleci); kullanıcıya gösterilen metin değil',
  },
  {
    file: 'games/vol-test/src/config/game.ts',
    text: 'VOL.TEST',
    reason: 'ürün/oyun adı; çevrilmez ve pencere başlığı olarak sabittir',
  },
  {
    file: 'devtools/vol-showcase/src/sections/textTab.ts',
    text: 'Jura',
    reason: 'yazı tipi ailesinin özel adı; çevrilmez',
  },
  {
    file: 'devtools/vol-showcase/src/sections/touchGamepadDemo.ts',
    text: 'RT',
    reason: 'denetleyici tetik düğmesinin donanım etiketi',
  },
  {
    file: 'devtools/vol-showcase/src/sections/touchGamepadDemo.ts',
    text: 'LMB',
    reason: 'fare sol tuşunun kısaltması; kısayol göstergesi',
  },
  {
    file: 'devtools/vol-showcase/src/sections/touchGamepadDemo.ts',
    text: 'Space',
    reason: 'klavye tuşunun adı; kısayol göstergesi',
  },
];

const SINK_PROPS = new Set([
  'textContent',
  'innerText',
  'title',
  'placeholder',
  'alt',
  'ariaLabel',
  'ariaDescription',
]);
const SINK_ATTRS = new Set([
  'aria-label',
  'aria-description',
  'aria-valuetext',
  'aria-roledescription',
  'title',
  'placeholder',
  'alt',
]);
const OPTION_KEYS = new Set([
  'label',
  'title',
  'placeholder',
  'ariaLabel',
  'text',
  'description',
  'subtitle',
  'message',
  'tooltip',
  'heading',
  'hint',
  'caption',
]);
const FORMAT_KEYS = new Set(['formatValue', 'formatLabel', 'format']);
const TEXT_WIDGETS = new Set(['Text', 'Button', 'IconButton']);
const TRANSLATORS = new Set(['t', 'tDynamic', 'assertKey']);
const LETTERS = /[A-Za-zÇĞİÖŞÜçğıöşü]{2,}/;
const CAMEL = /^[a-z][a-zA-Z0-9]*$/;
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;
const HAND_ROLLED = /^(.+?)(One|Single)$/;
const HAND_ROLLED_SIBLINGS = ['Many', 'Few', 'Other', 'Plural', 'Multiple'];

/** `anahtar_one` → { base: 'anahtar', category: 'one' }; çoğul olmayan anahtar için null. */
export function pluralParts(key) {
  const match = PLURAL_SUFFIX.exec(key);
  return match ? { base: key.slice(0, match.index), category: match[1] } : null;
}

const baseKey = (key) => pluralParts(key)?.base ?? key;

/** Bir dilin `Intl.PluralRules` kategorileri (tr/en: one + other). */
export function pluralCategoriesOf(lang) {
  return new Intl.PluralRules(lang).resolvedOptions().pluralCategories;
}

function flatten(value, path = [], out = new Set()) {
  if (Array.isArray(value)) {
    out.add(path.join('.'));
    return out;
  }
  if (typeof value === 'object' && value !== null) {
    for (const [key, child] of Object.entries(value)) flatten(child, [...path, key], out);
    return out;
  }
  out.add(path.join('.'));
  return out;
}

function readCatalog(root, catalog, lang) {
  const file = join(root, catalog.dir, `${lang}.json`);
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
}

const isTestPath = (file) =>
  /(^|\/)(tests?|__tests__)\//.test(file) || /\.(test|spec)\.[cm]?ts$/.test(file);

function literalText(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) {
    return node.head.text + node.templateSpans.map((span) => span.literal.text).join('');
  }
  return null;
}

/** Bir işlevin döndürdüğü sabit metin (ifade gövdesi ya da `return` ifadeleri). */
function functionResults(node) {
  if (!ts.isArrowFunction(node) && !ts.isFunctionExpression(node)) return [];
  if (!ts.isBlock(node.body)) return [node.body];
  return node.body.statements.filter(ts.isReturnStatement).flatMap((ret) => ret.expression ?? []);
}

/** Tek dosyanın AST özeti. */
function scanSource(file, text) {
  const literals = [];
  const templates = [];
  const moduleCalls = [];
  const hardcoded = [];
  if (file.endsWith('.html')) {
    for (const match of text.matchAll(/"([^"\n]+)"|'([^'\n]+)'/g)) {
      literals.push(match[1] ?? match[2]);
    }
    return { literals, templates, moduleCalls, hardcoded };
  }
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const lineOf = (node) => source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
  const report = (node, kind, value) => hardcoded.push({ line: lineOf(node), kind, text: value });

  const visit = (node, inFunction) => {
    const nested = inFunction || (ts.isFunctionLike(node) && !ts.isTypeNode(node));
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      literals.push(node.text);
    }
    if (ts.isTemplateExpression(node)) {
      templates.push([node.head.text, ...node.templateSpans.map((span) => span.literal.text)]);
    }
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      TRANSLATORS.has(node.expression.name.text) &&
      ['i18next', 'i18n'].includes(node.expression.expression.getText(source)) &&
      !nested
    ) {
      moduleCalls.push({ line: lineOf(node), call: node.expression.getText(source) });
    }
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isPropertyAccessExpression(node.left) &&
      SINK_PROPS.has(node.left.name.text)
    ) {
      const value = literalText(node.right);
      if (value !== null) report(node, `${node.left.name.text} atamasi`, value);
    }
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'setAttribute' &&
      node.arguments.length === 2
    ) {
      const attribute = literalText(node.arguments[0]);
      const value = literalText(node.arguments[1]);
      if (attribute !== null && SINK_ATTRS.has(attribute) && value !== null) {
        report(node, `${attribute} özniteliği`, value);
      }
    }
    if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      TEXT_WIDGETS.has(node.expression.text) &&
      node.arguments?.[0]
    ) {
      const value = literalText(node.arguments[0]);
      if (value !== null) report(node, `new ${node.expression.text}`, value);
    }
    if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name)) {
      const key = node.name.text;
      if (OPTION_KEYS.has(key)) {
        const value = literalText(node.initializer);
        if (value !== null) report(node, `${key} seçeneği`, value);
      }
      if (OPTION_KEYS.has(key) || FORMAT_KEYS.has(key)) {
        for (const result of functionResults(node.initializer)) {
          const value = literalText(result);
          if (value !== null) report(result, `${key} işlevi`, value);
        }
      }
    }
    // `etiket ?? ((v) => \`Lv.${v}\`)` biçimindeki varsayılan etiket işlevi.
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
    ) {
      const right = ts.isParenthesizedExpression(node.right) ? node.right.expression : node.right;
      for (const result of functionResults(right)) {
        const value = literalText(result);
        if (value !== null) report(result, 'varsayılan etiket işlevi', value);
      }
    }
    ts.forEachChild(node, (child) => visit(child, nested));
  };
  visit(source, false);
  return { literals, templates, moduleCalls, hardcoded };
}

function productSources(root, lifecycle) {
  return excludingFrozenPaths(
    workingTreeFiles(root, ['*.ts', '*.mts', '*.html']),
    lifecycle,
  ).filter((file) => !file.endsWith('.d.ts') && !isTestPath(file));
}

const stripNamespace = (value) => value.replace(/^[a-z][a-zA-Z0-9]*:/, '');

function familyMatches(family, key) {
  return (
    key.startsWith(family.prefix) &&
    key.endsWith(family.suffix) &&
    key.length > family.prefix.length + family.suffix.length
  );
}

function familyProduced(family, templates) {
  return templates.some(
    (parts) =>
      parts.length === 2 &&
      stripNamespace(parts[0]) === family.prefix &&
      parts[1] === family.suffix,
  );
}

/**
 * @param root Repo kökü.
 * @param options Testler kendi katalog/aile/istisna listesini verir.
 * @returns Sorun listesi; boşsa yüzey temizdir.
 */
export function validateI18nSurface(root, options = {}) {
  const {
    catalogs = I18N_CATALOGS,
    families = DYNAMIC_FAMILIES,
    allow = TEXT_ALLOW,
    indirect = INDIRECT_KEYS,
    lifecycle = loadRepoLifecycle(root),
  } = options;
  const problems = [];
  const sources = new Map();
  for (const file of productSources(root, lifecycle)) {
    sources.set(file, scanSource(file, readFileSync(join(root, file), 'utf8')));
  }
  const literals = new Set();
  const templates = [];
  for (const scan of sources.values()) {
    for (const literal of scan.literals) literals.add(literal);
    templates.push(...scan.templates);
  }

  const known = new Map();
  for (const catalog of catalogs) {
    const tr = readCatalog(root, catalog, 'tr');
    const en = readCatalog(root, catalog, 'en');
    if (!tr || !en) continue;
    const trKeys = flatten(tr);
    const enKeys = flatten(en);
    known.set(catalog.ns, new Set([...trKeys, ...[...trKeys].map(baseKey)]));

    // 1. Parite: çoğul grubu tek anahtardır (kategori kümesi dile göre değişebilir).
    const trBases = new Set([...trKeys].map(baseKey));
    const enBases = new Set([...enKeys].map(baseKey));
    for (const key of trBases) {
      if (!enBases.has(key)) problems.push(`${catalog.dir}: "${key}" en.json'da yok (parite).`);
    }
    for (const key of enBases) {
      if (!trBases.has(key)) problems.push(`${catalog.dir}: "${key}" tr.json'da yok (parite).`);
    }

    // 7. Çoğul: her dil kendi kategorilerini taşır, ölü kategori ve elle çoğul çifti yok.
    /** @type {Array<[string, Set<string>]>} */
    const locales = [
      ['tr', trKeys],
      ['en', enKeys],
    ];
    for (const [lang, keys] of locales) {
      const required = pluralCategoriesOf(lang);
      const groups = new Map();
      for (const key of keys) {
        const parts = pluralParts(key);
        if (!parts) continue;
        if (!groups.has(parts.base)) groups.set(parts.base, new Set());
        groups.get(parts.base).add(parts.category);
      }
      for (const [base, have] of groups) {
        if (keys.has(base)) {
          problems.push(
            `${catalog.dir}/${lang}.json: "${base}" hem düz hem çoğul (_one/_other) tanımlı; biri kalmalı.`,
          );
        }
        const missing = required.filter((category) => !have.has(category));
        if (missing.length > 0) {
          problems.push(
            `${catalog.dir}/${lang}.json: "${base}" çoğul biçimi eksik (${missing.join(', ')}); ` +
              `${lang} dilinin kategorileri: ${required.join(', ')}.`,
          );
        }
        const extra = [...have].filter((category) => !required.includes(category));
        if (extra.length > 0) {
          problems.push(
            `${catalog.dir}/${lang}.json: "${base}" için ${extra.join(', ')} biçimi ${lang} dilinde ` +
              'hiç seçilmez (ölü çoğul biçimi).',
          );
        }
      }
      for (const key of keys) {
        const match = HAND_ROLLED.exec(key);
        if (!match) continue;
        const sibling = HAND_ROLLED_SIBLINGS.find((word) => keys.has(`${match[1]}${word}`));
        if (sibling) {
          problems.push(
            `${catalog.dir}/${lang}.json: "${key}" / "${match[1]}${sibling}" elle çoğul çifti; ` +
              `"${match[1]}_one" / "${match[1]}_other" ve t(anahtar, { count }) kullan.`,
          );
        }
      }
    }

    // 2. Adlandırma.
    for (const key of trKeys) {
      const bad = baseKey(key)
        .split('.')
        .filter((part) => !CAMEL.test(part));
      if (bad.length > 0) {
        problems.push(
          `${catalog.dir}: "${key}" anahtar parçası camelCase değil (${bad.join(', ')}).`,
        );
      }
    }

    // 3. Ölü anahtar (ad alanı önekli ya da öneksiz tam sabit, ya da aile).
    const catalogFamilies = families.filter((family) => family.ns === catalog.ns);
    const dead = [...trKeys].filter((key) => {
      const used = baseKey(key);
      if (literals.has(used) || literals.has(`${catalog.ns}:${used}`)) return false;
      if (indirect.some((entry) => entry.ns === catalog.ns && entry.key === used)) return false;
      return !catalogFamilies.some((family) => familyMatches(family, used));
    });
    if (dead.length > 0) {
      problems.push(
        `${catalog.dir}: kodda kullanılmayan anahtar (${dead.length}): ${dead.join(', ')}. ` +
          'Şablonla kuruluyorsa `DYNAMIC_FAMILIES`e gerekçeyle ekle, değilse İKİ dilden de sil.',
      );
    }
  }

  // Aile doğrulaması: gerekçe, üreten şablon ve en az bir denk anahtar.
  for (const family of families) {
    const label = `${family.ns}:${family.prefix}\${…}${family.suffix}`;
    if (!family.reason || family.reason.trim().length < 5) {
      problems.push(`i18n: dinamik aile ${label} gerekçesiz.`);
    }
    if (!familyProduced(family, templates)) {
      problems.push(
        `i18n: dinamik aile ${label} bildirilmiş ama onu kuran bir şablon yok — aileyi kaldır.`,
      );
    }
    const keys = known.get(family.ns);
    if (keys && ![...keys].some((key) => familyMatches(family, key))) {
      problems.push(`i18n: dinamik aile ${label} hiçbir anahtara denk gelmiyor — aileyi kaldır.`);
    }
  }

  for (const entry of indirect) {
    const text = existsSync(join(root, entry.file))
      ? readFileSync(join(root, entry.file), 'utf8')
      : '';
    if (!text.includes(entry.key)) {
      problems.push(
        `i18n: doğrudan okunan anahtar ${entry.ns}:${entry.key} kanıt dosyasında (${entry.file}) yok — girdiyi sil.`,
      );
    }
  }

  // 4. Eksik anahtar: `ad:anahtar` biçimli sabitler.
  for (const [file, scan] of sources) {
    const seen = new Set();
    for (const literal of scan.literals) {
      const match = /^([a-z][a-zA-Z0-9]*):([a-z][A-Za-z0-9_.]*)$/.exec(literal);
      if (!match || !known.has(match[1]) || seen.has(literal)) continue;
      seen.add(literal);
      const keys = known.get(match[1]);
      const exists =
        keys.has(match[2]) ||
        [...keys].some((key) => key.startsWith(`${match[2]}.`)) ||
        families.some((family) => family.ns === match[1] && familyMatches(family, match[2]));
      if (!exists) problems.push(`${file}: eksik çeviri anahtarı "${literal}".`);
    }
  }

  // 5. Modül düzeyi çeviri çağrısı.
  for (const [file, scan] of sources) {
    for (const call of scan.moduleCalls) {
      problems.push(
        `${file}:${call.line}: modül düzeyinde ${call.call}() çağrısı; dil başlatma sırasına ve ` +
          'dil değişimine bağlı kalır, işlev gövdesine taşı.',
      );
    }
  }

  // 6. Kodlanmış görünen metin (yalnız UI dizinleri) ve bayat istisnalar.
  const roots = catalogs.flatMap((catalog) => catalog.uiDirs ?? []);
  const keyShaped = new Set(catalogs.map((catalog) => catalog.ns));
  const used = new Set();
  for (const [file, scan] of sources) {
    if (!roots.some((dir) => file.startsWith(`${dir}/`))) continue;
    for (const hit of scan.hardcoded) {
      if (!LETTERS.test(hit.text)) continue;
      const colon = hit.text.indexOf(':');
      if (colon > 0 && keyShaped.has(hit.text.slice(0, colon))) continue;
      const index = allow.findIndex((entry) => entry.file === file && entry.text === hit.text);
      if (index >= 0) {
        used.add(index);
        continue;
      }
      problems.push(
        `${file}:${hit.line}: kodlanmış görünen metin (${hit.kind}) ${JSON.stringify(hit.text)}; ` +
          'çeviri anahtarına taşı ya da gerekçeyle `TEXT_ALLOW`a ekle.',
      );
    }
  }
  allow.forEach((entry, index) => {
    if (!used.has(index)) {
      problems.push(
        `i18n: bayat metin istisnası ${entry.file} ${JSON.stringify(entry.text)} — artık bulunmuyor, sil.`,
      );
    }
  });

  return problems;
}
