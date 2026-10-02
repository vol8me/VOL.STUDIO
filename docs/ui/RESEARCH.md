# Araştırma zemini ve v5 düzeltmeleri

İnceleme zemini: 2026-10-02, kaynak başlangıcı `b7ad3768`. Kod/AST,
git nesneleri ve birincil web kaynakları çapraz okundu. Graphify mimari
başlangıç noktası olarak sorgulandı; sonuçlar gerçek kaynakla doğrulandı.
Bu belge bir performans/dinleme/cihaz ölçüm günlüğü değildir. Kapsamlı
kapıların plan turundaki sonuçları teslimde ayrıca raporlanır; aşağıdaki
inceleme bulguları kapı geçti iddiası taşımaz.

## Doğrulanmış depo zemini

| Alan          | Mevcut gerçek ve kaynak                                                                                                                                      | Sonuç                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Yaşam döngüsü | `workspace-lifecycle.json`: 7 active paket; `games/vol-test` var                                                                                             | “games yok/6 paket” v5 başlangıcı geçersiz                               |
| Emekli ürün   | Annotated vol-hell/final-2026-09-29 → `3ba8961cadda6ffca07859e07985ae4c14c57ab5`; vol-arachnid/final-2026-09-20 → `6f36163d959753edd641a4af27838f869a71688f` | Arşiv var, canlı tüketici yok; tarihsel kapıların tümü yeniden koşulmadı |
| UI yüzeyi     | `core/src/ui/index.ts`: 13 aile barrel'i + 3 ortak modül; 89 public sınıf, 118 runtime ve 205 type-only export                                               | Yalnız sınıf tablosu bütün API değildir                                  |
| Aktif tüketim | VOL.TEST kaynak importları AST: 17 doğrudan sınıf; Glyph createGlyph üzerinden dolaylı                                                                       | Arşiv kullanım sırası canlı önceliği belirleyemez                        |
| Katalog       | `scripts/quality/catalog.mjs`: vitrin/test kaynak metninde isim bulur; validator sıfır sorun döndürdü                                                        | Gerçek render/state/assertion kanıtı değil; kapı tamamlanmalı            |
| Vitrin        | `devtools/vol-ui/src/ShowcaseApp.ts`: 12 sekme; web-only                                                                                                     | İsim göçü/native/3 lab gelecekteki iştir                                 |
| E2E           | `devtools/vol-ui/playwright.config.ts`: Chromium readability hariç; WebKit yalnız readability                                                                | Her senaryo iki motorda bugün çalışmıyor                                 |
| Tema          | `core/src/ui/colors.ts`: 60 token; `gen-theme.mjs` ilk `:root`u üretir; runtime theme/density yok                                                            | Ember/controller/registry/kontrast/switch yeni mekanizmadır              |
| i18n          | JSON leaf key karşılaştırması CORE63/63, vitrin830/830, oyun49/49; parite farkı 0                                                                            | Çeviri kalitesi/uzunluk/eksik canlı update kanıtı değildir               |
| Ses           | SoundBank default total24/perId4/retrigger0; varyant seeded RNG                                                                                              | UI4voice/120ms/round-robin mevcutmuş gibi yazılamaz                      |
| Haptik        | `core/src/platform/haptics.ts`: default disabled; platform adapterleri var                                                                                   | Default ses açık, default titreşim açık anlamına gelmez                  |
| Native pin    | Cargo.lock Tauri2.11.5/Wry0.55.1; mevcut `onWebViewCreate` hook'u pinli kaynakta var                                                                         | Hayali callback/generated Activity patch'i gerekmez                      |
| Marka         | `docs/assets/mark/vol-studio-mark-1024x1024-transparent.png` mevcut; .github/assets yok                                                                      | Onaylı kaynak niyeti korunur, yol düzeltilir                             |

V5'in Text20/Button11/Panel5/... tarihsel sayıları bu araştırmada yeniden
üretilmedi. AST kapsamı/call-site sayım yöntemi olmadan doğrulanmış envanter
olarak taşınmaz. Arşiv etiketinde tekrar sayım gerekiyorsa yöntem ve tohum
snapshot'a girer; canlı 89 sınıf kaydının yerini almaz.

## Zayıf nokta → karar → kapanış

