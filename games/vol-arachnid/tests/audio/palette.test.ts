import { describe, expect, it } from 'vitest';
import {
  clawStep,
  darkAmbience,
  dashLand,
  dashLaunch,
  wallImpact,
} from '../../scripts/audio/palette';
import type { SynthesisResult } from '@volstudio/audio-synth';

function peak(result: SynthesisResult): number {
  let value = 0;
  for (const channel of result.channels) {
    for (const sample of channel) value = Math.max(value, Math.abs(sample));
  }
  return value;
}

function rms(result: SynthesisResult, start: number, end: number): number {
  let sum = 0;
  let count = 0;
  for (const channel of result.channels) {
    for (let index = start; index < end; index++) {
      sum += channel[index] ** 2;
      count++;
    }
  }
  return Math.sqrt(sum / count);
}

describe('VOL.ARACHNID fiziksel ses paleti', () => {
  it('temas seslerini stereo, sonlu ve tepe hiyerarşisiyle üretir', () => {
    const step = clawStep(1201, 1);
    const launch = dashLaunch(2417);
    const land = dashLand(6151);
    const wall = wallImpact(8443);

    for (const result of [step, launch, land, wall]) {
      expect(result.sampleRate).toBe(48_000);
      expect(result.channels).toHaveLength(2);
      expect(result.channels[0]?.length).toBe(result.channels[1]?.length);
      expect(result.channels.every((channel) => channel.every(Number.isFinite))).toBe(true);
    }
    expect(peak(step)).toBeLessThan(peak(launch));
    expect(peak(launch)).toBeLessThan(peak(land));
    expect(peak(land)).toBeLessThan(peak(wall));
  });

  it('aynı tohumla birebir aynı sesi üretir', () => {
    const first = clawStep(3307, 0.92);
    const second = clawStep(3307, 0.92);

    expect(first.channels[0]).toEqual(second.channels[0]);
    expect(first.channels[1]).toEqual(second.channels[1]);
  });

  it('ambiyansı sessiz uçlar yerine sürekli bir stereo loop olarak kurar', () => {
    const ambience = darkAmbience(4271, 6);
    const sampleCount = ambience.channels[0].length;
    const window = Math.round(ambience.sampleRate * 0.5);
    const fullRms = rms(ambience, 0, sampleCount);
    const seamJump = Math.max(
      Math.abs(ambience.channels[0][0] - ambience.channels[0].at(-1)!),
      Math.abs(ambience.channels[1][0] - ambience.channels[1].at(-1)!),
    );

    expect(ambience.channels).toHaveLength(2);
    expect(ambience.duration).toBeCloseTo(6, 6);
    expect(rms(ambience, 0, window)).toBeGreaterThan(fullRms * 0.45);
    expect(rms(ambience, sampleCount - window, sampleCount)).toBeGreaterThan(fullRms * 0.45);
    expect(seamJump).toBeLessThan(0.05);
  });
});
