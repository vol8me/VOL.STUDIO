/**
 * Belge doğrulaması — D11'in bekçi tarafı.
 *
 * İki ilke:
 *
 * 1. **Tüm sorunlar tek seferde bildirilir.** İlk hatada durmak, agent'ı
 *    "düzelt–çalıştır–düzelt" döngüsüne sokar. `scripts/quality/config.mjs`
 *    aynı kararı kapı tarafında verdi.
 * 2. **Henüz uygulanmamış ya da o bağlamda çalışmayacak bir alan SESSİZCE
 *    YOKSAYILMAZ.** Yoksayılırsa belge doğrulamadan geçer, render olur ve
 *    istenenden başka bir şey çizer.
 *
 * Sonlu sayı sözleşmesi (`core/docs/primitives.md`): `size`, `seed`, `freq`
 * gibi YAPILANDIRMA değerleri REDDEDİLİR — sessizce düzeltmek hatayı
 * kullanıma kadar erteler.
 */

import { FIELD_KINDS, NODE_SCHEMAS } from './schema';
import type { NodeSchema, ParamConstraint, ParamSchema } from './schema';
import type { CoverageBlend, FieldKind, FieldNode, HeightBlend, SpriteDoc } from './types';

/** En küçük ve en büyük çıktı kenarı (§2). */
export const MIN_SIZE = 8;
export const MAX_SIZE = 2048;

/** Bir alan ağacının azami iç içe geçme derinliği. */
export const MAX_FIELD_DEPTH = 24;

const COVERAGE_BLENDS: readonly CoverageBlend[] = [
  'over',
  'max',
  'min',
  'add',
  'sub',
  'mul',
  'screen',
  'replace',
];
const HEIGHT_BLENDS: readonly HeightBlend[] = ['max', 'min', 'add', 'mul', 'replace'];

/**
 * Belgede görülebilecek ama alan düğümü OLMAYAN adlar ve geldikleri tur.
 *
 * Gölgeleme ve son işlem `shade`/`post` yapılandırmasıdır, `source` içine
 * yazılmaz; agent bunları düğüm sanıp denediğinde "bilinmeyen tür" yerine
 * nereye ait olduklarını öğrenir.
 */
const FUTURE_KINDS: Readonly<Record<string, string>> = {
  normal: 'Tur 3 — `shade` yapılandırması, alan düğümü değil',
  lambert: 'Tur 3 — `shade` yapılandırması, alan düğümü değil',
  rim: 'Tur 3 — `shade` yapılandırması, alan düğümü değil',
  ao: 'Tur 3 — `shade` yapılandırması, alan düğümü değil',
  outline: 'Tur 3 — `post` yapılandırması, alan düğümü değil',
  dither: 'Tur 3 — `post` yapılandırması, alan düğümü değil',
  quantize: 'Tur 3 — `post` yapılandırması, alan düğümü değil',
};

/** Belgede görülebilecek, henüz uygulanmamış ALANLAR ve geldikleri tur. */
const DEFERRED_LAYER_FIELDS: Readonly<Record<string, string>> = {
  materialAlt: 'Tur 3',
  materialMask: 'Tur 3',
  materialThreshold: 'Tur 3',
};

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

class IssueList {
  readonly items: string[] = [];

  /** Döşenebilir belgede bazı düğümler geçersizdir (§5.2). */
  constructor(readonly tileable: boolean) {}

  add(path: string, message: string): void {
    this.items.push(`${path}: ${message}`);
  }

  /** Sonlu sayı bariyeri — mesaj metni sözleşmenin adını taşır. */
  finite(path: string, value: unknown): value is number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      this.add(path, `sonlu bir sayı olmalı (gelen: ${String(value)})`);
      return false;
    }
    return true;
  }

  integer(path: string, value: unknown): value is number {
    if (!this.finite(path, value)) return false;
    if (!Number.isInteger(value)) {
      this.add(path, `tam sayı olmalı (gelen: ${String(value)})`);
      return false;
    }
    return true;
  }
}

