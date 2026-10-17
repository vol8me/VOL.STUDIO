import Phaser from 'phaser';
import { applyVolViewport, DisposableScope, pushBackHandler } from '@volstudio/core';
import { UIRoot } from '@volstudio/core/ui';
import { createSceneAudio } from '@/audio/sceneAudio';
import type { GameServices } from '@/app/GameServices';
import { BACKDROP } from '@/config/backdrop';
import { MENU } from '@/config/menu';
import { VEHICLES, type VehicleSpec } from '@/config/vehicles';
import {
  freeArea,
  MENU_AREA_KEY,
  MENU_DIM_KEY,
  type FreeArea,
  type PanelRect,
} from '@/view/menuLayout';
import { Showroom } from '@/view/Showroom';
import { renderQualityOf } from './world/CameraRig';

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
 * Menü, garaj, ayarlar ve geliştirici ekranlarının iskeleti: sağ şerit paneli. Altlarındaki `Backdrop`
 * sahnesi her zaman yürüyüş alayını oynatır (kapatma ayarı yoktur); bu sahne saydam kalır. Araç vitrini
 * yalnız aracın seçildiği ekranlarda (`showcase`: garaj, geliştirici) vardır ve alayın üstünde dönen bir
 * tabladır; ana menü ve ayarlar yalnız alayı gösterir. Boş alan (panelin bıraktığı yer) alayın odağını
 * belirler; geri tuşu (Android geri, Escape köprüsü) `onBack`e gider; ekran değişimi şeridin kenara
 * kaymasıyla yapılır. Alt sınıf yalnız panelini kurar ve geçişlerini söyler.
 */
export abstract class ScreenScene extends Phaser.Scene {
  protected scope = new DisposableScope();
  protected ui!: UIRoot;
  private showroom: Showroom | undefined;
  private screen: ScreenPanel | undefined;
  private leaving = false;
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
    void this.services.setPaused(true);
    applyVolViewport(this);
    this.ui = this.scope.addDestroyable(
      new UIRoot(this.game.canvas.parentElement ?? document.body),
    );
    this.showroom = this.showcase
      ? this.scope.addDestroyable(new Showroom(this, this.showcaseSpec()))
      : undefined;
    const clock = this.game.registry.get(CLOCK_KEY) as unknown;
    if (this.showroom && typeof clock === 'number') this.showroom.clockMs = clock;
    this.startBackdrop();
    this.game.registry.set(
      MENU_DIM_KEY,
      this.showroom ? BACKDROP.dim.showcase : BACKDROP.dim.alpha,
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
      if (active && active !== document.body && this.ui.element.contains(active)) return;
      screen.focus();
    });
    this.scope.addSubscription(() => cancelAnimationFrame(focus));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (this.showroom) this.game.registry.set(CLOCK_KEY, this.showroom.clockMs);
      this.scope.dispose();
    });
  }

  /** Sahneyi saydam yapar ve arka plan sahnesini (çalışmıyorsa) başlatır; ekranlar arası geçişte sürer. */
  private startBackdrop(): void {
    this.cameras.main.setBackgroundColor(CLEAR);
    const plugin = this.scene;
    if (plugin.get(BACKDROP_SCENE) && !plugin.isActive(BACKDROP_SCENE))
      plugin.launch(BACKDROP_SCENE);
  }

  /** Panelin bıraktığı boş alan: vitrin varsa onun kamera alanı, yoksa aynı hesap ekran boyundan. */
  private spareArea(panel: PanelRect | undefined): FreeArea {
    if (this.showroom?.freeArea) return this.showroom.freeArea;
    const quality = renderQualityOf(this);
    const { width, height } = this.cameras.main;
    return freeArea(width / quality, height / quality, MENU.showroom.stackedFraction, panel);
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
    const panel = this.screen?.element.getBoundingClientRect();
    this.showroom?.update(delta, panel);
    // Arka plan sahnesi alayın odağını bu alana göre kurar; yalnız değişince yazılır.
    const area = this.spareArea(panel);
    if (!sameArea(this.published, area)) {
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

  /** Bu ekran aracı bir tablada gösterir mi (araç seçilen ekranlar); ana menü ve ayarlar göstermez. */
  protected get showcase(): boolean {
    return false;
  }

  /** Vitrinde gösterilen araç: oyuncunun seçtiği araç. */
  protected showcaseSpec(): VehicleSpec {
    return VEHICLES[this.services.settings.get().vehicle];
  }

  protected setShowcase(spec: VehicleSpec): void {
    this.showroom?.setVehicle(spec);
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
