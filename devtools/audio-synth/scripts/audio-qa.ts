/**
 * Gönderilen ses varlıkları için ölçüm aracı — kodek SONRASI çıktı üzerinde.
 *
 * Bütün ölçümler paketin kanonik analiz çekirdeğinden (`analyzeAudio`,
 * `AudioAnalysisReportV1`) gelir; publish kapısı ve testler AYNI
 * fonksiyonu çağırır. Betik yalnız çözer, sınıflar ve biçimlendirir.
 *
 * Kullanım: tsx scripts/audio-qa.ts <dizin> [--policy] [--json] [--class ui|sfx|ambience|music]
 *   --policy  sınıf politikasını uygular; ihlal varsa çıkış kodu 1.
 *   --json    makine-okunur rapor (araç sürümü, politika ve analizör sürümüyle).
 */
import { readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import {
  ASSET_CLASS_POLICIES,
  classifyAssetPath,
  evaluateAssetPolicy,
  type AssetClass,
} from '../src/analysis/assetQa';
import {
  analyzeAudio,
  ANALYZER_VERSION,
  measurementOf,
  type SpectralBand,
} from '../src/analysis/report';
import { ensureFfmpeg } from '../src/writer';
import { decodeWithFfmpeg, ffmpegVersion } from './lib/ffmpeg';

const BANDS: readonly SpectralBand[] = ['sub', 'low', 'mid', 'high', 'air'];

function collectOggs(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectOggs(full));
    else if (entry.isFile() && entry.name.endsWith('.ogg')) out.push(full);
  }
  return out.sort();
}

const args = process.argv.slice(2);
const dirArg = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--class');
const classIndex = args.indexOf('--class');
const forcedClass = classIndex >= 0 ? (args[classIndex + 1] as AssetClass) : undefined;
const enforce = args.includes('--policy');
const asJson = args.includes('--json');

if (!dirArg) {
  console.error('Kullanım: tsx scripts/audio-qa.ts <dizin> [--policy] [--json] [--class <sınıf>]');
  process.exit(1);
}
if (forcedClass && !(forcedClass in ASSET_CLASS_POLICIES.classes)) {
  console.error(`Bilinmeyen sınıf: ${forcedClass}`);
  process.exit(1);
}
const root = resolve(dirArg);
if (!statSync(root, { throwIfNoEntry: false })?.isDirectory()) {
  console.error(`Klasör bulunamadı: ${root}`);
  process.exit(1);
}

ensureFfmpeg();
const files = collectOggs(root);
const fmt = (v: number | null, digits = 1): string => (v === null ? '   —' : v.toFixed(digits));

const rows = files.map((file) => {
  const label = relative(root, file).replace(/\\/g, '/');
  const { channels, sampleRate } = decodeWithFfmpeg(file);
  const report = analyzeAudio(channels, sampleRate, 'decoded-encoded');
  const assetClass = forcedClass ?? classifyAssetPath(label);
  const verdict = evaluateAssetPolicy(measurementOf(report), assetClass);
  return { file: label, assetClass, violations: verdict.violations, report };
});

const failing = rows.filter((r) => r.violations.length > 0);
if (asJson) {
  console.log(
    JSON.stringify(
      {
        tool: ffmpegVersion(),
        policyVersion: ASSET_CLASS_POLICIES.version,
        analyzerVersion: ANALYZER_VERSION,
        measuredFrom: 'decoded-encoded',
        files: rows,
      },
      null,
      1,
    ),
  );
} else if (rows.length === 0) {
  console.log(`${root} altında .ogg yok — önce paketin ses üretim reçetesini koş.`);
} else {
  console.log(
    `Ölçüm: ${rows.length} dosya, kodek sonrası (${ffmpegVersion()}); politika v${
      ASSET_CLASS_POLICIES.version
    }, analizör v${ANALYZER_VERSION}\n`,
  );
  for (const { file, assetClass, violations, report } of rows) {
    const { level, defects, stereo, spectral, format } = report;
    const bandText = BANDS.map(
      (b) => `${b}:${(spectral.bandsDb[b] ?? -99).toFixed(0).padStart(4)}`,
    ).join(' ');
    const correlation = stereo?.correlation ?? 1;
    console.log(
      [
        file.padEnd(34),
        assetClass.padEnd(8),
        `${format.durationSeconds.toFixed(1).padStart(5)}s`,
        `I${fmt(level.integratedLufs).padStart(6)}`,
        `Mmax${fmt(level.maxMomentaryLufs).padStart(6)}`,
        `TP${fmt(level.truePeakDbtp, 2).padStart(7)}`,
        `SP${fmt(level.samplePeakDbfs, 2).padStart(7)}`,
        `rms${fmt(level.rmsDbfs).padStart(6)}`,
        `clip ${defects.clips.perChannel.join('/')}`,
        `click${String(defects.clicks.count).padStart(3)}`,
        `corr${correlation >= 0 ? ' ' : ''}${correlation.toFixed(2)}`,
        bandText,
        violations.length > 0 ? `✗ ${violations.join('; ')}` : '✓',
      ].join('  '),
    );
  }
  const clipped = rows.reduce((n, r) => n + r.report.defects.clips.channelSamples, 0);
  const clicks = rows.reduce((n, r) => n + r.report.defects.clicks.count, 0);
  console.log(
    `\nToplam: ${clicks} tık adayı, ${clipped} kırpılmış kanal örneği; ` +
      `politika ihlali ${failing.length}/${rows.length} dosya.`,
  );
}

if (enforce && failing.length > 0) process.exit(1);