| ID  | V5 sorunu / kod kanıtı                                                             | Nihai karar                                                                      | Görev                         |
| --- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------- |
| D01 | Oyun yok varsayımı; R1/R2 gerçek active ürünle çelişiyor                           | Glob/bütçe korunur, stale iddiası kapatılır; D0/D1/D2 açık                       | UI-00.5, UI-13.3              |
| D02 | Arşiv tüketimi ve kaba isim sayımı                                                 | Public export AST + direct/indirect/catalog ayrımı; state assertion kaydı        | UI-00.1, UI-13.1              |
| D03 | 4 timing token ama modal140/tab160/HUD80/stagger40 literal                         | Temel + adlandırılmış koreografi presetleri; işlev timer'ı hariç lint            | UI-01.3, UI-01.5              |
| D04 | Görsel pilot ses/tema/i18n temellerinden önce; M5/M6 çok geç                       | Minimum ortak altyapı önce; full rollout sonra; native erken geri bildirim       | UI-01 / UI-02 / UI-06 / UI-07 |
| D05 | Her milestone bütün pixel temelini yenileme                                        | Yalnız bilinçli değişen sahne/state; rename temeli sadece taşır                  | UI-03.4, UI-06.1              |
| D06 | “12px Deck kapısı” yalnız computed CSS ölçüyor                                     | CSS floor ayrı, çizilmiş glyph height ve fiziksel okunabilirlik ayrı             | UI-00.4, UI-07.3              |
| D07 | Saydam Slider input hit testinden atlanıyor; label bağlanmamış                     | Hit-testable opacity0 kontrol dahil; accessible name native editöre bağlanır     | UI-03.3, UI-05.1              |
| D08 | Select.setDisabled açık popup'ı kapatmıyor; aynı değer callback/haptik üretiyor    | Açık disable/focus ve recommit sözleşmesi regresyonla netleşir                   | UI-05.2                       |
| D09 | XPBar default Lv literal; ToolButton sadece Toolbar üzerinden                      | Çevrilen varsayılan, formatter uyumu; bağımsız ToolButton state örneği           | UI-03.1, UI-08.1              |
| D10 | PauseResume kendi interval/defterini tutuyor; setRunning callback'li               | Saf sunum + opt-in counter tarifi, breaking olmayan geçiş                        | UI-10.3                       |
| D11 | DualAxis pointerdown child/threshold/primary ayrımı yok                            | Ortak jest ownership, threshold/child istisnası ve cancel                        | UI-10.2                       |
| D12 | OSK private ownerless open, TRQ sabit; canlı dil/abort yok                         | Sahipli session, TR/EN layout, provider registration token ve stale-result guard | UI-11.1                       |
| D13 | CardTile rare/epic/legendary; SlotGrid common/rare/epic                            | Farklı public tip korunur, ortak renk rolleri API birleşmesi değildir            | UI-04.1                       |
| D14 | Axe yok; v5 tag'lerinde wcag21a eksik                                              | 5 tag, violations/incomplete ayrı; uygulanabilir tüm AA ve manuel AT             | UI-00.3, UI-13.4              |
| D15 | Tooltip mandatory3s; target mouseleave anında hide, Esc yok                        | Focus/hover sürerken persistent, dismissible/hoverable; touch/kol yardım eylemi  | UI-09.2                       |
| D16 | CLS0 veya unsupported API0 sahte başarı; theme click recent-input istisnasında     | Standard CLS + tüm shift entries + iki motor frame geometry                      | UI-00.4, UI-07.4              |
| D17 | UI<%5 tanımsız; Diagnostics render+idle gerçek render maliyeti değil               | Hedef frame CPU p95 confidence/noise, GPU/presentation ayrı                      | UI-00.4, UI-13.3              |
| D18 | Gain→loudness, HPF150–200+bass60–120, duck hold yok                                | Asset/mix ölçümü ayrı; bass ayrı dal; duck120/80/450ms                           | UI-02.2 / UI-03 / UI-04       |
| D19 | “Her interaction ses+haptik”, defaulton loadingloop                                | Intent-once, disabled/mute/unsupported normal; no default continuousloop         | UI-02, UI-03                  |
| D20 | Android35→visualViewport bozuk genel iddiası; #10631 ActionMode kanıtı değil       | OS+WebView+flags feature probe; önce standart forwarding, gerekirse native inset | UI-11.3                       |
| D21 | JS/native menu suppressor editörde preventDefault; Input Enter composing guard yok | Editable exception, native selection, no composition submit                      | UI-05.1, UI-11.2              |
| D22 | TextEntry geç async sonucu destroyed field'i refocus edebilir                      | Abort/owner/registration token, caret/selection ve provider replacement testleri | UI-11.1                       |
| D23 | Steam dialog purpose password rağmen Normal; floating SingleLine sabit             | Masked/multiline route ve native capability; fake≠gerçek Steam                   | UI-12.1                       |
| D24 | Native tool ikon kapısı dışında; lifecycle schema strict                           | Ortak active-native keşfi + fixture; schema'ya gelişigüzel kind ekleme yok       | UI-06.2                       |
| D25 | Cloud dialog ile gerçek Auto-Cloud sorumluluğu karışıyor                           | Generic conflict sunumu; gerçek revision/cloud motoru ayrı ürün kapsamı          | UI-09.4                       |
| D26 | ICU/RTL/font kapsamı mevcutmuş gibi genel hedef                                    | Mevcut i18next plural+Intl; sentinel RTL fixture; measured font subset           | UI-07                         |
| D27 | ≤3/64/1 sayılar performansı kanıtlamıyor                                           | Root-level semanticgrup/particle/blur guard + layer/area/native frame profili    | UI-01.3, UI-13.3              |
| D28 | “19 bölüm” başlığı20 bölüm taşıyor; karar günlüğü repo doktrinine aykırı           | 20 section coverage; güncel sözleşme ve git tarihçesi                            | CONTRACT, COVERAGE            |

