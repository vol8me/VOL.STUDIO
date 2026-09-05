import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { EDITOR_FIXTURE_NAME, setupFixtures, writeEditorFixture } from '../e2e/fixtures';

it('E2E varlıkları dosyalar arasında korunur ve yalnız matris kapanışında temizlenir', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'vol-e2e-lifetime-'));
  try {
    await writeFile(join(directory, 'user.txt'), 'koru');
    const cleanup = await setupFixtures(directory);
    const files = await readdir(directory);
    expect(files.sort()).toEqual([EDITOR_FIXTURE_NAME, '__e2e-hardening.png', 'user.txt'].sort());
    const png = await readFile(join(directory, EDITOR_FIXTURE_NAME));
    await writeFile(join(directory, EDITOR_FIXTURE_NAME), 'test düzenlemesi');
    await writeEditorFixture(directory);
    expect(await readFile(join(directory, EDITOR_FIXTURE_NAME))).toEqual(png);
    await cleanup();
    expect(await readdir(directory)).toEqual(['user.txt']);
    await cleanup();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
