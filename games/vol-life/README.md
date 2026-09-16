# VOL.LIFE

Parçacıklardan yaşamın, yaşamdan toplumun ve toplumdan tarihin ortaya çıktığı,
oynanmaktan çok **izlenen** bir yapay dünya. Oyuncu koşulları değiştirir, sonucu
sistem üretir.

Phaser 4 · TypeScript · Vite · `@volstudio/core`.

Monorepo geneli için [kök README](../../README.md).

## Durum

Paket **Particle Substrate v2** ve **Adım 3 araştırma kütüphanesi iskeleti** düzeyindedir.
SoA depo, counting-sort spatial hash, alanlar, world-instance seed ve
snapshot/restore korunur; Phaser yalnız render adaptöründedir.

**Uygulanmış substrate**: `SubstrateConfig`, `PhysicsGenome`, `PairForceKernel`
(generalized multi-band directional), 512 kapasiteli `ParticleStore` (aktif/pasif
slot), `ParticleSpatialHash` (yalnız aktif), organik `HabitatSDF`/`WorldDomain`,
`VoidSink` (geri dönüşsüz deaktivasyon), `MatterReservoir`, `InitialMatterSeeder`
(patch+cloud), v4 snapshot codec, çok bantlı field güncelleme, alt sistem başına
adlandırılmış RNG akışları, camera-domain handling, Void-death rendering.

**Adım 3 araştırma kütüphanesi** (`scripts/morphology/`): `GenomeSampler`,
`MorphologyMetrics`, `ClusterTracker`, `PhaseClassifier`, `ResearchHarness`
(broad→refinement→qualification), `PerturbationSystem`, `Shards`,
`QualificationArtefact`, `PromotionFlow`, CLI. Headless — Phaser import etmez.
Brute-force oracle testi spatial-hash/kernel yolunu all-pairs referansla
karşılaştırır. Kütüphane iskelettir, qualification düzeyinde değildir; P0
düzeltmeleri [TODO.md](TODO.md)'dedir.

Eski 100 parçacıklı triangular fizik ve dikdörtgen çarpışma duvarı negatif
baseline olarak korunur, ürün kabulü değildir. Qualified aday henüz çıkmamıştır;
araştırma kütüphanesi production'a aday taşımamıştır. Organizma, enerji, yaşam
döngüsü ve akıl katmanı yoktur (Adım 4+ blokeli).

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
