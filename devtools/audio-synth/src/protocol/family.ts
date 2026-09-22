import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { classifyAssetPath } from '../analysis/assetQa';
import {
  assessFamily,
  DEFAULT_FAMILY_QUALITY_POLICY,
  type SoundFamilyQualityReportV1,
} from '../analysis/family';
import { analyzeAudio, ANALYZER_VERSION } from '../analysis/report';
import { summarizeAudio, type DescriptorSummaryV1 } from '../analysis/summary';
import {
  ANALYSIS_WORK_PER_SAMPLE,
  assertBatchBudget,
  DEFAULT_BATCH_BUDGET,
  SECONDS_PER_WORK_UNIT,
  type BatchEstimate,
} from '../guard/batch';
import { assertRenderBudget } from '../guard/budget';
import {
  BANK_CHOICE_METHOD,
  BANK_LOOKUP_CONTRACT,
  SOUND_FAMILY_BANK_SCHEMA,
  validateBank,
  type BankVariantV1,
  type SoundFamilyBankV1,
} from '../family/bank';
import {
  expandFamily,
  FAMILY_ID,
  familyHash,
  validateFamilyProgram,
  type ExpandedVariant,
  type SoundFamilyProgramV1,
} from '../family/program';
import type { AudioBriefV1 } from '../program/brief';
import { estimateProgramCost, PROGRAM_RENDERER_VERSION, renderProgram } from '../program/render';
import { resolveProgram } from '../program/schema';
import { hashCanonical, hashPcm, prettyCanonicalJson, sha256Bytes, type Sha256 } from './canonical';
import { ProtocolError } from './errors';
import { readJsonFile, resolveInside, withLock, writeFileAtomic } from './fs';
import {
  analyzeCandidate,
  initJob,
  registerBrief,
  renderCandidate,
  selectCandidate,
  storeProgram,
} from './job';
import { loadJob, type JobLocation } from './location';
import { validateManifest, type AudioAssetManifestV1 } from './manifest';
import { PROGRAM_ORIGIN_SCHEMA } from './origin';
import { publishJob, registryHash } from './publish';
import { asProtocol, JOB_ID } from './records';
import { jobStatus } from './status';
import { resolveDestination, surveyTargets, type ResolvedDestination } from './targets';

/**
 * Ses ailesi üretimi ve yayını. Her varyant KENDİ `AudioJobV1`inden geçer
 * (`<familiesRoot>/<familyId>/jobs/<key>`): brief → program (+ köken) →
 * render → analyze → select → publish — aynı kapı, aynı kodek QA'sı, aynı
 * manifest. Aile yalnız bunları sıraya koyar; kendi yazıcısı yoktur.
 *
 * Garanti: kalite kapısı ve bütçe HİÇBİR şey yazılmadan önce sınanır; bank
 * en son, bütün varyant manifest'leri okunup aile genişletmesiyle
 * eşleştikten sonra yazılır. Yarıda kalan yayın bank'sız kalır (ya da eski
 * aileye ait bank silinmiştir) ve `family status` onu `incomplete` gösterir;
 * aynı komut tekrarlanınca yayımlanmış varyantlar atlanır, kalanlar sürer.
 */
export const DEFAULT_FAMILIES_ROOT = 'devtools/audio-synth/audio-families';
export const FAMILY_STATUS_SCHEMA = 'SoundFamilyStatusV1';
/** Yayın ön-denetimi: kalite kapısı + job render + analiz yeniden render + publish yeniden render. */
export const PUBLICATION_RENDER_PASSES = 4;
/** Kalite kapısı + job analizi + kodek sonrası analiz. */
export const PUBLICATION_ANALYSIS_PASSES = 3;

export interface FamilyLocation {
  readonly repoRoot: string;
  readonly familiesRoot: string;
  readonly familyId: string;
}

