import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { i18n, i18next, VirtualActionSource } from '@volstudio/core';
import { TouchControls, type TouchControlsOptions } from '@/runtime/ui/TouchControls';
import type { HellAction } from '@/config/input';
import type { AbilityRuntime } from '@/runtime/ability/AbilityRuntime';
import trResources from '@/i18n/tr.json';
import enResources from '@/i18n/en.json';

/**
 * Dokunmatik kontroller — dash, yetenekler ve duraklatma.
 *
 * `GameScene` Phaser'a gömülü olduğu için sürülemez ama bu yüzey öyle değil:
 * yalnızca bir `HTMLElement`, bir `VirtualActionSource` ve birkaç geri çağrı
 * istiyor. Testlerin asıl konusu, iki farklı tetikleme yolunun (kare durumu
 * olarak `dash`, kenar tetikli yetenek/duraklatma) doğru ayrılması.
 */

interface FakeAbility {
  id: string;
  readyRatio: number;
  getReadyRatio(): number;
}

function fakeAbility(id: string, readyRatio: number): FakeAbility {
  return { id, readyRatio, getReadyRatio: () => readyRatio };
}

/** `AbilityRuntime`ın TouchControls tarafından okunan tek metodu. */
function fakeRuntime(slots: Partial<Record<string, FakeAbility | null>>): AbilityRuntime {
  return {
    getAbility: (slot: string) => slots[slot] ?? null,
  } as unknown as AbilityRuntime;
}

function pressPointer(element: HTMLElement): void {
  element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 }));
}

function releasePointer(element: HTMLElement): void {
  element.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }));
}

function dashButton(root: HTMLElement): HTMLButtonElement {
  const button = root.querySelector<HTMLButtonElement>('.vol-touch-controls__dash');
  if (!button) throw new Error('dash düğmesi kurulmadı');
  return button;
}

function abilityButtons(root: HTMLElement): HTMLButtonElement[] {
  return [...root.querySelectorAll<HTMLButtonElement>('.vol-touch-ability__button')];
}

let parent: HTMLElement;
let source: VirtualActionSource<HellAction>;
let controls: TouchControls | null = null;

beforeEach(async () => {
  i18n.addResources('tr', 'volhell', trResources);
  i18n.addResources('en', 'volhell', enResources);
  if (!i18next.isInitialized) await i18n.init();
  if (i18next.language !== 'tr') await i18next.changeLanguage('tr');
  parent = document.createElement('div');
  document.body.appendChild(parent);
  source = new VirtualActionSource<HellAction>();
});

afterEach(() => {
  controls?.destroy();
  controls = null;
  parent.remove();
});

function mount(overrides: Partial<TouchControlsOptions> = {}): TouchControls {
  controls = new TouchControls(parent, {
    actionSource: source,
    onAbility: vi.fn(),
    onPause: vi.fn(),
    isAbilityBlocked: () => false,
    isPauseBlocked: () => false,
    ...overrides,
  });
  return controls;
}

