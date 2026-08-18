import type { RigMetadata } from './types';

/**
 * `.metadata.json` için ÇALIŞMA ZAMANI doğrulaması.
 *
 * `RigMetadata` bir TypeScript arayüzü; derleme zamanında yardımcı olur ama
 * dosyadan okunan JSON hakkında hiçbir garanti vermez. Bugün metadata'yı
 * `organize-pen-export.mjs` üretiyor (güvenilir kaynak), ama bir agent ya da
 * dış araç ürettiğinde eksik alan/yanlış tip sessizce içeri girer: `parts`
 * yoksa `metadata.parts.map` bir `TypeError` fırlatır ve hata mesajı sorunun
 * NEREDE olduğunu söylemez.
 *
 * `zod` eklenmedi: tek tüketici için yeni bir çalışma zamanı bağımlılığı
 * taşımaya değmez ve bu şema, alan sayısı sabit olan küçük bir sözleşme.
 *
 * Hatalar TOPLANIR: bozuk bir dosyada tek tek düzeltip yeniden çalıştırmak
 * yerine eksiklerin tamamı bir kerede görülür.
 */
export function validateRigMetadata(raw: unknown, source = 'metadata'): RigMetadata {
  const problems: string[] = [];
  const root = requireObject(raw, source, problems);

  if (root) {
    if (root.schemaVersion !== 1) {
      problems.push(
        `schemaVersion 1 olmalı (gelen: ${describe(root.schemaVersion)}). ` +
          `Bu dosya farklı bir sürümle üretilmiş; okuyucu güncellenmeden kullanılamaz.`,
      );
    }
    requireString(root, 'entityId', problems);
    requireString(root, 'domain', problems);
    validateSource(root.source, problems);
    validateParts(root.parts, problems);

    if (root.previews !== undefined && !Array.isArray(root.previews)) {
      problems.push('previews bir dizi olmalı');
    }
  }

  if (problems.length > 0) {
    throw new Error(
      `${source}: metadata geçersiz (${problems.length} sorun)\n` +
        problems.map((problem) => `  - ${problem}`).join('\n'),
    );
  }

  return raw as RigMetadata;
}

function describe(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'dizi';
  return typeof value === 'object' ? 'nesne' : JSON.stringify(value);
}

function requireObject(
  value: unknown,
  label: string,
  problems: string[],
): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    problems.push(`${label} bir nesne olmalı (gelen: ${describe(value)})`);
    return null;
  }
  return value as Record<string, unknown>;
}

function requireString(host: Record<string, unknown>, key: string, problems: string[]): void {
  const value = host[key];
  if (typeof value !== 'string' || value.length === 0) {
    problems.push(`${key} boş olmayan bir metin olmalı (gelen: ${describe(value)})`);
  }
}

function requireFiniteNumber(
  host: Record<string, unknown>,
  key: string,
  label: string,
  problems: string[],
): void {
  const value = host[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    problems.push(`${label}.${key} sonlu bir sayı olmalı (gelen: ${describe(value)})`);
  }
}

function validateSize(value: unknown, label: string, problems: string[]): void {
  const size = requireObject(value, label, problems);
  if (!size) return;
  requireFiniteNumber(size, 'width', label, problems);
  requireFiniteNumber(size, 'height', label, problems);
}

function validatePoint(value: unknown, label: string, problems: string[]): void {
  const point = requireObject(value, label, problems);
  if (!point) return;
  requireFiniteNumber(point, 'x', label, problems);
  requireFiniteNumber(point, 'y', label, problems);
}

function validateSource(value: unknown, problems: string[]): void {
  const source = requireObject(value, 'source', problems);
  if (!source) return;

  requireString(source, 'penFile', problems);
  requireString(source, 'sheetNodeId', problems);
  requireString(source, 'sheetNodeName', problems);
  requireFiniteNumber(source, 'exportScale', 'source', problems);

  // rootSizePx BİLİNÇLİ olarak null olabilir: izole parça export'unda rig
  // yerleşimi yoktur. Nasıl kullanılacağına buildRigDefinition karar verir.
  if (source.rootSizePx !== null) {
    validateSize(source.rootSizePx, 'source.rootSizePx', problems);
  }
}

function validateParts(value: unknown, problems: string[]): void {
  if (!Array.isArray(value)) {
    problems.push(`parts bir dizi olmalı (gelen: ${describe(value)})`);
    return;
  }
  if (value.length === 0) {
    problems.push('parts boş — parçasız bir rig montajlanamaz');
    return;
  }

  value.forEach((entry, index) => {
    const label = `parts[${index}]`;
    const part = requireObject(entry, label, problems);
    if (!part) return;

    for (const key of ['partId', 'sourceNodeId', 'shapeType', 'file'] as const) {
      const field = part[key];
      if (typeof field !== 'string' || field.length === 0) {
        problems.push(`${label}.${key} boş olmayan bir metin olmalı (gelen: ${describe(field)})`);
      }
    }

    if (part.category !== null && typeof part.category !== 'string') {
      problems.push(
        `${label}.category metin ya da null olmalı (gelen: ${describe(part.category)})`,
      );
    }

    validateSize(part.logicalSizePx, `${label}.logicalSizePx`, problems);

    // positionPx null olabilir (hücre düzeninden izole edilmiş parça).
    if (part.positionPx !== null) {
      validatePoint(part.positionPx, `${label}.positionPx`, problems);
    }

    if (typeof part.rotationDeg !== 'number' || !Number.isFinite(part.rotationDeg)) {
      problems.push(
        `${label}.rotationDeg sonlu bir sayı olmalı (gelen: ${describe(part.rotationDeg)})`,
      );
    }
  });
}
