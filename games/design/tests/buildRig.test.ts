import { describe, expect, it } from 'vitest';
import { buildRigDefinition } from '@/buildRig';
import type { RigMetadata } from '@/types';

function metadataFixture(): RigMetadata {
  return {
    schemaVersion: 1,
    entityId: 'test_unit',
    domain: 'players',
    source: {
      penFile: 'games/design/pen/entities.pen',
      sheetNodeId: 'root1',
      sheetNodeName: 'test_unit_character',
      exportScale: 2,
      rootSizePx: { width: 200, height: 200 },
    },
    parts: [
      {
        partId: 'top_cap',
        sourceNodeId: 'n1',
        shapeType: 'rectangle',
        category: null,
        logicalSizePx: { width: 16, height: 6.4 },
        positionPx: { x: 104, y: 32 },
        rotationDeg: 0,
        file: 'games/design/pen_export/players/test_unit/parts/top_cap.png',
      },
    ],
    previews: [],
  };
}

const TOP_CAP_URL = { 'pen_export/players/test_unit/parts/top_cap.png': '/assets/top_cap-abc.png' };

describe('buildRigDefinition', () => {
  it('metadata ve URL eşleşmesinden tam bir RigDefinition kurar', () => {
    const rig = buildRigDefinition(metadataFixture(), TOP_CAP_URL);

    expect(rig.entityId).toBe('test_unit');
    expect(rig.rootSizePx).toEqual({ width: 200, height: 200 });
    expect(rig.exportScale).toBe(2);
    expect(rig.parts).toEqual([
      {
        partId: 'top_cap',
        // Eklem taşımayan parça köke bağlanır — eklem desteği eklenmeden
        // önceki davranışın birebir aynısı.
        parentPartId: null,
        textureKey: 'test_unit__top_cap',
        textureUrl: '/assets/top_cap-abc.png',
        logicalSizePx: { width: 16, height: 6.4 },
        positionPx: { x: 104, y: 32 },
        rotationDeg: 0,
      },
    ]);
  });

  it('parça adı bir başkasının son eki olsa bile karışmaz', () => {
    const metadata = metadataFixture();
    metadata.parts.push({ ...metadata.parts[0], partId: 'front_top_cap', sourceNodeId: 'n2' });

    const rig = buildRigDefinition(metadata, {
      ...TOP_CAP_URL,
      'pen_export/players/test_unit/parts/front_top_cap.png': '/assets/front-def.png',
    });

    expect(rig.parts.map((p) => p.textureUrl)).toEqual([
      '/assets/top_cap-abc.png',
      '/assets/front-def.png',
    ]);
  });

  it('rootSizePx yoksa hata verir', () => {
    const metadata = metadataFixture();
    metadata.source.rootSizePx = null;

    expect(() => buildRigDefinition(metadata, TOP_CAP_URL)).toThrow(/rootSizePx/);
  });

  it('exportScale pozitif değilse hata verir', () => {
    const metadata = metadataFixture();
    metadata.source.exportScale = 0;

    expect(() => buildRigDefinition(metadata, TOP_CAP_URL)).toThrow(/exportScale/);
  });

  it('parçanın PNG karşılığı yoksa hata verir', () => {
    expect(() => buildRigDefinition(metadataFixture(), {})).toThrow(/top_cap/);
  });

  it('positionPx yoksa hata verir - izole export rig yerleşimi değildir', () => {
    const metadata = metadataFixture();
    metadata.parts[0].positionPx = null;

    expect(() => buildRigDefinition(metadata, TOP_CAP_URL)).toThrow(/positionPx/);
  });

  it('aynı partId metadata içinde tekrar ederse hata verir', () => {
    const metadata = metadataFixture();
    metadata.parts.push({ ...metadata.parts[0] });

    expect(() => buildRigDefinition(metadata, TOP_CAP_URL)).toThrow(/birden fazla kez/);
  });

  it('aynı parça adına iki dosya düşerse hata verir - hangisi olduğu belirsiz kalmaz', () => {
    expect(() =>
      buildRigDefinition(metadataFixture(), {
        ...TOP_CAP_URL,
        'pen_export/players/other_unit/parts/top_cap.png': '/assets/other-xyz.png',
      }),
    ).toThrow(/birden fazla dosya/);
  });

  it('PNG olmayan glob girdilerini yok sayar', () => {
    const rig = buildRigDefinition(metadataFixture(), {
      ...TOP_CAP_URL,
      'pen_export/players/test_unit/metadata/test_unit.metadata.json': '/assets/meta.json',
    });

    expect(rig.parts).toHaveLength(1);
  });
});

describe('eklem (parentPartId) doğrulaması', () => {
  it('ebeveyn listede ÖNCE geliyorsa çözümlenir', () => {
    const metadata = metadataFixture();
    metadata.parts.push({
      ...metadata.parts[0],
      partId: 'barrel',
      sourceNodeId: 'n2',
      parentPartId: 'top_cap',
    });

    const rig = buildRigDefinition(metadata, {
      ...TOP_CAP_URL,
      'pen_export/players/test_unit/parts/barrel.png': '/assets/barrel-def.png',
    });

    expect(rig.parts[1].parentPartId).toBe('top_cap');
  });

  it('parça kendi ebeveyni olamaz', () => {
    const metadata = metadataFixture();
    metadata.parts[0].parentPartId = 'top_cap';

    expect(() => buildRigDefinition(metadata, TOP_CAP_URL)).toThrow(/kendi ebeveyni olamaz/);
  });

  it('ebeveyn listede SONRA geliyorsa reddedilir (ağaç tek geçişte kurulamaz)', () => {
    const metadata = metadataFixture();
    metadata.parts[0].parentPartId = 'barrel';
    metadata.parts.push({ ...metadata.parts[0], partId: 'barrel', sourceNodeId: 'n2' });

    expect(() => buildRigDefinition(metadata, TOP_CAP_URL)).toThrow(/ondan SONRA geliyor/);
  });

  it('var olmayan ebeveyn reddedilir', () => {
    const metadata = metadataFixture();
    metadata.parts[0].parentPartId = 'olmayan_parca';

    expect(() => buildRigDefinition(metadata, TOP_CAP_URL)).toThrow(/hiç yok/);
  });
});
