/**
 * KAYNAK DOSYA BOYUTU — 1000 satır SERT sınırdır, muafiyet yoktur.
 *
 * Sürekli muafiyet yazılan eşik eşik değildir; sınır gerçekten büyük
 * dosyaların başladığı yerdedir ve bin satırın üstü bölünür.
 *
 * Testler, betikler (`.mjs`), stil ve native kaynak da kapsamdadır; kapsam
 * dışı kalan tür sınırsız büyür. Belge, yapılandırma/veri ve asset dosyaları
 * satır sınırına tabi değildir; bunların doğal boyutu kaynak kod
 * karmaşıklığını göstermez.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { workingTreeFiles } from './gitFiles.mjs';
import { excludingFrozenPaths, loadRepoLifecycle } from './workspaceLifecycle.mjs';

/** Satır sınırının uygulandığı kaynak türleri. */
export const SOURCE_PATTERNS = [
  '*.ts',
  '*.tsx',
  '*.mts',
  '*.mjs',
  '*.cjs',
  '*.js',
  '*.css',
  '*.rs',
  '*.kt',
];

/** Sert sınır: bunun üstünde bir dosya bölünür, gerekçe kabul edilmez. */
export const LINE_THRESHOLD = 1000;

/**
 * Muafiyet haritası BOŞ tutulur ve boş kalmalıdır.
 *
 * Mekanizma testler kendi haritasını verebilsin diye duruyor; üretimde bir
 * girdi eklemek, kaldırılan muafiyet modelini geri getirmektir.
 */
export const ACKNOWLEDGED = {};

/**
 * @param root Repo kökü.
 * @param acknowledged Gerekçe haritası; testler kendi haritasını verir.
 * @param threshold Satır eşiği.
 * @returns Sorun listesi; boşsa her aşım gerekçeli.
 */
export function validateSourceSize(
  root,
  acknowledged = ACKNOWLEDGED,
  threshold = LINE_THRESHOLD,
  lifecycle = loadRepoLifecycle(root),
) {
  const files = excludingFrozenPaths(workingTreeFiles(root, SOURCE_PATTERNS), lifecycle);

  const problems = [];
  const oversized = new Set();

  for (const file of files) {
    let lines;
    try {
      lines = readFileSync(join(root, file), 'utf8').split('\n').length;
    } catch {
      continue;
    }
    if (lines <= threshold) continue;
    oversized.add(file);
    if (!(file in acknowledged)) {
      problems.push(
        `${file}: ${lines} satır (sert sınır ${threshold}). Bölünmeli — ` +
          'bu eşik gerekçeyle geçilmez.',
      );
    }
  }

  for (const file of Object.keys(acknowledged)) {
    if (!oversized.has(file)) {
      problems.push(
        `${file}: eşiğin ALTINA indi ama gerekçesi duruyor — ölü muafiyet kaldırılmalı.`,
      );
    }
  }

  return problems;
}
