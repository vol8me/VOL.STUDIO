#!/usr/bin/env node
// Ham Pencil `Export()` çıktısını entity düzenine taşır ve metadata yazar.
// Manifest sözleşmesi ve `parent` / `positionPx` kuralları: ../DESIGN.md
//
//   node organize-pen-export.mjs <manifest.json> <stagingDir> [outputRoot]
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PART_ID_PATTERN = /^[a-z0-9][a-z0-9_]*$/;

const [, , manifestPath, stagingDir, outputRootArg] = process.argv;

if (!manifestPath || !stagingDir) {
  fail('Kullanım: node organize-pen-export.mjs <manifest.json> <stagingDir> [outputRoot]');
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..', '..', '..');
const outputRoot = resolve(outputRootArg ?? join(scriptDir, '..', 'pen_export'));

// metadata'daki `file` alanları repo köküne göreli yazılır; repo dışına çıkan
// bir çıktı kökü bunları `../../..` ile başlayan taşınamaz yollara çevirirdi.
const outputRootFromRepo = relative(repoRoot, outputRoot);
if (outputRootFromRepo.startsWith('..') || isAbsolute(outputRootFromRepo)) {
  fail(`outputRoot repo içinde olmalı (gelen: ${outputRoot})`);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const {
  entityId,
  domain,
  sourcePenFile,
  sourceSheetNodeId,
  sourceSheetName,
  exportScale,
  rootSizePx,
} = manifest;

if (!entityId || !domain) {
  fail('Manifest entityId ve domain alanlarını belirtmeli');
}
if (!PART_ID_PATTERN.test(entityId) || !PART_ID_PATTERN.test(domain)) {
  fail(`entityId ve domain lowercase snake_case olmalı (gelen: "${entityId}", "${domain}")`);
}

const resolvedExportScale = exportScale ?? 2;
if (!Number.isFinite(resolvedExportScale) || resolvedExportScale <= 0) {
  fail(`exportScale pozitif bir sayı olmalı (gelen: ${exportScale})`);
}

const entityRoot = join(outputRoot, domain, entityId);

console.log(`${domain}/${entityId} export'u düzenleniyor`);

// Önce tüm manifest doğrulanır, sonra tek bir dosya bile kopyalanır: bir
// hata yarım taşınmış bir çıktı bırakmasın.
const partPlan = planMoves(manifest.parts, join(entityRoot, 'parts'));
const previewPlan = planMoves(manifest.previews, join(entityRoot, 'previews'));

const parts = executeMoves(partPlan);
const previews = executeMoves(previewPlan);

const metadataDir = join(entityRoot, 'metadata');
mkdirSync(metadataDir, { recursive: true });

const metadata = {
  schemaVersion: 1,
  entityId,
  domain,
  source: {
    penFile: sourcePenFile,
    sheetNodeId: sourceSheetNodeId,
    sheetNodeName: sourceSheetName,
    exportScale: resolvedExportScale,
    rootSizePx: rootSizePx ?? null,
  },
  parts: parts.map(
    ({ id, partId, parent, type, width, height, x, y, rotation, category, file }) => ({
      partId,
      sourceNodeId: id,
      shapeType: type,
      category: category ?? null,
      logicalSizePx: { width, height },
      positionPx: x !== undefined && y !== undefined ? { x, y } : null,
      rotationDeg: rotation ?? 0,
      parentPartId: parent ?? null,
      file: relative(repoRoot, file),
    }),
  ),
  previews: previews.map(({ id, partId, width, height, file }) => ({
    partId,
    sourceNodeId: id,
    logicalSizePx: { width, height },
    file: relative(repoRoot, file),
  })),
};

const metadataPath = join(metadataDir, `${entityId}.metadata.json`);
writeFileSync(metadataPath, JSON.stringify(metadata, null, 2) + '\n');
console.log(`  yazıldı: ${metadataPath}`);

if (existsSync(stagingDir)) {
  rmSync(stagingDir, { recursive: true, force: true });
  console.log(`  staging dizini temizlendi: ${stagingDir}`);
}

console.log(`Bitti: ${parts.length} parça, ${previews.length} önizleme -> ${entityRoot}`);

/**
 * Taşıma planını doğrular. Eksik dosya, tekrar eden ya da kurala uymayan
 * partId sessizce geçilmez: hatası fark edilmeyen bir rig, hiç üretilmemiş
 * olandan kötüdür.
 */
function planMoves(list, targetDir) {
  if (!list?.length) return { targetDir, moves: [] };

  const moves = [];
  const seen = new Set();

  for (const item of list) {
    if (!PART_ID_PATTERN.test(item.partId ?? '')) {
      fail(`partId lowercase snake_case olmalı (gelen: "${item.partId}")`);
    }
    if (seen.has(item.partId)) {
      fail(`"${item.partId}" partId'si manifest içinde birden fazla kez var`);
    }
    // Eklem (articulation) doğrulaması: ebeveyn manifestte VAR OLMALI ve bu
    // parçadan ÖNCE gelmelidir. Sıra aynı zamanda rig ağacının kuruluş
    // sırasıdır; sonra gelen bir ebeveyn `assembleRig`te henüz kurulmamış bir
    // container'a bağlanmaya çalışırdı. `seen` zaten "önce gelenler" kümesi
    // olduğu için ileri referans ve döngü aynı kontrole takılır.
    if (item.parent !== undefined && item.parent !== null) {
      if (item.parent === item.partId) {
        fail(`"${item.partId}" parçası kendi ebeveyni olamaz`);
      }
      if (!seen.has(item.parent)) {
        fail(
          `"${item.partId}" parçasının ebeveyni "${item.parent}" manifestte ondan SONRA ` +
            `geliyor ya da hiç yok. Ebeveyn önce tanımlanmalıdır.`,
        );
      }
    }

    seen.add(item.partId);

    const src = join(stagingDir, `${item.id}.png`);
    if (!existsSync(src)) {
      fail(`staging dosyası eksik - ${item.partId} (${item.id}): ${src}`);
    }

    moves.push({ item, src, dest: join(targetDir, `${item.partId}.png`) });
  }

  return { targetDir, moves };
}

function executeMoves({ targetDir, moves }) {
  if (!moves.length) return [];

  mkdirSync(targetDir, { recursive: true });

  return moves.map(({ item, src, dest }) => {
    copyFileSync(src, dest);
    unlinkSync(src);
    console.log(`  ${item.id}.png -> ${dest}`);
    return { ...item, file: dest };
  });
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
