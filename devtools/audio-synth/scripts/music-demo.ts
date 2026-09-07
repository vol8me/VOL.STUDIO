import { writeWav, writeOgg } from '../src/writer';
import { Arrange, Presets } from '../src';
import type { SynthesisResult } from '../src/types';

const { Timeline, measureRms, measurePeak, matchLoudness } = Arrange;
const { noteToHz, SCALES, scaleDegree, scaleChord } = Arrange;

const SAMPLE_RATE = 44100;
const OUT_DIR = new URL('../export', import.meta.url).pathname;

interface Track {
  name: string;
  result: SynthesisResult;
}

function rmsWindows(channels: Float32Array[], windowSize: number): number[] {
  const mono = channels[1] ? new Float32Array(channels[0].length) : channels[0];
  if (channels[1] && mono) {
    for (let i = 0; i < mono.length; i++) mono[i] = (channels[0][i] + channels[1][i]) * 0.5;
  }
  const out: number[] = [];
  for (let start = 0; start + windowSize <= (mono?.length ?? 0); start += windowSize) {
    let sum = 0;
    for (let i = 0; i < windowSize; i++) sum += (mono as Float32Array)[start + i] ** 2;
    out.push(Math.sqrt(sum / windowSize));
  }
  return out;
}

function verifyTrack(track: Track, actionRange?: [number, number]) {
  const { result } = track;
  const rms = measureRms(result.channels);
  const peak = measurePeak(result.channels);
  const finite = result.channels.every((ch) => ch.every(Number.isFinite));

  if (!finite) throw new Error(`${track.name}: sonlu olmayan örnek var`);
  if (peak >= 0.999) throw new Error(`${track.name}: kırpma var`);
  if (peak > 0.95) throw new Error(`${track.name}: tepe -0.5 dB'yi aşıyor`);

  const targetDb = -20;
  const actualDb = 20 * Math.log10(rms);
  if (actualDb < -23 || actualDb > -17) {
    throw new Error(`${track.name}: RMS ${actualDb.toFixed(1)} dB, hedef ~-20 dB`);
  }

  for (const ch of result.channels) {
    const last = Math.abs(ch[ch.length - 1] ?? 0);
    if (last > 0.02) throw new Error(`${track.name}: son tık (${last.toFixed(3)})`);
  }

  if (actionRange) {
    const winSize = Math.floor(SAMPLE_RATE);
    const windows = rmsWindows(result.channels, winSize);
    const [fromSec, toSec] = actionRange;
    const from = Math.floor((fromSec * SAMPLE_RATE) / winSize);
    const to = Math.ceil((toSec * SAMPLE_RATE) / winSize);
    const others = windows.slice(0, from).concat(windows.slice(to));
    const action = windows.slice(from, to);
    const maxOther = Math.max(...others);
    const maxAction = Math.max(...action);
    if (maxAction < maxOther * 1.2) {
      throw new Error(`${track.name}: aksiyon bölümü yeterince yüksek değil`);
    }
  }

  console.log(
    `  ${track.name}: ${result.duration.toFixed(1)}s  RMS ${actualDb.toFixed(1)} dB  peak ${(
      20 * Math.log10(peak)
    ).toFixed(1)} dB`,
  );
}

function chordProgression(root: string, scale: readonly number[], degrees: number[]): string[][] {
  return degrees.map((d) => scaleChord(root, scale, d, 4));
}

function buildOrganPiece(): SynthesisResult {
  const t = new Timeline({ bpm: 64, beatsPerBar: 4, sampleRate: SAMPLE_RATE, humanizeSeed: 11 });
  const root = 'C3';
  const scale = SCALES.major;
  const chords = chordProgression(root, scale, [0, 3, 4, 2]);
  for (let bar = 0; bar < 16; bar++) {
    const notes = chords[bar % chords.length];
    t.chord({
      instrument: Presets.drawbarOrgan,
      notes,
      bar,
      beats: 4,
      gain: 0.85,
      spread: 0.25,
    });
  }
  return t.render({ targetRms: 0.1, tailSeconds: 3 });
}

