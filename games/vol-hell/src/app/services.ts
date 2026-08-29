import {
  LocalServerTransport,
  createDiagnostics,
  isDiagnosticsEnabled,
  setHapticsEnabled,
  type Diagnostics,
  type SaveManager,
} from '@volstudio/core';
import { createSaveManager } from '@/app/storage';
import { AudioSettings } from '@/app/AudioSettings';
import { GameAudio } from '@/app/GameAudio';
import { GameStats } from '@/app/GameStats';
import { VideoSettings } from '@/app/VideoSettings';

/**
 * Uygulama genelindeki tekil servisler.
 *
 * Bu modül sahne veya entity import ETMEZ — dairesel bağımlılığı kıran nokta.
 * Bağlamalar `let` ile tanımlanır ve `initServices()` içinde kurulur: `GameAudio`
 * ctor'u Web Audio desteklenmiyorsa fırlatır; geç atama ESM canlı bağlaması
 * sayesinde tüm tüketicilerde görünür. Sahne metotları modül değerlendirmesinden
 * sonra çalıştığı için güvenlidir.
 */
export let saveManager: SaveManager;
export let audioSettings: AudioSettings;
export let gameStats: GameStats;
export let gameAudio: GameAudio;
export let videoSettings: VideoSettings;

/**
 * Ölçüm örneği — `?debug`/`?perf` yoksa `null`.
 *
 * Tek örnek tercihi oyunun kararıdır ve bu modülde, diğer uygulama
 * servislerinin yanında durur. Yerel hata ayıklama sunucusunun adresi de
 * burada: CORE "sunucu nerede?" sormaz.
 */
export let diagnostics: Diagnostics | null = null;

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
  videoSettings = new VideoSettings(saveManager);
  gameAudio = new GameAudio(audioSettings);
  diagnostics = isDiagnosticsEnabled()
    ? createDiagnostics({
        gameId: 'vol-hell',
        transport: new LocalServerTransport({ url: 'http://127.0.0.1:9876/debug' }),
      })
    : null;

  initialized = true;
}

/** Kayıtlı ayar ve istatistikleri depodan yükler. */
export async function loadPersistedState(): Promise<void> {
  // İkisi bağımsız; Tauri store'da her okuma bir IPC turu olduğu için
  // paralel yüklemek gecikmeyi azaltır.
  await Promise.all([audioSettings.load(), gameStats.load(), videoSettings.load()]);

  // CORE'un titreşim anahtarı varsayılan olarak KAPALIDIR; oyunun kayıtlı
  // tercihi yüklendikten sonra bir kez uygulanır ve sonraki her değişiklikte
  // izlenir. Tek yerde bağlanması, her çağrı yerinin ayarı sorgulamasını
  // gereksiz kılar (bkz. core/src/platform/haptics.ts).
  setHapticsEnabled(audioSettings.isHapticsEnabled());
  audioSettings.onChange((data) => setHapticsEnabled(data.hapticsEnabled));
}
