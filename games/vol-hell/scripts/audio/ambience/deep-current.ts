/**
 * DEEP CURRENT — Derin oynanış ambiyansı (dalga 11+ zemini).
 *
 * Null Drift'in kardeşi ama daha huzursuz: D drone'unun yanına yarım ton
 * üstten (Eb) ikinci bir drone sokulur — iki ton arasındaki yavaş vuru
 * (beating) bilinçaltı bir gerginlik üretir. Yine ritim yok, melodi yok;
 * gerilim armonik sürtünmeden ve daha koyu zeminden gelir.
 *
 * 64 s, dikişsiz loop.
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

  // — Zemin: D drone kalıcı, Eb drone dalga dalga sokulup çekilir —
  addVoice(mix, abyssDrone(hz('D2'), 38, 100), 0, { wrap: WRAP });
  addVoice(mix, abyssDrone(hz('D2'), 36, 110), 30, { wrap: WRAP, gain: 0.9 });
  addVoice(mix, abyssDrone(hz('Eb2'), 20, 120), 9.4, { wrap: WRAP, gain: 0.55, pan: 0.2 });
  addVoice(mix, abyssDrone(hz('Eb2'), 18, 130), 41.2, { wrap: WRAP, gain: 0.6, pan: -0.15 });

  // — Daha ağır zemin uğultusu —
  addVoice(mix, underRumble(34, 140), 0, { wrap: WRAP });
  addVoice(mix, underRumble(36, 150), 30.5, { wrap: WRAP, gain: 0.9 });

  // — Nefesler: daha alçak kayıt, daha kısa aralıklar —
  addVoice(mix, breathSwell(hz('G2'), 12, 200), 5.1, { wrap: WRAP, pan: -0.25, gain: 0.9 });
  addVoice(mix, breathSwell(hz('Ab2'), 11, 210), 22.6, { wrap: WRAP, pan: 0.2, gain: 0.8 });
  addVoice(mix, breathSwell(hz('G2'), 13, 220), 39.8, { wrap: WRAP, pan: 0.1, gain: 0.9 });
  addVoice(mix, breathSwell(hz('F2'), 12, 230), 54.3, { wrap: WRAP, pan: -0.15, gain: 0.85 });

  // — Sub dalgaları: daha sık, daha derin —
  addVoice(mix, subSurge(hz('D1'), 8, 300), 7.9, { wrap: WRAP });
  addVoice(mix, subSurge(hz('Eb1'), 9, 310), 24.4, { wrap: WRAP, gain: 0.8 });
  addVoice(mix, subSurge(hz('D1'), 9, 320), 43.7, { wrap: WRAP, gain: 0.95 });
  addVoice(mix, subSurge(hz('C1'), 8, 330), 57.6, { wrap: WRAP, gain: 0.75 });

  // — Seyrek olaylar: tritonlu uzak çanlar (D'ye karşı Ab) —
  addVoice(mix, farToll(hz('Ab2'), 9, 400), 14.8, { wrap: WRAP, gain: 0.65, pan: 0.22 });
  addVoice(mix, farToll(hz('D3'), 8, 410), 33.9, { wrap: WRAP, gain: 0.55, pan: -0.18 });
  addVoice(mix, farToll(hz('Ab2'), 9, 420), 52.7, { wrap: WRAP, gain: 0.6, pan: 0.1 });

  masterize(mix, { peakTarget: 0.85, rmsTargetDb: -20.5 });
  edgeGuard(mix, 5);
  return mix;
}

/** Deep Current track tanımı. */
export const deepCurrent: TrackDef = {
  id: 'deep-current',
  file: 'deep-current.ogg',
  bpm: 60,
  beats: DURATION,
  loop: true,
  rmsTargetDb: -20.5,
  build,
};
