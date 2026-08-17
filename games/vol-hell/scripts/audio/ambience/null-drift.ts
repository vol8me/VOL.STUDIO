/**
 * NULL DRIFT — Sakin oynanış ambiyansı (dalga 1-10 zemini).
 *
 * Ölçüsüz, ritimsiz, melodisiz — bu bir müzik DEĞİL, mekânın kendisidir.
 * D ekseninde alçak drone'lar, ölçüye oturmayan aralıklarla nefes alan
 * kabarma ve seyrek uzak çan olayları. Orta bant (200-3000 Hz) bilinçli
 * olarak boş bırakılır; oyun SFX'i orada yaşar.
 *
 * 64 s, dikişsiz loop. Süre "vuruş" değil saniye üzerinden düşünülür;
 * TrackDef.bpm=60 ile beats=saniye eşlemesi yapılır.
 */

import { createMix, addVoice, masterize, edgeGuard } from '../lib/mix';
import type { StereoMix } from '../lib/mix';
import { hz } from '../lib/theory';
import type { TrackDef } from '../lib/track';
import { abyssDrone, breathSwell, farToll, underRumble, subSurge } from '../palette/ambience';

const DURATION = 64;
const WRAP = true;

function build(): StereoMix {
  const mix = createMix(DURATION);

  // — Zemin: iki uçurum drone'u, ortada dikiş olmasın diye üst üste bindirilir —
  addVoice(mix, abyssDrone(hz('D2'), 36, 100), 0, { wrap: WRAP });
  addVoice(mix, abyssDrone(hz('D2'), 36, 110), 30, { wrap: WRAP, gain: 0.9 });
  addVoice(mix, underRumble(34, 120), 0, { wrap: WRAP, gain: 0.8 });
  addVoice(mix, underRumble(36, 130), 31, { wrap: WRAP, gain: 0.7 });

  // — Nefes kabarmaları: asal benzeri aralıklar, tempoya oturmaz —
  addVoice(mix, breathSwell(hz('A2'), 14, 200), 7.3, { wrap: WRAP, pan: -0.2 });
  addVoice(mix, breathSwell(hz('F2'), 13, 210), 27.9, { wrap: WRAP, pan: 0.25, gain: 0.85 });
  addVoice(mix, breathSwell(hz('A2'), 15, 220), 47.1, { wrap: WRAP, pan: -0.1, gain: 0.9 });

  // — Sub dalgaları —
  addVoice(mix, subSurge(hz('D1'), 9, 300), 11.7, { wrap: WRAP });
  addVoice(mix, subSurge(hz('D1'), 10, 310), 38.4, { wrap: WRAP, gain: 0.85 });
  addVoice(mix, subSurge(hz('G1'), 8, 320), 55.2, { wrap: WRAP, gain: 0.7 });

  // — Seyrek olaylar: iki uzak çan, birbirinden uzak ve alçak —
  addVoice(mix, farToll(hz('D3'), 8, 400), 18.6, { wrap: WRAP, gain: 0.7, pan: 0.15 });
  addVoice(mix, farToll(hz('A2'), 9, 410), 49.8, { wrap: WRAP, gain: 0.6, pan: -0.2 });

  masterize(mix, { peakTarget: 0.85, rmsTargetDb: -21 });
  edgeGuard(mix, 5);
  return mix;
}

/** Null Drift track tanımı. */
export const nullDrift: TrackDef = {
  id: 'null-drift',
  file: 'null-drift.ogg',
  bpm: 60,
  beats: DURATION,
  loop: true,
  rmsTargetDb: -21,
  build,
};
