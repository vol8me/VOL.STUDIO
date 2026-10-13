import { defineRoom } from '@colyseus/core';
import {
  installShutdown,
  isEntryModule,
  listenSettings,
  Logger,
  startHost,
  stdoutSink,
} from '@volstudio/network/server';
import { WorldRoom } from './WorldRoom';

export const rooms = { voltest: defineRoom(WorldRoom) };

/** Geliştirmede loopback; uzak testte listen adresi açıkça verilir. */
export function startWorldServer(port = 2567, host = '127.0.0.1', logger?: Logger) {
  return startHost(rooms, { port, host }, { logger });
}

if (isEntryModule(import.meta.url, process.argv[1])) {
  const logger = Logger.create({ src: 'voltest', sinks: [stdoutSink()] });
  const { port, host } = listenSettings(process.env);
  const started = await startWorldServer(port, host, logger);
  installShutdown(started.stop, { logger });
}
