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
| HUD       | Bar, XPBar, Counter, ResourceBar, MinimapPanel, BuildMenu, RoundCounter, SelectionInfoPanel, ikonlu/kaydırılabilir StatsPanel                                                                                                                  | `feedback/`, `hud/`                     |
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

Politika `core/tests/ui/hitTargetSync.test.ts` tarafından zorlanır: `cursor:
pointer` taşıyan her CSS kuralı ya token'ı tüketmek ya da gerekçesi yazılı bir
muafiyet taşımak zorundadır. Yeni bir interaktif bileşen eklendiğinde kapı,
biri karar verene kadar kırılır.

## Lisans

[Apache License 2.0](../../LICENSE)
