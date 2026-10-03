import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Testlerin sahte komut çalıştırmak için kullandığı ortak koşucu.
 *
 * Windows'ta `execFileSync` bir `.CMD`/`.bat` dosyasını `shell: true` olmadan
 * çalıştıramaz (`EINVAL`); POSIX'te aynı dosya doğrudan çalışır. `shell: true`
 * her iki platformda da çalıştığı için tek seçenek odur.
 */
export function runCommand(command, args, options = {}) {
  // `shell: true` `cmd.exe`'nin kendi PATH'ini kullanır; çağıranın PATH'ini
  // (ör. sahte `cargo` eklenen testler) geçersiz kılar. Çağıran shell'i
  // bilerek kapatmak istiyorsa `shell: false` geçebilir.
  return execFileSync(command, args, { ...options, shell: options.shell ?? true });
}

/** `runCommand`ın `spawnSync` karşılığı; sonuç `status`'u döndürür. */
export function runCommandSync(command, args, options = {}) {
  return spawnSync(command, args, { ...options, shell: options.shell ?? true });
}

export const isWindows = process.platform === 'win32';

/**
 * `name` komutunu PATH'te arar ve çalıştırılabilir tam yolunu döndürür.
 *
 * `execFileSync` Windows'ta uzantısız POSIX betiği bulamaz; yalnız gerçek
 * `.exe`/`.cmd` yolları çalışır. Sahte komut testleri `writeCommand` ile
 * `.CMD` shim'i yazdığı için arama sırası `PATHEXT` ile eşleşmelidir.
 */
export function resolveCommand(name, pathValue = process.env.PATH ?? '') {
  const extensions = isWindows
    ? (process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD')
        .split(';')
        .filter(Boolean)
    : [''];
  for (const directory of pathValue.split(isWindows ? ';' : ':')) {
    if (!directory) continue;
    for (const extension of extensions) {
      const candidate = join(directory, name + extension);
      if (existsSync(candidate)) return candidate;
    }
  }
  return name;
}

/**
 * `body` içindeki POSIX kabuk betiğini çalıştırılabilir bir komuta yazar.
 *
 * POSIX'te doğrudan çalıştırılabilir dosya yazılır. Windows'ta `spawnSync` shell
 * betiğini çalıştıramaz; `.CMD` shim'i yazılır ve `runCommand` (`shell: true`)
 * onu çağırır. Dönen yol her iki platformda doğrudan çalıştırılabilir.
 */
export function writeCommand(dir, name, body) {
  const script = join(dir, name);
  writeFileSync(script, body, 'utf8');
  chmodSync(script, 0o755);
  if (!isWindows) return script;
  const shim = join(dir, `${name}.CMD`);
  writeFileSync(shim, `@echo off\r\nsh "%~dp0${name}" %*\r\n`, 'utf8');
  chmodSync(shim, 0o755);
  return shim;
}

/**
 * Sahte komutu doğrudan `node` ile çalıştıran `.CMD` shim'iyle yazar.
 *
 * `writeCommand`ın `sh` kullanan shim'i, `cmd.exe`'nin `sh`'i PATH'te bulamaması
 * halinde sessizce başarısız olur. Gövde bir Node betiği olduğu için (`node`
 * shebang'i Node tarafından atılır) doğrudan `node` ile çağrılabilir ve
 * kabuk bağımlılığı ortadan kalkar.
 */
export function writeNodeCommand(dir, name, body) {
  const script = join(dir, name);
  writeFileSync(script, body, 'utf8');
  chmodSync(script, 0o755);
  if (!isWindows) return script;
  const shim = join(dir, `${name}.CMD`);
  writeFileSync(shim, `@echo off\r\nnode "%~dp0${name}" %*\r\n`, 'utf8');
  chmodSync(shim, 0o755);
  return shim;
}
