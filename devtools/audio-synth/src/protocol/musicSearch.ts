import { existsSync } from 'node:fs';
import { evaluateAssetPolicy, measureAsset } from '../analysis/assetQa';
import { assertRenderBudget } from '../guard/budget';
import { musicProgramHash, type MusicProgramV1 } from '../music/program';
import { renderAndPlan } from '../music/bundle';
import { applyMastering, DEFAULT_MUSIC_LUFS } from '../music/mastering';
import { estimateScoreCost } from '../music/render';
import { expandProgram } from '../music/score';
import {
  MUSIC_SEARCH_REPORT_SCHEMA,
  searchSymbolic,
  validateMusicSearchSpec,
  type MusicCandidateV1,
  type MusicSearchSpecV1,
} from '../music/search';
import { hashCanonical, prettyCanonicalJson, type Sha256 } from './canonical';
import { ProtocolError } from './errors';
import { readJsonFile, resolveInside, withLock, writeFileAtomic } from './fs';
import { loadMusicDocuments, musicLabel, type MusicLocation } from './music';
import { asProtocol } from './records';

/**
 * Hiyerarşik müzik araması: bütün adaylar sembolik süzgeçten geçer, yalnız
 * FİNALİSTLER render edilir. Rapor kaç adayın açıldığını ve kaçının render
 * edildiğini sayar — "ucuz aşama gerçekten ucuz mu" sorusunun kanıtı budur.
 */
export const MUSIC_SEARCH_FILE = 'search.json';
export const MUSIC_SEARCH_REPORT_FILE = 'search-report.json';

export interface MusicFinalistV1 {
  readonly candidateId: string;
  readonly programHash: Sha256;
  readonly distance: number;
  readonly audio: {
    readonly frames: number;
    readonly integratedLufs: number | null;
    readonly truePeakDbtp: number | null;
    readonly samplePeakDbfs: number | null;
  };
  readonly policy: { readonly verdict: 'pass' | 'fail'; readonly violations: readonly string[] };
}

export interface MusicSearchReportV1 {
  readonly schema: typeof MUSIC_SEARCH_REPORT_SCHEMA;
  readonly searchId: string;
  readonly musicId: string;
  readonly specHash: Sha256;
  readonly baseProgramHash: Sha256;
  readonly seed: number;
  readonly strategy: string;
  readonly candidates: readonly MusicCandidateV1[];
  readonly ranked: readonly string[];
  readonly finalists: readonly MusicFinalistV1[];
  readonly evidence: { readonly expanded: number; readonly rendered: number };
}

const searchFile = (loc: MusicLocation, name: string) =>
  resolveInside(loc.repoRoot, `${musicLabel(loc)}/${name}`, name);

export function loadMusicSearchSpec(loc: MusicLocation): MusicSearchSpecV1 {
  const file = searchFile(loc, MUSIC_SEARCH_FILE);
  if (!existsSync(file)) throw new ProtocolError('not-found', 'search.json yok', musicLabel(loc));
  const spec = asProtocol(MUSIC_SEARCH_FILE, () =>
    validateMusicSearchSpec(readJsonFile(file, MUSIC_SEARCH_FILE)),
  );
  if (spec.musicId !== loc.musicId) {
    throw new ProtocolError(
      'identity',
      `spec ${spec.musicId} için, dizin ${loc.musicId}`,
      MUSIC_SEARCH_FILE,
    );
  }
  return spec;
}

/**
 * Finalisti render eder ve HAM PCM'de ölçer. Mastering kararı burada
 * verilmez: ortak kazanç bütün stem'lere bakarak `checkMusic` aşamasında
 * seçilir; arama yalnız adayın ölçülebilir ses davranışını raporlar.
 */
function measureFinalist(program: MusicProgramV1, candidate: MusicCandidateV1): MusicFinalistV1 {
  const score = expandProgram(program);
  const cost = estimateScoreCost(score, { playback: program.playback });
  assertRenderBudget(cost, `finalist ${candidate.candidateId}`);
  const { reference, plan } = renderAndPlan(
    program,
    score,
    program.mastering?.integratedLufs ?? DEFAULT_MUSIC_LUFS,
  );
  const mastered = reference.channels.map((channel) => Float32Array.from(channel));
  applyMastering(mastered, reference.sampleRate, plan.mastering);
  const rendered = { frames: mastered[0].length };
  const measurement = measureAsset(mastered, reference.sampleRate);
  const verdict = evaluateAssetPolicy(measurement, 'music');
  return {
    candidateId: candidate.candidateId,
    programHash: candidate.programHash,
    distance: candidate.distance ?? Number.POSITIVE_INFINITY,
    audio: {
      frames: rendered.frames,
      integratedLufs: measurement.integratedLufs,
      truePeakDbtp: measurement.truePeakDbtp,
      samplePeakDbfs: measurement.samplePeakDbfs,
    },
    policy: {
      verdict: verdict.violations.length === 0 ? 'pass' : 'fail',
      violations: verdict.violations,
    },
  };
}

