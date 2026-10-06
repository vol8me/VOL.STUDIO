import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sha256Bytes } from '../../src/kernel/canonical';
import { ProtocolError } from '../../src/protocol/errors';
import type { AudioAssetManifestV1 } from '../../src/protocol/manifest';
import { publishJob, publishTargetLocks } from '../../src/protocol/publish';
import { jobStatus } from '../../src/protocol/status';
import { spawnTsx } from '../support/process';
import { PIPELINE_TIMEOUT } from '../support/timeouts';
import { createTestRepo, prepareSelectedJob, type TestRepo } from './repo';

let repo: TestRepo;
beforeEach(() => {
  repo = createTestRepo();
});
afterEach(() => repo.cleanup());

const asset = 'devtools/audio-synth/reference/production/assets/sfx/knock.ogg';
const manifest = 'devtools/audio-synth/reference/production/manifests/sfx/knock.json';
const locksDir = (): string => join(repo.root, 'node_modules/.cache/audio-synth/publish/locks');

const prepare = (jobId: string) => prepareSelectedJob(repo, jobId);

interface ChildResult {
  readonly ok: boolean;
  readonly code?: string;
}

const CHILD = resolve(import.meta.dirname, '../support/publishChild.ts');

/** İki gerçek Node süreci aynı anda başlatılır; ikisi de hazır olmadan hiçbiri yayına girmez. */
async function race(jobs: readonly string[]): Promise<ChildResult[]> {
  const gate = join(repo.root, 'gate');
  mkdirSync(gate, { recursive: true });
  const start = join(gate, 'start');
  const children = jobs.map((jobId) => {
    const ready = join(gate, `${jobId}.ready`);
    const child = spawnTsx(CHILD, [repo.root, jobId, ready, start], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk: Buffer) => (stdout += chunk.toString('utf8')));
    child.stderr?.on('data', (chunk: Buffer) => (stderr += chunk.toString('utf8')));
    const done = new Promise<ChildResult>((resolveChild, reject) => {
      child.on('error', reject);
      child.on('close', (status) => {
        if (status !== 0) reject(new Error(`alt süreç ${jobId} çıktı ${status}: ${stderr}`));
        else resolveChild(JSON.parse(stdout) as ChildResult);
      });
    });
    return { ready, done };
  });
  const deadline = Date.now() + 30_000;
  while (!children.every(({ ready }) => existsSync(ready))) {
    if (Date.now() > deadline) throw new Error('alt süreçler hazır olmadı');
    await new Promise((r) => setTimeout(r, 20));
  }
  writeFileSync(start, '1');
  return Promise.all(children.map(({ done }) => done));
}

function code(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    if (error instanceof ProtocolError) return error.code;
    throw error;
  }
  throw new Error('hata beklenirken geçti');
}

describe('ortak yayın hedefi sahipliği (B04)', () => {
  it(
    'iki ayrı süreç aynı hedefe yayımlarken tek kazanan olur; kaybeden açık hata alır',
    async () => {
      prepare('audit-a');
      prepare('audit-b');
      const results = await race(['audit-a', 'audit-b']);

      expect(results.filter((r) => r.ok)).toHaveLength(1);
      const loser = results.find((r) => !r.ok);
      expect(['locked', 'overwrite']).toContain(loser?.code);

      const winnerId = results[0].ok ? 'audit-a' : 'audit-b';
      const loserId = winnerId === 'audit-a' ? 'audit-b' : 'audit-a';
      const published = JSON.parse(
        readFileSync(join(repo.root, manifest), 'utf8'),
      ) as AudioAssetManifestV1;
      // Asset, manifest ve kazanan job aynı yayına ait.
      expect(published.job.jobId).toBe(winnerId);
      expect(sha256Bytes(readFileSync(join(repo.root, asset)))).toBe(published.asset.encodedHash);
      expect(jobStatus(repo.loc(winnerId)).effectiveStage).toBe('published');
      // Kaybedenin kaydı hedefle tutarsız bir başarı taşımaz.
      expect(jobStatus(repo.loc(loserId)).effectiveStage).not.toBe('published');
      expect(
        readdirSync(dirname(join(repo.root, asset))).filter((n) => n.startsWith('.tmp-')),
      ).toEqual([]);
      expect(readdirSync(locksDir()).filter((n) => !n.startsWith('.tmp-'))).toEqual([]);
    },
    PIPELINE_TIMEOUT,
  );

  const lockNames = (): readonly string[] =>
    publishTargetLocks(repo.root, { assetPath: asset, manifestPath: manifest }).names;

  it('hedef kilidi başka bir canlı süreçteyse yayın hiçbir dosya yazmadan locked ile düşer', () => {
    const loc = prepare('knock');
    mkdirSync(locksDir(), { recursive: true });
    for (const name of lockNames()) writeFileSync(join(locksDir(), name), String(process.ppid));

    expect(code(() => publishJob(loc))).toBe('locked');

    expect(existsSync(join(repo.root, asset))).toBe(false);
    expect(existsSync(join(repo.root, manifest))).toBe(false);
    expect(jobStatus(loc).effectiveStage).not.toBe('published');
    // Başkasının kilidi bozulmadı.
    for (const name of lockNames()) expect(existsSync(join(locksDir(), name))).toBe(true);
    const staging = join(repo.root, 'node_modules/.cache/audio-synth/publish');
    expect(readdirSync(staging).filter((n) => n.startsWith('.tmp-publish'))).toEqual([]);
  });

  it('ölü sürecin hedef kilidi devralınır ve yayın sonunda bırakılır', () => {
    const loc = prepare('knock');
    mkdirSync(locksDir(), { recursive: true });
    for (const name of lockNames()) writeFileSync(join(locksDir(), name), '2147483646');

    publishJob(loc);

    expect(existsSync(join(repo.root, manifest))).toBe(true);
    for (const name of lockNames()) expect(existsSync(join(locksDir(), name))).toBe(false);
  });

  it('kilit adı büyük/küçük harfe duyarsızdır; farklı hedefler ayrı kilit alır', () => {
    const a = publishTargetLocks(repo.root, {
      assetPath: 'g/Knock.ogg',
      manifestPath: 'g/m/Knock.json',
    });
    const b = publishTargetLocks(repo.root, {
      assetPath: 'g/knock.ogg',
      manifestPath: 'g/m/knock.json',
    });
    const c = publishTargetLocks(repo.root, {
      assetPath: 'g/other.ogg',
      manifestPath: 'g/m/other.json',
    });
    expect(a.names).toEqual(b.names);
    expect(c.names.some((name) => a.names.includes(name))).toBe(false);
    for (const name of a.names) expect(name).toMatch(/^target-[0-9a-f]{24}\.lock$/);
  });
});
