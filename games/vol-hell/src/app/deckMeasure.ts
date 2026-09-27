import { invoke, isTauri } from '@tauri-apps/api/core';
import {
  getDiagnosticsEnv,
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
export interface PerfWindowSummary {
  frames: number;
  fps: number;
  meanMs: number;
  p50: number;
  p95: number;
  p99: number;
  over20ms: number;
  over34ms: number;
}

/** rAF aralıklarını (ms) özetler; boş pencere `null` verir. */
export function summarizeDeltas(deltas: readonly number[]): PerfWindowSummary | null {
  if (deltas.length === 0) return null;
  const sorted = [...deltas].sort((a, b) => a - b);
  const pick = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    frames: deltas.length,
    fps: Math.round(10000 / mean) / 10,
    meanMs: round(mean),
    p50: round(pick(0.5)),
    p95: round(pick(0.95)),
    p99: round(pick(0.99)),
    over20ms: deltas.filter((d) => d > 20).length,
    over34ms: deltas.filter((d) => d > 34).length,
  };
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
export async function startDeckMeasure(): Promise<boolean> {
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
  const deltas: number[] = [];
  let prev = 0;
  let windowStart = 0;
  let windowIndex = 0;
  let raf = 0;

  const emitWindow = (final: boolean) => {
    const summary = summarizeDeltas(deltas);
    deltas.length = 0;
    if (!summary) return;
    void reportDiagnostics({
      v: 1,
      src: 'js',
      type: 'perf',
      phase: 'vol-hell oyun',
      window: windowIndex++,
      final,
      ...summary,
    });
  };

  const tick = (now: number) => {
    if (prev > 0) deltas.push(now - prev);
    prev = now;
    if (now - windowStart >= WINDOW_MS) {
      emitWindow(false);
      windowStart = now;
    }
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
    emitWindow(true);
  });
  return true;
}
