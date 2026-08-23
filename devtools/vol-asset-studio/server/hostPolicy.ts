import { networkInterfaces } from 'node:os';
import { isLoopbackHost } from './lease.js';

// Bind adresi olarak "bütün arayüzler" anlamına gelen değerler.
const WILDCARD_BIND_HOSTS = new Set(['0.0.0.0', '::', '0:0:0:0:0:0:0:0']);
const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '::1'];

/** Host başlığını karşılaştırılabilir biçime indirger (köşeli IPv6 ayracı dahil). */
export function normalizeHostname(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '');
}

/** Makinenin dış (loopback olmayan) arayüz adresleri. */
function localInterfaceAddresses(): string[] {
  const addresses: string[] = [];
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (!entry.internal) addresses.push(entry.address);
    }
  }
  return addresses;
}

/**
 * İsteklerin taşıyabileceği Host adlarının kapalı listesini üretir.
 *
 * Liste DNS rebinding'e karşıdır: saldırganın alan adı LAN adresine çözülse
 * bile tarayıcı Host başlığında saldırganın adını (`evil.example`) gönderir ve
 * istek listede olmadığı için düşer. Çıplak IP adreslerinin listede olması bu
 * savunmayı zayıflatmaz; saldırgan kurbanın tarayıcısına Host başlığı olarak
 * bir IP literali yazdıramaz, oraya daima kullanıcının yazdığı ad gider.
 *
 * `0.0.0.0` gibi joker bind'ler tek bir adrese indirgenemez: sunucu hem
 * makinenin dış adreslerinden hem loopback'ten erişilebilir olduğu için ikisi
 * de listeye girer. Belirli bir adrese bind edildiğinde loopback adları
 * girmez — o adresten sunucuya zaten ulaşılamaz.
 */
export function resolveAllowedHosts(bindHost: string, extra: readonly string[] = []): Set<string> {
  const normalizedBind = normalizeHostname(bindHost);
  let base: string[];
  if (isLoopbackHost(normalizedBind)) {
    base = LOOPBACK_HOSTS;
  } else if (WILDCARD_BIND_HOSTS.has(normalizedBind)) {
    base = [...localInterfaceAddresses(), ...LOOPBACK_HOSTS];
  } else {
    base = [normalizedBind];
  }
  return new Set([...base, ...extra].map(normalizeHostname));
}
