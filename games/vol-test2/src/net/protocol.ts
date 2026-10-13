import { BUILDING, KIND, WORLD, type Kind } from '@/config/factory';
import { ByteReader, ByteWriter } from './bytes';

/**
 * İstemci-sunucu ikili sözleşmesi. Colyseus yalnız taşıyıcıdır: mesaj türü sayıdır, yük ham
 * bayttır. Hem sunucu hem istemci bu dosyadan okur; biçim yalnız burada tanımlanır.
 */
export const WIRE_VERSION = 2;

/** Colyseus oda adı: istemci katılımı ve sunucu kaydı aynı değeri okur. */
export const ROOM_NAME = 'factory';

/** Katılımda sunucunun simülasyon sürümü uyuşmazlığı için döndürdüğü hata; istemci kullanıcıya güncelleme söyler. */
export const SIM_MISMATCH = { code: 4426, message: 'sim-version' } as const;

export function isSimMismatch(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === SIM_MISMATCH.code &&
    (error as { message?: unknown }).message === SIM_MISMATCH.message
  );
}

/**
 * `hello`: istemci mesaj işleyicilerini kurduktan sonra gönderir; sunucu o ana kadar ona yalnız
 * karşılama dışında bir şey yollamaz. Yük boştur ya da ilgi alanı (4 bayt) taşır. Her
 * (yeniden) bağlanışta yeniden gönderilir.
 */
export const TO_SERVER = { command: 1, view: 2, ping: 3, hello: 4 } as const;
export const TO_CLIENT = {
  frame: 1,
  ack: 2,
  welcome: 3,
  pong: 4,
  /** Sıkıştırılmış (zlib) anlık görüntü; kilit adımlı katılımda tek seferlik. */
  snapshot: 5,
  /** Kilit adımlı komut akışı paketi. */
  ticks: 6,
} as const;

/** Eşitleme biçimi: istemci simülasyonu kendisi koşturur ya da sunucudan ilgi alanı çerçevesi alır. */
export const SYNC_MODE = { lockstep: 0, aoi: 1 } as const;
export type SyncMode = (typeof SYNC_MODE)[keyof typeof SYNC_MODE];

/** Bir çerçevedeki bölüm türleri. */
export const SECTION = { structure: 1, dynamics: 2, belts: 3, hud: 4, players: 5 } as const;

/** Birim konumu 1/64 tile çözünürlüğündedir; 1024 tile'a kadar u16'ya sığar. */
export const POS_SCALE = 64;
export const CHUNK = WORLD.chunk;
export const CHUNK_TILES = CHUNK * CHUNK;

/** Birim kaydı: yuva u16, nesil u8, tür+can u8, x u16, y u16. */
export const UNIT_RECORD_BYTES = 8;
/** Atış kaydı: çıkış x,y ve hedef x,y (u16, 1/64 tile) ile kaynak türü (u8, `SHOT_SOURCE`). */
export const SHOT_RECORD_BYTES = 9;
/** Tank kaydı: yuva u8, durum u8, can u16, x u16, y u16 (1/64 tile), nişan x,y u8 (birim vektör × 127 + 127). */
export const PLAYER_RECORD_BYTES = 10;
export const AIM_SCALE = 127;

