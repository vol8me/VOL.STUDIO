import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MusicPlaylist } from '@/audio/music/playlist';

/**
 * Kullanıcı bildirimi: menüde hep aynı parça çalıyordu ve ikinci parça hiç
 * duyulmuyordu. Sebep parçanın `loop: true` olmasıydı — hiç bitmediği için
 * sıra ilerlemiyordu. Bu testler sıranın gerçekten ilerlediğini, boşluğun
 * uygulandığını ve karıştırmanın çalıştığını kilitler.
 */
function makeEngine() {
  const played: string[] = [];
  let endHandler: ((trackId: string) => void) | null = null;
  const engine = {
    play: vi.fn((trackId: string) => {
      played.push(trackId);
      return Promise.resolve();
    }),
    stop: vi.fn(),
    onTrackEnd: vi.fn((handler: (trackId: string) => void) => {
      endHandler = handler;
      return () => {
        endHandler = null;
      };
    }),
  };
  return {
    engine,
    played,
    /** Motorun doğal bitişini taklit eder. */
    endTrack(trackId: string) {
      endHandler?.(trackId);
    },
    hasEndHandler: () => endHandler !== null,
  };
}

/** Elle sürülen zamanlayıcı — gerçek beklemeye gerek kalmasın. */
function makeTimers() {
  const pending = new Map<number, () => void>();
  let id = 0;
  return {
    setTimer: (fn: () => void) => {
      pending.set(++id, fn);
      return id;
    },
    clearTimer: (handle: unknown) => pending.delete(handle as number),
    runAll() {
      const fns = [...pending.values()];
      pending.clear();
      for (const fn of fns) fn();
    },
    get pendingCount() {
      return pending.size;
    },
  };
}

