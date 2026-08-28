import { i18next, TouchButton, vibrate, type VirtualActionSource } from '@volstudio/core';
import { DisposableScope } from '@volstudio/core/lifecycle';
import type { HellAction } from '@/config/input';
import { getAbilityDefinition } from '@/config/abilities';
import type { AbilityRuntime } from '@/runtime/ability/AbilityRuntime';
import { ABILITY_SLOTS, type AbilitySlot } from '@/runtime/ability/types';
import { createAbilityIcon, getAbilityDisplayName } from './abilityPresentation';

export interface TouchControlsOptions {
  /** `dash` basımının yazılacağı kaynak; stick durumuyla aynı karede birleşir. */
  actionSource: VirtualActionSource<HellAction>;
  /** Yetenek gerçekten tetiklendiyse `true` — dokunsal geri bildirim buna bakar. */
  onAbility: (slot: AbilitySlot) => boolean;
  onPause: () => void;
  /** Duraklatma/kart ekranı açıkken yetenek basımları yutulur. */
  isAbilityBlocked: () => boolean;
  /** Koşu sonu kaydı beklenirken duraklatma oyunu yeniden başlatmamalı. */
  isPauseBlocked: () => boolean;
}

interface AbilityButtonView {
  button: TouchButton;
  /** Cooldown halkasını besleyen katman; yalnız oran değişince yazılır. */
  fill: HTMLDivElement;
  lastReady: number;
  lastEquipped: boolean;
  abilityId: string | null | undefined;
}

/**
 * Ölçüler nişan alanını KORUMAK için sıkı tutulur.
 *
 * Sağ yarı aynı zamanda nişan çubuğunun alanıdır: parmak boş tuvale basıp
 * sürükleyerek nişan alır ve ateş eder. İlk denemede dash 92 px'ti ve
 * yetenekler onun soluna diziliyordu; küme, sağ başparmağın doğal yayını
 * kaplayıp nişan almayı fiilen engelliyordu (cihazda görüldü). Düğmeler
 * küçültülüp köşeye toplandı; dash yine en büyüğü çünkü en acil basım.
 *
 * Hepsi 44 px'lik dokunma hedefi tabanının üzerinde kalır.
 */
const DASH_SIZE = 68;
const ABILITY_SIZE = 50;
const PAUSE_SIZE = 44;

/**
 * Dokunmatik cihazlarda oynanışın klavyeye bağlı kalan kısmını ekrana taşır.
 *
 * Çift joystick (hareket + nişan/ateş) CORE'un `TouchController`'ında zaten
 * vardı; ancak `dash` (Space), yetenekler (Q/E) ve duraklatma (ESC) yalnızca
 * klavyeden tetiklenebiliyordu — yani dokunmatik bir cihazda oyun EKSİK
 * oynanıyordu. Bu yüzey o üç girdiyi kapatır.
 *
 * **İki farklı tetikleme yolu bilinçlidir.** `dash` bir kare durumu olarak
 * okunur (`InputState.actions.dash`), bu yüzden basılı-tutma semantiği taşıyan
 * `VirtualActionSource`e yazılır ve tuşu basılı tutmakla birebir aynı davranır.
 * Yetenekler ve duraklatma ise klavyede de KENAR tetiklidir (`key.on('down')`),
 * bu yüzden doğrudan geri çağrıyla iletilir — araya bir kare durumu koymak
 * tek dokunuşu birden çok aktivasyona çevirirdi.
 *
 * Yerleşim sağ alt köşede toplanır: sağ başparmak nişan çubuğunu kullanırken
 * aynı yayda düğmelere de ulaşabilmelidir. Düğmeler DOM elemanı olduğu için
 * dokunuşu Phaser'dan önce yakalar; üzerlerine basmak yanlışlıkla ikinci bir
 * nişan çubuğu doğurmaz.
 */
export class TouchControls {
  private readonly scope = new DisposableScope();
  private readonly root: HTMLDivElement;
  private readonly pauseRoot: HTMLDivElement;
  private readonly dashButton: TouchButton;
  private readonly pauseButton: TouchButton;
  private readonly abilityViews = new Map<AbilitySlot, AbilityButtonView>();