Bu bulguların kod etkisi/yeniden üretimi uygulama görevinde testle doğrulanır;
bir aday bütün kullanıcı cihazlarında gözlendi demek değildir.

## Birincil kaynaklar ve kanıt sınırları

### Erişilebilirlik ve widget davranışı

- [WCAG 2.2 normatif metin](https://www.w3.org/TR/WCAG22/): hedef bütün
  uygulanabilir A/AA; Understanding ve APG yardımcı açıklamadır.
- [Target size minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html):
  24×24 CSS px AA ve istisnalar. 44 CSS px ürün kararı;
  [Android dokunma önerisi](https://developer.android.com/guide/topics/ui/accessibility/apps)
  48dp ayrı platform ölçüsüdür; eşit piksel sayılmaz.
- [Resize text](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html)
  ve [reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html):
  %200 ve dar panel kabulü; Android sistem font ölçeğiyle aynı test değildir.
- [Hover/focus content](https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html):
  kullanıcı tetik sürerken okuyabilir/hover edebilir/kapatabilir;
  zorunlu3s timeout uygun bir kural değildir.
- [Focus not obscured](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html),
  [dragging](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html),
  [status messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html):
  sırasıyla katman örtüşmesi, drag dışı tek pointer alternatifi ve odaksız
  duyuru; bütün bildirimleri alert yapmak çözüm değildir.
- [Animation from interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html)
  AAA'dır; reduced-motion ayrıca ürün gereğidir.
  [Flash sınırı](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html)
  yalnız reduced-motion'la otomatik karşılanmaz.
- [APG modal](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/),
  [klavye arayüzü](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/),
  [slider](https://www.w3.org/WAI/ARIA/apg/patterns/slider/),
  [combobox](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/): focus,
  roving/edit mode ve ARIA pattern rehberi; görsel grid'e otomatik role=grid yoktur.
- [axe-core](https://github.com/dequelabs/axe-core): otomasyon sınırlıdır;
  incomplete manuel yargı ister, jsdom gerçek kontrast ölçmez.
- [Valve uyumluluk incelemesi](https://partner.steamgames.com/doc/steamhardware/compat):
  çizilmiş glyph yüksekliği ≥9 px, ≥12 px önerisi; computed font-size bunu
  tek başına garanti etmez. Kol/klavye akışı native cihazda da sınanır.

### Tema, performans ve ses

- [CLS](https://web.dev/articles/cls) yakın input shift istisnasını,
  [Layout Instability](https://wicg.github.io/layout-instability/) entry
  modelini açıklar. [WebKit PerformanceObserver kaynak kodu](https://raw.githubusercontent.com/WebKit/WebKit/main/Source/WebCore/page/PerformanceObserver.cpp)
  incelenen sürümde layout-shift destek listesi taşımaz. Runtime feature detect
  zorunludur; undefined0'a çevrilmez.
- [RenderingNG](https://developer.chrome.com/docs/chromium/renderingng-architecture)
  style/layout/paint/compositor ayrımını açıklar; transform/opacity kesin
  GPU hızlanması garantisi değildir. [Event Timing](https://www.w3.org/TR/event-timing/)
  her gamepad/continuous gesture olayı için evrensel ölçüm sağlamaz.
- [Web Audio GainNode](https://www.w3.org/TR/webaudio/#GainNode) lineer
  amplitude'dür; [EBU R128](https://tech.ebu.ch/loudness/) broadcast program
  ölçüsüdür, evrensel kısa game click hedefi değildir. Uygulanan mixing
  örneğinin gerçek peak ve burst ölçümü gerekir.
- [Web Audio highpass](https://www.w3.org/TR/webaudio/#dom-biquadfiltertype-highpass)
  cutoff altını azaltır; bass/body çelişkisini ayrı dal çözer.
  [Chrome autoplay](https://developer.chrome.com/blog/autoplay/) ve
  [Web Audio uygulama önerileri](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices)
  jest ve kullanıcı kontrolü gerektirir; preference açık diye duyulan ses garantisi verilmez.
- [i18next plurals](https://www.i18next.com/translation-function/plurals) ve
  [formatting](https://www.i18next.com/translation-function/formatting):
  JSON `count`/CLDR ve Intl mevcut çözümü yeterlidir; ICU ayrı plugin tercihidir.

### Native sınırlar

- [Android WebView insets](https://developer.android.com/develop/ui/views/layout/webapps/understand-window-insets):
  fullscreen safe-area M136, tüm WebView IME visualViewport M139, tüm
  WebView system/cutout M144 destek geçişleri. Belge sürüm davranışını
  açıklar; cihazdaki uygulama bayrakları/forwarding ayrıca ölçülür.
- [Tauri #10631](https://github.com/tauri-apps/tauri/issues/10631) eski
  beta.25 visualViewport bug raporudur; güncel sürüm düzeltme garantisi
  veya ActionMode gerekçesi değildir.
- [Tauri mobil plugin rehberi](https://v2.tauri.app/develop/plugins/develop-mobile/),
  [Tauri2.11.5 Plugin.kt](https://raw.githubusercontent.com/tauri-apps/tauri/tauri-v2.11.5/crates/tauri/mobile/android/src/main/java/app/tauri/plugin/Plugin.kt),
  [Wry0.55.1 Activity](https://raw.githubusercontent.com/tauri-apps/wry/wry-v0.55.1/src/android/kotlin/WryActivity.kt):
  `load(webView)`, `onDestroy(activity)` ve `onWebViewCreate` gerçek pinli
  API'lerdir; Kotlin Plugin'de hayali `dispose` hook'u kullanılmaz.
- [ActionMode.Callback](https://developer.android.com/reference/android/view/ActionMode.Callback):
  create/prepare/click/destroy lifecycle; WebView'a TextView selection API'si
  uydurulmaz. Önce standart editör davranışı doğrulanır.
- [Tauri clipboard](https://v2.tauri.app/plugin/clipboard/) setup ve
  capability ister; [Android sensitive clipboard](https://developer.android.com/privacy-and-security/risks/secure-clipboard-handling)
  bayrağı upstream'in her sürümünde otomatik uygulanmış sayılmaz.
- [ISteamUtils](https://partner.steamgames.com/doc/api/ISteamUtils):
  dialog Normal/Password ve floating field key event yolları farklıdır.
  [ISteamInput](https://partner.steamgames.com/doc/api/ISteamInput)
  action-origin glifi/cihaz capability'sidir; Gamepad.id gerçek remap değildir.
- [Linux FF](https://docs.kernel.org/input/ff.html) fd/effect/stop lifecycle
  tanımlar; donanım izin/destek garantisi vermez.
- [Steam Cloud](https://partner.steamgames.com/doc/features/cloud):
  Auto-Cloud istemci eşitlemesi ve RemoteStorage API ayrı yollar;
  gösterim widget'ı revision/merge servisi değildir.
- [Windows installer](https://v2.tauri.app/distribute/windows-installer/):
  NSIS/MSI/WebView2 seçenekleri; Linux'ta derlenmiş olması Windows kabulü değildir.

## Anchor araştırmasının sınırı

Nex Machina, Hades/Dead Cells, Streets of Rage4, Control/DiabloIV,
Mindustry ve Celeste onaylı **estetik esin** seçimidir. V5'teki timing,
voice/gain, partikül ve blur sayıları bu oyunlardan ölçülmedi.
[Mindustry Styles kaynağı](https://github.com/Anuken/Mindustry/blob/master/core/src/mindustry/ui/Styles.java)
ve [Hades geliştirici notları](https://www.supergiantgames.com/blog/hades-updates/)
ürün örnekleridir; kendi renderer/AA bütçemizi doğrulamaz.
[Diablo IV erişilebilirlik yazısı](https://news.blizzard.com/en-gb/article/23954932/combatting-demons-with-accessibility-in-diablo-iv)
font/ikon/okuma kararlarına birincil örnektir, depth/blur maliyeti kanıtı değildir.
[Dotemu Streets of Rage 4 sayfası](https://www.dotemu.com/games/streets-of-rage-4/)
ve [Remedy Control sayfası](https://www.remedygames.com/games/control)
resmi ürün/görsel kaynaklarıdır; bevel/depth seçimi bizim estetik yorumumuzdur.
[FMOD Celeste proje rehberi](https://www.fmod.com/docs/2.03/studio/appendix-a-celeste.html)
geliştirici event açıklamalarının bulunduğu eğitim projesini doğrular.
Rehber okundu; proje indirilmedi/açılmadı/dinlenmedi ve UI süre/gain değeri
çıkarılmadı. Ses paletinin burada dinlenerek incelendiği ileri sürülmez.
Her aile anchor gerekçesi CATALOG'dadır; uygulamada gerçek özgün örnek
incelemesi ve dinleme kanıtı gerekir. Eksik kanıtın yerine oyun adı koyulmaz.
