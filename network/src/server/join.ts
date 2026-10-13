import { ServerError } from '@colyseus/core';
import { NAME_MAX_LENGTH, REJECT_CODE, parseJoinOptions, type JoinRejection } from '../protocol';

/** İstemcide `JoinError(reason)` olarak görünen hata; iletisi nedenin kendisidir. */
export function rejectJoin(reason: JoinRejection): ServerError {
  return new ServerError(REJECT_CODE, reason);
}

export interface AuthenticatedJoin {
  readonly name: string | null;
  readonly code: string | null;
}

/**
 * `onAuth` için tek kapı: sürüm ve kod biçimini doğrular, adı temizler. Geçersizse
 * `ServerError` fırlatır; Colyseus bunu oda yaratılmadan istemciye iletir.
 */
export function authenticateJoin(options: unknown): AuthenticatedJoin {
  const parsed = parseJoinOptions(options);
  if (!parsed.ok) throw rejectJoin(parsed.reason);
  return { name: parsed.name, code: parsed.code };
}

/**
 * Aynı odada iki oyuncu aynı adı taşımasın: çakışmada `Ada 2`, `Ada 3` ... verilir. Ek, ad
 * sınırını aşmasın diye gövde gerekirse kısaltılır.
 */
export function uniqueName(wanted: string, taken: Iterable<string>): string {
  const used = new Set(Array.from(taken, (name) => name.toLowerCase()));
  if (!used.has(wanted.toLowerCase())) return wanted;
  for (let suffix = 2; ; suffix++) {
    const tail = ` ${suffix}`;
    const base = Array.from(wanted)
      .slice(0, NAME_MAX_LENGTH - tail.length)
      .join('')
      .trimEnd();
    const candidate = base + tail;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
}
