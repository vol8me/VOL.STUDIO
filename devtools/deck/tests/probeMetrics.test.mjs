import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import test from 'node:test';
import { syncProbeMetrics } from '../scripts/probe-metrics.mjs';

test('sonda modülü CORE exports yüzeyini bağımlılıklarıyla paketler ve tek ESM dosyası çalışır', async () => {
  const disk = mkdtempSync(join(tmpdir(), 'vol-probe-metrics-'));
  try {
    syncProbeMetrics(resolve(import.meta.dirname, '../../..'), disk);
    const code = readFileSync(join(disk, 'vendor/frame-summary.js'), 'utf8');
    writeFileSync(join(disk, 'package.json'), JSON.stringify({ type: 'module' }));
    const module = await import(pathToFileURL(join(disk, 'vendor/frame-summary.js')).href);
    assert.deepEqual(Object.keys(module), ['summarizeFrameIntervals']);
    assert.equal(module.summarizeFrameIntervals([16, 16, 16]).p95, 16);
    assert.equal(module.summarizeFrameIntervals([NaN, 0]), null);
    syncProbeMetrics(resolve(import.meta.dirname, '../../..'), disk);
    assert.equal(readFileSync(join(disk, 'vendor/frame-summary.js'), 'utf8'), code);
  } finally {
    rmSync(disk, { recursive: true, force: true });
  }
});
