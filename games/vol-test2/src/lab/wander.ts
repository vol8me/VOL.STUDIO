/**
 * Gezinme: gövdenin dünyada yumuşakça dolaşması. Ani yön değişimi yoktur (en fazla `maxTurnRate`),
 * sert dönüşte yavaşlar, ara sıra durur ve kenara yaklaşınca merkeze döner. Yalnız hareket verir;
 * bacaklar `SpiderBody`nin işidir. Saf ve tohumludur.
 */
export interface WanderOptions {
  readonly width: number;
  readonly height: number;
  /** Kenara bu kadar yaklaşınca merkeze dönülür. */
  readonly margin: number;
  /** Seyir hızı (tasarım birimi/sn). */
  readonly cruise: number;
  /** En büyük dönüş hızı (rad/sn). */
  readonly maxTurnRate: number;
}

export interface WanderState {
  x: number;
  y: number;
  heading: number;
  speed: number;
  desired: number;
  retargetIn: number;
  pauseIn: number;
  pausing: number;
  /** Kenardan dönerken gidilen iç hedef; sürü merkezde yığılmasın diye her kenar olayında yeniden seçilir. */
  homeX: number;
  homeY: number;
  homing: boolean;
}

const ACCELERATION = 420;
const LOOKAHEAD_SECONDS = 1.4;
/** Kenara yaklaşırken dönüş hızı ve seyir hızı oranları: sert dönüş, yavaşlayarak. */
const EDGE_TURN_BOOST = 3;
const EDGE_SLOWDOWN = 0.7;
const TAU = Math.PI * 2;

export function wrapAngle(angle: number): number {
  const wrapped = (((angle + Math.PI) % TAU) + TAU) % TAU;
  return wrapped - Math.PI;
}

export function createWander(random: () => number, options: WanderOptions): WanderState {
  const heading = random() * TAU;
  return {
    x: options.margin + random() * Math.max(1, options.width - 2 * options.margin),
    y: options.margin + random() * Math.max(1, options.height - 2 * options.margin),
    heading,
    speed: 0,
    desired: heading,
    retargetIn: 1 + random() * 2,
    pauseIn: 5 + random() * 6,
    pausing: 0,
    homeX: 0,
    homeY: 0,
    homing: false,
  };
}

export function stepWander(
  state: WanderState,
  dtSeconds: number,
  random: () => number,
  options: WanderOptions,
): void {
  state.retargetIn -= dtSeconds;
  if (state.retargetIn <= 0) {
    state.desired = state.heading + (random() - 0.5) * Math.PI;
    state.retargetIn = 1.2 + random() * 1.8;
  }
  const { x, y } = state;
  const outside = (px: number, py: number): boolean =>
    px < options.margin ||
    py < options.margin ||
    px > options.width - options.margin ||
    py > options.height - options.margin;
  // Dönüş yavaş olduğundan yalnız bulunulan yer değil, birkaç saniye sonraki yer de sınanır.
  const reach = Math.max(state.speed, options.cruise * 0.5) * LOOKAHEAD_SECONDS;
  const nearEdge =
    outside(x, y) ||
    outside(x + Math.cos(state.heading) * reach, y + Math.sin(state.heading) * reach);
  if (nearEdge) {
    if (!state.homing) {
      state.homing = true;
      state.homeX = options.margin + random() * Math.max(1, options.width - 2 * options.margin);
      state.homeY = options.margin + random() * Math.max(1, options.height - 2 * options.margin);
    }
    state.desired = Math.atan2(state.homeY - y, state.homeX - x);
    state.retargetIn = Math.max(state.retargetIn, 0.6);
  } else {
    state.homing = false;
  }

  if (state.pausing > 0) {
    state.pausing -= dtSeconds;
  } else {
    state.pauseIn -= dtSeconds;
    if (state.pauseIn <= 0) {
      state.pausing = 0.7 + random() * 0.7;
      state.pauseIn = 5 + random() * 6;
    }
  }

  const diff = wrapAngle(state.desired - state.heading);
  const rate = options.maxTurnRate * (nearEdge ? EDGE_TURN_BOOST : 1) * dtSeconds;
  state.heading = wrapAngle(state.heading + Math.max(-rate, Math.min(rate, diff)));

  const slowdown = 1 - 0.45 * (Math.abs(diff) / Math.PI);
  const target = state.pausing > 0 ? 0 : options.cruise * slowdown * (nearEdge ? EDGE_SLOWDOWN : 1);
  const delta = target - state.speed;
  const limit = ACCELERATION * dtSeconds;
  state.speed += Math.max(-limit, Math.min(limit, delta));

  state.x = Math.max(
    0,
    Math.min(options.width, state.x + Math.cos(state.heading) * state.speed * dtSeconds),
  );
  state.y = Math.max(
    0,
    Math.min(options.height, state.y + Math.sin(state.heading) * state.speed * dtSeconds),
  );
}

export function velocityOf(state: WanderState): readonly [number, number] {
  return [Math.cos(state.heading) * state.speed, Math.sin(state.heading) * state.speed];
}
