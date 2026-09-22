import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderProgram } from '../../src/program/render';
import { hashCanonical, prettyCanonicalJson, sha256Bytes } from '../../src/protocol/canonical';
import { ProtocolError } from '../../src/protocol/errors';
import {
  analyzeCandidate,
  initJob,
  registerBrief,
  registerProgram,
  renderCandidate,
  selectCandidate,
} from '../../src/protocol/job';
import { loadJob } from '../../src/protocol/location';
import {
  classifyAssetChange,
  validateManifest,
  type AudioAssetManifestV1,
} from '../../src/protocol/manifest';
import { publishJob, verifyManifest } from '../../src/protocol/publish';
import { jobStatus } from '../../src/protocol/status';
import { readEncoderToolchain } from '../../src/protocol/toolchain';
import type { JobTargetV1 } from '../../src/protocol/records';
import { writeOgg } from '../../src/writer';
import { edited, type Edit } from '../support/json';
import {
  createTestRepo,
  loudProgram,
  REFERENCE_TARGET,
  testBrief,
  testProgram,
  type TestRepo,
} from './repo';

let repo: TestRepo;
beforeEach(() => {
  repo = createTestRepo();
});
afterEach(() => repo.cleanup());

function code(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    if (error instanceof ProtocolError) return error.code;
    throw error;
  }
  throw new Error('hata beklenirken geçti');
}

function prepare(
  target: JobTargetV1 = REFERENCE_TARGET,
  program = testProgram(),
  brief = testBrief(),
  jobId = 'knock',
) {
  const loc = repo.loc(jobId);
  initJob(loc, { target });
  registerBrief(loc, brief);
  registerProgram(loc, program);
  renderCandidate(loc);
  analyzeCandidate(loc);
  selectCandidate(loc, undefined, 'tek aday');
  return loc;
}

const referenceAsset = 'devtools/audio-synth/reference/production/assets/sfx/knock.ogg';
const referenceManifest = 'devtools/audio-synth/reference/production/manifests/sfx/knock.json';

function readManifest(path = referenceManifest): AudioAssetManifestV1 {
  return JSON.parse(readFileSync(join(repo.root, path), 'utf8')) as AudioAssetManifestV1;
}

