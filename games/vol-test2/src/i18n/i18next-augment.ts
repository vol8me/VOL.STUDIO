import type resources from './tr.json';
declare module 'i18next' {
  interface ResourceNamespaceMap {
    voltest2: typeof resources;
  }
}
