import { describe, expect, it, vi } from 'vitest';
import type { StoreIntegrityEvent } from '@volstudio/tauri-v2';
import { IntegrityFeed } from '@/app/IntegrityFeed';

describe('IntegrityFeed', () => {
  it('abone olmadan önce kaydedilen olaylar abone olunca geçmişten iletilir', () => {
    const feed = new IntegrityFeed();
    feed.record({ name: 'a.json', kind: 'recovered' });
    const listener = vi.fn<(event: StoreIntegrityEvent) => void>();
    feed.subscribe(listener);
    feed.record({ name: 'b.json', kind: 'reset' });
    expect(listener.mock.calls.map(([event]) => event.kind)).toEqual(['recovered', 'reset']);
  });

  it('abonelik bırakılınca yeni olay iletilmez', () => {
    const feed = new IntegrityFeed();
    const listener = vi.fn<(event: StoreIntegrityEvent) => void>();
    const off = feed.subscribe(listener);
    off();
    feed.record({ name: 'a.json', kind: 'reset' });
    expect(listener).not.toHaveBeenCalled();
  });
});
