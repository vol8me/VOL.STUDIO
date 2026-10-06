#!/usr/bin/env node
// Ham Pencil `Export()` çıktısını entity düzenine taşır ve metadata yazar.
// Manifest sözleşmesi ve `parent` / `positionPx` kuralları: ../DESIGN.md
//
//   node organize-pen-export.mjs <manifest.json> <stagingDir> [outputRoot]
import {
  copyFileSync,
  existsSync,
  linkSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PART_ID_PATTERN = /^[a-z0-9][a-z0-9_]*$/;
// Pencil düğüm kimliği dosya adı olur: ayraç, sürücü iki noktası ve nokta
// bileşenleri yolu kaçırır ya da başka dosyaya bağlar.
const NODE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

let tempCounter = 0;
const [, , manifestPath, stagingDir, outputRootArg] = process.argv;

if (!manifestPath || !stagingDir) {
  fail('Kullanım: node organize-pen-export.mjs <manifest.json> <stagingDir> [outputRoot]');
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..', '..', '..');
const outputRoot = resolve(outputRootArg ?? join(scriptDir, '..', 'exported'));

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

// Parça ve önizleme TEK plandır: kaynak PNG'ler birlikte doğrulanır, sonra
// hiçbir kaynak silinmeden önce bütün hedefler yerleşir. Bir hata kaynağı
// tüketmez ve yarım hedef bırakmaz.
const partPlan = planMoves(manifest.parts, join(entityRoot, 'parts'), 'parça');
const previewPlan = planMoves(manifest.previews, join(entityRoot, 'previews'), 'önizleme');
rejectSharedSources([...partPlan.moves, ...previewPlan.moves]);

const parts = partPlan.moves.map(({ item, dest }) => ({ ...item, file: dest }));
const previews = previewPlan.moves.map(({ item, dest }) => ({ ...item, file: dest }));

const metadataPath = join(entityRoot, 'metadata', `${entityId}.metadata.json`);
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

const moves = [...partPlan.moves, ...previewPlan.moves];
try {
  placeAll(moves, metadataPath, JSON.stringify(metadata, null, 2) + '\n');
} catch (error) {
  fail(`export yerleştirilemedi, önceki hedef geri yüklendi: ${error.message}`);
}

for (const { item, dest } of moves) console.log(`  ${item.id}.png -> ${dest}`);
console.log(`  yazıldı: ${metadataPath}`);

// Kaynaklar yalnız her hedef yerleştikten SONRA silinir.
for (const { src } of moves) unlinkSync(src);
if (existsSync(stagingDir)) {
  rmSync(stagingDir, { recursive: true, force: true });
  console.log(`  staging dizini temizlendi: ${stagingDir}`);
}

console.log(`Bitti: ${parts.length} parça, ${previews.length} önizleme -> ${entityRoot}`);

/**
 * Bir listenin taşıma planını doğrular. Eksik dosya, tekrar eden ya da
 * kurala uymayan partId sessizce geçilmez: hatası fark edilmeyen bir rig,
 * hiç üretilmemiş olandan kötüdür. Hiçbir dosyaya dokunmaz.
 */
function planMoves(list, targetDir, label) {
  if (!list?.length) return { targetDir, moves: [] };

  const moves = [];
  const seen = new Set();

  for (const item of list) {
    if (!PART_ID_PATTERN.test(item.partId ?? '')) {
      fail(`partId lowercase snake_case olmalı (gelen: "${item.partId}")`);
    }
    if (typeof item.id !== 'string' || !NODE_ID_PATTERN.test(item.id)) {
      fail(`"${item.partId}" ${label}nın düğüm kimliği geçersiz (gelen: "${item.id}")`);
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

/**
 * Aynı kaynak PNG iki hedefe yazılamaz: ilk taşıma kaynağı tüketirdi ve
 * ikincisi yarım hedef bırakarak düşerdi. Ayrıca iki parçanın aynı Pencil
 * düğümünü iddia etmesi metadata kökenini belirsizleştirir; yazımdan önce
 * reddedilir.
 */
function rejectSharedSources(all) {
  const owners = new Map();
  for (const { item } of all) {
    const owner = owners.get(item.id);
    if (owner) {
      fail(
        `düğüm "${item.id}" hem "${owner}" hem "${item.partId}" tarafından kullanılıyor; ` +
          `bir kaynak PNG iki hedefe yazılamaz`,
      );
    }
    owners.set(item.id, item.partId);
  }
}

/**
 * Bütün hedefleri ve metadata'yı bir birim olarak yerleştirir. Önce hepsi
 * hedefin yanında geçici adla hazırlanır (kaynak dokunulmadan kalır), sonra
 * mevcut hedefler sabit bağla ayrılıp geçici dosyalar rename ile yerine geçer.
 * Herhangi bir adım düşerse yerleşenler geri alınır: eski hedef eski hâlinde,
 * yeni olan yoksa silinir. Geçici ve yedek dosyalar her durumda temizlenir.
 */
function placeAll(plan, metadataTarget, metadataText) {
  const entries = [
    ...plan.map(({ src, dest }) => ({ kind: 'copy', src, dest })),
    { kind: 'text', text: metadataText, dest: metadataTarget },
  ];
  const staged = [];
  const previous = new Map();
  const placed = [];
  try {
    for (const entry of entries) {
      mkdirSync(dirname(entry.dest), { recursive: true });
      const temp = tempName(entry.dest);
      staged.push(temp);
      if (entry.kind === 'copy') copyFileSync(entry.src, temp);
      else writeFileSync(temp, entry.text);
      entry.temp = temp;
    }
    for (const { dest } of entries) {
      if (!existsSync(dest)) continue;
      const keep = tempName(dest);
      linkSync(dest, keep);
      previous.set(dest, keep);
    }
    for (const { temp, dest } of entries) {
      renameSync(temp, dest);
      placed.push(dest);
    }
  } catch (error) {
    for (const dest of placed.reverse()) {
      const keep = previous.get(dest);
      if (keep) renameSync(keep, dest);
      else rmSync(dest, { force: true });
    }
    throw error;
  } finally {
    for (const temp of staged) rmSync(temp, { force: true });
    for (const keep of previous.values()) rmSync(keep, { force: true });
  }
}

/** Hedefin yanında benzersiz geçici ad. */
function tempName(target) {
  return `${target}.tmp-${process.pid}-${++tempCounter}`;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
