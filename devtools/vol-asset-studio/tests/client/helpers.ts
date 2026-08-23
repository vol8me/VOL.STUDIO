import type { AssetSummary } from '../../shared/index';
import tr from '../../src/i18n/tr.json';
import type { Translate } from '../../src/catalog/AssetLibrary';

export function asset(overrides: Partial<AssetSummary> = {}): AssetSummary {
  return {
    id: 'images:ship.png',
    path: 'assets/ship.png',
    rootId: 'images',
    name: 'ship.png',
    kind: 'image',
    format: 'png',
    role: 'shipped',
    bytes: 1024,
    modifiedAt: '2026-08-23T10:00:00.000Z',
    revision: 'rev-1',
    gitStatus: 'clean',
    image: { width: 32, height: 32, hasAlpha: true },
    problemCodes: [],
    ...overrides,
  };
}

export const translate: Translate = (key, options = {}) => {
  let current: unknown = tr;
  for (const segment of key.split('.')) {
    current =
      typeof current === 'object' && current !== null
        ? (current as Record<string, unknown>)[segment]
        : undefined;
  }
  const template = typeof current === 'string' ? current : key;
  return template.replace(/{{(\w+)}}/g, (_match, name: string) => {
    const value = options[name];
    return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  });
};
