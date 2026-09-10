import { describe, expect, it } from 'vitest';
import Phaser from 'phaser';
import { LifeScene } from '@/runtime/scene/LifeScene';

describe('LifeScene', () => {
  it('sabit bir sahne anahtarıyla kurulur', () => {
    const scene = new LifeScene();
    expect(scene.sys.settings.key).toBe('LifeScene');
  });

  /*
   * Sahne SHUTDOWN almadan yeniden kurulursa önceki kapsam sahipsiz kalır:
   * HUD elemanları DOM'da, rAF döngüsü ve dil aboneliği ayakta kalırdı.
   */
  it('yeniden kurulumda ÖNCEKİ kapsamı toplar', () => {
    const scene = new LifeScene();
    const disposed: string[] = [];
    const fakeScope = { dispose: () => disposed.push('ilk') };
    (scene as unknown as { runtimeScope: unknown }).runtimeScope = fakeScope;

    // `create()` Phaser bağlamı ister; burada yalnız ilk satırın etkisi ölçülür.
    try {
      scene.create();
    } catch {
      /* Phaser bağlamı yok; kapsam temizliği create()in İLK işidir. */
    }

    expect(disposed).toEqual(['ilk']);
  });

  it('SHUTDOWN ve DESTROY olaylarının her ikisi de kapsamı temizler', () => {
    const scene = new LifeScene();
    const mockContainer = document.createElement('div');
    const mockCanvas = document.createElement('canvas');
    mockContainer.appendChild(mockCanvas);
    (scene as unknown as { game: unknown; events: unknown }).game = {
      canvas: mockCanvas,
    };
    (scene as unknown as { events: unknown }).events = new Phaser.Events.EventEmitter();

    scene.create();
    expect((scene as unknown as { runtimeScope: unknown }).runtimeScope).not.toBeNull();

    // SHUTDOWN testi
    scene.events.emit('shutdown');
    expect((scene as unknown as { runtimeScope: unknown }).runtimeScope).toBeNull();

    // İkinci create sonrası DESTROY testi
    scene.create();
    expect((scene as unknown as { runtimeScope: unknown }).runtimeScope).not.toBeNull();

    scene.events.emit('destroy');
    expect((scene as unknown as { runtimeScope: unknown }).runtimeScope).toBeNull();
  });
});
