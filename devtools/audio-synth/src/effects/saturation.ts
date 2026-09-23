import { resample } from '../synthesis/sample';

/**
 * Doğrusal olmayan renklendirme: dalga şekillendirici (4× aşırı örnekli) ve
 * bit/örnek indirgeyici. Şekillendirici tam ölçekli girişi tam ölçeğe eşler
 * (`shape(g·x) / shape(g)`): sürüş seviyeyi değil karakteri değiştirir.
 * Aşırı örnekleme Kaiser sinc yeniden örnekleyicisiyle yapılır (sıfır fazlı,
 * gecikmesiz) — şekillendiricinin ürettiği harmonikler 4× iç Nyquist'e kadar
 * taşınır ve inişte süzülür; program oranında şekillendirmek onları işitilir
 * banda katlardı.
 */
export type SaturationCharacter = 'tanh' | 'asymmetric' | 'hard';

export interface SaturationSettings {
  readonly driveDb: number;
  readonly character: SaturationCharacter;
  readonly mix: number;
  readonly outputDb: number;
}

const OVERSAMPLE = 4;
/** Asimetrik eğrinin ofseti: çift harmonik üretir, DC `tanh(b)` çıkarılarak sıfırlanır. */
const BIAS = 0.3;

function shaper(character: SaturationCharacter): (u: number) => number {
  switch (character) {
    case 'asymmetric':
      return (u) => Math.tanh(u + BIAS) - Math.tanh(BIAS);
    case 'hard':
      return (u) => Math.max(-1, Math.min(1, u));
    default:
      return Math.tanh;
  }
}

export function saturate(channels: readonly Float32Array[], s: SaturationSettings): void {
  const drive = Math.pow(10, s.driveDb / 20);
  const shape = shaper(s.character);
  const norm = shape(drive);
  const output = Math.pow(10, s.outputDb / 20);
  for (const channel of channels) {
    const up = resample(channel, 1 / OVERSAMPLE);
    for (let i = 0; i < up.length; i++) up[i] = shape(drive * up[i]) / norm;
    const down = resample(up, OVERSAMPLE, channel.length);
    for (let i = 0; i < channel.length; i++) {
      channel[i] = output * (channel[i] * (1 - s.mix) + (down[i] ?? 0) * s.mix);
    }
  }
}

export interface CrushSettings {
  readonly bits: number;
  /** Örnek tutma çarpanı: her `hold` örnekte bir yeni değer (1 → yok). */
  readonly hold: number;
  readonly mix: number;
}

/** Bilinçli alias ve kuantizasyon — retro/lo-fi karakteri. Dither YOKTUR (karakterin parçası). */
export function crush(channels: readonly Float32Array[], s: CrushSettings): void {
  const levels = Math.pow(2, s.bits - 1);
  for (const channel of channels) {
    let held = 0;
    for (let i = 0; i < channel.length; i++) {
      if (i % s.hold === 0) held = Math.round(channel[i] * levels) / levels;
      channel[i] = channel[i] * (1 - s.mix) + held * s.mix;
    }
  }
}
