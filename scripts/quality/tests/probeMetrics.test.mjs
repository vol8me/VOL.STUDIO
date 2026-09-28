import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { syncProbeMetrics } from '../../probe-metrics.mjs';

test('sonda modülü CORE kaynağından üretilir ve gerçek tarayıcı JS sözleşmesini taşır', async () => {
  const disk = mkdtempSync(join(tmpdir(), 'vol-probe-metrics-'));
  try {
    syncProbeMetrics(resolve(import.meta.dirname, '../../..'), disk);
    const code = readFileSync(join(disk, 'vendor/frame-summary.js'), 'utf8');
    const module = await import(
      `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
    );
    assert.equal(module.summarizeFrameIntervals([16, 16, 16]).p95, 16);
    assert.equal(module.summarizeFrameIntervals([NaN, 0]), null);
    syncProbeMetrics(resolve(import.meta.dirname, '../../..'), disk);
    assert.equal(readFileSync(join(disk, 'vendor/frame-summary.js'), 'utf8'), code);
  } finally {
    rmSync(disk, { recursive: true, force: true });
  }
});
