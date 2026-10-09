import { beforeEach, describe, expect, it, vi } from 'vitest';

const tauri = vi.hoisted(() => ({
  isTauri: vi.fn(() => true),
  invoke: vi.fn((): Promise<unknown> => Promise.resolve({})),
}));

vi.mock('@tauri-apps/api/core', () => tauri);

import {
  getDiagnosticsEnv,
  isDeckMeasureRequested,
  reportDiagnostics,
} from '../../src/platform/diagnostics';

describe('getDiagnosticsEnv', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tauri.isTauri.mockReturnValue(true);
    tauri.invoke.mockResolvedValue({});
  });

  it('tarayıcıda boş döner', async () => {
    tauri.isTauri.mockReturnValue(false);
    expect(await getDiagnosticsEnv()).toEqual({});
    expect(tauri.invoke).not.toHaveBeenCalled();
  });

  it('ortam dökümünü eklenti komutundan okur', async () => {
    tauri.invoke.mockResolvedValue({ STEAMOS: '1', GPU: 'amd' });
    expect(await getDiagnosticsEnv()).toEqual({ STEAMOS: '1', GPU: 'amd' });
    expect(tauri.invoke).toHaveBeenCalledWith('plugin:vol-diagnostics|env_info', undefined);
  });

  it('nesne olmayan yanıt ve komut hatası boş döner — ölçüm oyunu düşürmez', async () => {
    tauri.invoke.mockResolvedValue('metin');
    expect(await getDiagnosticsEnv()).toEqual({});
    tauri.invoke.mockRejectedValue(new Error('eklenti yok'));
    expect(await getDiagnosticsEnv()).toEqual({});
  });
});

describe('reportDiagnostics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tauri.isTauri.mockReturnValue(true);
    tauri.invoke.mockResolvedValue(undefined);
  });

  it('kaydı JSONL satırı olarak yazar', async () => {
    await reportDiagnostics({ phase: 'menu', fps: 60 });
    expect(tauri.invoke).toHaveBeenCalledWith('plugin:vol-diagnostics|report', {
      line: '{"phase":"menu","fps":60}',
    });
  });

  it('teslim reddini çağırana taşır, tarayıcıda teslim gerçekleşmiş sayılmaz', async () => {
    const error = new Error('eklenti yok');
    tauri.invoke.mockRejectedValue(error);
    await expect(reportDiagnostics({ ok: 1 })).rejects.toBe(error);

    tauri.isTauri.mockReturnValue(false);
    await expect(reportDiagnostics({ ok: 1 })).rejects.toThrow();
    expect(tauri.invoke).toHaveBeenCalledTimes(1);
  });
});

describe('isDeckMeasureRequested', () => {
  it('yalnız VOL_DECK_MEASURE=1 bayrağını true yapar', () => {
    expect(isDeckMeasureRequested({ VOL_DECK_MEASURE: '1' })).toBe(true);
    expect(isDeckMeasureRequested({ VOL_DECK_MEASURE: '0' })).toBe(false);
    expect(isDeckMeasureRequested({})).toBe(false);
  });
});
