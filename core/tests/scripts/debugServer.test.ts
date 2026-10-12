import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { once } from 'node:events';
import http from 'node:http';
import net from 'node:net';
import { resolve as resolvePath } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let child: ChildProcessWithoutNullStreams;
let port: number;
let output = '';

beforeAll(async () => {
  child = spawn(
    process.execPath,
    [resolvePath(import.meta.dirname, '../../scripts/debug-server.mjs'), '--port', '0'],
    { windowsHide: true },
  );
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', () => {});
  await new Promise<void>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => reject(new Error(`Tanı sunucusu erken kapandı: ${code}`)));
    child.stdout.on('data', (chunk: string) => {
      output += chunk;
      const match = /http:\/\/127\.0\.0\.1:(\d+)\/debug/.exec(output);
      if (!match) return;
      port = Number(match[1]);
      resolve();
    });
  });
});

afterAll(async () => {
  if (child && child.exitCode === null && child.signalCode === null) {
    const exited = once(child, 'exit');
    child.kill();
    await exited;
  }
});

function request(
  body: string,
  headers: Record<string, string> = {},
  method = 'POST',
  chunks?: string[],
) {
  return new Promise<{ status: number; headers: http.IncomingHttpHeaders }>((resolve, reject) => {
    const req = http.request(
      { hostname: '127.0.0.1', port, path: '/debug', method, headers, agent: false },
      (res) => {
        res.resume();
        res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers }));
      },
    );
    req.on('error', reject);
    if (chunks) for (const chunk of chunks) req.write(chunk);
    req.end(method === 'OPTIONS' ? '' : body);
  });
}

describe('yerel tanı sunucusu güven sınırı', () => {
  it.each(['POST', 'OPTIONS'])(
    'yabancı Origin %s CORS izni vermeden reddedilir',
    async (method) => {
      const response = await request('{}', { Origin: 'https://example.invalid' }, method);
      expect(response.status).toBe(403);
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    },
  );

  it.each(['null', 'http://localhost.example.invalid', 'http://tauri.localhost:3133'])(
    'izinli kökene benzemeyen %s reddedilir',
    async (origin) => {
      expect((await request('{}', { Origin: origin })).status).toBe(403);
    },
  );

  it('yerel sokette DNS rebinding Host değerini reddeder', async () => {
    const response = await request('{}', { Host: `example.invalid:${port}` });
    expect(response.status).toBe(403);
  });

  it.each([
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'https://tauri.localhost',
    'tauri://localhost',
  ])('izinli %s kökenine açık CORS yanıtı verir', async (origin) => {
    const response = await request('{}', { Origin: origin }, 'OPTIONS');
    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe(origin);
  });

  it('Content-Length büyükse isteği 413 ile reddeder', async () => {
    expect((await request('x'.repeat(65_537), { 'Content-Length': '65537' })).status).toBe(413);
  });

  it('64 KiB sınırındaki geçerli JSON kabul edilir', async () => {
    const json = '{"gameId":"test"}';
    expect((await request(json + ' '.repeat(65_536 - json.length))).status).toBe(200);
  });

  it('parçalı istek gövdesi byte sınırını aşınca 413 döner', async () => {
    expect((await request('', {}, 'POST', ['x'.repeat(40_000), 'x'.repeat(40_000)])).status).toBe(
      413,
    );
  });

  it.each(['null', '[]', '{"fps":"60"}', '{"counts":{"vehicles":{}}}', '{"events":[{"type":{}}]}'])(
    'bozuk snapshot %s loga girmeden reddedilir',
    async (body) => {
      expect((await request(body)).status).toBe(400);
    },
  );

  it('snapshot etiketlerinden kontrol karakterlerini kaldırıp tek log satırı üretir', async () => {
    const before = output.length;
    const loggedReady = new Promise<void>((resolve) => {
      const onOutput = () => {
        if (!output.slice(before).includes('actors')) return;
        child.stdout.off('data', onOutput);
        resolve();
      };
      child.stdout.on('data', onOutput);
    });
    const response = await request(
      JSON.stringify({
        gameId: 'test\n\u001b[2J',
        scene: 'world\r\n',
        counts: { 'actors\n\u001b[31m': 2 },
        events: [{ type: 'shot\n\u001b[1m' }],
      }),
    );
    expect(response.status).toBe(200);
    await loggedReady;
    const logged = output.slice(before);
    expect(logged.trim().split('\n')).toHaveLength(1);
    expect(logged).not.toMatch(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/);
    expect(logged).toContain('actors');
  });

  it('yarım kalan istek sunucuyu düşürmez; sonraki snapshot kabul edilir', async () => {
    const socket = net.connect(port, '127.0.0.1');
    socket.on('error', () => {});
    await once(socket, 'connect');
    const closed = once(socket, 'close');
    socket.end(`POST /debug HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nContent-Length: 10\r\n\r\n{`);
    socket.resume();
    await closed;
    expect((await request('{"gameId":"test","fps":60}')).status).toBe(200);
  });
});
