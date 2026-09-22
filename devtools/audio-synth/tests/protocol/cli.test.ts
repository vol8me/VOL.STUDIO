import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RenderOutcome } from '../../src/protocol/job';
import type { AudioAssetManifestV1 } from '../../src/protocol/manifest';
import type { AssetVerificationV1 } from '../../src/protocol/publish';
import type { JobStatusV1 } from '../../src/protocol/status';
import { createTestRepo, loudProgram, testBrief, testProgram, type TestRepo } from './repo';

/**
 * Süreçler arası kabul senaryosu: her komut AYRI bir süreçtir. Süreç B,
 * A'nın belleğini ya da sohbetini görmez; yalnız repo dosyalarını okur.
 */
const PACKAGE = fileURLToPath(new URL('../..', import.meta.url));
const TSX = join(PACKAGE, 'node_modules/.bin/tsx');
const CLI = join(PACKAGE, 'scripts/audio-job.ts');

let repo: TestRepo;
beforeAll(() => {
  repo = createTestRepo();
  writeFileSync(join(repo.root, 'brief.json'), JSON.stringify(testBrief()));
  writeFileSync(join(repo.root, 'program.json'), JSON.stringify(testProgram()));
  writeFileSync(join(repo.root, 'loud.json'), JSON.stringify(loudProgram()));
});
afterAll(() => repo.cleanup());

interface CliError {
  readonly name: string;
  readonly code: string;
}

function cli(...args: string[]) {
  const res = spawnSync(TSX, [CLI, ...args], { cwd: repo.root, encoding: 'utf8' });
  const lastErr = res.stderr.trim().split('\n').pop() ?? '';
  return {
    status: res.status,
    text: res.stdout,
    json: <T>() => JSON.parse(res.stdout) as T,
    error: lastErr.startsWith('{') ? (JSON.parse(lastErr) as { error: CliError }).error : null,
  };
}

describe('audio:job — süreçler arası kabul', () => {
  it('A yarıda bırakır; B yalnız status ve dosyalarla doğru sonraki adımı bulur', () => {
    const asset = 'reference/production/assets/sfx/knock.ogg';
    expect(
      cli('init', 'knock', '--package', '@volstudio/audio-synth', '--asset', asset).status,
    ).toBe(0);
    expect(cli('brief', 'knock', '--file', 'brief.json').status).toBe(0);
    expect(cli('program', 'knock', '--file', 'program.json').status).toBe(0);
    const render = cli('render', 'knock');
    expect(render.status).toBe(0);
    const b = cli('status', 'knock', '--json').json<JobStatusV1>();
    expect(b.effectiveStage).toBe('rendered');
    expect(b.next.action).toBe('analyze');
    expect(b.artifacts.renders[0].renderId).toBe(render.json<RenderOutcome>().record.renderId);
  }, 60_000);

  it('B işi tamamlar; yeni bir süreç provenance’ı manifest’ten yeniden kurar ve doğrular', () => {
    expect(cli('analyze', 'knock').status).toBe(0);
    expect(cli('select', 'knock', '--reason', 'tek aday').status).toBe(0);
    const publishRun = cli('publish', 'knock');
    expect(publishRun.status).toBe(0);
    const published = publishRun.json<{ manifest: string; pcm: string }>();
    const status = cli('status', 'knock', '--json').json<JobStatusV1>();
    expect([status.effectiveStage, status.next.action]).toEqual(['published', 'done']);
    const verify = cli('verify', published.manifest, '--json');
    expect(verify.status).toBe(0);
    const [report] = verify.json<AssetVerificationV1[]>();
    expect(report.change).toBe('identical');
    expect(report.recorded).toEqual(report.current);
    expect(Object.keys(report.recorded).sort()).toEqual([
      'encodedHash',
      'encoderFingerprint',
      'pcmHash',
    ]);
    expect(report.recorded.pcmHash).toBe(published.pcm);
    const manifestText = readFileSync(join(repo.root, published.manifest), 'utf8');
    const manifest = JSON.parse(manifestText) as AudioAssetManifestV1;
    expect(manifest.encoder.version).toMatch(/^ffmpeg version/);
    expect(cli('verify', '--all', '--json').json<unknown[]>()).toHaveLength(1);
    expect(cli('verify', '--all').text).toMatch(/1\/1 manifest doğrulandı/);
  }, 60_000);

  it('program değişince B bayatlığı raporlar ve publish reddedilir (çıkış kodu 2)', () => {
    const file = join(repo.root, 'devtools/audio-synth/audio-jobs/knock/program.json');
    const program = JSON.parse(readFileSync(file, 'utf8')) as { seed: number };
    writeFileSync(file, JSON.stringify({ ...program, seed: program.seed + 1 }));
    const status = cli('status', 'knock', '--json').json<JobStatusV1>();
    expect(status.artifacts.program.state).toBe('modified');
    expect(status.artifacts.selection.state).toBe('stale');
    expect(status.artifacts.publication.state).toBe('stale');
    expect(status.next.action).toBe('program');
    const publish = cli('publish', 'knock');
    expect(publish.status).toBe(2);
    expect(publish.error).toMatchObject({ name: 'ProtocolError', code: 'stale' });
  }, 60_000);

  it('politika ihlali adlı hata ile düşer; context çıktısı deterministik', () => {
    expect(cli('program', 'knock', '--file', 'loud.json').status).toBe(0);
    for (const step of [
      ['render', 'knock'],
      ['analyze', 'knock'],
      ['select', 'knock', '--reason', 'x'],
    ]) {
      expect(cli(...step).status).toBe(0);
    }
    const publish = cli('publish', 'knock');
    expect(publish.status).toBe(2);
    expect(publish.error?.code).toBe('policy');
    const a = cli('context', '--json');
    expect(a.status).toBe(0);
    expect(a.text).toBe(cli('context', '--json').text);
    expect(cli('bogus').status).toBe(1);
    expect(cli('init', '../x', '--package', 'p', '--asset', 'a').error?.code).toBe('path');
  }, 60_000);
});
