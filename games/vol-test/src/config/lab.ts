/** Ajan laboratuvarının (`window.volLab`) sayıları; yalnız `?lab=1` ile açılır. */
export const LAB = {
  /** Telemetri halkası: en çok bu kadar örnek tutulur, eskisi ezilir (bellek sınırlıdır). */
  telemetryCapacity: 600,
  /** Olay halkası: en çok bu kadar kayıt. */
  eventCapacity: 400,
  /** İki telemetri örneği arası en az süre (ms, sahne saati). */
  sampleMs: 250,
  /** `telemetry`/`events` komutlarının varsayılan ve en büyük satır sayısı. */
  defaultCount: 40,
  maxCount: 600,
} as const;
