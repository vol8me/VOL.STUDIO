# CORE ve Phaser sınırı

CORE mekanizma ve sunum sözleşmesini, Phaser renderer ve sahne grafiğini
sağlar. Doğrudan Phaser importları `core/src/phaser/` altındaki kayıtlı
köprülerle sınırlıdır. Public adlar bu paket içi sahiplik sınırından
bağımsızdır.

## Köprüler

Kesin envanter `scripts/quality/phaserBoundary.mjs` içindeki PHASER_BRIDGES
kaydıdır. Her kayıt gerçek import taşır; her import kayıtta bulunur. Gizli
bağımlılık ve bayat kayıt kapıyı düşürür.

Köprüler oyun boot/renderer seçimi, viewport/Scale/kamera adaptasyonu,
GameObject entity ve girdi sağlayıcısı, rig montajı ve poz kaynağı
adaptasyonunu taşır. Rig layout hesabı saf TypeScript'tir; yalnız scene,
texture ve GameObject montajı köprüye aittir.

Kapı TypeScript AST ile normal ve type-only import, export-from, sabit
dinamik import ve require biçimlerini tarar. Tracked dosyayla birlikte henüz
stage edilmemiş, ignore edilmeyen kaynak da sınanır. Klasör değiştirerek
ya da farklı import sözdizimiyle sınır geçilemez.

## Saf mekanizmalar

Phaser'da benzeri bulunan bazı mekanizmalar kendi uygulamasını taşır;
bunlar Phaser import etmez. PHASER_REPLACEMENTS gerekçe kaydı yeni bir
replacement'ı bilinçli mimari karar olarak görünür yapar.

| Alan   | Sözleşme gerekçesi                                       |
| ------ | -------------------------------------------------------- |
| audio  | Ortak AudioContext ömrü, adaptive stem ve sidechain      |
| events | Tipli payload ve dinleyici hata izolasyonu               |
| math   | Headless kullanım ve sonlu sayı sözleşmesi               |
| pool   | GameObject olmayan değerlerde generic sahiplik           |
| random | Tohum ve state aktarımıyla deterministik akış            |
| time   | Sahne döngüsünden bağımsız sabit adım ve catch-up sınırı |

## Renderer

`createVolGame` renderer isteğini config'e açık yazar. Varsayılan auto
WebGL kurulamadığında Canvas'a düşebilir. Geri düşüş diagnostics snapshot,
overlay ve cihaz ölçümünde görünür; başarılı WebGL ile aynı kabul edilmez.
Açık webgl isteği fallback kabul etmez. Phaser sürümünün yeteneği kaynak,
gerçek boot ve hedef cihazla birlikte doğrulanır.
