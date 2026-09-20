import assert from 'node:assert/strict';
import test from 'node:test';
import { parseDeviceBenchmarkArgs, selectDevice } from '../../device-benchmark-contract.mjs';

test('device benchmark CLI seriali ANDROID_SERIAL üzerine yazar', () => {
  assert.deepEqual(parseDeviceBenchmarkArgs(['--serial', 'second', '60'], 'first'), {
    serial: 'second',
    seconds: 60,
  });
});

test('iki cihazda açık serial olmadan ilk cihazı sessizce seçmez', () => {
  const devices = [
    { serial: 'tablet', state: 'device' },
    { serial: 'phone', state: 'device' },
  ];
  assert.throws(() => selectDevice(devices), /--serial/);
  assert.equal(selectDevice(devices, 'phone'), 'phone');
});

test('offline veya bilinmeyen açık seriali reddeder', () => {
  assert.throws(
    () => selectDevice([{ serial: 'phone', state: 'offline' }], 'phone'),
    /bağlı değil/,
  );
});
