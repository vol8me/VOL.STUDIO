/**
 * Bağlantı protokolü güncellemeleri iki uç tarafından birlikte kabul edilir. Sürüm katılım
 * seçeneklerinin biçimini ve oda sözleşmesini kapsar; oyun şemasının kendisi Colyseus el
 * sıkışmasında tanımlanır.
 */
export const PROTOCOL_VERSION = 2;

export const NAME_MAX_LENGTH = 16;
export const ROOM_CODE_LENGTH = 5;
/** Karışan karakterler (0/O, 1/I/L) yoktur: kod sesle ya da elle okunabilir. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** İstemcinin odaya katılırken yolladığı seçenekler; sunucu hepsini doğrular. */
export interface JoinOptions {
  readonly protocol: number;
  /** Görünen oyuncu adı; yoksa sunucu bir ad atar. */
  readonly name?: string;
  /** Özel oda kodu. */
  readonly code?: string;
}

/** Sunucunun katılımı reddetme nedenleri; `ServerError` iletisi olarak istemciye taşınır. */
export type JoinRejection = 'protocol' | 'code' | 'full';

/** Katılım reddinin `ServerError.code` değeri; Colyseus eşleştirme kodlarıyla (520-526) çakışmaz. */
export const REJECT_CODE = 4400;

export const JOIN_REJECTIONS: readonly JoinRejection[] = ['protocol', 'code', 'full'];

export type ParsedJoin =
  | { readonly ok: true; readonly name: string | null; readonly code: string | null }
  | { readonly ok: false; readonly reason: 'protocol' | 'code' };

/** Biçim denetimi, bidi kontrolü ve sıfır genişlikli karakterler görünen adı taklide açar. */
const INVISIBLE = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu;

/**
 * Oyuncu adını temizler: görünmez ve yön değiştiren karakterleri atar, boşlukları tek boşluğa
 * indirir, kod noktası sayısıyla kısaltır. Boş kalırsa `null` döner; ad atamak çağıranındır.
 */
export function sanitizeName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const clean = value.replace(INVISIBLE, ' ').replace(/\s+/gu, ' ').trim();
  if (clean === '') return null;
  const points = Array.from(clean);
  return points.length > NAME_MAX_LENGTH ? points.slice(0, NAME_MAX_LENGTH).join('').trim() : clean;
}

/** Kullanıcının yazdığı kodu (küçük harf, boşluk, tire) kurala çevirir; geçersizse `null`. */
export function normalizeRoomCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const code = value.toUpperCase().replace(/[\s-]+/gu, '');
  if (code.length !== ROOM_CODE_LENGTH) return null;
  for (const char of code) if (!ROOM_CODE_ALPHABET.includes(char)) return null;
  return code;
}

/** Rastgele kaynak dışarıdan verilir: sunucu `Math.random` değil, kendi akışını kullanabilir. */
export function createRoomCode(random: () => number = Math.random): string {
  let code = '';
  for (let index = 0; index < ROOM_CODE_LENGTH; index++) {
    const pick = Math.min(
      ROOM_CODE_ALPHABET.length - 1,
      Math.floor(random() * ROOM_CODE_ALPHABET.length),
    );
    code += ROOM_CODE_ALPHABET[pick];
  }
  return code;
}

/**
 * Katılım seçeneklerini doğrular. Sürüm uyuşmazlığı ve biçimi bozuk kod reddedilir; ad
 * geçersizse reddedilmez, sunucu ad atar (oyuncuyu adı yüzünden dışarıda bırakmak yanlıştır).
 */
export function parseJoinOptions(value: unknown): ParsedJoin {
  if (!value || typeof value !== 'object') return { ok: false, reason: 'protocol' };
  const data = value as Record<string, unknown>;
  if (data.protocol !== PROTOCOL_VERSION) return { ok: false, reason: 'protocol' };
  let code: string | null = null;
  if (data.code !== undefined && data.code !== null) {
    code = normalizeRoomCode(data.code);
    if (code === null) return { ok: false, reason: 'code' };
  }
  return { ok: true, name: sanitizeName(data.name), code };
}
