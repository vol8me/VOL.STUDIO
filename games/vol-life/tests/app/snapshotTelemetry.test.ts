import { describe, expect, it } from 'vitest';
import { SNAPSHOT_MEASURE, measureSnapshotEncode } from '@/app/snapshotTelemetry';

describe('Z2 — kayıt yolu ölçümü', () => {
  it('gerçek kodek çıktısını ve süreyi bildirir', async () => {
    const measurement = await measureSnapshotEncode(() =>
      Promise.resolve({
        byteLength: 1_846_401,
        payload: 'x'.repeat(500_868),
        encoding: 'gzip-base64',
      }),
    );

    expect(measurement.rawBytes).toBe(1_846_401);
    expect(measurement.encodedChars).toBe(500_868);
    expect(measurement.encoding).toBe('gzip-base64');
    expect(measurement.encodeMs).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(measurement.encodeMs)).toBe(true);
  });

  /* Süre `performance.measure`dan gelir; tarayıcı zaman çizelgesiyle aynı kaynak. */
  it('ölçüm performance zaman çizelgesine yazılır', async () => {
    performance.clearMeasures(SNAPSHOT_MEASURE);
    await measureSnapshotEncode(() =>
      Promise.resolve({ byteLength: 1, payload: 'a', encoding: 'base64' }),
    );
    expect(performance.getEntriesByName(SNAPSHOT_MEASURE).length).toBeGreaterThan(0);
  });

  it('kodlama hatası yutulmaz', async () => {
    await expect(
      measureSnapshotEncode(() => Promise.reject(new RangeError('kodlanamadı'))),
    ).rejects.toThrow(RangeError);
  });
});
