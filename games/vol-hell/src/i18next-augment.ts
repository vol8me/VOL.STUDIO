import type volhellTr from './i18n/tr.json';

declare module 'i18next' {
  interface CustomTypeOptions {
    strictKeyChecks: true;
  }

  interface ResourceNamespaceMap {
    volhell: typeof volhellTr;
  }
}
