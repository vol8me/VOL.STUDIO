/**
 * Cihaz ölçümü: simülasyon motorunu uzak bir Chromium'un (Android Chrome, Deck'teki Chrome) sayfasında koşturur;
 * karmaları Node referansıyla karşılaştırır (farklı CPU mimarisinde determinizm) ve adım sürelerini ölçer.
 * Paketlenmiş uygulama değil, tarayıcı motorudur: yalnız motor maliyetini ve determinizmi söyler.
 *
 *   pnpm --filter @volstudio/vol-forge exec tsx scripts/device-bench.ts --cdp http://127.0.0.1:9222 --label tablet
 *
 * Sonuç `records/devices/<label>.json` dosyasına yazılır (git dışı).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { run, type StepStats } from './engine-entry';

const HASH_CASES = [
  { seed: 0x5eed1234, size: 64, belts: 500, units: 80, ticks: 6000, every: 500 },
  { seed: 99, size: 128, belts: 3000, units: 300, ticks: 3000, every: 500 },
  { seed: 7, size: 256, belts: 12000, units: 800, ticks: 1500, every: 250 },
];
const STEP_CASES = [
  { size: 128, belts: 3000, units: 150, ticks: 600 },
  { size: 256, belts: 8000, units: 400, ticks: 600 },
  { size: 256, belts: 21000, units: 600, ticks: 600 },
];

function option(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const cdp = option('cdp', 'http://127.0.0.1:9222');
const label = option('label', 'device').replace(/[^a-z0-9-]/gi, '');

const root = (path: string): string =>
  new URL(path, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const bundle = await build({
  entryPoints: [root('./engine-entry.ts')],
  bundle: true,
  format: 'iife',
  globalName: 'Engine',
  write: false,
  tsconfig: root('../tsconfig.json'),
  logLevel: 'error',
});
const code = bundle.outputFiles[0].text;

const reference = HASH_CASES.map((entry) =>
  run(entry.seed, entry.size, entry.belts, entry.units, entry.ticks, entry.every),
);

const browser = await chromium.connectOverCDP(cdp);
const context = browser.contexts()[0] ?? (await browser.newContext());
const page = await context.newPage();
try {
  await page.setContent('<!doctype html><title>bench</title>');
  await page.addScriptTag({ content: code });
  const environment = await page.evaluate(() => ({
    userAgent: navigator.userAgent,
    cores: navigator.hardwareConcurrency,
    memoryGb: (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? null,
  }));
  const hashes = await page.evaluate(
    (cases) =>
      cases.map((entry) =>
        (window as unknown as { Engine: { run: (...args: number[]) => number[] } }).Engine.run(
          entry.seed,
          entry.size,
          entry.belts,
          entry.units,
          entry.ticks,
          entry.every,
        ),
      ),
    HASH_CASES,
  );
  const identical = JSON.stringify(hashes) === JSON.stringify(reference);
  const timings: StepStats[] = [];
  for (const entry of STEP_CASES) {
    timings.push(
      await page.evaluate(
        (args) =>
          (
            window as unknown as {
              Engine: { steps: (...values: number[]) => StepStats };
            }
          ).Engine.steps(args.size, args.belts, args.units, args.ticks),
        entry,
      ),
    );
  }
  const report = {
    label,
    measuredAt: new Date().toISOString(),
    browserVersion: browser.version(),
    environment,
    determinism: { identicalToNode: identical, cases: HASH_CASES.length },
    steps: STEP_CASES.map((entry, index) => ({ ...entry, ...timings[index] })),
    budgetMs: 1000 / 30,
  };
  await mkdir(root('../records/devices'), { recursive: true });
  await writeFile(root(`../records/devices/${label}.json`), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await page.close().catch(() => undefined);
  await browser.close().catch(() => undefined);
}
