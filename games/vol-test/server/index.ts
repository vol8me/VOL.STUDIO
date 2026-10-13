import { defineRoom } from '@colyseus/core';
import {
  installShutdown,
  isEntryModule,
  listenSettings,
  Logger,
  startHost,
  stdoutSink,
} from '@volstudio/network/server';
import { ROOM } from '../src/network/rooms';
import { MatchRoom, PrivateRoom } from './MatchRoom';

/**
 * Oda kaydı. Herkese açık odalar moda göre, özel odalar koda göre eşleşir; `filterBy`
 * seçenekleri oda ilk kurulurken bellekteki listeye yazar.
 */
export function createRooms(logger?: Logger) {
  const claims = new Set<string>();
  return {
    [ROOM.match]: defineRoom(MatchRoom, { logger }).filterBy(['mode']),
    [ROOM.private]: defineRoom(PrivateRoom, { logger, claims }).filterBy(['code']),
  };
}

export type Rooms = ReturnType<typeof createRooms>;

/** Geliştirmede loopback; uzak testte listen adresi açıkça verilir. */
export function startWorldServer(port = 2567, host = '127.0.0.1', logger?: Logger) {
  return startHost(createRooms(logger), { port, host }, { logger });
}

if (isEntryModule(import.meta.url, process.argv[1])) {
  const logger = Logger.create({ src: 'voltest', sinks: [stdoutSink()] });
  const { port, host } = listenSettings(process.env);
  const started = await startWorldServer(port, host, logger);
  installShutdown(started.stop, { logger });
}
