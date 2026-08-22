import { afterEach, describe, expect, it, vi } from 'vitest';
import { createVisualPreset } from '@volstudio/core/visual';
import { DocumentStore } from '../../src/state/DocumentStore';
import { SavePanel } from '../../src/ui/SavePanel';

const response = (status: number, payload: unknown): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(payload),
  }) as Response;

afterEach(() => vi.unstubAllGlobals());

describe('kaydetme yüzeyi', () => {
  it('geçerli adla ortak hattın QA sonucunu gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response(200, {
          docPath: 'effect/parilti.json',
          pngPath: 'effect/parilti.png',
          width: 32,
          height: 32,
          qaPass: true,
          qaMetrics: [],
        }),
      ),
    );
    const panel = new SavePanel(
      new DocumentStore(createVisualPreset('softGlow', { size: 32 })),
      () => false,
    );
    panel.setCategory('effect');
    panel.setName('parilti');
    panel.element.querySelector<HTMLButtonElement>('.vol-button')!.click();
    await vi.waitFor(() => expect(panel.element.textContent).toContain('kalite denetimi geçti'));
    expect(panel.element.querySelector('.vf-save__status')?.getAttribute('data-tone')).toBe(
      'success',
    );
    panel.destroy();
  });

  it('QA uyarısını başarı diye gizlemez ve sunucu hatasını gösterir', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response(200, {
          docPath: 'organic/a.json',
          pngPath: 'organic/a.png',
          width: 32,
          height: 32,
          qaPass: false,
          qaMetrics: [],
        }),
      )
      .mockResolvedValueOnce(response(500, { error: 'disk dolu' }));
    vi.stubGlobal('fetch', fetchMock);
    const panel = new SavePanel(
      new DocumentStore(createVisualPreset('organicCluster', { size: 32 })),
      () => false,
    );
    panel.setName('a');
    const button = panel.element.querySelector<HTMLButtonElement>('.vol-button')!;
    button.click();
    await vi.waitFor(() => expect(panel.element.textContent).toContain('uyarı verdi'));
    expect(panel.element.querySelector('.vf-save__status')?.getAttribute('data-tone')).toBe(
      'warning',
    );
    button.click();
    await vi.waitFor(() => expect(panel.element.textContent).toContain('disk dolu'));
    expect(panel.element.querySelector('.vf-save__status')?.getAttribute('data-tone')).toBe(
      'error',
    );
    panel.destroy();
  });

  it('boş/geçersiz ad ve belge sorunu kaydetmeyi gerçekten kapatır', () => {
    let blocked = false;
    const panel = new SavePanel(
      new DocumentStore(createVisualPreset('softGlow', { size: 32 })),
      () => blocked,
    );
    const button = panel.element.querySelector<HTMLButtonElement>('.vol-button')!;
    expect(button.disabled).toBe(true);
    panel.setName('Büyük Ad');
    expect(button.disabled).toBe(true);
    blocked = true;
    panel.setName('gecerli-ad');
    expect(button.disabled).toBe(true);
    expect(panel.element.textContent).toContain('geçerli olmadan');
    panel.destroy();
  });
});
