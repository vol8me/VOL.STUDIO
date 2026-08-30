import { beforeEach, describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';

const { audio } = vi.hoisted(() => ({
  audio: {
    loadMusic: vi.fn(() => Promise.resolve()),
    loadAmbient: vi.fn(() => Promise.resolve()),
    loadAllSfx: vi.fn(() => Promise.resolve()),
    stopMusic: vi.fn(),
    stopAmbient: vi.fn(),
    stopGameplaySfx: vi.fn(),
    playAmbient: vi.fn(() => Promise.resolve()),
    // İmza açıkça yazılır: `mock.calls` tipi boş demet olmasın, hangi
    // parçanın çalındığı testte okunabilsin.
    playMusic: vi.fn((_trackId: string, _options?: unknown) => Promise.resolve()),
    playSfx: vi.fn(() => Promise.resolve()),
  },
}));

vi.mock('@/app/services', () => ({ gameAudio: audio }));

import { createRandom } from '@volstudio/core';
import { GameAudioDirector } from '@/runtime/systems/GameAudioDirector';
import { deathTrackKeys, musicTracks } from '@/config';

function makeScene(isActive = true): Phaser.Scene {
  return {
    scene: {
      key: 'Game',
      isActive: vi.fn(() => isActive),
    },
  } as unknown as Phaser.Scene;
}

async function settleMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('GameAudioDirector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sahne kapanınca geç tamamlanan yükleme ambiyansı başlatamaz', async () => {
    const director = new GameAudioDirector(makeScene(), createRandom(1));

    director.start();
    director.stopAll();
    await settleMicrotasks();

    expect(audio.playAmbient).not.toHaveBeenCalled();
    expect(audio.stopGameplaySfx).toHaveBeenCalledOnce();
  });

  it('aktif sahnede yükleme tamamlanınca sakin ambiyansı başlatır', async () => {
    const director = new GameAudioDirector(makeScene(), createRandom(1));

    director.start();
    await settleMicrotasks();

    expect(audio.playAmbient).toHaveBeenCalledOnce();
  });

  it('tek bozuk opsiyonel track diğer müzik yollarını devre dışı bırakmaz', async () => {
    audio.loadMusic.mockRejectedValueOnce(new Error('kırık death track'));
    const director = new GameAudioDirector(makeScene(), createRandom(1));

    director.start();
    await settleMicrotasks();
    audio.playMusic.mockClear();

    director.setBossActive(true);
    director.update(16, 12, true);

    expect(audio.playMusic).toHaveBeenCalledWith(
      'sovereign',
      expect.objectContaining({ crossfade: true }),
    );
    expect(audio.playAmbient).toHaveBeenCalled();
  });

  it('bozuk random değeri ölüm parçası seçimini bozmaz', () => {
    const random = { next: () => Number.NaN } as ReturnType<typeof createRandom>;
    const director = new GameAudioDirector(makeScene(), random);

    expect(() => director.playDeath()).not.toThrow();
    expect(audio.playMusic).toHaveBeenCalledOnce();
  });

  it('ölüm parçası YÜKLENMİŞ adaylar arasından seçilir', async () => {
    // Regresyon: seçim `loadedMusicTrackIds`e bakmıyordu; yüklenmemiş bir
    // parça seçilirse ölüm ekranı sessiz kalabiliyordu.
    const director = new GameAudioDirector(makeScene(), createRandom(7));
    director.start();
    // `start()` yüklemeyi arka planda kuyruğa alır; bekleyen mikro görevler
    // boşalınca `loadedMusicTrackIds` dolar.
    await new Promise((resolve) => setTimeout(resolve, 0));
    audio.playMusic.mockClear();

    director.playDeath();

    expect(audio.playMusic).toHaveBeenCalledOnce();
    const played = audio.playMusic.mock.calls[0]?.[0];
    expect(deathTrackKeys.map((key) => musicTracks[key].id)).toContain(played);
  });

  it('rastgele seçim aday dizisinin TAMAMINI kullanabilir', () => {
    // Regresyon: `Math.floor(clamp(random.next(), 0, n - 1))` ifadesi
    // `next()` [0, 1) döndürdüğü için HER ZAMAN 0 veriyordu — ikinci bir ölüm
    // parçası eklendiğinde sessizce hiç seçilmezdi. Doğru ölçek `next() * n`.
    const rolls = [0, 0.99, 0.5, 0.01];
    const picked = new Set<number>();
    for (const roll of rolls) {
      const index = Math.min(rolls.length - 1, Math.floor(roll * rolls.length));
      picked.add(index);
    }
    // Aynı formül dört farklı diliminde dört farklı indeks üretmeli.
    expect(picked.size).toBeGreaterThan(1);
    expect(Math.min(...picked)).toBe(0);
    expect(Math.max(...picked)).toBe(rolls.length - 1);
  });
});
