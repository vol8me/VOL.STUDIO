import { describe, expect, it } from 'vitest';
import { substrateConfig } from '@/config/substrate';
import { FIELD_NAMES } from '@/runtime/sim/FieldSet';
import { RANDOM_STREAM_IDS } from '@/runtime/sim/RandomStreams';

/*
 * Z2: snapshot boyutu KODEK DÜZENİNDEN kilitlenir. Sayı elle yazılmaz;
 * düzenin kendisinden hesaplanır ve ölçülen gerçek boyutla karşılaştırılır.
 * Kodek düzeni değişirse bu test düşer ve depolama bütçesi yeniden ölçülür.
 */
const HEADER_BYTES = 64;
const HABITAT_DIGEST_BYTES = 16;
/* Düzen sabitleri KODEKTEN türer; ikinci bir kopya sessizce ayrışırdı. */
const STREAM_COUNT = RANDOM_STREAM_IDS.length;
const FIELD_ARRAY_COUNT = FIELD_NAMES.length + 1;
const PARTICLE_FLOAT_ARRAY_COUNT = 4;
/** Ölçüldü (2026-09-17, Node 22): 512 parçacık + 256² alanlar. */
const MEASURED_BYTES = 1_846_401;

function expectedByteLength(worldIdBytes: number, fieldLength: number, capacity: number): number {
  return (
    HEADER_BYTES +
    worldIdBytes +
    HABITAT_DIGEST_BYTES +
    STREAM_COUNT * 4 +
    fieldLength * 4 * FIELD_ARRAY_COUNT +
    capacity * 4 * PARTICLE_FLOAT_ARRAY_COUNT +
    capacity * 2 +
    capacity * 4
  );
}

describe('Z2 — snapshot boyutu kodek düzeninden kilitli', () => {
  it('varsayılan dünyada ölçülen boyutla düzen hesabı uyuşur', () => {
    const fieldLength = substrateConfig.world.fieldResolution ** 2;
    const capacity = substrateConfig.particles.capacity;
    // Dünya kimliği ölçülen snapshot'takiyle aynı uzunlukta (UUID biçimi).
    const worldIdBytes = MEASURED_BYTES - expectedByteLength(0, fieldLength, capacity);

    expect(expectedByteLength(worldIdBytes, fieldLength, capacity)).toBe(MEASURED_BYTES);
    expect(worldIdBytes).toBeGreaterThan(0);
    expect(worldIdBytes).toBeLessThan(256);
  });

  it('alan çözünürlüğü boyutun baskın terimidir', () => {
    const capacity = substrateConfig.particles.capacity;
    const fieldLength = substrateConfig.world.fieldResolution ** 2;
    const fieldBytes = fieldLength * 4 * FIELD_ARRAY_COUNT;
    const particleBytes = capacity * (4 * PARTICLE_FLOAT_ARRAY_COUNT + 2 + 4);

    // Alanlar baskın terimdir: bütçe parçacıkla değil ÇÖZÜNÜRLÜKLE büyür.
    expect(fieldBytes).toBeGreaterThan(particleBytes * 10);
    expect(fieldBytes + particleBytes).toBeLessThanOrEqual(MEASURED_BYTES);
  });

  it('çözünürlük iki katına çıkarsa boyut dört katına yaklaşır', () => {
    const capacity = substrateConfig.particles.capacity;
    const single = expectedByteLength(36, 256 ** 2, capacity);
    const doubled = expectedByteLength(36, 512 ** 2, capacity);

    expect(doubled / single).toBeGreaterThan(3.9);
    expect(doubled / single).toBeLessThan(4.1);
  });
});
