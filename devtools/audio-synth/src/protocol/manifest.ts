import { ASSET_CLASS_POLICIES, type AssetClass } from '../analysis/assetQa';
import { LAYOUT_POLICY, PLACEMENTS, type Placement, type StereoImageV1 } from '../analysis/layout';
import { AUDIO_ANALYSIS_SCHEMA, type AudioAnalysisReportV1 } from '../analysis/report';
import { AudioParamError } from '../guard/errors';
import { checkArray, checkChoice, checkNumber, checkObject } from '../guard/read';
import { RENDER_SURFACE_SCHEME, type RenderSurfaceV1 } from '../program/surface';
import { hashCanonical, type Sha256 } from '../kernel/canonical';
import { checkHash, checkId, checkPcmDescriptor, JOB_ID, RENDER_ID } from './records';
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
 * Kodlanmış dosyanın çözülmüş kare sayısı kaynak PCM'den bu kadar sapabilir:
 * Vorbis'in uzun blok boyutu 2048 örnektir; çözücü dosya sonunu en çok bir
 * blok kadar kırpar ya da doldurur. Gerçek yayınlarda ölçülen sapma ≤128'dir;
 * bunun üstü kaynak PCM'den başka bir sesin kodlandığını gösterir.
 */
export const DECODE_FRAME_SLACK = 2048;

type ParamObject = ReturnType<typeof checkObject>;
type PcmScalars = ReturnType<typeof checkPcmDescriptor>;

function checkText(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 512) {
    throw new AudioParamError(path, 'type', 'boş olmayan metin olmalı', value);
  }
  return value;
}

function checkFlag(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') throw new AudioParamError(path, 'type', 'boolean olmalı', value);
  return value;
}

/**
 * Yapıyı ve iç tutarlılığı doğrular: gömülü belgelerin özeti kayıtlı özete
 * eşit olmalı, politika kararı `pass` ve ihlalsiz olmalı — başarısız bir
 * publish'i "başarılı" diye anlatan manifest yazılamaz. Her zorunlu alan tip,
 * enum, aralık ve varlık denetimine girer; PCM betimi ile kodlanmış rapor ve
 * yerleşim kaydı birbiriyle çelişemez. Diskteki dosya ve bağımsız render ile
 * karşılaştırma `verifyManifest` işidir.
 */
export function validateManifest(value: unknown): AudioAssetManifestV1 {
  const o = checkObject(value, '', TOP_KEYS);
  if (o.schema !== ASSET_MANIFEST_SCHEMA) {
    throw new AudioParamError('schema', 'type', ASSET_MANIFEST_SCHEMA, o.schema);
  }
  checkText(o.assetId, 'assetId');
  validateAsset(o.asset);
  const briefDocument = validateEmbeddedDocuments(o);
  const pcm = validateRender(o.render);
  const encoder = validateEncoder(o.encoder);
  validateAnalysis(o.analysis, pcm);
  validatePolicy(o.policy);
  validateJob(o.job);
  validateEngine(o.engine);
  validateEncoding(o.encoding, encoder);
  if (o.layout !== undefined) validateLayout(o.layout, pcm);
  if (o.sources !== undefined) validateSources(o.sources);
  if (o.seam !== undefined) validateSeam(o.seam);
  if (o.derivation !== undefined) validateDerivation(o.derivation);
  validateIntegration(o.integration);
  validateBriefChannels(briefDocument, pcm);
  return value as AudioAssetManifestV1;
}

function validateAsset(value: unknown): void {
  const asset = checkObject(value, 'asset', ['path', 'format', 'bytes', 'encodedHash']);
  checkText(asset.path, 'asset.path');
  checkChoice(asset.format, 'asset.format', ['ogg-vorbis'] as const);
  checkNumber(asset.bytes, 'asset.bytes', { min: 1, integer: true });
  checkHash(asset.encodedHash, 'asset.encodedHash');
}

/** Gömülü brief ve program belgesi kayıtlı özete eşit olmalı; brief belgesini döndürür. */
function validateEmbeddedDocuments(o: ParamObject): ParamObject {
  let briefDocument: ParamObject | null = null;
  for (const key of ['brief', 'program'] as const) {
    const doc = checkObject(
      o[key],
      key,
      key === 'brief' ? ['schema', 'kind', 'hash', 'document'] : ['schema', 'hash', 'document'],
    );
    if (key === 'brief') {
      checkChoice(doc.schema, 'brief.schema', ['AudioBriefV1'] as const);
      checkChoice(doc.kind, 'brief.kind', ['acoustic', 'music'] as const);
    } else {
      checkChoice(doc.schema, 'program.schema', [
        'AcousticProgramV1',
        'MusicStemProgramV1',
      ] as const);
    }
    const hash = checkHash(doc.hash, `${key}.hash`);
    if (hashCanonical(doc.document) !== hash) {
      throw new AudioParamError(
        `${key}.document`,
        'combination',
        'gömülü belge kayıtlı özete uymuyor',
        hash,
      );
    }
    if (key === 'brief') {
      briefDocument = checkObject(
        doc.document,
        'brief.document',
        Object.keys((doc.document as object) ?? {}),
      );
    }
  }
  return briefDocument as ParamObject;
}

