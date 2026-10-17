import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Modül doğrudan `node server/index.ts` ile mi başlatıldı? Dosya URL'si işletim sistemi yoluna çevrilip
 * karşılaştırılır: `file:///` + yol birleştirmesi yalnız Windows sürücü yollarında (`C:/...`) doğrudur,
 * POSIX'te dört eğik çizgili URL üretir ve sunucu sessizce çıkardı.
 */
export function isEntryModule(metaUrl: string, entry: string | undefined): boolean {
  return Boolean(entry) && fileURLToPath(metaUrl) === resolve(entry as string);
}
