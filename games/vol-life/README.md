# VOL.LIFE

Parçacıklardan yaşamın, yaşamdan toplumun ve toplumdan tarihin ortaya çıktığı,
oynanmaktan çok **izlenen** bir yapay dünya. Oyuncu koşulları değiştirir, sonucu
sistem üretir.

Phaser 4 · TypeScript · Vite · `@volstudio/core`.

Monorepo geneli için [kök README](../../README.md).

## Durum

Paket şu anda **zemin** hâlindedir: kapılardan geçen bir iskelet, dünya
ölçüleri ve durumu kaydedilebilir deterministik rastgelelik. Simülasyon —
alanlar, kuvvetler, organizma tespiti — henüz yazılmadı ve bu KASITLIDIR;
gerekçesi [DESIGN.md](DESIGN.md) §16'dadır.

## Çalıştırma

```bash
pnpm --filter @volstudio/vol-life dev       # :5180
pnpm --filter @volstudio/vol-life build     # web üretim derlemesi
```

Önizleme :5182'dedir. 5181 KULLANILMAZ — `devtools/vol-ui` e2e varsayılanıdır ve
çakışma `pnpm high`ı düşürür. Tüm tarifler `pnpm exec just --list`.

## Yapı

```
src/config/    Dünya ve grafik ölçüleri — VERİ. Runtime'da sihirli sayı yoktur.
src/runtime/   sim/ Phaser'ı import ETMEZ; scene/ yalnız bağlamadır.
src/app/       Boot (i18n, tema, font, Phaser).
```

Ürün kararı, dünya modeli, ölçülmüş mimari sınırlar ve iptal edilen ilk
denemenin dersleri için [DESIGN.md](DESIGN.md).

## Lisans

[Apache License 2.0](../../LICENSE)
