import type { AssetClass } from '../analysis/assetQa';
import { AUDIO_ANALYSIS_SCHEMA, type AudioAnalysisReportV1 } from '../analysis/report';
import { AudioParamError } from '../guard/errors';
import { checkChoice, checkNumber, checkObject } from '../guard/read';
import { hashCanonical, type Sha256 } from './canonical';
import { checkHash } from './records';
import type { LoopSeamV1 } from '../analysis/seam';
import { validateSources, type ManifestSourcesV1 } from './sources';
import type { EncoderToolchain } from './toolchain';

export const ASSET_MANIFEST_SCHEMA = 'AudioAssetManifestV1';

/**
 * Production provenance'ın kanonik sözleşmesi. Manifest KENDİ BAŞINA
 * yeterlidir: brief ve program belgeleri gömülüdür, yani job dizini
 * silinse bile asset'in hangi program + tohum + araç zinciriyle üretildiği
 * ve yeniden üretilebildiği yalnız bu dosyadan belirlenir.
 */
export interface AudioAssetManifestV1 {
  readonly schema: typeof ASSET_MANIFEST_SCHEMA;
  readonly assetId: string;
  readonly asset: {
    readonly path: string;
    readonly format: 'ogg-vorbis';
    readonly bytes: number;
    readonly encodedHash: Sha256;
  };
  readonly job: { readonly jobId: string; readonly protocolVersion: number; readonly path: string };
  readonly brief: {
    readonly schema: 'AudioBriefV1';
    readonly kind: 'acoustic' | 'music';
    readonly hash: Sha256;
    readonly document: unknown;
  };
  readonly program: {
    readonly schema: 'AcousticProgramV1' | 'MusicStemProgramV1';
    readonly hash: Sha256;
    readonly document: unknown;
  };
  readonly render: {
    readonly renderId: string;
    readonly seed: number;
    readonly rendererVersion: number;
    readonly pcm: {
      readonly hash: Sha256;
      readonly format: 'f32le-interleaved-clamped';
      readonly sampleRate: number;
      readonly channels: number;
      readonly frames: number;
    };
  };
  readonly engine: {
    readonly package: string;
    readonly packageVersion: string;
    readonly rendererVersion: number;
    readonly registryHash: Sha256;
    readonly sourceCommit: string | null;
    readonly sourceTreeDirty: boolean | null;
    readonly runtime: { readonly node: string };
  };
  readonly encoder: EncoderToolchain;
  readonly analysis: {
    readonly analyzerVersion: number;
    readonly sourceRecordHash: Sha256;
    readonly encoded: AudioAnalysisReportV1;
  };
  readonly policy: {
    readonly assetClass: AssetClass;
    readonly policyVersion: number;
    readonly verdict: 'pass';
    readonly violations: readonly string[];
  };
  readonly integration: {
    readonly package: string;
    readonly targetKind: 'reference' | 'game';
    readonly runtimeKey: string | null;
    readonly loop: boolean;
    /** Çalışma zamanı beyanının yeri; referans hedefte `null` (hiçbir oyun çalmaz). */
    readonly runtimeDeclaration: string | null;
  };
  /** Yalnız sample/IR kullanan programda: kayıt provenance'ı ve sampler seçim gerekçesi. */
  readonly sources?: ManifestSourcesV1;
  /** Yalnız loop brief'inde: kodek sonrası dikiş ölçümü (`loop-seam-v1`). */
  readonly seam?: LoopSeamV1;
}

const TOP_KEYS = [
  'schema',
  'assetId',
  'asset',
  'job',
  'brief',
  'program',
  'render',
  'engine',
  'encoder',
  'analysis',
  'policy',
  'integration',
  'sources',
  'seam',
];

/**
 * Yapıyı ve iç tutarlılığı doğrular: gömülü belgelerin özeti kayıtlı özete
 * eşit olmalı, politika kararı `pass` ve ihlalsiz olmalı — başarısız bir
 * publish'i "başarılı" diye anlatan manifest yazılamaz.
 */
