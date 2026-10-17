import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sanitizeReport, summarizeReport } from '../scripts/deck-contract.mjs';

test('summarizeReport: fazlar, sinyaller, sanal kol ve runtime ayrışır', () => {
  const lines = [
    JSON.stringify({ v: 1, src: 'rust', type: 'start' }),
    JSON.stringify({
      src: 'js',
      type: 'info',
      env: { PRESSURE_VESSEL_RUNTIME: 'steamrt4_platform_4.0' },
    }),
    JSON.stringify({
      src: 'js',
      type: 'phase',
      phase: 'boş',
      sprites: 0,
      fps: 59.6,
      p95: 19,
      over20ms: 10,
      over34ms: 0,
    }),
    JSON.stringify({ src: 'rust', type: 'signal', signal: 15 }),
    JSON.stringify({ src: 'rust', type: 'suspend-gap', seconds: 61.2 }),
    JSON.stringify({
      src: 'js',
      type: 'pad-connected',
      id: 'Microsoft X-Box 360 pad 0',
      mapping: 'standard',
    }),
    'bozuk satır',
  ];
  const s = summarizeReport(lines);
  assert.equal(s.runtime, 'steamrt4_platform_4.0');
  assert.equal(s.phases.length, 1);
  assert.equal(s.phases[0].fps, 59.6);
  assert.deepEqual(s.signals, [15]);
  assert.deepEqual(s.suspendGaps, [61.2]);
  assert.equal(s.gamepads[0].id, 'Microsoft X-Box 360 pad 0');
  assert.equal(s.total, 6);
});

test('bilinmeyen prototype alanı temizlenen native sinyal kaydını düşürmez', () => {
  for (const key of ['toString', 'constructor', 'valueOf']) {
    const cleaned = sanitizeReport(
      JSON.stringify({ src: 'rust', type: 'signal', signal: 15, [key]: 'etiket' }),
    );
    assert.deepEqual(JSON.parse(cleaned), { src: 'rust', type: 'signal', signal: 15 });
  }
});

test('native sinyal ve uyku kanıtı yalnız Rust kayıtlarından türetilir', () => {
  const lines = [
    { src: 'js', type: 'signal', signal: 9 },
    { type: 'signal', signal: 2 },
    { src: 'rust', type: 'signal', signal: 15 },
    { src: 'js', type: 'suspend-gap', seconds: 999 },
    { type: 'suspend-gap', seconds: 888 },
    { src: 'rust', type: 'suspend-gap', seconds: 60 },
  ].map(JSON.stringify);
  const summary = summarizeReport(sanitizeReport(lines.join('\n')).trim().split('\n'));
  assert.deepEqual(summary.signals, [15]);
  assert.deepEqual(summary.suspendGaps, [60]);
});

test('native son flush hatası geçerli son kareyi ölçüm kabulüne çeviremez', () => {
  const perf = {
    v: 1,
    type: 'perf',
    runId: '00000000-0000-4000-8000-000000000001',
    stamp: 1700000000001,
    window: 1,
    lostReports: 0,
  };
  const summarize = (...exits) => {
    const records = [perf, ...exits];
    return summarizeReport(
      sanitizeReport(records.map(JSON.stringify).join('\n')).split('\n'),
      records.length,
    );
  };
  const exit = (outcome) => ({ src: 'rust', type: 'exit-after-grace', reason: 'signal', outcome });
  for (const outcome of ['failed', 'timedOut', undefined, null, 'future-outcome']) {
    const summary = summarize(exit(outcome));
    assert.equal(summary.complete, false);
    assert.deepEqual(summary.nativeExits, [
      { outcome: ['failed', 'timedOut'].includes(outcome) ? outcome : 'unknown', reason: 'signal' },
    ]);
    assert.equal(summarize(exit(outcome), exit('success')).complete, false);
  }
  const success = summarize(exit('success'));
  assert.equal(success.complete, true);
  assert.deepEqual(success.nativeExits, [{ outcome: 'success', reason: 'signal' }]);

  const missing = summarize(
    { ...exit('success'), src: 'js' },
    { ...exit('success'), src: undefined },
    { ...exit('success'), type: 'flush-completed' },
  );
  assert.deepEqual(missing.nativeExits, []);
  assert.equal(missing.complete, true);
  const unknownReason = summarize({ ...exit('success'), reason: 'private-reason' });
  assert.deepEqual(unknownReason.nativeExits, [{ outcome: 'success', reason: null }]);
});

