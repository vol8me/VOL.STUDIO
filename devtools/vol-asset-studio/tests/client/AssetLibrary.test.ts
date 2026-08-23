import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssetStudioClient } from '../../src/api/AssetStudioClient';
import { AssetLibrary } from '../../src/catalog/AssetLibrary';
import { asset, translate } from './helpers';

const client = {
  thumbnailUrl: vi.fn(() => '/thumbnail.png'),
} as unknown as AssetStudioClient;

describe('AssetLibrary', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    localStorage.clear();
  });

  it('kataloğu anahtar bazlı render eder ve seçim niyetini bildirir', () => {
    const onSelect = vi.fn();
    const library = new AssetLibrary({ client, t: translate, onSelect, onRefresh: vi.fn() });
    document.body.append(library.rail, library.element);
    library.setAssets([
      asset(),
      asset({
        id: 'audio:click.ogg',
        name: 'click.ogg',
        path: 'audio/click.ogg',
        kind: 'audio',
        format: 'ogg',
        image: undefined,
      }),
    ]);

    const cards = document.querySelectorAll<HTMLButtonElement>('.asset-card');
    expect(cards).toHaveLength(2);
    cards[0].click();
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: cards[0].dataset.assetId }),
    );
    expect(cards[0].classList.contains('asset-card--selected')).toBe(true);

    const firstNode = document.querySelector('[data-asset-id="images:ship.png"]');
    library.setAssets([
      asset(),
      asset({
        id: 'audio:click.ogg',
        name: 'click.ogg',
        path: 'audio/click.ogg',
        kind: 'audio',
        format: 'ogg',
        image: undefined,
      }),
    ]);
    expect(document.querySelector('[data-asset-id="images:ship.png"]')).toBe(firstNode);
  });

  it('filtre, arama ve görünüm kontrollerini gerçekten uygular', () => {
    const library = new AssetLibrary({
      client,
      t: translate,
      onSelect: vi.fn(),
      onRefresh: vi.fn(),
    });
    document.body.append(library.rail, library.element);
    library.setAssets([
      asset({ name: 'gemi.png' }),
      asset({
        id: 'audio:worm.ogg',
        name: 'worm.ogg',
        path: 'sfx/worm.ogg',
        kind: 'audio',
        format: 'ogg',
        image: undefined,
      }),
      asset({
        id: 'font:jura.ttf',
        name: 'Jura.ttf',
        path: 'fonts/Jura.ttf',
        kind: 'font',
        format: 'ttf',
        image: undefined,
      }),
    ]);

    document.querySelector<HTMLButtonElement>('[data-filter="audio"]')!.click();
    expect(document.querySelectorAll('.asset-card')).toHaveLength(1);
    expect(document.querySelector('.asset-card__name')?.textContent).toBe('worm.ogg');

    document.querySelector<HTMLButtonElement>('[data-filter="all"]')!.click();
    const search = document.querySelector<HTMLInputElement>('.asset-search__input')!;
    search.value = 'jura';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    expect(document.querySelectorAll('.asset-card')).toHaveLength(1);
    expect(document.querySelector('.asset-card__name')?.textContent).toBe('Jura.ttf');

    document.querySelector<HTMLButtonElement>('[data-view="list"]')!.click();
    expect(document.querySelector('.asset-grid')?.getAttribute('data-view')).toBe('list');
    expect(localStorage.getItem('vol-asset-studio:view')).toBe('list');
  });

  it('sorunlu ve değiştirilmiş filtrelerini ayrı değerlendirir', () => {
    const library = new AssetLibrary({
      client,
      t: translate,
      onSelect: vi.fn(),
      onRefresh: vi.fn(),
    });
    document.body.append(library.rail, library.element);
    library.setAssets([
      asset({ id: 'clean', gitStatus: 'clean' }),
      asset({ id: 'problem', problemCodes: ['metadata_parse_failed'] }),
      asset({ id: 'new', gitStatus: 'untracked' }),
    ]);

    expect(document.querySelector('[data-filter="problems"] .asset-rail__badge')?.textContent).toBe(
      '1',
    );
    expect(document.querySelectorAll('.asset-rail__label')).toHaveLength(0);
    document.querySelector<HTMLButtonElement>('[data-filter="problems"]')!.click();
    expect(document.querySelectorAll('.asset-card')).toHaveLength(1);
    expect(document.querySelector('.asset-card')?.getAttribute('data-asset-id')).toBe('problem');

    document.querySelector<HTMLButtonElement>('[data-filter="modified"]')!.click();
    expect(document.querySelectorAll('.asset-card')).toHaveLength(1);
    expect(document.querySelector('.asset-card')?.getAttribute('data-asset-id')).toBe('new');
  });
});
