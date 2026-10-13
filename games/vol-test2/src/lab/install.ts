import type Phaser from 'phaser';
import {
  createDiagnostics,
  type Diagnostics,
  type DiagnosticsSnapshot,
  type DiagnosticsTransport,
} from '@volstudio/core/diagnostics';
import type { FactoryHost } from '@/app/host';
import { buildCommands, dispatch, LAB_API_VERSION } from './commands';
import { LabLog } from './log';
import { LabScene } from './LabScene';
import { capturePageErrors } from './pageCapture';
import { LabRuntime, type Outcome } from './runtime';
import { WORKLOADS } from './workloads/registry';

export type LabMode = 'run' | 'observe';

/** `window.volLab`: ajanın tek giriş noktası. Her komut bir `{ok, data} | {ok:false, error}` zarfı döndürür. */
export interface LabApi {
  readonly version: number;
  readonly mode: LabMode;
  readonly commands: readonly string[];
  call(name: string, args?: unknown): Promise<Outcome<unknown>>;
}

declare global {
  interface Window {
    volLab?: LabApi;
  }
}

/** CORE `Diagnostics` anlık görüntüsünü bellekte tutar: çizici bilgisi `Diagnostics`ten başka yoldan okunamaz. */
export class LabTransport implements DiagnosticsTransport {
  latest: DiagnosticsSnapshot | null = null;

  send(snapshot: DiagnosticsSnapshot): void {
    this.latest = snapshot;
  }

  /** `unknown` "ölçülemedi"dir ve null döner: yargı bunu `renderer` ölçülmedi diye yazar. */
  renderer(): { readonly kind: string; readonly fellBack: boolean } | null {
    const info = this.latest?.renderer;
    if (info === undefined || info.kind === 'unknown') return null;
    return { kind: info.kind, fellBack: info.fellBack };
  }
}

export interface LabHandle {
  readonly runtime: LabRuntime;
  destroy(): void;
}

export interface LabKit {
  readonly mode: LabMode;
  readonly log: LabLog;
  readonly diagnostics: Diagnostics;
  /** Laboratuvar sahneleri: `run` kipinde oyunun sahnelerine eklenir. */
  readonly scenes: readonly (new () => Phaser.Scene)[];
  /** Oyun kurulduktan sonra çağrılır: runtime, `window.volLab` ve saniyelik örnekleyici. */
  attach(game: Phaser.Game, host: FactoryHost): LabHandle;
  /** Oyun kurulamadıysa sayfa yakalayıcısını ve teşhisi bırakır. */
  dispose(): void;
}

/**
 * Laboratuvarın sayfa tarafı. Oyundan ÖNCE kurulur: açılış hataları da günlüğe düşsün ve `createVolGame`
 * kendi teşhis örneğimizi alsın. Yalnızca `?lab=` kipinde, tembel (`import()`) yüklenir; oyuncu paketine girmez.
 */
export function createLabKit(mode: LabMode): LabKit {
  const log = new LabLog();
  const capture = capturePageErrors(log);
  const transport = new LabTransport();
  const diagnostics = createDiagnostics({
    gameId: 'vol-test2',
    overlay: false,
    sampleEvery: 30,
    transport,
  });
  log.info('lab', 'kit.created', { mode, api: LAB_API_VERSION });
  let disposed = false;

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    capture.dispose();
    diagnostics.destroy();
  };

  return {
    mode,
    log,
    diagnostics,
    scenes: [LabScene],
    attach(game, host) {
      const runtime = new LabRuntime({
        game,
        log,
        host,
        diagnostics,
        renderer: () => transport.renderer(),
        workloads: WORKLOADS,
        observeOnly: mode === 'observe',
      });
      const commands = buildCommands(WORKLOADS);
      const api: LabApi = {
        version: LAB_API_VERSION,
        mode,
        commands: commands.map((command) => command.name),
        call: (name, args) => dispatch(commands, runtime, name, args),
      };
      window.volLab = api;
      const timer = window.setInterval(() => runtime.sample(), 1000);
      void runtime.calibrate();
      log.info('lab', 'attached', { mode, workloads: WORKLOADS.map((workload) => workload.id) });
      return {
        runtime,
        destroy() {
          window.clearInterval(timer);
          if (window.volLab === api) delete window.volLab;
          runtime.destroy();
          dispose();
        },
      };
    },
    dispose,
  };
}
