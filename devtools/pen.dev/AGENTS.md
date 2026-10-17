# Pencil erişimi ve export sınırı

Bu paket Pencil kaynağını doğrulanmış rig asset'ine dönüştürür.
Runtime metadata/montaj sahibi CORE'dur; oyun üreticiye bağlanmaz.
Koordinat, disk doğrulaması ve gönderim sözleşmesi [DESIGN](DESIGN.md),
komut ve public araç yüzeyi [README](README.md) içindedir.

## Pencil kaynağı

- .pen dosyasına yalnız Pencil MCP araçlarıyla erişilir; dosya okuma,
  grep, elle parse veya metin düzenleme kullanılmaz.
- Canlı canvas düğüm kimliği önceki oturumdan varsayılmaz; taze Get
  ile doğrulanır. Araç adı/parametresi MCP sunucusunun belgesinden gelir.
  execute rehberi yoksa get_app_state ve read_skill ile alınır.
- Raster export Pencil'in native Export renderer'ından alınır.
  Elle SVG/cairo çizimi kaynakla eşdeğer kabul edilmez.

## Export ve güvenli gönderim

Native export önce staging'e yazılır; organize aracı doğrulanmış manifestten
entity ağacını kurar. Manifestin tamamı kopyalamadan önce doğrulanır;
çıktı kökü repo dışına çıkamaz. Kaynak veya tüketicideki ilgisiz dosya
temizlik hedefi değildir. Yetim parça verify hatasıdır.

Sheet hücre konumu rig yerleşimi değildir; x/y/rotation assemble edilmiş
kaynaktan okunur. Parent render eklemidir; manifestte çocuktan önce gelir.
Raster gölge/blur padding'i taşıyabilir; exportScale × logicalSizePx
eşitliği varsayılmaz, raster mantıksal kutuya sıkıştırılmaz.

exported/ repo dışı Pencil adımı gerektirdiği için commit edilir.
Oyun onu doğrudan okumaz; sync metadata yollarını tüketicinin statik
köküne yazar, previews'ı çıkarır ve yalnız hedef parça kalıntısını temizler.
Disk farkı gerçek geçici dizin testleriyle doğrulanır. Export doğrulaması
tüketicinin gerçek rig görüntüsü kabulünü tek başına kanıtlamaz.
