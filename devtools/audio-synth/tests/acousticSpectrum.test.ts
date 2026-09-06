import { describe, expect, it } from 'vitest';

import { Presets, pluck, synthesize } from '../src/index';
import type { SynthParams } from '../src/types';

/**
 * Akustik presetlerin İDDİALARINI ölçer.
 *
 * Bir preset yalnız "hata vermeden sentezleniyor" diye doğru değildir: sayıları
 * uydurulmuş bir harmonik dizisi de hatasız sentezlenir. Bu dosya her presetin
 * belgelenmiş kısmi ton yapısını sesin KENDİSİNDE arar — glockenspiel'in
 * modları gerçekten harmonik değil mi, klavsenin 7. harmoniği gerçekten çukurda
 * mı, orgun seviyesi gerçekten sönümsüz mü.
 *
 * Ölçüm Goertzel ile yapılır, FFT ile değil: tek bir hedef frekansın enerjisi
 * soruluyor ve Goertzel bunu tam o frekansta, kutu (bin) yuvarlamasına
 * düşmeden verir. Kısmi tonların çoğu tam sayı katı DEĞİL (2,76 · 5,40 · 8,93)
 * ve bir FFT kutusuna oturmazlar.
 */

/** Hedef frekanstaki enerji (Goertzel). Kutu hizalaması gerektirmez. */
function toneEnergy(samples: Float32Array, sampleRate: number, frequency: number): number {
  const omega = (2 * Math.PI * frequency) / sampleRate;
  const coeff = 2 * Math.cos(omega);
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < samples.length; i++) {
    const s0 = samples[i] + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - coeff * s1 * s2)) / samples.length;
}

/** Sesin ilk yarısı: sönümlü presetlerde üst tonlar orada henüz yaşıyor. */
function head(samples: Float32Array): Float32Array {
  return samples.subarray(0, Math.floor(samples.length / 2));
}

function render(params: SynthParams): { samples: Float32Array; sampleRate: number } {
  const result = synthesize(params);
  const samples = result.channels[0];
  if (!samples) throw new Error('kanal yok');
  return { samples, sampleRate: result.sampleRate };
}

/** Pencere başına RMS — zarfın zaman içindeki seyri. */
function rmsEnvelope(samples: Float32Array, windowSize: number): number[] {
  const out: number[] = [];
  for (let start = 0; start + windowSize <= samples.length; start += windowSize) {
    let sum = 0;
    for (let i = start; i < start + windowSize; i++) sum += samples[i] * samples[i];
    out.push(Math.sqrt(sum / windowSize));
  }
  return out;
}

/**
 * Verilen orandaki dalgalanmanın derinliği: PERİYOT İÇİ tepe-dip ortalaması.
 *
 * Zarf spektrumuna bakmak burada işe yaramaz — sönüm ve reverb kabarması düşük
 * frekansları doldurup LFO'yu gömer (ölçüldü). Periyot içinde bakmak yavaş
 * sürüklenmeyi dışarıda bırakır.
 *
 * Analiz penceresi 20 ms: en pes kısmi tonun periyodundan UZUN (yoksa dalga
 * biçiminin kendisi ölçülür) ve LFO periyodundan KISA (yoksa dalgalanma
 * ortalamaya gömülür). İkisini de karıştırmak bir tur ölçümü çöpe attı.
 */
function rippleDepth(params: SynthParams, rateHz: number, fromSec: number, toSec: number): number {
  const { samples, sampleRate } = render(params);
  const windowSize = Math.floor(sampleRate / 50);
  const env = rmsEnvelope(samples, windowSize);
  const perPeriod = sampleRate / windowSize / rateHz;
  const start = Math.floor((fromSec * sampleRate) / windowSize);
  const end = Math.min(env.length, Math.floor((toSec * sampleRate) / windowSize));

  const ratios: number[] = [];
  for (let i = start; i + perPeriod <= end; i += perPeriod) {
    const period = env.slice(Math.floor(i), Math.floor(i + perPeriod)).filter((v) => v > 0);
    if (period.length < 4) continue;
    const hi = Math.max(...period);
    if (hi > 0) ratios.push(1 - Math.min(...period) / hi);
  }
  return ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : 0;
}