describe('TouchControls', () => {
  it('dash düğmesi basılı tutuldukça eylem üretir, bırakınca durur', () => {
    // Space tuşunu basılı tutmakla birebir aynı davranmalı: `tryDash` şarj
    // kontrolünü kendi yapar, düğme yalnızca "basılı" der.
    mount();
    const button = dashButton(parent);
    const actions = (): Record<HellAction, boolean> => {
      const record: Record<HellAction, boolean> = { fire: false, dash: false };
      source.applyTo(record);
      return record;
    };

    pressPointer(button);
    expect(actions().dash).toBe(true);
    expect(actions().dash).toBe(true);

    releasePointer(button);
    expect(actions().dash).toBe(false);
  });

  it('yetenek düğmesi KENAR tetikler — tek dokunuş tek aktivasyon', () => {
    // Yetenekler klavyede de `key.on('down')` ile kenar tetikli; düğmeyi kare
    // durumuna bağlamak tek dokunuşu onlarca aktivasyona çevirirdi.
    const onAbility = vi.fn();
    mount({ onAbility });
    const [primary] = abilityButtons(parent);

    pressPointer(primary);
    releasePointer(primary);

    expect(onAbility).toHaveBeenCalledTimes(1);
    expect(onAbility).toHaveBeenCalledWith('primary');
  });

  it('engel varken yetenek basımı yutulur', () => {
    const onAbility = vi.fn();
    mount({ onAbility, isAbilityBlocked: () => true });

    pressPointer(abilityButtons(parent)[0]);
    expect(onAbility).not.toHaveBeenCalled();
  });

  it('duraklatma düğmesi tek dokunuşta bir kez çağırır', () => {
    const onPause = vi.fn();
    mount({ onPause });
    const pause = parent.querySelector<HTMLButtonElement>('.vol-touch-pause button');
    if (!pause) throw new Error('duraklatma düğmesi kurulmadı');

    pressPointer(pause);
    releasePointer(pause);

    expect(onPause).toHaveBeenCalledTimes(1);
  });

  it('koşu sonu kilidinde duraklatma düğmesini yutar', () => {
    const onPause = vi.fn();
    mount({ onPause, isPauseBlocked: () => true });
    const pause = parent.querySelector<HTMLButtonElement>('.vol-touch-pause button');
    if (!pause) throw new Error('duraklatma düğmesi kurulmadı');

    pressPointer(pause);

    expect(onPause).not.toHaveBeenCalled();
  });

  it('boş slotun düğmesi devre dışıdır', () => {
    // Sessizce hiçbir şey yapan bir düğme, oyuncuya "cooldown'da" izlenimi verir.
    mount();
    controls!.refresh(fakeRuntime({ primary: null, secondary: fakeAbility('turret', 1) }));

    const [primary, secondary] = abilityButtons(parent);
    expect(primary.disabled).toBe(true);
    expect(primary.classList.contains('vol-touch-ability__button--empty')).toBe(true);
    expect(secondary.disabled).toBe(false);
  });

  it('cooldown oranı dolum yüksekliğine yansır ve hazır olunca işaretlenir', () => {
    mount();
    controls!.refresh(
      fakeRuntime({
        primary: fakeAbility('chainLightning', 0.42),
        secondary: fakeAbility('fireZone', 1),
      }),
    );

    const fills = [...parent.querySelectorAll<HTMLElement>('.vol-touch-ability__fill')];
    expect(fills[0].style.height).toBe('42%');
    expect(fills[1].style.height).toBe('100%');

    const [primary, secondary] = abilityButtons(parent);
    expect(primary.classList.contains('vol-touch-ability__button--ready')).toBe(false);
    expect(secondary.classList.contains('vol-touch-ability__button--ready')).toBe(true);
  });

  it('kurulduğunda ebeveyni dokunmatik kipe alır, yıkılınca geri alır', () => {
    // Skor bloğu ve duraklatma düğmesi ikisi de sağ üstte; çakışmayı önleyen
    // CSS bu sınıfa bağlı.
    mount();
    expect(parent.classList.contains('vol-touch-active')).toBe(true);

    controls!.destroy();
    controls = null;
    expect(parent.classList.contains('vol-touch-active')).toBe(false);
    expect(parent.querySelector('.vol-touch-controls')).toBeNull();
    expect(parent.querySelector('.vol-touch-pause')).toBeNull();
  });

  it('dil değişince erişilebilirlik etiketleri yenilenir', async () => {
    mount();
    expect(dashButton(parent).getAttribute('aria-label')).toBe(trResources.touch.dash);
    controls!.refresh(fakeRuntime({ primary: fakeAbility('turret', 1) }));
    expect(abilityButtons(parent)[0].getAttribute('aria-label')).toBe(
      trResources.touch.ability.replace('{{name}}', trResources.cards.cardTurret.title),
    );

    await i18next.changeLanguage('en');
    controls!.refreshLabels();
    expect(abilityButtons(parent)[0].getAttribute('aria-label')).toBe(
      enResources.touch.ability.replace('{{name}}', enResources.cards.cardTurret.title),
    );

    await i18next.changeLanguage('tr');
  });

  it('slot harfi yerine takılı yeteneğin mekanik ikonunu gösterir', () => {
    mount();
    controls!.refresh(
      fakeRuntime({
        primary: fakeAbility('turretRapid', 1),
        secondary: fakeAbility('inferno', 1),
      }),
    );

    let icons = [...parent.querySelectorAll<SVGSVGElement>('.vol-touch-ability svg')];
    expect(icons.map((icon) => icon.dataset.abilityKind)).toEqual(['turret', 'fireZone']);
    expect(abilityButtons(parent).map((button) => button.textContent)).not.toContain('Q');

    controls!.refresh(
      fakeRuntime({
        primary: fakeAbility('chainStorm', 1),
        secondary: fakeAbility('bulletStorm', 1),
      }),
    );
    icons = [...parent.querySelectorAll<SVGSVGElement>('.vol-touch-ability svg')];
    expect(icons.map((icon) => icon.dataset.abilityKind)).toEqual(['chainLightning', 'multiShot']);
  });

  it('yıkım sonrası düğme basımı eylem kaynağına yazmaz', () => {
    mount();
    const button = dashButton(parent);
    controls!.destroy();
    controls = null;

    pressPointer(button);
    expect(source.hasPressed).toBe(false);
  });
});
