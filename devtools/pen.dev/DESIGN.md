# Rig üretim ve gönderim tasarımı

Tasarım kaynağı yazarındır, Pencil export'u aracındır, gönderilmiş asset
tüketicinindir. Araç üretir ve doğrular; CORE rig sözleşmesini doğrular ve
çalışma zamanında monte eder. Oyun üretici aracı runtime'da import etmez.

## Kaynak ve ara çıktı

`.pen` canlı Pencil belgesidir ve yalnız MCP erişimiyle işlenir. Düğüm
kimlikleri önceden hatırlanan değerle kullanılmaz; her export taze keşif
ister. Native Export kendi renderer'ını kullanır; elle SVG/raster yeniden
çizimi native çıktının yerine geçmez.

Export staging'de node kimliğiyle PNG üretir. Düzenleyici entity/domain
manifestinden parça ve preview adlarını, metadata'yı ve dizin yapısını kurar.
`exported/<domain>/<entityId>/` altındaki ara çıktı repo dışı Pencil adımı
gerektirdiği için commit edilir. Oyun build'inin girdisi tüketiciye gönderilmiş
hâldir; export ağacı oyundan doğrudan okunmaz.

## Koordinat ve eklem

Manifestte part kimliği benzersizdir. Parent render eklemidir; fizik kütlesi,
kısıtı veya eklem limiti değildir. Ebeveyn çocuktan önce tanımlanır;
ileri referans ve döngü reddedilir.

x/y rig kökünün yerel uzayındaki sol üst köşeyi, rotation bu köşe etrafındaki
CCW dereceyi bildirir. Sheet hücre yerleşimi gerçek rig koordinatı sayılmaz.
Koordinat yoksa metadata positionPx null taşır; bu çıktı görsel parça olsa
da rig montajı için yeterli değildir. rootSizePx ve parça yerleşimi birlikte
rig uzayını tanımlar.

Raster ölçüsü exportScale × logicalSizePx olmak zorunda değildir: dönüş,
gölge ve diğer Pencil işlemleri padding üretebilir. Montaj mantıksal boyutu
ve exportScale'ı kullanır; rasterı mantıksal kutuya sıkıştırmaz. Koordinat ve
pivot hesabı CORE'un rig sözleşmesindedir.

## Doğrulama ve teslim

Audit eksik parça, metadata uyuşmazlığı ve yetim dosyanın tamamını toplar;
verify bozuk export'u göndermez. Diskte bulunan fakat metadata'da olmayan
parça da hatadır, silinmiş bir bileşenin meşru asset gibi taşınması önlenir.

Sync metadata file yollarını tüketicinin kendi statik köküne yeniden yazar.
Previews çalışma zamanı yükü olmadığı için düşürülür. Hedefteki eski parça
artıkları temizlenir. Gönderilmiş metadata ve asset ağacı tüketici tarafında
ayrıca audit edilir.

Oyunda akış `validateRigMetadata`, `buildRigDefinition`, isteğe bağlı
`articulateRigDefinition`, preload ve `assembleRig`dir. Rig animasyon politikası,
uzuv sayısı, oyun fizik kuralı ve tüketici görsel kararı üretim aracına girmez.
Testler gerçek geçici dizinde kaynak, gönderim ve yetim dosya sözleşmesini
sınar; mock disk gerçek dosya farkının kanıtı değildir.