export function familyLabel(loc: FamilyLocation): string {
  if (!FAMILY_ID.test(loc.familyId))
    throw new ProtocolError('path', `familyId ${FAMILY_ID.source} kalıbına uymalı`, loc.familyId);
  return `${loc.familiesRoot}/${loc.familyId}`;
}

const familyFile = (loc: FamilyLocation, rel: string) =>
  resolveInside(loc.repoRoot, `${familyLabel(loc)}/${rel}`, rel);

export function variantJob(loc: FamilyLocation, key: string): JobLocation {
  return { repoRoot: loc.repoRoot, jobsRoot: `${familyLabel(loc)}/jobs`, jobId: key };
}

function destinationOf(
  repoRoot: string,
  family: SoundFamilyProgramV1,
  key: string,
): ResolvedDestination {
  const destination = resolveDestination(
    surveyTargets(repoRoot),
    family.delivery.package,
    `${family.delivery.assetDir}/${key}.ogg`,
  );
  const assetClass = classifyAssetPath(destination.withinRoot);
  if (assetClass !== family.delivery.assetClass) {
    throw new ProtocolError(
      'destination',
      `yol sınıfı ${assetClass}, aile ${family.delivery.assetClass} diyor`,
      destination.assetPath,
    );
  }
  return destination;
}

export interface FamilyPreview {
  readonly family: SoundFamilyProgramV1;
  readonly familyHash: Sha256;
  readonly variants: readonly ExpandedVariant[];
  readonly estimate: BatchEstimate;
}

/** Doğrulama + genişletme + hedef + bütçe; render ve yazım YOK. Aşım adıyla fırlar. */
export function previewFamily(repoRoot: string, document: unknown): FamilyPreview {
  const family = asProtocol('family', () => validateFamilyProgram(document));
  const variants = asProtocol('family', () => expandFamily(family));
  let work = 0;
  let peak = 0;
  for (const v of variants) {
    const resolved = resolveProgram(v.program);
    const cost = estimateProgramCost(resolved);
    assertRenderBudget(cost, `varyant ${v.key}`);
    work += PUBLICATION_RENDER_PASSES * cost.workUnits;
    work +=
      PUBLICATION_ANALYSIS_PASSES * resolved.frames * resolved.channels * ANALYSIS_WORK_PER_SAMPLE;
    peak = Math.max(peak, cost.peakBytes);
    destinationOf(repoRoot, family, v.key);
  }
  const estimate = {
    items: variants.length,
    totalWorkUnits: work,
    maxItemPeakBytes: peak,
    estimatedSeconds: work * SECONDS_PER_WORK_UNIT,
  };
  assertBatchBudget(
    estimate,
    { ...DEFAULT_BATCH_BUDGET, ...(family.budget ?? {}) },
    `aile ${family.familyId}`,
  );
  return { family, familyHash: familyHash(family), variants, estimate };
}

export interface FamilyCheck extends FamilyPreview {
  readonly members: readonly {
    readonly key: string;
    readonly pcmHash: Sha256;
    readonly descriptors: DescriptorSummaryV1;
  }[];
  readonly quality: SoundFamilyQualityReportV1;
}

/** Bütün varyantları bellekte render edip ölçer ve aile kalite raporunu kurar; yazmaz. */
export function checkFamily(repoRoot: string, document: unknown): FamilyCheck {
  const preview = previewFamily(repoRoot, document);
  const members = preview.variants.map((v) => {
    const r = renderProgram(v.program);
    const report = analyzeAudio(r.channels, r.sampleRate, 'source-pcm');
    return {
      key: v.key,
      pcmHash: hashPcm(r.channels, r.sampleRate),
      descriptors: summarizeAudio(r.channels, r.sampleRate, report),
    };
  });
  return {
    ...preview,
    members,
    quality: assessFamily(members, preview.family.quality ?? DEFAULT_FAMILY_QUALITY_POLICY),
  };
}

