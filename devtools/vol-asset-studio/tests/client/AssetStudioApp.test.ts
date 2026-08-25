import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssetEvent, CatalogResponse, ProjectResponse } from '../../shared/index';
import { AssetStudioApiError, type AssetStudioClient } from '../../src/api/AssetStudioClient';
import { AssetStudioApp } from '../../src/app/AssetStudioApp';
import { asset, translate } from './helpers';

class FakeClient {
  project: ProjectResponse = {
    schemaVersion: 1,
    name: 'VOL.TEST',
    roots: [{ id: 'images', path: 'assets', role: 'shipped', kinds: ['image'], available: true }],
    access: { network: 'loopback', requiresToken: false },
  };
  catalog: CatalogResponse = { revision: 1, assets: [asset()] };
  onEvent: ((event: AssetEvent) => void) | null = null;
  onConnection: ((state: 'live' | 'offline' | 'reconnecting') => void) | null = null;
  close = vi.fn();
  getProject = vi.fn(() => Promise.resolve(this.project));
  getCatalog = vi.fn(() => Promise.resolve(this.catalog));
  thumbnailUrl = vi.fn(() => '/thumb.png');
  contentUrl = vi.fn(() => '/content');
  getAudioMetadata = vi.fn();
  getJsonContent = vi.fn().mockResolvedValue({
    schemaVersion: 1,
    size: [16, 16],
    seed: 1,
    palette: { colors: ['#000000', '#ffffff'], ramps: [{ id: 0, indices: [0, 1] }] },
    layers: [{ id: 'gövde', source: { kind: 'sdf.circle', r: 0.4 }, material: 0 }],
  });
  authenticate = vi.fn(() =>
    Promise.resolve({ authenticated: true as const, expiresAt: '2026-08-24T00:00:00Z' }),
  );
  acquireLease = vi.fn().mockResolvedValue(undefined);
  renewLease = vi.fn().mockResolvedValue(undefined);
  setLease = vi.fn();

  subscribe(
    onEvent: (event: AssetEvent) => void,
    onConnection: (state: 'live' | 'offline' | 'reconnecting') => void,
  ) {
    this.onEvent = onEvent;
    this.onConnection = onConnection;
    return { close: this.close };
  }
}

