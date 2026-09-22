import { ASSET_CLASS_POLICIES } from '../analysis/assetQa';
import { ANALYZER_VERSION, AUDIO_ANALYSIS_SCHEMA } from '../analysis/report';
import { DEFAULT_RENDER_BUDGET } from '../guard/budget';
import { AUDIO_BRIEF_SCHEMA } from '../program/brief';
import { describeRegistry } from '../program/describe';
import { KNOWN_LIMITATIONS } from '../program/limitations';
import { SUBSTREAM_SCHEME } from '../program/random';
import { PROGRAM_RENDERER_VERSION } from '../program/render';
import { ACOUSTIC_PROGRAM_SCHEMA, PROGRAM_LIMITS } from '../program/schema';
import { hashCanonical } from './canonical';
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
export function buildContext(repoRoot: string) {
  const registry = describeRegistry();
  const survey = surveyTargets(repoRoot);
  const games = survey.publishable.filter((t) => t.kind === 'game');
  return {
    schema: CONTEXT_SCHEMA,
    protocol: {
      version: PROTOCOL_VERSION,
      jobSchema: AUDIO_JOB_SCHEMA,
      stages: JOB_STAGES,
      workflow: ['context', 'brief', 'program', 'render', 'analyze', 'select', 'publish'],
      jobsRoot: DEFAULT_JOBS_ROOT,
      commands: {
        context: `${CLI} context --json`,
        init: `${CLI} init <jobId> --package <paket> --asset <paket-göreli .ogg> [--runtime-key <anahtar>] [--loop]`,
        status: `${CLI} status <jobId> --json`,
        brief: `${CLI} brief <jobId> --file <brief.json>`,
        program: `${CLI} program <jobId> --file <program.json>`,
        render: `${CLI} render <jobId> [--seed <n>] [--audition]`,
        analyze: `${CLI} analyze <jobId> [--render <renderId>]`,
        select: `${CLI} select <jobId> [--render <renderId>] --reason <metin>`,
        publish: `${CLI} publish <jobId>`,
        verify: `${CLI} verify <manifest> [--json] | --all`,
      },
      rules: [
        'Durum yalnız repo dosyalarından hesaplanır; sonraki adım `status` çıktısındaki `next.action`dır.',
        'Belgeler kanonik JSON ile özetlenir; bir üst belge değişince alttakiler `stale` olur.',
        'Publish yalnız geçerli bir seçimle, kodek SONRASI sınıf politikasından geçerse yazılır.',
        'Yollar repo-göreli ve `/` ayraçlıdır; mutlak yol, `..` ve sembolik bağ reddedilir.',
      ],
    },
    schemas: {
      brief: {
        id: AUDIO_BRIEF_SCHEMA,
        kinds: {
          acoustic: {
            subtypes: ['ambience', 'organic', 'sfx'],
            assetClasses: ['ambience', 'sfx', 'ui'],
          },
          music: { status: 'unsupported', owner: 'Dalga 6 MusicBriefV1' },
        },
      },
      program: {
        id: ACOUSTIC_PROGRAM_SCHEMA,
        rendererVersion: PROGRAM_RENDERER_VERSION,
        limits: PROGRAM_LIMITS,
        substreamScheme: SUBSTREAM_SCHEME,
        unknownFields: 'reject',
        paramValue: 'sayı | seçenek | { "gesture": "<ad>" } (yalnız automatable)',
      },
      analysis: { id: AUDIO_ANALYSIS_SCHEMA, analyzerVersion: ANALYZER_VERSION },
      manifest: { id: ASSET_MANIFEST_SCHEMA },
      target: { id: AUDIO_TARGET_SCHEMA },
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
