/**
 * Duvar saatiyle ölçülen timer boşluğu. Uyku, ana iş parçacığı gecikmesi ve
 * saat sıçramasını ayıramaz; gerçek uyku kanıtı native olaydan gelir.
 */
export interface WakeGapOptions {
  /** Timer boşluğunun izlendiği kalp atışı aralığı. */
  readonly heartbeatMs?: number;
  /** Bu eşiğin üzerindeki duvar-saati boşluğu bildirilir. */
  readonly gapThresholdMs?: number;
  readonly onWake: (gapMs: number) => void;
  /** Testlerde saat enjeksiyonu; varsayılan `Date.now` + `setInterval`. */
  readonly now?: () => number;
  readonly setIntervalFn?: typeof setInterval;
  readonly clearIntervalFn?: typeof clearInterval;
}

const DEFAULT_HEARTBEAT_MS = 1_000;
const DEFAULT_GAP_THRESHOLD_MS = 1_500;

export function observeWakeGaps(options: WakeGapOptions): () => void {
  const heartbeatMs = options.heartbeatMs ?? DEFAULT_HEARTBEAT_MS;
  const thresholdMs = options.gapThresholdMs ?? DEFAULT_GAP_THRESHOLD_MS;
  const now = options.now ?? (() => Date.now());
  const setIv = options.setIntervalFn ?? setInterval;
  const clearIv = options.clearIntervalFn ?? clearInterval;

  let lastWall = now();
  const id = setIv(() => {
    const wall = now();
    // Timer donduysa wall-lastWall heartbeat'tan büyük çıkar.
    const gap = wall - lastWall - heartbeatMs;
    lastWall = wall;
    if (gap >= thresholdMs) options.onWake(gap + heartbeatMs);
  }, heartbeatMs);

  return () => clearIv(id);
}

/** `resumeAudioAfterWake`in beklediği asgari ses bağlamı. */
export interface WakeableAudioContext {
  readonly state: string;
  resume(): Promise<void>;
}

/**
 * Uyanış tarifi: uykudan sonra `suspended` ya da `interrupted` kalan ses
 * bağlamını yeniden başlatır. Kapalı ya da zaten çalan bağlama dokunmaz.
 * @returns Yeniden başlatma denendiyse `true`.
 */
export async function resumeAudioAfterWake(context: WakeableAudioContext): Promise<boolean> {
  if (context.state === 'running' || context.state === 'closed') return false;
  await context.resume();
  return true;
}
