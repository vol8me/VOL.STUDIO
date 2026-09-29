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

interface FlushGroup {
  hooks: Map<object, ShutdownFlushHook>;
  unlisten?: UnlistenFn;
  closed: boolean;
  terminating: boolean;
}

const groups = new WeakMap<ShutdownFlushProbe, FlushGroup>();

/**
 * Sinyal üzerine kapanışta bekleyen yazma kuyruklarını boşaltır.
 * Paylaşılan kabuk SIGTERM/SIGINT/SIGHUP'ı yakalayıp `vol:terminate`
 * yayınlar ve 1.5 sn bekler; kancalar bitince `vol_flush_done` komutu çıkışı
 * öne alır — çıkış her koşulda süre sınırıyla gerçekleşir.
 *
 * `AutosaveCoordinator.flush` gibi tek atımlık kuyruk boşaltıcılar için;
 * dönen fonksiyon kaydı siler.
 */
export function registerShutdownFlush(
  hook: ShutdownFlushHook,
  probe: ShutdownFlushProbe = defaultProbe,
): () => void {
  if (!probe.isTauri()) return () => undefined;
  let group = groups.get(probe);
  if (!group) {
    group = { hooks: new Map(), closed: false, terminating: false };
    groups.set(probe, group);
    const current = group;
    try {
      void Promise.resolve(
        probe.listen('vol:terminate', () => {
          if (current.closed || current.terminating) return;
          current.terminating = true;
          void Promise.allSettled(
            [...current.hooks.values()].map((callback) => Promise.resolve().then(callback)),
          )
            .then(() => probe.invoke('vol_flush_done'))
            .catch(() => undefined);
        }),
      )
        .then((unlisten) => {
          if (current.closed) unlisten();
          else current.unlisten = unlisten;
        })
        .catch(() => undefined);
    } catch {
      // Eklenti bulunmaması uygulamanın açılışını durdurmaz.
    }
  }
  const key = {};
  const current = group;
  current.hooks.set(key, hook);
  return () => {
    current.hooks.delete(key);
    if (!current.closed && !current.hooks.size) {
      current.closed = true;
      current.unlisten?.();
      groups.delete(probe);
    }
  };
}