describe('AssetStudioApp', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    localStorage.clear();
  });

  it('proje ve kataloğu yükleyip seçimle Quick Look açar', async () => {
    const client = new FakeClient();
    const app = createApp(client);
    await app.start();

    expect(document.querySelector('.studio-brand__project')?.textContent).toBe('VOL.TEST');
    expect(document.querySelectorAll('.asset-card')).toHaveLength(1);
    expect(document.querySelector('.studio-state')?.hasAttribute('hidden')).toBe(true);

    document.querySelector<HTMLButtonElement>('.asset-card')!.click();
    expect(
      document.querySelector('.studio-shell')?.classList.contains('studio-shell--inspecting'),
    ).toBe(true);
    expect(document.querySelector('.quick-look__title')?.textContent).toBe('ship.png');
    app.destroy();
    expect(client.close).toHaveBeenCalledOnce();
  });

  it('SSE değişikliklerini artımlı uygular ve sıra boşluğunda tam katalog yeniler', async () => {
    const client = new FakeClient();
    const app = createApp(client);
    await app.start();

    client.onEvent?.({
      type: 'created',
      revision: 2,
      asset: asset({
        id: 'audio:new',
        path: 'audio/new.ogg',
        name: 'new.ogg',
        kind: 'audio',
        format: 'ogg',
        image: undefined,
      }),
    });
    await Promise.resolve();
    expect(document.querySelectorAll('.asset-card')).toHaveLength(2);

    client.catalog = { revision: 7, assets: [asset({ id: 'fresh', name: 'fresh.png' })] };
    client.onEvent?.({ type: 'resync', revision: 7 });
    await Promise.resolve();
    await Promise.resolve();
    expect(client.getCatalog).toHaveBeenCalledTimes(2);
    expect(document.querySelectorAll('.asset-card')).toHaveLength(1);
    expect(document.querySelector('.asset-card__name')?.textContent).toBe('fresh.png');
    app.destroy();
  });

  it('Ctrl+K aramayı odaklar, Escape önizlemeyi kapatır ve dil niyetini iletir', async () => {
    const client = new FakeClient();
    const onToggleLanguage = vi.fn().mockResolvedValue(undefined);
    const app = createApp(client, onToggleLanguage);
    await app.start();
    document.querySelector<HTMLButtonElement>('.asset-card')!.click();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
    expect(document.activeElement).toBe(document.querySelector('.asset-search__input'));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.querySelector('.quick-look')?.classList.contains('quick-look--open')).toBe(
      false,
    );

    document.querySelector<HTMLButtonElement>('.studio-language')!.click();
    expect(onToggleLanguage).toHaveBeenCalledOnce();
    app.destroy();
  });

  it('sprite Quick Look inspectorını açar, değişen kaynağı yeniler ve Escape ile kapatır', async () => {
    const client = new FakeClient();
    const sprite = asset({
      id: 'recipes:ship.volsprite.json',
      name: 'ship.volsprite.json',
      path: 'recipes/ship.volsprite.json',
      kind: 'sprite-document',
      format: 'volsprite.json',
      image: undefined,
    });
    client.catalog = { revision: 1, assets: [sprite] };
    const app = createApp(client);
    await app.start();

    document.querySelector<HTMLButtonElement>('.asset-card')!.click();
    document.querySelector<HTMLButtonElement>('.quick-look__inspect')!.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(document.querySelector('.visual-inspector--open')).not.toBeNull();

    client.onEvent?.({ type: 'changed', revision: 2, asset: { ...sprite, revision: 'rev-2' } });
    await Promise.resolve();
    await Promise.resolve();
    expect(client.getJsonContent).toHaveBeenCalledTimes(2);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.querySelector('.visual-inspector--open')).toBeNull();

    document.querySelector<HTMLButtonElement>('.quick-look__inspect')!.click();
    await Promise.resolve();
    await Promise.resolve();
    client.onEvent?.({ type: 'deleted', revision: 3, assetId: sprite.id });
    await Promise.resolve();
    await Promise.resolve();
    expect(document.querySelector('.visual-inspector--open')).toBeNull();
    app.destroy();
  });

  it('F11 tuşunu görünür tam ekran eylemiyle aynı davranışa bağlar', async () => {
    const requestFullscreen = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      configurable: true,
      value: requestFullscreen,
    });
    const app = createApp(new FakeClient());
    await app.start();

    const event = new KeyboardEvent('keydown', { key: 'F11', cancelable: true });
    window.dispatchEvent(event);
    await Promise.resolve();

    expect(event.defaultPrevented).toBe(true);
    expect(requestFullscreen).toHaveBeenCalledOnce();
    app.destroy();
  });

  it('dil değişiminde uygulama etiketlerini günceller', async () => {
    const client = new FakeClient();
    const app = createApp(client);
    await app.start();

    app.setTranslator((key) => `tr:${key}`);

    expect(document.querySelector('.asset-search__input')?.getAttribute('placeholder')).toBe(
      'tr:library.search',
    );
    expect(document.title).toBe('tr:app.title');
    app.destroy();
  });

  it('tam ekran reddedilirse toast ile bildirir', async () => {
    const requestFullscreen = vi.fn().mockRejectedValue(new Error('User denied'));
    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      configurable: true,
      value: requestFullscreen,
    });
    const app = createApp(new FakeClient());
    await app.start();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F11' }));
    await Promise.resolve();

    expect(document.querySelector('.studio-toast')?.textContent).toBe(
      'Tarayıcı tam ekran isteğini reddetti.',
    );
    app.destroy();
  });

  it('yükleme hatasını çalışan retry eylemiyle gösterir', async () => {
    const client = new FakeClient();
    client.getCatalog.mockRejectedValueOnce(new Error('network'));
    const app = createApp(client);
    await app.start();

    expect(document.querySelector('.studio-state')?.getAttribute('data-state')).toBe('error');
    expect(document.querySelector('.studio-state__error')?.textContent).toContain('Yeniden dene');
    document.querySelector<HTMLButtonElement>('.studio-state__retry')!.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(client.getCatalog).toHaveBeenCalledTimes(2);
    app.destroy();
  });

  it('LAN anahtarını doğrulamadan canlı akışı açmaz ve başarılı oturumdan sonra yükler', async () => {
    const client = new FakeClient();
    client.getCatalog.mockRejectedValueOnce(
      new AssetStudioApiError('authentication_required', 401),
    );
    const app = createApp(client);
    await app.start();

    expect(document.querySelector('.studio-state')?.getAttribute('data-state')).toBe(
      'authentication',
    );
    expect(client.onEvent).toBeNull();
    const input = document.querySelector<HTMLInputElement>('.studio-state__token')!;
    input.value = 'lan-secret';
    document
      .querySelector<HTMLFormElement>('.studio-state__authentication')!
      .dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(client.authenticate).toHaveBeenCalledWith('lan-secret');
    expect(client.getCatalog).toHaveBeenCalledTimes(2);
    expect(client.onEvent).not.toBeNull();
    expect(document.querySelector('.studio-state')?.hasAttribute('hidden')).toBe(true);
    app.destroy();
  });
});

function createApp(client: FakeClient, onToggleLanguage = vi.fn().mockResolvedValue(undefined)) {
  return new AssetStudioApp({
    root: document.querySelector<HTMLElement>('#app')!,
    client: client as unknown as AssetStudioClient,
    t: translate,
    locale: () => 'tr',
    onToggleLanguage,
  });
}
