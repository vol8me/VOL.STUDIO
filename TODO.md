# VOL.STUDIO — Denetim Kaydı

`dev` dalı. Bu dosya bir görev listesi değil, tamamlanmış turların **özet
kaydıdır**: ne yapıldı, hangi kapı koşuldu, geriye ne kaldı. Turun ayrıntısı
commit diff'inde ve git geçmişindedir; burada tekrarlanmaz.

## Son durum (2026-08-18)

Bulut CI yoktur; kapılar `justfile` ile localde koşar. Aşağıdaki sonuçlar bu
tarihte çalışma ağacında bizzat koşuldu.

| Kapı                     | Durum | Not                                                                   |
| ------------------------ | ----- | --------------------------------------------------------------------- |
| `pnpm signoff`           | ✓     | high + cargo check/fmt/clippy — zincirin tamamı, exit 0               |
| `pnpm high`              | ✓     | format-check, typecheck, lint, lint:css, coverage, `build:game`       |
| `pnpm -r typecheck`      | ✓     | 5 paket (core, vol-hell, vol-ui, design, tauri-v2)                    |
| `pnpm -r test:coverage`  | ✓     | 1286 test (core 829, vol-hell 380, vol-ui 27, tauri-v2 26, design 24) |
| `pnpm lint`              | ✓     | 0 hata, 0 uyarı                                                       |
| `pnpm format:check`      | ✓     |                                                                       |
| `pnpm lint:css`          | ✓     |                                                                       |
| `pnpm build:game`        | ✓     | `vol-hell` prod build                                                 |
| `cargo check/fmt/clippy` | ✓     | `tauri-v2/src-tauri`                                                  |
| `pnpm run doctor:env`    | ✓     | Node 22.23.1, pnpm 11.18.0, rustc 1.97.1, just 1.58.0, FFmpeg 8.1.2   |

Kapsam: core %86, vol-ui %84 (function %54), vol-hell %66, tauri-v2 %89,
design %98 — hepsi kendi eşiğinin üstünde.

## Açık borç ve riskler

Kapatılmamış, bilinçli olarak taşınan maddeler. Kapanan bir madde bu listeden
silinir; kronolojiye not düşülmez.

**Yapı**

- `GameScene.ts` **680 satır** — AGENTS.md'nin ~600 satır god-object sınırının
  üstünde ve büyümeye devam ediyor. Koşu yaşam döngüsü + ses + HUD +
  duraklama/ölüm akışını birlikte taşıyor; en geç bir sonraki oynanış turunda
  bölünmeli. `core` tarafında `Kanban.ts` (812) ve `SlotGrid.ts` (675) de sınır
  üstünde.
- CORE capability yol haritasında ertelenenler: `Scheduler`, `StateMachine`,
  geometry/collision primitifleri, `ObjectPool<T>`, resource lifecycle. İkinci
  somut tüketici çıkmadan yazılmayacak.

**Kalite kapıları**

- **Bulut CI yok.** Kapıların koşulduğunu PR'da doğrulayan otomatik merci de
  yok; hook'lar `--no-verify` veya `SKIP_SIMPLE_GIT_HOOKS=1` ile atlanabilir.
  Local-first tercihin doğrudan bedeli — disiplin araca değil kişiye bağlı.
  Atlanan bir hook raporlanmalıdır.
- `just` global PATH'te değil (ikili `just-install` ile `node_modules/.bin`
  altına gelir). Çıplak `just <tarif>` çalışmaz; `pnpm fast` / `pnpm exec just`
  kullanılır. `just-install` kurulumda ağdan ikili indirir.
- pre-commit `pnpm fast` tüm repoyu koşar (~1.5 dk), yalnızca staged dosyaları
  değil. Bilinçli: monorepo'da bir pakete dokunmak başka paketin tipini kırar.
- `vol-ui` function coverage **%54** — interaktif callback'ler (buton, form,
  scroll, touch, loading) test edilmeden %80'e çıkmaz. `vol-hell` statements
  **%66**; sahne/render katmanı test dışı.