function validateRender(value: unknown): PcmScalars {
  const render = checkObject(value, 'render', ['renderId', 'seed', 'rendererVersion', 'pcm']);
  checkId(render.renderId, 'render.renderId', RENDER_ID);
  checkNumber(render.seed, 'render.seed', { min: 0, max: 0xffff_ffff, integer: true });
  checkNumber(render.rendererVersion, 'render.rendererVersion', { min: 1, integer: true });
  const pcm = checkPcmDescriptor(render.pcm, 'render.pcm', [
    'hash',
    'format',
    'sampleRate',
    'channels',
    'frames',
  ]);
  checkChoice((render.pcm as ParamObject).format, 'render.pcm.format', [
    'f32le-interleaved-clamped',
  ] as const);
  return pcm;
}

function validateEncoder(value: unknown): ParamObject {
  const encoder = checkObject(value, 'encoder', [
    'tool',
    'version',
    'libraries',
    'codec',
    'quality',
    'arguments',
    'unreported',
    'fingerprint',
  ]);
  checkChoice(encoder.tool, 'encoder.tool', ['ffmpeg'] as const);
  checkText(encoder.version, 'encoder.version');
  checkText(encoder.codec, 'encoder.codec');
  checkNumber(encoder.quality, 'encoder.quality', { min: -1, max: 10 });
  const libraries = checkObject(
    encoder.libraries,
    'encoder.libraries',
    Object.keys((encoder.libraries as object) ?? {}),
  );
  for (const [name, version] of Object.entries(libraries)) {
    checkText(version, `encoder.libraries.${name}`);
  }
  for (const key of ['arguments', 'unreported'] as const) {
    checkArray(encoder[key], `encoder.${key}`).forEach((item, index) =>
      checkText(item, `encoder.${key}[${index}]`),
    );
  }
  const { fingerprint, ...toolchain } = encoder;
  if (hashCanonical(toolchain) !== checkHash(fingerprint, 'encoder.fingerprint')) {
    throw new AudioParamError(
      'encoder.fingerprint',
      'combination',
      'araç zinciri alanlarının özeti değil',
      fingerprint,
    );
  }
  return encoder;
}

/**
 * Kodlanmış rapor kodek SONRASI ölçülür ve kendi biçimi PCM betimiyle
 * çelişemez: oran ve kanal eşit, kare sayısı bir Vorbis bloğu içinde,
 * süre kareden türer.
 */
function validateAnalysis(value: unknown, pcm: PcmScalars): void {
  const analysis = checkObject(value, 'analysis', [
    'analyzerVersion',
    'sourceRecordHash',
    'encoded',
  ]);
  checkNumber(analysis.analyzerVersion, 'analysis.analyzerVersion', { min: 1, integer: true });
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
  const format = checkObject(encoded.format, 'analysis.encoded.format', [
    'sampleRate',
    'channels',
    'frames',
    'durationSeconds',
  ]);
  const sampleRate = checkNumber(format.sampleRate, 'analysis.encoded.format.sampleRate', {
    min: 8000,
    max: 384000,
    integer: true,
  });
  const channels = checkNumber(format.channels, 'analysis.encoded.format.channels', {
    min: 1,
    max: 2,
    integer: true,
  });
  const frames = checkNumber(format.frames, 'analysis.encoded.format.frames', {
    min: 1,
    integer: true,
  });
  const duration = checkNumber(format.durationSeconds, 'analysis.encoded.format.durationSeconds', {
    above: 0,
  });
  if (sampleRate !== pcm.sampleRate || channels !== pcm.channels) {
    throw new AudioParamError(
      'analysis.encoded.format',
      'combination',
      `kodlanmış rapor PCM betimiyle aynı oran/kanal olmalı (${pcm.sampleRate} Hz, ${pcm.channels} kanal)`,
      `${sampleRate} Hz, ${channels} kanal`,
    );
  }
  if (Math.abs(frames - pcm.frames) > DECODE_FRAME_SLACK) {
    throw new AudioParamError(
      'analysis.encoded.format.frames',
      'combination',
      `kodlanmış kare sayısı PCM'den en çok ${DECODE_FRAME_SLACK} kare sapabilir (PCM ${pcm.frames})`,
      frames,
    );
  }
  if (Math.abs(duration - frames / sampleRate) > 1e-6) {
    throw new AudioParamError(
      'analysis.encoded.format.durationSeconds',
      'combination',
      'süre kare sayısı ve orandan türemeli',
      duration,
    );
  }
}

function validatePolicy(value: unknown): void {
  const policy = checkObject(value, 'policy', [
    'assetClass',
    'policyVersion',
    'verdict',
    'violations',
  ]);
  checkChoice(
    policy.assetClass,
    'policy.assetClass',
    Object.keys(ASSET_CLASS_POLICIES.classes) as AssetClass[],
  );
  checkNumber(policy.policyVersion, 'policy.policyVersion', { min: 1, integer: true });
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
}

