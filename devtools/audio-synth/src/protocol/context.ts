import { QUALITY_PROFILES } from '../kernel/session';
import { DEFAULT_PARALLEL_POLICY, WORKERS_ENV } from '../guard/parallel';
import { RENDER_CACHE_ENV, RENDER_CACHE_ROOT } from './renderCacheStore';
import { ASSET_CLASS_POLICIES } from '../analysis/assetQa';
import { ANALYZER_VERSION, AUDIO_ANALYSIS_SCHEMA } from '../analysis/report';
import { DEFAULT_RENDER_BUDGET } from '../guard/budget';
import { ARCHETYPE_REQUEST_SCHEMA } from '../program/archetype';
import { AUDIO_BRIEF_SCHEMA, validateBrief } from '../program/brief';
import { planBrief } from '../program/planner';
import { describeRegistry } from '../program/describe';
import { KNOWN_LIMITATIONS } from '../program/limitations';
import { SUBSTREAM_SCHEME } from '../program/random';
import { PROGRAM_RENDERER_VERSION } from '../program/render';
import { ACOUSTIC_PROGRAM_SCHEMA, PROGRAM_LIMITS } from '../program/schema';
import { hashCanonical } from '../kernel/canonical';
import {
  BENCHMARK_AUDITION_ROOT,
  BENCHMARK_REVIEWS_SCHEMA,
  BENCHMARK_SCHEMA,
  BENCHMARKS_ROOT,
  benchmarkReviews,
} from './benchmark';
import {
  CANARIES_ROOT,
  CANARY_AUDITION_ROOT,
  CANARY_REVIEWS_SCHEMA,
  CANARY_SCHEMA,
  canaryReviews,
} from './canary';
import { QUALITY_MATRIX_SCHEMA } from './capabilities';
import { regressionCorpus, regressionDecisions } from './regression';
import { deliveryContext } from './contextDelivery';
import { familyContext } from './contextFamily';
import { soundDesignContext } from './contextSound';
import { musicContext } from './contextMusic';
import { searchContext } from './contextSearch';
import { DEFAULT_JOBS_ROOT } from './location';
import { ASSET_MANIFEST_SCHEMA } from './manifest';
import { AUDIO_JOB_SCHEMA, JOB_STAGES, PROTOCOL_VERSION } from './records';
import { AUDIO_TARGET_SCHEMA, surveyTargets } from './targets';

export const CONTEXT_SCHEMA = 'AudioAuthoringContextV1';

const CLI = 'pnpm --filter @volstudio/audio-synth audio:job';

/**
 * Agent'ın tek komuttan öğrendiği her şey: protokol, şemalar, registry,
 * politika, bilinen sınırlamalar ve publish hedefleri. Hepsi ÇALIŞAN
 * koddan türetilir; zaman damgası yoktur, sıra kararlıdır — aynı repo
 * durumu aynı baytları verir.
 */
export interface ContextOptions {
  /** Verilirse context o brief'in `ProgramPlanV1` planını da taşır (yalnız akustik brief). */
  readonly brief?: unknown;
}

