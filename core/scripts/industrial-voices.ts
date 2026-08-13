/**
 * Endüstriyel ses paleti — Mindustry karakteri.
 *
 * Tasarım yönü (eski `menu-music-instruments.ts`'ten bilinçli kopuş):
 *
 * - **Sinematik değil, mekanik.** Yaylı/brass/bell katmanları kaldırıldı;
 *   yerine makine uğultusu, metal darbe, basınç boşalması, röle tıkırtısı
 *   geldi. Eski palet "film fragmanı" karakteri veriyordu, hedef ise soğuk
 *   endüstriyel atmosfer.
 * - **Üçlü yerine boş beşli.** Majör/minör üçlü tonal-duygusal bir renk
 *   katıyor; endüstriyel doku için beşli ve süspansiyon kullanılır.
 * - **Boğuk ve geniş.** Alçak geçiren kesimler kasıtlı olarak düşük — sesin
 *   "duvarın arkasından" geldiği hissi. Üst tını shimmer katmanlarıyla değil
 *   gürültü yatağıyla dolduruluyor.
 * - **Her voice `normalize: false`.** Bu paletin en önemli kuralı: voice bazında
 *   tepe normalizasyonu katmanlar arası doğal dinamiği yok ediyordu. Seviye
 *   dengesi `gain` ile kurulur, normalize yalnızca master zincirde bir kez
 *   uygulanır (bkz. `audio-mix.ts`).
 * - **Perküsyon atağı asla 1 ms altında değil.** Ölçümle görüldü: üst üste
 *   binen ultra kısa ataklar toplanıp yapay sertlik üretiyor. Mekanik darbeler
 *   zaten doğal olarak biraz yumuşak başlar.
 *
 * Sesler rollerine göre `voices/` altına bölünmüştür; bu dosya paletin tek
 * giriş noktası olarak kalır, çağıran script'ler değişmez.
 */

export type { AtmosphereOptions } from './voices/atmosphere';
export {
  reactorHum,
  subThrob,
  staticBed,
  coldPad,
  atmosphereBed,
  airDraft,
} from './voices/atmosphere';

export {
  metalClank,
  pressureHiss,
  machineTick,
  deepImpact,
  conveyorRattle,
} from './voices/percussion';

export { signalTone, glassPing, cableTension } from './voices/signal';

export {
  electricDischarge,
  servoStrain,
  structuralCollapse,
  relayClick,
  ricochet,
  powerRamp,
  filteredPulse,
} from './voices/sfx';
