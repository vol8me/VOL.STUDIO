import { createHash, randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { open, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { AssetRole } from '../shared/contracts.js';
import { openVerifiedAsset } from './assetFile.js';
import type { AssetCatalog, AssetRecord } from './catalog.js';
import { AssetStudioError } from './errors.js';

export interface SaveTarget {
  assetId: string;
  expectedRevision: string;
  /** Yazılacak tam dosya içeriği. */
  payload: Buffer;
}

export interface SaveResult {
  assetId: string;
  revision: string;
  bytes: number;
}

/** Yazma girişimi kabul edilmeyen roller. */
const READONLY_ROLES: ReadonlySet<AssetRole> = new Set<AssetRole>(['readonly']);

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

/** Var olan dosyanın DİSKTEKİ güncel revizyonunu okur. */
async function currentRevision(record: AssetRecord): Promise<string> {
  const verified = await openVerifiedAsset(record);
  try {
    return sha256(await verified.handle.readFile());
  } finally {
    await verified.handle.close();
  }
}

interface PreparedTarget {
  record: AssetRecord;
  temporaryPath: string;
  backupPath: string;
  revision: string;
  bytes: number;
  placed: boolean;
  backedUp: boolean;
}

/**
 * Çok hedefli kaydı, dosya sisteminin sunmadığı atomikliğe olabildiğince
 * yaklaştırarak yürütür.
 *
 * Gerçek dosya sistemi çok dosyalı atomik transaction sunmaz. Uygulama bu
 * yüzden şu sırayı izler: bütün geçici dosyalar HAZIRLANIR, revizyonlar
 * rename'den hemen önce TEKRAR doğrulanır, eskiler yedeğe alınır, yeniler
 * yerleştirilir; herhangi bir adım düşerse ters sırayla geri sarılır.
 *
 * Revizyonun iki kez doğrulanması bilinçlidir: ilk kontrol ile rename arasında
 * geçen sürede dosya harici bir araçla değişebilir. Yalnız baştaki kontrol
 * yapılsaydı kayıt o değişikliği sessizce ezerdi.
 */
export async function runSaveTransaction(
  catalog: AssetCatalog,
  targets: readonly SaveTarget[],
  options: { maxAssetBytes: number },
): Promise<SaveResult[]> {
  if (targets.length === 0) {
    throw new AssetStudioError('invalid_request', 400, { field: 'targets' });
  }
  const seen = new Set<string>();
  for (const target of targets) {
    if (seen.has(target.assetId)) {
      throw new AssetStudioError('invalid_request', 400, {
        field: 'targets',
        reason: 'duplicate_asset',
      });
    }
    seen.add(target.assetId);
    if (target.payload.length === 0) {
      throw new AssetStudioError('invalid_request', 400, {
        field: 'targets.payload',
        reason: 'empty',
      });
    }
    if (target.payload.length > options.maxAssetBytes) {
      throw new AssetStudioError('asset_too_large', 413, { maximum: options.maxAssetBytes });
    }
  }

  const prepared: PreparedTarget[] = [];
  try {
    // 1) Doğrulama + geçici dosyalar. Geçici dosya HEDEFLE AYNI dizindedir;
    //    rename yalnız aynı dosya sistemi içinde atomiktir.
    for (const target of targets) {
      const record = catalog.get(target.assetId);
      if (READONLY_ROLES.has(record.summary.role)) {
        throw new AssetStudioError('asset_readonly', 403, { assetId: target.assetId });
      }
      const onDisk = await currentRevision(record);
      if (onDisk !== target.expectedRevision) {
        throw new AssetStudioError('asset_conflict', 409, {
          assetId: target.assetId,
          expectedRevision: target.expectedRevision,
          actualRevision: onDisk,
        });
      }
      const suffix = randomBytes(6).toString('hex');
      const temporaryPath = join(dirname(record.absolutePath), `.${suffix}.vol-part`);
      await writeFile(temporaryPath, target.payload, { flag: 'wx' });
      await fsyncFile(temporaryPath);
      prepared.push({
        record,
        temporaryPath,
        backupPath: join(dirname(record.absolutePath), `.${suffix}.vol-backup`),
        revision: sha256(target.payload),
        bytes: target.payload.length,
        placed: false,
        backedUp: false,
      });
    }

    // 2) Rename'den HEMEN ÖNCE revizyonları tekrar doğrula.
    for (const entry of prepared) {
      const onDisk = await currentRevision(entry.record);
      const expected = targets.find((target) => target.assetId === entry.record.summary.id);
      if (expected !== undefined && onDisk !== expected.expectedRevision) {
        throw new AssetStudioError('asset_conflict', 409, {
          assetId: entry.record.summary.id,
          expectedRevision: expected.expectedRevision,
          actualRevision: onDisk,
        });
      }
    }

    // 3) Eskileri yedekle, yenileri yerleştir.
    for (const entry of prepared) {
      await rename(entry.record.absolutePath, entry.backupPath);
      entry.backedUp = true;
      await rename(entry.temporaryPath, entry.record.absolutePath);
      entry.placed = true;
    }
  } catch (error) {
    await rollback(prepared);
    throw error;
  }

  /*
   * 4) Rename'leri KALICI kıl, sonra yedekleri temizle.
   *
   * Sıra önemlidir: yedek, rename dayanıklı olmadan silinirse çökme sonrası
   * geri dönülecek bir kopya kalmaz. Aynı dizin birden çok hedef taşıyabilir,
   * bir kez senkronlamak yeter.
   */
  const directories = new Set(prepared.map((entry) => dirname(entry.record.absolutePath)));
  await Promise.all([...directories].map((directory) => fsyncDirectory(directory)));

  await Promise.allSettled(prepared.map((entry) => rm(entry.backupPath, { force: true })));
  await catalog.refresh();
  return prepared.map((entry) => ({
    assetId: entry.record.summary.id,
    revision: entry.revision,
    bytes: entry.bytes,
  }));
}

/** Yerleştirilmiş hedefleri ters sırayla eski içeriğe döndürür. */
async function rollback(prepared: readonly PreparedTarget[]): Promise<void> {
  for (let index = prepared.length - 1; index >= 0; index -= 1) {
    const entry = prepared[index];
    if (entry.placed) {
      await rm(entry.record.absolutePath, { force: true }).catch(() => undefined);
      entry.placed = false;
    }
    if (entry.backedUp) {
      await rename(entry.backupPath, entry.record.absolutePath).catch(() => undefined);
      entry.backedUp = false;
    }
    await rm(entry.temporaryPath, { force: true }).catch(() => undefined);
  }
}

/**
 * Veriyi rename'den önce diske indirir.
 *
 * `rename` atomiktir ama yazılan İÇERİĞİN diske ulaştığını garanti etmez;
 * fsync'siz bir çökme, adı doğru fakat içeriği yarım bir dosya bırakabilir.
 */
async function fsyncFile(path: string): Promise<void> {
  const handle = await open(path, constants.O_RDONLY);
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

/**
 * Rename'in KENDİSİNİ kalıcı kılar.
 *
 * Dosyayı fsync'lemek içeriği diske indirir ama adı bağlayan dizin girdisini
 * indirmez: POSIX'te bir rename ancak kapsayan DİZİN fsync'lendiğinde
 * dayanıklıdır. Yalnız dosyayı senkronlamak deseni yarım bırakıyordu — içeriği
 * sağlam ama adı eski çökme senaryosu tam olarak buradan doğar.
 *
 * Hata YUTULUR: bazı dosya sistemleri (ve Windows) dizin fsync'ini
 * desteklemez. Desteklenen yerde dayanıklılık kazanılır, desteklenmeyende
 * kayıt yine de başarılıdır — bu, yazmayı reddetmek için bir sebep değildir.
 */
async function fsyncDirectory(path: string): Promise<void> {
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY);
    await handle.sync();
  } catch {
    return;
  } finally {
    await handle?.close().catch(() => undefined);
  }
}
