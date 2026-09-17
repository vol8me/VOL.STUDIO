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

**Adım 3 araştırma kütüphanesi** (`scripts/morphology/`): örnekleme
(`GenomeSampler`, `seedingSampler`, `physicsSampler`), ölçüm
(`MorphologyMetrics`, `ClusterTracker`, `clusterShape`, `trajectory`,
`microOrbit`, `startupSurvival`), karar (`PhaseClassifier`, `qualification`,
`falsification`, `collapseDetector`, `longHorizon`), koşu altyapısı
(`ResearchHarness`, `seedRunner`, `workerPool`, `checkpoint`, `shards`,
`calibration`, `funnel`, `sourceState`) ve taşıma (`PromotionFlow`,
`promotionWriter`, `auditionCatalog`). Headless — Phaser import etmez.
Brute-force oracle testi spatial-hash/kernel yolunu all-pairs referansla
karşılaştırır. Seri ve worker yolu AYNI `runSeedUnit` fonksiyonunu çağırır;
eşitlik kurulumdan gelir.

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

**Araştırma hunisi.** Her aşama AYRI komuttur; hiçbiri öncekini örtük koşmaz ve
`--stage all` yoktur. Koşu başlamadan aday/seed/tick/worker ve KALİBRASYONDAN
hesaplanan tahmini süre yazılır; 10 dakikayı aşan koşu `--yes` ister, çıktı
dizini olmayan koşu reddedilir (checkpoint zorunlu).

```bash
pnpm --filter @volstudio/vol-life research:corpus     # corpus-v1 (bir kez üretilir)
pnpm --filter @volstudio/vol-life research:calibrate --out research-out
pnpm --filter @volstudio/vol-life research:broad      --out research-out
pnpm --filter @volstudio/vol-life research:shortlist  # faz/metrik çeşitliliğine göre 3–8 aday
pnpm --filter @volstudio/vol-life research:audition   # katalog → research-out
pnpm --filter @volstudio/vol-life research:long       # çoklu-seed uzun ufuk + perturbation
pnpm --filter @volstudio/vol-life research:accept --artefact <yol> --decision accepted
pnpm --filter @volstudio/vol-life research:promote --artefact <yol> --accepted-by <ad>
pnpm --filter @volstudio/vol-life research:canary     # promote edilmiş adayla üretim kanaryası
```

**Geliştirme audition'ı.** `research:audition` kısa listeyi
`research-out/audition-catalog.json`a yazar; dev sunucusu onu yalnız
geliştirmede servis eder ve üretim derlemesinde katalog BULUNMAZ (build
testiyle kanıtlı). Her aday `corpus-v1`in ilk üç tohumuyla gösterilir. Aday,
tohum ve kamera adayı geçişi seçenekler çekmecesindeki kabul oturumu
panelindedir — tablette adres çubuğu olmadığı için tek yol budur. Sorguyla da
çalışır: `?audition=2&seed=3&camera=cevik`.

Önizleme :5182'dedir. 5181 KULLANILMAZ — `devtools/vol-ui` e2e varsayılanıdır ve
çakışma `pnpm high`ı düşürür. Tüm tarifler `pnpm exec just --list`.

## Yapı

```
src/config/    Dünya, parçacık ve grafik ölçüleri — VERİ.
src/runtime/   sim/ Phaser'sızdır; render/ adaptördür; scene/ yalnız bağlamadır.
src/app/       Boot (i18n, tema, font, Phaser), tercih deposu, ekran yönü tercihi,
               depolama seçimi ve açılış hata yüzeyi.
src-tauri/     Masaüstü ve Android kabuğu (com.volstudio.life).
scripts/       morphology/ araştırma kütüphanesi, research/ koşu betikleri.
benchmarks/    fixtures/ korpus ve negatif kontrol, results/ ölçüm çıktıları.
research-out/  Araştırma çıktısı (katalog, checkpoint) — git'e girmez.
```

Ürün kararı, dünya modeli, ölçülmüş mimari sınırlar ve iptal edilen ilk
denemenin dersleri için [DESIGN.md](DESIGN.md).

## Lisans

[Apache License 2.0](../../LICENSE)
