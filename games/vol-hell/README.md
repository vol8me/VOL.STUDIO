# VOL-HELL

Dalga tabanlı taktiksel arena-survival. Bir koşu 20 dalga sürer; dalgalar arası
kart seçimi ve dükkân açılır, 10. dalgada elit, 20. dalgada boss gelir.

Phaser 4 · TypeScript · Vite · `@volstudio/core`. Monorepo'nun Vite kökü de bu
pakettir (`index.html`, `public/`).

[English](README.en.md) · [kök README](../../README.md)

## Çalıştırma

```bash
pnpm --filter @volstudio/vol-hell dev
```

Tüm tarifler `pnpm exec just --list`; paket script'leri `package.json`.

## İki sözleşme

**UI kendi bileşenini icat etmez.** Her arayüz parçası `@volstudio/core`'dan
gelir; canlı örnekler [devtools/vol-ui](../../devtools/vol-ui/README.md).

**Ses asset'i kanonik yayın kapısından üretilir.** Gönderilen `.ogg` dosyaları
manifestleriyle birlikte repoda durur. Kaynak iş, aile ve müzik belgeleri
`devtools/audio-synth/audio-{jobs,families,music}/` ağacındadır; değiştirilince
`audio:job` akışıyla yeniden yayımlanır. Ara formatlar (WAV, MP3) repoda
tutulmaz — [audio-synth](../../devtools/audio-synth/DESIGN.md),
[music-engine](../../core/docs/music-engine.md).

## Daha derine

Sistemler, denge, simülasyon/render sınırı, mobil ve grafik kalitesi kararları
için [DESIGN.md](DESIGN.md).

## Lisans

[Apache License 2.0](../../LICENSE)
