import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssetStudioClient } from '../../src/api/AssetStudioClient';
import { QuickLook } from '../../src/preview/QuickLook';
import { asset, translate } from './helpers';

function createClient(): AssetStudioClient {
  return {
    thumbnailUrl: vi.fn(() => '/thumb.png'),
    contentUrl: vi.fn(() => '/content'),
    getAudioMetadata: vi.fn().mockResolvedValue({
      codec: 'vorbis',
      durationSeconds: 62.4,
      sampleRate: 48_000,
      channels: 2,
    }),
  } as unknown as AssetStudioClient;
}

describe('QuickLook', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  });

  it('görseli ve repo metadata bilgisini gösterir', () => {
    const quickLook = new QuickLook({
      client: createClient(),
      t: translate,
      locale: () => 'tr',
      onClose: vi.fn(),
      onToast: vi.fn(),
    });
    document.body.append(quickLook.element);
    quickLook.setAsset(asset());

    expect(quickLook.element.classList.contains('quick-look--open')).toBe(true);
    expect(quickLook.element.querySelector('img')?.getAttribute('src')).toBe('/thumb.png');
    expect(quickLook.element.querySelector('.quick-look__title')?.textContent).toBe('ship.png');
    expect(quickLook.element.querySelector('.quick-look__metadata')?.textContent).toContain(
      '32 × 32',
    );
  });

  it('ses oynatıcıyı kurar ve metadata yanıtını ayrıntılara ekler', async () => {
    const client = createClient();
    const quickLook = new QuickLook({
      client,
      t: translate,
      locale: () => 'tr',
      onClose: vi.fn(),
      onToast: vi.fn(),
    });
    document.body.append(quickLook.element);
    quickLook.setAsset(
      asset({
        id: 'audio:click',
        kind: 'audio',
        format: 'ogg',
        image: undefined,
        name: 'click.ogg',
      }),
    );
    await Promise.resolve();
    await Promise.resolve();

    expect(quickLook.element.querySelector('audio')?.getAttribute('src')).toBe('/content');
    expect(client.getAudioMetadata).toHaveBeenCalledWith('audio:click', expect.any(AbortSignal));
    expect(quickLook.element.querySelector('.quick-look__metadata')?.textContent).toContain('1:02');
    expect(quickLook.element.querySelector('.quick-look__metadata')?.textContent).toContain(
      '48000 Hz',
    );
  });

  it('kapatma niyetini bildirir ve yolu kopyaladıktan sonra gerçek başarı mesajı verir', async () => {
    const onClose = vi.fn();
    const onToast = vi.fn();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const quickLook = new QuickLook({
      client: createClient(),
      t: translate,
      locale: () => 'tr',
      onClose,
      onToast,
    });
    document.body.append(quickLook.element);
    quickLook.setAsset(asset());

    quickLook.element.querySelector<HTMLButtonElement>('.quick-look__close')!.click();
    quickLook.element.querySelector<HTMLButtonElement>('.quick-look__copy')!.click();
    await Promise.resolve();

    expect(onClose).toHaveBeenCalledOnce();
    expect(writeText).toHaveBeenCalledWith('assets/ship.png');
    expect(onToast).toHaveBeenCalledWith('Varlık yolu kopyalandı');
  });
});
