import { spawnSync } from 'node:child_process';

const PROBE = `
import { chromium, webkit } from '@playwright/test';
let failed = false;
for (const [name, engine] of Object.entries({ chromium, webkit })) {
  try {
    const browser = await engine.launch({ headless: true, timeout: 10000 });
    await browser.close();
    console.log(name + ': OK');
  } catch (error) {
    console.error(name + ': ' + error.message);
    failed = true;
  }
}
process.exitCode = failed ? 1 : 0;
`;

export function checkPlaywrightRuntime(packageName, run = spawnSync) {
  const result = run(
    'pnpm',
    ['--filter', packageName, 'exec', 'node', '--input-type=module', '-e', PROBE],
    {
      encoding: 'utf8',
      timeout: 30_000,
    },
  );
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  return {
    ok:
      result.status === 0 && ['chromium: OK', 'webkit: OK'].every((line) => output.includes(line)),
    output: output || String(result.error ?? 'Tarayıcı sorgusu sonuç vermedi'),
  };
}
