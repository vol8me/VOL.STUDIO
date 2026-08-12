/**
 * Üretilen ses asset'leri için ölçüm aracı.
 *
 * Prosedürel üretimde "kulağa kötü geliyor" ifadesi tek başına takip
 * edilemez. Bu script somut sayılara çevirir: tepe/RMS seviyesi, dinamik
 * aralık, DC kayması, transient sertliği (click) ve spektral bant dağılımı.
 *
 * Spektral dağılım iki soruyu cevaplar:
 * - Parçalar birbirinden gerçekten farklı mı? (bant profilleri ayrışıyor mu)
 * - Ambiyans parçaları SFX'e yer bırakıyor mu? (orta bant kalabalık mı)
 *
 * Kullanım: tsx core/scripts/audio-qa.ts <dizin>
 */

import { readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ensureFfmpeg } from '../src/audio/synth/writer';

/** Tek örnek içinde bu farkı aşan atlama duyulur sertlik sayılır. */
const CLICK_DELTA_THRESHOLD = 0.35;

interface Decoded {
  channels: Float32Array[];
  sampleRate: number;
}

/**
 * OGG'yi FFmpeg ile ham float PCM'e çözer.
 *
 * Ölçüm shipped formatın kendisi üzerinde yapılır: Vorbis kayıplı bir codec,
 * dolayısıyla kaynak mix'te olmayan artefaktlar (kırpma, transient bozulması)
 * encode sırasında oluşabilir. Encode ÖNCESİNİ ölçmek bunları kaçırırdı.
 */
function decodeOgg(path: string): Decoded {
  const probe = spawnSync(
    'ffprobe',
    [
      '-v',
      'error',
      '-show_entries',
      'stream=sample_rate,channels',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      path,
    ],
    { encoding: 'utf8' },
  );
  if (probe.status !== 0) throw new Error(`ffprobe okuyamadi: ${path}`);
  const [sampleRateRaw, channelsRaw] = probe.stdout.trim().split(/\s+/);
  const sampleRate = Number(sampleRateRaw);
  const numChannels = Number(channelsRaw);

  const res = spawnSync('ffmpeg', ['-v', 'error', '-i', path, '-f', 'f32le', '-'], {
    maxBuffer: 1024 * 1024 * 512,
  });
  if (res.status !== 0) throw new Error(`ffmpeg decode hatasi: ${path}`);

  const raw = res.stdout;
  const frameCount = Math.floor(raw.length / 4 / numChannels);
  const channels = Array.from({ length: numChannels }, () => new Float32Array(frameCount));
  for (let i = 0; i < frameCount; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      channels[ch]![i] = raw.readFloatLE((i * numChannels + ch) * 4);
    }
  }
  return { channels, sampleRate };
}

/** Yerinde radix-2 FFT (karmaşık). Spektral bant dağılımı için yeterli. */
function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wRe = Math.cos(ang);
    const wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curRe = 1;
      let curIm = 0;
      for (let k = 0; k < len / 2; k++) {
        const uRe = re[i + k]!;
        const uIm = im[i + k]!;
        const vRe = re[i + k + len / 2]! * curRe - im[i + k + len / 2]! * curIm;
        const vIm = re[i + k + len / 2]! * curIm + im[i + k + len / 2]! * curRe;
        re[i + k] = uRe + vRe;
        im[i + k] = uIm + vIm;
        re[i + k + len / 2] = uRe - vRe;
        im[i + k + len / 2] = uIm - vIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
}

const BANDS: { name: string; lo: number; hi: number }[] = [
  { name: 'sub', lo: 20, hi: 120 },
  { name: 'low', lo: 120, hi: 500 },
  { name: 'mid', lo: 500, hi: 2500 },
  { name: 'high', lo: 2500, hi: 8000 },
  { name: 'air', lo: 8000, hi: 20000 },
];

/**
 * Bant başına seviye (dBFS RMS) — Hann pencereli, örneklenmiş FFT ortalaması.
 *
 * Yüzde yerine dB raporlanır: güç oranı olarak bakıldığında bas her zaman
 * toplamı domine eder ve üst bantlar sıfıra yuvarlanır — parlaklık farkını
 * göstermez. Bant başına dB seviyesi parçalar arasında doğrudan
 * karşılaştırılabilir bir profil verir.
 */
