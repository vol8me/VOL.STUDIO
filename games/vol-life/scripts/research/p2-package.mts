import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseAuditionCatalog, type AuditionCatalogEntry } from '@/config/auditionCatalog';
import { particleConfig } from '@/config/particles';

/*
 * P2 kabul paketini ÖLÇÜLEN katalogdan üretir. Paket elle yazılırsa sayılar
 * katalogla ayrışır; burada tek kaynak `research-out/audition-catalog.json`dır.
 */
const CATALOG = process.argv[2] ?? 'research-out/audition-catalog.json';
const OUTPUT = process.argv[3] ?? 'research-out/P2-insan-onelemesi.md';
const LONG_RUN = process.argv[4] ?? 'benchmarks/results/f7-long-horizon.json';

const catalog = parseAuditionCatalog(readFileSync(CATALOG, 'utf8'), particleConfig.radiusUnits);
const longRun = readOptional(LONG_RUN);

function readOptional(path: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/* Metrik haritası AÇIK uçludur: eksik alan "—" yazılır, uydurulmaz. */
function percent(value: number | undefined): string {
  return typeof value === 'number' ? `%${(value * 100).toFixed(0)}` : '—';
}

function number(value: number | undefined, digits = 1): string {
  return typeof value === 'number' ? value.toFixed(digits) : '—';
}

function row(entry: AuditionCatalogEntry, index: number): string {
  const phases = Object.entries(entry.phaseDistribution)
    .map(([reason, count]) => `${reason}:${count}`)
    .join(', ');
  const risks = entry.risks.length > 0 ? entry.risks.join('; ') : 'ölçülen risk yok';
  return [
    `| ${index + 1} | \`${entry.digest}\` | ${entry.family} | ${entry.primaryReason} |`,
    `${percent(entry.metrics.clusteredFraction)} | ${percent(entry.metrics.retention)} |`,
    `${number(entry.metrics.clusterCount)} | ${phases} | ${risks} |`,
  ].join(' ');
}

const longRunNote = longRun
  ? `F7 uzun koşusu ${String(longRun.dakika)} dakika × ${String(
      longRun.seedSayısı,
    )} tohum ile koşuldu (${String(longRun.tarih)}).`
  : 'F7 uzun koşusu bu paket yazılırken henüz bitmemişti; sonuçlar ayrıca iletilir.';

const lines = [
  '# P2 — İnsan ön-elemesi (F6)',
  '',
  'Bu paket tek oturumda uygulanır. Sonunda hangi adayların geçtiğini, hangilerinin',
  'hangi nedenle elendiğini söylüyorsun. **Bu madde senin kararın olduğu için TODO’da',
  '`[ ]` bırakıldı; senin yerine işaretlemedim.**',
  '',
  '## 1. Kısa liste nasıl seçildi',
  '',
  'Seçim yalnız en yüksek skorlardan yapılmaz: önce her fazın en iyisi alınır, kalan',
  'yerler metrik uzayında birbirine EN UZAK adaylarla doldurulur. En yüksek skorlu',
  'sekiz aday birbirinin kopyası olabilir ve o listeden hiçbir şey öğrenilemezdi.',
  '',
  `Korpus: \`${catalog.corpusId}\`, tohumlar: ${catalog.seeds.join(
    ', ',
  )} (her aday AYNI üç tohumla gösterilir).`,
  `Kaynak revizyonu: \`${catalog.sourceRevision.slice(0, 12)}\`${
    catalog.sourceDirty ? ' — KİRLİ AĞAÇ' : ''
  }.`,
  longRunNote,
  '',
  '## 2. Adaylar',
  '',
  '| # | digest | aile | faz | yapılı madde | madde tutma | küme | seed fazları | bilinen riskler |',
  '| - | ------ | ---- | --- | ------------ | ----------- | ---- | ------------ | --------------- |',
  ...catalog.entries.map(row),
  '',
  '`unclassified` aile, bu koşunun ölçmediği davranışları (chasing, symbiotic,',
  'recovering) otomatik atamadığımız için görünür: etiketi senin gözün koyacak.',
  '',
  '## 3. Nasıl açılır',
  '',
  '**Tarayıcı**',
  '',
  '```',
  'pnpm --filter @volstudio/vol-life dev',
  '```',
  '',
  'Adres `http://localhost:5180/`. Aday ve tohum geçişi: sağ üst dişli → **Audition',
  'adayı** ve **Tohum** satırlarındaki ‹ › düğmeleri. Sol üstteki rozet hangi adayın',
  've hangi tohumun koştuğunu yazar.',
  '',
  '**Lenovo tablet (TB350FU)**',
  '',
  '```',
  'pnpm --filter @volstudio/vol-life tauri:android:dev',
  'adb reverse tcp:5180 tcp:5180',
  '```',
  '',
  'Tablette adres çubuğu yok; geçiş yalnız çekmecedeki panelden yapılır.',
  '',
  '## 4. Ne aranıyor',
  '',
  'Aranan davranış aileleri:',
  '',
  '- **core-like:** yoğun bir çekirdek, dağılmadan duruyor.',
  '- **membrane-like:** çeperi olan, içi farklı bir yapı.',
  '- **mobile:** yapı bozulmadan dünyada yer değiştiriyor.',
  '- **recovering:** bozulduktan sonra eski hâline dönüyor.',
  '- **fragile:** kırılgan ama anlamlı; kolay dağılıyor.',
  '- **chasing:** bir yapı diğerini kovalıyor.',
  '- **symbiotic:** iki yapı birbirine bağlı kalıyor.',
  '',
  'Kesin elenecekler:',
  '',
  '- renkli topak (yapı yok, sadece renk),',
  '- jitter (yerinde titreşim),',
  '- kalıcı orbit (aynı birkaç parçacık sonsuza kadar dönüyor).',
  '',
  '## 5. Verilecek karar',
  '',
  'Her aday için tek satır: **geçer** / **elenir + neden**. Geçen adaylar uzun koşuya',
  've final audition’a girer; elenenler gerekçesiyle artefakta yazılır.',
  '',
  'Hiçbirini beğenmezsen bu da bir sonuçtur: §8.4’ün (c) maddesi gereği aile',
  'çürütülmüş sayılır ve sıradaki aile (multi-lobe) aynı huniyle koşulur.',
  '',
];

mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, `${lines.join('\n')}\n`, 'utf8');
console.log(`P2 paketi yazıldı: ${OUTPUT} (${catalog.entries.length} aday)`);
