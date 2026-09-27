import type Phaser from 'phaser';
import { DisposableScope } from '../../lifecycle/DisposableScope';
import { Vector2 } from '../../math/Vector2';
import { PCController, type MoveKeyBindings } from './PCController';
import type { PCActionBinding } from '../../input/PCInputState';
import type { InputProvider } from '../../input/InputProvider';
import { createIdleActions, type InputState } from '../../input/InputState';
import { createIdleSnapshot, type InputSnapshot } from '../../input/InputSnapshot';
import { TouchController, type TouchControllerOptions } from './TouchController';
import type { VirtualActionSource } from '../../input/VirtualActionSource';
import { InputModeArbiter, type InputModePolicyOptions } from '../../input/inputMode';
import { clearTextEntryModeProbe, setTextEntryModeProbe } from '../../ui/textEntry/textEntry';
import { GamepadController, type GamepadControllerOptions } from '../../input/GamepadController';

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
  /**
   * Eylem → kol düğmesi eşlemesi. Varsayılan sağlayıcılar kurulurken bir
   * `GamepadController` da listeye eklenir; bu eşleme verilmezse kol yalnız
   * hareket/nişan ve kip algısı üretir (düğmeler eylemsiz kalır).
   * `padIndex`, `getGamepads` ve deadzone seçenekleri de buradan geçer.
   */
  gamepad?: Omit<GamepadControllerOptions<TAction>, 'actions'>;
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
   * Girdi kipi politikası. `initial` ile ilk kareden kip seçilir (ör.
   * gamescope oturumunda `'gamepad'`); ayrıntılar `InputModeArbiter`'de.
   */
  inputMode?: InputModePolicyOptions;
  /**
   * Provider'lar testler için enjekte edilebilir. Verilmezse gerçek
   * TouchController/PCController/GamepadController kurulur; liste sırası
   * eş zamanlı etkinlikteki öncelik sırasıdır (dokunmatik önce gelir).
   */
  providers?: InputProvider<TAction>[];
}

export class InputManager<TAction extends string> {
  private readonly providers: InputProvider<TAction>[];
  private readonly actions: readonly TAction[];
  private readonly lifecycle = new DisposableScope();
  private readonly arbiter: InputModeArbiter;
  private readonly textEntryProbe = (): boolean => this.arbiter.mode === 'gamepad';

