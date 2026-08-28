import { i18next } from '@volstudio/core';
import { getAbilityDefinition, type AbilityKind } from '@/config/abilities';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

interface AbilityIconDefinition {
  readonly paths: readonly string[];
}

/**
 * Mekanik ikonları oyuna aittir; CORE ikon kaydı ürün terimi bilmemelidir.
 * Çizim sözleşmesi CORE `Icon` ile aynıdır: inert path attribute'ları,
 * `currentColor`, `innerHTML` yok.
 */
const ABILITY_ICONS: Readonly<Record<AbilityKind | 'empty', AbilityIconDefinition>> = {
  empty: { paths: ['M12 5v14', 'M5 12h14'] },
  turret: {
    paths: ['M6 21h12', 'M8 21V11h8v10', 'M10 11V7h5', 'M15 7h5', 'M12 15h.01'],
  },
  chainLightning: { paths: ['m13 2-8 12h6l-1 8 9-13h-6Z'] },
  fireZone: {
    paths: [
      'M12 22c-4 0-7-2.7-7-6.5 0-3 1.8-5.3 4.3-7.8.2 2 1.1 3.1 2 3.7C11 7.7 13.2 4.9 16 3c.2 3.7 3 5.8 3 9.5 0 5.2-2.8 9.5-7 9.5Z',
      'M12 21c-1.7 0-3-1.2-3-2.8 0-1.3.8-2.5 2.2-3.8.1 1 .5 1.7 1.1 2.1.2-1.6 1.1-3 2.4-4.1.1 1.6 1.4 2.7 1.4 4.5 0 2.3-1.5 4.1-4 4.1Z',
    ],
  },
  multiShot: {
    paths: ['M5 19 18 6', 'm13 6-5 1', 'm5-1-1 5', 'M9 21 20 10', 'M3 15 14 4'],
  },
};

/** Ability kimliğinin o anki dilde görünen adını döndürür. */
export function getAbilityDisplayName(id: string): string {
  const definition = getAbilityDefinition(id);
  return i18next.t(definition.displayNameKey);
}

/** Ability mekaniğini 24×24, dekoratif bir SVG ikonuna dönüştürür. */
export function createAbilityIcon(
  kind: AbilityKind | null,
  className = 'vol-ability-icon',
): SVGSVGElement {
  const iconKind = kind ?? 'empty';
  const svg = document.createElementNS(SVG_NAMESPACE, 'svg');
  svg.classList.add(className);
  svg.dataset.abilityKind = iconKind;
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');

  for (const pathData of ABILITY_ICONS[iconKind].paths) {
    const path = document.createElementNS(SVG_NAMESPACE, 'path');
    path.setAttribute('d', pathData);
    svg.appendChild(path);
  }
  return svg;
}
