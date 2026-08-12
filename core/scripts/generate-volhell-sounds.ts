/**
 * VOL.HELL ses efektleri — endüstriyel/mekanik karakter.
 *
 * ## Neden sıfırdan yazıldı
 *
 * Eski SFX'ler çıplak `sawtooth`/`triangle`/`sine` + kısa ADSR ile
 * üretiliyordu; bu kombinasyon klasik konsol (chiptune) karakteri veriyor ve
 * müziğin organik/sinematik dokusuyla tutarsız bir kimlik oluşturuyordu.
 *
 * Bu dosya SFX'i müzikle AYNI sözlükten kurar: `industrial-voices.ts`
 * paletindeki FM/bandpass/gürültü tabanlı mekanik sesler. Böylece ateş sesi
 * ile ambiyans müziği aynı dünyaya ait duyulur.
 *
 * ## Seviye hiyerarşisi
 *
 * Her ses aynı tepeye normalize EDİLMEZ. Eskiden hepsi 0.707'ye çekiliyordu;
 * bir UI tıkı ile ölüm sesi aynı seviyeye çıkıyor, oyunun dinamik hiyerarşisi
 * `sfxVolumes` tablosuna yükleniyordu. Burada olay önemine göre tepe hedefi
 * verilir: UI kısık, ölüm yüksek.
 *
 * ## Katman normalizasyonu
 *
 * Katmanlar `normalize: false` ile üretilir (palet bunu garanti eder),
 * normalize yalnızca son mix'te bir kez uygulanır — katmanlar arası doğal
 * dinamik korunur.
 *
 * Kullanim: tsx scripts/generate-volhell-sounds.ts <out-dir> [filter]
 */

import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { writeOgg } from '../src/audio/synth/writer';
import {
  createMix,
  addVoice,
  masterPeak,
  SAMPLE_RATE,
  transpose,
  type StereoMix,
} from './audio-mix';
import {
  metalClank,
  pressureHiss,
  machineTick,
  deepImpact,
  conveyorRattle,
  electricDischarge,
  servoStrain,
  structuralCollapse,
  relayClick,
  ricochet,
  powerRamp,
  glassPing,
} from './industrial-voices';

// --- CLI ---

const outDirArg = process.argv[2];
const filterArg = process.argv[3];

if (!outDirArg) {
  console.error('Kullanim: tsx scripts/generate-volhell-sounds.ts <out-dir> [filter]');
  console.error('  out-dir: OGG çıktı kökü, örn. ../games/vol-hell/public/assets/audio/sfx');
  console.error('  filter: kategori (ui|player|combat) veya isim oneki (fire, enemy-hit, ...)');
  process.exit(1);
}

const outDir = resolve(outDirArg);

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

/**
 * Çıktı dizinindeki eski ses dosyalarını siler (bir seviye alt klasör dahil).
 * Filtreli çalıştırmada dokunmaz — o durumda yalnızca eşleşen sesler üretilir.
 *
 * `.mp3` de temizlenir: iOS için `convert:ios` ile ayrı üretiliyor ve bir ses
 * yeniden adlandırılırsa/silinirse eski `.mp3` başka hiçbir script tarafından
 * temizlenmiyor, yetim dosya olarak kalıyordu.
 */
function pruneAudio(dir: string): void {
  if (!existsSync(dir) || filterArg) return;
  const matches = (name: string): boolean =>
    ['.ogg', '.mp3', '.wav'].some((ext) => name.endsWith(ext));
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile() && matches(entry.name)) {
      rmSync(join(dir, entry.name));
    } else if (entry.isDirectory()) {
      for (const file of readdirSync(join(dir, entry.name))) {
        if (matches(file)) rmSync(join(dir, entry.name, file));
      }
    }
  }
}

ensureDir(outDir);
pruneAudio(outDir);

// --- Perde paleti ---
// Müzikle aynı D-kökü ailesinden: SFX ve müzik çakışmıyor, akraba duyuluyor.

