import { describe, expect, it } from 'vitest';

import { Arrange, Presets } from '../src/index';

const { noteToHz, transposeNote, SCALES, scaleDegree, scaleChord } = Arrange;
const { measureRms, measurePeak, softLimit, matchLoudness, Timeline } = Arrange;

describe('perde sözlüğü', () => {
  it('referans perde ve oktav ilişkisi doğru', () => {
    expect(noteToHz('A4')).toBeCloseTo(440, 6);
    expect(noteToHz('A5')).toBeCloseTo(880, 6);
    expect(noteToHz('A3')).toBeCloseTo(220, 6);
    // Bilimsel gösterim: oktav C'de artar, yani B3'ün yarım ton üstü C4'tür.
    expect(noteToHz('C4')).toBeCloseTo(261.6256, 3);
    expect(noteToHz('C4') / noteToHz('B3')).toBeCloseTo(Math.pow(2, 1 / 12), 6);
  });

  it('bemol ve diyez aynı perdeye düşer', () => {
    expect(noteToHz('C#4')).toBeCloseTo(noteToHz('Db4'), 9);
    expect(noteToHz('A#2')).toBeCloseTo(noteToHz('Bb2'), 9);
  });

  it('geçersiz nota adı SESSİZCE kabul edilmez', () => {
    expect(() => noteToHz('H4')).toThrow(TypeError);
    expect(() => noteToHz('C')).toThrow(TypeError);
    expect(() => noteToHz('')).toThrow(TypeError);
  });

  it('öteleme oktav sınırını doğru geçer', () => {
    expect(transposeNote('B3', 1)).toBe('C4');
    expect(transposeNote('C4', -1)).toBe('B3');
    expect(transposeNote('A4', 12)).toBe('A5');
    expect(noteToHz(transposeNote('D3', 7)) / noteToHz('D3')).toBeCloseTo(Math.pow(2, 7 / 12), 9);
  });

  it('derece dizinin dışına taşınca OKTAV atlar', () => {
    expect(scaleDegree('C4', SCALES.major, 0)).toBe('C4');
    expect(scaleDegree('C4', SCALES.major, 7)).toBe('C5');
    expect(scaleDegree('C4', SCALES.major, -7)).toBe('C3');
    expect(scaleDegree('C4', SCALES.major, 2)).toBe('E4');
  });

  it('akor dizinin RENGİNİ alır: majörün ikinci derecesi minördür', () => {
    const tonic = scaleChord('C4', SCALES.major, 0);
    const second = scaleChord('C4', SCALES.major, 1);
    const third = (chord: string[]) =>
      Math.round(12 * Math.log2(noteToHz(chord[1]) / noteToHz(chord[0])));

    expect(third(tonic), 'majör üçlü 4 yarım ton').toBe(4);
    expect(third(second), 'minör üçlü 3 yarım ton').toBe(3);
  });

  it('akor yığma dizi DIŞI ses üretmez', () => {
    const scale = SCALES.dorian;
    const pitchClasses = new Set(
      Array.from({ length: 24 }, (_, i) => scaleDegree('D3', scale, i - 12)).map((n) =>
        Math.round(12 * Math.log2(noteToHz(n) / noteToHz('D3'))),
      ),
    );
    for (const note of scaleChord('D3', scale, 3, 4)) {
      const semitone = Math.round(12 * Math.log2(noteToHz(note) / noteToHz('D3')));
      expect(pitchClasses.has(semitone), `${note} dizi dışında`).toBe(true);
    }
  });
});

