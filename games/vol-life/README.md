# VOL.LIFE

Parçacıklardan yaşamın, yaşamdan toplumun ve toplumdan tarihin ortaya çıktığı,
oynanmaktan çok **izlenen** bir yapay dünya. Oyuncu koşulları değiştirir, sonucu
sistem üretir.

Phaser 4 · TypeScript · Vite · `@volstudio/core`.

Monorepo geneli için [kök README](../../README.md).

## Durum

Paket **Adım 2 parçacık yaşamı** düzeyindedir: yavaş çevre alanlarının üstünde
altı türden 100 parçacık, toroidal dünyada yönlü çekim/itme fiziğiyle hareket
eder ve geçici kümeler kurar. SoA depo, counting-sort spatial hash, alanlar ve
snapshot/restore deterministiktir; Phaser yalnız render adaptöründedir. Henüz
organizma, enerji, yaşam döngüsü ya da AI yoktur.

Kabukta seçenekler çekmecesi (dil, kare hızı, dokunsal geri bildirim, ekran
yönü, masaüstünde görüntü kipi), native Android haptics, Android çıkış onayı,
açılış hata yüzeyi ve Tauri masaüstü/Android kabuğu var. İnşa sırası
[DESIGN.md](DESIGN.md) §13'te, bugünkü durum §16'da, açık işler
[TODO.md](TODO.md)'de.

## Çalıştırma

```bash
pnpm --filter @volstudio/vol-life dev                   # :5180
pnpm --filter @volstudio/vol-life build                 # web üretim derlemesi
pnpm --filter @volstudio/vol-life tauri:dev             # masaüstü kabuğu
pnpm --filter @volstudio/vol-life tauri:android:build   # Android APK
pnpm --filter @volstudio/vol-life benchmark:particles  # çekirdek p50/p95
pnpm --filter @volstudio/vol-life benchmark:particle-render # Chromium WebGL
```

Önizleme :5182'dedir. 5181 KULLANILMAZ — `devtools/vol-ui` e2e varsayılanıdır ve
çakışma `pnpm high`ı düşürür. Tüm tarifler `pnpm exec just --list`.

## Yapı

```
src/config/    Dünya, parçacık ve grafik ölçüleri — VERİ.
src/runtime/   sim/ Phaser'sızdır; render/ adaptördür; scene/ yalnız bağlamadır.
src/app/       Boot (i18n, tema, font, Phaser), tercih deposu, ekran yönü tercihi,
               depolama seçimi ve açılış hata yüzeyi.
src-tauri/     Masaüstü ve Android kabuğu (com.volstudio.life).
```

Ürün kararı, dünya modeli, ölçülmüş mimari sınırlar ve iptal edilen ilk
denemenin dersleri için [DESIGN.md](DESIGN.md).

## Lisans

[Apache License 2.0](../../LICENSE)
