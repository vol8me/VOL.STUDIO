import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { JsonlReport, runFleet, type FleetSummary } from '@volstudio/network/drive';
import type * as NetworkDrive from '@volstudio/network/drive';
import { parseDriveOptions } from '../../scripts/driveOptions';
import { runDrive } from '../../scripts/driveRun';

vi.mock('@volstudio/network/drive', async (original) => ({
  ...(await original<typeof NetworkDrive>()),
  runFleet: vi.fn(),
}));

let server: Server | undefined;
const folders: string[] = [];
const distribution = { count: 1, mean: 1, p50: 1, p99: 1, max: 1 };
const summary: FleetSummary = {
  clients: 8,
  joined: 8,
  joinFailures: {},
  dropped: 0,
  closeCodes: {},
  errors: 0,
  actErrors: 0,
  durationMs: 5000,
  joinMs: distribution,
  patchGapMs: distribution,
  pingMs: distribution,
  patchesPerSecond: 20,
  messagesPerSecond: 0,
};
afterEach(async () => {
  server?.closeAllConnections();
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
  server = undefined;
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
  vi.restoreAllMocks();
});

async function fixture() {
  const folder = mkdtempSync(join(tmpdir(), 'vol-drive-'));
  folders.push(folder);
  const out = join(folder, 'report.jsonl');
  let opened!: () => void;
  const ready = new Promise<void>((resolve) => {
    opened = resolve;
  });
  let closed!: () => void;
  const disconnected = new Promise<void>((resolve) => {
    closed = resolve;
  });
  server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.write('{"rooms":');
    response.on('close', closed);
    opened();
  });
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  const ops = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    out,
    ready,
    disconnected,
    options: parseDriveOptions(['--out', out, '--ops', ops, '--seconds', '5']),
  };
}

it.each([undefined, 'idle'] as const)(
  '%s koşusu hata verince uçuşta HTTP iptal olur ve gerçek JSONL dosyası kapanır',
  async (scenario) => {
    const fixtureData = await fixture();
    const close = vi.spyOn(JsonlReport.prototype, 'close');
    const write = vi.spyOn(JsonlReport.prototype, 'write');
    vi.mocked(runFleet).mockImplementation(async (options) => {
      options.report?.write('fault-test');
      await fixtureData.ready;
      throw new Error('run failed');
    });
    await expect(
      runDrive({ ...fixtureData.options, scenarios: scenario ? [scenario] : [] }),
    ).rejects.toThrow('run failed');
    await fixtureData.disconnected;
    expect(close).toHaveBeenCalledOnce();
    expect(write.mock.calls.map(([event]) => event)).toEqual(
      scenario ? ['scenario.start', 'fault-test'] : ['fault-test'],
    );
    expect(readFileSync(fixtureData.out, 'utf8')).toContain('fault-test');
  },
);

it.each([undefined, 'idle'] as const)(
  '%s iptali sessiz PASS üretmez; bekleyen gövde ve rapor kapanır',
  async (scenario) => {
    const fixtureData = await fixture();
    const controller = new AbortController();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.mocked(runFleet).mockImplementation(async () => {
      await fixtureData.ready;
      controller.abort();
      return summary;
    });
    expect(
      await runDrive(
        { ...fixtureData.options, scenarios: scenario ? [scenario] : [] },
        controller.signal,
      ),
    ).toBe(false);
    await fixtureData.disconnected;
    const rows = readFileSync(fixtureData.out, 'utf8').trim().split('\n');
    expect(JSON.parse(rows.at(-1)!) as { ev: string }).toMatchObject({ ev: 'aborted' });
  },
);

it('profil olmasa da eksik katılım sessiz başarı üretmez', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'vol-drive-'));
  folders.push(folder);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.mocked(runFleet).mockResolvedValue({
    ...summary,
    joined: 7,
    joinFailures: { unreachable: 1 },
  });
  expect(await runDrive(parseDriveOptions(['--out', join(folder, 'report.jsonl')]))).toBe(false);
});