test('summarizeReport: oyun perf pencereleri, pad-input ve steamworks ayrışır', () => {
  const lines = [
    JSON.stringify({ src: 'js', type: 'info', env: { STEAM_GAMESCOPE: '1' } }),
    JSON.stringify({
      src: 'js',
      type: 'steamworks',
      available: true,
      manifestOk: true,
      appId: 480,
      deck: true,
    }),
    JSON.stringify({ src: 'js', type: 'pad-connected', id: 'Steam Deck', mapping: 'standard' }),
    JSON.stringify({ src: 'js', type: 'pad-input', button: 9, axis: null, t: 1234 }),
    JSON.stringify({
      src: 'js',
      type: 'perf',
      phase: 'oyun',
      window: 0,
      fps: 59.9,
      p95: 17.2,
      over20ms: 2,
      over34ms: 0,
    }),
    JSON.stringify({
      src: 'js',
      type: 'perf',
      phase: 'oyun',
      window: 1,
      fps: 60.0,
      p95: 16.9,
      over20ms: 0,
      over34ms: 0,
      final: true,
    }),
  ];
  const s = summarizeReport(lines);
  // İki pencere aynı faz adını taşır — window anahtarıyla ayrışmalı.
  assert.equal(s.phases.length, 2);
  assert.equal(s.phases[0].window, 0);
  assert.equal(s.phases[1].fps, 60.0);
  assert.deepEqual(s.padInputs, [{ button: 9, axis: null }]);
  assert.deepEqual(s.steamworks, { available: true, manifestOk: true, appId: 480, deck: true });
});

test('paylasilan kayit izin listesi disindaki kimlik ve metni tasimaz', () => {
  const raw = [
    {
      type: 'info',
      env: {
        HOME: '/private/user',
        SteamAppId: '123',
        TOKEN: 'SECRET',
        WEBKIT_FORCE_VBLANK_TIMER: '1',
      },
    },
    { type: 'pad-connected', id: 'device-serial-SECRET', mapping: 'standard' },
    { type: 'steamworks', available: true, appId: 123, deck: true, manifestOk: true },
    { type: 'haptics', backend: 'hidraw', lastError: 'personal path SECRET', device: 'SECRET' },
    { type: 'error', message: 'personal typed text SECRET' },
    { type: 'perf', phase: 'oyun', fps: 60, p95: 17, enemies: 20, window: 3 },
  ]
    .map(JSON.stringify)
    .join('\n');
  const sanitized = sanitizeReport(raw);
  assert.doesNotMatch(sanitized, /SECRET|private|SteamAppId|appId|device-serial|typed text/);
  const records = sanitized.split('\n').filter(Boolean).map(JSON.parse);
  assert.equal(records.find((record) => record.type === 'perf').enemies, 20);
  assert.equal(records.find((record) => record.type === 'haptics').backend, 'hidraw');
});

