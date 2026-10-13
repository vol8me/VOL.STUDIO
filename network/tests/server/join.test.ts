import { Room, ServerError, defineRoom } from '@colyseus/core';
import { afterEach, describe, expect, it } from 'vitest';
import { JoinError, classifyJoinError, createLobby } from '../../src/client';
import { NAME_MAX_LENGTH, PROTOCOL_VERSION, REJECT_CODE } from '../../src/protocol';
import { authenticateJoin, rejectJoin, startHost, uniqueName } from '../../src/server';
import type { StartedHost } from '../../src/server';

class GuardedRoom extends Room {
  override maxClients = 1;
  override onAuth(_client: unknown, options: unknown): unknown {
    const { name, code } = authenticateJoin(options);
    if (code !== null && code !== 'ABCD2') throw rejectJoin('code');
    return { name };
  }
}

const rooms = { guarded: defineRoom(GuardedRoom) };
const started: StartedHost<typeof rooms>[] = [];

async function start(): Promise<StartedHost<typeof rooms>> {
  const host = await startHost(rooms, { port: 0, host: '127.0.0.1' });
  started.push(host);
  return host;
}

afterEach(async () => {
  await Promise.all(started.splice(0).map((host) => host.stop()));
});

describe('authenticateJoin', () => {
  it('geçerli seçenekten temiz ad ve kodu döndürür', () => {
    expect(authenticateJoin({ protocol: PROTOCOL_VERSION, name: ' Ada ', code: 'abcd2' })).toEqual({
      name: 'Ada',
      code: 'ABCD2',
    });
  });

  it('sürüm ve kod hatasını nedenle fırlatır', () => {
    expect(() => authenticateJoin({ protocol: 1 })).toThrow(ServerError);
    try {
      authenticateJoin({ protocol: 1 });
    } catch (error) {
      expect(error).toMatchObject({ code: REJECT_CODE, message: 'protocol' });
    }
    expect(() => authenticateJoin({ protocol: PROTOCOL_VERSION, code: 'x' })).toThrow('code');
  });
});

describe('uniqueName', () => {
  it('çakışma yoksa adı aynen verir', () => {
    expect(uniqueName('Ada', ['Bob', 'Cem'])).toBe('Ada');
  });

  it('çakışmada harf büyüklüğüne bakmadan sayı ekler', () => {
    expect(uniqueName('Ada', ['ada'])).toBe('Ada 2');
    expect(uniqueName('Ada', ['Ada', 'Ada 2', 'ADA 3'])).toBe('Ada 4');
  });

  it('ek ad sınırını aşmasın diye gövdeyi kısaltır', () => {
    const full = 'x'.repeat(NAME_MAX_LENGTH);
    const result = uniqueName(full, [full]);
    expect(Array.from(result)).toHaveLength(NAME_MAX_LENGTH);
    expect(result.endsWith(' 2')).toBe(true);
  });
});

describe('classifyJoinError', () => {
  it('sunucu reddini nedenine çevirir', () => {
    expect(classifyJoinError(rejectJoin('full'))).toBe('full');
    expect(classifyJoinError(rejectJoin('protocol'))).toBe('protocol');
    expect(classifyJoinError(new ServerError(REJECT_CODE, 'garip'))).toBe('failed');
  });

  it('eşleştirici kodlarını bulunamadıya, diğerlerini başarısızlığa çevirir', () => {
    expect(classifyJoinError(new ServerError(521, 'no rooms'))).toBe('not-found');
    expect(classifyJoinError(new ServerError(522, 'invalid id'))).toBe('not-found');
    expect(classifyJoinError(new ServerError(523, 'unhandled'))).toBe('failed');
  });

  it('SDK MatchMakeError adını da tanır; adı ya da kodu tutmayan hata sunucu hatası sayılmaz', () => {
    const matchMake = Object.assign(new Error('no rooms'), { name: 'MatchMakeError', code: 521 });
    expect(classifyJoinError(matchMake)).toBe('not-found');
    const stringCode = Object.assign(new Error('x'), { name: 'MatchMakeError', code: 'E' });
    expect(classifyJoinError(stringCode)).toBe('unreachable');
  });

  it('bağlantı hatasını ulaşılamadı, anlamsız değeri başarısızlık sayar', () => {
    expect(classifyJoinError(new TypeError('fetch failed'))).toBe('unreachable');
    expect(classifyJoinError(undefined)).toBe('failed');
    expect(classifyJoinError('x')).toBe('failed');
    expect(classifyJoinError(new JoinError('full'))).toBe('full');
  });
});

describe('createLobby gerçek sunucuda', () => {
  it('geçerli katılımda oda döner ve ad sunucuya ulaşır', async () => {
    const host = await start();
    const room = await createLobby(host.endpoint).joinOrCreate('guarded', { name: 'Ada' });
    expect(room.sessionId).toBeTruthy();
    await room.leave();
  });

  it('yanlış kodu `code` nedeniyle reddeder', async () => {
    const host = await start();
    const failure = await createLobby(host.endpoint)
      .create('guarded', { code: 'ZZZZZ' })
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(JoinError);
    expect((failure as JoinError).reason).toBe('code');
  });

  it('var olmayan odaya `join` bulunamadı verir', async () => {
    const host = await start();
    const failure = await createLobby(host.endpoint)
      .join('guarded')
      .catch((error: unknown) => error);
    expect((failure as JoinError).reason).toBe('not-found');
  });

  it('dolu oda kilitlenir; ikinci katılım bulunamadı sayılır', async () => {
    const host = await start();
    const lobby = createLobby(host.endpoint);
    const first = await lobby.create('guarded');
    const failure = await lobby.join('guarded').catch((error: unknown) => error);
    expect((failure as JoinError).reason).toBe('not-found');
    await first.leave();
  });

  it('dinlemeyen adrese ulaşılamadı verir', async () => {
    const host = await start();
    const endpoint = host.endpoint;
    await host.stop();
    started.length = 0;
    const failure = await createLobby(endpoint)
      .joinOrCreate('guarded')
      .catch((error: unknown) => error);
    expect((failure as JoinError).reason).toBe('unreachable');
  });
});
