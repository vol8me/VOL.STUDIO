import Phaser from 'phaser';
import { applyVolViewport, DisposableScope, pushBackHandler } from '@volstudio/core';
import { UIRoot } from '@volstudio/core/ui';
import type { GameServices } from '@/app/GameServices';
import { MENU } from '@/config/menu';
import { PALETTE } from '@/config/palette';
import { VEHICLES, type VehicleSpec } from '@/config/vehicles';
import { Showroom } from '@/view/Showroom';

/** Bir ekranın DOM paneli: sahne onu bağlar, odaklar ve kapanışta söker. */
export interface ScreenPanel {
  readonly element: HTMLElement;
  focus(): void;
  destroy(): void;
}

/** Solma rengi: `PALETTE.void` ile aynı (Phaser kanal değerleri ister). */
const FADE = { red: 29, green: 24, blue: 18 } as const;

function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Menü, garaj ve ayarlar gibi DOM panel + araç vitrini ekranlarının iskeleti. Vitrin kamerayı
 * panelin bıraktığı alana kurar; geri tuşu (Android geri, Escape köprüsü) `onBack`e gider;
 * ekran değişimi solma ile yapılır. Alt sınıf yalnız panelini kurar ve geçişlerini söyler.
 */
export abstract class ScreenScene extends Phaser.Scene {
  protected scope = new DisposableScope();
  protected ui!: UIRoot;
  private showroom!: Showroom;
  private screen: ScreenPanel | undefined;
  private leaving = false;

  constructor(
    key: string,
    protected readonly services: GameServices,
  ) {
    super(key);
  }

  create(data?: unknown): void {
    this.scope.dispose();
    this.scope = new DisposableScope();
    this.leaving = false;
    applyVolViewport(this);
    this.cameras.main.setBackgroundColor(PALETTE.void);
    this.ui = this.scope.addDestroyable(
      new UIRoot(this.game.canvas.parentElement ?? document.body),
    );
    this.showroom = this.scope.addDestroyable(new Showroom(this, this.showcaseSpec()));
    const screen = this.createScreen(data);
    this.screen = screen;
    this.scope.addDestroyable(screen);
    this.ui.mount(screen.element);
    this.scope.addSubscription(pushBackHandler(() => this.onBack()));
    if (!reducedMotion()) this.cameras.main.fadeIn(MENU.fadeMs, FADE.red, FADE.green, FADE.blue);
    // Odak, panelin giriş animasyonu başlamadan taşınmasın diye bir kare sonra verilir. Oyuncu ya da
    // araç o arada panelin içinde bir alana odaklandıysa (yazmaya başladıysa) odak çalınmaz.
    const focus = requestAnimationFrame(() => {
      const active = document.activeElement;
      if (active && active !== document.body && screen.element.contains(active)) return;
      screen.focus();
    });
    this.scope.addSubscription(() => cancelAnimationFrame(focus));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scope.dispose());
  }

  override update(_time: number, delta: number): void {
    this.showroom.update(delta, this.screen?.element.getBoundingClientRect());
  }

  /** Bu ekranın panelini kurar; sahne onu bağlar ve kapanışta yok eder. */
  protected abstract createScreen(data?: unknown): ScreenPanel;

  /** Geri tuşu; `true` olayı tüketir. Varsayılan: tüketme. */
  protected onBack(): boolean {
    return false;
  }

  /** Vitrinde gösterilen araç: oyuncunun seçtiği araç. */
  protected showcaseSpec(): VehicleSpec {
    return VEHICLES[this.services.settings.get().vehicle];
  }

  protected setShowcase(spec: VehicleSpec): void {
    this.showroom.setVehicle(spec);
  }

  /**
   * Başka sahneye solarak geçer; geçiş sürerken ikinci çağrı yok sayılır. Veri yoksa boş nesne verilir:
   * Phaser `undefined` veriyi görmezden gelip sahnenin önceki başlatma verisini korur ve savaştan
   * dönen oyuncunun alıştırması çevrimiçi sürücüyle açılırdı.
   */
  protected goto(key: string, data: object = {}): void {
    if (this.leaving) return;
    this.leaving = true;
    if (this.screen) this.screen.element.dataset.leaving = 'true';
    const start = (): void => {
      this.scene.start(key, data);
    };
    if (reducedMotion()) {
      start();
      return;
    }
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, start);
    this.cameras.main.fadeOut(MENU.fadeMs, FADE.red, FADE.green, FADE.blue);
  }
}
