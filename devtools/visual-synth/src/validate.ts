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

import { FIELD_KINDS, NODE_SCHEMAS, resolveFieldDomain } from './schema';
import type { NodeSchema, ParamConstraint, ParamSchema } from './schema';
import type {
  CoverageBlend,
  FieldKind,
  FieldNode,
  HeightBlend,
  LayerSpec,
  LayerStack,
  SpriteDoc,
} from './types';

/** En küçük ve en büyük çıktı kenarı (§2). */
export const MIN_SIZE = 8;
export const MAX_SIZE = 2048;

/** Bir alan ağacının azami iç içe geçme derinliği. */
export const MAX_FIELD_DEPTH = 24;

/**
 * Alt-yığın maskelerin azami derinliği (D10).
 *
 * Sınır bellek bütçesinden (D7 — seviye başına kendi biriktiricisi) ve
 * editörde gezilebilirlikten geliyor. Sonsuz derinlik pratikte gerekmedi;
 * sınırsız bırakmak hem belleği hem arayüzü öngörülemez yapardı.
 */
export const MAX_STACK_DEPTH = 4;

/**
 * `points` tipli parametrelerin (sdf.path, curve) azami eleman sayısı.
 *
 * İkisi de piksel başına noktalar üzerinde DOĞRUSAL tarama yapar (bkz.
 * field/sdf.ts pathSdfField, field/combine.ts curveField); nokta sayısının
 * şemada bir `range` karşılığı yok, dolayısıyla tek koruma bu sabit.
 */
export const MAX_POINTS = 64;

/** `shade.ao.radius` BİRİM uzayda; tavan olmadan boxBlur tampon ayırmayı çökertir. */
const MAX_AO_RADIUS = 4;

/** `post.outline.px` PİKSEL uzayda; `post.glow.radius`la aynı güvenlik tavanı. */
const MAX_OUTLINE_PX = 64;

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
const NOT_A_NODE: Readonly<Record<string, string>> = {
  normal: '`shade` yapılandırmasının parçası, alan düğümü değil',
  lambert: '`shade` yapılandırmasının parçası, alan düğümü değil',
  rim: '`shade` yapılandırmasının parçası, alan düğümü değil',
  ao: '`shade.ao` yapılandırması, alan düğümü değil',
  outline: '`post.outline` yapılandırması, alan düğümü değil',
  dither: '`post.dither` yapılandırması, alan düğümü değil',
  glow: '`post.glow` yapılandırması, alan düğümü değil',
  quantize: '`post.quantize` yapılandırması, alan düğümü değil',
};

const OUTLINE_MODES = ['outside', 'inside', 'centered'];
const DITHER_KINDS = ['none', 'bayer2', 'bayer4', 'bayer8', 'blueNoise'];
const SAT_CURVES = ['flat', 'arch', 'rise'];
const QUANTIZE_MODES = ['ramp', 'nearest'];

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

