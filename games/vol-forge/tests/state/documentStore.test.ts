import { describe, it, expect, vi } from 'vitest';
import type { SpriteDoc } from '@volstudio/core/visual';
import { DocumentStore } from '../../src/state/DocumentStore';

const BASE = { schemaVersion: 1, seed: 1 } as unknown as SpriteDoc;
const withSeed = (seed: number): SpriteDoc => ({ ...BASE, seed }) as SpriteDoc;

/** Test saatini elle ilerletir — birleştirme penceresi zamana bağlı. */
function clock(start = 0): { now: () => number; advance: (ms: number) => void } {
  let time = start;
  return { now: () => time, advance: (ms) => (time += ms) };
}

describe('belge deposu', () => {
  it('aynı referansı yeniden atamak bir şey yapmaz', () => {
    const store = new DocumentStore(BASE);
    const listener = vi.fn();
    store.subscribe(listener);
    store.set(BASE);
    expect(listener).not.toHaveBeenCalled();
    expect(store.canUndo).toBe(false);
  });

  it('değişiklik dinleyicilere yayılır', () => {
    const store = new DocumentStore(BASE);
    const listener = vi.fn();
    store.subscribe(listener);
    store.set(withSeed(2));
    expect(listener).toHaveBeenCalledWith(store.get(), {});
  });

  it('abonelik bırakılabilir', () => {
    const store = new DocumentStore(BASE);
    const listener = vi.fn();
    const off = store.subscribe(listener);
    off();
    store.set(withSeed(2));
    expect(listener).not.toHaveBeenCalled();
  });

  it('update mevcut belgeden yenisini türetir', () => {
    const store = new DocumentStore(BASE);
    store.update((doc) => ({ ...doc, seed: doc.seed + 5 }) as SpriteDoc);
    expect(store.get().seed).toBe(6);
  });
});

describe('geri al / yinele', () => {
  it('adım adım geri alır ve yineler', () => {
    const store = new DocumentStore(BASE);
    store.set(withSeed(2));
    store.set(withSeed(3));

    expect(store.undoDepth).toBe(2);
    expect(store.undo()).toBe(true);
    expect(store.get().seed).toBe(2);
    expect(store.undo()).toBe(true);
    expect(store.get().seed).toBe(1);
    expect(store.undo()).toBe(false);

    expect(store.redo()).toBe(true);
    expect(store.get().seed).toBe(2);
  });

  it('yeni değişiklik İLERİ geçmişi siler', () => {
    const store = new DocumentStore(BASE);
    store.set(withSeed(2));
    store.undo();
    expect(store.canRedo).toBe(true);

    store.set(withSeed(9));
    expect(store.canRedo).toBe(false);
    expect(store.get().seed).toBe(9);
  });

  it('yığın sınırda EN ESKİ adımı düşürür', () => {
    const store = new DocumentStore(BASE, { limit: 3 });
    for (let i = 2; i <= 8; i++) store.set(withSeed(i));

    expect(store.undoDepth).toBe(3);
    // Üç adım geri gidilebilir, dördüncüsü yok.
    expect(store.undo() && store.undo() && store.undo()).toBe(true);
    expect(store.undo()).toBe(false);
  });
});

describe('kaydırıcı sürüklemesi TEK adıma iner', () => {
  it('aynı anahtarla pencere içinde gelen değişiklikler birleşir', () => {
    const time = clock();
    const store = new DocumentStore(BASE, { now: time.now, coalesceMs: 400 });

    store.set(withSeed(2), { coalesceKey: 'layers/0/source/r' });
    time.advance(50);
    store.set(withSeed(3), { coalesceKey: 'layers/0/source/r' });
    time.advance(50);
    store.set(withSeed(4), { coalesceKey: 'layers/0/source/r' });

    // Yüz değişiklik değil, TEK adım: sürükleme öncesi durum korunur.
    expect(store.undoDepth).toBe(1);
    store.undo();
    expect(store.get().seed).toBe(1);
  });

  it('pencere kapanınca yeni adım açılır', () => {
    const time = clock();
    const store = new DocumentStore(BASE, { now: time.now, coalesceMs: 400 });

    store.set(withSeed(2), { coalesceKey: 'r' });
    time.advance(500);
    store.set(withSeed(3), { coalesceKey: 'r' });

    expect(store.undoDepth).toBe(2);
  });

  it('FARKLI anahtar her zaman yeni adım açar', () => {
    const time = clock();
    const store = new DocumentStore(BASE, { now: time.now });

    store.set(withSeed(2), { coalesceKey: 'r' });
    store.set(withSeed(3), { coalesceKey: 'center' });
    expect(store.undoDepth).toBe(2);
  });

  it('anahtarsız değişiklik hiç birleşmez', () => {
    const store = new DocumentStore(BASE);
    store.set(withSeed(2));
    store.set(withSeed(3));
    expect(store.undoDepth).toBe(2);
  });

  it('geri alma birleştirme zincirini KIRAR', () => {
    // Geri alıp aynı kaydırıcıya dokunmak yeni bir adım açmalı, yoksa
    // kullanıcı geri aldığı adımı sessizce yeniden yazar.
    const time = clock();
    const store = new DocumentStore(BASE, { now: time.now });

    store.set(withSeed(2), { coalesceKey: 'r' });
    store.undo();
    store.set(withSeed(5), { coalesceKey: 'r' });

    expect(store.undoDepth).toBe(1);
    store.undo();
    expect(store.get().seed).toBe(1);
  });
});
