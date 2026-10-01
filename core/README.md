# @volstudio/core

Oyunlardan bağımsız çalışma zamanı ve DOM UI kataloğu. Girdi, durum, zaman,
kalıcılık, ses, grafik ve rig mekanizmalarını ortak sözleşmelerle sunar.

Paketin dış yüzeyi `package.json` içindeki `exports` haritasıdır. Tüketici
kaynak dosya yolunu import etmez. Phaser gerektiren köprüler ayrı tutulur;
mekanizma katmanı oyuna ya da geliştirici aracına bağımlı değildir.

## Kullanım ve doğrulama

```bash
pnpm --filter @volstudio/core typecheck
pnpm --filter @volstudio/core test
pnpm --filter @volstudio/core test:coverage
pnpm benchmark:core
pnpm --filter @volstudio/core download-fonts
```

UI teması repo kökünden `pnpm gen:theme` ile üretilir. Bileşenlerin canlı
örnekleri [vol-ui](../devtools/vol-ui/README.md) paketindedir.

## Belgeler

- [Tasarım sözleşmesi](DESIGN.md)
- [Primitifler ve tarifler](docs/primitives.md)
- [i18n](docs/i18n.md)
- [Tek atışlar ve döngüler](docs/sfx.md)
- [Müzik çalma](docs/music-engine.md)
- [Phaser sınırı](docs/phaser-boundary.md)
