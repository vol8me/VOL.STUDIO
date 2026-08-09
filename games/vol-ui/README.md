# @volstudio/vol-ui

`core/src/ui` altındaki DOM tabanlı UI kütüphanesinin canlı showcase'i.

## Çalıştırma

```bash
pnpm --filter @volstudio/vol-ui dev
```

Vite dev server tarayıcıda açılır; Tauri veya Phaser oyun döngüsü gerekmez, showcase saf DOM üzerinde çalışır.

## Sekmeler

| Sekme    | İçerik                                                                                                                                                                                                                                         | `core/src/ui/` klasörü                  |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| BUTTONS  | Button, IconButton varyantları                                                                                                                                                                                                                 | `primitives/`                           |
| TEXT     | Text, AnimatedLabel efektleri                                                                                                                                                                                                                  | `primitives/`                           |
| PANELS   | Panel, Modal, Toast, Confirm, ContextMenu                                                                                                                                                                                                      | `overlays/`                             |
| HUD      | Bar, XPBar, Counter, ResourceBar, MinimapPanel, BuildMenu, WaveCounter, SelectionInfoPanel                                                                                                                                                     | `feedback/`, `hud/`                     |
| FORMS    | Input, TextArea, Slider, RangeSlider, Checkbox, RadioGroup, Select, SegmentedControl, NumberStepper, TimerBar                                                                                                                                  | `primitives/`                           |
| PALETTE  | `--vol-ui-*` renk token'ları, tipografi, spacing referansı                                                                                                                                                                                     | `theme.css`                             |
| ADVANCED | Tree, Accordion, DataTable, Wizard, CommandPalette, SkillTree, EventLog, Kanban, DialogueBox                                                                                                                                                   | `layout/`, `data/`, `hud/`, `overlays/` |
| SCROLL   | ScrollView, VirtualList, Carousel                                                                                                                                                                                                              | `layout/`                               |
| TOUCH    | Joystick, TouchButton, DPad, DirectionButton, ActionBar, ChargeButton, PauseResumeButton, LongPressButton, RadialMenu, PinchZoomController, PullToRefresh, SwipeableCardStack, SwipeGestureZone, MultiTouchZone, DualAxisScrollPanel, SlotGrid | `controls/`, `hud/`                     |

## Lisans

[Apache License 2.0](../../LICENSE)
