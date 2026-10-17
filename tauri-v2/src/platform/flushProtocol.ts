import type { DisposableScope } from '@volstudio/core/lifecycle';
import type { UnlistenFn } from '@tauri-apps/api/event';

export interface FlushRequest {
  readonly requestId: string;
  readonly reason: 'close' | 'signal' | 'suspend';
}

export interface FlushBridge {
  readonly listen: (
    event: string,
    handler: (event: { payload: unknown }) => void,
  ) => Promise<UnlistenFn> | UnlistenFn;
  readonly invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
  readonly onError?: (error: unknown) => void;
}

export function reportFlushError(probe: Pick<FlushBridge, 'onError'>, error: unknown): void {
  try {
    if (probe.onError) probe.onError(error);
    else console.warn('[VOL.STUDIO] Native boşaltma hatası:', error);
  } catch (reportError) {
    console.warn('[VOL.STUDIO] Native boşaltma tanısı başarısız:', error, reportError);
  }
}

export function retainFlushListener(
  scope: DisposableScope,
  probe: Pick<FlushBridge, 'onError'>,
  register: () => Promise<UnlistenFn> | UnlistenFn,
): void {
  try {
    void Promise.resolve(register())
      .then((unlisten) => scope.addSubscription(unlisten))
      .catch((error: unknown) => reportFlushError(probe, error));
  } catch (error) {
    reportFlushError(probe, error);
  }
}

export function readFlushRequest(payload: unknown): FlushRequest | null {
  if (!payload || typeof payload !== 'object') return null;
  const { requestId, reason } = payload as Partial<FlushRequest>;
  if (typeof requestId !== 'string') return null;
  const identity = /^(shutdown|suspend)-([1-9][0-9]{0,19})$/.exec(requestId);
  if (!identity || BigInt(identity[2]) > 18446744073709551615n) return null;
  if (reason !== 'close' && reason !== 'signal' && reason !== 'suspend') return null;
  if (requestId.startsWith('suspend-') !== (reason === 'suspend')) return null;
  return { requestId, reason };
}

export async function settleFlushHooks(
  hooks: Iterable<() => void | Promise<void>>,
  probe: Pick<FlushBridge, 'onError'>,
): Promise<'success' | 'failed'> {
  const results = await Promise.allSettled([...hooks].map((hook) => Promise.resolve().then(hook)));
  const failures = results.filter((result) => result.status === 'rejected');
  for (const failure of failures) reportFlushError(probe, failure.reason);
  return failures.length ? 'failed' : 'success';
}
