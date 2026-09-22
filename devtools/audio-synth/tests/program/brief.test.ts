import { describe, expect, it } from 'vitest';
import { AudioParamError, type AudioParamIssue } from '../../src/guard/errors';
import { validateBrief } from '../../src/program/brief';

export function baseBrief(): Record<string, unknown> {
  return {
    schema: 'AudioBriefV1',
    kind: 'acoustic',
    id: 'test-knock',
    title: 'Test vuruşu',
    intent: 'Kısa, kuru bir vuruş.',
    provenance: { author: 'agent', by: 'test' },
    subtype: 'sfx',
    assetClass: 'sfx',
    durationSeconds: { min: 0.1, max: 1 },
    channels: 1,
  };
}

function issueOf(edit: (b: Record<string, unknown>) => void): {
  path: string;
  issue: AudioParamIssue;
} {
  const brief = baseBrief();
  edit(brief);
  try {
    validateBrief(brief);
  } catch (error) {
    expect(error).toBeInstanceOf(AudioParamError);
    return { path: (error as AudioParamError).path, issue: (error as AudioParamError).issue };
  }
  throw new Error('reddedilmedi');
}

describe('AudioBriefV1 zarfı', () => {
  it('geçerli akustik brief olduğu gibi döner; isteğe bağlı alanlar korunur', () => {
    const brief = { ...baseBrief(), descriptors: ['dry'], loop: false };
    expect(validateBrief(brief)).toEqual(brief);
  });

  it('müzik kolu kendi alan kümesini ister (akustik alanlar taşınmaz)', () => {
    expect(issueOf((b) => (b.kind = 'music'))).toEqual({ path: 'subtype', issue: 'unknown-key' });
  });

  it('müzik alanı akustik brief’e sızamaz (ikinci müzik şeması oluşamaz)', () => {
    expect(issueOf((b) => (b.bpm = 120))).toEqual({ path: 'bpm', issue: 'unknown-key' });
    expect(issueOf((b) => (b.playback = 'loop'))).toEqual({
      path: 'playback',
      issue: 'unknown-key',
    });
  });

  it.each<[string, (b: Record<string, unknown>) => void, string, AudioParamIssue]>([
    ['bilinmeyen kind', (b) => (b.kind = 'speech'), 'kind', 'type'],
    ['bilinmeyen subtype', (b) => (b.subtype = 'foley'), 'subtype', 'type'],
    ['müzik sınıfı', (b) => (b.assetClass = 'music'), 'assetClass', 'type'],
    ['şema', (b) => (b.schema = 'AudioBriefV2'), 'schema', 'type'],
    ['kimlik', (b) => (b.id = 'Bad ID'), 'id', 'type'],
    ['boş niyet', (b) => (b.intent = '   '), 'intent', 'type'],
    [
      'süre aralığı',
      (b) => (b.durationSeconds = { min: 2, max: 1 }),
      'durationSeconds.max',
      'range',
    ],
    ['kanal', (b) => (b.channels = 6), 'channels', 'type'],
    ['provenance', (b) => (b.provenance = { author: 'robot' }), 'provenance.author', 'type'],
    ['descriptor', (b) => (b.descriptors = ['x'.repeat(41)]), 'descriptors[0]', 'type'],
    ['loop tipi', (b) => (b.loop = 'yes'), 'loop', 'type'],
  ])('%s render’dan önce adlı hata verir', (_label, edit, path, issue) => {
    expect(issueOf(edit)).toEqual({ path, issue });
  });

  it('nesne olmayan brief', () => {
    expect(() => validateBrief([])).toThrow(AudioParamError);
  });
});
