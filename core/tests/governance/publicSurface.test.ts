import { describe, it, expect } from 'vitest';
import * as Core from '../../src/index';

/**
 * CORE'un public API yüzeyinin BÜYÜKLÜĞÜNÜ kilitler.
 *
 * `index.ts` dokuz adet `export *` barrel'ı taşıyor (`ui/primitives`,
 * `ui/layout`, `ui/overlays`, `ui/data`, `ui/feedback`, `ui/controls`,
 * `ui/hud`, `ui/cards`, `debug`). Bu bilinçli bir kolaylık — bileşen
 * eklerken barrel'ı elle güncellemek unutuluyordu — ama bir bedeli var:
 * yeni bir dosyaya `export` yazmak, o ismi HİÇBİR KARAR NOKTASI OLMADAN
 * public API'ye sokuyor. Yüzey büyürken kimse "bu dışarıya açılmalı mı?"
 * sorusunu sormuyor.
 *
 * Barrel'ları elle yazılmış listelere çevirmek bu sorunu çözerdi ama 120+
 * satırlık kalıcı bir bakım yükü getirirdi. Bunun yerine yüzey SAYILIYOR:
 * değiştiğinde kapı kırılır ve biri kararı bilinçli olarak verir.
 *
 * **Bu test düştüğünde:** yüzey gerçekten büyümeli/küçülmeliyse aşağıdaki
 * sayıyı güncelle. Beklenmedik bir isim sızdıysa (dahili bir yardımcı,
 * geçici bir tip) `export`u kaldır. İkisi de meşru; sessizce olmaması
 * yeterli.
 */
// Sayının hangi yeteneklerle değiştiğinin kaydı: `core/docs/public-surface.md`.
const EXPECTED_EXPORT_COUNT = 223;

/**
 * Public yüzeyin TAM isim listesi.
 *
 * Sayı bir BÜTÇEDİR, sözleşme değildir: bir isim silinip yerine başkası
 * eklendiğinde sayı değişmez ve kapı susar. Oysa o iki olay bir tüketici için
 * tamamen farklıdır — biri kırılma, diğeri genişleme.
 *
 * Liste alfabetiktir ve yüzeyden ÜRETİLİR; elle sıralanmaz. Düştüğünde hata
 * mesajı eklenen ve silinen adları AYRI AYRI gösterir, çünkü "223 → 223" bir
 * teşhis değildir.
 */
const EXPECTED_PUBLIC_SURFACE: readonly string[] = [
  'Accordion',
  'ActionBar',
  'AnimatedLabel',
  'Bar',
  'BaseSprite',
  'BuildMenu',
  'Button',
  'CARD_DRAG_MIME',
  'CanvasViewportController',
  'CardPicker',
  'CardTile',
  'Carousel',
  'ChargeButton',
  'Checkbox',
  'Clock',
  'ColorPicker',
  'CommandHistory',
  'CommandPalette',
  'CommandTransaction',
  'ConsoleTransport',
  'ContextMenu',
  'Cooldown',
  'Counter',
  'CurveEditor',
  'DEFAULT_MOVE_KEYS',
  'DEFAULT_SEED',
  'DIAGONAL_NEIGHBOURS',
  'DPad',
  'DataTable',
  'Deck',
  'Diagnostics',
  'DialogueBox',
  'DirectionButton',
  'DisposableScope',
  'DualAxisScrollPanel',
  'Easing',
  'EventBus',
  'EventLog',
  'FloatingTextManager',
  'FlowField',
  'FontManager',
  'FullscreenController',
  'GazeDriver',
  'GhostTrail',
  'GraphicsQuality',
  'Grid',
  'HIDE_ANIMATION_MS',
  'I18n',
  'INPUT',
  'Icon',
  'IconButton',
  'Input',
  'InputManager',
  'InputUtils',
  'Joystick',
  'Kanban',
  'KeyedVirtualList',
  'LEAVE_ANIMATION_MS',
  'LegGait',
  'LevelUpPicker',
  'LoadingScreen',
  'LocalServerTransport',
  'LocalStorageAdapter',
  'LongPressButton',
  'MinHeap',
  'MinimapPanel',
  'Modal',
  'MovableController',
  'MultiTouchZone',
  'Music',
  'MusicEngine',
  'MusicPlaylist',
  'NO_ACTIVE_PROVIDER',
  'NoopTransport',
  'NumberStepper',
  'ORTHOGONAL_NEIGHBOURS',
  'ObjectPool',
  'PCController',
  'PINCH_ZOOM',
  'Panel',
  'PathFinder',
  'PauseResumeButton',
  'PinchZoomController',
  'PlayerController',
  'Popover',
  'Popup',
  'PoseShadow',
  'PropertyField',
  'PullToRefresh',
  'RadialMenu',
  'RadioGroup',
  'RangeSlider',
  'ResourceBar',
  'ResourceCounter',
  'ResourcePool',
  'RichTooltip',
  'RigMotionModel',
  'RingBuffer',
  'RoundCounter',
  'RoundLoop',
  'SaveManager',
  'Scheduler',
  'ScrollView',
  'SegmentedControl',
  'Select',
  'SelectionInfoPanel',
  'ShopPicker',
  'SidechainDucker',
  'SimulationClock',
  'SkillTree',
  'Slider',
  'SlotContainer',
  'SlotGrid',
  'SoundBank',
  'SpatialIndex',
  'SplitPane',
  'Spring1D',
  'SquareJoystick',
  'StatBlock',
  'StateMachine',
  'StatsPanel',
  'SwipeGestureZone',
  'SwipeableCardStack',
  'TECH',
  'Tabs',
  'Text',
  'TextArea',
  'TimerBar',
  'ToastManager',
  'ToolButton',
  'Toolbar',
  'Tooltip',
  'TouchButton',
  'TouchController',
  'Tree',
  'UIRoot',
  'UI_ALPHA',
  'UI_CAPACITY',
  'UI_DEPTH',
  'UI_RATIO',
  'UI_SIZE',
  'UI_THRESHOLD',
  'UI_TIMING',
  'VIEWPORT_REGISTRY_KEY',
  'VOL_COLORS',
  'VOL_FONTS',
  'VOL_ICONS',
  'Vector2',
  'ViewportManager',
  'VirtualActionSource',
  'VirtualList',
  'WeightedPicker',
  'Wizard',
  'XPBar',
  'animateValue',
  'applyVolViewport',
  'applyXPGain',
  'approach',
  'articulateRigDefinition',
  'assembleRig',
  'bresenhamLine',
  'buildRigDefinition',
  'canHover',
  'cancelHaptics',
  'circleRectOverlap',
  'circlesOverlap',
  'clamp',
  'clamp01',
  'clampSimulationStep',
  'computePCInputState',
  'computePartLayout',
  'createDiagnostics',
  'createIdleActions',
  'createIdleSnapshot',
  'createRandom',
  'createSingleProviderSnapshot',
  'createVolGame',
  'damp',
  'distance',
  'distanceSquared',
  'findPath',
  'finiteOr',
  'finitePositiveOr',
  'getAppVisibility',
  'getBackHandlerCount',
  'getHapticsCapability',
  'hasLineOfSight',
  'hasTouchInput',
  'i18n',
  'i18next',
  'inverseLerp',
  'isDiagnosticsEnabled',
  'isFiniteNumber',
  'isHapticsEnabled',
  'isHapticsSupported',
  'isPCInputActive',
  'isTouchPrimary',
  'lerp',
  'measureSupport',
  'observeAppVisibility',
  'observeHapticsCapability',
  'pointInCircle',
  'pointInRect',
  'preloadRigTextures',
  'pushBackHandler',
  'raycastCircles',
  'rectsOverlap',
  'remap',
  'requireFinite',
  'resolvePCActions',
  'resolveSkillStates',
  'runButtonClick',
  'samplePose',
  'seedFromString',
  'segmentCircleEntryT',
  'segmentCircleOverlap',
  'setHapticsEnabled',
  'shouldUseTouchControls',
  'showConfirm',
  'solveTwoBoneIk',
  'validateRigMetadata',
  'vibrate',
  'wrap',
];

