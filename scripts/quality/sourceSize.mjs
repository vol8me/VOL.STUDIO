/**
 * KAYNAK DOSYA BOYUTU — 1000 satır SERT sınırdır.
 *
 * Eşik bir dönem 600'dü ve gerekçeli muafiyet listesiyle çalışıyordu. Pratikte
 * o liste büyümeye devam etti: bir showcase sekmesi kurucu koleksiyonudur, bir
 * şema dosyası veri taşır, bir Phaser sahnesi alan ataması yapar — hepsi meşru
 * biçimde 600'ü aşıyordu ve her biri ayrı bir muafiyet satırı istiyordu.
 * Sürekli muafiyet yazılan bir eşik, eşik değildir.
 *
 * Sınır bu yüzden gerçekten büyük dosyaların başladığı yere, 1000'e çekildi ve
 * MUAFİYET KALDIRILDI. Bin satırın üstünde bir dosya artık tartışılmaz: bölünür.
 *
 * TESTLER DE KAPSAMDADIR. Bir test dosyası da birikir ve bin satırı aşan bir
 * test, aynı sebeple, birden çok konuyu tek dosyada tutuyordur.
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

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
  const files = execFileSync('git', ['ls-files', '*.ts'], { cwd: root, encoding: 'utf8' })
    .split('\n')
    .filter((file) => file && !file.includes('node_modules'));

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
