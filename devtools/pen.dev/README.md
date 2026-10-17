# @volstudio/pen.dev

Pencil tasarım kaynağından rig parça görselleri ve metadata üreten,
doğrulayıp tüketiciye gönderen build aracı. Phaser bağımlılığı ve oyun
çalışma zamanı kodu taşımaz. Oyunun runtime rig yüzeyi CORE'dadır.

## Akış

Native Export staging üretir; düzenleyici entity ağacını kurar.
Pencil erişim sınırı [AGENTS](AGENTS.md), veri ve disk sözleşmesi
[DESIGN](DESIGN.md) içindedir.

Paket dizininden:

```bash
node scripts/organize-pen-export.mjs <manifest.json> <stagingDir> [outputRoot]
```

Tüketici kendi senkron betiğiyle doğrulanmış metadata ve parça assetlerini
kendi paketine alır. Gönderim sırasında yollar yeniden yazılır, çalışma
zamanı için gerekmeyen previews çıkarılır ve hedef fazlalıkları temizlenir.

Tüketici paket dizininden senkron CLI örneği:

```bash
tsx ../../devtools/pen.dev/scripts/sync-rig.ts <domain> <entityId> \
  src/assets/rig/<entityId>.metadata.json \
  public/assets/rig/<entityId>/parts \
  assets/rig/<entityId>/parts
```

## Sahiplik ve yüzey

`pen/entities.pen` yazarlık kaynağıdır. `exported/` Pencil adımı gerektiren
ara çıktıdır ve commit edilir; oyun build'i onu doğrudan okumaz. Gönderilmiş
metadata ve statik parçalar tüketici paketinin build girdisidir.

| Fonksiyon               | Sözleşme                                                     |
| ----------------------- | ------------------------------------------------------------ |
| `auditRigExport`        | Eksik/yetim parça ve metadata farklarını toplar              |
| `verifyRigExport`       | Aynı farklar varsa gönderimi reddeder                        |
| `syncRigExport`         | Doğrulanmış export'u tüketicinin sahipliğine kopyalar        |
| `auditShippedRig`       | Gönderilmiş metadata ile statik asset dizinini karşılaştırır |
| `resolveRigExportPaths` | Export referansını doğrulanacak dosya yollarına çözümler     |

## Doğrulama

```bash
pnpm --filter @volstudio/pen.dev typecheck
pnpm --filter @volstudio/pen.dev test:coverage
```

Disk sözleşmesi gerçek geçici dizinde sınanır. `.pen` erişimi ve native
export için [AGENTS.md](AGENTS.md), koordinat ve gönderim ayrıntıları için
[DESIGN.md](DESIGN.md).