- Görsel doğrulama hâlâ elle yapılıyor (`pnpm dev`); ortamda tarayıcı
  otomasyonu yok.

**Oynanış / UI**

- Reroll'da eski kartlar çıkış animasyonu almadan yok ediliyor (yeni kartların
  aynı hücreye girmesini engellememek için); "sert değişim" hissi kalıyor.
- Kart havuzu daralınca yetersiz teklif: `vol-ui` demosunda 14 karttan 4'ü
  teklif edilir, çok alım sonrası `pickRandom` 4 farklı kart bulamayabilir.
  `vol-hell` satın alınanları hariç tuttuğu için aynı riski daha geç yaşar.
- iOS/WKWebView MP3 fallback'i otomatik üretilmiyor (`convert:ios` manuel);
  iOS şu an hedeflenmiyor.

## Kronoloji

`~` işaretli tarihler özgün kayıtta yazılmadığı için konumdan çıkarıldı.

| Tarih      | Tur                                                         | Sonuç                     |
| ---------- | ----------------------------------------------------------- | ------------------------- |
| ~08-11     | Genel denetim                                               | 74/74 bulgu çözüldü       |
| ~08-11     | Ses/müzik motoru denetimi                                   | 38/38 bulgu çözüldü       |
| 2026-08-12 | OGG/MP3 migration                                           | tek format hattına geçiş  |
| 2026-08-13 | ADIM 4 — kompozisyon primitifleri ve refaktör               | kapılar yeşil             |
| 2026-08-13 | Ses asset pipeline'ı — tek format                           | kapılar yeşil             |
| ~08-13     | Son kontrol — UI/Audio runtime hataları                     | kapılar yeşil             |
| 2026-08-13 | Aşama 1/3 — taktiksel arena dönüşümü, temel altyapı         | kapılar yeşil             |
| 2026-08-13 | Aşama 1 devamı — katmanlama, Flux düşüşü, ekonomi HUD'u     | kapılar yeşil             |
| 2026-08-13 | Aşama 1 kapanış — hata avı ve sağlamlaştırma                | kapılar yeşil             |
| 2026-08-14 | Aşama 2/3 — ability, kart, level-up/dükkân UI               | kapılar yeşil             |
| 2026-08-14 | Aşama 2 revizyonu — denge, akış, dükkân UI, ability görseli | kapılar yeşil             |
| ~08-15     | Aşama 3/3 — Elite/Boss, telegraph, cila, bitiş ekranı       | genre dönüşümü tamam      |
| 2026-08-15 | Aşama 3 sonrası — defansif bug avı (yalnız tarama)          | rapor                     |
| 2026-08-15 | Kritik/yüksek/orta/düşük bulgu düzeltmeleri                 | regresyon testleriyle     |
| 2026-08-15 | CORE capability yol haritası — Faz 0                        | taslak doğrulandı         |
| 2026-08-15 | CORE Faz 1 — `DisposableScope`, adaptive hit-target         | kapılar yeşil             |
| 2026-08-15 | vol-ui KARTLAR sekmesi + ShopPicker reroll/kilit            | CORE'a opsiyonel eklendi  |
| 2026-08-15 | Repo çapında bug avı — zoom/z-index/kart animasyonları      | kapılar yeşil             |
| 2026-08-18 | Kart animasyon sağlamlaştırma                               | kapılar yeşil             |
| 2026-08-18 | Local-first `just` kalite kapısı geçişi                     | CI kaldırıldı             |
| 2026-08-18 | vol-ui test altyapısı ve kapsamı                            | 5→27 test, eşikler açıldı |
| 2026-08-18 | Hata avcılığı ve çalışma ağacı sertleştirme                 | NaN/abort/sızıntı fixleri |
| 2026-08-18 | `just` geçişinin denetimi ve sertleştirilmesi               | aşağıya bak               |

## 2026-08-18 — `just` geçişinin denetimi

