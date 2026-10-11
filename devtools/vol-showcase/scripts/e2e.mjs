#!/usr/bin/env node
/**
 * Vitrin E2E: yapılandırmadaki her motor kendi süreçte, kendi preview
 * sunucusunda ve kendi portunda koşar.
 *
 * Tam koşu iki şeritten oluşur (`playwright.config.ts` → `QUIET_SPECS`):
 *  1. ANA şerit: zamanı sınırlamayan her sınama, motorlar EŞZAMANLI. Motorlar birbirinin durumunu paylaşmaz (ayrı
 *     tarayıcı, ayrı sunucu, ayrı port), bu yüzden eşzamanlı koşu aynı kapsamı daha kısa sürede verir.
 *  2. SESSİZ şerit: zamanı ÖLÇEN ve süre sınırı koyan sınamalar, motor motor ve tek işçiyle. Yük altında ölçümleri
 *     yük taşır; tek başına koşan motor bunları gerçek değerlerinde ölçer.
 * Hiçbir motor ve hiçbir sınama dışlanmaz: motor listesi `playwright.config.ts` projelerinden gelir, iki şerit
 * birlikte bütün sınamaları kapsar.
 *
 * Ek argüman (dosya adı, `--grep`, `--update-snapshots`) verilirse seçili koşu tek şeritte, motorlar eşzamanlı koşar
 * ve argümanlar her sürece aynen geçer: şeritler yalnız tam koşuyu böler.
 */
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, rmdir, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const DEFAULT_REPO_ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..');
const DAY = 24 * 60 * 60 * 1000;

/** Başarılı çalışmanın çıktısı tutulmaz; eski hata kanıtı 14 gün/10 koşuyla sınırlıdır. */
export async function pruneOld(directory, maxCount, maxAge, now = Date.now()) {
  await mkdir(directory, { recursive: true });
  const entries = await readdir(directory, { withFileTypes: true });
  const folders = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const path = join(directory, entry.name);
        try {
          return { path, modified: (await stat(path)).mtimeMs };
        } catch {
          return null;
        }
      }),
  );
  const sorted = folders.filter(Boolean).sort((a, b) => b.modified - a.modified);
  for (const [index, folder] of sorted.entries()) {
    if (index >= maxCount || now - folder.modified > maxAge) {
      await rm(folder.path, { recursive: true, force: true });
    }
  }
}

/** Playwright JSON raporundan terminale gizli hata metni dökmeden tanı özeti üretir. */
function failedTests(report) {
  const failed = [];
  const visit = (suite, parents) => {
    const names = suite.title ? [...parents, suite.title] : parents;
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        if (spec.ok !== false && test.status !== 'unexpected') continue;
        failed.push({
          titlePath: [...names, spec.title],
          project: test.projectName,
          status: test.status,
          location: spec.file ? { file: spec.file, line: spec.line } : null,
          errors: (test.results ?? []).flatMap((result) =>
            (result.errors ?? []).map((error) => ({
              message: error.message,
              stack: error.stack,
              snippet: error.snippet,
            })),
          ),
        });
      }
    }
    for (const nested of suite.suites ?? []) visit(nested, names);
  };
  for (const suite of report?.suites ?? []) visit(suite, []);
  return failed;
}

/** Alt dizinlerdeki başarısız test trace'lerini, arşivde geçerli göreli yollarıyla sayar. */
async function traceFiles(root, current = root) {
  const traces = [];
  for (const entry of await readdir(current, { withFileTypes: true }).catch(() => [])) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) traces.push(...(await traceFiles(root, path)));
    else if (entry.isFile() && (entry.name === 'trace.zip' || entry.name.endsWith('-trace.zip'))) {
      traces.push(relative(root, path));
    }
  }
  return traces;
}

/**
 * Testlerde sahte Node CLI ve geçici önbellek verilebilir. Üretimde gerçek
 * Playwright/config yalnız bu modül doğrudan çalıştırılırken yüklenir.
 */
