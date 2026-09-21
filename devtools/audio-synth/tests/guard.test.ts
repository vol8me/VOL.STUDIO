import { describe, expect, it } from 'vitest';

import {
  BiquadFilter,
  Chorus,
  DelayLine,
  Distortion,
  Envelope,
  Flanger,
  PhaserEffect,
  Reverb,
  StereoWidener,
  createFilter,
  getPanGains,
  synthesize,
} from '../src/index';
import type { SynthParams } from '../src/types';
import type { AudioParamIssue } from '../src/guard/errors';

/**
 * Render sınırı: iç içe parametre bozukluğu DSP'ye girmeden, alanın TAM
 * yoluyla reddedilir. Eskiden `reverb.decay: NaN` zincirin içinde yayılıyor
 * ve ancak writer "sonlu olmayan örnek" dediğinde fark ediliyordu — hangi
 * alanın bozuk olduğu hatadan okunamıyordu.
 */

const BASE: SynthParams = { wave: 'sine', frequency: 220, duration: 0.05 };

function rejects(overrides: Partial<SynthParams>, path: string, issue: AudioParamIssue): void {
  expect(() => synthesize({ ...BASE, ...overrides } as SynthParams), path).toThrow(
    expect.objectContaining({ name: 'AudioParamError', path, issue }),
  );
}

describe('iç içe parametre sınırı — synthesize', () => {
  it('reverb', () => {
    rejects({ reverb: { decay: Number.NaN } }, 'reverb.decay', 'non-finite');
    rejects({ reverb: { decay: 0 } }, 'reverb.decay', 'range');
    rejects({ reverb: { decay: 120 } }, 'reverb.decay', 'range');
    rejects({ reverb: { amount: 1.2 } }, 'reverb.amount', 'range');
    rejects({ reverb: { preDelay: -0.01 } }, 'reverb.preDelay', 'range');
    rejects({ reverb: { decy: 2 } as never }, 'reverb.decy', 'unknown-key');
  });

  it('delay', () => {
    rejects({ delay: {} as never }, 'delay.time', 'required');
    rejects({ delay: { time: Number.NaN } }, 'delay.time', 'non-finite');
    rejects({ delay: { time: 0.2, feedback: 1.5 } }, 'delay.feedback', 'range');
  });

  it('distortion', () => {
    rejects(
      { distortion: { amount: Number.POSITIVE_INFINITY } },
      'distortion.amount',
      'non-finite',
    );
    rejects({ distortion: { amount: 0.5, type: 'fuzz' as never } }, 'distortion.type', 'type');
  });

  it('modülasyon efektleri', () => {
    rejects({ flanger: { rate: Number.POSITIVE_INFINITY } }, 'flanger.rate', 'non-finite');
    rejects({ flanger: { time: 1, depth: 2 } }, 'flanger.depth', 'combination');
    rejects({ chorus: { mix: -0.1 } }, 'chorus.mix', 'range');
    rejects({ phaser: { stages: 2.5 } }, 'phaser.stages', 'type');
    rejects({ phaser: { minFreq: 900, maxFreq: 400 } }, 'phaser.maxFreq', 'combination');
  });

  it('stereo ve pan', () => {
    rejects({ stereoWidth: 3 }, 'stereoWidth', 'range');
    rejects({ stereoWidth: { width: Number.NaN } }, 'stereoWidth.width', 'non-finite');
    rejects({ pan: 2 }, 'pan', 'range');
  });

  it('zarf — kök ve iç içe yuvalar', () => {
    rejects({ envelope: { attack: -1 } }, 'envelope.attack', 'range');
    rejects({ envelope: { sustainLevel: 2 } }, 'envelope.sustainLevel', 'range');
    rejects({ envelope: { curve: 'log' as never } }, 'envelope.curve', 'type');
    rejects(
      { lowpass: { cutoff: 800, envelope: { release: Number.NaN } } },
      'lowpass.envelope.release',
      'non-finite',
    );
    rejects(
      { fm: { index: 2, modulatorEnvelope: { attack: Number.NaN } } },
      'fm.modulatorEnvelope.attack',
      'non-finite',
    );
  });

  it('filtre', () => {
    rejects({ lowpass: { cutoff: 0 } }, 'lowpass.cutoff', 'range');
    rejects(
      { highpass: { cutoff: 80, resonance: Number.NaN } },
      'highpass.resonance',
      'non-finite',
    );
    rejects({ lowpass: { cutoff: 800, poles: 3 as never } }, 'lowpass.poles', 'type');
    rejects(
      { lowpass: { cutoff: 800, type: 'bandpass', poles: 1 } },
      'lowpass.type',
      'combination',
    );
    // `poles` verilmez ve rezonans 0 ise varsayılan 1 kutuptur — bant geçiren
    // sessizce alçak geçirene düşmez.
    rejects({ lowpass: { cutoff: 800, type: 'notch' } }, 'lowpass.type', 'combination');
  });

  it('sample', () => {
    rejects({ sample: { data: 'wav' as never } }, 'sample.data', 'type');
    rejects(
      { sample: { data: new Float32Array([0, 0.1, 0.2, Number.NaN]) } },
      'sample.data[3]',
      'non-finite',
    );
    rejects(
      { sample: { data: new Float32Array(8), pitchShift: Number.NaN } },
      'sample.pitchShift',
      'non-finite',
    );
    rejects(
      { sample: { data: new Float32Array(8), trim: { start: -1 } } },
      'sample.trim.start',
      'range',
    );
    rejects(
      { sample: { data: new Float32Array(8), envelope: { decay: Number.NaN } } },
      'sample.envelope.decay',
      'non-finite',
    );
  });

  it('FM, LFO, harmonik, pitchJump', () => {
    rejects({ fm: { index: Number.NaN } }, 'fm.index', 'non-finite');
    rejects({ fm: { index: 2, feedback: 2 } }, 'fm.feedback', 'range');
    rejects(
      {
        lfos: [
          { target: 'pitch', rate: 3, depth: 2 },
          { target: 'filter', rate: Infinity, depth: 1 },
        ],
      },
      'lfos[1].rate',
      'non-finite',
    );
    rejects({ lfos: [{ target: 'volume' as never, rate: 1, depth: 1 }] }, 'lfos[0].target', 'type');
    rejects({ lfos: [{ target: 'amplitude', rate: 1, depth: 2 }] }, 'lfos[0].depth', 'range');
    rejects(
      {
        harmonics: [
          { ratio: 1, gain: 1 },
          { ratio: 2, gain: Number.NaN },
        ],
      },
      'harmonics[1].gain',
      'non-finite',
    );
    rejects({ harmonics: [{ ratio: 0, gain: 1 }] }, 'harmonics[0].ratio', 'range');
    rejects({ pitchJump: { amount: 100, time: 2 } }, 'pitchJump.time', 'range');
  });

  it('bilinmeyen üst düzey alan yazım hatası sayılır', () => {
    rejects({ reverbAmount: 0.3 } as never, 'reverbAmount', 'unknown-key');
  });

  it('doğrulama kaynak bütçesinden ve tampon ayırmadan ÖNCE gelir', () => {
    // Bu render bütçeyi (ve belleği) katbekat aşardı; bozuk alan yine de
    // bütçe hatasından önce, adıyla raporlanır.
    rejects(
      { duration: 590, sampleRate: 384000, reverb: { decay: Number.NaN } },
      'reverb.decay',
      'non-finite',
    );
  });
});