describe('akustik presetler — kısmi ton yapısı ölçülür', () => {
  const names = [
    'drawbarOrgan',
    'harpsichord',
    'marimba',
    'vibraphone',
    'glockenspiel',
    'heavyDrum',
    'mellowKeys',
    'guitar',
    'bassGuitar',
    'harp',
    'mandolin',
  ];

  // Her preset kendi testinde incelenir; tek bir döngüde hepsini sentezlemek
  // paralel yükte zaman aşımına düşürdü (ölçüldü: 9,5 sn). Tarama düz
  // döngüde yapılır, örnek başına `expect` çağrılmaz.
  it.each(names)('%s sınır içinde kalır ve sonlu örnek üretir', (name) => {
    const { samples } = render(Presets.getPreset(name));
    let peak = 0;
    let nonFinite = 0;
    for (const value of samples) {
      if (!Number.isFinite(value)) nonFinite++;
      else peak = Math.max(peak, Math.abs(value));
    }
    expect(nonFinite, `${name} sonlu olmayan örnek üretti`).toBe(0);
    expect(peak, `${name} kırpıyor`).toBeLessThan(1);
    expect(peak, `${name} sessiz`).toBeGreaterThan(0.01);
  });

  it('aynı parametreler aynı örnekleri verir', () => {
    const first = render(Presets.marimba()).samples;
    const second = render(Presets.marimba()).samples;
    expect(Array.from(first)).toEqual(Array.from(second));
  });

  it('org 16′ kolunu GERÇEKTEN çalar: yarım frekansta enerji var', () => {
    const f0 = 220;
    const { samples, sampleRate } = render(Presets.drawbarOrgan(f0));
    const sub = toneEnergy(samples, sampleRate, f0 / 2);
    const fundamental = toneEnergy(samples, sampleRate, f0);

    // 16′ kolu temelin altında ayrı bir ses üretir; oranı düşerse kayıtlama
    // sessizce sıradan bir additive pad'e dönüşmüş demektir.
    expect(sub / fundamental).toBeGreaterThan(0.25);
  });

  it('org SÖNÜMSÜZDÜR: ortadaki seviye başlangıçtakine yakın', () => {
    const { samples, sampleRate } = render(Presets.drawbarOrgan(220, 1.6));
    const env = rmsEnvelope(samples, Math.floor(sampleRate * 0.05));
    const early = env[2];
    const middle = env[Math.floor(env.length / 2)];

    // Marimba karşılaştırması: aynı ölçüde sönümlü bir preset burada çok düşer.
    const mallet = render(Presets.marimba(220, 1.6));
    const malletEnv = rmsEnvelope(mallet.samples, Math.floor(mallet.sampleRate * 0.05));
    const malletRatio = malletEnv[Math.floor(malletEnv.length / 2)] / malletEnv[2];

    expect(middle / early, 'org sönümleniyor').toBeGreaterThan(0.6);
    expect(malletRatio, 'karşılaştırma geçersiz: marimba da sönümsüz çıktı').toBeLessThan(0.3);
  });

  it('klavsenin 7. harmoniği ÇUKURDA: koparma noktasının tarak etkisi', () => {
    const f0 = 330;
    const { samples, sampleRate } = render(Presets.harpsichord(f0));
    const partial = (n: number) => toneEnergy(head(samples), sampleRate, f0 * n);

    // Komşularının ikisinden de belirgin biçimde zayıf olmalı; yalnız "küçük"
    // olması yetmez, çünkü üst harmonikler zaten doğal olarak azalır.
    expect(partial(7)).toBeLessThan(partial(6) * 0.4);
    expect(partial(7)).toBeLessThan(partial(8) * 0.4);
  });

  it('marimba 4:1 AKORTLUDUR: 4. kat güçlü, 2. ve 3. kat yok', () => {
    const f0 = 262;
    const { samples, sampleRate } = render(Presets.marimba(f0));
    const partial = (n: number) => toneEnergy(head(samples), sampleRate, f0 * n);

    expect(partial(4)).toBeGreaterThan(partial(1) * 0.05);
    // Oyulmuş çubuğun imzası: aradaki katlar BOŞ. Dolarsa preset sıradan bir
    // harmonik yığınına dönmüştür.
    expect(partial(2)).toBeLessThan(partial(4) * 0.5);
    expect(partial(3)).toBeLessThan(partial(4) * 0.5);
  });

  it('vibrafonun TREMOLOSU gerçekten çalıyor', () => {
    const vibes = Presets.vibraphone(349, 2.4);

    // Kontrol, aynı presetin LFO'su ÇIKARILMIŞ hâlidir: tek fark tremolo
    // olsun ki ölçülen fark başka bir şeye yorulamasın. Marimba ile
    // karşılaştırmak yanlıştı — onun zarfı da, süresi de farklı.
    const withLfo = rippleDepth(vibes, 5.5, 0.7, 1.5);
    const without = rippleDepth({ ...vibes, lfos: undefined }, 5.5, 0.7, 1.5);

    expect(without, 'kontrol dalgalanıyor: karşılaştırma anlamsız').toBeLessThan(0.05);
    expect(withLfo, 'tremolo enstrümanın imzası olacak kadar derin değil').toBeGreaterThan(0.15);
  });

  it('davulun PERDESİ düşer: vuruş anındaki temel, gövdedekinden tiz', () => {
    const f0 = 78;
    const { samples, sampleRate } = render(Presets.heavyDrum(f0, 1.1));
    const window = (from: number, to: number) =>
      samples.subarray(Math.floor(from * sampleRate), Math.floor(to * sampleRate));

    const attack = window(0, 0.04);
    const body = window(0.3, 0.6);

    // Deri vurulduğu an gerilir, gevşerken perde iner: "tok" hissini yapan
    // budur. Vuruşta temel baskın, gövdede ondan PES bir bileşen baskın olmalı.
    expect(toneEnergy(attack, sampleRate, f0)).toBeGreaterThan(
      toneEnergy(attack, sampleRate, f0 * 0.83),
    );
    expect(toneEnergy(body, sampleRate, f0 * 0.83)).toBeGreaterThan(
      toneEnergy(body, sampleRate, f0) * 3,
    );
  });

  it('davulun vuruş GÜRÜLTÜSÜ hızla boğulur', () => {
    const { samples, sampleRate } = render(Presets.heavyDrum(78, 1.1));
    const upperBand = (from: number, to: number) => {
      const seg = samples.subarray(Math.floor(from * sampleRate), Math.floor(to * sampleRate));
      return [2000, 4000, 7000].reduce((sum, f) => sum + toneEnergy(seg, sampleRate, f), 0);
    };

    // Sopa temasından sonra geriye yalnız gövde kalmalı; kalmazsa vuruş bir
    // "şşş" kuyruğu bırakır ve davul ağırlığını kaybeder.
    expect(upperBand(0, 0.02)).toBeGreaterThan(upperBand(0.2, 0.5) * 50);
  });

  it('yumuşak klavye SİNÜSE yakındır', () => {
    const f0 = 262;
    const { samples, sampleRate } = render(Presets.mellowKeys(f0));
    const seg = samples.subarray(Math.floor(0.2 * sampleRate), Math.floor(1.4 * sampleRate));
    const partial = (n: number) => toneEnergy(seg, sampleRate, f0 * n);

    // Üst tonlar güçlenirse ses elektrikli piyanoya kayar.
    expect(partial(2)).toBeLessThan(partial(1) * 0.4);
    expect(partial(3)).toBeLessThan(partial(1) * 0.3);
  });

  it('yumuşak klavyenin AKORTSUZLUĞU beklenen hızda vurum üretir', () => {
    const f0 = 262;
    const params = Presets.mellowKeys(f0);
    // 7 sent, 262 Hz'de: 262 * (2^(7/1200) - 1) ≈ 1,06 Hz.
    const cents = params.detune ?? 0;
    const beatHz = f0 * (Math.pow(2, cents / 1200) - 1);
    expect(beatHz).toBeGreaterThan(0.8);
    expect(beatHz).toBeLessThan(1.4);

    const withDetune = rippleDepth(params, beatHz, 0.4, 1.6);
    const without = rippleDepth({ ...params, detune: 0 }, beatHz, 0.4, 1.6);

    // Sıcaklık dediğimiz şey bu vurumdur; kaldırılırsa geriye cansız bir
    // sinüs kalır. Kontrol, yalnız `detune`u sıfırlanmış AYNI presettir.
    expect(withDetune).toBeGreaterThan(without * 2);
  });

  it('orgun Leslie kıpırtısı ölçülebilir', () => {
    const organ = Presets.drawbarOrgan(220, 2.4);
    const withLfo = rippleDepth(organ, 6.2, 0.4, 1.8);
    const without = rippleDepth({ ...organ, lfos: undefined }, 6.2, 0.4, 1.8);

    // Orgun tabanı sıfır değildir: 0,5 ve 1,5 oranlı kollar birbiriyle vurum
    // yapar. Bu yüzden mutlak eşik değil, FARK sınanır.
    expect(withLfo).toBeGreaterThan(without * 1.4);
  });

  it('glockenspiel HARMONİK DEĞİLDİR: modlar tam sayı katlarında değil', () => {
    const f0 = 1047;
    const { samples, sampleRate } = render(Presets.glockenspiel(f0));
    const at = (ratio: number) => toneEnergy(head(samples), sampleRate, f0 * ratio);

    expect(at(2.76)).toBeGreaterThan(at(2) * 2);
    expect(at(2.76)).toBeGreaterThan(at(3) * 2);
    expect(at(5.4)).toBeGreaterThan(at(5) * 2);
    expect(at(5.4)).toBeGreaterThan(at(6) * 2);
  });
});

