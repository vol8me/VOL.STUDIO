/**
 * `pnpm audio:listen` — tek-komut dinleme paketi (F7b + R7). İnsan
 * incelemesi bekleyen her ses `export/listening/` altına toplanır:
 * canary kanonik render'ı, benchmark kaynak+teslim+loop2x+overlay
 * varyantları, referans kaynak/gönderim çiftleri ve v1↔v2 karşılaştırma
 * çiftleri WAV olur; `listening.json` envanter + `index.html` statik
 * sayfa yazılır. Karar komutları öğede görünür; beğeni insanınındır.
 */
import { buildListeningPackage, LISTENING_ROOT } from '../src/protocol';
import { findRepoRoot } from './lib/args';

const started = performance.now();
const pkg = buildListeningPackage(findRepoRoot(process.cwd()));
process.stdout.write(
  `${JSON.stringify(
    {
      root: LISTENING_ROOT,
      page: `${LISTENING_ROOT}/index.html`,
      counts: pkg.counts,
      evidence: { wallMs: Number((performance.now() - started).toFixed(1)) },
    },
    null,
    2,
  )}\n`,
);
