import { describe, expect, it } from 'vitest';
import {
  assessFamily,
  DEFAULT_FAMILY_QUALITY_POLICY,
  validateFamilyQualityPolicy,
  type FamilyMemberInput,
} from '../../src/analysis/family';
import { analyzeAudio } from '../../src/analysis/report';
import { summarizeAudio } from '../../src/analysis/summary';
import { AudioParamError } from '../../src/guard/errors';
import { expandArchetype } from '../../src/program/archetype';
import { renderProgram } from '../../src/program/render';
import { hashPcm } from '../../src/protocol/canonical';

/** Gerçek render'dan üye: ölçümler sahte değil, motorun kendi çıktısı. */
function member(key: string, params: Record<string, number>, variation = 0): FamilyMemberInput {
  const program = expandArchetype({
    schema: 'ArchetypeRequestV1',
    archetype: 'archetype.resonant-shell',
    version: 1,
    variation,
    params: { durationSeconds: 0.6, ...params },
  });
  const r = renderProgram(program);
  const report = analyzeAudio(r.channels, r.sampleRate, 'source-pcm');
  return {
    key,
    pcmHash: hashPcm(r.channels, r.sampleRate),
    descriptors: summarizeAudio(r.channels, r.sampleRate, report),
  };
}

const healthy = [0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85].map((size, i) =>
  member(`v${i}`, { size, hardness: 0.9 - size * 0.8, damping: 0.3 + 0.05 * i }),
);

describe('SoundFamilyQualityReportV1', () => {
  it('sağlıklı, çeşitli aile geçer; çeşitlilik ve tutarlılık AYRI raporlanır, tek skor yoktur', () => {
    const report = assessFamily(healthy);
    expect(report.verdict).toEqual({ pass: true, failures: [] });
    expect(report.duplicates).toEqual([]);
    expect(report.diversity.pairs).toBe(28);
    expect(report.diversity.collapsed).toBe(false);
    expect(report.coherence.outliers).toEqual([]);
    expect(Object.keys(report).sort()).toEqual([
      'coherence',
      'descriptorSpace',
      'diversity',
      'duplicates',
      'members',
      'policy',
      'schema',
      'verdict',
    ]);
    expect(JSON.stringify(report)).not.toMatch(/"score"/);
  });

  it('aynı PCM iki kez gelirse aile SERT kırılır', () => {
    const report = assessFamily([...healthy, { ...healthy[3], key: 'kopya' }]);
    expect(report.verdict.pass).toBe(false);
    expect(report.verdict.failures).toContain('duplicate-pcm');
    expect(report.duplicates).toEqual([{ pcmHash: healthy[3].pcmHash, keys: ['kopya', 'v3'] }]);
  });

  it('PCM’i farklı ama betimleyicide yakın-özdeş çift çeşitlilik sorunudur', () => {
    const twin = member('ikiz', { size: 0.451, hardness: 0.9 - 0.45 * 0.8, damping: 0.45 });
    const report = assessFamily([...healthy, twin]);
    expect(twin.pcmHash).not.toBe(healthy[3].pcmHash);
    expect(report.diversity.nearIdentical.map((p) => [p.a, p.b])).toEqual([['ikiz', 'v3']]);
    expect(report.verdict.failures).toEqual(['near-identical']);
    const relaxed = {
      ...DEFAULT_FAMILY_QUALITY_POLICY,
      diversity: { ...DEFAULT_FAMILY_QUALITY_POLICY.diversity, nearIdentical: 'report' as const },
    };
    expect(assessFamily([...healthy, twin], relaxed).verdict.pass).toBe(true);
  });

  it('çökmüş aile (hepsi neredeyse aynı) collapsed olarak kırılır', () => {
    const collapsed = [0.5, 0.501, 0.502, 0.503, 0.504].map((size, i) =>
      member(`c${i}`, { size, hardness: 0.5 }),
    );
    const report = assessFamily(collapsed);
    expect(report.diversity.collapsed).toBe(true);
    expect(report.verdict.failures).toContain('collapsed');
  });

  it('aşırı aykırı üye tutarlılık bulgusu olarak adıyla raporlanır; estetik hüküm yoktur', () => {
    const outlier = member('dev', { size: 0.5, durationSeconds: 8, damping: 0 });
    const report = assessFamily([...healthy, outlier]);
    expect(report.coherence.outliers.map((o) => [o.key, o.descriptor])).toContainEqual([
      'dev',
      'activeSeconds',
    ]);
    expect(report.verdict.failures).toContain('outlier');
  });

  it('oran sınırı beyan edilirse sınanır; perde yalnız güvenilir ölçüldüğünde kullanılır', () => {
    const policy = {
      ...DEFAULT_FAMILY_QUALITY_POLICY,
      coherence: { ...DEFAULT_FAMILY_QUALITY_POLICY.coherence, maxCentroidRatio: 1.2 },
    };
    const report = assessFamily(healthy, policy);
    expect(report.coherence.ratioViolations.map((v) => v.descriptor)).toEqual(['centroidHz']);
    expect(report.verdict.failures).toEqual(['ratio']);
    const unvoiced = healthy.map((m) => ({
      ...m,
      descriptors: { ...m.descriptors, pitchHz: 440, pitchConfidence: 0.2 },
    }));
    expect(assessFamily(unvoiced).coherence.distributions.pitchHz).toMatchObject({
      measured: 0,
      median: null,
    });
  });

  it('tek üyeli aile yetersizdir; politika belgesi doğrulanır', () => {
    expect(assessFamily([healthy[0]]).verdict.failures).toEqual(['too-few-members']);
    expect(() =>
      validateFamilyQualityPolicy({ ...DEFAULT_FAMILY_QUALITY_POLICY, minMembers: 1 }, 'policy'),
    ).toThrow(AudioParamError);
    expect(validateFamilyQualityPolicy(DEFAULT_FAMILY_QUALITY_POLICY, 'policy')).toEqual(
      DEFAULT_FAMILY_QUALITY_POLICY,
    );
  });
});