  constructor(scene: Phaser.Scene, options: InputManagerOptions<TAction>) {
    this.actions = options.actions;
    this.arbiter = new InputModeArbiter(options.inputMode);
    // Input/TextArea focus kancası bu probu okur: kol kipindeyse native
    // odak yerine ekran klavyesi (ya da kayıtlı sağlayıcı) açılır.
    setTextEntryModeProbe(this.textEntryProbe);
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
        const gamepad = this.lifecycle.addDestroyable(
          new GamepadController<TAction>({
            actions: options.actions,
            ...options.gamepad,
          }),
        );
        this.providers = [touch, pc, gamepad];
      } catch (error) {
        // Geç provider kurulurken hata oluşursa erken provider'ların Phaser
        // listener'ları constructor tamamlanamadı diye sahnede kalmamalı.
        this.lifecycle.dispose();
        throw error;
      }
    }

    if (this.providers.length === 0) {
      this.lifecycle.dispose();
      throw new Error('InputManager: en az bir InputProvider gerekli (providers boş olamaz)');
    }

    // Varsayılan provider'lar kurulum sırasında zaten kaydedildi. Enjekte
    // edilen provider'lar da aynı sahiplik sözleşmesine alınır.
    if (options.providers) {
      for (const provider of this.providers) this.lifecycle.addDestroyable(provider);
    }
  }

  /**
   * Geçerli girdi kipi — son anlamlı girdinin sağlayıcı kimliği.
   * Glif/odak halkası gibi GÖRÜNTÜ kararları bunu okur; `InputModeArbiter`
   * histerezisi sayesinde gürültüyle gidip gelmez. Hiç girdi olmadıysa
   * `inputMode.initial` ya da `undefined`.
   */
  get inputMode(): string | undefined {
    return this.arbiter.mode;
  }

  update(delta: number): void {
    for (const provider of this.providers) {
      provider.update(delta);
    }
    this.arbiter.observe(
      this.providers.map((provider) => ({ id: provider.id, active: provider.isActive })),
    );
  }

  /**
   * Bu karenin girdi durumunu üretir.
   *
   * Sağlayıcılar artık BİRLEŞTİRİLİR, tek kazanan seçilmez:
   *
   * - **Eylemler** tüm etkin sağlayıcılar üzerinden VEYALANIR — kol düğmesi
   *   WASD basılıyken de çalışır; hiçbir kip ötekini kilitlemez.
   * - **Hareket ve nişan** önce kip sahibinden, o boşsa sırayla diğer etkin
   *   sağlayıcılardan alınır ("son anlamlı girdi kazanır").
   * - **Nişan birikir:** etkin sağlayıcının nişanı sıfırsa (çubuk serbest)
   *   `providesRestingState` taşıyan sağlayıcının durağan nişanı kullanılır
   *   — kol etkinken fare konumu kaybolmaz, miras dokunuş ise
   *   `wasTouch` koruması zaten o sağlayıcıyı devre dışı bırakır.
   * - Hiçbir sağlayıcı etkin değilken durağan-nişan sağlayıcısının TAM
   *   durumu döner (nişan sıfır uydurulmaz).
   */
  getState(playerPosition: Vector2): InputState<TAction> {
    const active = this.providers.filter((provider) => provider.isActive);

    if (active.length === 0) {
      const resting = this.providers.find((provider) => provider.providesRestingState === true);
      if (resting) return resting.getState(playerPosition);
      return {
        move: Vector2.zero(),
        aim: Vector2.zero(),
        actions: createIdleActions(this.actions),
      };
    }

    const order = this.arbiter.priorityOrder(active.map((provider) => provider.id));
    const byId = new Map(active.map((provider) => [provider.id, provider] as const));
    const ordered = order
      .map((id) => byId.get(id))
      .filter((provider): provider is InputProvider<TAction> => provider !== undefined);
    const states = new Map(
      ordered.map((provider) => [provider.id, provider.getState(playerPosition)] as const),
    );

    const actions = createIdleActions(this.actions);
    for (const state of states.values()) {
      for (const action of this.actions) {
        actions[action] = actions[action] || state.actions[action];
      }
    }

    const pick = (field: 'move' | 'aim'): Vector2 | undefined => {
      for (const provider of ordered) {
        const value = states.get(provider.id)?.[field];
        if (value && value.length() > 0) return value;
      }
      return undefined;
    };

    let aim = pick('aim');
    if (!aim) {
      const resting = this.providers.find(
        (provider) => provider.providesRestingState === true && provider.isActive === false,
      );
      const restingAim = resting?.getState(playerPosition).aim;
      if (restingAim && restingAim.length() > 0) aim = restingAim;
    }

    return {
      move: pick('move') ?? Vector2.zero(),
      aim: aim ?? Vector2.zero(),
      actions,
    };
  }

  /** Aktif input provider'ın ham durum snapshot'ını döner. */
  getDebugSnapshot(): InputSnapshot {
    const mode = this.arbiter.mode;
    const provider =
      this.providers.find((candidate) => candidate.id === mode && candidate.isActive) ??
      this.providers.find((candidate) => candidate.isActive);
    if (provider?.getDebugSnapshot) {
      return provider.getDebugSnapshot();
    }
    return createIdleSnapshot();
  }

  /** Provider'ların tuttuğu joystick/tuş durumunu ortak geçiş kapısından bırakır. */
  reset(): void {
    for (const provider of this.providers) provider.reset?.();
  }

  destroy(): void {
    clearTextEntryModeProbe(this.textEntryProbe);
    this.lifecycle.dispose();
  }
}