  constructor(
    private readonly parent: HTMLElement,
    options: TouchControlsOptions,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'vol-touch-controls';

    const abilityGroup = document.createElement('div');
    abilityGroup.className = 'vol-touch-controls__abilities';

    for (const slot of ABILITY_SLOTS) {
      const wrapper = document.createElement('div');
      wrapper.className = 'vol-touch-ability';

      const button = new TouchButton({
        size: ABILITY_SIZE,
        label: i18next.t('volhell:touch.emptyAbility'),
        icon: createAbilityIcon(null),
        onPress: () => {
          if (options.isAbilityBlocked()) return;
          // Titreşim yalnızca GERÇEKTEN tetiklenen basımda: boş/cooldown'daki
          // slotta da titremek "oldu" yanılgısı yaratır.
          if (options.onAbility(slot)) vibrate('select');
        },
      });
      button.element.classList.add('vol-touch-ability__button');

      // Cooldown göstergesi düğmenin ARKASINA konur: düğmenin kendi
      // pointer olaylarını kesmemeli, yoksa dolum yüzdesine göre basım
      // bazen düğmeye bazen göstergeye gider.
      const fill = document.createElement('div');
      fill.className = 'vol-touch-ability__fill';

      wrapper.append(fill, button.element);
      abilityGroup.appendChild(wrapper);
      this.scope.addDestroyables(button);
      this.abilityViews.set(slot, {
        button,
        fill,
        lastReady: -1,
        lastEquipped: true,
        abilityId: undefined,
      });
    }

    this.dashButton = new TouchButton({
      size: DASH_SIZE,
      label: i18next.t('volhell:touch.dash'),
      icon: i18next.t('volhell:touch.dashIcon'),
      // Basılı tutmak, Space'i basılı tutmakla aynı: şarj dolduğunda tekrar
      // atılır. `tryDash` kendi içinde şarj/aktiflik kontrolü yapar.
      onPress: () => {
        options.actionSource.press('dash');
        vibrate('tap');
      },
      onRelease: () => options.actionSource.release('dash'),
    });
    this.dashButton.element.classList.add('vol-touch-controls__dash');
    this.scope.addDestroyables(this.dashButton);

    this.root.append(abilityGroup, this.dashButton.element);

    this.pauseRoot = document.createElement('div');
    this.pauseRoot.className = 'vol-touch-pause';
    this.pauseButton = new TouchButton({
      shape: 'square',
      size: PAUSE_SIZE,
      label: i18next.t('volhell:pause.button'),
      icon: '❚❚',
      // Duraklatma KENAR tetiklidir: `onPress` tek dokunuşta bir kez çalışır.
      onPress: () => {
        if (options.isPauseBlocked()) return;
        vibrate('tap');
        options.onPause();
      },
    });
    this.pauseRoot.appendChild(this.pauseButton.element);
    this.scope.addDestroyables(this.pauseButton);

    parent.append(this.root, this.pauseRoot);
    // Stat bloğu da sağ üstte duruyor; duraklatma düğmesiyle çakışmaması için
    // yalnız dokunmatik kipte kenara çekilir.
    parent.classList.add('vol-touch-active');
  }

  /** Yetenek düğmelerinin dolum/etkinlik durumunu tazeler — her frame çağrılır. */
  refresh(abilities: AbilityRuntime): void {
    for (const slot of ABILITY_SLOTS) {
      const view = this.abilityViews.get(slot);
      if (!view) continue;

      const ability = abilities.getAbility(slot);
      const abilityId = ability?.id ?? null;
      if (abilityId !== view.abilityId) {
        view.abilityId = abilityId;
        const kind = ability ? getAbilityDefinition(ability.id).kind : null;
        view.button.setIcon(createAbilityIcon(kind));
        this.refreshAbilityLabel(view);
      }

      const equipped = ability !== null;
      if (equipped !== view.lastEquipped) {
        view.lastEquipped = equipped;
        // Boş slot basılamaz olmalı: dokunulduğunda sessizce hiçbir şey
        // yapan bir düğme, oyuncuya yeteneğin cooldown'da olduğunu düşündürür.
        view.button.element.disabled = !equipped;
        view.button.element.classList.toggle('vol-touch-ability__button--empty', !equipped);
      }

      const ready = ability ? ability.getReadyRatio() : 0;
      const rounded = Math.round(ready * 100);
      if (rounded !== view.lastReady) {
        view.lastReady = rounded;
        view.fill.style.height = `${rounded}%`;
        view.button.element.classList.toggle('vol-touch-ability__button--ready', ready >= 1);
      }
    }
  }

  /** Dil değiştiğinde erişilebilirlik etiketlerini yeniden yazar. */
  refreshLabels(): void {
    this.dashButton.element.setAttribute('aria-label', i18next.t('volhell:touch.dash'));
    this.pauseButton.element.setAttribute('aria-label', i18next.t('volhell:pause.button'));
    for (const view of this.abilityViews.values()) this.refreshAbilityLabel(view);
  }

  destroy(): void {
    this.scope.dispose();
    this.root.remove();
    this.pauseRoot.remove();
    this.parent.classList.remove('vol-touch-active');
    this.abilityViews.clear();
  }

  private refreshAbilityLabel(view: AbilityButtonView): void {
    if (!view.abilityId) {
      view.button.element.setAttribute('aria-label', i18next.t('volhell:touch.emptyAbility'));
      view.button.element.removeAttribute('title');
      return;
    }

    const name = getAbilityDisplayName(view.abilityId);
    view.button.element.setAttribute('aria-label', i18next.t('volhell:touch.ability', { name }));
    view.button.element.title = name;
  }
}
