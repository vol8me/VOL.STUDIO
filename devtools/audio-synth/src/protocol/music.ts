import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { validateMusicAssetSpec, type MusicAssetSpecV1 } from '@volstudio/core/audio/music';
import { classifyAssetPath } from '../analysis/assetQa';
import { ANALYZER_VERSION } from '../analysis/report';
import { checkStemSync, SYNC_METHOD, type StemSyncCheckV1 } from '../analysis/sync';
import {
  ANALYSIS_WORK_PER_SAMPLE,
  assertBatchBudget,
  DEFAULT_BATCH_BUDGET,
  SECONDS_PER_WORK_UNIT,
  type BatchEstimate,
} from '../guard/batch';
import { assertRenderBudget } from '../guard/budget';
import { analyzeScore, reportHash, type MusicSymbolicReportV1 } from '../music/analyze';
import type { MusicBriefV1 } from '../music/brief';
import {
  adaptiveQaHash,
  buildMusicAssetSpec,
  renderAndPlan,
  specFrames,
  type MusicAdaptiveQaV1,
} from '../music/bundle';
import {
  applyMastering,
  DEFAULT_MUSIC_LUFS,
  measureMix,
  type MusicMasteringPlanV1,
} from '../music/mastering';
import { instrumentRegistryHash } from '../music/instruments';
import { musicProgramHash, validateMusicProgram, type MusicProgramV1 } from '../music/program';
import { estimateScoreCost, MUSIC_RENDERER_VERSION } from '../music/render';
import { expandProgram, scoreHash, type MusicScoreV1 } from '../music/score';
import { MUSIC_ID } from '../music/terms';
import { themeBookHash, validateThemeBook, type ThemeBookV1 } from '../music/themeBook';
import {
  REFERENCE_MIX_ID,
  MUSIC_STEM_PROGRAM_SCHEMA,
  type MusicStemProgramV1,
} from '../music/stem';
import { validateBrief } from '../program/brief';
import { hashCanonical, hashPcm, prettyCanonicalJson, sha256Bytes, type Sha256 } from './canonical';
import { ProtocolError } from './errors';
import { readJsonFile, resolveInside, withLock, writeFileAtomic } from './fs';
import {
  analyzeCandidate,
  initJob,
  registerBrief,
  registerProgram,
  renderCandidate,
  selectCandidate,
} from './job';
import { loadJob, type JobLocation } from './location';
import { validateManifest, type AudioAssetManifestV1 } from './manifest';
import { publishJob } from './publish';
import { asProtocol, JOB_ID } from './records';
import { jobStatus } from './status';
import { resolveDestination, surveyTargets, type ResolvedDestination } from './targets';
import { decodeWithFfmpeg } from './toolchain';

/**
 * Müzik üretimi ve yayını. Her stem KENDİ `AudioJobV1`inden geçer
 * (`<musicRoot>/<musicId>/jobs/<stem>`): brief → program → render → analyze →
 * select → publish. Kapı aynı kapıdır; müzik yalnız sıraya koyar ve en sonda
 * çalışma zamanı sözleşmesini (`MusicBundleV1`) yazar.
 *
 * Bundle EN SON yazılır: yarım kalan bir yayın bundle'sız kalır, `status`
 * onu `incomplete` gösterir ve aynı komut yayımlanmış stem'leri atlayıp sürer.
 */
export const DEFAULT_MUSIC_ROOT = 'devtools/audio-synth/audio-music';
export const DEFAULT_THEMEBOOKS_ROOT = 'devtools/audio-synth/audio-themebooks';
export const MUSIC_BUNDLE_SCHEMA = 'MusicBundleV1';
export const MUSIC_STATUS_SCHEMA = 'MusicStatusV1';

/** Ön denetim + job render + analiz yeniden render + publish yeniden render. */
export const MUSIC_RENDER_PASSES = 4;
export const MUSIC_ANALYSIS_PASSES = 3;

export interface MusicLocation {
  readonly repoRoot: string;
  readonly musicRoot: string;
  readonly musicId: string;
}

export function musicLabel(loc: MusicLocation): string {
  if (!MUSIC_ID.test(loc.musicId)) {
    throw new ProtocolError('path', `musicId ${MUSIC_ID.source} kalıbına uymalı`, loc.musicId);
  }
  return `${loc.musicRoot}/${loc.musicId}`;
}

