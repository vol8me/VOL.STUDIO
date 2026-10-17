import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function checkNativeLink(run = spawnSync, platform = process.platform) {
  if (platform === 'win32') {
    const info = run('rustc', ['-vV'], { encoding: 'utf8', windowsHide: true });
    if (
      info.error ||
      info.status !== 0 ||
      !/^host: \S+-pc-windows-msvc\s*$/m.test(String(info.stdout ?? ''))
    )
      return {
        ok: false,
        output: `Rust MSVC host doğrulanamadı: ${info.error ?? info.stderr ?? info.stdout ?? info.status}`,
      };
  }
  const directory = mkdtempSync(join(tmpdir(), 'vol-link-'));
  try {
    const executable = join(directory, process.platform === 'win32' ? 'probe.exe' : 'probe');
    const link = run('rustc', ['-', '--crate-name', 'vol_link_probe', '-o', executable], {
      cwd: directory,
      input: 'fn main() {}',
      encoding: 'utf8',
      windowsHide: true,
    });
    if (link.error || link.status !== 0) {
      return {
        ok: false,
        output: String(link.error ?? link.stderr ?? 'Rust bağlantısı başarısız'),
      };
    }
    const execute = run(executable, [], { cwd: directory, encoding: 'utf8', windowsHide: true });
    return execute.error || execute.status !== 0
      ? {
          ok: false,
          output: `Bağlanan Rust programı çalıştırılamadı: ${execute.error ?? execute.stderr ?? execute.status}`,
        }
      : { ok: true, output: 'Rust link ve çalıştırma OK' };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