// Asset compiler'lar (görsel/ses sentezi) bu yüzeye GİRMEZ: runtime yalnızca
// üretilmiş asset'leri çalar, üreteni taşımaz.

describe('CORE public API yüzeyi', () => {
  it('dışa açılan İSİMLER birebir sabittir', () => {
    const actual = Object.keys(Core).sort();
    const expected = [...EXPECTED_PUBLIC_SURFACE];

    const added = actual.filter((name) => !expected.includes(name));
    const removed = expected.filter((name) => !actual.includes(name));

    expect(
      { eklenen: added, silinen: removed },
      'Public yüzey DEĞİŞTİ. Eklenen bir isim genişlemedir; silinen bir isim ' +
        'TÜKETİCİYİ KIRAR. İkisi bilinçliyse listeyi güncelle.',
    ).toEqual({ eklenen: [], silinen: [] });
  });

  it('export sayısı bilinçli bir kararla değişir', () => {
    const names = Object.keys(Core);

    expect(
      names.length,
      `CORE public API yüzeyi ${EXPECTED_EXPORT_COUNT} → ${names.length} oldu. ` +
        'Bu bir karar mı, sızıntı mı? Karar ise bu testteki sayıyı güncelle.',
    ).toBe(EXPECTED_EXPORT_COUNT);
  });

  it('yüzeyde dahili/geçici görünen isim yoktur', () => {
    // Alt çizgiyle başlayan ya da `Internal`/`Temp` gibi bir SEGMENT taşıyan
    // ismin public API'ye çıkması, barrel otomatikliğinin tipik sızıntı biçimi.
    //
    // Eşleşme camelCase SEGMENTİ üzerinden yapılır, ham substring üzerinden
    // değil: düz `/wip/i` taraması `SwipeableCardStack` ve `SwipeGestureZone`
    // isimlerini yakalıyordu ("S-wip-eable"). Bekçinin kendi yanlış pozitifi,
    // koruduğu şeyden daha hızlı devre dışı bırakılır.
    const FORBIDDEN_SEGMENTS = ['internal', 'temp', 'todo', 'wip', 'draft', 'unsafe'];
    const suspicious = Object.keys(Core).filter((name) => {
      if (name.startsWith('_')) return true;
      const segments = name.split(/(?=[A-Z])|[_-]/).map((part) => part.toLowerCase());
      return segments.some((segment) => FORBIDDEN_SEGMENTS.includes(segment));
    });

    expect(suspicious).toEqual([]);
  });

  it('deprecated takma adlar yüzeyde ama sayıya dahil', () => {
    // `PlayerController` → `MovableController` geçişinin takma adı. Kaldırma
    // turu geldiğinde bu testin de güncellenmesi gerektiğini hatırlatır.
    expect(Core.PlayerController).toBe(Core.MovableController);
  });
});