/**
 * Aramayı koşar ve raporu yazar. Sıra tohumdan türer: aynı tohum aynı
 * sembolik sırayı verir ve finalist kümesi değişmez.
 */
export function runMusicSearch(loc: MusicLocation): MusicSearchReportV1 {
  const documents = loadMusicDocuments(loc);
  const spec = loadMusicSearchSpec(loc);
  const outcome = searchSymbolic(spec, documents.program, {
    brief: documents.brief,
    ...(documents.themeBook ? { themeBook: documents.themeBook } : {}),
  });
  const finalists = outcome.ranked.slice(0, spec.finalists).map((candidateId) => {
    const program = outcome.programs.get(candidateId);
    const candidate = outcome.candidates.find((c) => c.candidateId === candidateId);
    if (!program || !candidate) {
      throw new ProtocolError('invalid', `finalist ${candidateId} bulunamadı`, musicLabel(loc));
    }
    return measureFinalist(program, candidate);
  });
  const report: MusicSearchReportV1 = {
    schema: MUSIC_SEARCH_REPORT_SCHEMA,
    searchId: spec.searchId,
    musicId: spec.musicId,
    specHash: hashCanonical(spec),
    baseProgramHash: musicProgramHash(documents.program),
    seed: spec.seed,
    strategy: spec.strategy,
    candidates: outcome.candidates,
    ranked: outcome.ranked,
    finalists,
    evidence: { expanded: outcome.candidates.length, rendered: finalists.length },
  };
  writeFileAtomic(searchFile(loc, MUSIC_SEARCH_REPORT_FILE), prettyCanonicalJson(report));
  return report;
}

export interface MusicPromotionV1 {
  readonly musicId: string;
  readonly candidateId: string;
  readonly version: number;
  readonly programHash: Sha256;
}

/**
 * Finalisti müzik programına TERFİ ettirir: aday değerleri uygulanmış
 * program `music.json`a yazılır, sürüm artar ve köken (`provenance`)
 * belgeye girer. Rapor olmadan terfi yoktur.
 */
export function promoteMusicCandidate(loc: MusicLocation, candidateId: string): MusicPromotionV1 {
  const reportFile = searchFile(loc, MUSIC_SEARCH_REPORT_FILE);
  if (!existsSync(reportFile)) {
    throw new ProtocolError(
      'not-found',
      'search-report.json yok (önce music search run)',
      musicLabel(loc),
    );
  }
  const reportDocument = readJsonFile(reportFile, MUSIC_SEARCH_REPORT_FILE);
  const report = reportDocument as MusicSearchReportV1;
  const finalist = report.finalists.find((f) => f.candidateId === candidateId);
  if (!finalist) {
    throw new ProtocolError('invalid', `${candidateId} finalist değil`, MUSIC_SEARCH_REPORT_FILE);
  }
  return withLock(resolveInside(loc.repoRoot, musicLabel(loc), 'music'), musicLabel(loc), () => {
    const documents = loadMusicDocuments(loc);
    if (musicProgramHash(documents.program) !== report.baseProgramHash) {
      throw new ProtocolError(
        'stale',
        'rapor başka bir temel programdan üretilmiş',
        MUSIC_SEARCH_REPORT_FILE,
      );
    }
    const spec = loadMusicSearchSpec(loc);
    const outcome = searchSymbolic(spec, documents.program, {
      brief: documents.brief,
      ...(documents.themeBook ? { themeBook: documents.themeBook } : {}),
    });
    const program = outcome.programs.get(candidateId);
    if (!program) {
      throw new ProtocolError(
        'identity',
        `${candidateId} yeniden üretilemedi`,
        MUSIC_SEARCH_REPORT_FILE,
      );
    }
    const promoted: MusicProgramV1 = {
      ...program,
      version: documents.program.version + 1,
      provenance: {
        searchId: spec.searchId,
        candidateId,
        reportHash: hashCanonical(reportDocument),
      },
    };
    writeFileAtomic(searchFile(loc, 'music.json'), prettyCanonicalJson(promoted));
    return {
      musicId: promoted.musicId,
      candidateId,
      version: promoted.version,
      programHash: musicProgramHash(promoted),
    };
  });
}
