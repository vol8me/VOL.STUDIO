import { encodeLifeWorldSnapshot } from '@/app/LifeWorldSnapshotCodec';
import { measureSnapshotEncode, type SnapshotMeasurement } from '@/app/snapshotTelemetry';
import type { LifeWorldSnapshot } from '@/runtime/sim/LifeWorld';

/**
 * Kayıt yolu ölçüm kancası (Z2). YALNIZ geliştirmede kurulur ve GERÇEK dünya
 * durumunu gerçek kodekten geçirir; sentetik bir örnek, alan dizilerinin
 * baskın terim olduğu bir kayıtta yanlış sayı verirdi.
 *
 * Kanca ölçümü DÖNDÜRÜR, kaydetmez: ölçüm oyuncunun kaydına dokunmaz.
 */
export interface SnapshotProbeHost {
  __volLifeStorage?: { measure: () => Promise<SnapshotMeasurement> };
}

export function installSnapshotProbe(
  source: { snapshot(): LifeWorldSnapshot },
  configFingerprint: string,
  host: SnapshotProbeHost = window as unknown as SnapshotProbeHost,
): () => void {
  host.__volLifeStorage = {
    measure: () =>
      measureSnapshotEncode(async () => {
        const envelope = await encodeLifeWorldSnapshot(source.snapshot(), configFingerprint);
        return {
          byteLength: envelope.byteLength,
          payload: envelope.payload,
          encoding: envelope.encoding,
        };
      }),
  };
  return () => {
    delete host.__volLifeStorage;
  };
}
