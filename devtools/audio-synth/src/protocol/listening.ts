import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Sha256 } from '../kernel/canonical';
import { hashPcm, prettyCanonicalJson } from '../kernel/canonical';
import { canaryReviews, loadCanaries, runCanary, type CanaryReviewStatus } from './canary';
import {
  benchmarkReviews,
  loadBenchmarkTasks,
  type BenchmarkPartV1,
  type BenchmarkTaskV1,
} from './benchmark';
import { regressionCorpus, regressionDecisions, type RegressionDecisionStatus } from './regression';
import { renderForKind } from './kinds';
import { repoSampleResolver } from './samples';
import type { SampleResolver } from '../program/samples';
import { decodeWithFfmpeg } from './toolchain';
import { encodeQualityOf } from './encodeProfiles';
import { checkMusic } from './music';
import { REFERENCE_MIX_ID } from '../music/stem';
import { materialize } from '../program/dimensions';
import { renderProgram } from '../program/render';
import { writeOgg } from '../writer';
import type { AssetClass } from '../analysis/assetQa';
import { writeAuditionCopy, EXPORT_ROOT } from './audition';
import { readJsonFile, resolveInside, writeFileAtomic } from './fs';

/**
 * Tek-komut dinleme paketi: insan incelemesi bekleyen her ses
 * `export/listening/` altına toplanır:
 *
 *  - **canary**: kanonik `runCanary` render'ı; karar `canary review`.
 *  - **benchmark**: 14 görevin her parçası kaynak PCM + encode/decode edilmiş
 *    "gönderim" varyantı yan yana; `codec-loop-seam` taşıyan parçalar iki
 *    ardışık tur (loop2x) olarak da verilir; müzik parçalarında stinger
 *    cue'ları döngü yatağı üzerine bindirilmiş `overlay` öğeleri üretir.
 *    Karar `benchmark review <taskId>` (görev başına tek beyan).
 *  - **reference**: yayımlanmış manifest başına kaynak yeniden render +
 *    gönderilen OGG'nin çözümü; `integration.loop` taşıyanlar ayrıca
 *    loop2x varyantı alır. Karar `regression decide`.
 *
 * `listening.json` makine-okunur envanter, `index.html` statik dinleme
 * sayfasıdır ve her öğede kayıt komutunu açıkça gösterir. Paket YALNIZ dosya
 * ve durum taşır: "iyi ses" kararı insanın; hiçbir dinleme sonucu
 * uydurulmaz. Durumlar gerçek kayıtlardan gelir — canary `reviews.json`,
 * benchmark `corpus/benchmarks/reviews.json` (sürüm uyuşmazlığı pending sayılır),
 * referans `regression/decisions.json` (PCM-hash bağı).
 */
export const LISTENING_ROOT = `${EXPORT_ROOT}/listening`;
export const LISTENING_SCHEMA = 'ListeningPackageV1';

export type ReferenceListenStatus = RegressionDecisionStatus | 'undecided';
/** Canary/benchmark beyanları aynı üçlüyü taşır; tek birleşik liste. */
export type ListeningStatus =
  | CanaryReviewStatus
  | RegressionDecisionStatus
  | 'undecided'
  | 'listen-only';

export type ListeningRole = 'source' | 'delivery' | 'loop2x' | 'overlay';

export interface ListeningItemV1 {
  readonly id: string;
  readonly kind: 'canary' | 'benchmark' | 'reference';
  /** Repo-göreli WAV (export ağacı). */
  readonly file: string;
  readonly title: string;
  readonly status: ListeningStatus;
  readonly guide: readonly string[];
  readonly manifest: string | null;
  readonly assetClass: string | null;
  readonly pcmHash: Sha256 | null;
  /** index.html'de gösterilen karar komutu; kararsız öğelerde null. */
  readonly decision: string | null;
  /** Yan yana varyant grubu (`ref:…`, `task:…`, `aa:…`). */
  readonly group: string | null;
  /** Grup içi rol; tekil öğelerde null. */
  readonly role: ListeningRole | null;
}

