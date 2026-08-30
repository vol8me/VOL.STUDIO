import type { RusherParams } from '@/config/enemies/types';
import { applySeekBehavior } from './seek';
import { distanceToTarget, type BehaviorContext, type VelocityOutput } from './types';
import { nonNegativeFinite, safeDeltaMs, saturatingAdd } from '@/runtime/utils/numeric';

/** Rusher atılım döngüsünün fazları. */
export type RusherPhase = 'approach' | 'windup' | 'dash' | 'recover';

/**
 * Bir rusher davranışının durumu. Düşmanın kendisinden bağımsızdır: Aşama
 * 3'teki Elite, kendi durum nesnesini tutarak aynı fonksiyonu kullanabilir.
 */
export interface RusherState {
  phase: RusherPhase;
  /** İçinde bulunulan fazda geçen süre (ms). */
  phaseTimerMs: number;
  /** Son atılımın bitişinden bu yana geçen süre (ms). */
  cooldownTimerMs: number;
  /** Atılım başlarken kilitlenen yön (birim vektör). */
  dashDirX: number;
  dashDirY: number;
  /** Bu frame'de atılım başladıysa true — efekt/ses tetiklemek için okunur. */
  dashStarted: boolean;
}

export function createRusherState(): RusherState {
  return {
    phase: 'approach',
    phaseTimerMs: 0,
    // İlk atılım için beklemesin: cooldown dolu başlar.
    cooldownTimerMs: Number.MAX_SAFE_INTEGER,
    dashDirX: 0,
    dashDirY: 0,
    dashStarted: false,
  };
}

/**
 * Rusher davranışı — yaklaş, telegraf ver, düz çizgide atıl, toparlan.
 *
 * Atılım yönü telegraf BİTİMİNDE kilitlenir; atılım sırasında oyuncuyu takip
 * etmez. Kaçınma bu yüzden mümkündür ve okunabilir bir dövüş ritmi doğar.
 */
export function applyRusherBehavior(
  state: RusherState,
  context: BehaviorContext,
  params: RusherParams,
  stopDistance: number,
  out: VelocityOutput,
): void {
  state.dashStarted = false;
  const safeDelta = safeDeltaMs(context.deltaMs);
  state.phaseTimerMs = saturatingAdd(state.phaseTimerMs, safeDelta);
  state.cooldownTimerMs = saturatingAdd(state.cooldownTimerMs, safeDelta);

  // Önce faz geçişleri, SONRA hız: geçiş anında bir frame'lik boşluk kalmaz
  // (telegraf biten frame'de atılım hızı hemen uygulanır). Uzun bir frame
  // birden fazla fazı geçebileceği için döngü kurulur; MAX_PHASE_STEPS
  // tam devri kapsar ve olası bir sonsuz döngüyü keser.
  for (let step = 0; step < MAX_PHASE_STEPS; step++) {
    if (!advancePhase(state, context, params)) break;
  }

  applyPhaseVelocity(state, context, params, stopDistance, out);
}

/** Bir tam faz devri: approach -> windup -> dash -> recover -> approach. */
const MAX_PHASE_STEPS = 4;

/** Zamanı dolan fazı bir sonrakine geçirir. Geçiş olduysa true döner. */
function advancePhase(state: RusherState, context: BehaviorContext, params: RusherParams): boolean {
  switch (state.phase) {
    case 'approach': {
      const inRange = distanceToTarget(context) <= params.triggerDistance;
      if (!inRange || state.cooldownTimerMs < params.cooldownMs) return false;
      state.phase = 'windup';
      state.phaseTimerMs = 0;
      return true;
    }

    case 'windup': {
      if (state.phaseTimerMs < params.windupMs) return false;
      lockDashDirection(state, context);
      state.phase = 'dash';
      state.phaseTimerMs = carryOver(state.phaseTimerMs, params.windupMs);
      state.dashStarted = true;
      return true;
    }

    case 'dash': {
      if (state.phaseTimerMs < params.dashDurationMs) return false;
      state.phase = 'recover';
      state.phaseTimerMs = carryOver(state.phaseTimerMs, params.dashDurationMs);
      return true;
    }

    case 'recover': {
      if (state.phaseTimerMs < params.recoverMs) return false;
      state.phase = 'approach';
      state.phaseTimerMs = carryOver(state.phaseTimerMs, params.recoverMs);
      state.cooldownTimerMs = 0;
      return true;
    }
  }
}

/**
 * Faz süresini aştıktan sonra ARTAN süreyi bir sonraki faza taşır.
 *
 * Sayaç eskiden `0`a çekiliyordu: 300 ms'lik bir telegraf, 16 ms'lik karelerde
 * 304 ms'de dolar ve o 4 ms silinirdi. Her geçişte tekrarlandığı için bir tam
 * atılım devri config'de yazandan sistematik olarak UZUN sürer ve süre düşük
 * FPS'te daha da kayar — yani telegraf penceresi kare hızına bağlı hale gelir.
 * Artığı taşımak devri config'e sabitler.
 *
 * `approach` fazı zamana değil mesafe/cooldown'a bağlı olduğu için taşıma
 * uygulanmaz; orada sayaç gerçekten sıfırdan başlamalıdır.
 */
function carryOver(elapsedMs: number, phaseDurationMs: number): number {
  if (!Number.isFinite(phaseDurationMs) || phaseDurationMs <= 0) return 0;
  const remainder = elapsedMs - phaseDurationMs;
  // Tek karede birden çok fazı aşan devasa delta'da artık, bir sonraki fazı da
  // anında bitirmesin diye o fazın süresiyle sınırlanır (döngü zaten
  // MAX_PHASE_STEPS ile kesiliyor; bu, süre birikmesini engeller).
  return Math.max(0, Math.min(remainder, phaseDurationMs));
}

/** Atılım yönünü telegraf bitiminde kilitler. */
function lockDashDirection(state: RusherState, context: BehaviorContext): void {
  const dx = context.targetX - context.x;
  const dy = context.targetY - context.y;
  const distance = Math.hypot(dx, dy);

  if (distance > 0) {
    state.dashDirX = dx / distance;
    state.dashDirY = dy / distance;
    return;
  }
  // Tam üst üste binmiş durumda yön belirsiz; atılımı iptal etmek yerine
  // son bilinen yön korunur, o da yoksa sağa atılır.
  if (state.dashDirX === 0 && state.dashDirY === 0) {
    state.dashDirX = 1;
    state.dashDirY = 0;
  }
}

function applyPhaseVelocity(
  state: RusherState,
  context: BehaviorContext,
  params: RusherParams,
  stopDistance: number,
  out: VelocityOutput,
): void {
  if (state.phase === 'approach') {
    applySeekBehavior(context, stopDistance, out);
    return;
  }

  if (state.phase === 'dash') {
    const dashSpeed = nonNegativeFinite(context.speed * params.dashSpeedMultiplier);
    out.x = state.dashDirX * dashSpeed;
    out.y = state.dashDirY * dashSpeed;
    return;
  }

  // windup ve recover: yerinde durur — telegraf ve açık pencere okunabilir olsun.
  out.x = 0;
  out.y = 0;
}
