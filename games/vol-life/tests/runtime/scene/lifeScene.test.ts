import { describe, expect, it } from 'vitest';
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
});
