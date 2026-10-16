import Phaser from 'phaser';
import { applyVolViewport, DisposableScope, pushBackHandler } from '@volstudio/core';
import { UIRoot } from '@volstudio/core/ui';
import { createSceneAudio } from '@/audio/sceneAudio';
import type { GameServices } from '@/app/GameServices';
import { MENU } from '@/config/menu';
import { PALETTE } from '@/config/palette';
import { VEHICLES, type VehicleSpec } from '@/config/vehicles';
import { MENU_AREA_KEY, type FreeArea } from '@/view/menuLayout';
import { Showroom } from '@/view/Showroom';

/** Bir ekranın DOM paneli: sahne onu bağlar, odaklar ve kapanışta söker. */
export interface ScreenPanel {
  readonly element: HTMLElement;
  focus(): void;
  destroy(): void;
}

/** Arka plan sahnesinin anahtarı: menü ekranları onu altlarında oynatır, dünya açılırken durdurur. */
export const BACKDROP_SCENE = 'Backdrop';

/** Tabla saatinin oyun kayıt defterindeki anahtarı: ekran değişince aynı araç aynı açıda kalır. */
const CLOCK_KEY = 'vol-test:showroom-clock';

/** Saydam kamera zemini: arkadaki sahne görünür. */
const CLEAR = 'rgba(0,0,0,0)';

function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function sameArea(a: FreeArea | undefined, b: FreeArea): boolean {
  return (
    a !== undefined &&
    Math.abs(a.x - b.x) < 0.5 &&
    Math.abs(a.y - b.y) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5
  );
}

/**
 * Menü, garaj, ayarlar ve geliştirici ekranlarının iskeleti: sağ şerit paneli ve araç vitrini. Canlı
 * arka plan açıksa (`backdrop` ayarı) altlarındaki `Backdrop` sahnesi yürüyüş alayını oynatır; sahne saydam
 * kalır ve vitrin zemini yalnız bir gölgeye iner. Vitrin kamerayı panelin bıraktığı alana kurar; geri
 * tuşu (Android geri, Escape köprüsü) `onBack`e gider; ekran değişimi şeridin kenara kaymasıyla yapılır.
 * Alt sınıf yalnız panelini kurar ve geçişlerini söyler.
 */
export abstract class ScreenScene extends Phaser.Scene {
  protected scope = new DisposableScope();
  protected ui!: UIRoot;
  private showroom!: Showroom;
  private screen: ScreenPanel | undefined;
  private leaving = false;
  private backdrop = false;
  private published: FreeArea | undefined;

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
    this.published = undefined;
    applyVolViewport(this);
    const settings = this.services.settings;
    this.backdrop = settings.get().backdrop;
    this.ui = this.scope.addDestroyable(
      new UIRoot(this.game.canvas.parentElement ?? document.body),
    );
    this.showroom = this.scope.addDestroyable(
      new Showroom(this, this.showcaseSpec(), this.backdrop ? 'disc' : 'plane'),
    );
    const clock = this.game.registry.get(CLOCK_KEY) as unknown;
    if (typeof clock === 'number') this.showroom.clockMs = clock;
    this.applyBackdrop();
    this.scope.addSubscription(
      settings.subscribe((value) => {
        if (value.backdrop === this.backdrop) return;
        this.backdrop = value.backdrop;
        this.applyBackdrop();
      }),
    );
    const screen = this.createScreen(data);
    this.screen = screen;
    this.scope.addDestroyable(screen);
    screen.element.style.setProperty('--vt-slide', `${MENU.slidePx}px`);
    screen.element.style.setProperty('--vt-slide-ms', `${MENU.fadeMs}ms`);
    this.ui.mount(screen.element);
    this.attachAudio();
    this.scope.addSubscription(pushBackHandler(() => this.onBack()));
    // Odak, panelin giriş animasyonu başlamadan taşınmasın diye bir kare sonra verilir. Oyuncu ya da
    // araç o arada panelin içinde bir alana odaklandıysa (yazmaya başladıysa) odak çalınmaz.
    const focus = requestAnimationFrame(() => {
      const active = document.activeElement;
      if (active && active !== document.body && screen.element.contains(active)) return;
      screen.focus();
    });
    this.scope.addSubscription(() => cancelAnimationFrame(focus));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.registry.set(CLOCK_KEY, this.showroom.clockMs);
      this.scope.dispose();
    });
  }

  /**
   * Canlı arka planı ayara uydurur: açıkken sahne saydamdır, vitrin zemini gölgeye iner ve arka plan
   * sahnesi çalışır; kapalıyken kamera koyu zemine, vitrin ızgaralı kuma döner ve arka plan durur.
   */
  private applyBackdrop(): void {
    this.cameras.main.setBackgroundColor(this.backdrop ? CLEAR : PALETTE.void);
    this.showroom.setGround(this.backdrop ? 'disc' : 'plane');
    const plugin = this.scene;
    if (!plugin.get(BACKDROP_SCENE)) return;
    const running = plugin.isActive(BACKDROP_SCENE);
    if (this.backdrop && !running) plugin.launch(BACKDROP_SCENE);
    else if (!this.backdrop && running) plugin.stop(BACKDROP_SCENE);
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
    this.showroom.update(delta, this.screen?.element.getBoundingClientRect());
    // Arka plan sahnesi alayın odağını bu alana göre kurar; yalnız değişince yazılır.
    const area = this.showroom.freeArea;
    if (area && !sameArea(this.published, area)) {
      this.published = area;
      this.game.registry.set(MENU_AREA_KEY, area);
    }
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
   * Başka sahneye geçer: şerit kenara kayarak çıkar ve süre dolunca sahne değişir; geçiş sürerken ikinci
   * çağrı yok sayılır. Dünyaya geçerken arka plan sahnesi önce durdurulur (iki dünya aynı anda kurulmaz).
   * Veri yoksa boş nesne verilir: Phaser `undefined` veriyi görmezden gelip sahnenin önceki başlatma
   * verisini korur ve savaştan dönen oyuncunun alıştırması çevrimiçi sürücüyle açılırdı.
   */
  protected goto(key: string, data: object = {}): void {
    if (this.leaving) return;
    this.leaving = true;
    if (this.screen) this.screen.element.dataset.leaving = 'true';
    const start = (): void => {
      if (key === 'World' && this.scene.get(BACKDROP_SCENE)) this.scene.stop(BACKDROP_SCENE);
      this.scene.start(key, data);
    };
    if (reducedMotion()) {
      start();
      return;
    }
    this.time.delayedCall(MENU.fadeMs, start);
  }
}
