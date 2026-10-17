import type volTestTr from './tr.json';

declare module 'i18next' {
  interface ResourceNamespaceMap {
    voltest: typeof volTestTr;
  }
}
