# Asset Studio — tasarım kararları

Sunucu sözleşmesi ve güvenlik sınırı. Nasıl çalıştırılacağı
[README](README.md)'dedir — bir README tanıtımdır, sözleşme dökümü değil.

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
Sayfa kapanırken istemci editör lease'ini `keepalive` isteğiyle bırakır; ağ
kapanışında sunucunun kısa TTL'i güvenli geri dönüş olarak kalır.

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
