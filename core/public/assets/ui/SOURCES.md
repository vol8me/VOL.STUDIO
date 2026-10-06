# UI varlıkları — kaynak kaydı

Bu dizindeki dosyalar **üretilir**; elle düzenlenmez. Kaynak: `core/scripts/ui-assets/`
(üretici) ve tema tokenları (`core/src/ui/colors.ts`, `core/src/ui/themes/`). Üretim
`pnpm gen:ui-assets` ile yapılır, `--check` yazmadan sapmayı bildirir.

- Köken: özgün üretim (üçüncü taraf varlık yok); proje lisansı geçerlidir.
- Üretici: core/scripts/ui-assets v1.
- Tohum: 5656396 (0x564f4c).
- Temalar: default, ember.
- Dosya: 21 dosya, 38514 bayt.
- Biçim: yalnız vektör SVG; raster ya da video yok.

## Düzen

- `icons/icons-16|24|32|48.svg`: tek renkli çizgi ikon spritelar (24 ızgara, `currentColor`).
- `frames/<tema>/`: 9-dilimli panel/plate/well, başlık şeridi, ayraç.
- `textures/`: durağan döşemeler (`grain` tohumlu).
- `cursors/<tema>/`: ok ve vurgulu ok imleci (etkin nokta ok ucu).
- `manifest.json`: dosya başına bayt ve sha256, ikon adları, dilim ve etkin nokta verisi.
