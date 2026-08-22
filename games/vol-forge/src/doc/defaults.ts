import {
  NODE_SCHEMAS,
  resolveFieldDomain,
  type FieldDomain,
  type FieldKind,
  type FieldNode,
  type LayerSpec,
  type NodeSchema,
  type ParamSchema,
} from '@volstudio/core/visual';

/**
 * Şemadan varsayılan düğüm kurma — §8.5'in "değiştir" ve "sar" işlemlerinin
 * dayanağı.
 *
 * Şemadaki `default` alanının asıl tüketicisi burasıdır: bir düğümün türü
 * değiştiğinde ya da yeni bir düğüm eklendiğinde parametreler bir yerden
 * gelmek zorundadır ve o yer şemadır — editörde ikinci bir varsayılan
 * tablosu tutmak, şemayla ayrışmaya davetiye olurdu.
 */

/** Etki alanına göre "boş yuva" dolgusu (§8.5). */
export function fillerFor(domain: FieldDomain): FieldNode {
  return domain === 'signed'
    ? ({ kind: 'sdf.circle', r: 0.3 } as FieldNode)
    : ({ kind: 'const', value: 1 } as FieldNode);
}

function defaultParamValue(param: ParamSchema, filler: FieldNode): unknown {
  if (param.type === 'field') return filler;
  if (param.default !== undefined) {
    return Array.isArray(param.default) ? (param.default as unknown[]).slice() : param.default;
  }
  if (param.type === 'enum') return param.options?.[0];
  return 0;
}

/**
 * Verilen türden, zorunlu parametreleri doldurulmuş bir düğüm üretir.
 *
 * Opsiyonel parametreler YAZILMAZ: her varsayılanı açıkça yazan bir belge
 * diff'te okunmaz hâle gelir ve neyin bilinçli ayarlandığı kaybolur (§8.6).
 */
export function defaultNode(kind: FieldKind, fillerDomain: FieldDomain = 'unit'): FieldNode {
  const schema: NodeSchema = NODE_SCHEMAS[kind];
  const filler = fillerFor(fillerDomain);
  const node: Record<string, unknown> = { kind };
  for (const param of schema.params) {
    if (param.optional) continue;
    node[param.name] = defaultParamValue(param, filler);
  }
  return node as unknown as FieldNode;
}

/**
 * Türü değiştirirken parametreleri taşır.
 *
 * AYNI ADI taşıyan parametreler değerlerini korur (`center`, `r`, `freq`);
 * kalanlar şemadan gelir. Böylece `sdf.circle` → `sdf.star` geçişinde merkez
 * yerinde kalır ve kullanıcı konumu yeniden bulmak zorunda kalmaz.
 */
export function changeKind(node: FieldNode, kind: FieldKind): FieldNode {
  const source = node as unknown as Record<string, unknown>;
  const target = defaultNode(kind, resolveFieldDomain(node)) as unknown as Record<string, unknown>;
  const schema = NODE_SCHEMAS[kind];

  for (const param of schema.params) {
    const existing = source[param.name];
    if (existing === undefined) continue;
    // Alan parametreleri de taşınır: `blur(x)` → `dilate(x)` alt ağacı korur.
    target[param.name] = existing;
  }
  return target as unknown as FieldNode;
}

/**
 * Düğümü yeni bir düğümün İÇİNE koyar.
 *
 * Sarmalayıcının İLK alan parametresi sarılan düğümü alır; kalan alan
 * parametreleri sarılanla AYNI ETKİ ALANINDA bir dolguyla doldurulur.
 * Böylece `min` gibi iki girdili bir düğümle sarmak, geçersiz bir ağaç
 * üretmez ve kullanıcı hemen bir doğrulama hatasıyla karşılaşmaz (§8.5).
 */
export function wrapNode(node: FieldNode, kind: FieldKind): FieldNode {
  const domain = resolveFieldDomain(node);
  const wrapper = defaultNode(kind, domain) as unknown as Record<string, unknown>;
  const fieldParams = NODE_SCHEMAS[kind].params.filter((param) => param.type === 'field');
  if (fieldParams.length === 0) {
    throw new Error(`"${kind}" alan parametresi taşımıyor, sarmalayıcı olamaz`);
  }
  wrapper[fieldParams[0].name] = node;
  return wrapper as unknown as FieldNode;
}

/** Sarmalayıcı olabilecek türler — en az bir alan parametresi taşıyanlar. */
export function wrapperKinds(): FieldKind[] {
  return (Object.keys(NODE_SCHEMAS) as FieldKind[]).filter((kind) =>
    NODE_SCHEMAS[kind].params.some((param) => param.type === 'field'),
  );
}

/** Bir düğümün alan parametrelerinin adları — "çıkar" işlemi bunları sorar. */
export function fieldParamNames(node: FieldNode): string[] {
  return NODE_SCHEMAS[node.kind].params
    .filter((param) => param.type === 'field')
    .map((param) => param.name);
}

/**
 * Düğümü siler; verilen alan parametresindeki çocuk yerine geçer.
 *
 * Tek girdili düğümlerde soru yoktur. İki girdili düğümlerde hangisinin
 * kalacağını çağıran seçer — editör bunu kullanıcıya sorar.
 */
export function extractChild(node: FieldNode, param: string): FieldNode {
  const child = (node as unknown as Record<string, unknown>)[param];
  if (child === undefined || child === null) {
    throw new Error(`"${node.kind}" düğümünde "${param}" alanı yok`);
  }
  return child as FieldNode;
}

/** Yeni bir katman — belgeye eklenmeye hazır. */
export function defaultLayer(id: string, material = 0): LayerSpec {
  return {
    id,
    source: { kind: 'sdf.circle', center: [0, 0], r: 0.5 },
    material,
  } as LayerSpec;
}