const musicFile = (loc: MusicLocation, rel: string) =>
  resolveInside(loc.repoRoot, `${musicLabel(loc)}/${rel}`, rel);

export function stemJob(loc: MusicLocation, stem: string): JobLocation {
  return { repoRoot: loc.repoRoot, jobsRoot: `${musicLabel(loc)}/jobs`, jobId: stem };
}

export interface MusicDocumentsV1 {
  readonly brief: MusicBriefV1;
  readonly program: MusicProgramV1;
  readonly themeBook: ThemeBookV1 | null;
}

function themeBookFile(repoRoot: string, themeBooksRoot: string, id: string): string {
  return resolveInside(repoRoot, `${themeBooksRoot}/${id}.json`, 'themebook');
}

/**
 * Belgeleri okur ve ThemeBook bağını DOĞRULAR: program bir kitabın özetini
 * taşıyorsa o kitap bulunmalı ve özeti tutmalıdır — kitabı değişmiş bir
 * program "kurallara uyuyorum" diyemez.
 */
export function loadMusicDocuments(
  loc: MusicLocation,
  themeBooksRoot = DEFAULT_THEMEBOOKS_ROOT,
): MusicDocumentsV1 {
  const brief = asProtocol('brief.json', () =>
    validateBrief(readJsonFile(musicFile(loc, 'brief.json'), 'brief.json')),
  );
  if (brief.kind !== 'music') {
    throw new ProtocolError('invalid', 'müzik dizini müzik brief’i ister', 'brief.json');
  }
  const program = asProtocol('music.json', () =>
    validateMusicProgram(readJsonFile(musicFile(loc, 'music.json'), 'music.json')),
  );
  if (program.musicId !== loc.musicId) {
    throw new ProtocolError(
      'identity',
      `musicId ${program.musicId} dizin adıyla uyuşmuyor`,
      musicLabel(loc),
    );
  }
  return { brief, program, themeBook: loadThemeBook(loc.repoRoot, themeBooksRoot, program) };
}

function loadThemeBook(
  repoRoot: string,
  themeBooksRoot: string,
  program: MusicProgramV1,
): ThemeBookV1 | null {
  if (!program.themeBook) return null;
  const path = `${themeBooksRoot}/${program.themeBook.id}.json`;
  const file = themeBookFile(repoRoot, themeBooksRoot, program.themeBook.id);
  if (!existsSync(file)) throw new ProtocolError('not-found', 'ThemeBook yok', path);
  const book = asProtocol(path, () => validateThemeBook(readJsonFile(file, path)));
  const hash = themeBookHash(book);
  if (hash !== program.themeBook.hash) {
    throw new ProtocolError('stale', `ThemeBook özeti değişti (${hash})`, path);
  }
  return book;
}

/** Yayımlanacak asset'ler: adaptive'de her stem + referans mix, diğerlerinde tek mix. */
export function publishedStems(program: MusicProgramV1): string[] {
  return program.playback === 'adaptiveLoop'
    ? [...program.stems.map((s) => s.id), REFERENCE_MIX_ID]
    : [REFERENCE_MIX_ID];
}

function destinationOf(
  repoRoot: string,
  program: MusicProgramV1,
  stem: string,
): ResolvedDestination {
  const destination = resolveDestination(
    surveyTargets(repoRoot),
    program.delivery.package,
    `${program.delivery.assetDir}/${stem}.ogg`,
  );
  const assetClass = classifyAssetPath(destination.withinRoot);
  if (assetClass !== 'music') {
    throw new ProtocolError(
      'destination',
      `yol sınıfı ${assetClass}, müzik bekleniyor`,
      destination.assetPath,
    );
  }
  return destination;
}

export interface MusicPreviewV1 {
  readonly program: MusicProgramV1;
  readonly programHash: Sha256;
  readonly score: MusicScoreV1;
  readonly report: MusicSymbolicReportV1;
  readonly estimate: BatchEstimate;
  readonly assets: readonly string[];
}