function bandProfile(samples: Float32Array, sampleRate: number): number[] {
  const size = 4096;
  if (samples.length < size) return BANDS.map(() => -Infinity);

  const windowCount = Math.min(48, Math.floor(samples.length / size));
  const step = Math.floor(samples.length / windowCount);
  const energy = new Array<number>(BANDS.length).fill(0);

  // Hann penceresinin koherent kazancı 0.5 — seviyeyi geri ölçeklemek için.
  const windowGain = 0.5;

  for (let w = 0; w < windowCount; w++) {
    const start = w * step;
    const re = new Float32Array(size);
    const im = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      const hann = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1));
      re[i] = (samples[start + i] ?? 0) * hann;
    }
    fft(re, im);
    for (let bin = 1; bin < size / 2; bin++) {
      const freq = (bin * sampleRate) / size;
      // Tek taraflı spektrum: negatif frekans eşleri için 2 ile ölçekle.
      const mag = 2 * (re[bin]! * re[bin]! + im[bin]! * im[bin]!);
      for (let b = 0; b < BANDS.length; b++) {
        if (freq >= BANDS[b]!.lo && freq < BANDS[b]!.hi) {
          energy[b]! += mag;
          break;
        }
      }
    }
  }

  return energy.map((e) => {
    const meanPower = e / (windowCount * size * size * windowGain * windowGain);
    return meanPower > 0 ? 10 * Math.log10(meanPower) : -Infinity;
  });
}

function analyze(path: string, label: string): void {
  const { channels, sampleRate } = decodeOgg(path);
  const left = channels[0]!;
  const right = channels[1] ?? left;
  const n = left.length;

  let peak = 0;
  let sumSq = 0;
  let dcSum = 0;
  let clip = 0;
  let clicks = 0;
  let maxDelta = 0;
  let corrNum = 0;
  let leftSq = 0;
  let rightSq = 0;

  for (let i = 0; i < n; i++) {
    const l = left[i]!;
    const r = right[i]!;
    const monoAbs = Math.max(Math.abs(l), Math.abs(r));
    if (monoAbs > peak) peak = monoAbs;
    if (monoAbs >= 0.999) clip++;
    sumSq += (l * l + r * r) / 2;
    dcSum += (l + r) / 2;
    corrNum += l * r;
    leftSq += l * l;
    rightSq += r * r;
    if (i > 0) {
      const d = Math.max(Math.abs(l - left[i - 1]!), Math.abs(r - right[i - 1]!));
      if (d > maxDelta) maxDelta = d;
      if (d > CLICK_DELTA_THRESHOLD) clicks++;
    }
  }

  const rms = Math.sqrt(sumSq / n);
  const toDb = (v: number): number => (v > 0 ? 20 * Math.log10(v) : -Infinity);
  const denom = Math.sqrt(leftSq * rightSq);
  const correlation = denom > 0 ? corrNum / denom : 1;
  const profile = bandProfile(left, sampleRate);

  const bandText = BANDS.map(
    (b, i) => `${b.name}:${(profile[i]! > -Infinity ? profile[i]! : -99).toFixed(0).padStart(4)}`,
  ).join(' ');

  console.log(
    [
      label.padEnd(30),
      `${(n / sampleRate).toFixed(1).padStart(5)}s`,
      `peak${toDb(peak).toFixed(1).padStart(6)}`,
      `rms${toDb(rms).toFixed(1).padStart(6)}`,
      `crest${(toDb(peak) - toDb(rms)).toFixed(1).padStart(5)}`,
      `dc${dcSum / n >= 0 ? ' ' : ''}${(dcSum / n).toExponential(1)}`,
      `clip${String(clip).padStart(5)}`,
      `click${String(clicks).padStart(4)}`,
      `maxD${maxDelta.toFixed(2)}`,
      `corr${correlation >= 0 ? ' ' : ''}${correlation.toFixed(2)}`,
      bandText,
    ].join('  '),
  );
}

function collectOggs(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectOggs(full));
    else if (entry.isFile() && entry.name.endsWith('.ogg')) out.push(full);
  }
  return out.sort();
}

const dirArg = process.argv[2];
if (!dirArg) {
  console.error('Kullanim: tsx core/scripts/audio-qa.ts <dizin>');
  process.exit(1);
}
const root = resolve(dirArg);
if (!statSync(root, { throwIfNoEntry: false })?.isDirectory()) {
  console.error(`Klasör bulunamadı: ${root}`);
  process.exit(1);
}

ensureFfmpeg();

const files = collectOggs(root);
if (files.length === 0) {
  console.log(`${root} altında .ogg yok. Önce: pnpm --filter @volstudio/vol-hell generate:audio`);
  process.exit(0);
}

console.log(
  `Ölçüm: ${files.length} dosya (click eşiği: tek örnekte ${CLICK_DELTA_THRESHOLD} fark)\n`,
);
let totalClicks = 0;
let totalClip = 0;
for (const file of files) {
  const { channels } = decodeOgg(file);
  const l = channels[0]!;
  for (let i = 1; i < l.length; i++) {
    if (Math.abs(l[i]! - l[i - 1]!) > CLICK_DELTA_THRESHOLD) totalClicks++;
    if (Math.abs(l[i]!) >= 0.999) totalClip++;
  }
  analyze(file, relative(root, file).replace(/\\/g, '/'));
}

console.log(`\nToplam: ${totalClicks} click, ${totalClip} clip örneği`);
if (totalClicks > 0 || totalClip > 0) {
  console.log('UYARI: sıfır olmayan click/clip sayısı — transient veya seviye gözden geçirilmeli.');
}
