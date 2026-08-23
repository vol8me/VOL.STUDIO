import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, open, opendir, readFile, stat } from 'node:fs/promises';
import { basename, extname, relative, sep } from 'node:path';
import sharp from 'sharp';
import type {
  AssetKind,
  AssetRelation,
  AssetRole,
  AssetStudioProjectConfig,
  AssetSummary,
  CatalogResponse,
  ProblemCode,
} from '../shared/index.js';
import { AssetStudioError } from './errors.js';
import { AssetEventJournal } from './events.js';
import { readGitStatus } from './gitStatus.js';
import {
  isPathInside,
  resolveExistingAsset,
  resolveWorkspaceRoot,
  type ResolvedWorkspaceRoot,
} from './pathSecurity.js';

const IMAGE_EXTENSIONS = new Set(['.avif', '.gif', '.jpeg', '.jpg', '.png', '.svg', '.webp']);
const AUDIO_EXTENSIONS = new Set(['.flac', '.mp3', '.ogg', '.wav']);
const FONT_EXTENSIONS = new Set(['.otf', '.ttf', '.woff', '.woff2']);
const RELATED_MEDIA_EXTENSIONS = [
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.avif',
  '.svg',
  '.ogg',
  '.wav',
  '.mp3',
  '.flac',
];

export interface CatalogRoot extends ResolvedWorkspaceRoot {
  id: string;
  role: AssetRole;
  kinds: AssetKind[];
  ignore: string[];
}

export interface AssetRecord {
  summary: AssetSummary;
  absolutePath: string;
  relativeToRoot: string;
  root: CatalogRoot;
  identity: AssetFileIdentity;
}

export interface AssetFileIdentity {
  device: number;
  inode: number;
  changedAtMs: number;
  size: number;
}

function toPosixPath(path: string): string {
  return sep === '/' ? path : path.split(sep).join('/');
}

function classify(path: string): AssetKind | null {
  const lower = path.toLowerCase();
  if (lower.endsWith('.volsprite.json')) return 'sprite-document';
  if (lower.endsWith('.volaudio.json')) return 'audio-recipe';
  if (lower.endsWith('.pen')) return 'sprite-document';
  if (lower.endsWith('.volmeta.json') || lower.endsWith('.json')) return 'metadata';
  const extension = extname(lower);
  if (IMAGE_EXTENSIONS.has(extension)) return 'image';
  if (AUDIO_EXTENSIONS.has(extension)) return 'audio';
  if (FONT_EXTENSIONS.has(extension)) return 'font';
  return null;
}

function globToRegExp(glob: string): RegExp {
  let source = '^';
  for (let index = 0; index < glob.length; index += 1) {
    const character = glob[index];
    if (character === '*') {
      if (glob[index + 1] === '*') {
        index += 1;
        if (glob[index + 1] === '/') {
          index += 1;
          source += '(?:.*/)?';
        } else {
          source += '.*';
        }
      } else {
        source += '[^/]*';
      }
    } else if (character === '?') {
      source += '[^/]';
    } else {
      source += character.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
    }
  }
  return new RegExp(`${source}$`);
}

function createIgnoreMatcher(patterns: string[]): (path: string) => boolean {
  const matchers = patterns.filter((pattern) => pattern.length > 0).map(globToRegExp);
  return (path) => matchers.some((matcher) => matcher.test(path));
}

export function isIgnoredAssetPath(path: string, patterns: string[]): boolean {
  return createIgnoreMatcher(patterns)(path);
}

