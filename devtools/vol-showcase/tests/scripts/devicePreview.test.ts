import { createServer } from 'node:net';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
});

async function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'vol-preview-'));
  roots.push(root);
  mkdirSync(join(root, 'dist'));
  writeFileSync(join(root, 'dist/index.html'), '<p>fixture-ready</p>');
  writeFileSync(join(root, 'vite.config.mjs'), 'export default {};');
  const socket = createServer();
  await new Promise<void>((done) => socket.listen(0, '127.0.0.1', done));
  const address = socket.address();
  if (!address || typeof address === 'string') throw new Error('port yok');
  const port = address.port;
  await new Promise<void>((done) => socket.close(() => done()));
  return { root, port };
}

it('gerçek Vite ardışık koşularda PID ve port bırakmadan kapanır', async () => {
  const { startPreview } = await import('../../scripts/device-preview.mjs');
  const { root, port } = await fixture();
  for (let index = 0; index < 2; index++) {
    const server = await startPreview({ cwd: root, port });
    try {
      expect(await (await fetch(`http://127.0.0.1:${port}`)).text()).toContain('fixture-ready');
      expect(() => process.kill(server.pid, 0)).not.toThrow();
    } finally {
      await server.stop();
    }
    expect(() => process.kill(server.pid, 0)).toThrow();
    await expect(fetch(`http://127.0.0.1:${port}`)).rejects.toThrow();
  }
});

it('dolu portu reddeder ve mevcut dinleyiciyi korur', async () => {
  const { startPreview } = await import('../../scripts/device-preview.mjs');
  const { root, port } = await fixture();
  const occupied = createServer();
  await new Promise<void>((done) => occupied.listen(port, '127.0.0.1', done));
  try {
    await expect(startPreview({ cwd: root, port })).rejects.toThrow(/kullanımda/);
    expect(occupied.listening).toBe(true);
  } finally {
    await new Promise<void>((done) => occupied.close(() => done()));
  }
});

it('hazır olmadan kapanan süreç HTTP zaman aşımını beklemeden reddedilir', async () => {
  const { startPreview } = await import('../../scripts/device-preview.mjs');
  const { root, port } = await fixture();
  const entry = join(root, 'exit.mjs');
  writeFileSync(entry, 'process.exit(17);');
  await expect(startPreview({ cwd: root, port, entry })).rejects.toThrow(/17/);
  await expect(fetch(`http://127.0.0.1:${port}`)).rejects.toThrow();
});
