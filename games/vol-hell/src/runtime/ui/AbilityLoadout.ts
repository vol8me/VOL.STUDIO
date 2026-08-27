import { DisposableScope, CARD_DRAG_MIME, i18next } from '@volstudio/core';
import { getAbilityDefinition } from '@/config/abilities';
import type { OwnedCard } from '@/runtime/systems/CardInventoryManager';
import { ABILITY_SLOTS, type AbilitySlot } from '@/runtime/ability/types';
import { SLOT_KEY_LABELS } from './AbilityHud';

export interface AbilityLoadoutCallbacks {
  /** Kart bir slota bırakıldığında/atandığında. */
  onAssign: (instanceId: string, slot: AbilitySlot) => void;
  /** Slot boşaltıldığında. */
  onClear: (slot: AbilitySlot) => void;
}

export interface AbilityLoadoutState {
  /** Slotlarda duran kart örnekleri. */
  equipped: Partial<Record<AbilitySlot, OwnedCard | null>>;
}

interface SlotView {
  root: HTMLDivElement;
  name: HTMLSpanElement;
  clear: HTMLButtonElement;
}

/**
 * Yetenek slotları paneli — dükkanın içinde, yetenek kartlarının hemen üstünde.
 *
 * Kartlar buraya SÜRÜKLENEREK bırakılır; sürüklemeyi kullanamayan oyuncu için
 * kartın kendi "TAK" butonu aynı işi yapar. Slotu boşaltmak ayrı bir "×"
 * butonundadır — slota değerek yeteneği yanlışlıkla sökmek mümkün değil.
 */
export class AbilityLoadout {
  readonly element: HTMLDivElement;
  private readonly slots = new Map<AbilitySlot, SlotView>();
  /** Slot listener'ları — bkz. DisposableScope (hata izolasyonu + ters sıra). */
  private readonly scope = new DisposableScope();

  constructor(
    parent: HTMLElement,
    private readonly callbacks: AbilityLoadoutCallbacks,
  ) {
    this.element = document.createElement('div');
    this.element.className = 'vol-loadout';

    const title = document.createElement('div');
    title.className = 'vol-loadout__title';
    title.textContent = i18next.t('volhell:ability.loadoutTitle');
    this.element.appendChild(title);

    const hint = document.createElement('div');
    hint.className = 'vol-loadout__hint';
    hint.textContent = i18next.t('volhell:ability.loadoutHint');
    this.element.appendChild(hint);

    const row = document.createElement('div');
    row.className = 'vol-loadout__slots';
    for (const slot of ABILITY_SLOTS) {
      row.appendChild(this.buildSlot(slot));
    }
    this.element.appendChild(row);

    parent.appendChild(this.element);
  }

  /** Panelin durumunu çizer. */
  render(state: AbilityLoadoutState): void {
    for (const slot of ABILITY_SLOTS) {
      const view = this.slots.get(slot);
      if (!view) continue;

      const owned = state.equipped[slot] ?? null;
      const abilityId = owned?.definition.abilityId;
      const name = abilityId
        ? getAbilityDefinition(abilityId).displayName
        : i18next.t('volhell:ability.empty');

      view.name.textContent = `${SLOT_KEY_LABELS[slot]} · ${name}`;
      view.root.classList.toggle('vol-loadout__slot--filled', owned !== null);
      view.clear.hidden = owned === null;
    }
  }

  destroy(): void {
    this.scope.dispose();
    this.element.remove();
  }

  private buildSlot(slot: AbilitySlot): HTMLDivElement {
    const root = document.createElement('div');
    root.className = 'vol-loadout__slot';

    const name = document.createElement('span');
    name.className = 'vol-loadout__slot-name';
    root.appendChild(name);

    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'vol-loadout__slot-clear';
    clear.textContent = '×';
    clear.title = i18next.t('volhell:ability.clearSlot');
    clear.hidden = true;
    root.appendChild(clear);

    const onDragOver = (event: DragEvent): void => {
      // Varsayılan davranış engellenmezse tarayıcı bırakmayı kabul etmez.
      event.preventDefault();
      root.classList.add('vol-loadout__slot--hover');
    };
    const onDragLeave = (): void => root.classList.remove('vol-loadout__slot--hover');
    const onDrop = (event: DragEvent): void => {
      event.preventDefault();
      root.classList.remove('vol-loadout__slot--hover');
      const instanceId =
        event.dataTransfer?.getData(CARD_DRAG_MIME) || event.dataTransfer?.getData('text/plain');
      if (instanceId) this.callbacks.onAssign(instanceId, slot);
    };
    const onClear = (event: MouseEvent): void => {
      event.stopPropagation();
      this.callbacks.onClear(slot);
    };

    this.scope.addListener(root, 'dragover', onDragOver);
    this.scope.addListener(root, 'dragleave', onDragLeave);
    this.scope.addListener(root, 'drop', onDrop);
    this.scope.addListener(clear, 'click', onClear);

    this.slots.set(slot, { root, name, clear });
    return root;
  }
}