async function hashFile(path: string): Promise<string> {
  const hash = createHash('sha256');
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(path);
    stream.on('data', (chunk: Buffer) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  return hash.digest('hex');
}

function createAssetId(rootId: string, path: string): string {
  return createHash('sha256')
    .update(rootId)
    .update('\0')
    .update(path)
    .digest('base64url')
    .slice(0, 24);
}

async function imageMetadata(
  path: string,
  maxImagePixels: number,
): Promise<{ image?: AssetSummary['image']; problemCodes: ProblemCode[] }> {
  try {
    const metadata = await sharp(path, { limitInputPixels: maxImagePixels }).metadata();
    if (metadata.width === undefined || metadata.height === undefined) {
      return { problemCodes: ['image_dimensions_missing'] };
    }
    return {
      image: {
        width: metadata.width,
        height: metadata.height,
        hasAlpha: metadata.hasAlpha ?? false,
      },
      problemCodes: [],
    };
  } catch {
    return { problemCodes: ['image_decode_failed'] };
  }
}

async function readSignature(path: string, length = 12): Promise<Buffer> {
  const handle = await open(path, 'r');
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

async function lightweightProblems(
  path: string,
  relativePath: string,
  kind: AssetKind,
): Promise<ProblemCode[]> {
  if (kind === 'audio') {
    const header = await readSignature(path);
    const extension = extname(relativePath).toLowerCase();
    const valid =
      (extension === '.ogg' && header.subarray(0, 4).toString('ascii') === 'OggS') ||
      (extension === '.flac' && header.subarray(0, 4).toString('ascii') === 'fLaC') ||
      (extension === '.wav' &&
        header.subarray(0, 4).toString('ascii') === 'RIFF' &&
        header.subarray(8, 12).toString('ascii') === 'WAVE') ||
      (extension === '.mp3' &&
        (header.subarray(0, 3).toString('ascii') === 'ID3' ||
          (header[0] === 0xff && (header[1] & 0xe0) === 0xe0)));
    return valid ? [] : ['audio_header_invalid'];
  }
  if (kind === 'font') {
    const signature = await readSignature(path, 4);
    const ascii = signature.toString('ascii');
    const valid =
      signature.equals(Buffer.from([0, 1, 0, 0])) ||
      ascii === 'OTTO' ||
      ascii === 'true' ||
      ascii === 'typ1' ||
      ascii === 'wOFF' ||
      ascii === 'wOF2';
    return valid ? [] : ['font_header_invalid'];
  }
  if (kind === 'metadata') {
    try {
      JSON.parse(await readFile(path, 'utf8'));
      return [];
    } catch {
      return ['metadata_parse_failed'];
    }
  }
  return [];
}

async function scanRoot(
  repoRoot: string,
  root: CatalogRoot,
  maxAssetBytes: number,
  maxImagePixels: number,
  previous: ReadonlyMap<string, AssetRecord>,
): Promise<AssetRecord[]> {
  if (!root.available || root.canonicalPath === undefined) return [];
  const records: AssetRecord[] = [];
  const ignored = createIgnoreMatcher(root.ignore);

  async function visit(directory: string): Promise<void> {
    const handle = await opendir(directory);
    for await (const entry of handle) {
      const absolute = `${directory}/${entry.name}`;
      const relativeToRoot = toPosixPath(relative(root.canonicalPath!, absolute));
      if (ignored(relativeToRoot) || ignored(`${relativeToRoot}/`)) continue;

      const fileStat = await lstat(absolute);
      if (fileStat.isSymbolicLink()) {
        // Symlink varlıklar kataloglanmaz. Böylece sonraki içerik açılışında
        // hedef değiştirme yarışı için desteklenmesi gereken ikinci bir yol yoktur.
        continue;
      } else if (fileStat.isDirectory()) {
        await visit(absolute);
        continue;
      } else if (!fileStat.isFile()) {
        continue;
      }

      const kind = classify(relativeToRoot);
      if (kind === null || !root.kinds.includes(kind)) continue;

      let canonicalFile: string;
      try {
        canonicalFile = await resolveExistingAsset(root, relativeToRoot);
      } catch {
        continue;
      }
      const canonicalStat = await stat(canonicalFile);
      const id = createAssetId(root.id, relativeToRoot);
      const prior = previous.get(id);
      if (
        prior !== undefined &&
        prior.absolutePath === canonicalFile &&
        prior.identity.device === canonicalStat.dev &&
        prior.identity.inode === canonicalStat.ino &&
        prior.identity.changedAtMs === canonicalStat.ctimeMs &&
        prior.identity.size === canonicalStat.size
      ) {
        const summary = { ...prior.summary };
        delete summary.gitStatus;
        delete summary.relation;
        records.push({
          absolutePath: canonicalFile,
          relativeToRoot,
          root,
          identity: { ...prior.identity },
          summary,
        });
        continue;
      }

      const repoPath = toPosixPath(relative(repoRoot, canonicalFile));
      const tooLarge = canonicalStat.size > maxAssetBytes;
      const revision = tooLarge
        ? createHash('sha256')
            .update(
              `oversized\0${canonicalStat.dev}\0${canonicalStat.ino}\0${canonicalStat.ctimeMs}\0${canonicalStat.size}`,
            )
            .digest('hex')
        : await hashFile(canonicalFile);
      const problemCodes: ProblemCode[] = [];
      if (canonicalStat.size === 0) problemCodes.push('asset_empty');
      if (tooLarge) problemCodes.push('asset_too_large');
      if (!tooLarge && canonicalStat.size > 0) {
        problemCodes.push(...(await lightweightProblems(canonicalFile, relativeToRoot, kind)));
      }
      const visual =
        kind === 'image' && !tooLarge && canonicalStat.size > 0
          ? await imageMetadata(canonicalFile, maxImagePixels)
          : { problemCodes: [] as ProblemCode[] };
      problemCodes.push(...visual.problemCodes);

      records.push({
        absolutePath: canonicalFile,
        relativeToRoot,
        root,
        identity: {
          device: canonicalStat.dev,
          inode: canonicalStat.ino,
          changedAtMs: canonicalStat.ctimeMs,
          size: canonicalStat.size,
        },
        summary: {
          id,
          path: repoPath,
          rootId: root.id,
          name: basename(relativeToRoot),
          kind,
          format: extname(relativeToRoot).slice(1).toLowerCase(),
          role: root.role,
          bytes: canonicalStat.size,
          modifiedAt: canonicalStat.mtime.toISOString(),
          revision,
          ...(visual.image === undefined ? {} : { image: visual.image }),
          problemCodes,
        },
      });
    }
  }

  await visit(root.canonicalPath);
  return records;
}

function basePathForRelation(record: AssetRecord): string {
  const lower = record.relativeToRoot.toLowerCase();
  if (lower.endsWith('.volsprite.json'))
    return record.relativeToRoot.slice(0, -'.volsprite.json'.length);
  if (lower.endsWith('.volaudio.json'))
    return record.relativeToRoot.slice(0, -'.volaudio.json'.length);
  if (lower.endsWith('.volmeta.json'))
    return record.relativeToRoot.slice(0, -'.volmeta.json'.length);
  if (lower.endsWith('.json')) return record.relativeToRoot.slice(0, -'.json'.length);
  return record.relativeToRoot.slice(0, -extname(record.relativeToRoot).length);
}

function applyRelations(records: AssetRecord[]): void {
  const byRootAndPath = new Map(
    records.map((record) => [`${record.root.id}\0${record.relativeToRoot}`, record]),
  );
  for (const recipe of records) {
    if (!['sprite-document', 'audio-recipe', 'metadata'].includes(recipe.summary.kind)) continue;
    const base = basePathForRelation(recipe);
    const related = RELATED_MEDIA_EXTENSIONS.map((extension) =>
      byRootAndPath.get(`${recipe.root.id}\0${base}${extension}`),
    ).filter((record): record is AssetRecord => record !== undefined);
    if (related.length === 0) continue;

    const relation: AssetRelation = { relatedIds: related.map((record) => record.summary.id) };
    if (recipe.summary.kind === 'sprite-document' || recipe.summary.kind === 'audio-recipe') {
      relation.derivedIds = related.map((record) => record.summary.id);
    }
    recipe.summary.relation = relation;
    for (const output of related) {
      output.summary.relation = {
        ...output.summary.relation,
        recipeId: recipe.summary.id,
        relatedIds: [recipe.summary.id],
      };
    }
  }
}

async function resolveRoots(
  repoRoot: string,
  project: AssetStudioProjectConfig,
): Promise<CatalogRoot[]> {
  const roots = await Promise.all(
    project.roots.map(async (entry) => ({
      ...(await resolveWorkspaceRoot(repoRoot, entry.path)),
      id: entry.id,
      role: entry.role,
      kinds: entry.kinds,
      ignore: [...project.ignore, ...(entry.ignore ?? [])],
    })),
  );

  const available = roots.filter(
    (root): root is CatalogRoot & { canonicalPath: string } => root.canonicalPath !== undefined,
  );
  for (let left = 0; left < available.length; left += 1) {
    for (let right = left + 1; right < available.length; right += 1) {
      const leftRoot = available[left];
      const rightRoot = available[right];
      if (
        isPathInside(leftRoot.canonicalPath, rightRoot.canonicalPath) ||
        isPathInside(rightRoot.canonicalPath, leftRoot.canonicalPath)
      ) {
        throw new AssetStudioError('configuration_invalid', 500, {
          issues: ['roots.overlap'],
          rootIds: [leftRoot.id, rightRoot.id],
        });
      }
    }
  }
  return roots;
}

function recordsEqual(left: AssetRecord, right: AssetRecord): boolean {
  return JSON.stringify(left.summary) === JSON.stringify(right.summary);
}

export interface CatalogOptions {
  repoRoot: string;
  project: AssetStudioProjectConfig;
  maxAssetBytes: number;
  maxImagePixels: number;
  journal?: AssetEventJournal;
}

/** Repo taraması, güvenli dosya çözümü ve canlı revizyonların tek sahibi. */
export class AssetCatalog {
  readonly #journal: AssetEventJournal;
  #records = new Map<string, AssetRecord>();

  private constructor(
    public roots: CatalogRoot[],
    private readonly options: CatalogOptions,
  ) {
    this.#journal = options.journal ?? new AssetEventJournal();
  }

  public static async create(options: CatalogOptions): Promise<AssetCatalog> {
    const roots = await resolveRoots(options.repoRoot, options.project);
    const catalog = new AssetCatalog(roots, options);
    catalog.#records = await catalog.scan(roots);
    return catalog;
  }

  public get journal(): AssetEventJournal {
    return this.#journal;
  }

  public get repoRoot(): string {
    return this.options.repoRoot;
  }

  public snapshot(): CatalogResponse {
    return {
      revision: this.#journal.revision,
      assets: [...this.#records.values()]
        .map((record) => record.summary)
        .sort((left, right) => left.path.localeCompare(right.path, 'en')),
    };
  }

  public get(id: string): AssetRecord {
    const record = this.#records.get(id);
    if (record === undefined) throw new AssetStudioError('asset_not_found', 404);
    return record;
  }

  public async refresh(): Promise<void> {
    const nextRoots = await resolveRoots(this.options.repoRoot, this.options.project);
    const rootsChanged = nextRoots.some(
      (root, index) =>
        root.id !== this.roots[index]?.id || root.available !== this.roots[index]?.available,
    );
    const next = await this.scan(nextRoots);
    const ids = [...new Set([...this.#records.keys(), ...next.keys()])].sort();
    for (const id of ids) {
      const previous = this.#records.get(id);
      const current = next.get(id);
      if (previous === undefined && current !== undefined) {
        this.#journal.publish({ type: 'created', asset: current.summary });
      } else if (previous !== undefined && current === undefined) {
        this.#journal.publish({ type: 'deleted', assetId: id });
      } else if (
        previous !== undefined &&
        current !== undefined &&
        !recordsEqual(previous, current)
      ) {
        this.#journal.publish({ type: 'changed', asset: current.summary });
      }
    }
    this.roots = nextRoots;
    this.#records = next;
    if (rootsChanged) this.#journal.publishResync();
  }

  async scan(roots: CatalogRoot[]): Promise<Map<string, AssetRecord>> {
    const [batches, git] = await Promise.all([
      Promise.all(
        roots.map((root) =>
          scanRoot(
            this.options.repoRoot,
            root,
            this.options.maxAssetBytes,
            this.options.maxImagePixels,
            this.#records,
          ),
        ),
      ),
      readGitStatus(
        this.options.repoRoot,
        roots.map((root) => root.configuredPath),
      ),
    ]);
    const records = batches.flat();
    if (git.available) {
      for (const record of records) {
        const status = git.byPath.get(record.summary.path);
        if (status !== undefined) record.summary.gitStatus = status;
      }
    }
    applyRelations(records);
    return new Map(records.map((record) => [record.summary.id, record]));
  }
}
