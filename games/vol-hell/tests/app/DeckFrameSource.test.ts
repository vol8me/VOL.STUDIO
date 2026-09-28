import { describe, expect, it } from 'vitest';
import { EventEmitter } from 'node:events';
import { DeckFrameSource } from '@/app/DeckFrameSource';

describe('DeckFrameSource', () => {
  it('gerçek kare aşamalarını ölçer; pause eski entity sürelerini taşımaz ve kaynakları kapatır', () => {
    const events = new EventEmitter();
    let now = 0;
    let phase = 'gameplay';
    const source = new DeckFrameSource({
      events,
      canvas: document.createElement('canvas'),
      readScene: () => ({ phase, metrics: { enemies: phase === 'gameplay' ? 20 : 0 } }),
      readAudio: () => 'running',
      now: () => now,
    });
    source.captureStages({ entities: 3, collision: 1 });
    events.emit('prestep');
    now = 5;
    events.emit('poststep');
    events.emit('prerender');
    now = 7;
    events.emit('postrender');
    expect(source.read()).toMatchObject({
      phase: 'gameplay',
      metrics: { enemies: 20, updateMs: 5, renderCpuMs: 2, entitiesMs: 3, audioState: 1 },
    });
    phase = 'pause';
    expect(source.read().metrics.entitiesMs).toBeUndefined();
    source.destroy();
    expect(events.eventNames()).toEqual([]);
  });

  it('yalnız bilinen Undo/Print kısayollarını içerik kaydetmeden sınıflar', () => {
    const shortcuts: unknown[] = [];
    const input = document.createElement('input');
    document.body.append(input);
    const source = new DeckFrameSource({
      events: new EventEmitter(),
      canvas: document.createElement('canvas'),
      readScene: () => ({ phase: 'settings', metrics: {} }),
      readAudio: () => 'running',
      onShortcut: (event) => shortcuts.push(event),
    });
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'p', ctrlKey: true, bubbles: true }),
    );
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'PrintScreen', bubbles: true }),
    );
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'private text', bubbles: true }));
    expect(shortcuts).toEqual([
      { shortcut: 'undo', target: 'editable', phase: 'settings', trusted: false, repeat: false },
      { shortcut: 'print', target: 'other', phase: 'settings', trusted: false, repeat: false },
      {
        shortcut: 'printscreen',
        target: 'other',
        phase: 'settings',
        trusted: false,
        repeat: false,
      },
    ]);
    source.destroy();
    input.remove();
  });
});