describe('iç içe parametre sınırı — doğrudan kurulan sınıflar', () => {
  const SR = 44100;
  const cases: [string, () => unknown, string][] = [
    ['Reverb', () => new Reverb({ decay: Number.NaN }, SR), 'reverb.decay'],
    ['DelayLine', () => new DelayLine({ time: Number.NaN }, SR), 'delay.time'],
    ['Distortion', () => new Distortion({ amount: Number.NaN }), 'distortion.amount'],
    ['Chorus', () => new Chorus({ rate: Number.NaN }, SR), 'chorus.rate'],
    ['Flanger', () => new Flanger({ feedback: Number.NaN }, SR), 'flanger.feedback'],
    ['PhaserEffect', () => new PhaserEffect({ mix: Number.NaN }, SR), 'phaser.mix'],
    ['StereoWidener', () => new StereoWidener(Number.NaN), 'stereoWidth'],
    ['getPanGains', () => getPanGains(Number.NaN), 'pan'],
    ['Envelope', () => new Envelope({ attack: Number.NaN }, 1), 'envelope.attack'],
    ['BiquadFilter', () => new BiquadFilter(SR, 'lowpass', Number.NaN), 'BiquadFilter.q'],
    ['Reverb örnek oranı', () => new Reverb({}, Number.NaN), 'sampleRate'],
  ];

  it.each(cases)('%s NaN girdiyi adıyla reddeder', (_name, build, path) => {
    expect(build).toThrow(expect.objectContaining({ name: 'AudioParamError', path }));
  });
});

describe('filtre tipi kutup sayısından bağımsızdır', () => {
  const SR = 44100;

  function dcResponse(filter: ReturnType<typeof createFilter>): number {
    let y = 0;
    for (let i = 0; i < SR; i++) y = filter!.process(1, 1000);
    return y;
  }

  it('1 kutuplu yuvaya istenen tip kurulur — sessiz yuva tipine düşmez', () => {
    // Eskiden `lowpass` yuvasında 1 kutup, `type` okunmadan alçak geçiren
    // kuruyordu. DC yanıtı tipi ayırt eder: alçak geçiren DC'yi geçirir,
    // yüksek geçiren söndürür.
    const high = createFilter({ cutoff: 1000, type: 'highpass', poles: 1 }, SR, 'lowpass');
    const low = createFilter({ cutoff: 1000, poles: 1 }, SR, 'lowpass');
    expect(dcResponse(high)).toBeLessThan(1e-3);
    expect(dcResponse(low)).toBeGreaterThan(0.999);
  });

  it('bant geçiren 1 kutupla istenirse kurulmaz', () => {
    expect(() => createFilter({ cutoff: 1000, type: 'bandpass', poles: 1 }, SR, 'lowpass')).toThrow(
      expect.objectContaining({ path: 'lowpass.type', issue: 'combination' }),
    );
  });
});
