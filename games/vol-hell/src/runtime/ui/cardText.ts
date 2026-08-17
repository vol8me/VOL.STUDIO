import { i18n, i18next, type CardTileData } from '@volstudio/core';
import type { CardDefinition } from '@/config/cards/types';

/**
 * Kart tanımını UI'ın anlayacağı metne çevirir.
 *
 * Katalog yalnızca i18n ANAHTARI taşır; çeviri burada, tek yerde çözülür.
 * Böylece `core/src/ui` tarafındaki kart component'leri oyunun çeviri
 * dosyalarından habersiz kalır. Anahtarlar çalışma zamanında üretildiği için
 * (`cards.<id>.title`) strict key kontrolünü atlayan `tDynamic` kullanılır —
 * eksik anahtar runtime'da yakalanır.
 */
export function toCardTileData(
  card: CardDefinition,
  options: { showPrice?: boolean; showType?: boolean; statusLabel?: string } = {},
): CardTileData {
  return {
    id: card.id,
    title: i18n.tDynamic(`volhell:${card.titleKey}`),
    description: i18n.tDynamic(`volhell:${card.descriptionKey}`),
    rarity: card.rarity,
    rarityLabel: i18n.tDynamic(`volhell:cards.rarity.${card.rarity}`),
    // Tip rozeti "bu kart pasif mi, slot mu istiyor" sorusunu kart üstünde yanıtlar.
    typeLabel: options.showType ? i18n.tDynamic(`volhell:cards.type.${card.type}`) : undefined,
    priceLabel: options.showPrice
      ? i18next.t('volhell:cards.ui.price', { price: card.price })
      : undefined,
    // statusLabel yalnızca açıkça verilirse ekle; aksi halde `update()`
    // eski durum metnini yanlışlıkla silmez.
    ...(options.statusLabel !== undefined ? { statusLabel: options.statusLabel } : {}),
  };
}
