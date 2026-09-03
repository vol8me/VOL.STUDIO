import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { validateRigMetadata, type RigMetadata } from '@volstudio/core/rig/metadata';

/**
 * Bir entity export'unun adresi.
 *
 * Düzen `organize-pen-export.mjs`in yazdığı düzendir:
 * `<exportRoot>/<domain>/<entityId>/{parts,previews,metadata}`.
 */
export interface RigExportRef {
  /** `pen_export` kökü — mutlak ya da çağıranın cwd'sine göreli. */
  exportRoot: string;
  domain: string;
  entityId: string;
}

export interface RigExportPaths {
  entityDir: string;
  metadataFile: string;
  partsDir: string;
  previewsDir: string;
}

/** Bir export referansını mutlak dosya yollarına çevirir. */
export function resolveRigExportPaths(ref: RigExportRef): RigExportPaths {
  const entityDir = resolve(ref.exportRoot, ref.domain, ref.entityId);
  return {
    entityDir,
    metadataFile: join(entityDir, 'metadata', `${ref.entityId}.metadata.json`),
    partsDir: join(entityDir, 'parts'),
    previewsDir: join(entityDir, 'previews'),
  };
}

export interface RigExportAudit {
  entityId: string;
  metadataFile: string;
  partCount: number;
  /** Metadata'da yazılı ama diskte olmayan parça dosyaları. */
  missingParts: string[];
  /** `parts/` altında duran ama metadata'da geçmeyen dosyalar. */
  orphanParts: string[];
}

/**
 * Export'u okur ve metadata ile disk arasındaki farkı TOPLAR.
 *
 * Fırlatmaz: eksik ve yetim dosyaların tamamı bir kerede görülsün diye. Şeklin
 * kendisi bozuksa (`schemaVersion`, eksik alan) `validateRigMetadata` yine de
 * fırlatır — o bir fark değil, okunamayan bir dosyadır.
 */
export function auditRigExport(ref: RigExportRef): RigExportAudit {
  const paths = resolveRigExportPaths(ref);
  const metadata = readRigMetadata(paths.metadataFile);

  const expected = new Set(metadata.parts.map((part) => `${part.partId}.png`));
  const missingParts = [...expected]
    .filter((file) => !existsSync(join(paths.partsDir, file)))
    .sort();

  const onDisk = existsSync(paths.partsDir)
    ? readdirSync(paths.partsDir).filter((file) => file.endsWith('.png'))
    : [];
  const orphanParts = onDisk.filter((file) => !expected.has(file)).sort();

  return {
    entityId: metadata.entityId,
    metadataFile: paths.metadataFile,
    partCount: metadata.parts.length,
    missingParts,
    orphanParts,
  };
}

/**
 * Export'u doğrular ve metadata'yı döner; eksik/yetim dosya varsa fırlatır.
 *
 * Bu, export'un YAYIMLANABİLİR olduğunu söyleyen kapıdır: bir oyuna senkronlanan
 * her export önce buradan geçer. Yetim dosya da hatadır — silinmiş bir parça
 * diskte kalırsa bir sonraki okuyucu onu meşru sanır.
 */
export function verifyRigExport(ref: RigExportRef): RigMetadata {
  const audit = auditRigExport(ref);
  const problems: string[] = [];

  if (audit.missingParts.length > 0) {
    problems.push(`metadata'da yazılı ama diskte yok: ${audit.missingParts.join(', ')}`);
  }
  if (audit.orphanParts.length > 0) {
    problems.push(`diskte var ama metadata'da yok: ${audit.orphanParts.join(', ')}`);
  }
  if (problems.length > 0) {
    throw new Error(
      `${audit.entityId}: export tutarsız (${problems.length} sorun)\n` +
        problems.map((problem) => `  - ${problem}`).join('\n'),
    );
  }

  return readRigMetadata(audit.metadataFile);
}

