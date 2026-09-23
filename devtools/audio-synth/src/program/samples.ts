import { AudioParamError } from '../guard/errors';
import { checkNumber, checkObject, checkSampleRate } from '../guard/read';
import { checkName } from './names';

/**
 * Programın kullandığı kayıtlı ses verileri (sample, IR). Program JSON'dur ve
 * saf kalır: veri programa gömülmez, İÇERİK ÖZETİYLE bildirilir. Render'a
 * bir çözücü enjekte edilir (protokol diskten okur ve özeti doğrular; testler
 * bellekten verir); bildirimle uyuşmayan veri render'dan önce reddedilir.
 * Kare/oran/kanal bildirimi maliyetin veri yüklenmeden hesaplanmasını sağlar.
 */
export const MAX_SAMPLE_FRAMES = 48000 * 120;

export interface SampleDeclV1 {
  /** Kütüphane kimliği (`audio-samples/<id>`). */
  readonly id: string;
  /** WAV baytlarının SHA-256 özeti (`sha256:<64 hex>`). */
  readonly hash: string;
  readonly sampleRate: number;
  readonly channels: 1 | 2;
  readonly frames: number;
}

export interface SampleData {
  readonly channels: readonly Float32Array[];
  readonly sampleRate: number;
}

/** Bildirimden veriyi getirir; protokol katmanı diskten, testler bellekten. */
export type SampleResolver = (decl: SampleDeclV1) => SampleData;

/** Düğümün gördüğü erişim: programdaki bildirilen ada göre çözülmüş veri. */
export type SampleAccess = (name: string) => SampleData;

const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const HASH = /^sha256:[0-9a-f]{64}$/;

export function resolveSampleDecls(value: unknown): Map<string, SampleDeclV1> {
  const out = new Map<string, SampleDeclV1>();
  if (value === undefined) return out;
  const record = checkObject(value, 'samples', Object.keys((value as object) ?? {}));
  const names = Object.keys(record).sort();
  if (names.length > 32)
    throw new AudioParamError('samples', 'range', 'en çok 32 sample', names.length);
  for (const name of names) {
    const path = `samples.${checkName(name, `samples.${name}`)}`;
    const o = checkObject(record[name], path, ['id', 'hash', 'sampleRate', 'channels', 'frames']);
    if (typeof o.id !== 'string' || !ID.test(o.id)) {
      throw new AudioParamError(`${path}.id`, 'type', ID.source, o.id);
    }
    if (typeof o.hash !== 'string' || !HASH.test(o.hash)) {
      throw new AudioParamError(`${path}.hash`, 'type', 'sha256:<64 hex>', o.hash);
    }
    if (o.channels !== 1 && o.channels !== 2) {
      throw new AudioParamError(`${path}.channels`, 'type', '1 ya da 2', o.channels);
    }
    out.set(name, {
      id: o.id,
      hash: o.hash,
      sampleRate: checkSampleRate(o.sampleRate, `${path}.sampleRate`),
      channels: o.channels,
      frames: checkNumber(o.frames, `${path}.frames`, {
        min: 1,
        max: MAX_SAMPLE_FRAMES,
        integer: true,
      }),
    });
  }
  return out;
}

/**
 * Bildirilen sample'lar için erişim kurar. Çözücü yoksa ya da veri
 * bildirimle (oran, kanal, kare) uyuşmazsa adlı hata verilir; her sample
 * render başına bir kez çözülür.
 */
export function sampleAccess(
  decls: ReadonlyMap<string, SampleDeclV1>,
  resolver: SampleResolver | undefined,
): SampleAccess | undefined {
  if (decls.size === 0) return undefined;
  const cache = new Map<string, SampleData>();
  return (name) => {
    const hit = cache.get(name);
    if (hit) return hit;
    const decl = decls.get(name);
    if (!decl)
      throw new AudioParamError(`samples.${name}`, 'unknown-id', 'bildirilmemiş sample', name);
    if (!resolver) {
      const detail = 'render bir sample çözücüsü ister (protokol ya da test)';
      throw new AudioParamError(`samples.${name}`, 'required', detail, decl.id);
    }
    const data = resolver(decl);
    const frames = data.channels[0]?.length ?? 0;
    if (
      data.sampleRate !== decl.sampleRate ||
      data.channels.length !== decl.channels ||
      frames !== decl.frames ||
      data.channels.some((c) => c.length !== frames)
    ) {
      const detail = `çözülen veri bildirimle uyuşmuyor (${data.sampleRate} Hz, ${data.channels.length} kanal, ${frames} kare)`;
      throw new AudioParamError(`samples.${name}`, 'combination', detail, decl.id);
    }
    cache.set(name, data);
    return data;
  };
}
