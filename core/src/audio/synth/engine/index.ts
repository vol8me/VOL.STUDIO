/**
 * Offline sentez motoru.
 *
 * Tek bir `engine.ts` dosyasıydı; sinyal zincirinin her aşaması (ses üretimi,
 * frekans modülasyonu, örnek render, oversampling, global efektler) aynı yerde
 * durduğu için bir aşamayı test etmek diğerlerini de sürüklüyordu. Modüller
 * zincirin sırasını izler:
 *
 *   voice → frequency → render → synthesize → effects-chain
 *
 * Dış API değişmedi: `synth`, `synthesize`, `applyGlobalEffects`, `normalize`,
 * `limitBuffer`, `mix` aynı isimlerle buradan çıkar.
 */
export { DEFAULT_SAMPLE_RATE, OVERSAMPLE_FACTOR, NORMALIZE_TARGET_PEAK } from './constants';
export type { FmState, Voice } from './voice';
export { createFmState, createVoices } from './voice';
export { frequencyAtTime, getFmSample } from './frequency';
export { renderDrySample, downsample2x } from './render';
export { synthesize, synth } from './synthesize';
export { applyGlobalEffects, normalize, limitBuffer, mix } from './effects-chain';