/** Doğrulama + genişletme + sembolik analiz + hedef + bütçe; render YOK. */
export function previewMusic(repoRoot: string, documents: MusicDocumentsV1): MusicPreviewV1 {
  const { program, brief, themeBook } = documents;
  const score = asProtocol('music.json', () => expandProgram(program));
  const report = analyzeScore({ program, score, brief, ...(themeBook ? { themeBook } : {}) });
  const assets = publishedStems(program);
  let work = 0;
  let peak = 0;
  for (const stem of assets) {
    const cost = estimateScoreCost(score, {
      playback: program.playback,
      ...(stem === REFERENCE_MIX_ID ? {} : { stem }),
    });
    assertRenderBudget(cost, `stem ${stem}`);
    work += MUSIC_RENDER_PASSES * cost.workUnits;
    work += MUSIC_ANALYSIS_PASSES * specFrames(program, 0) * 2 * ANALYSIS_WORK_PER_SAMPLE;
    peak = Math.max(peak, cost.peakBytes);
    destinationOf(repoRoot, program, stem);
  }
  const estimate: BatchEstimate = {
    items: assets.length,
    totalWorkUnits: work,
    maxItemPeakBytes: peak,
    estimatedSeconds: work * SECONDS_PER_WORK_UNIT,
  };
  assertBatchBudget(estimate, DEFAULT_BATCH_BUDGET, `müzik ${program.musicId}`);
  return { program, programHash: musicProgramHash(program), score, report, estimate, assets };
}

export interface RenderedAssetV1 {
  readonly stem: string;
  readonly channels: Float32Array[];
  readonly frames: number;
  readonly pcmHash: Sha256;
}

export interface MusicCheckV1 extends MusicPreviewV1 {
  readonly mastering: MusicMasteringPlanV1;
  readonly qa: MusicAdaptiveQaV1;
  readonly spec: MusicAssetSpecV1;
  readonly rendered: readonly RenderedAssetV1[];
}

/**
 * Bütün stem'leri ve referans mix'i bellekte render eder, ortak kazancı
 * seçer, state kombinasyonlarını ölçer ve çalışma zamanı sözleşmesini kurar.
 * Hiçbir şey YAZILMAZ.
 */
export function checkMusic(repoRoot: string, documents: MusicDocumentsV1): MusicCheckV1 {
  const preview = previewMusic(repoRoot, documents);
  const { program, score } = preview;
  const { reference, stems, plan } = renderAndPlan(
    program,
    score,
    program.mastering?.integratedLufs ?? DEFAULT_MUSIC_LUFS,
  );
  const rendered: RenderedAssetV1[] = [];
  for (const stem of preview.assets) {
    const raw =
      stem === REFERENCE_MIX_ID
        ? reference.channels.map((channel) => Float32Array.from(channel))
        : (stems.find((s) => s.id === stem)?.channels ?? []).map((channel) =>
            Float32Array.from(channel),
          );
    applyMastering(raw, reference.sampleRate, plan.mastering);
    rendered.push({
      stem,
      channels: raw,
      frames: raw[0].length,
      pcmHash: hashPcm(raw, reference.sampleRate),
    });
  }
  const mix = rendered.find((r) => r.stem === REFERENCE_MIX_ID) as RenderedAssetV1;
  const measured = measureMix(mix.channels, reference.sampleRate, plan.mastering.path);
  const files = Object.fromEntries(
    program.stems.map((stem) => [
      stem.id,
      assetFileOf(
        repoRoot,
        program,
        program.playback === 'adaptiveLoop' ? stem.id : REFERENCE_MIX_ID,
      ),
    ]),
  );
  const stemFrames = Object.fromEntries(
    program.stems.map((stem) => [
      stem.id,
      rendered.find((r) => r.stem === stem.id)?.frames ?? mix.frames,
    ]),
  );
  const spec = buildMusicAssetSpec({
    program,
    score,
    mastering: plan.mastering,
    measured: { integratedLufs: measured.integratedLufs, truePeakDbtp: measured.truePeakDbtp },
    frames: specFrames(program, mix.frames),
    files,
    stemFrames,
    ...(program.playback === 'adaptiveLoop'
      ? {
          referenceMix: {
            file: assetFileOf(repoRoot, program, REFERENCE_MIX_ID),
            frames: mix.frames,
          },
        }
      : {}),
  });
  validateMusicAssetSpec(spec);
  return { ...preview, mastering: plan.mastering, qa: plan.qa, spec, rendered };
}

