# @volstudio/vol-asset-studio

VOL.STUDIO reposundaki görsel, ses, font ve üretim belgelerini tek bir web
yüzeyinde keşfeden repo-varlık çalışma ortamı. Bir oyun veya metinden görsel
üreteci değildir; diskte gerçekten bulunan varlıkları indeksler, canlı
değişiklikleri izler ve türüne uygun önizleme sunar.

[English](README.en.md)

## Geçerli kapsam

Aşama 3 yüzeyi bilinçli olarak **salt okunurdur**:

- repo köklerinden canlı katalog, arama, tür/sorun/Git durumu filtreleri;
- PNG/JPEG/WebP/GIF/AVIF önizlemeleri ve sunucu tarafı thumbnail;
- OGG/MP3/WAV/FLAC oynatma ile FFmpeg/ffprobe metadata'sı;
- WOFF/WOFF2/TTF/OTF font örneği;
- kaynak, türetilmiş çıktı ve reçete ilişki metadata'sı;
- SSE ile kimlik bazlı artımlı güncelleme ve sıra boşluğunda tam eşitleme;
- Quick Look ayrıntıları ve repo göreli yol kopyalama.

Piksel/ses düzenleme, sürüm geçmişi ve güvenli yazma işlemleri bu aşamada
varmış gibi gösterilmez. CORE'daki workbench bileşenleri sonraki aşamanın
altyapısıdır; mevcut ekranın tüm görünen kontrolleri çalışır.

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

| Uç nokta                                      | Sorumluluk                                  |
| --------------------------------------------- | ------------------------------------------- |
| `GET /api/v1/project`                         | Proje kökleri ve erişim biçimi              |
| `GET /api/v1/catalog`                         | Sürümlü varlık özeti                        |
| `GET /api/v1/assets/:id/content`              | Range ve ETag destekli gerçek dosya         |
| `GET /api/v1/assets/:id/thumbnail?size=…`     | Sınırlandırılmış görsel önizlemesi          |
| `GET /api/v1/assets/:id/audio`                | Ses codec/süre/kanal metadata'sı            |
| `GET /api/v1/events`                          | Canlı katalog SSE akışı                     |
| `POST/DELETE /api/v1/session/auth`            | LAN oturumu açma/kapatma                    |
| `POST/DELETE /api/v1/session/lease[ /renew ]` | Gelecek yazma yüzeyi için tek editör kilidi |

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
- Aşama 3 istemcisi yazma uç noktası çağırmaz; Forge çıktıları `readonly`
  eski kök olarak yalnız görüntülenir.

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