function buildPianoPiece(): SynthesisResult {
  const t = new Timeline({ bpm: 76, beatsPerBar: 4, sampleRate: SAMPLE_RATE, humanizeSeed: 31 });
  const root = 'C3';
  const scale = SCALES.minor;
  const chords = chordProgression(root, scale, [0, 3, 4, 0]);
  for (let bar = 0; bar < 20; bar++) {
    const chord = chords[bar % chords.length] ?? ['C3', 'Eb3', 'G3'];
    t.chord({
      instrument: Presets.grandPiano,
      notes: chord,
      bar,
      beats: 4,
      gain: 0.85,
      spread: 0.3,
    });
    if (bar % 2 === 1) {
      t.chord({
        instrument: Presets.uprightPiano,
        notes: chord,
        bar,
        beat: 2,
        beats: 2,
        gain: 0.8,
        spread: 0.25,
      });
    }
    if (bar % 4 === 0) {
      t.note({
        instrument: Presets.honkyTonkPiano,
        note: chord[0] ?? 'C4',
        bar,
        beat: 3,
        beats: 0.5,
        gain: 0.7,
      });
    }
  }
  return t.render({ targetRms: 0.1, tailSeconds: 3 });
}

function buildPluckedPiece(): SynthesisResult {
  const t = new Timeline({ bpm: 92, beatsPerBar: 4, sampleRate: SAMPLE_RATE, humanizeSeed: 23 });
  const root = 'C3';
  const scale = SCALES.major;
  const chords = chordProgression(root, scale, [0, 4, 5, 3]);
  const melodyRoot = 'C5';
  const melodyDegrees = [0, 2, 4, 2, 0, -1, 0, 4, 2, 3, 2, 1, 0, 2, -2, 0];

  for (let bar = 0; bar < 24; bar++) {
    const chord = chords[bar % chords.length] ?? ['C3', 'E3', 'G3'];
    t.chord({
      instrument: Presets.guitar,
      notes: chord,
      bar,
      beats: 4,
      gain: 0.75,
      spread: 0.35,
    });
    t.chord({
      instrument: Presets.bassGuitar,
      notes: [chord[0] ?? 'C2'],
      bar,
      beat: 0,
      beats: 4,
      gain: 0.8,
    });

    if (bar % 4 === 0) {
      for (let i = 0; i < chord.length; i++) {
        t.note({
          instrument: Presets.harp,
          note: chord[i] ?? 'C4',
          bar,
          beat: i * 0.5,
          beats: 1.5,
          gain: 0.6,
          pan: (i - 1) * 0.2,
        });
      }
    }

    for (let step = 0; step < 8; step++) {
      const degree = melodyDegrees[(bar * 8 + step) % melodyDegrees.length];
      t.note({
        instrument: step % 6 === 0 ? Presets.mandolin : Presets.guitar,
        note: scaleDegree(melodyRoot, scale, degree),
        bar,
        beat: step * 0.5,
        beats: 0.5,
        gain: 0.7,
        pan: step % 2 === 0 ? -0.25 : 0.25,
      });
    }
  }

  return t.render({ targetRms: 0.1, tailSeconds: 3 });
}

function buildVibraphonePiece(): SynthesisResult {
  const t = new Timeline({ bpm: 78, beatsPerBar: 4, sampleRate: SAMPLE_RATE, humanizeSeed: 14 });
  const root = 'F#4';
  const scale = SCALES.major;
  const chords = chordProgression(root, scale, [0, 4, 5, 3]);
  for (let bar = 0; bar < 20; bar++) {
    t.chord({
      instrument: Presets.vibraphone,
      notes: chords[bar % chords.length],
      bar,
      beats: 4,
      gain: 0.75,
      spread: 0.35,
    });
  }
  return t.render({ targetRms: 0.1, tailSeconds: 3 });
}

