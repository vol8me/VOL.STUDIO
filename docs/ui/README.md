# CORE UI belgeleri

CORE UI, bullet hell ve RTS oyunları için bir **oyun arayüzü** kimliğini taşır: katmanlı
malzeme, tok ses, imleç ve hareket hissi; web paneli değil. Mevcut vitrin
[vol-showcase](../../devtools/vol-showcase/README.md), gerçek oyun tüketicisi VOL.TEST'tir.

| Gereksinim                                       | Sahip belge                     |
| ------------------------------------------------ | ------------------------------- |
| Tasarım dili, etkileşim, mimari ve gerekçeler    | [CONTRACT](CONTRACT.md)         |
| Canlı sınıf/export yüzeyi, tüketici ve tier      | [CATALOG](CATALOG.md)           |
| Yön, dalgalar, açık görevler ve kapanışlar       | [TODO](TODO.md)                 |
| Test profilleri, ölçüler ve gerçek kabul yöntemi | [VERIFICATION](VERIFICATION.md) |

Kimlik (tema çifti, malzeme, ikon, imleç, ses) önce kurulur; Button dikey dilimi bunları uçtan
uca tüketir, aileler aynı dille yayılır. Windows geliştirme ve ilk native referans önceliklidir;
Linux/Deck, Android ve Windows ürün kabulü gerçek ortamlarda tamamlanır, teknik hazırlık
fiziksel veya insan kabulü yerine geçmez.

Repo geneli işler [kök TODO](../../TODO.md), platform desteği [Windows](../windows.md),
[Linux](../linux.md), [Deck](../steam-deck.md) ve [Android](../android.md) belgelerindedir.
