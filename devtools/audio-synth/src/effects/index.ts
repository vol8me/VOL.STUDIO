/**
 * Offline efekt zinciri.
 *
 * Tek `effects.ts` dosyasıydı; yedi bağımsız efekt (delay, chorus, flanger,
 * phaser, reverb, distortion, stereo) ve dört yardımcı iç sınıf aynı yerde
 * duruyordu. Efektler birbirinden bağımsız olduğu için dosya sınırı
 * doğal olarak efekt sınırıdır.
 *
 * Dış API değişmedi: aynı sınıf ve fonksiyonlar buradan çıkar.
 */
export { getPanGains } from './pan';
export { DelayLine, feedbackTailSeconds, estimateDelayTail } from './delay';
export { Chorus, Flanger, PhaserEffect } from './modulation';
export { Reverb } from './reverb';
export { Distortion } from './distortion';
export { StereoWidener } from './stereo';
