import type { AssetClass } from '../analysis/assetQa';
import { LAYOUT_POLICY, PLACEMENTS, type Placement, type StereoImageV1 } from '../analysis/layout';
import { AUDIO_ANALYSIS_SCHEMA, type AudioAnalysisReportV1 } from '../analysis/report';
import { AudioParamError } from '../guard/errors';
import { checkArray, checkChoice, checkNumber, checkObject } from '../guard/read';
import { RENDER_SURFACE_SCHEME, type RenderSurfaceV1 } from '../program/surface';
import { hashCanonical, type Sha256 } from '../kernel/canonical';
import { checkHash } from './records';
import type { LoopSeamV1 } from '../analysis/seam';
import type { ManifestDerivationV1 } from './derivation';
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
    /**
     * Eski manifest'lerde kalan, bilgi taşımayan alanlar: paket sürümü hiç
     * değişmedi, yayın her zaman kirli ağaçta yazıldı. Kaynak kimliği
     * `program.hash`, `renderSurface` ve `registryHash`tir; yeni yayın bunları
     * yazmaz.
     */
    readonly packageVersion?: string;
    readonly rendererVersion: number;
    readonly registryHash: Sha256;
    /** Programın kullandığı düğümlerin render yüzeyi; eski manifest'lerde yoktur. */
    readonly renderSurface?: RenderSurfaceV1;
    readonly sourceCommit?: string | null;
    readonly sourceTreeDirty?: boolean | null;
    readonly runtime: { readonly node: string };
  };
  readonly encoder: EncoderToolchain;
  /** Kodlama profili (`encode-profile-v1`): politika özeti ve seçilen kalite; eski manifest'te yok. */
  readonly encoding?: {
    readonly scheme: 'encode-profile-v1';
    readonly policyHash: Sha256;
    readonly quality: number;
  };
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
  /**
   * Kanal/yerleşim kaydı: beyan edilen (ya da sınıf varsayılanı) yerleşim,
   * kodlanmış kanal sayısı ve kodek sonrası stereo görüntü. Bu alandan önce
   * yayımlanan manifest'te yoktur; varsa `verify` yerleşimi yeniden sınar.
   */
  readonly layout?: {
    readonly scheme: typeof LAYOUT_POLICY.scheme;
    readonly placement: Placement;
    readonly channels: number;
    readonly image: StereoImageV1 | null;
  };
  /** Yalnız sample/IR kullanan programda: kayıt provenance'ı ve sampler seçim gerekçesi. */
  readonly sources?: ManifestSourcesV1;
  /** Yalnız loop brief'inde: kodek sonrası dikiş ölçümü (`loop-seam-v1`). */
  readonly seam?: LoopSeamV1;
  /** Yalnız teslim varyantında: kaynağa ve profile bağ (`treatment-derivation-v1`). */
  readonly derivation?: ManifestDerivationV1;
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
  'encoding',
  'analysis',
  'policy',
  'integration',
  'layout',
  'sources',
  'seam',
  'derivation',
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
  const engine = checkObject(o.engine, 'engine', [
    'package',
    'packageVersion',
    'rendererVersion',
    'registryHash',
    'renderSurface',
    'sourceCommit',
    'sourceTreeDirty',
    'runtime',
  ]);
  if (engine.renderSurface !== undefined) validateRenderSurface(engine.renderSurface);
  if (o.encoding !== undefined) {
    const encoding = checkObject(o.encoding, 'encoding', ['scheme', 'policyHash', 'quality']);
    checkChoice(encoding.scheme, 'encoding.scheme', ['encode-profile-v1'] as const);
    checkHash(encoding.policyHash, 'encoding.policyHash');
    if (encoding.quality !== encoder.quality) {
      throw new AudioParamError(
        'encoding.quality',
        'combination',
        'profil kalitesi kodlayıcı kaydıyla aynı olmalı',
        encoding.quality,
      );
    }
  }
  if (o.layout !== undefined) validateLayout(o.layout);
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
  if (o.derivation !== undefined) {
    const d = checkObject(o.derivation, 'derivation', ['scheme', 'source', 'profile', 'cues']);
    checkChoice(d.scheme, 'derivation.scheme', ['treatment-derivation-v1'] as const);
    const source = checkObject(d.source, 'derivation.source', [
      'manifest',
      'assetId',
      'programHash',
      'pcmHash',
    ]);
    checkHash(source.programHash, 'derivation.source.programHash');
    checkHash(source.pcmHash, 'derivation.source.pcmHash');
    const profile = checkObject(d.profile, 'derivation.profile', [
      'id',
      'version',
      'hash',
      'kind',
      'model',
    ]);
    checkHash(profile.hash, 'derivation.profile.hash');
    checkObject(d.cues, 'derivation.cues', ['source', 'derived']);
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

function validateLayout(value: unknown): void {
  const o = checkObject(value, 'layout', ['scheme', 'placement', 'channels', 'image']);
  checkChoice(o.scheme, 'layout.scheme', [LAYOUT_POLICY.scheme] as const);
  checkChoice(o.placement, 'layout.placement', PLACEMENTS);
  checkNumber(o.channels, 'layout.channels', { min: 1, max: 2, integer: true });
  if (o.image === null) return;
  const image = checkObject(o.image, 'layout.image', [
    'method',
    'correlation',
    'sideDb',
    'monoFoldLossDb',
    'dualMono',
  ]);
  checkChoice(image.method, 'layout.image.method', ['stereo-image-v1'] as const);
}

function validateRenderSurface(value: unknown): void {
  const o = checkObject(value, 'engine.renderSurface', ['scheme', 'hash', 'nodes', 'instruments']);
  if (o.scheme !== RENDER_SURFACE_SCHEME) {
    throw new AudioParamError(
      'engine.renderSurface.scheme',
      'type',
      RENDER_SURFACE_SCHEME,
      o.scheme,
    );
  }
  const nodes = checkArray(o.nodes, 'engine.renderSurface.nodes').map((raw, i) => {
    const n = checkObject(raw, `engine.renderSurface.nodes[${i}]`, ['id', 'version', 'hash']);
    if (typeof n.id !== 'string' || n.id.length === 0) {
      throw new AudioParamError(`engine.renderSurface.nodes[${i}].id`, 'type', 'kimlik', n.id);
    }
    checkNumber(n.version, `engine.renderSurface.nodes[${i}].version`, { min: 1, integer: true });
    checkHash(n.hash, `engine.renderSurface.nodes[${i}].hash`);
    return raw;
  });
  const instruments =
    o.instruments === undefined
      ? []
      : checkArray(o.instruments, 'engine.renderSurface.instruments').map((raw, i) => {
          const n = checkObject(raw, `engine.renderSurface.instruments[${i}]`, ['id', 'hash']);
          checkHash(n.hash, `engine.renderSurface.instruments[${i}].hash`);
          return raw;
        });
  if (hashCanonical({ nodes, instruments }) !== checkHash(o.hash, 'engine.renderSurface.hash')) {
    throw new AudioParamError(
      'engine.renderSurface.hash',
      'combination',
      'düğüm ve enstrüman kayıtlarının özeti değil',
      o.hash,
    );
  }
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
