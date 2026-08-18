import type { DiagnosticsSnapshot } from './types';

/**
 * Snapshot'ı bir yere GÖNDEREN katman.
 *
 * Diagnostics bir dönem hem ölçüm topluyor hem de `http://127.0.0.1:9876/debug`
 * adresine `fetch` atıyordu: CORE'un normal çalışma zamanı, geliştiricinin
 * makinesindeki bir hata ayıklama sunucusunun adresini biliyordu. Yakalama
 * (capture) ile taşıma (transport) ayrıldı — CORE artık "sunucu nerede?"
 * sorusunu sormaz, tüketici cevabı verir.
 */
export interface DiagnosticsTransport {
  /**
   * Snapshot'ı gönderir.
   *
   * Bir söz döndürürse Diagnostics onu UÇUŞTA sayar ve bitmeden yenisini
   * göndermez (bkz. `LocalServerTransport`).
   */
  send(snapshot: DiagnosticsSnapshot): void | Promise<void>;
}

/** Hiçbir yere göndermez. Overlay yeterliyse ya da testlerde varsayılan. */
export class NoopTransport implements DiagnosticsTransport {
  send(): void {}
}

/** Snapshot'ı konsola basar — sunucusuz, bağımlılıksız hızlı bakış. */
export class ConsoleTransport implements DiagnosticsTransport {
  constructor(private readonly label = 'diagnostics') {}

  send(snapshot: DiagnosticsSnapshot): void {
    console.info(`[${this.label}]`, snapshot);
  }
}

export interface LocalServerTransportOptions {
  /** Hedef adres, ör. `http://127.0.0.1:9876/debug`. */
  url: string;
  /**
   * Bir istek uçuştayken gelen snapshot'lar atlanır (varsayılan) — yoksa yavaş
   * bir endpoint karşısında istekler birikir. `false` verilirse her snapshot
   * kendi isteğini açar.
   */
  skipWhileInFlight?: boolean;
}

/**
 * Yerel hata ayıklama sunucusuna POST eder (bkz. `core/scripts/debug-server.mjs`).
 *
 * Ağ hatası YUTULUR: hata ayıklama aracı, ayıkladığı oyunu düşürmemelidir.
 */
export class LocalServerTransport implements DiagnosticsTransport {
  private readonly url: string;
  private readonly skipWhileInFlight: boolean;
  private inFlight = false;

  constructor(options: LocalServerTransportOptions) {
    this.url = options.url;
    this.skipWhileInFlight = options.skipWhileInFlight ?? true;
  }

  /** Şu an bekleyen bir istek var mı — test ve teşhis için. */
  isInFlight(): boolean {
    return this.inFlight;
  }

  async send(snapshot: DiagnosticsSnapshot): Promise<void> {
    // Endpoint yavaşlarsa istekler birikir: uzun oturumlarda onlarca bekleyen
    // fetch, ölçtüğü şeyi bozan bir yüke dönüşür.
    if (this.skipWhileInFlight && this.inFlight) return;

    this.inFlight = true;
    try {
      await fetch(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(snapshot),
      });
    } catch {
      // Bilinçli olarak yutulur — bkz. sınıf JSDoc'u.
    } finally {
      this.inFlight = false;
    }
  }
}
