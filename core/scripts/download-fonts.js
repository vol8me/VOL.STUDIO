import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

/**
 * VOL.STUDIO standart fontlarını GitHub raw üzerinden indirir.
 * Değişken-aksis .ttf dosyalarını core/public/assets/fonts/ dizinine yazar,
 * lisans dosyalarını da yanına koyar. Oyun paketleri fontları vite-plugin-static-copy
 * üzerinden core/public'dan çözümler — kopya gerekmez.
 */

const FONTS = [
  {
    family: 'Jura',
    filename: 'Jura[wght].ttf',
    url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/jura/Jura[wght].ttf',
    licenseUrl: 'https://raw.githubusercontent.com/google/fonts/main/ofl/jura/OFL.txt',
    licenseFilename: 'OFL-Jura.txt',
  },
  {
    family: 'Exo 2',
    filename: 'Exo2[wght].ttf',
    url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/exo2/Exo2[wght].ttf',
    licenseUrl: 'https://raw.githubusercontent.com/google/fonts/main/ofl/exo2/OFL.txt',
    licenseFilename: 'OFL-Exo2.txt',
  },
  {
    family: 'Exo 2',
    filename: 'Exo2-Italic[wght].ttf',
    url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/exo2/Exo2-Italic[wght].ttf',
    licenseUrl: 'https://raw.githubusercontent.com/google/fonts/main/ofl/exo2/OFL.txt',
    licenseFilename: 'OFL-Exo2.txt',
  },
];

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '../..');

const coreFontsDir = resolve(repoRoot, 'core/public/assets/fonts');

/**
 * URL içindeki [ ve ] karakterlerini manuel encode eder.
 * encodeURI/encodeURIComponent standart setteki bu karakterleri bıraktığı için
 * özel olarak %5B / %5D'ye çevirir.
 */
function encodeBrackets(url) {
  return url.replace(/\[/g, '%5B').replace(/\]/g, '%5D');
}

async function ensureDirs(dirs) {
  for (const dir of dirs) {
    await fs.mkdir(dir, { recursive: true });
  }
}

async function download(url, label) {
  const encodedUrl = encodeBrackets(url);
  const res = await fetch(encodedUrl);
  if (!res.ok) {
    console.error(`[HATA] ${label} indirilemedi: ${res.status} ${res.statusText} (${url})`);
    return null;
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function copyToDirs(buffer, filename, dirs) {
  for (const dir of dirs) {
    const target = join(dir, filename);
    await fs.writeFile(target, buffer);
  }
}

async function main() {
  const targetDirs = [coreFontsDir];
  await ensureDirs(targetDirs);

  const uniqueLicenses = new Map();
  for (const font of FONTS) {
    if (!uniqueLicenses.has(font.licenseUrl)) {
      uniqueLicenses.set(font.licenseUrl, font.licenseFilename);
    }
  }

  let totalBytes = 0;
  let success = 0;
  let failed = 0;

  for (const font of FONTS) {
    const buffer = await download(font.url, font.filename);
    if (!buffer) {
      failed++;
      continue;
    }
    await copyToDirs(buffer, font.filename, targetDirs);
    console.log(`[OK] ${font.filename} (${buffer.length} byte)`);
    totalBytes += buffer.length;
    success++;
  }

  for (const [url, filename] of uniqueLicenses) {
    const buffer = await download(url, filename);
    if (!buffer) {
      failed++;
      continue;
    }
    await copyToDirs(buffer, filename, targetDirs);
    console.log(`[OK] ${filename} (${buffer.length} byte)`);
    totalBytes += buffer.length;
    success++;
  }

  console.log(`\nİndirme tamamlandı: ${success} dosya, ${(totalBytes / 1024).toFixed(1)} KB, ${failed} hata.`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Beklenmeyen hata:', err);
  process.exit(1);
});
