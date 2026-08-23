import { randomBytes } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, relative } from 'node:path';
import type { AssetCatalog, AssetRecord } from './catalog.js';
import { AssetStudioError } from './errors.js';
import { assertSafeRelativePath, isPathInside } from './pathSecurity.js';

export interface TrashEntry {
  /** Geri yükleme kimliği. */
  trashId: string;
  /** Silinen dosyanın repo-göreli yolu. */
  originalPath: string;
  deletedAt: string;
  bytes: number;
}

interface TrashManifest {
  schemaVersion: 1;
  entries: TrashEntry[];
}

const MANIFEST_NAME = 'trash.json';
const TRASH_ID_PATTERN = /^[a-f0-9]{24}$/;

/**
 * Kurtarılabilir silme.
 *
 * Dosya SİLİNMEZ, repo dışındaki çöp alanına taşınır ve manifeste yazılır.
 * `unlink` geri alınamaz; kullanıcı yanlış varlığı seçtiğinde tek kurtarma
 * yolu git olurdu ve takipsiz dosyalarda o da yoktur.
 */
export class TrashStore {
  readonly #directory: string;

  public constructor(directory: string) {
    this.#directory = directory;
  }

  public get directory(): string {
    return this.#directory;
  }

  async #readManifest(): Promise<TrashManifest> {
    try {
      const raw = await readFile(join(this.#directory, MANIFEST_NAME), 'utf8');
      const parsed = JSON.parse(raw) as TrashManifest;
      if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.entries)) {
        return { schemaVersion: 1, entries: [] };
      }
      return parsed;
    } catch {
      return { schemaVersion: 1, entries: [] };
    }
  }

  async #writeManifest(manifest: TrashManifest): Promise<void> {
    await mkdir(this.#directory, { recursive: true });
    const temporary = join(this.#directory, `${MANIFEST_NAME}.${randomBytes(4).toString('hex')}`);
    await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`);
    await rename(temporary, join(this.#directory, MANIFEST_NAME));
  }

  public async list(): Promise<TrashEntry[]> {
    const manifest = await this.#readManifest();
    return [...manifest.entries].sort((left, right) =>
      right.deletedAt.localeCompare(left.deletedAt),
    );
  }

  /** Varlığı çöpe taşır ve geri yükleme kaydı yazar. */
  public async trash(record: AssetRecord): Promise<TrashEntry> {
    const trashId = randomBytes(12).toString('hex');
    await mkdir(join(this.#directory, trashId), { recursive: true });
    const stored = join(this.#directory, trashId, basename(record.absolutePath));
    const size = (await stat(record.absolutePath)).size;
    await rename(record.absolutePath, stored);
    const manifest = await this.#readManifest();
    const entry: TrashEntry = {
      trashId,
      originalPath: record.summary.path,
      deletedAt: new Date().toISOString(),
      bytes: size,
    };
    manifest.entries.push(entry);
    await this.#writeManifest(manifest);
    return entry;
  }

  /** Çöpten geri yükler; hedef doluysa üzerine YAZMAZ. */
  public async restore(trashId: string, repoRoot: string): Promise<TrashEntry> {
    if (!TRASH_ID_PATTERN.test(trashId)) {
      throw new AssetStudioError('invalid_request', 400, { field: 'trashId' });
    }
    const manifest = await this.#readManifest();
    const entry = manifest.entries.find((candidate) => candidate.trashId === trashId);
    if (entry === undefined) throw new AssetStudioError('asset_not_found', 404, { trashId });

    const safePath = assertSafeRelativePath(entry.originalPath, 'originalPath');
    const target = join(repoRoot, safePath);
    if (!isPathInside(repoRoot, target)) {
      throw new AssetStudioError('path_outside_workspace', 403);
    }
    const files = await readdir(join(this.#directory, trashId));
    const stored = join(this.#directory, trashId, files[0] ?? '');
    if (files.length === 0) throw new AssetStudioError('asset_not_found', 404, { trashId });

    try {
      await stat(target);
      // Hedef doluysa geri yükleme ÜZERİNE YAZMAZ: kullanıcı sildikten sonra
      // aynı ada yeni bir dosya koymuş olabilir.
      throw new AssetStudioError('asset_conflict', 409, { path: entry.originalPath });
    } catch (error) {
      if (error instanceof AssetStudioError) throw error;
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }

    await mkdir(dirname(target), { recursive: true });
    await rename(stored, target);
    manifest.entries = manifest.entries.filter((candidate) => candidate.trashId !== trashId);
    await this.#writeManifest(manifest);
    await rm(join(this.#directory, trashId), { recursive: true, force: true });
    return entry;
  }
}

export interface ReferenceHit {
  /** Referansı taşıyan dosyanın repo-göreli yolu. */
  file: string;
  line: number;
  /** Satırın ham içeriği (kırpılmış). */
  text: string;
}

const REFERENCE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.mjs',
  '.json',
  '.css',
  '.html',
  '.md',
  '.yaml',
  '.yml',
]);
const SKIP_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  'dist',
  'dist-server',
  'coverage',
  'target',
  'test-results',
  'playwright-report',
]);
const MAX_LINE_LENGTH = 200;

/**
 * Bir varlığa metinsel referans veren dosyaları bulur.
 *
 * Arama tam yolu ve dosya adını ayrı ayrı kovalar: kod çoğu zaman
 * `assets/car.png` yerine yalnız `car.png` yazar ve tam yol araması bunu
 * kaçırırdı. Sonuç bir ÖNERİDİR; rename onay olmadan uygulanmaz.
 */
export async function findReferences(
  repoRoot: string,
  assetPath: string,
  limit = 500,
): Promise<ReferenceHit[]> {
  const fileName = basename(assetPath);
  const stem = fileName.slice(0, fileName.length - extname(fileName).length);
  const needles = [assetPath, fileName, stem].filter(
    (needle, index, all) => needle.length >= 3 && all.indexOf(needle) === index,
  );
  const hits: ReferenceHit[] = [];

  async function walk(directory: string): Promise<void> {
    if (hits.length >= limit) return;
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (hits.length >= limit) return;
      if (SKIP_DIRECTORIES.has(entry.name)) continue;
      const full = join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (!REFERENCE_EXTENSIONS.has(extname(entry.name))) continue;
      const relativePath = relative(repoRoot, full).split('\\').join('/');
      if (relativePath === assetPath) continue;
      let content: string;
      try {
        content = await readFile(full, 'utf8');
      } catch {
        continue;
      }
      if (!needles.some((needle) => content.includes(needle))) continue;
      const lines = content.split(/\r?\n/);
      for (let index = 0; index < lines.length; index += 1) {
        if (!needles.some((needle) => lines[index].includes(needle))) continue;
        hits.push({
          file: relativePath,
          line: index + 1,
          text: lines[index].trim().slice(0, MAX_LINE_LENGTH),
        });
        if (hits.length >= limit) return;
      }
    }
  }

  await walk(repoRoot);
  return hits;
}

export interface RenamePreview {
  from: string;
  to: string;
  /** Uygulanacak metin değişiklikleri. */
  references: ReferenceHit[];
  /** Hedefte dosya varsa rename engellenir. */
  targetExists: boolean;
}

/**
 * Yeniden adlandırma ÖNİZLEMESİ.
 *
 * Önizleme uygulamaz. Rename, referansları da değiştirdiği için geri alınması
 * zordur; kullanıcı neyin değişeceğini görmeden onaylayamamalıdır.
 */
export async function previewRename(
  catalog: AssetCatalog,
  assetId: string,
  targetName: string,
): Promise<RenamePreview> {
  const record = catalog.get(assetId);
  if (record.summary.role === 'readonly') {
    throw new AssetStudioError('asset_readonly', 403, { assetId });
  }
  const safeName = assertSafeRelativePath(targetName, 'targetName');
  if (safeName.includes('/')) {
    throw new AssetStudioError('invalid_request', 400, { field: 'targetName' });
  }
  const from = record.summary.path;
  const to = `${dirname(from) === '.' ? '' : `${dirname(from)}/`}${safeName}`;
  let targetExists = false;
  try {
    await stat(join(catalog.repoRoot, to));
    targetExists = true;
  } catch {
    targetExists = false;
  }
  return {
    from,
    to,
    references: await findReferences(catalog.repoRoot, from),
    targetExists,
  };
}
