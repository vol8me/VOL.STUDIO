import http from 'http';

const portIndex = process.argv.indexOf('--port');
const PORT = portIndex === -1 ? 9876 : Number(process.argv[portIndex + 1]);
if (!Number.isInteger(PORT) || PORT < 0 || PORT > 65535) {
  throw new RangeError('Tanı portu 0–65535 arasında tam sayı olmalı.');
}
const HOST = '127.0.0.1';
const MAX_BODY_BYTES = 64 * 1024;

function allowedOrigin(origin) {
  if (origin === undefined) return true;
  if (['tauri://localhost', 'http://tauri.localhost', 'https://tauri.localhost'].includes(origin))
    return true;
  try {
    const url = new URL(origin);
    return (
      url.origin === origin &&
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    );
  } catch {
    return false;
  }
}

function setCorsHeaders(req, res) {
  if (req.headers.origin !== undefined) {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

const server = http.createServer((req, res) => {
  req.on('error', () => {
    if (!res.headersSent && !res.destroyed) {
      res.writeHead(400, { Connection: 'close' });
      res.end('bad request');
    }
  });
  // Soket loopback olsa da DNS rebinding ve yabancı web sayfası yerel sahip değildir.
  const port = server.address().port;
  if (
    ![`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`].includes(req.headers.host) ||
    !allowedOrigin(req.headers.origin)
  ) {
    res.writeHead(403, { Connection: 'close' });
    res.end('forbidden');
    req.resume();
    return;
  }
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'POST' && (req.url === '/debug' || req.url === '/perf')) {
    let size = 0;
    const chunks = [];
    let rejected = false;
    const rejectOversized = () => {
      rejected = true;
      chunks.length = 0;
      res.writeHead(413, { Connection: 'close' });
      res.end('payload too large');
      req.resume();
    };
    if (Number(req.headers['content-length']) > MAX_BODY_BYTES) {
      rejectOversized();
      return;
    }
    req.on('aborted', () => {
      rejected = true;
      chunks.length = 0;
    });
    req.on('data', (chunk) => {
      if (rejected) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) rejectOversized();
      else chunks.push(chunk);
    });
    req.on('end', () => {
      if (rejected) return;
      try {
        const data = validateSnapshot(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        console.log(formatLine(data));
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('ok');
      } catch {
        // Parse hata metni de ham istek parçaları taşıyabilir; terminale aktarılmaz.
        res.writeHead(400);
        res.end('bad request');
      }
    });
    return;
  }

  res.writeHead(404);
  res.end('not found');
});

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateNumericRecords(data) {
  for (const key of ['frame', 'render', 'update', 'counts']) {
    if (data[key] === undefined) continue;
    if (!isRecord(data[key]) || !Object.values(data[key]).every(Number.isFinite)) {
      throw new Error('Özet alanları sonlu sayılar olmalı.');
    }
  }
}

function validateSnapshot(data) {
  if (!isRecord(data)) throw new Error('Snapshot nesne olmalı.');
  for (const key of ['gameId', 'scene']) {
    if (data[key] !== undefined && typeof data[key] !== 'string')
      throw new Error('Etiket metin olmalı.');
  }
  if (data.fps !== undefined && !Number.isFinite(data.fps)) throw new Error('FPS sonlu olmalı.');
  validateNumericRecords(data);
  if (
    data.events !== undefined &&
    (!Array.isArray(data.events) ||
      !data.events.every((event) => isRecord(event) && typeof event.type === 'string'))
  ) {
    throw new Error('Olay türü metin olmalı.');
  }
  if (
    data.input !== undefined &&
    (!isRecord(data.input) || typeof data.input.activeProvider !== 'string')
  ) {
    throw new Error('Girdi sağlayıcısı metin olmalı.');
  }
  return data;
}

function label(value) {
  return value.replace(/[\p{Cc}\u2028\u2029]/gu, ' ').slice(0, 128);
}

function formatLine(data) {
  const ts = new Date().toISOString();
  const game = label(data.gameId ?? 'unknown');
  const scene = data.scene ? `:${label(data.scene)}` : '';
  const fps = data.fps?.toFixed(1) ?? '---';
  const frame = data.frame ?? {};
  const frameMin = frame.min?.toFixed(1) ?? '---';
  const frameMax = frame.max?.toFixed(1) ?? '---';
  const renderAvg = data.render?.avg?.toFixed(2) ?? '---';
  const updateAvg = data.update?.avg?.toFixed(2) ?? '---';
  const counts = formatCounts(data.counts);
  const input = formatInput(data.input);
  const events = formatEvents(data.events);

  return `[${ts}] [${game}${scene}] FPS:${fps} frame[${frameMin}-${frameMax}] render:${renderAvg}ms update:${updateAvg}ms${input}${events}${counts}`;
}

function formatCounts(counts) {
  if (!counts || Object.keys(counts).length === 0) return '';
  return (
    ' | ' +
    Object.entries(counts)
      .map(([k, v]) => `${label(k)}:${v}`)
      .join(' ')
  );
}

function formatInput(input) {
  if (!input) return '';

  if (input.activeProvider === 'pc' && input.pc) {
    const keys = [];
    if (input.pc.wasd.up) keys.push('W');
    if (input.pc.wasd.left) keys.push('A');
    if (input.pc.wasd.down) keys.push('S');
    if (input.pc.wasd.right) keys.push('D');
    if (input.pc.dash) keys.push('SPACE');
    const pointer = input.pc.pointer;
    const btn = pointer.leftButtonDown ? 'L' : pointer.isDown ? 'R' : '-';
    return ` | keys:[${keys.join(',')}] mouse:(${Math.round(pointer.x)},${Math.round(
      pointer.y,
    )},${btn})`;
  }

  if (input.activeProvider === 'touch' && input.touch) {
    const left = formatStick(input.touch.left);
    const right = formatStick(input.touch.right);
    return ` | touch:L${left} R${right}`;
  }

  return '';
}

function formatStick(stick) {
  if (!stick) return '(-)';
  const bx = Math.round(stick.base.x);
  const by = Math.round(stick.base.y);
  const cx = Math.round(stick.current.x);
  const cy = Math.round(stick.current.y);
  return `(${bx},${by})->(${cx},${cy})`;
}

function formatEvents(events) {
  if (!Array.isArray(events) || events.length === 0) return '';
  const counts = new Map();
  for (const e of events) {
    const type = label(e.type);
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  const summary = [...counts.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([type, count]) => `${type}:${count}`)
    .join(',');
  return ` | events:[${summary}]`;
}

server.listen(PORT, HOST, () => {
  console.log(`[debug-server] http://${HOST}:${server.address().port}/debug adresinde dinleniyor`);
});

server.on('error', (error) => {
  console.error('[debug-server] Sunucu başlatılamadı:', label(error.code ?? 'UNKNOWN'));
  process.exitCode = 1;
});