export interface ListeningPackageV1 {
  readonly schema: typeof LISTENING_SCHEMA;
  readonly counts: {
    readonly canary: number;
    readonly benchmark: number;
    readonly reference: number;
    readonly pending: number;
  };
  readonly items: readonly ListeningItemV1[];
}

const CLI = 'pnpm --filter @volstudio/audio-synth audio:job';
const REVIEW_STATUSES = 'heard-acceptable|heard-problem';
const DECIDE_STATUSES = 'accepted-change|rejected-regression';

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
.role{font-size:.7rem;color:#fff;background:#607d8b;border-radius:8px;padding:.05rem .45rem}
.pending-human,.undecided{background:#fff8e1}.heard-acceptable,.accepted-change{background:#e8f5e9}
.heard-problem,.rejected-regression{background:#ffebee}
.guide{color:#555;font-size:.85rem;margin:.3rem 0}.meta{color:#777;font-size:.75rem}
.cmd{font-family:ui-monospace,monospace;font-size:.72rem;color:#444;background:#f5f5f5;display:block;padding:.3rem .45rem;border-radius:4px;margin-top:.35rem;overflow-x:auto}
.group{border-left:3px solid #90a4ae;margin:1rem 0;padding-left:.8rem}
.group h3{font-size:.9rem;color:#37474f;margin:.4rem 0}
audio{display:block;width:100%;margin-top:.4rem}`;

function itemHtml(item: ListeningItemV1): string {
  const rel = item.file.slice(`${LISTENING_ROOT}/`.length);
  const guide = item.guide.map((g) => `<div class="guide">${escapeHtml(g)}</div>`).join('');
  const meta =
    item.manifest === null
      ? ''
      : `<div class="meta">${escapeHtml(item.manifest)} · ${escapeHtml(
          item.assetClass ?? '',
        )} · <code>${escapeHtml(item.pcmHash ?? '')}</code></div>`;
  const cmd = item.decision === null ? '' : `<code class="cmd">${escapeHtml(item.decision)}</code>`;
  const role = item.role === null ? '' : `<span class="role">${escapeHtml(item.role)}</span>`;
  return `<div class="item">
<header><span class="id">${escapeHtml(item.id)}</span>${role}
<span>${escapeHtml(item.title)}</span>
<span class="badge ${escapeHtml(item.status)}">${escapeHtml(item.status)}</span></header>
${guide}<audio controls preload="none" src="${escapeHtml(rel)}"></audio>${meta}${cmd}
</div>`;
}

function sectionHtml(title: string, items: readonly ListeningItemV1[]): string {
  const groups = new Map<string | null, ListeningItemV1[]>();
  for (const item of items) {
    const list = groups.get(item.group) ?? [];
    list.push(item);
    groups.set(item.group, list);
  }
  const rows = [...groups.entries()]
    .map(([group, members]) =>
      group === null
        ? members.map(itemHtml).join('\n')
        : `<div class="group"><h3>${escapeHtml(group)}</h3>${members
            .map(itemHtml)
            .join('\n')}</div>`,
    )
    .join('\n');
  return `<h2>${escapeHtml(title)}</h2>\n${rows || '<p>yok</p>'}`;
}

function pageHtml(pkg: ListeningPackageV1): string {
  const items = (kind: ListeningItemV1['kind']) => pkg.items.filter((i) => i.kind === kind);
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8">
<title>Dinleme paketi</title><style>${PAGE_CSS}</style></head><body>
<h1>Dinleme paketi — ${pkg.counts.canary} canary, ${pkg.counts.benchmark} benchmark, ${
    pkg.counts.reference
  } referans</h1>
<p>Bu sayfa yalnız dosya ve kayıtlı durum gösterir; her öğenin altında
karar komutu yazılıdır ve beğeni kararı yalnız insan beyanıyla kaydedilir.
<code>source</code> = programdan render, <code>delivery</code> = gönderilen
kodlamanın çözümü, <code>loop2x</code> = iki ardışık döngü turu (dikiş),
<code>overlay</code> = stinger'ın döngü yatağı üzerindeki hali.</p>
${sectionHtml('Organik canary' + "'" + 'ler', items('canary'))}
${sectionHtml('Benchmark görevleri', items('benchmark'))}
${sectionHtml('Production referansları', items('reference'))}
</body></html>`;
}

interface Pcm {
  readonly channels: Float32Array[];
  readonly sampleRate: number;
}

function writePcm(repoRoot: string, rel: string, pcm: Pcm): string {
  return writeAuditionCopy(repoRoot, rel, {
    channels: pcm.channels,
    sampleRate: pcm.sampleRate,
    duration: pcm.channels[0].length / pcm.sampleRate,
    seed: 0,
    cost: { peakBytes: 0, workUnits: 0 },
  });
}

const slug = (id: string) => id.replaceAll('/', '__').replaceAll(' ', '-');

/** Encode → decode: gönderilecek kodekte çözülmüş PCM (teslim varyantı). */
function delivered(tmp: string, name: string, pcm: Pcm, cls: AssetClass): Pcm {
  const file = join(tmp, `${slug(name)}.ogg`);
  writeOgg(
    file,
    {
      channels: pcm.channels,
      sampleRate: pcm.sampleRate,
      duration: pcm.channels[0].length / pcm.sampleRate,
    },
    { quality: encodeQualityOf(cls) },
  );
  const decoded = decodeWithFfmpeg(file, name);
  return { channels: decoded.channels, sampleRate: decoded.sampleRate };
}

/** İki ardışık döngü turu — dikiş dinlemesi için PCM'i kendine ekler. */
function twice(pcm: Pcm): Pcm {
  return {
    sampleRate: pcm.sampleRate,
    channels: pcm.channels.map((ch) => {
      const out = new Float32Array(ch.length * 2);
      out.set(ch, 0);
      out.set(ch, ch.length);
      return out;
    }),
  };
}

/** Stinger'ı döngü yatağının üzerine bindirir; tepe 0.95'e sınırlandırılır. */
function overlayOnBed(bed: Pcm, cue: Pcm): Pcm {
  const channels = cue.channels.map((cueCh, i) => {
    const bedCh = bed.channels[Math.min(i, bed.channels.length - 1)];
    const out = new Float32Array(cueCh.length);
    for (let n = 0; n < cueCh.length; n++) {
      out[n] = cueCh[n] + bedCh[n % bedCh.length];
    }
    return out;
  });
  let peak = 0;
  for (const ch of channels) for (const v of ch) peak = Math.max(peak, Math.abs(v));
  if (peak > 0.95) {
    const g = 0.95 / peak;
    for (const ch of channels) for (let n = 0; n < ch.length; n++) ch[n] *= g;
  }
  return { channels, sampleRate: cue.sampleRate };
}

function partAssetClass(part: BenchmarkPartV1): AssetClass {
  const policy = part.expectations.find((e) => e.kind === 'asset-policy') as
    | { assetClass: AssetClass }
    | undefined;
  if (!policy) throw new Error(`benchmark parçası asset-policy taşımıyor: ${part.id}`);
  return policy.assetClass;
}

/** Manifestteki döngü bayrağını okur (kayıt yoksa false). */
function manifestLoops(repoRoot: string, manifestPath: string): boolean {
  const doc = readJsonFile(resolveInside(repoRoot, manifestPath, 'manifest'), manifestPath) as {
    integration?: { loop?: boolean };
  };
  return doc.integration?.loop === true;
}

function canaryItems(repoRoot: string, samples: SampleResolver): ListeningItemV1[] {
  const reviews = new Map(canaryReviews(repoRoot).map((r) => [r.id, r]));
  return loadCanaries(repoRoot).map((canary) => {
    const { result, render } = runCanary(canary, samples);
    const file = writeAuditionCopy(repoRoot, `${LISTENING_ROOT}/canary/${canary.id}.wav`, render);
    return {
      id: canary.id,
      kind: 'canary' as const,
      file,
      title: canary.title,
      status: reviews.get(canary.id)?.status ?? 'pending-human',
      guide: canary.listeningGuide,
      manifest: null,
      assetClass: null,
      pcmHash: result.pcmHash,
      decision: `${CLI} canary review ${canary.id} --by human --status ${REVIEW_STATUSES} --note "<metin>"`,
      group: null,
      role: null,
    };
  });
}

function benchmarkItems(repoRoot: string, tmp: string, samples: SampleResolver): ListeningItemV1[] {
  const items: ListeningItemV1[] = [];
  const reviews = new Map(benchmarkReviews(repoRoot).map((r) => [r.id, r]));
  const add = (
    task: BenchmarkTaskV1,
    part: BenchmarkPartV1,
    role: ListeningRole,
    rel: string,
    pcm: Pcm,
    guide: string[],
    suffix = '',
  ) => {
    items.push({
      id: `${task.id}/${part.id}${suffix ? `/${suffix}` : ''}`,
      kind: 'benchmark',
      file: writePcm(repoRoot, rel, pcm),
      title: task.title,
      status: reviews.get(task.id)?.status ?? 'pending-human',
      guide,
      manifest: null,
      assetClass: part.source.kind === 'music' ? 'music' : partAssetClass(part),
      pcmHash: hashPcm(pcm.channels, pcm.sampleRate),
      decision: `${CLI} benchmark review ${task.id} --by human --status ${REVIEW_STATUSES} --note "<metin>"`,
      group: `task:${task.id}`,
      role,
    });
  };
  for (const task of loadBenchmarkTasks(repoRoot)) {
    for (const part of task.parts) {
      const claimsLoop = part.expectations.some((e) => e.kind === 'codec-loop-seam');
      const base = `${LISTENING_ROOT}/benchmark/${task.id}--${part.id}`;
      if (part.source.kind === 'music') {
        const check = checkMusic(repoRoot, {
          brief: part.source.brief,
          program: part.source.program,
          themeBook: null,
        });
        const mix = check.rendered.find((r) => r.stem === REFERENCE_MIX_ID);
        if (!mix) continue;
        const rate = part.source.program.sampleRate;
        const source: Pcm = { channels: mix.channels, sampleRate: rate };
        const delivery = delivered(tmp, base, source, 'music');
        add(task, part, 'source', `${base}.wav`, source, ['Kaynak mix (loop segmenti).']);
        add(
          task,
          part,
          'delivery',
          `${base}--delivery.wav`,
          delivery,
          ['Müzik kodlamasından çözülmüş gönderim.'],
          'delivery',
        );
        if (claimsLoop) {
          add(
            task,
            part,
            'loop2x',
            `${base}--loop2x.wav`,
            twice(delivery),
            ['İki ardışık tur — dikiş duyulmalı.'],
            'loop2x',
          );
        }
        const cues = new Map(check.rendered.map((r) => [r.stem, r]));
        for (const segment of part.source.program.segments ?? []) {
          if (segment.kind !== 'stinger') continue;
          const cue = cues.get(segment.id);
          if (!cue) continue;
          const cuePcm: Pcm = { channels: cue.channels, sampleRate: rate };
          add(
            task,
            part,
            'overlay',
            `${base}--overlay-${segment.id}.wav`,
            overlayOnBed(source, cuePcm),
            [`Stinger "${segment.id}" döngü yatağı üzerinde.`],
            `overlay-${segment.id}`,
          );
        }
        continue;
      }
      const program = materialize(part.source, [], {});
      const rendered = renderProgram(program, { samples });
      const source: Pcm = { channels: rendered.channels, sampleRate: rendered.sampleRate };
      const cls = partAssetClass(part);
      const delivery = delivered(tmp, base, source, cls);
      add(task, part, 'source', `${base}.wav`, source, ['Kaynak render.']);
      add(
        task,
        part,
        'delivery',
        `${base}--delivery.wav`,
        delivery,
        [`${cls} kodlamasından çözülmüş gönderim.`],
        'delivery',
      );
      if (claimsLoop) {
        add(
          task,
          part,
          'loop2x',
          `${base}--loop2x.wav`,
          twice(delivery),
          ['İki ardışık tur — dikiş duyulmalı.'],
          'loop2x',
        );
      }
    }
  }
  return items;
}

function referenceItems(repoRoot: string, samples: SampleResolver): ListeningItemV1[] {
  const items: ListeningItemV1[] = [];
  const decisions = regressionDecisions(repoRoot).decisions;
  for (const entry of regressionCorpus(repoRoot)) {
    const decision = decisions[entry.id];
    const status: ReferenceListenStatus =
      decision && decision.pcmHash === entry.pcmHash ? decision.status : 'undecided';
    const cmd = `${CLI} regression decide ${entry.id} --by human --status ${DECIDE_STATUSES} --pcm ${entry.pcmHash} --note "<metin>"`;
    const base = `${LISTENING_ROOT}/reference/${slug(entry.id)}`;
    const decoded = decodeWithFfmpeg(resolveInside(repoRoot, entry.assetPath, 'asset'), entry.id);
    const delivery: Pcm = { channels: decoded.channels, sampleRate: decoded.sampleRate };
    const source = renderForKind(entry.kind, entry.program, {
      seed: entry.seed,
      samples,
      cache: null,
    });
    items.push({
      id: entry.id,
      kind: 'reference',
      file: writePcm(repoRoot, `${base}.wav`, source),
      title: `${entry.id} — kaynak render`,
      status,
      guide: ['Programdan yeniden render (kaynak).'],
      manifest: entry.manifest,
      assetClass: entry.assetClass,
      pcmHash: hashPcm(source.channels, source.sampleRate),
      decision: cmd,
      group: `ref:${entry.id}`,
      role: 'source',
    });
    items.push({
      id: `${entry.id}/delivery`,
      kind: 'reference',
      file: writePcm(repoRoot, `${base}--delivery.wav`, delivery),
      title: `${entry.id} — gönderilen çözüm`,
      status,
      guide: ['Yayımlanmış assetin kodek çözümü.'],
      manifest: entry.manifest,
      assetClass: entry.assetClass,
      pcmHash: hashPcm(delivery.channels, delivery.sampleRate),
      decision: cmd,
      group: `ref:${entry.id}`,
      role: 'delivery',
    });
    if (manifestLoops(repoRoot, entry.manifest)) {
      items.push({
        id: `${entry.id}/loop2x`,
        kind: 'reference',
        file: writePcm(repoRoot, `${base}--loop2x.wav`, twice(delivery)),
        title: `${entry.id} — iki tur (dikiş)`,
        status,
        guide: ['Gönderim iki ardışık tur; döngü dikişi duyulmalı.'],
        manifest: entry.manifest,
        assetClass: entry.assetClass,
        pcmHash: null,
        decision: cmd,
        group: `ref:${entry.id}`,
        role: 'loop2x',
      });
    }
  }
  return items;
}

/**
 * Paketi kurar: WAV'ları yazar, `listening.json` ve `index.html`'i üretir.
 * Deterministiktir — tarih/saat yazmaz; aynı repo durumu aynı paketi verir.
 */
export function buildListeningPackage(repoRoot: string): ListeningPackageV1 {
  const samples = repoSampleResolver(repoRoot);
  const tmp = mkdtempSync(join(tmpdir(), 'listening-'));
  try {
    const items: ListeningItemV1[] = [
      ...canaryItems(repoRoot, samples),
      ...benchmarkItems(repoRoot, tmp, samples),
      ...referenceItems(repoRoot, samples),
    ];
    const count = (kind: ListeningItemV1['kind']) => items.filter((i) => i.kind === kind).length;
    const pkg: ListeningPackageV1 = {
      schema: LISTENING_SCHEMA,
      counts: {
        canary: count('canary'),
        benchmark: count('benchmark'),
        reference: count('reference'),
        pending: items.filter((i) => i.status === 'pending-human' || i.status === 'undecided')
          .length,
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
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
