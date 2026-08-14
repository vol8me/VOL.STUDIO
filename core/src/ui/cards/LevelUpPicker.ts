import { CardPicker, type CardPickerOptions } from './CardPicker';
import type { CardTileData } from './CardTile';

export interface LevelUpPickerOptions extends CardPickerOptions {
  /** Seçim butonunun metni (örn. "SEÇ"). */
  selectLabel: string;
  /** Kart seçilince çağrılır; panel otomatik kapanır. */
  onSelect: (cardId: string) => void;
}

/**
 * Seviye atlama kart seçimi — teklif edilen kartlardan BİRİ seçilir, seçim
 * ücretsizdir, seçilmeyenler kaybolur.
 *
 * Fiyat göstermez ve seçimden sonra kendini kapatır. Seçim açık bir butonla
 * yapılır: kart gövdesine yanlışlıkla tıklamak seçimi harcamaz.
 */
export class LevelUpPicker extends CardPicker {
  private readonly selectLabel: string;
  private readonly onSelect: (cardId: string) => void;

  constructor(options: LevelUpPickerOptions) {
    super({ className: 'vol-card-picker--levelup', ...options });
    this.selectLabel = options.selectLabel;
    this.onSelect = options.onSelect;
  }

  /** Teklifi çizer ve paneli açar. */
  present(cards: readonly CardTileData[], context: { title?: string; hint?: string } = {}): void {
    if (context.title !== undefined) this.setTitle(context.title);
    if (context.hint !== undefined) this.setHint(context.hint);

    this.clearTiles();
    for (const card of cards) {
      this.addTile(card, {
        actionLabel: this.selectLabel,
        onAction: (id) => this.handleSelect(id),
      });
    }

    this.show();
  }

  private handleSelect(cardId: string): void {
    this.hide();
    this.onSelect(cardId);
  }
}
