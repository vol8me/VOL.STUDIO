import { createServer } from 'node:net';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});

async function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'vol-preview-'));
  roots.push(root);
  mkdirSync(join(root, 'dist'));
  writeFileSync(join(root, 'dist/index.html'), '<p>fixture-ready</p>');
  const socket = createServer();
  await new Promise<void>((done) => socket.listen(0, '127.0.0.1', done));
  const address = socket.address();
  if (!address || typeof address === 'string') throw new Error('port yok');
  const port = address.port;
  await new Promise<void>((done) => socket.close(() => done()));
  return { root, port };
}

it('hazır adresi renkli ve düz Vite çıktısında tanır, başka portu ve yarım adresi tanımaz', async () => {
  const { previewReady } = await import('../../scripts/device-preview.mjs');
  // Vite 8 portu ANSI kalın yazar: düz metin araması bunu bulamaz ve önizleme zaman aşımına uğrardı.
  const colored = '  Local:   [36mhttp://127.0.0.1:[1m4173[22m/[39m';
  expect(colored.includes('http://127.0.0.1:4173/')).toBe(false);
  expect(previewReady(colored, 4173)).toBe(true);
  expect(previewReady('  Local:   http://127.0.0.1:4173/', 4173)).toBe(true);
  expect(previewReady(colored, 4174)).toBe(false);
  expect(previewReady('  Local:   http://127.0.0.1:41730/', 4173)).toBe(false);
  expect(previewReady('http://127.0.0.1:4173', 4173)).toBe(false);
});

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
  // Süreç çıktıktan sonra Windows çalışma dizini tutamacını yük altında kısa süre geç bırakabilir;
  // sözleşme "anında" değil "sınırlı sürede (1 sn) silinebilir"dir.
  expect(() =>
    rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }),
  ).not.toThrow();
  expect(existsSync(root)).toBe(false);
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