function checkConstraint(
  issues: IssueList,
  path: string,
  value: number,
  constraint: ParamConstraint | undefined,
): void {
  switch (constraint) {
    case 'positive':
      if (!(value > 0)) issues.add(path, `sıfırdan büyük olmalı (gelen: ${value})`);
      break;
    case 'nonNegative':
      if (value < 0) issues.add(path, `negatif olamaz (gelen: ${value})`);
      break;
    case 'nonZero':
      if (value === 0) issues.add(path, 'sıfır olamaz');
      break;
    case 'unit':
      if (value < 0 || value > 1) issues.add(path, `0..1 aralığında olmalı (gelen: ${value})`);
      break;
    case 'atLeastThree':
      if (value < 3) issues.add(path, `en az 3 olmalı (gelen: ${value})`);
      break;
    default:
      break;
  }
}

function checkParam(
  issues: IssueList,
  path: string,
  param: ParamSchema,
  raw: Record<string, unknown>,
  depth = 0,
): void {
  const value = raw[param.name];
  const at = `${path}.${param.name}`;

  if (value === undefined || value === null) {
    if (!param.optional) issues.add(at, 'zorunlu alan eksik');
    return;
  }

  switch (param.type) {
    case 'number':
      if (issues.finite(at, value)) checkConstraint(issues, at, value, param.constraint);
      break;
    case 'int':
      if (issues.integer(at, value)) checkConstraint(issues, at, value, param.constraint);
      break;
    case 'bool':
      if (typeof value !== 'boolean') issues.add(at, 'true ya da false olmalı');
      break;
    case 'enum':
      if (typeof value !== 'string' || !(param.options ?? []).includes(value)) {
        issues.add(at, `şunlardan biri olmalı: ${(param.options ?? []).join(', ')}`);
      }
      break;
    case 'vec2':
      if (!Array.isArray(value) || value.length !== 2) {
        issues.add(at, 'iki elemanlı bir dizi olmalı');
        break;
      }
      for (let i = 0; i < 2; i++) {
        const component = `${at}[${i}]`;
        if (issues.finite(component, value[i])) {
          checkConstraint(issues, component, value[i] as number, param.constraint);
        }
      }
      break;
    case 'points':
      if (!Array.isArray(value) || value.length < 2) {
        issues.add(at, 'en az iki nokta içeren bir dizi olmalı');
        break;
      }
      value.forEach((point, i) => {
        if (!Array.isArray(point) || point.length !== 2) {
          issues.add(`${at}[${i}]`, '`[girdi, çıktı]` biçiminde olmalı');
          return;
        }
        issues.finite(`${at}[${i}][0]`, point[0]);
        issues.finite(`${at}[${i}][1]`, point[1]);
      });
      break;
    case 'field':
      checkField(issues, at, value, depth + 1);
      break;
    default:
      break;
  }
}

/**
 * Türe özel anlamsal kurallar — şemanın tek tek parametrelerden göremediği
 * ilişkiler ve döşeme kısıtları.
 *
 * Şemaya sıkıştırılmadılar çünkü şema PARAMETRE bildirir; buradakiler
 * parametreler ARASI ya da belge bağlamına bağlı kurallardır.
 */
