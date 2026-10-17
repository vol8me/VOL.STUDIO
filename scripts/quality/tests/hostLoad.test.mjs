import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BUSY_WARN_FRACTION,
  PROCESS_LIST_LIMIT,
  busyFraction,
  checkHostLoad,
  describeBusy,
  formatBusyWarning,
  parsePosixTable,
  parseWindowsSample,
  stopCommand,
} from '../hostLoad.mjs';

const ROOT = 'C:\\Dev\\VOL.STUDIO';

const cpu = (idle, busy) => ({ times: { user: busy, nice: 0, sys: 0, idle, irq: 0 } });

test('meşgul oran, iki örnek arasındaki boşta süresinden hesaplanır', () => {
  assert.equal(busyFraction([cpu(0, 0), cpu(0, 0)], [cpu(50, 50), cpu(50, 50)]), 0.5);
  assert.equal(busyFraction([cpu(0, 0)], [cpu(100, 0)]), 0);
  assert.equal(busyFraction([cpu(0, 0)], [cpu(0, 100)]), 1);
});

test('örnek arasında zaman geçmediyse oran 0 (sıfıra bölme yok)', () => {
  assert.equal(busyFraction([cpu(10, 10)], [cpu(10, 10)]), 0);
  assert.equal(busyFraction([], []), 0);
});

test('PowerShell örneği makine payına çevrilir: işlemci saniyesi / (pencere × çekirdek)', () => {
  const json = JSON.stringify({
    seconds: 2,
    rows: [{ pid: 7, ppid: 1, name: 'node', command: 'node vite.js', cpuSeconds: 4 }],
  });
  const [row] = parseWindowsSample(json, 8);
  assert.equal(row.pid, 7);
  assert.equal(row.fraction, 4 / (2 * 8));
});

test('PowerShell tek satırı nesne olarak döndürürse de okunur, boş çıktı süreçsizdir', () => {
  const single = JSON.stringify({
    seconds: 1,
    rows: { pid: 9, ppid: 1, name: 'node', command: null, cpuSeconds: 1 },
  });
  assert.equal(parseWindowsSample(single, 4).length, 1);
  assert.equal(parseWindowsSample(single, 4)[0].command, '');
  assert.deepEqual(parseWindowsSample(JSON.stringify({ seconds: 1, rows: [] }), 4), []);
});

test('ps çıktısı çözülür; pcpu bir çekirdeğin yüzdesidir', () => {
  const table = [
    '  101     1 150.0 node node /repo/vite.js --port 5198',
    '  102   101   2.5 chrome chrome --headless',
    'başlık satırı değil',
  ].join('\n');
  const rows = parsePosixTable(table, 4);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].fraction, 1.5 / 4);
  assert.equal(rows[0].command, 'node /repo/vite.js --port 5198');
  assert.equal(rows[1].name, 'chrome');
});

const row = (pid, fraction, command, ppid = 1) => ({
  pid,
  ppid,
  name: 'node',
  command,
  fraction,
});

test('eşiğin altındaki yük uyarı üretmez', () => {
  assert.equal(
    describeBusy({ busy: BUSY_WARN_FRACTION - 0.01, processes: [], root: ROOT, selfPid: 1 }),
    null,
  );
});

test('en çok yiyenden başlar, repo sürecini işaretler ve yalnız onu kapatma listesine alır', () => {
  const processes = [
    row(10, 0.05, 'chrome --headless'),
    row(
      11,
      0.15,
      `node "${ROOT}\\devtools\\vol-showcase\\node_modules\\vite\\bin\\vite.js" --port 5198`,
    ),
    row(12, 0.01, 'node eşiğin altında'),
  ];
  const report = describeBusy({ busy: 0.7, processes, root: ROOT, selfPid: 999 });
  assert.deepEqual(
    report.rows.map((entry) => entry.pid),
    [11, 10],
  );
  assert.equal(report.rows[0].repo, true);
  assert.equal(report.rows[1].repo, false);
  assert.deepEqual(report.stop, [11]);
});

test('yol karşılaştırması ayırıcı ve büyük/küçük harften bağımsızdır', () => {
  const processes = [row(11, 0.2, 'node c:/dev/vol.studio/games/vol-test/vite.js')];
  assert.deepEqual(describeBusy({ busy: 0.9, processes, root: ROOT, selfPid: 1 }).stop, [11]);
});

