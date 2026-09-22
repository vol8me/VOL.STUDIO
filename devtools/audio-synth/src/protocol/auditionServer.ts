import { createReadStream, existsSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { AudioParamError } from '../guard/errors';
import { checkObject } from '../guard/read';
import { CANDIDATE_ID } from '../search/plan';
import type { SearchCandidateV1 } from '../search/report';
import { validateDecision } from '../search/selection';
import { AUDITION_CSS, AUDITION_JS, auditionHtml } from './auditionPage';
import { canonicalJson, type Sha256 } from './canonical';
import { ProtocolError } from './errors';
import { resolveInside, writeFileAtomic } from './fs';
import {
  auditionPath,
  loadSearch,
  recordDecision,
  SEARCH_AUDITION_ROOT,
  searchStatus,
  type SearchLocation,
  type SearchStatusV1,
} from './search';

/**
 * Yerel dinleme sunucusu. Güvenlik sınırı dar ve bilinçlidir:
 *
 * - Yalnız loopback adresine bağlanır (varsayılan 127.0.0.1).
 * - `Host` başlığı sunucunun kendi loopback adı:portu olmalı (DNS rebinding).
 * - Yazma tek uçtan (`POST /api/decision`) ve yalnız JSON ile yapılır;
 *   `Origin` varsa sunucunun kendisi olmalı (başka sitenin formu yazamaz).
 * - Ses yalnız raporda render edilmiş aday kimliğiyle, sabit export
 *   kökünden okunur; istekteki hiçbir parça dosya yoluna dönüşmez.
 * - Yazılan tek dosya aramanın kanonik `selection.json`ıdır (protokol yolu).
 *
 * Kimlik doğrulama YOKTUR: makinedeki yerel kullanıcıya güvenilir.
 */
export const LOOPBACK_HOSTS = ['127.0.0.1', '::1'] as const;
const MAX_BODY = 16 * 1024;
const AUDIO_ROUTE = /^\/audio\/(c-[0-9a-f]{16})\.wav$/;

export interface AuditionCandidateView {
  readonly ordinal: number;
  readonly candidateId: string | null;
  readonly state: SearchCandidateV1['state'];
  readonly values: SearchCandidateV1['values'];
  readonly descriptors: SearchCandidateV1['descriptors'];
  readonly checks: SearchCandidateV1['checks'];
  readonly risks: readonly string[];
  readonly reason: string | null;
  readonly decision: SearchStatusV1['candidates'][number]['decision'];
  readonly by: SearchStatusV1['candidates'][number]['by'];
  readonly labels: readonly string[];
  readonly note: string | null;
  readonly audio: boolean;
}

export interface AuditionStateV1 {
  readonly schema: 'SearchAuditionStateV1';
  readonly searchId: string;
  readonly reportHash: Sha256;
  readonly selection: SearchStatusV1['selection'];
  readonly summary: SearchStatusV1['summary'];
  readonly candidates: readonly AuditionCandidateView[];
}

/** Sayfanın okuduğu birleşik görünüm (rapor + kararlar + ses dosyası var mı). */
export function auditionState(loc: SearchLocation): AuditionStateV1 {
  const { report } = loadSearch(loc);
  const status = searchStatus(loc);
  return {
    schema: 'SearchAuditionStateV1',
    searchId: report.searchId,
    reportHash: status.reportHash,
    selection: status.selection,
    summary: status.summary,
    candidates: report.candidates.map((c, i) => {
      const s = status.candidates[i];
      const wav = c.candidateId
        ? resolveInside(loc.repoRoot, auditionPath(loc.searchId, c.candidateId), 'audio')
        : null;
      return {
        ordinal: c.ordinal,
        candidateId: c.candidateId,
        state: c.state,
        values: c.values,
        descriptors: c.descriptors,
        checks: c.checks,
        risks: c.risks,
        reason: c.rejection?.message ?? null,
        decision: s.decision,
        by: s.by,
        labels: s.labels,
        note: s.note,
        audio: c.render !== null && wav !== null && existsSync(wav),
      };
    }),
  };
}

/** Git-dışı statik kopya: index.html (durum gömülü, salt okunur) + app.js + app.css. */
export function exportAuditionPage(loc: SearchLocation): string {
  const root = `${SEARCH_AUDITION_ROOT}/${loc.searchId}`;
  const write = (name: string, text: string) =>
    writeFileAtomic(resolveInside(loc.repoRoot, `${root}/${name}`, name), text);
  write('app.css', AUDITION_CSS);
  write('app.js', AUDITION_JS);
  write('index.html', auditionHtml(loc.searchId, canonicalJson(auditionState(loc))));
  return `${root}/index.html`;
}

const SECURITY_HEADERS = {
  'content-security-policy':
    "default-src 'none'; script-src 'self'; style-src 'self'; media-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'cache-control': 'no-store',
};

function send(res: ServerResponse, status: number, type: string, body: string): void {
  res.writeHead(status, { ...SECURITY_HEADERS, 'content-type': type });
  res.end(body);
}

const json = (res: ServerResponse, status: number, value: unknown) =>
  send(res, status, 'application/json; charset=utf-8', JSON.stringify(value));

/** Sınırı aşan gövde saklanmadan boşaltılır ve adlı hatayla reddedilir (soket kesilmez). */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size <= MAX_BODY) chunks.push(chunk);
    });
    req.on('end', () =>
      size > MAX_BODY
        ? reject(new ProtocolError('invalid', `gövde ${MAX_BODY} baytı aşıyor`))
        : resolve(Buffer.concat(chunks).toString('utf8')),
    );
    req.on('error', reject);
  });
}

