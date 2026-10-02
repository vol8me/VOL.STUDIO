import { DisposableScope } from '@volstudio/core/lifecycle';
import { describe, expect, it, vi } from 'vitest';
import {
  readFlushRequest,
  reportFlushError,
  retainFlushListener,
} from '../../src/platform/flushProtocol';

describe('flushProtocol', () => {
  it('kimliği u64 string olarak doğrular ve reason ile aynı protokolü ister', () => {
    expect(
      readFlushRequest({ requestId: 'suspend-18446744073709551615', reason: 'suspend' }),
    ).toEqual({ requestId: 'suspend-18446744073709551615', reason: 'suspend' });
    for (const payload of [
      null,
      15,
      {},
      { requestId: 1, reason: 'close' },
      { requestId: 'shutdown-1', reason: 'unknown' },
      { requestId: 'shutdown-1', reason: 'suspend' },
      { requestId: 'suspend-1', reason: 'close' },
      { requestId: 'shutdown-0', reason: 'close' },
      { requestId: 'suspend-18446744073709551616', reason: 'suspend' },
    ])
      expect(readFlushRequest(payload)).toBeNull();
  });
  it('hata gözlemcisi fırlatsa da asıl hata tanıda korunur', () => {
    const error = new Error('disk');
    const reportError = new Error('tanı');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    reportFlushError(
      {
        onError: () => {
          throw reportError;
        },
      },
      error,
    );
    expect(warn).toHaveBeenCalledWith(
      '[VOL.STUDIO] Native boşaltma tanısı başarısız:',
      error,
      reportError,
    );
    reportFlushError({}, error);
    expect(warn).toHaveBeenCalledWith('[VOL.STUDIO] Native boşaltma hatası:', error);
    warn.mockRestore();
  });
  it('senkron kayıt hatasını bildirir ve sonraki dinleyicinin yaşam döngüsünü korur', async () => {
    const scope = new DisposableScope();
    const error = new Error('register');
    const onError = vi.fn();
    const unlisten = vi.fn();
    retainFlushListener(scope, { onError }, () => {
      throw error;
    });
    retainFlushListener(scope, { onError }, () => unlisten);
    await Promise.resolve();
    expect(onError).toHaveBeenCalledWith(error);
    scope.dispose();
    expect(unlisten).toHaveBeenCalledOnce();
  });
});
