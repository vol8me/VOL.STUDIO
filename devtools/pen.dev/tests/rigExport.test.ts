import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  auditRigExport,
  auditShippedRig,
  resolveRigExportPaths,
  syncRigExport,
  verifyRigExport,
} from '../src/rigExport';
import type { RigMetadata } from '@volstudio/core/rig/metadata';

/**
 * Bu paket dosya SİSTEMİYLE çalışan bir araçtır; testleri de gerçek bir geçici
 * dizinde koşar. `fs` mock'lamak burada yanlış olurdu: doğrulanan şey tam olarak
 * "diskte ne var, metadata ne diyor" farkıdır — mock'lanan bir disk o farkı
 * tanım gereği üretemez.
 */
let root: string;

function metadataFixture(overrides: Partial<RigMetadata> = {}): RigMetadata {
  return {
    schemaVersion: 1,
    entityId: 'walker',
    domain: 'enemies',
    source: {
      penFile: 'devtools/pen.dev/pen/entities.pen',
      sheetNodeId: 'aBcDe',
      sheetNodeName: 'Walker Parts Export Sheet',
      exportScale: 2,
      rootSizePx: { width: 100, height: 80 },
    },
    parts: [
      {
        partId: 'hull',
        sourceNodeId: 'n1',
        shapeType: 'rectangle',
        category: null,
        logicalSizePx: { width: 40, height: 20 },
        positionPx: { x: 10, y: 10 },
        rotationDeg: 0,
        parentPartId: null,
        file: 'pen_export/enemies/walker/parts/hull.png',
      },
      {
        partId: 'arm',
        sourceNodeId: 'n2',
        shapeType: 'rectangle',
        category: null,
        logicalSizePx: { width: 20, height: 6 },
        positionPx: { x: 30, y: 14 },
        rotationDeg: 12,
        parentPartId: 'hull',
        file: 'pen_export/enemies/walker/parts/arm.png',
      },
    ],
    previews: [
      {
        partId: 'reference_card',
        sourceNodeId: 'n9',
        logicalSizePx: { width: 200, height: 200 },
        file: 'pen_export/enemies/walker/previews/reference_card.png',
      },
    ],
    ...overrides,
  };
}

/** Bir export ağacı kurar; `partFiles` verilmezse metadata ile birebir yazılır. */
function writeExport(metadata: RigMetadata, partFiles?: string[]): void {
  const paths = resolveRigExportPaths({
    exportRoot: join(root, 'pen_export'),
    domain: metadata.domain,
    entityId: metadata.entityId,
  });
  mkdirSync(join(paths.entityDir, 'metadata'), { recursive: true });
  mkdirSync(paths.partsDir, { recursive: true });
  writeFileSync(paths.metadataFile, JSON.stringify(metadata), 'utf8');

  const files = partFiles ?? metadata.parts.map((part) => `${part.partId}.png`);
  for (const file of files) writeFileSync(join(paths.partsDir, file), `png:${file}`, 'utf8');
}

