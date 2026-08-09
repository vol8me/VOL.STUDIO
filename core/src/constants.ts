/**
 * Core geneli paylaşılan sabitler. Magic number yerine buradaki gruplar kullanılır.
 *
 * Dosya yerinde named const olarak kalan ve theme.css/CSS ile eşleşme yorumu
 * taşıyan sabitler (Toast.TOAST_FADE_OUT_MS, Confirm.MODAL_TRANSITION_MS,
 * Tooltip.VIEWPORT_MARGIN/TARGET_GAP, RangeSlider.HANDLE_WIDTH_PX) buraya
 * taşınmaz — çift referans yaratırlar.
 */

/** Input dead-zone ve normalizasyon sabitleri. */
export const INPUT = {
  /** Analog stick/keyboard için dead-zone oranı (0-1). 5 dosyada tekrarlanıyordu. */
  DEAD_ZONE_RATIO: 0.15,
  /** TouchStickState için maksimum stick yarıçapı (piksel). */
  STICK_MAX_RADIUS: 64,
} as const;

/** Phaser katman derinliği. */
export const UI_DEPTH = {
  /** TouchController gibi overlay input katmanı derinliği. */
  OVERLAY: 1000,
} as const;

/** Phaser Graphics alpha değerleri (TouchController stick çizimi). */
export const UI_ALPHA = {
  STICK_BASE: 0.4,
  STICK_THUMB: 0.7,
} as const;

/** UI component default boyutları (piksel). */
export const UI_SIZE = {
  /** TouchController stick thumb yarıçapı. */
  STICK_THUMB_RADIUS: 20,
  /** Joystick/SquareJoystick default yarıçap/kenar. */
  JOYSTICK_DEFAULT: 56,
  /** LongPressButton/ChargeButton default buton boyutu. */
  BUTTON_DEFAULT: 72,
  /** Slider default dikey uzunluk. */
  SLIDER_DEFAULT_LENGTH: 160,
  /** RadialMenu default halka yarıçapı. */
  RADIAL_MENU_DEFAULT_RADIUS: 96,
  /** RadialMenu default merkez dead-zone yarıçapı. */
  RADIAL_MENU_DEFAULT_DEADZONE: 24,
} as const;

/** UI oranları (0-1 aralığı). */
export const UI_RATIO = {
  /** TouchController ekran yarıya bölme (sol/sağ stick). */
  SCREEN_HALF: 0.5,
  /** Bar low-threshold default oranı. */
  BAR_LOW_THRESHOLD: 0.25,
  /** Carousel swipe eşiği (viewport genişliğine oran). */
  CAROUSEL_SWIPE_THRESHOLD: 0.2,
  /** SwipeableCardStack kart dönüş katsayısı (px → derece). */
  CARD_SWIPE_ROTATION: 0.05,
} as const;

/** UI timing sabitleri (milisaniye). */
export const UI_TIMING = {
  /** Toast default görünürlük süresi. */
  TOAST_DEFAULT_DURATION: 3000,
  /** Tooltip default gecikme süresi. */
  TOOLTIP_DEFAULT_DELAY: 300,
  /** Bar/XPBar default animasyon süresi. */
  BAR_DEFAULT_ANIMATE: 200,
  /** XPBar level-up efekt süresi. */
  XP_LEVEL_UP_EFFECT: 600,
  /** TimerBar reset animasyon süresi. */
  TIMER_RESET: 300,
  /** TimerBar loop yeniden başlatma gecikmesi. */
  TIMER_LOOP_DELAY: 120,
  /** PinchZoomController transform geçiş süresi. */
  ZOOM_TRANSITION: 260,
  /** LongPressButton default uzun basış eşiği. */
  LONG_PRESS_DURATION: 500,
  /** ChargeButton default dolum süresi. */
  CHARGE_DURATION: 900,
  /** SwipeableCardStack kart uçuş animasyonu. */
  CARD_FLY_ANIMATION: 180,
  /** EventLog satır ayrılma animasyonu. */
  EVENT_LOG_LEAVE: 220,
  /** FloatingText fade-out süresi. */
  FLOATING_TEXT_FADE_OUT: 200,
  /** AnimatedLabel glyph stagger gecikmesi. */
  ANIMATED_LABEL_GLYPH_STAGGER: 40,
} as const;

/** UI threshold/eşik sabitleri (piksel veya oran). */
export const UI_THRESHOLD = {
  /** SwipeGestureZone default mesafe eşiği (piksel). */
  SWIPE_DEFAULT: 40,
  /** SwipeGestureZone default hız eşiği (piksel/ms). */
  SWIPE_VELOCITY_DEFAULT: 0.5,
  /** PullToRefresh default çekme eşiği (piksel). */
  PULL_REFRESH_DEFAULT: 64,
  /** PullToRefresh direnç eğrisi katsayısı. */
  PULL_RESISTANCE_FACTOR: 6,
  /** SwipeableCardStack default swipe eşiği (piksel). */
  CARD_SWIPE_DEFAULT: 120,
  /** SwipeableCardStack swipe hint görünürlik eşiği (piksel). */
  CARD_SWIPE_HINT: 20,
  /** Popup viewport kenar boşluğu (piksel). */
  POPUP_MARGIN: 8,
  /** Drag başlangıç eşiği — SwipeGestureZone/Kanban/SlotGrid (piksel). */
  DRAG_START: 6,
} as const;

/** UI kapasite sabitleri. */
export const UI_CAPACITY = {
  /** SwipeableCardStack DOM'da tutulan görünür kart sayısı. */
  CARD_STACK_VISIBLE: 3,
} as const;

/** PinchZoomController zoom sınırları. */
export const PINCH_ZOOM = {
  MIN: 0.5,
  MAX: 3,
  INITIAL: 1,
  /** Fare tekerlek zoom adımı. */
  WHEEL_STEP: 0.1,
} as const;

/** Teknik altyapı sabitleri. */
export const TECH = {
  /** FontManager font yükleme timeout (FontManager + Game.ts). */
  FONT_LOAD_TIMEOUT: 30000,
  /** Game.ts document.fonts.ready fallback süresi. */
  FONT_READY_FALLBACK: 5000,
  /** ViewportManager DPR fallback değeri. */
  DPR_FALLBACK: 1,
  /** Delta-time ms → saniye çevrimi (PlayerController). */
  MS_PER_SECOND: 1000,
} as const;
