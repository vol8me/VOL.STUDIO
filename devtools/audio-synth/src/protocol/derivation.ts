import { existsSync } from 'node:fs';
import { layoutPolicyOf, placementOf } from '../analysis/layout';
import { measureTreatmentCues, type TreatmentCuesV1 } from '../analysis/treatmentCues';
import type { AcousticBriefV1 } from '../program/brief';
import { outputChannels, resolveProgram, type AcousticProgramV1 } from '../program/schema';
import {
  expandTreatment,
  treatmentProfile,
  treatmentProfileHash,
  type TreatmentProfileV1,
} from '../program/treatmentProfiles';
import type { TreatmentV1 } from '../program/treatment';
import { hashCanonical, type Sha256 } from './canonical';
import { ProtocolError } from './errors';
import { readJsonFile, resolveInside } from './fs';
import { renderForKind } from './kinds';
import { validateManifest, type AudioAssetManifestV1 } from './manifest';
import type { TreatmentOriginV1 } from './origin';
import { repoSampleResolver } from './samples';

/**
 * Teslim varyantının kaynağına bağı. Türetilmiş program = kaynak program +
 * `treatment`; `treatment` çıkarılınca kalan belge kaynağın kendisi olmalı
 * ve kaynak manifest'in program özetine eşit olmalıdır. İşleme de profilin
 * kaynağa göre genişletilmesine eşit olmalıdır. Bu üç eşitlik "aynı kaynak
 * kimliği" iddiasının kanıtıdır; manifest onu `derivation` bloğunda taşır.
 */
export const DERIVATION_SCHEME = 'treatment-derivation-v1';
/** Türetilmiş sesin tavanı: kodek sonrası −1 dBTP politikası için 0.5 dB kodek payı. */
export const TREATMENT_CEILING_DBTP = -1.5;

export interface ManifestDerivationV1 {
  readonly scheme: typeof DERIVATION_SCHEME;
  readonly source: {
    readonly manifest: string;
    readonly assetId: string;
    readonly programHash: Sha256;
    readonly pcmHash: Sha256;
  };
  readonly profile: {
    readonly id: string;
    readonly version: number;
    readonly hash: Sha256;
    readonly kind: TreatmentProfileV1['kind'];
    readonly model: Readonly<Record<string, number>>;
  };
  /** Kaynak PCM'i ve türetilmiş (kodek sonrası) sesin yön ölçüleri. */
  readonly cues: { readonly source: TreatmentCuesV1; readonly derived: TreatmentCuesV1 };
}

export function readSourceManifest(repoRoot: string, path: string): AudioAssetManifestV1 {
  const file = resolveInside(repoRoot, path, 'source manifest');
  if (!existsSync(file)) throw new ProtocolError('not-found', 'kaynak manifest yok', path);
  const manifest = validateManifest(readJsonFile(file, path));
  if (manifest.program.schema !== 'AcousticProgramV1' || manifest.brief.kind !== 'acoustic') {
    throw new ProtocolError('invalid', 'teslim varyantı yalnız akustik kaynaktan türer', path);
  }
  if ((manifest.program.document as AcousticProgramV1).treatment !== undefined) {
    throw new ProtocolError('invalid', 'kaynak zaten işlenmiş; türetme işlenmemiş kaynaktan', path);
  }
  return manifest;
}

export function profileOrThrow(id: string): TreatmentProfileV1 {
  const profile = treatmentProfile(id);
  if (!profile) throw new ProtocolError('invalid', `bilinmeyen teslim profili: ${id}`, 'profile');
  return profile;
}

/** Profilin kaynağa göre genişletilmesi: kanal, loop ve yerleşimin mono izni kaynaktan gelir. */
export function expectedTreatment(
  source: AudioAssetManifestV1,
  profile: TreatmentProfileV1,
): TreatmentV1 {
  const brief = source.brief.document as AcousticBriefV1;
  const assetClass = source.policy.assetClass;
  const placement = placementOf(assetClass, brief.placement);
  const program = resolveProgram(source.program.document);
  return expandTreatment(
    profile,
    {
      channels: outputChannels(program),
      loop: program.master.loop !== null,
      monoAllowed: layoutPolicyOf(assetClass).placements[placement]?.includes(1) ?? false,
    },
    TREATMENT_CEILING_DBTP,
  );
}

