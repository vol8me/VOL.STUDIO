import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as CoreModuleShape from '@volstudio/core';

type CoreModule = typeof CoreModuleShape;

const loadMusic = vi.fn();
const musicEngine = { id: 'fake-music-engine' };

vi.mock('@/app/services', () => ({
  gameAudio: {
    loadMusic: (...args: unknown[]) => loadMusic(...args) as Promise<boolean>,
    get music() {
      return musicEngine;
    },
  },
}));

const playlistStart = vi.fn();
const playlistStop = vi.fn();
let lastPlaylistOptions: { tracks: readonly string[] } | null = null;

// CORE'un TAMAMI değil yalnız `MusicPlaylist` değiştirilir: `@/config`
// aynı modülden `DEFAULT_MOVE_KEYS` okuyor, tam mock onu undefined yapardı.
vi.mock('@volstudio/core', async (importOriginal) => ({
  ...(await importOriginal<CoreModule>()),
  MusicPlaylist: class {
    isRunning = false;
    constructor(_engine: unknown, options: { tracks: readonly string[] }) {
      lastPlaylistOptions = options;
    }
    start() {
      this.isRunning = true;
      playlistStart();
    }
    stop() {
      this.isRunning = false;
      playlistStop();
    }
  },
}));

const { resetMenuMusicForTests, startMenuMusic } = await import('@/app/menuMusic');
const { menuTrackKeys, musicTracks } = await import('@/config');

/** Bekleyen mikro görevleri boşaltır — `startMenuMusic` void bir zincir kurar. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('menuMusic dayanıklılığı', () => {
  beforeEach(() => {
    resetMenuMusicForTests();
    lastPlaylistOptions = null;
    loadMusic.mockReset();
    playlistStart.mockReset();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    resetMenuMusicForTests();
    vi.restoreAllMocks();
  });

  it('tüm parçalar yüklenince listeyi hepsiyle kurar', async () => {
    loadMusic.mockResolvedValue(true);

    startMenuMusic();
    await flush();

    expect(playlistStart).toHaveBeenCalledOnce();
    expect(lastPlaylistOptions?.tracks).toEqual([...menuTrackKeys]);
  });

  it('tek bozuk parça bütün menü müziğini düşürmez', async () => {
    // Regresyon: `Promise.all` tek reddi bütün hazırlığa yayıyordu ve menü
    // müziği HİÇ çalmıyordu.
    loadMusic.mockImplementation((track: { id: string }) =>
      track.id === musicTracks[menuTrackKeys[0]].id
        ? Promise.reject(new Error('bozuk dosya'))
        : Promise.resolve(true),
    );

    startMenuMusic();
    await flush();

    expect(playlistStart).toHaveBeenCalledOnce();
    expect(lastPlaylistOptions?.tracks).toHaveLength(menuTrackKeys.length - 1);
    expect(lastPlaylistOptions?.tracks).not.toContain(menuTrackKeys[0]);
  });

  it('yüklenemeyen parça listeye SOKULMAZ — sessiz tur oluşmaz', async () => {
    // `loadMusic` false dönerse (stem yok) parça çalınabilir değildir.
    loadMusic.mockImplementation((track: { id: string }) =>
      Promise.resolve(track.id !== musicTracks[menuTrackKeys[1]].id),
    );

    startMenuMusic();
    await flush();

    expect(lastPlaylistOptions?.tracks).toEqual([menuTrackKeys[0]]);
  });

  it('geçici yükleme hatası sonraki denemeyi BOZMAZ', async () => {
    // Regresyon: reddedilmiş söz `loadPromise`te asılı kalıyor ve menü müziği
    // süreç ömrü boyunca bir daha denenmiyordu.
    loadMusic.mockRejectedValue(new Error('geçici ağ hatası'));

    startMenuMusic();
    await flush();
    expect(playlistStart).not.toHaveBeenCalled();

    loadMusic.mockResolvedValue(true);
    startMenuMusic();
    await flush();

    expect(playlistStart).toHaveBeenCalledOnce();
    expect(lastPlaylistOptions?.tracks).toEqual([...menuTrackKeys]);
  });

  it('zaten çalıyorsa yeniden başlatmaz', async () => {
    loadMusic.mockResolvedValue(true);

    startMenuMusic();
    await flush();
    startMenuMusic();
    await flush();

    expect(playlistStart).toHaveBeenCalledOnce();
  });

  it('yükleme sürerken sahne kapandıysa müziği başlatmaz', async () => {
    loadMusic.mockResolvedValue(true);

    startMenuMusic(() => false);
    await flush();

    expect(playlistStart).not.toHaveBeenCalled();
  });
});
