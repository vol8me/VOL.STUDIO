/**
 * Motorlar arası determinizm denetimi: aynı tohum ve senaryo Node (V8), Chromium (V8) ve
 * WebKit (JavaScriptCore) içinde koşar, karmalar karşılaştırılır. Sunucu ile istemci aynı
 * simülasyonu ayrı motorlarda koşturacaksa bu eşitlik zorunludur.
 *
 *   pnpm --filter @volstudio/vol-test2 exec tsx scripts/engines.ts
 */
import { build } from 'esbuild';
import { chromium, webkit, type Browser } from '@playwright/test';
import { run, time } from './engine-entry';

const CASES = [
  { seed: 0x5eed1234, size: 64, belts: 500, units: 80, ticks: 6000, every: 500 },
  { seed: 99, size: 128, belts: 3000, units: 300, ticks: 3000, every: 500 },
  { seed: 7, size: 256, belts: 12000, units: 800, ticks: 1500, every: 250 },
];

const bundle = await build({
  entryPoints: [
    new URL('./engine-entry.ts', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
  ],
  bundle: true,
  format: 'iife',
  globalName: 'Engine',
  write: false,
  tsconfig: new URL('../tsconfig.json', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
  logLevel: 'error',
});
const code = bundle.outputFiles[0].text;

const reference = CASES.map((entry) =>
  run(entry.seed, entry.size, entry.belts, entry.units, entry.ticks, entry.every),
);
const nodeMs = time(256, 12000, 800, 600);
const report: Record<string, unknown> = { node: { msPerTick256: nodeMs } };

for (const [name, launcher] of [
  ['chromium', chromium],
  ['webkit', webkit],
] as const) {
  let browser: Browser | undefined;
  try {
    browser = await launcher.launch();
    const page = await browser.newPage();
    await page.setContent('<!doctype html><title>engine</title>');
    await page.addScriptTag({ content: code });
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
      CASES,
    );
    const ms = await page.evaluate(() =>
      (window as unknown as { Engine: { time: (...args: number[]) => number } }).Engine.time(
        256,
        12000,
        800,
        600,
      ),
    );
    const identical = JSON.stringify(hashes) === JSON.stringify(reference);
    report[name] = { identical, msPerTick256: ms, version: browser.version() };
    if (!identical) {
      const first = hashes.findIndex(
        (row, index) => JSON.stringify(row) !== JSON.stringify(reference[index]),
      );
      report[`${name}Mismatch`] = {
        case: first,
        got: hashes[first]?.slice(0, 4),
        expected: reference[first]?.slice(0, 4),
      };
    }
  } catch (error) {
    report[name] = { error: error instanceof Error ? error.message : String(error) };
  } finally {
    await browser?.close();
  }
}
console.log(
  JSON.stringify(
    { cases: CASES.length, hashesPerCase: reference.map((row) => row.length), ...report },
    null,
    2,
  ),
);
