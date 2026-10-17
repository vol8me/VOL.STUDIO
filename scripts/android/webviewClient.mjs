/** Cihaz kaybolduğunda bekleyen CDP işleri sonlanır ve adb yönlendirmesi bırakılır. */
export async function connectWebView(
  adb,
  pid,
  { timeoutMs = 30_000, fetchPage = fetch, Socket = globalThis.WebSocket } = {},
) {
  const port = adb(['forward', 'tcp:0', `localabstract:webview_devtools_remote_${pid}`]).trim();
  let socket;
  let closed = false;
  let nextId = 0;
  const pending = new Map();
  const close = (error = new Error('WebView kanalı kapandı.')) => {
    if (closed) return;
    closed = true;
    for (const request of pending.values()) request.reject(error);
    pending.clear();
    try {
      socket?.close();
    } catch {
      // Açılmadan düşen bir soketin kapanması yönlendirme temizliğini engellemez.
    }
    try {
      adb(['forward', '--remove', `tcp:${port}`]);
    } catch {
      // Cihaz ayrıldıysa yönlendirme adb tarafından zaten kaldırılmış olabilir.
    }
  };
  try {
    const response = await fetchPage(`http://127.0.0.1:${port}/json`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Error('WebView sayfa listesi okunamadı.');
    const pages = await response.json();
    if (!Array.isArray(pages)) throw new Error('WebView sayfa listesi geçersiz.');
    const page = pages.find(
      (entry) => entry?.type === 'page' && typeof entry.webSocketDebuggerUrl === 'string',
    );
    if (!page) throw new Error('WebView sayfası bulunamadı.');
    socket = new Socket(page.webSocketDebuggerUrl);
    socket.addEventListener('message', (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
        if (message === null || typeof message !== 'object') throw new Error('Geçersiz ileti.');
      } catch {
        close(new Error('WebView kanalı geçersiz yanıt verdi.'));
        return;
      }
      const request = pending.get(message.id);
      if (!request) return;
      if (message.error || message.result?.exceptionDetails) {
        request.reject(new Error('WebView ifadesi değerlendirilemedi.'));
      } else request.resolve(message.result?.result?.value);
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('WebView bağlantısı zaman aşımına uğradı.')),
        timeoutMs,
      );
      const finish = (error) => {
        clearTimeout(timer);
        if (error) reject(error);
        else resolve(undefined);
      };
      socket.addEventListener('open', () => finish(), { once: true });
      socket.addEventListener('error', () => {
        const error = new Error('WebView kanalı açılamadı.');
        finish(error);
        close(error);
      });
      socket.addEventListener('close', () => {
        const error = new Error('WebView kanalı kapandı.');
        finish(error);
        close(error);
      });
    });
    return {
      evaluate(expression) {
        if (closed) return Promise.reject(new Error('WebView kanalı kapalı.'));
        const id = ++nextId;
        return new Promise((resolve, reject) => {
          const finish = (callback, value) => {
            clearTimeout(timer);
            pending.delete(id);
            callback(value);
          };
          const timer = setTimeout(
            () => finish(reject, new Error('WebView ifadesi zaman aşımına uğradı.')),
            timeoutMs,
          );
          pending.set(id, {
            resolve: (value) => finish(resolve, value),
            reject: (error) => finish(reject, error),
          });
          try {
            socket.send(
              JSON.stringify({
                id,
                method: 'Runtime.evaluate',
                params: { expression, returnByValue: true, awaitPromise: true },
              }),
            );
          } catch (error) {
            finish(reject, error);
          }
        });
      },
      close,
    };
  } catch (error) {
    close();
    throw error;
  }
}
