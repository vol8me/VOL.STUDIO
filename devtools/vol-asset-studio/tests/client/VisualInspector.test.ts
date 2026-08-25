import { describe, expect, it, vi } from 'vitest';
import type { AssetStudioClient } from '../../src/api/AssetStudioClient';
import { VisualInspector } from '../../src/preview/VisualInspector';
import { asset, translate } from './helpers';

const SPRITE_DOCUMENT = {
  schemaVersion: 1,
  size: [32, 24],
  seed: 7,
  palette: {
    colors: ['#000000', '#ffffff'],
    ramps: [{ id: 0, indices: [0, 1] }],
  },
  layers: [{ id: 'gövde', source: { kind: 'sdf.circle', r: 0.5 }, material: 0 }],
};

const STYLED_SPRITE_DOCUMENT = {
  ...SPRITE_DOCUMENT,
  layers: [
    {
      id: 'ışık',
      source: { kind: 'blur', radius: 0.02, input: { kind: 'sdf.circle', r: 0.32 } },
      height: { kind: 'gradient.radial', radius: 0.8 },
      material: 0,
    },
  ],
  shade: { ambient: 0.3, emission: 0.2 },
  post: { glow: { radius: 2, strength: 0.5, colorIndex: 1 } },
};

function createClient(source: unknown): AssetStudioClient {
  return {
    getJsonContent: vi.fn().mockResolvedValue(source),
  } as unknown as AssetStudioClient;
}

describe('VisualInspector', () => {
  it('sprite belgesini salt-okunur graph, QA ve kanal yüzeyine bağlar', async () => {
    const onClose = vi.fn();
    const client = createClient(SPRITE_DOCUMENT);
    const inspector = new VisualInspector({ client, t: translate, onClose });
    const sprite = asset({
      id: 'recipes:ship.volsprite.json',
      name: 'ship.volsprite.json',
      kind: 'sprite-document',
      format: 'volsprite.json',
      image: undefined,
    });
    document.body.append(inspector.element);

    inspector.open(sprite);
    await Promise.resolve();
    await Promise.resolve();

    expect(client.getJsonContent).toHaveBeenCalledWith(sprite, expect.any(AbortSignal));
    expect(inspector.isOpen).toBe(true);
    expect(inspector.element.querySelector('.visual-inspector__canvas')).not.toBeNull();
    expect(inspector.element.querySelector('.visual-inspector__tree')?.textContent).toContain(
      'gövde',
    );
    expect(inspector.element.querySelector('.visual-inspector__qa-list')).not.toBeNull();
    expect(inspector.element.querySelector('.visual-inspector__status')?.textContent).toContain(
      'Salt-okunur',
    );

    inspector.noteAssetChanged({ ...sprite, revision: 'rev-2' });
    await Promise.resolve();
    await Promise.resolve();
    expect(client.getJsonContent).toHaveBeenCalledTimes(2);

    const select = inspector.element.querySelectorAll<HTMLSelectElement>(
      '.visual-inspector__select',
    )[0];
    select.value = 'coverage';
    select.dispatchEvent(new Event('change'));
    inspector.element.querySelector<HTMLButtonElement>('.visual-inspector__close')!.click();
    expect(onClose).toHaveBeenCalledOnce();
    inspector.destroy();
  });

  it('geçersiz kaynakta dosyaya dokunmadan hatayı görünür kılar', async () => {
    const inspector = new VisualInspector({
      client: createClient({}),
      t: translate,
      onClose: vi.fn(),
    });
    document.body.append(inspector.element);
    inspector.open(asset({ kind: 'sprite-document', image: undefined }));
    await Promise.resolve();
    await Promise.resolve();

    expect(
      inspector.element.querySelector<HTMLElement>('.visual-inspector__status')?.dataset.state,
    ).toBe('error');
    inspector.destroy();
  });

  it('full-frame engellerini, tüm kanal görünümlerini ve dil değişimini yeniler', async () => {
    const client = createClient(STYLED_SPRITE_DOCUMENT);
    const inspector = new VisualInspector({ client, t: translate, onClose: vi.fn() });
    document.body.append(inspector.element);
    inspector.open(asset({ kind: 'sprite-document', image: undefined }));
    await Promise.resolve();
    await Promise.resolve();

    const selects = inspector.element.querySelectorAll<HTMLSelectElement>(
      '.visual-inspector__select',
    );
    const channel = selects[0];
    for (const view of ['alpha', 'height', 'shade', 'glow']) {
      channel.value = view;
      channel.dispatchEvent(new Event('change'));
    }
    selects[1].value = '64';
    selects[1].dispatchEvent(new Event('change'));
    inspector.setTranslator((key) => `en:${key}`);

    expect(inspector.element.textContent).toContain('en:inspector.region.fullFrame');
    expect(inspector.element.textContent).toContain('en:inspector.blockers.buffered');
    expect(inspector.element.querySelector('.visual-inspector__qa-list')).not.toBeNull();
    inspector.close();
    expect(inspector.isOpen).toBe(false);
    inspector.destroy();
  });

  it('kaynak okuma hatası Error olmayan yanıtı da güvenli duruma çevirir', async () => {
    const client = createClient(STYLED_SPRITE_DOCUMENT);
    vi.mocked(client.getJsonContent).mockRejectedValueOnce('network-failure');
    const inspector = new VisualInspector({ client, t: translate, onClose: vi.fn() });
    document.body.append(inspector.element);
    inspector.open(asset({ kind: 'sprite-document', image: undefined }));
    await Promise.resolve();
    await Promise.resolve();

    expect(
      inspector.element.querySelector<HTMLElement>('.visual-inspector__status')?.dataset.state,
    ).toBe('error');
    inspector.destroy();
  });
});
