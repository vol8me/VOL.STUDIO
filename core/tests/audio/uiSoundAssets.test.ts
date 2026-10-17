import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  UI_MAX_VARIANTS,
  UI_SOUND_EVENTS,
  UI_SOUND_PALETTES,
  UI_SOUND_PUBLIC_DIR,
  UI_SOUND_VARIANT_KEYS,
  uiSoundAssets,
  uiSoundFileStem,
} from '../../src/audio/ui';
import { SoundFamilyBank } from '../../src/audio/sfx/SoundFamilyBank';

/**
 * Gönderilen UI ses setlerinin ÇALIŞMA ZAMANI sözleşmesiyle paritesi: her palet ve her olay
 * için üretilmiş bir aile bankı, 3 varyant, gerçek OGG ve geçerli manifest.
 * Set `audio-synth` ile çevrimdışı üretilir; burada yalnız çıktısı sınanır.
 */
const coreRoot = resolve(import.meta.dirname, '../..');
const audioRoot = join(coreRoot, 'public/assets/audio/ui');

interface Manifest {
  schema: string;
  asset: { path: string; bytes: number; encodedHash: string };
  integration: { package: string; targetKind: string; loop: boolean };
  policy: { assetClass: string; verdict: string; violations: string[] };
  brief: { document: { durationSeconds: { min: number; max: number } } };
  program: {
    document: {
      layers: { name: string; role: string }[];
    };
  };
  analysis: {
    encoded: {
      measuredFrom: string;
      dc: { channelOffset: number[] };
      defects: { clips: { channelSamples: number }; clicks: { count: number } };
      format: { durationSeconds: number; sampleRate: number; channels: number };
      level: {
        truePeakDbtp: number;
        samplePeakDbfs: number;
        maxMomentaryLufs: number;
        rmsDbfs: number;
      };
      spectral: {
        centroidHz: number;
        bandsDb: { sub: number; low: number; mid: number; high: number; air: number };
      };
    };
  };
}

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;

describe('UI ses seti: yol sözleşmesi', () => {
  it('dosya adı gövdesi olay kimliğinin kebab biçimidir', () => {
    expect(uiSoundFileStem('toggleOn')).toBe('toggle-on');
    expect(uiSoundFileStem('levelUp')).toBe('level-up');
    expect(uiSoundFileStem('press')).toBe('press');
  });

  it('uiSoundAssets her olay için 3 varyantlı, baseUrl ve palet önekli, sıralı URL verir', () => {
    for (const palette of UI_SOUND_PALETTES) {
      const urls = uiSoundAssets('/oyun/', palette);
      expect(Object.keys(urls)).toEqual([...UI_SOUND_EVENTS]);
      for (const event of UI_SOUND_EVENTS) {
        expect(urls[event]).toEqual(
          UI_SOUND_VARIANT_KEYS.map(
            (key) => `/oyun/${UI_SOUND_PUBLIC_DIR}${palette}/${uiSoundFileStem(event)}-${key}.ogg`,
          ),
        );
        expect(urls[event]).toHaveLength(UI_MAX_VARIANTS);
      }
    }
    // Sondaki eğik çizgi yoksa eklenir; varsayılan göreli kök ve `steel` paletidir.
    expect(uiSoundAssets('/x').press?.[0]).toBe(`/x/${UI_SOUND_PUBLIC_DIR}steel/press-a.ogg`);
    expect(uiSoundAssets('./', 'aurum').toggleOff?.[2]).toBe(
      `./${UI_SOUND_PUBLIC_DIR}aurum/toggle-off-c.ogg`,
    );
  });
});