describe('yükseklik eşitleme', () => {
  const sine = (amplitude: number, length = 44100): Float32Array =>
    Float32Array.from({ length }, (_, i) => amplitude * Math.sin((2 * Math.PI * 220 * i) / 44100));

  it('sınırlayıcı eşiğin ALTINA dokunmaz', () => {
    for (const v of [0, 0.1, 0.5, 0.69, -0.69]) expect(softLimit(v, 0.7)).toBeCloseTo(v, 9);
  });

  it('sınırlayıcı tavanı aştırmaz ve işareti korur', () => {
    for (const v of [0.8, 1.5, 5, 50, -50]) {
      const limited = softLimit(v, 0.7, 0.28);
      expect(Math.abs(limited)).toBeLessThan(0.7 + 0.28);
      expect(Math.sign(limited)).toBe(Math.sign(v));
    }
  });

  it('SESSİZ ve YÜKSEK kayıt aynı yüksekliğe gelir', () => {
    const quiet = [sine(0.05)];
    const loud = [sine(0.8)];
    matchLoudness(quiet, { targetRms: 0.1 });
    matchLoudness(loud, { targetRms: 0.1 });

    // Tepeye göre normalize etmek bu ikisini eşitlemezdi; RMS eşitler.
    expect(measureRms(quiet)).toBeCloseTo(measureRms(loud), 2);
    expect(measureRms(loud)).toBeCloseTo(0.1, 2);
  });

  it('tavan hiçbir koşulda aşılmaz', () => {
    const hot = [sine(3)];
    matchLoudness(hot, { targetRms: 0.4, ceiling: 0.95 });
    expect(measurePeak(hot)).toBeLessThanOrEqual(0.95);
  });

  it('targetRms 0 "dokunma" demektir, "sustur" değil', () => {
    const signal = [sine(0.3)];
    const before = measureRms(signal);
    matchLoudness(signal, { targetRms: 0 });
    // Ölçüyü kendi yapan bir çağıran burada ölçeklenmek istemez; 0'ı sadık
    // uygulamak sesini yok ederdi.
    expect(measureRms(signal)).toBeCloseTo(before, 6);
  });

  it('neredeyse sessiz kayıt SINIRSIZ yükseltilmez', () => {
    const nearSilent = [sine(1e-6)];
    matchLoudness(nearSilent, { targetRms: 0.1, maxGain: 6 });
    // Zemin gürültüsünü hedefe kadar yükseltmek sesi değil gürültüyü büyütür.
    expect(measurePeak(nearSilent)).toBeLessThan(1e-5);
  });
});