test('kare penceresi baglami ve izinli sayisal yuk metrikleri raporda kalir', () => {
  const line = JSON.stringify({
    type: 'perf',
    phase: 'loading',
    start: 100,
    end: 200,
    p99: 23,
    quality: 'low',
    scenario: 'sandbox',
    seed: 731,
    weather: 'rain',
    season: 'spring',
    metrics: {
      enemies: { min: 10, max: 20, avg: 15, samples: 30 },
      updateMs: { min: 1, max: 5, avg: 3, samples: 30 },
      'cpuMs.simulation': { min: 1, max: 4, avg: 2, samples: 30 },
      scenarioEnemies: { min: 10, max: 20, avg: 15, samples: 30 },
      scenarioSeed: { min: 42, max: 42, avg: 42, samples: 30 },
      SteamAppId: { min: 123, max: 123 },
    },
  });
  const record = JSON.parse(sanitizeReport(line));
  assert.equal(record.phase, 'loading');
  assert.equal(record.scenario, 'sandbox');
  assert.equal(record.quality, 'low');
  assert.equal(record.weather, 'rain');
  assert.equal(record.season, 'spring');
  assert.equal(record.seed, 731);
  assert.equal(record.metrics['cpuMs.simulation'].avg, 2);
  assert.deepEqual(record.metrics.enemies, { min: 10, max: 20, avg: 15, samples: 30 });
  assert.deepEqual(record.metrics.updateMs, { min: 1, max: 5, avg: 3, samples: 30 });
  assert.equal(record.metrics.scenarioEnemies.avg, 15);
  assert.equal(record.metrics.scenarioSeed.avg, 42);
  assert.equal(record.metrics.SteamAppId, undefined);
  const summary = summarizeReport([JSON.stringify(record)]);
  assert.equal(summary.phases[0].scenario, 'sandbox');
  assert.equal(summary.phases[0].quality, 'low');
  assert.equal(summary.phases[0].p99, 23);
  assert.equal(summary.phases[0].start, 100);
  assert.deepEqual(summary.phases[0].metrics.enemies, record.metrics.enemies);
  const background = JSON.parse(
    sanitizeReport(
      JSON.stringify({
        type: 'perf',
        phase: 'background',
        context: 'background',
        metrics: { enemies: { avg: 0, samples: 2, max: null, type: 'private-user' } },
      }),
    ),
  );
  assert.equal(background.phase, 'background');
  assert.equal(background.context, 'background');
  assert.deepEqual(background.metrics.enemies, { avg: 0, samples: 2 });
});

test('ayrı oyun oturumları aynı pencere numarasıyla kaybolmaz; yavaş kare ve yüzdelikler korunur', () => {
  const runIds = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002'];
  const records = runIds.map((runId) =>
    sanitizeReport(
      JSON.stringify({
        type: 'perf',
        runId,
        window: 1,
        phase: 'gameplay',
        lostReports: 2,
        metrics: {
          updateMs: { p50: 2, p95: 8, p99: 9 },
          vehicles: { avg: 4 },
          'simulation.rawDeltaMs': { max: 5000 },
        },
        slowestFrame: { at: 80, intervalMs: 44, metrics: { updateMs: 8, private: 99 } },
        gpuTimeMs: null,
        presentTimeMs: null,
      }),
    ),
  );
  const summary = summarizeReport(records);
  assert.equal(summary.phases.length, 2);
  assert.equal(summary.phases[0].runId, runIds[0]);
  assert.equal(summary.phases[0].lostReports, 2);
  assert.equal(summary.phases[0].metrics.updateMs.p95, 8);
  assert.equal(summary.phases[0].metrics.vehicles.avg, 4);
  assert.equal(summary.phases[0].metrics['simulation.rawDeltaMs'].max, 5000);
  assert.deepEqual(summary.phases[0].slowestFrame, {
    at: 80,
    intervalMs: 44,
    metrics: { updateMs: 8 },
  });
  assert.equal(JSON.parse(records[0]).gpuTimeMs, null);
  assert.equal(JSON.parse(records[0]).presentTimeMs, null);
  assert.equal(
    JSON.parse(sanitizeReport(JSON.stringify({ type: 'perf', runId: 'private-SECRET' }))).runId,
    undefined,
  );
});

