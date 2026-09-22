import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ProtocolError } from './errors';
import { checkRepoRelative } from './fs';

/**
 * Publish hedefleri. Bir asset yalnız burada tanımlı bir kökün altına
 * yazılabilir; frozen workspace hiçbir zaman hedef değildir.
 *
 * - `reference`: audio-synth'in KENDİ üretim-referans fixture'ı. Hiçbir
 *   oyun onu çalmaz; publish kapısını gerçek kodek QA'sıyla uçtan uca
 *   çalıştırmak için vardır (runtime yok).
 * - `game`: aktif bir oyun paketi, kökünde `audio-target.json`
 *   (`AudioTargetV1`) ile çalışma zamanı ses kabiliyetini beyan ettiyse.
 */
export const AUDIO_TARGET_SCHEMA = 'AudioTargetV1';
const REFERENCE_PACKAGE = '@volstudio/audio-synth';

export interface TargetRuntime {
  readonly formats: readonly 'ogg'[];
  readonly sampleRates: readonly number[];
  readonly channels: readonly (1 | 2)[];
  readonly loop: boolean;
  /** Beyanın repo-göreli yeri. */
  readonly declaredIn: string;
}

export interface PublishTarget {
  readonly packageName: string;
  readonly packagePath: string;
  readonly kind: 'reference' | 'game';
  readonly assetRoot: string;
  readonly manifestRoot: string;
  /** Ses ailesi bank'ları (`SoundFamilyBankV1`); asset ve manifest köklerinden ayrı. */
  readonly bankRoot: string;
  readonly runtime: TargetRuntime | null;
}

interface LifecycleEntry {
  readonly packageName: string;
  readonly path: string;
  readonly status: string;
}

export interface TargetSurvey {
  readonly publishable: readonly PublishTarget[];
  /** Aktif oyun ama çalışma zamanı beyanı yok — publish reddedilir. */
  readonly undeclaredGames: readonly string[];
  readonly frozen: readonly string[];
}

function readLifecycle(repoRoot: string): LifecycleEntry[] {
  const path = join(repoRoot, 'workspace-lifecycle.json');
  if (!existsSync(path)) throw new ProtocolError('not-found', 'workspace-lifecycle.json yok', '.');
  const doc = JSON.parse(readFileSync(path, 'utf8')) as { workspaces?: LifecycleEntry[] };
  if (!Array.isArray(doc.workspaces)) {
    throw new ProtocolError('invalid', 'workspaces dizisi yok', 'workspace-lifecycle.json');
  }
  return doc.workspaces;
}

function readRuntime(repoRoot: string, packagePath: string): TargetRuntime | null {
  const declaredIn = `${packagePath}/audio-target.json`;
  const file = join(repoRoot, declaredIn);
  if (!existsSync(file)) return null;
  const doc = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  const keys = ['schema', 'formats', 'sampleRates', 'channels', 'loop'];
  const unknown = Object.keys(doc).filter((key) => !keys.includes(key));
  const formats = doc.formats;
  const rates = doc.sampleRates;
  const channels = doc.channels;
  if (
    doc.schema !== AUDIO_TARGET_SCHEMA ||
    unknown.length > 0 ||
    !Array.isArray(formats) ||
    formats.length === 0 ||
    !formats.every((f) => f === 'ogg') ||
    !Array.isArray(rates) ||
    rates.length === 0 ||
    !rates.every((r) => Number.isInteger(r) && r >= 8000 && r <= 384000) ||
    !Array.isArray(channels) ||
    channels.length === 0 ||
    !channels.every((c) => c === 1 || c === 2) ||
    typeof doc.loop !== 'boolean'
  ) {
    throw new ProtocolError('invalid', `${AUDIO_TARGET_SCHEMA} beyanı geçersiz`, declaredIn);
  }
  return {
    formats: formats as 'ogg'[],
    sampleRates: [...(rates as number[])].sort((a, b) => a - b),
    channels: [...(channels as (1 | 2)[])].sort(),
    loop: doc.loop,
    declaredIn,
  };
}

export function surveyTargets(repoRoot: string): TargetSurvey {
  const lifecycle = readLifecycle(repoRoot);
  const publishable: PublishTarget[] = [];
  const undeclaredGames: string[] = [];
  const frozen: string[] = [];
  for (const entry of [...lifecycle].sort((a, b) => a.packageName.localeCompare(b.packageName))) {
    const packagePath = checkRepoRelative(
      entry.path,
      `workspace-lifecycle.json:${entry.packageName}`,
    );
    if (entry.status !== 'active') {
      frozen.push(entry.packageName);
      continue;
    }
    if (entry.packageName === REFERENCE_PACKAGE) {
      publishable.push({
        packageName: entry.packageName,
        packagePath,
        kind: 'reference',
        assetRoot: 'reference/production/assets',
        manifestRoot: 'reference/production/manifests',
        bankRoot: 'reference/production/banks',
        runtime: null,
      });
    } else if (packagePath.startsWith('games/')) {
      const runtime = readRuntime(repoRoot, packagePath);
      if (runtime) {
        publishable.push({
          packageName: entry.packageName,
          packagePath,
          kind: 'game',
          assetRoot: 'public/assets/audio',
          manifestRoot: 'audio-manifests',
          bankRoot: 'audio-banks',
          runtime,
        });
      } else {
        undeclaredGames.push(entry.packageName);
      }
    }
  }
  return { publishable, undeclaredGames, frozen };
}

export interface ResolvedDestination {
  readonly target: PublishTarget;
  /** Repo-göreli asset ve manifest yolları. */
  readonly assetPath: string;
  readonly manifestPath: string;
  /** `assetRoot`a göreli yol — sınıf kuralı bunu okur. */
  readonly withinRoot: string;
}

/**
 * Job hedefini publish kökü altında yollara çevirir. Paket bilinmiyorsa,
 * frozen ise ya da beyansızsa, asset kökün dışındaysa ya da `.ogg` değilse
 * `destination` hatası.
 */
export function resolveDestination(
  survey: TargetSurvey,
  packageName: string,
  asset: string,
): ResolvedDestination {
  const label = `target.asset`;
  if (survey.frozen.includes(packageName)) {
    throw new ProtocolError('destination', `${packageName} frozen — publish hedefi olamaz`, label);
  }
  const target = survey.publishable.find((t) => t.packageName === packageName);
  if (!target) {
    const reason = survey.undeclaredGames.includes(packageName)
      ? `çalışma zamanı beyanı (${AUDIO_TARGET_SCHEMA}) yok`
      : 'aktif publish hedefi değil';
    throw new ProtocolError('destination', `${packageName}: ${reason}`, label);
  }
  checkRepoRelative(asset, label);
  if (!asset.startsWith(`${target.assetRoot}/`)) {
    throw new ProtocolError('destination', `asset ${target.assetRoot}/ altında olmalı`, label);
  }
  if (!asset.endsWith('.ogg')) throw new ProtocolError('destination', 'asset .ogg olmalı', label);
  const withinRoot = asset.slice(target.assetRoot.length + 1);
  return {
    target,
    assetPath: `${target.packagePath}/${asset}`,
    manifestPath: `${target.packagePath}/${target.manifestRoot}/${withinRoot.replace(
      /\.ogg$/,
      '.json',
    )}`,
    withinRoot,
  };
}
