import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import {
  bashShell,
  bashShellProblem,
  bashShellWarning,
  pathBash,
  resolveBashShell,
  wslBashLauncher,
} from '../gitBash.mjs';

const ROOT = resolve(import.meta.dirname, '../../..');
const GIT_ROOT = 'C:\\Program Files\\Git';

/** Sahte dosya sistemi: yalnız verilen yollar `true` döner. */
function tree(paths) {
  const set = new Set(paths.map((entry) => entry.toLowerCase()));
  return (candidate) => set.has(candidate.toLowerCase());
}

/** Windows yolları büyük/küçük harf duyarsızdır; `PATHEXT` `.EXE` üretebilir. */
function samePath(actual, expected, platform = 'win32') {
  return platform === 'win32'
    ? String(actual).toLowerCase() === expected.toLowerCase()
    : actual === expected;
}

function windowsEnv(overrides = {}) {
  return {
    PATH: '',
    PATHEXT: '.COM;.EXE;.BAT;.CMD',
    ProgramFiles: 'C:\\Program Files',
    'ProgramFiles(x86)': 'C:\\Program Files (x86)',
    LocalAppData: 'C:\\Users\\dev\\AppData\\Local',
    ...overrides,
  };
}

test('Windows’ta kabuk PATH’ten değil git.exe’nin bulunduğu kökten türetilir', () => {
  const resolved = resolveBashShell({
    platform: 'win32',
    env: windowsEnv({ PATH: `${GIT_ROOT}\\cmd` }),
    exists: tree([
      `${GIT_ROOT}\\cmd\\git.exe`,
      `${GIT_ROOT}\\bin\\bash.exe`,
      'C:\\Windows\\System32\\bash.exe',
    ]),
  });
  assert.equal(resolved.source, 'git');
  assert.equal(resolved.path, `${GIT_ROOT}\\bin\\bash.exe`);
});

test('git PATH’te değilse yerleşik Git kökleri aranır', () => {
  const resolved = resolveBashShell({
    platform: 'win32',
    env: windowsEnv({ PATH: 'C:\\Windows\\System32' }),
    exists: tree([`${GIT_ROOT}\\usr\\bin\\bash.exe`]),
  });
  assert.equal(resolved.source, 'well-known');
  assert.equal(resolved.path, `${GIT_ROOT}\\usr\\bin\\bash.exe`);
});

test('PATH’teki tek bash WSL launcher’ıysa kapıyı durduran blokaj bildirilir', () => {
  const launcher = 'C:\\Users\\dev\\AppData\\Local\\Microsoft\\WindowsApps\\bash.exe';
  const options = {
    platform: 'win32',
    env: windowsEnv({ PATH: 'C:\\Users\\dev\\AppData\\Local\\Microsoft\\WindowsApps' }),
    exists: tree([launcher]),
  };
  assert.equal(bashShell(options).ok, false);
  assert.ok(samePath(wslBashLauncher(options), launcher));
  assert.match(bashShellProblem(options), /Git for Windows bash bulunamadı/);
  assert.match(bashShellWarning(options), /WSL launcher/);
});

test('WSL gölgesi Git Bash’ı gölgelemez: kapı çalışır, gölge uyarıdır', () => {
  const launcher = 'C:\\Users\\dev\\AppData\\Local\\Microsoft\\WindowsApps\\bash.exe';
  const options = {
    platform: 'win32',
    env: windowsEnv({
      PATH: ['C:\\Users\\dev\\AppData\\Local\\Microsoft\\WindowsApps', `${GIT_ROOT}\\cmd`].join(
        ';',
      ),
    }),
    exists: tree([launcher, `${GIT_ROOT}\\cmd\\git.exe`, `${GIT_ROOT}\\bin\\bash.exe`]),
  };
  assert.ok(samePath(wslBashLauncher(options), launcher));
  assert.ok(samePath(bashShell(options).path, `${GIT_ROOT}\\bin\\bash.exe`));
  assert.equal(bashShellProblem(options), null, 'gölge kapıyı düşürmemeli');
  assert.match(bashShellWarning(options), /kapılar bu yüzden çalışır/);
});

test('PATH’teki bash Git Bash’ın kendisiyse sorun bildirilmez', () => {
  const bash = `${GIT_ROOT}\\bin\\bash.exe`;
  const options = {
    platform: 'win32',
    env: windowsEnv({ PATH: `${GIT_ROOT}\\bin` }),
    exists: tree([bash, `${GIT_ROOT}\\cmd\\git.exe`]),
  };
  assert.equal(wslBashLauncher(options), null);
  assert.equal(bashShellProblem(options), null);
});

test('Git Bash olmayan Windows’ta MSYS2 gibi gerçek bir PATH bash’ı kabul edilir', () => {
  const bash = 'C:\\msys64\\usr\\bin\\bash.exe';
  const options = {
    platform: 'win32',
    env: windowsEnv({ PATH: 'C:\\msys64\\usr\\bin' }),
    exists: tree([bash]),
  };
  assert.equal(resolveBashShell(options).source, 'path');
  assert.ok(samePath(resolveBashShell(options).path, bash));
  assert.equal(bashShellProblem(options), null);
});

