import assert from 'node:assert/strict';
import { it } from 'node:test';
import { connectWebView } from '../webviewClient.mjs';

function harness({ open = true, pages, fetchError, sendError } = {}) {
  const commands = [];
  const sockets = [];
  class Socket extends EventTarget {
    constructor() {
      super();
      sockets.push(this);
      if (open) queueMicrotask(() => this.dispatchEvent(new Event('open')));
    }
    sent = [];
    closed = false;
    send(message) {
      if (sendError) throw new Error('gönderim başarısız');
      this.sent.push(JSON.parse(message));
    }
    close() {
      this.closed = true;
    }
    reply(message) {
      this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(message) }));
    }
  }
  return {
    commands,
    sockets,
    connect: () =>
      connectWebView(
        (args) => {
          commands.push(args);
          return '12345';
        },
        '123',
        {
          timeoutMs: 20,
          Socket,
          fetchPage: async () => {
            if (fetchError) throw new Error('sayfa okunamadı');
            return {
              ok: true,
              json: async () =>
                pages ?? [{ type: 'page', webSocketDebuggerUrl: 'ws://127.0.0.1:12345' }],
            };
          },
        },
      ),
  };
}

it('CDP eşzamanlı yanıtları kimliğe göre ayırır; bildirimler isteği tüketmez', async () => {
  const fixture = harness();
  const page = await fixture.connect();
  const first = page.evaluate('1');
  const second = page.evaluate('2');
  const socket = fixture.sockets[0];
  socket.reply({ method: 'Runtime.consoleAPICalled' });
  socket.reply({ id: 2, result: { result: { value: 2 } } });
  socket.reply({ id: 1, result: { result: { value: 1 } } });
  assert.deepEqual(await Promise.all([first, second]), [1, 2]);
  page.close();
  page.close();
  assert.equal(fixture.commands.filter((args) => args[1] === '--remove').length, 1);
});

it('yanıtsız CDP ifadesi süre sınırında reddedilir; sonraki istek çalışır', async () => {
  const fixture = harness();
  const page = await fixture.connect();
  await assert.rejects(page.evaluate('new Promise(() => {})'), /zaman aşımına/);
  const next = page.evaluate('true');
  fixture.sockets[0].reply({ id: 2, result: { result: { value: true } } });
  assert.equal(await next, true);
  page.close();
});

it('cihaz bağlantısı kapanınca bütün bekleyen işler reddedilir ve port bırakılır', async () => {
  const fixture = harness();
  const page = await fixture.connect();
  const checks = [
    assert.rejects(page.evaluate('1'), /kapandı/),
    assert.rejects(page.evaluate('2'), /kapandı/),
  ];
  fixture.sockets[0].dispatchEvent(new Event('close'));
  await Promise.all(checks);
  await assert.rejects(page.evaluate('3'), /kapalı/);
  assert.deepEqual(fixture.commands.at(-1), ['forward', '--remove', 'tcp:12345']);
});

it('WebView sayfa keşfi düşerse ya da sayfa bulunamazsa port bırakılır', async () => {
  for (const option of [{ fetchError: true }, { pages: [] }]) {
    const fixture = harness(option);
    await assert.rejects(fixture.connect());
    assert.deepEqual(fixture.commands.at(-1), ['forward', '--remove', 'tcp:12345']);
  }
});

it('açılmayan CDP soketi süre sınırında kapatılır ve port bırakılır', async () => {
  const fixture = harness({ open: false });
  await assert.rejects(fixture.connect(), /zaman aşımına/);
  assert.equal(fixture.sockets[0].closed, true);
  assert.deepEqual(fixture.commands.at(-1), ['forward', '--remove', 'tcp:12345']);
});

it('soket hatası ve bozuk protokol yanıtı bekleyen işi sonlandırır', async () => {
  for (const event of [new Event('error'), new MessageEvent('message', { data: '{' })]) {
    const fixture = harness();
    const page = await fixture.connect();
    const rejected = assert.rejects(page.evaluate('1'));
    fixture.sockets[0].dispatchEvent(event);
    await rejected;
    assert.equal(fixture.sockets[0].closed, true);
  }
});

it('CDP istisnası ve gönderim hatası çağrıyı reddeder', async () => {
  const fixture = harness();
  const page = await fixture.connect();
  const rejected = assert.rejects(page.evaluate('throw new Error()'), /değerlendirilemedi/);
  fixture.sockets[0].reply({ id: 1, result: { exceptionDetails: { text: 'error' } } });
  await rejected;
  page.close();
  const broken = await harness({ sendError: true }).connect();
  await assert.rejects(broken.evaluate('1'), /gönderim başarısız/);
  broken.close();
});