/** Paket köküne göreli asset yolu — spec'teki `file` alanı bunu taşır. */
function assetFileOf(repoRoot: string, program: MusicProgramV1, stem: string): string {
  const destination = destinationOf(repoRoot, program, stem);
  return destination.assetPath.slice(destination.target.packagePath.length + 1);
}

function stemProgram(
  program: MusicProgramV1,
  stem: string,
  mastering: MusicMasteringPlanV1,
): MusicStemProgramV1 {
  return { schema: MUSIC_STEM_PROGRAM_SCHEMA, stem, mastering, music: program };
}

/** Tek stem'i kanonik job akışından yayımlar; yayımlanmışsa dokunmaz. */
function publishStem(
  loc: MusicLocation,
  check: MusicCheckV1,
  brief: MusicBriefV1,
  stem: string,
): 'published' | 'unchanged' {
  const job = stemJob(loc, stem);
  const { program } = check;
  const target = {
    package: program.delivery.package,
    asset: `${program.delivery.assetDir}/${stem}.ogg`,
    integration: {
      runtimeKey: program.delivery.runtimeKey
        ? `${program.delivery.runtimeKey}/${stem}`
        : `${program.musicId}/${stem}`,
      loop: program.playback !== 'playlistOneShot',
    },
  };
  if (!existsSync(resolveInside(loc.repoRoot, `${job.jobsRoot}/${job.jobId}/job.json`, 'job'))) {
    initJob(job, { target, kind: 'music' });
  } else if (hashCanonical(loadJob(job).target) !== hashCanonical(target)) {
    throw new ProtocolError(
      'identity',
      'stem işi başka bir hedefe ait',
      `${job.jobsRoot}/${job.jobId}`,
    );
  }
  if (jobStatus(job).artifacts.brief.hash !== hashCanonical(brief)) registerBrief(job, brief);
  const document = stemProgram(program, stem, check.mastering);
  const before = jobStatus(job);
  if (
    before.artifacts.program.state !== 'valid' ||
    before.artifacts.program.hash !== hashCanonical(document)
  ) {
    registerProgram(job, document);
  }
  if (jobStatus(job).next.action === 'done') return 'unchanged';
  for (let step = 0; step < 6; step++) {
    const action = jobStatus(job).next.action;
    if (action === 'done') return 'published';
    if (action === 'render') renderCandidate(job);
    else if (action === 'analyze') analyzeCandidate(job);
    else if (action === 'select')
      selectCandidate(job, undefined, 'müzik stem’i: programın tek render adayı');
    else if (action === 'publish') publishJob(job);
    else
      throw new ProtocolError(
        'stage',
        `stem ${stem} beklenmeyen adımda: ${action}`,
        `${job.jobsRoot}/${job.jobId}`,
      );
  }
  throw new ProtocolError('stage', `stem ${stem} yayına ulaşmadı`, `${job.jobsRoot}/${job.jobId}`);
}

export interface MusicStemEntryV1 {
  readonly id: string;
  readonly asset: { readonly path: string; readonly bytes: number; readonly encodedHash: Sha256 };
  readonly manifest: { readonly path: string; readonly hash: Sha256 };
  readonly pcmHash: Sha256;
  readonly frames: number;
  readonly integratedLufs: number | null;
  readonly truePeakDbtp: number | null;
}

export interface MusicBundleV1 {
  readonly schema: typeof MUSIC_BUNDLE_SCHEMA;
  readonly package: string;
  readonly music: {
    readonly musicId: string;
    readonly version: number;
    readonly hash: Sha256;
    readonly seed: number;
    readonly playback: string;
    readonly path: string;
  };
  readonly brief: { readonly hash: Sha256; readonly path: string };
  readonly themeBook: { readonly id: string; readonly hash: Sha256 } | null;
  readonly report: { readonly path: string; readonly hash: Sha256; readonly pass: boolean };
  readonly qa: { readonly path: string; readonly hash: Sha256; readonly pass: boolean };
  readonly spec: MusicAssetSpecV1;
  readonly stems: readonly MusicStemEntryV1[];
  readonly sync: {
    readonly method: typeof SYNC_METHOD;
    readonly checks: readonly StemSyncCheckV1[];
    readonly ok: boolean;
  };
  readonly engine: {
    readonly rendererVersion: number;
    readonly analyzerVersion: number;
    readonly instrumentRegistryHash: Sha256;
  };
}

