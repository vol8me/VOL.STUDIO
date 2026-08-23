import { watch, type FSWatcher } from 'chokidar';
import { lstat } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { isIgnoredAssetPath, type AssetCatalog } from './catalog.js';
import { isPathInside } from './pathSecurity.js';

export interface CatalogWatcher {
  close(): Promise<void>;
}

export interface CatalogWatcherOptions {
  onError?: (error: unknown) => void;
}

function posixPath(path: string): string {
  return sep === '/' ? path : path.split(sep).join('/');
}

async function nearestExisting(path: string): Promise<string> {
  let cursor = path;
  while (true) {
    try {
      await lstat(cursor);
      return cursor;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT' && code !== 'ENOTDIR') throw error;
      const parent = dirname(cursor);
      if (parent === cursor) throw error;
      cursor = parent;
    }
  }
}

async function existing(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') return false;
    throw error;
  }
}

/** Dosya olaylarını sabitleyip tekil katalog taramalarına dönüştürür. */
export async function watchCatalog(
  catalog: AssetCatalog,
  options: CatalogWatcherOptions = {},
): Promise<CatalogWatcher> {
  const roots = catalog.roots;
  const rootWatchPaths = await Promise.all(
    roots.map(async (root) =>
      root.canonicalPath === undefined
        ? await nearestExisting(root.absolutePath)
        : root.canonicalPath,
    ),
  );
  const gitCandidates = [
    join(catalog.repoRoot, '.git', 'index'),
    join(catalog.repoRoot, '.git', 'HEAD'),
    join(catalog.repoRoot, '.git', 'refs'),
  ];
  const gitWatchPaths = (
    await Promise.all(
      gitCandidates.map(async (path) => ((await existing(path)) ? path : undefined)),
    )
  ).filter((path): path is string => path !== undefined);
  const paths = [...new Set([...rootWatchPaths, ...gitWatchPaths])];
  let timer: NodeJS.Timeout | undefined;
  let refreshQueued = false;
  let closed = false;
  let retryDelay = 250;
  let failureReported = false;
  let activeRefresh: Promise<void> | undefined;

  const startRefresh = (): void => {
    if (activeRefresh !== undefined) {
      refreshQueued = true;
      return;
    }
    activeRefresh = (async () => {
      try {
        do {
          refreshQueued = false;
          await catalog.refresh();
        } while (refreshQueued && !closed);
        retryDelay = 250;
        failureReported = false;
      } catch (error) {
        options.onError?.(error);
        if (!failureReported) catalog.journal.publishResync();
        failureReported = true;
        const delay = retryDelay;
        retryDelay = Math.min(retryDelay * 2, 10_000);
        schedule(delay);
      } finally {
        activeRefresh = undefined;
      }
    })();
  };

  const schedule = (delay = 120): void => {
    if (closed) return;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      startRefresh();
    }, delay);
  };

  let watcher: FSWatcher | undefined;
  if (paths.length > 0) {
    const scheduleFromFileSystem = (): void => schedule();
    watcher = watch(paths, {
      atomic: true,
      awaitWriteFinish: { stabilityThreshold: 160, pollInterval: 40 },
      followSymlinks: false,
      ignoreInitial: true,
      ignored: (path) => {
        if (/(^|[/\\])(?:node_modules|dist|coverage|target)([/\\]|$)/.test(path)) return true;
        const root = roots.find((candidate) =>
          isPathInside(candidate.canonicalPath ?? candidate.absolutePath, path),
        );
        if (root !== undefined) {
          return isIgnoredAssetPath(
            posixPath(relative(root.canonicalPath ?? root.absolutePath, path)),
            root.ignore,
          );
        }
        if (roots.some((candidate) => isPathInside(path, candidate.absolutePath))) return false;
        if (
          gitWatchPaths.some(
            (candidate) => isPathInside(path, candidate) || isPathInside(candidate, path),
          )
        ) {
          return false;
        }
        return true;
      },
    });
    watcher
      .on('add', scheduleFromFileSystem)
      .on('change', scheduleFromFileSystem)
      .on('unlink', scheduleFromFileSystem);
    watcher.on('addDir', scheduleFromFileSystem).on('unlinkDir', scheduleFromFileSystem);
    try {
      await new Promise<void>((resolve, reject) => {
        const onReady = (): void => {
          watcher!.off('error', onError);
          resolve();
        };
        const onError = (error: unknown): void => {
          watcher!.off('ready', onReady);
          reject(error instanceof Error ? error : new Error('watcher_start_failed'));
        };
        watcher!.once('ready', onReady);
        watcher!.once('error', onError);
      });
    } catch (error) {
      await watcher.close();
      throw error;
    }
    watcher.on('error', (error) => {
      options.onError?.(error);
      if (!failureReported) catalog.journal.publishResync();
      failureReported = true;
    });
  }

  return {
    async close(): Promise<void> {
      closed = true;
      refreshQueued = false;
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      await watcher?.close();
      await activeRefresh?.catch(() => undefined);
    },
  };
}
