/**
 * FM alias karakterizasyonu — `FM_ALIAS_LIMITS`in kaynağı olan ızgara.
 *
 * Deterministiktir; çıktı commit'lenmez, sınırlar yeniden ölçülmek
 * istendiğinde koşulur. Her modülatör sınıfı için seviyeyi ilk bozan tepe
 * sapmasını (Δf = etkin index × fm) raporlar.
 *
 * Kullanım: tsx scripts/fm-alias-report.ts [--json]
 */
import { measureFmAlias } from '../src/analysis/fmAlias';
import { FM_ALIAS_LIMITS, assessFmAlias } from '../src/analysis/fmRisk';
import type { FmParams } from '../src/types';

const MODULATORS = ['sine', 'triangle', 'sawtooth', 'square', 'pulse'] as const;
const rows: {
  frequency: number;
  fm: FmParams;
  aliasToSignalDb: number;
  worstSpurDbc: number;
  predicted: string;
  modulatorClass: string;
  peakDeviationHz: number;
}[] = [];

for (const frequency of [110, 440, 1760, 5000]) {
  for (const modulatorWave of MODULATORS) {
    for (const index of [0.5, 2, 5, 10, 20]) {
      for (const ratio of [0.5, 1, 2, 3.5]) {
        for (const feedback of [0, 0.1, 0.3]) {
          const fm: FmParams = { modulatorWave, index, ratio, feedback };
          const measured = measureFmAlias('sine', frequency, fm);
          const assessment = assessFmAlias({ frequency, fm });
          rows.push({
            frequency,
            fm,
            ...measured,
            predicted: assessment.level,
            modulatorClass: assessment.modulatorClass,
            peakDeviationHz: assessment.peakDeviationHz,
          });
        }
      }
    }
  }
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ limits: FM_ALIAS_LIMITS, rows }, null, 1));
} else {
  const { safeMaxDb, cautionMaxDb } = FM_ALIAS_LIMITS.levels;
  const classes = [...new Set(rows.map((r) => r.modulatorClass))];
  for (const name of classes) {
    const group = rows.filter((r) => r.modulatorClass === name);
    const firstBreak = (limit: number) =>
      Math.min(...group.filter((r) => r.aliasToSignalDb > limit).map((r) => r.peakDeviationHz));
    const worst = Math.max(...group.map((r) => r.aliasToSignalDb));
    console.log(
      `${name.padEnd(22)} n=${String(group.length).padStart(4)}  güvenli Δf<${firstBreak(
        safeMaxDb,
      )}  ` + `dikkat Δf<${firstBreak(cautionMaxDb)}  en kötü ${worst.toFixed(1)} dB`,
    );
  }
  const falseSafe = rows.filter((r) => r.predicted === 'safe' && r.aliasToSignalDb > safeMaxDb);
  const optimistic = rows.filter(
    (r) => r.predicted === 'caution' && r.aliasToSignalDb > cautionMaxDb,
  );
  console.log(
    `\n${rows.length} nokta; yanlış "safe": ${falseSafe.length}, iyimser "caution": ${optimistic.length}`,
  );
}
