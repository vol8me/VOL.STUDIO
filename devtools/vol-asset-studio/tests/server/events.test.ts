import { describe, expect, it, vi } from 'vitest';
import type { AssetSummary } from '../../shared/contracts.js';
import { AssetEventJournal } from '../../server/events.js';
import { formatSseEvent } from '../../server/routes.js';

const asset: AssetSummary = {
  id: 'asset-1',
  path: 'assets/car.png',
  rootId: 'images',
  name: 'car.png',
  kind: 'image',
  format: 'png',
  role: 'source',
  bytes: 4,
  modifiedAt: '2026-01-01T00:00:00.000Z',
  revision: 'revision',
  problemCodes: [],
};

describe('AssetEventJournal', () => {
  it('artan revision yayınlar ve aboneliği temizler', () => {
    const journal = new AssetEventJournal();
    const listener = vi.fn();
    const unsubscribe = journal.subscribe(listener);
    const event = journal.publish({ type: 'created', asset });
    unsubscribe();
    journal.publish({ type: 'deleted', assetId: asset.id });

    expect(event.revision).toBe(2);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(journal.since(1)).toHaveLength(2);
  });

  it('halka dışındaki istemciyi tam eşitlemeye yönlendirir', () => {
    const journal = new AssetEventJournal(1);
    journal.publish({ type: 'created', asset });
    journal.publish({ type: 'deleted', assetId: asset.id });
    expect(journal.since(1)).toEqual([{ type: 'resync', revision: 3 }]);
  });

  it('sunucu restartından kalan ileri Last-Event-ID için resync ister', () => {
    const journal = new AssetEventJournal();
    expect(journal.since(99)).toEqual([{ type: 'resync', revision: 1 }]);
  });

  it('EventSource için named event yerine standart message çerçevesi üretir', () => {
    const event = new AssetEventJournal().publish({ type: 'created', asset });
    const frame = formatSseEvent(event);
    expect(frame).toContain('id: 2\n');
    expect(frame).toContain('data: {"type":"created"');
    expect(frame).not.toContain('\nevent:');
    expect(frame.endsWith('\n\n')).toBe(true);
  });
});