function withoutTreatment(document: unknown): unknown {
  const { treatment: _treatment, ...source } = document as AcousticProgramV1;
  return source;
}

/** Programın kaynağa + profile bağının üç eşitliği; ilk bozulanı adıyla döner. */
function derivationProblem(
  programDocument: unknown,
  source: AudioAssetManifestV1,
  origin: TreatmentOriginV1,
): string | null {
  if (source.program.hash !== origin.source.programHash)
    return 'kaynak manifest’in programı değişti';
  if (source.render.pcm.hash !== origin.source.pcmHash) return 'kaynak manifest’in PCM’i değişti';
  if (hashCanonical(withoutTreatment(programDocument)) !== origin.source.programHash) {
    return 'işleme dışındaki program kaynağın programı değil';
  }
  const profile = treatmentProfile(origin.profile.id);
  if (!profile || profile.version !== origin.profile.version) {
    return `profil ${origin.profile.id}@${origin.profile.version} katalogda yok`;
  }
  if (treatmentProfileHash(profile) !== origin.profile.hash) return 'profil aynı sürümde değişti';
  const treatment = (programDocument as AcousticProgramV1).treatment;
  if (hashCanonical(treatment) !== hashCanonical(expectedTreatment(source, profile))) {
    return 'işleme katmanı profilin bu kaynağa genişletilmesi değil';
  }
  return null;
}

/** Yayın anında `derivation` bloğu: bağ sınanır, kaynak PCM'i yeniden render edilip ölçülür. */
export function derivationOf(
  repoRoot: string,
  programDocument: unknown,
  origin: TreatmentOriginV1,
  decoded: { readonly channels: Float32Array[]; readonly sampleRate: number },
): ManifestDerivationV1 {
  const source = readSourceManifest(repoRoot, origin.source.manifest);
  const problem = derivationProblem(programDocument, source, origin);
  if (problem)
    throw new ProtocolError('identity', `türetme bağı: ${problem}`, origin.source.manifest);
  const rendered = renderForKind('acoustic', source.program.document, {
    seed: source.render.seed,
    samples: repoSampleResolver(repoRoot),
    quality: 'final',
  });
  const profile = profileOrThrow(origin.profile.id);
  return {
    scheme: DERIVATION_SCHEME,
    source: {
      manifest: origin.source.manifest,
      assetId: source.assetId,
      programHash: source.program.hash,
      pcmHash: source.render.pcm.hash,
    },
    profile: { ...origin.profile, kind: profile.kind, model: profile.model },
    cues: {
      source: measureTreatmentCues(rendered.channels, rendered.sampleRate),
      derived: measureTreatmentCues(decoded.channels, decoded.sampleRate),
    },
  };
}

/** `verify` denetimi: kaynak hâlâ var ve bağ bugünkü katalog ve kaynakla tutarlı. */
export function derivationCheck(
  repoRoot: string,
  manifest: AudioAssetManifestV1,
): { readonly ok: boolean; readonly detail: string } | null {
  const derivation = manifest.derivation;
  if (!derivation) return null;
  let source: AudioAssetManifestV1;
  try {
    source = readSourceManifest(repoRoot, derivation.source.manifest);
  } catch (error) {
    if (error instanceof ProtocolError) return { ok: false, detail: error.message };
    throw error;
  }
  const { id, version, hash } = derivation.profile;
  const problem = derivationProblem(manifest.program.document, source, {
    kind: 'treatment',
    source: { ...derivation.source, seed: source.render.seed },
    profile: { id, version, hash },
  });
  return problem
    ? { ok: false, detail: problem }
    : {
        ok: true,
        detail: `${derivation.source.assetId} + ${derivation.profile.id}@${derivation.profile.version}`,
      };
}
