# Kalite kapıları

Kapılar `just` ile **localde** koşar. GitHub yalnız source control, PR ve
release içindir; CI runner yoktur.

| Seviye       | Komut                        | Ne yapar                                                       |
| ------------ | ---------------------------- | -------------------------------------------------------------- |
| Pre-commit   | `pnpm quick`                 | sözleşme, format, typecheck, lint (~45 sn)                     |
| Push öncesi  | `pnpm high`                  | quick + CSS lint + coverage + build + bundle + ölçekleme + E2E |
| Release      | `pnpm signoff`               | high + Chromium/Firefox E2E + Rust + ses tazeliği              |
| Ortam        | `pnpm run doctor:env`        | Node, pnpm, Rust, just, FFmpeg, Tauri bağımlılıkları           |
| Cihaz ölçümü | `pnpm benchmark:device`      | Bağlı Android'de açılış/kare/bellek — **kapı DEĞİL**           |
| Rapor        | `pnpm exec just report high` | Kapıyı koşar, sonucu yapılandırılmış verir (`--json`)          |

Hook'lar `pnpm install` sırasında kurulur (`pre-commit` → `quick`,
`pre-push` → `high`); atlamak için `SKIP_SIMPLE_GIT_HOOKS=1`. Test yükü
bilerek push'a bırakıldı; testi de içeren hızlı kapı `pnpm fast`.

Tekil tarifler için `pnpm exec just --list`. `just` ikilisi `node_modules/.bin`
altındadır, global `PATH`e girmez — çıplak `just fast` değil `pnpm exec just fast`.

## Kapılar workspace'ten TÜRER

Yeni bir paket hiçbir kapıya elle eklenmez; `pnpm -r` ve repo geneli glob'lar
onu kendiliğinden kapsar. `scripts/workspace-contract.mjs` her commit'te bunu
doğrular: bir paket `test`/`test:coverage` script'i ya da coverage eşiği
olmadan repoya giremez.

Sözleşmenin doğruladığı diğer şeyler:

- **Kapsam eşikleri** kök `quality.json`dadır; paket `vitest.config.ts`
  dosyaları ve bekçi aynı dosyayı okur, ayrışamazlar. Bekçi yapılandırmayı
  gerçekten YÜKLER — kaldırılmış, başka paketten alınmış ya da sonradan
  ezilmiş bir eşik kapıyı kırar.
- **Kaynak import'ları** Git'in gördüğü dosyalara dayanmalıdır; ignore edilmiş
  bir yerel yardımcı temiz klonda bulunamaz.
- **Dosya boyutu**: hem index hem çalışma ağacında 2 MiB sınırı.
- **Kaynak dosya satırı** (`sourceSize.mjs`): ~600 satırı aşan dosya
  gerekçesini yazar.
- **Yorum yoğunluğu** (`commentDensity.mjs`): dosya oranı %40'ı aşarsa
  gerekçe ister; **tek bir yorum bloğu 24 satırı aşarsa gerekçeyle
  susturulamaz** — o uzunluktaki metin bir belgedir ve `docs/` ya da
  `DESIGN.md` içinde yaşar.
- **Ölü i18n anahtarı** (`deadI18n.mjs`): kullanılmayan çeviri anahtarı
  reddedilir. Şablon değişmeziyle üretilen anahtarlar tam adla muaf tutulur ve
  muafiyet, üreten kod silinince düşer.

## Belge de kapılanır

Yanlış belge derlenmez, test edilmez, kimse fark etmez. Üç kapı bunu kırar:

| Kapı                                                | Bağladığı şey                                   |
| --------------------------------------------------- | ----------------------------------------------- |
| `core/tests/governance/docSymbols.test.ts`          | `core/docs/*.md` sembolleri → CORE yüzeyi       |
| aynı dosya                                          | `music-engine.md` API tablosu → sınıf metotları |
| `devtools/visual-synth/.../designInventory.test.ts` | `DESIGN.md` §4 envanteri → şema kaydı           |

Her birinin ters yönü de kapılıdır: ölü bir muafiyet ya da belgede olmayan bir
`kind` de kapıyı kırar.

## Benchmark neyi ölçer, neyi ölçmez

Benchmark'lar makineye özel SÜRE eşiği koymaz — bir kapının koşulu masadaki
donanım olamaz. Ölçtükleri, CORE mekanizmalarının ve VOL.HELL'in render'dan
ayrılmış simülasyonunun medyan/p95 adım maliyetidir.

Kapılanan tek performans ölçüsü ORANDIR: `pnpm exec just scaling`, girdi dört
katına çıktığında sürenin kaç katına çıktığını sınar. Bu makineden bağımsızdır
ve yakaladığı şey hız değil KARMAŞIKLIKTIR.

## Adlandırma tuzağı

`doctor:env` adındaki ek tesadüfi değildir: `pnpm doctor` pnpm'in KENDİ
tanılama komutudur ve aynı adlı bir script'i sessizce gölgeler — script hiç
çalışmaz. Yerleşik bir komutla çakışan script adları bir kapı testiyle
engellenir.
