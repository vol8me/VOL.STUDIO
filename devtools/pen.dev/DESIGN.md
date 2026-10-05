# Rig üretim ve gönderim tasarımı

Tasarım kaynağı yazarındır, Pencil export'u aracındır, gönderilmiş asset
tüketicinindir. Araç üretir ve doğrular; CORE rig sözleşmesini doğrular ve
çalışma zamanında monte eder. Oyun üretici aracı runtime'da import etmez.

## Kaynak ve ara çıktı

Pencil erişim sınırı [AGENTS](AGENTS.md) sahibindedir. Native Export
kendi renderer'ını kullanır; gölge, gradyan, image-fill, shader ve mirror
gibi canvas işlemleri elle SVG/raster çizimiyle eşdeğer sayılmaz.

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

## Canvas keşif başvurusu

Bu desenler kaynak yapısını bulmaya yarar; export öncesi canlı canvas
üzerinde doğrulanır. Düğüm kimliği sabit bir manifest girdisi değildir.

| Kaynak ailesi      | Parça keşfi                                                               |
| ------------------ | ------------------------------------------------------------------------- |
| Yer birimi         | Parts Export Sheet içindeki `_export` son ekli bütün descendants          |
| Terminal karakteri | `_terminal_character` kökünün text olmayan doğrudan çocukları             |
| Turret             | Ground Export ve Rotating Head Export container'ları; daha fazla bölünmez |
| Konveyör           | `ground__`, `belt__`, `vehicle__`, `gauge__` rol ön ekli descendants      |
| Düz üretim binası  | Tek kök frame; bölünmez                                                   |

Export sheet `row > cells > cell > *_export` biçiminde iç içe olabilir;
tek depth=1 okuması bütün parçaları bulmaz. Assemble edilmiş karttan alınan
yerleşim ile export sheet hücresi ayrılır; instance çözümü gerekiyorsa
canlı Get'in resolveInstances seçeneği kullanılır. Terminal karakterinin
doğrudan çocuk x/y'si kendi rig yerleşimidir.

Native Export `<nodeId>.png` üretir. Organize manifesti partId, staging
dosyası ve tekrarları bütün olarak doğrular; şema başvurusu
`scripts/organize-pen-export.mjs` içindedir. x/y/rotation/rootSizePx yoksa
positionPx null çıktısı rig montajı için yeterli değildir.

Rig animasyon politikası bu pakette yoktur; binaların runtime rig
entegrasyonu tamamlanmış sayılmaz. Keşif deseninin varlığı tüketici kabulü
değildir.
