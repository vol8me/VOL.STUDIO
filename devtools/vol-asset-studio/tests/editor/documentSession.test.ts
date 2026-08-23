import { describe, expect, it, vi } from 'vitest';
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
