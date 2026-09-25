/**
 * Estetik regresyon hafızası testleri. Korpus = production manifest'leri;
 * koşu manifest'teki programı güncel motorla yeniden render eder. Testin
 * ayırt edici kanıtı geçici bir depo kökündeki mutasyondur: program belgesi
 * değişince satır `audition-required` olur, insan kararı o PCM hash'ine
 * bağlanır, yeni mutasyon kararı bayatlatır. Altın-dosya DEĞİLDİR: PCM
 * değişimi tek başına regresyon sayılmaz.
 */
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
  DECISIONS_FILE,
  decideRegression,
  descriptorDeltas,
  MANIFESTS_ROOT,
  regressionCorpus,
  regressionDecisions,
  runRegression,
} from '../../src/protocol';
import { ProtocolError } from '../../src/protocol/errors';
import { hashCanonical, type Sha256 } from '../../src/protocol/canonical';

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
    expect(report.counts['audition-required']).toBe(0);
  }, 120_000);

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

describe('insan kararı akışı', () => {
  it('mutasyon → audition-required → karar → accepted-change → yeni hash → bayat', () => {
    const root = tempRepo();
    corpusFixture(root, 3);
    const first = runRegression(root, { ids: [IMPACT] });
    const row = first.rows[0];
    expect(row.status).toBe('audition-required');
    expect(row.current.pcmHash).not.toBe(row.baseline.pcmHash);
    // Program kimliği manifest kaydıyla aynı belgeyi işaret eder (yeni belge
    // yayımlanmış sayılır); ayırt edici kanıt PCM kimliği + betimleyici farkı.
    expect(row.current.programHash).toBe(row.baseline.programHash);
    // Asset kopyalandı: yayımlanmış dosya ile yeni PCM arasında betimleyici fark ölçülür.
    expect(row.deltas.length).toBeGreaterThan(0);

    // İnsan kararı tam bu PCM kimliğine bağlanır.
    decideRegression(
      root,
      IMPACT,
      'accepted-change',
      row.current.pcmHash,
      'yeni kazanç karakteri insan tarafından onaylandı',
    );
    const second = runRegression(root, { ids: [IMPACT] });
    expect(second.rows[0].status).toBe('accepted-change');
    expect(second.rows[0].decision?.status).toBe('accepted-change');

    // Başka bir hash üreten değişiklik kararı bayatlatır.
    corpusFixture(root, 7);
    const third = runRegression(root, { ids: [IMPACT] });
    expect(third.rows[0].status).toBe('audition-required');
    expect(third.rows[0].current.pcmHash).not.toBe(row.current.pcmHash);
  }, 240_000);

  it('karar doğrulaması: geçersiz durum/hash/not reddedilir', () => {
    const root = tempRepo();
    corpusFixture(root, 0);
    const hash = ('sha256:' + '0'.repeat(64)) as Sha256;
    expect(() => decideRegression(root, IMPACT, 'heard-acceptable' as never, hash, 'not')).toThrow(
      ProtocolError,
    );
    expect(() =>
      decideRegression(root, IMPACT, 'accepted-change', 'bozuk-hash' as Sha256, 'not'),
    ).toThrow(ProtocolError);
    expect(() => decideRegression(root, IMPACT, 'accepted-change', hash, '   ')).toThrow();
    // Geçerli karar yazılır ve makine-okunur kalır.
    const written = decideRegression(root, IMPACT, 'rejected-regression', hash, 'kanıt notu');
    expect(written.decisions[IMPACT].status).toBe('rejected-regression');
    expect(regressionDecisions(root).decisions[IMPACT].pcmHash).toBe(hash);
    expect(existsSync(join(root, DECISIONS_FILE))).toBe(true);
  });
});
