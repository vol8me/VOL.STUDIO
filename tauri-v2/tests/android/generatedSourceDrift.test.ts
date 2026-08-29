import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `gen/android` ELLE DÜZENLENMİŞ üretilmiş kaynaktır — sessiz kayba karşı bekçi.
 *
 * Tauri'nin `android init` komutu bu ağacı yeniden üretir ve elle yapılan
 * düzenlemeleri ezer. Yön kilidi, sürükleyici tam ekran ve Android geri tuşu
 * Tauri yapılandırmasından ayarlanamadığı için (`tauri.conf.json` şeması
 * yalnız minSdk/versionCode taşır) bu üç davranış yalnızca burada yaşıyor.
 *
 * Kayıp SESSİZDİR: proje derlenir, APK üretilir, uygulama açılır — sadece
 * dikey döner, sistem çubukları görünür ve geri tuşu koşunun ortasında
 * uygulamayı kapatır. Hiçbir test düşmez, hiçbir tip hatası çıkmaz.
 *
 * Bu test o boşluğu kapatır: davranışların ANLAMINI değil, onları taşıyan
 * yapılandırma satırlarının VARLIĞINI doğrular. Bir `android init` sonrası
 * kapı kırmızıya döner ve düzenlemeler geri uygulanır.
 */
const ANDROID_ROOT = join(import.meta.dirname, '../../src-tauri/gen/android');

function read(relativePath: string): string {
  return readFileSync(join(ANDROID_ROOT, relativePath), 'utf8');
}

describe('Android üretilmiş kaynak sapması', () => {
  it('AndroidManifest yön kilidini korur', () => {
    const manifest = read('app/src/main/AndroidManifest.xml');

    // Arena sınırları görünür alanı birebir doldurur; dikey dönüş sahayı kırpar.
    expect(manifest).toContain('android:screenOrientation="sensorLandscape"');
  });

  it('AndroidManifest yapılandırma değişimlerini uygulamada tutar', () => {
    const manifest = read('app/src/main/AndroidManifest.xml');

    // Bu liste olmadan her döndürme/klavye olayı Activity'yi YENİDEN YARATIR:
    // koşu sıfırlanır. Phaser canvas'ı boyut değişimini kendi işler.
    for (const change of ['orientation', 'screenSize', 'keyboardHidden', 'uiMode']) {
      expect(manifest).toContain(change);
    }
  });

  it('AndroidManifest titreşim iznini korur', () => {
    const manifest = read('app/src/main/AndroidManifest.xml');

    // Haptik geri bildirim ayarlardan açılabiliyor; izin düşerse sessizce ölür.
    expect(manifest).toContain('android.permission.VIBRATE');
  });

  it('MainActivity sürükleyici tam ekranı kurar ve odakta yeniden uygular', () => {
    const activity = read('app/src/main/java/com/volstudio/game/MainActivity.kt');

    expect(activity).toContain('enableEdgeToEdge()');
    expect(activity).toContain('hide(WindowInsetsCompat.Type.systemBars())');
    // Yalnız onCreate'te gizlemek, ilk kesintiden sonra çubukları geri getirir.
    expect(activity).toContain('onWindowFocusChanged');
  });

  it('MainActivity Android geri tuşunu oyuna devreder', () => {
    const activity = read('app/src/main/java/com/volstudio/game/MainActivity.kt');

    // Wry'ın varsayılanı tek sayfalı uygulamada her geri basışında çıkış yapar.
    expect(activity).toContain('onBackPressedDispatcher.addCallback');
    expect(activity).toContain('vol:androidback');
  });

  it('paket kimliği Tauri identifier ile aynı kalır', () => {
    const activity = read('app/src/main/java/com/volstudio/game/MainActivity.kt');
    const config = JSON.parse(
      readFileSync(join(import.meta.dirname, '../../src-tauri/tauri.conf.json'), 'utf8'),
    ) as { identifier: string };

    // Kimlik ayrışırsa `adb install` çalışır ama derin bağlantı/imza akışı bozulur.
    expect(activity).toContain(`package ${config.identifier}`);
  });
});
