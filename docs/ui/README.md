# CORE UI belgeleri

CORE UI'nin hedef görünüm ve davranışını, mevcut public yüzeyini ve
uygulama işlerini ayıran başvuru kümesi. Mevcut vitrin
[vol-showcase](../../devtools/vol-showcase/README.md), gerçek oyun tüketicisi VOL.TEST'tir.
VOL.SHOWCASE göçü ve yeni UI mekanizmaları henüz uygulanmadı.

| Gereksinim                                            | Sahip belge                     |
| ----------------------------------------------------- | ------------------------------- |
| Görünüm, etkileşim, mimari ve karar gerekçeleri       | [CONTRACT](CONTRACT.md)         |
| Canlı sınıf/export yüzeyi, tüketici ve tier           | [CATALOG](CATALOG.md)           |
| 14 fazın 64 açık görevi, yürütme planı ve kapanışları | [TODO](TODO.md)                 |
| Test profilleri, ölçüler ve gerçek kabul yöntemi      | [VERIFICATION](VERIFICATION.md) |

UI-00–02 ortak temeli kurar; buton, kart ve form pilotları bunu tüketir.
Windows geliştirme ve ilk native referans önceliklidir. Linux/Deck,
Android ve Windows ürün kabulü kendi gerçek ortamlarında tamamlanır;
teknik hazırlık fiziksel veya insan kabulü yerine geçmez.

Repo geneli işler [kök TODO](../../TODO.md), platform desteği
[Windows](../windows.md), [Linux](../linux.md), [Deck](../steam-deck.md)
ve [Android](../android.md) belgelerindedir. Ayrıntı ilgili iş için açılır;
bu yönlendirici bağımsız bir uygulama protokolü taşımaz.
