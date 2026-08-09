import http from 'http';

const PORT = 9876;
const HOST = '127.0.0.1';

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

const server = http.createServer((req, res) => {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'POST' && (req.url === '/debug' || req.url === '/perf')) {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        console.log(formatLine(data));
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('ok');
      } catch (err) {
        console.error('[debug-server] JSON parse hatası:', err.message);
        res.writeHead(400);
        res.end('bad request');
      }
    });
    return;
  }

  res.writeHead(404);
  res.end('not found');
});

function formatLine(data) {
  const ts = new Date().toISOString();
  const game = data.gameId ?? 'unknown';
  const scene = data.scene ? `:${data.scene}` : '';
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
  return ' | ' + Object.entries(counts)
    .map(([k, v]) => `${k}:${v}`)
    .join(' ');
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
    return ` | keys:[${keys.join(',')}] mouse:(${Math.round(pointer.x)},${Math.round(pointer.y)},${btn})`;
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
    counts.set(e.type, (counts.get(e.type) ?? 0) + 1);
  }
  const summary = [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([type, count]) => `${type}:${count}`)
    .join(',');
  return ` | events:[${summary}]`;
}

server.listen(PORT, HOST, () => {
  console.log(`[debug-server] http://${HOST}:${PORT}/debug adresinde dinleniyor`);
});