function bundlePath(
  repoRoot: string,
  program: MusicProgramV1,
): { repoPath: string; packagePath: string } {
  const { target } = destinationOf(repoRoot, program, publishedStems(program)[0]);
  return {
    repoPath: `${target.packagePath}/${target.musicRoot}/${program.musicId}.json`,
    packagePath: target.packagePath,
  };
}

function withinPackage(packagePath: string, repoPath: string): string {
  return repoPath.slice(packagePath.length + 1);
}

function buildBundle(
  loc: MusicLocation,
  check: MusicCheckV1,
  documents: MusicDocumentsV1,
): MusicBundleV1 {
  const { program } = check;
  const { packagePath } = bundlePath(loc.repoRoot, program);
  const syncChecks: StemSyncCheckV1[] = [];
  const stems = check.rendered.map((asset): MusicStemEntryV1 => {
    const destination = destinationOf(loc.repoRoot, program, asset.stem);
    const manifestDoc = readJsonFile(
      resolveInside(loc.repoRoot, destination.manifestPath, 'manifest'),
      destination.manifestPath,
    );
    const manifest: AudioAssetManifestV1 = asProtocol(destination.manifestPath, () =>
      validateManifest(manifestDoc),
    );
    if (manifest.render.pcm.hash !== asset.pcmHash) {
      throw new ProtocolError(
        'identity',
        `stem ${asset.stem} manifest PCM özeti ön denetimden farklı`,
        destination.manifestPath,
      );
    }
    const assetFile = resolveInside(loc.repoRoot, manifest.asset.path, 'asset');
    const bytes = readFileSync(assetFile);
    if (sha256Bytes(bytes) !== manifest.asset.encodedHash) {
      throw new ProtocolError(
        'identity',
        `stem ${asset.stem} baytları manifest ile uyuşmuyor`,
        manifest.asset.path,
      );
    }
    const decoded = decodeWithFfmpeg(assetFile, manifest.asset.path);
    syncChecks.push(
      checkStemSync(asset.stem, asset.channels[0], decoded.channels[0], asset.frames),
    );
    return {
      id: asset.stem,
      asset: {
        path: withinPackage(packagePath, manifest.asset.path),
        bytes: manifest.asset.bytes,
        encodedHash: manifest.asset.encodedHash,
      },
      manifest: {
        path: withinPackage(packagePath, destination.manifestPath),
        hash: hashCanonical(manifestDoc),
      },
      pcmHash: asset.pcmHash,
      frames: asset.frames,
      integratedLufs: manifest.analysis.encoded.level.integratedLufs,
      truePeakDbtp: manifest.analysis.encoded.level.truePeakDbtp,
    };
  });
  const failed = syncChecks.filter((c) => !c.ok);
  if (failed.length > 0) {
    throw new ProtocolError(
      'identity',
      `kodlanmış stem hizası bozuk: ${failed.map((c) => `${c.id} (${c.detail})`).join('; ')}`,
      musicLabel(loc),
    );
  }
  return {
    schema: MUSIC_BUNDLE_SCHEMA,
    package: program.delivery.package,
    music: {
      musicId: program.musicId,
      version: program.version,
      hash: check.programHash,
      seed: program.seed,
      playback: program.playback,
      path: `${musicLabel(loc)}/music.json`,
    },
    brief: { hash: hashCanonical(documents.brief), path: `${musicLabel(loc)}/brief.json` },
    themeBook: documents.themeBook
      ? { id: documents.themeBook.themeBookId, hash: themeBookHash(documents.themeBook) }
      : null,
    report: {
      path: `${musicLabel(loc)}/report.json`,
      hash: reportHash(check.report),
      pass: check.report.verdict.pass,
    },
    qa: {
      path: `${musicLabel(loc)}/qa.json`,
      hash: adaptiveQaHash(check.qa),
      pass: check.qa.verdict.pass,
    },
    spec: check.spec,
    stems,
    sync: { method: SYNC_METHOD, checks: syncChecks, ok: true },
    engine: {
      rendererVersion: MUSIC_RENDERER_VERSION,
      analyzerVersion: ANALYZER_VERSION,
      instrumentRegistryHash: instrumentRegistryHash(),
    },
  };
}

