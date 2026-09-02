import { DisposableScope, TouchButton, i18next, vibrate } from '@volstudio/core';
import type { VirtualActionSource } from '@volstudio/core';
import { arenaConfig } from '@/config/arena';
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
 * **Düğme neden bölgenin tamamı?** Yatay tutuşta sağ başparmak sabit bir
 * daireye nişan alamaz; küçük bir düğme, atılımı kaçırılan bir refleks hâline
 * getirir. Bölgenin tamamı basıldığında atılım tetiklenir.
 *
 * **Neden sol bölgede DOM yok?** Bir eleman dokunuşu Phaser'dan önce yakalar;
 * sol yarıya konan görünmez bir katman hareket çubuğunun hiç doğmamasına yol
 * açardı. Sol bölge bilinçli olarak boş bırakılır.
 */
export class ArachnidTouchControls {
  private readonly scope = new DisposableScope();
  private readonly root: HTMLDivElement;
  private readonly dashButton: TouchButton;

  constructor(parent: HTMLElement, options: ArachnidTouchControlsOptions) {
    const { touch } = arachnidUiConfig;

    this.root = document.createElement('div');
    this.root.className = 'vol-arachnid-touch';
    this.root.style.setProperty('--vol-arachnid-dash-zone', `${touch.dashZoneWidthRatio * 100}%`);
    this.root.style.setProperty('--vol-arachnid-touch-inset', `${touch.edgeInsetPx}px`);
    // Bölge HUD boşluklarının İÇİNE girmez: üstteki tam ekran düğmesi ve
    // alttaki telemetri dokunulabilir kalmalı.
    this.root.style.setProperty(
      '--vol-arachnid-touch-top',
      `${arenaConfig.viewportGutterPx.top}px`,
    );
    this.root.style.setProperty(
      '--vol-arachnid-touch-bottom',
      `${arenaConfig.viewportGutterPx.bottom}px`,
    );

    this.dashButton = this.scope.addDestroyable(
      new TouchButton({
        shape: 'square',
        label: i18next.t('arachnid:touch.dash'),
        onPress: () => {
          options.actionSource.press('dash');
          vibrate('tap');
        },
        onRelease: () => options.actionSource.release('dash'),
      }),
    );
    this.dashButton.element.classList.add('vol-arachnid-touch__dash');
    this.root.appendChild(this.dashButton.element);

    parent.appendChild(this.root);
    this.scope.add({ dispose: () => this.root.remove() });

    i18next.on('languageChanged', this.onLanguageChanged);
    this.scope.addSubscription(() => i18next.off('languageChanged', this.onLanguageChanged));
  }

  destroy(): void {
    this.scope.dispose();
  }

  private readonly onLanguageChanged = (): void => {
    this.dashButton.element.setAttribute('aria-label', i18next.t('arachnid:touch.dash'));
  };
}
