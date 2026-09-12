import { afterEach, describe, expect, it, vi } from 'vitest';
import { TauriHapticsDriver } from '../../src/platform/TauriHapticsDriver';

const fakes = vi.hoisted(() => ({
  impactFeedback: vi.fn().mockResolvedValue({ status: 'ok' }),
  notificationFeedback: vi.fn().mockResolvedValue({ status: 'ok' }),
  selectionFeedback: vi.fn().mockResolvedValue({ status: 'ok' }),
}));

vi.mock('@tauri-apps/plugin-haptics', () => fakes);

afterEach(() => {
  vi.clearAllMocks();
});

describe('TauriHapticsDriver', () => {
  it('dokunma ve seçim niyetlerini native geri bildirim türlerine eşler', async () => {
    const driver = new TauriHapticsDriver();

    await driver.play('tap');
    await driver.play('select');

    expect(fakes.impactFeedback).toHaveBeenCalledWith('light');
    expect(fakes.selectionFeedback).toHaveBeenCalledOnce();
  });

  it('sonuç niyetlerini native bildirim geri bildirimine eşler', async () => {
    const driver = new TauriHapticsDriver();

    await driver.play('success');
    await driver.play('warning');
    await driver.play('error');

    expect(fakes.notificationFeedback.mock.calls).toEqual([['success'], ['warning'], ['error']]);
  });
});