export interface MusicPublishOutcomeV1 {
  readonly music: string;
  readonly bundle: string;
  readonly stems: readonly { readonly id: string; readonly result: 'published' | 'unchanged' }[];
  readonly qa: MusicAdaptiveQaV1['verdict'];
}

/**
 * Sembolik kapı → adaptive QA kapısı → belgeler → stem başına kanonik yayın
 * → kodlanmış hiza denetimi → bundle. Kayıtlı program içerikçe değiştiyse
 * `version` artmış olmalıdır.
 */
export function publishMusic(
  repoRoot: string,
  musicRoot: string,
  documents: MusicDocumentsV1,
): MusicPublishOutcomeV1 {
  const check = checkMusic(repoRoot, documents);
  const loc: MusicLocation = { repoRoot, musicRoot, musicId: check.program.musicId };
  if (!check.report.verdict.pass) {
    throw new ProtocolError(
      'policy',
      `sembolik kapı düştü: ${check.report.verdict.failures.join(', ')}`,
      musicLabel(loc),
    );
  }
  if (!check.qa.verdict.pass) {
    throw new ProtocolError(
      'policy',
      `mix QA kapısı düştü: ${check.qa.verdict.failures.join(', ')}`,
      musicLabel(loc),
    );
  }
  const bundle = bundlePath(repoRoot, check.program);
  return withLock(resolveInside(repoRoot, musicLabel(loc), 'music'), musicLabel(loc), () => {
    const bundleFile = resolveInside(repoRoot, bundle.repoPath, 'bundle');
    if (existsSync(bundleFile)) {
      const current = JSON.parse(readFileSync(bundleFile, 'utf8')) as {
        music?: { hash?: string; version?: number };
      };
      if (current.music?.hash !== check.programHash) {
        /*
         * Yayımlanmış bundle programın ÖNCEKİ hâlini taşır; kaynak dosya
         * zaten yeni hâlidir, bu yüzden bayatlık kaynakla değil YAYINLA
         * karşılaştırılır. İçerik değiştiyse sürüm artmış olmalıdır.
         */
        if (!(check.program.version > (current.music?.version ?? 0))) {
          throw new ProtocolError(
            'overwrite',
            `program içeriği değişti; version ${current.music?.version ?? 0}'den büyük olmalı`,
            musicLabel(loc),
          );
        }
        rmSync(bundleFile, { force: true });
      }
    }
    writeFileAtomic(musicFile(loc, 'report.json'), prettyCanonicalJson(check.report));
    writeFileAtomic(musicFile(loc, 'qa.json'), prettyCanonicalJson(check.qa));
    const results = check.rendered.map((asset) => ({
      id: asset.stem,
      result: publishStem(loc, check, documents.brief, asset.stem),
    }));
    const doc = buildBundle(loc, check, documents);
    writeFileAtomic(bundleFile, prettyCanonicalJson(doc));
    return {
      music: musicLabel(loc),
      bundle: bundle.repoPath,
      stems: results,
      qa: check.qa.verdict,
    };
  });
}

export interface MusicVerificationV1 {
  readonly schema: 'MusicVerificationV1';
  readonly music: string;
  readonly bundle: string;
  readonly complete: boolean;
  readonly checks: readonly {
    readonly name: string;
    readonly ok: boolean;
    readonly detail: string;
  }[];
}

/**
 * Bundle'ın TAMAM sayılma koşulu: program, brief, rapor ve QA özetleri
 * kayıtla aynı; program yeniden genişletilince aynı score özeti çıkar; her
 * stem'in manifest'i ve baytları bundle'daki özetlerle aynı; spec ölçü→kare
 * dönüşümü hâlâ tutuyor. PCM kimliği `verify --all`da ayrıca yeniden render
 * edilerek sınanır.
 */