function variantBrief(family: SoundFamilyProgramV1, v: ExpandedVariant): AudioBriefV1 {
  const roles = Object.entries(v.roles).map(([axis, value]) => `${axis}:${value}`);
  return {
    schema: 'AudioBriefV1',
    kind: 'acoustic',
    id: `${family.familyId}-${v.key}`,
    title: `${family.title} — ${v.key}`,
    intent: `${family.description} Varyant ${v.key}${
      roles.length ? ` (${roles.join(', ')})` : ''
    }.`,
    provenance: { author: 'agent', by: 'sound-family' },
    subtype: family.delivery.subtype,
    assetClass: family.delivery.assetClass,
    durationSeconds: family.delivery.durationSeconds,
    channels: v.program.channels,
    ...(roles.length + v.tags.length > 0 ? { descriptors: [...roles, ...v.tags] } : {}),
  };
}

/** Tek varyantı kanonik job akışından yayımlar; yayımlanmışsa dokunmaz (idempotent). */
function publishVariant(
  loc: FamilyLocation,
  family: SoundFamilyProgramV1,
  hash: Sha256,
  v: ExpandedVariant,
): 'published' | 'unchanged' {
  const job = variantJob(loc, v.key);
  const target = {
    package: family.delivery.package,
    asset: `${family.delivery.assetDir}/${v.key}.ogg`,
    integration: { runtimeKey: `${family.familyId}/${v.key}`, loop: false },
  };
  if (!existsSync(resolveInside(loc.repoRoot, `${job.jobsRoot}/${job.jobId}/job.json`, 'job')))
    initJob(job, { target });
  else if (hashCanonical(loadJob(job).target) !== hashCanonical(target)) {
    throw new ProtocolError(
      'identity',
      'varyant işi başka bir hedefe ait',
      `${job.jobsRoot}/${job.jobId}`,
    );
  }
  const brief = variantBrief(family, v);
  if (jobStatus(job).artifacts.brief.hash !== hashCanonical(brief)) registerBrief(job, brief);
  const before = jobStatus(job);
  if (
    before.artifacts.program.state !== 'valid' ||
    before.artifacts.program.hash !== v.programHash ||
    before.artifacts.origin.state !== 'valid'
  ) {
    storeProgram(job, v.program, (programHash) => ({
      schema: PROGRAM_ORIGIN_SCHEMA,
      programHash,
      source: {
        kind: 'family-variant',
        familiesRoot: loc.familiesRoot,
        familyId: family.familyId,
        familyHash: hash,
        variantKey: v.key,
        variantId: v.variantId,
      },
    }));
  }
  if (jobStatus(job).next.action === 'done') return 'unchanged';
  for (let step = 0; step < 6; step++) {
    const action = jobStatus(job).next.action;
    if (action === 'done') return 'published';
    if (action === 'render') renderCandidate(job);
    else if (action === 'analyze') analyzeCandidate(job);
    else if (action === 'select')
      selectCandidate(job, undefined, 'aile varyantı: programın tek render adayı');
    else if (action === 'publish') publishJob(job);
    else
      throw new ProtocolError(
        'stage',
        `varyant ${v.key} beklenmeyen adımda: ${action}`,
        `${job.jobsRoot}/${job.jobId}`,
      );
  }
  throw new ProtocolError(
    'stage',
    `varyant ${v.key} yayına ulaşmadı`,
    `${job.jobsRoot}/${job.jobId}`,
  );
}

/** Bank yolu, varyantlarla AYNI hedef çözümünden (frozen/beyansız hedef burada da reddedilir). */
function bankPath(
  repoRoot: string,
  family: SoundFamilyProgramV1,
): { repoPath: string; packagePath: string } {
  const { target } = destinationOf(repoRoot, family, family.variants[0].key);
  return {
    repoPath: `${target.packagePath}/${target.bankRoot}/${family.familyId}.json`,
    packagePath: target.packagePath,
  };
}

function withinPackage(packagePath: string, repoPath: string): string {
  return repoPath.slice(packagePath.length + 1);
}

