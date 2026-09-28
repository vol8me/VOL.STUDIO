import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { evaluateCharacterPolicy } from '../analysis/character';
import {
  ASSET_CLASS_POLICIES,
  classifyAssetPath,
  evaluateAssetPolicy,
  type AssetClass,
} from '../analysis/assetQa';
import {
  analyzeAudio,
  ANALYZER_VERSION,
  measurementOf,
  type AudioAnalysisReportV1,
} from '../analysis/report';
import {
  layoutViolations,
  LAYOUT_POLICY,
  measureStereoImage,
  placementOf,
  type Placement,
} from '../analysis/layout';
import { validateBrief, type AudioBriefV1 } from '../program/brief';
import { recordedInstrumentSurface } from '../music/instrumentResolve';
import { instrumentRegistryHash } from '../music/instruments';
import { compareSurface, registryRenderHash } from '../program/surface';
import { REFERENCE_MIX_ID, validateMusicStemProgram } from '../music/stem';
import {
  kindOfProgramSchema,
  PROGRAM_SCHEMAS,
  surfaceForKind,
  renderForKind,
  RENDERER_VERSIONS,
  type JobKind,
  type KindRender,
} from './kinds';
import { writeOgg } from '../writer';
import {
  canonicalJson,
  hashCanonical,
  hashPcm,
  prettyCanonicalJson,
  sha256Bytes,
  type Sha256,
} from './canonical';
import { ProtocolError } from './errors';
import { readJsonFile, resolveInside, withLock, writeFileAtomic } from './fs';
import {
  advance,
  artifactFile,
  jobDir,
  jobLabel,
  loadJob,
  saveJob,
  type JobLocation,
} from './location';
import {
  ASSET_MANIFEST_SCHEMA,
  classifyAssetChange,
  validateManifest,
  type AssetChange,
  type AudioAssetManifestV1,
} from './manifest';
import {
  analysisPath,
  asProtocol,
  PROTOCOL_VERSION,
  recordQuality,
  renderPath,
  validateAnalysisRecord,
  validateRenderRecord,
  validateSelection,
} from './records';
import { measureLoopSeam, type LoopSeamV1 } from '../analysis/seam';
import { repoSampleResolver } from './samples';
import { sameSources, sourcesOf } from './sources';
import { jobStatus } from './status';
import { derivationCheck, derivationOf } from './derivation';
import { ENCODE_POLICY, encodePolicyHash, encodeQualityOf } from './encodeProfiles';
import { readOrigin } from './origin';
import { decodeWithFfmpeg, readEncoderToolchain } from './toolchain';
import { resolveDestination, surveyTargets, type ResolvedDestination } from './targets';

const PACKAGE_NAME = '@volstudio/audio-synth';

function packageVersion(): string {
  const manifest = JSON.parse(
    readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
  ) as { version: string };
  return manifest.version;
}

