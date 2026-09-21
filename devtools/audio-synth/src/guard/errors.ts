/**
 * Parametre sorununun türü. Çağıran mesajı ayrıştırmadan sınıflandırabilsin:
 * `non-finite` NaN/Infinity, `type` yanlış JS tipi ya da bilinmeyen seçenek,
 * `range` belgelenmiş aralığın dışı, `combination` tek başına geçerli ama
 * birlikte anlamsız alanlar, `unknown-key` yazım hatası kuşkulu alan,
 * `required` eksik zorunlu alan.
 */
export type AudioParamIssue =
  | 'non-finite'
  | 'type'
  | 'range'
  | 'combination'
  | 'unknown-key'
  | 'required';

function describeValue(value: unknown): string {
  if (typeof value === 'number' || typeof value === 'boolean' || value == null) {
    return String(value);
  }
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `dizi(${value.length})`;
  return typeof value;
}

/**
 * Sentez parametresi sınırda reddedildi. `path` bozuk alanı tam yoluyla
 * gösterir (`reverb.decay`, `lfos[1].rate`, `lowpass.envelope.attack`); hata
 * DSP tamponu ayrılmadan fırlatılır.
 */
export class AudioParamError extends Error {
  readonly path: string;
  readonly issue: AudioParamIssue;
  readonly value: unknown;

  constructor(path: string, issue: AudioParamIssue, detail: string, value: unknown) {
    super(`${path}: ${detail} (değer: ${describeValue(value)})`);
    this.name = 'AudioParamError';
    this.path = path;
    this.issue = issue;
    this.value = value;
  }
}