test('oyun raporu eksik pencere ve kaybı ölçüm kabulünde reddeder', () => {
  const perf = (window, lostReports = 0) => ({
    v: 1,
    type: 'perf',
    runId: '00000000-0000-4000-8000-000000000001',
    stamp: 1700000000000 + window,
    fps: 60,
    window,
    lostReports,
  });
  for (const records of [
    [perf(1, 1)],
    [perf(1), perf(3)],
    [perf(2)],
    [{ ...perf(1), lostReports: undefined }],
  ]) {
    assert.equal(summarizeReport(records.map(JSON.stringify)).complete, false);
  }
  assert.equal(summarizeReport([perf(1), perf(2)].map(JSON.stringify)).complete, true);
  for (const field of ['v', 'runId', 'stamp']) {
    assert.equal(
      summarizeReport([{ ...perf(1), [field]: undefined }].map(JSON.stringify)).complete,
      false,
    );
  }
  for (const record of [
    { ...perf(1), v: 2 },
    { ...perf(1), runId: 'private-device' },
    { ...perf(1), stamp: -1 },
    { ...perf(1), stamp: 1.5 },
  ])
    assert.equal(summarizeReport([JSON.stringify(record)]).complete, false);
  assert.equal(summarizeReport([perf(1), perf(1)].map(JSON.stringify)).complete, false);
  assert.equal(
    summarizeReport([perf(1), { ...perf(2), stamp: 1 }].map(JSON.stringify)).complete,
    false,
  );
  const roundtrip = sanitizeReport([perf(1), perf(2)].map(JSON.stringify).join('\n'));
  assert.equal(summarizeReport(roundtrip.split('\n')).complete, true);
  assert.equal(summarizeReport(roundtrip.split('\n')).phases[1].stamp, perf(2).stamp);
  const broken = sanitizeReport(JSON.stringify(perf(1)) + '\n{unfinished');
  assert.equal(summarizeReport(broken.split('\n'), 2).complete, false);
  assert.equal(summarizeReport(broken.split('\n'), 2).rejectedRecords, 1);
  assert.equal(summarizeReport(broken.split('\n')).complete, false);
  assert.equal(sanitizeReport(broken), broken);
  assert.equal(summarizeReport([JSON.stringify(perf(1)), 'true']).complete, false);
  const nonce = 'abcdef01-abcd-4000-8000-000000000001';
  const repeated = [
    { ...perf(1), runId: nonce },
    { ...perf(1), runId: nonce.toUpperCase() },
  ].map(JSON.stringify);
  assert.equal(summarizeReport(repeated).complete, false);
  assert.equal(JSON.parse(sanitizeReport(repeated[1])).runId, nonce);
  for (const lostReports of [0, undefined, 1]) {
    assert.equal(
      summarizeReport([
        JSON.stringify(perf(1)),
        JSON.stringify({ type: 'report-loss', lostReports }),
      ]).complete,
      false,
    );
  }
  assert.equal(summarizeReport([perf(2), perf(1)].map(JSON.stringify)).complete, false);
  assert.equal(summarizeReport([]).complete, false);
  assert.equal(
    summarizeReport([JSON.stringify({ type: 'phase', phase: 'menu', lostReports: 1 })]).complete,
    false,
  );
});

test('beklenen kayıt sayısı kayıp işaretçisini iptal edemez veya negatif ret üretemez', () => {
  const phase = JSON.stringify({ type: 'phase', phase: 'menu', lostReports: 0 });
  for (const lostReports of [0, undefined, -1, 1, 1.5, '1']) {
    const lines = [phase, JSON.stringify({ type: 'report-loss', lostReports })];
    for (const expectedRecords of [1, 0, 2, 3]) {
      const summary = summarizeReport(lines, expectedRecords);
      assert.equal(summary.complete, false);
      assert.ok(Number.isSafeInteger(summary.rejectedRecords));
      assert.ok(summary.rejectedRecords >= 1);
    }
  }
  for (const expectedRecords of [-1, 0, 0.5, NaN, Infinity, '1']) {
    const summary = summarizeReport([phase], expectedRecords);
    assert.equal(summary.complete, false);
    assert.ok(Number.isSafeInteger(summary.rejectedRecords));
    assert.ok(summary.rejectedRecords >= 0);
  }
  assert.equal(summarizeReport([phase, '{}'], 1).complete, false);
  assert.equal(summarizeReport([phase], 1).complete, true);
  assert.equal(summarizeReport([phase], 3).rejectedRecords, 2);
  const manyLosses = summarizeReport([
    phase,
    ...Array.from({ length: 2 }, () =>
      JSON.stringify({ type: 'report-loss', lostReports: Number.MAX_SAFE_INTEGER }),
    ),
  ]);
  assert.equal(manyLosses.complete, false);
  assert.equal(manyLosses.rejectedRecords, Number.MAX_SAFE_INTEGER);
});

