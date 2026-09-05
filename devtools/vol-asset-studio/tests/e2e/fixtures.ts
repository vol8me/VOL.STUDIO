import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import sharp from 'sharp';

const DEFAULT_DIRECTORY = resolve(import.meta.dirname, '../../../pen.dev/pen_export');
export const EDITOR_FIXTURE_NAME = '__e2e-editor-fixture.png';
export const EDITOR_FIXTURE_PATH = join(DEFAULT_DIRECTORY, EDITOR_FIXTURE_NAME);
const HARDENING_FIXTURE_NAME = '__e2e-hardening.png';

export async function writeEditorFixture(directory = DEFAULT_DIRECTORY): Promise<void> {
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, EDITOR_FIXTURE_NAME),
    await sharp({
      create: { width: 8, height: 8, channels: 4, background: '#204060ff' },
    })
      .png()
      .toBuffer(),
  );
}

/** Fixture'lar bütün motorlar bitene kadar yaşar; watcher artığı sonraki testi bozamaz. */
export async function setupFixtures(directory = DEFAULT_DIRECTORY): Promise<() => Promise<void>> {
  const cleanup = async (): Promise<void> => {
    await Promise.all(
      [EDITOR_FIXTURE_NAME, HARDENING_FIXTURE_NAME].map((name) =>
        rm(join(directory, name), { force: true }),
      ),
    );
  };
  try {
    await writeEditorFixture(directory);
    await writeFile(
      join(directory, HARDENING_FIXTURE_NAME),
      await sharp({
        create: { width: 16, height: 16, channels: 4, background: '#3a5a78ff' },
      })
        .png()
        .toBuffer(),
    );
    return cleanup;
  } catch (error) {
    await cleanup();
    throw error;
  }
}

export default async function globalSetup(): Promise<() => Promise<void>> {
  return setupFixtures();
}
