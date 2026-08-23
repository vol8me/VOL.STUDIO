import type voluiTr from './i18n/tr.json';

declare module 'i18next' {
  interface ResourceNamespaceMap {
    volui: typeof voluiTr;
  }
}