test('touchpad kisayol raporu yalniz sabit siniflari ve boolean alanlari tasir', () => {
  const event = JSON.stringify({
    v: 1,
    type: 'deck-shortcut',
    shortcut: 'undo',
    target: 'editable',
    phase: 'gameplay',
    trusted: true,
    repeat: false,
    rawKey: 'private-secret',
    text: 'private-secret',
  });
  assert.deepEqual(JSON.parse(sanitizeReport(event)), {
    v: 1,
    type: 'deck-shortcut',
    shortcut: 'undo',
    target: 'editable',
    phase: 'gameplay',
    trusted: true,
    repeat: false,
  });
  const invalid = JSON.parse(
    sanitizeReport(
      JSON.stringify({
        type: 'deck-shortcut',
        shortcut: 'private-secret',
        target: 'private-secret',
      }),
    ),
  );
  assert.equal(invalid.shortcut, undefined);
  assert.equal(invalid.target, undefined);
});

test('rapor eski insan bekleme durumu taşımaz; teknik sonuçlar korunur', () => {
  const record = (result) => JSON.parse(sanitizeReport(JSON.stringify({ type: 'perf', result })));
  assert.equal(record('pending-human').result, undefined);
  for (const result of ['ok', 'error', 'unavailable']) assert.equal(record(result).result, result);
});

test('kapanış sonucu ve sabit neden korunur; istek kimliği paylaşılmaz', () => {
  for (const outcome of ['success', 'failed', 'timedOut']) {
    const record = JSON.parse(
      sanitizeReport(
        JSON.stringify({
          type: 'flush-completed',
          requestId: 'shutdown-1',
          reason: 'signal',
          outcome,
        }),
      ),
    );
    assert.equal(record.outcome, outcome);
    assert.equal(record.reason, 'signal');
    assert.equal(record.hasRequestId, true);
    assert.equal(record.hasError, undefined);
    assert.equal(record.requestId, undefined);
  }
  const privateRecord = JSON.parse(
    sanitizeReport(
      JSON.stringify({
        type: 'flush-completed',
        requestId: 'private-secret',
        reason: 'private-secret',
        outcome: 'private-secret',
      }),
    ),
  );
  assert.equal(privateRecord.hasRequestId, false);
  assert.equal(privateRecord.hasError, true);
  assert.doesNotMatch(JSON.stringify(privateRecord), /private-secret/);
});

test('runtime bilinmeyen kanıtı host olarak etiketlemez', () => {
  const summary = (record) => summarizeReport(sanitizeReport(JSON.stringify(record)).split('\n'));
  assert.equal(summary({ type: 'perf' }).runtime, 'unknown');
  assert.equal(summary({ type: 'info' }).runtime, 'unknown');
  assert.equal(summary({ type: 'info', env: null }).runtime, 'unknown');
  assert.equal(summary({ type: 'info', env: [] }).runtime, 'unknown');
  assert.equal(
    summary({ type: 'info', env: { PRESSURE_VESSEL_RUNTIME: '/opt/custom-runtime' } }).runtime,
    'unknown',
  );
  assert.equal(summary({ type: 'info', env: {} }).runtime, 'host');
  assert.equal(
    summary({ type: 'info', env: { PRESSURE_VESSEL_RUNTIME: '/opt/steamrt4_platform_4.0' } })
      .runtime,
    'steamrt4_platform_4.0',
  );
});

