import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin, ViteDevServer } from 'vite';
// Uzantı AÇIK yazılır: bu dosya Vite yapılandırma zincirindedir ve Vite'ın
// yerli yapılandırma yükleyicisi uzantısız içe aktarımı desteklemiyor.
import { isInsideOutput, resolveTarget } from './paths.ts';

/**
 * Editörün çıktıyı REPOYA yazmasını sağlayan geliştirme sunucusu eklentisi
 * — §8.11.
 *
 * **Yalnızca `pnpm dev` altında çalışır.** `apply: 'serve'` sayesinde üretilen
 * pakete girmez; yayınlanmış bir sayfanın diske yazma yolu yoktur.
 *
 * Yazma sınırı `paths.ts`tedir ve saf bir fonksiyondur; burada yalnızca
 * taşıma (HTTP) işi yapılır.
 *
 * **PNG'yi SUNUCU üretir, tarayıcı değil.** İstemci yalnızca belgeyi gönderir;
 * sunucu ortak `createForgeArtifact` hattıyla yazar. Tarayıcıda `canvas.toBlob`
 * kullanmak başka bir kodlayıcı demek olurdu ve editörden kaydedilen dosya
 * CLI'ın yazdığıyla bayt bayt aynı olmazdı — Tur 4'ün kanıtı tam olarak bunu
 * istiyor (§8.15). Yan kazanç: gövde küçülür, tarayıcıya PNG kodlayıcı
 * girmez (D8).
 *
 * **Çekirdek `ssrLoadModule` ile yüklenir, doğrudan import EDİLMEZ.** Bu dosya
 * Vite YAPILANDIRMASINDAN çağrılır ve yapılandırma düz Node ESM ile yüklenir;
 * orada `core/visual`in dizin barrel'ları çözülmez. Vite'ın kendi
 * çözümleyicisini kullanmak hem bunu kaldırır hem de tarayıcıyla AYNI modül
 * grafiğini garanti eder.
 */

const OUTPUT_ROOT = resolve(import.meta.dirname, '../output');
const MAX_BODY_BYTES = 32 * 1024 * 1024;

interface VisualModule {
  PRESET_CATEGORIES: readonly string[];
}

interface EncodeModule {
  createForgeArtifact: (doc: unknown) => {
    result: { width: number; height: number };
    png: Buffer;
    report: { pass: boolean; metrics: readonly unknown[] };
  };
}

type ForgeModules = VisualModule & EncodeModule;

async function loadVisual(server: ViteDevServer): Promise<ForgeModules> {
  const visual = (await server.ssrLoadModule('@volstudio/core/visual')) as unknown as VisualModule;
  const encode = (await server.ssrLoadModule(
    '@volstudio/core/visual/encode',
  )) as unknown as EncodeModule;
  return { ...visual, ...encode };
}

export interface SaveRequest {
  category: string;
  name: string;
  doc: unknown;
}

function send(response: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  response.statusCode = status;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.end(body);
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    // Sınırsız gövde okumak, tek bir istekle belleği tüketmeye açık kapı
    // bırakırdı; 2048² bir PNG bu sınırın çok altındadır.
    if (size > MAX_BODY_BYTES) throw new Error('gövde çok büyük');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

/** `output/` altındaki mevcut çıktılar — kategori → ad listesi. */
export function listOutputs(
  categories: readonly string[],
  root = OUTPUT_ROOT,
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const category of categories) {
    const directory = join(root, category);
    if (!statSync(directory, { throwIfNoEntry: false })?.isDirectory()) continue;
    const names = readdirSync(directory)
      .filter((entry) => entry.endsWith('.json'))
      .map((entry) => entry.slice(0, -'.json'.length))
      .sort();
    if (names.length > 0) result[category] = names;
  }
  return result;
}

export function forgeOutputPlugin(): Plugin {
  return {
    name: 'vol-forge-output',
    apply: 'serve',
    configureServer(server) {
      let cached: Promise<ForgeModules> | null = null;
      const visual = (): Promise<ForgeModules> => {
        cached ??= loadVisual(server);
        return cached;
      };

      server.middlewares.use('/api/forge/list', (_request, response) => {
        void visual()
          .then(({ PRESET_CATEGORIES }) => {
            send(response, 200, {
              categories: PRESET_CATEGORIES,
              outputs: listOutputs(PRESET_CATEGORIES),
            });
          })
          .catch((error: unknown) => {
            send(response, 500, { error: error instanceof Error ? error.message : String(error) });
          });
      });

      server.middlewares.use('/api/forge/load', (request, response) => {
        const url = new URL(request.url ?? '', 'http://localhost');
        const relative = url.searchParams.get('path') ?? '';
        if (!isInsideOutput(relative) || !relative.endsWith('.json')) {
          send(response, 400, { error: 'geçersiz yol' });
          return;
        }
        const absolute = join(OUTPUT_ROOT, relative);
        if (!statSync(absolute, { throwIfNoEntry: false })?.isFile()) {
          send(response, 404, { error: 'bulunamadı' });
          return;
        }
        send(response, 200, { doc: JSON.parse(readFileSync(absolute, 'utf-8')) as unknown });
      });

      server.middlewares.use('/api/forge/save', (request, response) => {
        if (request.method !== 'POST') {
          send(response, 405, { error: 'POST bekleniyor' });
          return;
        }
        void Promise.all([readBody(request), visual()])
          .then(([raw, { PRESET_CATEGORIES, createForgeArtifact }]) => {
            const payload = JSON.parse(raw) as SaveRequest;
            const resolved = resolveTarget(payload.category, payload.name, PRESET_CATEGORIES);
            if (!resolved.ok) {
              send(response, 400, { error: resolved.reason });
              return;
            }
            const { target } = resolved;
            if (!isInsideOutput(target.docPath) || !isInsideOutput(target.pngPath)) {
              send(response, 400, { error: 'yol sınır dışına çıkıyor' });
              return;
            }

            // CLI'ın `render` ve `qa` komutlarıyla AYNI atomik hat: belge
            // doğrulanır, render edilir, ölçülür ve PNG'ye kodlanır.
            const artifact = createForgeArtifact(payload.doc);

            const docAbsolute = join(OUTPUT_ROOT, target.docPath);
            const pngAbsolute = join(OUTPUT_ROOT, target.pngPath);
            mkdirSync(dirname(docAbsolute), { recursive: true });
            writeFileSync(docAbsolute, `${JSON.stringify(payload.doc, null, 2)}\n`);
            writeFileSync(pngAbsolute, artifact.png);

            send(response, 200, {
              docPath: target.docPath,
              pngPath: target.pngPath,
              width: artifact.result.width,
              height: artifact.result.height,
              qaPass: artifact.report.pass,
              qaMetrics: artifact.report.metrics,
            });
          })
          .catch((error: unknown) => {
            send(response, 500, { error: error instanceof Error ? error.message : String(error) });
          });
      });
    },
  };
}
