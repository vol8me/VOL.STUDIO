import { createHash } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { APIRequestContext } from '@playwright/test';
import type { CatalogResponse } from '../../shared/contracts';
import sharp from 'sharp';

const DEFAULT_DIRECTORY = resolve(import.meta.dirname, '../../../pen.dev/pen_export');
export const EDITOR_FIXTURE_NAME = '__e2e-editor-fixture.png';
export const EDITOR_FIXTURE_PATH = join(DEFAULT_DIRECTORY, EDITOR_FIXTURE_NAME);
const HARDENING_FIXTURE_NAME = '__e2e-hardening.png';

/**
 * Teste ÖZEL fixture yazar ve sunucunun bildirmesi beklenen revizyonu döner.
 *
 * Paylaşılan tek bir fixture, testleri birbirine bağlar: kaydeden test dosyayı
 * değiştirir, sonraki testin kurulumu onu geri yazar ve iki sunucu süreci
 * (tam matriste chromium + firefox) aynı dosyayı izler. Ortaya çıkan yarış
 * "kaydet 409 aldı" belirtisini yük altında rastgele üretir.
 *
 * Dosya adı teste özel olduğunda o sınıf YAPISAL olarak kapanır: hiçbir test
 * başka bir testin dosyasını görmez ve her fixture sunucu için YENİ bir yoldur,
 * yani `waitForFixtureRevision` gerçekten bir keşif bekler — "zaten doğruydu"
 * diye anında dönmez.
 */
export async function writeEditorFixture(
  name = EDITOR_FIXTURE_NAME,
  directory = DEFAULT_DIRECTORY,
): Promise<string> {
  await mkdir(directory, { recursive: true });
  const bytes = await sharp({
    create: { width: 8, height: 8, channels: 4, background: '#204060ff' },
  })
    .png()
    .toBuffer();
  await writeFile(join(directory, name), bytes);
  return createHash('sha256').update(bytes).digest('hex');
}

/** Teste özel fixture adı — `__e2e-editor-fixture` ön ekiyle aranabilir kalır. */
export function editorFixtureName(testId: string): string {
  return `__e2e-editor-fixture-${testId.replace(/[^a-z0-9]/gi, '').slice(0, 24)}.png`;
}

/** Teste özel fixture'ı siler; watcher artığı sonraki koşuya taşınmaz. */
export async function removeEditorFixture(
  name: string,
  directory = DEFAULT_DIRECTORY,
): Promise<void> {
  await rm(join(directory, name), { force: true });
}

/**
 * Sunucu fixture'ın YENİ revizyonunu görene kadar bekler.
 *
 * Test dosyayı doğrudan diske yazar; sunucu onu kendi izleyicisiyle fark eder.
 * Bu iki olay arasında editör açılırsa belge BAYAT revizyonla yüklenir ve
 * kaydetmede 409 alır — testin kendi kurulumu ürün hatası gibi görünür.
 * Yoklama, kurulumu gözlemlenebilir bir olguya bağlar: katalog yeni revizyonu
 * bildirdiğinde yazma sisteme ULAŞMIŞTIR.
 */
export async function waitForFixtureRevision(
  request: APIRequestContext,
  revision: string,
  name = EDITOR_FIXTURE_NAME,
  timeoutMs = 15_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let seen: string | undefined;
  while (Date.now() < deadline) {
    const response = await request.get('/api/v1/catalog');
    if (response.ok()) {
      const catalog = (await response.json()) as CatalogResponse;
      seen = catalog.assets.find((asset) => asset.name === name)?.revision;
      if (seen === revision) return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(
    `fixture revizyonu ${timeoutMs} ms içinde sunucuya ulaşmadı (beklenen ${revision}, görülen ${
      seen ?? 'yok'
    })`,
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
    await writeEditorFixture(EDITOR_FIXTURE_NAME, directory);
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