Geçiş bittikten sonra iş profesyonel biçimde kapanmış mı diye denetlendi.
Belge ile çalışma ağacı arasındaki tutarsızlıklar düzeltildi; `pnpm signoff`
temiz durumdan yeniden koşuldu (exit 0).

**Belge gerçeğin gerisindeydi.** `AGENTS.md` hâlâ silinmiş
`.github/workflows/ci.yml`'yi işaret ediyordu (Bozulamaz Kural #8 + tüm "Kalite
Kapıları" bölümü) — her yeni agent oturumu var olmayan bir dosyaya
yönlendiriliyordu. `README.en.md` hiç güncellenmemişti. `TODO.md` `AGENTS.md`
için bir yerde "güncellendi", iki yerde "güncellenemedi" diyordu; gerekçe
olarak yazılan "`.gitignore`'da olduğu için yazma hakkı yok" iddiası da
yanlıştı. Hepsi gerçeğe göre düzeltildi.

**Çalışmayan komutlar.** `pnpm doctor` pnpm'in built-in komutu olduğu için
`"doctor": "just doctor"` script'ini gölgeliyordu — "`just doctor` ✓" raporu
aslında başka bir komutun çıktısıydı; gölgelenmeyen `doctor:env` eklendi.
`just` global PATH'te olmadığı hâlde README birincil komut olarak çıplak
`just fast` gösteriyordu. `just clean` no-op'tu (kök seviyesinde artefakt yok);
şimdi 7 dizini de siliyor, pahalı Rust `target` ayrı `clean-all`'a alındı.
`doctor` tarifi `npx just` çağırıyor ve Fedora'da Debian paket adı öneriyordu.

**justfile.** `["bash","-cu"]` → `["bash","-euo","pipefail","-c"]`. Agent'ların
tek kapıyı hedefleyebilmesi için tekil tarifler eklendi (`typecheck`, `lint`,
`lint-css`, `format-check`, `test`, `test-pkg <paket>`, `coverage`, `rust`,
`build-ui`, `gen-theme`); birleşik kapılar artık bunlardan kuruluyor. `high`
testleri iki kez koşuyordu — beş paketin de `test:coverage`'ı olduğu
doğrulanıp düz `test` çıkarıldı. `postinstall` git deposu olmayan ortamda
kurulumu kırıyordu; artık uyarıyla atlanıyor.

**Test kalitesi.** `sections.test.ts`'te
`expect(children.length).toBeGreaterThanOrEqual(0)` bir totolojiydi — hiç
düşmez ama `destroy()` temizliğini doğruluyormuş gibi duruyordu. Gerçek
iddiayla değiştirildi ve boş olmadığı ölçüldü (`panels` 4, `cards` 2,
`advanced` 2 düğüm asıyor, hepsi geri toplanıyor). "Sahne anahtarını ayarlar"
testi anahtarı hiç doğrulamıyordu. Reroll testi listenin boşalmasını
yakalamıyordu. İngilizce test adları Türkçeleştirildi, DOM sızıntısı için
`afterEach` eklendi.

**Kalıntı temizliği.** Kod yorumlarındaki oyun adı referansları (Brotato ×4) ve
silinmiş planlama belgesine dangling atıflar (`B1`, `B1b`, `B2`, `B3`, `C3`,
`C5`) kaldırıldı. Tamamlanmış işi gelecek zamanda anlatan 14 "Aşama N" yorumu
mevcut gerçeğe göre yeniden yazıldı (Elite/Boss ve kart sistemi çalıştığı
doğrulanarak). `vol-hell` README'lerindeki "CI bunu koşar" notu düzeltildi.

Tasarım tarafında `entities.pen` içindeki `categorySubtitle` metni Pencil
üzerinden temizlendi: "MINDUSTRY REFERANSLI FORM" → "CONVEYOR-DERIVED FORM".
Dosyanın tamamı 9451 düğüm üzerinden tarandı, kelime sınırıyla başka oyun adı
çıkmadı ("FAULT SPIRE" bir boss adı, "cannon" içindeki eşleşmeler yanlış
pozitif).
