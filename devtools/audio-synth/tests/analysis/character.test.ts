import { describe, expect, it } from 'vitest';
import { analyzeAudio } from '../../src/analysis/report';
import { evaluateCharacterPolicy, validateCharacterPolicy } from '../../src/analysis/character';

const sampleRate = 24000;
const signal = (hz: number, seconds = 1) =>
  Float32Array.from(
    { length: sampleRate * seconds },
    (_, i) => 0.2 * Math.sin((2 * Math.PI * hz * i) / sampleRate),
  );
const policy = {
  schema: 'AudioCharacterPolicyV1',
  centroidMaxHz: 900,
  airToMidMaxDb: -30,
  maxMomentaryRiseLu: 6,
} as const;
const assess = (channels: Float32Array[]) =>
  evaluateCharacterPolicy(
    channels,
    sampleRate,
    analyzeAudio(channels, sampleRate, 'source-pcm'),
    policy,
  );

describe('beyan edilmiş ses karakteri politikası', () => {
  it('koyu orta bant sinyali geçer, parlak sinyal düşer', () => {
    expect(assess([signal(700)]).pass).toBe(true);
    expect(assess([signal(9500)]).pass).toBe(false);
  });

  it('zıt fazlı stereo üst bant mono toplamında kaybolup kapıyı atlayamaz', () => {
    const bright = signal(9000);
    const inverse = Float32Array.from(bright, (v) => -v);
    expect(assess([bright, inverse]).pass).toBe(false);
  });

  it('sondaki parlak bölüm bütün dosya ölçümüne girer', () => {
    const mixed = signal(700, 2);
    mixed.set(signal(9000), sampleRate);
    expect(assess([mixed]).centroidHz).toBeGreaterThan(900);
  });

  it('sessizlik ve tanımsız integrated loudness geçti sayılmaz', () => {
    expect(assess([new Float32Array(sampleRate)]).pass).toBe(false);
    expect(assess([signal(700, 0.1)]).pass).toBe(false);
  });

  it('bilinmeyen alan ve geçersiz eşik reddedilir', () => {
    expect(() => validateCharacterPolicy({ ...policy, centroidMaxHz: -1 })).toThrow();
    expect(() => validateCharacterPolicy({ ...policy, bypass: true })).toThrow();
  });
});
