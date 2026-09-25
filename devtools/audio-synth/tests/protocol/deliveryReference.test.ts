import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { AudioAssetManifestV1 } from '../../src/protocol/manifest';
import { treatmentProfile } from '../../src/program/treatmentProfiles';

/**
 * Referans teslim varyantları (`reference-impact` + yedi profil): hepsi aynı
 * kaynak kimliğini taşır; kodek SONRASI ölçüler profillerin iddia ettiği
 * yönde değişir. Ölçüler yayın anında manifest'e yazılır; burada yalnız
 * okunur (yeniden üretim `audio:production-check`in işidir).
 */
const ROOT = new URL('../../reference/production/manifests/sfx/', import.meta.url);
const read = (rel: string) =>
  JSON.parse(readFileSync(new URL(rel, ROOT), 'utf8')) as AudioAssetManifestV1;
const source = read('reference-impact.json');
const PROFILES = [
  'distance-near',
  'distance-mid',
  'distance-far',
  'occluded',
  'behind-wall',
  'underwater',
  'radio',
] as const;
const variants = Object.fromEntries(
  PROFILES.map((id) => [id, read(`delivery/reference-impact-${id}.json`)]),
) as Record<(typeof PROFILES)[number], AudioAssetManifestV1>;
const cues = (id: (typeof PROFILES)[number]) => variants[id].derivation!.cues.derived;

describe('referans teslim varyantları', () => {
  it('hepsi aynı kaynağa ve kendi profiline bağlı; konumsal mono', () => {
    for (const id of PROFILES) {
      const d = variants[id].derivation!;
      expect(d.source).toEqual({
        manifest: 'devtools/audio-synth/reference/production/manifests/sfx/reference-impact.json',
        assetId: 'reference-impact',
        programHash: source.program.hash,
        pcmHash: source.render.pcm.hash,
      });
      expect(d.profile.id).toBe(id);
      expect(variants[id].layout).toMatchObject({ placement: 'positional', channels: 1 });
    }
  });

  it('yakın → orta → uzak: centroid, atak ve doğrudanlık kesin azalır; seviye profil kadar', () => {
    const order = ['distance-near', 'distance-mid', 'distance-far'] as const;
    for (const key of ['centroidHz', 'attackRatioDb', 'directnessDb'] as const) {
      const values = order.map((id) => cues(id)[key] ?? Number.NaN);
      expect(values[0], key).toBeGreaterThan(values[1]);
      expect(values[1], key).toBeGreaterThan(values[2]);
    }
    const reference = variants['distance-near'].derivation!.cues.source.maxMomentaryLufs ?? 0;
    for (const id of order) {
      const want = treatmentProfile(id)!.levelLu;
      expect(Math.abs((cues(id).maxMomentaryLufs ?? 0) - reference - want), id).toBeLessThan(0.5);
    }
  });

  it('engel ve ortam tizi keser; telsiz bantla sınırlı', () => {
    const sourceCentroid = variants.occluded.derivation!.cues.source.centroidHz ?? 0;
    expect(cues('occluded').centroidHz ?? 0).toBeLessThan(sourceCentroid);
    expect(cues('behind-wall').centroidHz ?? 0).toBeLessThan(cues('occluded').centroidHz ?? 0);
    expect(cues('underwater').centroidHz ?? 0).toBeLessThan(cues('occluded').centroidHz ?? 0);
    const bands = variants.radio.analysis.encoded.spectral.bandsDb;
    const mid = bands.mid ?? Number.NaN;
    expect(bands.sub).toBeLessThan(mid - 20);
    expect(bands.air).toBeLessThan(mid - 20);
  });
});
