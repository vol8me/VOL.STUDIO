import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AssetStudioApiError, AssetStudioClient } from '../../src/api/AssetStudioClient';
import { PixelEditor } from '../../src/editor/PixelEditor';
import { EditorPanel } from '../../src/editor/EditorPanel';
import type { AssetSummary } from '../../shared/index';

const translate = (key: string, options?: Record<string, unknown>): string =>
  options === undefined ? key : `${key}:${Object.values(options).join(',')}`;

const IMAGE: AssetSummary = {
  id: 'asset-1',
  path: 'assets/car.png',
  rootId: 'assets',
  name: 'car.png',
  kind: 'image',
  format: 'png',
  role: 'source',
  bytes: 64,
  modifiedAt: new Date(0).toISOString(),
  revision: 'a'.repeat(64),
  problemCodes: [],
};

const panels: EditorPanel[] = [];

/**
 * 2×2 SAYDAM RGBA gövdesi taşıyan raster yanıtı.
 *
 * Saydam taban seçilir ki varsayılan beyaz kalem gerçek bir değişiklik olsun;
 * beyaz üstüne beyaz yazmak belgeyi kirletmez ve testi sessizce boşa çıkarır.
 */
function rasterResponse(revision = 'a'.repeat(64), stripped = ''): Response {
  const rgba = new Uint8ClampedArray(2 * 2 * 4);
  return new Response(rgba, {
    status: 200,
    headers: {
      'x-vol-raster-width': '2',
      'x-vol-raster-height': '2',
      'x-vol-asset-revision': revision,
      'x-vol-stripped-metadata': stripped,
    },
  });
}

function mount(overrides: Partial<Parameters<typeof createPanel>[0]> = {}) {
  return createPanel(overrides);
}

function createPanel(
  overrides: {
    onClose?: () => void;
    onToast?: (message: string) => void;
    onSaved?: (assetId: string, revision: string) => void;
  } = {},
) {
  const onClose = overrides.onClose ?? vi.fn();
  const onToast = overrides.onToast ?? vi.fn();
  const onSaved = overrides.onSaved ?? vi.fn();
  const client = new AssetStudioClient();
  client.setLease('client-test', 'a'.repeat(32));
  const panel = new EditorPanel({
    client,
    t: translate,
    onClose,
    onToast,
    onSaved,
  });
  document.body.appendChild(panel.element);
  panels.push(panel);
  return { panel, onClose, onToast, onSaved };
}

/** Tuvale tek darbe göndererek belgeyi gerçekten kirletir. */
function paintOnce(panel: EditorPanel): void {
  const canvas = panel.element.querySelector('canvas');
  if (!canvas) throw new Error('tuval yok');
  // jsdom yerleşim ölçmez: kamera `fit()` sonrası belge origin'i (0,0)'dadır,
  // bu yüzden ekran (0,0) belge pikseli (0,0)'a düşer.
  const options = { bubbles: true, cancelable: true, pointerId: 1, clientX: 0, clientY: 0 };
  canvas.dispatchEvent(new PointerEvent('pointerdown', options));
  canvas.dispatchEvent(new PointerEvent('pointerup', options));
}

beforeEach(() => {
  // jsdom `toBlob` sunmaz; kayıt yolunun kodlama adımı burada taklit edilir.
  HTMLCanvasElement.prototype.toBlob = function toBlob(callback: BlobCallback): void {
    callback(new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }));
  };
});

afterEach(() => {
  for (const panel of panels.splice(0)) panel.destroy();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe('EditorPanel — belge açma', () => {
  it('rasteri indirir, editörü kurar ve temiz başlar', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(rasterResponse())),
    );
    const { panel } = mount();

    await panel.open(IMAGE);

    expect(panel.isOpen).toBe(true);
    expect(panel.isDirty).toBe(false);
    expect(panel.openAssetId).toBe('asset-1');
    expect(panel.element.getAttribute('aria-hidden')).toBe('false');
    expect(panel.element.querySelector('canvas')).not.toBeNull();
    expect(panel.element.querySelector('.editor-panel__status')?.textContent).toBe('editor.clean');
  });

  it('düşecek metadatayı kullanıcıya bildirir', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(rasterResponse('a'.repeat(64), 'icc,exif'))),
    );
    const { panel, onToast } = mount();

    await panel.open(IMAGE);

    expect(onToast).toHaveBeenCalledWith('editor.metadataStripped:icc, exif');
  });

  it('indirme hatasında sözleşmeli mesaj gösterir ve belge açmaz', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ error: { code: 'asset_too_large' } }), { status: 413 }),
        ),
      ),
    );
    const { panel } = mount();

    await panel.open(IMAGE);

    expect(panel.isOpen).toBe(false);
    expect(panel.element.querySelector('.editor-panel__status')?.textContent).toBe(
      'errors.asset_too_large',
    );
  });
});

