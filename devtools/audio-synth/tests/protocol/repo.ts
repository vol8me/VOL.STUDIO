import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { JobLocation } from '../../src/protocol/location';
import type { JobTargetV1 } from '../../src/protocol/records';

/**
 * Test deposu: gerçek repo'ya dokunmadan protokolü uçtan uca koşturur.
 * Bir referans hedefi (audio-synth), çalışma zamanı beyanlı bir test
 * oyunu, beyansız bir oyun ve frozen bir oyun içerir.
 */
export interface TestRepo {
  readonly root: string;
  readonly cleanup: () => void;
  readonly loc: (jobId?: string) => JobLocation;
}

export const JOBS_ROOT = 'devtools/audio-synth/audio-jobs';

export function createTestRepo(): TestRepo {
  const root = mkdtempSync(join(tmpdir(), 'audio-job-repo-'));
  writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages: []\n');
  writeFileSync(
    join(root, 'workspace-lifecycle.json'),
    JSON.stringify({
      schemaVersion: 1,
      workspaces: [
        { packageName: '@volstudio/audio-synth', path: 'devtools/audio-synth', status: 'active' },
        { packageName: '@volstudio/declared-game', path: 'games/declared-game', status: 'active' },
        { packageName: '@volstudio/bare-game', path: 'games/bare-game', status: 'active' },
        { packageName: '@volstudio/old-game', path: 'games/old-game', status: 'frozen' },
      ],
    }),
  );
  mkdirSync(join(root, 'games/declared-game'), { recursive: true });
  writeFileSync(
    join(root, 'games/declared-game/audio-target.json'),
    JSON.stringify({
      schema: 'AudioTargetV1',
      formats: ['ogg'],
      sampleRates: [48000],
      channels: [1],
      loop: false,
    }),
  );
  return {
    root,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
    loc: (jobId = 'knock') => ({ repoRoot: root, jobsRoot: JOBS_ROOT, jobId }),
  };
}

export const REFERENCE_TARGET: JobTargetV1 = {
  package: '@volstudio/audio-synth',
  asset: 'reference/production/assets/sfx/knock.ogg',
  integration: { runtimeKey: null, loop: false },
};

export function testBrief(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema: 'AudioBriefV1',
    kind: 'acoustic',
    id: 'knock',
    title: 'Test vuruşu',
    intent: 'Publish kapısı testi için kısa, kuru bir vuruş.',
    provenance: { author: 'agent', by: 'vitest' },
    subtype: 'sfx',
    assetClass: 'sfx',
    durationSeconds: { min: 0.2, max: 1 },
    channels: 1,
    ...overrides,
  };
}

/** Kodek sonrası sfx politikasından geçen küçük bir program. */
export function testProgram(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema: 'AcousticProgramV1',
    sampleRate: 48000,
    channels: 1,
    durationSeconds: 0.5,
    seed: 5,
    layers: [
      {
        name: 'body',
        source: { primitive: 'source.noise', version: 1, params: { color: 'white' } },
        resonators: [
          {
            primitive: 'resonator.biquad',
            version: 1,
            params: { mode: 'bandpass', frequency: 700, q: 12 },
          },
        ],
        articulation: {
          primitive: 'articulation.envelope',
          version: 1,
          params: { attack: 0.001, decay: 0.12, sustainLevel: 0, release: 0.05 },
        },
      },
    ],
    master: { normalize: 'peak', peakDbfs: -6 },
    ...overrides,
  };
}

/** Kodek sonrası politikayı İHLAL eden program: tam ölçekli sürekli beyaz gürültü. */
export function loudProgram(): Record<string, unknown> {
  return testProgram({
    layers: [
      {
        name: 'wall',
        source: { primitive: 'source.noise', version: 1, params: { color: 'white' } },
      },
    ],
    master: { normalize: 'peak', peakDbfs: 0 },
  });
}