function validateJob(value: unknown): void {
  const job = checkObject(value, 'job', ['jobId', 'protocolVersion', 'path']);
  checkId(job.jobId, 'job.jobId', JOB_ID);
  checkNumber(job.protocolVersion, 'job.protocolVersion', { min: 1, integer: true });
  checkText(job.path, 'job.path');
}

function validateEngine(value: unknown): void {
  const engine = checkObject(value, 'engine', [
    'package',
    'packageVersion',
    'rendererVersion',
    'registryHash',
    'renderSurface',
    'sourceCommit',
    'sourceTreeDirty',
    'runtime',
  ]);
  checkText(engine.package, 'engine.package');
  checkNumber(engine.rendererVersion, 'engine.rendererVersion', { min: 1, integer: true });
  checkHash(engine.registryHash, 'engine.registryHash');
  const runtime = checkObject(engine.runtime, 'engine.runtime', ['node']);
  checkText(runtime.node, 'engine.runtime.node');
  if (engine.renderSurface !== undefined) validateRenderSurface(engine.renderSurface);
}

function validateEncoding(value: unknown, encoder: ParamObject): void {
  if (value === undefined) return;
  const encoding = checkObject(value, 'encoding', ['scheme', 'policyHash', 'quality']);
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

function validateSeam(value: unknown): void {
  const seam = checkObject(value, 'seam', [
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

function validateDerivation(value: unknown): void {
  const d = checkObject(value, 'derivation', ['scheme', 'source', 'profile', 'cues']);
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

function validateIntegration(value: unknown): void {
  const integration = checkObject(value, 'integration', [
    'package',
    'targetKind',
    'runtimeKey',
    'loop',
    'runtimeDeclaration',
  ]);
  checkText(integration.package, 'integration.package');
  checkChoice(integration.targetKind, 'integration.targetKind', ['reference', 'game'] as const);
  for (const key of ['runtimeKey', 'runtimeDeclaration'] as const) {
    if (integration[key] !== null) checkText(integration[key], `integration.${key}`);
  }
  checkFlag(integration.loop, 'integration.loop');
}

/** Gömülü brief kanal sayısı beyan ediyorsa kaydedilen PCM'in kanal sayısıyla aynı olmalı. */
function validateBriefChannels(brief: ParamObject, pcm: PcmScalars): void {
  if (brief.channels !== undefined && brief.channels !== pcm.channels) {
    throw new AudioParamError(
      'brief.document.channels',
      'combination',
      `brief kanal sayısı PCM betimiyle aynı olmalı (${pcm.channels})`,
      brief.channels,
    );
  }
}

function validateLayout(value: unknown, pcm: PcmScalars): void {
  const o = checkObject(value, 'layout', ['scheme', 'placement', 'channels', 'image']);
  checkChoice(o.scheme, 'layout.scheme', [LAYOUT_POLICY.scheme] as const);
  checkChoice(o.placement, 'layout.placement', PLACEMENTS);
  const channels = checkNumber(o.channels, 'layout.channels', { min: 1, max: 2, integer: true });
  if (channels !== pcm.channels) {
    throw new AudioParamError(
      'layout.channels',
      'combination',
      `yerleşim kanal sayısı PCM betimiyle aynı olmalı (${pcm.channels})`,
      channels,
    );
  }
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

/** PCM'in kaydedilen ya da ölçülen skalar betimi. */
export interface PcmShape {
  readonly sampleRate: number;
  readonly channels: number;
  readonly frames: number;
}

/**
 * Manifestin PCM betimi ile BAĞIMSIZ yeniden render'ın gerçek betimi
 * aynı olmalı. PCM özeti oran/kanal/kare başlığını da kapsar, ama kaydedilen
 * skalarlar özetten ayrı yazıldığı için ayrıca karşılaştırılır.
 */
export function pcmMetadataIssues(recorded: PcmShape, actual: PcmShape): string[] {
  const issues: string[] = [];
  for (const key of ['sampleRate', 'channels', 'frames'] as const) {
    if (recorded[key] !== actual[key]) {
      issues.push(`${key} kayıt ${recorded[key]}, render ${actual[key]}`);
    }
  }
  return issues;
}

/**
 * Diskteki kodlanmış dosyanın çözülmüş betimi kaynak PCM'den sapamaz: oran ve
 * kanal eşit, kare sayısı `DECODE_FRAME_SLACK` içinde. Bayt özeti tutan ama
 * başka uzunlukta/oranda bir sesi kodlayan kayıt bu yoldan düşer.
 */
export function encodedFormatIssues(pcm: PcmShape, decoded: PcmShape): string[] {
  const issues: string[] = [];
  if (decoded.sampleRate !== pcm.sampleRate) {
    issues.push(`oran PCM ${pcm.sampleRate}, çözülen ${decoded.sampleRate}`);
  }
  if (decoded.channels !== pcm.channels) {
    issues.push(`kanal PCM ${pcm.channels}, çözülen ${decoded.channels}`);
  }
  if (Math.abs(decoded.frames - pcm.frames) > DECODE_FRAME_SLACK) {
    issues.push(`kare PCM ${pcm.frames}, çözülen ${decoded.frames} (izin ±${DECODE_FRAME_SLACK})`);
  }
  return issues;
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
