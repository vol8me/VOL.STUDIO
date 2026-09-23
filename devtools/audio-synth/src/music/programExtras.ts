import { AudioParamError } from '../guard/errors';
import { checkArray, checkChoice, checkNumber, checkObject, checkSampleRate } from '../guard/read';
import { resolveMusicMix, type MusicMixV1 } from './mix';
import {
  MARKER_KINDS,
  type AdaptiveStemV1,
  type AutomationV1,
  type LaneV1,
  type MarkerV1,
  type MusicDeliveryV1,
} from './programTypes';
import { MUSIC_KEY, checkPattern, checkText, type MusicPlayback } from './terms';

/**
 * `MusicProgramV1`in bölüm dışı alanları: adaptive state'ler, teslim,
 * otomasyon, işaretler ve mix grafiği.
 */
export function checkMix(
  value: unknown,
  lanes: readonly LaneV1[],
  playback: MusicPlayback,
  rate: unknown,
) {
  const sampleRate = rate === undefined ? 44100 : checkSampleRate(rate, 'sampleRate');
  resolveMusicMix(value, 'mix', lanes, playback, sampleRate);
  return value as MusicMixV1;
}

export function checkAdaptive(value: unknown, path: string, stems: readonly string[]) {
  const o = checkObject(value, path, ['states', 'stems']);
  const states = checkArray(o.states, `${path}.states`).map((raw, i) => {
    const s = checkObject(raw, `${path}.states[${i}]`, ['id', 'intensity']);
    return {
      id: checkPattern(s.id, `${path}.states[${i}].id`, MUSIC_KEY),
      intensity: checkNumber(s.intensity, `${path}.states[${i}].intensity`, { min: 0, max: 1 }),
    };
  });
  if (states.length < 2)
    throw new AudioParamError(`${path}.states`, 'range', 'en az iki state', states.length);
  const mapped = checkArray(o.stems, `${path}.stems`).map((raw, i): AdaptiveStemV1 => {
    const s = checkObject(raw, `${path}.stems[${i}]`, ['stem', 'gainMap']);
    const stem = checkPattern(s.stem, `${path}.stems[${i}].stem`, MUSIC_KEY);
    if (!stems.includes(stem)) {
      throw new AudioParamError(
        `${path}.stems[${i}].stem`,
        'unknown-id',
        'tanımlı bir stem olmalı',
        stem,
      );
    }
    const map = checkObject(s.gainMap, `${path}.stems[${i}].gainMap`, ['intensity']);
    const points = checkArray(map.intensity, `${path}.stems[${i}].gainMap.intensity`);
    if (points.length < 2) {
      throw new AudioParamError(
        `${path}.stems[${i}].gainMap.intensity`,
        'range',
        'en az iki eşik',
        points.length,
      );
    }
    let previous = -1;
    return {
      stem,
      gainMap: {
        intensity: points.map((raw2, j) => {
          const p = checkObject(raw2, `${path}.stems[${i}].gainMap.intensity[${j}]`, [
            'threshold',
            'gain',
          ]);
          const threshold = checkNumber(
            p.threshold,
            `${path}.stems[${i}].gainMap.intensity[${j}].threshold`,
            {
              min: 0,
              max: 1,
            },
          );
          if (threshold <= previous) {
            throw new AudioParamError(
              `${path}.stems[${i}].gainMap.intensity[${j}].threshold`,
              'combination',
              'eşikler artan olmalı',
              threshold,
            );
          }
          previous = threshold;
          return {
            threshold,
            gain: checkNumber(p.gain, `${path}.stems[${i}].gainMap.intensity[${j}].gain`, {
              min: 0,
              max: 2,
            }),
          };
        }),
      },
    };
  });
  const missing = stems.filter((stem) => !mapped.some((m) => m.stem === stem));
  if (missing.length > 0) {
    throw new AudioParamError(
      `${path}.stems`,
      'required',
      'her stem bir gain haritası ister',
      missing.join(', '),
    );
  }
  return { states, stems: mapped };
}

export function checkDelivery(value: unknown, path: string): MusicDeliveryV1 {
  const o = checkObject(value, path, ['package', 'assetDir', 'runtimeKey']);
  const pkg = checkText(o.package, `${path}.package`, 80);
  if (!/^@[a-z0-9-]+\/[a-z0-9.-]+$/.test(pkg)) {
    throw new AudioParamError(`${path}.package`, 'type', 'paket adı olmalı', pkg);
  }
  const assetDir = checkText(o.assetDir, `${path}.assetDir`, 200);
  if (!assetDir.split('/').includes('music')) {
    throw new AudioParamError(
      `${path}.assetDir`,
      'combination',
      "müzik asset'i yol sınıfı için 'music' klasörü altında olmalı",
      assetDir,
    );
  }
  return {
    package: pkg,
    assetDir,
    ...(o.runtimeKey === undefined
      ? {}
      : { runtimeKey: checkText(o.runtimeKey, `${path}.runtimeKey`, 96) }),
  };
}

export function checkAutomation(
  value: unknown,
  path: string,
  lanes: readonly string[],
  bars: number,
): AutomationV1[] {
  return checkArray(value, path).map((raw, i): AutomationV1 => {
    const a = checkObject(raw, `${path}[${i}]`, ['lane', 'points']);
    const lane = checkPattern(a.lane, `${path}[${i}].lane`, MUSIC_KEY);
    if (!lanes.includes(lane)) {
      throw new AudioParamError(
        `${path}[${i}].lane`,
        'unknown-id',
        'tanımlı bir şerit olmalı',
        lane,
      );
    }
    const points = checkArray(a.points, `${path}[${i}].points`);
    if (points.length < 2) {
      throw new AudioParamError(`${path}[${i}].points`, 'range', 'en az iki nokta', points.length);
    }
    let previous = -1;
    return {
      lane,
      points: points.map((raw2, j) => {
        const pair = checkArray(raw2, `${path}[${i}].points[${j}]`);
        if (pair.length !== 2) {
          throw new AudioParamError(
            `${path}[${i}].points[${j}]`,
            'type',
            '[ölçü, dB]',
            pair.length,
          );
        }
        const bar = checkNumber(pair[0], `${path}[${i}].points[${j}][0]`, { min: 0, max: bars });
        if (bar <= previous) {
          throw new AudioParamError(
            `${path}[${i}].points[${j}][0]`,
            'combination',
            'ölçüler artan olmalı',
            bar,
          );
        }
        previous = bar;
        return [
          bar,
          checkNumber(pair[1], `${path}[${i}].points[${j}][1]`, { min: -60, max: 12 }),
        ] as const;
      }),
    };
  });
}

export function checkMarkers(value: unknown, path: string, bars: number): MarkerV1[] {
  return checkArray(value, path).map((raw, i): MarkerV1 => {
    const m = checkObject(raw, `${path}[${i}]`, ['bar', 'kind']);
    return {
      bar: checkNumber(m.bar, `${path}[${i}].bar`, { min: 0, max: bars, integer: true }),
      kind: checkChoice(m.kind, `${path}[${i}].kind`, MARKER_KINDS),
    };
  });
}
