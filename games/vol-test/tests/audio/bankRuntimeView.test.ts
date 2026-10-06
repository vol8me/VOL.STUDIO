import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SoundFamilyBank } from '@volstudio/core/audio/sfx';
import { runtimeBankView } from '../../../../scripts/vite/audioBankRuntime.mjs';
import { FAMILIES } from '@/audio/assets';

/**
 * Çalışma zamanı görünümü sözleşmesi: oyun kanonik bank yerine indirgenmiş
 * görünümü yükler (bkz. `scripts/vite/audioBankRuntime.mjs`). Görünüm,
 * `SoundFamilyBank.parse`nin okuduğu alanların TAMAMINI taşımalıdır; yoksa
 * ses davranışı sessizce değişir. Bu test o sapmayı yakalar.
 */
const directory = resolve(import.meta.dirname, '../../audio-banks');
const banks = readdirSync(directory)
  .filter((file) => file.endsWith('.json'))
  .map((file) => ({
    file,
    document: JSON.parse(readFileSync(resolve(directory, file), 'utf8')) as unknown,
  }));

const TOKENS = Array.from({ length: 96 }, (_, index) => `jeton-${index}`);

describe('ses bank çalışma zamanı görünümü', () => {
  it('kanonik bank kümesi boş değildir', () => {
    expect(banks.length).toBeGreaterThanOrEqual(5);
  });

  for (const { file, document } of banks) {
    it(`${file}: görünüm kanonikle aynı aileyi kurar`, () => {
      const full = SoundFamilyBank.parse(document);
      const view = SoundFamilyBank.parse(runtimeBankView(document));
      expect(view.familyId).toBe(full.familyId);
      expect(view.variants).toEqual(full.variants);
    });

    it(`${file}: filtre ve deterministik seçim kanonikle aynıdır`, () => {
      const full = SoundFamilyBank.parse(document);
      const view = SoundFamilyBank.parse(runtimeBankView(document));
      const queries = [
        {},
        ...Object.entries(full.variants[0].roles).map(([axis, role]) => ({
          roles: { [axis]: role },
        })),
        { tags: [...full.variants[0].tags] },
      ];
      for (const query of queries) {
        expect(view.filter(query)).toEqual(full.filter(query));
        for (const token of TOKENS) {
          expect(view.choose(token, query)?.key).toBe(full.choose(token, query)?.key);
        }
      }
    });
  }

  it('oyunun yüklediği aileler kanonik bankların çalışma zamanı görünümüdür', () => {
    for (const { document } of banks) {
      const full = SoundFamilyBank.parse(document);
      const shipped = Object.values(FAMILIES).find((family) => family.familyId === full.familyId);
      expect(shipped, `${full.familyId} FAMILIES içinde yok`).toBeDefined();
      expect(shipped!.variants).toEqual(full.variants);
    }
  });
});
