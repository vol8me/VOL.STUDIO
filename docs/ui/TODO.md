# UI fazları — tek yetkili iş listesi

İşler henüz uygulanmadı. `[ ]` açıktır; `[x]` yalnız bütün kapanış kanıtıyla
`Kapatılanlar`a tek satır taşınır. Görev kimlikleri tekildir; UI-06 isim göçü eski
yolları yeni yola taşır, aşağıdaki sonraki fazlar yeni yolu kullanır. **Önerilen/yeni**
dosya mevcut sembol değildir; oluşturulacak sorumluluk yeridir. Modül adı uygulama
sırasında uyum gerekçesiyle değişebilir, CONTRACT ve test aynası birlikte güncellenir.
Hiçbir görev “diğerlerini de düzelt” şeklinde sınırsız yan yeniden düzenleme yetkisi
vermez.

Güncel üst sıra [kök F01–F10](../../TODO.md) ve kararlar
[monorepo denetimindedir](../monorepo-audit.md). Windows geliştirme/ilk native
referans önce alınır; UI-06'nın Linux/Deck fiziksel kabulü kök F08'de ayrı yürür.
UI-00–UI-13'ün 64 alt görevi (önceki 63 + UI-00.7) korunur; sıra ve bağımlılık [yürütme planındadır](#yürütme-planı). Ses yayın kabulü F01'in mekanik QA/verify
sözleşmesidir; zorunlu insan dinleme bekleme durumu kurulmaz.

Teknik teslim ve gerçek release kabulünün ölçütleri
[VERIFICATION](VERIFICATION.md) içindedir. Sonraki bağımsız teknik iş,
yapılamayan cihaz/görsel/erişim/haptik kabulünü PASS saymadan ilerleyebilir.
Her görev kendi Kapanır ölçütleriyle açıktır; UI-13 tüm release kabulünü toplar.

## Yürütme planı

Bu bölüm 14 faz ve 64 görevin **sırasını, bağımlılığını, paralelliğini ve kapı
stratejisini** belirler; görev ID'leri ve kapanış ölçütleri aşağıdaki `Açık`
bölümündedir ve değişmez. Ölçüler 2026-10-06'da çalışma ağacından alındı;
sayı değişince bu bölüm güncellenir, tarihçe git'tedir.

### Ölçülen başlangıç

| Alan                           | Ölçü                                                                                                                                                                                     |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CORE UI                        | 117 TS dosyası, 21,1 bin satır; 89 sınıf/118 runtime/205 tip export; 60 renk tokenı, 238 satır `theme.css`                                                                               |
| Vitrin                         | 12 sekme, **830** TR/EN anahtar (yaprak sayımı, UI-00.5 yeniden sayımı; plandaki ilk "821" yeniden üretilemedi) + CORE 63; 7 E2E dosyası, 40 test (≈1,6 dk); WebKit yalnız `readability` |
| Piksel temeli                  | 12 sekme × Chromium `win32` + `linux` = 24 PNG, sıfır tolerans; WebKit temeli yok; Linux temeli WSL'de 6/12 yeniden üretildi (doğrulanmamış)                                             |
| Gönderilen boyut               | vitrin app 138,7/150, css 19,8/24 KiB; **VOL.TEST app 106,3/106,3 (pay sıfır)**, vendor 345,6/360, css 18,2/21                                                                           |
| Eksik altyapı (başlangıçta)    | axe-core kurulu değildi; `ui-check` tarifi, kayıt/registry ve native ölçüm sondası yoktu — UI-00.1–UI-00.6 ile kapandı (Windows/Deck/Android 16 native hücreleri açık)                   |
| Göç maliyeti (taşınmadan önce) | eski vitrin yolu için 26 yol + 15 paket başvurusu, 81 izlenen dosya, 24 PNG; `.vol-ui-root` CSS sınıfı 944 geçişte ve **değişmez**                                                       |
| Cihaz                          | Windows dizüstü (bu makine) ve Lenovo Android 14 tablet erişilebilir; Steam Deck, Samsung ve Android 16 cihaz yok                                                                        |
| Ortam                          | `doctor:env` Node **22.23.1** ister; kapılar bu sürümle koşturulur                                                                                                                       |

### Kararlar

