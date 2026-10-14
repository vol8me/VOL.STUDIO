import Phaser from 'phaser';
import { applyVolViewport, DisposableScope, pushBackHandler } from '@volstudio/core';
import { UIRoot } from '@volstudio/core/ui';
import { createSceneAudio } from '@/audio/sceneAudio';
import type { GameServices } from '@/app/GameServices';
import { MENU } from '@/config/menu';
import { PALETTE } from '@/config/palette';
import { VEHICLES, type VehicleSpec } from '@/config/vehicles';
import { Showroom, type StageRect } from '@/view/Showroom';
import { clipStage } from '@/view/stageClip';

/** Bir ekranın DOM paneli: sahne onu bağlar, odaklar ve kapanışta söker. */
export interface ScreenPanel {
  readonly element: HTMLElement;
  /** Verilirse vitrin bu bölgeye kurulur; yoksa panelin bıraktığı boş alana. */
  readonly stage?: HTMLElement;
  focus(): void;
  destroy(): void;
}

/**
 * Solma rengi vitrin zemininin kumudur (`PALETTE.sand`, Phaser kanal değerleri ister): koyu bir renge solup
 * parlak zemine açılmak her geçişte göz alan bir parlama yapıyordu; kum rengi aracı eritir, aydınlık değişmez.
 */
const FADE = {
  red: (PALETTE.sand >> 16) & 0xff,
  green: (PALETTE.sand >> 8) & 0xff,
  blue: PALETTE.sand & 0xff,
} as const;

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
    this.attachAudio();
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

  /**
   * Menü, garaj, ayarlar ve geliştirici ekranlarının arayüz sesi: düğme, seçim, kaydırıcı ve odak niyetleri
   * oyun içiyle aynı CORE `UiSoundKit`ten çalar. Yalnız UI kiti yüklenir (oyun SFX'i `load()` ile istenir,
   * burada çağrılmaz); ses düzeyi ayardan gelir ve kaydırıcıyla canlı değişir.
   */
  private attachAudio(): void {
    const audio = createSceneAudio(this);
    if (!audio) return;
    this.scope.add(audio);
    audio.attachUi(this.ui.intents, this.ui.element);
    audio.setVolume(this.services.settings.get().volume);
    this.scope.addSubscription(
      this.services.settings.subscribe((value) => audio.setVolume(value.volume)),
    );
    this.scope.addSubscription(this.services.onResume(() => audio.resumeAfterWake()));
  }

  override update(_time: number, delta: number): void {
    const element = this.screen?.stage;
    let stage: StageRect | undefined = element?.getBoundingClientRect();
    const visible = element?.closest('.vt-screen__body')?.getBoundingClientRect();
    if (stage && visible) stage = clipStage(stage, visible);
    this.showroom.update(delta, this.screen?.element.getBoundingClientRect(), stage);
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
