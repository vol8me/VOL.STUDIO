export function parseDeviceBenchmarkArgs(argv, androidSerial) {
  let serial = androidSerial?.trim() || undefined;
  let seconds;
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index];
    if (value === '--serial') {
      const next = argv[++index];
      if (!next || next.startsWith('--')) throw new RangeError('--serial bir değer ister.');
      serial = next;
      continue;
    }
    if (value.startsWith('--serial=')) {
      serial = value.slice('--serial='.length);
      if (!serial) throw new RangeError('--serial boş olamaz.');
      continue;
    }
    if (value.startsWith('--')) throw new RangeError(`Bilinmeyen seçenek: ${value}`);
    if (seconds !== undefined) throw new RangeError('Yalnız bir süre değeri verilebilir.');
    seconds = Number(value);
  }
  const duration = seconds ?? 12;
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new RangeError(`Ölçüm süresi pozitif olmalı: ${String(seconds)}`);
  }
  return { serial, seconds: duration };
}

export function selectDevice(devices, requestedSerial) {
  const online = devices.filter((device) => device.state === 'device');
  if (requestedSerial) {
    const selected = online.find((device) => device.serial === requestedSerial);
    if (!selected) throw new RangeError(`İstenen Android cihazı bağlı değil: ${requestedSerial}`);
    return selected.serial;
  }
  if (online.length === 0) throw new RangeError('Bağlı cihaz yok. USB hata ayıklama açık mı?');
  if (online.length > 1) {
    throw new RangeError('Birden fazla cihaz bağlı; --serial veya ANDROID_SERIAL zorunlu.');
  }
  return online[0].serial;
}
