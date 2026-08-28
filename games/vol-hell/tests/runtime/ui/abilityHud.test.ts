import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { i18n, i18next } from '@volstudio/core';
import { AbilityHud } from '@/runtime/ui/AbilityHud';
import type { AbilityRuntime } from '@/runtime/ability/AbilityRuntime';
import trResources from '@/i18n/tr.json';
import enResources from '@/i18n/en.json';

function fakeRuntime(primaryId: string | null, secondaryId: string | null): AbilityRuntime {
  const abilities = {
    primary: primaryId === null ? null : { id: primaryId, getReadyRatio: (): number => 0.42 },
    secondary: secondaryId === null ? null : { id: secondaryId, getReadyRatio: (): number => 1 },
  };
  return {
    getAbility: (slot: 'primary' | 'secondary') => abilities[slot],
  } as unknown as AbilityRuntime;
}

let parent: HTMLElement;
let hud: AbilityHud | null = null;

beforeEach(async () => {
  i18n.addResources('tr', 'volhell', trResources);
  i18n.addResources('en', 'volhell', enResources);
  if (!i18next.isInitialized) await i18n.init();
  if (i18next.language !== 'tr') await i18next.changeLanguage('tr');
  parent = document.createElement('div');
  document.body.appendChild(parent);
});

afterEach(() => {
  hud?.destroy();
  hud = null;
  parent.remove();
});

describe('AbilityHud', () => {
  it('masaüstü Q/E gerçeğini korur, mobil yüzey için mekanik ikonları hazırlar', () => {
    hud = new AbilityHud(parent);
    hud.refresh(fakeRuntime('turretSiege', 'chainStorm'));

    const keys = [...parent.querySelectorAll<HTMLElement>('.vol-ability-slot__key')];
    expect(keys.map((key) => key.textContent)).toEqual(['Q', 'E']);

    const icons = [...parent.querySelectorAll<SVGSVGElement>('.vol-ability-slot__icon svg')];
    expect(icons.map((icon) => icon.dataset.abilityKind)).toEqual(['turret', 'chainLightning']);
  });

  it('yetenek adı dil değişiminde i18n kaynağından yenilenir', async () => {
    const runtime = fakeRuntime('fireZone', 'multiShot');
    hud = new AbilityHud(parent);
    hud.refresh(runtime);
    expect(parent.textContent).toContain(trResources.cards.cardFireZone.title);

    await i18next.changeLanguage('en');
    hud.refreshLabels();
    hud.refresh(runtime);
    expect(parent.textContent).toContain(enResources.cards.cardFireZone.title);

    await i18next.changeLanguage('tr');
  });
});
