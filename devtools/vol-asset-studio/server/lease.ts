import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { LeaseResponse } from '../shared/contracts.js';
import { AssetStudioError } from './errors.js';

export function isLoopbackHost(host: string): boolean {
  const normalized = host
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '');
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1';
}

export function createAccessToken(): string {
  return randomBytes(32).toString('base64url');
}

export function tokensEqual(expected: string, candidate: string | undefined): boolean {
  if (candidate === undefined) return false;
  const expectedBuffer = Buffer.from(expected);
  const candidateBuffer = Buffer.from(candidate);
  return (
    expectedBuffer.length === candidateBuffer.length &&
    timingSafeEqual(expectedBuffer, candidateBuffer)
  );
}

export const LAN_SESSION_COOKIE = 'vol_asset_session';

interface LanSession {
  expiresAt: number;
}

/** Native medya ve EventSource isteklerinin taşıyabildiği HttpOnly LAN oturumu. */
export class LanSessionManager {
  readonly #sessions = new Map<string, LanSession>();

  public constructor(
    public readonly ttlMs = 12 * 60 * 60 * 1000,
    private readonly now: () => number = Date.now,
  ) {}

  public create(): { sessionId: string; expiresAt: number } {
    this.prune();
    const sessionId = randomBytes(32).toString('base64url');
    const expiresAt = this.now() + this.ttlMs;
    this.#sessions.set(sessionId, { expiresAt });
    return { sessionId, expiresAt };
  }

  public has(sessionId: string | undefined): boolean {
    if (sessionId === undefined) return false;
    const session = this.#sessions.get(sessionId);
    if (session === undefined) return false;
    if (session.expiresAt <= this.now()) {
      this.#sessions.delete(sessionId);
      return false;
    }
    return true;
  }

  public revoke(sessionId: string | undefined): void {
    if (sessionId !== undefined) this.#sessions.delete(sessionId);
  }

  private prune(): void {
    const now = this.now();
    for (const [sessionId, session] of this.#sessions) {
      if (session.expiresAt <= now) this.#sessions.delete(sessionId);
    }
  }
}

export function cookieValue(cookieHeader: string | undefined, name: string): string | undefined {
  if (cookieHeader === undefined) return undefined;
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === name) return part.slice(separator + 1).trim();
  }
  return undefined;
}

interface ActiveLease {
  clientId: string;
  leaseId: string;
  expiresAt: number;
}

/** Tek yazarlı oturum lease'i; diğer istemciler katalogda salt okunur kalır. */
export class EditorLeaseManager {
  #active?: ActiveLease;

  public constructor(
    private readonly ttlMs = 30_000,
    private readonly now: () => number = Date.now,
  ) {
    if (!Number.isSafeInteger(ttlMs) || ttlMs < 1) throw new RangeError('ttlMs');
  }

  public acquire(clientId: string): LeaseResponse {
    this.expire();
    if (this.#active !== undefined) {
      return { clientId, mode: 'readonly' };
    }
    const leaseId = randomBytes(24).toString('base64url');
    const expiresAt = this.now() + this.ttlMs;
    this.#active = { clientId, leaseId, expiresAt };
    return { clientId, mode: 'editor', leaseId, expiresAt: new Date(expiresAt).toISOString() };
  }

  public renew(clientId: string, leaseId: string): LeaseResponse {
    this.expire();
    if (this.#active?.clientId !== clientId || this.#active.leaseId !== leaseId) {
      throw new AssetStudioError('editor_lease_required', 409);
    }
    this.#active.expiresAt = this.now() + this.ttlMs;
    return {
      clientId,
      mode: 'editor',
      leaseId,
      expiresAt: new Date(this.#active.expiresAt).toISOString(),
    };
  }

  public release(clientId: string, leaseId: string): void {
    if (this.#active?.clientId === clientId && this.#active.leaseId === leaseId) {
      this.#active = undefined;
    }
  }

  public assertEditor(clientId: string, leaseId: string): void {
    this.expire();
    if (this.#active?.clientId !== clientId || this.#active.leaseId !== leaseId) {
      throw new AssetStudioError('editor_lease_required', 409);
    }
  }

  private expire(): void {
    if (this.#active !== undefined && this.#active.expiresAt <= this.now()) {
      this.#active = undefined;
    }
  }
}