export interface AuditionServer {
  readonly url: string;
  readonly close: () => Promise<void>;
}

export interface AuditionServerOptions {
  readonly host?: (typeof LOOPBACK_HOSTS)[number];
  /** 0: işletim sistemi boş port seçer. */
  readonly port?: number;
}

export function startAuditionServer(
  loc: SearchLocation,
  options: AuditionServerOptions = {},
): Promise<AuditionServer> {
  const host = options.host ?? '127.0.0.1';
  if (!(LOOPBACK_HOSTS as readonly string[]).includes(host)) {
    throw new ProtocolError(
      'invalid',
      `dinleme sunucusu yalnız loopback adresine bağlanır (${LOOPBACK_HOSTS.join(', ')})`,
      host,
    );
  }
  loadSearch(loc);
  let port = 0;
  const allowedHosts = () => [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`];
  const server = createServer((req, res) => {
    handle(req, res).catch((error: unknown) => {
      if (
        error instanceof ProtocolError ||
        error instanceof AudioParamError ||
        error instanceof SyntaxError
      ) {
        json(res, 400, { error: error.message });
      } else {
        json(res, 500, { error: 'iç hata' });
      }
    });
  });
  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!allowedHosts().includes(req.headers.host ?? ''))
      return json(res, 421, { error: 'host reddedildi' });
    const path = new URL(req.url ?? '/', 'http://audition.invalid').pathname;
    if (req.method === 'POST' && path === '/api/decision') {
      const origin = req.headers.origin;
      if (origin !== undefined && !allowedHosts().some((h) => origin === `http://${h}`)) {
        return json(res, 403, { error: 'origin reddedildi' });
      }
      if (!(req.headers['content-type'] ?? '').startsWith('application/json'))
        return json(res, 415, { error: 'application/json gerekir' });
      const body = checkObject(JSON.parse(await readBody(req)), 'body', [
        'candidateId',
        'state',
        'labels',
        'note',
      ]);
      if (typeof body.candidateId !== 'string' || !CANDIDATE_ID.test(body.candidateId)) {
        return json(res, 400, { error: 'geçersiz aday kimliği' });
      }
      const decision = validateDecision(
        { state: body.state, by: 'human', labels: body.labels, note: body.note },
        'decision',
      );
      recordDecision(loc, body.candidateId, decision);
      return json(res, 200, auditionState(loc));
    }
    if (req.method !== 'GET' && req.method !== 'HEAD')
      return json(res, 405, { error: 'yöntem desteklenmiyor' });
    if (path === '/')
      return send(res, 200, 'text/html; charset=utf-8', auditionHtml(loc.searchId, null));
    if (path === '/app.js') return send(res, 200, 'text/javascript; charset=utf-8', AUDITION_JS);
    if (path === '/app.css') return send(res, 200, 'text/css; charset=utf-8', AUDITION_CSS);
    if (path === '/api/state') return json(res, 200, auditionState(loc));
    const audio = AUDIO_ROUTE.exec(path);
    if (audio) {
      const id = audio[1];
      const { report } = loadSearch(loc);
      if (!report.candidates.some((c) => c.candidateId === id && c.render !== null))
        return json(res, 404, { error: 'aday yok' });
      const file = resolveInside(loc.repoRoot, auditionPath(loc.searchId, id), 'audio');
      if (!existsSync(file))
        return json(res, 404, { error: 'dinleme kopyası yok (search audition)' });
      res.writeHead(200, { ...SECURITY_HEADERS, 'content-type': 'audio/wav' });
      createReadStream(file).pipe(res);
      return;
    }
    return json(res, 404, { error: 'bulunamadı' });
  }
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 0, host, () => {
      port = (server.address() as AddressInfo).port;
      const shown = host === '::1' ? `[::1]` : host;
      resolve({
        url: `http://${shown}:${port}/`,
        close: () =>
          new Promise<void>((done) => {
            server.closeAllConnections();
            server.close(() => done());
          }),
      });
    });
  });
}
