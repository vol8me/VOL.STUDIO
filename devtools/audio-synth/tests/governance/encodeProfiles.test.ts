import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { AssetClass } from '../../src/analysis/assetQa';
import { AudioParamError } from '../../src/guard/errors';
import { measureItems } from '../../src/protocol/encodeBaseline';
import { buildEncodeCorpus } from '../../src/protocol/encodeCorpus';
import {
  ENCODE_BASELINE_FILE,
  ENCODE_POLICY,
  encodePolicyHash,
  validateBaseline,
  type EncodeBaselineV1,
} from '../../src/protocol/encodeProfiles';
import { readEncoderToolchain } from '../../src/protocol/toolchain';
import { PIPELINE_TIMEOUT } from '../support/timeouts';

/**
 * Kodlama profili ölçüm olmadan değişemez: koddaki tablo ve ölçüt, kilidin
 * ÖLÇTÜĞÜ politikayla birebir aynı olmalı; kilit kendi taramasından seçimi
 * yeniden türetebilmeli; korpus ve seçilen kalitedeki ölçüm bugün yeniden
 * üretilebilmeli (aynı araç zincirinde bayt bayt).
 */
const REPO = fileURLToPath(new URL('../../../..', import.meta.url));
const raw: unknown = JSON.parse(
  readFileSync(new URL(`../../${ENCODE_BASELINE_FILE}`, import.meta.url), 'utf8'),
);
const lock: EncodeBaselineV1 = validateBaseline(raw);
const classes = Object.keys(ENCODE_POLICY.classes) as AssetClass[];

describe('kodlama profili taban çizgisi', () => {
  it('kilit bugünkü politikayı ölçmüş; tablo kuralın seçimiyle aynı', () => {
    expect(lock.policyHash, 'politika değişti: pnpm audio:encode-baseline').toBe(
      encodePolicyHash(),
    );
    for (const name of classes) {
      expect(lock.classes[name].selected, name).toBe(ENCODE_POLICY.classes[name].quality);
      expect(lock.classes[name].selected).toBeGreaterThanOrEqual(ENCODE_POLICY.minQuality);
    }
  });

  it('kurcalanmış kilit: seçim ya da başarısızlık listesi ölçümden türemiyorsa reddedilir', () => {
    const forged = structuredClone(raw) as { classes: Record<string, { selected: number }> };
    forged.classes.sfx.selected = 4;
    expect(() => validateBaseline(forged)).toThrow(AudioParamError);
    const cleaned = structuredClone(raw) as {
      classes: Record<string, { items: { sweep: { failures: string[] }[] }[] }>;
    };
    for (const item of cleaned.classes.sfx.items) for (const m of item.sweep) m.failures = [];
    expect(() => validateBaseline(cleaned)).toThrow(/ölçümden türemiyor/);
  });

  it('kısa seste başlık baskın: sfx ve UI’da kalite artışı baytı az büyütür, ambiyansta çok', () => {
    const growth = (name: AssetClass) => {
      const at = (q: number) => lock.classes[name].totals.find((t) => t.quality === q)?.bytes ?? 0;
      return at(8) / at(4);
    };
    expect(lock.headerBytes.mono).toBeGreaterThan(3000);
    expect(growth('ui')).toBeLessThan(1.3);
    expect(growth('ambience')).toBeGreaterThan(2.5);
  });

  it(
    'korpus ve seçilen kalitelerdeki ölçüm bugün yeniden üretilir',
    () => {
      const corpus = buildEncodeCorpus(REPO);
      const recorded = classes.flatMap((name) => lock.classes[name].items);
      expect(corpus.map((c) => [c.id, c.pcmHash]).sort()).toEqual(
        recorded.map((c) => [c.id, c.pcmHash]).sort(),
      );
      const sameToolchain =
        readEncoderToolchain(ENCODE_POLICY.minQuality).fingerprint === lock.toolchain.fingerprint;
      for (const name of classes) {
        const quality = lock.classes[name].selected;
        const items = corpus.filter((c) => c.assetClass === name);
        const measured = measureItems(items, [quality]);
        for (const item of measured) {
          const want = lock.classes[name].items
            .find((i) => i.id === item.id)
            ?.sweep.find((m) => m.quality === quality);
          expect(item.sweep[0].failures, `${item.id} q${quality}`).toEqual([]);
          if (sameToolchain) expect(item.sweep[0]).toEqual(want);
        }
      }
    },
    PIPELINE_TIMEOUT,
  );
});
