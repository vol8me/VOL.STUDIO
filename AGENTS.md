# VOL.STUDIO çalışma sözleşmesi

Tauri v2, Phaser 4, TypeScript ve pnpm workspace. Ürün, belgeler ve kod
yorumları Türkçe; identifier'lar İngilizce'dir. Belgeler tek Türkçe kaynaktır.
Bu dosya repo sınırlarını ve ilgili sözleşmenin yerini gösterir.
Alt dizindeki AGENTS.md kendi alanını daraltabilir, kök sınırlarını gevşetemez.

## Repo haritası

| Yol                     | Paket                    | Rol                                              |
| ----------------------- | ------------------------ | ------------------------------------------------ |
| `core/`                 | `@volstudio/core`        | Oyundan bağımsız mekanizmalar ve UI kataloğu     |
| `tauri-v2/`             | `@volstudio/tauri-v2`    | Paylaşılan native kabuk ve platform adaptörleri  |
| `devtools/audio-synth/` | `@volstudio/audio-synth` | Deterministik ses üretimi ve teknik yayın kabulü |
| `devtools/deck/`        | `@volstudio/deck`        | Deck ölçüm sondası ve devkit otomasyonu          |
| `devtools/pen.dev/`     | `@volstudio/pen.dev`     | Pencil kaynağından rig export'u                  |
| `devtools/vol-ui/`      | `@volstudio/vol-ui`      | CORE UI vitrini ve piksel sözleşmesi             |
| `games/vol-test/`       | `@volstudio/vol-test`    | CORE ve kabuğun gerçek oyun tüketicisi           |

Paket durumu `workspace-lifecycle.json` içindedir; frozen ağaç değişmez ve
aktif paket frozen pakete bağımlı olamaz. Yeni ürün: [yeni oyun rehberi](docs/new-game.md).
Kök girdilerin gerekçesi `scripts/quality/rootEntries.mjs` içindedir.

## Mimari sınırlar

- Bağımlılık tek yönlüdür: CORE oyun/devtool import etmez; oyun runtime'ı
  yalnız CORE, kabuk ve dış bağımlılıkları kullanır. Devtool yalnız devDependency'dir.
  Paketler birbirine yalnız exports haritasından girer.
- CORE mekanizma, sunum ve opt-in tarif katmanlarını ayırır; sunum oyun kuralı
  veya kendi durum defterini taşımaz. [CORE tasarımı](core/DESIGN.md),
  [primitifler](core/docs/primitives.md), [Phaser köprüleri](core/docs/phaser-boundary.md).
- Tüketicisiz UI bileşeni bilinçli katalogdur: kendi testi ve vol-ui örneği
  gerekir. Oyunlar ortak UI kullanır; [UI sözleşmesi](docs/ui/CONTRACT.md).
- Listener, timer ve abonelik kapanışta kaldırılır; birden fazla bağımsız
  kaynak `DisposableScope` kullanır. Oynanış sayıları oyunun config ağacındadır.
- Görünen metin i18n anahtarıdır; dil anahtarları eşittir, modül düzeyinde
  `t()` çağrılmaz. [i18n sözleşmesi](core/docs/i18n.md).
- Simülasyon saati, RNG ve audio çıktısı deterministiktir. Kalıcılık adapter
  arkasındadır; ilerleme `synced`, cihaz ayarı `device` kapsamındadır.
- Native kabuk uygulama değildir; bağlam ürün crate'inde üretilir. Eklenti
  JS bağımlılığı, Rust kaydı ve uygulama izniyle birlikte yaşar.
- Asset kaynağı yazara, ara çıktısı üreticiye, gönderilen hâli tüketiciye
  aittir. Oyun build'i devtools olmadan geçer. Audio teknik kabulü
  [audio tasarımındadır](devtools/audio-synth/DESIGN.md); dinleme yayın kapısı değildir.