test('kapının kendi süreç zinciri uyarıya girmez', () => {
  const processes = [
    row(1, 0.2, `pnpm high ${ROOT}`, 0),
    row(2, 0.2, `node gate.mjs ${ROOT}`, 1),
    row(3, 0.2, `node baska.js ${ROOT}`, 99),
  ];
  const report = describeBusy({ busy: 0.8, processes, root: ROOT, selfPid: 2 });
  assert.deepEqual(
    report.rows.map((entry) => entry.pid),
    [3],
  );
});

test('liste sınırlıdır', () => {
  const processes = Array.from({ length: 20 }, (_, index) => row(100 + index, 0.05, 'node x'));
  const report = describeBusy({ busy: 0.8, processes, root: ROOT, selfPid: 1 });
  assert.equal(report.rows.length, PROCESS_LIST_LIMIT);
});

test('uyarı süreci, [repo] işaretini, kapatma komutunu ve sessize alma yolunu söyler', () => {
  const processes = [row(11, 0.15, `node ${ROOT}\\vite.js --port 5198`)];
  const report = describeBusy({ busy: 0.7, processes, root: ROOT, selfPid: 1 });
  const windows = formatBusyWarning(report, 'win32');
  assert.match(windows, /%70 meşgul/);
  assert.match(windows, /PID 11 .*%15 \[repo\] node .*vite\.js --port 5198/);
  assert.match(windows, /Stop-Process -Id 11 -Force/);
  assert.match(windows, /VOL_GATE_ALLOW_BUSY=1/);
  assert.match(formatBusyWarning(report, 'linux'), /kill 11/);
});

test('repo dışı süreç için kapatma komutu önerilmez', () => {
  const report = describeBusy({
    busy: 0.7,
    processes: [row(10, 0.2, 'chrome --headless')],
    root: ROOT,
    selfPid: 1,
  });
  assert.doesNotMatch(formatBusyWarning(report, 'win32'), /Stop-Process/);
});

test('yük dağınıksa (süreç listelenemiyorsa) bunu açıkça söyler', () => {
  const report = describeBusy({ busy: 0.6, processes: [], root: ROOT, selfPid: 1 });
  assert.match(formatBusyWarning(report, 'win32'), /yük dağınık/);
});

test('kapatma komutu platforma göredir', () => {
  assert.equal(stopCommand([1, 2], 'win32'), 'Stop-Process -Id 1,2 -Force');
  assert.equal(stopCommand([1, 2], 'linux'), 'kill 1 2');
});

function run(overrides) {
  const logs = [];
  const result = checkHostLoad({
    root: ROOT,
    log: (text) => logs.push(text),
    env: {},
    platform: 'win32',
    selfPid: 1,
    ...overrides,
  });
  return result.then((value) => ({ value, logs }));
}

test('sakin makinede sessizdir ve süreç listesine hiç bakmaz', async () => {
  const { value, logs } = await run({
    sample: async () => 0.1,
    read: () => assert.fail('boşta makinede süreç listesi okunmamalı'),
  });
  assert.deepEqual(value, { busy: 0.1, warned: false });
  assert.deepEqual(logs, []);
});

test('meşgul makinede uyarır, kapıyı düşürmez', async () => {
  const { value, logs } = await run({
    sample: async () => 0.7,
    read: () => [row(11, 0.15, `node ${ROOT}\\vite.js`)],
  });
  assert.deepEqual(value, { busy: 0.7, warned: true });
  assert.equal(logs.length, 1);
  assert.match(logs[0], /PID 11/);
});

test('süreç listesi okunamazsa yük yine bildirilir (adlar eksik)', async () => {
  const { value, logs } = await run({
    sample: async () => 0.8,
    read: () => {
      throw new Error('powershell yok');
    },
  });
  assert.equal(value.warned, true);
  assert.match(logs[0], /%80 meşgul/);
  assert.match(logs[0], /yük dağınık/);
});

test('örnekleme çökerse denetim atlanır (kapı düşmez)', async () => {
  const { value, logs } = await run({
    sample: async () => {
      throw new Error('cpus yok');
    },
  });
  assert.equal(value, null);
  assert.deepEqual(logs, []);
});

test('VOL_GATE_ALLOW_BUSY=1 denetimi tümüyle atlar (örnekleme bile yapılmaz)', async () => {
  const { value, logs } = await run({
    env: { VOL_GATE_ALLOW_BUSY: '1' },
    sample: async () => assert.fail('atlanan denetim örneklememeli'),
  });
  assert.equal(value, null);
  assert.deepEqual(logs, []);
});
