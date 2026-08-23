import { describe, expect, it } from 'vitest';
import { validateRigMetadata } from '@/validateMetadata';
import { buildRigDefinition } from '@/buildRig';
import type { RigMetadata } from '@/types';

function metadataFixture(): RigMetadata {
  return {
    schemaVersion: 1,
    entityId: 'test_unit',
    domain: 'players',
    source: {
      penFile: 'devtools/pen.dev/pen/entities.pen',
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
        file: 'devtools/pen.dev/pen_export/players/test_unit/parts/top_cap.png',
      },
    ],
    previews: [],
  };
}

/** Fixture'ı bozup `unknown` olarak döndürür — tip sistemi bilerek atlanır. */
function corrupt(mutate: (draft: Record<string, unknown>) => void): unknown {
  const draft = JSON.parse(JSON.stringify(metadataFixture())) as Record<string, unknown>;
  mutate(draft);
  return draft;
}

describe('validateRigMetadata', () => {
  it('geçerli metadata olduğu gibi döner', () => {
    const metadata = metadataFixture();
    expect(validateRigMetadata(metadata)).toBe(metadata);
  });

  it('nesne olmayan girdi reddedilir', () => {
    expect(() => validateRigMetadata(null)).toThrow(/bir nesne olmalı/);
    expect(() => validateRigMetadata('metadata')).toThrow(/bir nesne olmalı/);
    expect(() => validateRigMetadata([])).toThrow(/bir nesne olmalı/);
  });

  it('schemaVersion çalışma zamanında da doğrulanır', () => {
    expect(() => validateRigMetadata(corrupt((d) => (d.schemaVersion = 2)))).toThrow(
      /schemaVersion 1 olmalı/,
    );
  });

  it('parts eksikse anlaşılır bir mesaj verir (ham TypeError değil)', () => {
    let message = '';
    try {
      validateRigMetadata(corrupt((d) => delete d.parts));
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/parts bir dizi olmalı/);
    expect(message).not.toMatch(/Cannot read properties/);
  });

  it('boş parts dizisi reddedilir', () => {
    expect(() => validateRigMetadata(corrupt((d) => (d.parts = [])))).toThrow(/parts boş/);
  });

  it('parça alanlarının tipleri doğrulanır', () => {
    expect(() =>
      validateRigMetadata(
        corrupt((d) => {
          (d.parts as Record<string, unknown>[])[0].partId = 42;
        }),
      ),
    ).toThrow(/parts\[0\]\.partId/);

    expect(() =>
      validateRigMetadata(
        corrupt((d) => {
          (d.parts as Record<string, unknown>[])[0].logicalSizePx = { width: 'geniş' };
        }),
      ),
    ).toThrow(/parts\[0\]\.logicalSizePx\.width/);

    expect(() =>
      validateRigMetadata(
        corrupt((d) => {
          (d.parts as Record<string, unknown>[])[0].rotationDeg = 'sıfır';
        }),
      ),
    ).toThrow(/parts\[0\]\.rotationDeg/);
  });

  it('positionPx ve rootSizePx null OLABİLİR — izole parça export’u geçerlidir', () => {
    expect(() =>
      validateRigMetadata(
        corrupt((d) => {
          (d.parts as Record<string, unknown>[])[0].positionPx = null;
          (d.source as Record<string, unknown>).rootSizePx = null;
        }),
      ),
    ).not.toThrow();
  });

  it('source alanları doğrulanır', () => {
    expect(() =>
      validateRigMetadata(
        corrupt((d) => {
          (d.source as Record<string, unknown>).exportScale = 'iki';
        }),
      ),
    ).toThrow(/source\.exportScale/);

    expect(() => validateRigMetadata(corrupt((d) => delete d.source))).toThrow(
      /source bir nesne olmalı/,
    );
  });

  it('previews dizi değilse reddedilir', () => {
    expect(() => validateRigMetadata(corrupt((d) => (d.previews = 'yok')))).toThrow(
      /previews bir dizi olmalı/,
    );
    // Alan tamamen yoksa sorun değil: opsiyonel.
    expect(() => validateRigMetadata(corrupt((d) => delete d.previews))).not.toThrow();
  });

  it('category metin ya da null olmalı', () => {
    expect(() =>
      validateRigMetadata(
        corrupt((d) => {
          (d.parts as Record<string, unknown>[])[0].category = 42;
        }),
      ),
    ).toThrow(/parts\[0\]\.category/);

    // Metin de geçerli (null dışındaki tek kabul edilen tip).
    expect(() =>
      validateRigMetadata(
        corrupt((d) => {
          (d.parts as Record<string, unknown>[])[0].category = 'gövde';
        }),
      ),
    ).not.toThrow();
  });

  it('parça girdisi nesne değilse tek tek raporlanır', () => {
    expect(() => validateRigMetadata(corrupt((d) => (d.parts = ['metin'])))).toThrow(
      /parts\[0\] bir nesne olmalı/,
    );
  });

  it('positionPx nesne değilse reddedilir (null dışında)', () => {
    expect(() =>
      validateRigMetadata(
        corrupt((d) => {
          (d.parts as Record<string, unknown>[])[0].positionPx = { x: 1 };
        }),
      ),
    ).toThrow(/parts\[0\]\.positionPx\.y/);
  });

  it('TÜM sorunlar bir kerede raporlanır — tek tek düzeltip tekrar koşmak gerekmez', () => {
    let message = '';
    try {
      validateRigMetadata(
        corrupt((d) => {
          delete d.entityId;
          delete d.domain;
          (d.source as Record<string, unknown>).exportScale = null;
        }),
      );
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toMatch(/3 sorun/);
    expect(message).toMatch(/entityId/);
    expect(message).toMatch(/domain/);
    expect(message).toMatch(/source\.exportScale/);
  });
});

describe('buildRigDefinition doğrulamayı çağırır', () => {
  it('bozuk metadata montaj denenmeden reddedilir', () => {
    const broken = corrupt((d) => delete d.parts) as RigMetadata;
    expect(() => buildRigDefinition(broken, {})).toThrow(/parts bir dizi olmalı/);
  });
});

describe('eklem (parentPartId) doğrulaması', () => {
  it('parentPartId verilmemişse geçerlidir (eklem opsiyoneldir)', () => {
    const metadata = metadataFixture();
    delete (metadata.parts[0] as unknown as Record<string, unknown>).parentPartId;

    expect(() => validateRigMetadata(metadata)).not.toThrow();
  });

  it('parentPartId null olabilir', () => {
    const metadata = metadataFixture();
    (metadata.parts[0] as unknown as Record<string, unknown>).parentPartId = null;

    expect(() => validateRigMetadata(metadata)).not.toThrow();
  });

  it('BOŞ metin reddedilir', () => {
    const metadata = metadataFixture();
    (metadata.parts[0] as unknown as Record<string, unknown>).parentPartId = '';

    expect(() => validateRigMetadata(metadata)).toThrow(/parentPartId/);
  });

  it('metin olmayan parentPartId reddedilir', () => {
    const metadata = metadataFixture();
    (metadata.parts[0] as unknown as Record<string, unknown>).parentPartId = 7;

    expect(() => validateRigMetadata(metadata)).toThrow(/parentPartId/);
  });
});
