import { Client, type Room } from '@colyseus/sdk';
import {
  JOIN_REJECTIONS,
  PROTOCOL_VERSION,
  REJECT_CODE,
  type JoinOptions,
  type JoinRejection,
} from '../protocol';

/**
 * Katılımın başarısızlık nedeni. `not-found` eşleşen oda yok demektir: kodu yanlış ya da dolu
 * oda Colyseus eşleştiricisinde aynı görünür (dolu oda kilitlenir ve aramadan düşer). `busy`
 * sunucunun bağlantı kapısı geçici olarak reddetti (HTTP 429 hız sınırı, 503 doluluk): biraz sonra denenir.
 */
export type JoinFailure = JoinRejection | 'not-found' | 'unreachable' | 'busy' | 'failed';

/** Katılım hatası; kullanıcıya gösterilecek metin çağıranın i18n anahtarıdır, `reason`dan türer. */
export class JoinError extends Error {
  constructor(
    readonly reason: JoinFailure,
    options?: { cause?: unknown },
  ) {
    super(`Katılım başarısız: ${reason}`, options);
    this.name = 'JoinError';
  }
}

const NOT_FOUND_CODES: ReadonlySet<number> = new Set([521, 522]);
const BUSY_CODES: ReadonlySet<number> = new Set([429, 503]);

interface CodedError {
  readonly code: number;
  readonly message: string;
}

/**
 * Eşleştirme hatası yapı olarak tanınır: SDK `MatchMakeError`, çekirdek `ServerError` fırlatır ve
 * iki sınıf ayrı olduğu için `instanceof` uçları birbirine bağlayamaz.
 */
function isCodedError(error: unknown): error is CodedError {
  return (
    error instanceof Error &&
    (error.name === 'MatchMakeError' || error.name === 'ServerError') &&
    typeof (error as { code?: unknown }).code === 'number'
  );
}

/** Colyseus ve ağ hatasını oyunun gösterebileceği küçük bir kümeye indirger. */
export function classifyJoinError(error: unknown): JoinFailure {
  if (error instanceof JoinError) return error.reason;
  if (isCodedError(error)) {
    if (error.code === REJECT_CODE) {
      return (JOIN_REJECTIONS as readonly string[]).includes(error.message)
        ? (error.message as JoinRejection)
        : 'failed';
    }
    if (BUSY_CODES.has(error.code)) return 'busy';
    return NOT_FOUND_CODES.has(error.code) ? 'not-found' : 'failed';
  }
  // Bağlantı kurulamayınca fetch/WebSocket TypeError ya da `CloseEvent` benzeri bir hata atar.
  return error instanceof Error || (typeof error === 'object' && error !== null)
    ? 'unreachable'
    : 'failed';
}

export type RoomOptions = Omit<JoinOptions, 'protocol'> & Readonly<Record<string, unknown>>;

/** Phaser'dan bağımsız eşleştirme girişi; protokol sürümü her isteğe kendiliğinden eklenir. */
export interface Lobby {
  /** Uygun oda varsa katılır, yoksa kurar. */
  joinOrCreate<S>(roomName: string, options?: RoomOptions, schema?: new () => S): Promise<Room<S>>;
  /** Her zaman yeni oda kurar. */
  create<S>(roomName: string, options?: RoomOptions, schema?: new () => S): Promise<Room<S>>;
  /** Yalnız var olan odaya katılır; eşleşen yoksa `JoinError('not-found')`. */
  join<S>(roomName: string, options?: RoomOptions, schema?: new () => S): Promise<Room<S>>;
}

/** Hataları `JoinError`a çeviren sarmal; `client` verilirse testte sahte bir istemci kullanılır. */
export function createLobby(endpoint: string, client: Client = new Client(endpoint)): Lobby {
  async function run<S>(
    method: 'joinOrCreate' | 'create' | 'join',
    roomName: string,
    options: RoomOptions | undefined,
    schema: (new () => S) | undefined,
  ): Promise<Room<S>> {
    try {
      return (await client[method](
        roomName,
        { ...options, protocol: PROTOCOL_VERSION },
        schema as never,
      )) as Room<S>;
    } catch (error) {
      throw new JoinError(classifyJoinError(error), { cause: error });
    }
  }
  return {
    joinOrCreate: (roomName, options, schema) => run('joinOrCreate', roomName, options, schema),
    create: (roomName, options, schema) => run('create', roomName, options, schema),
    join: (roomName, options, schema) => run('join', roomName, options, schema),
  };
}