function checkSemantics(
  issues: IssueList,
  path: string,
  kind: FieldKind,
  raw: Record<string, unknown>,
): void {
  if (kind === 'skew') {
    const x = raw.x;
    const y = raw.y;
    if (typeof x === 'number' && typeof y === 'number' && 1 - x * y === 0) {
      issues.add(path, 'x·y = 1 kesmesi tekildir: düzlemin tamamı bir doğruya çöker');
    }
  }

  if (kind === 'mirror' && raw.axis === 'radial' && raw.count === undefined) {
    issues.add(`${path}.count`, '`radial` aynalama kol sayısı ister');
  }

  if (!issues.tileable) return;

  // §5.2 — döşenebilirlik ızgara sarmasına dayanır ve bazı düğümler buna
  // uymaz. Sessizce yanlış üretmek yerine sınırda reddedilirler.
  if (kind === 'noise.simplex') {
    issues.add(
      path,
      'simplex kafesi EĞİKtir, ızgara sarma uygulanamaz (§5.2); ' +
        'döşenebilir belgede `noise.value` ya da `noise.worley` kullanın',
    );
  }

  if ((kind === 'noise.value' || kind === 'noise.worley') && !Number.isInteger(raw.freq)) {
    issues.add(`${path}.freq`, 'döşenebilir belgede tam sayı olmalı (§5.2)');
  }

  if (kind === 'noise.fbm' && raw.lacunarity !== undefined && !Number.isInteger(raw.lacunarity)) {
    issues.add(
      `${path}.lacunarity`,
      'döşenebilir belgede tam sayı olmalı; kesirli çarpan periyodu bozar',
    );
  }

  if (kind === 'repeat' && !Number.isInteger(raw.count)) {
    issues.add(`${path}.count`, 'döşenebilir belgede tam sayı olmalı');
  }
}

/**
 * Düğüm türünü şemaya çözer.
 *
 * `checkField` ve `domain` dizisi AYNI çözümleyiciyi kullanır; ayrı yazılmış
 * iki kopya, "bu tür Tur 3'te gelir" gibi mesajların birinde güncellenip
 * diğerinde eskimesi demekti.
 */
function resolveNodeSchema(issues: IssueList, path: string, kind: unknown): NodeSchema | null {
  if (typeof kind !== 'string') {
    issues.add(path, '`kind` alanı zorunlu');
    return null;
  }
  const future = FUTURE_KINDS[kind];
  if (future !== undefined) {
    issues.add(path, `"${kind}": ${future}`);
    return null;
  }
  if (!Object.prototype.hasOwnProperty.call(NODE_SCHEMAS, kind)) {
    issues.add(path, `bilinmeyen tür "${kind}". Uygulananlar: ${FIELD_KINDS.join(', ')}`);
    return null;
  }
  return NODE_SCHEMAS[kind as FieldKind];
}

/**
 * Şemada tanımlı olmayan anahtarlar sessizce yutulmaz.
 *
 * `exclude` bu bağlamda GEÇERSİZ olan parametreleri düşürür: `domain`
 * dizisindeki bir işlem `input` taşıyamaz (zincir sırayı zaten verir) ve
 * taşırsa yoksayılırdı — bu modülün baştan reddettiği sessiz davranış.
 */
function checkUnknownKeys(
  issues: IssueList,
  path: string,
  raw: Record<string, unknown>,
  schema: NodeSchema,
  exclude: readonly string[] = [],
): void {
  const known = new Set<string>(['kind']);
  for (const param of schema.params) {
    if (!exclude.includes(param.name)) known.add(param.name);
  }
  for (const name of Object.keys(raw)) {
    if (!known.has(name)) {
      issues.add(`${path}.${name}`, `"${schema.kind}" böyle bir parametre tanımıyor`);
    }
  }
}

/**
 * Bir alan ağacını özyinelemeli doğrular.
 *
 * Derinlik sınırlıdır: dışarıdan gelen bir JSON keyfi derinlikte olabilir ve
 * sınırsız özyineleme doğrulamayı yığın taşmasıyla düşürür — yani belgeyi
 * REDDETMEK yerine süreci öldürür. Sınır cömerttir; gerçek bir ifade bu
 * derinliğe ulaşmaz.
 */