test('Windows’ta bash yoksa tek satırlık teşhis döner', () => {
  const options = { platform: 'win32', env: windowsEnv(), exists: tree([]) };
  assert.match(bashShellProblem(options), /Git for Windows bash bulunamadı/);
});

test('POSIX’te PATH’teki bash kullanılır, PATH boşsa /bin/bash denenir', () => {
  const onPath = resolveBashShell({
    platform: 'linux',
    env: { PATH: '/usr/local/bin' },
    exists: tree(['/usr/local/bin/bash']),
  });
  assert.deepEqual(onPath, { path: '/usr/local/bin/bash', source: 'path' });

  const well = resolveBashShell({
    platform: 'linux',
    env: { PATH: '' },
    exists: tree(['/bin/bash']),
  });
  assert.deepEqual(well, { path: '/bin/bash', source: 'well-known' });
});

test('POSIX’te WSL gölgesi aranmaz', () => {
  const options = {
    platform: 'linux',
    env: { PATH: '/usr/bin' },
    exists: tree([
      '/usr/bin/bash',
      '/mnt/c/Users/dev/AppData/Local/Microsoft/WindowsApps/bash.exe',
    ]),
  };
  assert.equal(wslBashLauncher(options), null);
  assert.equal(bashShellProblem(options), null);
  assert.equal(bashShellWarning(options), null);
});

test('git.exe cmd/bin altında değilse yerleşik Git köküne düşülür', () => {
  const resolved = resolveBashShell({
    platform: 'win32',
    env: windowsEnv({ PATH: `${GIT_ROOT}\\mingw64\\bin` }),
    exists: tree([`${GIT_ROOT}\\mingw64\\bin\\git.exe`, `${GIT_ROOT}\\bin\\bash.exe`]),
  });
  assert.equal(resolved.source, 'well-known');
  assert.equal(resolved.path, `${GIT_ROOT}\\bin\\bash.exe`);
});

test('pathBash yalnız teşhis içindir ve git kökünden etkilenmez', () => {
  const launcher = 'C:\\Users\\dev\\AppData\\Local\\Microsoft\\WindowsApps\\bash.exe';
  const options = {
    platform: 'win32',
    env: windowsEnv({ PATH: 'C:\\Users\\dev\\AppData\\Local\\Microsoft\\WindowsApps' }),
    exists: tree([launcher]),
  };
  assert.ok(samePath(pathBash(options), launcher));
});

test('Windows’ta gölge taramayla değil where.exe ile bulunur', () => {
  /*
   * WSL `bash.exe`si bir App Execution Alias’tır: `fs.existsSync` onu görmez,
   * `where.exe` görür. Bu yüzden gölge taramayla aranamaz; Win32’nin kendi
   * çözümleyicisi sorulur.
   */
  const launcher = 'C:\\Users\\dev\\AppData\\Local\\Microsoft\\WindowsApps\\bash.exe';
  const options = {
    platform: 'win32',
    env: windowsEnv({ SystemRoot: 'C:\\Windows', PATH: 'C:\\msys64\\usr\\bin' }),
    exists: tree(['C:\\Windows\\System32\\where.exe', 'C:\\msys64\\usr\\bin\\bash.exe']),
    run: () => ({ status: 0, stdout: `${launcher}\r\nC:\\msys64\\usr\\bin\\bash.exe\r\n` }),
  };
  assert.ok(samePath(pathBash(options), launcher));
  assert.ok(samePath(wslBashLauncher(options), launcher));
});

test('where.exe yoksa ya da boş dönerse tarama yedeğe düşer', () => {
  const bash = 'C:\\msys64\\usr\\bin\\bash.exe';
  const missing = {
    platform: 'win32',
    env: windowsEnv({ SystemRoot: 'C:\\Windows', PATH: 'C:\\msys64\\usr\\bin' }),
    exists: tree(['C:\\msys64\\usr\\bin\\bash.exe']),
    run: () => ({ status: 1, stdout: '' }),
  };
  assert.ok(samePath(pathBash(missing), bash));
  assert.equal(wslBashLauncher(missing), null);

  const absent = {
    platform: 'win32',
    env: windowsEnv({ PATH: 'C:\\msys64\\usr\\bin' }),
    exists: tree([bash]),
    run: () => ({ status: 0, stdout: '' }),
  };
  assert.ok(samePath(pathBash(absent), bash));
});

test('sarmalayıcı gerçek kabuğu çalıştırır ve WindowsApps gölgesine düşmez', () => {
  /*
   * Saf çözümlemeyi doğrulamak yetmez: sarmalayıcının gerçekten o kabuğu
   * başlattığı ve PATH'te WSL launcher'ı öndeyken bile onu seçmediği
   * ölçülür. Bu makinenin `bash`ı PATH'te WSL'e gidiyor.
   */
  const resolved = resolveBashShell();
  assert.ok(resolved, 'bu makinede bash çözülemiyor');
  if (process.platform === 'win32') {
    assert.doesNotMatch(resolved.path, /windowsapps/i);
    assert.equal(bashShellProblem(), null);
  }

  const result = spawnSync(
    process.execPath,
    [join(ROOT, 'scripts/quality/bashShell.mjs'), '-c', 'echo VOL_OK'],
    {
      encoding: 'utf8',
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /VOL_OK/);
});
