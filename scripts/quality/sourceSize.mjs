/**
 * KAYNAK DOSYA BOYUTU — 1000 satır SERT sınırdır, muafiyet yoktur.
 *
 * Eşik bir dönem 600'dü ve gerekçe listesiyle çalışıyordu; liste sürekli büyüdü
 * ve sürekli muafiyet yazılan bir eşik eşik değildir. Sınır gerçekten büyük
 * dosyaların başladığı yere çekildi: bin satırın üstü bölünür.
 *
 * Testler, betikler (`.mjs`), stil ve native kaynak da kapsamdadır. Kapsam bir
 * dönem yalnız `*.ts` idi ve beş stil dosyası 1083–2276 satıra ulaşmıştı.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { workingTreeFiles } from './gitFiles.mjs';

/** Satır sınırının uygulandığı kaynak türleri. */
export const SOURCE_PATTERNS = ['*.ts', '*.mjs', '*.js', '*.css', '*.rs', '*.kt'];

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
export function validateSourceSize(root, acknowledged = ACKNOWLEDGED, threshold = LINE_THRESHOLD) {
  const files = workingTreeFiles(root, SOURCE_PATTERNS);

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
