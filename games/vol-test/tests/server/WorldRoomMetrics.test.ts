import { afterEach, expect, it } from 'vitest';
import { CLIENT_METRICS_MESSAGE } from '@volstudio/network/protocol';
import { clientTraffic } from '@volstudio/network/server';
import { worldMetrics } from '../../server/index';
import {
  joined,
  joinWorld,
  serverRoom,
  startServer,
  until,
  type TestServer,
} from '../support/netHarness';

let server: TestServer | undefined;
afterEach(async () => {
  await server?.stop();
  server = undefined;
});

it('istemci baytları gerçek sokettendir; uzlaştırma beyanı kimlik sızdırmadan görünür ve ayrılınca silinir', async () => {
  server = await startServer();
  const room = await joinWorld(server);
  await joined(room);
  const authority = serverRoom(room);
  const before = authority.clientMetrics()[0];
  expect(before.traffic.measured).toBe(true);
  expect(before.reconciliation).toBeNull();
  room.send(CLIENT_METRICS_MESSAGE, {
    sequence: 1,
    liveSteps: 10,
    replaySteps: 2,
    reconciliations: 4,
    corrections: 3,
    snaps: 1,
    correctionLast: 0,
    correctionMax: 200,
    secret: 'not-stored',
  });
  await until(
    () => authority.clientMetrics()[0]?.reconciliation?.sequence === 1,
    'uzlaştırma sayacı',
  );
  const peers = authority.clientMetrics();
  expect(peers[0].traffic).toEqual(clientTraffic(authority.clients[0]));
  expect(peers[0].traffic.receivedBytes).toBeGreaterThan(before.traffic.receivedBytes);
  expect(peers[0].traffic.sentBytes).toBeGreaterThan(0);
  expect(peers[0].reconciliation).toMatchObject({
    source: 'client-reported',
    liveSteps: 10,
    snaps: 1,
  });
  expect(JSON.stringify(peers)).not.toContain(room.sessionId);
  expect(JSON.stringify(peers)).not.toContain('not-stored');
  const metrics = await worldMetrics(server.guard);
  expect(metrics.rooms[0]?.clients[0]?.reconciliation).toMatchObject({ corrections: 3 });
  expect(metrics.rooms[0]?.traffic.measuredClients).toBe(1);
  await room.leave(true);
  await until(() => authority.clientMetrics().length === 0, 'istemci ölçümünün bırakılması');
});
