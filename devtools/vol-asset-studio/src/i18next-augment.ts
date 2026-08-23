import type assetStudioTr from './i18n/tr.json';

declare module 'i18next' {
  interface ResourceNamespaceMap {
    assetstudio: typeof assetStudioTr;
  }
}
