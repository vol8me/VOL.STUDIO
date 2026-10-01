import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { UnlistenFn } from '@tauri-apps/api/event';

export type ShutdownFlushHook = () => void | Promise<void>;

export interface ShutdownFlushProbe {
  readonly isTauri: () => boolean;
  readonly listen: (event: string, handler: () => void) => Promise<UnlistenFn> | UnlistenFn;
  readonly invoke: (command: string) => Promise<unknown>;
  readonly onCloseRequested?: (
    handler: (event: { preventDefault(): void }) => void,
  ) => Promise<UnlistenFn> | UnlistenFn;
}

const defaultProbe: ShutdownFlushProbe = {
  isTauri,
  listen: (event, handler) => listen(event, handler),
  invoke: (command) => invoke(command),
  onCloseRequested: (handler) => getCurrentWindow().onCloseRequested(handler),
};

interface FlushGroup {
  hooks: Map<object, ShutdownFlushHook>;
  unlisteners: UnlistenFn[];
  closed: boolean;
  terminating: boolean;
}

const groups = new WeakMap<ShutdownFlushProbe, FlushGroup>();

/**
 * Pencere ve sinyal kapanışında bekleyen yazma kuyruklarını boşaltır.
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
    group = { hooks: new Map(), unlisteners: [], closed: false, terminating: false };
    groups.set(probe, group);
    const current = group;
    const retain = (unlisten: UnlistenFn): void => {
      if (current.closed) unlisten();
      else current.unlisteners.push(unlisten);
    };
    const terminate = (command: string): void => {
      if (current.closed || current.terminating) return;
      current.terminating = true;
      void Promise.allSettled(
        [...current.hooks.values()].map((callback) => Promise.resolve().then(callback)),
      )
        .then(() => probe.invoke(command))
        .catch(() => undefined);
    };
    try {
      void Promise.resolve(
        probe.listen('vol:terminate', () => {
          terminate('vol_flush_done');
        }),
      )
        .then(retain)
        .catch(() => undefined);
    } catch {
      // Eklenti bulunmaması uygulamanın açılışını durdurmaz.
    }
    if (probe.onCloseRequested) {
      try {
        void Promise.resolve(
          probe.onCloseRequested((event) => {
            event.preventDefault();
            terminate('exit_application');
          }),
        )
          .then(retain)
          .catch(() => undefined);
      } catch {
        // Pencere köprüsü olmayan ortamda sinyal kancası çalışmaya devam eder.
      }
    }
  }
  const key = {};
  const current = group;
  current.hooks.set(key, hook);
  return () => {
    current.hooks.delete(key);
    if (!current.closed && !current.hooks.size) {
      current.closed = true;
      for (const unlisten of current.unlisteners) unlisten();
      groups.delete(probe);
    }
  };
}
