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
    playMusic: vi.fn(() => Promise.resolve()),
    playSfx: vi.fn(() => Promise.resolve()),
  },
}));

vi.mock('@/app/services', () => ({ gameAudio: audio }));

import { createRandom } from '@volstudio/core';
import { GameAudioDirector } from '@/runtime/systems/GameAudioDirector';

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
});
