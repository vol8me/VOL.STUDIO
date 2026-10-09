import assert from 'node:assert/strict';
import test from 'node:test';
import {
  appendedDiagnostics,
  gameDiagnostics,
  nativeRuntime,
} from '../device-benchmark-records.mjs';

const line = (record) => JSON.stringify(record) + '\n';

test('yalnız mevcut ölçümde eklenen tamamlanmış tanı kayıtlarını okur', () => {
  const old = line({ type: 'perf', runId: 'old', fps: 240, renderer: 'canvas' });
  const fresh = line({
    type: 'perf',
    runId: 'fresh',
    fps: 60,
    renderer: { kind: 'webgl' },
    window: 1,
    lostReports: 0,
  });
  const records = appendedDiagnostics(old, old + fresh + '{"type":');
  assert.deepEqual(gameDiagnostics(records), { fps: 60, renderer: 'webgl', samples: 1 });
  assert.deepEqual(appendedDiagnostics(old, old), []);
  assert.deepEqual(appendedDiagnostics(null, fresh), []);
  assert.deepEqual(appendedDiagnostics(old, fresh), []);
});

test('karışan çalıştırmalar ve geçersiz sayılar kanıt sayılmaz', () => {
  assert.deepEqual(
    gameDiagnostics([
      { type: 'perf', runId: 'one', fps: 30 },
      { type: 'perf', runId: 'two', fps: 60 },
    ]),
    { fps: null, renderer: null, samples: 0 },
  );
  assert.deepEqual(gameDiagnostics([{ type: 'perf', fps: 60 }]), {
    fps: null,
    renderer: null,
    samples: 0,
  });
  assert.deepEqual(gameDiagnostics([{ type: 'perf', runId: 'one', fps: '60', renderer: 'auto' }]), {
    fps: null,
    renderer: null,
    samples: 0,
  });
  assert.deepEqual(gameDiagnostics([{ type: 'perf', runId: 'one', fps: -1 }]), {
    fps: null,
    renderer: null,
    samples: 0,
  });
});

test('kayıp, eksik pencere ve teslim sayacı olmayan FPS kabul kanıtı değildir', () => {
  const perf = (window, lostReports = 0) => ({
    type: 'perf',
    runId: 'one',
    fps: 60,
    window,
    lostReports,
  });
  for (const records of [
    [perf(1, 1)],
    [perf(1), perf(3)],
    [{ type: 'perf', runId: 'one', fps: 60, window: 1 }],
    [perf(0)],
  ])
    assert.deepEqual(gameDiagnostics(records), { fps: null, renderer: null, samples: 0 });
  assert.deepEqual(gameDiagnostics([perf(4), perf(5)]), { fps: 60, renderer: null, samples: 2 });
});

test('boş native ölçüm bilinmeyendir; gerçek sıfır korunur', () => {
  assert.equal(nativeRuntime('', '').nativeRenderer.totalFrames, null);
  assert.equal(nativeRuntime('', '').memory.pssMb, null);
  assert.equal(
    nativeRuntime('Total frames rendered: 0', 'TOTAL PSS: 0').nativeRenderer.totalFrames,
    0,
  );
  assert.equal(nativeRuntime('', 'TOTAL PSS: 2048').memory.pssMb, 2);
});
