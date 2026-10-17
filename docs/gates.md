# Kalite kapıları

Bileşimin tek kaynağı [justfile](../justfile), eşik/bütçe kaynağı
[quality.json](../quality.json)'dır. Bu belge çalışma ve kanıt sözleşmesidir;
geçmiş koşuların dökümü değildir. Ortam kurulumu [Windows](windows.md),
platform sınırları [denetim](monorepo-audit.md) sahibindedir.

## Birleşik kapılar

| Kapı      | Bileşim                                                                            |
| --------- | ---------------------------------------------------------------------------------- |
| `quick`   | `node-pin` `contract` `format-check` `typecheck` `lint` `lint-css`                 |
| `fast`    | `quick` `test`                                                                     |
| `high`    | `quick` `build` `bundle` `scaling` `audio-test` `rust` `coverage` `coverage-shape` |
| `signoff` | `high` `e2e` `coverage-audio` `audio-verify` `security-js` `security-rust`         |

Pre-commit `pnpm quick --index`, pre-push `pnpm high` çalıştırır; atlanmaz.
`high` E2E içermez. UI değişikliği push öncesinde `pnpm exec just ui-check`
ile yüzey/build + iki motorlu E2E'yi ayrıca kanıtlar; tam signoff aynı E2E'yi içerir.
Coverage zaten testleri çalıştırdığı için high içinde düz test tekrarı yoktur.

```bash
pnpm quick
pnpm high
pnpm high --fresh
pnpm high --json
pnpm high --verbose
pnpm exec just report high --json
pnpm exec just --list
```

`pnpm exec just <tarif>` önbelleksiz düz yoldur; pnpm birleşik kapısı
[gate.mjs](../scripts/quality/gate.mjs) ile sıralama, makbuz ve raporu yönetir.
`--json` stdout'ta yalnız JSON raporu bırakır; `--verbose` ile birlikte
kullanıldığında çocuk süreç günlükleri stderr'e akar.

## Signoff onayı ve kaynak bağı

