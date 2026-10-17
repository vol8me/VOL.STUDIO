import { AudioParamError } from '../guard/errors';
import { checkNumber, checkObject } from '../guard/read';
import type { AudioAnalysisReportV1 } from './report';
import { powerSpectrum } from './spectrum';

export interface AudioCharacterPolicyV1 {
  readonly schema: 'AudioCharacterPolicyV1';
  readonly centroidMaxHz?: number;
  readonly airToMidMaxDb?: number;
  readonly maxMomentaryRiseLu?: number;
}

export function validateCharacterPolicy(value: unknown): AudioCharacterPolicyV1 {
  const o = checkObject(value, 'character', [
    'schema',
    'centroidMaxHz',
    'airToMidMaxDb',
    'maxMomentaryRiseLu',
  ]);
  if (o.schema !== 'AudioCharacterPolicyV1') {
    throw new AudioParamError('character.schema', 'type', 'AudioCharacterPolicyV1', o.schema);
  }
  if (Object.keys(o).length < 2) {
    throw new AudioParamError('character', 'range', 'en az bir karakter sınırı', value);
  }
  return {
    schema: 'AudioCharacterPolicyV1',
    ...(o.centroidMaxHz === undefined
      ? {}
      : {
          centroidMaxHz: checkNumber(o.centroidMaxHz, 'character.centroidMaxHz', {
            min: 20,
            max: 20000,
          }),
        }),
    ...(o.airToMidMaxDb === undefined
      ? {}
      : {
          airToMidMaxDb: checkNumber(o.airToMidMaxDb, 'character.airToMidMaxDb', {
            min: -120,
            max: 0,
          }),
        }),
    ...(o.maxMomentaryRiseLu === undefined
      ? {}
      : {
          maxMomentaryRiseLu: checkNumber(o.maxMomentaryRiseLu, 'character.maxMomentaryRiseLu', {
            min: 0,
            max: 60,
          }),
        }),
  };
}

function wholeSpectrum(channels: readonly Float32Array[], sampleRate: number) {
  const size = 2048;
  const hop = size / 2;
  const window = Float64Array.from(
    { length: size },
    (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size),
  );
  const power = new Float64Array(size / 2);
  for (const channel of channels) {
    for (let from = 0; from < channel.length; from += hop) {
      const frame = powerSpectrum(channel, from, size, window);
      for (let k = 1; k < frame.length; k++) power[k] += frame[k];
    }
  }
  let total = 0;
  let weighted = 0;
  let mid = 0;
  let air = 0;
  for (let k = 1; k < power.length; k++) {
    const hz = (k * sampleRate) / size;
    total += power[k];
    weighted += power[k] * hz;
    if (hz >= 500 && hz < 2500) mid += power[k];
    if (hz >= 8000 && hz < 20000) air += power[k];
  }
  return {
    centroidHz: total > 0 ? weighted / total : null,
    airToMidDb: mid > 0 && air > 0 ? 10 * Math.log10(air / mid) : null,
    hasMid: mid > 0,
    hasAir: air > 0,
  };
}

export function evaluateCharacterPolicy(
  channels: readonly Float32Array[],
  sampleRate: number,
  report: AudioAnalysisReportV1,
  document: AudioCharacterPolicyV1,
) {
  const policy = validateCharacterPolicy(document);
  const spectral = wholeSpectrum(channels, sampleRate);
  const { integratedLufs, maxMomentaryLufs } = report.level;
  const maxMomentaryRiseLu =
    integratedLufs === null || maxMomentaryLufs === null ? null : maxMomentaryLufs - integratedLufs;
  const violations: string[] = [];
  if (
    policy.centroidMaxHz !== undefined &&
    (spectral.centroidHz === null || spectral.centroidHz > policy.centroidMaxHz)
  ) {
    violations.push(
      `centroid ${spectral.centroidHz ?? 'tanımsız'} Hz > ${policy.centroidMaxHz} Hz`,
    );
  }
  if (
    policy.airToMidMaxDb !== undefined &&
    (!spectral.hasMid ||
      (spectral.hasAir &&
        (spectral.airToMidDb === null || spectral.airToMidDb > policy.airToMidMaxDb)))
  ) {
    violations.push(`air−mid ${spectral.airToMidDb ?? 'tanımsız'} dB > ${policy.airToMidMaxDb} dB`);
  }
  if (
    policy.maxMomentaryRiseLu !== undefined &&
    (maxMomentaryRiseLu === null || maxMomentaryRiseLu > policy.maxMomentaryRiseLu)
  ) {
    violations.push(
      `momentary−integrated ${maxMomentaryRiseLu ?? 'tanımsız'} LU > ${
        policy.maxMomentaryRiseLu
      } LU`,
    );
  }
  return {
    method: 'all-channel-welch-v1',
    centroidHz: spectral.centroidHz,
    airToMidDb: spectral.airToMidDb,
    maxMomentaryRiseLu,
    pass: violations.length === 0,
    violations,
  };
}