describe('zaman çizelgesi', () => {
  const timeline = (seed = 7) =>
    new Timeline({ bpm: 120, beatsPerBar: 4, humanizeSeed: seed, sampleRate: 22050 });

  it('bozuk tempo SESSİZCE kabul edilmez', () => {
    expect(() => new Timeline({ bpm: 0, beatsPerBar: 4 })).toThrow(TypeError);
    expect(() => new Timeline({ bpm: Number.NaN, beatsPerBar: 4 })).toThrow(TypeError);
    expect(() => new Timeline({ bpm: 120, beatsPerBar: -1 })).toThrow(TypeError);
  });

  it('boş çizelge render EDİLEMEZ', () => {
    expect(() => timeline().render()).toThrow(TypeError);
  });

  it('bozuk olay EKLENİRKEN reddedilir, render sırasında değil', () => {
    const t = timeline();
    const base = { instrument: Presets.marimba, note: 'C4', bar: 0, beats: 1 };
    // Yüzlerce nota arasında hangi olayın bozuk olduğunu render hatasından
    // bulmak aramak demektir; hata olayın eklendiği yerde çıkar.
    expect(() => t.note({ ...base, note: 'H4' })).toThrow(TypeError);
    expect(() => t.note({ ...base, beats: 0 })).toThrow(TypeError);
    expect(() => t.note({ ...base, beats: Number.NaN })).toThrow(TypeError);
    expect(() => t.note({ ...base, bar: Number.POSITIVE_INFINITY })).toThrow(TypeError);
    expect(() =>
      t.note({ ...base, instrument: undefined as unknown as Arrange.InstrumentFn }),
    ).toThrow(TypeError);
    expect(() => t.chord({ ...base, notes: [] })).toThrow(TypeError);
    expect(t.length, 'reddedilen olay çizelgeye girmemeli').toBe(0);
  });

  it('yanlış yazılmış dizi adı ANLAŞILIR hata verir', () => {
    const wrong = (SCALES as Record<string, readonly number[]>).minorPent;
    expect(wrong).toBeUndefined();
    expect(() => scaleDegree('C4', wrong, 0)).toThrow(TypeError);
  });

  it('ölçü ve vuruş saniyeye doğru çevrilir', () => {
    const t = timeline();
    expect(t.beatsToSeconds(1)).toBeCloseTo(0.5, 9);
    expect(t.positionToSeconds(2, 0)).toBeCloseTo(4, 9);
    expect(t.positionToSeconds(0, 1.5)).toBeCloseTo(0.75, 9);
  });

  it('ÇOK SESLİDİR: üst üste binen notalar toplanır', () => {
    const single = timeline();
    single.note({ instrument: Presets.marimba, note: 'C4', bar: 0, beats: 1, gain: 0.5 });

    const stacked = timeline();
    stacked.chord({
      instrument: Presets.marimba,
      notes: ['C4', 'E4', 'G4'],
      bar: 0,
      beats: 1,
      gain: 0.5,
    });

    expect(single.length).toBe(1);
    expect(stacked.length).toBe(3);

    // Toplama gerçekten oluyorsa akorun enerjisi tek notanınkinden fazladır.
    // Karşılaştırma yükseklik eşitlemesinden ÖNCEKİ hâl üzerinde anlamlı
    // olacağı için eşitleme kapatılır.
    const one = single.render({ targetRms: 0, tailSeconds: 0.5 });
    const three = stacked.render({ targetRms: 0, tailSeconds: 0.5 });
    expect(measureRms(three.channels)).toBeGreaterThan(measureRms(one.channels) * 1.4);
  });

  it('DETERMİNİSTİKTİR: aynı tohum aynı örnekleri verir', () => {
    const build = (seed: number) => {
      const t = timeline(seed);
      for (let bar = 0; bar < 2; bar++) {
        t.note({ instrument: Presets.marimba, note: 'D4', bar, beats: 1, gain: 0.6 });
        t.note({ instrument: Presets.glockenspiel, note: 'D6', bar, beat: 2, beats: 1, gain: 0.4 });
      }
      return t.render({ tailSeconds: 0.5 });
    };

    const a = build(7).channels[0];
    const b = build(7).channels[0];
    expect(a.length).toBe(b.length);
    let differing = 0;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) differing++;
    expect(differing).toBe(0);

    // Farklı tohum farklı sapma üretmeli; aksi hâlde insanlaştırma ölüdür.
    const c = build(99).channels[0];
    let sameSeedDiff = 0;
    for (let i = 0; i < Math.min(a.length, c.length); i++) if (a[i] !== c[i]) sameSeedDiff++;
    expect(sameSeedDiff).toBeGreaterThan(0);
  });

  it('PAN stereo alana gerçekten yayar', () => {
    const build = (pan: number) => {
      const t = timeline();
      t.note({ instrument: Presets.marimba, note: 'C4', bar: 0, beats: 1, gain: 0.6, pan });
      return t.render({ tailSeconds: 0.5, targetRms: 0 });
    };

    const left = build(-1);
    const right = build(1);
    expect(measureRms([left.channels[0]])).toBeGreaterThan(measureRms([left.channels[1]]) * 1.5);
    expect(measureRms([right.channels[1]])).toBeGreaterThan(measureRms([right.channels[0]]) * 1.5);
  });

  function buildBarMix() {
    const t = timeline();
    t.chord({
      instrument: Presets.mellowKeys,
      notes: scaleChord('C3', SCALES.major, 0, 3),
      bar: 0,
      beats: 4,
      gain: 0.5,
      spread: 0.4,
    });
    t.note({ instrument: Presets.heavyDrum, note: 'A1', bar: 0, beats: 2, gain: 0.6 });
    return t.render({ targetRms: 0.1 });
  }

  it('çıkış stereo: iki kanal üretir', () => {
    const out = buildBarMix();
    expect(out.channels).toHaveLength(2);
  });

  it('çıkış tavan ve RMS hedefi içinde', () => {
    const out = buildBarMix();
    expect(measurePeak(out.channels)).toBeLessThanOrEqual(0.95);
    expect(measureRms(out.channels)).toBeGreaterThan(0.05);
  });

  it('çıkış SIFIRDA biter', () => {
    const out = buildBarMix();
    for (const channel of out.channels) {
      expect(Math.abs(channel[channel.length - 1])).toBeLessThan(0.001);
    }
  });

  it('sondaki ÖLÜ SESSİZLİK kırpılır', () => {
    const build = (trim: boolean) => {
      const t = timeline();
      t.note({ instrument: Presets.marimba, note: 'C4', bar: 0, beats: 1, gain: 0.6 });
      return t.render({ tailSeconds: 8, trimSilence: trim });
    };
    const trimmed = build(true);
    const kept = build(false);

    // 8 saniyelik pay istendi ama nota çok daha erken bitiyor; kırpma açıkken
    // dosya sonunda ölü hava kalmamalı.
    expect(trimmed.duration).toBeLessThan(kept.duration * 0.7);
    expect(trimmed.duration).toBeGreaterThan(0.3);
  });
});
