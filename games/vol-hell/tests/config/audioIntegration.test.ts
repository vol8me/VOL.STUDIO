import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  bossTrackId,
  combatTrackId,
  deathTrackKeys,
  menuTrackKeys,
  musicTracks,
  victoryTrackId,
} from '@/config/music';
import { buildArcadeSuite } from '../../scripts/audio-v2/definitions.arcade';

const suite = buildArcadeSuite();
const keyOf = (runtimeKey: string) =>
  runtimeKey.replace(/^(music|ambience)-/, '') as keyof typeof musicTracks;

describe('arcade üretim ve çalma sözleşmesi', () => {
  it('runtime ses yolları gönderilen ağaçta vardır', () => {
    const paths = [
      ...Object.values(musicTracks).flatMap((track) =>
        track.stems.flatMap((stem) => (stem.src ? [stem.src] : [])),
      ),
      ...suite.music.map((item) =>
        (item.program.delivery.files!.mix ?? '').replace(/^public\//, ''),
      ),
    ];
    for (const path of paths) {
      expect(existsSync(join(process.cwd(), 'public', path)), path).toBe(true);
    }
  });

  it('kanonik gövde süresi ve tempo bütün runtime trackleriyle eşleşir', () => {
    for (const definition of suite.music) {
      const track = musicTracks[keyOf(definition.runtimeKey)];
      expect(track.bpm).toBe(definition.program.tempo.bpm);
      expect(track.loopEnd).toBeCloseTo(definition.loopSeconds, 6);
      expect(track.loopEnd).toBeCloseTo(
        (definition.program.bars * definition.program.meter[0] * 60) / definition.program.tempo.bpm,
        6,
      );
    }
  });

  it('arcade seti tek main stem kullanır; ayrı giriş/cue dosyası yoktur', () => {
    for (const track of Object.values(musicTracks)) {
      expect(track.stems.map((stem) => stem.id)).toEqual(['main']);
      expect(track.cues ?? []).toEqual([]);
      expect(track.intro).toBeUndefined();
      expect(String(track.stems[0].src).endsWith('.ogg')).toBe(true);
    }
  });

  it('loop kararı beste moduyla ve slot kimliğiyle eşleşir', () => {
    const playbackOf = (runtimeKey: string) =>
      suite.music.find((item) => item.runtimeKey === runtimeKey)!.program.playback;
    for (const key of ['surge-protocol', 'sovereign', 'null-drift', 'deep-current'] as const) {
      const track = musicTracks[key];
      expect(track.stems[0].loop, key).toBe(true);
    }
    for (const key of ['hollow-signal', 'event-horizon', 'terminal-echo', 'first-light'] as const) {
      expect(musicTracks[key].stems[0].loop, key).toBe(false);
    }
    expect(playbackOf('music-surge-protocol')).toBe('loop');
    expect(playbackOf('music-sovereign')).toBe('loop');
    expect(playbackOf('music-terminal-echo')).toBe('playlistOneShot');
    expect(playbackOf('music-first-light')).toBe('playlistOneShot');
    expect(playbackOf('ambience-null-drift')).toBe('loop');
  });

  it('slot eşlemesi menü/ölüm/zafer/savaş/boss listelerini korur', () => {
    expect(menuTrackKeys).toEqual(['hollow-signal', 'event-horizon']);
    expect(deathTrackKeys).toEqual(['terminal-echo']);
    expect(combatTrackId).toBe('surge-protocol');
    expect(bossTrackId).toBe('sovereign');
    expect(victoryTrackId).toBe('first-light');
    expect(suite.music.map((item) => keyOf(item.runtimeKey)).sort()).toEqual(
      Object.keys(musicTracks).sort(),
    );
  });
});
