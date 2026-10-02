import {
  createDiagnostics,
  DisposableScope,
  displayCapabilitiesForSession,
  isDiagnosticsEnabled,
  ScopedSaveManager,
  setHapticsEnabled,
  setTextEntryProvider,
  type Diagnostics,
  type GlyphFamilyContext,
} from '@volstudio/core';
import {
  androidScreenOrientation,
  activateSteamActionSet,
  createScopedStores,
  createSteamworksTextEntryProvider,
  DisplayModeController,
  getDiagnosticsEnv,
  getRuntimePlatform,
  getSessionKind,
  isDeckMeasureRequested,
  observeLinuxHaptics,
  observeAndroidHaptics,
  onSteamOverlay,
  onSystemResume,
  registerShutdownFlush,
  registerSuspendFlush,
  reportDiagnostics,
  singleVirtualPad,
  steamVirtualGamepads,
  steamworksGlyphContext,
  steamworksStatus,
  type SteamworksStatus,
  type RuntimePlatform,
  type SessionKind,
} from '@volstudio/tauri-v2';
import { GameProgress } from './GameProgress';
import { GameSettings } from './GameSettings';
import { GameMeasurements } from './GameMeasurements';
import { parseRuntimeOverrides, type RuntimeOverrides } from './RuntimeOverrides';

export class GameServices {
  readonly settings: GameSettings;
  readonly progress: GameProgress;
  readonly display: DisplayModeController | null;
  readonly diagnostics?: Diagnostics;
  readonly measurements?: GameMeasurements;
  readonly displayAvailable: boolean;
  private readonly scope = new DisposableScope();
  private readonly pauseListeners = new Set<() => void>();
  private readonly resumeListeners = new Set<() => Promise<void>>();
  private released = false;

  private constructor(
    readonly platform: RuntimePlatform,
    readonly session: SessionKind,
    readonly glyphContext: GlyphFamilyContext,
    readonly steam: SteamworksStatus,
    measure: boolean,
    readonly overrides: RuntimeOverrides,
  ) {
    const store = new ScopedSaveManager(
      createScopedStores('voltest', {
        onIntegrity: (event) => console.warn('[VOL.TEST] Kayıt bütünlüğü:', event),
      }),
    );
    this.settings = new GameSettings(store, navigator.userAgent);
    this.progress = new GameProgress(store);
    this.scope.addSubscription(() => this.settings.dispose());
    this.scope.addSubscription(() => this.progress.dispose());
    this.displayAvailable =
      platform !== 'android' && displayCapabilitiesForSession(session).windowMode;
    this.display = this.displayAvailable
      ? this.scope.addDestroyable(
          new DisplayModeController({
            getMode: () => this.settings.get().display,
            setMode: (display) => this.settings.update({ display }),
            subscribe: (listener) => this.settings.subscribe(listener),
          }),
        )
      : null;
    if (measure || isDiagnosticsEnabled()) {
      this.diagnostics = createDiagnostics({
        gameId: 'vol-test',
        overlay: !measure,
        transport: { send: (snapshot) => reportDiagnostics({ ...snapshot }) },
      });
    }
    if (measure) this.measurements = new GameMeasurements(reportDiagnostics);
  }

  static async create(): Promise<GameServices> {
    const platform = getRuntimePlatform();
    const [session, context, pads, env, steam] = await Promise.all([
      getSessionKind(),
      steamworksGlyphContext(),
      steamVirtualGamepads(),
      getDiagnosticsEnv(),
      steamworksStatus(),
    ]);
    const pad = singleVirtualPad(pads);
    const services = new GameServices(
      platform,
      session,
      {
        ...context,
        steamDeckSession: session === 'gamescope' || steam.deck,
        ...(pad ? { virtualPad: pad } : {}),
      },
      steam,
      isDeckMeasureRequested(env),
      parseRuntimeOverrides(env),
    );
    try {
      if (services.measurements) await reportDiagnostics({ type: 'info', env });
      await Promise.all([services.settings.load(), services.progress.load()]);
      await services.display?.start();
      await services.setPaused(false);
      const apply = (): void => setHapticsEnabled(services.settings.get().haptics);
      apply();
      services.scope.addSubscription(services.settings.subscribe(apply));
      services.scope.addSubscription(observeLinuxHaptics());
      services.scope.addSubscription(observeAndroidHaptics());
      setTextEntryProvider(createSteamworksTextEntryProvider());
      services.scope.addSubscription(() => setTextEntryProvider(null));
      services.scope.addSubscription(registerShutdownFlush(() => services.flush()));
      services.scope.addSubscription(
        registerSuspendFlush(() => {
          services.pause();
          return services.flush();
        }),
      );
      services.scope.addSubscription(
        onSystemResume(() => {
          services.pause();
          services.measurements?.reset();
          services.diagnostics?.markResume();
          for (const listener of services.resumeListeners) {
            void Promise.resolve()
              .then(() => {
                if (!services.released && services.resumeListeners.has(listener)) return listener();
              })
              .catch((error: unknown) =>
                console.warn('[VOL.TEST] Uyanış servisi toparlanamadı:', error),
              );
          }
        }),
      );
      if (platform !== 'web')
        services.scope.addSubscription(
          await onSteamOverlay((active) => {
            if (active) services.pause();
          }),
        );
      if (platform === 'android') await androidScreenOrientation.set('landscape');
      return services;
    } catch (error) {
      services.dispose();
      throw error;
    }
  }

  onPause(listener: () => void): () => void {
    this.pauseListeners.add(listener);
    return () => this.pauseListeners.delete(listener);
  }

  onResume(listener: () => Promise<void>): () => void {
    this.resumeListeners.add(listener);
    return () => this.resumeListeners.delete(listener);
  }

  async setPaused(paused: boolean): Promise<void> {
    if (this.steam.available && this.steam.inputReady && this.steam.manifestOk !== false) {
      try {
        await activateSteamActionSet(paused ? 'Menu' : 'Gameplay');
      } catch (error) {
        console.warn('[VOL.TEST] Steam aksiyon seti uygulanamadı:', error);
      }
    }
  }

  private pause(): void {
    for (const listener of this.pauseListeners) listener();
  }
  async flush(): Promise<void> {
    const durability = [
      () => this.settings.flush(),
      () => this.progress.flush(),
      () => this.display?.flush(),
    ];
    void Promise.resolve()
      .then(() => this.measurements?.flush())
      .catch((error: unknown) => console.warn('[VOL.TEST] Ölçüm boşaltılamadı:', error));
    const results = await Promise.allSettled(
      durability.map((flush) => Promise.resolve().then(flush)),
    );
    const failures = results.filter((result) => result.status === 'rejected');
    if (failures.length)
      throw new AggregateError(
        failures.map((failure) => failure.reason as unknown),
        'Kalıcılık boşaltılamadı.',
      );
  }
  dispose(): void {
    if (this.released) return;
    this.released = true;
    this.scope.dispose();
    this.pauseListeners.clear();
    this.resumeListeners.clear();
    this.diagnostics?.destroy();
  }
}