describe('telli presetler — kısmi ton yapısı ölçülür', () => {
  it('gitarın temel baskın; lowpass üst tonları sınırlıyor', () => {
    const f0 = 330;
    const { samples, sampleRate } = render(Presets.guitar(f0, 1.0));
    const p = (n: number) => toneEnergy(samples, sampleRate, f0 * n);
    expect(p(1)).toBeGreaterThan(p(8) * 6);
    expect(p(2)).toBeGreaterThan(p(8) * 2);
  });

  it('mutasyon: gitar lowpass kesimi kaldırılırsa 8. kısmi ton artar', () => {
    const f0 = 330;
    const normal = Presets.guitar(f0, 1.0);
    const mutant = {
      ...normal,
      lowpass: { ...normal.lowpass, cutoff: 18000, resonance: 0 },
    };
    const { samples, sampleRate } = render(mutant as unknown as SynthParams);
    const p8 = toneEnergy(samples, sampleRate, f0 * 8);
    const p1 = toneEnergy(samples, sampleRate, f0);
    expect(p8).toBeGreaterThan(p1 * 0.04);
  });

  it('bas gitarın temel baskın; üst tona hızla solar', () => {
    const f0 = 82.4;
    const { samples, sampleRate } = render(Presets.bassGuitar(f0, 1.2));
    const p = (n: number) => toneEnergy(samples, sampleRate, f0 * n);
    expect(p(1)).toBeGreaterThan(p(5) * 8);
    expect(p(2)).toBeGreaterThan(p(5) * 2);
  });

  it('mutasyon: bas gitar lowpass kesimi açılırsa 5. kısmi ton yükselir', () => {
    const f0 = 82.4;
    const normal = Presets.bassGuitar(f0, 1.2);
    const mutant = {
      ...normal,
      lowpass: { ...normal.lowpass, cutoff: 10000, resonance: 0 },
    };
    const { samples, sampleRate } = render(mutant as unknown as SynthParams);
    const p5 = toneEnergy(samples, sampleRate, f0 * 5);
    const p1 = toneEnergy(samples, sampleRate, f0);
    expect(p5).toBeGreaterThan(p1 * 0.03);
  });

  it('arp 2. ve 3. harmonikleri güçlü', () => {
    const f0 = 523.25;
    const { samples, sampleRate } = render(Presets.harp(f0, 1.5));
    const p = (n: number) => toneEnergy(samples, sampleRate, f0 * n);
    expect(p(2)).toBeGreaterThan(p(1) * 0.3);
    expect(p(3)).toBeGreaterThan(p(1) * 0.2);
  });

  it('mutasyon: arp harmonikleri tek temele indirilirse 2. kısmi ton düşer', () => {
    const f0 = 523.25;
    const normal = Presets.harp(f0, 1.5);
    const mutant = { ...normal, harmonics: [{ ratio: 1, gain: 1.0 }] };
    const { samples, sampleRate } = render(mutant as unknown as SynthParams);
    const p2 = toneEnergy(samples, sampleRate, f0 * 2);
    const p1 = toneEnergy(samples, sampleRate, f0);
    expect(p2).toBeLessThan(p1 * 0.05);
  });

  it('mandolinin tremolosu ölçülebilir', () => {
    const mandolin = Presets.mandolin(660, 1.2);
    // Ölçüm, zarfın sürdürüm bölümünde yapılır; yoksa doğal sönüm tremoloyu
    // bastırır.
    const withLfo = rippleDepth(mandolin, 6.0, 0.2, 0.45);
    const without = rippleDepth({ ...mandolin, lfos: undefined } as SynthParams, 6.0, 0.2, 0.45);
    expect(without, 'kontrol dalgalanıyor').toBeLessThan(0.14);
    expect(withLfo, 'tremolo enstrümanın imzası değil').toBeGreaterThan(0.22);
  });

  it('mutasyon: mandolin LFO sıfırlanınca tremolo derinliği kaybolur', () => {
    const mandolin = Presets.mandolin(660, 1.2);
    // Ölçüm, zarfın sürdürüm bölümünde yapılır; yoksa doğal sönüm tremoloyu
    // bastırır.
    const withLfo = rippleDepth(mandolin, 6.0, 0.2, 0.45);
    const without = rippleDepth({ ...mandolin, lfos: undefined } as SynthParams, 6.0, 0.2, 0.45);
    expect(withLfo).toBeGreaterThan(without * 2);
  });
});