function checkField(issues: IssueList, path: string, value: unknown, depth = 0): void {
  if (depth > MAX_FIELD_DEPTH) {
    issues.add(path, `alan ağacı ${MAX_FIELD_DEPTH} seviyeden derin olamaz`);
    return;
  }
  if (!isRecord(value)) {
    issues.add(path, 'bir alan düğümü (nesne) olmalı');
    return;
  }

  const schema = resolveNodeSchema(issues, path, value.kind);
  if (!schema) return;

  for (const param of schema.params) checkParam(issues, path, param, value, depth);
  checkUnknownKeys(issues, path, value, schema);
  checkSemantics(issues, path, schema.kind, value);
}

function checkPalette(issues: IssueList, raw: unknown): Set<number> {
  const rampIds = new Set<number>();
  if (!isRecord(raw)) {
    issues.add('palette', 'nesne olmalı');
    return rampIds;
  }

  if (raw.generate !== undefined) {
    issues.add(
      'palette.generate',
      "palet sentezi Tur 3'te gelir; şimdilik `colors` + `ramps` verilir",
    );
  }

  const colors = raw.colors;
  let colorCount = 0;
  if (!Array.isArray(colors) || colors.length === 0) {
    issues.add('palette.colors', 'en az bir renk içeren bir dizi olmalı');
  } else {
    colorCount = colors.length;
    if (colorCount > 256) issues.add('palette.colors', '256 rengi aşamaz');
    colors.forEach((color, i) => {
      if (typeof color !== 'string' || !HEX_COLOR.test(color)) {
        issues.add(`palette.colors[${i}]`, `"#rrggbb" biçiminde olmalı (gelen: ${String(color)})`);
      }
    });
  }

  const ramps = raw.ramps;
  if (!Array.isArray(ramps) || ramps.length === 0) {
    issues.add('palette.ramps', 'en az bir rampa içeren bir dizi olmalı');
    return rampIds;
  }

  ramps.forEach((ramp, i) => {
    const at = `palette.ramps[${i}]`;
    if (!isRecord(ramp)) {
      issues.add(at, 'nesne olmalı');
      return;
    }
    if (issues.integer(`${at}.id`, ramp.id)) {
      const id = ramp.id;
      if (id < 0 || id > 255) issues.add(`${at}.id`, '0..255 aralığında olmalı');
      if (rampIds.has(id)) issues.add(`${at}.id`, `rampa kimliği tekrarlanıyor: ${id}`);
      rampIds.add(id);
    }
    if (ramp.name !== undefined && typeof ramp.name !== 'string') {
      issues.add(`${at}.name`, 'metin olmalı');
    }
    const indices = ramp.indices;
    if (!Array.isArray(indices) || indices.length === 0) {
      issues.add(`${at}.indices`, 'en az bir renk indeksi içermeli');
      return;
    }
    indices.forEach((index, j) => {
      const slot = `${at}.indices[${j}]`;
      if (!issues.integer(slot, index)) return;
      if (colorCount > 0 && (index < 0 || index >= colorCount)) {
        issues.add(slot, `palette.colors sınırları dışında (0..${colorCount - 1})`);
      }
    });
  });

  // Malzeme biriktiricisi 0 ile başlar (§3): eşiğin altında kalıp malzeme
  // yazılmayan ama kapsaması sıfırdan büyük olan bir piksel rampa 0'a düşer.
  // Rampa 0'ı zorunlu kılmak, o pikselin çalışma anında patlaması yerine
  // belgenin sınırda reddedilmesi demektir.
  if (!rampIds.has(0)) {
    issues.add('palette.ramps', 'kimliği 0 olan bir rampa zorunludur (varsayılan malzeme)');
  }

  return rampIds;
}

