import { describe, expect, it } from 'vitest';
import { articulateRigDefinition } from '../../src/rig/articulateRig';
import type { RigDefinition, RigPartAsset } from '../../src/rig/types';

function part(partId: string): RigPartAsset {
  return {
    partId,
    parentPartId: null,
    textureKey: `t__${partId}`,
    textureUrl: `/mock/${partId}.png`,
    logicalSizePx: { width: 10, height: 4 },
    positionPx: { x: 0, y: 0 },
    rotationDeg: 0,
  };
}

function rig(...partIds: string[]): RigDefinition {
  return {
    entityId: 'test',
    rootSizePx: { width: 100, height: 100 },
    exportScale: 2,
    parts: partIds.map(part),
  };
}

describe('articulateRigDefinition', () => {
  it('bildirilen ebeveynleri yazar, listede olmayanı kökte bırakır', () => {
    const result = articulateRigDefinition(rig('coxa', 'femur', 'shell'), { femur: 'coxa' });

    const byId = new Map(result.parts.map((item) => [item.partId, item]));
    expect(byId.get('femur')?.parentPartId).toBe('coxa');
    expect(byId.get('coxa')?.parentPartId).toBeNull();
    expect(byId.get('shell')?.parentPartId).toBeNull();
  });

  it('ebeveyni ÇOCUKTAN ÖNCE gelecek şekilde sıralar', () => {
    // Kaynak sırada çocuk önce geliyor: eklem uygulanmadan bu tanım
    // `assembleRig`te henüz kurulmamış bir container'a bağlanmaya çalışırdı.
    const result = articulateRigDefinition(rig('claw', 'tibia', 'coxa'), {
      claw: 'tibia',
      tibia: 'coxa',
    });

    expect(result.parts.map((item) => item.partId)).toEqual(['coxa', 'tibia', 'claw']);
  });

  it('aynı ebeveynin çocuklarında kaynak çizim sırasını korur', () => {
    const result = articulateRigDefinition(rig('root', 'a', 'b', 'c'), {
      a: 'root',
      b: 'root',
      c: 'root',
    });

    expect(result.parts.map((item) => item.partId)).toEqual(['root', 'a', 'b', 'c']);
  });

  it('kaynakta yazılı eklemleri EZMEZ, yalnız eksikleri tamamlar', () => {
    const source = rig('coxa', 'femur', 'tibia');
    source.parts[1].parentPartId = 'coxa';

    const result = articulateRigDefinition(source, { tibia: 'femur' });

    const byId = new Map(result.parts.map((item) => [item.partId, item]));
    expect(byId.get('femur')?.parentPartId).toBe('coxa');
    expect(byId.get('tibia')?.parentPartId).toBe('femur');
  });

  it('kaynaktaki eklemle şemadaki eklem birlikte döngü kurarsa reddedilir', () => {
    const source = rig('a', 'b');
    source.parts[0].parentPartId = 'b';

    expect(() => articulateRigDefinition(source, { b: 'a' })).toThrow(/döngü/);
  });

  it('kaynak tanımı DEĞİŞTİRMEZ', () => {
    const source = rig('coxa', 'femur');
    const before = structuredClone(source);

    articulateRigDefinition(source, { femur: 'coxa' });

    expect(source).toEqual(before);
  });

  it('bilinmeyen parça, bilinmeyen ebeveyn ve kendine bağlanma reddedilir', () => {
    expect(() => articulateRigDefinition(rig('coxa'), { yok: 'coxa' })).toThrow(/"yok" parçası/);
    expect(() => articulateRigDefinition(rig('coxa'), { coxa: 'yok' })).toThrow(/ebeveyni "yok"/);
    expect(() => articulateRigDefinition(rig('coxa'), { coxa: 'coxa' })).toThrow(/kendi ebeveyni/);
  });

  it('döngüyü halkasını göstererek reddeder', () => {
    expect(() => articulateRigDefinition(rig('a', 'b', 'c'), { a: 'b', b: 'c', c: 'a' })).toThrow(
      /döngü/,
    );
  });
});
