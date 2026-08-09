import { describe, it, expect, vi } from 'vitest';
import type Phaser from 'phaser';
import { AudioManager } from '../../src/systems/AudioManager';

function makeSceneStub(options: { hasKey?: boolean; cacheHasKey?: boolean } = {}) {
  const { hasKey = false, cacheHasKey = false } = options;
  const sound = {
    get: vi.fn(() => (hasKey ? {} : null)),
    play: vi.fn(),
    stopAll: vi.fn(),
    mute: false,
  };
  const cache = {
    audio: {
      exists: vi.fn(() => cacheHasKey),
    },
  };
  return { sound, cache } as unknown as Phaser.Scene;
}

describe('AudioManager', () => {
  it('key ses cache/sound sisteminde yoksa play() çökmeden sessizce geçer', () => {
    const scene = makeSceneStub({ hasKey: false, cacheHasKey: false });
    const manager = new AudioManager(scene);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(() => manager.play('eksik-ses')).not.toThrow();
    expect(
      (scene.sound as unknown as { play: ReturnType<typeof vi.fn> }).play,
    ).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);

    warnSpy.mockRestore();
  });

  it('aynı eksik key için tekrar tekrar çağrılırsa yalnızca bir kez uyarı basılır (log spam engeli)', () => {
    const scene = makeSceneStub({ hasKey: false, cacheHasKey: false });
    const manager = new AudioManager(scene);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    manager.play('eksik-ses');
    manager.play('eksik-ses');
    manager.play('eksik-ses');

    expect(warnSpy).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });

  it("farklı eksik key'ler için ayrı ayrı uyarı basılır", () => {
    const scene = makeSceneStub({ hasKey: false, cacheHasKey: false });
    const manager = new AudioManager(scene);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    manager.play('eksik-1');
    manager.play('eksik-2');

    expect(warnSpy).toHaveBeenCalledTimes(2);
    warnSpy.mockRestore();
  });

  it('key sound.get() üzerinden bulunursa gerçekten çalınır', () => {
    const scene = makeSceneStub({ hasKey: true, cacheHasKey: false });
    const manager = new AudioManager(scene);

    manager.play('mevcut-ses');
    expect(
      (scene.sound as unknown as { play: ReturnType<typeof vi.fn> }).play,
    ).toHaveBeenCalledWith('mevcut-ses', { volume: 1 });
  });

  it('key yalnızca cache.audio.exists() üzerinden bulunursa yine de çalınır', () => {
    const scene = makeSceneStub({ hasKey: false, cacheHasKey: true });
    const manager = new AudioManager(scene);

    manager.play('cache-ses');
    expect(
      (scene.sound as unknown as { play: ReturnType<typeof vi.fn> }).play,
    ).toHaveBeenCalledWith('cache-ses', { volume: 1 });
  });

  it('config parametresi play çağrısına iletilir', () => {
    const scene = makeSceneStub({ hasKey: true });
    const manager = new AudioManager(scene);

    manager.play('ses', { volume: 0.5 });
    expect(
      (scene.sound as unknown as { play: ReturnType<typeof vi.fn> }).play,
    ).toHaveBeenCalledWith('ses', {
      volume: 0.5,
    });
  });

  it("setMute scene.sound.mute'u ayarlar", () => {
    const scene = makeSceneStub();
    const manager = new AudioManager(scene);

    manager.setMute(true);
    expect((scene.sound as unknown as { mute: boolean }).mute).toBe(true);
  });

  it('setSfxVolume play volume\'ini ölçekler', () => {
    const scene = makeSceneStub({ hasKey: true });
    const manager = new AudioManager(scene);

    manager.setSfxVolume(0.7);
    manager.play('ses', { volume: 0.5 });
    expect(
      (scene.sound as unknown as { play: ReturnType<typeof vi.fn> }).play,
    ).toHaveBeenCalledWith('ses', { volume: 0.35 });
  });

  it('stopAll scene.sound.stopAll() çağırır', () => {
    const scene = makeSceneStub();
    const manager = new AudioManager(scene);

    manager.stopAll();
    expect(
      (scene.sound as unknown as { stopAll: ReturnType<typeof vi.fn> }).stopAll,
    ).toHaveBeenCalledTimes(1);
  });
});
