import { invoke, isTauri } from '@tauri-apps/api/core';

export interface DiagnosticsProbe {
  readonly isTauri: () => boolean;
  readonly invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
}

const defaultProbe: DiagnosticsProbe = {
  isTauri,
  invoke: (command, args) => invoke(command, args),
};

/**
 * `vol-diagnostics` eklentisinin izin listeli ortam dökümü. Eklenti kurulu
 * değilse ya da tarayıcıdaysak `{}` döner — ölçüm yolu hiçbir zaman oyunu
 * düşürmez.
 */
export async function getDiagnosticsEnv(
  probe: DiagnosticsProbe = defaultProbe,
): Promise<Record<string, string>> {
  if (!probe.isTauri()) return {};
  try {
    const env = await probe.invoke('plugin:vol-diagnostics|env_info');
    return env && typeof env === 'object' ? (env as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/**
 * Tek JSONL kaydı yazar. Kayıt eklentinin fsync'li tek dosyasına gider;
 * hata bilinçli olarak yutulur — ölçüm, ölçtüğü oyunu düşürmemelidir.
 */
export async function reportDiagnostics(
  record: Record<string, unknown>,
  probe: DiagnosticsProbe = defaultProbe,
): Promise<void> {
  if (!probe.isTauri()) return;
  try {
    await probe.invoke('plugin:vol-diagnostics|report', {
      line: JSON.stringify(record),
    });
  } catch {
    // Bilinçli — bkz. üstteki JSDoc.
  }
}

/**
 * `deck.mjs mode` ile yazılan `VOL_DECK_MEASURE=1` bayrağı. Cihaz ölçüm
 * sondası yalnız bu bayrakla devreye girer — paketlenmiş oyunda varsayılan
 * olarak kayıt tutulmaz.
 */
export function isDeckMeasureRequested(env: Record<string, string>): boolean {
  return env.VOL_DECK_MEASURE === '1';
}
