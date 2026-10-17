import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { SCENARIOS } from '@/config/scenarios';
import { scenarioDigest } from '../../support/scenarioDigest';

const run = promisify(execFile);
const packageRoot = resolve(import.meta.dirname, '../../..');

/** Gerçek Node süreci: jsdom, Vite alias'ı ve CSS yükleyicisi yoktur. */
async function headless(seed: number): Promise<unknown> {
  const tsx = pathToFileURL(createRequire(import.meta.url).resolve('tsx/esm')).href;
  const script = resolve(import.meta.dirname, '../../support/headlessScenarios.ts');
  const { stdout } = await run(process.execPath, ['--import', tsx, script, String(seed)], {
    cwd: packageRoot,
  });
  return JSON.parse(stdout);
}

describe('başsız senaryo koşusu (B19)', () => {
  it('Node sürecinde DOM ve CSS yükleyicisi olmadan bütün senaryolar sabit tohumla koşar', async () => {
    const digest = await headless(731);
    expect(Object.keys(digest as object).sort()).toEqual(Object.keys(SCENARIOS).sort());
    // Aynı tohum: başsız süreç ile test sürecinin sonucu birebir aynıdır.
    expect(digest).toEqual(JSON.parse(JSON.stringify(scenarioDigest(731))));
  });

  it('tohum sonucu belirler; farklı tohum farklı yerleşim üretir', async () => {
    expect(await headless(11)).not.toEqual(await headless(12));
  });
});
