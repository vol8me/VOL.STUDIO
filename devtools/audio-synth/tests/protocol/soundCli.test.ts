import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { renderProgram } from '../../src/program/render';
import { sha256Bytes } from '../../src/protocol/canonical';
import { DEFAULT_SAMPLES_ROOT, SAMPLE_ASSET_SCHEMA } from '../../src/protocol/samples';
import { encodeWav } from '../../src/writer';
import { snakeHiss } from '../program/graphFixtures';
import { createTestRepo, testBrief, type TestRepo } from './repo';

/**
 * `audio:job plan | graph | samples | context --brief` — ses tasarımı
 * yüzeyinin CLI kabuğu ayrı süreçte, geçici depoda.
 */
const PACKAGE = fileURLToPath(new URL('../..', import.meta.url));
const TSX = join(PACKAGE, 'node_modules/.bin/tsx');
const CLI = join(PACKAGE, 'scripts/audio-job.ts');

let repo: TestRepo;
const tonePath = () => join(repo.root, DEFAULT_SAMPLES_ROOT, 'tone.json');

function cli(...args: string[]) {
  const res = spawnSync(TSX, [CLI, ...args], { cwd: repo.root, encoding: 'utf8' });
  const last = res.stderr.trim().split('\n').pop() ?? '';
  return {
    status: res.status,
    json: <T>() => JSON.parse(res.stdout) as T,
    error: last.startsWith('{') ? (JSON.parse(last) as { error: { code: string } }).error : null,
  };
}

beforeAll(() => {
  repo = createTestRepo();
  const snake = { ...testBrief(), id: 'snake', title: 'Yılan', intent: 'Yılan tıslaması.' };
  writeFileSync(join(repo.root, 'snake.json'), JSON.stringify(snake));
  writeFileSync(
    join(repo.root, 'speech.json'),
    JSON.stringify({ ...snake, title: 'Anons', intent: 'Konuşma anonsu.' }),
  );
  writeFileSync(join(repo.root, 'graph.json'), JSON.stringify(snakeHiss()));
  const program = {
    schema: 'AcousticProgramV1',
    sampleRate: 48000,
    channels: 1,
    durationSeconds: 0.1,
    seed: 1,
    layers: [{ name: 't', source: { primitive: 'source.oscillator', version: 1 } }],
    master: { normalize: 'peak', peakDbfs: -3 },
  };
  mkdirSync(join(repo.root, DEFAULT_SAMPLES_ROOT), { recursive: true });
  writeFileSync(
    tonePath(),
    JSON.stringify({
      schema: SAMPLE_ASSET_SCHEMA,
      id: 'tone',
      title: 'Ton',
      format: 'wav-pcm16',
      hash: sha256Bytes(encodeWav(renderProgram(program))),
      sampleRate: 48000,
      channels: 1,
      frames: 4800,
      origin: { kind: 'synthetic-fixture', program },
    }),
  );
});
afterAll(() => repo.cleanup());

describe('audio:job plan / graph', () => {
  it('plan --brief iskelet yazar; jobId yolu işin brief’ini okur', () => {
    const run = cli('plan', '--brief', 'snake.json', '--skeleton', 'skeleton.json');
    expect(run.status).toBe(0);
    expect(run.json<{ layers: { name: string }[] }>().layers.map((l) => l.name)).toEqual([
      'airflow',
      'hiss',
      'sibilant-resonance',
    ]);
    const skeleton = JSON.parse(readFileSync(join(repo.root, 'skeleton.json'), 'utf8')) as {
      schema: string;
    };
    expect(skeleton.schema).toBe('AcousticProgramV1');
    const asset = 'reference/production/assets/sfx/snake.ogg';
    expect(
      cli('init', 'snake', '--package', '@volstudio/audio-synth', '--asset', asset).status,
    ).toBe(0);
    expect(cli('brief', 'snake', '--file', 'snake.json').status).toBe(0);
    expect(cli('plan', 'snake').json<{ brief: { id: string } }>().brief.id).toBe('snake');
  }, 60_000);

  it('desteklenmeyen mekanizma iskelet istenince adlı hatayla durur', () => {
    const run = cli('plan', '--brief', 'speech.json', '--skeleton', 'x.json');
    expect(run.status).not.toBe(0);
    expect(run.error?.code).toBe('invalid');
  }, 60_000);

  it('graph topoloji özetini ve iki ayrı özeti verir; context --brief planı taşır', () => {
    const graph = cli('graph', '--file', 'graph.json').json<{
      graph: { schema: string };
      topologyHash: string;
      graphHash: string;
    }>();
    expect(graph.graph.schema).toBe('SoundGraphV1');
    expect(graph.topologyHash).not.toBe(graph.graphHash);
    const context = cli('context', '--brief', 'snake.json').json<{
      briefPlan: { schema: string };
    }>();
    expect(context.briefPlan.schema).toBe('ProgramPlanV1');
  }, 60_000);
});

describe('audio:job samples', () => {
  it('list, decl ve verify; bilinmeyen kimlik ve alt komut adlı hata', () => {
    const [entry] = cli('samples', 'list').json<
      { id: string; origin: string; seconds: number }[]
    >();
    expect(entry).toMatchObject({ id: 'tone', origin: 'synthetic-fixture', seconds: 0.1 });
    expect(cli('samples', 'decl', 'tone').json<{ frames: number }>().frames).toBe(4800);
    expect(cli('samples', 'verify').status).toBe(0);
    expect(cli('samples', 'decl', 'none').error?.code).toBe('not-found');
    expect(cli('samples', 'drop').error?.code).toBe('invalid');
    const doc = JSON.parse(readFileSync(tonePath(), 'utf8')) as Record<string, unknown>;
    writeFileSync(tonePath(), JSON.stringify({ ...doc, hash: `sha256:${'0'.repeat(64)}` }));
    expect(cli('samples', 'verify').status).toBe(1);
  }, 60_000);
});