function buildBank(
  loc: FamilyLocation,
  check: FamilyCheck,
  qualityHash: Sha256,
): SoundFamilyBankV1 {
  const { family } = check;
  const { packagePath } = bankPath(loc.repoRoot, family);
  const variants = check.variants.map((v): BankVariantV1 => {
    const destination = destinationOf(loc.repoRoot, family, v.key);
    const manifestDoc = readJsonFile(
      resolveInside(loc.repoRoot, destination.manifestPath, 'manifest'),
      destination.manifestPath,
    );
    const manifest: AudioAssetManifestV1 = asProtocol(destination.manifestPath, () =>
      validateManifest(manifestDoc),
    );
    const member = check.members.find((m) => m.key === v.key);
    if (manifest.program.hash !== v.programHash || manifest.render.pcm.hash !== member?.pcmHash) {
      throw new ProtocolError(
        'identity',
        `varyant ${v.key} manifest'i aile genişletmesiyle uyuşmuyor`,
        destination.manifestPath,
      );
    }
    const bytes = readFileSync(resolveInside(loc.repoRoot, manifest.asset.path, 'asset'));
    if (sha256Bytes(bytes) !== manifest.asset.encodedHash) {
      throw new ProtocolError(
        'identity',
        `varyant ${v.key} asset baytları manifest ile uyuşmuyor`,
        manifest.asset.path,
      );
    }
    const d = member.descriptors;
    const level = manifest.analysis.encoded.level;
    return {
      key: v.key,
      variantId: v.variantId,
      roles: v.roles as Record<string, string>,
      tags: v.tags,
      asset: {
        path: withinPackage(packagePath, manifest.asset.path),
        bytes: manifest.asset.bytes,
        encodedHash: manifest.asset.encodedHash,
      },
      manifest: {
        path: withinPackage(packagePath, destination.manifestPath),
        hash: hashCanonical(manifestDoc),
      },
      programHash: v.programHash,
      pcmHash: manifest.render.pcm.hash,
      durationSeconds: manifest.analysis.encoded.format.durationSeconds,
      loudness: {
        maxMomentaryLufs: level.maxMomentaryLufs,
        integratedLufs: level.integratedLufs,
        truePeakDbtp: level.truePeakDbtp,
      },
      descriptors: {
        activeSeconds: d.activeSeconds,
        centroidHz: d.centroidHz,
        pitchHz: d.pitchConfidence >= 0.5 ? d.pitchHz : null,
      },
    };
  });
  const roleAxes = Object.fromEntries(
    Object.entries(family.roles).map(([axis, values]) => [
      axis,
      Object.keys(values as object).sort(),
    ]),
  );
  return {
    schema: SOUND_FAMILY_BANK_SCHEMA,
    lookupContract: BANK_LOOKUP_CONTRACT,
    package: family.delivery.package,
    family: {
      familyId: family.familyId,
      version: family.version,
      hash: check.familyHash,
      seed: family.seed,
      variationPolicy: family.variation.policy,
      path: `${familyLabel(loc)}/family.json`,
    },
    quality: { path: `${familyLabel(loc)}/quality.json`, hash: qualityHash, pass: true },
    engine: {
      rendererVersion: PROGRAM_RENDERER_VERSION,
      analyzerVersion: ANALYZER_VERSION,
      registryHash: registryHash(),
    },
    ordering: 'key',
    choice: { method: BANK_CHOICE_METHOD },
    roleAxes,
    variants: [...variants].sort((a, b) => (a.key < b.key ? -1 : 1)),
  };
}

export interface FamilyPublishOutcome {
  readonly family: string;
  readonly bank: string;
  readonly variants: readonly {
    readonly key: string;
    readonly result: 'published' | 'unchanged';
  }[];
  readonly quality: SoundFamilyQualityReportV1['verdict'];
}

