import { existsSync, readdirSync } from 'node:fs';
import { withRenderSession } from '../kernel/session';
import { batchWorkers } from '../guard/parallel';
import { assertBatchBudget, DEFAULT_BATCH_BUDGET, estimateBatch } from '../guard/batch';
import { isIntegerDimension, baseDocument, type DimensionValue } from '../program/dimensions';
import type { AcousticProgramV1 } from '../program/schema';
import {
  buildFitReport,
  descriptorDistance,
  fitBox,
  validateFitSpec,
  validateFitReport,
  FIT_MANIFEST_FIELDS,
  type AcousticFitReportV1,
  type AcousticFitSpecV1,
  type FitRoundV1,
  type FitTargetEntryV1,
} from '../search/fit';
import { planCandidate, type PlannedCandidate } from '../search/plan';
import { strategyPoints, SEARCH_STRATEGIES } from '../search/strategy';
import { SEARCH_SPEC_SCHEMA, type AcousticSearchSpecV1 } from '../search/spec';
import { hashCanonical, prettyCanonicalJson, type Sha256 } from '../kernel/canonical';
import { ProtocolError } from './errors';
import { runTasks } from './parallel';
import type { SearchCandidateOutput } from './parallelTasks';
import { readJsonFile, resolveInside, withLock, writeFileAtomic } from './fs';

/**
 * Referans-uydurma deneyi (araştırma kapısı). Bir fit dizini
 * `<fitsRoot>/<fitId>/` altında `spec.json`, `report.json` ve en iyi adayın
 * `best-program.json`'unu taşır. Fit çıktısı production kaydı DEĞİLDİR:
 * manifest/job/publish yüzeyine dokunmaz; uydurulan program yalnız kopya
 * belgedir — production'a tek giriş yolu her zamanki canonical akıştır.
 */
export const DEFAULT_FITS_ROOT = 'devtools/audio-synth/records/fits';

/** Fit spec'i `planCandidate`'in beklediği arama spec'ine çevirir (tek kaynak). */
function asSearchSpec(spec: AcousticFitSpecV1): AcousticSearchSpecV1 {
  return {
    schema: SEARCH_SPEC_SCHEMA,
    searchId: spec.fitId,
    base: spec.base,
    seed: spec.seed,
    strategy: { id: 'scrambled-halton', version: SEARCH_STRATEGIES['scrambled-halton'].version },
    candidates: spec.search.candidates,
    dimensions: spec.dimensions,
    ...(spec.filters === undefined ? {} : { filters: spec.filters }),
    ...(spec.budget === undefined ? {} : { budget: spec.budget }),
  };
}

function manifestDescriptors(
  repoRoot: string,
  manifestPath: string,
): Record<string, number | null> {
  const file = resolveInside(repoRoot, manifestPath, 'target.manifest');
  if (!existsSync(file)) {
    throw new ProtocolError('not-found', 'hedef manifest yok', manifestPath);
  }
  const doc = readJsonFile(file, manifestPath) as { analysis?: { encoded?: unknown } };
  const encoded = doc.analysis?.encoded;
  if (typeof encoded !== 'object' || encoded === null) {
    throw new ProtocolError('invalid', 'manifest analysis.encoded taşımıyor', manifestPath);
  }
  const out: Record<string, number | null> = {};
  for (const [name, path] of Object.entries(FIT_MANIFEST_FIELDS)) {
    let node: unknown = encoded;
    for (const key of path) node = (node as Record<string, unknown>)?.[key];
    out[name] = typeof node === 'number' ? node : null;
  }
  return out;
}

export interface FitRunOutcome {
  readonly location: string;
  readonly report: AcousticFitReportV1;
  readonly reportHash: Sha256;
}

/**
 * Zoom taraması: tur 0 tam birim küp; her tur görev sahibi nokta etrafında
 * `shrink` oranında daralan kutu. Görev sahibi elit olarak taşınır —
 * rapordaki `bestDistance` dizisi monoton azalmaz. Aynı program özeti
 * yeniden render EDİLMEZ (turlar arası program-özeti önbelleği).
 */
export function runFit(
  repoRoot: string,
  fitsRoot: string,
  document: unknown,
  options: { workers?: number } = {},
): FitRunOutcome {
  const spec = validateFitSpec(document);
  const dir = resolveInside(repoRoot, `${fitsRoot}/${spec.fitId}`, spec.fitId);
  return withLock(dir, `${fitsRoot}/${spec.fitId}`, () => {
    const label = `${fitsRoot}/${spec.fitId}`;
    if (existsSync(resolveInside(repoRoot, `${label}/report.json`, 'report'))) {
      throw new ProtocolError(
        'overwrite',
        'fit zaten tamamlanmış; yeni tanım yeni fitId ister',
        label,
      );
    }
    const source: 'descriptors' | 'manifest' = spec.target.manifest ? 'manifest' : 'descriptors';
    const resolved = resolveTarget(repoRoot, spec);
    const { report, bestProgram } = withRenderSession({ quality: 'final', cache: null }, () =>
      optimize(repoRoot, spec, resolved, source, options.workers),
    );
    writeFileAtomic(
      resolveInside(repoRoot, `${label}/spec.json`, 'spec'),
      prettyCanonicalJson(spec),
    );
    writeFileAtomic(
      resolveInside(repoRoot, `${label}/report.json`, 'report'),
      prettyCanonicalJson(report),
    );
    if (bestProgram) {
      writeFileAtomic(
        resolveInside(repoRoot, `${label}/best-program.json`, 'best-program'),
        prettyCanonicalJson(bestProgram),
      );
    }
    return { location: label, report, reportHash: hashCanonical(report) };
  });
}

