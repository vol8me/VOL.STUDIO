#!/usr/bin/env tsx
/**
 * Bir entity export'unu doğrular ve tüketici paketin sahipliğine kopyalar.
 *
 * Kullanım:
 *   tsx scripts/sync-rig.ts <domain> <entityId> <metadataOut> <partsOut> <publicBase>
 *
 * Örnek (bir oyunun kendi package.json'ından):
 *   tsx ../../devtools/pen.dev/scripts/sync-rig.ts enemies arachnid \
 *     src/assets/rig/arachnid.metadata.json public/assets/rig/arachnid/parts \
 *     assets/rig/arachnid/parts
 */
import { resolve } from 'node:path';
import { syncRigExport } from '../src/rigExport';

const [, , domain, entityId, metadataOut, partsOut, publicBase] = process.argv;

if (!domain || !entityId || !metadataOut || !partsOut || !publicBase) {
  console.error(
    'Kullanım: tsx sync-rig.ts <domain> <entityId> <metadataOut> <partsOut> <publicBase>',
  );
  process.exit(1);
}

const report = syncRigExport({
  source: {
    exportRoot: resolve(import.meta.dirname, '../pen_export'),
    domain,
    entityId,
  },
  metadataOut: resolve(process.cwd(), metadataOut),
  partsOut: resolve(process.cwd(), partsOut),
  publicBase,
});

console.log(
  `[pen.dev] ${report.entityId}: ${report.copied.length} parça gönderildi` +
    (report.removed.length > 0 ? `, ${report.removed.length} fazlalık silindi` : ''),
);
console.log(`  metadata → ${report.metadataOut}`);
console.log(`  parçalar → ${report.partsOut}`);