describe('MusicPlaylist', () => {
  let e: ReturnType<typeof makeEngine>;
  let t: ReturnType<typeof makeTimers>;

  beforeEach(() => {
    e = makeEngine();
    t = makeTimers();
  });

  function build(tracks: string[], over: Record<string, unknown> = {}) {
    return new MusicPlaylist(e.engine, {
      tracks,
      gapMs: 3000,
      shuffle: false,
      setTimer: t.setTimer,
      clearTimer: t.clearTimer,
      ...over,
    });
  }

  it('boş liste reddedilir', () => {
    expect(() => build([])).toThrow(/en az bir parça/i);
  });

  it('start ilk parçayı çalar', async () => {
    const p = build(['a', 'b']);
    p.start();
    await Promise.resolve();
    expect(e.played).toEqual(['a']);
    expect(p.isRunning).toBe(true);
  });

  describe('sıra ilerlemesi — bildirilen hatanın çekirdeği', () => {
    it('parça bitince BOŞLUK sonrası sıradaki çalar', async () => {
      const p = build(['a', 'b']);
      p.start();
      await Promise.resolve();

      e.endTrack('a');
      // Boşluk dolmadan sıradaki BAŞLAMAZ.
      expect(e.played).toEqual(['a']);
      expect(t.pendingCount).toBe(1);

      t.runAll();
      await Promise.resolve();
      expect(e.played).toEqual(['a', 'b']);
    });

    it('liste tükenince başa döner — döngü ilerler', async () => {
      const p = build(['a', 'b']);
      p.start();
      await Promise.resolve();

      for (const id of ['a', 'b', 'a']) {
        e.endTrack(id);
        t.runAll();
        await Promise.resolve();
      }
      expect(e.played).toEqual(['a', 'b', 'a', 'b']);
    });

    it('başka bir sistemin parçası bitince sıra ilerlemez', async () => {
      // Savaş müziği menü listesinin dışında; onun bitişi listeyi kaydırmamalı.
      const p = build(['a', 'b']);
      p.start();
      await Promise.resolve();

      e.endTrack('combat-track');
      expect(t.pendingCount).toBe(0);
      t.runAll();
      await Promise.resolve();
      expect(e.played).toEqual(['a']);
    });
  });

  describe('karıştırma', () => {
    it('shuffle açıkken sıra rastgelelik kaynağına göre değişir', async () => {
      // random() = 0 -> Fisher-Yates son elemanı başa taşır.
      const p = new MusicPlaylist(e.engine, {
        tracks: ['a', 'b', 'c'],
        shuffle: true,
        random: () => 0,
        setTimer: t.setTimer,
        clearTimer: t.clearTimer,
      });
      p.start();
      await Promise.resolve();
      expect(e.played[0]).not.toBe('a');
    });

    it('bozuk rastgelelik kaynağı listeyi çökertmez', async () => {
      const p = new MusicPlaylist(e.engine, {
        tracks: ['a', 'b', 'c'],
        shuffle: true,
        random: () => Number.NaN,
        setTimer: t.setTimer,
        clearTimer: t.clearTimer,
      });
      p.start();
      await Promise.resolve();
      expect(e.played).toHaveLength(1);
      expect(['a', 'b', 'c']).toContain(e.played[0]);
    });

    it('yeni tur önceki turun son parçasıyla başlamaz', async () => {
      const p = new MusicPlaylist(e.engine, {
        tracks: ['a', 'b'],
        shuffle: true,
        random: () => 0.99,
        setTimer: t.setTimer,
        clearTimer: t.clearTimer,
      });
      p.start();
      await Promise.resolve();

      // İki parçayı da tüket; üçüncü çalınan, ikincinin tekrarı olmamalı.
      e.endTrack(e.played[0]);
      t.runAll();
      await Promise.resolve();
      e.endTrack(e.played[1]);
      t.runAll();
      await Promise.resolve();

      expect(e.played[2]).not.toBe(e.played[1]);
    });
  });

  describe('durdurma', () => {
    it('stop motoru durdurur ve bekleyen boşluğu iptal eder', async () => {
      const p = build(['a', 'b']);
      p.start();
      await Promise.resolve();
      e.endTrack('a');
      expect(t.pendingCount).toBe(1);

      p.stop();
      expect(e.engine.stop).toHaveBeenCalled();
      expect(t.pendingCount).toBe(0);
      expect(p.isRunning).toBe(false);

      t.runAll();
      await Promise.resolve();
      expect(e.played).toEqual(['a']);
    });

    it('stop bitiş aboneliğini kaldırır', async () => {
      const p = build(['a', 'b']);
      p.start();
      await Promise.resolve();
      expect(e.hasEndHandler()).toBe(true);
      p.stop();
      expect(e.hasEndHandler()).toBe(false);
    });

    it('durdurulduktan sonra bitiş bildirimi sırayı ilerletmez', async () => {
      const p = build(['a', 'b']);
      p.start();
      await Promise.resolve();
      p.stop();
      e.endTrack('a');
      t.runAll();
      await Promise.resolve();
      expect(e.played).toEqual(['a']);
    });

    it('iki kez start çağrılırsa baştan sarmaz', async () => {
      const p = build(['a', 'b']);
      p.start();
      await Promise.resolve();
      p.start();
      await Promise.resolve();
      expect(e.played).toEqual(['a']);
    });
  });

  it('skip boşluk beklemeden sıradakine geçer', async () => {
    const p = build(['a', 'b']);
    p.start();
    await Promise.resolve();
    p.skip();
    await Promise.resolve();
    expect(e.played).toEqual(['a', 'b']);
  });

  it('çalınamayan parça atlanır, liste durmaz', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    e.engine.play.mockImplementationOnce(() => Promise.reject(new Error('decode failed')));

    const p = build(['a', 'b']);
    p.start();
    await Promise.resolve();
    await Promise.resolve();

    t.runAll();
    await Promise.resolve();
    expect(e.played).toContain('b');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('onTrackChange her parça değişiminde bildirir', async () => {
    const seen: string[] = [];
    const p = build(['a', 'b'], { onTrackChange: (id: string) => seen.push(id) });
    p.start();
    await Promise.resolve();
    e.endTrack('a');
    t.runAll();
    await Promise.resolve();
    expect(seen).toEqual(['a', 'b']);
  });
});
