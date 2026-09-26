import type { Sha256 } from './canonical';
import { prettyCanonicalJson } from './canonical';
import { canaryReviews, loadCanaries, runCanary, type CanaryReviewStatus } from './canary';
import { regressionCorpus, regressionDecisions, type RegressionDecisionStatus } from './regression';
import { repoSampleResolver } from './samples';
import { decodeWithFfmpeg } from './toolchain';
import { writeAuditionCopy, EXPORT_ROOT } from './audition';
import { resolveInside, writeFileAtomic } from './fs';

/**
 * Tek-komut dinleme paketi (F7b): insan incelemesi bekleyen her ses
 * `export/listening/` altına toplanır — organik canary'ler (programdan
 * kanonik render) ve production referansları (gönderilen OGG baytının
 * FFmpeg çözümü). `listening.json` makine-okunur envanter, `index.html`
 * statik dinleme sayfasıdır; ikisi de git-dışı export ağacında durur.
 *
 * Paket YALNIZ dosya ve durum taşır: "iyi ses" kararı insanın.
 * Durumlar gerçek kayıtlardan gelir — canary `reviews.json`, referans
 * `regression/decisions.json` (kararın bağlı olduğu PCM hash manifest
 * hash'iyle eşleşiyorsa geçerli, yoksa `undecided`).
 */
export const LISTENING_ROOT = `${EXPORT_ROOT}/listening`;
export const LISTENING_SCHEMA = 'ListeningPackageV1';

export type ReferenceListenStatus = RegressionDecisionStatus | 'undecided';

export interface ListeningItemV1 {
  readonly id: string;
  readonly kind: 'canary' | 'reference';
  /** Repo-göreli WAV (export ağacı). */
  readonly file: string;
  readonly title: string;
  readonly status: CanaryReviewStatus | ReferenceListenStatus;
  readonly guide: readonly string[];
  readonly manifest: string | null;
  readonly assetClass: string | null;
  readonly pcmHash: Sha256;
}