function buildGlockenspielPiece(): SynthesisResult {
  const t = new Timeline({ bpm: 120, beatsPerBar: 4, sampleRate: SAMPLE_RATE, humanizeSeed: 15 });
  const root = 'C6';
  const scale = SCALES.majorPentatonic;
  const melody = [0, 2, 4, 2, 0, -1, 0, 4, 2, 3, 2, 1, 0, 2, -2, 0];
  for (let bar = 0; bar < 20; bar++) {
    for (let step = 0; step < 8; step++) {
      const degree = melody[(bar * 8 + step) % melody.length];
      t.note({
        instrument: Presets.glockenspiel,
        note: scaleDegree(root, scale, degree),
        bar,
        beat: step * 0.5,
        beats: 0.5,
        gain: 0.8,
      });
    }
  }
  return t.render({ targetRms: 0.1, tailSeconds: 2 });
}

function buildDrumPiece(): SynthesisResult {
  const t = new Timeline({ bpm: 95, beatsPerBar: 4, sampleRate: SAMPLE_RATE, humanizeSeed: 16 });
  for (let bar = 0; bar < 28; bar++) {
    t.note({ instrument: Presets.heavyDrum, note: 'A1', bar, beat: 0, beats: 0.5, gain: 1 });
    t.note({ instrument: Presets.heavyDrum, note: 'C2', bar, beat: 1, beats: 0.5, gain: 0.85 });
    t.note({ instrument: Presets.heavyDrum, note: 'A1', bar, beat: 2, beats: 0.5, gain: 0.95 });
    t.note({ instrument: Presets.heavyDrum, note: 'E2', bar, beat: 2.5, beats: 0.5, gain: 0.7 });
    t.note({ instrument: Presets.heavyDrum, note: 'A1', bar, beat: 3, beats: 0.5, gain: 0.9 });
  }
  return t.render({ targetRms: 0.1, tailSeconds: 2 });
}

function buildMellowKeysPiece(): SynthesisResult {
  const t = new Timeline({ bpm: 68, beatsPerBar: 4, sampleRate: SAMPLE_RATE, humanizeSeed: 17 });
  const root = 'C3';
  const scale = SCALES.major;
  const chords = chordProgression(root, scale, [0, 5, 3, 4]);
  for (let bar = 0; bar < 18; bar++) {
    t.chord({
      instrument: Presets.mellowKeys,
      notes: chords[bar % chords.length],
      bar,
      beats: 4,
      gain: 0.85,
      spread: 0.4,
    });
  }
  return t.render({ targetRms: 0.1, tailSeconds: 3 });
}

function buildMainMenu(): SynthesisResult {
  const t = new Timeline({ bpm: 92, beatsPerBar: 4, sampleRate: SAMPLE_RATE, humanizeSeed: 100 });
  const root = 'C3';
  const scale = SCALES.minor;
  const chords = chordProgression(root, scale, [0, 3, 4, 0]);

  for (let bar = 0; bar < 36; bar++) {
    const section = bar < 8 ? 'intro' : bar < 16 ? 'build' : bar < 28 ? 'action' : 'outro';
    const chord = chords[bar % chords.length] ?? ['C3', 'Eb3', 'G3'];

    if (section === 'intro' || section === 'build' || section === 'outro') {
      t.chord({
        instrument: section === 'build' ? Presets.mellowKeys : Presets.grandPiano,
        notes: chord,
        bar,
        beats: 4,
        gain: 0.8,
        spread: 0.35,
      });
      if (section === 'build' || section === 'outro') {
        t.chord({
          instrument: Presets.vibraphone,
          notes: chord.slice(0, 3),
          bar,
          beat: 2,
          beats: 2,
          gain: 0.55,
          spread: 0.3,
        });
        t.chord({
          instrument: Presets.harp,
          notes: chord.slice(0, 3),
          bar,
          beat: 0.25,
          beats: 1.75,
          gain: 0.45,
          spread: 0.4,
        });
      }
    }

    if (section === 'action') {
      t.chord({
        instrument: Presets.drawbarOrgan,
        notes: chord,
        bar,
        beats: 2,
        gain: 0.8,
        spread: 0.25,
      });
      t.chord({
        instrument: Presets.guitar,
        notes: chord,
        bar,
        beat: 0.25,
        beats: 1.75,
        gain: 0.7,
        spread: 0.3,
      });
      t.chord({
        instrument: Presets.bassGuitar,
        notes: [chord[0] ?? 'C2'],
        bar,
        beat: 2,
        beats: 2,
        gain: 0.9,
      });
      t.note({
        instrument: Presets.heavyDrum,
        note: 'A1',
        bar,
        beat: 0,
        beats: 0.5,
        gain: 1,
      });
      t.note({
        instrument: Presets.heavyDrum,
        note: 'A1',
        bar,
        beat: 2,
        beats: 0.5,
        gain: 0.95,
      });

      const melodyRoot = 'C5';
      const leadScale = SCALES.minorPentatonic;
      const leadDegrees = [0, 1, -1, 2, 1, 0, -2, 1];
      for (let step = 0; step < 8; step++) {
        const degree = leadDegrees[step % leadDegrees.length];
        const pick = step % 4;
        const instrument =
          pick === 0 ? Presets.glockenspiel : pick === 2 ? Presets.mandolin : Presets.brightLead;
        t.note({
          instrument,
          note: scaleDegree(melodyRoot, leadScale, degree),
          bar,
          beat: step * 0.5,
          beats: 0.5,
          gain: 0.7,
          pan: step % 2 === 0 ? -0.2 : 0.3,
        });
      }
    }
  }

  return t.render({ targetRms: 0.1, tailSeconds: 3 });
}

