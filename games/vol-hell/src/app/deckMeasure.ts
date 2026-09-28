import { invoke, isTauri } from '@tauri-apps/api/core';
import {
  FrameWindow,
  summarizeFrameIntervals,
  type FrameWindowSummary,
  type FrameIntervalSummary,
} from '@volstudio/core/time';
import {
  getDiagnosticsEnv,
  getLinuxHapticsStatus,
  isDeckMeasureRequested,
  registerShutdownFlush,
  reportDiagnostics,
} from '@volstudio/tauri-v2';

/**
 * Deck'te uçtan uca kare-zamanlaması ve kol kanıtı toplayan opt-in ölçüm
 * yüzeyi. `deck.mjs mode` ile yazılan `VOL_DECK_MEASURE=1` ortam değişkeni
 * olmadan hiçbir şey kurulmaz — paketlenmiş oyun varsayılan olarak kayıt
 * tutmaz. Eklenti yoksa ya da tarayıcıdaysa sessizce pas geçer.
 *
 * Kayıtlar `vol-diagnostics` eklentisinin fsync'li JSONL dosyasına gider
 * (`deck.mjs measure`/`log` bunu okur); şema `deck-contract.mjs`'in
 * `summarizeReport`'unun ayrıştırdığı alanları taşır.
 */

const WINDOW_MS = 10_000;

/** Tek pencerenin kare-aralığı özeti — probe faz kaydıyla aynı alan adları. */
export type PerfWindowSummary = FrameIntervalSummary;

/** rAF aralıklarını (ms) özetler; boş pencere `null` verir. */
export function summarizeDeltas(deltas: readonly number[]): PerfWindowSummary | null {
  return summarizeFrameIntervals(deltas);
}

export interface DeckMeasureState {
  phase: string;
  metrics: Readonly<Record<string, number>>;
}

export interface DeckMeasureOptions {
  readState?: () => DeckMeasureState;
}

let running = false;

function pads(): Gamepad[] {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return [];
  return navigator.getGamepads().filter((pad): pad is Gamepad => pad !== null);
}

/**
 * `VOL_DECK_MEASURE=1` varsa ölçüm döngüsünü kurar. Dönen `true` ölçümün
 * başladığını söyler; bootstrap sonucu beklemeden devam eder.
 */
export async function startDeckMeasure(options: DeckMeasureOptions = {}): Promise<boolean> {
  if (running || !isTauri()) return running;
  const env = await getDiagnosticsEnv();
  if (!isDeckMeasureRequested(env)) return false;
  running = true;

  void reportDiagnostics({ v: 1, src: 'js', type: 'info', env });
  // Steamworks köprüsü bu yapıda canlı mı — status yanıtı kanıttır.
  const status = await invoke('plugin:vol-steamworks|status').catch((error: unknown) => ({
    error: String(error),
  }));
  void reportDiagnostics({
    v: 1,
    src: 'js',
    type: 'steamworks',
    ...(typeof status === 'object' && status !== null ? status : { status }),
  });
  const haptics = await getLinuxHapticsStatus();
  void reportDiagnostics({ v: 1, src: 'js', type: 'haptics', ...haptics });

  // Sanal/fiziksel kol görünürlüğü — Steam Input sanal kolu takmışsa ilk
  // yoklamada listededir; sonra takılanlar olayla gelir.
  const reportPad = (pad: Gamepad, type: 'pad-connected' | 'pad-disconnected') =>
    void reportDiagnostics({
      v: 1,
      src: 'js',
      type,
      id: pad.id,
      mapping: pad.mapping,
    });
  for (const pad of pads()) reportPad(pad, 'pad-connected');
  const onConnect = (event: GamepadEvent) => reportPad(event.gamepad, 'pad-connected');
  const onDisconnect = (event: GamepadEvent) => reportPad(event.gamepad, 'pad-disconnected');
  window.addEventListener('gamepadconnected', onConnect);
  window.addEventListener('gamepaddisconnected', onDisconnect);

  // Fiziksel ilk düğme basımı — "kol girdisi oyuna ulaştı"nın mekanik kanıtı.
  // Gamepad API olay değil yoklama tabanlıdır; kare döngüsünde okunur.
  let padInputSeen = false;
  const samples = new FrameWindow(WINDOW_MS);
  let windowIndex = 0;
  let raf = 0;

  const emitWindow = (summary: FrameWindowSummary | null, final: boolean) => {
    if (!summary) return Promise.resolve();
    return reportDiagnostics({
      v: 1,
      src: 'js',
      type: 'perf',
      phase: summary.context,
      window: windowIndex++,
      final,
      ...summary,
    });
  };

  const tick = (now: number) => {
    const state = options.readState?.() ?? { phase: 'unclassified', metrics: {} };
    void emitWindow(samples.push(now, state.phase, state.metrics), false);
    if (!padInputSeen) {
      for (const pad of pads()) {
        const button = pad.buttons.findIndex((b) => b.pressed);
        const axis = pad.axes.findIndex((a) => Math.abs(a) > 0.5);
        if (button >= 0 || axis >= 0) {
          padInputSeen = true;
          void reportDiagnostics({
            v: 1,
            src: 'js',
            type: 'pad-input',
            button: button >= 0 ? button : null,
            axis: axis >= 0 ? axis : null,
            t: now,
          });
          break;
        }
      }
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  // SIGTERM → `vol:terminate` üzerine son yarım pencere de kayda düşer;
  // eklenti `flush_done`'a kadar dosyayı açık tutar.
  registerShutdownFlush(() => {
    cancelAnimationFrame(raf);
    window.removeEventListener('gamepadconnected', onConnect);
    window.removeEventListener('gamepaddisconnected', onDisconnect);
    const finalReport = emitWindow(samples.flush(), true);
    running = false;
    return finalReport;
  });
  return true;
}
