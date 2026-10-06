import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  UI_MAX_VARIANTS,
  UI_SOUND_EVENTS,
  UI_SOUND_PUBLIC_DIR,
  UI_SOUND_VARIANT_KEYS,
  uiSoundAssets,
} from '../../src/audio/ui';
import { SoundFamilyBank } from '../../src/audio/sfx/SoundFamilyBank';

/**
 * Gönderilen varsayılan UI ses setinin ÇALIŞMA ZAMANI sözleşmesiyle paritesi:
 * her olay için üretilmiş bir aile bankı, 3 varyant, gerçek OGG ve geçerli manifest.
 * Set `audio-synth` ile çevrimdışı üretilir; burada yalnız çıktısı sınanır.
 */
const coreRoot = resolve(import.meta.dirname, '../..');
const publicDir = join(coreRoot, 'public', UI_SOUND_PUBLIC_DIR.replace(/^assets\//, 'assets/'));
const audioDir = join(coreRoot, 'public/assets/audio/ui');

interface Manifest {
  schema: string;
  asset: { path: string; bytes: number; encodedHash: string };
  integration: { package: string; targetKind: string; loop: boolean };
  policy: { assetClass: string; verdict: string; violations: string[] };
  brief: { document: { durationSeconds: { min: number; max: number } } };
  program: {
    document: {
      layers: {
        name: string;
        role: string;
        resonators?: { primitive: string; params: { mode?: string; frequency?: number } }[];
      }[];
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
  it('uiSoundAssets her olay için 3 varyantlı, baseUrl önekli, sıralı URL verir', () => {
    const urls = uiSoundAssets('/oyun/');
    expect(Object.keys(urls)).toEqual([...UI_SOUND_EVENTS]);
    for (const event of UI_SOUND_EVENTS) {
      expect(urls[event]).toEqual(
        UI_SOUND_VARIANT_KEYS.map((key) => `/oyun/${UI_SOUND_PUBLIC_DIR}${event}-${key}.ogg`),
      );
      expect(urls[event]).toHaveLength(UI_MAX_VARIANTS);
    }
    // Sondaki eğik çizgi yoksa eklenir; varsayılan göreli kökür.
    expect(uiSoundAssets('/x').press?.[0]).toBe(`/x/${UI_SOUND_PUBLIC_DIR}press-a.ogg`);
    expect(uiSoundAssets().tick?.[2]).toBe(`./${UI_SOUND_PUBLIC_DIR}tick-c.ogg`);
  });
});

describe('UI ses seti: üretim çıktısı', () => {
  it('klasörde yalnız sözlükteki olayların OGG varyantları vardır (fazla/eksik dosya yok)', () => {
    expect(existsSync(audioDir), 'UI sesleri üretilmemiş').toBe(true);
    const expected = UI_SOUND_EVENTS.flatMap((event) =>
      UI_SOUND_VARIANT_KEYS.map((key) => `${event}-${key}.ogg`),
    );
    expect(readdirSync(audioDir).sort()).toEqual(expected.sort());
    expect(publicDir.endsWith('assets/audio/ui/') || publicDir.includes('assets')).toBe(true);
  });

  for (const event of UI_SOUND_EVENTS) {
    it(`${event}: banka 3 varyantı taşır ve her varyant gerçek bir OGG'ye bağlıdır`, () => {
      const bankPath = join(coreRoot, 'audio-banks', `ui-${event}.json`);
      const raw = readJson<{ family: { familyId: string }; package: string }>(bankPath);
      expect(raw.family.familyId).toBe(`ui-${event}`);
      expect(raw.package).toBe('@volstudio/core');
      const bank = SoundFamilyBank.parse(raw);
      expect(bank.variants.map((variant) => variant.key)).toEqual(
        UI_SOUND_VARIANT_KEYS.map((key) => `${event}-${key}`),
      );
      for (const variant of bank.variants) {
        expect(variant.path).toBe(`public/assets/audio/ui/${variant.key}.ogg`);
        const file = join(coreRoot, variant.path);
        expect(statSync(file).size, variant.key).toBeGreaterThan(1000);
        expect(statSync(file).size, variant.key).toBeLessThan(16 * 1024);
        // OGG yakalama deseni.
        expect(readFileSync(file).subarray(0, 4).toString('latin1')).toBe('OggS');
        expect(variant.durationSeconds).toBeGreaterThan(0.03);
        expect(variant.durationSeconds).toBeLessThan(0.5);
      }
      // Çalışma zamanı URL'leri banka yollarıyla aynı dosyaları gösterir.
      const urls = uiSoundAssets('./')[event] ?? [];
      expect(
        urls.map((url) => url.replace(`./${UI_SOUND_PUBLIC_DIR}`, 'public/assets/audio/ui/')),
      ).toEqual(bank.variants.map((variant) => variant.path));
    });

    it(`${event}: her varyantın manifesti kütüphane hedefi, ui sınıfı ve geçen politikayı kaydeder`, () => {
      for (const key of UI_SOUND_VARIANT_KEYS) {
        const manifestPath = join(coreRoot, 'audio-manifests/ui', `${event}-${key}.json`);
        const manifest = readJson<Manifest>(manifestPath);
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
        expect(manifest.asset.path).toBe(`core/public/assets/audio/ui/${event}-${key}.ogg`);
        const bytes = statSync(
          join(coreRoot, 'public/assets/audio/ui', `${event}-${key}.ogg`),
        ).size;
        expect(manifest.asset.bytes).toBe(bytes);
      }
    });
  }

  it('kodlama SONRASI ölçüler (çözülmüş dosya): tepe, yükseklik, DC, kırpma, sonluluk ve süre', () => {
    for (const event of UI_SOUND_EVENTS) {
      for (const key of UI_SOUND_VARIANT_KEYS) {
        const id = `${event}-${key}`;
        const { analysis, brief } = readJson<Manifest>(
          join(coreRoot, 'audio-manifests/ui', `${id}.json`),
        );
        const encoded = analysis.encoded;
        // Ölçü gönderilen (kodlanmış, çözülmüş) dosyadandır.
        expect(encoded.measuredFrom, id).toBe('decoded-encoded');
        // Tepe: gerçek tepe −1 dBTP altında (ui sınıfı sınırı).
        expect(encoded.level.truePeakDbtp, `${id} true peak`).toBeLessThanOrEqual(-1);
        // Yükseklik: kısa olay için en yüksek momentary, ui aralığı [-28, -14] LUFS.
        expect(encoded.level.maxMomentaryLufs, `${id} yükseklik`).toBeGreaterThanOrEqual(-28);
        expect(encoded.level.maxMomentaryLufs, `${id} yükseklik`).toBeLessThanOrEqual(-14);
        // DC: kanal ofseti −60 dBFS (0.001) altında.
        for (const offset of encoded.dc.channelOffset)
          expect(Math.abs(offset), id).toBeLessThan(0.001);
        // Kırpma ve tık yok.
        expect(encoded.defects.clips.channelSamples, id).toBe(0);
        expect(encoded.defects.clicks.count, id).toBe(0);
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

  it('bas ve gövde ayrı süzülür: her katman alçak kesimli, geçici katman gövdeden daha yüksek kesimli, sub ve bas bandı mid bandının çok altında', () => {
    for (const event of UI_SOUND_EVENTS) {
      for (const key of UI_SOUND_VARIANT_KEYS) {
        const id = `${event}-${key}`;
        const { program, analysis } = readJson<Manifest>(
          join(coreRoot, 'audio-manifests/ui', `${id}.json`),
        );
        const cutoffOf = (
          layer: Manifest['program']['document']['layers'][number],
        ): number | null =>
          layer.resonators?.find((r) => r.params.mode === 'highpass')?.params.frequency ?? null;
        const transient = program.document.layers.filter((layer) => layer.role === 'transient');
        const body = program.document.layers.filter((layer) => layer.role !== 'transient');
        for (const layer of program.document.layers) {
          expect(cutoffOf(layer), `${id}/${layer.name}: yüksek geçiren filtre yok`).not.toBeNull();
          expect(cutoffOf(layer)!, `${id}/${layer.name}`).toBeGreaterThanOrEqual(200);
        }
        // Geçici (tık) ile gövde AYRI filtrelenir: tık gövdeden anlamlı biçimde yüksek kesimlidir.
        if (transient.length > 0 && body.length > 0) {
          const bodyMax = Math.max(...body.map((layer) => cutoffOf(layer)!));
          for (const layer of transient) expect(cutoffOf(layer)!, id).toBeGreaterThan(bodyMax);
        }
        // Küçük hoparlörün çalamadığı bas (sub, 20–120 Hz) enerjisi yok: mid'den ≥ 20 dB aşağıda.
        // Enerji merkezi küçük hoparlörün rahat çaldığı aralıktadır (≥ 420 Hz).
        const { sub, mid } = analysis.encoded.spectral.bandsDb;
        expect(analysis.encoded.spectral.centroidHz, `${id} merkez`).toBeGreaterThanOrEqual(420);
        expect(mid - sub, `${id} sub`).toBeGreaterThanOrEqual(20);
      }
    }
  });
});
