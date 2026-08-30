import { MusicPlaylist } from '@volstudio/core';
import { gameAudio } from '@/app/services';
import { menuTrackKeys, musicConfig, musicTracks } from '@/config';
import type { MusicTrackId } from '@/config';

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
let loadPromise: Promise<readonly MusicTrackId[]> | null = null;

/**
 * Menü parçalarını bir kez yükler ve GERÇEKTEN yüklenenleri döner.
 *
 * İki dayanıklılık kuralı:
 *
 * 1. **Kısmi başarı yeterlidir.** Önce `Promise.all` kullanılıyordu: tek bir
 *    bozuk/eksik parça bütün hazırlığı reddediyor ve menü müziği hiç
 *    çalmıyordu. `allSettled` ile sağlam parçalar listeye girer, bozuk olan
 *    yalnızca kendi kaybını yaşar.
 * 2. **Başarısızlık kalıcı değildir.** Söz reddedilirse önbellek TEMİZLENİR.
 *    Eskiden reddedilmiş söz `loadPromise`te asılı kalıyordu ve sonraki her
 *    `startMenuMusic()` aynı reddi yeniden kullanıyordu: geçici bir ağ/disk
 *    hatası menü müziğini SÜREÇ ÖMRÜ BOYUNCA kapatıyordu.
 */
function ensureLoaded(): Promise<readonly MusicTrackId[]> {
  loadPromise ??= loadPlayableMenuTracks().catch((error: unknown) => {
    loadPromise = null;
    throw error;
  });
  return loadPromise;
}

async function loadPlayableMenuTracks(): Promise<readonly MusicTrackId[]> {
  const results = await Promise.allSettled(
    menuTrackKeys.map(async (key) => {
      const loaded = await gameAudio.loadMusic(musicTracks[key]);
      if (!loaded) throw new Error(`Menü parçası yüklenemedi: ${key}`);
      return key;
    }),
  );

  const playable: MusicTrackId[] = [];
  for (const [index, result] of results.entries()) {
    if (result.status === 'fulfilled') {
      playable.push(result.value);
      continue;
    }
    console.warn(`[menuMusic] Parça atlandı: ${menuTrackKeys[index]}`, result.reason);
  }

  // Hiçbiri yüklenemediyse önbelleğe alınacak bir başarı yok; bir sonraki
  // giriş yeniden denesin diye reddedilir (bkz. ensureLoaded).
  if (playable.length === 0) throw new Error('Hiçbir menü parçası yüklenemedi');
  return playable;
}

/**
 * Menü müziğini başlatır. Zaten çalıyorsa hiçbir şey yapmaz — bu sayede
 * Ayarlar'dan dönüşte parça baştan sarmaz.
 */
export function startMenuMusic(isStillActive: () => boolean = () => true): void {
  if (playlist?.isRunning) return;

  void ensureLoaded()
    .then((playableTracks) => {
      // Yükleme sürerken oyuncu oyuna başlamış olabilir; o zaman menü müziği
      // oyunun üstüne binmemeli.
      if (!isStillActive()) return;
      if (playlist?.isRunning) return;

      // Liste YALNIZCA çalınabilir parçalardan kurulur; yüklenmemiş bir id
      // playlist sırasına girerse o tur sessiz geçerdi.
      playlist ??= new MusicPlaylist(gameAudio.music, {
        tracks: playableTracks,
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
