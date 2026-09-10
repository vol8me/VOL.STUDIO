# VOL.LIFE

Parçacıklardan yaşamın, yaşamdan toplumun ve toplumdan tarihin ortaya çıktığı,
oynanmaktan çok **izlenen** bir yapay dünya. Oyuncu koşulları değiştirir, sonucu
sistem üretir.

Phaser 4 · TypeScript · Vite · `@volstudio/core`.

Monorepo geneli için [kök README](../../README.md).

## Durum

Paket şu anda **zemin ve kabuk** hâlindedir: kapılardan geçen bir iskelet, dünya
ölçüleri, durumu kaydedilebilir deterministik rastgelelik ve kabuk (HUD, çıkış
onayı, Tauri masaüstü ve Android). Simülasyon — alanlar, kuvvetler, organizma
tespiti — henüz yazılmadı ve bu KASITLIDIR. İnşa sırası
[DESIGN.md](DESIGN.md) §13'te, bugünkü durum §16'da, açık işler
[TODO.md](TODO.md)'de.

## Çalıştırma

```bash
pnpm --filter @volstudio/vol-life dev                   # :5180
pnpm --filter @volstudio/vol-life build                 # web üretim derlemesi
pnpm --filter @volstudio/vol-life tauri:dev             # masaüstü kabuğu
pnpm --filter @volstudio/vol-life tauri:android:build   # Android APK
```

Önizleme :5182'dedir. 5181 KULLANILMAZ — `devtools/vol-ui` e2e varsayılanıdır ve
çakışma `pnpm high`ı düşürür. Tüm tarifler `pnpm exec just --list`.

## Yapı

```
src/config/    Dünya ve grafik ölçüleri — VERİ. Runtime'da sihirli sayı yoktur.
src/runtime/   sim/ Phaser'ı import ETMEZ; scene/ yalnız bağlamadır; ui/ kabuktur.
src/app/       Boot (i18n, tema, font, Phaser).
src-tauri/     Masaüstü ve Android kabuğu (com.volstudio.life).
```

Ürün kararı, dünya modeli, ölçülmüş mimari sınırlar ve iptal edilen ilk
denemenin dersleri için [DESIGN.md](DESIGN.md).

## Lisans

[Apache License 2.0](../../LICENSE)
