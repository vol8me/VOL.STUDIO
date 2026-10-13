import { beforeEach, expect, test, vi } from 'vitest';

const wiring = vi.hoisted(() => ({
  boot: vi.fn<() => Promise<void>>(),
  fatal: vi.fn(),
}));
vi.mock('@volstudio/core', () => ({ showFatalStartupError: wiring.fatal }));
vi.mock('../src/bootstrap/boot', () => ({ boot: wiring.boot }));
vi.mock('../src/net/installWebSocketShim', () => ({}));

beforeEach(() => {
  vi.resetModules();
  wiring.boot.mockReset();
  wiring.fatal.mockReset();
});

test('açılışı başlatır; hata yoksa kritik hata ekranı açılmaz', async () => {
  wiring.boot.mockResolvedValue(undefined);
  await import('../src/main');
  await Promise.resolve();
  expect(wiring.boot).toHaveBeenCalledTimes(1);
  expect(wiring.fatal).not.toHaveBeenCalled();
});

test('açılış hatası kritik hata ekranına gider', async () => {
  const failure = new Error('açılamadı');
  wiring.boot.mockRejectedValue(failure);
  await import('../src/main');
  await vi.waitFor(() => expect(wiring.fatal).toHaveBeenCalledTimes(1));
  expect(wiring.fatal).toHaveBeenCalledWith(expect.objectContaining({ error: failure }));
});
