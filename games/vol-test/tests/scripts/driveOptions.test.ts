import { expect, it } from 'vitest';
import { parseDriveOptions } from '../../scripts/driveOptions';

it('geçersiz rampa, süre ve senaryo dosya açılmadan reddedilir', () => {
  for (const value of ['NaN', 'Infinity', '-1', '2147483648'])
    expect(() => parseDriveOptions([`--ramp=${value}`])).toThrow(RangeError);
  for (const value of ['NaN', 'Infinity', '0', '-1', '1e308', '2147483.647'])
    expect(() => parseDriveOptions([`--seconds=${value}`])).toThrow(RangeError);
  expect(() => parseDriveOptions(['--scenario', 'missing'])).toThrow(RangeError);
  expect(() => parseDriveOptions(['--scenario', 'idle', '--seconds', '0.5'])).toThrow(RangeError);
  expect(() => parseDriveOptions(['--clients', '1.5'])).toThrow(RangeError);
  expect(parseDriveOptions(['--ramp', '0', '--seconds', '1.25'])).toMatchObject({
    rampMs: 0,
    durationMs: 1250,
    scenarios: [],
  });
  expect(parseDriveOptions(['--scenario', 'all']).scenarios).toEqual(['idle', 'maneuver', 'fire']);
});
