import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentSession } from '../../src/editor/DocumentSession';
import { StrokeRecorder } from '../../src/editor/StrokeRecorder';
import type { Rgba } from '../../src/editor/RasterSurface';

const RED: Rgba = { r: 255, g: 0, b: 0, a: 255 };
const BLUE: Rgba = { r: 0, g: 0, b: 255, a: 255 };

function makeSession(onChange?: (state: unknown) => void): DocumentSession {
  return new DocumentSession({
    assetId: 'asset-1',
    width: 32,
    height: 32,
    rgba: new Uint8ClampedArray(32 * 32 * 4),
    revision: 'a'.repeat(64),
    ...(onChange === undefined ? {} : { onChange }),
  });
}

/** Tek darbelik komut üretir ve oturuma kaydeder. */
function paint(session: DocumentSession, x: number, y: number, color: Rgba): void {
  const recorder = new StrokeRecorder(session.surface);
  recorder.setPixel(x, y, color);
  const command = recorder.toCommand({ label: 'kalem' });
  if (command) session.record(command);
}

describe('DocumentSession — kirlilik sözleşmesi', () => {
  it('açılışta temizdir', () => {
    expect(makeSession().isDirty).toBe(false);
  });

  it('düzenleme kirletir', () => {
    const session = makeSession();

    paint(session, 1, 1, RED);

    expect(session.isDirty).toBe(true);
  });

  it('undo ile kaydedilmiş duruma dönünce yeniden TEMİZ olur', () => {
    const session = makeSession();
    paint(session, 1, 1, RED);

    session.undo();

    // Belge diskteki içerikle birebir aynı; adım saymak burada "kirli" derdi.
    expect(session.isDirty).toBe(false);
  });

  it('redo yeniden kirletir', () => {
    const session = makeSession();
    paint(session, 1, 1, RED);
    session.undo();

    session.redo();

    expect(session.isDirty).toBe(true);
  });

  it('kayıttan sonra o durum yeni temiz taban olur', () => {
    const session = makeSession();
    paint(session, 1, 1, RED);
    session.markSaved('b'.repeat(64));

    expect(session.isDirty).toBe(false);
    expect(session.revision).toBe('b'.repeat(64));

    session.undo();
    // Kaydedilmiş durumdan GERİ gitmek yine kirliliktir.
    expect(session.isDirty).toBe(true);

    session.redo();
    expect(session.isDirty).toBe(false);
  });

  it('kaydettikten sonra yeni dal açmak kirletir', () => {
    const session = makeSession();
    paint(session, 1, 1, RED);
    session.markSaved('b'.repeat(64));
    session.undo();

    paint(session, 5, 5, BLUE);

    expect(session.isDirty).toBe(true);
    expect(session.getState().canRedo).toBe(false);
  });

  it('boş geçmişte undo/redo durumu bozmaz', () => {
    const session = makeSession();

    expect(session.undo()).toBe(false);
    expect(session.redo()).toBe(false);
    expect(session.isDirty).toBe(false);
  });

  it('history budget kırpılsa da undo belge damgasını yanlış duruma taşımaz', () => {
    const session = new DocumentSession({
      assetId: 'asset-1',
      width: 2,
      height: 2,
      rgba: new Uint8ClampedArray(16),
      revision: 'a'.repeat(64),
      maxHistoryBytes: 1,
    });
    const state = { value: 0 };
    const command = (next: number) => ({
      label: `değer ${next}`,
      byteCost: 1,
      apply: () => {
        state.value = next;
      },
      revert: () => {
        state.value = next - 1;
      },
    });

    session.execute(command(1));
    session.markSaved('b'.repeat(64));
    session.execute(command(2));
    expect(session.undo()).toBe(true);
    expect(state.value).toBe(1);
    expect(session.isDirty).toBe(false);
    expect(session.undo()).toBe(false);
  });

  it('bütçeye sığmayan komut yeni durumu damgalar fakat sahte undo bırakmaz', () => {
    const session = new DocumentSession({
      assetId: 'asset-1',
      width: 2,
      height: 2,
      rgba: new Uint8ClampedArray(16),
      revision: 'a'.repeat(64),
      maxHistoryBytes: 1,
    });
    let value = 0;
    session.execute({
      label: 'büyük',
      byteCost: 2,
      apply: () => {
        value = 1;
      },
      revert: () => {
        value = 0;
      },
    });

    expect(value).toBe(1);
    expect(session.isDirty).toBe(true);
    expect(session.undo()).toBe(false);
  });
});

describe('DocumentSession — harici revizyon', () => {
  it('aynı revizyon conflict üretmez', () => {
    const session = makeSession();

    session.noteExternalRevision('a'.repeat(64));

    expect(session.getState().conflictRevision).toBeUndefined();
  });

  it('farklı revizyon conflict bildirir', () => {
    const session = makeSession();

    session.noteExternalRevision('c'.repeat(64));

    expect(session.getState().conflictRevision).toBe('c'.repeat(64));
  });

  it('kayıt conflicti temizler', () => {
    const session = makeSession();
    session.noteExternalRevision('c'.repeat(64));

    session.markSaved('c'.repeat(64));

    expect(session.getState().conflictRevision).toBeUndefined();
  });
});

describe('DocumentSession — bildirim', () => {
  it('her durum değişiminde onChange yayınlar', () => {
    const onChange = vi.fn();
    const session = makeSession(onChange);

    paint(session, 2, 2, RED);
    session.undo();
    session.redo();

    expect(onChange).toHaveBeenCalledTimes(3);
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ dirty: true, canUndo: true, canRedo: false }),
    );
  });

  it('geçmiş byte maliyetini raporlar', () => {
    const session = makeSession();

    paint(session, 3, 3, RED);

    expect(session.getState().historyBytes).toBeGreaterThan(0);
  });
});

