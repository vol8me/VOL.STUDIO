import Phaser from 'phaser';

/** Isınma dokusunun anahtar öneki; her doku 2×2 piksel ve ayrıdır. */
const KEY = 'vol-warmup-';
/** Phaser toplu çizimde kullanılan en çok doku birimi; kare başına bir kademe ısıtılır. */
const MAX_UNITS = 16;

/**
 * Toplu çizim gölgelendiricilerini önceden derler. Phaser her "bir toplu çizimdeki doku sayısı" için ayrı
 * gölgelendirici programı üretir ve bunu ilk kez gereken karede, bağlama eşzamanlı bekleyerek derler (kare
 * başına 15–45 ms). Dünya sahnesi ilk saniyede 1'den 16'ya kadar tüm kademelere uğradığı için oyuncu ilk
 * saniyelerde art arda takılma görürdü. Yükleme ekranı arkasında kademeleri birer kare ısıtmak aynı derlemeyi
 * oynanıştan önceye taşır. WebGL olmayan ya da ölçümsüz oturumda (sahte bağlam) hemen döner.
 */
export function warmShaders(scene: Phaser.Scene, done: () => void): void {
  const renderer = scene.sys?.game?.renderer as { type?: number; maxTextures?: number } | undefined;
  if (!renderer || renderer.type !== Phaser.WEBGL) {
    done();
    return;
  }
  const units = Math.max(1, Math.min(renderer.maxTextures ?? MAX_UNITS, MAX_UNITS));
  const images: Phaser.GameObjects.Image[] = [];
  for (let index = 0; index < units; index++) {
    const key = `${KEY}${index}`;
    if (!scene.textures.exists(key)) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 2;
      const context = canvas.getContext('2d');
      if (context) {
        context.fillStyle = `rgb(${index * 15}, 128, 255)`;
        context.fillRect(0, 0, 2, 2);
      }
      scene.textures.addCanvas(key, canvas);
    }
    // Neredeyse saydam: tamamen saydam nesne çizilmez, çizilmeyen toplu çizimi de derletmez.
    images.push(scene.add.image(0, 0, key).setOrigin(0).setScrollFactor(0).setAlpha(0.004));
    images[index].setVisible(false);
  }
  let step = 0;
  const onUpdate = (): void => {
    if (step < units) {
      // `step + 1` farklı doku bu karenin tek toplu çiziminde: o kademenin programı derlenir.
      for (let index = 0; index <= step; index++) images[index].setVisible(true);
      step++;
      return;
    }
    scene.events.off(Phaser.Scenes.Events.POST_UPDATE, onUpdate);
    for (let index = 0; index < units; index++) {
      images[index].destroy();
      scene.textures.remove(`${KEY}${index}`);
    }
    done();
  };
  scene.events.on(Phaser.Scenes.Events.POST_UPDATE, onUpdate);
}
