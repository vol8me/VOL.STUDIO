import { describe, expect, it, vi } from 'vitest';
import { SteamInputActionSets } from '@/app/steamInputActionSets';

describe('Steam Input aksiyon seti sahibi', () => {
  it('manifest ve input hazırsa menü/oyun geçişini birer kez uygular', async () => {
    const status = vi
      .fn()
      .mockResolvedValue({ available: true, inputReady: true, manifestOk: true });
    const activate = vi.fn().mockResolvedValue(1);
    const owner = new SteamInputActionSets({ status, activate });
    owner.tick('Menu', 0);
    await owner.flush();
    owner.tick('Menu', 16);
    owner.tick('Gameplay', 32);
    await owner.flush();
    expect(activate.mock.calls).toEqual([['Menu'], ['Gameplay']]);
    expect(status).toHaveBeenCalledOnce();
  });

  it('manifest reddedilince native eylemi çağırmaz', async () => {
    const activate = vi.fn().mockResolvedValue(1);
    const owner = new SteamInputActionSets({
      status: () => Promise.resolve({ available: true, inputReady: true, manifestOk: false }),
      activate,
    });
    owner.tick('Gameplay', 0);
    await owner.flush();
    expect(activate).not.toHaveBeenCalled();
  });

  it('Steam başlangıçta hazır değilse daha sonra durumu yeniden yoklar', async () => {
    const status = vi
      .fn()
      .mockResolvedValueOnce({ available: false, inputReady: false, manifestOk: null })
      .mockResolvedValue({ available: true, inputReady: true, manifestOk: true });
    const activate = vi.fn().mockResolvedValue(1);
    const owner = new SteamInputActionSets({ status, activate });
    owner.tick('Menu', 0);
    await owner.flush();
    owner.tick('Menu', 1000);
    await owner.flush();
    expect(status).toHaveBeenCalledOnce();
    owner.tick('Menu', 5000);
    await owner.flush();
    expect(status).toHaveBeenCalledTimes(2);
    expect(activate).toHaveBeenCalledWith('Menu');
  });

  it('geç bağlanan kolda sınırlı aralıkla yeniden dener', async () => {
    const activate = vi.fn().mockResolvedValueOnce(0).mockResolvedValue(1);
    const owner = new SteamInputActionSets({
      status: () => Promise.resolve({ available: true, inputReady: true, manifestOk: true }),
      activate,
    });
    owner.tick('Menu', 0);
    await owner.flush();
    owner.tick('Menu', 16);
    await owner.flush();
    expect(activate).toHaveBeenCalledOnce();
    owner.tick('Menu', 1000);
    await owner.flush();
    owner.tick('Gameplay', 1016);
    await owner.flush();
    expect(activate.mock.calls).toEqual([['Menu'], ['Menu'], ['Gameplay']]);
  });

  it('aynı ekranda kol değişince aksiyon setini yeni kola yeniden uygular', async () => {
    const status = vi
      .fn()
      .mockResolvedValue({ available: true, inputReady: true, manifestOk: true });
    const activate = vi.fn().mockResolvedValue(1);
    const owner = new SteamInputActionSets({ status, activate });
    owner.tick('Menu', 0);
    await owner.flush();
    owner.invalidate();
    owner.tick('Menu', 100);
    await owner.flush();
    expect(activate).toHaveBeenCalledTimes(2);
  });

  it('WebView kol olayı kaçarsa etkin seti aralıklı yeniden uygular', async () => {
    const activate = vi.fn().mockResolvedValue(1);
    const owner = new SteamInputActionSets({
      status: () => Promise.resolve({ available: true, inputReady: true, manifestOk: true }),
      activate,
    });
    owner.tick('Gameplay', 0);
    await owner.flush();
    owner.tick('Gameplay', 4999);
    await owner.flush();
    expect(activate).toHaveBeenCalledOnce();
    owner.tick('Gameplay', 5000);
    await owner.flush();
    expect(activate).toHaveBeenCalledTimes(2);
  });
});
