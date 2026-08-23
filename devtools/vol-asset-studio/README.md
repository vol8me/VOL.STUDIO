# @volstudio/vol-asset-studio

VOL.STUDIO reposundaki görsel, ses, font ve üretim belgelerini tek bir web
yüzeyinde keşfeden repo-varlık çalışma ortamı. Bir oyun veya metinden görsel
üreteci değildir; diskte gerçekten bulunan varlıkları indeksler, canlı
değişiklikleri izler ve türüne uygun önizleme sunar.

[English](README.en.md)

## Geçerli kapsam

- repo köklerinden canlı katalog, arama, tür/sorun/Git durumu filtreleri;
- dosya boyutu, medya imzası, JSON yapısı ve görsel çözümleme sorunları;
- PNG/JPEG/WebP/GIF/AVIF önizlemeleri ve sunucu tarafı thumbnail;
- OGG/MP3/WAV/FLAC oynatma ile FFmpeg/ffprobe metadata'sı;
- WOFF/WOFF2/TTF/OTF font örneği;
- kaynak, türetilmiş çıktı ve reçete ilişki metadata'sı;
- SSE ile kimlik bazlı artımlı güncelleme ve sıra boşluğunda tam eşitleme;
- Quick Look ayrıntıları ve repo göreli yol kopyalama;
- tile tabanlı piksel yüzeyi, katman/kare/palet, onion skin, undo/redo ve
  revizyon kontrollü atomik PNG kaydı;
- peak piramitli ses dalga formu, seçim, yakınlaştırma, transport, gain, trim,
  fade, peak normalize ve reverse zinciriyle atomik OGG/WAV kaydı;
- salt okunur referans arama, rename önizleme ve kurtarılabilir çöp.

Katman ve kareler mevcut doğrudan PNG kaydında bileşiğe düzleştirilir; native
`.volsprite.json` kapanıp yeniden açma hattı henüz tamamlanmamıştır. Ses zinciri
mevcut OGG/WAV dosyasına açık kaydet eylemiyle uygulanır; `.volaudio.json`
reçetesine kalıcılaştırma henüz bağlı değildir. MP3/FLAC sesler incelenebilir,
ancak kaydetmeden önce OGG/WAV dönüşüm hattı gerektirir.

## Çalıştırma

Repo kökünden:

```bash
pnpm --filter @volstudio/vol-asset-studio dev
```

Repo hostu ve Vite aynı `http://127.0.0.1:5175` adresinde çalışır. Kök
`pnpm dev` komutu VOL.HELL ve VOL.UI ile birlikte Asset Studio'yu da açar.

Üretim paketi:

```bash
pnpm --filter @volstudio/vol-asset-studio build
pnpm --filter @volstudio/vol-asset-studio start
```

Yerel ağda yayın yalnız üretim frontend'iyle kabul edilir:

```bash
pnpm --filter @volstudio/vol-asset-studio build
pnpm --filter @volstudio/vol-asset-studio exec node dist-server/server/cli.js --production --host 0.0.0.0
```

Repo hostu başlangıçta geçici erişim anahtarını terminale yazar. Anahtar web
yüzeyindeki doğrulama alanına bir kez girilir; devam eden görsel, ses, font ve
SSE istekleri `HttpOnly` oturum çereziyle çalışır. Anahtar URL'ye yazılmaz ve
tarayıcı depolamasında tutulmaz.

## Proje yapılandırması

Kök [`asset-studio.json`](../../asset-studio.json) hangi klasörlerin katalogda
yer alacağını tanımlar. Her kökün sabit bir kimliği, repo göreli yolu, rolü ve
izin verilen varlık türleri vardır.

| Rol        | Anlamı                                       |
| ---------- | -------------------------------------------- |
| `source`   | Üretimin düzenlenebilir kaynak belgesi       |
| `derived`  | Bir kaynaktan yeniden üretilebilen çıktı     |
| `shipped`  | Oyunla dağıtılan runtime varlığı             |
| `readonly` | Keşfedilen fakat yazma hedefi olmayan varlık |

Eksik opsiyonel kökler proje yanıtında görünür ancak servisi çökertmez.
Bilinmeyen alan, yinelenen kök kimliği, mutlak/kaçak yol ve geçersiz limit
başlangıçta tek bir yapılandırma hatasıyla reddedilir.

## Repo host sözleşmesi

| Uç nokta                                      | Sorumluluk                                   |
| --------------------------------------------- | -------------------------------------------- |
| `GET /api/v1/project`                         | Proje kökleri ve erişim biçimi               |
| `GET /api/v1/catalog`                         | Sürümlü varlık özeti                         |
| `GET /api/v1/assets/:id/content`              | Range ve ETag destekli gerçek dosya          |
| `GET /api/v1/assets/:id/thumbnail?size=…`     | Sınırlandırılmış görsel önizlemesi           |
| `GET /api/v1/assets/:id/audio`                | Ses codec/süre/kanal metadata'sı             |
| `GET /api/v1/assets/:id/raster`               | Düzenleme için sınırlı ham RGBA              |
| `GET /api/v1/assets/:id/waveform`             | Peak piramidi ve yapılandırılmış ses QA      |
| `POST /api/v1/assets/:id/audio/render`        | Ses zincirini doğrula, işle ve atomik kaydet |
| `POST /api/v1/save-transactions`              | Revizyon kontrollü atomik varlık kaydı       |
| `GET /api/v1/references/:id`                  | Salt okunur referans indeksi                 |
| `POST /api/v1/file-operations/*`              | Rename önizleme ve kurtarılabilir çöp        |
| `GET /api/v1/events`                          | Canlı katalog SSE akışı                      |
| `POST/DELETE /api/v1/session/auth`            | LAN oturumu açma/kapatma                     |
| `POST/DELETE /api/v1/session/lease[ /renew ]` | Tek editör kilidi                            |

API hataları kullanıcı metni taşımaz; kararlı `error.code` değerleri istemci
i18n katmanında Türkçe/İngilizce metne çevrilir.

## Güvenlik sınırı

- Varsayılan host yalnız loopback'tir; geliştirme frontend'i LAN'da açılmaz.
- İstek origin'i ve LAN oturumu API öncesinde doğrulanır.
- Yapılandırma, katalog ve her dosya açılışında canonical yol/kimlik denetimi
  yapılır; symlink ile repo dışına çıkış reddedilir.
- Thumbnail pikseli, varlık baytı ve istek gövdesi limitlidir.
- Dosya yanıtları revision, `ETag`, koşullu istek ve tek aralıklı `Range`
  sözleşmesini uygular.
- Yazma yalnız açık kaydet eyleminde, beklenen içerik revizyonu iki kez
  doğrulandıktan sonra temp/yedek/rollback transaction'ıyla yapılır; `readonly`
  kökler yazma uçlarında reddedilir.

## Doğrulama

```bash
pnpm --filter @volstudio/vol-asset-studio typecheck
pnpm --filter @volstudio/vol-asset-studio test
pnpm --filter @volstudio/vol-asset-studio test:coverage
pnpm --filter @volstudio/vol-asset-studio build
```

Repo geneli kapanış kapısı `pnpm high`dır. Ses metadata'sı için sistemde
`ffprobe` bulunmalıdır; `pnpm run doctor:env` bunu denetler.

## Lisans

[Apache License 2.0](../../LICENSE)
