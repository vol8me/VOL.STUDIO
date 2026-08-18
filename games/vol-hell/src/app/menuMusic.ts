import { MusicPlaylist } from '@volstudio/core';
import { gameAudio } from '@/app/services';
import { menuTrackKeys, musicConfig, musicTracks } from '@/config';

/**
 * Ana menü müzik listesi.
 *
 * Sahnenin DIŞINDA yaşar: menüden Ayarlar'a geçilip geri dönüldüğünde müzik
 * kesilmemeli, ama sahne örneği bu arada yıkılıp yeniden kuruluyor. Liste
 * sahneye ait olsaydı her geçişte baştan başlardı.
 *
 * Davranış: parçalar her açılışta karıştırılır, biri bitince `menu.gapMs`
 * kadar sessizlikten sonra sıradaki başlar, liste tükenince yeniden
 * karıştırılıp devam eder.
 */
let playlist: MusicPlaylist | null = null;
let loadPromise: Promise<void> | null = null;

/** Menü parçalarını bir kez yükler; sonraki çağrılar aynı sözü paylaşır. */
function ensureLoaded(): Promise<void> {
  loadPromise ??= Promise.all(
    menuTrackKeys.map((key) => gameAudio.loadMusic(musicTracks[key])),
  ).then(() => undefined);
  return loadPromise;
}

/**
 * Menü müziğini başlatır. Zaten çalıyorsa hiçbir şey yapmaz — bu sayede
 * Ayarlar'dan dönüşte parça baştan sarmaz.
 */
export function startMenuMusic(isStillActive: () => boolean = () => true): void {
  if (playlist?.isRunning) return;

  void ensureLoaded()
    .then(() => {
      // Yükleme sürerken oyuncu oyuna başlamış olabilir; o zaman menü müziği
      // oyunun üstüne binmemeli.
      if (!isStillActive()) return;
      if (playlist?.isRunning) return;

      playlist ??= new MusicPlaylist(gameAudio.music, {
        tracks: menuTrackKeys,
        gapMs: musicConfig.menu.gapMs,
        fadeInSec: musicConfig.menu.fadeInSec,
        fadeOutSec: musicConfig.menu.stopFadeSec,
        shuffle: true,
      });
      playlist.start();
    })
    .catch((error: unknown) => {
      console.warn('[menuMusic] Menü müziği yüklenemedi:', error);
    });
}

/** Menü müziğini durdurur (oyuna geçiş, çıkış). */
export function stopMenuMusic(): void {
  playlist?.stop();
}

/** Menü müziği şu an çalıyor mu? */
export function isMenuMusicRunning(): boolean {
  return playlist?.isRunning === true;
}

/** Testler için: modül durumunu sıfırlar. */
export function resetMenuMusicForTests(): void {
  playlist?.stop();
  playlist = null;
  loadPromise = null;
}