/**
 * Ön-denetim → kalite kapısı → (değişen aile için eski bank'ı sil) → aile ve
 * kalite belgeleri → varyant başına kanonik yayın → bank. Kayıtlı aile
 * içerikçe değiştiyse `version` artmış olmalıdır.
 */
export function publishFamily(
  repoRoot: string,
  familiesRoot: string,
  document: unknown,
): FamilyPublishOutcome {
  const check = checkFamily(repoRoot, document);
  const { family } = check;
  const loc: FamilyLocation = { repoRoot, familiesRoot, familyId: family.familyId };
  if (!check.quality.verdict.pass) {
    throw new ProtocolError(
      'policy',
      `aile kalite kapısı düştü: ${check.quality.verdict.failures.join(', ')}`,
      familyLabel(loc),
    );
  }
  const bank = bankPath(repoRoot, family);
  return withLock(resolveInside(repoRoot, familyLabel(loc), 'family'), familyLabel(loc), () => {
    const stored = existsSync(familyFile(loc, 'family.json'))
      ? asProtocol('family.json', () =>
          validateFamilyProgram(readJsonFile(familyFile(loc, 'family.json'), 'family.json')),
        )
      : null;
    if (stored && familyHash(stored) !== check.familyHash && !(family.version > stored.version)) {
      throw new ProtocolError(
        'overwrite',
        `aile içeriği değişti; version ${stored.version}'den büyük olmalı`,
        familyLabel(loc),
      );
    }
    const bankFile = resolveInside(repoRoot, bank.repoPath, 'bank');
    if (existsSync(bankFile)) {
      const current = JSON.parse(readFileSync(bankFile, 'utf8')) as { family?: { hash?: string } };
      if (current.family?.hash !== check.familyHash) rmSync(bankFile);
    }
    writeFileAtomic(familyFile(loc, 'family.json'), prettyCanonicalJson(family));
    writeFileAtomic(familyFile(loc, 'quality.json'), prettyCanonicalJson(check.quality));
    const results = check.variants.map((v) => ({
      key: v.key,
      result: publishVariant(loc, family, check.familyHash, v),
    }));
    const doc = buildBank(loc, check, hashCanonical(check.quality));
    writeFileAtomic(bankFile, prettyCanonicalJson(asProtocol('bank', () => validateBank(doc))));
    return {
      family: familyLabel(loc),
      bank: bank.repoPath,
      variants: results,
      quality: check.quality.verdict,
    };
  });
}

export interface FamilyVerificationV1 {
  readonly schema: 'SoundFamilyVerificationV1';
  readonly family: string;
  readonly bank: string;
  readonly complete: boolean;
  readonly checks: readonly {
    readonly name: string;
    readonly ok: boolean;
    readonly detail: string;
  }[];
}

/**
 * Bank'ın TAMAM sayılma koşulu: bank okunur ve şemaya uyar; aile ve kalite
 * belgeleri özetleriyle aynı; aile yeniden genişletilince aynı anahtar,
 * kimlik ve program özetleri çıkar; her varyantın manifest'i ve asset
 * baytları bank'taki özetlerle aynı. PCM kimliği manifest doğrulamasında
 * (`verify --all`) ayrıca yeniden render edilerek sınanır.
 */
