import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { analyzeAudio } from '../../src/analysis/report';
import {
  descriptorDeltas,
  MANIFESTS_ROOT,
  regressionCorpus,
  runRegression,
} from '../../src/protocol';
import { ProtocolError } from '../../src/protocol/errors';
import { hashCanonical } from '../../src/kernel/canonical';
import { withRenderSession } from '../../src/kernel/session';
import { repoRenderCache } from '../../src/protocol/renderCacheStore';
import { CORPUS_TIMEOUT } from '../support/timeouts';

const REPO = fileURLToPath(new URL('../../../..', import.meta.url));
const IMPACT = 'sfx/reference-impact';
const MUSIC_MIX = 'music/reference-cue/mix';
const AMBIENCE = 'ambience/reference-ambience';

const tempRoots: string[] = [];
function tempRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'regression-'));
  tempRoots.push(root);
  return root;
}
afterAll(() => {
  for (const dir of tempRoots) rmSync(dir, { recursive: true, force: true });
});

const IMPACT_MANIFEST = join(REPO, MANIFESTS_ROOT, 'sfx', 'reference-impact.json');

interface FixtureManifest {
  program: {
    document: { layers: Array<{ gainDb?: number }> };
    hash: string;
  };
  asset: { path: string };
}

/**
 * Tek manifestli minimal korpus; asset dosyası da kopyalanır (delta ölçümü
 * için). Program belgesi mutasyona uğrayınca manifest kapısının istediği
 * gömülü hash yeniden hesaplanır — senaryo "yeni program yayımlandı,
 * PCM kimliği eskisinden farklı".
 */
function corpusFixture(root: string, gainDbShift: number): void {
  const manifest = JSON.parse(readFileSync(IMPACT_MANIFEST, 'utf8')) as FixtureManifest;
  manifest.program.document.layers[0].gainDb =
    (manifest.program.document.layers[0].gainDb ?? 0) + gainDbShift;
  manifest.program.hash = hashCanonical(manifest.program.document);
  const dstDir = join(root, MANIFESTS_ROOT, 'sfx');
  mkdirSync(dstDir, { recursive: true });
  writeFileSync(join(dstDir, 'reference-impact.json'), JSON.stringify(manifest));
  const assetSrc = join(REPO, manifest.asset.path);
  if (existsSync(assetSrc)) {
    const assetDst = join(root, manifest.asset.path);
    mkdirSync(join(assetDst, '..'), { recursive: true });
    copyFileSync(assetSrc, assetDst);
  }
}

describe('regresyon korpusu', () => {
  it('production manifestlerinin tamamını kapsar (sfx + ambience + music)', () => {
    const corpus = regressionCorpus(REPO);
    expect(corpus.length).toBeGreaterThanOrEqual(30);
    const classes = new Set(corpus.map((e) => e.assetClass));
    expect(classes.has('sfx')).toBe(true);
    expect(classes.has('ambience')).toBe(true);
    expect(classes.has('music')).toBe(true);
    const ids = corpus.map((e) => e.id);
    expect(ids).toContain(IMPACT);
    expect(ids).toContain(AMBIENCE);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of corpus) {
      expect(entry.programHash).toMatch(/^sha256:/);
      expect(entry.pcmHash).toMatch(/^sha256:/);
      expect(Number.isFinite(entry.seed)).toBe(true);
    }
  });

  it('gerçek korpus güncel motorla bit-bit aynı ürer', () => {
    const report = runRegression(REPO, { ids: [IMPACT, AMBIENCE, MUSIC_MIX] });
    expect(report.rows).toHaveLength(3);
    for (const row of report.rows) {
      expect(row.status).toBe('unchanged');
      expect(row.current.pcmHash).toBe(row.baseline.pcmHash);
      expect(row.deltas).toHaveLength(0);
    }
    expect(report.counts['pcm-changed']).toBe(0);
  }, 120_000);

  it(
    'R8d — önbellek/işçi eşitliği: bütün korpus cache-kapalı seri == cache-açık 4 işçi',
    () => {
      const sweep = (workers: number, cacheOn: boolean) =>
        withRenderSession(
          { quality: 'final', cache: cacheOn ? repoRenderCache(REPO) : null },
          () => runRegression(REPO, { workers }).rows,
        );
      const serial = sweep(1, false);
      const parallel = sweep(4, true);
      // En uç iki konfigürasyon: sonuçlar satır satır eşit olmalı.
      expect(parallel.map((r) => [r.id, r.current.pcmHash, r.status])).toEqual(
        serial.map((r) => [r.id, r.current.pcmHash, r.status]),
      );
      expect(serial.length).toBeGreaterThanOrEqual(30);
      expect(serial.every((r) => r.status === 'unchanged')).toBe(true);
    },
    CORPUS_TIMEOUT,
  );

  it('bilinmeyen manifest kimliği reddedilir', () => {
    expect(() => runRegression(REPO, { ids: ['sfx/yok'] })).toThrow(ProtocolError);
  });
});

describe('betimleyici farkları', () => {
  it('descriptorDeltas yalnız değişen sayısal alanları döker', () => {
    const sr = 48000;
    const a = new Float32Array(4800);
    const b = new Float32Array(4800);
    for (let i = 0; i < a.length; i++) {
      a[i] = 0.2 * Math.sin((2 * Math.PI * 220 * i) / sr);
      b[i] = a[i] + 0.02 * Math.sin((2 * Math.PI * 4000 * i) / sr);
    }
    const base = analyzeAudio([a, a], sr, 'source-pcm');
    const cur = analyzeAudio([b, b], sr, 'source-pcm');
    const deltas = descriptorDeltas(base, cur);
    expect(deltas.length).toBeGreaterThan(0);
    expect(deltas.every((d) => d.baseline !== d.current)).toBe(true);
    // Aynı rapor kendisiyle karşılaştırılınca fark çıkmaz.
    expect(descriptorDeltas(base, base)).toHaveLength(0);
  });
});

describe('PCM değişim ölçümü', () => {
  it('program mutasyonu eski PCM kimliğini korur ve değişimi kabul kaydı olmadan ölçer', () => {
    const root = tempRepo();
    corpusFixture(root, 3);
    const first = runRegression(root, { ids: [IMPACT] });
    const row = first.rows[0];
    expect(first.schema).toBe('RegressionReportV2');
    expect(row.status).toBe('pcm-changed');
    expect(row.current.pcmHash).not.toBe(row.baseline.pcmHash);
    expect(row.deltas.length).toBeGreaterThan(0);
    expect(row).not.toHaveProperty('decision');
    expect(first.counts).toEqual({ unchanged: 0, 'pcm-changed': 1 });
    corpusFixture(root, 7);
    const second = runRegression(root, { ids: [IMPACT] });
    expect(second.rows[0].status).toBe('pcm-changed');
    expect(second.rows[0].baseline.pcmHash).toBe(row.baseline.pcmHash);
    expect(second.rows[0].current.pcmHash).not.toBe(row.current.pcmHash);
  }, 240_000);
});
