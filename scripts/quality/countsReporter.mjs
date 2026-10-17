import { formatCounts } from './counts.mjs';

/**
 * Playwright raporlayıcısı: koşu sonunda proje (motor) başına geçen/atlanan/düşen/kararsız test
 * sayısını `##counts:` satırı olarak yazar; kapı koşucusu bunu atlama bütçesiyle karşılaştırır
 * (`counts.mjs`). Metin raporlayıcının yerini almaz, yanında durur.
 *
 * Anahtar `<kapsam>/<proje>[/<şerit>]`: kapsam paketin kısa adıdır, şerit yalnız vitrinin
 * `VOL_UI_E2E_LANE` değişkeniyle ayrılan ana/sessiz koşularında vardır.
 */

/**
 * @param {{ outcome(): string, parent: { project(): { name: string } | undefined } }[]} tests
 * @param {{ scope: string, lane?: string | null }} options
 */
export function summarizeOutcomes(tests, { scope, lane = null }) {
  const rows = new Map();
  for (const test of tests) {
    const project = test.parent.project()?.name ?? 'default';
    const key = `${scope}/${project}${lane ? `/${lane}` : ''}`;
    const row = rows.get(key) ?? { key, passed: 0, skipped: 0, failed: 0, flaky: 0 };
    const outcome = test.outcome();
    if (outcome === 'expected') row.passed += 1;
    else if (outcome === 'skipped') row.skipped += 1;
    else if (outcome === 'unexpected') row.failed += 1;
    else if (outcome === 'flaky') row.flaky += 1;
    rows.set(key, row);
  }
  return [...rows.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

export default class CountsReporter {
  /** @param {{ scope?: string }} [options] */
  constructor(options = {}) {
    this.scope = options.scope ?? 'e2e';
    this.lane = process.env.VOL_UI_E2E_LANE || null;
    this.suite = null;
  }

  onBegin(_config, suite) {
    this.suite = suite;
  }

  onEnd() {
    if (!this.suite) return;
    const rows = summarizeOutcomes(this.suite.allTests(), { scope: this.scope, lane: this.lane });
    for (const row of rows) console.log(formatCounts(row));
  }

  printsToStdio() {
    return false;
  }
}
