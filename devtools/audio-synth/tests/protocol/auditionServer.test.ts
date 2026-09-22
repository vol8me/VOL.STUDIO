import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { request } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  exportAuditionPage,
  startAuditionServer,
  type AuditionServer,
} from '../../src/protocol/auditionServer';
import { ProtocolError } from '../../src/protocol/errors';
import {
  exportSearchAudition,
  loadSearch,
  recordDecision,
  runSearch,
  type SearchLocation,
} from '../../src/protocol/search';
import { shellSpec } from '../search/fixtures';
import { createTestRepo, type TestRepo } from './repo';

const ROOT = 'devtools/audio-synth/audio-searches';
const PACKAGE = fileURLToPath(new URL('../..', import.meta.url));
const TSX = join(PACKAGE, 'node_modules/.bin/tsx');
const CLI = join(PACKAGE, 'scripts/audio-job.ts');

let repo: TestRepo;
let loc: SearchLocation;
let server: AuditionServer;
let port: number;
let passed: string;
let filtered: string;

beforeAll(async () => {
  repo = createTestRepo();
  loc = { repoRoot: repo.root, searchesRoot: ROOT, searchId: 'shell-test' };
  runSearch(
    repo.root,
    ROOT,
    shellSpec({ filters: [{ kind: 'descriptor', descriptor: 'centroidHz', max: 450 }] }),
  );
  const { report } = loadSearch(loc);
  passed = report.candidates.find((c) => c.state === 'passed')?.candidateId as string;
  filtered = report.candidates.find((c) => c.state === 'filtered')?.candidateId as string;
  server = await startAuditionServer(loc);
  port = Number(new URL(server.url).port);
}, 60_000);
afterAll(async () => {
  await server.close();
  repo.cleanup();
});

interface Reply {
  readonly status: number;
  readonly headers: Record<string, string | string[] | undefined>;
  readonly body: string;
}

function send(
  method: string,
  path: string,
  options: { headers?: Record<string, string>; body?: string } = {},
): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port,
        method,
        path,
        headers: { host: `127.0.0.1:${port}`, ...options.headers },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          }),
        );
      },
    );
    req.on('error', reject);
    if (options.body !== undefined) req.write(options.body);
    req.end();
  });
}

const post = (
  body: unknown,
  headers: Record<string, string> = { 'content-type': 'application/json' },
) =>
  send('POST', '/api/decision', {
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const searchFiles = () => [
  ...readdirSync(join(repo.root, ROOT, 'shell-test')).sort(),
  ...readdirSync(join(repo.root, ROOT, 'shell-test/candidates')).sort(),
];

describe('dinleme sunucusu — güvenlik sınırı', () => {
  it('yalnız loopback’e bağlanır; loopback dışı adres reddedilir', () => {
    expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
    expect(() => startAuditionServer(loc, { host: '0.0.0.0' as '127.0.0.1' })).toThrow(
      ProtocolError,
    );
  });

  it('sayfa sıkı CSP ile sunulur; yabancı Host başlığı (DNS rebinding) reddedilir', async () => {
    const page = await send('GET', '/');
    expect(page.status).toBe(200);
    expect(page.headers['content-security-policy']).toContain("default-src 'none'");
    expect(page.headers['x-content-type-options']).toBe('nosniff');
    expect(
      (await send('GET', '/api/state', { headers: { host: `evil.example:${port}` } })).status,
    ).toBe(421);
  });

  it('keyfi yol sunulmaz: gezinme, kodlanmış gezinme ve bilinmeyen aday 404', async () => {
    for (const path of [
      '/audio/../../../../etc/passwd',
      '/audio/%2e%2e%2fetc%2fpasswd',
      '/../spec.json',
      '/candidates/x.json',
      '/audio/c-0000000000000000.wav',
    ]) {
      expect((await send('GET', path)).status, path).toBe(404);
    }
    expect((await send('PUT', '/api/decision')).status).toBe(405);
  });

  it('ses yalnız raporda render edilmiş aday kimliğiyle export kökünden okunur', async () => {
    expect((await send('GET', `/audio/${passed}.wav`)).status).toBe(404);
    exportSearchAudition(loc);
    const audio = await send('GET', `/audio/${passed}.wav`);
    expect(audio.status).toBe(200);
    expect(audio.headers['content-type']).toBe('audio/wav');
  });

  it('yazma yalnız JSON, kendi origin’i ve doğrulanmış gövdeyle; başka hiçbir dosya yazılmaz', async () => {
    const before = searchFiles();
    expect(
      (
        await post(
          { candidateId: passed, state: 'approved', labels: [], note: null },
          { 'content-type': 'text/plain' },
        )
      ).status,
    ).toBe(415);
    expect(
      (
        await post(
          { candidateId: passed, state: 'approved', labels: [], note: null },
          { 'content-type': 'application/json', origin: 'http://evil.example' },
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await post({
          candidateId: passed,
          state: 'approved',
          labels: [],
          note: null,
          path: '/etc/passwd',
        })
      ).status,
    ).toBe(400);
    expect(
      (await post({ candidateId: '../../x', state: 'approved', labels: [], note: null })).status,
    ).toBe(400);
    expect(
      (await post({ candidateId: filtered, state: 'approved', labels: [], note: null })).status,
    ).toBe(400);
    expect(
      (await post({ candidateId: passed, state: 'maybe', labels: [], note: null })).status,
    ).toBe(400);
    expect((await post('{bozuk')).status).toBe(400);
    expect(
      (await post({ candidateId: passed, state: 'approved', labels: [], note: 'x'.repeat(20_000) }))
        .status,
    ).toBe(400);
    expect(searchFiles()).toEqual(before);

    const ok = await post(
      { candidateId: passed, state: 'approved', labels: ['keep'], note: '<b>ilk</b>' },
      {
        'content-type': 'application/json',
        origin: `http://127.0.0.1:${port}`,
      },
    );
    expect(ok.status).toBe(200);
    expect(searchFiles().sort()).toEqual([...before, 'selection.json'].sort());
  });

  it('sunucudan yazılan karar taze bir süreçte yeniden kurulur (by: human)', () => {
    const res = spawnSync(TSX, [CLI, 'search', 'status', 'shell-test', '--json'], {
      cwd: repo.root,
      encoding: 'utf8',
    });
    const status = JSON.parse(res.stdout) as {
      candidates: { candidateId: string; decision: string; by: string; note: string }[];
    };
    expect(status.candidates.find((c) => c.candidateId === passed)).toMatchObject({
      decision: 'approved',
      by: 'human',
      note: '<b>ilk</b>',
    });
  }, 60_000);

  it('statik kopya veriyi HTML olarak gömmez: </script> kaçışı yapılır', () => {
    recordDecision(loc, passed, {
      state: 'approved',
      by: 'human',
      labels: [],
      note: '</script><script>alert(1)</script>',
    });
    const page = readFileSync(join(repo.root, exportAuditionPage(loc)), 'utf8');
    expect(page).not.toContain('</script><script>alert(1)');
    expect(page).toContain('\\u003c/script>\\u003cscript>alert(1)\\u003c/script>');
    expect(page.match(/<script/g)).toHaveLength(2);
  });
});
