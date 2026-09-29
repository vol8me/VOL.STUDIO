import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { UnlistenFn } from '@tauri-apps/api/event';

export type SuspendHook = () => void | Promise<void>;
export type ResumeListener = () => void;

export interface SystemSleepProbe {
  readonly isTauri: () => boolean;
  readonly listen: (event: string, handler: () => void) => Promise<UnlistenFn> | UnlistenFn;
  readonly invoke: (command: string) => Promise<unknown>;
}

const defaultProbe: SystemSleepProbe = {
  isTauri,
  listen: (event, handler) => listen(event, handler),
  invoke: (command) => invoke(command),
};

interface SleepGroup {
  suspend: Map<object, SuspendHook>;
  resume: Map<object, ResumeListener>;
  unlisten: UnlistenFn[];
  closed: boolean;
}

const groups = new WeakMap<SystemSleepProbe, SleepGroup>();

function groupFor(probe: SystemSleepProbe): SleepGroup {
  const existing = groups.get(probe);
  if (existing) return existing;
  const group: SleepGroup = { suspend: new Map(), resume: new Map(), unlisten: [], closed: false };
  groups.set(probe, group);
  const keep = (pending: Promise<UnlistenFn> | UnlistenFn) =>
    void Promise.resolve(pending)
      .then((unlisten) => {
        if (group.closed) unlisten();
        else group.unlisten.push(unlisten);
      })
      .catch(() => undefined);
  try {
    keep(
      probe.listen('vol:suspending', () => {
        void Promise.allSettled(
          [...group.suspend.values()].map((hook) => Promise.resolve().then(hook)),
        )
          .then(() => probe.invoke('vol_suspend_ready'))
          .catch(() => undefined);
      }),
    );
    keep(
      probe.listen('vol:resumed', () => {
        for (const listener of group.resume.values()) listener();
      }),
    );
  } catch {
    // Dinleme kurulamaması açılışı durdurmaz.
  }
  return group;
}

function release(probe: SystemSleepProbe, group: SleepGroup): void {
  if (group.closed || group.suspend.size || group.resume.size) return;
  group.closed = true;
  for (const unlisten of group.unlisten) unlisten();
  groups.delete(probe);
}

/**
 * Sistem uyumadan önce bekleyen yazıları boşaltır. Kabuk logind uyku
 * kilidini tutar, `vol:suspending` yayınlar ve kancalar bitene kadar (en
 * çok 1.5 sn) uykuyu erteler. Her uyku turunda yeniden çalışır; dönen
 * fonksiyon kaydı siler.
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

/**
 * Uyanışta çağrılır: oyun duraklatılmış dönmeli, ses bağlamı yeniden
 * başlatılmalı, uzun kare aralığı simülasyona tek adım olarak girmemelidir.
 */
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
