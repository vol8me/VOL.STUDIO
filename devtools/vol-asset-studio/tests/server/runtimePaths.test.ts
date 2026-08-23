import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assetStudioCacheDirectory, resolveCacheRoot } from '../../server/runtimePaths.js';

describe('assetStudioCacheDirectory', () => {
  it('Linuxta XDG_CACHE_HOME altına düşer', () => {
    const directory = assetStudioCacheDirectory({ XDG_CACHE_HOME: '/xdg' }, 'linux');
    expect(directory).toBe(join('/xdg', 'vol-asset-studio'));
  });

  it('XDG tanımlı değilse ev dizinindeki .cache kullanılır', () => {
    const directory = assetStudioCacheDirectory({ HOME: '/home/kullanici' }, 'linux');
    expect(directory).toBe(join('/home/kullanici', '.cache', 'vol-asset-studio'));
  });

  it('macOS ve Windows kendi cache köklerini kullanır', () => {
    expect(assetStudioCacheDirectory({ HOME: '/Users/k' }, 'darwin')).toBe(
      join('/Users/k', 'Library', 'Caches', 'vol-asset-studio'),
    );
    expect(assetStudioCacheDirectory({ LOCALAPPDATA: 'C:\\Local' }, 'win32')).toBe(
      join('C:\\Local', 'vol-asset-studio', 'cache'),
    );
  });
});

describe('resolveCacheRoot', () => {
  it('cache repo dışındaysa onu kullanır', () => {
    const root = resolveCacheRoot('/repo', { XDG_CACHE_HOME: '/xdg' });
    expect(root).toBe(join('/xdg', 'vol-asset-studio'));
  });

  it('cache repo içine düşecekse geçici dizine kaçar — repo kirlenmez', () => {
    const root = resolveCacheRoot('/repo', { XDG_CACHE_HOME: '/repo/.cache' });
    expect(root).toBe(join(tmpdir(), 'vol-asset-studio', 'cache'));
  });
});