- `.pen` dosyalarına yalnız Pencil MCP ile erişilir; özel kurallar
  [pen.dev/AGENTS.md](devtools/pen.dev/AGENTS.md) içindedir.

## Kapılar ve kanıt

Kapıların tek kaynağı `justfile`, eşik ve bütçelerin kaynağı `quality.json`'dır.
Kapılar aktif workspace'ten türer; kapsam ratchet'i düşürülmez.
[Kapı sözleşmesi](docs/gates.md) kompozisyonu ve rapor biçimini açıklar.

| Kapı           | Bileşim                                                                                             |
| -------------- | --------------------------------------------------------------------------------------------------- |
| `pnpm quick`   | `contract` `format-check` `typecheck` `lint`                                                        |
| `pnpm fast`    | `quick` `test`                                                                                      |
| `pnpm high`    | `quick` `rust` `lint-css` `coverage` `coverage-shape` `audio-test` `build` `bundle` `scaling` `e2e` |
| `pnpm signoff` | `high` `coverage-audio` `audio-verify` `security-js` `security-rust`                                |

Pre-commit quick ve pre-push high kancaları atlanmaz. Ortam:
`pnpm run doctor:env`. Tek düşen kapı `pnpm exec just <tarif>` ile yeniden
koşulur; `pnpm exec just report <kapı> --json` makine-okunur kanıttır.

Yeni davranış ve hata düzeltmesi anlamlı regresyon testi bırakır; tests ağacı
src ağacını yansıtır. Disk testleri gerçek geçici dizindedir. Genel timeout
büyütülmez; kapsam yalnız çalıştırılabilir satırı olmayan dosyaları dışlar.
E2E Chromium ve WebKit'tedir; piksel temeli bilinçli görsel değişiklikle yenilenir.
Koşulmayan kapı, yapılmayan cihaz kabulü veya insan beğenisi tamamlandı sayılmaz.
Performans kararı ölçüm ister; cihaz referansı otomatik kapı değildir.

## Belge ve teslim

README amaç, başlangıç ve yönlendirmedir; DESIGN gerekçedir; docs teknik
sözleşmedir. İş ve kısa “Kapanır:” ölçütü TODO'dadır; biten iş Kapatılanlar'a
tek satır taşınır. Geçici plan belgesi açılmaz. Belgeler bugünü anlatır,
tarihçe git'tedir. Yorum yalnız koddan çıkarılamayan sözleşme veya tuzağı söyler.
Kodla belge aynı değişiklikte güncellenir; ayrıntılı denetim [rapordadır](docs/monorepo-audit.md).

Platform sahipleri: [Windows](docs/windows.md), [Linux](docs/linux.md),
[Steam Deck](docs/steam-deck.md), [Android](docs/android.md).
Ölçülmemiş ortama platform kuralı veya destek kabulü yazılmaz.

Kapsam ve dışa açık işlem yetkisi kullanıcınındır; aynı oturumdaki açık yetki
yeniden sorulmaz. Kullanıcı değişiklikleri korunur. `main` kararlı, `dev`
entegrasyon dalıdır; iş feature/bugfix dalında yürür, merge yalnız istenince yapılır.
Commit başlığı İngilizce Conventional Commits, gerekçe gövdesi Türkçe'dir.
Bulut CI yoktur; `.github/workflows/` altına onaysız pipeline eklenmez.
Sır, keystore, token, kullanıcı/cihaz/oturum kimliği ve başka proje adı
halka açık koda, belgeye veya kayda girmez.
Teslim değişiklik, koşulan kapı, kalan risk ve çalışma ağacı durumunu söyler.

`graphify-out/` varsa mimari sorusunda önce graphify query/affected kullanılır,
sonuç kaynakla doğrulanır; kod değişince graphify update uygulanır. Çıktı yereldir.
`.claude/` git dışıdır; araç çıktısı paketin git dışı records/export alanına
yazılır. Claude'a özgü farklar [CLAUDE.md](CLAUDE.md) içindedir.
