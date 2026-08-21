import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { MUSIC_TIMING, beatSeconds, trackSeconds } from '@/config/musicTiming';
import { musicTracks, musicTrackIds } from '@/config/music';

/**
 * Müzik zamanlamasının TEK KAYNAK kaldığını doğrular.
 *
 * BPM ve vuruş sayısı bir dönem hem `config/music.ts`te hem üretim
 * script'lerinde ayrı ayrı yazılıydı ve yalnızca bir yorumla ("BİREBİR
 * eşleşmek zorunda") korunuyordu. Ayrışma SESSİZDİR: `loopEnd` dosyadan
 * uzunsa Web Audio loop aralığını yok sayar, kısaysa besteden bir bölüm hiç
 * duyulmaz. İkisi de kulakla fark edilene kadar görünmez.
 */
const SCRIPTS_DIR = resolve(import.meta.dirname, '../../scripts/audio/music');

describe('müzik zamanlaması tek kaynak', () => {
  it('her müzik track kimliğinin bir zamanlama girdisi vardır', () => {
    for (const id of musicTrackIds) {
      expect(MUSIC_TIMING, `"${id}" için zamanlama yok`).toHaveProperty(id);
    }
  });

  it('config loopEnd değerleri zamanlamadan TÜRETİLİR', () => {
    for (const id of musicTrackIds) {
      const track = musicTracks[id];
      if (track.loopEnd === undefined) continue;

      const expected = trackSeconds(MUSIC_TIMING[id]);
      expect(track.loopEnd, `${id} loopEnd türetilmemiş`).toBeCloseTo(expected, 6);
    }
  });

  it('config bpm değerleri zamanlamadan gelir', () => {
    for (const id of musicTrackIds) {
      const timing = MUSIC_TIMING[id];
      expect(musicTracks[id].bpm, `${id} bpm ayrışmış`).toBe(timing.bpm);
    }
  });

  it("üretim script'leri BPM/BEATS sayısını YENİDEN TANIMLAMAZ", () => {
    // Regresyon: bu dosyalar bir dönem `const BPM = 132;` yazıyordu ve
    // config'le elle eşlenmesi gerekiyordu. Artık MUSIC_TIMING'ten okunur.
    const offenders: string[] = [];

    for (const file of readdirSync(SCRIPTS_DIR)) {
      if (!file.endsWith('.ts')) continue;
      const source = readFileSync(join(SCRIPTS_DIR, file), 'utf-8');

      if (/^const BPM\s*=\s*\d/m.test(source)) offenders.push(`${file}: const BPM = <sayı>`);
      if (/^const BEATS\s*=\s*\d/m.test(source)) offenders.push(`${file}: const BEATS = <sayı>`);
    }

    expect(
      offenders,
      'Tempo/uzunluk sayısı script içinde yeniden tanımlanmış. ' +
        "MUSIC_TIMING'ten okunmalı, aksi halde config ile sessizce ayrışır.",
    ).toEqual([]);
  });

  it("her üretim script'i MUSIC_TIMING okur", () => {
    const missing: string[] = [];

    for (const file of readdirSync(SCRIPTS_DIR)) {
      if (!file.endsWith('.ts')) continue;
      const source = readFileSync(join(SCRIPTS_DIR, file), 'utf-8');
      if (!source.includes('MUSIC_TIMING')) missing.push(file);
    }

    expect(missing, 'Bu script tek kaynağa bağlı değil').toEqual([]);
  });

  it('zamanlama değerleri geçerlidir', () => {
    for (const [id, timing] of Object.entries(MUSIC_TIMING)) {
      expect(timing.bpm, `${id} bpm`).toBeGreaterThan(0);
      expect(Number.isFinite(timing.bpm), `${id} bpm sonlu`).toBe(true);
      expect(timing.beats, `${id} beats`).toBeGreaterThan(0);
      expect(Number.isInteger(timing.beats), `${id} beats tam sayı`).toBe(true);
    }
  });

  it('süre hesabı bilinen değerlerle doğrulanır', () => {
    // 132 BPM, 128 vuruş → 128 * (60/132) ≈ 58.18 s
    expect(trackSeconds({ bpm: 132, beats: 128 })).toBeCloseTo(58.1818, 3);
    expect(beatSeconds({ bpm: 60, beats: 1 })).toBe(1);
  });

  it('ambiyans 60 BPM seçilmiştir — vuruş doğrudan saniye demek', () => {
    // Ritimsiz parçada BPM yalnızca crossfade hizalaması için var; 60 seçmek
    // `beats` alanını okunur bir saniye sayısına çeviriyor.
    for (const id of ['null-drift', 'deep-current'] as const) {
      expect(MUSIC_TIMING[id].bpm).toBe(60);
      expect(trackSeconds(MUSIC_TIMING[id])).toBe(MUSIC_TIMING[id].beats);
    }
  });
});
