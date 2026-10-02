import { DisposableScope } from '@volstudio/core/lifecycle';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { UnlistenFn } from '@tauri-apps/api/event';
import {
  readFlushRequest,
  reportFlushError,
  retainFlushListener,
  settleFlushHooks,
  type FlushBridge,
} from './flushProtocol';

export type ShutdownFlushHook = () => void | Promise<void>;

export interface ShutdownFlushProbe extends FlushBridge {
  readonly isTauri: () => boolean;
  readonly onCloseRequested?: (
    handler: (event: { preventDefault(): void }) => void,
  ) => Promise<UnlistenFn> | UnlistenFn;
}

const defaultProbe: ShutdownFlushProbe = {
  isTauri,
  listen: (event, handler) => listen(event, handler),
  invoke: (command, args) => invoke(command, args),
  onCloseRequested: (handler) => getCurrentWindow().onCloseRequested(handler),
};

interface FlushGroup {
  hooks: Map<object, ShutdownFlushHook>;
  scope: DisposableScope;
  closed: boolean;
  terminating: boolean;
  closeRequested: boolean;
}

const groups = new WeakMap<ShutdownFlushProbe, FlushGroup>();

/**
 * Kapanışta bütün kancaların sonucunu aynı native requestId ile bildirir.
 * Süre sınırı native kabuktadır; frontend yanıt vermese de çıkış gerçekleşir.
 * Dönen fonksiyon kaydı siler.
 */
export function registerShutdownFlush(
  hook: ShutdownFlushHook,
  probe: ShutdownFlushProbe = defaultProbe,
): () => void {
  if (!probe.isTauri()) return () => undefined;
  let group = groups.get(probe);
  if (!group) {
    group = {
      hooks: new Map(),
      scope: new DisposableScope(),
      closed: false,
      terminating: false,
      closeRequested: false,
    };
    groups.set(probe, group);
    const current = group;
    retainFlushListener(current.scope, probe, () =>
      probe.listen('vol:terminate', ({ payload }) => {
        if (current.closed || current.terminating) return;
        const request = readFlushRequest(payload);
        if (!request || request.reason === 'suspend') {
          reportFlushError(probe, new Error('Geçersiz kapanış boşaltma isteği.'));
          return;
        }
        current.terminating = true;
        void settleFlushHooks(current.hooks.values(), probe)
          .then((outcome) => {
            if (!current.closed) return probe.invoke('vol_flush_done', { ...request, outcome });
          })
          .catch((error: unknown) => reportFlushError(probe, error));
      }),
    );
    if (probe.onCloseRequested) {
      retainFlushListener(current.scope, probe, () =>
        probe.onCloseRequested!((event) => {
          if (current.closed) return;
          event.preventDefault();
          if (current.closeRequested || current.terminating) return;
          current.closeRequested = true;
          void Promise.resolve()
            .then(() => probe.invoke('exit_application'))
            .catch((error: unknown) => reportFlushError(probe, error));
        }),
      );
    }
  }
  const key = {};
  const current = group;
  current.hooks.set(key, hook);
  return () => {
    current.hooks.delete(key);
    if (!current.closed && !current.hooks.size) {
      current.closed = true;
      current.scope.dispose();
      groups.delete(probe);
    }
  };
}