/** `range`den ayrı, gerçekten uygulanan tavan (bkz. ParamSchema.hardMax). */
function checkHardMax(
  issues: IssueList,
  path: string,
  value: number,
  hardMax: number | undefined,
): void {
  if (hardMax !== undefined && value > hardMax) {
    issues.add(path, `${hardMax} değerini aşamaz (gelen: ${value})`);
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
      if (issues.finite(at, value)) {
        checkConstraint(issues, at, value, param.constraint);
        checkHardMax(issues, at, value, param.hardMax);
      }
      break;
    case 'int':
      if (issues.integer(at, value)) {
        checkConstraint(issues, at, value, param.constraint);
        checkHardMax(issues, at, value, param.hardMax);
      }
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
      if (value.length > MAX_POINTS) {
        issues.add(at, `en fazla ${MAX_POINTS} nokta içerebilir (gelen: ${value.length})`);
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
  const misplaced = NOT_A_NODE[kind];
  if (misplaced !== undefined) {
    issues.add(path, `"${kind}": ${misplaced}`);
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

/**
 * Sentez isteklerini doğrular ve üretilecek rampa kimliklerini döndürür.
 *
 * Kimlikler 0'dan başlayarak SIRAYLA verilir; `material: 0` varsayılanı bu
 * sayede sentezlenmiş bir palette de her zaman geçerlidir.
 */
function checkGenerate(issues: IssueList, raw: unknown): Set<number> {
  const rampIds = new Set<number>();
  if (!Array.isArray(raw) || raw.length === 0) {
    issues.add('palette.generate', 'en az bir rampa isteği içeren bir dizi olmalı');
    return rampIds;
  }

  const KNOWN = ['base', 'steps', 'hueShift', 'satCurve', 'lightRange', 'name'];

  raw.forEach((request, i) => {
    const at = `palette.generate[${i}]`;
    if (!isRecord(request)) {
      issues.add(at, 'nesne olmalı');
      return;
    }
    rampIds.add(i);

    if (typeof request.base !== 'string' || !HEX_COLOR.test(request.base)) {
      issues.add(`${at}.base`, `"#rrggbb" biçiminde olmalı (gelen: ${String(request.base)})`);
    }
    if (issues.integer(`${at}.steps`, request.steps) && (request.steps < 1 || request.steps > 64)) {
      issues.add(`${at}.steps`, '1..64 aralığında olmalı');
    }
    if (request.hueShift !== undefined) issues.finite(`${at}.hueShift`, request.hueShift);
    if (request.satCurve !== undefined && !SAT_CURVES.includes(request.satCurve as string)) {
      issues.add(`${at}.satCurve`, `şunlardan biri olmalı: ${SAT_CURVES.join(', ')}`);
    }
    if (request.name !== undefined && typeof request.name !== 'string') {
      issues.add(`${at}.name`, 'metin olmalı');
    }
    if (request.lightRange !== undefined) {
      const range = request.lightRange;
      if (!Array.isArray(range) || range.length !== 2) {
        issues.add(`${at}.lightRange`, 'iki elemanlı bir dizi olmalı');
      } else {
        range.forEach((value, j) => {
          const slot = `${at}.lightRange[${j}]`;
          if (issues.finite(slot, value)) checkConstraint(issues, slot, value, 'unit');
        });
      }
    }
    for (const name of Object.keys(request)) {
      if (!KNOWN.includes(name)) {
        issues.add(`${at}.${name}`, 'rampa isteği böyle bir alan tanımıyor');
      }
    }
  });

  return rampIds;
}

function checkPalette(issues: IssueList, raw: unknown): Set<number> {
  const rampIds = new Set<number>();
  if (!isRecord(raw)) {
    issues.add('palette', 'nesne olmalı');
    return rampIds;
  }

  // Palet ya VERİ ya SENTEZdir. Karıştırmak renk indekslerinin kimin
  // tarafından yönetildiğini belirsiz yapardı.
  if (raw.generate !== undefined) {
    if (raw.colors !== undefined || raw.ramps !== undefined) {
      issues.add('palette', '`generate` ile `colors`/`ramps` birlikte verilemez');
    }
    return checkGenerate(issues, raw.generate);
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

function checkLayer(
  issues: IssueList,
  at: string,
  raw: unknown,
  rampIds: Set<number>,
  seen: Set<string>,
  depth: number,
): void {
  if (!isRecord(raw)) {
    issues.add(at, 'nesne olmalı');
    return;
  }

  const id = raw.id;
  if (typeof id !== 'string' || id.length === 0) {
    issues.add(`${at}.id`, 'boş olmayan bir metin olmalı (tohum türetimi buna dayanır)');
  } else if (seen.has(id)) {
    // Kimlik tohum türetiminde kullanılır (D5); tekrarlanan kimlik iki katmanı
    // aynı gürültüye bağlar. Kapsam BELGE GENELİdir: alt-yığındaki bir katman
    // da üsttekiyle aynı kimliği taşıyamaz.
    issues.add(`${at}.id`, `katman kimliği tekrarlanıyor: "${id}"`);
  } else {
    seen.add(id);
  }

  checkField(issues, `${at}.source`, raw.source);

  if (raw.domain !== undefined && raw.domain !== null) checkDomainChain(issues, at, raw.domain);

  if (raw.mask !== undefined && raw.mask !== null) {
    if (isRecord(raw.mask) && raw.mask.layers !== undefined) {
      checkLayerStack(issues, `${at}.mask`, raw.mask.layers, rampIds, seen, depth + 1);
      for (const name of Object.keys(raw.mask)) {
        if (name !== 'layers') {
          issues.add(`${at}.mask.${name}`, 'alt-yığın yalnızca `layers` taşır');
        }
      }
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

  // İkinci malzeme ve onu seçen maske birbirsiz anlamsızdır: `materialAlt`
  // tek başına hiç tetiklenmez, `materialMask` tek başına hiçbir şey seçmez.
  const hasAlt = raw.materialAlt !== undefined;
  const hasSelector = raw.materialMask !== undefined && raw.materialMask !== null;
  if (hasAlt !== hasSelector) {
    issues.add(`${at}.materialAlt`, '`materialAlt` ve `materialMask` birlikte verilir');
  }
  if (hasAlt && issues.integer(`${at}.materialAlt`, raw.materialAlt)) {
    if (rampIds.size > 0 && !rampIds.has(raw.materialAlt)) {
      issues.add(`${at}.materialAlt`, `böyle bir rampa yok: ${raw.materialAlt}`);
    }
  }
  if (hasSelector) checkField(issues, `${at}.materialMask`, raw.materialMask);
  if (
    raw.materialThreshold !== undefined &&
    issues.finite(`${at}.materialThreshold`, raw.materialThreshold)
  ) {
    checkConstraint(issues, `${at}.materialThreshold`, raw.materialThreshold, 'unit');
  }
}

/**
 * İzotropik olmayan `scale` (x≠y) bir signed-domain (SDF) alt-ağacını
 * sarmalıyorsa reddeder.
 *
 * `scaleInverse` yalnızca KOORDİNATI uzatır; dönen SDF DEĞERİ kaynağın
 * mesafesi kalır (bkz. `field/domain.ts` `scaleInverse` JSDoc'u — Lipschitz
 * sabiti bozulur). Bu, iki SOMUT tüketicide gerçek, ölçülebilir yanlış
 * sonuca dönüşür:
 *
 * 1. `toCoverageFn` (field/coverage.ts) `antialias: true` iken kenar
 *    yumuşatma genişliğini `space.pixelUnit` (İZOTROPİK, tek sayı) ile
 *    hesaplar — anizotropik ölçekli bir SDF'nin kenarı bir eksende
 *    beklenenden yumuşak/keskin çıkar.
 * 2. `sdf.smoothUnion`/`smoothSub`/`smoothIntersection` harman yarıçapı
 *    `k`yı DOĞRUDAN girdi mesafe değerleri üzerinde uygular; bir girdi
 *    anizotropik ölçekliyse harman simetrik olmaz.
 *
 * `post.outline` ve `distance` filtre düğümü bu sorundan MUAF: ikisi de
 * kapsamaya (coverage) çevrilmiş, PİKSEL uzayında ayrık bir gösterim
 * üzerinde çalışır — ham SDF değerini asla mesafe/uzunluk olarak okumazlar.
 * Katman düzeyindeki `domain` zinciri de muaf: `renderLayer` `domain`ı
 * `compileCoverage` SONRASINA uygular, yani kapsamaya çevrilmiş bir
 * görüntüyü geometrik olarak yeniden örnekler (bitmap yeniden boyutlandırma
 * gibi) — SDF değeri o noktada zaten kapsamaya dönüşmüştür.
 *
 * `resolveFieldDomain` yalnızca YAPISAL OLARAK GEÇERLİ bir ağaçta güvenlidir
 * (bkz. kendi JSDoc'u — `NODE_SCHEMAS[node.kind]` doğrulanmamış bir `kind`de
 * fırlatır). Bu yüzden bu fonksiyon `collectSpriteDocIssues` sıfır YAPISAL
 * sorun bildirdikten SONRA, `input`i `SpriteDoc` olarak güvenle
 * ele alabileceği noktada çağrılır.
 */
function checkAnisotropicScaleOverSignedFields(issues: IssueList, doc: SpriteDoc): void {
  const visitField = (node: FieldNode, path: string): void => {
    if (node.kind === 'scale' && node.x !== node.y && resolveFieldDomain(node.input) === 'signed') {
      issues.add(
        path,
        'izotropik olmayan `scale` (x≠y) bir signed-distance (SDF) alt-ağacını sarmalıyor: ' +
          'kenar yumuşatma genişliği ve sdf.smoothUnion/smoothSub/smoothIntersection harman ' +
          'yarıçapı bu SDF üzerinde yanlış sonuç üretir (bkz. field/domain.ts scaleInverse). ' +
          "x=y (izotropik) kullanın, ya da bu SDF alt-ağacını KENDİ scope'unda coverage'a " +
          'çevirdikten sonra (ör. ayrı bir katman/maske olarak) ölçekleyin.',
      );
    }
    for (const param of NODE_SCHEMAS[node.kind].params) {
      if (param.type !== 'field') continue;
      const child = (node as unknown as Record<string, unknown>)[param.name];
      if (child && typeof child === 'object') {
        visitField(child as FieldNode, `${path}.${param.name}`);
      }
    }
  };

  const visitLayers = (layers: readonly LayerSpec[], path: string): void => {
    layers.forEach((layer, i) => {
      const at = `${path}[${i}]`;
      visitField(layer.source, `${at}.source`);
      if (layer.mask) {
        if (isLayerStackNode(layer.mask)) visitLayers(layer.mask.layers, `${at}.mask`);
        else visitField(layer.mask, `${at}.mask`);
      }
      if (layer.height) visitField(layer.height, `${at}.height`);
      if (layer.materialMask) visitField(layer.materialMask, `${at}.materialMask`);
    });
  };

  visitLayers(doc.layers, 'layers');
}

function isLayerStackNode(value: FieldNode | LayerStack): value is LayerStack {
  return Array.isArray((value as LayerStack).layers);
}

/** Bir katman yığınını doğrular; alt-yığınlar için özyinelemelidir (D10). */
function checkLayerStack(
  issues: IssueList,
  path: string,
  raw: unknown,
  rampIds: Set<number>,
  seen: Set<string>,
  depth: number,
): void {
  if (depth > MAX_STACK_DEPTH) {
    issues.add(path, `alt-yığın ${MAX_STACK_DEPTH} seviyeden derin olamaz`);
    return;
  }
  if (!Array.isArray(raw) || raw.length === 0) {
    issues.add(path, 'en az bir katman içeren bir dizi olmalı');
    return;
  }
  raw.forEach((layer, i) => {
    checkLayer(issues, `${path}[${i}]`, layer, rampIds, seen, depth);
  });
}

/** Gölgeleme yapılandırması — §4.5. */
function checkShade(issues: IssueList, raw: unknown): void {
  if (!isRecord(raw)) {
    issues.add('shade', 'nesne olmalı');
    return;
  }

  if (raw.light !== undefined) {
    const light = raw.light;
    if (!Array.isArray(light) || light.length !== 3) {
      issues.add('shade.light', 'üç elemanlı bir dizi olmalı');
    } else {
      light.forEach((value, i) => issues.finite(`shade.light[${i}]`, value));
      // Sıfır vektör normalize edilemez; yön bilgisi taşımayan bir ışık
      // sessizce sabit bir gölgeye dönüşürdü.
      if (light.every((value) => value === 0)) {
        issues.add('shade.light', 'sıfır vektör olamaz — yön taşımalı');
      }
    }
  }

  for (const name of ['strength', 'ambient', 'rim', 'relief', 'emission'] as const) {
    const value = raw[name];
    if (value === undefined) continue;
    if (issues.finite(`shade.${name}`, value)) {
      checkConstraint(issues, `shade.${name}`, value, name === 'emission' ? 'unit' : 'nonNegative');
    }
  }

  if (raw.ao !== undefined && raw.ao !== null) {
    if (!isRecord(raw.ao)) {
      issues.add('shade.ao', 'nesne olmalı');
    } else {
      if (issues.finite('shade.ao.radius', raw.ao.radius)) {
        checkConstraint(issues, 'shade.ao.radius', raw.ao.radius, 'nonNegative');
        checkHardMax(issues, 'shade.ao.radius', raw.ao.radius, MAX_AO_RADIUS);
      }
      if (issues.finite('shade.ao.strength', raw.ao.strength)) {
        checkConstraint(issues, 'shade.ao.strength', raw.ao.strength, 'nonNegative');
      }
      for (const name of Object.keys(raw.ao)) {
        if (name !== 'radius' && name !== 'strength') {
          issues.add(`shade.ao.${name}`, '`ao` böyle bir alan tanımıyor');
        }
      }
    }
  }

  for (const name of Object.keys(raw)) {
    if (!['light', 'strength', 'ambient', 'rim', 'relief', 'emission', 'ao'].includes(name)) {
      issues.add(`shade.${name}`, '`shade` böyle bir alan tanımıyor');
    }
  }
}

/** Sentezlenmiş palette renk sayısı isteklerden türer. */
function colorCountOf(palette: unknown): number {
  if (!isRecord(palette)) return 0;
  if (Array.isArray(palette.colors)) return palette.colors.length;
  if (Array.isArray(palette.generate)) {
    return palette.generate.reduce<number>(
      (total, request) =>
        total + (isRecord(request) && typeof request.steps === 'number' ? request.steps : 0),
      0,
    );
  }
  return 0;
}

/** Piksel-uzay son işlem — §4.6. */
function checkPost(issues: IssueList, raw: unknown, colorCount: number): void {
  if (!isRecord(raw)) {
    issues.add('post', 'nesne olmalı');
    return;
  }

  const outline = raw.outline;
  if (outline !== undefined && outline !== null) {
    if (!isRecord(outline)) {
      issues.add('post.outline', 'nesne olmalı');
    } else {
      if (issues.integer('post.outline.px', outline.px)) {
        checkConstraint(issues, 'post.outline.px', outline.px, 'nonNegative');
        checkHardMax(issues, 'post.outline.px', outline.px, MAX_OUTLINE_PX);
      }
      if (outline.mode !== undefined && !OUTLINE_MODES.includes(outline.mode as string)) {
        issues.add('post.outline.mode', `şunlardan biri olmalı: ${OUTLINE_MODES.join(', ')}`);
      }
      if (
        outline.colorIndex !== undefined &&
        issues.integer('post.outline.colorIndex', outline.colorIndex) &&
        colorCount > 0 &&
        (outline.colorIndex < 0 || outline.colorIndex >= colorCount)
      ) {
        issues.add('post.outline.colorIndex', `palet sınırları dışında (0..${colorCount - 1})`);
      }
      for (const name of Object.keys(outline)) {
        if (!['px', 'mode', 'colorIndex'].includes(name)) {
          issues.add(`post.outline.${name}`, '`outline` böyle bir alan tanımıyor');
        }
      }
    }
  }

  const dither = raw.dither;
  if (dither !== undefined && dither !== null) {
    if (!isRecord(dither)) {
      issues.add('post.dither', 'nesne olmalı');
    } else {
      if (!DITHER_KINDS.includes(dither.kind as string)) {
        issues.add('post.dither.kind', `şunlardan biri olmalı: ${DITHER_KINDS.join(', ')}`);
      }
      if (dither.amount !== undefined && issues.finite('post.dither.amount', dither.amount)) {
        checkConstraint(issues, 'post.dither.amount', dither.amount, 'unit');
      }
      for (const name of Object.keys(dither)) {
        if (name !== 'kind' && name !== 'amount') {
          issues.add(`post.dither.${name}`, '`dither` böyle bir alan tanımıyor');
        }
      }
    }
  }

  const glow = raw.glow;
  if (glow !== undefined && glow !== null) {
    if (!isRecord(glow)) {
      issues.add('post.glow', 'nesne olmalı');
    } else {
      if (issues.integer('post.glow.radius', glow.radius)) {
        checkConstraint(issues, 'post.glow.radius', glow.radius, 'nonNegative');
        if (glow.radius > 64) issues.add('post.glow.radius', '0..64 piksel aralığında olmalı');
      }
      if (issues.finite('post.glow.strength', glow.strength)) {
        checkConstraint(issues, 'post.glow.strength', glow.strength, 'unit');
      }
      if (glow.threshold !== undefined && issues.finite('post.glow.threshold', glow.threshold)) {
        checkConstraint(issues, 'post.glow.threshold', glow.threshold, 'unit');
      }
      if (
        glow.colorIndex !== undefined &&
        issues.integer('post.glow.colorIndex', glow.colorIndex) &&
        colorCount > 0 &&
        (glow.colorIndex < 0 || glow.colorIndex >= colorCount)
      ) {
        issues.add('post.glow.colorIndex', `palet sınırları dışında (0..${colorCount - 1})`);
      }
      for (const name of Object.keys(glow)) {
        if (!['radius', 'strength', 'threshold', 'colorIndex'].includes(name)) {
          issues.add(`post.glow.${name}`, '`glow` böyle bir alan tanımıyor');
        }
      }
    }
  }

  const quantize = raw.quantize;
  if (quantize !== undefined) {
    if (!isRecord(quantize)) {
      issues.add('post.quantize', 'nesne olmalı');
    } else if (!QUANTIZE_MODES.includes(quantize.mode as string)) {
      issues.add('post.quantize.mode', `şunlardan biri olmalı: ${QUANTIZE_MODES.join(', ')}`);
    }
  }

  for (const name of Object.keys(raw)) {
    if (!['outline', 'dither', 'glow', 'quantize'].includes(name)) {
      issues.add(`post.${name}`, '`post` böyle bir alan tanımıyor');
    }
  }
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

  if (input.shade !== undefined) checkShade(issues, input.shade);

  const rampIds = checkPalette(issues, input.palette);

  if (input.post !== undefined) checkPost(issues, input.post, colorCountOf(input.palette));

  checkLayerStack(issues, 'layers', input.layers, rampIds, new Set<string>(), 0);

  // `resolveFieldDomain` YALNIZCA yapısal olarak geçerli bir ağaçta
  // güvenlidir (bkz. kendi JSDoc'u) — buraya kadar hiç sorun toplanmadıysa
  // `input` artık güvenle `SpriteDoc` sayılabilir.
  if (issues.items.length === 0) {
    checkAnisotropicScaleOverSignedFields(issues, input as unknown as SpriteDoc);
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
