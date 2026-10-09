import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const require = createRequire(import.meta.url);
const viteEntry = resolve(dirname(require.resolve('vite/package.json')), 'bin/vite.js');

/** Sunucu yalnız doğrudan Node çocuğuna aittir; mevcut port sahibi asla kapatılmaz. */
export async function startPreview({ cwd, port, entry = viteEntry }) {
  const probe = createServer();
  await new Promise((done, reject) => {
    probe.once('error', (error) =>
      reject(new Error(`Preview portu kullanımda: ${port}`, { cause: error })),
    );
    probe.listen(port, '127.0.0.1', () => probe.close(done));
  });
  const child = spawn(
    process.execPath,
    [entry, 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    },
  );
  let closed = false;
  let exit;
  let stderr = '';
  let stdout = '';
  let listening = false;
  const completion = new Promise((done) => {
    child.once('error', (error) => {
      exit = error.message;
    });
    child.once('close', (code, signal) => {
      closed = true;
      exit ??= code ?? signal;
      done();
    });
  });
  child.stderr.on('data', (chunk) => {
    stderr = `${stderr}${chunk}`.slice(-4096);
  });
  child.stdout.on('data', (chunk) => {
    stdout = `${stdout}${chunk}`.slice(-4096);
    listening ||= stdout.includes(`http://127.0.0.1:${port}/`);
  });
  const waitForClose = async (ms) => {
    const controller = new AbortController();
    try {
      await Promise.race([completion, delay(ms, undefined, { signal: controller.signal })]);
    } finally {
      controller.abort();
    }
  };
  const stop = async () => {
    if (closed) return;
    child.kill();
    await waitForClose(1000);
    if (!closed) {
      child.kill('SIGKILL');
      await waitForClose(1000);
    }
    if (!closed) throw new Error('Preview süreci kapanmadı');
  };
  try {
    const deadline = Date.now() + 4000;
    while (Date.now() < deadline) {
      if (closed) throw new Error(`Preview hazır olmadan kapandı (${exit}): ${stderr.trim()}`);
      try {
        const response = await fetch(`http://127.0.0.1:${port}/`, {
          signal: AbortSignal.timeout(250),
        });
        await response.body?.cancel();
        if (response.ok && listening && !closed) return { pid: child.pid, stop };
      } catch {
        // Sunucu HTTP dinleyicisini açana kadar sınırlı tekrar.
      }
      await Promise.race([completion, delay(40)]);
    }
    throw new Error(`Preview hazır olmadı: ${stderr.trim()}`);
  } catch (error) {
    await stop();
    throw error;
  }
}
