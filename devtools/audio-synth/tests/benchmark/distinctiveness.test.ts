import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { measureDistinctiveness } from '../../scripts/distinctiveness-report.js';
import { repoRenderCache } from '../../src/protocol/renderCacheStore';
import { withRenderSession } from '../../src/engine/session';
import { CORPUS_TIMEOUT } from '../support/timeouts';

/**
 * Ayırt edicilik matrisi: her görevin mekanik kriter kümesi diğer 13
 * görevin render'ının en az 11'ini reddeder. "Reddedilemeyen" çift —
 * adayın bir parça render'ı değerlendiricinin bir parça kriter kümesini
 * bütünüyle karşılıyor — adıyla DOCUMENTED_PAIRS'a yazılır ve DESIGN'da
 * gerekçelendirilir; yeni bir çift burada sessizce geçemez.
 */
const REPO = fileURLToPath(new URL('../../../..', import.meta.url));

/** Bilinçli olarak reddedilemeyen çiftler (`değerlendirici→aday`); gerekçe DESIGN'da. */
const DOCUMENTED_PAIRS: readonly string[] = [];

describe('benchmark ayırt edicilik matrisi (14 görev × 13 aday)', () => {
  it(
    'her görev en az 11 reddetme sağlar; reddedilemeyen çiftler belgelidir',
    () =>
      withRenderSession({ cache: repoRenderCache(REPO) }, () => {
        const { rows } = measureDistinctiveness(REPO);
        expect(rows).toHaveLength(14);
        for (const row of rows) {
          expect(
            row.rejected.length,
            `${row.task}: ${row.rejected.length}/13 reddetti, reddedilemeyen: ${row.accepted.join(
              ', ',
            )}`,
          ).toBeGreaterThanOrEqual(11);
        }
        const pairs = rows.flatMap((r) => r.accepted.map((a) => `${r.task}→${a}`)).sort();
        expect(
          pairs,
          `belgelenmemiş reddedilemeyen çift: ${pairs.join(
            ', ',
          )} — DESIGN'a gerekçesiyle yazın ya da kriteri ayırt edici yapın`,
        ).toEqual([...DOCUMENTED_PAIRS].sort());
      }),
    CORPUS_TIMEOUT,
  );
});
