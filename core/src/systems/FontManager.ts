import { TECH } from '../constants';

export interface FontFaceSpec {
  family: string;
  source: string;
  weight?: string;
  style?: 'normal' | 'italic';
  display?: 'swap' | 'block' | 'fallback' | 'optional';
}

export interface LoadedFont {
  family: string;
  weight: string;
  style: 'normal' | 'italic';
  status: 'loaded' | 'error';
}

export interface FontManagerOptions {
  fonts: FontFaceSpec[];
  timeoutMs?: number;
}

/** Phaser başlamadan önce fontları FontFace API ile yükler; yükleme tamamlanmadan oyun başlatılmaz. */
export class FontManager {
  private readonly specs: FontFaceSpec[];
  private readonly timeoutMs: number;

  constructor(options: FontManagerOptions) {
    this.specs = options.fonts;
    this.timeoutMs = options.timeoutMs ?? TECH.FONT_LOAD_TIMEOUT;
  }

  async load(): Promise<LoadedFont[]> {
    const results: LoadedFont[] = [];
    // face+spec bir arada tutulur — index tabanlı eşleştirme, atlanan (zaten-yüklü) öğeler yüzünden kayardı.
    const pending: { face: FontFace; spec: FontFaceSpec }[] = [];

    for (const spec of this.specs) {
      // Aynı aile/weight/style zaten yüklüyse tekrar yüklemek document.fonts'te kopya yaratır.
      if (this.isAlreadyLoaded(spec)) {
        results.push({
          family: spec.family,
          weight: spec.weight ?? 'normal',
          style: spec.style ?? 'normal',
          status: 'loaded',
        });
        continue;
      }

      const face = new FontFace(spec.family, `url('${spec.source}')`, {
        weight: spec.weight ?? 'normal',
        style: spec.style ?? 'normal',
        display: spec.display ?? 'swap',
      });
      document.fonts.add(face);
      pending.push({ face, spec });
    }

    await Promise.all(pending.map(({ face, spec }) => this.loadOne(face, spec, results)));

    return results;
  }

  private isAlreadyLoaded(spec: FontFaceSpec): boolean {
    if (!('fonts' in document)) return false;
    for (const face of document.fonts as unknown as Iterable<FontFace>) {
      if (
        face.family === spec.family &&
        face.weight === (spec.weight ?? 'normal') &&
        face.style === (spec.style ?? 'normal') &&
        face.status === 'loaded'
      ) {
        return true;
      }
    }
    return false;
  }

  private async loadOne(face: FontFace, spec: FontFaceSpec, results: LoadedFont[]): Promise<void> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<void>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('FontFace load timeout')), this.timeoutMs);
    });

    // face.load() timeout'a yenik düşerse, sonradan reject olduğunda rejection
    // "unhandled" kalır. Promise referansı saklanır: timeout kazanırsa catch
    // bloğunda faceLoad.catch(() => {}) ile geç rejection yutulur. face.load()
    // önce reject ederse rejection race'e yayılır ve catch bloğu çalışır —
    // faceLoad.catch tekrar çağrılsa da zararsızdır (zaten settled).
    const faceLoad = face.load();

    try {
      await Promise.race([faceLoad, timeout]);
      results.push({
        family: spec.family,
        weight: spec.weight ?? 'normal',
        style: spec.style ?? 'normal',
        status: 'loaded',
      });
    } catch {
      // Timeout kazandıysa face.load() hala pending olabilir — geç rejection'ı yut.
      faceLoad.catch(() => {});
      console.warn(`[FontManager] Font yüklenemedi: ${spec.family} / ${spec.source}`);
      document.fonts.delete(face);
      results.push({
        family: spec.family,
        weight: spec.weight ?? 'normal',
        style: spec.style ?? 'normal',
        status: 'error',
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  ready(): Promise<FontFaceSet> {
    return document.fonts.ready;
  }
}