describe('kanonik publish kapısı', () => {
  it('asset + manifest yazar; manifest KENDİ BAŞINA yeniden üretime yeter', () => {
    const loc = prepare();
    const { manifestPath, manifest } = publishJob(loc);
    expect(manifestPath).toBe(referenceManifest);
    expect(validateManifest(readManifest())).toEqual(manifest);
    const bytes = readFileSync(join(repo.root, referenceAsset));
    expect(sha256Bytes(bytes)).toBe(manifest.asset.encodedHash);
    expect(manifest.asset.bytes).toBe(bytes.length);
    expect(hashCanonical(manifest.program.document)).toBe(manifest.program.hash);
    expect(manifest.brief.document).toEqual(testBrief());
    expect(manifest.analysis.encoded.measuredFrom).toBe('decoded-encoded');
    expect(manifest.encoder.version).toMatch(/^ffmpeg version /);
    expect(manifest.encoder.unreported).toEqual(['libvorbis']);
    expect(manifest.engine.sourceCommit).toBeNull();
    expect(manifest.integration).toEqual({
      package: '@volstudio/audio-synth',
      targetKind: 'reference',
      runtimeKey: null,
      loop: false,
      runtimeDeclaration: null,
    });
    const rerender = renderProgram(manifest.program.document, { seed: manifest.render.seed });
    expect(rerender.channels[0].length).toBe(manifest.render.pcm.frames);
    expect(readdirSync(dirname(join(repo.root, referenceAsset)))).toEqual(['knock.ogg']);
  });

  it('kodek sonrası politika ihlali: HİÇBİR dosya yazılmaz, staging silinir', () => {
    const loc = prepare(REFERENCE_TARGET, loudProgram());
    expect(() => publishJob(loc)).toThrow(/kodek sonrası sfx politikası/);
    expect(code(() => publishJob(loc))).toBe('policy');
    const dir = join(repo.root, 'devtools/audio-synth/reference/production/assets/sfx');
    expect(existsSync(dir) ? readdirSync(dir) : []).toEqual([]);
    expect(existsSync(join(repo.root, referenceManifest))).toBe(false);
    expect(jobStatus(loc).next.action).toBe('publish');
  });

  it('yol sınıfı brief sınıfıyla uyuşmalı', () => {
    const loc = prepare(REFERENCE_TARGET, testProgram(), testBrief({ assetClass: 'ui' }));
    expect(() => publishJob(loc)).toThrow(/yol sınıfı sfx, brief ui/);
  });

  it('manifest’siz ya da başka işin dosyasının üzerine yazılmaz', () => {
    const foreign = join(repo.root, referenceAsset);
    mkdirSync(dirname(foreign), { recursive: true });
    writeFileSync(foreign, 'başkasının dosyası');
    const loc = prepare();
    expect(code(() => publishJob(loc))).toBe('overwrite');
    expect(readFileSync(foreign, 'utf8')).toBe('başkasının dosyası');
  });

  it('aynı iş yeniden publish edebilir; başka iş aynı hedefe yazamaz', () => {
    publishJob(prepare());
    publishJob(repo.loc());
    const other = prepare(REFERENCE_TARGET, testProgram(), testBrief(), 'rival');
    expect(() => publishJob(other)).toThrow(/hedef knock\/knock işine ait/);
  });

  it.each<[string, JobTargetV1, RegExp]>([
    [
      'frozen paket',
      {
        ...REFERENCE_TARGET,
        package: '@volstudio/old-game',
        asset: 'public/assets/audio/sfx/x.ogg',
      },
      /frozen/,
    ],
    [
      'beyansız oyun',
      {
        ...REFERENCE_TARGET,
        package: '@volstudio/bare-game',
        asset: 'public/assets/audio/sfx/x.ogg',
      },
      /beyanı/,
    ],
    [
      'bilinmeyen paket',
      { ...REFERENCE_TARGET, package: '@volstudio/nope' },
      /aktif publish hedefi değil/,
    ],
    ['kök dışı asset', { ...REFERENCE_TARGET, asset: 'src/index.ogg' }, /altında olmalı/],
    [
      '.ogg olmayan',
      { ...REFERENCE_TARGET, asset: 'reference/production/assets/sfx/x.wav' },
      /\.ogg olmalı/,
    ],
    [
      'kaçış',
      { ...REFERENCE_TARGET, asset: 'reference/production/assets/../../../x.ogg' },
      /geçersiz yol parçası/,
    ],
  ])('hedef init’te reddedilir: %s', (_label, target, message) => {
    expect(() => initJob(repo.loc(), { target })).toThrow(message);
  });

  it('beyanlı test oyunu: çalışma zamanı kabiliyeti publish’te sınanır', () => {
    const target: JobTargetV1 = {
      package: '@volstudio/declared-game',
      asset: 'public/assets/audio/sfx/knock.ogg',
      integration: { runtimeKey: 'sfx/knock', loop: false },
    };
    const wrongRate = prepare(target, testProgram({ sampleRate: 44100 }));
    expect(() => publishJob(wrongRate)).toThrow(/44100 Hz beyan etmiyor/);
    const ok = prepare(target, testProgram(), testBrief(), 'knock-48k');
    const { manifestPath, manifest } = publishJob(ok);
    expect(manifestPath).toBe('games/declared-game/audio-manifests/sfx/knock.json');
    expect(manifest.integration.runtimeDeclaration).toBe('games/declared-game/audio-target.json');
    expect(manifest.integration.runtimeKey).toBe('sfx/knock');
  });

  it('loop isteyen brief loop olmayan hedefe kaydedilemez', () => {
    const loc = repo.loc();
    initJob(loc, { target: REFERENCE_TARGET });
    expect(code(() => registerBrief(loc, testBrief({ loop: true })))).toBe('invalid');
  });
});