export function verifyMusic(
  loc: MusicLocation,
  themeBooksRoot = DEFAULT_THEMEBOOKS_ROOT,
): MusicVerificationV1 {
  const checks: { name: string; ok: boolean; detail: string }[] = [];
  const add = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail });
  if (!existsSync(musicFile(loc, 'music.json'))) {
    add('music', false, 'music.json yok');
    return {
      schema: 'MusicVerificationV1',
      music: musicLabel(loc),
      bundle: '—',
      complete: false,
      checks,
    };
  }
  const documents = loadMusicDocuments(loc, themeBooksRoot);
  const bundle = bundlePath(loc.repoRoot, documents.program);
  const bundleFile = resolveInside(loc.repoRoot, bundle.repoPath, 'bundle');
  if (!existsSync(bundleFile) || readFileSync(bundleFile, 'utf8').trim().length === 0) {
    add('bundle', false, 'bundle yok — yayın tamamlanmamış (music publish ile sürdürülür)');
    return {
      schema: 'MusicVerificationV1',
      music: musicLabel(loc),
      bundle: bundle.repoPath,
      complete: false,
      checks,
    };
  }
  const doc = JSON.parse(readFileSync(bundleFile, 'utf8')) as MusicBundleV1;
  add('program-hash', doc.music.hash === musicProgramHash(documents.program), doc.music.hash);
  add('brief-hash', doc.brief.hash === hashCanonical(documents.brief), doc.brief.hash);
  const score = expandProgram(documents.program);
  const report = analyzeScore({
    program: documents.program,
    score,
    brief: documents.brief,
    ...(documents.themeBook ? { themeBook: documents.themeBook } : {}),
  });
  add('expansion', reportHash(report) === doc.report.hash, scoreHash(score));
  const qaFile = musicFile(loc, 'qa.json');
  add(
    'qa-hash',
    existsSync(qaFile) && hashCanonical(readJsonFile(qaFile, 'qa.json')) === doc.qa.hash,
    doc.qa.pass ? 'QA geçti' : 'QA düştü',
  );
  try {
    validateMusicAssetSpec(doc.spec);
    add('spec', true, `${doc.spec.frames} örnek, ${doc.spec.stems.length} stem`);
  } catch (error) {
    add('spec', false, (error as Error).message);
  }
  const broken = doc.stems.filter((stem) => {
    const manifestFile = resolveInside(
      loc.repoRoot,
      `${bundle.packagePath}/${stem.manifest.path}`,
      'manifest',
    );
    const assetFile = resolveInside(
      loc.repoRoot,
      `${bundle.packagePath}/${stem.asset.path}`,
      'asset',
    );
    if (!existsSync(manifestFile) || !existsSync(assetFile)) return true;
    return (
      hashCanonical(readJsonFile(manifestFile, stem.manifest.path)) !== stem.manifest.hash ||
      sha256Bytes(readFileSync(assetFile)) !== stem.asset.encodedHash
    );
  });
  add(
    'links',
    broken.length === 0,
    broken.length
      ? `bozuk: ${broken.map((s) => s.id).join(', ')}`
      : 'bütün manifest ve asset özetleri aynı',
  );
  add('sync', doc.sync.ok, doc.sync.checks.map((c) => `${c.id}: ${c.detail}`).join(' · '));
  return {
    schema: 'MusicVerificationV1',
    music: musicLabel(loc),
    bundle: bundle.repoPath,
    complete: checks.every((c) => c.ok),
    checks,
  };
}

export function listMusic(repoRoot: string, musicRoot: string): string[] {
  const dir = resolveInside(repoRoot, musicRoot, 'music');
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && MUSIC_ID.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}

export interface MusicStatusV1 {
  readonly schema: typeof MUSIC_STATUS_SCHEMA;
  readonly music: string;
  readonly verification: MusicVerificationV1;
  readonly stems: readonly { readonly id: string; readonly stage: string; readonly next: string }[];
}

export function musicStatus(loc: MusicLocation): MusicStatusV1 {
  const verification = verifyMusic(loc);
  const jobsDir = musicFile(loc, 'jobs');
  const jobs = existsSync(jobsDir)
    ? readdirSync(jobsDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && JOB_ID.test(entry.name))
        .map((entry) => entry.name)
        .sort()
    : [];
  return {
    schema: MUSIC_STATUS_SCHEMA,
    music: musicLabel(loc),
    verification,
    stems: jobs.map((id) => {
      const status = jobStatus(stemJob(loc, id));
      return { id, stage: status.effectiveStage, next: status.next.action };
    }),
  };
}