describe('EditorPanel — kaydetme', () => {
  it('beklenen revizyonla kaydeder ve belgeyi temizler', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(rasterResponse())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            transactionId: 'tx',
            results: [{ assetId: 'asset-1', revision: 'b'.repeat(64), bytes: 4 }],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);
    const { panel, onSaved, onToast } = mount();
    await panel.open(IMAGE);
    paintOnce(panel);

    await panel.save();

    expect(onSaved).toHaveBeenCalledWith('asset-1', 'b'.repeat(64));
    expect(onToast).toHaveBeenCalledWith('editor.saved');
    expect(panel.isDirty).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('ağ yanıtını beklerken yapılan düzenleme kirli kalır', async () => {
    let finish: (response: Response) => void = () => {
      throw new Error('Yanıt henüz beklenmiyor');
    };
    const response = new Promise<Response>((resolve) => {
      finish = resolve;
    });
    const fetchMock = vi.fn().mockResolvedValueOnce(rasterResponse()).mockReturnValueOnce(response);
    vi.stubGlobal('fetch', fetchMock);
    const { panel } = mount();
    await panel.open(IMAGE);
    paintOnce(panel);
    const save = panel.save();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    panel.setTool('eraser');
    paintOnce(panel);
    finish(
      new Response(
        JSON.stringify({ results: [{ assetId: IMAGE.id, revision: 'b'.repeat(64), bytes: 4 }] }),
      ),
    );
    await save;
    expect(panel.isDirty).toBe(true);
    expect(panel.element.querySelector('.editor-panel__status')?.textContent).toBe(
      'editor.unsaved',
    );
    panel.element.querySelector<HTMLButtonElement>('.editor-panel__undo')?.click();
    expect(panel.isDirty).toBe(false);
  });

  it('eski kaydın yanıtı yeniden açılan belgeye ve bildirimlere dokunmaz', async () => {
    let finish: (response: Response) => void = () => {
      throw new Error('Yanıt henüz beklenmiyor');
    };
    const response = new Promise<Response>((resolve) => {
      finish = resolve;
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(rasterResponse())
      .mockReturnValueOnce(response)
      .mockResolvedValueOnce(rasterResponse());
    vi.stubGlobal('fetch', fetchMock);
    const { panel, onToast, onSaved } = mount();
    await panel.open(IMAGE);
    paintOnce(panel);
    const save = panel.save();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const { signal } = fetchMock.mock.calls[1][1] as RequestInit;
    await panel.open({ ...IMAGE, id: 'second' });
    paintOnce(panel);
    expect(signal?.aborted).toBe(true);
    finish(
      new Response(JSON.stringify({ results: [{ assetId: IMAGE.id, revision: 'b', bytes: 4 }] })),
    );
    await save;
    expect(panel.isDirty).toBe(true);
    expect(panel.element.querySelector('.editor-panel__status')?.textContent).toBe(
      'editor.unsaved',
    );
    expect(panel.element.querySelector<HTMLButtonElement>('.editor-panel__save')?.disabled).toBe(
      false,
    );
    expect(onSaved).not.toHaveBeenCalled();
    expect(onToast).not.toHaveBeenCalled();
  });

  it('PNG kodlanırken kapanan oturum ağa kayıt göndermez', async () => {
    let encoded: BlobCallback = () => {
      throw new Error('PNG kodlaması başlamadı');
    };
    HTMLCanvasElement.prototype.toBlob = (callback) => {
      encoded = callback;
    };
    const fetchMock = vi.fn().mockResolvedValueOnce(rasterResponse());
    vi.stubGlobal('fetch', fetchMock);
    const { panel, onSaved } = mount();
    await panel.open(IMAGE);
    paintOnce(panel);
    const save = panel.save();
    panel.close();
    encoded(new Blob(['png']));
    await save;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('PNG oturumunda kalıcılaştırılamayan animasyon denetimleri sunmaz', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(rasterResponse()));
    const { panel } = mount();
    await panel.open(IMAGE);
    expect(panel.element.querySelector('.frame-panel')).toBeNull();
    expect(panel.element.querySelector<HTMLButtonElement>('.editor-panel__save')?.title).toBe(
      'editor.pngLayers',
    );
    expect(panel.element.querySelector('.layer-panel')).not.toBeNull();
  });

  it('temiz belgeyi kaydetmez — sebepsiz yeniden yazma yok', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(rasterResponse());
    vi.stubGlobal('fetch', fetchMock);
    const { panel, onSaved } = mount();
    await panel.open(IMAGE);

    await panel.save();

    expect(onSaved).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('çakışma kodunu kullanıcıya iletir', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(rasterResponse());
    vi.stubGlobal('fetch', fetchMock);
    const { panel, onToast } = mount();
    await panel.open(IMAGE);

    panel.noteExternalRevision('asset-1', 'c'.repeat(64));

    const bar = panel.element.querySelector<HTMLElement>('.editor-panel__conflict');
    expect(bar?.hidden).toBe(false);
    expect(panel.element.querySelector('.editor-panel__conflict-text')?.textContent).toBe(
      'editor.conflictClean',
    );
    expect(onToast).not.toHaveBeenCalled();
  });

  it('başka varlığın harici değişimi açık belgeyi etkilemez', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(rasterResponse())),
    );
    const { panel } = mount();
    await panel.open(IMAGE);

    panel.noteExternalRevision('baska-asset', 'c'.repeat(64));

    expect(panel.element.querySelector<HTMLElement>('.editor-panel__conflict')?.hidden).toBe(true);
  });
});