describe('manifest doğrulaması ve fark sınıfı', () => {
  it('yeni publish: PCM + bayt + araç zinciri aynı → identical', () => {
    publishJob(prepare());
    const report = verifyManifest(repo.root, referenceManifest);
    expect(report.change).toBe('identical');
    expect(report.ok).toBe(true);
    expect(jobStatus(repo.loc()).artifacts.publication.state).toBe('valid');
  });

  it('asset baytı kurcalanırsa doğrulama ve job durumu düşer', () => {
    publishJob(prepare());
    const file = join(repo.root, referenceAsset);
    const bytes = readFileSync(file);
    bytes[bytes.length - 10] ^= 0xff;
    writeFileSync(file, bytes);
    const report = verifyManifest(repo.root, referenceManifest);
    expect(report.checks.find((c) => c.name === 'asset-bytes')?.ok).toBe(false);
    expect(report.ok).toBe(false);
    expect(jobStatus(repo.loc()).artifacts.publication.reason).toBe(
      'asset baytları manifest ile uyuşmuyor',
    );
  });

  it('manifest’teki PCM özeti programla uyuşmazsa pcm-changed', () => {
    publishJob(prepare());
    const manifest = readManifest();
    const forged = {
      ...manifest,
      render: {
        ...manifest.render,
        pcm: { ...manifest.render.pcm, hash: sha256Bytes('başka ses') },
      },
    };
    writeFileSync(join(repo.root, referenceManifest), prettyCanonicalJson(forged));
    const report = verifyManifest(repo.root, referenceManifest);
    expect(report.change).toBe('pcm-changed');
    expect(report.checks.find((c) => c.name === 'pcm-identity')?.ok).toBe(false);
    expect(jobStatus(repo.loc()).artifacts.publication.state).toBe('modified');
  });

  it('YALNIZ kodlayıcı değişirse (kalite 5 ile üretilmiş kayıt) encoder-only: ses aynı', () => {
    publishJob(prepare());
    const manifest = readManifest();
    const file = join(repo.root, referenceAsset);
    writeOgg(file, renderProgram(manifest.program.document, { seed: manifest.render.seed }), {
      quality: 5,
    });
    const { fingerprint: _old, ...current } = readEncoderToolchain();
    const older = {
      ...current,
      quality: 5,
      arguments: current.arguments.map((a) => (a === '4' ? '5' : a)),
    };
    const bytes = readFileSync(file);
    const recorded = {
      ...manifest,
      asset: { ...manifest.asset, bytes: bytes.length, encodedHash: sha256Bytes(bytes) },
      encoder: { ...older, fingerprint: hashCanonical(older) },
    };
    writeFileSync(join(repo.root, referenceManifest), prettyCanonicalJson(recorded));
    const report = verifyManifest(repo.root, referenceManifest);
    expect(report.recorded.pcmHash).toBe(report.current.pcmHash);
    expect(report.recorded.encodedHash).not.toBe(report.current.encodedHash);
    expect(report.recorded.encoderFingerprint).not.toBe(report.current.encoderFingerprint);
    expect(report.change).toBe('encoder-only');
    expect(report.ok).toBe(true);
  });

  it('manifest iç tutarlılığı: gömülü belge özeti, parmak izi ve politika kararı', () => {
    publishJob(prepare());
    const manifest = readManifest();
    const invalid =
      (...edits: Edit[]) =>
      () =>
        validateManifest(edited(manifest, ...edits));
    expect(invalid([['program', 'document', 'seed'], 1])).toThrow(/gömülü belge/);
    expect(invalid([['encoder', 'quality'], 9])).toThrow(/araç zinciri/);
    expect(invalid([['policy', 'violations'], ['x']])).toThrow(/yalnız geçen/);
    expect(invalid([['analysis', 'encoded', 'measuredFrom'], 'source-pcm'])).toThrow(
      /kodek SONRASI/,
    );
    expect(invalid([['extra'], 1])).toThrow(/bilinmeyen alan/);
  });

  it('fark sınıfları', () => {
    const h = (s: string) => sha256Bytes(s);
    const base = { pcmHash: h('p'), encodedHash: h('e'), encoderFingerprint: h('t') };
    expect(classifyAssetChange(base, base)).toBe('identical');
    expect(
      classifyAssetChange(base, { ...base, encodedHash: h('e2'), encoderFingerprint: h('t2') }),
    ).toBe('encoder-only');
    expect(classifyAssetChange(base, { ...base, encodedHash: h('e2') })).toBe(
      'encoder-nondeterministic',
    );
    expect(classifyAssetChange(base, { ...base, pcmHash: h('p2') })).toBe('pcm-changed');
  });

  it('publish kaydı job’a özetle bağlıdır', () => {
    const loc = prepare();
    const { manifest } = publishJob(loc);
    expect(loadJob(loc).artifacts.publication).toEqual({
      path: referenceManifest,
      hash: hashCanonical(manifest),
    });
    registerProgram(loc, testProgram({ seed: 8 }));
    expect(jobStatus(loc).artifacts.publication.reason).toBe('selection stale');
  });
});
