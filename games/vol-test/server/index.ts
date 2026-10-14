import { defineRoom, matchMaker } from '@colyseus/core';
import {
  installShutdown,
  isEntryModule,
  listenSettings,
  Logger,
  startHost,
  stdoutSink,
} from '@volstudio/network/server';
import { ROOM } from '../src/network/rooms';
import { WorldRoom, type WorldRoomOptions } from './WorldRoom';

/**
 * Oda kaydı: tek tür oda, kalıcı savaş dünyası. `defaults` her odaya geçen işletim seçenekleridir
 * (tohum, cephe başına araç sayısı); istemci bunları belirleyemez.
 */
export function createRooms(
  logger?: Logger,
  defaults: Omit<WorldRoomOptions, 'logger' | 'primary'> = {},
) {
  return {
    [ROOM.world]: defineRoom(WorldRoom, { ...defaults, logger }),
  };
}

export type Rooms = ReturnType<typeof createRooms>;

/**
 * Birincil dünyayı kurar: insan kalmasa da kapanmaz, bot savaşı sürer. Oyuncular `joinOrCreate`
 * ile bu odaya düşer; dolarsa Colyseus bir taşma dünyası kurar.
 */
export async function createPrimaryWorld(options: Omit<WorldRoomOptions, 'primary'> = {}) {
  return matchMaker.createRoom(ROOM.world, { ...options, primary: true });
}

/** Geliştirmede loopback; uzak testte listen adresi açıkça verilir. */
export async function startWorldServer(port = 2567, host = '127.0.0.1', logger?: Logger) {
  const started = await startHost(createRooms(logger), { port, host }, { logger });
  await createPrimaryWorld({ seed: Date.now() >>> 0 });
  return started;
}

if (isEntryModule(import.meta.url, process.argv[1])) {
  const logger = Logger.create({ src: 'voltest', sinks: [stdoutSink()] });
  const { port, host } = listenSettings(process.env);
  const started = await startWorldServer(port, host, logger);
  installShutdown(started.stop, { logger });
}