test('native namespace sınıfı ayıklanan başlatıcı ortamından bağımsız ve roundtrip kararlıdır', () => {
  for (const runtime of ['host', 'unknown', 'steamrt3', 'steamrt4']) {
    const raw = JSON.stringify({
      type: 'info',
      env: {
        VOL_DIAGNOSTICS_RUNTIME: runtime,
        PRESSURE_VESSEL_RUNTIME: '/private/launcher/custom-runtime',
        HOME: '/private/user',
      },
    });
    const clean = sanitizeReport(raw);
    assert.doesNotMatch(clean, /private|launcher|HOME/);
    assert.equal(summarizeReport(clean.split('\n')).runtime, runtime);
    assert.equal(sanitizeReport(clean), clean);
  }
  for (const value of ['private-user', 'steamrt5', true, null]) {
    const clean = sanitizeReport(
      JSON.stringify({
        type: 'info',
        runtime: 'host',
        env: {
          VOL_DIAGNOSTICS_RUNTIME: value,
        },
      }),
    );
    assert.equal(summarizeReport(clean.split('\n')).runtime, 'unknown');
  }
});

test('geçersiz native runtime sınıfı ikinci temizlemede başlatıcı kanıtıyla yükselmez', () => {
  for (const value of ['invalid', ['host'], ['steamrt4'], null, {}]) {
    const raw = JSON.stringify({
      type: 'info',
      runtime: 'host',
      env: {
        VOL_DIAGNOSTICS_RUNTIME: value,
        PRESSURE_VESSEL_RUNTIME: '/opt/steamrt4_platform_4.0',
      },
    });
    const clean = sanitizeReport(raw);
    assert.equal(summarizeReport(clean.split('\n')).runtime, 'unknown');
    assert.equal(sanitizeReport(clean), clean);
    assert.equal(JSON.parse(clean).env.VOL_DIAGNOSTICS_RUNTIME, 'unknown');
  }
});

test('tekrar temizlenen rapor bilinmeyen runtime ve kimlik varlığı sınıflarını korur', () => {
  const raw = [
    { type: 'info', env: { PRESSURE_VESSEL_RUNTIME: '/opt/custom-runtime' } },
    { type: 'flush-completed', requestId: 'suspend-2', reason: 'suspend', outcome: 'timedOut' },
  ]
    .map(JSON.stringify)
    .join('\n');
  const sanitized = sanitizeReport(raw);
  assert.equal(sanitizeReport(sanitized), sanitized);
  assert.equal(summarizeReport(sanitized.split('\n')).runtime, 'unknown');
});

test('hata bayrağı false alanı veya boş nedenle girdi sırasına göre kaybolmaz', () => {
  for (const fields of [
    { message: 'private-error', hasError: false },
    { hasError: false, message: 'private-error' },
    { message: 'private-error', reason: '' },
  ]) {
    const record = JSON.parse(sanitizeReport(JSON.stringify({ type: 'error', ...fields })));
    assert.equal(record.hasError, true);
    assert.doesNotMatch(JSON.stringify(record), /private-error/);
  }
});

test('ham runtime ortamı çelişen host etiketiyle kabul edilmez', () => {
  for (const fields of [
    { runtime: 'host', env: { PRESSURE_VESSEL_RUNTIME: '/opt/custom-runtime' } },
    { env: { PRESSURE_VESSEL_RUNTIME: '/opt/custom-runtime' }, runtime: 'host' },
  ]) {
    const shared = sanitizeReport(JSON.stringify({ type: 'info', ...fields }));
    assert.equal(summarizeReport(shared.split('\n')).runtime, 'unknown');
    assert.equal(sanitizeReport(shared), shared);
  }
});

test('sonda fazlarında eksik, yanlış tipli ve negatif kayıp sayacı kabul edilmez', () => {
  for (const type of ['phase', 'phase-raf']) {
    for (const lostReports of [undefined, null, '0', -1, 1]) {
      assert.equal(
        summarizeReport([JSON.stringify({ type, phase: 'menu', fps: 60, lostReports })]).complete,
        false,
      );
    }
    assert.equal(
      summarizeReport([JSON.stringify({ type, phase: 'menu', fps: 60, lostReports: 0 })]).complete,
      true,
    );
    for (const lostReports of [undefined, -1, '0']) {
      assert.equal(
        summarizeReport([
          JSON.stringify({ type, phase: 'menu', fps: 60, lostReports }),
          JSON.stringify({ type, phase: 'menu', fps: 60, lostReports: 0 }),
        ]).complete,
        false,
      );
    }
  }
});
