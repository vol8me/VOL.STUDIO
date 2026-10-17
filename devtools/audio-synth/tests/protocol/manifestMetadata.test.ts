import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { renderProgram } from '../../src/program/render';
import { sha256Bytes, prettyCanonicalJson } from '../../src/kernel/canonical';
import {
  DECODE_FRAME_SLACK,
  encodedFormatIssues,
  pcmMetadataIssues,
  validateManifest,
  type AudioAssetManifestV1,
} from '../../src/protocol/manifest';
import { verifyManifest } from '../../src/protocol/publish';
import { writeOgg } from '../../src/writer';
import { clone, edited, type Edit } from '../support/json';
import { PIPELINE_BLOCK } from '../support/timeouts';

/**
 * B05: manifest PCM/kodlama metadatası. Gerçek bir yayımlanmış referans
 * manifest ve asset'i geçici bir köke kopyalanır; kayıt kurcalanır, gerçek
 * dosya ve bağımsız render ile karşılaştırma `verifyManifest`te sınanır.
 */
const REPO = resolve(import.meta.dirname, '../../../..');
const MANIFEST = 'devtools/audio-synth/reference/production/manifests/sfx/reference-impact.json';
const real = JSON.parse(readFileSync(join(REPO, MANIFEST), 'utf8')) as AudioAssetManifestV1;

let root: string;
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'audio-manifest-meta-'));
  mkdirSync(dirname(join(root, real.asset.path)), { recursive: true });
  cpSync(join(REPO, real.asset.path), join(root, real.asset.path));
  mkdirSync(dirname(join(root, MANIFEST)), { recursive: true });
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

function writeManifest(manifest: unknown): void {
  writeFileSync(join(root, MANIFEST), prettyCanonicalJson(manifest));
}

function failedChecks(...edits: Edit[]): string[] {
  writeManifest(edited(real, ...edits));
  return verifyManifest(root, MANIFEST)
    .checks.filter((check) => !check.ok)
    .map((check) => check.name);
}

const invalid =
  (...edits: Edit[]) =>
  () =>
    validateManifest(edited(real, ...edits));

