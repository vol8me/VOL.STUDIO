import type { SaveManager } from '@volstudio/core';
import { createSaveManager } from '@/app/storage';
import { AudioSettings } from '@/app/AudioSettings';
import { GameAudio } from '@/app/GameAudio';
import { GameStats } from '@/app/GameStats';

/**
 * Uygulama genelindeki tekil servisler.
 *
 * Bu modül sahne veya entity import ETMEZ — dairesel bağımlılığı kıran nokta
 * burası. Önceden servisler `bootstrap.ts` içinde yaşıyordu; bootstrap sahneleri
 * import ederken sahneler ve entity'ler de bootstrap'tan `gameAudio` çekiyordu.
 * Bu döngü top-level `await` ile birleşince kırılgan bir yükleme sırası
 * yaratıyordu ve `Bullet` gibi küçük bir sınıfı izole test etmek tüm açılış
 * zincirini (i18n, storage, Web Audio) ayağa kaldırmayı gerektiriyordu.
 *
 * Bağlamalar `let` çünkü kurulum `initServices()` içinde yapılır: `GameAudio`
 * ctor'u Web Audio desteklenmiyorsa fırlatır ve bunun bootstrap'ın hata
 * ekranıyla yakalanabilmesi gerekir. ESM canlı bağlaması sayesinde geç atama
 * tüm tüketicilerde görünür; sahne metotları modül değerlendirmesinden sonra
 * çalıştığı için güvenlidir.
 */
export let saveManager: SaveManager;
export let audioSettings: AudioSettings;
export let gameStats: GameStats;
export let gameAudio: GameAudio;

let initialized = false;

/**
 * Servisleri kurar. Yalnızca açılışta (bootstrap) çağrılır; tekrar çağrılması
 * güvenlidir. Web Audio desteklenmiyorsa fırlatır.
 */
export function initServices(): void {
  if (initialized) return;

  saveManager = createSaveManager();
  audioSettings = new AudioSettings(saveManager);
  gameStats = new GameStats(saveManager);
  gameAudio = new GameAudio(audioSettings);

  initialized = true;
}

/** Kayıtlı ayar ve istatistikleri depodan yükler. */
export async function loadPersistedState(): Promise<void> {
  // İkisi birbirinden bağımsız; Tauri store'da her okuma bir IPC turu olduğu
  // için seri beklemek gereksiz gecikme yaratıyordu.
  await Promise.all([audioSettings.load(), gameStats.load()]);
}
