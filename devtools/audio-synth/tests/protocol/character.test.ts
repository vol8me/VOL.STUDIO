import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createTestRepo, REFERENCE_TARGET, testBrief, testProgram } from './repo';
import {
  initJob,
  registerBrief,
  registerProgram,
  renderCandidate,
  analyzeCandidate,
  selectCandidate,
} from '../../src/protocol/job';
import { publishJob } from '../../src/protocol/publish';

describe('karakter politikası yayın kapısı', () => {
  it('kaynak sınıf politikası geçse de beyan edilen karakter düşerse asset yazılmaz', () => {
    const repo = createTestRepo();
    try {
      const loc = repo.loc('character');
      initJob(loc, { target: REFERENCE_TARGET });
      registerBrief(
        loc,
        testBrief({
          character: { schema: 'AudioCharacterPolicyV1', centroidMaxHz: 20 },
        }),
      );
      registerProgram(loc, testProgram());
      renderCandidate(loc);
      analyzeCandidate(loc);
      selectCandidate(loc, undefined, 'Mekanik regresyon örneği.');
      expect(() => publishJob(loc)).toThrow(/karakter/);
      expect(existsSync(join(repo.root, 'devtools/audio-synth', REFERENCE_TARGET.asset))).toBe(
        false,
      );
    } finally {
      repo.cleanup();
    }
  });
});