const D2 = 73.42;
const A2 = 110.0;
const D3 = 146.83;
const F3 = 174.61;
const A3 = 220.0;
const D4 = 293.66;
const F4 = 349.23;
const A4 = 440.0;

type SoundCategory = 'ui' | 'player' | 'combat';

interface SoundSpec {
  name: string;
  category: SoundCategory;
  /** Tepe hedefi — olay önemine göre doğal seviye hiyerarşisi. */
  peak: number;
  /** Doygunluk sürüşü; mekanik seslerde hafif doygunluk gövde katar. */
  drive?: number;
  render: () => StereoMix;
}

/** Kısa yardımcı: verilen süre için mix açar. */
function shot(duration: number): StereoMix {
  return createMix(duration);
}

/** Saniyeyi örneğe çevirir. */
function at(seconds: number): number {
  return Math.floor(seconds * SAMPLE_RATE);
}

// ─── Ses tarifleri ──────────────────────────────────────────────────

const specs: SoundSpec[] = [
  // ═══ UI — elektromekanik anahtarlar ═══════════════════════════════

  {
    // Menüde gezinme. Çok sık çalıyor: kısa, kuru.
    //
    // Tepe hedefi diğer UI seslerinden yüksek çünkü ses ÇOK kısa: tepe eşit
    // olduğunda algılanan yükseklik 10 ms'lik bir tıkta uzun bir uğultudan
    // belirgin düşük kalıyor (ölçümde 9 dB fark). Kısa `conveyorRattle`
    // gövdesi tıka biraz kütle katar, cılız kalmasını önler.
    name: 'menu-blip-0',
    category: 'ui',
    peak: 0.62,
    render: () => {
      const mix = shot(0.14);
      addVoice(mix, relayClick(1700, 0.5, 0, 1001), 0);
      addVoice(mix, machineTick(900, 0.26, 0, 1002), at(0.004));
      addVoice(mix, conveyorRattle(540, 0.16, 0, 1020), at(0.003));
      return mix;
    },
  },
  {
    // İkinci varyasyon: farklı rezonans — art arda duyulduğunda makineli
    // tüfek etkisi yapmaması için. Yapı birebir aynı tutuldu ki iki varyasyon
    // arasında seviye farkı oluşmasın.
    name: 'menu-blip-1',
    category: 'ui',
    peak: 0.62,
    render: () => {
      const mix = shot(0.14);
      addVoice(mix, relayClick(1450, 0.5, 0, 1003), 0);
      addVoice(mix, machineTick(1050, 0.26, 0, 1004), at(0.005));
      addVoice(mix, conveyorRattle(470, 0.16, 0, 1021), at(0.003));
      return mix;
    },
  },
  {
    // Geri: mekanik mandal açılışı. Alçalan hareket.
    name: 'back-0',
    category: 'ui',
    peak: 0.45,
    render: () => {
      const mix = shot(0.26);
      addVoice(mix, relayClick(1250, 0.4, -0.1, 1005), 0);
      addVoice(mix, powerRamp(A2, 0.2, 'down', 0.3, 0, 1006), at(0.01));
      addVoice(mix, machineTick(700, 0.16, 0.12, 1007), at(0.055));
      return mix;
    },
  },
  {
    // Duraklat: sistem gücünü kesiyor. Uğultu düşüyor.
    name: 'pause-0',
    category: 'ui',
    peak: 0.5,
    drive: 1.1,
    render: () => {
      const mix = shot(0.55);
      addVoice(mix, relayClick(1100, 0.34, 0, 1008), 0);
      addVoice(mix, powerRamp(D3, 0.45, 'down', 0.38, 0, 1009), at(0.008));
      addVoice(mix, deepImpact(D2 * 0.8, 0.22, 0, 1010), at(0.01));
      addVoice(mix, pressureHiss(0.1, 0.25, 1011, 1800), at(0.06));
      return mix;
    },
  },
  {
    // Devam: sistem geri geliyor. Uğultu yükseliyor.
    //
    // `powerRamp` sürekli ve alçak bantlı olduğu için RMS'i hızla yukarı
    // çekiyor: ölçümde bu ses tüm UI grubunun 9 dB üstündeydi ve bas ağırlıklı
    // duyuluyordu. Rampa kısıldı, mekanik olaylar öne alındı.
    name: 'resume-0',
    category: 'ui',
    peak: 0.5,
    drive: 1.1,
    render: () => {
      const mix = shot(0.5);
      addVoice(mix, powerRamp(A2, 0.4, 'up', 0.2, 0, 1012), 0);
      addVoice(mix, relayClick(1500, 0.42, 0.1, 1013), at(0.18));
      addVoice(mix, machineTick(1250, 0.24, -0.12, 1014), at(0.26));
      return mix;
    },
  },
  {
    // Yeniden başlat: kısa açılış dizisi. Üç mekanik olay, artan.
    // Rampa seviyesi `resume-0` ile aynı gerekçeyle kısıldı.
    name: 'restart-0',
    category: 'ui',
    peak: 0.55,
    drive: 1.12,
    render: () => {
      const mix = shot(0.8);
      addVoice(mix, relayClick(1300, 0.4, -0.15, 1015), 0);
      addVoice(mix, machineTick(1000, 0.26, 0.15, 1016), at(0.13));
      addVoice(mix, powerRamp(D3, 0.5, 'up', 0.18, 0, 1017), at(0.2));
      addVoice(mix, metalClank(D4, 0.3, 0.2, 1018), at(0.42));
      addVoice(mix, pressureHiss(0.16, -0.3, 1019, 3000), at(0.5));
      return mix;
    },
  },

  // ═══ Player — pnömatik silah, servo, çöküş ════════════════════════

  {
    // Ateş: bobin deşarjı. Saniyede birkaç kez çalıyor — yorucu olmamalı.
    //
    // Deşarj temel frekansı kasıtlı olarak A3 değil D4 civarı: `electricDischarge`
    // alçak geçireni temel frekansın 3.2 katına kuruyor, A3'te (220 Hz) kesim
    // 700 Hz'de kalıyor ve ses tok bir "güm"e dönüşüyordu. Ölçümde orta bant
    // -46 dB çıkmıştı; silah sesinin tokmak değil deşarj duyulması için
    // 1-3 kHz bandında varlık şart.
    name: 'fire-0',
    category: 'player',
    peak: 0.6,
    drive: 1.15,
    render: () => {
      const mix = shot(0.3);
      addVoice(mix, electricDischarge(D4 * 1.3, 0.5, 0, 1101), 0);
      // Alt uç yalnızca gövde veriyor; baskın olursa deşarj karakteri kayboluyor.
      addVoice(mix, deepImpact(A2 * 0.7, 0.16, 0, 1102), at(0.001));
      addVoice(mix, relayClick(2100, 0.34, 0.08, 1103), 0);
      addVoice(mix, pressureHiss(0.2, -0.1, 1104, 3600), at(0.012));
      return mix;
    },
  },
  {
    name: 'fire-1',
    category: 'player',
    peak: 0.6,
    drive: 1.15,
    render: () => {
      const mix = shot(0.29);
      addVoice(mix, electricDischarge(transpose(D4 * 1.3, 2), 0.48, 0, 1105), 0);
      addVoice(mix, deepImpact(A2 * 0.72, 0.15, 0, 1106), at(0.001));
      addVoice(mix, relayClick(1950, 0.33, -0.08, 1107), 0);
      addVoice(mix, pressureHiss(0.19, 0.1, 1108, 3400), at(0.011));
      return mix;
    },
  },
  {
    name: 'fire-2',
    category: 'player',
    peak: 0.6,
    drive: 1.15,
    render: () => {
      const mix = shot(0.28);
      addVoice(mix, electricDischarge(transpose(D4 * 1.3, -2), 0.49, 0, 1109), 0);
      addVoice(mix, deepImpact(A2 * 0.68, 0.16, 0, 1110), at(0.001));
      addVoice(mix, relayClick(2250, 0.32, 0.06, 1111), 0);
      addVoice(mix, pressureHiss(0.2, -0.06, 1112, 3800), at(0.013));
      return mix;
    },
  },
  {
    // Dash: itki / basınç boşalması. Yön hissi için stereo hareket.
    name: 'dash-0',
    category: 'player',
    peak: 0.62,
    drive: 1.1,
    render: () => {
      const mix = shot(0.55);
      addVoice(mix, pressureHiss(0.42, -0.35, 1113, 2600), 0);
      addVoice(mix, servoStrain(D3, 0.35, 0.26, 0.3, 1114), at(0.015));
      addVoice(mix, deepImpact(D2 * 0.75, 0.26, 0, 1115), at(0.004));
      addVoice(mix, pressureHiss(0.2, 0.4, 1116, 4200), at(0.09));
      return mix;
    },
  },
  {
    // Hasar: zırha metal darbe + servo zorlanması.
    name: 'hurt-0',
    category: 'player',
    peak: 0.78,
    drive: 1.18,
    render: () => {
      const mix = shot(0.5);
      addVoice(mix, metalClank(D3, 0.5, 0, 1117), 0);
      addVoice(mix, deepImpact(D2 * 0.85, 0.42, 0, 1118), 0);
      addVoice(mix, servoStrain(A2, 0.3, 0.24, -0.2, 1119), at(0.02));
      addVoice(mix, conveyorRattle(420, 0.18, 0.25, 1120), at(0.03));
      return mix;
    },
  },
  {
    name: 'hurt-1',
    category: 'player',
    peak: 0.78,
    drive: 1.18,
    render: () => {
      const mix = shot(0.48);
      addVoice(mix, metalClank(transpose(D3, -3), 0.5, 0, 1121), 0);
      addVoice(mix, deepImpact(D2 * 0.78, 0.42, 0, 1122), 0);
      addVoice(mix, servoStrain(transpose(A2, -2), 0.28, 0.23, 0.22, 1123), at(0.018));
      addVoice(mix, conveyorRattle(360, 0.17, -0.24, 1124), at(0.028));
      return mix;
    },
  },
  {
    // Ölüm: makinenin kapanışı. Uzun, ağır, kademeli.
    name: 'death-0',
    category: 'player',
    peak: 0.86,
    drive: 1.2,
    render: () => {
      const mix = shot(2.6);
      // Darbe: kütlenin yere inmesi.
      addVoice(mix, deepImpact(D2 * 0.6, 0.55, 0, 1125), 0);
      addVoice(mix, metalClank(D3, 0.4, -0.15, 1126), at(0.01));
      // Çöküş gövdesi.
      addVoice(mix, structuralCollapse(D2, 2.2, 0.5, 0, 1127), at(0.02));
      // Güç kesilmesi.
      addVoice(mix, powerRamp(D3, 1.4, 'down', 0.3, 0.2, 1128), at(0.1));
      // Dağılan parçalar.
      addVoice(mix, conveyorRattle(300, 0.2, 0.4, 1129), at(0.35));
      addVoice(mix, metalClank(F3, 0.22, -0.42, 1130), at(0.55));
      addVoice(mix, conveyorRattle(240, 0.15, 0.35, 1131), at(0.78));
      // Son basınç kaçağı.
      addVoice(mix, pressureHiss(0.18, 0, 1132, 1600), at(1.1));
      return mix;
    },
  },

  // ═══ Combat — metal çarpışma, yıkım, sekme ════════════════════════

  {
    // Düşman vuruşu: metal üstüne metal. Çok sık çalıyor.
    name: 'enemy-hit-0',
    category: 'combat',
    peak: 0.55,
    drive: 1.12,
    render: () => {
      const mix = shot(0.3);
      addVoice(mix, metalClank(A3, 0.48, 0, 1201), 0);
      addVoice(mix, relayClick(2400, 0.22, 0.1, 1202), 0);
      addVoice(mix, deepImpact(A2 * 0.8, 0.22, 0, 1203), at(0.002));
      return mix;
    },
  },
  {
    name: 'enemy-hit-1',
    category: 'combat',
    peak: 0.55,
    drive: 1.12,
    render: () => {
      const mix = shot(0.29);
      addVoice(mix, metalClank(transpose(A3, 3), 0.47, 0, 1204), 0);
      addVoice(mix, relayClick(2650, 0.21, -0.1, 1205), 0);
      addVoice(mix, deepImpact(A2 * 0.85, 0.21, 0, 1206), at(0.002));
      return mix;
    },
  },
  {
    // Düşman ölümü: yapısal yıkım + dağılan parçalar.
    name: 'enemy-death-0',
    category: 'combat',
    peak: 0.75,
    drive: 1.16,
    render: () => {
      const mix = shot(1.15);
      addVoice(mix, deepImpact(A2 * 0.7, 0.42, 0, 1207), 0);
      addVoice(mix, metalClank(A3, 0.36, -0.12, 1208), 0);
      addVoice(mix, structuralCollapse(A2, 0.95, 0.4, 0, 1209), at(0.015));
      addVoice(mix, conveyorRattle(380, 0.2, 0.35, 1210), at(0.16));
      addVoice(mix, metalClank(F4, 0.16, 0.4, 1211), at(0.3));
      return mix;
    },
  },
  {
    name: 'enemy-death-1',
    category: 'combat',
    peak: 0.75,
    drive: 1.16,
    render: () => {
      const mix = shot(1.05);
      addVoice(mix, deepImpact(F3 * 0.5, 0.42, 0, 1212), 0);
      addVoice(mix, metalClank(F3, 0.36, 0.12, 1213), 0);
      addVoice(mix, structuralCollapse(F3 * 0.5, 0.85, 0.4, 0, 1214), at(0.015));
      addVoice(mix, conveyorRattle(320, 0.19, -0.35, 1215), at(0.14));
      addVoice(mix, metalClank(A4, 0.15, -0.4, 1216), at(0.28));
      return mix;
    },
  },
  {
    // Mermi sekmesi: metalden sıçrama. Kısa ve perdeli.
    name: 'bullet-bounce-0',
    category: 'combat',
    peak: 0.5,
    render: () => {
      const mix = shot(0.34);
      addVoice(mix, ricochet(A3, 0.45, 0, 1217), 0);
      addVoice(mix, relayClick(3000, 0.16, 0.15, 1218), 0);
      addVoice(mix, glassPing(A4 * 1.5, 0.1, -0.2, 1219), at(0.01));
      return mix;
    },
  },
];

// ─── Üretim döngüsü ─────────────────────────────────────────────────

const filter = filterArg?.toLowerCase();

for (const spec of specs) {
  if (filter) {
    const nameMatch = spec.name.toLowerCase().startsWith(filter);
    const categoryMatch = spec.category.toLowerCase() === filter;
    if (!nameMatch && !categoryMatch) continue;
  }

  const categoryDir = join(outDir, spec.category);
  ensureDir(categoryDir);

  const mix = spec.render();
  const result = masterPeak(mix, spec.peak, spec.drive ?? 1);

  writeOgg(join(categoryDir, `${spec.name}.ogg`), result);
  console.log(
    `Generated: ${spec.category}/${spec.name} (${result.duration.toFixed(2)}s, tepe ${spec.peak})`,
  );
}

console.log(
  filter ? `\nFiltreli SFX (${filter}) yazıldı: ${outDir}` : `\nTüm SFX yazıldı: ${outDir}`,
);
