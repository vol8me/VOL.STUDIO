/**
 * V1 negatif kontrol özetinin şeması (F2). Betik ve test AYNI doğrulayıcıyı
 * kullanır; şemayı iki yerde yazmak sessiz ayrışma üretirdi.
 *
 * Özet İKİ KOL taşır: reddedilen triangular kernel ve üretim kerneli. Tek kol
 * yazan bir negatif kontrol "kötü sonuç" gösterir ama karşılaştıracak bir şey
 * vermez; iki kol AYNI tohumlarda, aynı ölçüm hattından geçer.
 */
export interface NegativeControlSeed {
  readonly seed: number;
  readonly retention: number;
  readonly clusteredFraction: number;
  readonly meanSpeed: number;
  readonly primaryReason: string;
}

export interface NegativeControlArm {
  readonly kernel: string;
  readonly seedler: readonly NegativeControlSeed[];
  readonly medyanKoruma: number;
  readonly medyanKümeliMadde: number;
  readonly gerekçeDağılımı: Readonly<Record<string, number>>;
}

export interface NegativeControlSummary {
  readonly schemaVersion: 2;
  readonly madde: 'F2';
  readonly tarih: string;
  readonly candidateDigest: string;
  readonly tickCount: number;
  readonly sampleInterval: number;
  readonly seedCount: number;
  readonly süreMs: number;
  /** Reddedilen V1 kerneli. */
  readonly kontrol: NegativeControlArm;
  /** Üretim kerneli; aynı aday, aynı tohumlar. */
  readonly referans: NegativeControlArm;
}

export function validateNegativeControlSummary(value: unknown): NegativeControlSummary {
  const raw = value as Record<string, unknown>;
  if (raw?.schemaVersion !== 2) throw new RangeError('Negatif kontrol şeması v2 olmalı.');
  if (raw.madde !== 'F2') throw new RangeError('Özet F2 maddesine ait olmalı.');
  if (typeof raw.candidateDigest !== 'string' || !/^[0-9a-f]{16}$/.test(raw.candidateDigest)) {
    throw new RangeError('Aday digest’i 16 haneli onaltılık olmalı.');
  }
  if (typeof raw.tickCount !== 'number' || raw.tickCount <= 0) {
    throw new RangeError('Tick sayısı pozitif olmalı.');
  }
  const control = validateArm(raw.kontrol, 'kontrol');
  const reference = validateArm(raw.referans, 'referans');
  // İki kol AYNI tohumlarda koşmalı; farklı tohumlar karşılaştırmayı geçersiz kılar.
  const controlSeeds = control.seedler.map((entry) => entry.seed).join(',');
  const referenceSeeds = reference.seedler.map((entry) => entry.seed).join(',');
  if (controlSeeds !== referenceSeeds) {
    throw new RangeError('Kontrol ve referans kolları aynı tohumlarda koşmalı.');
  }
  return raw as unknown as NegativeControlSummary;
}

function validateArm(value: unknown, label: string): NegativeControlArm {
  const raw = value as Record<string, unknown>;
  if (!raw || typeof raw.kernel !== 'string' || raw.kernel.length === 0) {
    throw new RangeError(`${label}: kernel adı zorunlu.`);
  }
  if (!Array.isArray(raw.seedler) || raw.seedler.length === 0) {
    throw new RangeError(`${label}: en az bir seed taşımalı.`);
  }
  for (const entry of raw.seedler as Record<string, unknown>[]) {
    for (const field of ['retention', 'clusteredFraction', 'meanSpeed'] as const) {
      if (typeof entry[field] !== 'number' || !Number.isFinite(entry[field] as number)) {
        throw new RangeError(`${label}: seed alanı sonlu sayı olmalı (${field}).`);
      }
    }
    if (typeof entry.primaryReason !== 'string') {
      throw new RangeError(`${label}: seed gerekçe kodu taşımalı.`);
    }
  }
  return raw as unknown as NegativeControlArm;
}
