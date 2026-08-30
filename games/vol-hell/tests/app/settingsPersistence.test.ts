import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  onPersistenceFailure,
  reportPersistenceFailure,
  resetPersistenceListenersForTests,
} from '@/app/settingsPersistence';

describe('ayar kalıcılığı hata yüzeyi', () => {
  afterEach(() => {
    resetPersistenceListenersForTests();
    vi.restoreAllMocks();
  });

  it('hatayı konsola ve abonelere taşır', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const listener = vi.fn();
    onPersistenceFailure(listener);

    const error = new Error('disk dolu');
    reportPersistenceFailure('vol-hell:video-settings', error);

    // Regresyon: hata `console.warn`e gömülüyordu; çalışma anında ayar
    // UYGULANMIŞ görünüp disk yazımı sessizce başarısız olabiliyordu.
    expect(warn).toHaveBeenCalled();
    expect(listener).toHaveBeenCalledWith({ storageKey: 'vol-hell:video-settings', error });
  });

  it('abonelik kaldırılabilir', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const listener = vi.fn();
    const stop = onPersistenceFailure(listener);

    stop();
    reportPersistenceFailure('vol-hell:audio-settings', new Error('x'));

    expect(listener).not.toHaveBeenCalled();
  });

  it('bir dinleyicinin hatası diğerlerini engellemez', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const healthy = vi.fn();
    onPersistenceFailure(() => {
      throw new Error('UI patladı');
    });
    onPersistenceFailure(healthy);

    reportPersistenceFailure('vol-hell:audio-settings', new Error('yazılamadı'));

    expect(healthy).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalled();
  });
});
