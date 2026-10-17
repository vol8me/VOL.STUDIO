export { Bar, type BarVariant, type BarLabel, type BarOptions, type BarStatus } from './Bar';
export {
  XPBar,
  // Opsiyonel KURAL tarifi — "taşan XP sonraki seviyeye devreder".
  applyXPGain,
  MAX_LEVELS_PER_XP_GAIN,
  type XPBarOptions,
  type XpGainResult,
} from './XPBar';
export {
  Counter,
  type CounterOptions,
  type CounterSetValueOptions,
  type CounterValueChange,
} from './Counter';
export { ResourceCounter, type ResourceCounterOptions } from './ResourceCounter';
export { ResourceBar, type ResourceBarEntry, type ResourceBarOptions } from './ResourceBar';
export { TimerBar, type TimerBarOptions } from './TimerBar';
export { RoundCounter, type RoundCounterOptions } from './RoundCounter';
export {
  FloatingTextManager,
  FLOATING_TEXT_MAX_ACTIVE,
  type FloatingTextVariant,
  type FloatingTextOptions,
  type FloatingTextManagerOptions,
} from './FloatingText';
export { UiHapticProvider, type UiHapticProviderOptions } from './UiHapticProvider';
export {
  UiIntentBus,
  emitUiIntent,
  uiIntentBusFor,
  type UiIntent,
  type UiIntentKind,
  type UiIntentListener,
  type UiIntentRequest,
  type UiIntentSource,
  type UiIntentSubscription,
  type UiOutcome,
} from './uiIntent';
