import { relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');

/** Tarayıcı aracının gerçek modül grafiğini doğrular ve kanıtını build'e yazar. */
export function browserBoundary() {
  return {
    name: 'vol-browser-boundary',
    generateBundle() {
      const modules = [...this.getModuleIds()]
        .map((id) => {
          const normalized = id.replaceAll('\\', '/');
          const dependency = normalized.lastIndexOf('/node_modules/');
          return dependency < 0 ? relative(root, normalized) : normalized.slice(dependency + 1);
        })
        .sort();
      const forbidden = modules.filter((id) =>
        /(?:^|\/)node_modules\/phaser(?:\/|$)|(?:^|\/)node:|(?:__vite-browser-external|vite-browser-external)/.test(
          id,
        ),
      );
      if (forbidden.length)
        this.error(`Tarayıcı aracına motor/Node modülü girdi:\n${forbidden.join('\n')}`);
      this.emitFile({
        type: 'asset',
        fileName: 'browser-modules.json',
        source: JSON.stringify({ schemaVersion: 1, modules }, null, 2) + '\n',
      });
    },
  };
}