export async function runE2E(
  {
    projects,
    ports,
    playwrightCli,
    repoRoot = DEFAULT_REPO_ROOT,
    cacheRoot = join(repoRoot, 'node_modules', '.cache', 'vol-quality', 'showcase-e2e'),
  },
  extra = [],
) {
  const unported = projects.filter((name) => typeof ports[name] !== 'number');
  if (projects.length === 0 || unported.length > 0) {
    console.error(`[e2e] Port bildirimi olmayan proje: ${unported.join(', ') || '(proje yok)'}`);
    return 2;
  }
  if (new Set(projects.map((name) => ports[name])).size !== projects.length) {
    console.error('[e2e] İki motor aynı portu bildiriyor (playwright.config.ts → ENGINE_PORTS).');
    return 2;
  }
  if (projects.some((name) => !/^[a-zA-Z0-9_-]+$/.test(name))) {
    console.error(
      '[e2e] Geçersiz proje adı: çıktı dizininde yalnız harf, rakam, _ ve - kullanılabilir.',
    );
    return 2;
  }

  const children = new Set();
  const runsRoot = join(cacheRoot, 'runs');
  const failuresRoot = join(cacheRoot, 'failures');
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}-${randomUUID().slice(0, 8)}`;
  const runRoot = join(runsRoot, runId);
  let interrupted = false;
  await pruneOld(failuresRoot, 10, 14 * DAY);
  // Kesilmiş/kapanmış çalıştırıcıların geride bıraktığı geçici dosyalar.
  await pruneOld(runsRoot, Number.POSITIVE_INFINITY, 2 * DAY);
  await mkdir(runRoot, { recursive: true });

  async function settleEngine(name, lane, directory, code, signal, spawnError) {
    if (code === 0) {
      await rm(directory, { recursive: true, force: true });
      return code;
    }
    const reportPath = join(directory, 'report.json');
    const report = await readFile(reportPath, 'utf8')
      .then(JSON.parse)
      .catch(() => null);
    const traces = await traceFiles(directory);
    await writeFile(
      join(directory, 'error-context.json'),
      JSON.stringify(
        {
          engine: name,
          lane: lane ?? 'selected',
          exitCode: code,
          signal,
          spawnError,
          failedTests: failedTests(report),
          runnerErrors: report?.errors ?? [],
          traces,
          reporter: report ? 'report.json' : null,
        },
        null,
        2,
      ) + '\n',
    );
    const archived = join(failuresRoot, runId, `${name}-${lane ?? 'selected'}`);
    if (report) {
      // Playwright JSON eklerinin mutlak yolları taşımadan sonra eski runs/
      // konumunu gösterirdi. Dosya içindeki tüm bu başvuruları arşive bağla.
      const oldPath = JSON.stringify(directory).slice(1, -1);
      const archivedPath = JSON.stringify(archived).slice(1, -1);
      const raw = await readFile(reportPath, 'utf8');
      await writeFile(reportPath, raw.replaceAll(oldPath, archivedPath));
    }
    await mkdir(join(failuresRoot, runId), { recursive: true });
    await rename(directory, archived);
    const display = (path) => relative(repoRoot, path).replaceAll('\\', '/');
    console.error(
      `[e2e] ${name}/${lane ?? 'selected'} hata kanıtı: ${display(archived)}/error-context.json`,
    );
    for (const trace of traces.slice(0, 3)) {
      console.error(`[e2e] trace: ${display(join(archived, trace))}`);
    }
    if (traces.length > 3)
      console.error(`[e2e] ${traces.length - 3} ek trace yolu error-context.json içinde.`);
    return code;
  }

  /** Bir motoru kendi sürecinde koşar; çıkış kodunu döndürür. `lane` verilmezse tek şerittir. */
  async function runEngine(name, lane, args) {
    if (interrupted) return 130;
    const directory = join(runRoot, `${name}-${lane ?? 'selected'}`);
    await mkdir(directory, { recursive: true });
    return new Promise((resolve) => {
      const child = spawn(process.execPath, [playwrightCli, 'test', `--project=${name}`, ...args], {
        stdio: 'inherit',
        env: {
          ...process.env,
          VOL_UI_E2E_PORT: String(ports[name]),
          VOL_UI_E2E_OUTPUT_DIR: join(directory, 'test-results'),
          VOL_UI_E2E_REPORT_FILE: join(directory, 'report.json'),
          ...(lane ? { VOL_UI_E2E_LANE: lane } : {}),
        },
      });
      children.add(child);
      let spawnError = null;
      child.on('error', (error) => {
        spawnError = error.code ?? error.name;
      });
      child.on('close', (code, signal) => {
        children.delete(child);
        void settleEngine(name, lane, directory, code ?? 1, signal, spawnError)
          .then(resolve)
          .catch((error) => {
            // Taşıma başarısızsa geçici kanıtı silme; kullanıcı eldeki yolu görebilsin.
            console.error(
              `[e2e] Kanıt arşivleme hatası (${error.code ?? error.name}); geçici çıktı: ${relative(repoRoot, directory)}`,
            );
            resolve(1);
          });
      });
    });
  }

  const signals = ['SIGINT', 'SIGTERM'];
  // process.on('SIGINT', callback) callback'e sinyal adı GEÇİRMEZ;
  // her sinyal kendi closure'ıyla alt süreçlere doğru iletilir.
  const handlers = signals.map((signal) => [
    signal,
    () => {
      if (interrupted) return;
      interrupted = true;
      for (const child of children) child.kill(signal);
    },
  ]);
  for (const [signal, handler] of handlers) process.on(signal, handler);

  const verdict = (code) => (code === 0 ? 'geçti' : `düştü (${code})`);

  async function finish(codes) {
    // Yalnız kendi boş run dizinini kaldır; başarısız arşivlemenin bıraktığı
    // dosyaları asla topluca temizleme.
    await rmdir(runRoot).catch(() => undefined);
    // Başlangıç budaması yeterli değildir: tam 10 hata koşusu varken yeni bir
    // hata 11. koşuyu yaratır. Bütün motor/şerit süreçleri kapandıktan sonra
    // tekrar buda; yeni arşiv de aynı sayım ve yaş sınırına dahildir.
    await pruneOld(failuresRoot, 10, 14 * DAY);
    return interrupted ? 130 : (codes.find((code) => code !== 0) ?? 0);
  }

  try {
    if (extra.length > 0) {
      const codes = await Promise.all(projects.map((name) => runEngine(name, undefined, extra)));
      console.log(
        `[e2e] ${projects.map((name, index) => `${name}: ${verdict(codes[index])}`).join(' · ')}`,
      );
      return await finish(codes);
    }

    const main = await Promise.all(projects.map((name) => runEngine(name, 'main', [])));
    // Sessiz şerit ana şeridin düşmesine bakmaz: tam kanıt tek koşuda gelir.
    const quiet = [];
    if (!interrupted) {
      for (const name of projects) quiet.push(await runEngine(name, 'quiet', ['--workers=1']));
    }

    console.log(
      `[e2e] ${projects
        .map(
          (name, index) => `${name}: ana ${verdict(main[index])}, sessiz ${verdict(quiet[index])}`,
        )
        .join(' · ')}`,
    );
    return await finish([...main, ...quiet]);
  } finally {
    for (const [signal, handler] of handlers) process.off(signal, handler);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const require = createRequire(import.meta.url);
  const playwrightCli = require.resolve('@playwright/test/cli');
  const { tsImport } = await import('tsx/esm/api');
  const config = await tsImport(
    new URL('../playwright.config.ts', import.meta.url).href,
    import.meta.url,
  );
  process.exitCode = await runE2E(
    {
      projects: (config.default.projects ?? []).map((project) => project.name),
      ports: config.ENGINE_PORTS ?? {},
      playwrightCli,
    },
    process.argv.slice(2),
  );
}
