import { DisposableScope } from '@volstudio/core/lifecycle';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  readFlushRequest,
  reportFlushError,
  retainFlushListener,
  settleFlushHooks,
  type FlushBridge,
} from './flushProtocol';

export type SuspendHook = () => void | Promise<void>;
export type ResumeListener = () => void;

export interface SystemSleepProbe extends FlushBridge {
  readonly isTauri: () => boolean;
}

const defaultProbe: SystemSleepProbe = {
  isTauri,
  listen: (event, handler) => listen(event, handler),
  invoke: (command, args) => invoke(command, args),
};

interface SleepGroup {
  suspend: Map<object, SuspendHook>;
  resume: Map<object, ResumeListener>;
  scope: DisposableScope;
  closed: boolean;
  requestId: string | null;
  requestOrdinal: bigint;
  resumed: boolean;
}

const groups = new WeakMap<SystemSleepProbe, SleepGroup>();

function groupFor(probe: SystemSleepProbe): SleepGroup {
  const existing = groups.get(probe);
  if (existing) return existing;
  const group: SleepGroup = {
    suspend: new Map(),
    resume: new Map(),
    scope: new DisposableScope(),
    closed: false,
    requestId: null,
    requestOrdinal: 0n,
    resumed: false,
  };
  groups.set(probe, group);
  retainFlushListener(group.scope, probe, () =>
    probe.listen('vol:suspending', ({ payload }) => {
      if (group.closed) return;
      const request = readFlushRequest(payload);
      if (!request || request.reason !== 'suspend') {
        reportFlushError(probe, new Error('Geçersiz uyku boşaltma isteği.'));
        return;
      }
      const ordinal = BigInt(request.requestId.slice('suspend-'.length));
      if (ordinal <= group.requestOrdinal) return;
      group.requestOrdinal = ordinal;
      group.requestId = request.requestId;
      group.resumed = false;
      void settleFlushHooks(group.suspend.values(), probe)
        .then((outcome) => {
          if (!group.closed && !group.resumed && group.requestId === request.requestId)
            return probe.invoke('vol_suspend_ready', { ...request, outcome });
        })
        .catch((error: unknown) => reportFlushError(probe, error));
    }),
  );
  retainFlushListener(group.scope, probe, () =>
    probe.listen('vol:resumed', () => {
      if (group.closed) return;
      group.resumed = true;
      for (const listener of group.resume.values()) {
        try {
          listener();
        } catch (error) {
          reportFlushError(probe, error);
        }
      }
    }),
  );
  retainFlushListener(group.scope, probe, () =>
    probe.listen('vol:sleep-error', ({ payload }) => {
      if (!group.closed) reportFlushError(probe, payload);
    }),
  );
  return group;
}

function release(probe: SystemSleepProbe, group: SleepGroup): void {
  if (group.closed || group.suspend.size || group.resume.size) return;
  group.closed = true;
  group.scope.dispose();
  groups.delete(probe);
}

/**
 * Uyku öncesinde bütün kancaları bekler ve yalnız ilgili native turu onaylar.
 * Kabuk uyku kilidini en çok 1.5 sn tutar; dönen fonksiyon kaydı siler.
 */
export function registerSuspendFlush(
  hook: SuspendHook,
  probe: SystemSleepProbe = defaultProbe,
): () => void {
  if (!probe.isTauri()) return () => undefined;
  const group = groupFor(probe);
  const key = {};
  group.suspend.set(key, hook);
  return () => {
    group.suspend.delete(key);
    release(probe, group);
  };
}

/** Uyanışta oyun, ses ve simülasyon saati toparlama niyetini bildirir. */
export function onSystemResume(
  listener: ResumeListener,
  probe: SystemSleepProbe = defaultProbe,
): () => void {
  if (!probe.isTauri()) return () => undefined;
  const group = groupFor(probe);
  const key = {};
  group.resume.set(key, listener);
  return () => {
    group.resume.delete(key);
    release(probe, group);
  };
}
