import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { workingTreeFiles } from './gitFiles.mjs';

/**
 * KÖK DİZİN KİLİDİ. Kök, deponun vitrinidir: her girdi burada gerekçesiyle
 * durur. Listede olmayan girdi eklenirse ya da listedeki gerekçe artık
 * karşılıksızsa kapı düşer; yeni kök girdisi gerekçesi yazılmadan açılamaz.
 * `optional` girdi henüz var olmayabilir (planlanmış ürün dizini).
 */
export const ROOT_ENTRIES = {
  '.gitattributes': 'Satır sonu ve ikili dosya kuralları',
  '.gitignore': 'Üretilen ve yerel çıktının dışlanması',
  '.prettierignore': 'Prettier yok sayma listesini yalnız dosyadan okur',
  'AGENTS.md': 'Agent çalışma sözleşmesi',
  'CLAUDE.md': "Claude Code'a özgü pratikler",
  'Cargo.lock': 'Rust workspace kilidi; manifestin yanında durmak zorunda',
  'Cargo.toml': 'Rust workspace kökü; üyeler üç ayrı dizin ağacında',
  LICENSE: 'Apache 2.0 lisans metni',
  NOTICE: 'Apache 2.0 bildirimi ve üçüncü taraf lisansları',
  'README.md': 'Depo girişi',
  'TODO.md': 'Repo geneli iş listesi',
  core: 'CORE paketi',
  devtools: 'Geliştirme araçları paketleri',
  docs: 'Repo geneli belgeler ve marka görselleri',
  'eslint.config.mjs': 'ESLint düz yapılandırması köke bağlıdır',
  games: { reason: 'Ürün paketleri', optional: true },
  justfile: 'Kalite kapısı tarifleri',
  'package.json': 'pnpm kökü; Prettier ve stylelint yapılandırması burada',
  'pnpm-lock.yaml': 'pnpm kilidi',
  'pnpm-workspace.yaml': 'pnpm workspace tanımı',
  'quality.json': 'Kapı eşikleri ve bütçeler (tek doğruluk kaynağı)',
  scripts: 'Kapılar ve platform betikleri',
  'tauri-v2': 'Paylaşılan Tauri kabuğu ve eklentileri',
  'tsconfig.base.json': 'Paketlerin genişlettiği ortak TypeScript ayarı',
  'workspace-lifecycle.json': 'Paketlerin aktif/frozen kaydı',
};

/** Kökteki girdiler: izlenen ya da yok sayılmayan dosyaların ilk yol parçası. */
export function rootEntriesOf(files) {
  return [...new Set(files.map((file) => file.split('/')[0]))].sort();
}

export function validateRootEntries(entries, root, allowed = ROOT_ENTRIES) {
  const problems = [];
  for (const entry of entries) {
    if (!(entry in allowed)) {
      problems.push(
        `${entry}: kökte gerekçesiz girdi; scripts/quality/rootEntries.mjs'e yaz ya da taşı.`,
      );
    }
  }
  for (const [entry, rule] of Object.entries(allowed)) {
    const optional = typeof rule === 'object' && rule.optional;
    if (!optional && !existsSync(join(root, entry))) {
      problems.push(`${entry}: gerekçesi yazılı ama kökte yok (ölü kayıt).`);
    }
  }
  return problems;
}

export function validateRepoRootEntries(root) {
  return validateRootEntries(rootEntriesOf(workingTreeFiles(root, ['*'])), root);
}
