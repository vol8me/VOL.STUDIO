import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ARACHNID_RIG,
  PLASMA_CANNON_RIG,
  arachnidMetadata,
  plasmaCannonMetadata,
} from '@/config/rigAssets';

const publicRoot = resolve(process.cwd(), 'public');

/**
 * Rig asset'inin gönderilen hâli: metadata paketin kaynağında, parça PNG'leri `public/` altında.
 * Oyun asset'ini üreten araca bakmaz (`rig:sync` kopyalar); bu test ikisinin ayrışmadığını,
 * yani çalışma anında yüklenecek her dokunun diskte olduğunu ve diskte sahipsiz parça
 * kalmadığını doğrular.
 */
const RIGS = [
  { name: 'arachnid', metadata: arachnidMetadata, definition: ARACHNID_RIG },
  { name: 'plasma_cannon', metadata: plasmaCannonMetadata, definition: PLASMA_CANNON_RIG },
] as const;

describe.each(RIGS)('$name rig asset', ({ name, metadata, definition }) => {
  it('metadata varlık kimliğini taşır ve önizleme göndermez', () => {
    expect(metadata.entityId).toBe(name);
    expect(metadata.previews).toEqual([]);
  });

  it('her parçanın PNG dosyası diskte vardır ve yolu assets/rig altındadır', () => {
    for (const part of metadata.parts) {
      expect(part.file, part.partId).toBe(`assets/rig/${name}/parts/${part.partId}.png`);
      expect(existsSync(resolve(publicRoot, part.file)), part.partId).toBe(true);
    }
  });

  it('diskte metadata dışı sahipsiz parça kalmaz', () => {
    const onDisk = readdirSync(resolve(publicRoot, `assets/rig/${name}/parts`)).sort();
    const declared = metadata.parts.map((part) => `${part.partId}.png`).sort();
    expect(onDisk).toEqual(declared);
  });

  it('montaj tanımı her parçayı bir doku adresine bağlar', () => {
    expect(definition.parts).toHaveLength(metadata.parts.length);
    const keys = new Set(definition.parts.map((part) => part.textureKey));
    expect(keys.size).toBe(definition.parts.length);
    for (const part of definition.parts) expect(part.textureUrl).toMatch(/assets\/rig\/.+\.png$/);
  });
});