function sourceRevision(repoRoot: string): { commit: string | null; dirty: boolean | null } {
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' });
  if (head.status !== 0) return { commit: null, dirty: null };
  const status = spawnSync('git', ['status', '--porcelain', '--untracked-files=no'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  return {
    commit: head.stdout.trim(),
    dirty: status.status === 0 ? status.stdout.trim().length > 0 : null,
  };
}

/**
 * Motor yüzeyinin sürüm etiketi: registry'nin RENDER izdüşümünün özeti.
 * Açıklama ve yoklama metni girmez; programa özgü kanıt `renderSurface`tır.
 */
export function registryHash(): Sha256 {
  return registryRenderHash();
}

/**
 * Asset kimliği. Müzik bir brief'ten BİRDEN ÇOK asset üretir (stem'ler ve
 * referans mix); kimlik brief'in kimliğine stem'i ekler, yoksa iki stem aynı
 * asset sayılır ve üzerine yazma koruması yanlış çalışır.
 */
/**
 * Politika sınıfı yol sınıfından AYRILABİLİR: bir müzik stem'i yola göre
 * `music`tir ama tek başına çalınmaz, bu yüzden mix'in yükseklik aralığına
 * tabi değildir (bkz. `music-stem` politikası).
 */
function policyClassOf(kind: JobKind, programDocument: unknown, pathClass: AssetClass): AssetClass {
  if (kind !== 'music') return pathClass;
  return validateMusicStemProgram(programDocument).stem === REFERENCE_MIX_ID
    ? pathClass
    : 'music-stem';
}

function assetIdOf(kind: JobKind, brief: AudioBriefV1, programDocument: unknown): string {
  if (kind !== 'music') return brief.id;
  const stem = validateMusicStemProgram(programDocument).stem;
  return stem === REFERENCE_MIX_ID ? `${brief.id}-mix` : `${brief.id}-${stem}`;
}

interface EncodedCandidate {
  readonly file: string;
  readonly bytes: Buffer;
  readonly hash: Sha256;
  readonly report: AudioAnalysisReportV1;
  readonly decoded: { readonly channels: Float32Array[]; readonly sampleRate: number };
}

/** Kodla → baytları özetle → FFmpeg ile ÇÖZ → kodek sonrası ölç. Dosya çağıranındır. */
function encodeAndMeasure(file: string, rendered: KindRender, quality: number): EncodedCandidate {
  writeOgg(file, rendered, { quality });
  const bytes = readFileSync(file);
  const decoded = decodeWithFfmpeg(file, 'staging');
  return {
    file,
    bytes,
    hash: sha256Bytes(bytes),
    report: analyzeAudio(decoded.channels, decoded.sampleRate, 'decoded-encoded'),
    decoded,
  };
}

/** Akustik brief'in beyan ettiği ya da sınıf varsayılanı yerleşim; müzik her zaman zemin. */
function placementFor(brief: AudioBriefV1, assetClass: AssetClass): Placement {
  return brief.kind === 'acoustic' ? placementOf(assetClass, brief.placement) : 'bed';
}

/** Akustik loop asset'i kodek SONRASI dikiş QA'sından geçmeli; diğerlerinde ölçüm yok. */
function loopSeamOf(brief: AudioBriefV1, decoded: EncodedCandidate['decoded']): LoopSeamV1 | null {
  if (brief.kind !== 'acoustic' || brief.loop !== true) return null;
  return measureLoopSeam(decoded.channels, decoded.sampleRate);
}

function checkRuntime(
  destination: ResolvedDestination,
  brief: AudioBriefV1,
  rendered: KindRender,
  loop: boolean,
): void {
  const runtime = destination.target.runtime;
  if (!runtime) return;
  const where = runtime.declaredIn;
  if (!runtime.formats.includes('ogg'))
    throw new ProtocolError('destination', 'hedef OGG çalmıyor', where);
  if (!runtime.sampleRates.includes(rendered.sampleRate)) {
    throw new ProtocolError('destination', `hedef ${rendered.sampleRate} Hz beyan etmiyor`, where);
  }
  if (!runtime.channels.includes(brief.channels))
    throw new ProtocolError('destination', `hedef ${brief.channels} kanal beyan etmiyor`, where);
  if (loop && !runtime.loop)
    throw new ProtocolError('destination', 'hedef loop beyan etmiyor', where);
}

/** Var olan asset'i yalnız AYNI job'un aynı asset'i için yayımlanmış bir manifest sahiplenebilir. */
function guardOverwrite(
  assetFile: string,
  manifestFile: string,
  assetId: string,
  jobId: string,
  label: string,
): void {
  const hasAsset = existsSync(assetFile);
  const hasManifest = existsSync(manifestFile);
  if (!hasAsset && !hasManifest) return;
  if (!hasManifest)
    throw new ProtocolError(
      'overwrite',
      'hedefte manifest’siz bir dosya var; üzerine yazılmaz',
      label,
    );
  let owner: AudioAssetManifestV1;
  try {
    owner = validateManifest(JSON.parse(readFileSync(manifestFile, 'utf8')));
  } catch {
    throw new ProtocolError('overwrite', 'hedefteki manifest okunamıyor; üzerine yazılmaz', label);
  }
  if (owner.assetId !== assetId || owner.job.jobId !== jobId) {
    throw new ProtocolError(
      'overwrite',
      `hedef ${owner.job.jobId}/${owner.assetId} işine ait`,
      label,
    );
  }
}

export interface PublishOutcome {
  readonly manifestPath: string;
  readonly manifest: AudioAssetManifestV1;
}

/**
 * TEK kanonik publish kapısı. Sıra: durum zinciri → belgeler → hedef/yol →
 * yeniden render + PCM kimliği → aşamalı (staging) kodlama → kodek sonrası
 * analiz + sınıf politikası → manifest doğrulaması → iki atomik rename.
 * Herhangi bir adım düşerse asset de manifest de yazılmaz; staging silinir.
 */
export function publishJob(loc: JobLocation): PublishOutcome {
  return withLock(jobDir(loc), jobLabel(loc), () => {
    const status = jobStatus(loc);
    const sel = status.artifacts.selection;
    if (sel.state !== 'valid') {
      throw new ProtocolError(
        'stale',
        `publish reddedildi: selection ${sel.state}${sel.reason ? ` (${sel.reason})` : ''}`,
        jobLabel(loc),
      );
    }
    const origin = status.artifacts.origin;
    if (origin.state === 'stale' || origin.state === 'corrupt') {
      throw new ProtocolError(
        'stale',
        `publish reddedildi: origin ${origin.state} (${origin.reason ?? ''})`,
        jobLabel(loc),
      );
    }
    const job = loadJob(loc);
    const read = (rel: string) => readJsonFile(artifactFile(loc, rel), rel);
    const brief = asProtocol('brief.json', () => validateBrief(read('brief.json')));
    const programDocument = read('program.json');
    const programHash = hashCanonical(programDocument);
    const selection = validateSelection(read('selection.json'));
    const record = validateRenderRecord(read(renderPath(selection.renderId)));
    if (recordQuality(record) !== 'final') {
      throw new ProtocolError(
        'policy',
        `publish reddedildi: seçilen render ${selection.renderId} taslak kalitede; ` +
          'yayın yalnız nihai render kabul eder (render --draft olmadan yeniden render edin)',
        jobLabel(loc),
      );
    }
    const analysis = validateAnalysisRecord(read(analysisPath(selection.renderId)));
    if (
      record.programHash !== programHash ||
      selection.pcmHash !== record.pcm.hash ||
      analysis.pcmHash !== record.pcm.hash
    ) {
      throw new ProtocolError(
        'identity',
        'program/render/analiz/seçim özet zinciri tutarsız',
        jobLabel(loc),
      );
    }

    const destination = resolveDestination(
      surveyTargets(loc.repoRoot),
      job.target.package,
      job.target.asset,
    );
    const pathClass = classifyAssetPath(destination.withinRoot);
    if (pathClass !== brief.assetClass) {
      throw new ProtocolError(
        'destination',
        `yol sınıfı ${pathClass}, brief ${brief.assetClass} diyor`,
        destination.assetPath,
      );
    }
    const assetClass = policyClassOf(job.kind, programDocument, pathClass);
    const rendered = renderForKind(job.kind, programDocument, {
      seed: record.seed,
      samples: repoSampleResolver(loc.repoRoot),
      quality: 'final',
    });
    const pcmHash = hashPcm(rendered.channels, rendered.sampleRate);
    if (pcmHash !== record.pcm.hash) {
      throw new ProtocolError(
        'identity',
        `yeniden render PCM özeti kayıttan farklı (${pcmHash})`,
        renderPath(record.renderId),
      );
    }
    checkRuntime(destination, brief, rendered, job.target.integration.loop);

    const assetFile = resolveInside(loc.repoRoot, destination.assetPath, 'asset');
    const manifestFile = resolveInside(loc.repoRoot, destination.manifestPath, 'manifest');
    const assetId = assetIdOf(job.kind, brief, programDocument);
    guardOverwrite(assetFile, manifestFile, assetId, job.jobId, destination.assetPath);

    const quality = encodeQualityOf(assetClass);
    const toolchain = readEncoderToolchain(quality);
    const revision = sourceRevision(loc.repoRoot);
    mkdirSync(dirname(assetFile), { recursive: true });
    const staging = join(dirname(assetFile), `.tmp-publish-${process.pid}-${Date.now()}.ogg`);
    try {
      const encoded = encodeAndMeasure(staging, rendered, quality);
      const verdict = evaluateAssetPolicy(measurementOf(encoded.report), assetClass);
      if (verdict.violations.length > 0) {
        throw new ProtocolError(
          'policy',
          `kodek sonrası ${assetClass} politikası: ${verdict.violations.join('; ')}`,
          destination.assetPath,
        );
      }
      const placement = placementFor(brief, assetClass);
      if (brief.character) {
        const character = evaluateCharacterPolicy(
          encoded.decoded.channels,
          encoded.decoded.sampleRate,
          encoded.report,
          brief.character,
        );
        if (!character.pass) {
          throw new ProtocolError(
            'policy',
            `kodek sonrası karakter: ${character.violations.join('; ')}`,
            destination.assetPath,
          );
        }
      }
      const image = measureStereoImage(encoded.decoded.channels, encoded.decoded.sampleRate);
      const layoutIssues = layoutViolations(
        assetClass,
        placement,
        encoded.decoded.channels.length,
        image,
      );
      if (layoutIssues.length > 0) {
        throw new ProtocolError(
          'policy',
          `kodek sonrası yerleşim (${placement}): ${layoutIssues.join('; ')}`,
          destination.assetPath,
        );
      }
      const origin = readOrigin(loc)?.source;
      const derivation =
        origin?.kind === 'treatment'
          ? derivationOf(loc.repoRoot, programDocument, origin, encoded.decoded)
          : null;
      const seam = loopSeamOf(brief, encoded.decoded);
      if (seam && !seam.pass) {
        throw new ProtocolError(
          'policy',
          `loop dikişi: ${seam.reasons.join('; ')}`,
          destination.assetPath,
        );
      }
      const sources = sourcesOf(job.kind, programDocument, loc.repoRoot);
      const manifest: AudioAssetManifestV1 = {
        schema: ASSET_MANIFEST_SCHEMA,
        assetId,
        asset: {
          path: destination.assetPath,
          format: 'ogg-vorbis',
          bytes: encoded.bytes.length,
          encodedHash: encoded.hash,
        },
        job: { jobId: job.jobId, protocolVersion: PROTOCOL_VERSION, path: jobLabel(loc) },
        brief: {
          schema: 'AudioBriefV1',
          kind: brief.kind,
          hash: hashCanonical(brief),
          document: brief,
        },
        program: {
          schema: PROGRAM_SCHEMAS[job.kind] as 'AcousticProgramV1' | 'MusicStemProgramV1',
          hash: programHash,
          document: programDocument,
        },
        render: {
          renderId: record.renderId,
          seed: record.seed,
          rendererVersion: record.rendererVersion,
          pcm: {
            hash: pcmHash,
            format: 'f32le-interleaved-clamped',
            sampleRate: record.pcm.sampleRate,
            channels: record.pcm.channels,
            frames: record.pcm.frames,
          },
        },
        engine: {
          package: PACKAGE_NAME,
          packageVersion: packageVersion(),
          rendererVersion: RENDERER_VERSIONS[job.kind],
          registryHash: job.kind === 'music' ? instrumentRegistryHash() : registryHash(),
          renderSurface: surfaceForKind(job.kind, programDocument),
          sourceCommit: revision.commit,
          sourceTreeDirty: revision.dirty,
          runtime: { node: process.version },
        },
        encoder: toolchain,
        encoding: { scheme: ENCODE_POLICY.scheme, policyHash: encodePolicyHash(), quality },
        analysis: {
          analyzerVersion: ANALYZER_VERSION,
          sourceRecordHash: job.artifacts.analyses[record.renderId].hash,
          encoded: encoded.report,
        },
        policy: {
          assetClass,
          policyVersion: ASSET_CLASS_POLICIES.version,
          verdict: 'pass',
          violations: [],
        },
        integration: {
          package: destination.target.packageName,
          targetKind: destination.target.kind,
          runtimeKey: job.target.integration.runtimeKey,
          loop: job.target.integration.loop,
          runtimeDeclaration: destination.target.runtime?.declaredIn ?? null,
        },
        layout: {
          scheme: LAYOUT_POLICY.scheme,
          placement,
          channels: encoded.decoded.channels.length,
          image,
        },
        ...(sources ? { sources } : {}),
        ...(seam ? { seam } : {}),
        ...(derivation ? { derivation } : {}),
      };
      asProtocol('manifest', () => validateManifest(JSON.parse(canonicalJson(manifest))));
      renameSync(staging, assetFile);
      writeFileAtomic(manifestFile, prettyCanonicalJson(manifest));
      saveJob(
        loc,
        advance(job, 'published', {
          publication: { path: destination.manifestPath, hash: hashCanonical(manifest) },
        }),
      );
      return { manifestPath: destination.manifestPath, manifest };
    } finally {
      rmSync(staging, { force: true });
    }
  });
}

/**
 * Kayıtlı render yüzeyini bugünkü registry ile düğüm düğüm karşılaştırır.
 * Bağlayıcı kanıt PCM kimliğidir; bu denetim onu AÇIKLAR: PCM değiştiyse
 * hangi düğümün sözleşmesinin kaydığını adıyla söyler, değişmediyse
 * kaymanın bu programa dokunmadığını belgeler.
 */
function surfaceCheck(manifest: AudioAssetManifestV1, pcmSame: boolean): VerificationCheck {
  const recorded = manifest.engine.renderSurface;
  if (!recorded) {
    return {
      name: 'render-surface',
      ok: true,
      detail: 'kayıt yok (bu alandan önce yayımlanmış manifest)',
    };
  }
  const instruments = (recorded.instruments ?? []).flatMap((instrument) => {
    try {
      return [recordedInstrumentSurface(instrument.id)];
    } catch {
      return [];
    }
  });
  const changes = compareSurface(recorded, instruments);
  if (changes.length === 0) {
    return { name: 'render-surface', ok: true, detail: `${recorded.nodes.length} düğüm aynı` };
  }
  const listed = changes.map((c) => `${c.id} (${c.detail})`).join('; ');
  return {
    name: 'render-surface',
    ok: true,
    detail: pcmSame
      ? `yüzey kaydı ama bu programın PCM'i aynı (bilgi): ${listed}`
      : `PCM farkını açıklayabilecek düğümler: ${listed}`,
  };
}

/**
 * Kayıtlı kodlama kalitesi sınıfın BUGÜNKÜ profiliyle aynı mı (bilgi).
 * Yeniden üretim kayıtlı kaliteyle sınanır; profil değiştiyse ses de dosya
 * da geçerlidir, yalnız yeniden yayın önerilir.
 */
function profileCheck(manifest: AudioAssetManifestV1): VerificationCheck {
  const recorded = manifest.encoder.quality;
  const current = encodeQualityOf(manifest.policy.assetClass);
  return {
    name: 'encode-profile',
    ok: true,
    detail:
      recorded === current
        ? `q${recorded} = ${manifest.policy.assetClass} profili`
        : `${manifest.policy.assetClass} profili q${current}, kayıt q${recorded}: yeniden publish önerilir (bilgi)`,
  };
}

function decodeOrNull(file: string, label: string) {
  try {
    return decodeWithFfmpeg(file, label);
  } catch (error) {
    if (error instanceof ProtocolError) return null;
    throw error;
  }
}

export interface VerificationCheck {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
}

export interface AssetVerificationV1 {
  readonly schema: 'AudioAssetVerificationV1';
  readonly manifest: string;
  readonly asset: string;
  readonly change: AssetChange;
  readonly recorded: {
    readonly pcmHash: Sha256;
    readonly encodedHash: Sha256;
    readonly encoderFingerprint: Sha256;
  };
  readonly current: {
    readonly pcmHash: Sha256;
    readonly encodedHash: Sha256;
    readonly encoderFingerprint: Sha256;
  };
  readonly checks: readonly VerificationCheck[];
  readonly ok: boolean;
}

/**
 * Yayımlanmış bir asset'i YALNIZ manifest'inden doğrular: gömülü program
 * yeniden render edilir (PCM kimliği), repo'daki dosya çözülüp politikaya
 * tabi tutulur, güncel araç zinciriyle yeniden kodlanıp fark SINIFLANIR.
 */
export function verifyManifest(repoRoot: string, manifestPath: string): AssetVerificationV1 {
  const manifest = asProtocol(manifestPath, () =>
    validateManifest(readJsonFile(resolveInside(repoRoot, manifestPath, 'manifest'), manifestPath)),
  );
  const toolchain = readEncoderToolchain(manifest.encoder.quality);
  const checks: VerificationCheck[] = [];
  const assetFile = resolveInside(repoRoot, manifest.asset.path, 'asset');
  const bytes = existsSync(assetFile) ? readFileSync(assetFile) : null;
  const assetHash = bytes ? sha256Bytes(bytes) : null;
  checks.push({
    name: 'asset-bytes',
    ok: assetHash === manifest.asset.encodedHash,
    detail: assetHash ?? 'dosya yok',
  });

  const kind = kindOfProgramSchema(manifest.program.schema, manifestPath);
  const rendered = renderForKind(kind, manifest.program.document, {
    seed: manifest.render.seed,
    samples: repoSampleResolver(repoRoot),
    quality: 'final',
    cache: null,
  });
  const pcmHash = hashPcm(rendered.channels, rendered.sampleRate);
  checks.push({ name: 'pcm-identity', ok: pcmHash === manifest.render.pcm.hash, detail: pcmHash });
  checks.push(surfaceCheck(manifest, pcmHash === manifest.render.pcm.hash));

  const decoded = bytes ? decodeOrNull(assetFile, manifest.asset.path) : null;
  if (!decoded) {
    checks.push({ name: 'encoded-policy', ok: false, detail: 'asset çözülemedi' });
  } else {
    const report = analyzeAudio(decoded.channels, decoded.sampleRate, 'decoded-encoded');
    const verdict = evaluateAssetPolicy(measurementOf(report), manifest.policy.assetClass);
    const brief = validateBrief(manifest.brief.document);
    if (brief.character) {
      const character = evaluateCharacterPolicy(
        decoded.channels,
        decoded.sampleRate,
        report,
        brief.character,
      );
      checks.push({
        name: 'encoded-character',
        ok: character.pass,
        detail: character.violations.join('; ') || 'geçti',
      });
    }
    checks.push({
      name: 'encoded-policy',
      ok: verdict.violations.length === 0,
      detail: verdict.violations.join('; ') || 'geçti',
    });
    const same = canonicalJson(report) === canonicalJson(manifest.analysis.encoded);
    checks.push({
      name: 'encoded-analysis',
      ok: true,
      detail: same ? 'kayıtla aynı' : 'çözücü çıktısı kayıttan farklı (bilgi)',
    });
    if (manifest.layout) {
      const issues = layoutViolations(
        manifest.policy.assetClass,
        manifest.layout.placement,
        decoded.channels.length,
        measureStereoImage(decoded.channels, decoded.sampleRate),
      );
      checks.push({
        name: 'layout',
        ok: issues.length === 0,
        detail: issues.join('; ') || 'geçti',
      });
    }
    if (manifest.seam) {
      const seam = measureLoopSeam(decoded.channels, decoded.sampleRate);
      checks.push({
        name: 'loop-seam',
        ok: seam.pass,
        detail: seam.reasons.join('; ') || 'dikişsiz',
      });
    }
  }
  const derivation = derivationCheck(repoRoot, manifest);
  if (derivation) checks.push({ name: 'derivation', ...derivation });
  if (manifest.sources || kind === 'acoustic') {
    const current = sourcesOf(kind, manifest.program.document, repoRoot);
    if (manifest.sources || current) {
      const ok = sameSources(manifest.sources, current);
      checks.push({
        name: 'sources',
        ok,
        detail: ok ? 'kayıt provenance’ı aynı' : 'kaynak bloğu kütüphaneyle uyuşmuyor',
      });
    }
  }

  const dir = mkdtempSync(join(tmpdir(), 'audio-verify-'));
  let encodedHash: Sha256;
  try {
    encodedHash = encodeAndMeasure(join(dir, 'reencode.ogg'), rendered, toolchain.quality).hash;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  const recorded = {
    pcmHash: manifest.render.pcm.hash,
    encodedHash: manifest.asset.encodedHash,
    encoderFingerprint: manifest.encoder.fingerprint,
  };
  const current = { pcmHash, encodedHash, encoderFingerprint: toolchain.fingerprint };
  const change = classifyAssetChange(recorded, current);
  checks.push(profileCheck(manifest));
  checks.push({
    name: 'reproduction',
    ok: change === 'identical' || change === 'encoder-only',
    detail:
      change === 'encoder-only'
        ? 'ses aynı; yalnız kodlayıcı/araç zinciri farklı — yeniden publish önerilir'
        : change,
  });
  return {
    schema: 'AudioAssetVerificationV1',
    manifest: manifestPath,
    asset: manifest.asset.path,
    change,
    recorded,
    current,
    checks,
    ok: checks.every((c) => c.ok),
  };
}
