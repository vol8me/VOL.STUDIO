import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SpriteDoc } from '@volstudio/core/visual';
import { OutputPanel } from '../../src/ui/OutputPanel';

const DOC: SpriteDoc = {
  schemaVersion: 1,
  size: [16, 16],
  seed: 1,
  palette: { colors: ['#111111'], ramps: [{ id: 0, indices: [0] }] },
  layers: [{ id: 'a', source: { kind: 'const', value: 1 }, material: 0 }],
};

const response = (payload: unknown): Response =>
  ({ ok: true, status: 200, json: () => Promise.resolve(payload) }) as Response;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('kayıtlı çıktı paneli', () => {
  it('listeyi getirir ve geçerli JSON tarifini aynı editöre yükler', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({ categories: ['material'], outputs: { material: ['ornek'] } }),
      )
      .mockResolvedValueOnce(response({ doc: DOC }));
    vi.stubGlobal('fetch', fetchMock);
    const onLoad = vi.fn();
    const panel = new OutputPanel(onLoad);

    panel.element.querySelector<HTMLButtonElement>('.vol-button')!.click();
    await vi.waitFor(() => {
      expect(panel.element.textContent).toContain('ornek');
    });
    const output = Array.from(
      panel.element.querySelectorAll<HTMLButtonElement>('.vol-button'),
    ).find((button) => button.textContent === 'ornek')!;
    output.click();

    await vi.waitFor(() => {
      expect(onLoad).toHaveBeenCalledWith('material', 'ornek', DOC);
    });
    expect(fetchMock).toHaveBeenLastCalledWith('/api/forge/load?path=material%2Fornek.json');
    panel.destroy();
  });
});
