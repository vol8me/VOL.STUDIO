import type arachnidTr from './i18n/tr.json';

declare module 'i18next' {
  interface CustomTypeOptions {
    strictKeyChecks: true;
  }

  interface ResourceNamespaceMap {
    arachnid: typeof arachnidTr;
  }
}