function buildBowedPiece(): SynthesisResult {
  const t = new Timeline({ bpm: 72, beatsPerBar: 4, sampleRate: SAMPLE_RATE, humanizeSeed: 41 });
  const root = 'D3';
  const scale = SCALES.minor;
  const chords = chordProgression(root, scale, [0, 3, 4, 0]);
  const melodyRoot = 'D4';
  const melody = [0, 2, 4, 2, 0, -1, 0, 4, 2, 3, 2, 1, 0, 2, -2, 0];

  for (let bar = 0; bar < 16; bar++) {
    const chord = chords[bar % chords.length] ?? ['D3', 'F3', 'A3'];
    t.chord({
      instrument: bar % 2 === 0 ? Presets.viola : Presets.violin,
      notes: chord.slice(0, 3),
      bar,
      beats: 4,
      gain: 0.65,
      spread: 0.3,
    });
    t.chord({
      instrument: Presets.doubleBass,
      notes: [chord[0] ?? 'D2'],
      bar,
      beat: 0,
      beats: 4,
      gain: 0.75,
    });
    const degree = melody[(bar * 2) % melody.length];
    t.note({
      instrument: bar % 3 === 0 ? Presets.cello : Presets.violin,
      note: scaleDegree(melodyRoot, scale, degree),
      bar,
      beat: 1,
      beats: 2,
      gain: 0.55,
      pan: bar % 2 === 0 ? -0.15 : 0.15,
    });
  }
  return t.render({ targetRms: 0.1, tailSeconds: 3 });
}

function buildWindPiece(): SynthesisResult {
  const t = new Timeline({ bpm: 84, beatsPerBar: 4, sampleRate: SAMPLE_RATE, humanizeSeed: 42 });
  const root = 'G3';
  const scale = SCALES.major;
  const chords = chordProgression(root, scale, [0, 4, 5, 2]);

  for (let bar = 0; bar < 16; bar++) {
    const chord = chords[bar % chords.length] ?? ['G3', 'B3', 'D4'];
    t.chord({
      instrument: bar % 2 === 0 ? Presets.flute : Presets.clarinet,
      notes: chord.slice(0, 3),
      bar,
      beats: 4,
      gain: 0.6,
      spread: 0.3,
    });
    if (bar % 4 === 0) {
      t.chord({
        instrument: Presets.bassoon,
        notes: [chord[0] ?? 'G2'],
        bar,
        beat: 0,
        beats: 4,
        gain: 0.75,
      });
    }
    if (bar % 3 === 0) {
      t.note({
        instrument: Presets.oboe,
        note: scaleDegree('G4', scale, (bar * 2) % 7),
        bar,
        beat: 2,
        beats: 1.5,
        gain: 0.55,
      });
    }
  }
  return t.render({ targetRms: 0.1, tailSeconds: 3 });
}

