import { cpSync, existsSync, createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

/** Ortak statik dosyaları oyunun public diziniyle birlikte sunar ve paketler. */
export function sharedPublic(directory) {
  let output;
  return {
    name: 'vol-shared-public',
    configResolved(config) {
      output = resolve(config.root, config.build.outDir);
    },
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (request.method !== 'GET' && request.method !== 'HEAD') return next();
        let path;
        try {
          path = resolve(directory, `.${decodeURIComponent((request.url ?? '/').split('?')[0])}`);
        } catch {
          return next();
        }
        if (!path.startsWith(directory + sep)) return next();
        try {
          if (!(await stat(path)).isFile()) return next();
          if (path.endsWith('.woff2')) response.setHeader('Content-Type', 'font/woff2');
          if (path.endsWith('.svg')) response.setHeader('Content-Type', 'image/svg+xml');
          if (request.method === 'HEAD') return response.end();
          createReadStream(path).on('error', next).pipe(response);
        } catch {
          next();
        }
      });
    },
    writeBundle() {
      if (existsSync(directory)) cpSync(directory, output, { recursive: true });
    },
  };
}
