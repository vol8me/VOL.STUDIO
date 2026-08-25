/**
 * Üretilen sprite'lar için ölçüm aracı — §9.
 *
 * Ses tarafındaki `audio-qa.ts`in karşılığı ve D12'nin gereği: prosedürel
 * üretimde "kötü görünüyor" ifadesi tek başına takip edilemez.
 *
 * Belge dosyaları verilir, her biri render edilip ölçülür. Ölçüm ÇIKTININ
 * kendisi üzerinde yapılır — belgeye bakarak "palet uyumlu olmalı" demek
 * ölçüm değil varsayımdır.
 *
 *   tsx core/scripts/visual-synth-qa.ts <dosya-ya-da-dizin>… [--json]
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { renderSprite } from '../src/visualSynth/index';
import { formatQaReport, measureSprite, type QaReport } from '../src/visualSynth/qa';

function collectDocs(target: string): string[] {
  const stats = statSync(target, { throwIfNoEntry: false });
  if (!stats) return [];
  if (stats.isFile()) return target.endsWith('.json') ? [target] : [];

  const out: string[] = [];
  for (const entry of readdirSync(target, { withFileTypes: true })) {
    out.push(...collectDocs(join(target, entry.name)));
  }
  return out.sort();
}

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const targets = args.filter((arg) => !arg.startsWith('--'));

if (targets.length === 0) {
  console.error('Kullanım: tsx core/scripts/visual-synth-qa.ts <dosya-ya-da-dizin>… [--json]');
  process.exit(1);
}

const docs = targets.flatMap((target) => collectDocs(resolve(target)));
if (docs.length === 0) {
  console.error('Ölçülecek .json belge bulunamadı.');
  process.exit(1);
}

const reports: Array<{ doc: string; report: QaReport | null; error?: string }> = [];
let failed = 0;

for (const path of docs) {
  const label = relative(process.cwd(), path);
  try {
    const result = renderSprite(JSON.parse(readFileSync(path, 'utf-8')) as unknown);
    const report = measureSprite(result);
    if (!report.pass) failed++;
    reports.push({ doc: label, report });
  } catch (error) {
    failed++;
    reports.push({
      doc: label,
      report: null,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

if (asJson) {
  console.log(JSON.stringify({ pass: failed === 0, documents: reports }, null, 2));
} else {
  for (const entry of reports) {
    console.log(`\n${entry.doc}`);
    console.log(entry.report ? formatQaReport(entry.report) : `  ✗ ${entry.error ?? ''}`);
  }
  console.log(`\nToplam: ${reports.length} belge, ${failed} başarısız`);
}

if (failed > 0) process.exit(1);
