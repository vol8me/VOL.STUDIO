import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface ArtifactCacheOptions {
  /** Repo DIŞINDA, platforma uygun cache kökü. */
  directory: string;
  /** Aynı kök altında artefakt türlerini ayıran alt dizin. */
  namespace: string;
  onError?: (error: unknown) => void;
}

// Anahtar doğrudan dosya adına girer: yol ayracı, `..` ve NUL taşıyamaz.
const KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

/**
 * İçerik hash'iyle anahtarlanan, repo dışında yaşayan kalıcı artefakt cache'i.
 *
 * Anahtar varlığın revision'ı (SHA-256) olduğu için girdi değiştiğinde anahtar
 * da değişir: geçersiz kılma (invalidation) ayrı bir mekanizma gerektirmez,
 * eski girdi yalnız erişilmez olur.
 *
 * Cache bir hızlandırma katmanıdır, doğruluk kaynağı değildir: disk hatası
 * isteği düşürmez, `onError` ile raporlanıp artefakt yeniden üretilir. Bu
 * yüzden okuma/yazma hataları bilinçli olarak yutulur.
 *
 * Aynı anahtar için eşzamanlı istekler tek üretimde birleştirilir; katalog
 * açılışında aynı thumbnail'i isteyen onlarca kart tek Sharp işine iner.
 */
export class ArtifactCache {
  readonly #directory: string;
  readonly #inFlight = new Map<string, Promise<Buffer>>();
  readonly #onError?: (error: unknown) => void;

  public constructor(options: ArtifactCacheOptions) {
    if (!KEY_PATTERN.test(options.namespace)) throw new RangeError('namespace');
    this.#directory = join(options.directory, options.namespace);
    if (options.onError !== undefined) this.#onError = options.onError;
  }

  public get directory(): string {
    return this.#directory;
  }

  /** Cache'te varsa döndürür, yoksa üretir, yazar ve döndürür. */
  public async resolve(key: string, produce: () => Promise<Buffer>): Promise<Buffer> {
    if (!KEY_PATTERN.test(key)) throw new RangeError('key');

    const pending = this.#inFlight.get(key);
    if (pending !== undefined) return pending;

    const task = this.#produceOnce(key, produce).finally(() => {
      this.#inFlight.delete(key);
    });
    this.#inFlight.set(key, task);
    return task;
  }

  async #produceOnce(key: string, produce: () => Promise<Buffer>): Promise<Buffer> {
    const cached = await this.#read(key);
    if (cached !== undefined) return cached;
    const produced = await produce();
    await this.#write(key, produced);
    return produced;
  }

  /** Tek dizinde on binlerce dosya birikmesin diye ilk iki karakterle parçalanır. */
  #pathFor(key: string): string {
    return join(this.#directory, key.slice(0, 2), key);
  }

  async #read(key: string): Promise<Buffer | undefined> {
    try {
      return await readFile(this.#pathFor(key));
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT' && code !== 'ENOTDIR') this.#onError?.(error);
      return undefined;
    }
  }

  async #write(key: string, data: Buffer): Promise<void> {
    const target = this.#pathFor(key);
    // Yarıda kalan yazımın cache'te bozuk artefakt bırakmaması için önce geçici
    // dosyaya yazılıp aynı dizin içinde rename edilir (rename atomiktir).
    const temporary = `${target}.${randomBytes(6).toString('hex')}.part`;
    try {
      await mkdir(join(this.#directory, key.slice(0, 2)), { recursive: true });
      await writeFile(temporary, data);
      await rename(temporary, target);
    } catch (error) {
      this.#onError?.(error);
      await rm(temporary, { force: true }).catch(() => undefined);
    }
  }
}
