import { describe, expect, it } from 'vitest';
import { DocumentSession } from '../../src/editor/DocumentSession';
import { StrokeRecorder } from '../../src/editor/StrokeRecorder';
import { TILE_BYTES, type Rgba } from '../../src/editor/RasterSurface';

const RED = { r: 255, g: 0, b: 0, a: 255 };
const BLUE = { r: 0, g: 0, b: 255, a: 255 };
const CLEAR = { r: 0, g: 0, b: 0, a: 0 };

function session(): DocumentSession {
  return new DocumentSession({
    assetId: 'png',
    width: 2,
    height: 2,
    rgba: new Uint8ClampedArray(16),
    revision: 'a',
    t: (key, options) => (options ? `${key}:${String(options.index)}` : key),
  });
}

function paint(doc: DocumentSession, color: Rgba): void {
  const stroke = new StrokeRecorder(doc.surface);
  stroke.setPixel(0, 0, color);
  const command = stroke.toCommand({ label: 'paint' });
  if (command === null) throw new Error('Test gerçek piksel değişimi gerektirir');
  doc.record(command);
}

describe('PNG geçmişinin piksel bütünlüğü', () => {
  it('katman silme geri alınınca önceki fırça komutu aynı yüzeyi geri alır', () => {
    const doc = session();
    doc.addLayer();
    paint(doc, RED);
    doc.removeLayer(doc.activeLayerId);
    doc.undo();
    expect(doc.getPixel(0, 0)).toEqual(RED);
    doc.undo();
    expect(doc.getPixel(0, 0)).toEqual(CLEAR);
    expect([...doc.toRgba().slice(0, 4)]).toEqual([0, 0, 0, 0]);
    doc.redo();
    expect(doc.getPixel(0, 0)).toEqual(RED);
  });

  it('katman ekleme ve çizim birlikte geri alınıp yinelenebilir', () => {
    const doc = session();
    doc.addLayer();
    paint(doc, RED);
    doc.undo();
    doc.undo();
    doc.redo();
    doc.redo();
    expect(doc.getPixel(0, 0)).toEqual(RED);
    expect([...doc.toRgba().slice(0, 4)]).toEqual([255, 0, 0, 255]);
  });

  it('birleştirme öncesi ve sonrası fırça geçmişi doğru katmana bağlı kalır', () => {
    const doc = session();
    paint(doc, RED);
    doc.addLayer();
    paint(doc, BLUE);
    doc.mergeLayerDown(doc.activeLayerId);
    paint(doc, RED);
    doc.undo();
    doc.undo();
    expect(doc.getPixel(0, 0)).toEqual(BLUE);
    doc.undo();
    expect(doc.getPixel(0, 0)).toEqual(CLEAR);
    doc.redo();
    doc.redo();
    doc.redo();
    expect(doc.getPixel(0, 0)).toEqual(RED);
  });

  it('birleştirme bütçesi tutulan piksel tamponlarını kapsar', () => {
    const doc = session();
    paint(doc, RED);
    doc.addLayer();
    paint(doc, BLUE);
    const before = doc.getState().historyBytes;
    doc.mergeLayerDown(doc.activeLayerId);
    expect(doc.getState().historyBytes - before).toBe(3 * TILE_BYTES + 128);
  });

  it('kodlanan damgadan sonra yapılan değişikliği kaydedilmiş saymaz', () => {
    const doc = session();
    paint(doc, RED);
    const encodedToken = doc.stateToken;
    paint(doc, BLUE);
    doc.markSaved('b', encodedToken);
    expect(doc.isDirty).toBe(true);
    expect(doc.revision).toBe('b');
    doc.undo();
    expect(doc.isDirty).toBe(false);
    expect(doc.getPixel(0, 0)).toEqual(RED);
  });

  it('ad ve geçmiş etiketlerini çağıranın çevirisinden alır', () => {
    const doc = session();
    expect(doc.document.layers[0].name).toBe('editor.layerName:1');
    doc.addLayer();
    expect(doc.document.layers[1].name).toBe('editor.layerName:2');
    expect(doc.getState().undoLabel).toBe('editor.layerAdd');
  });
});
