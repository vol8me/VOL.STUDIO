import { describe, expect, it } from 'vitest';
import { GameMeasurements } from '@/app/GameMeasurements';

describe('GameMeasurements', () => {
  it('kare aralıklarını kalite ve duraklatma geçişlerinde ayrı Deck pencerelerine yazar', async () => {
    const records: Record<string, unknown>[] = [];
    const measurement = new GameMeasurements((record) => {
      records.push(record);
      return Promise.resolve();
    }, 30);
    measurement.frame(0, false, 'low', 0);
    measurement.frame(16, false, 'low', 1);
    measurement.frame(32, false, 'low', 2);
    measurement.frame(1000, true, 'low', 0);
    measurement.frame(1016, true, 'low', 0);
    await measurement.flush();
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      type: 'perf',
      phase: 'gameplay',
      p95: 16,
      frames: 2,
      window: 1,
    });
    expect(records[1]).toMatchObject({
      type: 'perf',
      phase: 'pause',
      p95: 16,
      frames: 1,
      window: 2,
    });
    measurement.frame(2000, false, 'high', 3);
    measurement.frame(2016, false, 'high', 4);
    measurement.reset();
    measurement.frame(9000, false, 'high', 0);
    measurement.frame(9016, false, 'high', 0);
    await measurement.flush();
    expect(records[3]).toMatchObject({ p95: 16 });
  });
});