describe('EditorPanel — araç ve yaşam döngüsü', () => {
  it('araç seçimi aria-pressed ile tekil kalır', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(rasterResponse())),
    );
    const { panel } = mount();
    await panel.open(IMAGE);

    panel.setTool('fill');

    const pressed = [...panel.element.querySelectorAll('.editor-panel__tool')].filter(
      (button) => button.getAttribute('aria-pressed') === 'true',
    );
    expect(pressed).toHaveLength(1);
    expect(pressed[0].getAttribute('data-tool')).toBe('fill');
  });

  it('araç klavye kısayollarını form alanı dışında uygular', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(rasterResponse())),
    );
    const { panel } = mount();
    await panel.open(IMAGE);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e' }));

    expect(panel.element.querySelector('[data-tool="eraser"]')?.getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('klavye geri alma, yineleme ve kayıt aynı belge durumunu yönetir', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(rasterResponse())
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ results: [{ assetId: IMAGE.id, revision: 'b', bytes: 4 }] })),
      );
    vi.stubGlobal('fetch', fetchMock);
    const { panel, onSaved } = mount();
    await panel.open(IMAGE);
    paintOnce(panel);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }));
    expect(panel.isDirty).toBe(false);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, shiftKey: true }));
    expect(panel.isDirty).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true }));
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledWith(IMAGE.id, 'b'));
    expect(panel.isDirty).toBe(false);
  });

  it('fırça kısayolu gösterilen sınırı aşan bir boyutu tuvale göndermez', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(rasterResponse()));
    const applied = vi.spyOn(PixelEditor.prototype, 'setBrushSize');
    const { panel } = mount();
    await panel.open(IMAGE);
    for (let i = 0; i < 20; i++) window.dispatchEvent(new KeyboardEvent('keydown', { key: ']' }));
    expect(applied).toHaveBeenLastCalledWith(16);
    for (let i = 0; i < 20; i++) window.dispatchEvent(new KeyboardEvent('keydown', { key: '[' }));
    expect(applied).toHaveBeenLastCalledWith(1);
    applied.mockRestore();
  });

  it('kapatma belgeyi bırakır ve tuvali söker', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(rasterResponse())),
    );
    const { panel } = mount();
    await panel.open(IMAGE);

    panel.close();

    expect(panel.isOpen).toBe(false);
    expect(panel.openAssetId).toBeNull();
    expect(panel.element.querySelector('canvas')).toBeNull();
    expect(panel.element.getAttribute('aria-hidden')).toBe('true');
  });

  it('yeniden açmak önceki belgeyi sızdırmaz', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(rasterResponse())),
    );
    const { panel } = mount();

    await panel.open(IMAGE);
    await panel.open({ ...IMAGE, id: 'asset-2', name: 'other.png' });

    expect(panel.element.querySelectorAll('canvas')).toHaveLength(1);
    expect(panel.openAssetId).toBe('asset-2');
  });

  it('dil değişiminde etiketleri yeniler', () => {
    const { panel } = mount();

    panel.setTranslator((key) => `EN:${key}`);

    expect(panel.element.querySelector('.editor-panel__save')?.textContent).toBe('EN:editor.save');
  });

  it('destroy iki kez çağrılsa da DOM bırakmaz', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(rasterResponse())),
    );
    const { panel } = mount();
    await panel.open(IMAGE);
    const element = panel.element;

    panel.destroy();
    panel.destroy();

    expect(element.isConnected).toBe(false);
  });

  it('reload açık varlığı yeniden indirir', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(rasterResponse())),
    );
    const { panel } = mount();
    await panel.open(IMAGE);

    await panel.reload();

    expect(panel.isOpen).toBe(true);
    expect(panel.openAssetId).toBe('asset-1');
  });

  it('hata kodu bilinmiyorsa genel mesaja düşer', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('ağ koptu'))),
    );
    const { panel } = mount();

    await panel.open(IMAGE);

    expect(panel.element.querySelector('.editor-panel__status')?.textContent).toBe(
      'errors.request_failed',
    );
    expect(AssetStudioApiError.name).toBe('AssetStudioApiError');
  });
});
