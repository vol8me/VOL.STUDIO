import type volforgeTr from './i18n/tr.json';

declare module 'i18next' {
  interface ResourceNamespaceMap {
    volforge: typeof volforgeTr;
  }
}