export function buildContext(repoRoot: string, options: ContextOptions = {}) {
  const registry = describeRegistry();
  const brief = options.brief === undefined ? null : validateBrief(options.brief);
  const survey = surveyTargets(repoRoot);
  const games = survey.publishable.filter((t) => t.kind === 'game');
  return {
    schema: CONTEXT_SCHEMA,
    protocol: {
      version: PROTOCOL_VERSION,
      jobSchema: AUDIO_JOB_SCHEMA,
      stages: JOB_STAGES,
      workflow: ['context', 'brief', 'program', 'render', 'analyze', 'select', 'publish'],
      searchWorkflow: 'program adımı yerine: search run → search decide → promote (bkz. search)',
      jobsRoot: DEFAULT_JOBS_ROOT,
      commands: {
        context: `${CLI} context --json`,
        init: `${CLI} init <jobId> --package <paket> --asset <paket-göreli .ogg> [--runtime-key <anahtar>] [--loop]`,
        status: `${CLI} status <jobId> --json`,
        brief: `${CLI} brief <jobId> --file <brief.json>`,
        program: `${CLI} program <jobId> --file <program.json>`,
        render: `${CLI} render <jobId> [--seed <n>] [--audition] [--draft]`,
        analyze: `${CLI} analyze <jobId> [--render <renderId>]`,
        select: `${CLI} select <jobId> [--render <renderId>] --reason <metin>`,
        publish: `${CLI} publish <jobId>`,
        derive: `${CLI} derive <jobId> --from <kaynak manifest> --profile <teslim profili> --asset <paket-göreli .ogg>`,
        verify: `${CLI} verify <manifest> [--json] | --all`,
      },
      rules: [
        'Durum yalnız repo dosyalarından hesaplanır; sonraki adım `status` çıktısındaki `next.action`dır.',
        'Belgeler kanonik JSON ile özetlenir; bir üst belge değişince alttakiler `stale` olur.',
        'Publish yalnız geçerli bir seçimle, kodek SONRASI sınıf politikasından geçerse yazılır.',
        'Yollar repo-göreli ve `/` ayraçlıdır; mutlak yol, `..` ve sembolik bağ reddedilir.',
        'Taslak render (`--draft`) aynı programı daha düşük iç aşırı örneklemeyle işler; kaydı `quality: "draft"` taşır ve publish taslak seçimi reddeder.',
        'Değişmeyen aşama ve sesler render önbelleğinden gelir; PCM önbellekli ve önbelleksiz aynıdır. Doğrulama (verify) önbelleği kullanmaz.',
        'Toplu işler (search run, family check, music check) tahmine göre worker iş parçacıklarında koşar; sonuç ve sıra seri koşuyla aynıdır.',
      ],
      rendering: {
        qualities: QUALITY_PROFILES,
        defaultQuality: 'final',
        publishAccepts: 'final',
        cache: { root: RENDER_CACHE_ROOT, disable: `${RENDER_CACHE_ENV}=off` },
        parallel: {
          workers: `${WORKERS_ENV}=<n> (1 = seri)`,
          minSecondsPerWorker: DEFAULT_PARALLEL_POLICY.minParallelSeconds,
          maxConcurrentPeakBytes: DEFAULT_PARALLEL_POLICY.maxConcurrentPeakBytes,
        },
      },
    },
    schemas: {
      brief: {
        id: AUDIO_BRIEF_SCHEMA,
        kinds: {
          acoustic: {
            subtypes: ['ambience', 'organic', 'sfx'],
            assetClasses: ['ambience', 'sfx', 'ui'],
            planning: 'mechanisms?, style?, material? — soundDesign.planner',
          },
          music: {
            status: 'supported',
            fields:
              'usage, playback, affect, tempo, meter, tonal, melodicSalience, rhythmicDensity, ' +
              'form, length, channels, spectralPriority, adaptive, themeBook, avoid',
            decisions:
              'playback, usage, form, tempo, meter, length eksikse karar isteği (MusicDecisionError)',
          },
        },
      },
      program: {
        id: ACOUSTIC_PROGRAM_SCHEMA,
        rendererVersion: PROGRAM_RENDERER_VERSION,
        limits: PROGRAM_LIMITS,
        substreamScheme: SUBSTREAM_SCHEME,
        unknownFields: 'reject',
        paramValue:
          'sayı | seçenek | { gesture } | { value?, gesture?, modulate: [{ by, depth }] } — ' +
          'gesture/modulate yalnız automatable alanda; depth dB alanda dB, diğerlerinde göreli oran',
        timeBase: 'gesture ve makro gesture’ı katman başlangıcına, modülatörler programa göre',
        macros:
          'controls: [{ control, version, value }] — value ∈ [0, 1], 0.5 nötr; hedefler registry’de',
      },
      archetypeRequest: {
        id: ARCHETYPE_REQUEST_SCHEMA,
        use: 'Acoustic.expandArchetype(istek) → AcousticProgramV1 belgesi; program adımıyla kaydedilir',
      },
      analysis: { id: AUDIO_ANALYSIS_SCHEMA, analyzerVersion: ANALYZER_VERSION },
      manifest: { id: ASSET_MANIFEST_SCHEMA },
      target: { id: AUDIO_TARGET_SCHEMA },
    },
    soundDesign: soundDesignContext(CLI),
    delivery: deliveryContext(CLI),
    ...(brief
      ? {
          briefPlan:
            brief.kind === 'acoustic'
              ? planBrief(brief)
              : { kind: 'music', rule: 'müzik brief’i music plan ile planlanır' },
        }
      : {}),
    search: searchContext(CLI),
    family: familyContext(CLI),
    music: musicContext(CLI),
    canaries: {
      schema: CANARY_SCHEMA,
      reviewsSchema: CANARY_REVIEWS_SCHEMA,
      root: CANARIES_ROOT,
      auditionRoot: CANARY_AUDITION_ROOT,
      entries: canaryReviews(repoRoot).map((r) => ({
        id: r.id,
        version: r.version,
        review: r.status,
      })),
      commands: {
        list: `${CLI} canary list`,
        run: `${CLI} canary run [--audition] [--json]`,
        review: `${CLI} canary review <id> --status pending-human|heard-acceptable|heard-problem --note <metin> --by human`,
      },
      rule: 'Mekanik beklentiler motor gerilemesini yakalar, "organik" kanıtı değildir; dinleme durumu yalnız insan beyanıyla değişir.',
    },
    benchmark: {
      schema: BENCHMARK_SCHEMA,
      reviewsSchema: BENCHMARK_REVIEWS_SCHEMA,
      root: BENCHMARKS_ROOT,
      auditionRoot: BENCHMARK_AUDITION_ROOT,
      entries: benchmarkReviews(repoRoot).map((r) => ({
        id: r.id,
        version: r.version,
        review: r.status,
      })),
      commands: {
        list: `${CLI} benchmark list`,
        run: `${CLI} benchmark run [--audition] [--json]  — 19 canary + görevler tek sürümlü raporda`,
        review: `${CLI} benchmark review <id> --status pending-human|heard-acceptable|heard-problem --note <metin> --by human`,
      },
      rule: 'Görev kriterleri gerçek davranışı ayırt eder (diğer görevlerin render’ını reddeder); dinleme durumu yalnız insan beyanıyla değişir.',
    },
    capabilities: {
      schema: QUALITY_MATRIX_SCHEMA,
      command: `${CLI} capabilities [--json] [--from-report <rapor.json>]`,
      levels: [
        'production-ready',
        'benchmarked',
        'canary',
        'regressed',
        'research',
        'pipeline',
        'unsupported',
      ],
      rule: 'Seviye görev/canary kaydından türetilir; registry’de sağlayıcı bulunması kanıt değildir. "production-ready" üç koşul ister: geçen görev + kategoriyi kapsayan doğrulanmış yayımlanmış manifest + güncel görev sürümünde insan heard-acceptable. "benchmarked" yalnız mekanik geçiştir.',
    },
    regression: {
      schema: 'RegressionReportV1',
      decisionsSchema: 'RegressionDecisionsV1',
      corpus: regressionCorpus(repoRoot).map((e) => ({ id: e.id, assetClass: e.assetClass })),
      decisions: Object.keys(regressionDecisions(repoRoot).decisions).length,
      commands: {
        corpus: `${CLI} regression corpus`,
        run: `${CLI} regression run [--json] [--ids a,b]`,
        decide: `${CLI} regression decide <id> --status accepted-change|rejected-regression --pcm sha256:… --note <metin> --by human`,
      },
      rule: 'PCM hash değişimi otomatik gerileme sayılmaz; değişen satır "audition-required" olur ve yalnız insan kararıyla (tam o hash’e bağlı) kapanır.',
    },
    registry: { hash: hashCanonical(registry), entries: registry },
    policy: { assetClasses: ASSET_CLASS_POLICIES, renderBudget: DEFAULT_RENDER_BUDGET },
    limitations: KNOWN_LIMITATIONS,
    targets: {
      publishable: survey.publishable,
      undeclaredActiveGames: survey.undeclaredGames,
      frozen: survey.frozen,
      note:
        games.length === 0
          ? 'Aktif, çalışma zamanı beyanlı bir oyun hedefi YOK; yalnız audio-synth referans fixture hedefi yayımlanabilir.'
          : `${games.length} aktif oyun hedefi beyanlı.`,
    },
  };
}
