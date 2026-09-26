/**
 * `pnpm audio:listen` — tek-komut dinleme paketi (F7b). İnsan incelemesi
 * bekleyen her ses `export/listening/` altına toplanır: canary'ler kanonik
 * render'dan, referanslar gönderilen OGG baytının çözümünden WAV olur;
 * `listening.json` envanter + `index.html` statik sayfa yazılır.
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