export interface ListeningPackageV1 {
  readonly schema: typeof LISTENING_SCHEMA;
  readonly counts: {
    readonly canary: number;
    readonly reference: number;
    readonly pending: number;
  };
  readonly items: readonly ListeningItemV1[];
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

const PAGE_CSS = `body{font:14px/1.5 system-ui,sans-serif;margin:2rem auto;max-width:56rem;padding:0 1rem;color:#1c1c1c}
h1{font-size:1.3rem}h2{font-size:1.05rem;margin-top:2rem;border-bottom:1px solid #ccc}
.item{margin:.9rem 0;padding:.6rem .8rem;border:1px solid #ddd;border-radius:6px}
.item header{display:flex;gap:.6rem;align-items:baseline;flex-wrap:wrap}
.item .id{font-family:ui-monospace,monospace;font-size:.85rem}
.badge{padding:.05rem .5rem;border-radius:10px;font-size:.75rem;border:1px solid #999}
.pending-human,.undecided{background:#fff8e1}.heard-acceptable,.accepted-change{background:#e8f5e9}
.heard-problem,.rejected-regression{background:#ffebee}
.guide{color:#555;font-size:.85rem;margin:.3rem 0}.meta{color:#777;font-size:.75rem}
audio{display:block;width:100%;margin-top:.4rem}`;

function itemHtml(item: ListeningItemV1): string {
  const rel = item.file.slice(`${LISTENING_ROOT}/`.length);
  const guide = item.guide.map((g) => `<div class="guide">${escapeHtml(g)}</div>`).join('');
  const meta =
    item.manifest === null
      ? ''
      : `<div class="meta">${escapeHtml(item.manifest)} · ${escapeHtml(
          item.assetClass ?? '',
        )} · <code>${escapeHtml(item.pcmHash)}</code></div>`;
  return `<div class="item">
<header><span class="id">${escapeHtml(item.id)}</span>
<span>${escapeHtml(item.title)}</span>
<span class="badge ${escapeHtml(item.status)}">${escapeHtml(item.status)}</span></header>
${guide}<audio controls preload="none" src="${escapeHtml(rel)}"></audio>${meta}
</div>`;
}

function pageHtml(pkg: ListeningPackageV1): string {
  const canaryRows = pkg.items
    .filter((i) => i.kind === 'canary')
    .map(itemHtml)
    .join('\n');
  const referenceRows = pkg.items
    .filter((i) => i.kind === 'reference')
    .map(itemHtml)
    .join('\n');
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8">
<title>Dinleme paketi</title><style>${PAGE_CSS}</style></head><body>
<h1>Dinleme paketi — ${pkg.counts.canary} canary, ${pkg.counts.reference} referans</h1>
<p>Bu sayfa yalnız dosya ve kayıtlı durum gösterir; beğeni kararı
canary için <code>audio:job canary review</code>, referans için
<code>audio:job regression decide</code> ile insan tarafından yazılır.</p>
<h2>Organik canary'ler</h2>
${canaryRows}
<h2>Production referansları</h2>
${referenceRows}
</body></html>`;
}

/**
 * Paketi kurar: WAV'ları yazar, `listening.json` ve `index.html`'i üretir.
 * Deterministiktir — tarih/saat yazmaz; aynı repo durumu aynı paketi verir.
 */
export function buildListeningPackage(repoRoot: string): ListeningPackageV1 {
  const items: ListeningItemV1[] = [];
  const samples = repoSampleResolver(repoRoot);
  const reviews = new Map(canaryReviews(repoRoot).map((r) => [r.id, r]));
  for (const canary of loadCanaries(repoRoot)) {
    const { result, render } = runCanary(canary, samples);
    const file = writeAuditionCopy(repoRoot, `${LISTENING_ROOT}/canary/${canary.id}.wav`, render);
    items.push({
      id: canary.id,
      kind: 'canary',
      file,
      title: canary.title,
      status: reviews.get(canary.id)?.status ?? 'pending-human',
      guide: canary.listeningGuide,
      manifest: null,
      assetClass: null,
      pcmHash: result.pcmHash,
    });
  }
  const decisions = regressionDecisions(repoRoot).decisions;
  for (const entry of regressionCorpus(repoRoot)) {
    const decoded = decodeWithFfmpeg(
      resolveInside(repoRoot, entry.assetPath, 'asset'),
      entry.assetPath,
    );
    const frames = decoded.channels[0]?.length ?? 0;
    const file = writeAuditionCopy(repoRoot, `${LISTENING_ROOT}/reference/${entry.id}.wav`, {
      channels: decoded.channels,
      sampleRate: decoded.sampleRate,
      duration: frames / decoded.sampleRate,
      seed: entry.seed,
      cost: { peakBytes: 0, workUnits: 0 },
    });
    const decision = decisions[entry.id];
    const status: ReferenceListenStatus =
      decision && decision.pcmHash === entry.pcmHash ? decision.status : 'undecided';
    items.push({
      id: entry.id,
      kind: 'reference',
      file,
      title: entry.id,
      status,
      guide: [],
      manifest: entry.manifest,
      assetClass: entry.assetClass,
      pcmHash: entry.pcmHash,
    });
  }
  const pending = items.filter(
    (i) => i.status === 'pending-human' || i.status === 'undecided',
  ).length;
  const pkg: ListeningPackageV1 = {
    schema: LISTENING_SCHEMA,
    counts: {
      canary: items.filter((i) => i.kind === 'canary').length,
      reference: items.filter((i) => i.kind === 'reference').length,
      pending,
    },
    items,
  };
  writeFileAtomic(
    resolveInside(repoRoot, `${LISTENING_ROOT}/listening.json`, 'listening.json'),
    prettyCanonicalJson(pkg),
  );
  writeFileAtomic(
    resolveInside(repoRoot, `${LISTENING_ROOT}/index.html`, 'index.html'),
    pageHtml(pkg),
  );
  return pkg;
}