describe('manifest metadata doğrulaması (B05)', () => {
  it('gerçek yayımlanmış manifest kabul edilir', () => {
    expect(() => validateManifest(clone(real))).not.toThrow();
  });

  it('sürüm sözleşmesi: sonradan eklenen isteğe bağlı alanlar olmayan eski manifest kabul edilir', () => {
    const legacy = clone(real) as unknown as Record<string, Record<string, unknown>>;
    for (const key of ['encoding', 'layout', 'sources', 'seam', 'derivation'])
      delete (legacy as Record<string, unknown>)[key];
    for (const key of ['packageVersion', 'renderSurface', 'sourceCommit', 'sourceTreeDirty'])
      delete legacy.engine[key];
    expect(() => validateManifest(legacy)).not.toThrow();
  });

  it('denetimdeki imkânsız metadata birlikte ve tek tek reddedilir', () => {
    const impossible: Edit[] = [
      [['asset', 'bytes'], 1],
      [['render', 'pcm', 'sampleRate'], 123],
      [['render', 'pcm', 'channels'], 99],
      [['render', 'pcm', 'frames'], -1],
      [['render', 'pcm', 'format'], 'invalid-format'],
    ];
    expect(invalid(...impossible)).toThrow();
    expect(invalid(impossible[1])).toThrow(/render\.pcm\.sampleRate/);
    expect(invalid(impossible[2])).toThrow(/render\.pcm\.channels/);
    expect(invalid(impossible[3])).toThrow(/render\.pcm\.frames/);
    expect(invalid(impossible[4])).toThrow(/render\.pcm\.format/);
  });

  it.each<[string, Edit, RegExp]>([
    ['eksik pcm alanı', [['render', 'pcm', 'frames'], undefined], /render\.pcm\.frames/],
    ['yanlış tip', [['render', 'pcm', 'sampleRate'], '48000'], /render\.pcm\.sampleRate/],
    ['kesirli kare', [['render', 'pcm', 'frames'], 57600.5], /render\.pcm\.frames/],
    ['sonsuz oran', [['render', 'pcm', 'sampleRate'], null], /render\.pcm\.sampleRate/],
    ['bozuk renderId', [['render', 'renderId'], 'r-zz'], /render\.renderId/],
    ['negatif tohum', [['render', 'seed'], -1], /render\.seed/],
    ['bozuk jobId', [['job', 'jobId'], 'Bad Id'], /job\.jobId/],
    ['bilinmeyen sınıf', [['policy', 'assetClass'], 'cinematic'], /policy\.assetClass/],
    ['boş asset yolu', [['asset', 'path'], ''], /asset\.path/],
    ['kodlayıcı aracı', [['encoder', 'tool'], 'sox'], /encoder\.tool/],
    ['eksik motor sürümü', [['engine', 'rendererVersion'], undefined], /engine\.rendererVersion/],
    ['boolean olmayan loop', [['integration', 'loop'], 'false'], /integration\.loop/],
    ['bilinmeyen hedef türü', [['integration', 'targetKind'], 'cloud'], /integration\.targetKind/],
  ])('yapısal ret: %s', (_label, edit, message) => {
    expect(invalid(edit)).toThrow(message);
  });

  it('PCM betimi kodlanmış rapor, yerleşim ve brief ile çelişemez', () => {
    // Her biri kendi alanında geçerli, birbiriyle tutarsız.
    expect(invalid([['render', 'pcm', 'sampleRate'], 44100])).toThrow(/aynı oran\/kanal/);
    expect(invalid([['render', 'pcm', 'channels'], 2])).toThrow(/aynı oran\/kanal/);
    expect(invalid([['render', 'pcm', 'frames'], real.render.pcm.frames + 5000])).toThrow(
      /kodlanmış kare sayısı/,
    );
    expect(invalid([['analysis', 'encoded', 'format', 'durationSeconds'], 2.5])).toThrow(
      /süre kare sayısı/,
    );
    expect(invalid([['layout', 'channels'], 2])).toThrow(/yerleşim kanal sayısı/);
    expect(
      invalid(
        [['brief', 'document', 'channels'], 2],
        [['brief', 'hash'], 'sha256:' + '0'.repeat(64)],
      ),
    ).toThrow();
  });

  it('geçerli ama gerçek render/dosyadan farklı kayıtlar verify ile düşer', PIPELINE_BLOCK, () => {
    // Kare sayısı slack içinde: şema kabul eder, bağımsız render reddeder.
    const frames = real.render.pcm.frames + 1;
    expect(() =>
      validateManifest(edited(real, [['render', 'pcm', 'frames'], frames])),
    ).not.toThrow();
    expect(failedChecks([['render', 'pcm', 'frames'], frames])).toContain('pcm-metadata');

    // Makul ama yalan bayt sayısı: şema kabul eder, disk dosyası reddeder.
    const bytes = real.asset.bytes + 1;
    expect(() => validateManifest(edited(real, [['asset', 'bytes'], bytes]))).not.toThrow();
    expect(failedChecks([['asset', 'bytes'], bytes])).toEqual(['asset-size']);
  });

  it('kayıtla uyumlu geçerli manifest bütün metadata denetimlerini geçer', PIPELINE_BLOCK, () => {
    writeManifest(real);
    const report = verifyManifest(root, MANIFEST);
    const byName = new Map(report.checks.map((check) => [check.name, check.ok]));
    for (const name of [
      'asset-bytes',
      'asset-size',
      'pcm-identity',
      'pcm-metadata',
      'encoded-format',
    ])
      expect(byName.get(name), name).toBe(true);
    // Araç zinciri farklıysa encoder-only, aynıysa identical: ikisi de geçerli sınıftır.
    expect(['identical', 'encoder-only']).toContain(report.change);
    expect(report.ok).toBe(true);
  });

  it(
    'bayt özeti tutan ama kaynak PCM’den uzun bir dosya encoded-format ile düşer',
    PIPELINE_BLOCK,
    () => {
      // Aynı programı iki kat uzun render edip kodla; manifest o dosyanın özetine bağlanır.
      const program = real.program.document as Record<string, unknown>;
      const longer = renderProgram(
        { ...program, durationSeconds: 2.4 },
        {
          seed: real.render.seed,
          quality: 'final',
        },
      );
      const file = join(root, real.asset.path);
      writeOgg(file, longer, { quality: real.encoder.quality });
      const bytes = readFileSync(file);
      try {
        const failed = failedChecks(
          [['asset', 'encodedHash'], sha256Bytes(bytes)],
          [['asset', 'bytes'], bytes.length],
        );
        expect(failed).toContain('encoded-format');
        expect(failed).not.toContain('asset-bytes');
        expect(failed).not.toContain('asset-size');
      } finally {
        cpSync(join(REPO, real.asset.path), file);
      }
    },
  );
});

describe('metadata karşılaştırma yardımcıları', () => {
  const shape = { sampleRate: 48000, channels: 1, frames: 48000 };

  it('pcmMetadataIssues her alanı adıyla raporlar', () => {
    expect(pcmMetadataIssues(shape, shape)).toEqual([]);
    expect(pcmMetadataIssues(shape, { sampleRate: 44100, channels: 2, frames: 1 })).toEqual([
      'sampleRate kayıt 48000, render 44100',
      'channels kayıt 1, render 2',
      'frames kayıt 48000, render 1',
    ]);
  });

  it('encodedFormatIssues Vorbis bloğu kadar sapmaya izin verir, fazlasına vermez', () => {
    expect(encodedFormatIssues(shape, { ...shape, frames: 48000 - 128 })).toEqual([]);
    expect(encodedFormatIssues(shape, { ...shape, frames: 48000 + DECODE_FRAME_SLACK })).toEqual(
      [],
    );
    expect(
      encodedFormatIssues(shape, { ...shape, frames: 48000 + DECODE_FRAME_SLACK + 1 }),
    ).toHaveLength(1);
    expect(
      encodedFormatIssues(shape, { sampleRate: 44100, channels: 2, frames: 48000 }),
    ).toHaveLength(2);
  });
});
