/**
 * Parametre şeması — D11.

 *
 * Şema dört kategoriye bölünmüştür (üreteç, alan-uzayı, tamponlu,
 * birleştirici) ve burada tek bir kayıtta toplanır. Bölünme keyfi değil:
 * editör (Tur 4) kontrolleri kategoriye göre gruplayacak ve tek bir devasa
 * dosya hem gezilemez hem de anti-borç kuralının 600 satır sınırının çok
 * üstünde olurdu.
 *
 * Şema ayrıca her düğümün ÇIKTI ETKİ ALANINI (`unit` / `signed`) bildirir.
 * Bu, katman kaynağının kapsamaya nasıl çevrileceğini belirleyen tek
 * bilgidir (§5.8) ve statik olarak türetilir — çalışma anında değer
 * yoklanmaz.
 */

import type { FieldDomain, FieldKind, FieldNode } from '../types';
import { GENERATOR_SCHEMAS } from './generators';
import { DOMAIN_SCHEMAS } from './domain';
import { BUFFERED_SCHEMAS } from './buffered';
import { COMBINE_SCHEMAS } from './combine';
import type { NodeSchema } from './types';

export type { NodeSchema, OutputRule, ParamConstraint, ParamSchema, ParamType } from './types';

const ALL_SCHEMAS: readonly NodeSchema[] = [
  ...GENERATOR_SCHEMAS,
  ...DOMAIN_SCHEMAS,
  ...BUFFERED_SCHEMAS,
  ...COMBINE_SCHEMAS,
];

export const NODE_SCHEMAS: Readonly<Record<FieldKind, NodeSchema>> = Object.fromEntries(
  ALL_SCHEMAS.map((schema) => [schema.kind, schema]),
) as Record<FieldKind, NodeSchema>;

/** Uygulanmış düğüm türleri — hata mesajlarında ve editör listesinde kullanılır. */
export const FIELD_KINDS: readonly FieldKind[] = ALL_SCHEMAS.map((schema) => schema.kind);

/**
 * Bir alan ağacının çıktı etki alanını STATİK olarak çözer.
 *
 * Doğrulama bu fonksiyonu çağırmadan önce ağacın yapısını denetler; buraya
 * yalnızca geçerli bir ağaç gelir.
 */
export function resolveFieldDomain(node: FieldNode): FieldDomain {
  const rule = NODE_SCHEMAS[node.kind].output;
  if (rule.kind === 'fixed') return rule.domain;

  const record = node as unknown as Record<string, FieldNode>;
  if (rule.kind === 'inherit') return resolveFieldDomain(record[rule.from]);

  for (const name of rule.from) {
    if (resolveFieldDomain(record[name]) === 'signed') return 'signed';
  }
  return 'unit';
}
