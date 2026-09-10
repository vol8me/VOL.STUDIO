# VOL.STUDIO — iş listesi

> **TODO Disiplini:** Tamamlanan maddeler minimalleştirilerek `[x]` ile kapatılır ve
> dosyanın en sonundaki `## Kapatılanlar` bölümüne taşınır; aktif işler yukarıda
> temiz kalır. Sonraki agent'lar bu kuralı bozmaz.

Repo geneli işler; paket işleri paketin `TODO.md`sinde.
Aktif iş: VOL.LIFE Adım 1 — [games/vol-life/TODO.md](games/vol-life/TODO.md).

## Ertelenen

- **iOS/WKWebView MP3 fallback'i manuel** (`pnpm convert:ios`); iOS hedefe
  girdiğinde ses build'ine bağlanır.

## Kapatılanlar (2026-09-10 Denetim Düzeltmeleri)

- [x] **CORE headless export haritası:** `@volstudio/core/math`, `@volstudio/core/grid`, `@volstudio/core/collections` alt yolları açıldı; simülasyonların Phaser olmadan Node ortamında saf matematik/ızgara tüketmesi sağlandı (`core/package.json`, `core/src/math/index.ts`).
- [x] **`ViewportManager` serbest kamera koruması:** `applyToScene` metoduna `preserveCameraState` seçeneği ve kamera data bayrağı desteği eklendi; serbest gözlem kamerasının resize anında dünya merkezine ve varsayılan yakınlaştırmaya sıfırlanması engellendi (`ViewportManager.ts`, `viewportManager.test.ts`).
- [x] **VOL.LIFE çalışma zamanı denetim bulguları:** 5 runtime kusuru (RNG 0-durumu, DESTROY yaşam döngüsü, Android geri hareketi, HUD aria-label, tam ekran etiketi) ve yapılandırma borçları [games/vol-life/TODO.md](games/vol-life/TODO.md) içinde kapatıldı.
