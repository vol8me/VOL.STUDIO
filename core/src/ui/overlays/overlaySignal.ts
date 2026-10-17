import { emitUiSignal } from '../feedback/uiIntent';

/**
 * Katman açılış/kapanış sesi. Tetikleyici (odağın önceki sahibi ya da bağlı eleman) kayıtlı bir
 * UI kökündeyse niyet yayılır; kodla, tetikleyicisiz açılan ya da sökülen katman SESSİZDİR
 * (kullanıcı eylemi değildir). Kısayolla açılış, odak kayıtlı kökteki bir öğedeyken tetikleyici sayılır.
 */
export function signalOverlay(
  kind: 'open' | 'close',
  origin: string,
  trigger: Element | null | undefined,
): void {
  if (trigger instanceof Element && trigger.isConnected) {
    emitUiSignal({ kind, origin, target: trigger });
  }
}
