/**
 * public/assets/audio altındaki tüm .ogg dosyalarını .mp3'e çevirir.
 * iOS WKWebView Ogg Vorbis decode etmez; music/loader.ts .ogg başarısız
 * olduğunda .mp3 fallback dener — bu script o dosyaları üretir.
 * Kaynak her zaman .ogg'dir (audio-src'teki WAV'lardan değil) — encode
 * zinciri OGG → MP3, WAV → MP3 değil.
 *
 * Kullanım: tsx core/scripts/convert-audio.ts <audio-dir>
 */
import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ensureFfmpeg } from '../src/writer';

const dirArg = process.argv[2];
if (!dirArg) {
  console.error('Kullanim: tsx core/scripts/convert-audio.ts <audio-dir>');
  process.exit(1);
}

function findOggFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findOggFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.ogg')) {
      results.push(full);
    }
  }
  return results;
}

try {
  ensureFfmpeg();
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}

const rootDir = resolve(dirArg);
if (!statSync(rootDir, { throwIfNoEntry: false })?.isDirectory()) {
  console.error(`Klasör bulunamadı: ${rootDir}`);
  process.exit(1);
}

const oggFiles = findOggFiles(rootDir);
if (oggFiles.length === 0) {
  console.log(`${rootDir} altında .ogg dosyası bulunamadı.`);
  process.exit(0);
}

let failed = 0;
for (const oggPath of oggFiles) {
  const mp3Path = oggPath.replace(/\.ogg$/, '.mp3');
  const res = spawnSync('ffmpeg', [
    '-y',
    '-i',
    oggPath,
    '-c:a',
    'libmp3lame',
    '-q:a',
    '2',
    mp3Path,
  ]);
  if (res.error) {
    console.error(`FFmpeg çalıştırılamadı (${oggPath}): ${res.error.message}`);
    failed++;
    continue;
  }
  if (res.status !== 0) {
    console.error(`Başarısız: ${oggPath}\n${res.stderr?.toString() ?? ''}`);
    failed++;
    continue;
  }
  console.log(`Generated: ${mp3Path}`);
}

if (failed > 0) {
  console.error(`\n${failed}/${oggFiles.length} dosya başarısız oldu.`);
  process.exit(1);
}

console.log(`\n${oggFiles.length} dosya .mp3'e çevrildi.`);
