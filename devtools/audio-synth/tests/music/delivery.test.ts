import { describe, expect, it } from 'vitest';
import { validateMusicProgram } from '../../src/music/program';
import { validateBrief } from '../../src/program/brief';
import { previewMusic, musicAssetBrief } from '../../src/protocol/music';
import { renderAndPlan } from '../../src/music/bundle';
import { expandProgram } from '../../src/music/score';
import { createTestRepo } from '../protocol/repo';
import { unitProgram, musicBrief } from './fixtures';

describe('açık müzik dosya teslimi', () => {
  it('varsayılan yol aynı kalır; mix eski olay dosyasına yönlendirilebilir', () => {
    const program = validateMusicProgram(
      unitProgram({
        delivery: {
          package: '@volstudio/audio-synth',
          assetDir: 'reference/production/assets/music/unit-loop',
          files: { mix: 'reference/production/assets/music/legacy.ogg' },
        },
      }),
    );
    expect(program.delivery.files?.mix).toBe('reference/production/assets/music/legacy.ogg');
  });

  it.each(['../escape.ogg', '/outside.ogg', 'reference/production/assets/music/a.wav'])(
    'güvensiz ya da yanlış kodek yolu reddedilir: %s',
    (file) => {
      expect(() =>
        validateMusicProgram(
          unitProgram({
            delivery: {
              package: '@volstudio/audio-synth',
              assetDir: 'reference/production/assets/music/unit-loop',
              files: { mix: file },
            },
          }),
        ),
      ).toThrow();
    },
  );

  it('olmayan stem adı reddedilir', () => {
    expect(() =>
      validateMusicProgram(
        unitProgram({
          delivery: {
            package: '@volstudio/audio-synth',
            assetDir: 'reference/production/assets/music/unit-loop',
            files: { missing: 'reference/production/assets/music/a.ogg' },
          },
        }),
      ),
    ).toThrow();
  });

  it('ambience opt-in aynı bundle kapısından geçer, sınıf uyuşmazlığı reddedilir', () => {
    const repo = createTestRepo();
    try {
      const program = validateMusicProgram(
        unitProgram({
          delivery: {
            package: '@volstudio/audio-synth',
            assetDir: 'reference/production/assets/ambience/unit-loop',
            assetClass: 'ambience',
          },
        }),
      );
      const brief = validateBrief(musicBrief({ assetClass: 'ambience' }));
      if (brief.kind !== 'music') throw new Error('müzik brief bekleniyor');
      expect(previewMusic(repo.root, { program, brief, themeBook: null }).assets).toEqual(['mix']);
      const wrong = validateBrief(musicBrief());
      if (wrong.kind !== 'music') throw new Error('müzik brief bekleniyor');
      expect(() => previewMusic(repo.root, { program, brief: wrong, themeBook: null })).toThrow();
    } finally {
      repo.cleanup();
    }
  });

  it('ambience bundle QA kendi sınıfının loudness aralığını kullanır', () => {
    const program = validateMusicProgram(
      unitProgram({
        delivery: {
          package: '@volstudio/audio-synth',
          assetDir: 'reference/production/assets/ambience/unit-loop',
          assetClass: 'ambience',
        },
      }),
    );
    const plan = renderAndPlan(program, expandProgram(program), -22);
    expect(plan.plan.qa.verdict).toEqual({ pass: true, failures: [] });
  });

  it('adaptive bundle cue brief’i state alanını taşımadan tek seferlik doğrulanır', () => {
    const brief = validateBrief(
      musicBrief({
        playback: 'adaptiveLoop',
        adaptive: {
          states: [
            { id: 'calm', intensity: 0 },
            { id: 'peak', intensity: 1 },
          ],
        },
      }),
    );
    if (brief.kind !== 'music') throw new Error('müzik brief bekleniyor');
    expect(validateBrief(musicAssetBrief(brief, true))).toMatchObject({
      playback: 'playlistOneShot',
      usage: 'cue',
    });
    expect(musicAssetBrief(brief, true)).not.toHaveProperty('adaptive');
    expect(musicAssetBrief(brief, false)).toBe(brief);
  });
});