function resolveTarget(
  repoRoot: string,
  spec: AcousticFitSpecV1,
): Record<string, FitTargetEntryV1> {
  if (!spec.target.manifest) return { ...spec.target.descriptors };
  const values = manifestDescriptors(repoRoot, spec.target.manifest);
  return Object.fromEntries(
    Object.entries(spec.target.descriptors).map(([name, e]) => [
      name,
      {
        value: e.value ?? values[name] ?? null,
        weight: e.weight,
      },
    ]),
  );
}

interface ScoredCandidate {
  readonly point: readonly number[];
  readonly values: Readonly<Record<string, DimensionValue>>;
  readonly candidateId: string | null;
  readonly programHash: Sha256;
  readonly program: AcousticProgramV1;
  readonly distance: number;
  readonly deltas: Record<string, number>;
}

function optimize(
  repoRoot: string,
  spec: AcousticFitSpecV1,
  target: Readonly<Record<string, FitTargetEntryV1>>,
  source: 'descriptors' | 'manifest',
  workers: number | undefined,
): { report: AcousticFitReportV1; bestProgram: AcousticProgramV1 | null } {
  const searchSpec = asSearchSpec(spec);
  const names = spec.dimensions.map((d) => d.name);
  const integer = spec.dimensions.map((d) => isIntegerDimension(d, spec.base));
  const seen = new Map<Sha256, string>();
  const cache = new Map<Sha256, { distance: number; deltas: Record<string, number> }>();
  const scored: ScoredCandidate[] = [];
  const rounds: FitRoundV1[] = [];
  let incumbentPoint: number[] | null = null;
  let incumbentDistance = Infinity;
  let span = 1;
  let ordinal = 0;

  for (let round = 0; round < spec.search.rounds; round++) {
    const box: { lo: number[]; hi: number[] } | null = incumbentPoint
      ? fitBox(
          incumbentPoint,
          names.map(() => span),
        )
      : null;
    const points: number[][] = strategyPoints(
      spec.seed + round * 0x9e37,
      names,
      spec.search.candidates,
    ).map((point): number[] =>
      box ? point.map((u, d) => box.lo[d] + u * (box.hi[d] - box.lo[d])) : point,
    );
    if (incumbentPoint) points.push([...incumbentPoint]);
    const planned: PlannedCandidate[] = points.map((point) =>
      planCandidate(searchSpec, integer, seen, point, ordinal++),
    );
    const fresh = planned.filter(
      (c): c is PlannedCandidate & { programHash: Sha256 } =>
        c.invalid === null && c.programHash !== null && !cache.has(c.programHash),
    );
    const estimate = estimateBatch(
      fresh.flatMap((c) =>
        c.cost
          ? [
              {
                cost: { workUnits: c.cost.renderWorkUnits, peakBytes: c.cost.peakBytes },
                samples: c.cost.samples,
              },
            ]
          : [],
      ),
    );
    assertBatchBudget(
      { ...estimate, items: fresh.length },
      { ...DEFAULT_BATCH_BUDGET, ...spec.budget },
      `fit ${spec.fitId} tur ${round}`,
    );
    const outputs = runTasks<SearchCandidateOutput>(
      repoRoot,
      'search-candidate',
      fresh.map((candidate) => ({
        candidate,
        filters: spec.filters ?? [],
        withPcm: false,
      })),
      batchWorkers(estimate, workers),
    );
    for (const { result } of outputs) {
      if (result.state === 'passed' && result.descriptors && result.programHash) {
        cache.set(result.programHash, descriptorDistance(result.descriptors, target));
      }
    }
    let evaluated = 0;
    for (const c of planned) {
      if (c.invalid !== null || c.programHash === null || c.program === null) continue;
      const s = cache.get(c.programHash);
      if (!s) continue;
      evaluated++;
      scored.push({
        point: c.point,
        values: c.values,
        candidateId: c.candidateId,
        programHash: c.programHash,
        program: c.program,
        distance: s.distance,
        deltas: s.deltas,
      });
      if (s.distance < incumbentDistance) {
        incumbentPoint = [...c.point];
        incumbentDistance = s.distance;
      }
    }
    rounds.push({
      round,
      span,
      evaluated,
      bestDistance: Number.isFinite(incumbentDistance) ? incumbentDistance : null,
      bestPoint: incumbentPoint ? [...incumbentPoint] : [],
    });
    if (incumbentDistance <= spec.tolerance) break;
    span *= spec.search.shrink;
  }

  const report = buildFitReport(
    spec,
    hashCanonical(spec),
    hashCanonical(baseDocument(spec.base)),
    target,
    source,
    rounds,
    scored.map((s) => ({ entry: s, distance: s.distance, deltas: s.deltas })),
  );
  const best = scored.length ? scored.reduce((a, b) => (b.distance < a.distance ? b : a)) : null;
  return { report, bestProgram: best?.program ?? null };
}

export function listFits(repoRoot: string, fitsRoot: string): string[] {
  const dir = resolveInside(repoRoot, fitsRoot, 'fits');
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

export function readFitReport(
  repoRoot: string,
  fitsRoot: string,
  fitId: string,
): AcousticFitReportV1 {
  const label = `${fitsRoot}/${fitId}`;
  const file = resolveInside(repoRoot, `${label}/report.json`, 'report.json');
  if (!existsSync(file)) {
    throw new ProtocolError('not-found', 'tamamlanmış fit yok (fit run)', label);
  }
  const doc = readJsonFile(file, `${label}/report.json`);
  const report = validateFitReport(doc);
  if (report.fitId !== fitId) {
    throw new ProtocolError('identity', `rapor ${report.fitId} fit'ine ait`, label);
  }
  return report;
}