Tam signoff yaklaşık bir saat makineyi kullanır ve E2E piksel temellerine
dokunabilir. [AGENTS](../AGENTS.md#kapılar-ve-kanıt) gereği açık kullanıcı
onayı gerekir; mevcut oturumdaki açık yetki yeniden sorulmaz. Onay yoksa
high yeşiliyle teslim edilir, signoff NOT-RUN yazılır. Onay istenirken
kanıtsız kalan aşama, high kapsamı, tahmini süre ve düşüşte ağaç durumu açıklanır.

Signoff bütün aşamaları taze çalıştırır. İlk düşüşte kalanlar NOT-RUN'dır;
tekrar gerekirse önce kök neden düzeltilir ve mevcut onayın kapsamı korunur.
Ağaç koşu sırasında değişirse kabul/makbuz yazılmaz. Başarılı kaydın kaynak
bağı, commit'i ve süresi yerel kapı önbelleğinde; sürümün teslim özeti annotated
Git etiketindedir. Eski kaynak sonucu yeni sürüme taşınmaz.

## Sıra, birimler ve makbuz

[gatePlan](../scripts/quality/gatePlan.mjs) statik aşamaları birlikte,
ağır/ölçümlü aşamaları tek tek çalıştırır. Build Rust'tan öncedir:
Tauri generate_context ön yüzü derleme sırasında okur. Her just aşaması
planda kayıtlıdır; birimler tarifin bütün işini karşılar.

| Aşama          | Birim ve eşzamanlılık                                                                  |
| -------------- | -------------------------------------------------------------------------------------- |
| contract       | node-test ve cli, iki bağımsız takım                                                   |
| typecheck/lint | aktif paketler ve paket dışı kod, en çok dört birim                                    |
| rust           | her aktif crate, ortak Cargo hedefi nedeniyle tek tek                                  |
| test/e2e       | aktif paketler tek tek                                                                 |
| vitrin E2E     | ana şeritte iki motor, motor başına en çok iki işçi; sessiz şerit motor motor tek işçi |

[gateCache](../scripts/quality/gateCache.mjs) dosya envanterini Git'ten,
içeriği ham disk baytından karmalar. Stage/commit/dal değişimi tek başına
girdiyi değiştirmez. CRLF filtresi, assume-unchanged veya skip-worktree
farklı disk baytını saklayamaz. Pre-commit öncesi ve sonrası indeks ile
sınanan çalışma ağacının tamamı aynıdır; kısmi sahneleme reddedilir.

Makbuz yalnız aynı girdiyi atlamak içindir; yok/bozuk/uyuşmayan makbuzda
aşama koşar. Kapsam [gateScope](../scripts/quality/gateScope.mjs), birimler
[gateUnits](../scripts/quality/gateUnits.mjs) sahibindedir:

- Repo okuyan yönetişim testleri bütün repo kapsamındadır.
- Paket kapanışı kendi kaynağını, aktif bağımlılıklarını, kök yapılandırmayı
  ve gerçekten başvurduğu ortak betikleri kapsar; gizli okumalar bekçilenir.
- Rust birimi kendi/geçişli path bağımlılıklarını, Cargo kökünü, Tauri ön
  yüzünü ve dosyadan okunan sürümü kapsar. Yeni dış okuma kapsam dışında kalamaz.
- node-pin, build, bundle, scaling, audio-test ve güvenlik zamana/çıktıya bağlıdır;
  önbelleksizdir. Signoff hiçbir geçiş makbuzundan atlamaz.

Kapı sırasında kaynak düzenlenmez. `--fresh` makbuzu yok sayar; yeni
başarılı sonucu yine yazar. `high --json` makine-okunur özet, insan
çıktısı stderr verir. Düşüşte tür/paket/sebep/günlük ve `tekrar:` komutu
bulunur; bütün birleşik kapı körlemesine yeniden başlatılmaz.

## Tekil aşamalar

| Aşama                                | Kanıt                                                                        |
| ------------------------------------ | ---------------------------------------------------------------------------- |
| node-pin                             | kesin Node/pnpm çalışma zamanı                                               |
| contract                             | workspace, sınır, kaynak, tip/katalog/i18n/tema, sürüm ve belge sözleşmeleri |
| typecheck/lint/lint-css/format-check | aktif kaynak, betik ve biçim                                                 |
| test/coverage/coverage-shape         | davranış, gerçek eşikler, büyük/az kapsanan dosyaların şekli                 |
| build/bundle                         | üretim build'i ve gzip level 9 app/vendor/CSS bütçesi                        |
| scaling                              | sürümlü ms/step raporunda girdi büyüme oranı                                 |
| rust                                 | aktif crate fmt/clippy/test; tek workspace/kilit                             |
| e2e                                  | üretim build'inde Chromium/WebKit davranışları                               |
| audio-test                           | Git farkından seçilen ses regresyonları; belirsizlikte tam takım             |
| coverage-audio/audio-verify          | tam ses kapsamı ve deterministik teknik yayın doğrulaması                    |
| security-js/security-rust            | güncel advisory, yama davranışı ve risk politikası                           |

Kaynak boyutu, kapsam ve timeout genel olarak gevşetilmez. Kapsam yalnız
çalıştırılabilir satırı olmayan dosyaları dışlar. Disk testleri gerçek geçici
dizindedir. Scaling mutlak cihaz hızı veya asimptotik kanıt değildir;
rapor sürümü/birim/seri/girdi paritesi bozuksa fail-closed davranır.

## Workspace ve belge bekçileri

[workspace-contract](../scripts/quality/cli/workspace-contract.mjs) bütün
ihlalleri birlikte raporlar. Ayrıntılı bekçi listesi çalıştırılabilir import
listesidir; ikinci elle dosya listesi tutulmaz.

Paketin gerekli test/tip/kapsam betiği bulunur; gerçek Vitest eşikleri
quality kaydıyla eşleşir. Bağımlılık tek yönlüdür, paketler exports'tan
girer. CORE/native/oyun/devtool ayrımı, modül döngüsü, public tip kilidi,
UI durum/test bağı, i18n anahtarları, plugin JS/Rust/izin üçlüsü, ürün kimliği,
ikonlar, asset kaynağı ve gerçek import yolları denetlenir.

Lifecycle aktif/frozen kapsamını belirler. Ürün kalitesi bekçileri frozen
kaynağı değiştirmez; lifecycle/blob/import/freeze bütünlüğü bütünü görür.
Aktif JS/Cargo/Tauri sürümleri [releaseVersion](../scripts/quality/releaseVersion.mjs)
ile eşleşir; yeni oyun üreticisi aynı kaynağı tüketir.

README amaç/başlangıç/yönlendirme, DESIGN gerekçe, docs teknik sözleşme,
TODO yalnız kalan iş ve kısa kapanış ölçütüdür. Referansın sahibi tek olur;
registry/config/export listeleri Markdown'a elle çoğaltılmaz. Teknik belge
bütçeleri ve giriş rolleri quality documentation kaydında kapılıdır.
Lisans/attribution ve gerçekten üretilmiş Markdown ayrı roldedir.
Yerel bağlantı, başlık, kaynak satırı ve komut geçerliliği de doğrulanır.

## Sayım, motor boşlukları ve risk

[countsReporter](../scripts/quality/countsReporter.mjs) motor/şerit başına
PASS/SKIP/FAIL/flaky sayar; Node takımları TAP özetinden okunur. Sayımlar
makbuzda da korunur. Bütçeli anahtarın satırı eksikse bilinmiyor diye düşer;
bütçesi olmayan anahtarın skip hakkı sıfırdır. Yeni skip, kapsam/eşik veya
floor düşüşü [thresholdRatchet](../scripts/quality/thresholdRatchet.mjs)
tarafından gerekçeli, dar istisna olmadan reddedilir.

| Anahtar                     | Mevcut Windows skip bütçesi | Neden                                                                         |
| --------------------------- | --------------------------- | ----------------------------------------------------------------------------- |
| vol-showcase/webkit/main    | 16                          | Rutin baseline toplayıcı + Chromium CDP dokunma/pano/axe/layout-shift kapsamı |
| vol-showcase/webkit/quiet   | 2                           | Chromium'a özgü iz                                                            |
| vol-showcase/chromium/main  | 1                           | İsteğe bağlı baseline toplayıcı                                               |
| vol-showcase/chromium/quiet | 1                           | WebKit'e özgü probe testi                                                     |
| vol-test/webkit             | 1                           | Bu motorda ses ölçüm yolu yok                                                 |
| vol-test/chromium           | 0                           | Atlama yok                                                                    |
| contract → node-test        | 2                           | Linux appimage aracı ve Deck SIGTERM /proc kapsamı                            |

Atlanan davranış o motorda kanıtlanmaz. Gerekçeler testte, tavanlar quality
skipBudget kaydındadır. Ölçülmemiş host için yeni bütçe uydurulmaz. E2E
hata/trace arşivi motor ve şerit başına yereldir; sonraki koşu önceki hatayı silmez.

Güvenlik [securityPolicy](../scripts/quality/securityPolicy.json) sahibindedir.
Rust zafiyeti/yanked her zaman düşer; unsound/unmaintained yalnız tam kayıtla
geçer. JS moderate ve üstü yalnız kayıtlı advisory + bağlı yama + gerçek
kurulu davranış sınamasıyla geçer. Bayat kayıt, eksik kanıt ve yeni advisory
reddedilir. Düzeltme yayımlanırsa muafiyet/yama gözden geçirilir; seviye düşürülmez.

## Ortam, süre ve temizlik

`pnpm run doctor:env` araçları ve host profilini denetler; cihaz kabulü değildir.
Son yerel kaynak turunda high yaklaşık 11 dakika, tam signoff yaklaşık bir
saat sürdü. Makbuz/yük/test kapsamı süreyi değiştirir; önceki süre bir SLA değildir.
Host yük uyarısı ölçüm sınırını gösterir, kullanıcı sürecini kapatmaz.

`pnpm exec just clean` üretilen JS/test/kapı çıktısını,
`pnpm exec just clean-all` ayrıca Rust hedefini temizler. Aktif cache'i
sırf yeniden üretmek kalite kanıtı değildir. Kullanıcı verisi, kaynak asset,
Pencil export'u, kanıt yedeği ve kişisel ayar temizlik hedefi değildir.
Ölçülmeyen platform, fiziksel sunum veya insan beğenisi PASS sayılmaz.
