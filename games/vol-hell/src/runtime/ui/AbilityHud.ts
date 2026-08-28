import { i18next } from '@volstudio/core';
import { getAbilityDefinition } from '@/config/abilities';
import type { AbilityRuntime } from '@/runtime/ability/AbilityRuntime';
import { ABILITY_SLOTS, type AbilitySlot } from '@/runtime/ability/types';
import { createAbilityIcon, getAbilityDisplayName } from './abilityPresentation';

/** Slotların klavye karşılığı — HUD'da ve loadout panelinde aynı harfler görünür. */
export const SLOT_KEY_LABELS: Record<AbilitySlot, string> = {
  primary: 'Q',
  secondary: 'E',
};

interface SlotView {
  root: HTMLDivElement;
  name: HTMLSpanElement;
  icon: HTMLSpanElement;
  fill: HTMLDivElement;
  lastAbilityId: string | null | undefined;
  lastName: string;
  lastReady: number;
}

/**
 * Ability slot göstergesi — hangi tuşta hangi yetenek var ve hazır mı.
 *
 * Boş slot da çizilir: oyuncu Q/E'nin var olduğunu ama henüz bir şey
 * atanmadığını görür (boş slotta tuşa basmak sessizce hiçbir şey yapmaz).
 */
export class AbilityHud {
  private readonly container: HTMLDivElement;
  private readonly slots = new Map<AbilitySlot, SlotView>();

  constructor(parent: HTMLElement) {
    this.container = document.createElement('div');
    this.container.className = 'vol-ability-hud';

    for (const slot of ABILITY_SLOTS) {
      const root = document.createElement('div');
      root.className = `vol-ability-slot vol-ability-slot--${slot}`;

      const key = document.createElement('span');
      key.className = 'vol-ability-slot__key';
      key.textContent = SLOT_KEY_LABELS[slot];
      root.appendChild(key);

      const icon = document.createElement('span');
      icon.className = 'vol-ability-slot__icon';
      icon.appendChild(createAbilityIcon(null));
      root.appendChild(icon);

      const name = document.createElement('span');
      name.className = 'vol-ability-slot__name';
      name.textContent = i18next.t('volhell:ability.empty');
      root.appendChild(name);

      const gauge = document.createElement('div');
      gauge.className = 'vol-ability-slot__gauge';
      const fill = document.createElement('div');
      fill.className = 'vol-ability-slot__fill';
      gauge.appendChild(fill);
      root.appendChild(gauge);

      this.container.appendChild(root);
      this.slots.set(slot, {
        root,
        name,
        icon,
        fill,
        lastAbilityId: undefined,
        lastName: '',
        lastReady: -1,
      });
    }

    parent.appendChild(this.container);
  }

  /** Slot adlarını ve cooldown göstergelerini tazeler — değişmedikçe DOM'a dokunmaz. */
  refresh(abilities: AbilityRuntime): void {
    for (const slot of ABILITY_SLOTS) {
      const view = this.slots.get(slot);
      if (!view) continue;

      const ability = abilities.getAbility(slot);
      const abilityId = ability?.id ?? null;
      const definition = ability ? getAbilityDefinition(ability.id) : null;
      const name = ability ? getAbilityDisplayName(ability.id) : i18next.t('volhell:ability.empty');

      if (abilityId !== view.lastAbilityId) {
        view.lastAbilityId = abilityId;
        view.icon.replaceChildren(createAbilityIcon(definition?.kind ?? null));
      }

      if (name !== view.lastName) {
        view.lastName = name;
        view.name.textContent = name;
        view.root.classList.toggle('vol-ability-slot--empty', !ability);
      }

      const ready = ability ? ability.getReadyRatio() : 0;
      // Yüzde başına bir güncelleme yeter; her frame style yazmak gereksiz.
      const rounded = Math.round(ready * 100);
      if (rounded !== view.lastReady) {
        view.lastReady = rounded;
        view.fill.style.width = `${rounded}%`;
        view.root.classList.toggle('vol-ability-slot--ready', ability !== null && ready >= 1);
      }
    }
  }

  /** Dil değişiminde boş slot etiketini yeniden yazdırır. */
  refreshLabels(): void {
    for (const view of this.slots.values()) {
      view.lastName = '';
    }
  }

  destroy(): void {
    this.container.remove();
    this.slots.clear();
  }
}
