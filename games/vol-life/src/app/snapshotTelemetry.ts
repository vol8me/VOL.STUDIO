/**
 * Kayıt yolu ölçümü (Z2). `performance.mark`/`measure` ile UYGULAMA İÇİNDE
 * ölçer: sentetik bir sayfa değil, gerçek dünya durumunun gerçek kodek yolu.
 *
 * Ölçüm YALNIZ geliştirmede kurulur; üretim derlemesinde ne kanca ne de
 * işaretler bulunur (yokluk testiyle kanıtlı).
 */
export interface SnapshotMeasurement {
  /** Ham binary boyutu (bayt). */
  readonly rawBytes: number;
  /** Depolamaya giden metnin uzunluğu (karakter). */
  readonly encodedChars: number;
  readonly encoding: string;
  /** Kodlama süresi (ms), `performance.measure` ile. */
  readonly encodeMs: number;
  /** Ölçüm ortamı; raporda satırın hangi cihaza ait olduğunu söyler. */
  readonly userAgent: string;
}

export const SNAPSHOT_MARK_START = 'vol-life:snapshot-encode:start';
export const SNAPSHOT_MARK_END = 'vol-life:snapshot-encode:end';
export const SNAPSHOT_MEASURE = 'vol-life:snapshot-encode';

export interface SnapshotEncodeResult {
  readonly byteLength: number;
  readonly payload: string;
  readonly encoding: string;
}

/**
 * Kodlamayı ölçerek koşar. Süre `performance.measure`dan OKUNUR; iki
 * `Date.now()` farkı almak, tarayıcının kendi zaman çizelgesiyle
 * karşılaştırılamayan bir sayı üretirdi.
 */
export async function measureSnapshotEncode(
  encode: () => Promise<SnapshotEncodeResult>,
): Promise<SnapshotMeasurement> {
  performance.mark(SNAPSHOT_MARK_START);
  const envelope = await encode();
  performance.mark(SNAPSHOT_MARK_END);
  const measure = performance.measure(SNAPSHOT_MEASURE, SNAPSHOT_MARK_START, SNAPSHOT_MARK_END);
  return {
    rawBytes: envelope.byteLength,
    encodedChars: envelope.payload.length,
    encoding: envelope.encoding,
    encodeMs: measure.duration,
    userAgent: typeof navigator === 'undefined' ? 'bilinmiyor' : navigator.userAgent,
  };
}
