# @volstudio/vol-asset-studio

Repodaki görsel, ses, font ve üretim belgelerini tek web yüzeyinde keşfeden
varlık çalışma ortamı. Metinden görsel üreteci DEĞİLDİR: diskte gerçekten
bulunanı indeksler, canlı değişikliği izler, türüne uygun önizleme sunar ve
düzenlenebilir olanı revizyon kontrollü kaydeder.

[English](README.en.md)

## Çalıştırma

```bash
pnpm --filter @volstudio/vol-asset-studio dev     # :5175
```

Kök `pnpm dev` bunu da açar. Üretim paketi ve yerel ağda yayın için
[DESIGN.md](DESIGN.md).

Sunucu başlangıçta geçici bir erişim anahtarını terminale yazar; anahtar web
yüzeyine bir kez girilir ve devamı `HttpOnly` oturum çereziyle çalışır.

## Ne yapar

- Repo köklerinden canlı katalog: arama, tür/sorun/Git durumu filtreleri, SSE
  ile artımlı güncelleme.
- Önizleme: PNG/JPEG/WebP/GIF/AVIF ve thumbnail, OGG/MP3/WAV/FLAC oynatma ve
  metadata, WOFF/WOFF2/TTF/OTF font örneği.
- **PNG editörü**: tile tabanlı piksel yüzeyi, katman/palet, undo/redo, atomik
  kayıt. Kayıt görünür katmanları BİRLEŞTİRİR; katman ayrımı ve geçmiş yalnız
  belge açıkken yaşar.
- **Ses editörü**: dalga formu, seçim, gain, trim, fade, normalize, reverse ve
  atomik OGG/WAV kaydı. MP3/FLAC incelenir, düzenleme için dönüşüm ister.
- `.volsprite.json` için salt-okunur VisualSynth inspector'ı.
- Referans arama, rename önizleme, kurtarılabilir çöp.

Animasyon oluşturma ve native sprite proje kaydı **kapsam dışıdır**.

## Yapılandırma

Kök [`asset-studio.json`](../../asset-studio.json) hangi klasörlerin katalogda
yer alacağını ve her kökün rolünü (`source`, `derived`, `shipped`, `readonly`)
tanımlar. Bilinmeyen alan, yinelenen kimlik ya da kaçak yol başlangıçta tek bir
hatayla reddedilir.

## Doğrulama

```bash
pnpm --filter @volstudio/vol-asset-studio test
```

Repo kapısı `pnpm high`. Ses metadata'sı `ffprobe` ister; `pnpm run doctor:env`
denetler.

## Lisans

[Apache License 2.0](../../LICENSE)
