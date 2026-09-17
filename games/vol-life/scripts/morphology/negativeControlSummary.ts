/**
 * V1 negatif kontrol özetinin şeması (F2). Betik ve test AYNI doğrulayıcıyı
 * kullanır; şemayı iki yerde yazmak sessiz ayrışma üretirdi.
 */
export interface NegativeControlSeed {
  readonly seed: number;
  readonly retention: number;
  readonly clusteredFraction: number;
  readonly meanSpeed: number;
  readonly primaryReason: string;
}

export interface NegativeControlSummary {
  readonly schemaVersion: 1;
  readonly madde: 'F2';
  readonly tarih: string;
  readonly kernel: string;
  readonly candidateDigest: string;
  readonly tickCount: number;
  readonly sampleInterval: number;
  readonly seedCount: number;
  readonly süreMs: number;
  readonly seedler: readonly NegativeControlSeed[];
  readonly medyanKoruma: number;
  readonly medyanKümeliMadde: number;
  readonly gerekçeDağılımı: Readonly<Record<string, number>>;
}

export function validateNegativeControlSummary(value: unknown): NegativeControlSummary {
  const raw = value as Record<string, unknown>;
  if (raw?.schemaVersion !== 1) throw new RangeError('Negatif kontrol şeması v1 olmalı.');
  if (raw.madde !== 'F2') throw new RangeError('Özet F2 maddesine ait olmalı.');
  if (typeof raw.candidateDigest !== 'string' || !/^[0-9a-f]{16}$/.test(raw.candidateDigest)) {
    throw new RangeError('Aday digest’i 16 haneli onaltılık olmalı.');
  }
  if (!Array.isArray(raw.seedler) || raw.seedler.length === 0) {
    throw new RangeError('Özet en az bir seed taşımalı.');
  }
  for (const entry of raw.seedler as Record<string, unknown>[]) {
    for (const field of ['retention', 'clusteredFraction', 'meanSpeed'] as const) {
      if (typeof entry[field] !== 'number' || !Number.isFinite(entry[field] as number)) {
        throw new RangeError(`Seed alanı sonlu sayı olmalı: ${field}`);
      }
    }
    if (typeof entry.primaryReason !== 'string') {
      throw new RangeError('Seed gerekçe kodu taşımalı.');
    }
  }
  if (typeof raw.tickCount !== 'number' || raw.tickCount <= 0) {
    throw new RangeError('Tick sayısı pozitif olmalı.');
  }
  return raw as unknown as NegativeControlSummary;
}
