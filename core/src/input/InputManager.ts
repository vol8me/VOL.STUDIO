import type Phaser from 'phaser';
import { DisposableScope } from '../lifecycle/DisposableScope';
import { Vector2 } from '../math/Vector2';
import { PCController, type MoveKeyBindings } from './PCController';
import type { PCActionBinding } from './PCInputState';
import type { InputProvider } from './InputProvider';
import { createIdleActions, type InputState } from './InputState';
import { idleSnapshot, type InputSnapshot } from './InputSnapshot';
import { TouchController, type TouchControllerOptions } from './TouchController';
import type { VirtualActionSource } from './VirtualActionSource';

export interface InputManagerOptions<TAction extends string> {
  /**
   * Oyunun eylem sözlüğü. Üretilen her `InputState.actions` kaydı bu kümenin
   * TAMAMINI taşır; aktif provider yokken hepsi `false` olur.
   */
  actions: readonly TAction[];
  /** Eylem → klavye tuşu / pointer düğmesi eşlemesi (PC sağlayıcısı). */
  pcActionBindings: Readonly<Record<TAction, PCActionBinding>>;
  /** Hareket tuşları; verilmezse WASD (bkz. `DEFAULT_MOVE_KEYS`). */
  moveKeys?: MoveKeyBindings;
  /** Sağ joystick deadzone'u aştığında basılı sayılacak eylem (dokunmatik). */
  aimStickAction?: TAction;
  /** Sağ joystick dokunulduğu anda, deadzone aşılmadan da eylemi etkinleştirir. */
  aimStickActivatesOnTouch?: boolean;
  /** Sol stick'in başlayabildiği normalize ekran bölgesi; `null` kapatır. */
  leftStickRegion?: TouchControllerOptions<TAction>['leftStickRegion'];
  /** Sağ stick'in başlayabildiği normalize ekran bölgesi; `null` kapatır. */
  rightStickRegion?: TouchControllerOptions<TAction>['rightStickRegion'];
  /**
   * Ekran üstü düğmelerin yazdığı eylem kaynağı; dokunmatik sağlayıcının
   * eylem kümesine karışır (bkz. `VirtualActionSource`).
   */
  actionSource?: VirtualActionSource<TAction>;
  /**
   * Provider'lar testler için enjekte edilebilir. Verilmezse gerçek
   * TouchController/PCController kurulur; ilk eleman her zaman "touch"
   * sağlayıcı kabul edilir.
   */
  providers?: InputProvider<TAction>[];
}

export class InputManager<TAction extends string> {
  private readonly providers: InputProvider<TAction>[];
  private readonly touch: InputProvider<TAction>;
  private readonly actions: readonly TAction[];
  private readonly lifecycle = new DisposableScope();

  constructor(scene: Phaser.Scene, options: InputManagerOptions<TAction>) {
    this.actions = options.actions;
    if (options.providers) {
      // Çağıranın diziyi sonradan değiştirmesi update/cleanup kümelerini
      // birbirinden ayırmamalı; manager kurulduğu andaki sahipliği sabitler.
      this.providers = [...options.providers];
    } else {
      try {
        const touch = this.lifecycle.addDestroyable(
          new TouchController(scene, {
            actions: options.actions,
            aimStickAction: options.aimStickAction,
            aimStickActivatesOnTouch: options.aimStickActivatesOnTouch,
            actionSource: options.actionSource,
            leftStickRegion: options.leftStickRegion,
            rightStickRegion: options.rightStickRegion,
          }),
        );
        const pc = this.lifecycle.addDestroyable(
          new PCController(scene, {
            actionBindings: options.pcActionBindings,
            moveKeys: options.moveKeys,
          }),
        );
        this.providers = [touch, pc];
      } catch (error) {
        // İkinci provider kurulurken hata oluşursa ilk provider'ın Phaser
        // listener'ları constructor tamamlanamadı diye sahnede kalmamalı.
        this.lifecycle.dispose();
        throw error;
      }
    }

    const touch = this.providers[0];
    // noUncheckedIndexedAccess kapali oldugu icin TS bos diziyi yakalamiyor;
    // guard olmadan getState() ilk satirda anlamsiz bir TypeError atardi.
    if (!touch) {
      this.lifecycle.dispose();
      throw new Error('InputManager: en az bir InputProvider gerekli (providers boş olamaz)');
    }
    this.touch = touch;

    // Varsayılan provider'lar kurulum sırasında zaten kaydedildi. Enjekte
    // edilen provider'lar da aynı sahiplik sözleşmesine alınır.
    if (options.providers) {
      for (const provider of this.providers) this.lifecycle.addDestroyable(provider);
    }
  }

  /**
   * Aktif saglayiciyi secer. getState() ve getDebugSnapshot() AYNI secimi
   * kullanmali — aksi halde debug overlay 'pc' gosterirken oyun touch state'i
   * kullanir ve hata ayiklama araci yaniltir.
   *
   * Öncelik: touch her zaman PC'den öncelikli (hibrit cihazlarda dokunmatik
   * aktifken fare/klavye ikincil). PC provider'lar arasında `find()` ilk
   * aktif olanı döner; sıra `providers` dizisindeki tanım sırasına bağlıdır.
   */
  private resolveActiveProvider(): InputProvider<TAction> | undefined {
    if (this.touch.isActive) return this.touch;
    const active = this.providers.find((provider) => provider.isActive);
    if (active) return active;
    // Hiçbir sağlayıcı "aktif" değil demek, GİRDİ YOK demek DEĞİLDİR.
    //
    // Nişan SÜREKLİ bir sinyaldir: fare her zaman bir yerdedir. Burada sıfır
    // durum uydurulunca duran bir oyuncunun nişanı (0,0) oluyordu ve nişana
    // bağlı her mekanik kendi yedeğine düşüyordu — çoklu atış hep SAĞA
    // ateşliyor, ateş alanı oyuncunun ayağının dibine düşüyordu. Sorun
    // yalnızca fare ile nişan alıp WASD'ye ya da fare düğmesine dokunmayan
    // oyuncuda görünüyordu, çünkü bunların hepsi sağlayıcıyı "aktif" yapıyor.
    return this.providers.find((provider) => provider.providesRestingState === true);
  }

  update(delta: number): void {
    for (const provider of this.providers) {
      provider.update(delta);
    }
  }

  /**
   * Touch her zaman PC'den önce kontrol edilir: stale bir `activePointer`
   * (dokunuştan miras kalan) PC'ye yanlışlıkla öncelik verdirmemeli.
   */
  getState(playerPosition: Vector2): InputState<TAction> {
    const active = this.resolveActiveProvider();
    if (active) {
      return active.getState(playerPosition);
    }

    return {
      move: Vector2.zero(),
      aim: Vector2.zero(),
      actions: createIdleActions(this.actions),
    };
  }

  /** Aktif input provider'ın ham durum snapshot'ını döner. */
  getDebugSnapshot(): InputSnapshot {
    const active = this.resolveActiveProvider();
    if (active?.getDebugSnapshot) {
      return active.getDebugSnapshot();
    }
    return idleSnapshot();
  }

  /** Provider'ların tuttuğu joystick/tuş durumunu ortak geçiş kapısından bırakır. */
  reset(): void {
    for (const provider of this.providers) provider.reset?.();
  }

  destroy(): void {
    this.lifecycle.dispose();
  }
}