for (const palette of UI_SOUND_PALETTES) {
  const audioDir = join(audioRoot, palette);
  const keyOf = (event: (typeof UI_SOUND_EVENTS)[number], variant: string): string =>
    `${uiSoundFileStem(event)}-${variant}`;

  describe(`UI ses seti (${palette}): üretim çıktısı`, () => {
    it('klasörde yalnız sözlükteki olayların OGG varyantları vardır (fazla/eksik dosya yok)', () => {
      expect(existsSync(audioDir), `${palette} sesleri üretilmemiş`).toBe(true);
      const expected = UI_SOUND_EVENTS.flatMap((event) =>
        UI_SOUND_VARIANT_KEYS.map((variant) => `${keyOf(event, variant)}.ogg`),
      );
      expect(readdirSync(audioDir).sort()).toEqual(expected.sort());
    });

    for (const event of UI_SOUND_EVENTS) {
      const stem = uiSoundFileStem(event);
      it(`${event}: banka 3 varyantı taşır ve her varyant gerçek bir OGG'ye bağlıdır`, () => {
        const bankPath = join(coreRoot, 'audio-banks', `ui-${palette}-${stem}.json`);
        const raw = readJson<{ family: { familyId: string }; package: string }>(bankPath);
        expect(raw.family.familyId).toBe(`ui-${palette}-${stem}`);
        expect(raw.package).toBe('@volstudio/core');
        const bank = SoundFamilyBank.parse(raw);
        expect(bank.variants.map((variant) => variant.key)).toEqual(
          UI_SOUND_VARIANT_KEYS.map((variant) => keyOf(event, variant)),
        );
        for (const variant of bank.variants) {
          expect(variant.path).toBe(`public/assets/audio/ui/${palette}/${variant.key}.ogg`);
          const file = join(coreRoot, variant.path);
          expect(statSync(file).size, variant.key).toBeGreaterThan(1000);
          expect(statSync(file).size, variant.key).toBeLessThan(32 * 1024);
          // OGG yakalama deseni.
          expect(readFileSync(file).subarray(0, 4).toString('latin1')).toBe('OggS');
          expect(variant.durationSeconds).toBeGreaterThan(0.03);
          expect(variant.durationSeconds).toBeLessThan(1.5);
        }
        // Çalışma zamanı URL'leri banka yollarıyla aynı dosyaları gösterir.
        const urls = uiSoundAssets('./', palette)[event] ?? [];
        expect(
          urls.map((url) => url.replace(`./${UI_SOUND_PUBLIC_DIR}`, 'public/assets/audio/ui/')),
        ).toEqual(bank.variants.map((variant) => variant.path));
      });

      it(`${event}: her varyantın manifesti kütüphane hedefi, ui sınıfı ve geçen politikayı kaydeder`, () => {
        for (const variant of UI_SOUND_VARIANT_KEYS) {
          const id = keyOf(event, variant);
          const manifest = readJson<Manifest>(
            join(coreRoot, 'audio-manifests/ui', palette, `${id}.json`),
          );
          expect(manifest.schema).toBe('AudioAssetManifestV1');
          expect(manifest.integration).toMatchObject({
            package: '@volstudio/core',
            targetKind: 'library',
            loop: false,
          });
          expect(manifest.policy).toMatchObject({
            assetClass: 'ui',
            verdict: 'pass',
            violations: [],
          });
          expect(manifest.asset.path).toBe(`core/public/assets/audio/ui/${palette}/${id}.ogg`);
          expect(manifest.asset.bytes).toBe(statSync(join(audioDir, `${id}.ogg`)).size);
        }
      });
    }

    it('kodlama SONRASI ölçüler (çözülmüş dosya): tepe, yükseklik, DC, kırpma, sonluluk ve süre', () => {
      for (const event of UI_SOUND_EVENTS) {
        for (const variant of UI_SOUND_VARIANT_KEYS) {
          const id = keyOf(event, variant);
          const { analysis, brief } = readJson<Manifest>(
            join(coreRoot, 'audio-manifests/ui', palette, `${id}.json`),
          );
          const encoded = analysis.encoded;
          // Ölçü gönderilen (kodlanmış, çözülmüş) dosyadandır.
          expect(encoded.measuredFrom, id).toBe('decoded-encoded');
          // Tepe: gerçek tepe −1 dBTP altında (ui sınıfı sınırı).
          expect(encoded.level.truePeakDbtp, `${id} true peak`).toBeLessThanOrEqual(-1);
          // Yükseklik: kısa olay için en yüksek momentary, ui aralığı [-42, -8] LUFS.
          expect(encoded.level.maxMomentaryLufs, `${id} yükseklik`).toBeGreaterThanOrEqual(-42);
          expect(encoded.level.maxMomentaryLufs, `${id} yükseklik`).toBeLessThanOrEqual(-8);
          // DC: kanal ofseti −60 dBFS (0.001) altında.
          for (const offset of encoded.dc.channelOffset)
            expect(Math.abs(offset), id).toBeLessThan(0.001);
          // Kırpma yok; sert temas tıkı tasarım gereği tek bir geçiş sayılabilir.
          expect(encoded.defects.clips.channelSamples, id).toBe(0);
          expect(encoded.defects.clicks.count, id).toBeLessThanOrEqual(1);
          // Sonluluk: ölçülerin hepsi sonlu sayı.
          for (const value of [
            encoded.level.truePeakDbtp,
            encoded.level.samplePeakDbfs,
            encoded.level.maxMomentaryLufs,
            encoded.level.rmsDbfs,
            ...Object.values(encoded.spectral.bandsDb),
          ]) {
            expect(Number.isFinite(value), `${id} sonlu`).toBe(true);
          }
          // Süre: brief aralığı içinde (Vorbis dolgusu payıyla) ve mono 48 kHz.
          expect(encoded.format).toMatchObject({ sampleRate: 48000, channels: 1 });
          expect(encoded.format.durationSeconds, `${id} süre`).toBeGreaterThanOrEqual(
            brief.document.durationSeconds.min - 0.01,
          );
          expect(encoded.format.durationSeconds, `${id} süre`).toBeLessThanOrEqual(
            brief.document.durationSeconds.max + 0.05,
          );
        }
      }
    });

    it('her olay tok bir gövde taşır: gövde ve tık katmanı vardır, alt-orta bantlar üst bantlardan güçlüdür', () => {
      for (const event of UI_SOUND_EVENTS) {
        for (const variant of UI_SOUND_VARIANT_KEYS) {
          const id = keyOf(event, variant);
          const { program, analysis } = readJson<Manifest>(
            join(coreRoot, 'audio-manifests/ui', palette, `${id}.json`),
          );
          const layers = program.document.layers;
          expect(
            layers.filter((layer) => layer.role === 'body').length,
            `${id}: gövde katmanı yok`,
          ).toBeGreaterThan(0);
          expect(
            layers.filter((layer) => layer.role === 'transient').length,
            `${id}: tık katmanı yok`,
          ).toBeGreaterThan(0);
          // Gövde sesin alt-orta kütlesidir: alçak bant (120–500 Hz) ya da sub, yüksek ve hava
          // bantlarından anlamlı biçimde güçlüdür (ince, cıvıltılı ses değil).
          const { sub, low, high, air } = analysis.encoded.spectral.bandsDb;
          expect(
            Math.max(sub, low) - Math.max(high, air),
            `${id}: gövde/üst oranı`,
          ).toBeGreaterThan(-4);
          // Enerji merkezi tizde kaçmaz.
          expect(analysis.encoded.spectral.centroidHz, `${id} merkez`).toBeLessThan(2500);
        }
      }
    });
  });
}
