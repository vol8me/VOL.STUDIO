import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { UnlistenFn } from '@tauri-apps/api/event';

export type ShutdownFlushHook = () => void | Promise<void>;

export interface ShutdownFlushProbe {
  readonly isTauri: () => boolean;
  readonly listen: (event: string, handler: () => void) => Promise<UnlistenFn> | UnlistenFn;
  readonly invoke: (command: string) => Promise<unknown>;
}

const defaultProbe: ShutdownFlushProbe = {
  isTauri,
  listen: (event, handler) => listen(event, handler),
  invoke: (command) => invoke(command),
};

/**
 * Sinyal üzerine kapanışta bekleyen yazma kuyruklarını boşaltır.
 * Diagnostics eklentisi SIGTERM/SIGINT/SIGHUP'ı yakalayıp `vol:terminate`
 * yayınlar ve 1.5 sn bekler; kanca bittiğinde `flush_done` komutu izleyiciyi
 * erken çıkarır — çıkış her koşulda süre sınırıyla gerçekleşir. Eklenti
 * kurulu değilse dinleme kurulamaz, kanca kaydı sessizce pas kalır.
 *
 * `AutosaveCoordinator.flush` gibi tek atımlık kuyruk boşaltıcılar için;
 * dönen fonksiyon kaydı siler.
 */
export function registerShutdownFlush(
  hook: ShutdownFlushHook,
  probe: ShutdownFlushProbe = defaultProbe,
): () => void {
  if (!probe.isTauri()) return () => undefined;
  let unlisten: UnlistenFn | undefined;
  void Promise.resolve(
    probe.listen('vol:terminate', () => {
      void Promise.resolve()
        .then(hook)
        .catch(() => undefined)
        .then(() => probe.invoke('plugin:vol-diagnostics|flush_done'))
        .catch(() => undefined);
    }),
  ).then((fn) => {
    unlisten = fn;
  });
  return () => unlisten?.();
}