| #   | Karar                                                                                                                                                                                                                                                                   | Gerekçe                                                                                                                                                                             |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **UI-06.1 paket göçü ilk iş olur** (ID aynı kalır).                                                                                                                                                                                                                     | Mekanik ve görselden bağımsız; şimdi 26+15 başvuru, her faz yeni başvuru ve PNG ekler. Sonraki bütün fazlar yeni yolda çalışır, temel dosyaları iki kez taşınmaz.                   |
| D2  | Sıra zinciri **bağımlılık grafiğine** çevrilir (aşağıda). Aynı dosyaya dokunan görevler seri, farklı dizinlere dokunanlar paralel koşar.                                                                                                                                | 14 faz seri bekletmek kritik yolu şişirir; gerçek ön koşullar (UI-00.6→UI-03, UI-03.4→aileler) korunur.                                                                             |
| D3  | UI-07.1–07.3 (anahtar sağlığı, çoğul/RTL, font) tema işinden ayrı hatta koşar; UI-07.4 UI-01.2 sonrasıdır.                                                                                                                                                              | i18n/font tokenlara bağlı değil; tema laboratuvarı bağlı.                                                                                                                           |
| D4  | Windows native vitrin (UI-06.2–06.4 Windows kısmı) UI-06.1 hemen sonrası **paralel platform hattıdır**.                                                                                                                                                                 | İlk gerçek WebView2 referansı sonraki piksel/performans işlerine erken zemin verir; Linux/Deck kısmı F08 donanımına bağlı kalır.                                                    |
| D5  | **UI-00.7 (yeni):** UI'nın VOL.TEST'e gireceği her iş için boyut payı açılır; ilk adım ses bank'larının çalışma zamanı görünümüdür (≈4–5 KiB gzip provenance özeti).                                                                                                    | VOL.TEST app payı sıfır; UI-02/03 tüketicisi bütçeyi düşürür. Bank sınıfı ve oyun hash/manifest alanlarını okumaz; gönderilen hâl tüketiciye aittir (kök AGENTS).                   |
| D6  | Piksel temeli: Windows `win32` kanonik; Linux temeli UI-00.2'de WSL'de **yeniden üretilebilirlik ölçülür**. Bilinçli her görsel değişim iki ailenin temelini aynı commit'te yeniler; üretilemiyorsa Linux hücresi kayıtlı NOT-RUN'dır. Tolerans açılmaz.                | Linux temelleri doğrulanmadan bayatlayabilir; sessiz bayatlama sıfır tolerans kapısını anlamsızlaştırır.                                                                            |
| D7  | E2E kapıları **katmanlıdır**: `high` smoke + kritik etkileşim (vitrin ≤4 dk), tam durum/tema/dil/yoğunluk matrisi yeni `ui-check` tarifinde ve `signoff`ta; genel ikili tarama, kritik akış tam çarpım.                                                                 | 15 sekme × durum × 2 motor × tema/dil/yoğunluk yüzlerce testtir; pre-push süresi (bugün ≈35 dk) kontrolsüz büyürse kapı atlanmaya başlar. Süre bütçesi ölçülür, timeout büyütülmez. |
| D8  | UI sesleri CORE'un **gönderilen** varlığıdır: audio-synth'e yeni "kütüphane" hedef türü (ihlal örneğiyle) eklenir; çalışma zamanında audio-synth içe aktarılmaz.                                                                                                        | `targets.ts` bugün yalnız referans ve oyun hedefini tanır; CORE hedefi yok. İlk dilim hedef kararı + negatif test.                                                                  |
| D9  | UI-11.1/UI-12.1 F04 çıktısını **tekrarlamaz**: eski async sonuç/odak/sağlayıcı temizliği (F04.2) ve Steam iptal/callback sahipliği (F04.4) kabuldür; görevler yalnız kalanı kapsar.                                                                                     | Aynı davranışı ikinci kez yazmak çelişen iki sahip doğurur. Kalan: `TextEntrySession`, OSK yerleşim/dil, grafem/maxLength, IME Enter, public iptal, OSK ekran örneği.               |
| D10 | Kanıt kaydı vitrin paketinin git dışı records alanındadır (UI-06.1'de ignore edilir); public belge anonim özet taşır.                                                                                                                                                   | Kök AGENTS: araç çıktısı paketin git dışı alanına; cihaz/kullanıcı kimliği kayda girmez.                                                                                            |
| D11 | Dilim kuralı: bir dilim tek mantıksal değişiklik + kendi ihlal (kırmızı) testi + belge/katalog/registry güncellemesi; `quick` commit'te, `fast` görev sonunda, `high` faz sonunda, `signoff` UI-02 ve UI-13'te.                                                         | "Diğerlerini de düzelt" kayması ve uzun, geri alınamaz değişiklik riskini keser.                                                                                                    |
| D12 | Belge kapıları UI işini bağlar: yeni public export `core/docs` sembolü (`docSymbols`), katalog+vitrin+test (`catalog.mjs`), i18n anahtarı (`deadI18n`/`keyParity`), 1000 satır ve yorum yoğunluğu sınırını taşır; sınıra yaklaşan dosya mekanizma/sunum olarak bölünür. | Kapılar zaten bağlayıcı (docs/gates.md); dilim kalıbına yazılmazsa her faz sonu toplu onarım borcu doğar.                                                                           |

### Bağımlılık grafiği

Sert ön koşul (→) kapı veya veri bağıdır; yumuşak sıra aynı dosyaya dokunmaktan gelir.

| Görev/faz          | Ön koşul                                                            | Aynı dosya sırası                                   |
| ------------------ | ------------------------------------------------------------------- | --------------------------------------------------- |
| UI-06.1            | yok (Dalga 0)                                                       | —                                                   |
| UI-00.1–00.4       | UI-06.1                                                             | registry → durum matrisi                            |
| UI-00.5, UI-00.7   | UI-00.2 (iki motorlu ölçüm), UI-06.1                                | —                                                   |
| UI-00.6            | UI-00.2, UI-00.4                                                    | —                                                   |
| UI-01.1–01.5       | UI-00.1, UI-00.5                                                    | `colors.ts`/`theme.css`: 01.1 → 07.4                |
| UI-02.1            | UI-00.1                                                             | `buttonBehavior`: 02.1 → 03.1                       |
| UI-02.2–02.4       | UI-02.1, UI-00.7 (bütçe), F05 (tamam)                               | —                                                   |
| UI-02.3            | D8 hedef türü; UI-02.1 olay listesi                                 | audio-synth kayıtları                               |
| UI-02.5            | UI-02.2, UI-01.2, UI-06.1                                           | vitrin `ShowcaseApp`                                |
| UI-03              | UI-01.1–01.4, UI-02.1–02.2, UI-00.6                                 | Button/IconButton                                   |
| UI-04, 05, 08, 09  | **UI-03.4 (M1 pilot kabulü)**; 09 ayrıca UI-05.1; 08 ayrıca UI-07.1 | Input/TextArea: 05.1 → 11.1; Modal/OSK: 09.1 → 11.1 |
| UI-10.1–10.4       | UI-03.4; 10.1 ayrıca UI-03.2                                        | PauseResume: 10.3 tek sahip                         |
| UI-06.2–06.4 (Win) | UI-06.1; 06.4 ayrıca UI-00.6                                        | —                                                   |
| UI-07.1–07.3       | UI-00.1                                                             | —                                                   |
| UI-07.4            | UI-01.2, UI-06.1                                                    | `theme.css`                                         |
| UI-11.1–11.2       | UI-05.1; F04.2 (tamam)                                              | Input/TextArea                                      |
| UI-11.3–11.4       | UI-06.2, UI-11.1; **Android cihazı**                                | `MainActivity`, vitrin crate'i                      |
| UI-12.1            | UI-11.1; F04.4'ün cihaz turu                                        | `steamworks.ts`, `service.rs`                       |
| UI-12.2–12.3       | UI-03; 12.3 ayrıca UI-02.4                                          | —                                                   |
| UI-12.4            | UI-06.2, UI-11.2                                                    | —                                                   |
| UI-13              | bütün kod/kapı kapanışları                                          | —                                                   |

### Hatlar ve dalgalar

| Hat | Konu             | Sıra                                                                                                   |
| --- | ---------------- | ------------------------------------------------------------------------------------------------------ |
| A   | Görsel çekirdek  | UI-00.1 → UI-00.5 → UI-01 → UI-03 (M1) → UI-04 / 05 / 08 / 09 / 10 (fan-out) → UI-13                   |
| B   | Ses/haptik       | UI-00.7 → UI-02.1 → 02.2 → 02.3 → 02.4 → 02.5                                                          |
| C   | i18n/font        | UI-07.1 → 07.2 → 07.3 → 07.4                                                                           |
| D   | Platform/native  | UI-06.1 → 06.2 → 06.3 → 06.4 (Win) → UI-11.3/11.4 (Android) → UI-12.4; UI-12.1–12.3 kendi cihazlarıyla |
| E   | Kalite altyapısı | UI-00.2 → 00.3 → 00.4 → 00.6 (UI-03'ün kapısı)                                                         |

| Dalga | Kapsam                                                                  | Çıkış ölçütü (hepsi gerçek kapı)                                                                                                                |
| ----- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | UI-06.1, UI-00.1–00.7                                                   | Eski yol başvurusu sıfır (tarihçe notları hariç); registry ihlal testi; iki motor; axe; ilk referans; çalışan browser probu; VOL.TEST bank payı |
| 1     | Hat A (UI-01), B (UI-02), C (UI-07.1–.3), D (UI-06.2–06.4 Win)          | `pnpm signoff` UI-02 yayını için; native Windows açılış; tema/hareket ihlal örnekleri                                                           |
| 2     | UI-03 (M1) → UI-04, 05, 08, 09, 10; UI-07.4; UI-11.1–11.2; UI-12.2–12.3 | Her aile kendi durum matrisi ve iki motor; M1 kabul eşikleri (p95<100 ms, bütçeler)                                                             |
| 3     | UI-11.3–11.4, UI-12.1, UI-12.4, UI-13                                   | Gerçek cihaz/insan kabulleri PASS/FAIL/NOT-RUN ayrı raporda; `signoff`                                                                          |

**Kritik yol:** UI-06.1 → UI-00.1/.2/.4/.5 → UI-00.6 + UI-01.1–01.4 + UI-02.1–02.2 →
UI-03.4 → en uzun aile (UI-05 + UI-09) → UI-13.1/13.2 → cihaz ve insan kabulleri.
Hat B'nin üretim kısmı (UI-02.3) ve Hat C kritik yolda değildir; ama UI-02 yayını
`signoff` süresi ve UI-07 tema laboratuvarı UI-13'ü bekletebilir.

### Göreli ağırlık ve dilimleme

Ağırlık S=1, M=2, L=3, XL=5 (dosya/test/kapı etkisi; takvim sözü değildir).

| Faz   | Görev | Ağırlık | Not                                                                               |
| ----- | ----- | ------- | --------------------------------------------------------------------------------- |
| UI-00 | 7     | 12      | Altyapı; sonraki bütün kapıların zemini. En riskli: 00.6 (native ölçülebilirlik). |
| UI-01 | 5     | 12      | Tema/hareket/doku üreticisi; varsayılan piksel temeli bilinçli değişir.           |
| UI-02 | 5     | 13      | Ses seti üretimi + audio-synth hedef türü + `signoff`.                            |
| UI-03 | 4     | 8       | Pilot; yayılımın referansı.                                                       |
| UI-04 | 4     | 8       | Kart/picker/drag alternatifleri.                                                  |
| UI-05 | 5     | 12      | Form/ayar; Input/TextArea kritik.                                                 |
| UI-06 | 4     | 12      | Atomik göç + native crate + Windows açılışı.                                      |
| UI-07 | 4     | 10      | Anahtar sağlığı/çoğul/RTL/font/tema laboratuvarı.                                 |
| UI-08 | 4     | 8       | HUD ailesi.                                                                       |
| UI-09 | 4     | 10      | Overlay/bildirim/veri; en çok durum.                                              |
| UI-10 | 5     | 12      | Dokunma/kaydırma/çalışma alanı.                                                   |
| UI-11 | 4     | 12      | Metin oturumu + Android native.                                                   |
| UI-12 | 4     | 10      | Deck metin/glif/haptik + Windows yükleyici.                                       |
| UI-13 | 5     | 12      | Tam kabul; cihaz/insan bağımlı.                                                   |

Her görev şu **dilim kalıbıyla** bölünür: (1) kontrat ve ihlal (kırmızı) testi,
(2) mekanizma, (3) vitrin örneği ve durum fixture'ı, (4) belge/katalog/registry/public
kilit (`core/docs` sembolü, `catalog.mjs`, anahtar kapıları, satır sınırı), (5) kapı ve temel yenileme. Dilimlerin her biri kendi commit'idir ve geri
alınabilir; piksel temeli yalnız (5)'te yenilenir.

### Kapı ve süre stratejisi

| Kapı       | UI işindeki yeri                                                                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `quick`    | Her commit: contract (registry/tema/hareket ihlali), tip, lint, biçim.                                                                           |
| `fast`     | Görev sonu: modül adlı testler, katalog/public kilit.                                                                                            |
| `ui-check` | **Yeni tarif (UI-00.3):** contract UI kuralları + vitrin tam durum/tema/dil/yoğunluk matrisi + axe. `signoff` bileşimine girer, `high`'a girmez. |
| `high`     | Faz sonu/push: vitrin smoke + kritik etkileşim ≤4 dk, bundle (vitrin 150/1/24, VOL.TEST 106,3 → UI-00.7 sonrası ölçülmüş), kapsam, scaling.      |
| `signoff`  | UI-02 yayını ve UI-13; gerçek cihaz/insan kabulü bunun dışında ayrı rapordur.                                                                    |

Kapsam eşikleri yükselir, düşmez (CORE bugün %93,7/85,9/94,4/95,4; vitrin %94/60/84).
Yeni davranış kapsam artışıyla birlikte gelir; eşik yükseltmesi ölçülmüş değerle
aynı commit'tedir.

### Risk kaydı

| #   | Risk                                                                          | Tetik/ölçü                          | Önlem                                                                                            |
| --- | ----------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------ |
| R1  | Piksel temeli çift OS ve sıfır tolerans; Linux temeli doğrulanmamış           | Her görsel değişim 24 PNG           | D6; WSL Playwright yeniden üretimi UI-00.2'de; tolerans açılmaz                                  |
| R2  | VOL.TEST app payı sıfır                                                       | `bundle` kapısı                     | UI-00.7 bank görünümü; her tüketici değişiminde ölçülü bütçe notu; vendor/css payları ayrı       |
| R3  | E2E ve pre-push süresi kontrolsüz büyür                                       | high süresi, vitrin e2e süresi      | D7 katmanlı kapı; süre bütçesi; timeout büyütülmez                                               |
| R4  | Yanlış Node ile alınan kanıt                                                  | `doctor:env`                        | Kapılar Node 22.23.1 ile; kanıt kaydı sürümü taşır                                               |
| R5  | Native ölçülebilirlik (WebView2/WebKitGTK/Android) belirsiz                   | UI-00.6 araştırması                 | Desteksiz hücre açık release engeli; sıfır/tahmin PASS değil; browser emülasyonu native sayılmaz |
| R6  | Cihaz yokluğu: Deck, Samsung, Android 16                                      | UI-06.4/11.4/12/13.3                | NOT-RUN matrisi; kod fazlarını bloklamaz, nihai release'i bloklar                                |
| R7  | Public yüzey/katalog/registry sürüklenmesi                                    | `publicTypeSurface`, katalog kapısı | Her export aynı commit'te snapshot+registry+README; UI-00.1 bunu otomatikler                     |
| R8  | UI sesleri için gönderilen varlık hedefi yok                                  | `targets.ts` yalnız referans/oyun   | D8 ilk dilimi; çalışma zamanında audio-synth bağı yok                                            |
| R9  | `audio-verify`/`signoff` süresi yeni seslerle uzar (bugün 69 manifest ≈10 dk) | audio-verify süresi                 | Ölçüm; yalnız UI hedefi diff'ine bağlı seçilim mevcut `audio-test` mantığıyla                    |
| R10 | Kapsam kayması ve geniş yeniden düzenleme                                     | Dilim diff'i                        | D11; görevin değişiklik alanı dışındaki dosya kırmızı bayrak; her dilimin geri alma yolu var     |
| R11 | Android/Tauri API pinleri ve Windows Gradle zinciri                           | UI-11.3 derleme                     | `Plugin.kt`/`WryActivity` pinli API'leri; F02 Android profili; üretilmiş Activity düzenlenmez    |

### Yapılamayan/NOT-RUN kalacak kabuller

Bu kabuller kod fazını bloklamaz; **sürümü bloklar** ve PASS sayılmaz:
Steam Deck host/SLR4 açılış, kol-only, glif yüksekliği ve ısınmış performans
(UI-06.4, UI-12.2–12.3, UI-13.3; F08); Windows Playwright WebKit'in AudioContext sınırı yüzünden WebKit ses hücreleri (ses E2E Chromium'da, WebKit sınırı belgeli); Samsung ve Android 16 hücreleri (UI-11.4,
UI-13.3); gerçek Steam runtime metin sağlayıcısı (UI-12.1; F04.4/F08.6); insan
erişilebilirlik/görsel/haptik değerlendirmesi (UI-03.4 beğeni, UI-13.4). Bu makinede
**yapılabilir**: iki motorlu tarayıcı kabulü, Windows native vitrin ve yükleyici
(DPI 125/150/200), Lenovo Android 14 tablet profili.

### Başlangıç dilimleri

1. **Ortam (D6/R4).** Gate shell'inde Node 22.23.1; WSL'de Playwright Chromium kurulumu ve vitrin temelinin Linux'ta yeniden üretilmesi. Kabul: `doctor:env` OK; Linux temeli ya bayt eşit üretilir ya da NOT-RUN gerekçesi kayıtlıdır.
2. **UI-06.1 atomik göç (tamam).** Dizin, paket adı, lifecycle, quality (paket+bütçe), kilit importer'ı, `justfile`, katalog sabit yolu, testler, belgeler ve PNG'ler aynı değişiklikte; `.gitignore`'a vitrin records alanı. Kabul: eski vitrin yolu ve paket adı başvurusu sıfır, PNG'ler yalnız taşındı (özet eşit), build/bundle 150/1/24, contract/high yeşil.
3. **UI-00.1 registry (tamam)**, 4. **UI-00.2 (tamam)**, 5. **UI-00.3 (tamam)**, 6. **UI-00.4 (tamam)**, 7. **UI-00.7 (tamam)**, 8. **UI-00.5 (tamam)**, 9. **UI-00.6 (tamam)**.

## Açık

### UI-00 — Gerçek başlangıç ve kabul altyapısı

Hedef: yanlış başlangıç referansının
sonraki fazlarda başarı gibi kullanılmasını engellemek. Sahip: kalite/vitrin. Değişiklik
alanı: `scripts/quality/`, `devtools/vol-showcase/tests/e2e/`, ilgili CORE testleri.

Faz testi: kalite ihlal örnekleri ve CORE yönetişim testleri, iki motordaki mevcut E2E
testleri, bundle; `pnpm exec just contract`, `pnpm exec just e2e`.

### UI-01 — Ortak görsel/hareket altyapısı

Ön koşul UI-00.1, UI-00.2 ve UI-00.5. Sahip CORE UI; yardımcı varlık üreticisi sahibi ayrı. Mevcut hedefler
`core/src/ui/colors.ts`, `core/src/ui/theme.css`, `core/src/constants.ts`,
`core/src/ui/animation.ts`, `core/scripts/gen-theme.mjs`,
`core/src/ui/layout/UIRoot.ts`. Önerilen modüller themes/, motion/, skin/; tek
dosyada toplanmaz.

- [ ] **UI-01.1 — Tipli anlamsal token ve tema kaynağı.** 60 mevcut renk tokenını ve
      public VOL_COLORS uyumunu koru; page/well/panel/plate,
      çerçeve/anlam/ışıma/nadirlik durum tokenları ve ember temasının sabit renk
      kaynağını ekle. Üreticinin ayrıştırma/doğrulaması deterministik ve yapısal olsun;
      mevcut font/boşluk bölümlerini silmesin. Kapanır: anahtar paritesi,
      desteklenmeyen/eksik token ve üretim sapması örnekleri; varsayılan stil farkı
      bilinçli, `gen:theme` idempotent; public tip yüzeyi kontrollü.
- [ ] **UI-01.2 — Tema ve yoğunluk sahibi.** Önerilen themes/ThemeController.ts ve
      layout/density.ts; cihaz kapsamında kalıcılık, bilinmeyen değerin varsayılana
      dönmesi, kapsamı belirli önizleme/body katmanı ve Canvas token okuyucusu. UIRoot
      referans sayımıyla paylaşılan parent için iki sağlayıcı kurulmasın. Kapanır: çoklu
      kök, kaynak temizliği, çalışma anında tema değişimi ve kaydırma/odak/seçim
      korunumu; kaba işaretçi/yoğunluk/zoom ayrı; Deck kol hedefleri fareye geçişte
      küçülmez.
- [ ] **UI-01.3 — Hareket politikası/hazır ayarlar ve bütçe.** Önerilen
      motion/presets.ts, motion/MotionController.ts; CONTRACT §4'teki tüm özel
      süreler/yumuşatma eğrileri tek kaynak. Mevcut animateValue iptal sözleşmesi
      uyumlu; azaltılmış hareket, gizlenme, askıya alma ve kesinti sonrası son durum
      tanımlı. Kapanır: 3 grup/64 UI parçacık/1 blur sınırı olay salkımı örneğinde
      korunur; sıfır sürede kaynak temizliği yapılır; işlevsel zamanlayıcı/basılı tutma
      süresi değiştirilmez.
- [ ] **UI-01.4 — Çerçeve, ikon, doku ve imleç üreticisi.** SVG 9-slice, tokenli plaka,
      16/24/32/48 özgün ikon/tema imleci; doku üreticisi sabit tohumla çalışır. Önerilen
      üretici core/scripts/ui-assets/; kaynak/gönderilen varlık ayrımı mevcut varlık
      doktrinine uygun. Kapanır: aynı tohumda çıktı özeti aynı, kaynak kaydı ve tüketici
      yolu var; şişkin raster/video bağımlılığı yok; glif/ikon adları ve piksel
      yoğunluğu net; azaltılmış hareket/bulanıklık yedeği görünür.
- [ ] **UI-01.5 — İlk planlanan kapılar.** Tema tokenı parite/kontrast, animasyon token
      kullanımı ve yaşam döngüsü ihlal örneklerini kalite şeması ve justfile'a bağla.
      Kapanır: yeni UI bileşenindeki ham süre testi düşürür; genel sayısal animateValue
      API ve işlevsel zaman aşımı hata sayılmaz; kontrast son alfa/arka plan üstünde
      ölçülür, sadece hex çifti değil.

Faz testi: `core/tests/ui/themes/*`, `motion/*` ve değişen modül adlı testler yeni;
mevcut colorSync/cssConstantSync/publicSurface; tema geometrisi E2E.

### UI-02 — Semantik UI ses/haptik ve kanonik varsayılan ses karakteri

Ön koşul UI-00.1 ve UI-00.7; UI-02.5 ayrıca UI-01.2 ve UI-06.1. Sahip CORE genel geri bildirim + audio-synth üreticisi + uygulama
adaptörü. Oyun SFX varsayılanları ve simülasyon RNG'si korunur.

- [ ] **UI-02.1 — Tek niyet/tek olay.** `core/src/ui/primitives/buttonBehavior.ts`,
      `runButtonClick`, mevcut `valueInteraction` davranışları
      ve haptik adaptörü üzerinden tipli anlamsal olay/sonuç verisi tanımla. Önerilen
      core/src/ui/feedback/uiIntent.ts; UI ses sağlayıcısı primitif içinde kurulmaz.
      Kapanır: işaretçi+yerel tıklama+klavye+kol birleşiminde olay iki kez üretilmez;
      programatik ayar/iptal/devre dışı durumları sessiz; önizleme/kalıcı değişiklik
      farklı; ürün başarısını host bildirir, Promise çözülmesi otomatik başarı
      sesi değildir; mevcut primitive haptik yolu + merkezi provider aynı
      niyet için iki darbe üretmez; aynı UI kökünün paylaşılması dinleyici/ses
      sayısını çoğaltmaz.
- [ ] **UI-02.2 — UiSoundKit ve ayarlar.** Önerilen core/src/audio/ui/UiSoundKit.ts
      mevcut SoundBank'in destination/gain yolu ve SidechainDucker mekanizmasını
      tüketir; sırf UI için yeni genel mixer veya MusicEngine kurulmaz. Yeni
      @volstudio/core/audio/ui public girişinin package exports/barrel/public
      lock/test sahibi bu görevdir. SidechainDucker bugün yalnız CORE kökünde
      export edilir; kit içinden relatif import veya bilinçli subpath re-export
      kullanılır. Kapanışta SHOWCASE ve VOL.TEST import/bundle izi Phaser'sız
      public erişimi doğrular. UI
      toplam 4 ses, kritik olay önceliği, mikro olaylarda 120ms sıklık sınırı, 3
      varyantın sırayla seçilmesi ve ±%5 değişim, bağımsız RNG akışı.
      Ana/UI/SFX/müzik/konuşma seviyesi ve sessizleştirme/kullanıcı jesti cihaz ayarı.
      Kapanır: ses erişimini açma/ön yükleme hatası/bağlam yokluğu/sessizleştirme/arka
      plan/devam/iptal/kaynak temizliği testleri; beklemiş sesler dönüşte topluca
      oynatılmaz; genel 24 ses ve RNG varyant sözleşmesi zorla değişmez, müzik olmayan
      ürüne müzik eklenmez.
- [ ] **UI-02.3 — Sıfırdan varsayılan set üretimi.** Mevcut `devtools/audio-synth`
      kanonik job/yayın/manifest sürecinden UI olay ailesi için kuru/oda-yedekli özgün
      set çıkar; tüketici hedefi şemasına uygun bilinçli hedef genişlemesi
      ve ihlal örneği ekle. Önerilen tüketici CORE'un gönderilen UI sesleridir; çalışma
      zamanında geliştirme aracı içe aktarılmaz. Kapanır: varyant/olay manifesti
      paritesi, PCM yeniden render, bas/gövde ayrı filtre, kodlama sonrası
      tepe/sonluluk/DC/süre, varlık kaynağı/üreticisi kaydı; hazırlanan sesler insan
      dinlenmiş sayılmaz.
- [ ] **UI-02.4 — Duck/haptik sözleşmesi.** Kritik olayda isteğe bağlı −6dB,
      120/80/450ms düşürme; örtüşme/iptal sonrası geri dönüş; mevcut haptik desenleri ve
      varsayılan kapalı durum, kapasite/sıfır şiddet/sıklık sınırı, tek sürücü. Kapanır:
      askıya alma/odak kaybı/cihaz çıkarma/kaynak temizliği sonrası sıfırlama testli;
      sürücü yokluğu normal sonuç; görsel bilgi her durumda var; haptik yokken veya ses
      erişimi kilitliyken E2E aynı eylemi yapar.
- [ ] **UI-02.5 — Ses laboratuvarı ve yayın kabulü.** Vitrine onaylı Ses sekmesi ekle:
      açık oynatma eylemi, olay/ses kanalı/sessizleştirme/ses sayısı/düşürme/yetenek,
      örnek dışa aktarımı ve kuru/efektli kıyas. Kapanır: anlamsal olay sondası her
      kabul edilmiş niyeti tek sayar; güncel kaynak/PCM/manifest ve kodek sonrası
      politika gerçek verify ile geçer; cihaz ses çıkışı teknik olarak doğrulanır.
      İsteğe bağlı dinleme paketi korunur; insan dinleme onayı üretim şartı değildir.

Faz testi: yeni kaynak ağacını yansıtan CORE/audio testleri, audio production-check,
asset verify ve ilgili audio surface lock; yayın kilometre taşı `pnpm signoff`.

### UI-03 — BUTON pilotu / M1

Ön koşul UI-01/UI-02 teknik teslimi ve UI-00.6 browser probu; sahip
primitives/buttons. Görsel dilin ilk uçtan uca örneği; diğer
ailelere kör mekanik CSS yayılımı yapılmaz.

- [ ] **UI-03.1 — Button/IconButton/ToolButton.** Varyant×boyut×yoğunluk,
      normal/hover/basılma/odak/devre dışı/yükleme/hata; basılma eğimi/ışıması,
      erişilebilir ad/başlık, asenkron ret/yeniden giriş ve Toolbar gezici tabindex
      davranışı. ToolButton bağımsız/çoklu seçim/dikey/tümü devre dışı örneği. Kapanır:
      aynı niyet mekanizması, yüklemenin erişilebilir meşgul durumu ve odak korunumu,
      asenkron işlem bitişi sırasında dışarıdan gelen disabled durumunun korunması,
      yerel button Enter/Space tek olay, hata sonrası tekrar kullanılır, açık/kapalı ses
      eşdeğer.
- [ ] **UI-03.2 — Hold/Charge/LongPress.** İşlevsel zaman eşiği politikasını koru;
      pointercancel/capture kaybı/ikinci işaretçi/görünürlük/devre dışı durum sırasında
      iptal. Kapanır: odak/kol eşdeğeri ve ilerleme durumu, azaltılmış harekette basılı
      tutma işlevi, erken bırakma/başarılı eşik/tekrar tekil.
- [ ] **UI-03.3 — Aktif oyun regresyonları.** VOL.TEST mevcut duraklatma/ayarlar
      tüketicisinde Button/IconButton/Hold gerçek yerleşim/geri/Slider adı ve hit-test
      sorunu; yeni menü yok. Slider erişilebilir adı/tıklama alanı geometrisi
      düzeltmesini UI-05'e bırakıp pilotu sahte temiz sayma. Kapanır: gerçek
      ayarlar/duraklatma test örneği Chromium+WebKit ve eldeki cihazda; eski duraklatma
      UI sesleri ile yeni sağlayıcı aynı sesi iki kez üretmez; oyun SFX/ambiyans
      değişmez.
- [ ] **UI-03.4 — Pilot teslim.** Varsayılan/ember önce-sonra karşılaştırması, 30%
      uzatılmış etiket, 6 hane, hareket videosu/iptal, kanonik ses örneği,
      fare/kol/dokunma. Kapanır: ölçülen ilk yanıt p95<100ms, CPU/ekrana sunum profili,
      başlangıç referansı farkları tek tek incelenir; görsel beğeni
      yapılmadıysa açık kabul kalır; ses teknik QA ile kabul edilir. Tasarım grameri kanıtı M1'in yayılan
      referansıdır.

Faz testi: primitives/Button/IconButton/Toolbar ve buttons modül adlı yeni testler,
interactionContract/valueInteractionContract, gerçek oyun E2E.

### UI-04 — KARTLAR / M2

Ön koşul UI-03.4 (M1 pilot kabulü). Sahip `core/src/ui/cards/`, ilgili HUD nadirlik tokenı tüketicisi.

- [ ] **UI-04.1 — Kart yüzeyi ve CardTile sözleşmesi.** Rarity bağımsız nötr kart
      mevcut Panel/Text/Button bileşimi ve ortak CORE card skin'iyle gösterilir;
      CardTile aynı yüzey üstüne rarity katmanı ekler. Nötr örnek için zorunlu
      rarity alanı sessizce optional yapılmaz ve ikinci vitrin bileşeni kurulmaz.
      Mevcut CardTile rare/epic/legendary, SlotGrid common/rare/epic ayrı kalır.
      `disabled`/`setDisabled` mevcut primary-action anlamını korur; secondary
      eylem ve drag kendi durumlarıyla sınanır. Ek bir tüm-kart kilidi gerekirse
      additive ayrı API ve public lock ile tanımlanır, legacy disabled semantiği
      değişmez.
      Nadirlik×4 durum, kilitli/devre dışı/kompakt/salt sunum/birincil/ikincil/sürükleme
      matrisi. Kapanır: ikincil eylemin devre dışı bırakılma politikası açık ve
      regresyon testli; etiket/arka plaka/token çerçeve+plaka; nadirlik için renk
      dışında işaret; uzun başlık/açıklama/6 haneli fiyat hiçbir aksiyonu gizlemez.
- [ ] **UI-04.2 — Picker ailesi.** CardPicker/LevelUpPicker/ShopPicker: 40ms kademeli
      giriş/1.04 seçili ölçek, reroll/lock/insufficient/empty/error/loading; ürün kuralı
      opt-in tarifte, durum modelden gelir. Kapanır: son seçimin tek niyeti,
      modal/geri/odak geri yükleme; hızlı yeniden giriş/kaynak temizliği/ayrılma için
      zaman aşımı yedeği; fareyle hover, kol/dokunma seçimi eşdeğer.
- [ ] **UI-04.3 — SwipeableCardStack ve drag alternatifleri.** Eşik/alt düğmenin niyeti,
      iptal/lost capture, yön/RTL; klavye/kol/dokunma önce/sonra/seç eylemi. Kapanır:
      sürükleme tek yol değil, yerleşim kayması yok, azaltılmış harekette son seçim
      aynı; ARIA seçimi odaktan ayrı.
- [ ] **UI-04.4 — Kart kabulü.** Üç mevcut nadirlik ve iki tema; durum ekran görüntüsü
      örnekleri, ses/haptik niyet sondası, 30%/200%/6 hane. Kapanır: sadece kapalı
      seçici görüntüsü değil gerçek açık/boş/disabled/ayrılma durumları iki motorda
      sınanır; referans ve özgün fark incelenir.

### UI-05 — PANEL + FORM + AYARLAR

Ön koşul UI-03.4 (M1); tier-1 kısmi M3. Sahip primitives/layout/overlays; yeni oyun ayar paneli
icat edilmez, mevcut SettingsForm/Row güçlendirilir.

- [ ] **UI-05.1 — Adlandırılmış editör ve değer niyeti.** Input/TextArea/NumberStepper/
      Slider/RangeSlider etiket→denetim bağı, açıklama/hata kimliği ve yerel semantik,
      min/max/clamp/disabled/readOnly; klavye Home/End/yön tuşları kontrolün kendisinde.
      Kapanır: canlı önizleme/tek kalıcı değişiklik/iptalde geri alma/sessiz programatik
      ayar testleri, dikey range geometrisi/AT, saydam hit-test; IME bileşimi sırasında
      Enter formu göndermez; HTML sayı editöründe seçim API farkı güvenle ele alınır.
- [ ] **UI-05.2 — Seçim denetimleri.** Select açıkken devre dışı bırakma kapatır ve
      odağı geri yükler; aynı değer seçildiğinde sözleşmeye göre yinelenen kalıcı
      değişiklik olayı üretilmez; Checkbox gerçek checkbox/switch kararı,
      RadioGroup/SegmentedControl arrows+Tab, ColorPicker/CurveEditor klavye/tap
      karşılığı. Kapanır: popup/layer geri önceliği, boş/hata/devre dışı/i18n, işaretçi
      iptaliyle biten sürükleme sessizdir; üç durumlu checkbox ancak açık, geriye uyumlu
      ek ihtiyaç varsa.
- [ ] **UI-05.3 — Panel/yerleşim.** Panel/Tabs/Accordion/Tree/Wizard/Carousel, UIRoot;
      çerçeve/başlık/kaydırma dış panelde; gezici odak/odak/seçim ayrı, gizli içerik
      etkileşimsiz. Kapanır: çift kökün kaynak temizliği yinelenebilir, sekme
      değişiminde sahibin kaynakları temiz, 320px/ultra geniş/200%/RTL; uzun panelde
      odak sheet/modal altında görünür.
- [ ] **UI-05.4 — SettingsForm/SettingsRow.** Bölüm/satır/açıklama/reset/
      değişiklik/uygula/geri al/hata/meşgul desenini model ve isteğe bağlı tarif
      arasında ayır. Kapanır: Escape/geri sırasında kaydedilmemiş değişim kararı
      tüketicide, devre dışı/kaydediliyor tekrar commit yok; device/synced kapsamlı
      depolama ve atomik kalıcılık mevcut; görünür form etiketi/yardım metinleri
      çevrilir.
- [ ] **UI-05.5 — Form kabulü.** Bütün kontrol test örnekleri yalnız kol, yalnız klavye,
      dokunma, %30 ve 6 hane; mevcut kol-adım davranışıyla uyum sınanır. Kapanır: bileşik denetimin yön tuşu FocusNav tarafından alınmaz; durum
      matrisi + axe/eksik değerlendirme + modal örtüşme testi; sessiz setter değişimi
      tüketici uyum testiyle teslim edilir.

### UI-06 — Tek VOL.SHOWCASE ve Windows native temel / M4

UI-06.1 tamamlandı (Kapatılanlar); UI-06.2–06.4 UI-05'i beklemez. Sahip vitrin/kalite/platform; isim göçü tek atomik konu, Windows kabuğu ilk teknik referanstır. Oyun kaynaklarına bağımlılık kurulmaz.

- [ ] **UI-06.2 — Aracın native crate'i ve kapı kapsamı.** Yeni
      devtools/vol-showcase/src-tauri/ ortak `tauri-v2` kütüphanesini tüketir; kendi
      bağlamı/kimliği/ikonu/asgari yetenekleri. Yaşam döngüsü kaydına bulunmayan `kind`
      anahtarını ekleme; kök Cargo glob/tek lock kullan. AppIdentity, plugin üçlü kayıt
      ve productIcons aktif native uygulama keşfi ihlal örneği. Kapanır: native araç
      ikon/ID yinelenen/eksik kayıt örneği düşer; tauri bundle.category ve desktop
      Categories Game kopyası değildir.
- [ ] **UI-06.3 — Platform ayarı ve görünür kabuk.** Mevcut oturum/runtime/
      DisplayModeController/scopedStores/haptiks adaptörleri; gamescope etkisiz
      seçenekler capability'den, Android desktop UI yok. Kendi ölçeği/ikonu, teşhis
      yeteneği ve web yedeği. Kapanır: native kaynak taşıyan plugin yalnız gereken
      uygulamada; pnpm dev web bakışı; başlatma/kaynak temizliği/dil değişimi kök veya
      sağlayıcı sızıntısı oluşturmaz.
- [ ] **UI-06.4 — Windows temel ve ayrı Linux/Deck teslim.** İlk native Windows
      açılışı ve UI-00.6 WebView2 sondası teknik referanstır. AppImage/steamrt4 AppDir,
      launcher/desktop/binary identity; var olan `pnpm deck` workspace aracı
      deploy/run/shot/measure sözleşmesi kopyalanmadan kullanılır. Kapanır: laptopta
      görünür native pencere, Deck host+SLR4 açılış/OGG/UI sesi, yalnız kol kullanımı,
      ekran görüntüsü ve ısınmış performans ölçümü; compile/devkit stub gerçek platform
      PASS sayılmaz. Cihaz yoksa kabul açık kalır.
      UI-00.6 ölçüm sondasını gerçek Linux/Deck WebView oturumuna bağla; aynı-frame CPU
      atfı/presented-frame scope ve A/A gürültü kalibrasyonunu teknik teslimde göster. Desteksiz
      metrik açık kabul engelidir.

Faz testi: quality/appIdentity/productIcons/catalog/layers/ports/cargo/plugin fixtures,
contract/rust/build/bundle, iki motor web E2E, gerçek native sonda.

### UI-07 — i18n, font ve tema yayılımı / M5 + M6

Ön koşul: UI-07.1–07.3 için UI-00.1; UI-07.4 için UI-01.2 ve UI-06.1. Sahip core i18n/UI/vitrin, mevcut motor yeniden yazılmaz.

- [ ] **UI-07.1 — Görünen metin sıfır açık.** 830 vitrin/63 CORE başlangıç anahtarını
      AST/fixture üzerinden yeniden tara; adlandırma/ölü anahtarlar, çalışma anındaki
      dinamik önek gerekçesi; XPBar Lv ve erişilebilirlik etiketi dahil. Kapanır: TR/EN
      parite/ölü/hardcoded kapıları; modül düzeyinde t() çağrısı yok; açık
      Modal/Popup/OSK dahil languageChanged temizliği, eksik anahtar örneği görünür
      başarısızlık üretir; mevcut motor/kalıcılık davranışı korunur.
- [ ] **UI-07.2 — Çoğul/biçim/RTL ve uzunluk.** i18next JSON `count`+Intl, metin
      rolü/tablo hizalı sayılar; deterministik 30% uzatılan yapay dil. `lang/dir`,
      logical CSS/arrow/picker/swipe; RTL temel sınaması gerçek çeviri iddiası taşımaz.
      Kapanır: 0/1/çok, tarih/birim/6 hane, Türkçe ı/İ; görüntüleme sıralaması
      manifest/replay sırasına sızmaz; 200%/320px eylem etiketleri kırpılmaz.
- [ ] **UI-07.3 — Font varlığı.** Mevcut download-fonts hattı ve subset manifest
      lisans/kaynak; gerçek glif sınırları, Türkçe kapsamı, yedek font tabanı/satır
      yüksekliği ve soğuk önbellek. Kapanır: font-ready ve yükleme hatası örneği; tema
      değişiminde asenkron font yüklemesi yerleşimi kaydırmaz; Deck glif yüksekliği
      gerçek ekran örneği; Android 200% doğrusal olmayan font ölçekleme ayrı native
      probe.
- [ ] **UI-07.4 — Tema laboratuvarı ve üst bar.** Onaylı Tema sekmesi + genel
      tema/dil/yoğunluk seçicisi; önizleme kapsamları/body portalları ve Canvas sabit
      renkleri CurveEditor/Minimap dahil. Kapanır: 2 tema×3 yoğunlukta kontrast/odak
      durumları; Chromium CLS ve bütün motorların geometrisi; tema geçişi anlık;
      durum/kaydırma/odak/seçim sabit; bilinmeyen kayıtlı tema varsayılana döner;
      varsayılan piksel temeli ember kabulünden ayrı.

### UI-08 — HUD ve erken tier-1 kapsam kontrolü

Ön koşul UI-03.4 ve UI-07.1. Sahip feedback/hud/tarif; oyun durumunu sunum tutmaz.

- [ ] **UI-08.1 — Bar/XPBar/Counter/ResourceCounter/ResourceBar/TimerBar/
      RoundCounter/FloatingTextManager.** Boş/dolu/geçersiz eşik/çoklu kazanım/6 haneli
      düşüş/meşgul/hata, role/valuetext; opt-in applyXPGain ayrı kural. HUD 200/80/sayı
      hazır ayarı ve arka plaka. Kapanır: reduced-hareket sayı/son durum tam,
      havuzlama/kaynak temizliği temiz; TimerBar işlevsel zamanı hareket tokenı
      sayılmaz; XP label TR/EN formatter uyumu; ekran okuyucuya aşırı duyuru yok.
- [ ] **UI-08.2 — FpsMeter/MinimapPanel/SelectionInfoPanel/StatsPanel.** Mevcut VOL.TEST
      FpsMeter/Minimap gerçek test örneği; boyut değişimi/zoom/kapsamı belirli tema,
      işaretçi kontrastı/renk dışı işaret/ikon/okunabilirlik. Kapanır: HUD işaretçi
      geçişi/girdi katmanı örtüşmesi doğru; mini harita görünümü durum/tüketici modeli,
      oyun dünyası fiziği/performans ayarı bu göreve karıştırılmaz.
- [ ] **UI-08.3 — ActionBar/BuildMenu/SkillTree/SlotGrid.**
      Seçim/kilitli/kullanılamayan/bekleme süresi/boş ve yerel nadirlik;
      klavye/kol/dokunma. Kapanır: resolveSkillStates isteğe bağlı kural kalır;
      hover/Tooltip ve sürükleme/dokunma alternatifi; sunumda altın/yetenek durum
      defteri yok; anlamsal olay tekil, kısa etiket ve uzun 6 haneli fiyat.
- [ ] **UI-08.4 — Erken tier-1 kapsam kontrolü.** ScrollView için UI-05 referans
      klavye/odak/overscroll kanıtını tamamla; UI-10 ileri pan ayrı kalır. Kapanır:
      UI-03 / UI-04 / UI-05 / UI-08'in sahibi olduğu applicable durumlar assertions'a bağlı;
      Text/Icon/Joystick (UI-10), Modal (UI-09), Glyph/InputPresentationController
      (UI-12) kalan görev olarak görünür. Hazır ilan edilen alt kapsamda eksik
      durum gate'i düşürür; bütün tier-1/M3 kapanışı yalnız UI-13.1'de yapılır.

### UI-09 — Overlay, bildirim ve veri yüzeyleri

Ön koşul UI-03.4 ve UI-05.1. Sahip overlays/data/layout; bütün ailelerin katalog karşılığı.

- [ ] **UI-09.1 — Modal/Sheet/Popup/Popover/ContextMenu/CommandPalette/
      RadialMenu/DialogueBox/showConfirm/showFatalStartupError.** Katmanın ilk
      odağı/odak sınırı/etkileşimsizlik/adı/odak geri yüklemesi/tek geri olayı; uzun
      içerik/portal/dışa tıklama/iç içe işaretçi. Kapanır: 3 katmanlı yığın doğru LIFO,
      diyalog giriş/çıkış ayarı ve iptalde kaynak temizliği, 200%/IME focus örtülmez;
      fatal klavye/AT bağımsız, destroy çağrısında body katmanı/dinleyici kalmaz.
- [ ] **UI-09.2 — Tooltip/RichTooltip ve ToastManager.** Kalıcı hover/odak, Esc, balona
      geçiş, dokunma/kol yardım alternatifi; 3 bildirimlik kuyruk, kritik
      öncelik/eylem/hover ve odakta durma/durum/geçmiş. Kapanır: 3s sonunda zorunlu
      gizleme yok; acil bildirimler sessizce düşürülmez; olay salkımı ve kaynak
      temizliği deterministik, oyun HUD'ı üstüne kontrol kapatılmaz, AT dinlenir.
- [ ] **UI-09.3 — DataTable/Kanban/EventLog/KeyBindingList.** Hizalama/alternatif satır
      rengi/sıralama/sayfalama/sanal öğe sayısı; sabit kimliğe göre fark; Kanban
      sürükleme+tıklayarak taşıma, klavye düzenleme/odak, tuş bağlama çakışması/boş
      durum/yeniden bağlanan glif. Kapanır: Tab/yön tuşu semantiği mantıksal, boyut
      değişimi/%30/%200/RTL, sanal öğe odağı kaybolmaz; model farkı ve pointercancel
      regresyonu; üretim iş kuralları yok.
- [ ] **UI-09.4 — Diyalog deseni/yönlendirici işaret/yasal metin.** Var olan
      Modal/Panel/ Button/Text bileşim tarifi ile yıkıcı işlem/çıkış/izin/ genel
      yerel/uzak kayıt çakışması, ilk kullanım yönlendirmesinde atla/geri/hedef kaybı,
      katkılar/yasal metin okuma. Yeni public bileşen yalnız tekrar kullanılabilir eksik
      kanıtlıysa, kaynak ağacını yansıtan test/vitrin/export aynı commit'te. Kapanır:
      taklit yerel/uzak çakışmada niyet/hata/bekleme/yeniden deneme/iptal açık; gerçek
      Steam AutoCloud entegrasyonu diye sunulmaz, kimlik doğrulama/izin motoru icat
      edilmez.

### UI-10 — Dokunma, yükleme, kaydırma ve çalışma alanı

Ön koşul UI-03.4; UI-10.1 ayrıca UI-03.2. Sahip touch/camera/layout/text; kalan aktif ve katalog
bileşenlerinin yaşam döngüsü.

- [ ] **UI-10.1 — DirectionButton/DPad/Joystick/SquareJoystick/SwipeGestureZone/
      MultiTouchZone/PullToRefresh.** Birinci/ikinci işaretçi sahipliği, iptal/capture
      kaybı/görünürlük/kaydırma çakışması; joystick deadzone/smooth tüketici politikası
      mevcut, UI'de tank kuralı yok. Kapanır: VOL.TEST oyunu joystick/hold testi; yalnız
      dokunma ve klavye/kol eşdeğer anlam; gesture süresi/pinch işlevi reduced-hareket
      yüzünden bozulmaz.
- [ ] **UI-10.2 — DualAxisScrollPanel/ScrollView/VirtualList/KeyedVirtualList/
      SplitPane.** Etkileşimli alt öğe istisnası, sürükleme eşiği, birincil işaretçi,
      klavye/dokunmayla kaydırma, etkileşimsiz sanal öğeler, sabit anahtarlar ve yatay
      taşma davranışı, resize. Kapanır: pointerdown anında alt düğmenin niyeti alınmaz;
      iptal edilen sürükleme tıklama üretmez, capture kaybı sonrası kaynaklar temiz;
      sıralı odak/sanal kaydırma korunur; %200 dış panel kaydırması ve 24/44 kaydırma
      tutamağı politikası.
- [ ] **UI-10.3 — PauseResumeButton sunum/tarif ayrımı.** Mevcut constructor ve
      callback bildiren `setRunning` sözleşmesi tüketici taramasıyla korunur.
      Yeni additive sessiz state-sync metodu, ayrı kullanıcı intent yolu ve
      opt-in sayaç tarifi sunulur; eski `setRunning` callback davranışı geçiş
      notuyla korunur, accepted intent sesi üretmez. Eski counter seçeneği ince
      recipe delegasyonu ile uyumludur; breaking kaldırma ayrı API işidir.
      Kapanır: legacy setter/callback, sessiz sync, user toggle, initial running,
      counter completion, freeze, pointercancel ve destroy ayrı regresyonlar;
      disabled/focus/timeout sahipliği; public sınıf silinmez ve vitrin sayaç
      hatasını maskeyle gizlemez.
- [ ] **UI-10.4 — LoadingScreen/Text/AnimatedLabel/Icon/Toolbar/PropertyField/
      CanvasViewportController/WorldCameraController/PinchZoomController.** Gerçek
      hazır/hata/yeniden deneme/iptal ve ilerleme yüzdesi; çalışma alanı
      kaydırma/büyütme/ özellik doğrulama/salt okunur/tuş ipuçları; metin sayıları/ikon
      ad alanı. Kapanır: asgari yükleme süresi 500ms isteğe bağlı, meşgul durumu ilk
      yanıtı <100ms, iptal/ömür zamanlayıcı güvenli; yüklemede sürekli ses varsayılan
      değil; bütün hareket/Canvas renkleri kapsamlı, parmakla büyütmeye alternatif
      düğme/tuş, destroy/çıktı gözlemcisi temiz.
- [ ] **UI-10.5 — Palette ve ileri katalog kanıtı.** Her aile durum örneği, public
      yardımcı sayıları, eylem gezinmesi/grid ARIA gerekçesi. Kapanır: registry katalogdaki
      başlangıç sınıflarının tamamı+yeni exportlar tam; çalışma alanı ve renk paletinde sınırlı renkle
      okunabilirlik; kullanılmayan API yalnız tüketicisiz diye ölü sayılmaz; tier-2
      beklerken erişilebilir kalır.

### UI-11 — Metin oturumu ve Android / M7 alt faz

Ön koşul: UI-11.1–11.2 için UI-05.1, UI-11.3–11.4 için UI-06.2 ve Android cihazı. F04.2'nin karşıladığı eski sonuç/odak/sağlayıcı temizliği tekrarlanmaz (D9). Sahip CORE
textEntry/platform + Tauri adaptörü + vitrin Metin Girişi laboratuvarı.

- [ ] **UI-11.1 — Sahip/oturum/IME bileşimi.** Mevcut
      `core/src/ui/textEntry/textEntry.ts` sağlayıcı/kip sondası yeniden kullanımı;
      önerilen `TextEntrySession.ts` ve abort/selection gruplama. OSK Türkçe/İngilizce
      düzeni, dil değişimi, Unicode grafem/silme ve maxLength birimleri, multiline/
      password/readOnly/disabled; açık oturumun sahibi için public iptal/kaynak
      temizliği yolu. Kapanır: eski asenkron sonuç yeni veya yok edilmiş alana yazamaz
      ve yeniden odak veremez; sağlayıcı değişiminde eski sahibin temizliği yeni sahibi
      silmez; tek bekleyen istek/zaman aşımı/geri/Escape/iptalde seçim geri yükleme; IME
      bileşimi sırasında Enter göndermez; OSK diyalog adı/odak sınırı ve açık ekran
      görüntüsü örneği.
- [ ] **UI-11.2 — Native menü ve pano.** `core/src/ui/nativeMenus.ts` +
      `tauri-v2/src-tauri/src/native_menus.js` düzenlenebilir alan istisnası; ilgili
      mevcut test beklentilerini yeni sözleşmeyle değiştir. Önerilen CORE
      ClipboardAdapter + web/native adaptörü; resmî eklenti ancak uygulama tüketimi ve
      yetenek ihtiyacı kanıtıyla. Kapanır: yapıştırmayı kullanıcı başlatır; salt okunur
      alanda Kopyala/Tümünü Seç var, Kes/Yapıştır yok; parolada platform varsayılanı
      olarak Kopyala/Kes kapalı, Yapıştır açık; izin reddi/yetenek yokluğu/boş durumlar
      akışı bozmadan ele alınır; odak yoklaması ve pano içeriği günlüğü yok, hassas
      içerik bayrağı garantisi ancak Android köprüsü bayrağı gerçekten yazarsa; yaşam
      döngüsünde geç sonuçlanan Promise güvenli.
- [ ] **UI-11.3 — Android Activity/ActionMode/Insets.** Uygulamanın izlenen MainActivity
      sınıfı `onWebViewCreate` kancası; üretilmiş Tauri/WryActivity düzenlemesi yok.
      Önce standart WebView seçim menüsü; gerekiyorsa dar Kotlin Plugin load/onDestroy
      geri çağrısı ve native WindowInsets sağlayıcısı. CSS pikseline dönüşüm, native/web
      arasında tek iç boşluk sahibi ve klavyenin örtmesi ayrı. Kapanır: gerçek cihazda
      kes/kopyala/yapıştır/tümünü seç/seçim tutamaçları/uzun basış,
      bar/cutout/rotation/adjustResize/fullscreen/bölünmüş/yüzen IME; hayalet iç boşluk
      yok, imleç ve kalıcı değişiklik erişilebilir; işletim sistemi geri olayını
      ActionMode/IME tüketirse CORE'a ikinci geri olayı gitmez, predictive/hardware back
      ayrı sonda.
- [ ] **UI-11.4 — Metin Girişi sekmesi + APK.** Yetenek/taklit ve native ayrımı,
      sağlayıcı var/yok, hata/yarış/güvenli giriş/dil ve klavye örnekleri; uygulamanın
      Android yapılandırmasında asgari izin/yön politikası araca uygun. Kapanır:
      fiziksel Android son build APK açılır; OS/WebView/Tauri/Wry/ pencere bayrağı
      bilgisi, 200% sistem fontu ve %200 web ayrı; ekran görüntüsü/video kendi vitrin
      örneğinden; erişilmeyen Samsung NOT-RUN, başka Android'in sonucu Samsung PASS
      değildir.
      UI-00.6 sondasını gerçek Android WebView sürümüyle bağla ve kalibre et; JS/DOM/OS sunum
      scope farkı raporda görünür, browser emülasyonu native ölçüm diye sunulmaz.

Faz testi: kaynak ağacını yansıtan textEntry/Input/TextArea/nativeMenus/platform, Tauri
adaptörü testleri, Kotlin politikası ve gerçek WebView ölçüm araçları/sondası;
Chromium+WebKit taklit sağlayıcı E2E cihazın yerine geçmez.

### UI-12 — Deck metin/glif ve Windows / M7

Ön koşul: UI-12.1 için UI-11.1, UI-12.2–12.3 için UI-03 (12.3 ayrıca UI-02.4), UI-12.4 için UI-06.2 ve UI-11.2; Linux/Android fiziksel kabulü ayrı açık kalır. Sahip
tauri-v2/platform ve native SHOWCASE.

- [ ] **UI-12.1 — Steam metin sağlayıcısı.** Mevcut
      `tauri-v2/src/platform/steamworks.ts` ve plugin `service.rs` parola
      isteği→Password modu, yüzen tek/çok satırlı giriş yönlendirmesi ve sahibin iptali.
      Kapanır: diyalog sonucu ile yüzen klavyenin işletim sistemi tuş olayı ayrı
      testler; submit/ iptal/timeout/katman kapalı/TR/CJK/emoji/parola maskesi/ikinci
      istek/ destroy/uyku/devam gerçek Steam runtime sondası; AppID 480 veya başarılı
      IPC gerçek ürün kabulü diye sunulmaz; mevcut OSK yedeği korunur.
- [ ] **UI-12.2 — Eylem glifi ve kol geçişi.** InputPresentationController/
      Glyph/GlyphFamilyContext ile etkin eylem kaynağı köprüsü; remap, hotplug/çoklu
      kol/Steam Input kapalı/trackpad/fare/klavye. Kapanır: gerçek bağlama glifi ile
      aile yedeği açık ayrılır; keyfi dosya sistemi izni yok; odak/kol işaretçisi için
      çift sahip yok; Deck ekran klavyesi/menüleri/diyalogları yalnız kolla bütün
      işlevlere erişir.
- [ ] **UI-12.3 — Haptik/native yaşam döngüsü.** Mevcut hidraw/evdev/Steam/ Android
      sürücülerini yeniden kullanma, açık Test düğmesi/durum; yanlış yetenek bildirimi
      ve yetenek yokluğu. Kapanır: sıfır/kapalı durum sessiz, tek sürücü; uyku/odak
      kaybı/cihaz çıkarma/çıkışta durma gerçek sonda; hissiyat kullanıcı beyanı ayrı,
      A20 zamanlayıcı mimarisi kullanıcı kapsamı dışında kalan yan yeniden düzenlemeye
      dönüşmez.
- [ ] **UI-12.4 — Windows yükleyicisi ve metin laboratuvarı.** NSIS gerçek Windows
      derleme/yükleme/kaldırma/açılış, WebView2 kullanılabilirliği, DPI 125/150/200%,
      font/input/clipboard/back. MSI istenirse ayrı gerçek build/test; Windows ortamı
      olmadan Linux çapraz derlemesi PASS değildir. Kapanır: asgari eklenti izinleri ve
      kendine özgü kimlik; ekran görüntüsü+build özeti; depolama yazıcısı var olan kök
      açık iş sınırıyla çapraz raporlanır.
      UI-00.6 sondasını gerçek Windows/WebView2 ortamına bağla; frame/CPU atfı ve sunum probu A/A
      ile kalibre edilir. Eksik trace desteği açık kabul engelidir.

### UI-13 — Tam kalite, çapraz kabul ve teslim

Ön koşul bütün önceki fazların kod/kapı kapanışı. Sahip bağımsız kalite incelemesi;
eksik cihaz/insan alt görevleri görülmeden sürüm tamamlandı sayılmaz.

- [ ] **UI-13.1 — Tam tier-1 / M3 ve katalog kapanışı.** CATALOG'daki 89 sınıfın tamamı ve runtime
      yardımcıları yeni dışa aktarımlarla yeniden çıkar; Tier-1 tam durumlar/Tier-2
      gerekçeli N/A, 15 sekme ve CONTRACT'taki uygulanabilir gereksinimler. Kapanır: ertelenmiş applicable durum
      ve açık uygulanabilir AA bulgusu sıfır; registry gerçek
      test doğrulaması bağlantısı tam; yeni API/public yüzey kilidi/belgeler/README/i18n
      uyumlu; kaldırılan yollar güncel olmayan referans bırakmaz; kullanılmayan
      bağımlılık/anahtar/varlık yok; modül döngüsü ve 1000 satır sınırı korunur.
- [ ] **UI-13.2 — Etkileşim stresleri.** İç içe modal→Select→OSK→IME geri akışı, istek
      beklerken tema/dil değişimi, hızlı tekrar/yükleme iptali, 200% boyut
      değişimi/RTL/multidokunma/kol/dokunma geçişi/hotplug, askıya alma/kaynak
      temizliği/devam ve sessizleştirme/ses erişimini açma; odak/video/ses olay zaman
      damgaları. Kapanır: kayıp odak/yinelenen kalıcı değişiklik/kalan kaynak/eski sonuç
      yok; iki motor/durum/axe/geometri/determinizm/UI niyeti testlerinin tamamı
      başarılı.
- [ ] **UI-13.3 — Gerçek cihaz/performans.** Linux dizüstü, Deck host/SLR4, Android
      profili ve Windows UI aynı test örneğiyle eşleştirilmiş A/B; VOL.TEST statik
      HUD/slalom/fizik/çoklu tank/yoğun hava farklı yükleri sabit tohum ve girdilerle.
      Kapanır: CPU %5 güven sınırı/gürültü ve ekrana sunum ayrı sınanır; UI ek maliyeti
      kök neden olarak toplam oyun FPS'inden ayrılır; mevcut Deck p95≤18ms işi veya
      Lenovo ağır yük işi açıkken bütün ürün geçti denmez; 10dk termal
      koşul/oturum/soğuk açılış ve uyku/devam kapsamı açık; bilinmeyen GPU NOT-RUN.
- [ ] **UI-13.4 — İnsan erişim/görsel/haptik.** Yalnız klavye/yalnız kol gerçek akış,
      seçilen masaüstü AT + Android TalkBack + Windows NVDA/Narrator; TR/EN/200%/yalnız
      renk/gri tonlama, gerçek glif yüksekliği, dokunma haptikleri. Kapanır:
      yapanın gerçek beyanı ve kullanılan profil kaydı; eksik donanım profili açık
      kabul, otomatik axe sonucu insan kabulü değildir; ses üretimi UI-02.5'in
      teknik kabulüdür, zorunlu dinleme beyanı bu göreve taşınmaz.
- [ ] **UI-13.5 — Sürüm adayı teslimi.** `pnpm signoff`, source/manifests/ public
      yüzey/paket boyutu/ölçekleme/yerel kapı bileşimi; değişen varsayılan piksel
      temelleri incelenmiş; bütün belgeler güncel, canlı eski yol referansları sıfır.
      Kapanır: high/signoff ve gerçek kabul ayrı PASS/FAIL/NOT-RUN raporu;
      açıklanmış git durumu; kalan her iş kök/paket TODO'da gerçek ölçütle açık.

## Kapatılanlar

Planın hazırlanmış olması bir üretim görevini kapatmaz; yalnız kapıdan geçmiş iş buraya taşınır.

- [x] UI-00.1 — `core/src/ui/index.ts` yüzeyi (89 sınıf, 29 yardımcı, 205 tip) AST'den çıkarılır; her sınıf/yardımcı `registry.json`'da tekil kayıtlıdır ve kapı kaydı yüzeyle, VOL.TEST tüketimiyle (17 sınıf doğrudan), vitrin kullanımıyla ve gerçek `it`+`expect` kanıtıyla karşılaştırır. Eski isim-geçişi bekçisinin yorum/metin mention'ını gösterim saydığı 9 yer ve kanıtsız 5 öğe (sahip görevli gap) ortaya çıktı.
- [x] UI-00.2 — Vitrinin 7 E2E dosyası Chromium ve WebKit'te koşar (40 → 68 test, 2,1 dk); tek istisna Chromium piksel temelidir ve `e2eConfig` bekçisi dosya listesini raporlar, gerekçesiz asimetriyi ve ölü istisnayı reddeder. WebKit'te çıkan tek kusur (`user-select` hesaplı stili yalnız ön ekli) testin motor farkıydı, CSS doğruydu. Linux temelleri WSL'de 6/12 yeniden üretildi: Linux hücresi doğrulanmamış.
- [x] UI-00.6 — Çalışan tarayıcı probu ve profil uygulanabilirliği: `devtools/vol-showcase/tests/e2e/support/frameProbe.ts` aynı kare atfını (CDP izinden JS, stil, yerleşim, boyama, commit, zorlanan yerleşim; `BeginMainThreadFrame.frameId`), girdi→görünür bağını (olay damgası, iz saati hizalaması) ve A/A/iz maliyeti kalibrasyonunu küçük fixture ile kurar (`probe.spec.ts`: bilinen 5 ms ve 25 ms yük bulunur, boşta kare medyanı <1 ms, araç olayları sayılmaz); WebKit'te iz `unsupported`. Native: Android 14 tablette VOL.TEST için resmi `dumpsys gfxinfo framestats` yolu GERÇEKTEN çalıştı (530 kare, 120 Hz, sunum p50 32,2 ms, işleme p95 8,8 ms, girdi işleme→sunum p50 31,4 ms) ve `scripts/android/frame-stats.mjs` olarak kalıcılaştı; Windows WebView2 (PresentMon eksik, UI-06.4), Steam Deck (cihaz yok, sunulan kare aracı eksik, UI-12.4) ve Android 16/Samsung (cihaz yok, UI-11.4) için eksik araç/sahip [doğrulama planında](VERIFICATION.md) yazılı. UI-03 pilotunun bağımlı olduğu çalışan browser probu hazır; desteksiz toplam CPU/GPU/sunum hücresi açık sürüm engeli olarak kalır.
- [x] UI-00.5 — İlk referans alındı ve kayıt yöntemi kuruldu: `node scripts/quality/cli/ui-baseline.mjs record <etiket>` (tarif `just ui-baseline`) vitrini ve VOL.TEST'i derler, iki motorda 12 sekmenin dondurulmuş ekran özetini (sha256) ve hareket azaltma kapalı/açık sürekli animasyon kümesini toplar, gönderilen gzip baytlarını ve `ui-perf` özetini ekler ve vitrin paketinin git dışı records alanına yazar; `compare <önceki> <sonraki> [--strict]` bundle büyümesini, ekran değişimini, yeni sürekli animasyonu ve ölçü yitimini kötüleşme sayar. Yeniden sayım: 12 sekme (E2E listesiyle aynı), 17 doğrudan sınıf tüketicisi (+4 yardımcı), vitrin anahtarı **830** (EN=TR; plandaki "821" yeniden üretilemedi, geri alındı), CORE 63. Tekrarlanabilirlik kanıtı: art arda iki kayıt 0 fark verir (24 ekran özeti, bundle baytları dahil). İlk kayıt: vitrin app 141979, css 20241 B; VOL.TEST app 103266, vendor 353881, css 18662 B; hareket azaltma açıkken iki motorun hiçbir sekmesinde sürekli animasyon yok, kapalıyken `vol-dialogue-bounce` her sekmede, `vol-spin` (buttons) ve altı glif animasyonu (text) sürüyor. Cihaz hücreleri: Steam Deck bağlı değil, Samsung ve Android 16 cihaz yok, Android tablet için yerel vitrin ölçümü henüz yok → hepsi NOT-RUN gerekçeli; kök F08/F09 ve VOL.TEST kabul işleri açık kalır.
- [x] UI-00.7 — Gönderilen boyut payı açıldı. Oyuna giden ses bank'ları `scripts/vite/audioBankRuntime.mjs` ile çalışma zamanı görünümüne indirgenir (anahtar, rol, etiket, süre, varlık yolu); hash, manifest, program/PCM özeti, ölçüm ve kalite kaydı yalnız kanonik dosyada kalır, `SoundFamilyBank`, `verifyFamily` ve üretici hattı değişmedi. Ölçülmüş kazanç (VOL.TEST app, gzip, dosya başına ayrı sıkıştırma): 108840 → 103266 bayt, −5574 B ≈ 5,4 KiB (hedef ≥4 KiB); ölçülen app 106,3 → 100,8 KiB. Bütçe 106,3'te bırakıldı: ≈5,5 KiB pay UI-02/UI-03 tüketicisi için ayrıldı (`quality.json` gerekçesi güncel). Sözleşme iki testle korunur: görünüm yalnız çalışma zamanının okuduğu alanları taşır ve provenance sızdırmaz (düğüm testi, her kanonik bank için), `parse(kanonik)` ile `parse(görünüm)` aynı aileyi, filtreyi ve 96 jetonluk deterministik seçimi verir (vitest). Vitrin için iş başına boyut notu UI-02'de vitrin ses bank'ları geldiğinde tutulur; bugün vitrin bank göndermez.
- [x] UI-00.4 — Ölçüm kör noktaları kapandı. Dokunma hedefi ölçümü (`devtools/vol-showcase/tests/e2e/support/geometry.ts`) saydam ama tıklanabilir yerel girişi (kaydırıcı) dışlamaz, gerçek vuruş noktasını `elementFromPoint` ile sınar, `overflow` atasının kırpmasını ve örtüşmeyi ölçer; çizilmediği için ölçülemeyen örnekler ayrı sayılır ve açık altı katman ayrıca ölçülür. Düzeneğin kendisi saydam/örtülü/kırpılan/hayalet hedef fixture'ıyla sınanır. İlk gerçek ölçümde iki motorda aynı 10 kusur çıktı (telefonda sekme şeridi içeriğe 173 px bırakır; kart/BuildMenu/Slider/OSK/EventLog/SplitPane) ve `geometryExceptions.json`'a sahip görevle bağlandı; bayat kayıt testi düşürür. Okunabilirlik: CSS 12 px alt sınırı ile çizilmiş glif yüksekliği ayrı kapıdır; büyük harf mürekkep yüksekliği (tarayıcı kestirimi, Deck ölçümü değildir) Jura 12 px normal/yarı kalın ağırlıkta 9 ekran px altında (UI-07.3). Rapor şeması (`devtools/vol-showcase/tests/e2e/support/perfReport.ts`, `performance.spec.ts`, `latency.spec.ts`): kapsamlar ayrı durumlu (ölçüldü/desteklenmiyor/çalışmadı), `basis` ekrana sunulan kare değilse PASS yok, A/A gürültü ve zamanlayıcı çözünürlüğü 0.05F eşiğini aşarsa yetersiz, NaN 0 sayılmaz. Başsız ölçüm: işaretçi/klavye p95 Chromium ≈31/44 ms, WebKit ≈96/73 ms (olay→sonraki kare yaklaşımı, kabul değil); GPU/sunum/atıflı iz desteklenmiyor; WebKit zamanlayıcı çözünürlüğü 1 ms, Hz bilinen hızlara uymuyor. Tema geometri kayma sondası A/A ve kasıtlı kayma kontrolleriyle hazır; renk tokenı değişimi iki motorda 12 sekmede geometriyi kaydırmaz.
- [x] UI-00.3 — axe (`@axe-core/playwright`, yalnız vitrin devDependency) 5 WCAG etiketiyle 12 sekmede ve 6 açık katmanda (Modal, Sheet, Popup, Popover, Select, OSK) iki motorda koşar; sonuç `axeExceptions.json` ile birebir eşleşmek zorundadır (yeni ve bayat bulgu düşer), her kayıt açık UI görevine bağlı: 50 ihlal ve 39 incomplete. Düzenek bilerek adsız bırakılan girişi ve örtülen odağı yakalar (negatif testler). Durum fixture'ları (`stateFixtures.json`, registry'ye bağlı) 6 katmanda odak ve Escape/odak geri dönüşünü sınar; bilinen kusurlar motor bazında `test.fail` ile izlenir (Modal/Sheet Chromium odak geri yüklemesi UI-09.1, OSK UI-11.1). `ui-check` tarifi eklendi.
- [x] UI-06.1 — Eski vol-ui paketi tek atomik göçle `devtools/vol-showcase` / `@volstudio/vol-showcase` oldu; lifecycle, quality (paket ve bütçe), kilit importer'ı, `justfile`, katalog yolu, testler ve belgeler birlikte taşındı. Eski yol ve paket başvurusu sıfır; CSS `.vol-ui-root` ve `--vol-ui-*` tokenları değişmedi; 24 piksel temeli yalnız taşındı; bütçe 150/1/24 aynı.
