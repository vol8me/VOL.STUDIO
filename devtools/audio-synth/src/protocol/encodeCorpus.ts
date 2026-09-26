import type { AssetClass } from '../analysis/assetQa';
import { synth } from '../engine/synthesize';
import { explosion, laser } from '../presets/combat';
import { blip, pause, restart, resume } from '../presets/ui';
import { renderProgram } from '../program/render';
import { PROGRAM_REGISTRY } from '../program/catalog';
import type { SynthParams } from '../types';
import { hashPcm, type Sha256 } from './canonical';
import { ProtocolError } from './errors';
import { readJsonFile, resolveInside } from './fs';
import { kindOfProgramSchema, renderForKind } from './kinds';
import { validateManifest } from './manifest';
import { repoSampleResolver } from './samples';

/**
 * Kodlama profili korpusu: sınıf başına temsilî kaynak PCM'ler. Yayımlanmış
 * referans asset'ler manifest'lerinden YENİDEN RENDER edilir (kodlanmış dosya
 * yeniden kodlanmaz; PCM özeti manifest'le eşleşmek zorundadır). Referansı
 * olmayan sınıflar (UI, ambiyans) deterministik preset ve programlardan
 * gelir. Liste sabittir; değişirse taban çizgisi yeniden ölçülür.
 */
export interface CorpusItem {
  readonly id: string;
  readonly assetClass: AssetClass;
  readonly origin: string;
  readonly pcmHash: Sha256;
  readonly channels: Float32Array[];
  readonly sampleRate: number;
}

const MANIFESTS = 'devtools/audio-synth/reference/production/manifests';

const FROM_MANIFEST: readonly [string, AssetClass][] = [
  ['sfx/platform-reference-knock', 'sfx'],
  ['sfx/reference-sampled', 'sfx'],
  ['sfx/reference-hybrid', 'sfx'],
  ['sfx/families/reference-shell-hits/hard-heavy', 'sfx'],
  ['sfx/families/reference-shell-hits/soft-light', 'sfx'],
  ['music/reference-loop/mix', 'music'],
  ['music/reference-adaptive/mix', 'music'],
  ['music/reference-cue/mix', 'music'],
  ['music/reference-arcade/mix', 'music'],
  ['music/reference-adaptive/pulse', 'music-stem'],
  ['music/reference-adaptive/lead', 'music-stem'],
  ['music/reference-arcade/intro', 'music-stem'],
  ['music/reference-arcade/power-up', 'music-stem'],
];

const FROM_PRESET: readonly [string, AssetClass, SynthParams][] = [
  ['ui-blip', 'ui', blip()],
  ['ui-pause', 'ui', pause()],
  ['ui-resume', 'ui', resume()],
  ['ui-restart', 'ui', restart()],
  ['sfx-explosion', 'sfx', explosion()],
  ['sfx-laser', 'sfx', laser()],
];

/** İki bağımsız alt akışlı (farklı katman adı) katman: ilintisiz stereo zemin. */
function bed(primitive: string, params: Record<string, number>, seconds: number, seed: number) {
  const layer = (name: string, pan: number) => ({
    name,
    pan,
    source: { primitive, version: PROGRAM_REGISTRY.get(primitive).version, params },
  });
  return {
    schema: 'AcousticProgramV1',
    sampleRate: 48000,
    channels: 2,
    durationSeconds: seconds,
    seed,
    layers: [layer('left', -1), layer('right', 1)],
    master: { normalize: 'peak', peakDbfs: -3, fadeInSeconds: 0.5, fadeOutSeconds: 0.5 },
  };
}

const FROM_PROGRAM: readonly [string, AssetClass, unknown][] = [
  ['ambience-rain', 'ambience', bed('source.rain', { intensity: 900, hiss: 0.4 }, 12, 11)],
  ['ambience-wind', 'ambience', bed('source.wind', { speed: 12, gustiness: 0.6 }, 12, 12)],
  ['ambience-fire', 'ambience', bed('source.fire', { intensity: 0.6, crackle: 0.6 }, 8, 13)],
];

function scaledToPeak(channels: Float32Array[], peakDbfs: number): Float32Array[] {
  let peak = 0;
  for (const c of channels) for (const x of c) peak = Math.max(peak, Math.abs(x));
  const gain = peak > 0 ? 10 ** (peakDbfs / 20) / peak : 1;
  return channels.map((c) => c.map((x) => x * gain));
}

/** Korpusu üretir; referans PCM'i manifest'teki özetle eşleşmezse `identity` hatası. */
export function buildEncodeCorpus(repoRoot: string): CorpusItem[] {
  const samples = repoSampleResolver(repoRoot);
  const items: CorpusItem[] = [];
  for (const [path, assetClass] of FROM_MANIFEST) {
    const rel = `${MANIFESTS}/${path}.json`;
    const manifest = validateManifest(readJsonFile(resolveInside(repoRoot, rel, 'manifest'), rel));
    const kind = kindOfProgramSchema(manifest.program.schema, rel);
    const rendered = renderForKind(kind, manifest.program.document, {
      seed: manifest.render.seed,
      samples,
      quality: 'final',
    });
    const pcmHash = hashPcm(rendered.channels, rendered.sampleRate);
    if (pcmHash !== manifest.render.pcm.hash) {
      throw new ProtocolError('identity', 'korpus PCM’i manifest özetine uymuyor', rel);
    }
    const { channels, sampleRate } = rendered;
    items.push({ id: path, assetClass, origin: rel, pcmHash, channels, sampleRate });
  }
  for (const [id, assetClass, params] of FROM_PRESET) {
    const { sampleRate, channels: raw } = synth(params.duration, params);
    const channels = scaledToPeak(raw, -3);
    const pcmHash = hashPcm(channels, sampleRate);
    items.push({ id, assetClass, origin: `preset:${id}`, pcmHash, channels, sampleRate });
  }
  for (const [id, assetClass, program] of FROM_PROGRAM) {
    const { channels, sampleRate } = renderProgram(program, { quality: 'final' });
    const pcmHash = hashPcm(channels, sampleRate);
    items.push({ id, assetClass, origin: `program:${id}`, pcmHash, channels, sampleRate });
  }
  return items;
}
