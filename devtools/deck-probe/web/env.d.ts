// Tarayıcı/Tauri genelleri — probe.js'in checkJs tip denetimi için.
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