function buildBrassPiece(): SynthesisResult {
  const t = new Timeline({ bpm: 76, beatsPerBar: 4, sampleRate: SAMPLE_RATE, humanizeSeed: 43 });
  const root = 'Bb3';
  const scale = SCALES.major;
  const chords = chordProgression(root, scale, [0, 4, 5, 3]);

  for (let bar = 0; bar < 16; bar++) {
    const chord = chords[bar % chords.length] ?? ['Bb3', 'D4', 'F4'];
    t.chord({
      instrument: bar % 2 === 0 ? Presets.trumpet : Presets.frenchHorn,
      notes: chord.slice(0, 3),
      bar,
      beats: 4,
      gain: 0.55,
      spread: 0.25,
    });
    t.chord({
      instrument: Presets.tuba,
      notes: [chord[0] ?? 'Bb1'],
      bar,
      beat: 0,
      beats: 4,
      gain: 0.8,
    });
    if (bar % 4 === 0) {
      t.note({
        instrument: Presets.trombone,
        note: scaleDegree('Bb4', scale, (bar * 2) % 7),
        bar,
        beat: 2,
        beats: 1,
        gain: 0.6,
      });
    }
  }
  return t.render({ targetRms: 0.1, tailSeconds: 3 });
}

function buildChoirPiece(): SynthesisResult {
  const t = new Timeline({ bpm: 60, beatsPerBar: 4, sampleRate: SAMPLE_RATE, humanizeSeed: 44 });
  const root = 'C3';
  const scale = SCALES.major;
  const chords = chordProgression(root, scale, [0, 5, 3, 4]);

  for (let bar = 0; bar < 12; bar++) {
    const chord = chords[bar % chords.length] ?? ['C3', 'E3', 'G3'];
    t.chord({
      instrument: Presets.soprano,
      notes: chord.slice(0, 3).map((n) => scaleDegree(n, scale, 0)),
      bar,
      beats: 4,
      gain: 0.45,
      spread: 0.4,
    });
    t.chord({
      instrument: Presets.alto,
      notes: [chord[0] ?? 'C3'],
      bar,
      beat: 0,
      beats: 4,
      gain: 0.5,
    });
    t.chord({
      instrument: Presets.tenor,
      notes: [chord[2] ?? 'G3'],
      bar,
      beat: 0,
      beats: 4,
      gain: 0.5,
    });
    t.chord({
      instrument: Presets.bassChoir,
      notes: [chord[0] ?? 'C2'],
      bar,
      beat: 0,
      beats: 4,
      gain: 0.65,
    });
  }
  return t.render({ targetRms: 0.1, tailSeconds: 4 });
}

const TRACKS: { name: string; builder: () => SynthesisResult; actionRange?: [number, number] }[] = [
  { name: '1-org-gecit', builder: buildOrganPiece },
  { name: '2-piyano-gecesi', builder: buildPianoPiece },
  { name: '3-tellerin-hikayesi', builder: buildPluckedPiece },
  { name: '4-vibrafon-gece', builder: buildVibraphonePiece },
  { name: '5-glockenspiel-muzik-kutusu', builder: buildGlockenspielPiece },
  { name: '6-davul-yuruyus', builder: buildDrumPiece },
  { name: '7-klavye-safak', builder: buildMellowKeysPiece },
  { name: '8-yayli-safak', builder: buildBowedPiece },
  { name: '9-ufleme-yeli', builder: buildWindPiece },
  { name: '10-bakir-ates', builder: buildBrassPiece },
  { name: '11-koro-daglar', builder: buildChoirPiece },
  { name: 'ANA-MENU-esik', builder: buildMainMenu, actionRange: [34, 74] },
];

async function main() {
  console.log('Müzik parçaları üretiliyor...');
  for (const { name, builder, actionRange } of TRACKS) {
    const result = builder();
    verifyTrack({ name, result }, actionRange);
    // WAV üretiminin kaynak-doğrusu (byte-eş deterministik) olduğu, OGG'nin
    // ise FFmpeg/libvorbis sürümüne göre değişebileceği varsayılır. QA, OGG
    // üzerinde koşar çünkü gönderilecek format OGG'dir.
    writeWav(`${OUT_DIR}/${name}.wav`, result);
    writeOgg(`${OUT_DIR}/${name}.ogg`, result, { quality: 8 });
  }
  console.log('Tüm parçalar export/ altına yazıldı.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