export function verifyFamily(loc: FamilyLocation): FamilyVerificationV1 {
  const checks: { name: string; ok: boolean; detail: string }[] = [];
  const add = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail });
  const familyDoc = existsSync(familyFile(loc, 'family.json'))
    ? readJsonFile(familyFile(loc, 'family.json'), 'family.json')
    : null;
  if (!familyDoc) {
    add('family', false, 'family.json yok');
    return {
      schema: 'SoundFamilyVerificationV1',
      family: familyLabel(loc),
      bank: '—',
      complete: false,
      checks,
    };
  }
  const family = asProtocol('family.json', () => validateFamilyProgram(familyDoc));
  const bank = bankPath(loc.repoRoot, family);
  const bankFile = resolveInside(loc.repoRoot, bank.repoPath, 'bank');
  let doc: SoundFamilyBankV1 | null = null;
  try {
    doc = existsSync(bankFile) ? validateBank(JSON.parse(readFileSync(bankFile, 'utf8'))) : null;
  } catch (error) {
    add('bank-schema', false, (error as Error).message);
  }
  if (!doc) {
    if (checks.length === 0)
      add('bank', false, 'bank yok — yayın tamamlanmamış (family publish ile sürdürülür)');
    return {
      schema: 'SoundFamilyVerificationV1',
      family: familyLabel(loc),
      bank: bank.repoPath,
      complete: false,
      checks,
    };
  }
  add('family-hash', doc.family.hash === familyHash(family), doc.family.hash);
  const quality = existsSync(familyFile(loc, 'quality.json'))
    ? hashCanonical(readJsonFile(familyFile(loc, 'quality.json'), 'quality.json'))
    : null;
  add('quality-hash', quality === doc.quality.hash, quality ?? 'quality.json yok');
  const expanded = expandFamily(family);
  const key = (x: { key: string; variantId: string; programHash: string }) =>
    `${x.key}|${x.variantId}|${x.programHash}`;
  const drift = expanded.filter((v, i) => !doc?.variants[i] || key(v) !== key(doc.variants[i]));
  add(
    'expansion',
    drift.length === 0 && expanded.length === doc.variants.length,
    drift.length
      ? `uyuşmayan: ${drift.map((v) => v.key).join(', ')}`
      : `${expanded.length} varyant aile genişletmesiyle aynı`,
  );
  const broken = doc.variants.filter((v) => {
    const manifestFile = resolveInside(
      loc.repoRoot,
      `${bank.packagePath}/${v.manifest.path}`,
      'manifest',
    );
    const assetFile = resolveInside(loc.repoRoot, `${bank.packagePath}/${v.asset.path}`, 'asset');
    if (!existsSync(manifestFile) || !existsSync(assetFile)) return true;
    const manifest = readJsonFile(manifestFile, v.manifest.path);
    return (
      hashCanonical(manifest) !== v.manifest.hash ||
      sha256Bytes(readFileSync(assetFile)) !== v.asset.encodedHash
    );
  });
  add(
    'links',
    broken.length === 0,
    broken.length
      ? `bozuk: ${broken.map((v) => v.key).join(', ')}`
      : 'bütün manifest ve asset özetleri aynı',
  );
  return {
    schema: 'SoundFamilyVerificationV1',
    family: familyLabel(loc),
    bank: bank.repoPath,
    complete: checks.every((c) => c.ok),
    checks,
  };
}

export function listFamilies(repoRoot: string, familiesRoot: string): string[] {
  const dir = resolveInside(repoRoot, familiesRoot, 'families');
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && FAMILY_ID.test(e.name))
    .map((e) => e.name)
    .sort();
}

export interface FamilyStatusV1 {
  readonly schema: typeof FAMILY_STATUS_SCHEMA;
  readonly family: string;
  readonly verification: FamilyVerificationV1;
  readonly variants: readonly {
    readonly key: string;
    readonly stage: string;
    readonly next: string;
  }[];
}

/** Aile durumu yalnız dosyalardan: varyant işlerinin aşaması ve bank bütünlüğü. */
export function familyStatus(loc: FamilyLocation): FamilyStatusV1 {
  const verification = verifyFamily(loc);
  const jobs = existsSync(familyFile(loc, 'jobs'))
    ? readdirSync(familyFile(loc, 'jobs'), { withFileTypes: true })
        .filter((e) => e.isDirectory() && JOB_ID.test(e.name))
        .map((e) => e.name)
        .sort()
    : [];
  return {
    schema: FAMILY_STATUS_SCHEMA,
    family: familyLabel(loc),
    verification,
    variants: jobs.map((key) => {
      const s = jobStatus(variantJob(loc, key));
      return { key, stage: s.effectiveStage, next: s.next.action };
    }),
  };
}
