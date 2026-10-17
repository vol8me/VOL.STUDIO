import { describe, expect, it, vi } from 'vitest';
import { getSessionKind } from '../../src/platform/sessionKind';
import type { SessionKindProbe } from '../../src/platform/sessionKind';

const fakes = vi.hoisted(() => ({ isTauri: vi.fn(() => false), invoke: vi.fn() }));

vi.mock('@tauri-apps/api/core', () => ({ isTauri: fakes.isTauri, invoke: fakes.invoke }));

function probe(tauri: boolean, kind?: string | Error): SessionKindProbe {
  return {
    isTauri: () => tauri,
    invoke: () =>
      kind instanceof Error ? Promise.reject(kind) : Promise.resolve(kind ?? 'desktop'),
  };
}

describe('getSessionKind', () => {
  it('Tauri dışında web sayılır — komut çağrılmaz', async () => {
    const invoke = vi.fn();
    await expect(getSessionKind({ isTauri: () => false, invoke })).resolves.toBe('web');
    expect(invoke).not.toHaveBeenCalled();
  });

  it('kabuk gamescope bildirirse gamescope döner', async () => {
    await expect(getSessionKind(probe(true, 'gamescope'))).resolves.toBe('gamescope');
    await expect(getSessionKind(probe(true, 'bigpicture'))).resolves.toBe('bigpicture');
    await expect(getSessionKind(probe(true, 'bilinmeyen'))).resolves.toBe('desktop');
  });

  it("kabuk desktop ya da bilinmedik bir değer bildirirse desktop'a düşer", async () => {
    await expect(getSessionKind(probe(true, 'desktop'))).resolves.toBe('desktop');
    await expect(getSessionKind(probe(true, 'bilinmeyen'))).resolves.toBe('desktop');
  });

  it('komut reddedilirse desktop sayılır — eski kabukla geriye uyumlu', async () => {
    await expect(getSessionKind(probe(true, new Error('unknown command')))).resolves.toBe(
      'desktop',
    );
  });

  it("varsayılan sonda Tauri'nin isTauri ve invoke'unu kullanır", async () => {
    await expect(getSessionKind()).resolves.toBe('web');
    fakes.isTauri.mockReturnValue(true);
    fakes.invoke.mockResolvedValue('gamescope');
    await expect(getSessionKind()).resolves.toBe('gamescope');
    expect(fakes.invoke).toHaveBeenCalledWith('session_kind');
  });
});
