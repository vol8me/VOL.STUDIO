/**
 * Belge doğrulaması — D11'in bekçi tarafı.
 *
 * İki ilke:
 *
 * 1. **Tüm sorunlar tek seferde bildirilir.** İlk hatada durmak, agent'ı
 *    "düzelt–çalıştır–düzelt" döngüsüne sokar. `scripts/quality/config.mjs`
 *    aynı kararı ses/kapı tarafında verdi.
 * 2. **Henüz uygulanmamış bir alan SESSİZCE YOKSAYILMAZ.** Yoksayılırsa
 *    belge tip denetiminden geçer, render olur ve istenenden başka bir şey
 *    çizer. Bunun yerine hangi turda geleceği söylenerek reddedilir.
 *
 * Sonlu sayı sözleşmesi (`core/docs/primitives.md`): `size`, `seed`, `freq`
 * gibi YAPILANDIRMA değerleri REDDEDİLİR — sessizce düzeltmek hatayı
 * kullanıma kadar erteler.
 */

import {
  NODE_SCHEMAS,
  FIELD_KINDS,
  type NodeSchema,
  type ParamConstraint,
  type ParamSchema,
} from './schema';
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
 * Envanterde (§4) tanımlı ama henüz uygulanmamış düğümler ve geldikleri tur.
 *
 * "Bilinmeyen tür" demek yerine yol haritasını söylemek, belgeyi yazan
 * agent'ın bir sonraki hamlesini belirler.
 */
const FUTURE_KINDS: Readonly<Record<string, string>> = {
  'noise.simplex': 'Tur 2',
  'noise.worley': 'Tur 2',
  'noise.fbm': 'Tur 2',
  'gradient.angular': 'Tur 2',
  'gradient.diamond': 'Tur 2',
  'sdf.roundBox': 'Tur 2',
  'sdf.polygon': 'Tur 2',
  'sdf.star': 'Tur 2',
  'sdf.line': 'Tur 2',
  'sdf.capsule': 'Tur 2',
  'sdf.arc': 'Tur 2',
  'pattern.checker': 'Tur 2',
  'pattern.stripes': 'Tur 2',
  'pattern.dots': 'Tur 2',
  'pattern.grid': 'Tur 2',
  'pattern.hex': 'Tur 2',
  skew: 'Tur 2',
  mirror: 'Tur 2',
  repeat: 'Tur 2',
  polar: 'Tur 2',
  warp: 'Tur 2',
  scatter: 'Tur 2',
  sub: 'Tur 2',
  screen: 'Tur 2',
  overlay: 'Tur 2',
  remap: 'Tur 2',
  curve: 'Tur 2',
  clamp: 'Tur 2',
  abs: 'Tur 2',
  invert: 'Tur 2',
  blur: 'Tur 2',
  sharpen: 'Tur 2',
  dilate: 'Tur 2',
  erode: 'Tur 2',
  edge: 'Tur 2',
  distance: 'Tur 2',
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
    case 'field':
      checkField(issues, at, value, depth + 1);
      break;
    default:
      break;
  }
}

/**
 * Düğüm türünü şemaya çözer.
 *
 * `checkField` ve `domain` dizisi AYNI çözümleyiciyi kullanır; ayrı yazılmış
 * iki kopya, "bu tür Tur 2'de gelir" gibi mesajların birinde güncellenip
 * diğerinde eskimesi demekti.
 */
function resolveNodeSchema(issues: IssueList, path: string, kind: unknown): NodeSchema | null {
  if (typeof kind !== 'string') {
    issues.add(path, '`kind` alanı zorunlu');
    return null;
  }
  const future = FUTURE_KINDS[kind];
  if (future !== undefined) {
    issues.add(path, `"${kind}" envanterde var ama henüz uygulanmadı (${future})`);
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
}

function checkPalette(issues: IssueList, raw: unknown): Set<number> {
  const rampIds = new Set<number>();
  if (!isRecord(raw)) {
    issues.add('palette', 'nesne olmalı');
    return rampIds;
  }

  if (isRecord(raw) && raw.generate !== undefined) {
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

  if (raw.domain !== undefined && raw.domain !== null) {
    if (!Array.isArray(raw.domain)) {
      issues.add(`${at}.domain`, 'alan-uzayı işlemlerinden oluşan bir dizi olmalı');
    } else {
      raw.domain.forEach((op, i) => {
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
      });
    }
  }

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
  const issues = new IssueList();

  if (!isRecord(input)) {
    return ['belge: bir JSON nesnesi olmalı'];
  }

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

  if (input.tileable === true) {
    issues.add('tileable', "döşenebilir üretim Tur 2'de gelir; şimdilik false olmalı");
  } else if (input.tileable !== undefined && typeof input.tileable !== 'boolean') {
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

/** Bir alan ağacını tek başına doğrular — maske/yükseklik parçaları için. */
export function collectFieldIssues(node: unknown, path = 'field'): string[] {
  const issues = new IssueList();
  checkField(issues, path, node);
  return issues.items;
}

/** Dışarıdan gelen `FieldNode`u doğrular ve tipler. */
export function validateField(node: unknown, path = 'field'): FieldNode {
  const issues = collectFieldIssues(node, path);
  if (issues.length > 0) {
    throw new Error(
      `Alan geçersiz (${issues.length} sorun):\n` + issues.map((i) => `  - ${i}`).join('\n'),
    );
  }
  return node as FieldNode;
}