describe('pluck fiziksel modeli', () => {
  it('temelde enerji vardır ve harmonikler sönümlenir', () => {
    const { channels, sampleRate } = pluck({ frequency: 220, duration: 1.0, decay: 0.995 });
    const samples = channels[0];
    const p1 = toneEnergy(samples, sampleRate, 220);
    const p4 = toneEnergy(samples, sampleRate, 220 * 4);
    expect(p1).toBeGreaterThan(0);
    expect(p4).toBeLessThan(p1);
  });

  it('mutasyon: düşük decay üst tonları hızla solar', () => {
    const hi = pluck({ frequency: 220, duration: 0.8, decay: 0.995 });
    const lo = pluck({ frequency: 220, duration: 0.8, decay: 0.92 });
    const p4hi = toneEnergy(hi.channels[0], hi.sampleRate, 220 * 4);
    const p4lo = toneEnergy(lo.channels[0], lo.sampleRate, 220 * 4);
    expect(p4hi).toBeGreaterThan(p4lo);
  });

  it("mutasyon: bodyResonance 440 Hz'i temele göre yükseltir", () => {
    const withBody = pluck({
      frequency: 220,
      duration: 1.0,
      bodyResonance: 440,
      bodyAmount: 0.5,
    });
    const without = pluck({ frequency: 220, duration: 1.0, bodyResonance: 0 });
    const p440with = toneEnergy(withBody.channels[0], withBody.sampleRate, 440);
    const p220with = toneEnergy(withBody.channels[0], withBody.sampleRate, 220);
    const p440without = toneEnergy(without.channels[0], without.sampleRate, 440);
    const p220without = toneEnergy(without.channels[0], without.sampleRate, 220);
    const ratioWith = p440with / p220with;
    const ratioWithout = p440without / p220without;
    expect(ratioWith).toBeGreaterThan(ratioWithout * 2);
  });
});
