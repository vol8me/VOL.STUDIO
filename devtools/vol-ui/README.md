# @volstudio/vol-ui

`core/src/ui` altındaki DOM tabanlı UI kütüphanesinin canlı showcase'i.

## Çalıştırma

```bash
pnpm --filter @volstudio/vol-ui dev
```

Vite dev server tarayıcıda açılır; Tauri veya Phaser oyun döngüsü gerekmez, showcase saf DOM üzerinde çalışır. Üst çubuktaki tam ekran düğmesi ve F11 aynı CORE `FullscreenController` akışını kullanır.

## Sekmeler

| Sekme     | İçerik                                                                                                                                                                                                                                         | `core/src/ui/` klasörü                  |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| BUTTONS   | Button, IconButton varyantları                                                                                                                                                                                                                 | `primitives/`                           |
| TEXT      | Text, AnimatedLabel efektleri                                                                                                                                                                                                                  | `primitives/`                           |
| PANELS    | Panel, Modal, Toast, Confirm, ContextMenu                                                                                                                                                                                                      | `overlays/`                             |
| HUD       | Bar (yatay/dikey), XPBar, Counter, ResourceBar, MinimapPanel, BuildMenu, RoundCounter, SelectionInfoPanel, ikonlu/kaydırılabilir StatsPanel                                                                                                    | `feedback/`, `hud/`                     |
| KARTLAR   | CardTile (rarity kademeleri), LevelUpPicker, ShopPicker                                                                                                                                                                                        | `cards/`                                |
| FORMS     | Input, TextArea, Slider, RangeSlider, Checkbox, ColorPicker, CurveEditor, PropertyField, Toolbar, RadioGroup, Select, SegmentedControl, NumberStepper, TimerBar                                                                                | `primitives/`                           |
| WORKBENCH | PropertyField, CommandHistory, SplitPane, CanvasViewportController, KeyedVirtualList, Icon registry, GraphicsQuality kademe kaydı                                                                                                              | `primitives/`, `layout/`, `quality/`    |
| PALETTE   | `--vol-ui-*` renk token'ları, tipografi, spacing referansı                                                                                                                                                                                     | `theme.css`                             |
| ADVANCED  | Tree, Accordion, DataTable, Wizard, CommandPalette, SkillTree, EventLog, Kanban, DialogueBox                                                                                                                                                   | `layout/`, `data/`, `hud/`, `overlays/` |
| SCROLL    | ScrollView, VirtualList, Carousel                                                                                                                                                                                                              | `layout/`                               |
| TOUCH     | Joystick, TouchButton, DPad, DirectionButton, ActionBar, ChargeButton, PauseResumeButton, LongPressButton, RadialMenu, PinchZoomController, PullToRefresh, SwipeableCardStack, SwipeGestureZone, MultiTouchZone, DualAxisScrollPanel, SlotGrid | `controls/`, `hud/`                     |
| YÜKLEME   | LoadingScreen — gösterge tipleri, geçiş tipleri, içerik konumları                                                                                                                                                                              | `overlays/`                             |

## Dokunmatik hedef politikası

Showcase, dokunmatik hedef boyutunu doğrulamanın yeridir. `--vol-hit-target-min`
token'ı yalnızca `pointer: coarse` altında bir değer taşır (bkz.
`core/src/ui/theme.css`), yani masaüstünde hiçbir bileşenin görünümü
değişmez; dokunmatik cihazda ya da tarayıcının cihaz emülasyonunda kutular
gerçekten 44px'e büyür.

Politika iki katmanda zorlanır. `core/tests/ui/hitTargetSync.test.ts` kuralın
CSS'te VAR olduğunu doğrular; jsdom yerleşim hesaplamadığı için orada kalan
boşluğu — kutunun gerçekten 44px çizilip çizilmediğini — aşağıdaki tarayıcı
kapısı kapatır.

## Görsel sözleşme kapısı

```bash
pnpm --filter @volstudio/vol-ui build      # kapı GÖNDERİLEN çıktıyı sınar
pnpm --filter @volstudio/vol-ui test:e2e
```

Üç katman, üç ayrı soru:

| Dosya                 | Soru                                                  |
| --------------------- | ----------------------------------------------------- |
| `determinism.spec.ts` | Kapı güvenilir mi? Rastgelelik ve saat donduruldu mu? |
| `layout.spec.ts`      | Yerleşim doğru mu? Taşma, dokunma hedefi, ezilme.     |
| `visual.spec.ts`      | Görünüm değişti mi? Sekme başına piksel temeli.       |

Görüntü karşılaştırması SIFIR toleransla koşar; bu, `determinism.spec.ts`in on
iki sekmenin ayrı yüklemelerde birebir aynı çizildiğini ölçmesiyle mümkün olur.
Beklenen bir görsel değişiklikten sonra temeller bilinçli olarak yenilenir:

```bash
pnpm --filter @volstudio/vol-ui test:e2e:update
```

Fark beklenmiyorsa güncellemeden önce sebebi aranır — kapının değeri tam olarak
o anda ortaya çıkar.

## Lisans

[Apache License 2.0](../../LICENSE)
