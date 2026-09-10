import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Bir kapının göreceği dosyalar: izlenenler VE henüz eklenmemiş ama yok
 * sayılmayan yeni dosyalar.
 *
 * Yalnız `git ls-files` okuyan bir bekçi `git add` öncesi koşan `pnpm quick`te
 * yeni dosyayı görmez. Ölçüldü: izlenmeyen 1101 satırlık bir dosya satır
 * sınırından temiz geçti. İndekste duran ama diskten silinmiş dosya okunamaz;
 * listeden düşer.
 *
 * @param root Repo kökü.
 * @param patterns Git pathspec kalıpları (ör. `*.ts`).
 * @returns Repo köküne göreli, sıralı ve tekil yollar.
 */
export function workingTreeFiles(root, patterns) {
  const output = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', ...patterns],
    { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  return [...new Set(output.split('\0').filter(Boolean))]
    .filter((file) => !file.includes('node_modules') && existsSync(join(root, file)))
    .sort();
}
