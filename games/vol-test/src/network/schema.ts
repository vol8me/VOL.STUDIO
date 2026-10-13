import { schema, t, type SchemaType } from '@colyseus/schema';
import type { TankCommand } from '@/sim/command';

/**
 * Akıcı şema alanları `.default()` verilmedikçe `undefined` başlar (`tick++` NaN olur, yeni kayıt
 * eksik alan yollar); bu yüzden her alan açık bir başlangıç değeri taşır.
 */
const f64 = () => t.float64().default(0);
const f32 = () => t.float32().default(0);
const flag = () => t.boolean().default(false);

/**
 * Tel üzerindeki girdi: oyuncunun bir sabit adımdaki niyeti. Sıra numarası şemada yoktur; Colyseus
 * girdileri kendi sayacıyla sıralar ve onay olarak tüketilen sayıyı döndürür.
 */
export const TankInput = schema(
  {
    moveX: f32(),
    moveY: f32(),
    aimX: f32(),
    aimY: f32(),
    fire: flag(),
    boost: flag(),
    brake: flag(),
  },
  'TankInput',
);

export type TankInputData = SchemaType<typeof TankInput>;

/** Girdinin düz alanları; öngörü adımı şema örneğini değil, kaydedilmiş düz değeri okur. */
export type TankInputFields = Pick<
  TankInputData,
  'moveX' | 'moveY' | 'aimX' | 'aimY' | 'fire' | 'boost' | 'brake'
>;

/** Takımsız oyuncunun `team` değeri. */
export const NO_TEAM = -1;

/**
 * Bir oyuncunun herkese açık durumu. Tankın dinamik alanları `TankState` ile birebir aynıdır
 * (`tests/network/schema.test.ts` bunu doğrular) ve `float64`tür: uzlaştırma sunucunun değerini
 * bit bit alıp bekleyen girdileri üstüne oynatır, kesme hatası her onayda sapma olurdu.
 */
export const PlayerState = schema(
  {
    vehicleId: t.uint16().default(0),
    name: t.string().default(''),
    team: t.int8().default(NO_TEAM),
    connected: flag(),
    kills: t.uint16().default(0),
    deaths: t.uint16().default(0),

    health: f32(),
    alive: flag(),
    respawnMs: f32(),
    protectionMs: f32(),
    gunMs: f64(),

    x: f64(),
    y: f64(),
    vx: f64(),
    vy: f64(),
    hull: f64(),
    angularVelocity: f64(),
    turret: f64(),
    trackLeft: f64(),
    trackRight: f64(),
    treadLeft: f64(),
    treadRight: f64(),
    groundLeft: f64(),
    groundRight: f64(),
    surfaceLeft: f64(),
    surfaceRight: f64(),
    slideLeft: f64(),
    slideRight: f64(),
    slip: f64(),
    boost: f64(),
    boosting: flag(),
    reversing: flag(),
    pitch: f64(),
    pitchVelocity: f64(),
    roll: f64(),
    rollVelocity: f64(),
  },
  'TankPlayer',
);

export type PlayerSnapshot = SchemaType<typeof PlayerState>;

export const MATCH_PHASES = ['live', 'intermission'] as const;
export type MatchPhase = (typeof MATCH_PHASES)[number];

export const MATCH_MODES = ['ffa', 'teams'] as const;
export type MatchMode = (typeof MATCH_MODES)[number];

export function isMatchMode(value: unknown): value is MatchMode {
  return (MATCH_MODES as readonly unknown[]).includes(value);
}

export const MatchState = schema(
  {
    phase: t.string().default('live'),
    mode: t.string().default('ffa'),
    /** Özel oda kodu; herkese açık odada boş. */
    code: t.string().default(''),
    tick: t.uint32().default(0),
    /** Sunucunun sabit adım saati (ms); olaylar bu saatle damgalanır. */
    timeMs: f64(),
    scoreLimit: t.uint16().default(0),
    /** Ara vermenin kalan süresi; canlıyken 0. */
    intermissionMs: f32(),
    /** Biten maçın kazananı: takımsızda `p:<araç>`, takımlıda `t:<takım>`; yoksa boş. */
    winner: t.string().default(''),
    players: t.map(PlayerState),
  },
  'TankMatch',
);

export type MatchSnapshot = SchemaType<typeof MatchState>;

/**
 * Colyseus'un girdi kesicisine verilen aralıklar (NaN-güvenli: NaN alt sınıra iner). Kesme
 * idempotenttir; dürüst istemcinin değerini değiştirmez, bu yüzden öngörü ile sunucu aynı sayıyı görür.
 */
export const INPUT_RANGES = {
  moveX: [-1, 1],
  moveY: [-1, 1],
  aimX: [-1, 1],
  aimY: [-1, 1],
} as const;

function limitLength(x: number, y: number): [number, number] {
  const length = Math.hypot(x, y);
  return length > 1 ? [x / length, y / length] : [x, y];
}

/**
 * Tel girdisinden simülasyon komutuna. Sunucu ve istemci öngörüsü AYNI işlevi tam bir kez çağırır
 * (normalleştirme idempotent değildir): hareket uzunluğu en çok 1, nişan ya yok (0) ya birim
 * vektördür — komut sözleşmesi budur ve dürüst olmayan girdi yarım uzunlukla taret hızını
 * yavaşlatamaz.
 */
export function toCommand(input: TankInputFields): TankCommand {
  const [moveX, moveY] = limitLength(input.moveX, input.moveY);
  const length = Math.hypot(input.aimX, input.aimY);
  return {
    moveX,
    moveY,
    aimX: length > 1e-6 ? input.aimX / length : 0,
    aimY: length > 1e-6 ? input.aimY / length : 0,
    fire: input.fire,
    boost: input.boost,
    brake: input.brake,
  };
}
