import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseAuditionCatalog } from '@/config/auditionCatalog';
import { particleConfig } from '@/config/particles';

/*
 * P3 final audition paketi. Girdi ÖLÇÜMDÜR: F7 uzun koşu özeti ve katalog.
 * F7 koşulmadan paket üretilmez — "teknik kapıyı geçen adaylar" listesi
 * ölçülmemişse yazılamaz.
 */
const CATALOG = process.argv[2] ?? 'research-out/audition-catalog.json';
const LONG_RUN = process.argv[3] ?? 'benchmarks/results/f7-long-horizon.json';
const OUTPUT = process.argv[4] ?? 'research-out/P3-final-audition.md';

interface LongRunVerdict {
  readonly digest: string;
  readonly scenario: string;
  readonly verdict: {
    readonly passed: boolean;
    readonly retentionMedian: number;
    readonly retentionMin: number;
    readonly structuredShare: number;
    readonly recoveredShare: number;
    readonly failures: readonly string[];
  };
  readonly collapse: {
    readonly canaryRequired: boolean;
    readonly canaryReasons: readonly string[];
  };
}

interface LongRunSummary {
  readonly tarih: string;
  readonly dakika: number;
  readonly istenenDakika: number;
  readonly kısaltıldı: boolean;
  readonly seedSayısı: number;
  readonly perturbationDakikaları: readonly number[];
  readonly sonuçlar: readonly LongRunVerdict[];
}

const catalog = parseAuditionCatalog(readFileSync(CATALOG, 'utf8'), particleConfig.radiusUnits);
const longRun = JSON.parse(readFileSync(LONG_RUN, 'utf8')) as LongRunSummary;

const byDigest = new Map<string, LongRunVerdict[]>();
for (const result of longRun.sonuçlar) {
  byDigest.set(result.digest, [...(byDigest.get(result.digest) ?? []), result]);
}

function percent(value: number): string {
  return `%${(value * 100).toFixed(0)}`;
}

const passing = catalog.entries.filter((entry) =>
  (byDigest.get(entry.digest) ?? []).every((result) => result.verdict.passed),
);

const rows = catalog.entries.flatMap((entry) =>
  (byDigest.get(entry.digest) ?? []).map((result) =>
    [
      `| \`${entry.digest}\` | ${entry.family} | ${result.scenario} |`,
      `${result.verdict.passed ? 'GEÇTİ' : 'FAIL'} |`,
      `${result.verdict.retentionMedian.toFixed(3)} | ${result.verdict.retentionMin.toFixed(3)} |`,
      `${percent(result.verdict.structuredShare)} | ${percent(result.verdict.recoveredShare)} |`,
      `${result.collapse.canaryRequired ? 'EVET' : 'hayır'} |`,
      `${result.verdict.failures.join('; ') || '—'} |`,
    ].join(' '),
  ),
);

const shortened = longRun.kısaltıldı
  ? `Süre ${longRun.istenenDakika} dakika istendi, ölçülen tick maliyeti bunu bütçeye sığdırmadığı ` +
    `için §8.4 gereği ${longRun.dakika} dakikaya inildi (eşik gevşetilmedi, ölçüm raporlandı).`
  : `Süre ${longRun.dakika} simüle dakikadır.`;

const lines = [
  '# P3 — Adım 3 final audition (F9)',
  '',
  '**Bu madde senin kararın olduğu için TODO’da `[ ]` bırakıldı.**',
  '',
  '## 1. Teknik kapıyı geçenler',
  '',
  `Uzun koşu ${longRun.tarih} tarihinde, \`corpus-v1\` korpusunun ${longRun.seedSayısı} tohumuyla,`,
  `intrinsic ve void-stress senaryolarıyla BİRLİKTE koşuldu. ${shortened}`,
  `Perturbation dakikaları: ${longRun.perturbationDakikaları.join(', ') || 'yok'}.`,
  '',
  `Teknik kapıyı iki senaryoda da geçen aday sayısı: **${passing.length}/${catalog.entries.length}**.`,
  '',
  '| digest | aile | senaryo | kapı | koruma medyan | en kötü seed | yapısal | toparlanan | canary | düşme nedeni |',
  '| ------ | ---- | ------- | ---- | ------------- | ------------ | ------- | ---------- | ------ | ------------ |',
  ...rows,
  '',
  '§8.4 eşikleri: 30 dk koruma medyanı ≥ 0,70, hiçbir seed < 0,40, DYNAMIC_STRUCTURED',
  'seed’lerin ≥ %75’inde, herhangi bir sert FAIL gerekçesi ≥ %50’sinde FAIL,',
  'toparlanma ≥ %75. Geç çöküş kuralı tetiklenen adayda 60 dakikalık canary gerekir.',
  '',
  '## 2. Nasıl açılır',
  '',
  '```',
  'pnpm --filter @volstudio/vol-life dev            # tarayıcı',
  'pnpm --filter @volstudio/vol-life tauri:dev      # masaüstü',
  'pnpm --filter @volstudio/vol-life tauri:android:dev && adb reverse tcp:5180 tcp:5180',
  '```',
  '',
  'Aday ve tohum geçişi seçenekler çekmecesindeki kabul oturumu panelinden yapılır.',
  '',
  '## 3. Verilecek karar',
  '',
  '1. **Hangi aday promote edilsin?** (digest ile)',
  '2. **Tarayıcı, masaüstü ve Lenovo/Samsung’da kabul ediyor musun?**',
  '',
  'Kararın ardından `research:promote --artefact <yol> --accepted-by <ad>` adayı',
  '`src/config/substrateCandidate.ts`e provenance’ıyla yazar; `research:canary`',
  'aynı korpusta perturbation olmadan doğrular. Canary düşerse promotion commit’i',
  'revert edilir ve araştırma devam eder.',
  '',
  'Hiçbir aday teknik kapıyı geçmediyse promotion YAPILMAZ: rapor "Adım 4’e',
  'başlanamaz" der ve bir sonraki araştırma önerisini taşır.',
  '',
];

mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, `${lines.join('\n')}\n`, 'utf8');
console.log(
  `P3 paketi yazıldı: ${OUTPUT} (${passing.length}/${catalog.entries.length} aday geçti)`,
);