function checkDomainChain(issues: IssueList, at: string, raw: unknown): void {
  if (!Array.isArray(raw)) {
    issues.add(`${at}.domain`, 'alan-uzayı işlemlerinden oluşan bir dizi olmalı');
    return;
  }
  raw.forEach((op, i) => {
    const opAt = `${at}.domain[${i}]`;
    if (!isRecord(op)) {
      issues.add(opAt, 'nesne olmalı');
      return;
    }
    const schema = resolveNodeSchema(issues, opAt, op.kind);
    if (!schema) return;
    if (schema.category !== 'domain') {
      issues.add(opAt, `"${schema.kind}" bir alan-uzayı işlemi değil`);
      return;
    }
    // `input` burada YOKTUR: dizi `source`a uygulanır, sırayı zincir verir.
    for (const param of schema.params) {
      if (param.name === 'input') continue;
      checkParam(issues, opAt, param, op);
    }
    checkUnknownKeys(issues, opAt, op, schema, ['input']);
    checkSemantics(issues, opAt, schema.kind, op);
  });
}

function checkLayer(issues: IssueList, index: number, raw: unknown, rampIds: Set<number>): string {
  const at = `layers[${index}]`;
  if (!isRecord(raw)) {
    issues.add(at, 'nesne olmalı');
    return '';
  }

  const id = raw.id;
  if (typeof id !== 'string' || id.length === 0) {
    issues.add(`${at}.id`, 'boş olmayan bir metin olmalı (tohum türetimi buna dayanır)');
  }

  for (const [field, round] of Object.entries(DEFERRED_LAYER_FIELDS)) {
    if (raw[field] !== undefined) issues.add(`${at}.${field}`, `${round}'te gelir`);
  }

  checkField(issues, `${at}.source`, raw.source);

  if (raw.domain !== undefined && raw.domain !== null) checkDomainChain(issues, at, raw.domain);

  if (raw.mask !== undefined && raw.mask !== null) {
    if (isRecord(raw.mask) && Array.isArray(raw.mask.layers)) {
      issues.add(`${at}.mask`, "alt-yığın maskeler Tur 3'te gelir; şimdilik üreteç verilir");
    } else {
      checkField(issues, `${at}.mask`, raw.mask);
    }
  }

  if (raw.height !== undefined && raw.height !== null)
    checkField(issues, `${at}.height`, raw.height);

  if (raw.blend !== undefined && !COVERAGE_BLENDS.includes(raw.blend as CoverageBlend)) {
    issues.add(`${at}.blend`, `şunlardan biri olmalı: ${COVERAGE_BLENDS.join(', ')}`);
  }
  if (raw.heightBlend !== undefined && !HEIGHT_BLENDS.includes(raw.heightBlend as HeightBlend)) {
    issues.add(`${at}.heightBlend`, `şunlardan biri olmalı: ${HEIGHT_BLENDS.join(', ')}`);
  }

  if (raw.opacity !== undefined && issues.finite(`${at}.opacity`, raw.opacity)) {
    checkConstraint(issues, `${at}.opacity`, raw.opacity, 'unit');
  }
  if (
    raw.materialThresholdCoverage !== undefined &&
    issues.finite(`${at}.materialThresholdCoverage`, raw.materialThresholdCoverage)
  ) {
    checkConstraint(
      issues,
      `${at}.materialThresholdCoverage`,
      raw.materialThresholdCoverage,
      'unit',
    );
  }

  if (raw.material !== undefined && issues.integer(`${at}.material`, raw.material)) {
    if (rampIds.size > 0 && !rampIds.has(raw.material)) {
      issues.add(`${at}.material`, `böyle bir rampa yok: ${raw.material}`);
    }
  }

  return typeof id === 'string' ? id : '';
}

