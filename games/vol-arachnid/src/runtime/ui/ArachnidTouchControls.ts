import { DisposableScope, TouchButton, UIRoot, i18next } from '@volstudio/core';
import type { VirtualActionSource } from '@volstudio/core';
import type { ArachnidAction } from '@/config/input';
import { arachnidUiConfig } from '@/config/ui';

export interface ArachnidTouchControlsOptions {
  /** Atılım basımının yazılacağı kaynak; çubuk durumuyla aynı karede birleşir. */
  actionSource: VirtualActionSource<ArachnidAction>;
}

/**
 * Dokunmatik cihazlarda klavyeye bağlı kalan tek girdiyi ekrana taşır.
 *
 * Hareket çubuğu CORE'un `TouchController`'ında zaten var ve yalnız parmak
 * ekrandayken çizilir. Atılım (Space) ise yalnız klavyeden tetiklenebiliyordu,
 * yani dokunmatik bir cihazda oyun EKSİK oynanıyordu.
 *
 * **Neden gerçek bir düğme?** Bir dönem sağ yarının tamamı basılabilir bir
 * alandı; cihazda basıldığında oyun alanının yarısını kaplayıp yaratığı
 * tamamen gizliyordu. Sabit, yuvarlak ve sağ alt köşede duran bir düğme hem
 * başparmağın doğal yayında hem de arenanın dışında kalır.
 *
 * **Neden sol bölgede DOM yok?** Bir eleman dokunuşu Phaser'dan önce yakalar;
 * sol yarıya konan görünmez bir katman hareket çubuğunun hiç doğmamasına yol
 * açardı. Sol bölge bilinçli olarak boş bırakılır.
 */
export class ArachnidTouchControls {
  private readonly scope = new DisposableScope();
  private readonly uiRoot: UIRoot;
  private readonly root: HTMLDivElement;
  private readonly dashButton: TouchButton;

  constructor(parent: HTMLElement, options: ArachnidTouchControlsOptions) {
    const { touch } = arachnidUiConfig;

    // Ortak UIRoot mobilde metin seçimini, çağrı balonunu ve mavi dokunma
    // parlamasını kapatır. Atılım düğmesi doğrudan parent'a bağlanırsa bu
    // korumaların dışında kalır.
    this.uiRoot = this.scope.addDestroyable(new UIRoot(parent));
    this.root = document.createElement('div');
    this.root.className = 'vol-arachnid-touch';
    this.root.style.setProperty('--vol-arachnid-touch-inset', `${touch.edgeInsetPx}px`);
    this.root.style.setProperty('--vol-arachnid-touch-idle', String(touch.idleOpacity));

    this.dashButton = this.scope.addDestroyable(
      new TouchButton({
        shape: 'circle',
        size: touch.dashButtonSizePx,
        icon: i18next.t('arachnid:touch.dashShort'),
        label: i18next.t('arachnid:touch.dash'),
        // Haptik burada değil, GameScene'deki GERÇEK atılım olayında üretilir.
        // Cooldown'da reddedilen bir basım başarı hissi vermemelidir.
        onPress: () => options.actionSource.press('dash'),
        onRelease: () => options.actionSource.release('dash'),
      }),
    );
    this.dashButton.element.classList.add('vol-arachnid-touch__dash');
    this.root.appendChild(this.dashButton.element);

    this.uiRoot.mount(this.root);
    this.scope.add({ dispose: () => this.uiRoot.unmount(this.root) });

    i18next.on('languageChanged', this.onLanguageChanged);
    this.scope.addSubscription(() => i18next.off('languageChanged', this.onLanguageChanged));
  }

  destroy(): void {
    this.scope.dispose();
  }

  private readonly onLanguageChanged = (): void => {
    this.dashButton.element.setAttribute('aria-label', i18next.t('arachnid:touch.dash'));
    this.dashButton.setIcon(i18next.t('arachnid:touch.dashShort'));
  };
}
