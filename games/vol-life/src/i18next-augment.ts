import type lifeTr from './i18n/tr.json';

declare module 'i18next' {
  interface CustomTypeOptions {
    strictKeyChecks: true;
  }

  interface ResourceNamespaceMap {
    life: typeof lifeTr;
  }
}