/** Belgedeki TÜM sorunları toplar. Boş dizi = belge geçerli. */
export function collectSpriteDocIssues(input: unknown): string[] {
  if (!isRecord(input)) return ['belge: bir JSON nesnesi olmalı'];

  const tileable = input.tileable === true;
  const issues = new IssueList(tileable);

  if (input.schemaVersion !== 1) {
    issues.add('schemaVersion', `1 olmalı (gelen: ${String(input.schemaVersion)})`);
  }

  const size = input.size;
  if (!Array.isArray(size) || size.length !== 2) {
    issues.add('size', '[genişlik, yükseklik] biçiminde iki elemanlı bir dizi olmalı');
  } else {
    (['genişlik', 'yükseklik'] as const).forEach((label, i) => {
      const at = `size[${i}] (${label})`;
      if (!issues.integer(at, size[i])) return;
      const value = size[i];
      if (value < MIN_SIZE || value > MAX_SIZE) {
        issues.add(at, `${MIN_SIZE}..${MAX_SIZE} aralığında olmalı (gelen: ${value})`);
      }
    });
  }

  issues.integer('seed', input.seed);

  if (input.tileable !== undefined && typeof input.tileable !== 'boolean') {
    issues.add('tileable', 'true ya da false olmalı');
  }

  if (input.antialias !== undefined && typeof input.antialias !== 'boolean') {
    issues.add('antialias', 'true ya da false olmalı');
  }

  if (input.shade !== undefined) {
    issues.add('shade', "gölgeleme (normal/lambert/rim/ao) Tur 3'te gelir");
  }

  if (input.post !== undefined) {
    if (!isRecord(input.post)) {
      issues.add('post', 'nesne olmalı');
    } else {
      if (input.post.outline !== undefined) issues.add('post.outline', "Tur 3'te gelir");
      if (input.post.dither !== undefined) issues.add('post.dither', "Tur 3'te gelir");
      const quantize = input.post.quantize;
      if (quantize !== undefined) {
        if (!isRecord(quantize)) {
          issues.add('post.quantize', 'nesne olmalı');
        } else if (quantize.mode === 'nearest') {
          issues.add('post.quantize.mode', "OKLab en-yakın nicemleme Tur 3'te gelir");
        } else if (quantize.mode !== undefined && quantize.mode !== 'ramp') {
          issues.add('post.quantize.mode', '"ramp" olmalı');
        }
      }
    }
  }

  const rampIds = checkPalette(issues, input.palette);

  const layers = input.layers;
  if (!Array.isArray(layers) || layers.length === 0) {
    issues.add('layers', 'en az bir katman içeren bir dizi olmalı');
  } else {
    const seen = new Set<string>();
    layers.forEach((layer, i) => {
      const id = checkLayer(issues, i, layer, rampIds);
      if (id.length === 0) return;
      // Kimlik tohum türetiminde kullanılır (D5); tekrarlanan kimlik iki
      // katmanı aynı gürültüye bağlar ve fark gözden geçirilemez olur.
      if (seen.has(id)) issues.add(`layers[${i}].id`, `katman kimliği tekrarlanıyor: "${id}"`);
      seen.add(id);
    });
  }

  return issues.items;
}

/** Belgeyi doğrular; geçersizse TÜM sorunları tek hatada bildirir. */
export function validateSpriteDoc(input: unknown): SpriteDoc {
  const issues = collectSpriteDocIssues(input);
  if (issues.length > 0) {
    throw new Error(
      `Görsel belge geçersiz (${issues.length} sorun):\n` +
        issues.map((issue) => `  - ${issue}`).join('\n'),
    );
  }
  return input as SpriteDoc;
}

/**
 * Bir alan ağacını tek başına doğrular — maske/yükseklik parçaları için.
 *
 * `tileable` verilmezse döşeme kuralları uygulanmaz; tek başına bir alan
 * hangi belgede kullanılacağını bilmez.
 */
export function collectFieldIssues(node: unknown, path = 'field', tileable = false): string[] {
  const issues = new IssueList(tileable);
  checkField(issues, path, node);
  return issues.items;
}

/** Dışarıdan gelen `FieldNode`u doğrular ve tipler. */
export function validateField(node: unknown, path = 'field', tileable = false): FieldNode {
  const issues = collectFieldIssues(node, path, tileable);
  if (issues.length > 0) {
    throw new Error(
      `Alan geçersiz (${issues.length} sorun):\n` +
        issues.map((issue) => `  - ${issue}`).join('\n'),
    );
  }
  return node as FieldNode;
}
