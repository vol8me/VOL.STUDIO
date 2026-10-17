// Tarayıcı/Tauri genelleri: editör tamamlaması içindir. probe.js tip denetimine
// girmez (`checkJs: false`); referans uygulamasında TypeScript'e taşınır.
declare const Phaser: any;

interface Window {
  __TAURI__: {
    core: { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<any> };
    event: {
      listen: (
        name: string,
        handler: (event: { payload: unknown }) => void | Promise<void>,
      ) => Promise<() => void>;
    };
  };
}
