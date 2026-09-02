/**
 * VOL.ARACHNID ses üretim girişi.
 *
 * Kullanım: tsx scripts/audio/generate.ts <çıkış-dizini>
 * Örnek:    tsx scripts/audio/generate.ts public/assets/audio
 *
 * Palette her sesi DC temizliği, yumuşak doygunluk, RMS/tepe headroom ve uç
 * fade'leriyle master eder. Burada ikinci bir normalizasyon yapılmaz; aksi
 * halde paletin kütle/transient dengesi sessizce ezilirdi.
 */

import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { writeOgg } from '@volstudio/audio-synth/writer';
import { ARACHNID_AMBIENCE_DURATION_SECONDS } from '../../src/config/audio';
import { clawStep, darkAmbience, dashLand, dashLaunch, wallImpact } from './palette';

interface AudioSpec {
  /** `<çıkış>/<path>.ogg` olarak yazılır. */
  path: string;
  render: () => ReturnType<typeof clawStep>;
}

/**
 * Adımın DÖRT varyantı vardır.
 *
 * Tek örneklik bir adım sesi, saniyede birkaç kez çalınca makine gibi okunur;
 * canlı bir yaratıkta iki adım asla birebir aynı değildir. Varyantlar farklı
 * tohum ve parlaklıkla üretilir, oyun aralarından rastgele seçer.
 */
const STEP_VARIANTS = [
  { seed: 1201, brightness: 1 },
  { seed: 3307, brightness: 0.92 },
  { seed: 5813, brightness: 1.08 },
  { seed: 7919, brightness: 0.86 },
];

const SPECS: AudioSpec[] = [
  ...STEP_VARIANTS.map((variant, index) => ({
    path: `sfx/step-${index + 1}`,
    render: () => clawStep(variant.seed, variant.brightness),
  })),
  { path: 'sfx/dash-launch', render: () => dashLaunch(2417) },
  { path: 'sfx/dash-land', render: () => dashLand(6151) },
  { path: 'sfx/wall-impact', render: () => wallImpact(8443) },
  {
    path: 'ambience/hollow',
    render: () => darkAmbience(4271, ARACHNID_AMBIENCE_DURATION_SECONDS),
  },
];

const outDir = process.argv[2];
if (!outDir) {
  console.error('Kullanım: tsx scripts/audio/generate.ts <çıkış-dizini>');
  process.exit(1);
}

for (const spec of SPECS) {
  const filePath = resolve(outDir, `${spec.path}.ogg`);
  mkdirSync(dirname(filePath), { recursive: true });
  writeOgg(filePath, spec.render(), { quality: 7 });
  console.log(`  yazıldı: ${spec.path}.ogg`);
}
console.log(`Bitti: ${SPECS.length} ses -> ${outDir}`);
