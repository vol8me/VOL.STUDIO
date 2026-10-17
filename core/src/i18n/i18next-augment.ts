import type coreTr from './tr.json';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'core';
    strictKeyChecks: true;
    resources: {
      core: typeof coreTr;
    };
  }
}