export interface RigSyncRequest {
  source: RigExportRef;
  /** Metadata JSON'unun yazılacağı DOSYA — tüketicinin kaynak ağacında. */
  metadataOut: string;
  /** Parça PNG'lerinin yazılacağı DİZİN — tüketicinin statik asset kökünde. */
  partsOut: string;
  /**
   * Parçaların çalışma zamanında çözüleceği taban yol. Yazılan metadata'nın
   * `file` alanlarına bu önek girer; tüketici artık export ağacını değil
   * KENDİ asset yolunu görür.
   */
  publicBase: string;
}

export interface RigSyncReport {
  entityId: string;
  metadataOut: string;
  partsOut: string;
  /** Bu turda yazılan parça dosyaları. */
  copied: string[];
  /** Hedefte duran ama artık metadata'da olmayan, silinen dosyalar. */
  removed: string[];
}

/**
 * Doğrulanmış bir export'u tüketicinin sahipliğine kopyalar.
 *
 * Tüketici bundan sonra export ağacına bakmaz: metadata kendi kaynağında,
 * parçalar kendi statik asset kökündedir. `devtools/` silinse bile tüketicinin
 * build'i geçer — asset'in sahibi onu ÜRETEN araç değil, onu GÖNDEREN pakettir.
 *
 * `previews` yazılan metadata'dan DÜŞÜRÜLÜR: önizleme bir yazarlık referansıdır,
 * çalışma zamanı yükü değil.
 *
 * Hedefteki fazlalıklar silinir. Yeniden adlandırılmış bir parça, eskisi
 * kalırsa hem bundle'ı şişirir hem bir sonraki okuyucuyu yanıltır.
 */
export function syncRigExport(request: RigSyncRequest): RigSyncReport {
  const metadata = verifyRigExport(request.source);
  const paths = resolveRigExportPaths(request.source);
  const base = request.publicBase.replace(/\/+$/, '');

  mkdirSync(request.partsOut, { recursive: true });
  mkdirSync(dirname(request.metadataOut), { recursive: true });

  const copied: string[] = [];
  const parts = metadata.parts.map((part) => {
    const file = `${part.partId}.png`;
    copyFileSync(join(paths.partsDir, file), join(request.partsOut, file));
    copied.push(file);
    return { ...part, file: `${base}/${file}` };
  });

  const keep = new Set(copied);
  const removed = readdirSync(request.partsOut)
    .filter((file) => file.endsWith('.png') && !keep.has(file))
    .sort();
  for (const file of removed) rmSync(join(request.partsOut, file));

  const shipped: RigMetadata = { ...metadata, parts, previews: [] };
  writeFileSync(request.metadataOut, `${JSON.stringify(shipped, null, 2)}\n`, 'utf8');

  return {
    entityId: metadata.entityId,
    metadataOut: request.metadataOut,
    partsOut: request.partsOut,
    copied,
    removed,
  };
}

/**
 * Gönderilmiş bir metadata'nın her parçasının diskte karşılığı var mı?
 *
 * Senkron sonrası tüketici tarafında koşar. `import.meta.glob` bırakıldığında
 * kaybedilen DERLEME ZAMANI garantisinin karşılığıdır: eksik bir PNG artık
 * derlemede değil, bu kapıda görülür.
 */
export function auditShippedRig(metadataFile: string, partsDir: string): string[] {
  const metadata = readRigMetadata(metadataFile);
  return metadata.parts
    .filter((part) => !existsSync(join(partsDir, basename(part.file))))
    .map((part) => part.partId)
    .sort();
}

function readRigMetadata(metadataFile: string): RigMetadata {
  if (!existsSync(metadataFile) || !statSync(metadataFile).isFile()) {
    throw new Error(`metadata bulunamadı: ${metadataFile}`);
  }
  return validateRigMetadata(JSON.parse(readFileSync(metadataFile, 'utf8')), metadataFile);
}