describe('DocumentSession — yapısal işlemler', () => {
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('katman ekler, siler, geri alır ve yeniler', () => {
    const session = makeSession();
    const initialCount = session.document.layers.length;

    session.addLayer('yeni');
    expect(session.document.layers.length).toBe(initialCount + 1);
    expect(session.activeLayerId).toBe(
      session.document.layers[session.document.layers.length - 1].id,
    );

    const addedId = session.activeLayerId;
    session.removeLayer(addedId);
    expect(session.document.layers.length).toBe(initialCount);

    session.undo();
    expect(session.document.layers.length).toBe(initialCount + 1);

    session.redo();
    expect(session.document.layers.length).toBe(initialCount);
  });

  it('son katmanı silmeye çalışmaz', () => {
    const session = makeSession();
    const onlyId = session.document.layers[0].id;
    session.removeLayer(onlyId);
    expect(session.document.layers.length).toBe(1);
  });

  it('katman özelliğini değiştirir ve geri alır', () => {
    const session = makeSession();
    const layerId = session.document.layers[0].id;

    session.updateLayer(layerId, { opacity: 0.5, name: 'gölge' }, 'özellik');
    expect(session.document.layers[0].opacity).toBe(0.5);
    expect(session.document.layers[0].name).toBe('gölge');

    session.undo();
    expect(session.document.layers[0].opacity).toBe(1);
    expect(session.document.layers[0].name).toBe('Katman 1');
  });

  it('geçersiz katman kimliğiyle değişiklik yapmaz', () => {
    const session = makeSession();
    const before = session.getState();

    session.setActiveLayer('yok');
    session.updateLayer('yok', { opacity: 0.5 }, 'özellik');

    expect(session.getState().activeLayerId).toBe(before.activeLayerId);
  });

  it('katman sırasını değiştirir ve geri alır', () => {
    const session = makeSession();
    session.addLayer('üst');
    const [lower, upper] = session.document.layers.map((l) => l.id);

    session.moveLayer(lower, 1);
    expect(session.document.layers[0].id).toBe(upper);
    expect(session.document.layers[1].id).toBe(lower);

    session.undo();
    expect(session.document.layers[0].id).toBe(lower);
    expect(session.document.layers[1].id).toBe(upper);
  });

  it('sınır dışı katman hareketini reddeder', () => {
    const session = makeSession();
    const layerId = session.document.layers[0].id;

    session.moveLayer(layerId, -1);
    session.moveLayer(layerId, 1);

    expect(session.document.layers.length).toBe(1);
  });

  it('iki katmanı aşağı birleştirir ve geri alır', () => {
    const session = makeSession();
    const lower = session.document.layers[0].id;
    session.addLayer('üst');
    const upper = session.document.layers[1].id;
    paint(session, 1, 1, RED);
    session.setActiveLayer(lower);
    paint(session, 2, 2, BLUE);

    session.mergeLayerDown(upper);
    expect(session.document.layers.length).toBe(1);
    expect(session.document.layers[0].id).toBe(lower);

    session.undo();
    expect(session.document.layers.length).toBe(2);
    expect(session.document.layers.some((l) => l.id === upper)).toBe(true);
  });

  it('en alttaki katmanı birleştirmeye çalışmaz', () => {
    const session = makeSession();
    const lower = session.document.layers[0].id;
    session.mergeLayerDown(lower);
    expect(session.document.layers.length).toBe(1);
  });

  it('kare ekler, siler, geri alır ve yeniler', () => {
    const session = makeSession();

    session.addFrame(false);
    expect(session.document.frameCount).toBe(2);
    expect(session.document.activeFrameIndex).toBe(1);

    session.removeFrame(1);
    expect(session.document.frameCount).toBe(1);

    session.undo();
    expect(session.document.frameCount).toBe(2);

    session.redo();
    expect(session.document.frameCount).toBe(1);
  });

  it('son kareyi silmeye çalışmaz', () => {
    const session = makeSession();
    session.removeFrame(0);
    expect(session.document.frameCount).toBe(1);
  });

  it('mevcut kareyi kopyalayarak kare ekler', () => {
    const session = makeSession();
    paint(session, 1, 1, RED);

    session.addFrame(true);
    expect(session.document.frameCount).toBe(2);

    const state = session.getState();
    expect(state.frameCount).toBe(2);
  });

  it('kare süresini değiştirir ve geri alır', () => {
    const session = makeSession();

    session.setFrameDuration(0, 250);
    expect(session.document.frames[0].durationMs).toBe(250);

    session.undo();
    expect(session.document.frames[0].durationMs).toBe(100);
  });

  it('aktif kareyi değiştirir', () => {
    const session = makeSession();
    session.addFrame(false);

    session.setActiveFrame(0);
    expect(session.document.activeFrameIndex).toBe(0);

    session.setActiveFrame(99);
    expect(session.document.activeFrameIndex).toBe(session.document.frameCount - 1);
  });

  it('aktif katman yüzeyine yazar ve bileşiği döner', () => {
    const session = makeSession();

    paint(session, 5, 5, RED);

    expect(session.getPixel(5, 5)).toEqual(RED);
    expect(session.toRgba()).toBeInstanceOf(Uint8ClampedArray);
    expect(session.composite().width).toBe(32);
  });
});