export function validateManifest(value: unknown): AudioAssetManifestV1 {
  const o = checkObject(value, '', TOP_KEYS);
  if (o.schema !== ASSET_MANIFEST_SCHEMA) {
    throw new AudioParamError('schema', 'type', ASSET_MANIFEST_SCHEMA, o.schema);
  }
  const asset = checkObject(o.asset, 'asset', ['path', 'format', 'bytes', 'encodedHash']);
  checkChoice(asset.format, 'asset.format', ['ogg-vorbis'] as const);
  checkNumber(asset.bytes, 'asset.bytes', { min: 1, integer: true });
  checkHash(asset.encodedHash, 'asset.encodedHash');
  for (const key of ['brief', 'program'] as const) {
    const doc = checkObject(
      o[key],
      key,
      key === 'brief' ? ['schema', 'kind', 'hash', 'document'] : ['schema', 'hash', 'document'],
    );
    const hash = checkHash(doc.hash, `${key}.hash`);
    if (hashCanonical(doc.document) !== hash) {
      throw new AudioParamError(
        `${key}.document`,
        'combination',
        'gömülü belge kayıtlı özete uymuyor',
        hash,
      );
    }
  }
  const render = checkObject(o.render, 'render', ['renderId', 'seed', 'rendererVersion', 'pcm']);
  const pcm = checkObject(render.pcm, 'render.pcm', [
    'hash',
    'format',
    'sampleRate',
    'channels',
    'frames',
  ]);
  checkHash(pcm.hash, 'render.pcm.hash');
  const encoder = checkObject(o.encoder, 'encoder', [
    'tool',
    'version',
    'libraries',
    'codec',
    'quality',
    'arguments',
    'unreported',
    'fingerprint',
  ]);
  const { fingerprint, ...toolchain } = encoder;
  if (hashCanonical(toolchain) !== checkHash(fingerprint, 'encoder.fingerprint')) {
    throw new AudioParamError(
      'encoder.fingerprint',
      'combination',
      'araç zinciri alanlarının özeti değil',
      fingerprint,
    );
  }
  const analysis = checkObject(o.analysis, 'analysis', [
    'analyzerVersion',
    'sourceRecordHash',
    'encoded',
  ]);
  checkHash(analysis.sourceRecordHash, 'analysis.sourceRecordHash');
  const encoded = checkObject(
    analysis.encoded,
    'analysis.encoded',
    Object.keys((analysis.encoded as object) ?? {}),
  );
  if (encoded.schema !== AUDIO_ANALYSIS_SCHEMA || encoded.measuredFrom !== 'decoded-encoded') {
    throw new AudioParamError(
      'analysis.encoded',
      'combination',
      "kodek SONRASI rapor ('decoded-encoded') olmalı",
      encoded.measuredFrom,
    );
  }
  const policy = checkObject(o.policy, 'policy', [
    'assetClass',
    'policyVersion',
    'verdict',
    'violations',
  ]);
  if (
    policy.verdict !== 'pass' ||
    !Array.isArray(policy.violations) ||
    policy.violations.length > 0
  ) {
    throw new AudioParamError(
      'policy',
      'combination',
      'manifest yalnız geçen bir publish için yazılır',
      policy.verdict,
    );
  }
  checkObject(o.job, 'job', ['jobId', 'protocolVersion', 'path']);
  checkObject(o.engine, 'engine', [
    'package',
    'packageVersion',
    'rendererVersion',
    'registryHash',
    'sourceCommit',
    'sourceTreeDirty',
    'runtime',
  ]);
  if (o.sources !== undefined) validateSources(o.sources);
  if (o.seam !== undefined) {
    const seam = checkObject(o.seam, 'seam', [
      'method',
      'jumpRatio',
      'levelStepDb',
      'spectralStepDb',
      'pass',
      'reasons',
    ]);
    if (seam.pass !== true) {
      throw new AudioParamError(
        'seam',
        'combination',
        'manifest yalnız geçen dikişle yazılır',
        seam.pass,
      );
    }
  }
  checkObject(o.integration, 'integration', [
    'package',
    'targetKind',
    'runtimeKey',
    'loop',
    'runtimeDeclaration',
  ]);
  return value as AudioAssetManifestV1;
}

/**
 * Yeniden üretim ile kayıt arasındaki farkın SINIFI:
 * - `identical`: PCM ve kodlanmış baytlar aynı.
 * - `encoder-only`: PCM aynı, baytlar farklı, araç zinciri parmak izi farklı —
 *   ses değişmedi, kap/kodlayıcı değişti.
 * - `encoder-nondeterministic`: PCM ve parmak izi aynı, baytlar farklı —
 *   raporlanmayan bir bileşen (libvorbis) ya da kurcalanmış dosya; hatadır.
 * - `pcm-changed`: sesin kendisi değişti.
 */
export type AssetChange = 'identical' | 'encoder-only' | 'encoder-nondeterministic' | 'pcm-changed';

export interface AssetIdentity {
  readonly pcmHash: Sha256;
  readonly encodedHash: Sha256;
  readonly encoderFingerprint: Sha256;
}

export function classifyAssetChange(recorded: AssetIdentity, current: AssetIdentity): AssetChange {
  if (recorded.pcmHash !== current.pcmHash) return 'pcm-changed';
  if (recorded.encodedHash === current.encodedHash) return 'identical';
  return recorded.encoderFingerprint === current.encoderFingerprint
    ? 'encoder-nondeterministic'
    : 'encoder-only';
}
