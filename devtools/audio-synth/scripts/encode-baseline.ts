/**
 * `audio:encode-baseline` — sınıf bazlı kodlama profilinin taban çizgisini
 * ÖLÇEREK yazar (`encode-profiles.lock.json`).
 *
 * Korpus (referans manifest'lerin yeniden render'ı + UI/ambiyans preset ve
 * programları) taramadaki her Vorbis kalitesiyle kodlanıp çözülür; bayt ve
 * kodek sonrası sadakat kaydedilir, seçim `selectQuality` kuralıyla yapılır.
 * Koddaki profil tablosu ölçümün seçtiği kaliteden farklıysa kilit YAZILMAZ:
 * profil ölçüm olmadan değişemez, ölçüm de tabloyu sessizce değiştirmez.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { prettyCanonicalJson } from '../src/protocol/canonical';
import { measureEncodeBaseline } from '../src/protocol/encodeBaseline';
import { ENCODE_BASELINE_FILE, ENCODE_POLICY } from '../src/protocol/encodeProfiles';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const started = Date.now();
const baseline = measureEncodeBaseline(repoRoot);
const mismatches: string[] = [];
for (const [name, measured] of Object.entries(baseline.classes)) {
  const coded = ENCODE_POLICY.classes[name as keyof typeof ENCODE_POLICY.classes].quality;
  const at = measured.totals.find((t) => t.quality === measured.selected);
  console.log(
    `${name.padEnd(10)} seçilen q${measured.selected} (ölçütü geçen en düşük: ` +
      `${measured.lowestPassing === null ? 'yok' : `q${measured.lowestPassing}`}) ` +
      `${at?.bytes ?? 0} B, ${at?.kbps ?? 0} kbps; tabloda q${coded}`,
  );
  if (coded !== measured.selected)
    mismatches.push(`${name}: tablo q${coded}, ölçüm q${measured.selected}`);
}
console.log(
  `başlık yükü: mono ${baseline.headerBytes.mono} B, stereo ${baseline.headerBytes.stereo} B`,
);
console.log(`süre ${((Date.now() - started) / 1000).toFixed(1)} sn`);
if (mismatches.length > 0) {
  process.stderr.write(
    `${mismatches.join('\n')}\nKilit yazılmadı; tabloyu ölçümün seçtiği kaliteye çek.\n`,
  );
  process.exitCode = 1;
} else {
  writeFileSync(
    new URL(`../${ENCODE_BASELINE_FILE}`, import.meta.url),
    prettyCanonicalJson(baseline),
  );
  console.log(`${ENCODE_BASELINE_FILE} yazıldı.`);
}