/** Chunk koordinatında kapalı dikdörtgen. */
export interface ChunkRect {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

export function rectChunks(rect: ChunkRect): number {
  return (rect.x1 - rect.x0 + 1) * (rect.y1 - rect.y0 + 1);
}

/** Tile baytı: tür 3 bit, yön 2 bit, cevher 1 bit. */
export function packTile(kind: number, rot: number, ore: number): number {
  return (kind & 7) | ((rot & 3) << 3) | ((ore & 1) << 5);
}

/** Yapının can baytı; boş tile 0, çekirdek tam. */
export function packHp(kind: number, hp: number): number {
  if (kind === KIND.empty) return 0;
  if (kind === KIND.core) return 255;
  const max = BUILDING[kind as Exclude<Kind, 0>].hp;
  return Math.min(255, Math.max(1, Math.ceil((255 * hp) / max)));
}

/** Bant eşyası: tür 2 bit, konum 10 bit. */
export function packBeltItem(item: number, position: number): number {
  return ((item & 3) << 10) | (position & 1023);
}

export interface Welcome {
  readonly wire: number;
  /** Sunucunun bu dünya örneği için ürettiği kimlik; yeniden başlatmada değişir. */
  readonly epoch: number;
  readonly tick: number;
  readonly width: number;
  readonly height: number;
  readonly chunk: number;
  readonly tickRate: number;
  readonly maxAoi: { readonly x: number; readonly y: number };
  /** Bu oyuncu anahtarı için sunucunun kabul ettiği son komut sırası; istemci buradan devam eder. */
  readonly lastSeq: number;
  readonly mode: SyncMode;
  /** Dünyanın canlı birim hedefi (ölçüm dünyaları); kilit adımlı istemci aynısını kullanmalıdır. */
  readonly sustainUnits: number;
}

export function writeWelcome(welcome: Welcome): Uint8Array {
  const out = new ByteWriter(32);
  out.u8(welcome.wire);
  out.u32(welcome.epoch);
  out.u32(welcome.tick);
  out.u16(welcome.width);
  out.u16(welcome.height);
  out.u8(welcome.chunk);
  out.u8(welcome.tickRate);
  out.u8(welcome.maxAoi.x);
  out.u8(welcome.maxAoi.y);
  out.u32(welcome.lastSeq);
  out.u8(welcome.mode);
  out.u16(welcome.sustainUnits);
  return out.finish();
}

export function readWelcome(bytes: Uint8Array): Welcome {
  const input = new ByteReader(bytes);
  const wire = input.u8();
  if (wire !== WIRE_VERSION) throw new RangeError(`Desteklenmeyen tel sürümü: ${wire}`);
  return {
    wire,
    epoch: input.u32(),
    tick: input.u32(),
    width: input.u16(),
    height: input.u16(),
    chunk: input.u8(),
    tickRate: input.u8(),
    maxAoi: { x: input.u8(), y: input.u8() },
    lastSeq: input.u32(),
    mode: input.u8() === SYNC_MODE.aoi ? SYNC_MODE.aoi : SYNC_MODE.lockstep,
    sustainUnits: input.u16(),
  };
}

export interface Ack {
  readonly seq: number;
  readonly result: number;
  /** Komutun uygulandığı simülasyon adımı. */
  readonly tick: number;
}

export function writeAck(ack: Ack): Uint8Array {
  const out = new ByteWriter(9);
  out.u32(ack.seq);
  out.u8(ack.result);
  out.u32(ack.tick);
  return out.finish();
}

export function readAck(bytes: Uint8Array): Ack {
  const input = new ByteReader(bytes);
  return { seq: input.u32(), result: input.u8(), tick: input.u32() };
}

export function writePing(clientTime: number): Uint8Array {
  const out = new ByteWriter(8);
  out.f64(clientTime);
  return out.finish();
}

export function writePong(clientTime: number, serverTick: number): Uint8Array {
  const out = new ByteWriter(12);
  out.f64(clientTime);
  out.u32(serverTick);
  return out.finish();
}

export function readPong(bytes: Uint8Array): { clientTime: number; serverTick: number } {
  const input = new ByteReader(bytes);
  return { clientTime: input.f64(), serverTick: input.u32() };
}

export function writeView(rect: ChunkRect): Uint8Array {
  return Uint8Array.of(rect.x0, rect.y0, rect.x1, rect.y1);
}

/** Geçersiz uzunluk veya sıralama `null` olur; sınır ve boyut denetimi sunucudadır. */
export function readView(bytes: Uint8Array): ChunkRect | null {
  if (bytes.length !== 4) return null;
  const [x0, y0, x1, y1] = bytes;
  if (x1 < x0 || y1 < y0) return null;
  return { x0, y0, x1, y1 };
}

/** Çerçeve üstbilgisi `tick u32, bölüm sayısı u8`; her bölüm `etiket u8, uzunluk u32, yük`. */
export const FRAME_HEADER_BYTES = 5;
export const SECTION_HEADER_BYTES = 5;

/** HUD bölümü: sunucunun küçük ortak durumu. */
export interface Hud {
  readonly tick: number;
  readonly coreHp: number;
  readonly wave: number;
  readonly nextWaveIn: number;
  readonly defeats: number;
  readonly ore: number;
  readonly plate: number;
  readonly deliveredOre: number;
  readonly deliveredPlate: number;
  readonly units: number;
  readonly players: number;
  /** Son adımların ortalama sunucu süresi, 1/100 ms. */
  readonly tickMs100: number;
}

export function writeHud(out: ByteWriter, hud: Hud): void {
  out.u32(hud.tick);
  out.u16(hud.coreHp);
  out.u16(hud.wave);
  out.u32(hud.nextWaveIn);
  out.u16(hud.defeats);
  out.u32(hud.ore);
  out.u32(hud.plate);
  out.u32(hud.deliveredOre);
  out.u32(hud.deliveredPlate);
  out.u16(hud.units);
  out.u8(hud.players);
  out.u16(hud.tickMs100);
}

export function readHud(input: ByteReader): Hud {
  return {
    tick: input.u32(),
    coreHp: input.u16(),
    wave: input.u16(),
    nextWaveIn: input.u32(),
    defeats: input.u16(),
    ore: input.u32(),
    plate: input.u32(),
    deliveredOre: input.u32(),
    deliveredPlate: input.u32(),
    units: input.u16(),
    players: input.u8(),
    tickMs100: input.u16(),
  };
}
