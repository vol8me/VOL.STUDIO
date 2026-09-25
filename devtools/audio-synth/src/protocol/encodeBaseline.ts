import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AssetClass } from '../analysis/assetQa';
import { measureEncodeFidelity } from '../analysis/encodeFidelity';
import { writeOgg } from '../writer';
import { buildEncodeCorpus, type CorpusItem } from './encodeCorpus';
import {
  ENCODE_BASELINE_SCHEMA,
  ENCODE_POLICY,
  encodePolicyHash,
  fidelityFailures,
  selectQuality,
  type BaselineClassV1,
  type BaselineItemV1,
  type BaselineMeasurementV1,
  type EncodeBaselineV1,
} from './encodeProfiles';
import { decodeWithFfmpeg, readEncoderToolchain } from './toolchain';

/**
 * Kodlama taban çizgisini ÖLÇER: korpusun her öğesi taramadaki her kaliteyle
 * kodlanır, FFmpeg ile çözülür, bayt ve `decoded-fidelity-v1` kaydedilir;
 * seçim `selectQuality` kuralıyla yapılır. `audio:encode-baseline` bunu
 * kilide yazar; yönetişim testi seçilen kaliteleri yeniden ölçüp kilitle
 * karşılaştırır.
 */
function measureAt(dir: string, item: CorpusItem, quality: number): BaselineMeasurementV1 {
  const file = join(dir, `${quality}.ogg`);
  const seconds = item.channels[0].length / item.sampleRate;
  writeOgg(file, { ...item, duration: seconds }, { quality });
  const bytes = readFileSync(file).length;
  const decoded = decodeWithFfmpeg(file, item.id);
  const fidelity = measureEncodeFidelity(item.channels, decoded.channels, item.sampleRate);
  return { quality, bytes, fidelity, failures: fidelityFailures(fidelity) };
}

function silenceBytes(dir: string, channels: number): number {
  const file = join(dir, `silence-${channels}.ogg`);
  const frames = 480;
  writeOgg(
    file,
    {
      channels: Array.from({ length: channels }, () => new Float32Array(frames)),
      sampleRate: 48000,
      duration: frames / 48000,
    },
    { quality: ENCODE_POLICY.minQuality },
  );
  return readFileSync(file).length;
}

export function measureItems(
  items: readonly CorpusItem[],
  qualities: readonly number[],
): BaselineItemV1[] {
  const dir = mkdtempSync(join(tmpdir(), 'encode-baseline-'));
  try {
    return items.map((item) => ({
      id: item.id,
      origin: item.origin,
      pcmHash: item.pcmHash,
      channels: item.channels.length,
      sampleRate: item.sampleRate,
      seconds: Number((item.channels[0].length / item.sampleRate).toFixed(4)),
      sweep: qualities.map((q) => measureAt(dir, item, q)),
    }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function classOf(items: readonly BaselineItemV1[]): BaselineClassV1 {
  const seconds = items.reduce((sum, item) => sum + item.seconds, 0);
  const totals = ENCODE_POLICY.sweep.map((quality) => {
    const bytes = items.reduce(
      (sum, item) => sum + (item.sweep.find((m) => m.quality === quality)?.bytes ?? 0),
      0,
    );
    return { quality, bytes, kbps: Number(((bytes * 8) / seconds / 1000).toFixed(1)) };
  });
  return { items, ...selectQuality(items), totals };
}

export function measureEncodeBaseline(repoRoot: string): EncodeBaselineV1 {
  const corpus = buildEncodeCorpus(repoRoot);
  const measured = measureItems(corpus, ENCODE_POLICY.sweep);
  const classes = Object.fromEntries(
    (Object.keys(ENCODE_POLICY.classes) as AssetClass[]).map((name) => [
      name,
      classOf(measured.filter((_, i) => corpus[i].assetClass === name)),
    ]),
  ) as Record<AssetClass, BaselineClassV1>;
  const toolchain = readEncoderToolchain(ENCODE_POLICY.minQuality);
  const dir = mkdtempSync(join(tmpdir(), 'encode-header-'));
  try {
    return {
      schema: ENCODE_BASELINE_SCHEMA,
      policyHash: encodePolicyHash(),
      policy: ENCODE_POLICY,
      toolchain: { version: toolchain.version, fingerprint: toolchain.fingerprint },
      headerBytes: { mono: silenceBytes(dir, 1), stereo: silenceBytes(dir, 2) },
      classes,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
