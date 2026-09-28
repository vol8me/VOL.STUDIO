import { describe, expect, it } from 'vitest';
import { validateScoreStructure } from '../../scripts/audio-v2/scoreRules';
import { arcadeSignal } from '../../scripts/audio-v2/scores/arcade-signal';
import { eventHorizon } from '../../scripts/audio-v2/scores/event-horizon';
import { surgeProtocol } from '../../scripts/audio-v2/scores/surge-protocol';
import { sovereign } from '../../scripts/audio-v2/scores/sovereign';
import { terminalEcho } from '../../scripts/audio-v2/scores/terminal-echo';
import { firstLight } from '../../scripts/audio-v2/scores/first-light';
import { nullDrift } from '../../scripts/audio-v2/scores/null-drift';
import { deepCurrent } from '../../scripts/audio-v2/scores/deep-current';

const scores = [
  arcadeSignal,
  eventHorizon,
  surgeProtocol,
  sovereign,
  terminalEcho,
  firstLight,
  nullDrift,
  deepCurrent,
];

describe('elle yazılan arcade bestelerinin formu', () => {
  it('sekiz bestenin hepsi bölüm, enerji, loop ve doku kurallarını geçer', () => {
    for (const score of scores) {
      expect(validateScoreStructure(score), score.musicId).toEqual([]);
    }
  });

  it('menü parçaları ayrı bestelerdir ve tek main stem taşır', () => {
    expect(arcadeSignal.musicId).not.toBe(eventHorizon.musicId);
    expect(arcadeSignal.tempo.bpm).not.toBe(eventHorizon.tempo.bpm);
    const first = arcadeSignal.sections.flatMap((section) =>
      section.parts.flatMap((part) =>
        part.lane === 'hook' && part.source === 'notes' ? part.notes.map((note) => note.note) : [],
      ),
    );
    const second = eventHorizon.sections.flatMap((section) =>
      section.parts.flatMap((part) =>
        part.lane === 'hook' && part.source === 'notes' ? part.notes.map((note) => note.note) : [],
      ),
    );
    expect(first.length).toBeGreaterThan(24);
    expect(first).not.toEqual(second);
    for (const score of [arcadeSignal, eventHorizon]) {
      expect(score.stems.map((stem) => stem.id)).toEqual(['main']);
    }
  });

  it('savaş ve boss parçaları davul kitiyle tempoyu taşır', () => {
    for (const score of [surgeProtocol, sovereign]) {
      expect(score.instruments?.some((instrument) => instrument.source.kind === 'drum-kit')).toBe(
        true,
      );
      expect(score.sections.some((section) => section.lanes.includes('drums'))).toBe(true);
    }
    expect(surgeProtocol.sections[surgeProtocol.sections.length - 1].bars[1]).toBe(
      surgeProtocol.bars,
    );
    expect(sovereign.sections[sovereign.sections.length - 1].bars[1]).toBe(sovereign.bars);
  });

  it('ambiyanslar ritimsiz ve alçak enerjilidir', () => {
    for (const score of [nullDrift, deepCurrent]) {
      expect(score.sections.every((section) => !section.lanes.includes('hat'))).toBe(true);
      expect(Math.max(...score.sections.map((section) => section.targetEnergy))).toBeLessThan(0.7);
    }
  });
});
