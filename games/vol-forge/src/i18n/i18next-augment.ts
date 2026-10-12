import type resources from './tr.json';
declare module 'i18next' {
  interface ResourceNamespaceMap {
    volforge: typeof resources;
  }
}
