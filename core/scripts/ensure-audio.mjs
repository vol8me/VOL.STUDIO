/**
 * Ses asset'leri yoksa üretir; varsa hiçbir şey yapmaz.
 *
 * Ses dosyaları repoda tutulmaz (bkz. `.gitignore`): üretim deterministiktir,
 * asıl kaynak `core/scripts/generate-*.ts` dosyalarıdır. Bu yüzden taze bir
 * klonda `public/assets/audio` boş olur ve oyun sessiz açılırdı. `predev` /
 * `prebuild` bu script'i çağırır, eksikse bir kez üretir.
 *
 * Var olanı yeniden üretmez — üretim dakikalar sürüyor, her `pnpm dev`
 * çağrısında beklemek kabul edilemez. Sesleri kasten yenilemek için
 * `pnpm --filter @volstudio/vol-hell generate:audio` kullanılır.
 *
 * Kullanım: node core/scripts/ensure-audio.mjs <audio-dir>
 */
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const dirArg = process.argv[2];
if (!dirArg) {
  console.error('Kullanim: node core/scripts/ensure-audio.mjs <audio-dir>');
  process.exit(1);
}

const audioDir = resolve(dirArg);

/** Dizin ağacında en az bir `.ogg` var mı? */
function hasOgg(dir) {
  if (!existsSync(dir)) return false;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (hasOgg(full)) return true;
    } else if (entry.name.endsWith('.ogg')) {
      return true;
    }
  }
  return false;
}

if (hasOgg(audioDir)) {
  process.exit(0);
}

console.log('[ensure-audio] Ses asset\'leri bulunamadı, üretiliyor (bir kereye mahsus)...');

// `pnpm run` üzerinden çağrılır: script adları package.json'da tanımlı ve
// çalışma dizini zaten paket kökü.
//
// Windows'ta `pnpm` bir `.cmd` shim'idir ve `CreateProcess` onu bare-name ile
// çözemez; bu yüzden shell gerekiyor. Argüman geçirmek yerine komut tek string
// olarak veriliyor — `shell: true` ile args dizisi kullanmak Node'da
// deprecation uyarısı üretiyor (DEP0190) ve escape edilmediği için risklidir.
const res = spawnSync('pnpm run generate:audio', {
  stdio: 'inherit',
  shell: true,
});

if (res.status !== 0) {
  console.error(
    '[ensure-audio] Üretim başarısız. FFmpeg kurulu mu? (winget install ffmpeg)\n' +
      'Elle denemek için: pnpm --filter @volstudio/vol-hell generate:audio',
  );
  process.exit(1);
}