function ref(entityId = 'walker', domain = 'enemies') {
  return { exportRoot: join(root, 'pen_export'), domain, entityId };
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pen-dev-rig-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('resolveRigExportPaths', () => {
  it('entity düzenini metadata/parts/previews olarak çözer', () => {
    const paths = resolveRigExportPaths(ref());
    expect(paths.metadataFile.endsWith('/enemies/walker/metadata/walker.metadata.json')).toBe(true);
    expect(paths.partsDir.endsWith('/enemies/walker/parts')).toBe(true);
    expect(paths.previewsDir.endsWith('/enemies/walker/previews')).toBe(true);
  });
});

describe('auditRigExport', () => {
  it('tutarlı bir export’ta hiçbir fark bildirmez', () => {
    writeExport(metadataFixture());
    const audit = auditRigExport(ref());

    expect(audit.entityId).toBe('walker');
    expect(audit.partCount).toBe(2);
    expect(audit.missingParts).toEqual([]);
    expect(audit.orphanParts).toEqual([]);
  });

  it('eksik ve yetim dosyaları AYNI turda toplar', () => {
    // `arm.png` yazılmadı, karşılığı olmayan `ghost.png` yazıldı.
    writeExport(metadataFixture(), ['hull.png', 'ghost.png']);
    const audit = auditRigExport(ref());

    expect(audit.missingParts).toEqual(['arm.png']);
    expect(audit.orphanParts).toEqual(['ghost.png']);
  });

  it('parts dizini hiç yoksa çökmez, hepsini eksik sayar', () => {
    const metadata = metadataFixture();
    const paths = resolveRigExportPaths(ref());
    mkdirSync(join(paths.entityDir, 'metadata'), { recursive: true });
    writeFileSync(paths.metadataFile, JSON.stringify(metadata), 'utf8');

    const audit = auditRigExport(ref());
    expect(audit.missingParts).toEqual(['arm.png', 'hull.png']);
    expect(audit.orphanParts).toEqual([]);
  });

  it('metadata dosyası yoksa nerede aradığını söyler', () => {
    expect(() => auditRigExport(ref())).toThrow(/metadata bulunamadı/);
  });

  it('metadata bozuksa doğrulayıcının mesajını taşır', () => {
    const paths = resolveRigExportPaths(ref());
    mkdirSync(join(paths.entityDir, 'metadata'), { recursive: true });
    writeFileSync(paths.metadataFile, JSON.stringify({ schemaVersion: 2 }), 'utf8');

    expect(() => auditRigExport(ref())).toThrow(/schemaVersion 1 olmalı/);
  });
});

describe('verifyRigExport', () => {
  it('tutarlı export’ta metadata döner', () => {
    writeExport(metadataFixture());
    expect(verifyRigExport(ref()).parts).toHaveLength(2);
  });

  it('eksik parçada fırlatır ve dosya adını söyler', () => {
    writeExport(metadataFixture(), ['hull.png']);
    expect(() => verifyRigExport(ref())).toThrow(/arm\.png/);
  });

  it('YETİM dosya da hatadır — silinmiş bir parça diskte kalmamalı', () => {
    writeExport(metadataFixture(), ['hull.png', 'arm.png', 'stale.png']);
    expect(() => verifyRigExport(ref())).toThrow(/diskte var ama metadata'da yok: stale\.png/);
  });
});

describe('syncRigExport', () => {
  const outFiles = () => ({
    metadataOut: join(root, 'game/src/assets/rig/walker.metadata.json'),
    partsOut: join(root, 'game/public/assets/rig/walker/parts'),
  });

  it('parçaları kopyalar ve metadata’yı tüketicinin yoluna yeniden yazar', () => {
    writeExport(metadataFixture());
    const { metadataOut, partsOut } = outFiles();

    const report = syncRigExport({
      source: ref(),
      metadataOut,
      partsOut,
      publicBase: 'assets/rig/walker/parts',
    });

    expect(report.copied.sort()).toEqual(['arm.png', 'hull.png']);
    expect(report.removed).toEqual([]);
    expect(existsSync(join(partsOut, 'hull.png'))).toBe(true);
    expect(existsSync(join(partsOut, 'arm.png'))).toBe(true);

    const shipped = JSON.parse(readFileSync(metadataOut, 'utf8')) as RigMetadata;
    expect(shipped.parts.map((part) => part.file)).toEqual([
      'assets/rig/walker/parts/hull.png',
      'assets/rig/walker/parts/arm.png',
    ]);
  });

  it('önizlemeleri GÖNDERMEZ — yazarlık referansı çalışma zamanı yükü değildir', () => {
    writeExport(metadataFixture());
    const { metadataOut, partsOut } = outFiles();
    syncRigExport({ source: ref(), metadataOut, partsOut, publicBase: 'assets/rig/walker/parts' });

    const shipped = JSON.parse(readFileSync(metadataOut, 'utf8')) as RigMetadata;
    expect(shipped.previews).toEqual([]);
  });

  it('taban yolun sonundaki eğik çizgi çift eğik çizgi üretmez', () => {
    writeExport(metadataFixture());
    const { metadataOut, partsOut } = outFiles();
    syncRigExport({ source: ref(), metadataOut, partsOut, publicBase: 'assets/rig/walker/parts/' });

    const shipped = JSON.parse(readFileSync(metadataOut, 'utf8')) as RigMetadata;
    expect(shipped.parts[0].file).toBe('assets/rig/walker/parts/hull.png');
  });

  it('hedefte kalan FAZLALIĞI siler — yeniden adlandırılan parça iki kez gönderilmez', () => {
    writeExport(metadataFixture());
    const { metadataOut, partsOut } = outFiles();
    mkdirSync(partsOut, { recursive: true });
    writeFileSync(join(partsOut, 'old_name.png'), 'eski', 'utf8');

    const report = syncRigExport({
      source: ref(),
      metadataOut,
      partsOut,
      publicBase: 'assets/rig/walker/parts',
    });

    expect(report.removed).toEqual(['old_name.png']);
    expect(existsSync(join(partsOut, 'old_name.png'))).toBe(false);
  });

  it('doğrulanmamış bir export gönderilmez', () => {
    writeExport(metadataFixture(), ['hull.png']);
    const { metadataOut, partsOut } = outFiles();

    expect(() =>
      syncRigExport({
        source: ref(),
        metadataOut,
        partsOut,
        publicBase: 'assets/rig/walker/parts',
      }),
    ).toThrow(/export tutarsız/);
    expect(existsSync(metadataOut)).toBe(false);
  });
});

describe('auditShippedRig', () => {
  it('gönderilmiş metadata ile statik dizin arasındaki farkı bildirir', () => {
    writeExport(metadataFixture());
    const { metadataOut, partsOut } = outFilesFor();
    syncRigExport({ source: ref(), metadataOut, partsOut, publicBase: 'assets/rig/walker/parts' });

    expect(auditShippedRig(metadataOut, partsOut)).toEqual([]);

    rmSync(join(partsOut, 'arm.png'));
    expect(auditShippedRig(metadataOut, partsOut)).toEqual(['arm']);
  });

  function outFilesFor() {
    return {
      metadataOut: join(root, 'game/src/assets/rig/walker.metadata.json'),
      partsOut: join(root, 'game/public/assets/rig/walker/parts'),
    };
  }
});
